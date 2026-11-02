import { fail } from './errors.js';
import { buildLimitsTree, type LimitsTree, type TokenLimit } from './limits.js';
import { decodeScheme2MetaAddress } from './meta.js';
import { computePolicyHash, validatePolicy, type Policy } from './policy.js';
import { MAX_UINT256, ZERO_HASH, addr, bytes32, type Address, type Hex } from './types.js';

/** `format` field of a policy record. */
export const POLICY_RECORD_FORMAT = 'ghostpay-policy-record';
/** Current record version. */
export const POLICY_RECORD_VERSION = 1;
/** Largest accepted serialized record (bytes of UTF-16 text). */
export const MAX_POLICY_RECORD_LENGTH = 64 * 1024;
const MAX_LIMITS = 64;
const MAX_CANDIDATES = 100_000;
const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,77})$/;

/**
 * Everything a recipient needs, besides their stealth keys, to deploy a policy account and build
 * limit proofs: the meta-address and the full policy pre-image with its limits.
 */
export interface PolicyRecord {
  readonly metaAddress: string;
  readonly policyHash: Hex;
  readonly policy: Policy;
  /** Sorted by lowercase token address; empty when `limitsRoot` is zero. */
  readonly limits: readonly TokenLimit[];
  /** Rebuilt tree, or null for an account without limits. */
  readonly tree: LimitsTree | null;
}

/** Inputs of {@link buildPolicyRecord}. */
export interface PolicyRecordInput {
  readonly metaAddress: string;
  readonly policy: Policy;
  readonly limits: readonly TokenLimit[];
}

/** @internal Shared checks of build and parse. */
function assemble(metaAddress: string, policy: Policy, limits: readonly TokenLimit[], claimedHash?: Hex): PolicyRecord {
  const meta = decodeScheme2MetaAddress(metaAddress);
  const p = validatePolicy(policy);
  if (limits.length > MAX_LIMITS) return fail('INVALID_INPUT', 'too many limits');
  let tree: LimitsTree | null = null;
  if (p.limitsRoot === ZERO_HASH) {
    if (limits.length !== 0) return fail('INVALID_POLICY', 'limits given for a zero limitsRoot');
  } else {
    tree = buildLimitsTree(limits);
    if (tree.root !== p.limitsRoot) return fail('INVALID_POLICY', 'limits do not match limitsRoot');
  }
  const policyHash = computePolicyHash(p);
  if (claimedHash !== undefined && claimedHash !== policyHash) return fail('INVALID_POLICY', 'policyHash does not match policy');
  if (meta.policyHash !== policyHash) return fail('INVALID_POLICY', 'meta-address commits to another policy');
  const sorted = (tree?.leaves ?? [])
    .map((l) => Object.freeze({ token: l.token, limit: l.limit, windowSeconds: l.windowSeconds }))
    .sort((a, b) => (a.token.toLowerCase() < b.token.toLowerCase() ? -1 : 1));
  const canonicalMeta = `st:eth:gp2:${metaAddress.slice('st:eth:gp2:'.length).toLowerCase()}`;
  return Object.freeze({ metaAddress: canonicalMeta, policyHash, policy: Object.freeze(p), limits: Object.freeze(sorted), tree });
}

/**
 * Builds the backup record of a scheme-2 meta-address.
 *
 * @remarks Re-validates the policy like the factory, rebuilds the limits tree, and checks that the
 * meta-address commits to exactly this policy. Without this record (or the same policy re-entered)
 * the account cannot be deployed: the factory needs destination, delay and limits root, and the
 * owner needs the leaves to build limit proofs. Losing it is a fund-loss event unless the policy
 * can be re-found ({@link findPolicyFromCandidates}).
 *
 * @param input Meta-address, policy and limits (any order).
 * @returns Validated, canonical record.
 * @throws {PolicySchemeError} `INVALID_POLICY`, `INVALID_DELAY`, `INVALID_ADDRESS`, `INVALID_META_ADDRESS`, tree errors.
 * @security Public data with privacy weight: it links the destination (often a known wallet) to the
 * meta-address. Store it like the meta-address list, never send it to a server.
 * @testVector client-v1.records
 */
export function buildPolicyRecord(input: PolicyRecordInput): PolicyRecord {
  if (!Array.isArray(input.limits)) return fail('INVALID_INPUT', 'limits');
  return assemble(input.metaAddress, input.policy, input.limits);
}

/**
 * Canonical JSON of a record (fixed key order, decimal strings, limits sorted by token).
 *
 * @param rec Record from {@link buildPolicyRecord} or {@link parsePolicyRecord}.
 * @returns JSON text.
 * @security See {@link buildPolicyRecord}.
 * @testVector client-v1.records
 */
export function serializePolicyRecord(rec: PolicyRecord): string {
  return JSON.stringify({
    format: POLICY_RECORD_FORMAT,
    version: POLICY_RECORD_VERSION,
    schemeId: '0x47500002',
    metaAddress: rec.metaAddress,
    policyHash: rec.policyHash,
    policy: { destination: rec.policy.destination, delaySeconds: rec.policy.delaySeconds.toString(), limitsRoot: rec.policy.limitsRoot },
    limits: rec.limits.map((l) => ({ token: l.token, limit: l.limit.toString(), windowSeconds: l.windowSeconds.toString() })),
  });
}

