// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {PolicyBase} from "../PolicyBase.t.sol";
import {PolicyAccount} from "../../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../../src/PolicyAccountFactory.sol";
import {IPolicyAccount} from "../../src/interfaces/IPolicyAccount.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ReentrantReceiver} from "../mocks/NativeReceivers.sol";
import {BombReceiver} from "./Router.audit.t.sol";
import {BlacklistToken} from "../mocks/BlacklistToken.sol";

/// @dev stETH-like token: every transfer moves 1 wei less than requested (share rounding).
contract RoundingToken is ERC20 {
    constructor() ERC20("Rounding", "RND") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 v) internal override {
        if (from != address(0) && to != address(0) && v > 0) {
            super._update(from, address(0), 1);
            v -= 1;
        }
        super._update(from, to, v);
    }
}

/// @dev Legacy-style sender using transfer() (2300 gas stipend).
contract StipendSender {
    function send2300(address payable to) external payable {
        to.transfer(msg.value);
    }
}

/// @dev Forces ETH into a target via selfdestruct.
contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev A foreign deployer that clones the real implementation (a competing "factory").
contract RogueFactory {
    function deploy(address impl, bytes32 salt) external returns (address) {
        return Clones.cloneDeterministic(impl, salt);
    }

    function init(address acct, address o, address d, uint256 delay, bytes32 root) external {
        PolicyAccount(payable(acct)).initialize(o, d, delay, root);
    }
}

