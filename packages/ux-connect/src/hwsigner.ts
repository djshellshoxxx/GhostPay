/**
 * Hardware signer request/response model: typed sign requests, the text a
 * user must compare on the device, timeouts and an error taxonomy.
 * No USB / BLE / transport code. Phase 2 (exporting stealth keys) is NOT here.
 *
 * UNVERIFIED: device status codes and message strings below are from memory of
 * common vendor behaviour and were never tested against a real device.
 */
import {
  err,
  formatUnits,
  isAddress,
  isHexData,
  isRecord,
  ok,
  validateSignature,
  type Result,
} from './hex.js';

/** Signer boundary: only signatures cross it (HWSIG-2). */
export interface Signer {
  readonly address: string;
  signTransaction(req: TxSignRequest): Promise<string>;
  signTypedData(req: TypedDataSignRequest): Promise<string>;
}

export interface TxSignRequest {
  readonly kind: 'transaction';
  readonly chainId: number;
  readonly to: string;
  readonly value: bigint;
  readonly data: string;
  readonly nonce: number;
  readonly gasLimit: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}

export interface TypedDataSignRequest {
  readonly kind: 'typedData';
  readonly chainId: number;
  /** EIP-712 JSON (string or parsed object). */
  readonly typedData: unknown;
}

export type SignRequest = TxSignRequest | TypedDataSignRequest;

const U64 = 0xffff_ffff_ffff_ffffn;
const U256 = (1n << 256n) - 1n;
const MAX_DATA_BYTES = 128 * 1024;
const MAX_TYPED_BYTES = 64 * 1024;

/** Validate a transaction request (shape and bounds only). */
export function validateTxRequest(r: TxSignRequest): Result<TxSignRequest> {
  if (!Number.isSafeInteger(r.chainId) || r.chainId <= 0) return err('bad chainId');
  if (!isAddress(r.to)) return err('bad to');
  if (!isHexData(r.data) || (r.data.length - 2) / 2 > MAX_DATA_BYTES) return err('bad data');
  if (r.value < 0n || r.value > U256) return err('bad value');
  if (!Number.isSafeInteger(r.nonce) || r.nonce < 0) return err('bad nonce');
  if (r.gasLimit <= 0n || r.gasLimit > U64) return err('bad gasLimit');
  if (r.maxFeePerGas < 0n || r.maxFeePerGas > U256) return err('bad maxFeePerGas');
  if (r.maxPriorityFeePerGas < 0n || r.maxPriorityFeePerGas > r.maxFeePerGas)
    return err('priority fee exceeds max fee');
  return ok(r);
}

interface ParsedTyped {
  readonly domain: Record<string, unknown>;
  readonly primaryType: string;
  readonly types: Record<string, unknown>;
  readonly message: Record<string, unknown>;
}

/** Parse + structurally validate EIP-712 JSON; domain.chainId must equal the request chainId. */
export function parseTypedData(r: TypedDataSignRequest): Result<ParsedTyped> {
  let v: unknown = r.typedData;
  if (typeof v === 'string') {
    if (v.length > MAX_TYPED_BYTES) return err('typed data too large');
    try {
      v = JSON.parse(v);
    } catch {
      return err('typed data is not JSON');
    }
  }
  if (!isRecord(v)) return err('typed data must be an object');
  const { domain, primaryType, types, message } = v;
  if (!isRecord(domain) || !isRecord(types) || !isRecord(message)) return err('missing domain/types/message');
  if (typeof primaryType !== 'string' || !(primaryType in types)) return err('primaryType not in types');
  if (!Array.isArray(types[primaryType])) return err('primaryType definition invalid');
  const dc = domain['chainId'];
  const n = typeof dc === 'string' ? (/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(dc) ? Number(BigInt(dc)) : NaN) : dc;
  if (n !== r.chainId) return err('chain-mismatch');
  return ok({ domain, primaryType, types, message });
}

export type DisplayWarning =
  | 'blind-signing'
  | 'unlimited-approval'
  | 'contract-creation'
  | 'unknown-contract-call'
  | 'nested-structure'
  | 'value-with-data';

export interface DisplayLine {
  readonly label: string;
  readonly value: string;
}

/** What GhostPay shows, and what the user must match against the device screen. */
export interface SigningDisplay {
  readonly title: string;
  readonly lines: readonly DisplayLine[];
  readonly warnings: readonly DisplayWarning[];
  /** True if the device will probably show an opaque hash only. */
  readonly blind: boolean;
  /** Plain text: lines joined, for copy / screen readers. */
  readonly text: string;
}