/** @internal */
function obj(v: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('INVALID_INPUT', field);
  const o = v as Record<string, unknown>;
  const got = Object.keys(o);
  if (got.length !== keys.length || !keys.every((k) => Object.hasOwn(o, k))) return fail('INVALID_INPUT', field);
  return o;
}

/** @internal */
function dec(v: unknown, field: string): bigint {
  if (typeof v !== 'string' || !DECIMAL_RE.test(v)) return fail('INVALID_INPUT', field);
  const n = BigInt(v);
  if (n > MAX_UINT256) return fail('INVALID_INPUT', field);
  return n;
}

/**
 * Strictly parses and re-verifies a policy record.
 *
 * @remarks Exact key sets (unknown keys, such as a pasted private key, are refused), decimal
 * strings only, EIP-55 addresses, then the same checks as {@link buildPolicyRecord} plus the stored
 * `policyHash`. Input order of limits does not matter.
 *
 * @param input JSON text or an already parsed value.
 * @returns Canonical record.
 * @throws {PolicySchemeError} `INVALID_INPUT` (shape), `INVALID_POLICY` (hash, root or meta-address mismatch), `INVALID_DELAY`, others.
 * @security Untrusted input; error messages never echo it.
 * @testVector client-v1.records
 */
export function parsePolicyRecord(input: unknown): PolicyRecord {
  let raw = input;
  if (typeof input === 'string') {
    if (input.length > MAX_POLICY_RECORD_LENGTH) return fail('INVALID_INPUT', 'record too large');
    try {
      raw = JSON.parse(input) as unknown;
    } catch {
      return fail('INVALID_INPUT', 'not JSON');
    }
  }
  const o = obj(raw, ['format', 'version', 'schemeId', 'metaAddress', 'policyHash', 'policy', 'limits'], 'record');
  if (o['format'] !== POLICY_RECORD_FORMAT) return fail('INVALID_INPUT', 'format');
  if (o['version'] !== POLICY_RECORD_VERSION) return fail('INVALID_INPUT', 'version');
  if (o['schemeId'] !== '0x47500002') return fail('INVALID_INPUT', 'schemeId');
  if (typeof o['metaAddress'] !== 'string') return fail('INVALID_INPUT', 'metaAddress');
  const claimed = bytes32(o['policyHash'], 'policyHash');
  const p = obj(o['policy'], ['destination', 'delaySeconds', 'limitsRoot'], 'policy');
  const policy: Policy = {
    destination: addr(p['destination'], 'policy.destination'),
    delaySeconds: dec(p['delaySeconds'], 'policy.delaySeconds'),
    limitsRoot: bytes32(p['limitsRoot'], 'policy.limitsRoot'),
  };
  const list = o['limits'];
  if (!Array.isArray(list) || list.length > MAX_LIMITS) return fail('INVALID_INPUT', 'limits');
  const limits = list.map((l: unknown, i): TokenLimit => {
    const e = obj(l, ['token', 'limit', 'windowSeconds'], `limits[${String(i)}]`);
    return { token: addr(e['token'], `limits[${String(i)}].token`), limit: dec(e['limit'], 'limit'), windowSeconds: dec(e['windowSeconds'], 'windowSeconds') };
  });
  return assemble(o['metaAddress'], policy, limits, claimed);
}

/** Candidate values for {@link findPolicyFromCandidates}. */
export interface PolicyCandidates {
  readonly policyHash: Hex;
  readonly destinations: readonly Address[];
  readonly delaySeconds: readonly bigint[];
  readonly limitsRoots: readonly Hex[];
}

/**
 * Re-finds a lost policy pre-image by testing candidates against a published policy hash.
 *
 * @remarks The policy hash is an unblinded commitment, so a recipient who still knows the meta-address
 * (it is public) but lost the record can try their likely destinations, the app's delay presets and
 * known limits roots (zero, or roots of earlier records). At most 100 000 combinations.
 *
 * @param c Policy hash and candidate lists.
 * @returns The matching policy, or null.
 * @throws {PolicySchemeError} `INVALID_INPUT` (search space too large), `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Local computation over public data. The same search lets anyone who can guess the
 * destination confirm it (documented weakness of the unblinded hash, see `computePolicyHash`).
 * Limits leaves cannot be recovered this way: a non-zero root still needs the original limits.
 * @testVector client-v1.records
 */
export function findPolicyFromCandidates(c: PolicyCandidates): Policy | null {
  const target = bytes32(c.policyHash, 'policyHash');
  const n = c.destinations.length * c.delaySeconds.length * c.limitsRoots.length;
  if (n > MAX_CANDIDATES) return fail('INVALID_INPUT', 'too many candidates');
  for (const destination of c.destinations) {
    for (const delaySeconds of c.delaySeconds) {
      for (const limitsRoot of c.limitsRoots) {
        const p: Policy = { destination: addr(destination, 'destination'), delaySeconds, limitsRoot: bytes32(limitsRoot, 'limitsRoot') };
        if (computePolicyHash(p) === target) return p;
      }
    }
  }
  return null;
}
