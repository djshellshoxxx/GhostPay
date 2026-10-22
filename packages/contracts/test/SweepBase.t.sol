// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {PermitToken} from "./mocks/PermitToken.sol";

/// @notice Shared fixture and EIP-712 signing helpers for the sweep relayer tests.
abstract contract SweepBase is Test {
    GhostPaySweepRelayer internal relayer;
    PermitToken internal token;

    uint256 internal ownerPk;
    address internal owner;
    address internal destination = makeAddr("destination");
    address internal feeTo = makeAddr("relayerFeeTo");
    address internal submitter = makeAddr("submitter");

    uint256 internal constant AMOUNT = 1000e6;
    uint256 internal constant FEE = 5e6;

    bytes32 internal constant TYPEHASH = keccak256(
        "Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)"
    );
    // secp256k1 group order
    uint256 internal constant N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        relayer = new GhostPaySweepRelayer();
        token = new PermitToken(6);
        (owner, ownerPk) = makeAddrAndKey("stealthOwner");
        token.mint(owner, 10_000e6);
    }

    function _sweep(uint256 nonce) internal view returns (IGhostPaySweepRelayer.Sweep memory s) {
        s = IGhostPaySweepRelayer.Sweep({
            token: address(token),
            owner: owner,
            destination: destination,
            feeTo: feeTo,
            amount: AMOUNT,
            fee: FEE,
            deadline: block.timestamp + 1 hours,
            nonce: nonce
        });
    }

    function _digest(IGhostPaySweepRelayer.Sweep memory s) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                s.token,
                s.owner,
                s.destination,
                s.feeTo,
                s.amount,
                s.fee,
                s.deadline,
                s.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", relayer.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 pk, IGhostPaySweepRelayer.Sweep memory s)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(pk, _digest(s));
        return abi.encodePacked(r, sg, v);
    }

    function _permit(PermitToken t, uint256 pk, address who, uint256 value, uint256 dl)
        internal
        view
        returns (IGhostPaySweepRelayer.PermitSig memory p)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                who,
                address(relayer),
                value,
                t.nonces(who),
                dl
            )
        );
        (uint8 v, bytes32 r, bytes32 sg) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", t.DOMAIN_SEPARATOR(), structHash)));
        p = IGhostPaySweepRelayer.PermitSig({value: value, deadline: dl, v: v, r: r, s: sg});
    }

    function _approveRelayer(address t, uint256 amount) internal {
        vm.prank(owner);
        (bool ok,) =
            t.call(abi.encodeWithSignature("approve(address,uint256)", address(relayer), amount));
        require(ok, "approve");
    }
}
