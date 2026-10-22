// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ChainGuard} from "./ChainGuard.sol";
import {GhostPayPayerAccount} from "./GhostPayPayerAccount.sol";

/// @title GhostPayPayerAccountFactory
/// @author GhostPay
/// @notice Deterministic (CREATE2) factory for {GhostPayPayerAccount}, used through ERC-4337 `initCode`.
/// @dev The salt is `keccak256(abi.encode(owner, saltNonce))` and the init code embeds the EntryPoint
/// and the owner, so an account address is bound to its owner: nobody else can deploy a different
/// account at that address. {createAccount} is idempotent (returns an existing account). No owner,
/// no upgrade path, no state. Deviation from the spec text: accounts are full CREATE2 deployments
/// (owner as constructor argument) instead of EIP-1167 clones, which removes the initializer.
contract GhostPayPayerAccountFactory is ChainGuard {
    /// @notice The ERC-4337 v0.7 EntryPoint every account trusts.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable ENTRY_POINT;

    /// @notice Emitted when a new account is deployed. The owner is public in the account anyway.
    /// @param account The new account.
    event AccountCreated(address indexed account);

    /// @notice The EntryPoint is the zero address or has no code.
    error ZeroAddress();

    /// @param entryPoint The ERC-4337 v0.7 EntryPoint.
    constructor(address entryPoint) ChainGuard() {
        if (entryPoint == address(0) || entryPoint.code.length == 0) revert ZeroAddress();
        ENTRY_POINT = entryPoint;
    }

    /// @notice Deploy the account for `owner` and `saltNonce`, or return it if it already exists.
    /// @param owner The account's signing key.
    /// @param saltNonce Caller-chosen salt (one fresh payer per payment uses a fresh value or key).
    /// @return account The account address (same as {getAddress}).
    function createAccount(address owner, uint256 saltNonce)
        external
        returns (GhostPayPayerAccount account)
    {
        address predicted = getAddress(owner, saltNonce);
        if (predicted.code.length != 0) return GhostPayPayerAccount(payable(predicted));
        account = new GhostPayPayerAccount{salt: _salt(owner, saltNonce)}(ENTRY_POINT, owner);
        // Deployment above is a CREATE2 of known code; the factory has no reentrant surface.
        // forge-lint: disable-next-line(reentrancy-events)
        emit AccountCreated(address(account));
    }

    /// @notice Counterfactual address of the account for `owner` and `saltNonce`.
    /// @param owner The account's signing key.
    /// @param saltNonce The salt nonce.
    /// @return The address `createAccount` deploys to.
    function getAddress(address owner, uint256 saltNonce) public view returns (address) {
        bytes32 initCodeHash = keccak256(
            bytes.concat(type(GhostPayPayerAccount).creationCode, abi.encode(ENTRY_POINT, owner))
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), _salt(owner, saltNonce), initCodeHash
                        )
                    )
                )
            )
        );
    }

    function _salt(address owner, uint256 saltNonce) private pure returns (bytes32) {
        return keccak256(abi.encode(owner, saltNonce));
    }
}
