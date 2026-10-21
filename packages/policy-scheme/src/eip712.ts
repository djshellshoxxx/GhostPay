import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { unsafeRevealSecret, zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import {
  bytesToHex,
  concatHex,
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  hexToBytes,
  keccak256,
  recoverAddress,
  toHex,
} from 'viem/utils';
import { fail } from './errors.js';
import { verifyLimitProof, type TokenLimitProof } from './limits.js';
import {
  MAX_UINT256,
  ZERO_HASH,
  addr,
  bytes32,
  chainIdOf,
  nonZeroAddr,
  uint,
  type Address,
  type Hex,
} from './types.js';

/** EIP-712 domain name of `PolicyAccount`. */
export const POLICY_DOMAIN_NAME = 'GhostPayPolicyAccount';
/** EIP-712 domain version of `PolicyAccount`. */
export const POLICY_DOMAIN_VERSION = '1';

/** EIP-712 type strings, byte-identical to the contract constants. */
export const TYPE_STRINGS = Object.freeze({
  Withdraw: 'Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)',
  CancelWithdraw: 'CancelWithdraw(bytes32 id)',
  ProposeDestination: 'ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)',
  CancelDestination: 'CancelDestination(bytes32 id)',
});

/** `PolicyAccount.WITHDRAW_TYPEHASH`. */
export const WITHDRAW_TYPEHASH: Hex = keccak256(toHex(TYPE_STRINGS.Withdraw));
/** `PolicyAccount.CANCEL_WITHDRAW_TYPEHASH`. */
export const CANCEL_WITHDRAW_TYPEHASH: Hex = keccak256(toHex(TYPE_STRINGS.CancelWithdraw));
/** `PolicyAccount.PROPOSE_DESTINATION_TYPEHASH`. */
export const PROPOSE_DESTINATION_TYPEHASH: Hex = keccak256(toHex(TYPE_STRINGS.ProposeDestination));
/** `PolicyAccount.CANCEL_DESTINATION_TYPEHASH`. */
export const CANCEL_DESTINATION_TYPEHASH: Hex = keccak256(toHex(TYPE_STRINGS.CancelDestination));

/** EIP-712 `types` objects for viem/wallets. */
export const POLICY_TYPES = Object.freeze({
  Withdraw: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'limitLeafHash', type: 'bytes32' },
  ],
  CancelWithdraw: [{ name: 'id', type: 'bytes32' }],
  ProposeDestination: [
    { name: 'newDestination', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
  CancelDestination: [{ name: 'id', type: 'bytes32' }],
} as const);

/** EIP-712 domain of one account clone. */
export interface PolicyDomain {
  readonly name: typeof POLICY_DOMAIN_NAME;
  readonly version: typeof POLICY_DOMAIN_VERSION;
  readonly chainId: number;
  readonly verifyingContract: Address;
}

/** `IPolicyAccount.Withdraw`. */
export interface WithdrawMessage {
  readonly token: Address;
  readonly amount: bigint;
  readonly deadline: bigint;
  readonly nonce: bigint;
  readonly limitLeafHash: Hex;
}
/** `ProposeDestination`. */
export interface ProposeDestinationMessage {
  readonly newDestination: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
}
/** `CancelWithdraw` / `CancelDestination`. */
export interface CancelMessage {
  readonly id: Hex;
}

/** Typed data with the struct hash (`id`) the contract derives from it. */
export interface PolicyTypedData<P extends keyof typeof POLICY_TYPES, M> {
  readonly domain: PolicyDomain;
  readonly types: { readonly [K in P]: (typeof POLICY_TYPES)[K] };
  readonly primaryType: P;
  readonly message: M;
  /** EIP-712 struct hash; for Withdraw/ProposeDestination it is the on-chain request/proposal id. */
  readonly structHash: Hex;
  /** Final digest `keccak256(0x1901 || domainSeparator || structHash)` that is signed. */
  readonly digest: Hex;
}

export type WithdrawTypedData = PolicyTypedData<'Withdraw', WithdrawMessage>;
export type CancelWithdrawTypedData = PolicyTypedData<'CancelWithdraw', CancelMessage>;
export type ProposeDestinationTypedData = PolicyTypedData<'ProposeDestination', ProposeDestinationMessage>;
export type CancelDestinationTypedData = PolicyTypedData<'CancelDestination', CancelMessage>;
export type AnyPolicyTypedData =
  | WithdrawTypedData
  | CancelWithdrawTypedData
  | ProposeDestinationTypedData
  | CancelDestinationTypedData;

/** A 65-byte `r || s || v` signature (v in {27, 28}, low-s). */
export interface PolicySignature {
  readonly signature: Hex;
  readonly v: 27 | 28;
  readonly r: Hex;
  readonly s: Hex;
}

/**
 * EIP-712 domain of an account clone.
 *
 * @param chainId Chain id.
 * @param account The clone (`A_acct`), never the implementation.
 * @returns Domain object.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`.
 * @security Binding to chain id and clone address makes a signature useless on any other chain or account.
 */
export function policyDomain(chainId: number, account: Address): PolicyDomain {
  return Object.freeze({
    name: POLICY_DOMAIN_NAME,
    version: POLICY_DOMAIN_VERSION,
    chainId: chainIdOf(chainId),
    verifyingContract: nonZeroAddr(account, 'account'),
  });
}

/**
 * `DOMAIN_SEPARATOR()` of an account clone (OpenZeppelin EIP712 with name, version, chainId, verifyingContract).
 *
 * @param domain Domain from {@link policyDomain}.
 * @returns 32-byte separator.
 * @security Public data.
 * @testVector policy-scheme.withdraws
 */
export function policyDomainSeparator(domain: PolicyDomain): Hex {
  const typeHash = keccak256(
    toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [typeHash, keccak256(toHex(domain.name)), keccak256(toHex(domain.version)), BigInt(domain.chainId), domain.verifyingContract],
    ),
  );
}

