import { parseAbi } from 'viem';

/**
 * Minimal ABI of the Railgun v2 `RailgunSmartWallet` (proxy), transcribed from `Railgun-Privacy/contract`
 * (`contracts/logic/{RailgunSmartWallet,RailgunLogic,Globals}.sol`, master @36bcf5ed, retrieved 2026-10-21).
 * `reference/abi-reference.json` holds the selectors solc 0.8.28 produced from that source; `abi.test.ts` fails on drift.
 *
 * @security The Sepolia proxy in the manifest was deployed earlier than that commit; whether its ABI equals this one is
 *   UNVERIFIED (no RPC egress in the build sandbox). The manifest code-hash check (EP-GEN-4) pins what actually runs.
 */
const tokenData = {
  name: 'token',
  type: 'tuple',
  components: [
    { name: 'tokenType', type: 'uint8' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'tokenSubID', type: 'uint256' },
  ],
} as const;

const commitmentPreimage = <N extends string>(name: N) =>
  ({
    name,
    type: 'tuple',
    components: [{ name: 'npk', type: 'bytes32' }, tokenData, { name: 'value', type: 'uint120' }],
  }) as const;

const g1 = <N extends string>(name: N) => ({ name, type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] }) as const;
const shieldCiphertext = { name: 'ciphertext', type: 'tuple', components: [{ name: 'encryptedBundle', type: 'bytes32[3]' }, { name: 'shieldKey', type: 'bytes32' }] } as const;

export const railgunAbi = [
  {
    type: 'function',
    name: 'shield',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_shieldRequests', type: 'tuple[]', components: [commitmentPreimage('preimage'), shieldCiphertext] }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transact',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_transactions',
        type: 'tuple[]',
        components: [
          {
            name: 'proof',
            type: 'tuple',
            components: [g1('a'), { name: 'b', type: 'tuple', components: [{ name: 'x', type: 'uint256[2]' }, { name: 'y', type: 'uint256[2]' }] }, g1('c')],
          },
          { name: 'merkleRoot', type: 'bytes32' },
          { name: 'nullifiers', type: 'bytes32[]' },
          { name: 'commitments', type: 'bytes32[]' },
          {
            name: 'boundParams',
            type: 'tuple',
            components: [
              { name: 'treeNumber', type: 'uint16' },
              { name: 'minGasPrice', type: 'uint72' },
              { name: 'unshield', type: 'uint8' },
              { name: 'chainID', type: 'uint64' },
              { name: 'adaptContract', type: 'address' },
              { name: 'adaptParams', type: 'bytes32' },
              {
                name: 'commitmentCiphertext',
                type: 'tuple[]',
                components: [
                  { name: 'ciphertext', type: 'bytes32[4]' },
                  { name: 'blindedSenderViewingKey', type: 'bytes32' },
                  { name: 'blindedReceiverViewingKey', type: 'bytes32' },
                  { name: 'annotationData', type: 'bytes' },
                  { name: 'memo', type: 'bytes' },
                ],
              },
            ],
          },
          commitmentPreimage('unshieldPreimage'),
        ],
      },
    ],
    outputs: [],
  },
  { type: 'function', name: 'shieldFee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint120' }] },
  { type: 'function', name: 'unshieldFee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint120' }] },
  {
    type: 'event',
    name: 'Shield',
    inputs: [
      { name: 'treeNumber', type: 'uint256', indexed: false },
      { name: 'startPosition', type: 'uint256', indexed: false },
      { name: 'commitments', type: 'tuple[]', components: [{ name: 'npk', type: 'bytes32' }, tokenData, { name: 'value', type: 'uint120' }], indexed: false },
      { name: 'shieldCiphertext', type: 'tuple[]', components: [{ name: 'encryptedBundle', type: 'bytes32[3]' }, { name: 'shieldKey', type: 'bytes32' }], indexed: false },
      { name: 'fees', type: 'uint256[]', indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const erc20Abi = parseAbi(['function approve(address spender, uint256 value) returns (bool)']);

/** `UnshieldType` of `Globals.sol`. */
export const UNSHIELD_NONE = 0;
/** `TokenType.ERC20`. */
export const TOKEN_ERC20 = 0;
/** `SNARK_SCALAR_FIELD` of `Globals.sol`. */
export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
/** 2^120 - 1: note values are `uint120`. */
export const MAX_UINT120 = (1n << 120n) - 1n;
