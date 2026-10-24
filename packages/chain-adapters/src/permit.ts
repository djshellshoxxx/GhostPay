import { getAddress, recoverAddress } from 'viem/utils';
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