/** @internal viem's independent EIP-712 digest. */
function viemDigest(domain: PolicyDomain, types: unknown, primaryType: string, message: unknown): Hex {
  return hashTypedData({ domain, types, primaryType, message } as unknown as Parameters<typeof hashTypedData>[0]);
}

/** @internal Digest computed both by hand and by viem; they must agree. */
function finish<P extends keyof typeof POLICY_TYPES, M extends Record<string, unknown>>(
  domain: PolicyDomain,
  primaryType: P,
  message: M,
  structHash: Hex,
): PolicyTypedData<P, M> {
  const digest = keccak256(concatHex(['0x1901', policyDomainSeparator(domain), structHash]));
  const types = { [primaryType]: POLICY_TYPES[primaryType] } as { readonly [K in P]: (typeof POLICY_TYPES)[K] };
  const viaViem = viemDigest(domain, types, primaryType, message);
  if (viaViem !== digest) return fail('SIGNING_FAILED', 'digest self-check');
  return Object.freeze({ domain, types, primaryType, message: Object.freeze(message), structHash, digest });
}

/** Parameters of a withdrawal order. */
export interface WithdrawParams {
  readonly chainId: number;
  readonly account: Address;
  /** Token, or the zero address for native. */
  readonly token: Address;
  readonly amount: bigint;
  /** Last timestamp (inclusive) at which the request may be submitted. */
  readonly deadline: bigint;
  /** Unordered nonce (any uint256 not yet used on this account). */
  readonly nonce: bigint;
  /**
   * The token's limit proof ({@link getLimitProof}) when the account has limits, plus the account's
   * `limitsRoot`; or `null` for an account created with `limitsRoot == 0`.
   */
  readonly limit: { readonly limitsRoot: Hex; readonly proof: TokenLimitProof } | null;
}

