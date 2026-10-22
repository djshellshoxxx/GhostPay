// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice Minimal ERC-1271 smart wallet with one signer (tests only).
contract Wallet1271 is IERC1271 {
    address public immutable SIGNER;

    constructor(address signer) {
        SIGNER = signer;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (address s, ECDSA.RecoverError e,) = ECDSA.tryRecover(hash, sig);
        return (e == ECDSA.RecoverError.NoError && s == SIGNER)
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    function approveToken(address token, address spender, uint256 amount) external {
        (bool ok,) =
            token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        require(ok);
    }
}
