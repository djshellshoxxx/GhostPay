// HAND-WRITTEN from the ERC-6538 text (https://eips.ethereum.org/EIPS/eip-6538), NOT generated from compiled
// reference code (no reference source is vendored in this repository). Verify selectors against the deployed
// registry before enabling a chain. See DEVIATIONS.md.
export const erc6538RegistryAbi = [
  {
    type: 'function',
    name: 'registerKeys',
    inputs: [
      { name: 'schemeId', type: 'uint256', internalType: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerKeysOnBehalf',
    inputs: [
      { name: 'registrant', type: 'address', internalType: 'address' },
      { name: 'schemeId', type: 'uint256', internalType: 'uint256' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
      { name: 'stealthMetaAddress', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'incrementNonce',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stealthMetaAddressOf',
    inputs: [
      { name: 'registrant', type: 'address', internalType: 'address' },
      { name: 'schemeId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonceOf',
    inputs: [{ name: 'registrant', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'StealthMetaAddressSet',
    inputs: [
      { name: 'registrant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'scheme', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes', indexed: false, internalType: 'bytes' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'NonceIncremented',
    inputs: [
      { name: 'registrant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'newNonce', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;