/**
 * Builds the owner-signed `Withdraw` typed data and its request id.
 *
 * @remarks Mirrors `requestWithdraw`'s static checks so an order that would revert is never signed:
 * `amount > 0`, `token != account`, and with limits: the proof verifies against `limitsRoot`, its
 * leaf becomes `limitLeafHash` (audit L-04 binding), `amount <= limit`. Without limits
 * `limitLeafHash` is zero. `structHash` equals the on-chain request id.
 *
 * @param p Order parameters.
 * @returns Typed data, struct hash (request id) and digest.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`, `INVALID_PROOF`, `INVALID_LIMIT`, `INVALID_HEX`.
 * @security The destination is not part of the order: funds always go to the account's destination
 * at execution time. Deadline bounds submission only; anyone holding the signature may submit it.
 * @testVector policy-scheme.withdraws
 */
export function buildWithdrawTypedData(p: WithdrawParams): WithdrawTypedData {
  const domain = policyDomain(p.chainId, p.account);
  const token = addr(p.token, 'token');
  if (token === domain.verifyingContract) return fail('INVALID_INPUT', 'token equals account');
  const amount = uint(p.amount, MAX_UINT256, 'amount');
  if (amount === 0n) return fail('INVALID_INPUT', 'amount');
  const deadline = uint(p.deadline, MAX_UINT256, 'deadline');
  const nonce = uint(p.nonce, MAX_UINT256, 'nonce');
  let limitLeafHash: Hex = ZERO_HASH;
  if (p.limit !== null) {
    const root = bytes32(p.limit.limitsRoot, 'limitsRoot');
    if (root === ZERO_HASH) return fail('INVALID_INPUT', 'limitsRoot is zero; pass limit: null');
    const lp = p.limit.proof;
    if (!verifyLimitProof(root, lp.leaf, lp.proof)) return fail('INVALID_PROOF');
    if (amount > lp.limit) return fail('INVALID_LIMIT', 'amount exceeds limit');
    limitLeafHash = bytes32(lp.leaf, 'leaf');
  }
  const message: WithdrawMessage = { token, amount, deadline, nonce, limitLeafHash };
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
      [WITHDRAW_TYPEHASH, token, amount, deadline, nonce, limitLeafHash],
    ),
  );
  return finish(domain, 'Withdraw', { ...message }, structHash);
}

/**
 * Builds `CancelWithdraw(bytes32 id)` typed data.
 *
 * @param chainId Chain id.
 * @param account Account clone.
 * @param id Request id (the `Withdraw` struct hash).
 * @returns Typed data and digest.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Cancel signatures carry no nonce; they are bound to one id and their effect is idempotent.
 * @testVector policy-scheme.withdraws
 */
export function buildCancelWithdrawTypedData(chainId: number, account: Address, id: Hex): CancelWithdrawTypedData {
  const domain = policyDomain(chainId, account);
  const i = bytes32(id, 'id');
  const structHash = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [CANCEL_WITHDRAW_TYPEHASH, i]));
  return finish(domain, 'CancelWithdraw', { id: i }, structHash);
}

/** Parameters of a destination change proposal. */
export interface ProposeDestinationParams {
  readonly chainId: number;
  readonly account: Address;
  readonly newDestination: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/**
 * Builds `ProposeDestination` typed data and its proposal id.
 *
 * @remarks Rejects a zero destination and the account itself (contract `InvalidDestination`).
 *
 * @param p Proposal parameters.
 * @returns Typed data, struct hash (proposal id) and digest.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`.
 * @security Takes effect only after `2 * delay` and can be cancelled by the owner key meanwhile; a thief
 * with the same key can do the same, so watch `DestinationProposed` events.
 * @testVector policy-scheme.withdraws
 */
export function buildProposeDestinationTypedData(p: ProposeDestinationParams): ProposeDestinationTypedData {
  const domain = policyDomain(p.chainId, p.account);
  const newDestination = nonZeroAddr(p.newDestination, 'newDestination');
  if (newDestination === domain.verifyingContract) return fail('INVALID_INPUT', 'newDestination equals account');
  const deadline = uint(p.deadline, MAX_UINT256, 'deadline');
  const nonce = uint(p.nonce, MAX_UINT256, 'nonce');
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
      [PROPOSE_DESTINATION_TYPEHASH, newDestination, deadline, nonce],
    ),
  );
  return finish(domain, 'ProposeDestination', { newDestination, deadline, nonce }, structHash);
}

