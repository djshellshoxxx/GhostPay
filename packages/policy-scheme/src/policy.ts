import { concatHex, encodeAbiParameters, getAddress, keccak256 } from 'viem/utils';
import { fail } from './errors.js';
import {
  MAX_DELAY,
  MAX_UINT256,
  MIN_DELAY,
  addr,
  bytes32,
  nonZeroAddr,
  uint,
  type Address,
  type Hex,
} from './types.js';

/** Pre-image of a scheme-2 policy hash. */
export interface Policy {
  /** Initial (and only) recipient of withdrawals. */
  readonly destination: Address;
  /** Withdrawal timelock in seconds; the destination timelock is twice this. */
  readonly delaySeconds: bigint;
  /** Merkle root of per-token limits ({@link buildLimitsTree}), or {@link ZERO_HASH} for no limits. */
  readonly limitsRoot: Hex;
}

/** Where an account lives: the official factory and the implementation it clones (both per chain). */
export interface PolicyDeployment {
  /** `PolicyAccountFactory` address (the CREATE2 deployer). */
  readonly factory: Address;
  /** `PolicyAccount` implementation address (`factory.IMPLEMENTATION()`). */
  readonly implementation: Address;
}

/** EIP-1167 creation code prefix used by OpenZeppelin `Clones` 5.x (before the implementation). */
export const CLONE_PREFIX: Hex = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73';
/** EIP-1167 creation code suffix used by OpenZeppelin `Clones` 5.x (after the implementation). */
export const CLONE_SUFFIX: Hex = '0x5af43d82803e903d91602b57fd5bf3';

/**
 * Policy hash committed to by a scheme-2 meta-address.
 *
 * @remarks `keccak256(abi.encode(address destination, uint256 delaySeconds, bytes32 limitsRoot))`,
 * byte-identical to `PolicyAccountFactory.policyHashOf` and `PolicyAccount.policyHash`. Only the
 * encoding is checked here (any uint256 delay); use {@link validatePolicy} before publishing.
 *
 * @param policy Policy pre-image.
 * @returns 32-byte policy hash (lowercase hex).
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_INPUT`, `INVALID_HEX`.
 * @security The hash hides the destination only against parties who cannot guess it: a
 * candidate destination, delay and root can be tested by brute force. It is not a commitment
 * with a blinding factor.
 * @testVector policy-scheme.policyHash
 */
export function computePolicyHash(policy: Policy): Hex {
  const destination = addr(policy.destination, 'destination');
  const delay = uint(policy.delaySeconds, MAX_UINT256, 'delaySeconds');
  const root = bytes32(policy.limitsRoot, 'limitsRoot');
  return keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }], [destination, delay, root]),
  );
}

/**
 * Validates that the official factory would deploy this policy.
 *
 * @remarks Mirrors `PolicyAccountFactory.deploy`: non-zero destination and
 * `MIN_DELAY (1 h) <= delaySeconds <= MAX_DELAY (30 d)`. Returns a normalised copy.
 *
 * @param policy Candidate policy.
 * @returns Normalised policy (checksummed destination, lowercase root).
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_DELAY`, `INVALID_HEX`.
 * @security Publish a meta-address only for a validated policy: a policy the factory rejects
 * makes every payment to it unrecoverable (no other deployer can create the account, P6).
 * @testVector policy-scheme.policyHash
 */
export function validatePolicy(policy: Policy): Policy {
  const destination = nonZeroAddr(policy.destination, 'destination');
  const d = policy.delaySeconds;
  if (typeof d !== 'bigint' || d < MIN_DELAY || d > MAX_DELAY) return fail('INVALID_DELAY', 'delaySeconds');
  return { destination, delaySeconds: d, limitsRoot: bytes32(policy.limitsRoot, 'limitsRoot') };
}

/**
 * CREATE2 salt of an account.
 *
 * @remarks `keccak256(abi.encode(address owner, bytes32 policyHash))`, as in the factory.
 *
 * @param owner Scheme-1-derived owner EOA.
 * @param policyHash {@link computePolicyHash} output.
 * @returns 32-byte salt.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Public data.
 * @testVector policy-scheme.accounts
 */
export function accountSalt(owner: Address, policyHash: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [addr(owner, 'owner'), bytes32(policyHash, 'policyHash')],
    ),
  );
}

/**
 * keccak256 of the EIP-1167 creation code that OpenZeppelin `Clones.cloneDeterministic` deploys.
 *
 * @param implementation `PolicyAccount` implementation.
 * @returns 32-byte init code hash.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`.
 * @security Public data.
 * @testVector policy-scheme.accounts
 */
export function cloneInitCodeHash(implementation: Address): Hex {
  const impl = nonZeroAddr(implementation, 'implementation').toLowerCase() as Hex;
  return keccak256(concatHex([CLONE_PREFIX, impl, CLONE_SUFFIX]));
}

/**
 * Predicts the counterfactual account address `A_acct`.
 *
 * @remarks `address(keccak256(0xff ++ factory ++ salt ++ keccak256(cloneInitCode(implementation)))[12:])`
 * with `salt = keccak256(abi.encode(owner, policyHash))`; identical to
 * `PolicyAccountFactory.predictAddress(owner, policyHash)` (OpenZeppelin `Clones.predictDeterministicAddress`).
 *
 * @param deployment Factory and implementation of the chain.
 * @param owner Owner EOA.
 * @param policyHash Policy hash.
 * @returns EIP-55 account address.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security The address depends on factory and implementation: a manifest that substitutes either
 * makes payers fund an account the recipient's factory cannot deploy. Pin both per chain.
 * @testVector policy-scheme.accounts
 */
export function predictAccountAddress(deployment: PolicyDeployment, owner: Address, policyHash: Hex): Address {
  return predictAccountAddressFromSalt(deployment, accountSalt(nonZeroAddr(owner, 'owner'), policyHash));
}

/**
 * Predicts the account address from its CREATE2 salt, as `GhostPayPolicyRouter` checks it.
 *
 * @remarks `address(keccak256(0xff ++ factory ++ salt ++ keccak256(cloneInitCode(implementation)))[12:])`.
 * The router receives only the salt (round-3 audit N-01), so it cannot see the owner or policy hash.
 *
 * @param deployment Factory and implementation of the chain.
 * @param salt {@link accountSalt} output.
 * @returns EIP-55 account address.
 * @throws {PolicySchemeError} `INVALID_ADDRESS`, `INVALID_HEX`.
 * @security Public data. A salt with a zero owner maps to an address no factory can deploy; build salts
 * with {@link accountSalt} from a validated owner only.
 * @testVector policy-scheme.accounts
 */
export function predictAccountAddressFromSalt(deployment: PolicyDeployment, salt: Hex): Address {
  const factory = nonZeroAddr(deployment.factory, 'factory');
  const initHash = cloneInitCodeHash(deployment.implementation);
  const digest = keccak256(concatHex(['0xff', factory, bytes32(salt, 'salt'), initHash]));
  return getAddress(`0x${digest.slice(26)}`);
}
