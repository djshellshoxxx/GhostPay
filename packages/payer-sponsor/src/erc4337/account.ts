import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { PayerSponsorError, ensure } from '../errors.js';
import { deploymentFor, type PayerHidingManifest } from '../manifest.js';

/** ERC-4337 EntryPoint v0.7 address (verified: reproduced from the v0.7.0 package bytecode, see README). */
export const ENTRY_POINT_V07: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
/** ERC-4337 EntryPoint v0.8 address from the eth-infinitism README (not supported by this package). */
export const ENTRY_POINT_V08: Address = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

const FACTORY_ABI = parseAbi([
  'function createAccount(address owner, uint256 saltNonce) returns (address)',
  'function getAddress(address owner, uint256 saltNonce) view returns (address)',
]);

/**
 * `initCode` that deploys the account through the factory: `factory || createAccount(owner, salt)`.
 *
 * @param factory Factory address.
 * @param owner Account owner (signing key address).
 * @param saltNonce Salt nonce.
 * @returns The `initCode`.
 */
export function buildInitCode(factory: Address, owner: Address, saltNonce: bigint): Hex {
  ensure(saltNonce >= 0n && saltNonce < 2n ** 256n, 'saltNonce out of range');
  return concat([factory, encodeFunctionData({ abi: FACTORY_ABI, functionName: 'createAccount', args: [owner, saltNonce] })]);
}

/**
 * Calldata of `factory.getAddress(owner, saltNonce)` (for an `eth_call`).
 *
 * @param owner Account owner.
 * @param saltNonce Salt nonce.
 * @returns Calldata.
 */
export function encodeFactoryGetAddress(owner: Address, saltNonce: bigint): Hex {
  return encodeFunctionData({ abi: FACTORY_ABI, functionName: 'getAddress', args: [owner, saltNonce] });
}

/**
 * Local CREATE2 computation of the counterfactual account address (independent of the chain).
 *
 * @param a Factory, EntryPoint, owner, salt and the compiled `GhostPayPayerAccount` creation code.
 * @returns The account address, equal to `factory.getAddress(owner, saltNonce)`.
 */
export function computeAccountAddress(a: {
  readonly factory: Address;
  readonly entryPoint: Address;
  readonly owner: Address;
  readonly saltNonce: bigint;
  readonly accountCreationCode: Hex;
}): Address {
  const salt = keccak256(encodeAbiParameters(parseAbiParameters('address, uint256'), [a.owner, a.saltNonce]));
  const initCodeHash = keccak256(
    concat([a.accountCreationCode, encodeAbiParameters(parseAbiParameters('address, address'), [a.entryPoint, a.owner])]),
  );
  const hash = keccak256(concat(['0xff', a.factory, salt, initCodeHash]));
  return getAddress(`0x${hash.slice(26)}`);
}

/**
 * Refuses an EntryPoint whose runtime code hash differs from the manifest entry (PH-4-REQ-2).
 *
 * @param a Manifest, chain id and a code reader (injected, performs `eth_getCode`).
 * @returns The verified EntryPoint address.
 * @throws PayerSponsorError `ENTRYPOINT_MISMATCH` when the manifest has no verified entry, the chain
 *   has no code at that address, or the hash differs.
 */
export async function verifyEntryPoint(a: {
  readonly manifest: PayerHidingManifest;
  readonly chainId: number;
  readonly getCode: (address: Address) => Promise<Hex | undefined>;
}): Promise<Address> {
  assertTestnet(a.chainId);
  const d = deploymentFor(a.manifest, a.chainId);
  if (d.entryPoint === undefined || d.entryPointCodeHash === undefined) {
    throw new PayerSponsorError('ENTRYPOINT_MISMATCH', 'manifest has no verified EntryPoint for this chain');
  }
  const code = await a.getCode(d.entryPoint);
  if (code === undefined || code === '0x') throw new PayerSponsorError('ENTRYPOINT_MISMATCH', 'no code at the EntryPoint address');
  if (keccak256(code).toLowerCase() !== d.entryPointCodeHash.toLowerCase()) {
    throw new PayerSponsorError('ENTRYPOINT_MISMATCH', 'EntryPoint code hash differs from the manifest');
  }
  return d.entryPoint;
}
