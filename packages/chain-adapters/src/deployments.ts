import { getAddress, isAddress } from 'viem/utils';
import { fail } from './errors.js';
import { FEE_SCHEDULE } from './fees.js';
import { ZERO_ADDRESS, type Address, type Hex } from './types.js';

/** Validated deployment manifest (mirror of `deployments/schema.json`). */
export interface DeploymentManifest {
  readonly chainId: number;
  readonly announcer: Address;
  readonly router: Address;
  readonly sweepRelayer: Address;
  /** Fee recipient: displayed to the payer from here, never hard-coded in source. */
  readonly feeRecipient: Address;
  readonly feeBps: 25;
  readonly deployTx: { readonly router: Hex; readonly sweepRelayer: Hex };
  readonly solcVersion: string;
  readonly commit: string;
  readonly bytecodeHashes: { readonly router: Hex; readonly sweepRelayer: Hex };
  readonly date: string;
  readonly signature?: Hex;
  /** Optional policy-account (scheme 0x47500002) deployment; present only when every policy field is set. */
  readonly policy?: {
    readonly implementation: Address;
    readonly factory: Address;
    readonly feeToken: Address;
    /** Flat fee (F-SECURE) in fee-token base units. */
    readonly flatFee: bigint;
    readonly feeRecipient: Address;
    readonly deployTx: { readonly implementation: Hex; readonly factory: Hex };
    readonly bytecodeHashes: { readonly implementation: Hex; readonly factory: Hex };
  };
}

const TOP_KEYS = [
  'chainId', 'announcer', 'router', 'sweepRelayer', 'feeRecipient', 'feeBps', 'deployTx',
  'solcVersion', 'commit', 'bytecodeHashes', 'date', 'signature',
  'policyImplementation', 'policyFactory', 'policyFeeToken', 'policyFlatFee', 'policyFeeRecipient',
] as const;
const POLICY_KEYS = ['policyImplementation', 'policyFactory', 'policyFeeToken', 'policyFlatFee', 'policyFeeRecipient'] as const;
const REQUIRED = TOP_KEYS.filter((k) => k !== 'signature' && !(POLICY_KEYS as readonly string[]).includes(k));
const UINT_DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO_BYTES32 = /^0x0{64}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function bad(path: string): never {
  return fail('INVALID_MANIFEST', path);
}

function obj(v: unknown, path: string, allowed: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(path);
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== null && proto !== Object.prototype) return bad(path);
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!allowed.includes(k)) return bad(`${path}: unknown key`);
  for (const k of required) if (rec[k] === undefined) return bad(`${path}.${k}: missing`);
  return rec;
}

function addr(v: unknown, path: string): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: true })) return bad(path);
  if (v.toLowerCase() === ZERO_ADDRESS) return bad(`${path}: zero address`);
  return getAddress(v);
}

function b32(v: unknown, path: string): Hex {
  if (typeof v !== 'string' || !BYTES32.test(v) || ZERO_BYTES32.test(v)) return bad(path);
  return v.toLowerCase() as Hex;
}

function isRealDate(s: string): boolean {
  const m = RFC3339.exec(s);
  if (m === null || Number.isNaN(Date.parse(s))) return false;
  // Date.parse normalises impossible calendar days (2026-02-30 -> March); require the day to exist.
  const [y, mo, d] = [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const [hh, mi, ss] = [Number(s.slice(11, 13)), Number(s.slice(14, 16)), Number(s.slice(17, 19))];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= dim && hh <= 23 && mi <= 59 && ss <= 59;
}

/**
 * Throws when any JSON object in `text` repeats a key (after escape decoding). `JSON.parse` silently keeps
 * the last duplicate, which would let a manifest show one value to a reviewer and another to the parser.
 * Precondition: `text` is already valid JSON.
 */
function assertNoDuplicateKeys(text: string): void {
  const stack: (Set<string> | null)[] = [];
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const top = stack[stack.length - 1];
      if (expectKey && top !== undefined && top !== null) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (top.has(key)) bad('duplicate key');
        top.add(key);
        expectKey = false;
      }
      i = j;
    } else if (c === '{') {
      stack.push(new Set());
      expectKey = true;
    } else if (c === '[') {
      stack.push(null);
      expectKey = false;
    } else if (c === '}' || c === ']') {
      stack.pop();
      expectKey = false;
    } else if (c === ',') {
      expectKey = stack[stack.length - 1] instanceof Set;
    }
  }
}

/**
 * Strictly validates an untrusted manifest object against `deployments/schema.json`
 * plus extra safety rules.
 *
 * @remarks Rejects: unknown or missing keys, zero addresses, `feeBps != 25`, `chainId` not equal
 * to `expectedChainId`, all-zero hashes, malformed commit/solc/date/signature, and role collisions
 * (router, relayer and announcer must be distinct; fee recipient must not be the router).
 * Addresses are returned EIP-55 checksummed; a mixed-case address with a bad checksum is rejected.
 *
 * @param value Parsed JSON.
 * @param expectedChainId Chain the caller is about to use; the manifest must match it.
 * @returns A fresh validated manifest.
 * @throws {ChainAdapterError} `INVALID_MANIFEST` or `CHAIN_MISMATCH`.
 */
