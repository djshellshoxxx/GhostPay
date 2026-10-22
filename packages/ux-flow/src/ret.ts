import { b64urlDecode } from './base64url.js';
import { FlowError } from './errors.js';
import { MAX_PROOF_LENGTH, decodeProof } from './proof.js';
import type { Proof } from './proof.js';

/** Invoice fields relevant to return-to-merchant. `returnOrigin` comes from the seller-signed invoice. */
export interface ReturnInvoice {
  readonly returnOrigin?: string;
}

/**
 * Canonicalise an https origin: exact `new URL(x).origin` string, no path/query/fragment/userinfo.
 * Returns null when not canonical. `allowLocalhost` additionally permits http://localhost for development.
 */
export function canonicalOrigin(o: unknown, allowLocalhost = false): string | null {
  if (typeof o !== 'string' || o.length === 0 || o.length > 253 + 8) return null;
  let u: URL;
  try {
    u = new URL(o);
  } catch {
    return null;
  }
  const okScheme =
    u.protocol === 'https:' || (allowLocalhost && u.protocol === 'http:' && u.hostname === 'localhost');
  if (!okScheme || u.origin !== o || u.username !== '' || u.password !== '') return null;
  return o;
}

const PATH_RE = /^\/[A-Za-z0-9._~\-/]*$/;

/**
 * Build the return URL: `origin + path + "#proof=" + proof`. Data lives only in the fragment, never the query
 * (EMBED-1). `path` is optional and strictly charset/dot-segment checked.
 * @security Fragment is not sent to the merchant server in the HTTP request; merchant JS reads it client-side.
 * @throws FlowError BAD_RETURN | BAD_ORIGIN | PROOF_*
 */
export function buildReturnUrl(returnOrigin: string, proof: string, path = '/'): string {
  const o = canonicalOrigin(returnOrigin);
  if (o === null) throw new FlowError('BAD_ORIGIN');
  if (typeof proof !== 'string' || proof.length > MAX_PROOF_LENGTH) throw new FlowError('PROOF_TOO_LARGE');
  decodeProof(proof); // strict: only well-formed proofs leave the app
  if (!PATH_RE.test(path) || path.startsWith('//') || path.split('/').some((s) => s === '.' || s === '..')) {
    throw new FlowError('BAD_RETURN');
  }
  return `${o}${path}#proof=${proof}`;
}

/**
 * Is `target` an allowed user-initiated return destination for this invoice? True only when the invoice declares a
 * returnOrigin and the target is https on exactly that origin: no wildcards, no subdomain or lookalike, no userinfo,
 * no backslashes or whitespace tricks, no query string.
 * @security Open-redirect guard. Exact origin string equality after URL parsing; unparseable input returns false.
 */
export function isAllowedReturn(inv: ReturnInvoice, target: unknown): boolean {
  if (typeof target !== 'string' || target.length === 0 || target.length > 2048) return false;
  const allowed = canonicalOrigin(inv.returnOrigin);
  if (allowed === null) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\\s\u0000-\u001f\u007f]/.test(target)) return false;
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.origin !== allowed || u.username !== '' || u.password !== '') return false;
  if (u.search !== '' || target.includes('?')) return false;
  // The authority must appear verbatim: guards parser-normalisation surprises (e.g. "https:/\evil", "https:evil").
  return target.startsWith(`${allowed}/`) || target === allowed;
}

/** Expected values for offline proof verification. */
export interface ExpectedProof {
  readonly nonce: string;
  readonly chainId: number;
  readonly txHash: string;
}

/** Result of {@link verifyProofOffline}. */
export type ProofCheck =
  | { readonly ok: true; readonly proof: Proof }
  | { readonly ok: false; readonly error: 'BAD_PROOF' | 'MISMATCH' };

/**
 * Check a proof code against what the merchant expects (their invoice nonce, chain, and the tx they observed on
 * their own RPC). Offline: no network. Decoding is strict and size-bounded.
 * @security Proves only agreement with the claimed tx; the merchant must still confirm the tx on chain.
 */
export function verifyProofOffline(proofCode: string, expected: ExpectedProof): ProofCheck {
  let p: Proof;
  try {
    p = decodeProof(proofCode);
  } catch (e) {
    if (e instanceof FlowError) return { ok: false, error: 'BAD_PROOF' };
    throw e;
  }
  if (
    p.nonce !== expected.nonce ||
    p.chainId !== expected.chainId ||
    p.txHash !== expected.txHash.toLowerCase()
  ) {
    return { ok: false, error: 'MISMATCH' };
  }
  return { ok: true, proof: p };
}

/** Signed state binding a return origin and nonce to the seller. */
export interface SignedReturnState {
  readonly returnOrigin: string;
  readonly nonce: string;
  /** base64url signature produced by the seller; opaque to this package. */
  readonly signature: string;
}

/** Caller-supplied verifier: returns true only if `signature` is valid over `message` for the expected seller key. */
export type SignatureVerifier = (message: Uint8Array, signature: Uint8Array) => boolean;

/** Canonical signed message: `ghostpay-return-v1\n<origin>\n<nonce>` as UTF-8. */
export function returnStateMessage(returnOrigin: string, nonce: string): Uint8Array {
  return new TextEncoder().encode(`ghostpay-return-v1\n${returnOrigin}\n${nonce}`);
}

/**
 * Verify the seller signature over (returnOrigin, nonce) with a caller-supplied verifier (no crypto here).
 * Fails closed: a bad origin, bad nonce, undecodable signature, a verifier that throws, or anything other than a
 * strict `true` return is "invalid".
 */
export function checkSignedReturn(state: SignedReturnState, verify: SignatureVerifier): boolean {
  try {
    if (canonicalOrigin(state.returnOrigin) === null) return false;
    if (typeof state.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(state.nonce)) return false;
    if (typeof state.signature !== 'string' || state.signature.length > 1024) return false;
    const sig = b64urlDecode(state.signature);
    return verify(returnStateMessage(state.returnOrigin, state.nonce), sig) === true;
  } catch {
    return false;
  }
}
