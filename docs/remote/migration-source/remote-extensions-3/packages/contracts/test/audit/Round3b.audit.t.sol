// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {PolicyBase} from "../PolicyBase.t.sol";
import {PolicyAccount} from "../../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../../src/PolicyAccountFactory.sol";
import {IPolicyAccount} from "../../src/interfaces/IPolicyAccount.sol";
import {BlacklistToken} from "../mocks/BlacklistToken.sol";
import {FeeOnTransferToken} from "../mocks/FeeOnTransferToken.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Fee token whose `balanceOf` can be switched to revert (a token upgraded or broken by its issuer).
contract BrokenViewToken is MockERC20 {
    bool public broken;

    constructor() MockERC20("Broken", "BRK", 6) {}

    function setBroken(bool b) external {
        broken = b;
    }

    function balanceOf(address a) public view override returns (uint256) {
        require(!broken, "broken");
        return super.balanceOf(a);
    }
}

/// @notice Reproductions for docs/remote/fixes-round3b-contracts.md (round-1 claims, re-checked).
contract Round3bAuditTest is PolicyBase {
    // ------------------------------------------------------------------ item 1: policyHash dictionary

    /// @dev Item 1 (round audit C-01): with `limitsRoot == 0` the meta-address `policyHash` is an unsalted
    /// commitment. A candidate destination list times the factory's delay range recovers the destination.
    function test_item1_policyHashDictionary_limitsRootZero_recoversDestination() public view {
        address secretDest = address(uint160(0xC01D + 37));
        uint256 secretDelay = 7 days + 3 hours;
        bytes32 observed = factory.policyHashOf(secretDest, secretDelay, bytes32(0));

        address found;
        uint256 foundDelay;
        uint256 tries;
        // 64 candidate destinations x every whole hour from 1 h to 30 d (720 values).
        for (uint160 c = 0; c < 64 && found == address(0); c++) {
            address cand = address(uint160(0xC01D) + c);
            for (uint256 d = 1 hours; d <= 30 days; d += 1 hours) {
                tries++;
                if (keccak256(abi.encode(cand, d, bytes32(0))) == observed) {
                    (found, foundDelay) = (cand, d);
                    break;
                }
            }
        }
        assertEq(found, secretDest, "destination recovered");
        assertEq(foundDelay, secretDelay);
        assertLt(tries, 64 * 720 + 1);
    }

    /// @dev Item 1: the deploy calldata carries the full pre-image, and the account's public getters
    /// repeat it, so after the first deployment the policyHash hides nothing.
    function test_item1_deployCalldataAndGettersPublishPreimage() public view {
        bytes memory cd = abi.encodeCall(factory.deploy, (owner, destination, DELAY, root));
        (address o, address d, uint256 dl, bytes32 r) =
            abi.decode(_slice4(cd), (address, address, uint256, bytes32));
        assertEq(keccak256(abi.encode(d, dl, r)), acct.policyHash());
        assertEq(o, acct.owner());
        assertEq(acct.destination(), destination);
    }

    /// @dev Item 1, workaround that needs no contract change: a limits tree with a secret random
    /// "blinding" leaf (a token address nobody holds) makes `limitsRoot` high entropy, so the
    /// dictionary over `(destination, delay, root)` fails even with the public leaves known, while
    /// withdrawals through an unlimited leaf still work. Cost: every token needs a leaf (P1).
    function test_item1_blindingLeafWorkaround_defeatsDictionary_andStillWithdraws() public {
        bytes32 tokenLeaf = _leaf(address(token), type(uint256).max, 0);
        address blindTok = address(uint160(uint256(keccak256("owner-secret-blinding-salt"))));
        bytes32 blindLeaf = _leaf(blindTok, 0, 1);
        bytes32 blindedRoot = _hashPair(tokenLeaf, blindLeaf);
        bytes32 observed = factory.policyHashOf(newDest, DELAY, blindedRoot);

        // Attacker knows the public leaf set (token unlimited) but not the blinding leaf.
        bytes32[2] memory guesses = [bytes32(0), tokenLeaf];
        for (uint256 g; g < guesses.length; g++) {
            for (uint256 d = 1 hours; d <= 30 days; d += 1 hours) {
                assertTrue(keccak256(abi.encode(newDest, d, guesses[g])) != observed);
            }
        }

        PolicyAccount b = _deploy(owner, newDest, DELAY, blindedRoot);
        token.mint(address(b), 50e6);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = blindLeaf;
        IPolicyAccount.LimitProof memory lp =
            IPolicyAccount.LimitProof({limit: type(uint256).max, windowSeconds: 0, proof: proof});
        IPolicyAccount.Withdraw memory w = _wFor(address(token), 50e6, 1, lp);
        bytes32 id = b.requestWithdraw(w, lp, _sigW(ownerPk, address(b), w));
        vm.warp(vm.getBlockTimestamp() + DELAY);
        b.executeWithdraw(id);
        assertEq(token.balanceOf(newDest), 50e6);
    }

    // ------------------------------------------------------------------ item 3: fee-token failure

    /// @dev Item 3 (C-04): already fixed by `FeeWaived`; see also
    /// `test_feeTokenBlacklistNoLongerFreezesCounterfactualAccounts`. Native funds at the counterfactual
    /// address become reachable although the fee recipient is blacklisted.
    function test_item3_blacklistedRecipient_nativeFundsReachable() public {
        BlacklistToken usdc = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(usdc), FLAT_FEE, feeRecipient);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, bytes32(0)));
        vm.deal(predicted, 5 ether);
        usdc.mint(payer, FLAT_FEE);
        vm.prank(payer);
        usdc.approve(address(f), FLAT_FEE);
        usdc.setBlacklisted(feeRecipient, true);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, bytes32(0));
        assertGt(predicted.code.length, 0);
        assertEq(predicted.balance, 5 ether);
    }

    /// @dev Item 3 accepted edge (R11): a caller the fee token itself blacklists, with balance and
    /// allowance, deploys fee-free.
    function test_item3_blacklistedCaller_getsWaiver() public {
        BlacklistToken usdc = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(usdc), FLAT_FEE, feeRecipient);
        usdc.mint(payer, FLAT_FEE);
        vm.prank(payer);
        usdc.approve(address(f), FLAT_FEE);
        usdc.setBlacklisted(payer, true);
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, bytes32(0));
        assertEq(usdc.balanceOf(feeRecipient), 0);
    }

    /// @dev Item 3 residual: the waiver cannot help when the fee token's views revert or the token
    /// turned fee-on-transfer. Counterfactual funds stay frozen until the token is fixed. (Only an
    /// operator-chosen FEE_TOKEN can do this; documented, not fixable without trusting the token.)
    function test_item3_residual_brokenFeeTokenViews_freezeCounterfactual() public {
        BrokenViewToken t = new BrokenViewToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(t), FLAT_FEE, feeRecipient);
        address predicted = f.predictAddress(owner, f.policyHashOf(newDest, DELAY, bytes32(0)));
        vm.deal(predicted, 1 ether);
        t.mint(payer, FLAT_FEE);
        vm.prank(payer);
        t.approve(address(f), FLAT_FEE);
        t.setBroken(true);
        vm.prank(payer);
        vm.expectRevert();
        f.deploy(owner, newDest, DELAY, bytes32(0));
        assertEq(predicted.code.length, 0);
        t.setBroken(false); // issuer repairs the token: funds become reachable again
        vm.prank(payer);
        f.deploy(owner, newDest, DELAY, bytes32(0));
        assertGt(predicted.code.length, 0);
    }

    function test_item3_residual_feeOnTransferFeeToken_reverts() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(t), FLAT_FEE, feeRecipient);
        t.mint(payer, FLAT_FEE);
        vm.prank(payer);
        t.approve(address(f), FLAT_FEE);
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        f.deploy(owner, newDest, DELAY, bytes32(0));
    }

    // ------------------------------------------------------------------ item 6: uint64 timestamps

    /// @dev Item 6 (stress F-3): near `2^64` the timelock timestamps used to wrap (timelock bypass);
    /// they now revert via SafeCast.
    function test_item6_timestampNearUint64Max_revertsInsteadOfWrapping() public {
        uint256 t = uint256(type(uint64).max) - 10;
        vm.warp(t);
        IPolicyAccount.Withdraw memory w = _wFor(address(tokenU), 1, 1, _lp(2));
        w.deadline = type(uint256).max;
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.expectRevert(
            abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, 64, t + DELAY)
        );
        acct.requestWithdraw(w, _lp(2), sig);

        bytes memory psig = _sigPropose(ownerPk, address(acct), newDest, type(uint256).max, 2);
        vm.expectRevert(
            abi.encodeWithSelector(
                SafeCast.SafeCastOverflowedUintDowncast.selector, 64, t + 2 * DELAY
            )
        );
        acct.proposeDestination(newDest, type(uint256).max, 2, psig);
    }

    function _slice4(bytes memory b) internal pure returns (bytes memory out) {
        out = new bytes(b.length - 4);
        for (uint256 i; i < out.length; i++) {
            out[i] = b[i + 4];
        }
    }
}
