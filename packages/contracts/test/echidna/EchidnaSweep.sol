// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {GhostPaySweepRelayer} from "../../src/GhostPaySweepRelayer.sol";
import {IGhostPaySweepRelayer} from "../../src/interfaces/IGhostPaySweepRelayer.sol";
import {PermitToken} from "../mocks/PermitToken.sol";

interface Hevm {
    function sign(uint256 sk, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 sk) external returns (address);
}

/// @notice Echidna harness for GhostPaySweepRelayer. The harness signs sweep orders on behalf of a
/// fixed stealth owner key (hevm.sign) and submits them as an arbitrary relayer.
/// `echidna_canary_*` are EXPECTED TO FAIL (they prove the success paths are reached).
contract EchidnaSweep {
    Hevm internal constant HEVM = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 internal constant OWNER_PK = 0xA11CE5EC12E7;
    bytes32 internal constant TYPEHASH = keccak256(
        "Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)"
    );
    uint256 internal constant MINTED = 1e30;

    GhostPaySweepRelayer internal relayer;
    PermitToken internal token;
    address internal owner;
    address internal constant D0 = address(0xB0001);
    address internal constant D1 = address(0xB0002);
    address internal constant F0 = address(0xC0001);
    address internal constant F1 = address(0xC0002);

    // nonce => number of successful sweeps using it
    mapping(uint256 => uint256) internal successes;
    uint256[] internal usedNonces;
    // last successful order, kept for replay attempts
    IGhostPaySweepRelayer.Sweep internal lastS;
    bytes internal lastSig;
    bool internal haveLast;
    bool internal replaySucceeded;
    bool internal doubleSpend;
    uint256 internal okSweeps;
    uint256 internal okReplayBlocked;

    constructor() payable {
        relayer = new GhostPaySweepRelayer();
        token = new PermitToken(6);
        owner = HEVM.addr(OWNER_PK);
        token.mint(owner, MINTED);
        // The owner pre-approves the relayer (plain `sweep` path). `sweepWithPermit` is covered by unit tests.
    }

    function approveRelayer() external {
        // simulate owner approval
        // (cannot prank without hevm.prank; use permit signature path instead)
        _permitApprove();
    }

    function _permitApprove() internal {
        uint256 dl = block.timestamp + 365 days;
        bytes32 sh = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                address(relayer),
                type(uint256).max,
                token.nonces(owner),
                dl
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            HEVM.sign(OWNER_PK, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), sh)));
        token.permit(owner, address(relayer), type(uint256).max, dl, v, r, s);
    }

    function _nonce(uint8 n) internal pure returns (uint256) {
        // small colliding set spanning several bitmap words and the uint256 extremes
        uint256[8] memory t = [uint256(0), 1, 2, 255, 256, 257, 2 ** 255, type(uint256).max];
        return t[n % 8];
    }

    function _digest(IGhostPaySweepRelayer.Sweep memory s) internal view returns (bytes32) {
        bytes32 sh = keccak256(
            abi.encode(
                TYPEHASH, s.token, s.owner, s.destination, s.feeTo, s.amount, s.fee, s.deadline, s.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", relayer.DOMAIN_SEPARATOR(), sh));
    }

    function sweep(uint8 nonceIdx, uint256 amount, uint256 fee, uint8 route) external {
        amount = 1 + (amount % 1e12);
        fee = fee % (amount + 1);
        IGhostPaySweepRelayer.Sweep memory s = IGhostPaySweepRelayer.Sweep({
            token: address(token),
            owner: owner,
            destination: route & 1 == 0 ? D0 : D1,
            feeTo: route & 2 == 0 ? F0 : F1,
            amount: amount,
            fee: fee,
            deadline: block.timestamp + 1 hours,
            nonce: _nonce(nonceIdx)
        });
        (uint8 v, bytes32 r, bytes32 sg) = HEVM.sign(OWNER_PK, _digest(s));
        bytes memory sig = abi.encodePacked(r, sg, v);
        if (token.allowance(owner, address(relayer)) < amount) _permitApprove();
        try relayer.sweep(s, sig) {
            okSweeps++;
            if (successes[s.nonce]++ != 0) doubleSpend = true;
            else usedNonces.push(s.nonce);
            lastS = s;
            lastSig = sig;
            haveLast = true;
        } catch {}
    }

    /// @dev Resubmit the last successful (still unexpired or expired) order, optionally via a different
    /// relayer path, and also a variant with the same nonce but different parameters (re-signed).
    function replayLast() external {
        if (!haveLast) return;
        try relayer.sweep(lastS, lastSig) {
            replaySucceeded = true;
        } catch {
            okReplayBlocked++;
        }
    }

    function reuseNonceNewParams(uint8 which, uint256 amount) external {
        if (usedNonces.length == 0) return;
        uint256 n = usedNonces[which % usedNonces.length];
        amount = 1 + (amount % 1e12);
        IGhostPaySweepRelayer.Sweep memory s = IGhostPaySweepRelayer.Sweep({
            token: address(token),
            owner: owner,
            destination: D1,
            feeTo: F1,
            amount: amount,
            fee: 0,
            deadline: block.timestamp + 1 hours,
            nonce: n
        });
        (uint8 v, bytes32 r, bytes32 sg) = HEVM.sign(OWNER_PK, _digest(s));
        try relayer.sweep(s, abi.encodePacked(r, sg, v)) {
            replaySucceeded = true;
        } catch {}
    }

    // ---------------- properties ----------------

    function echidna_sweep_nonce_single_use() external view returns (bool) {
        return !replaySucceeded && !doubleSpend;
    }

    /// @dev every nonce that succeeded is marked used on-chain, and exactly once
    function echidna_used_nonces_marked() external view returns (bool) {
        for (uint256 i = 0; i < usedNonces.length; i++) {
            if (!relayer.nonceUsed(owner, usedNonces[i])) return false;
            if (successes[usedNonces[i]] != 1) return false;
        }
        return true;
    }

    function echidna_relayer_never_holds_tokens() external view returns (bool) {
        return token.balanceOf(address(relayer)) == 0 && address(relayer).balance == 0;
    }

    /// @dev fee+net == amount: all minted funds are in owner/dest/fee sinks, nothing created/lost
    function echidna_token_conservation() external view returns (bool) {
        return token.balanceOf(owner) + token.balanceOf(D0) + token.balanceOf(D1)
            + token.balanceOf(F0) + token.balanceOf(F1) == MINTED;
    }

    // canaries: EXPECTED TO FAIL
    function echidna_canary_sweep_success() external view returns (bool) {
        return okSweeps < 5;
    }

    function echidna_canary_replay_blocked() external view returns (bool) {
        return okReplayBlocked < 3;
    }
}
