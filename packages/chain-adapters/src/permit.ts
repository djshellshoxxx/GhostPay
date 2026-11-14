import { concatHex, getAddress, isAddress, keccak256, numberToHex, recoverAddress, stringToBytes } from 'viem/utils';
import { PERMIT_TYPES, eip712DomainSeparator, permitDigest, type PermitTypedData } from './sweep.js';
import type { Address, Hex } from './types.js';

/**
 * Pre-flight classification of an ERC-2612 permit (spec 04). Exactly one state applies.
 *
 * - `ok_to_permit`: permit path can be used (no signature yet, or a signature that recovers to the owner over the
 *   current nonce and, when simulated, would succeed).
 * - `already_allowed`: allowance already covers the value; skip the permit and use the allowance path (also the
 *   outcome when a front-runner submitted the owner's permit).
 * - `nonce_consumed`: the signed nonce was used and the allowance does not cover the value.
 * - `sig_invalid`: the signature does not authorise this owner/spender/value/deadline, or the token rejects it.
 * - `expired`: the permit deadline is not after `now`.
 * - `unsupported_token`: the token is not ERC-2612 per the capability table, or its domain is not the standard one
 *   (DAI-style or missing `DOMAIN_SEPARATOR`).
 */
export type PermitState = 'ok_to_permit' | 'already_allowed' | 'nonce_consumed' | 'sig_invalid' | 'expired' | 'unsupported_token';

/** Every {@link PermitState}, for exhaustive message tables. */
export const PERMIT_STATES: readonly PermitState[] = Object.freeze(['ok_to_permit', 'already_allowed', 'nonce_consumed', 'sig_invalid', 'expired', 'unsupported_token']);

/** Read access used by {@link classifyPermit}; injected so this module does no network I/O. */
export interface PermitPreflightReader {
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  nonce(token: Address, owner: Address): Promise<bigint>;
  /** On-chain `DOMAIN_SEPARATOR()`; a rejection means the token has none (classified `unsupported_token`). */
  domainSeparator(token: Address): Promise<Hex>;
  /**
   * Optional static call of `permit(owner, spender, value, deadline, v, r, s)`. Resolves `false` when the call
   * reverts; transport failures must reject (they are not a permit state).
   */
  simulatePermit?(token: Address, args: { owner: Address; spender: Address; value: bigint; deadline: bigint; v: number; r: Hex; s: Hex }): Promise<boolean>;
}

/** Input of {@link classifyPermit}. */
export interface PermitPreflight {
  readonly token: Address;
  /** Capability table entry (spec 09 / `TokenConfig.permit`): `false` for DAI-style or no-permit tokens. */
  readonly permitCapable: boolean;
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  /** EIP-712 domain the permit is (or will be) signed over; absent means the domain could not be established. */
  readonly domain?: PermitTypedData['domain'];
  /** Present once the owner signed; omitted for the check before the signing prompt. */
  readonly signed?: { readonly nonce: bigint; readonly deadline: bigint; readonly signature: Hex };
  /** Current unix seconds. */
  readonly now: bigint;
}

/**
 * Splits a 65-byte signature into the `(v, r, s)` the token's `permit` takes; `v` 0/1 is normalised to 27/28.
 *
 * @returns The parts, or `undefined` when the bytes are malformed or `v` is not 0, 1, 27 or 28.
 */
