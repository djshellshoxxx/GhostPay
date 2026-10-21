import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import type { SecretScalar } from '@ghostpay/core-crypto';
import { bytesToHex, concatHex, getAddress, hashTypedData, hexToBytes, isAddress, keccak256, recoverAddress } from 'viem/utils';
import { fail } from './errors.js';
import { MAX_UINT256, ZERO_ADDRESS, type Address, type Hex } from './types.js';

/** Exact EIP-712 type string of the relayer's `Sweep` struct (must equal `SWEEP_TYPEHASH`'s preimage). */
export const SWEEP_TYPE_STRING =
  'Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)';

/** EIP-712 domain name of GhostPaySweepRelayer. */
export const SWEEP_DOMAIN_NAME = 'GhostPaySweepRelayer';
/** EIP-712 domain version of GhostPaySweepRelayer. */
export const SWEEP_DOMAIN_VERSION = '1';

/** EIP-712 `types` for the sweep (field order is part of the typehash). */
export const SWEEP_TYPES = {
  Sweep: [
    { name: 'token', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'destination', type: 'address' },
    { name: 'feeTo', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/** Sweep order, mirrors `IGhostPaySweepRelayer.Sweep`. */
export interface SweepOrder {
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly feeTo: Address;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/** Typed data ready for `hashTypedData` or any EIP-712 signer. */
export interface SweepTypedData {
  readonly domain: {
    readonly name: typeof SWEEP_DOMAIN_NAME;
    readonly version: typeof SWEEP_DOMAIN_VERSION;
    readonly chainId: number;
    readonly verifyingContract: Address;
  };
  readonly types: typeof SWEEP_TYPES;
  readonly primaryType: 'Sweep';
  readonly message: SweepOrder;
}

function addr(v: string, what: string): Address {
  if (!isAddress(v, { strict: true }) || v.toLowerCase() === ZERO_ADDRESS) return fail('INVALID_INPUT', what);
  return getAddress(v);
}

function u256(v: bigint, what: string): void {
  if (typeof v !== 'bigint' || v < 0n || v > MAX_UINT256) fail('INVALID_INPUT', what);
}

/**
 * Builds and validates the sweep typed data.
 *
 * @remarks Mirrors the contract's static checks so an order that would revert is never signed:
 * non-zero addresses, none equal to the relayer, `amount > fee`. The contract's balance-delta
 * checks also make `destination == owner`, `feeTo == owner` and `feeTo == destination` revert
 * (contracts DEVIATIONS item 9), so those collisions are rejected here too.
 *
 * @param chainId Chain the relayer is deployed on.
 * @param relayer `GhostPaySweepRelayer` address from the deployment manifest.
 * @param order Sweep order.
 * @returns Typed data.
 * @throws {ChainAdapterError} `INVALID_INPUT`.
 */
export function buildSweepTypedData(chainId: number, relayer: string, order: SweepOrder): SweepTypedData {
  if (!Number.isSafeInteger(chainId) || chainId < 1) return fail('INVALID_INPUT', 'chainId');
  const verifyingContract = addr(relayer, 'relayer');
  const m: SweepOrder = {
    token: addr(order.token, 'token'),
    owner: addr(order.owner, 'owner'),
    destination: addr(order.destination, 'destination'),
    feeTo: addr(order.feeTo, 'feeTo'),
    amount: order.amount,
    fee: order.fee,
    deadline: order.deadline,
    nonce: order.nonce,
  };
  for (const [k, v] of [['amount', m.amount], ['fee', m.fee], ['deadline', m.deadline], ['nonce', m.nonce]] as const) u256(v, k);
  if (m.amount <= m.fee) return fail('INVALID_INPUT', 'amount must exceed fee');
  for (const a of [m.token, m.owner, m.destination, m.feeTo]) {
    if (a === verifyingContract) return fail('INVALID_INPUT', 'address equals relayer');
  }
  if (m.destination === m.owner || m.feeTo === m.owner || m.feeTo === m.destination) {
    return fail('INVALID_INPUT', 'owner, destination and feeTo must be distinct');
  }
  return {
    domain: { name: SWEEP_DOMAIN_NAME, version: SWEEP_DOMAIN_VERSION, chainId, verifyingContract },
    types: SWEEP_TYPES,
    primaryType: 'Sweep',
    message: m,
  };
}

/**
 * EIP-712 digest via viem's `hashTypedData`.
 *
 * @param td Typed data from {@link buildSweepTypedData}.
 * @returns 32-byte digest.
 */
export function sweepDigest(td: SweepTypedData): Hex {
  return hashTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
}

function word(v: bigint): Hex {
  return `0x${v.toString(16).padStart(64, '0')}`;
}
function addrWord(a: Address): Hex {
  return `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
}

/** @internal Manual EIP-712 domain separator for (name, version, chainId, verifyingContract). */
export function eip712DomainSeparator(d: {
  readonly name: string;
  readonly version: string;
  readonly chainId: number;
  readonly verifyingContract: Address;
}): Hex {
  const h = (t: string): Hex => bytesToHex(keccak_256(new TextEncoder().encode(t)));
  return keccak256(
    concatHex([
      h('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
      h(d.name),
      h(d.version),
      word(BigInt(d.chainId)),
      addrWord(d.verifyingContract),
    ]),
  );
}

/**
 * Independent manual EIP-712 digest (keccak of encoded words, no viem typed-data code path),
 * used as a cross-check of {@link sweepDigest} and of the on-chain `_hashTypedDataV4`.
 *
 * @param td Typed data.
 * @returns 32-byte digest.
 */
export function sweepDigestManual(td: SweepTypedData): Hex {
  const typehash = bytesToHex(keccak_256(new TextEncoder().encode(SWEEP_TYPE_STRING)));
  const domainSep = eip712DomainSeparator(td.domain);
  const m = td.message;
  const structHash = keccak256(
    concatHex([typehash, addrWord(m.token), addrWord(m.owner), addrWord(m.destination), addrWord(m.feeTo), word(m.amount), word(m.fee), word(m.deadline), word(m.nonce)]),
  );
  return keccak256(concatHex(['0x1901', domainSep, structHash]));
}

/** A 65-byte `r || s || v` signature (v in {27, 28}, low-s). */
export interface SignedDigest {
  readonly signature: Hex;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}

/**
 * Address controlled by a secret scalar.
 *
 * @param secret Stealth private key (never exported or logged here).
 * @returns EIP-55 address.
 */
export function addressOfSecret(secret: SecretScalar): Address {
  const pub = secp256k1.getPublicKey(secret, false);
  return getAddress(`0x${bytesToHex(keccak_256(pub.subarray(1)).subarray(12)).slice(2)}`);
}

/**
 * Signs a 32-byte digest with a secret scalar and self-verifies the result.
 *
 * @remarks Deterministic RFC 6979 low-s ECDSA via noble. After signing the signer is recovered
 * and compared with the key's own address; any mismatch throws. The secret is read by noble
 * only and is never copied, returned or logged. Callers must never pass a non-digest here.
 *
 * @param digest 32-byte hex digest.
 * @param secret Stealth key verified by core-crypto `deriveStealthSecret`.
 * @returns Signature parts.
 * @throws {ChainAdapterError} `SIGNING_FAILED`.
 */
export async function signDigest(digest: Hex, secret: SecretScalar): Promise<SignedDigest> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(digest)) return fail('SIGNING_FAILED', 'digest must be 32 bytes');
  const rec = secp256k1.sign(hexToBytes(digest), secret, { prehash: false, lowS: true, format: 'recovered' });
  const v = 27 + (rec[0] as number);
  const r = bytesToHex(rec.subarray(1, 33));
  const s = bytesToHex(rec.subarray(33, 65));
  const signature = concatHex([r, s, `0x${v.toString(16)}`]);
  const recovered = await recoverAddress({ hash: digest, signature });
  if (recovered !== addressOfSecret(secret)) return fail('SIGNING_FAILED', 'self-check failed');
  return { signature, v, r, s };
}

/**
 * Signs a sweep order. The order's `owner` must be the address of `secret`.
 *
 * @param td Typed data from {@link buildSweepTypedData}.
 * @param secret Stealth key.
 * @returns Signature; the digest is also computed manually and must agree with viem's.
 * @throws {ChainAdapterError} `SIGNING_FAILED` when the owner is not the key's address or digests disagree.
 */
export async function signSweep(td: SweepTypedData, secret: SecretScalar): Promise<SignedDigest> {
  if (td.message.owner !== addressOfSecret(secret)) return fail('SIGNING_FAILED', 'owner is not the signing key address');
  const digest = sweepDigest(td);
  if (digest !== sweepDigestManual(td)) return fail('SIGNING_FAILED', 'digest cross-check failed');
  return signDigest(digest, secret);
}

/** Read access to an ERC-2612 token, injected so this module does no network I/O. */
export interface PermitReader {
  name(token: Address): Promise<string>;
  /** EIP-712 domain version (`"1"` for most, `"2"` for Circle USDC). */
  version(token: Address): Promise<string>;
  nonce(token: Address, owner: Address): Promise<bigint>;
  /** Optional on-chain `DOMAIN_SEPARATOR()`; when provided it is compared with the computed domain. */
  domainSeparator?(token: Address): Promise<Hex>;
}

/** EIP-2612 `types`. */
export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Permit typed data. */
export interface PermitTypedData {
  readonly domain: { readonly name: string; readonly version: string; readonly chainId: number; readonly verifyingContract: Address };
  readonly types: typeof PERMIT_TYPES;
  readonly primaryType: 'Permit';
  readonly message: { readonly owner: Address; readonly spender: Address; readonly value: bigint; readonly nonce: bigint; readonly deadline: bigint };
}

/**
 * Builds ERC-2612 permit typed data reading name, version and nonce through `reader`.
 *
 * @remarks Fails closed on empty/oversized names, a negative nonce, or a `DOMAIN_SEPARATOR`
 * that differs from the one computed from name/version (e.g. DAI-style or non-standard tokens).
 * Spender is the contract that will pull (the router for checkout, the relayer for sweeps).
 *
 * @param p Chain, token, owner, spender, value, deadline and reader.
 * @returns Typed data.
 * @throws {ChainAdapterError} `INVALID_INPUT` or `UNSUPPORTED_TOKEN`.
 */
export async function buildPermitTypedData(p: {
  readonly chainId: number;
  readonly token: string;
  readonly owner: string;
  readonly spender: string;
  readonly value: bigint;
  readonly deadline: bigint;
  /** Optional unix seconds; when given, `deadline` must be strictly greater (an expired permit is refused). */
  readonly now?: bigint;
  readonly reader: PermitReader;
}): Promise<PermitTypedData> {
  if (!Number.isSafeInteger(p.chainId) || p.chainId < 1) return fail('INVALID_INPUT', 'chainId');
  const token = addr(p.token, 'token');
  const owner = addr(p.owner, 'owner');
  const spender = addr(p.spender, 'spender');
  u256(p.value, 'value');
  u256(p.deadline, 'deadline');
  if (p.value === 0n) return fail('INVALID_INPUT', 'value');
  if (p.deadline === 0n) return fail('INVALID_INPUT', 'deadline');
  if (p.now !== undefined) {
    u256(p.now, 'now');
    if (p.deadline <= p.now) return fail('INVALID_INPUT', 'deadline is not in the future');
  }
  const [name, version, nonce] = await Promise.all([p.reader.name(token), p.reader.version(token), p.reader.nonce(token, owner)]);
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) return fail('UNSUPPORTED_TOKEN', 'permit name');
  if (typeof version !== 'string' || version.length === 0 || version.length > 16) return fail('UNSUPPORTED_TOKEN', 'permit version');
  if (typeof nonce !== 'bigint' || nonce < 0n || nonce > MAX_UINT256) return fail('UNSUPPORTED_TOKEN', 'permit nonce');
  const domain = { name, version, chainId: p.chainId, verifyingContract: token };
  if (p.reader.domainSeparator !== undefined) {
    const onchain = await p.reader.domainSeparator(token);
    if (onchain.toLowerCase() !== eip712DomainSeparator(domain).toLowerCase()) {
      return fail('UNSUPPORTED_TOKEN', 'DOMAIN_SEPARATOR differs from computed domain');
    }
  }
  return { domain, types: PERMIT_TYPES, primaryType: 'Permit', message: { owner, spender, value: p.value, nonce, deadline: p.deadline } };
}


/**
 * EIP-712 digest of permit typed data.
 *
 * @param td Permit typed data.
 * @returns 32-byte digest.
 */
export function permitDigest(td: PermitTypedData): Hex {
  return hashTypedData({ domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
}

/**
 * Signs a permit; the owner must be the address of `secret`.
 *
 * @param td Permit typed data.
 * @param secret Stealth key.
 * @returns Signature parts.
 * @throws {ChainAdapterError} `SIGNING_FAILED`.
 */
export async function signPermit(td: PermitTypedData, secret: SecretScalar): Promise<SignedDigest> {
  if (td.message.owner !== addressOfSecret(secret)) return fail('SIGNING_FAILED', 'owner is not the signing key address');
  return signDigest(permitDigest(td), secret);
}

