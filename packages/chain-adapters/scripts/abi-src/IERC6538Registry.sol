// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.0;

// ERC-6538 stealth meta-address registry interface, copied from the CC0 reference implementation
// (ERC-6538 / ScopeLift stealth-address-erc-contracts, src/interfaces/IERC6538Registry.sol, pragma relaxed).
// Used only to generate the ABI in src/abi/erc6538Registry.ts.
interface IERC6538Registry {
    error ERC6538Registry__InvalidSignature();

    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external;

    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes memory signature,
        bytes calldata stealthMetaAddress
    ) external;

    function incrementNonce() external;

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory);

    function ERC6538REGISTRY_ENTRY_TYPE_HASH() external view returns (bytes32);

    function nonceOf(address registrant) external view returns (uint256);
}