/**
 * Builds `CancelDestination(bytes32 id)` typed data.
 *
 * @param chainId Chain id.
 * @param account Account clone.
 * @param id Proposal id (the `ProposeDestination` struct hash).
 * @returns Typed data and digest.
 * @throws {PolicySchemeError} `INVALID_INPUT`, `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security A distinct type hash from `CancelWithdraw`, so one cancel signature cannot be replayed as the other.
 * @testVector policy-scheme.withdraws
 */
export function buildCancelDestinationTypedData(chainId: number, account: Address, id: Hex): CancelDestinationTypedData {
  const domain = policyDomain(chainId, account);
  const i = bytes32(id, 'id');
  const structHash = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [CANCEL_DESTINATION_TYPEHASH, i]));
  return finish(domain, 'CancelDestination', { id: i }, structHash);
}

/** @internal EIP-55 address of a secret key. */
function addressOfSecret(secret: Uint8Array): Address {
  const pub = secp256k1.getPublicKey(secret, false);
  return getAddress(`0x${bytesToHex(keccak_256(pub.subarray(1)).subarray(12)).slice(2)}`);
}

/**
 * Signs policy typed data with the owner key.
 *
 * @remarks Deterministic RFC 6979 low-s ECDSA (noble) over `td.digest`, which is re-checked against
 * viem's `hashTypedData`. If `expectedOwner` is given the key must map to it, and the signature is
 * recovered and compared before returning (OpenZeppelin `ECDSA.recover` accepts exactly this form).
 *
 * @param td Typed data from one of the builders.
 * @param ownerSecret Owner key ({@link deriveScheme2OwnerKey}).
 * @param expectedOwner The account's `owner()`; strongly recommended.
 * @returns 65-byte signature and its parts.
 * @throws {PolicySchemeError} `SIGNING_FAILED`.
 * @security The secret copy is zeroized after use; the secret is never logged. Signing anything
 * except a digest from these builders is impossible through this function.
 * @testVector policy-scheme.withdraws
 */
export async function signPolicyTypedData(
  td: AnyPolicyTypedData,
  ownerSecret: SecretScalar,
  expectedOwner?: Address,
): Promise<PolicySignature> {
  const viaViem = viemDigest(td.domain, td.types, td.primaryType, td.message);
  if (viaViem !== td.digest) return fail('SIGNING_FAILED', 'digest mismatch');
  const key = unsafeRevealSecret(ownerSecret);
  let signer: Address;
  let sig: Uint8Array;
  try {
    signer = addressOfSecret(key);
    if (expectedOwner !== undefined && signer !== addr(expectedOwner, 'expectedOwner')) {
      return fail('SIGNING_FAILED', 'key is not the expected owner');
    }
    sig = secp256k1.sign(hexToBytes(td.digest), key, { prehash: false, lowS: true, format: 'recovered' });
  } finally {
    zeroize(key);
  }
  const rec = sig[0] as number;
  const r = bytesToHex(sig.subarray(1, 33));
  const s = bytesToHex(sig.subarray(33, 65));
  const v = (27 + rec) as 27 | 28;
  const signature = concatHex([r, s, toHex(v, { size: 1 })]);
  const recovered = await recoverAddress({ hash: td.digest, signature });
  if (recovered !== signer) return fail('SIGNING_FAILED', 'recovery self-check');
  return Object.freeze({ signature, v, r, s });
}