const SEL_TRANSFER = '0xa9059cbb';
const SEL_APPROVE = '0x095ea7b3';
const UNLIMITED = 1n << 255n;

function word(data: string, i: number): string {
  return data.slice(10 + i * 64, 10 + (i + 1) * 64);
}

function decodeAddrAmount(data: string): { addr: string; amount: bigint } | null {
  if (data.length !== 10 + 128) return null;
  const a = word(data, 0);
  if (!/^0{24}/.test(a)) return null;
  return { addr: '0x' + a.slice(24), amount: BigInt('0x' + word(data, 1)) };
}

function finish(title: string, lines: DisplayLine[], warnings: DisplayWarning[]): SigningDisplay {
  const blind = warnings.includes('blind-signing');
  return { title, lines, warnings, blind, text: lines.map((l) => `${l.label}: ${l.value}`).join('\n') };
}

/**
 * Build the review text for a transaction. Decodes ERC-20 transfer/approve
 * calldata so the user can compare recipient and amount on the device; any
 * other calldata is flagged as blind signing.
 *
 * @security Addresses are printed in full, never truncated: truncation is how
 * address-poisoning works. Lowercase hex is shown; the device may show an
 * EIP-55 checksummed form, compare case-insensitively.
 */
export function describeTx(
  r: TxSignRequest,
  opts: { nativeSymbol?: string; tokenDecimals?: number; tokenSymbol?: string } = {},
): Result<SigningDisplay> {
  const v = validateTxRequest(r);
  if (!v.ok) return v;
  const sym = opts.nativeSymbol ?? 'ETH';
  const data = r.data.toLowerCase();
  const warnings: DisplayWarning[] = [];
  const lines: DisplayLine[] = [
    { label: 'Network chain id', value: String(r.chainId) },
    { label: 'To', value: r.to.toLowerCase() },
    { label: 'Amount', value: `${formatUnits(r.value, 18)} ${sym}` },
  ];
  if (data !== '0x') {
    const sel = data.slice(0, 10);
    const dec = sel === SEL_TRANSFER || sel === SEL_APPROVE ? decodeAddrAmount(data) : null;
    if (dec !== null) {
      const tsym = opts.tokenSymbol ?? 'tokens';
      const amt =
        opts.tokenDecimals !== undefined
          ? `${formatUnits(dec.amount, opts.tokenDecimals)} ${tsym}`
          : `${dec.amount.toString()} (base units)`;
      if (sel === SEL_TRANSFER) {
        lines.push(
          { label: 'Action', value: 'Token transfer' },
          { label: 'Token recipient', value: dec.addr },
          { label: 'Token amount', value: amt },
        );
      } else {
        lines.push(
          { label: 'Action', value: 'Token approval' },
          { label: 'Spender', value: dec.addr },
          { label: 'Allowance', value: amt },
        );
        if (dec.amount >= UNLIMITED) warnings.push('unlimited-approval');
      }
    } else {
      warnings.push('blind-signing', 'unknown-contract-call');
      lines.push(
        { label: 'Calldata selector', value: sel },
        { label: 'Calldata bytes', value: String((data.length - 2) / 2) },
      );
    }
    if (r.value > 0n) warnings.push('value-with-data');
  }
  lines.push(
    { label: 'Max fee per gas (wei)', value: r.maxFeePerGas.toString() },
    { label: 'Gas limit', value: r.gasLimit.toString() },
    { label: 'Nonce', value: String(r.nonce) },
  );
  return ok(finish('Confirm transaction on your device', lines, warnings));
}

function scalar(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  return null;
}

/**
 * Build the review text for EIP-712 data. Permit gets a dedicated layout;
 * other primary types list top-level scalar fields and flag nesting.
 */