/// @notice Adversarial tests for PolicyAccount / PolicyAccountFactory.
contract PolicyAuditTest is PolicyBase {
    // ---------------------------------------------------------------- P-01 duplicate-leaf permissiveness

    /// @dev L-04 regression. Tree that (against the documented rule) holds two leaves for one token. The
    /// owner signs the strict leaf; a submitter can no longer substitute the permissive proof, and the strict
    /// leaf still enforces the cap. (Before the fix 500e6 left the account although the cap shown was 100e6.)
    function test_duplicateLeafSubmitterCannotPickPermissiveLimit() public {
        MockERC20 t = new MockERC20("T", "T", 6);
        bytes32 strict = _leaf(address(t), 100e6, 1 days);
        bytes32 loose = _leaf(address(t), 900_000e6, 1 days);
        bytes32 r = _hashPair(strict, loose);
        (address o2, uint256 pk2) = makeAddrAndKey("owner2");
        PolicyAccount a = _deploy(o2, destination, 1 days, r);
        t.mint(address(a), 1_000_000e6);

        // Owner signs Withdraw(500e6) bound to the strict leaf.
        IPolicyAccount.Withdraw memory w = _w(address(t), 500e6, 1);
        w.limitLeafHash = strict;
        bytes memory sig = _sigW(pk2, address(a), w);

        // Substituting the permissive leaf (valid in the tree) reverts.
        bytes32[] memory proofLoose = new bytes32[](1);
        proofLoose[0] = strict;
        IPolicyAccount.LimitProof memory lpLoose =
            IPolicyAccount.LimitProof({limit: 900_000e6, windowSeconds: 1 days, proof: proofLoose});
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.LimitLeafMismatch.selector);
        a.requestWithdraw(w, lpLoose, sig);

        // The honest strict proof is the only accepted one, and it enforces the cap.
        bytes32[] memory proofStrict = new bytes32[](1);
        proofStrict[0] = loose;
        IPolicyAccount.LimitProof memory lpStrict =
            IPolicyAccount.LimitProof({limit: 100e6, windowSeconds: 1 days, proof: proofStrict});
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.AmountExceedsLimit.selector);
        a.requestWithdraw(w, lpStrict, sig);
        assertEq(t.balanceOf(destination), 0);
    }

    // ---------------------------------------------------------------- P-02 stuck funds

    /// @dev Rebasing / lossy token held by an account can never be withdrawn; no rescue path exists.
    function test_EXPLOIT_lossyTokenPermanentlyStuck() public {
        RoundingToken rnd = new RoundingToken();
        (address o2, uint256 pk2) = makeAddrAndKey("owner3");
        PolicyAccount a = _deploy(o2, destination, 1 days, bytes32(0)); // no limits: all tokens allowed
        rnd.mint(address(a), 1000e6);
        IPolicyAccount.Withdraw memory w = _w(address(rnd), 1000e6, 1);
        bytes memory sig = _sigW(pk2, address(a), w);
        vm.prank(relayer);
        bytes32 id = a.requestWithdraw(w, _emptyLp(), sig);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(IPolicyAccount.UnexpectedBalanceDelta.selector);
        a.executeWithdraw(id);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(IPolicyAccount.UnexpectedBalanceDelta.selector);
        a.executeWithdraw(id);
        assertEq(rnd.balanceOf(address(a)), 1000e6);
    }

    /// @dev With a non-zero limitsRoot a token without leaf (e.g. an airdrop) can never leave.
    function test_EXPLOIT_tokenWithoutLeafStuckForever() public {
        MockERC20 airdrop = new MockERC20("Air", "AIR", 18);
        airdrop.mint(address(acct), 1e18);
        IPolicyAccount.LimitProof memory lp = _lp(2); // wrong leaf (other token)
        IPolicyAccount.Withdraw memory w = _wFor(address(airdrop), 1e18, 50, lp);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    /// @dev NFTs/ERC-721 safeTransfer are rejected (no receiver hook) and any NFT sent with transferFrom is stuck.
    function test_noErc721ReceiverHook() public {
        (bool ok,) = address(acct)
            .call(
                abi.encodeWithSignature(
                    "onERC721Received(address,address,uint256,bytes)", address(0), address(0), 1, ""
                )
            );
        assertFalse(ok);
    }

    // ---------------------------------------------------------------- P-03 2300-gas sends

    function test_EXPLOIT_stipendTransferToClonefails() public {
        StipendSender s = new StipendSender();
        vm.deal(address(s), 1 ether);
        // plain EOA-like contract receives fine
        vm.cool(address(impl));
        vm.cool(address(acct));
        vm.expectRevert();
        s.send2300{value: 1 wei}(payable(address(acct)));
    }

    // ---------------------------------------------------------------- P-04 forced ETH

    function test_forcedEth_doesNotBreakAccounting() public {
        uint256 before = address(acct).balance;
        new ForceSender{value: 1 ether}(payable(address(acct)));
        assertEq(address(acct).balance, before + 1 ether);
        // Normal native withdraw still works and the window accounting is unaffected.
        _withdraw(address(0), 1 ether, 1, 1);
        (,, uint256 cur,) = acct.windowState(address(0));
        assertEq(cur, 1 ether);
    }

    // ---------------------------------------------------------------- P-05 native withdraw reentrancy

    function test_nativeWithdrawReentrancy_blocked() public {
        ReentrantReceiver rr = new ReentrantReceiver();
        (address o2, uint256 pk2) = makeAddrAndKey("owner4");
        PolicyAccount a = _deploy(o2, address(rr), 1 days, bytes32(0));
        vm.deal(address(a), 10 ether);
        IPolicyAccount.Withdraw memory w1 = _w(address(0), 1 ether, 1);
        IPolicyAccount.Withdraw memory w2 = _w(address(0), 1 ether, 2);
        vm.startPrank(relayer);
        bytes32 id1 = a.requestWithdraw(w1, _emptyLp(), _sigW(pk2, address(a), w1));
        bytes32 id2 = a.requestWithdraw(w2, _emptyLp(), _sigW(pk2, address(a), w2));
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days);
        // During the payout the destination tries to execute the second request.
        rr.arm(address(a), abi.encodeCall(IPolicyAccount.executeWithdraw, (id2)), 0, false);
        a.executeWithdraw(id1);
        assertFalse(rr.lastSuccess(), "reentrant executeWithdraw blocked by guard");
        assertEq(address(rr).balance, 1 ether);
    }

    // ---------------------------------------------------------------- P-06 init / clone safety

    function test_implementationLockedAndUnusable() public {
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        impl.initialize(owner, destination, 1 days, bytes32(0));
        // Garbage signature never recovers owner==0 on the implementation (OZ reverts on address(0)).
        IPolicyAccount.Withdraw memory w = _w(address(0), 1, 1);
        vm.expectRevert();
        impl.requestWithdraw(w, _emptyLp(), abi.encodePacked(bytes32(0), bytes32(0), uint8(27)));
    }

    function test_reinitAndForeignInitializeRejected() public {
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        acct.initialize(owner, destination, DELAY, root);
        // A rogue deployer cloning the same implementation gets a *different* address and cannot affect ours.
        RogueFactory rf = new RogueFactory();
        bytes32 salt = keccak256(abi.encode(owner, keccak256(abi.encode(destination, DELAY, root))));
        address rogue = rf.deploy(address(impl), salt);
        assertTrue(rogue != address(acct));
        // Only the rogue factory with the exact args can init the rogue clone; anyone else cannot.
        vm.expectRevert(IPolicyAccount.UnauthorizedInitializer.selector);
        PolicyAccount(payable(rogue)).initialize(owner, destination, DELAY, root);
        // Attacker picks other args with the same rogue clone: also fails.
        vm.prank(address(rf));
        vm.expectRevert(IPolicyAccount.UnauthorizedInitializer.selector);
        PolicyAccount(payable(rogue)).initialize(makeAddr("evil"), destination, DELAY, root);
        rf.init(rogue, owner, destination, DELAY, root); // legit for the rogue's own account
        assertEq(PolicyAccount(payable(rogue)).owner(), owner);
        // Domain separators differ: signatures are not transferable between the two clones.
        assertTrue(PolicyAccount(payable(rogue)).DOMAIN_SEPARATOR() != acct.DOMAIN_SEPARATOR());
    }

    /// @dev A different policy always yields a different address (no squatting with a weaker policy).
    function test_squatting_differentPolicyDifferentAddress() public {
        address a1 = factory.predictAddress(owner, factory.policyHashOf(destination, DELAY, root));
        address a2 =
            factory.predictAddress(owner, factory.policyHashOf(makeAddr("thief"), DELAY, root));
        address a3 =
            factory.predictAddress(owner, factory.policyHashOf(destination, DELAY, bytes32(0)));
        address a4 =
            factory.predictAddress(owner, factory.policyHashOf(destination, DELAY + 1, root));
        assertTrue(a1 != a2 && a1 != a3 && a1 != a4);
        assertEq(a1, address(acct));
        // Same-policy re-deployment by a stranger is impossible (already deployed) and would not change the policy.
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyAccountFactory.AlreadyDeployed.selector, address(acct))
        );
        factory.deploy(owner, destination, DELAY, root);
    }

    function test_feeRecipientCannotDeploy_selfTransferDelta() public {
        feeToken.mint(feeRecipient, 100e6);
        vm.startPrank(feeRecipient);
        feeToken.approve(address(factory), type(uint256).max);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        factory.deploy(makeAddr("o9"), destination, DELAY, root);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- P-07 stolen key / timelock

    /// @dev A thief with the owner key cannot redirect before 2*delay; pending withdrawals pay the OLD
    /// destination before the change takes effect; the honest owner (same key) can cancel; thief re-proposes.
    function test_stolenKey_destinationChangeNeedsTwoDelays_andIsCancellable() public {
        bytes32 pid = _propose(newDest, 1);
        // thief also queues a withdrawal right away
        bytes32 wid = _request(acct, address(tokenU), 100e6, 2, 2);
        vm.warp(block.timestamp + DELAY);
        acct.executeWithdraw(wid);
        assertEq(tokenU.balanceOf(destination), 100e6, "paid to old destination");
        vm.expectRevert();
        acct.executeDestinationChange(); // 2*delay not elapsed
        // honest owner cancels one second before the timelock ends
        vm.warp(block.timestamp + DELAY - 1);
        bytes memory csig = _sigCancelDest(ownerPk, address(acct), pid);
        acct.cancelDestination(pid, csig);
        vm.expectRevert(IPolicyAccount.NoProposal.selector);
        acct.executeDestinationChange();
        // thief can re-propose immediately (unbounded struggle, documented)
        _propose(newDest, 3);
        assertEq(acct.pendingDestination(), newDest);
    }

    /// @dev A destination change invalidates pending withdrawals until cancelled and re-signed.
    function test_pendingWithdrawCannotFollowDestinationChange() public {
        bytes32 wid = _request(acct, address(tokenU), 100e6, 1, 2);
        _propose(newDest, 3);
        vm.warp(block.timestamp + 2 * DELAY); // both mature; destination change executes first
        acct.executeDestinationChange();
        vm.expectRevert(
            abi.encodeWithSelector(
                IPolicyAccount.DestinationChangedSinceRequest.selector, destination, newDest
            )
        );
        acct.executeWithdraw(wid);
        assertEq(tokenU.balanceOf(newDest), 0);
        assertEq(tokenU.balanceOf(destination), 0);
        bytes memory cancelSig = _sigCancel(ownerPk, address(acct), wid);
        acct.cancel(wid, cancelSig);
        bytes32 replacement = _request(acct, address(tokenU), 100e6, 4, 2);
        vm.warp(block.timestamp + DELAY);
        acct.executeWithdraw(replacement);
        assertEq(tokenU.balanceOf(newDest), 100e6);
        assertEq(tokenU.balanceOf(destination), 0);
    }

    // ---------------------------------------------------------------- P-08 windows

    /// @dev Worst case of the two-bucket scheme: spend the whole cap at the end of a bucket and the next
    /// spend is blocked for up to two windows; and the cap is never exceeded over any W interval.
    function test_windowBoundary_lockoutUpToTwoWindows() public {
        uint256 W = WINDOW;
        uint256 endOfBucket = (((block.timestamp + DELAY) / W) + 1) * W - 1;
        // schedule: request now, execute at endOfBucket
        bytes32 id1 = _request(acct, address(token), LIMIT, 1, 0);
        bytes32 id2 = _request(acct, address(token), 1, 2, 0);
        vm.warp(endOfBucket);
        acct.executeWithdraw(id1);
        vm.warp(endOfBucket + 1); // next bucket, previous bucket full
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        acct.executeWithdraw(id2);
        vm.warp(endOfBucket + W - 1); // still in the next bucket
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        acct.executeWithdraw(id2);
        vm.warp(endOfBucket + W + 1); // bucket +2: allowed again (> W after the first spend)
        acct.executeWithdraw(id2);
    }

    function test_nonceMaxUint_policy() public {
        IPolicyAccount.Withdraw memory w = _w(address(tokenU), 1e6, type(uint256).max);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.prank(relayer);
        acct.requestWithdraw(w, _lp(2), sig);
        assertTrue(acct.nonceUsed(type(uint256).max));
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, _lp(2), sig);
    }

    /// @dev Cross-account replay: a signature for clone A is useless on clone B with identical owner/policy.
    function test_crossCloneReplayRejected() public {
        (address o2,) = (owner, ownerPk);
        PolicyAccount b = _deploy(o2, destination, DELAY, bytes32(0)); // same owner, other policy
        IPolicyAccount.Withdraw memory w = _w(address(tokenU), 1e6, 77);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        vm.prank(relayer);
        vm.expectRevert(IPolicyAccount.InvalidSignature.selector);
        b.requestWithdraw(w, _emptyLp(), sig);
    }

    /// @dev A leaf can never collide with an internal node: leaf = H(H(96 bytes)), node = H(64 bytes).
    function testFuzz_leafIsNeverAnInternalNode(address t, uint256 limit, uint64 win) public view {
        bytes32 leaf = _leaf(t, limit, win);
        bytes32 n01 = _hashPair(leaves[0], leaves[1]);
        bytes32 n23 = _hashPair(leaves[2], leaves[3]);
        assertTrue(leaf != n01 && leaf != n23 && leaf != root);
    }

    /// @dev Huge window length means bucket 0 forever: lifetime cap (owner's own choice, documented).
    function test_hugeWindowIsLifetimeCap() public {
        MockERC20 t = new MockERC20("T", "T", 6);
        bytes32 l = _leaf(address(t), 100e6, type(uint64).max);
        (address o2, uint256 pk2) = makeAddrAndKey("owner5");
        PolicyAccount a = _deploy(o2, destination, 1 days, l); // single-leaf tree: root == leaf
        t.mint(address(a), 1000e6);
        IPolicyAccount.LimitProof memory lp = IPolicyAccount.LimitProof({
            limit: 100e6, windowSeconds: type(uint64).max, proof: new bytes32[](0)
        });
        IPolicyAccount.Withdraw memory w = _wFor(address(t), 100e6, 1, lp);
        vm.prank(relayer);
        bytes32 id = a.requestWithdraw(w, lp, _sigW(pk2, address(a), w));
        vm.warp(block.timestamp + 1 days);
        a.executeWithdraw(id);
        IPolicyAccount.Withdraw memory w2 = _wFor(address(t), 1, 2, lp);
        vm.prank(relayer);
        bytes32 id2 = a.requestWithdraw(w2, lp, _sigW(pk2, address(a), w2));
        vm.warp(block.timestamp + 3650 days);
        vm.expectRevert(IPolicyAccount.WindowLimitExceeded.selector);
        a.executeWithdraw(id2);
    }

    /// @dev L-01 regression: a destination returning a 1 MB blob no longer inflates the gas of the
    /// (permissionless) executeWithdraw caller (was 4.16M gas), and the native payout still succeeds.
    function test_returnDataBomb_destinationGasBounded() public {
        BombReceiver bomb = new BombReceiver(1_000_000);
        (address o2, uint256 pk2) = makeAddrAndKey("owner6");
        PolicyAccount a = _deploy(o2, address(bomb), 1 days, bytes32(0));
        vm.deal(address(a), 1 ether);
        IPolicyAccount.Withdraw memory w = _w(address(0), 1 ether, 1);
        vm.prank(relayer);
        bytes32 id = a.requestWithdraw(w, _emptyLp(), _sigW(pk2, address(a), w));
        vm.warp(block.timestamp + 1 days);
        uint256 g = gasleft();
        a.executeWithdraw(id);
        uint256 used = g - gasleft();
        emit log_named_uint("executeWithdraw gas with 1MB return blob", used);
        // The payee's own 1 MB memory expansion costs ~2.1M; the account adds no copy cost on top
        // (pre-fix 4.16M).
        assertLt(used, 2_300_000);
        assertEq(address(bomb).balance, 1 ether);
    }

    /// @dev M-03 regression: a fee transfer refusal must not freeze funds sent to a valid counterfactual
    /// account when the caller has enough fee-token balance and allowance.
    function test_feeTokenBlacklistDoesNotFreezeCounterfactualAccounts() public {
        BlacklistToken usdc = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(usdc), 3e6, feeRecipient);
        (address o2,) = makeAddrAndKey("owner7");
        address predicted = f.predictAddress(o2, f.policyHashOf(destination, 1 days, bytes32(0)));
        // A payer sends 1M USDC-like tokens to the not-yet-deployed account address.
        usdc.mint(predicted, 1_000_000e6);
        usdc.mint(payer, 100e6);
        vm.prank(payer);
        usdc.approve(address(f), type(uint256).max);
        usdc.setBlacklisted(feeRecipient, true); // issuer action
        vm.prank(payer);
        address deployed = f.deploy(o2, destination, 1 days, bytes32(0));
        assertEq(deployed, predicted);
        assertGt(predicted.code.length, 0);
        assertEq(usdc.balanceOf(predicted), 1_000_000e6);
        assertEq(usdc.balanceOf(payer), 100e6);
        assertEq(PolicyAccount(payable(predicted)).owner(), o2);
    }

    /// @dev Timestamp fields must never wrap to an already-mature uint64 value.
    function test_timestampNearUint64Max_revertsInsteadOfWrapping() public {
        uint256 t = uint256(type(uint64).max) - DELAY + 1;
        vm.warp(t);
        IPolicyAccount.Withdraw memory w = _wFor(address(tokenU), 1, 1, _lp(2));
        w.deadline = type(uint256).max;
        vm.expectRevert(
            abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, 64, t + DELAY)
        );
        acct.requestWithdraw(w, _lp(2), _sigW(ownerPk, address(acct), w));

        uint256 p = uint256(type(uint64).max) - 2 * uint256(DELAY) + 1;
        vm.warp(p);
        bytes memory sig = _sigPropose(ownerPk, address(acct), newDest, type(uint256).max, 2);
        vm.expectRevert(
            abi.encodeWithSelector(
                SafeCast.SafeCastOverflowedUintDowncast.selector, 64, p + 2 * uint256(DELAY)
            )
        );
        acct.proposeDestination(newDest, type(uint256).max, 2, sig);
    }
}