export function validateManifest(value: unknown, expectedChainId: number): DeploymentManifest {
  const r = obj(value, '$', TOP_KEYS, REQUIRED);
  const chainId = r['chainId'];
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId < 1) return bad('chainId');
  if (chainId !== expectedChainId) return fail('CHAIN_MISMATCH', 'manifest chainId differs from expected chain');
  const feeBps = r['feeBps'];
  if (feeBps !== Number(FEE_SCHEDULE.ROUTER_FEE_BPS)) return bad('feeBps: must equal 25');

  const announcer = addr(r['announcer'], 'announcer');
  const router = addr(r['router'], 'router');
  const sweepRelayer = addr(r['sweepRelayer'], 'sweepRelayer');
  const feeRecipient = addr(r['feeRecipient'], 'feeRecipient');
  if (new Set([announcer, router, sweepRelayer]).size !== 3) return bad('announcer/router/sweepRelayer must be distinct');
  if (feeRecipient === router || feeRecipient === sweepRelayer) return bad('feeRecipient collides with a contract');

  const hasPolicy = POLICY_KEYS.some((k) => r[k] !== undefined);
  if (hasPolicy && POLICY_KEYS.some((k) => r[k] === undefined)) return bad('policy fields must be all present or all absent');
  const txKeys = hasPolicy ? ['router', 'sweepRelayer', 'policyImplementation', 'policyFactory'] : ['router', 'sweepRelayer'];
  const dtx = obj(r['deployTx'], 'deployTx', txKeys, txKeys);
  const bch = obj(r['bytecodeHashes'], 'bytecodeHashes', txKeys, txKeys);

  const solc = r['solcVersion'];
  if (typeof solc !== 'string' || !/^0\.8\.\d+(\+commit\.[0-9a-f]{8})?$/.test(solc)) return bad('solcVersion');
  const commit = r['commit'];
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) return bad('commit');
  const date = r['date'];
  if (typeof date !== 'string' || !isRealDate(date)) return bad('date');
  const sig = r['signature'];
  if (sig !== undefined && (typeof sig !== 'string' || !/^0x[0-9a-fA-F]+$/.test(sig))) return bad('signature');

  const out: DeploymentManifest = {
    chainId,
    announcer,
    router,
    sweepRelayer,
    feeRecipient,
    feeBps: 25,
    deployTx: { router: b32(dtx['router'], 'deployTx.router'), sweepRelayer: b32(dtx['sweepRelayer'], 'deployTx.sweepRelayer') },
    solcVersion: solc,
    commit,
    bytecodeHashes: {
      router: b32(bch['router'], 'bytecodeHashes.router'),
      sweepRelayer: b32(bch['sweepRelayer'], 'bytecodeHashes.sweepRelayer'),
    },
    date,
    ...(sig === undefined ? {} : { signature: sig as Hex }),
    ...(hasPolicy ? { policy: parsePolicy(r, dtx, bch, [announcer, router, sweepRelayer]) } : {}),
  };
  return out;
}

function parsePolicy(
  r: Record<string, unknown>,
  dtx: Record<string, unknown>,
  bch: Record<string, unknown>,
  taken: readonly Address[],
): NonNullable<DeploymentManifest['policy']> {
  const implementation = addr(r['policyImplementation'], 'policyImplementation');
  const factory = addr(r['policyFactory'], 'policyFactory');
  const feeToken = addr(r['policyFeeToken'], 'policyFeeToken');
  const feeRecipient = addr(r['policyFeeRecipient'], 'policyFeeRecipient');
  if (new Set([...taken, implementation, factory]).size !== taken.length + 2) return bad('policy contracts must be distinct');
  if (feeRecipient === implementation || feeRecipient === factory) return bad('policyFeeRecipient collides with a contract');
  const fee = r['policyFlatFee'];
  if (typeof fee !== 'string' || !UINT_DECIMAL.test(fee)) return bad('policyFlatFee');
  const flatFee = BigInt(fee);
  if (flatFee >= 1n << 256n) return bad('policyFlatFee');
  return {
    implementation,
    factory,
    feeToken,
    flatFee,
    feeRecipient,
    deployTx: { implementation: b32(dtx['policyImplementation'], 'deployTx.policyImplementation'), factory: b32(dtx['policyFactory'], 'deployTx.policyFactory') },
    bytecodeHashes: { implementation: b32(bch['policyImplementation'], 'bytecodeHashes.policyImplementation'), factory: b32(bch['policyFactory'], 'bytecodeHashes.policyFactory') },
  };
}

/** Maximum accepted manifest text size in bytes. */
export const MAX_MANIFEST_BYTES = 16 * 1024;

/**
 * Parses manifest JSON text and validates it.
 *
 * @param text Raw JSON, at most {@link MAX_MANIFEST_BYTES} bytes.
 * @param expectedChainId Chain the manifest must describe.
 * @returns Validated manifest.
 * @throws {ChainAdapterError} `INVALID_MANIFEST` (oversize, bad JSON, duplicate keys, `__proto__` keys) or `CHAIN_MISMATCH`.
 */
export function loadDeployment(text: string, expectedChainId: number): DeploymentManifest {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES) return bad('size');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return bad('json');
  }
  assertNoDuplicateKeys(text);
  return validateManifest(parsed, expectedChainId);
}