export function describeTypedData(r: TypedDataSignRequest): Result<SigningDisplay> {
  const p = parseTypedData(r);
  if (!p.ok) return p;
  const { domain, primaryType, message } = p.value;
  const warnings: DisplayWarning[] = [];
  const lines: DisplayLine[] = [
    { label: 'Network chain id', value: String(r.chainId) },
    { label: 'App / contract', value: scalar(domain['name']) ?? '(unnamed)' },
    { label: 'Verifying contract', value: scalar(domain['verifyingContract'])?.toLowerCase() ?? '(none)' },
    { label: 'Message type', value: primaryType },
  ];
  for (const [k, raw] of Object.entries(message)) {
    const s = scalar(raw);
    if (s === null) {
      warnings.push('nested-structure');
      lines.push({ label: k, value: '(nested data, see device)' });
      continue;
    }
    lines.push({ label: k, value: /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : s });
    if (primaryType === 'Permit' && k === 'value' && /^[0-9]+$/.test(s) && BigInt(s) >= UNLIMITED)
      warnings.push('unlimited-approval');
  }
  if (primaryType !== 'Permit' && warnings.includes('nested-structure')) warnings.push('blind-signing');
  return ok(finish('Confirm signature on your device', lines, [...new Set(warnings)]));
}

/** Describe any request. */
export function describeRequest(
  r: SignRequest,
  opts?: Parameters<typeof describeTx>[1],
): Result<SigningDisplay> {
  return r.kind === 'transaction' ? describeTx(r, opts) : describeTypedData(r);
}

/** Short user-facing explanation of why a kind of signature is risky. */
export function describeSigningRisk(kind: DisplayWarning): string {
  switch (kind) {
    case 'blind-signing':
      return 'Your device may show only a hash. Check the details here, and enable blind signing only if you trust this app.';
    case 'unlimited-approval':
      return 'This lets the spender move any amount of this token later.';
    case 'contract-creation':
      return 'This deploys a new contract.';
    case 'unknown-contract-call':
      return 'This calls a contract method GhostPay cannot read.';
    case 'nested-structure':
      return 'Part of this message is nested; check it on the device.';
    case 'value-with-data':
      return 'This sends funds and also calls a contract.';
  }
}

/** Error taxonomy. */
export type HwErrorCode =
  | 'user-rejected'
  | 'device-locked'
  | 'app-not-open'
  | 'blind-signing-disabled'
  | 'device-disconnected'
  | 'timeout'
  | 'unsupported-method'
  | 'chain-mismatch'
  | 'wrong-account'
  | 'malformed-signature'
  | 'unknown';

export interface HwError {
  readonly code: HwErrorCode;
  readonly retryable: boolean;
  readonly message: string;
}

const HW_ERRORS: Record<HwErrorCode, HwError> = {
  'user-rejected': {
    code: 'user-rejected',
    retryable: true,
    message: 'You declined on the device. Nothing was signed.',
  },
  'device-locked': { code: 'device-locked', retryable: true, message: 'Unlock the device, then try again.' },
  'app-not-open': {
    code: 'app-not-open',
    retryable: true,
    message: 'Open the Ethereum app on the device, then try again.',
  },
  'blind-signing-disabled': {
    code: 'blind-signing-disabled',
    retryable: true,
    message: 'The device needs blind signing enabled for this request.',
  },
  'device-disconnected': {
    code: 'device-disconnected',
    retryable: true,
    message: 'The device disconnected. Reconnect and try again.',
  },
  timeout: {
    code: 'timeout',
    retryable: true,
    message: 'No answer from the device in time. Nothing was signed.',
  },
  'unsupported-method': {
    code: 'unsupported-method',
    retryable: false,
    message: 'This wallet does not support this kind of signature.',
  },
  'chain-mismatch': {
    code: 'chain-mismatch',
    retryable: false,
    message: 'The wallet is on a different network than this request.',
  },
  'wrong-account': {
    code: 'wrong-account',
    retryable: false,
    message: 'The signature came from a different account than expected.',
  },
  'malformed-signature': {
    code: 'malformed-signature',
    retryable: false,
    message: 'The wallet returned an invalid signature. It was discarded.',
  },
  unknown: {
    code: 'unknown',
    retryable: false,
    message: 'The wallet reported an error GhostPay does not recognise.',
  },
};

/** Look up a taxonomy entry. */
export const hwError = (code: HwErrorCode): HwError => HW_ERRORS[code];

/**
 * Map a raw wallet/transport error ({code, message}) to the taxonomy.
 * Codes: EIP-1193 4001 rejected, 4200 unsupported, 4900/4901 disconnected;
 * Ledger-style status words as hex strings. UNVERIFIED against devices.
 */
