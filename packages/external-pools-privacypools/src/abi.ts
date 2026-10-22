import { parseAbi } from 'viem';

/**
 * Minimal ABIs for the Privacy Pools contracts, transcribed from the upstream interfaces
 * (`0xbow-io/privacy-pools-core`, `packages/contracts/src/interfaces/{IEntrypoint,IPrivacyPool,IState}.sol`, branch
 * `main`, retrieved 2026-10-21). `reference/abi-reference.json` holds the selectors that `solc 0.8.28` produced from
 * the upstream files; `abi.test.ts` fails if this file drifts from it.
 *
 * @security These are interface subsets only. No bytecode is vendored: the deployed code is pinned by hash in the
 *   manifest (EP-GEN-4), not by this file.
 */
export const entrypointAbi = parseAbi([
  'function deposit(uint256 _precommitment) payable returns (uint256 _commitment)',
  'function deposit(address _asset, uint256 _value, uint256 _precommitment) returns (uint256 _commitment)',
  'function assetConfig(address _asset) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)',
  'function usedPrecommitments(uint256 _precommitment) view returns (bool _used)',
  'function latestRoot() view returns (uint256 _root)',
  'function relay((address processooor, bytes data) _withdrawal, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) _proof, uint256 _scope)',
  'event Deposited(address indexed _depositor, address indexed _pool, uint256 _commitment, uint256 _amount)',
]);

export const poolAbi = parseAbi([
  'function SCOPE() view returns (uint256 _scope)',
  'function ASSET() view returns (address _asset)',
  'function ENTRYPOINT() view returns (address _entrypoint)',
  'function dead() view returns (bool _dead)',
  'function currentRoot() view returns (uint256 _root)',
  'function ragequit((uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] pubSignals) _p)',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
  'event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)',
  'event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)',
  'event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)',
]);

export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

/** `Constants.NATIVE_ASSET` of the upstream contracts: the pseudo-address that stands for the chain's native coin. */
export const NATIVE_ASSET = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

/** Struct layout of `IEntrypoint.RelayData`, ABI-encoded into `Withdrawal.data` for relayed withdrawals. */
export const relayDataParams = [
  { name: 'recipient', type: 'address' },
  { name: 'feeRecipient', type: 'address' },
  { name: 'relayFeeBPS', type: 'uint256' },
] as const;
