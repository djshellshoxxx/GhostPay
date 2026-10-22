// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {GhostPayShieldedPoolNative} from "../src/GhostPayShieldedPoolNative.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../src/interfaces/IGroth16Verifier.sol";

import {PoolBase} from "./PoolBase.t.sol";
import {BadHasher, ToggleFeeToken} from "./mocks/PoolMocks.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";

contract GhostPayShieldedPoolTest is PoolBase {
    using stdStorage for StdStorage;

    event Deposited(
        address indexed depositor,
        uint256 commitment,
        uint256 label,
        uint256 value,
        uint256 precommitment
    );
    event Withdrawn(
        address indexed recipient,
        uint256 value,
        uint256 relayerFee,
        uint256 spentNullifier,
        uint256 newCommitment,
        address indexed aspPublisher,
        uint256 aspRoot
    );
    event Ragequit(address indexed depositor, uint256 commitment, uint256 label, uint256 value);
    event LeafInserted(uint256 index, uint256 leaf, uint256 root);
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    // ---------------------------------------------------------------- constructor

    function test_constructor_immutables() public view {
        assertEq(pool.ASSET(), address(token));
        assertEq(
            pool.SCOPE(),
            uint256(keccak256(abi.encode(address(pool), block.chainid, address(token)))) % P
        );
        assertEq(pool.DENOMINATION(), 0);
        assertEq(pool.MAX_DEPOSIT(), MAX_DEPOSIT);
        assertEq(pool.MAX_RELAYER_FEE_BPS(), FEE_BPS);
        assertEq(pool.ASP_GRACE_SECONDS(), GRACE);
        assertEq(pool.ANNOUNCER(), address(announcer));
        assertEq(pool.REGISTRY(), address(registry));
        assertEq(pool.WITHDRAW_VERIFIER(), address(wv));
        assertEq(pool.RAGEQUIT_VERIFIER(), address(rv));
        assertEq(pool.POSEIDON_T3(), address(t3));
        assertEq(pool.POSEIDON_T4(), address(t4));
        assertEq(pool.ROOT_HISTORY_SIZE(), 64);
        assertEq(pool.MAX_TREE_DEPTH(), 32);
        assertEq(pool.MAX_TREE_SIZE(), 2 ** 32);
        assertEq(pool.currentRoot(), 0);
        assertEq(pool.currentTreeSize(), 0);
        assertEq(pool.currentTreeDepth(), 0);
        assertFalse(pool.isKnownRoot(0));
        assertEq(
            pool.DEPOSIT_AUTH_TYPEHASH(),
            keccak256(
                "DepositAuth(address owner,uint256 value,uint256 precommitment,address feeTo,uint256 sponsorFee,uint256 deadline,uint256 nonce)"
            )
        );
    }

    function test_constructor_allowedChains() public {
        uint256[3] memory ok = [uint256(31_337), 11_155_111, 84_532];
        for (uint256 i; i < 3; ++i) {
            vm.chainId(ok[i]);
            new GhostPayShieldedPoolERC20(_config(address(token), 0));
            new GhostPayShieldedPoolNative(_config(address(0), 0));
            new GhostPayAssociationSetRegistry();
        }
    }

    function test_constructor_wrongChain() public {
        uint256[5] memory bad = [uint256(1), 8453, 10, 11_155_420, 31_338];
        for (uint256 i; i < bad.length; ++i) {
            vm.chainId(bad[i]);
            IGhostPayShieldedPool.PoolConfig memory c = _config(address(token), 0);
            vm.expectRevert(IGhostPayShieldedPool.WrongChain.selector);
            new GhostPayShieldedPoolERC20(c);
            c = _config(address(0), 0);
            vm.expectRevert(IGhostPayShieldedPool.WrongChain.selector);
            new GhostPayShieldedPoolNative(c);
            vm.expectRevert(IGhostPayAssociationSetRegistry.WrongChain.selector);
            new GhostPayAssociationSetRegistry();
        }
    }

    function test_constructor_zeroAddresses() public {
        for (uint256 i; i < 7; ++i) {
            IGhostPayShieldedPool.PoolConfig memory c = _config(address(token), 0);
            if (i == 0) c.asset = address(0);
            if (i == 1) c.announcer = IERC5564Announcer(address(0));
            if (i == 2) c.registry = IGhostPayAssociationSetRegistry(address(0));
            if (i == 3) c.withdrawVerifier = IWithdrawVerifier(address(0));
            if (i == 4) c.ragequitVerifier = IRagequitVerifier(address(0));
            if (i == 5) c.poseidonT3 = IPoseidonT3(address(0));
            if (i == 6) c.poseidonT4 = IPoseidonT4(address(0));
            vm.expectRevert(IGhostPayShieldedPool.ZeroAddress.selector);
            new GhostPayShieldedPoolERC20(c);
        }
    }

    function test_constructor_invalidConfig() public {
        IGhostPayShieldedPool.PoolConfig memory c;
        c = _config(address(token), 0);
        c.maxDeposit = 0;
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        c = _config(address(token), 0);
        c.maxDeposit = uint256(type(uint128).max) + 1;
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        c = _config(address(token), MAX_DEPOSIT + 1);
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        c = _config(address(token), 0);
        c.maxRelayerFeeBps = 1001;
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        c = _config(address(token), 0);
        c.aspGraceSeconds = 1 days + 1;
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        // EOA asset.
        c = _config(makeAddr("eoa"), 0);
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        // Native pool with an asset.
        c = _config(address(token), 0);
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolNative(c);
        // Boundary values are accepted.
        c = _config(address(token), MAX_DEPOSIT);
        c.maxRelayerFeeBps = 1000;
        c.aspGraceSeconds = 1 days;
        c.maxDeposit = MAX_DEPOSIT;
        new GhostPayShieldedPoolERC20(c);
    }

    function test_constructor_hasherKnownAnswer() public {
        BadHasher bad = new BadHasher();
        IGhostPayShieldedPool.PoolConfig memory c = _config(address(token), 0);
        c.poseidonT3 = IPoseidonT3(address(bad));
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        c = _config(address(token), 0);
        c.poseidonT4 = IPoseidonT4(address(bad));
        vm.expectRevert(IGhostPayShieldedPool.InvalidConfig.selector);
        new GhostPayShieldedPoolERC20(c);
        // Swapped hashers: the T3 library has no `hash(uint256[3])`.
        c = _config(address(token), 0);
        c.poseidonT3 = IPoseidonT3(address(t4));
        vm.expectRevert();
        new GhostPayShieldedPoolERC20(c);
        // A hasher address without code.
        c = _config(address(token), 0);
        c.poseidonT4 = IPoseidonT4(makeAddr("nocode"));
        vm.expectRevert();
        new GhostPayShieldedPoolERC20(c);
    }

    // ---------------------------------------------------------------- deposit

    function test_deposit_happyPath() public {
        uint256 pre = _fresh();
        uint256 label = uint256(keccak256(abi.encodePacked(pool.SCOPE(), uint256(1)))) % P;
        uint256 commitment = t4.hash([uint256(1000), label, pre]);
        vm.expectEmit(address(pool));
        emit LeafInserted(0, commitment, commitment);
        vm.expectEmit(address(pool));
        emit Deposited(alice, commitment, label, 1000, pre);
        vm.prank(alice);
        (uint256 c, uint256 l) = pool.deposit(1000, pre);
        assertEq(c, commitment);
        assertEq(l, label);
        assertEq(token.balanceOf(address(pool)), 1000);
        assertEq(pool.depositorOf(label), alice);
        assertEq(pool.depositNonce(), 1);
        assertEq(pool.currentTreeSize(), 1);
        assertEq(pool.currentTreeDepth(), 0);
        assertEq(pool.currentRoot(), commitment);
        assertTrue(pool.isKnownRoot(commitment));
        assertTrue(pool.isLeaf(commitment));

        (uint256 c2,) = _deposit(pool, bob, 5);
        assertEq(pool.currentTreeDepth(), 1);
        assertEq(pool.currentRoot(), t3.hash([commitment, c2]));
        assertTrue(pool.isKnownRoot(commitment));
    }

    function test_deposit_invalidInputs() public {
        vm.startPrank(alice);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.deposit(0, 1);
        vm.expectRevert(IGhostPayShieldedPool.DepositCapExceeded.selector);
        pool.deposit(MAX_DEPOSIT + 1, 1);
        vm.expectRevert(IGhostPayShieldedPool.InvalidPrecommitment.selector);
        pool.deposit(1, 0);
        vm.expectRevert(IGhostPayShieldedPool.InvalidPrecommitment.selector);
        pool.deposit(1, P);
        vm.deal(alice, 1 ether);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.deposit{value: 1}(1, 1);
        // Largest valid precommitment.
        pool.deposit(1, P - 1);
        vm.stopPrank();
    }

    function test_deposit_denomination() public {
        GhostPayShieldedPoolERC20 d = new GhostPayShieldedPoolERC20(_config(address(token), 100));
        vm.startPrank(alice);
        token.approve(address(d), type(uint256).max);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        d.deposit(99, 1);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        d.deposit(101, 1);
        d.deposit(100, 1);
        vm.stopPrank();
        assertEq(d.DENOMINATION(), 100);
    }

    function test_deposit_insufficientAllowance() public {
        vm.prank(alice);
        token.approve(address(pool), 10);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(pool), 10, 11
            )
        );
        pool.deposit(11, 1);
    }

    function test_directEthRejected() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(pool).call{value: 1}("");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayShieldedPool.NoDirectETH.selector);
        vm.prank(alice);
        (ok, ret) = address(pool).call(hex"deadbeef");
        assertFalse(ok);
        assertEq(bytes4(ret), IGhostPayShieldedPool.NoDirectETH.selector);
    }

    // ---------------------------------------------------------------- malicious tokens

    function test_feeOnTransferRejected() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(fot), 0));
        fot.mint(alice, 1000);
        vm.startPrank(alice);
        fot.approve(address(p), 1000);
        vm.expectRevert(IGhostPayShieldedPool.UnexpectedBalanceDelta.selector);
        p.deposit(1000, 1);
        vm.stopPrank();
    }

    function test_falseReturnRejected() public {
        FalseReturnToken f = new FalseReturnToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(f), 0));
        f.mint(alice, 1000);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(f))
        );
        p.deposit(1000, 1);
    }

    function test_noReturnTokenWorks() public {
        NoReturnToken n = new NoReturnToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(n), 0));
        n.mint(alice, 1000);
        vm.prank(alice);
        n.approve(address(p), 1000);
        _deposit(p, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(p, w, 400, _fresh(), _fresh());
        _withdraw(p, w, pr);
        assertEq(n.balanceOf(recipient), 390);
        assertEq(n.balanceOf(feeTo), 10);
        assertEq(n.balanceOf(address(p)), 600);
    }

    function test_tokenTurnsLossyAfterDeposit() public {
        ToggleFeeToken tg = new ToggleFeeToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(tg), 0));
        tg.mint(alice, 1000);
        vm.prank(alice);
        tg.approve(address(p), 1000);
        (uint256 c, uint256 label) = _deposit(p, alice, 1000);
        tg.setFee(true);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(p, w, 400, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.UnexpectedBalanceDelta.selector);
        p.withdraw(w, pr);
        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, _fresh(), 1000, label);
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.UnexpectedBalanceDelta.selector);
        p.ragequit(rq);
        // Clawback below the notes' total: payouts beyond the remaining balance revert, the pool
        // cannot pay out more than it holds (documented: rebasing/clawback tokens unsupported).
        tg.setFee(false);
        tg.clawback(address(p), 500);
        vm.prank(alice);
        vm.expectRevert();
        p.ragequit(rq);
    }

    function test_blacklistedRecipientRevertsAtomically() public {
        BlacklistToken b = new BlacklistToken();
        GhostPayShieldedPoolERC20 p = new GhostPayShieldedPoolERC20(_config(address(b), 0));
        b.mint(alice, 1000);
        vm.prank(alice);
        b.approve(address(p), 1000);
        _deposit(p, alice, 1000);
        b.setBlacklisted(recipient, true);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(p, w, 400, nh, _fresh());
        vm.prank(relayer);
        vm.expectRevert();
        p.withdraw(w, pr);
        assertFalse(p.nullifierSpent(nh), "nullifier must stay unspent after a reverted payout");
    }

    // ---------------------------------------------------------------- withdraw

    function test_withdraw_partialWithFee() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 20);
        uint256 nh = _fresh();
        uint256 change = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, nh, change);
        uint256 rootBefore = pool.currentRoot();
        vm.expectEmit(address(pool));
        emit Withdrawn(recipient, 400, 20, nh, change, address(0), 0);
        _withdraw(pool, w, pr);
        assertEq(token.balanceOf(recipient), 380);
        assertEq(token.balanceOf(feeTo), 20);
        assertEq(token.balanceOf(address(pool)), 600);
        assertTrue(pool.nullifierSpent(nh));
        assertTrue(pool.isLeaf(change));
        assertEq(pool.currentTreeSize(), 2);
        assertEq(pool.currentRoot(), t3.hash([rootBefore, change]));
    }

    function test_withdraw_fullZeroFeeAnySubmitter() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        w.relayer = address(0);
        w.feeTo = address(0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, _fresh(), _fresh());
        vm.prank(makeAddr("anyone"));
        pool.withdraw(w, pr);
        assertEq(token.balanceOf(recipient), 1000);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_withdraw_recipientEqualsFeeTo() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 50);
        w.feeTo = recipient;
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1000, _fresh(), _fresh());
        _withdraw(pool, w, pr);
        assertEq(token.balanceOf(recipient), 1000);
    }

    function test_withdraw_checks() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, _fresh(), _fresh());

        // Expired.
        vm.warp(w.deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.Expired.selector);
        pool.withdraw(w, pr);
        vm.warp(w.deadline);

        // Wrong submitter.
        vm.prank(bob);
        vm.expectRevert(IGhostPayShieldedPool.InvalidRelayer.selector);
        pool.withdraw(w, pr);

        // Unregistered proof (model verifier says false).
        IGhostPayShieldedPool.WithdrawProof memory bad = _copy(pr);
        bad.pubSignals[1] = _fresh();
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.withdraw(w, bad);

        // Succeeds exactly at the deadline, then double spend.
        _withdraw(pool, w, pr);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.withdraw(w, pr);
    }

    function test_withdraw_badRecipient() public {
        _deposit(pool, alice, 1000);
        address[2] memory bads = [address(0), address(pool)];
        for (uint256 i; i < 2; ++i) {
            IGhostPayShieldedPool.Withdrawal memory w = _w(bads[i], 0);
            IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, _fresh(), _fresh());
            vm.prank(relayer);
            vm.expectRevert(IGhostPayShieldedPool.InvalidRecipient.selector);
            pool.withdraw(w, pr);
        }
    }

    function test_withdraw_valueBounds() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 0, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.withdraw(w, pr);
        pr = _proof(pool, w, uint256(type(uint128).max) + 1, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.withdraw(w, pr);
        // More than the pool holds (only a broken circuit could prove this): the token reverts.
        pr = _proof(pool, w, 1001, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert();
        pool.withdraw(w, pr);
    }

    function test_withdraw_feeBounds() public {
        _deposit(pool, alice, 10_000);
        // Cap: 500 bps of 10_000 = 500.
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 501);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 10_000, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.FeeTooHigh.selector);
        pool.withdraw(w, pr);

        w = _w(recipient, 1);
        w.feeTo = address(0);
        pr = _proof(pool, w, 10_000, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidRecipient.selector);
        pool.withdraw(w, pr);

        w = _w(recipient, 1);
        w.feeTo = address(pool);
        pr = _proof(pool, w, 10_000, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidRecipient.selector);
        pool.withdraw(w, pr);

        w = _w(recipient, 500);
        pr = _proof(pool, w, 10_000, _fresh(), _fresh());
        _withdraw(pool, w, pr);
        assertEq(token.balanceOf(feeTo), 500);
        assertEq(token.balanceOf(recipient), 9500);
    }

    function test_withdraw_contextMismatchPerField() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, _fresh(), _fresh());
        for (uint256 i; i < 7; ++i) {
            IGhostPayShieldedPool.Withdrawal memory t = _w(recipient, 10);
            if (i == 0) t.recipient = bob;
            if (i == 1) t.relayer = address(0);
            if (i == 2) t.relayerFee = 9;
            if (i == 3) t.feeTo = bob;
            if (i == 4) t.deadline += 1;
            if (i == 5) t.aspPublisher = publisher;
            if (i == 6) t.announce = hex"00";
            vm.prank(relayer);
            vm.expectRevert(IGhostPayShieldedPool.ContextMismatch.selector);
            pool.withdraw(t, pr);
        }
        // A proof for another pool (other SCOPE) is rejected here.
        GhostPayShieldedPoolERC20 other = new GhostPayShieldedPoolERC20(_config(address(token), 0));
        IGhostPayShieldedPool.WithdrawProof memory pr2 = _copy(pr);
        pr2.pubSignals[8] = _ctx(other, w);
        _accept(pr2);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.ContextMismatch.selector);
        pool.withdraw(w, pr2);
    }

    function test_withdraw_depthAndRoot() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, _fresh(), _fresh());
        pr.pubSignals[4] = 33;
        _accept(pr);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidTreeDepth.selector);
        pool.withdraw(w, pr);
        pr.pubSignals[4] = 0;
        pr.pubSignals[7] = 33;
        _accept(pr);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.InvalidTreeDepth.selector);
        pool.withdraw(w, pr);
        pr.pubSignals[7] = 0;
        pr.pubSignals[3] = 12_345;
        _accept(pr);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.UnknownStateRoot.selector);
        pool.withdraw(w, pr);
        pr.pubSignals[3] = 0;
        _accept(pr);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.UnknownStateRoot.selector);
        pool.withdraw(w, pr);
    }

    function test_withdraw_invalidChangeLeaf() public {
        (uint256 c,) = _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        uint256[3] memory bad = [uint256(0), P, c];
        for (uint256 i; i < 3; ++i) {
            IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, _fresh(), bad[i]);
            vm.prank(relayer);
            vm.expectRevert(IGhostPayShieldedPool.InvalidLeaf.selector);
            pool.withdraw(w, pr);
        }
    }

    /// SP-CON-11: a root is accepted for the next 63 inserts and rejected after the 64th.
    function test_rootHistoryWindow() public {
        _deposit(pool, alice, 1);
        uint256 r = pool.currentRoot();
        for (uint256 i; i < 63; ++i) {
            _deposit(pool, alice, 1);
        }
        assertTrue(pool.isKnownRoot(r));
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, _fresh(), _fresh());
        pr.pubSignals[3] = r;
        _accept(pr);
        uint256 snap = vm.snapshotState();
        _withdraw(pool, w, pr); // 64th insert happens inside, after the root check
        vm.revertToState(snap);
        _deposit(pool, alice, 1);
        assertFalse(pool.isKnownRoot(r));
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.UnknownStateRoot.selector);
        pool.withdraw(w, pr);
    }

    // ---------------------------------------------------------------- ASP

    function _aspProof(
        IGhostPayShieldedPool.Withdrawal memory w,
        uint256 enabled,
        uint256 root,
        uint256 depth
    ) internal returns (IGhostPayShieldedPool.WithdrawProof memory pr) {
        pr = _proof(pool, w, 100, _fresh(), _fresh());
        pr.pubSignals[5] = enabled;
        pr.pubSignals[6] = root;
        pr.pubSignals[7] = depth;
        _accept(pr);
    }

    function test_asp_latestRootAccepted() public {
        _deposit(pool, alice, 1000);
        vm.prank(publisher);
        registry.publish(777, "ipfs://set");
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        w.aspPublisher = publisher;
        IGhostPayShieldedPool.WithdrawProof memory pr = _aspProof(w, 1, 777, 3);
        vm.expectEmit(address(pool));
        emit Withdrawn(recipient, 100, 0, pr.pubSignals[1], pr.pubSignals[0], publisher, 777);
        _withdraw(pool, w, pr);
    }

    function test_asp_mismatches() public {
        _deposit(pool, alice, 1000);
        vm.prank(publisher);
        registry.publish(777, "");
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);

        // aspEnabled = 0 with a publisher / root / depth.
        w.aspPublisher = publisher;
        IGhostPayShieldedPool.WithdrawProof memory pr = _aspProof(w, 0, 0, 0);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.AspMismatch.selector);
        pool.withdraw(w, pr);
        w.aspPublisher = address(0);
        pr = _aspProof(w, 0, 777, 0);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.AspMismatch.selector);
        pool.withdraw(w, pr);
        pr = _aspProof(w, 0, 0, 1);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.AspMismatch.selector);
        pool.withdraw(w, pr);
        // aspEnabled = 1 without publisher.
        pr = _aspProof(w, 1, 777, 1);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.AspMismatch.selector);
        pool.withdraw(w, pr);
        // aspEnabled = 2.
        w.aspPublisher = publisher;
        pr = _aspProof(w, 2, 777, 1);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.AspMismatch.selector);
        pool.withdraw(w, pr);
        // Root never published by this publisher (published by bob instead).
        vm.prank(bob);
        registry.publish(888, "");
        pr = _aspProof(w, 1, 888, 1);
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.UnknownAspRoot.selector);
        pool.withdraw(w, pr);
    }

    /// SP-ASP-2: grace rule at grace - 1, grace, grace + 1.
    function test_asp_graceBoundaries() public {
        _deposit(pool, alice, 1000);
        vm.prank(publisher);
        registry.publish(777, "");
        vm.warp(block.timestamp + 10);
        vm.prank(publisher);
        registry.publish(778, "");
        uint256 t0 = block.timestamp;
        assertEq(registry.supersededAt(publisher, 777), t0);

        uint256[3] memory dt = [GRACE - 1, GRACE, GRACE + 1];
        for (uint256 i; i < 3; ++i) {
            vm.warp(t0 + dt[i]);
            IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
            w.aspPublisher = publisher;
            IGhostPayShieldedPool.WithdrawProof memory pr = _aspProof(w, 1, 777, 1);
            vm.prank(relayer);
            if (i == 2) vm.expectRevert(IGhostPayShieldedPool.UnknownAspRoot.selector);
            pool.withdraw(w, pr);
        }
        // Latest root never expires.
        vm.warp(t0 + 365 days);
        IGhostPayShieldedPool.Withdrawal memory w2 = _w(recipient, 0);
        w2.aspPublisher = publisher;
        IGhostPayShieldedPool.WithdrawProof memory pr2 = _aspProof(w2, 1, 778, 1);
        _withdraw(pool, w2, pr2);
    }

    // ---------------------------------------------------------------- announce (SP-PAY)

    function _announce(uint8 prefix, uint256 keyLen, bytes4 marker, address asset, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory key = new bytes(keyLen);
        if (keyLen > 0) key[0] = bytes1(prefix);
        bytes memory meta = abi.encodePacked(bytes1(0xab), marker, asset, amount);
        return abi.encode(key, meta);
    }

    function test_announce_validEmitsWithPoolAsCaller() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
        w.announce = _announce(0x02, 33, 0xa9059cbb, address(token), 390);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, _fresh(), _fresh());
        (bytes memory key, bytes memory meta) = abi.decode(w.announce, (bytes, bytes));
        vm.expectEmit(address(announcer));
        emit Announcement(1, recipient, address(pool), key, meta);
        _withdraw(pool, w, pr);
    }

    function test_announce_emptyEmitsNothing() public {
        _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, _fresh(), _fresh());
        vm.recordLogs();
        _withdraw(pool, w, pr);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].emitter != address(announcer), "no announcement expected");
        }
    }

    function test_announce_invalid() public {
        _deposit(pool, alice, 1000);
        bytes[7] memory bads = [
            _announce(0x04, 33, 0xa9059cbb, address(token), 390), // prefix
            _announce(0x02, 32, 0xa9059cbb, address(token), 390), // key length
            _announce(0x02, 65, 0xa9059cbb, address(token), 390), // uncompressed
            _announce(0x02, 33, 0xeeeeeeee, address(token), 390), // native marker on ERC-20 pool
            _announce(0x02, 33, 0xa9059cbb, bob, 390), // wrong asset
            _announce(0x02, 33, 0xa9059cbb, address(token), 400), // gross instead of net
            abi.encode(
                new bytes(33),
                abi.encodePacked(
                    bytes1(0xab), bytes4(0xa9059cbb), address(token), uint256(390), uint8(0)
                )
            ) // 58 bytes
        ];
        for (uint256 i; i < bads.length; ++i) {
            IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 10);
            w.announce = bads[i];
            if (i == 6) {
                // fix the key prefix so only the metadata length is wrong
                (bytes memory k, bytes memory m) = abi.decode(bads[i], (bytes, bytes));
                k[0] = 0x03;
                w.announce = abi.encode(k, m);
            }
            IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 400, _fresh(), _fresh());
            vm.prank(relayer);
            vm.expectRevert(IGhostPayShieldedPool.InvalidAnnounce.selector);
            pool.withdraw(w, pr);
        }
        // Malformed ABI encoding reverts (no specific error).
        IGhostPayShieldedPool.Withdrawal memory w2 = _w(recipient, 10);
        w2.announce = hex"0102";
        IGhostPayShieldedPool.WithdrawProof memory pr2 = _proof(pool, w2, 400, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert();
        pool.withdraw(w2, pr2);
    }

    // ---------------------------------------------------------------- ragequit

    function test_ragequit_happyPath() public {
        (uint256 c, uint256 label) = _deposit(pool, alice, 1000);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, nh, 1000, label);
        uint256 before = token.balanceOf(alice);
        vm.expectEmit(address(pool));
        emit Ragequit(alice, c, label, 1000);
        vm.prank(alice);
        pool.ragequit(rq);
        assertEq(token.balanceOf(alice), before + 1000);
        assertTrue(pool.nullifierSpent(nh));
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.ragequit(rq);
        // The same nullifier cannot be withdrawn afterwards (shared set, SP-CON-4).
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, nh, _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.withdraw(w, pr);
    }

    function test_ragequit_afterWithdrawSameNullifier() public {
        (uint256 c, uint256 label) = _deposit(pool, alice, 1000);
        _deposit(pool, bob, 1000);
        uint256 nh = _fresh();
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 600, nh, _fresh());
        _withdraw(pool, w, pr);
        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, nh, 1000, label);
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.ragequit(rq);
        // The change note (same label) can be ragequit by the original depositor.
        uint256 change = pr.pubSignals[0];
        IGhostPayShieldedPool.RagequitProof memory rq2 = _rqProof(change, _fresh(), 400, label);
        vm.prank(alice);
        pool.ragequit(rq2);
        assertEq(token.balanceOf(address(pool)), 1000);
    }

    function test_ragequit_checks() public {
        (uint256 c, uint256 label) = _deposit(pool, alice, 1000);
        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, _fresh(), 1000, label);
        vm.prank(bob);
        vm.expectRevert(IGhostPayShieldedPool.NotDepositor.selector);
        pool.ragequit(rq);
        // Unknown label.
        IGhostPayShieldedPool.RagequitProof memory rq2 = _rqProof(c, _fresh(), 1000, 42);
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.NotDepositor.selector);
        pool.ragequit(rq2);
        // Unknown label, zero caller is impossible but zero depositor must never match.
        vm.prank(address(0));
        vm.expectRevert(IGhostPayShieldedPool.NotDepositor.selector);
        pool.ragequit(rq2);
        // Commitment not in the tree.
        IGhostPayShieldedPool.RagequitProof memory rq3 = _rqProof(_fresh(), _fresh(), 1000, label);
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.InvalidCommitment.selector);
        pool.ragequit(rq3);
        // Zero value.
        IGhostPayShieldedPool.RagequitProof memory rq4 = _rqProof(c, _fresh(), 0, label);
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.InvalidValue.selector);
        pool.ragequit(rq4);
        // Unregistered proof.
        IGhostPayShieldedPool.RagequitProof memory rq5 = rq;
        rq5.pubSignals[1] = _fresh();
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.ragequit(rq5);
    }

    // ---------------------------------------------------------------- tree full

    function test_treeFull() public {
        _deposit(pool, alice, 1);
        stdstore.target(address(pool)).sig("currentTreeSize()").checked_write(uint256(2 ** 32 - 1));
        stdstore.target(address(pool)).sig("currentTreeDepth()").checked_write(uint256(32));
        // The last slot (index 2^32 - 1) can still be filled ...
        _deposit(pool, alice, 1);
        assertEq(pool.currentTreeSize(), 2 ** 32);
        assertEq(pool.currentTreeDepth(), 32);
        assertTrue(pool.isKnownRoot(pool.currentRoot()));
        // ... then deposits and withdrawals (change note insert) revert.
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.TreeFull.selector);
        pool.deposit(1, 1);
        IGhostPayShieldedPool.Withdrawal memory w = _w(recipient, 0);
        IGhostPayShieldedPool.WithdrawProof memory pr = _proof(pool, w, 1, _fresh(), _fresh());
        vm.prank(relayer);
        vm.expectRevert(IGhostPayShieldedPool.TreeFull.selector);
        pool.withdraw(w, pr);
    }

    function test_treeFull_ragequitStillWorks() public {
        (uint256 c, uint256 label) = _deposit(pool, alice, 7);
        stdstore.target(address(pool)).sig("currentTreeSize()").checked_write(uint256(2 ** 32));
        stdstore.target(address(pool)).sig("currentTreeDepth()").checked_write(uint256(32));
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.TreeFull.selector);
        pool.deposit(1, 1);
        IGhostPayShieldedPool.RagequitProof memory rq = _rqProof(c, _fresh(), 7, label);
        vm.prank(alice);
        pool.ragequit(rq);
        assertEq(token.balanceOf(address(pool)), 0);
    }
}