export function splitPermitSignature(sig: Hex): { v: 27 | 28; r: Hex; s: Hex } | undefined {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return undefined;
  const raw = Number.parseInt(sig.slice(130, 132), 16);
  const v = raw < 27 ? raw + 27 : raw;
  if (v !== 27 && v !== 28) return undefined;
  return { v, r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}` };
}

/**
 * Classifies a permit before it is relied on (spec 04 section 2), in this order: capability table, allowance,
 * deadline, `DOMAIN_SEPARATOR` against the locally rebuilt domain, then (once signed) signed nonce against
 * `nonces(owner)`, signature recovery and an optional static `permit` call.
 *
 * @remarks Fails closed: anything that cannot be shown to be a good permit is never `ok_to_permit`. Allowance and
 * nonce read failures propagate (an RPC outage is not a permit state). Callers must never silently retry a
 * `sig_invalid`/`unsupported_token`/`expired`/`nonce_consumed` permit.
 *
 * @param p Token, parties, value, domain, optional signature and time.
 * @param reader Chain reads.
 * @returns The state.
 */
export async function classifyPermit(p: PermitPreflight, reader: PermitPreflightReader): Promise<PermitState> {
  if (!p.permitCapable) return 'unsupported_token';
  const allowance = await reader.allowance(p.token, p.owner, p.spender);
  if (allowance >= p.value) return 'already_allowed';
  if (p.signed !== undefined && p.signed.deadline <= p.now) return 'expired';
  const domain = p.domain;
  if (domain === undefined || getAddress(domain.verifyingContract) !== getAddress(p.token)) return 'unsupported_token';
  let onchain: Hex;
  try {
    onchain = await reader.domainSeparator(p.token);
  } catch {
    return 'unsupported_token';
  }
  if (typeof onchain !== 'string' || onchain.toLowerCase() !== eip712DomainSeparator(domain).toLowerCase()) return 'unsupported_token';
  const signed = p.signed;
  if (signed === undefined) return 'ok_to_permit';

  const nonce = await reader.nonce(p.token, p.owner);
  if (signed.nonce < nonce) return 'nonce_consumed';
  if (signed.nonce > nonce) return 'sig_invalid';
  const parts = splitPermitSignature(signed.signature);
  if (parts === undefined) return 'sig_invalid';
  const td: PermitTypedData = {
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: { owner: p.owner, spender: p.spender, value: p.value, nonce, deadline: signed.deadline },
  };
  let recovered: Address;
  try {
    recovered = await recoverAddress({ hash: permitDigest(td), signature: signed.signature });
  } catch {
    return 'sig_invalid';
  }
  if (getAddress(recovered) !== getAddress(p.owner)) return 'sig_invalid';
  if (reader.simulatePermit !== undefined) {
    const ok = await reader.simulatePermit(p.token, { owner: p.owner, spender: p.spender, value: p.value, deadline: signed.deadline, ...parts });
    if (!ok) return 'sig_invalid';
  }
  return 'ok_to_permit';
}

/**
 * Outcome of {@link diagnoseSignedPermit}: why a signed permit would (not) work, judged only from the signature and
 * two token reads. Unlike {@link PermitState} it needs neither the token name/version nor the allowance.
 */
export type SignedPermitDiagnosis = 'valid_for_current_nonce' | 'nonce_consumed' | 'sig_invalid' | 'unsupported_token';

/** Evidence for {@link diagnoseSignedPermit}: the permit as received plus the token's current nonce and separator. */
export interface SignedPermitEvidence {
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly deadline: bigint;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
  /** `token.nonces(owner)`; null when the read reverted. */
  readonly nonce: bigint | null;
  /** `token.DOMAIN_SEPARATOR()`; null when the call reverted (no ERC-2612 domain). */
  readonly domainSeparator: Hex | null;
}

const PERMIT_TYPEHASH = keccak256(stringToBytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'));
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N >> 1n;
const WORD = /^0x[0-9a-fA-F]{64}$/;

/** EIP-712 digest of a Permit over a known domain separator (manual encoding, no domain fields needed). */
function permitDigestForSeparator(e: SignedPermitEvidence, separator: Hex, nonce: bigint): Hex {
  const addrWord = (a: Address): Hex => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const word = (n: bigint): Hex => numberToHex(n, { size: 32 });
  const structHash = keccak256(concatHex([PERMIT_TYPEHASH, addrWord(e.owner), addrWord(e.spender), word(e.value), word(nonce), word(e.deadline)]));
  return keccak256(concatHex(['0x1901', separator, structHash]));
}

/** Recovers the signer of `digest`, or undefined for any malformed, high-s or unrecoverable signature. Never throws. */
async function recoverSigner(digest: Hex, e: SignedPermitEvidence): Promise<Address | undefined> {
  const v = e.v === 0 || e.v === 1 ? e.v + 27 : e.v;
  if (v !== 27 && v !== 28) return undefined;
  if (typeof e.r !== 'string' || typeof e.s !== 'string' || !WORD.test(e.r) || !WORD.test(e.s)) return undefined;
  const r = BigInt(e.r);
  const s = BigInt(e.s);
  if (r === 0n || r >= SECP256K1_N || s === 0n || s > HALF_N) return undefined;
  try {
    return await recoverAddress({ hash: digest, signature: concatHex([e.r, e.s, numberToHex(v, { size: 1 })]) });
  } catch {
    return undefined;
  }
}

/**
 * Diagnoses a signed ERC-2612 permit after the permit path failed (spec 04): was it good for the token's current
 * nonce, already used (nonce moved by one), or not the owner's signature over these terms at all.
 *
 * @remarks Pure and total: malformed `v`/`r`/`s`, high-s and unrecoverable signatures are `sig_invalid`, never an
 * exception. A missing nonce or domain separator is `unsupported_token`. `nonce_consumed` only checks `nonce - 1`
 * (the common front-run), so older nonces and nonce 0 never report it.
 *
 * @param e Permit terms, signature parts and the token reads.
 * @returns The diagnosis.
 */
export async function diagnoseSignedPermit(e: SignedPermitEvidence): Promise<SignedPermitDiagnosis> {
  const { nonce, domainSeparator } = e;
  if (nonce === null || domainSeparator === null) return 'unsupported_token';
  if (typeof domainSeparator !== 'string' || !WORD.test(domainSeparator) || !isAddress(e.owner) || !isAddress(e.spender)) return 'sig_invalid';
  const owner = getAddress(e.owner);
  const isOwnerAt = async (n: bigint): Promise<boolean> => {
    const signer = await recoverSigner(permitDigestForSeparator(e, domainSeparator, n), e);
    return signer !== undefined && getAddress(signer) === owner;
  };
  if (await isOwnerAt(nonce)) return 'valid_for_current_nonce';
  if (nonce > 0n && (await isOwnerAt(nonce - 1n))) return 'nonce_consumed';
  return 'sig_invalid';
}
