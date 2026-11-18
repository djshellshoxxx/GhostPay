/**
 * Embed postMessage protocol v1 (docs/specs/14-embed-merchant-profile.md, section 1).
 *
 * Envelope: `{t, n, v:1, data}` with a 128-bit hex nonce `n` chosen by the merchant-page SDK. Messages are closed-schema,
 * capped at 2 KB and carry public data only. A completion payload is `{status, chainId, txHash}` and nothing else:
 * never keys, invoice plaintext, addresses of the payer, memo, or amounts.
 */

export const EMBED_MAX_MESSAGE_BYTES = 2048;
export const EMBED_VERSION = 1;

export type EmbedType = 'gp:hello' | 'gp:init' | 'gp:status' | 'gp:done';
export type EmbedPhase = 'ready' | 'submitting' | 'closed';
export type EmbedDoneStatus = 'submitted' | 'failed' | 'cancelled';

export interface EmbedDone {
  readonly status: EmbedDoneStatus;
  readonly chainId: number;
  readonly txHash?: string;
}

export type EmbedMessage =
  | { readonly t: 'gp:hello'; readonly n: string; readonly v: 1; readonly data: Record<string, never> }
  | { readonly t: 'gp:init'; readonly n: string; readonly v: 1; readonly data: Record<string, never> }
  | { readonly t: 'gp:status'; readonly n: string; readonly v: 1; readonly data: { readonly phase: EmbedPhase } }
  | { readonly t: 'gp:done'; readonly n: string; readonly v: 1; readonly data: EmbedDone };

const NONCE_RE = /^[0-9a-f]{32}$/;
const TX_RE = /^0x[0-9a-f]{64}$/;
const PHASES: readonly string[] = ['ready', 'submitting', 'closed'];
const STATUSES: readonly string[] = ['submitted', 'failed', 'cancelled'];

function plain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function onlyKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/** True for a 32-hex-character (128-bit) lowercase nonce. */
export function isNonce(v: unknown): v is string {
  return typeof v === 'string' && NONCE_RE.test(v);
}

/** Generates a random 128-bit nonce as 32 lowercase hex characters. */
export function newNonce(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parses an untrusted `event.data`. Returns undefined for anything that is not exactly a valid v1 message. Never throws.
 */
export function parseEmbedMessage(raw: unknown): EmbedMessage | undefined {
  try {
    if (!plain(raw) || !onlyKeys(raw, ['t', 'n', 'v', 'data'])) return undefined;
    if (raw.v !== EMBED_VERSION || !isNonce(raw.n) || !plain(raw.data)) return undefined;
    if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > EMBED_MAX_MESSAGE_BYTES) return undefined;
    const { t, n, data } = raw;
    switch (t) {
      case 'gp:hello':
      case 'gp:init':
        return onlyKeys(data, []) ? { t, n, v: 1, data: {} } : undefined;
      case 'gp:status':
        return onlyKeys(data, ['phase']) && typeof data.phase === 'string' && PHASES.includes(data.phase)
          ? { t, n, v: 1, data: { phase: data.phase as EmbedPhase } }
          : undefined;
      case 'gp:done': {
        const keys = Object.keys(data);
        const withTx = keys.length === 3;
        if (!onlyKeys(data, withTx ? ['status', 'chainId', 'txHash'] : ['status', 'chainId'])) return undefined;
        if (typeof data.status !== 'string' || !STATUSES.includes(data.status)) return undefined;
        if (typeof data.chainId !== 'number' || !Number.isSafeInteger(data.chainId) || data.chainId < 1 || data.chainId > 2 ** 32 - 1) return undefined;
        if (withTx && (typeof data.txHash !== 'string' || !TX_RE.test(data.txHash))) return undefined;
        // A submitted payment must carry its transaction hash; the other statuses must not.
        if ((data.status === 'submitted') !== withTx) return undefined;
        return {
          t,
          n,
          v: 1,
          data: { status: data.status as EmbedDoneStatus, chainId: data.chainId, ...(withTx ? { txHash: data.txHash as string } : {}) },
        };
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