export function classifyHwError(raw: unknown): HwError {
  const o = isRecord(raw) ? raw : {};
  const code =
    typeof o['code'] === 'number' || typeof o['code'] === 'string' ? String(o['code']).toLowerCase() : '';
  const msg = typeof o['message'] === 'string' ? o['message'].toLowerCase() : '';
  if (code === '4001' || code === '5000' || code === '0x6985' || /reject|denied|declin|cancel/.test(msg))
    return HW_ERRORS['user-rejected'];
  if (code === '0x5515' || /locked/.test(msg)) return HW_ERRORS['device-locked'];
  if (code === '0x6a80' || /blind/.test(msg)) return HW_ERRORS['blind-signing-disabled'];
  if (code === '0x6e00' || code === '0x6d00' || code === '0x6511' || /app.*(not|closed)|open the/.test(msg))
    return HW_ERRORS['app-not-open'];
  if (code === '4900' || code === '4901' || /disconnect|no device|not connected/.test(msg))
    return HW_ERRORS['device-disconnected'];
  if (code === '4200' || code === '-32601' || /not supported|unsupported/.test(msg))
    return HW_ERRORS['unsupported-method'];
  if (/timeout|timed out/.test(msg)) return HW_ERRORS['timeout'];
  return HW_ERRORS['unknown'];
}

export type SignStatus = 'awaiting-device' | 'signed' | 'failed' | 'expired';

/** Immutable sign session. */
export interface SignSession {
  readonly id: string;
  readonly request: SignRequest;
  readonly display: SigningDisplay;
  readonly createdAtMs: number;
  readonly deadlineMs: number;
  readonly status: SignStatus;
  readonly signature?: string;
  readonly error?: HwError;
  /** A signature arrived after the session ended and was discarded. */
  readonly lateSignatureDiscarded?: boolean;
}

export const MIN_TIMEOUT_MS = 10_000;
export const MAX_TIMEOUT_MS = 600_000;
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Start a session. The display is built (and validated) up front, so a user can never be asked to sign something that was not reviewed (HWSIG-4). */
export function createSignSession(input: {
  id: string;
  request: SignRequest;
  nowMs: number;
  timeoutMs?: number;
  displayOpts?: Parameters<typeof describeTx>[1];
}): Result<SignSession> {
  const t = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(t) || t < MIN_TIMEOUT_MS || t > MAX_TIMEOUT_MS)
    return err('timeout out of range');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.id)) return err('bad id');
  if (!Number.isFinite(input.nowMs)) return err('bad clock');
  const d = describeRequest(input.request, input.displayOpts);
  if (!d.ok) return d;
  return ok({
    id: input.id,
    request: input.request,
    display: d.value,
    createdAtMs: input.nowMs,
    deadlineMs: input.nowMs + t,
    status: 'awaiting-device',
  });
}

export type SignEvent =
  | { readonly type: 'signature'; readonly signature: unknown; readonly from?: string }
  | { readonly type: 'error'; readonly raw: unknown }
  | { readonly type: 'tick' };

/**
 * Advance a session. Terminal states are sticky. A signature arriving after
 * the deadline is discarded, so a user who walked away cannot be surprised by
 * a stale approval being used.
 *
 * @security The signature is shape-checked (65 bytes, low-s) and, if `from`
 * is given, compared with the signer address; mismatches fail the session.
 */
export function advance(s: SignSession, ev: SignEvent, nowMs: number, expectedAddress?: string): SignSession {
  const expired = nowMs >= s.deadlineMs;
  if (s.status !== 'awaiting-device') {
    return ev.type === 'signature' && !s.lateSignatureDiscarded && s.status !== 'signed'
      ? { ...s, lateSignatureDiscarded: true }
      : s;
  }
  if (expired) {
    return {
      ...s,
      status: 'expired',
      error: HW_ERRORS['timeout'],
      ...(ev.type === 'signature' ? { lateSignatureDiscarded: true } : {}),
    };
  }
  if (ev.type === 'tick') return s;
  if (ev.type === 'error') return { ...s, status: 'failed', error: classifyHwError(ev.raw) };
  const v = validateSignature(ev.signature);
  if (!v.ok) return { ...s, status: 'failed', error: HW_ERRORS['malformed-signature'] };
  if (
    ev.from !== undefined &&
    expectedAddress !== undefined &&
    ev.from.toLowerCase() !== expectedAddress.toLowerCase()
  ) {
    return { ...s, status: 'failed', error: HW_ERRORS['wrong-account'] };
  }
  return { ...s, status: 'signed', signature: v.value };
}
