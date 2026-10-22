// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";

import {PoolBase} from "./PoolBase.t.sol";
import {MockWithdrawVerifier, MockRagequitVerifier} from "./mocks/PoolMocks.sol";
import {PermitToken} from "./mocks/PermitToken.sol";

/// @notice Stateful handler. The model verifier only accepts proofs the handler registers, and the
/// handler only registers statements a sound circuit could prove (note in tree, value within the note).
/// Attack actions register proofs for statements a sound circuit *could* prove but the contract must
/// still reject (spent nullifier, root outside the window).
contract PoolHandler is Test {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

    struct Note {
        uint256 value;
        uint256 label;
        uint256 commitment;
        uint256 nullifierHash;
        address depositor;
        bool spent;
    }

    GhostPayShieldedPoolERC20 internal pool;
    PermitToken internal token;
    MockWithdrawVerifier internal wv;
    MockRagequitVerifier internal rv;
    address[3] internal actors;
    address internal constant RECIPIENT = address(0xBEEF);
    address internal constant FEE_TO = address(0xFEE);

    Note[] public notes;
    uint256[] public rootAtSize; // rootAtSize[s] = root right after the tree reached size s (index 0 unused)
    uint256 public ghostUnspent;
    uint256 public ghostLeaves;
    uint256 public ghostSpent;
    uint256 public attackSuccesses;
    uint256 public attackAttempts;
    uint256 internal salt;

    constructor(
        GhostPayShieldedPoolERC20 pool_,
        PermitToken token_,
        MockWithdrawVerifier wv_,
        MockRagequitVerifier rv_
    ) {
        pool = pool_;
        token = token_;
        wv = wv_;
        rv = rv_;
        actors = [address(0xA11CE), address(0xB0B), address(0xCA401)];
        rootAtSize.push(0);
        for (uint256 i; i < 3; ++i) {
            vm.prank(actors[i]);
            token.approve(address(pool), type(uint256).max);
        }
    }

    function notesLength() external view returns (uint256) {
        return notes.length;
    }

    function rootsLength() external view returns (uint256) {
        return rootAtSize.length;
    }

    function _fresh() internal returns (uint256) {
        return uint256(keccak256(abi.encode("h", salt++))) % P;
    }

    function _recordRoot() internal {
        rootAtSize.push(pool.currentRoot());
        ghostLeaves++;
    }

    function deposit(uint256 actorSeed, uint256 value) external {
        address a = actors[actorSeed % 3];
        value = bound(value, 1, 1e20);
        token.mint(a, value);
        vm.prank(a);
        (uint256 c, uint256 label) = pool.deposit(value, _fresh());
        notes.push(Note(value, label, c, _fresh(), a, false));
        ghostUnspent += value;
        _recordRoot();
    }

    /// Many small deposits, so that sequences reach the 64-root window boundary.
    function depositMany(uint256 actorSeed, uint8 k) external {
        uint256 count = bound(k, 1, 24);
        for (uint256 j; j < count; ++j) {
            this.deposit(actorSeed % 3 + j, 1 + j);
        }
    }

    function _pickUnspent(uint256 seed) internal view returns (bool found, uint256 idx) {
        uint256 n = notes.length;
        if (n == 0) return (false, 0);
        for (uint256 k; k < n; ++k) {
            uint256 i = (seed % n + k) % n;
            if (!notes[i].spent && notes[i].value > 0) return (true, i);
        }
        return (false, 0);
    }

    function _pickSpent(uint256 seed) internal view returns (bool found, uint256 idx) {
        uint256 n = notes.length;
        for (uint256 k; k < n; ++k) {
            uint256 i = (seed % n + k) % n;
            if (notes[i].spent) return (true, i);
        }
        return (false, 0);
    }

    function _w(uint256 fee) internal view returns (IGhostPayShieldedPool.Withdrawal memory) {
        return IGhostPayShieldedPool.Withdrawal({
            recipient: RECIPIENT,
            relayer: address(this),
            relayerFee: fee,
            feeTo: FEE_TO,
            deadline: block.timestamp + 1 days,
            aspPublisher: address(0),
            announce: ""
        });
    }

    function _proofFor(
        IGhostPayShieldedPool.Withdrawal memory w,
        uint256 value,
        uint256 nh,
        uint256 newC,
        uint256 root
    ) internal returns (IGhostPayShieldedPool.WithdrawProof memory pr) {
        pr.pubSignals = [
            newC,
            nh,
            value,
            root,
            pool.currentTreeDepth(),
            0,
            0,
            0,
            uint256(keccak256(abi.encode(w, pool.SCOPE()))) % P
        ];
        wv.accept(pr.pubSignals);
    }

    function withdraw(uint256 noteSeed, uint256 amount, uint256 feeSeed) external {
        (bool ok, uint256 i) = _pickUnspent(noteSeed);
        if (!ok) return;
        Note memory n = notes[i];
        amount = bound(amount, 1, n.value);
        uint256 fee = bound(feeSeed, 0, amount * pool.MAX_RELAYER_FEE_BPS() / 10_000);
        IGhostPayShieldedPool.Withdrawal memory w = _w(fee);
        uint256 newC = _fresh();
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proofFor(w, amount, n.nullifierHash, newC, pool.currentRoot());
        pool.withdraw(w, pr);
        notes[i].spent = true;
        ghostSpent++;
        ghostUnspent -= amount;
        notes.push(Note(n.value - amount, n.label, newC, _fresh(), n.depositor, false));
        _recordRoot();
    }

    function ragequit(uint256 noteSeed) external {
        (bool ok, uint256 i) = _pickUnspent(noteSeed);
        if (!ok) return;
        Note memory n = notes[i];
        IGhostPayShieldedPool.RagequitProof memory rq;
        rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
        rv.accept(rq.pubSignals);
        vm.prank(n.depositor);
        pool.ragequit(rq);
        notes[i].spent = true;
        ghostSpent++;
        ghostUnspent -= n.value;
    }

    /// Re-spend a spent note through withdraw (fresh change commitment, current root) or ragequit.
    function attackDoubleSpend(uint256 noteSeed, bool viaRagequit, uint256 amount) external {
        (bool ok, uint256 i) = _pickSpent(noteSeed);
        if (!ok) return;
        Note memory n = notes[i];
        attackAttempts++;
        if (viaRagequit && n.value > 0) {
            IGhostPayShieldedPool.RagequitProof memory rq;
            rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
            rv.accept(rq.pubSignals);
            vm.prank(n.depositor);
            try pool.ragequit(rq) {
                attackSuccesses++;
            } catch {}
            return;
        }
        if (n.value == 0) return;
        amount = bound(amount, 1, n.value);
        IGhostPayShieldedPool.Withdrawal memory w = _w(0);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proofFor(w, amount, n.nullifierHash, _fresh(), pool.currentRoot());
        try pool.withdraw(w, pr) {
            attackSuccesses++;
        } catch {}
    }

    /// Prove against a root that left the 64-root window.
    function attackStaleRoot(uint256 noteSeed) external {
        uint256 size = rootAtSize.length - 1;
        if (size <= 64) return;
        (bool ok, uint256 i) = _pickUnspent(noteSeed);
        if (!ok) return;
        attackAttempts++;
        uint256 stale = rootAtSize[size - 64];
        IGhostPayShieldedPool.Withdrawal memory w = _w(0);
        IGhostPayShieldedPool.WithdrawProof memory pr =
            _proofFor(w, 1, notes[i].nullifierHash, _fresh(), stale);
        try pool.withdraw(w, pr) {
            attackSuccesses++;
        } catch {}
    }

    /// Ragequit by someone who is not the depositor.
    function attackForeignRagequit(uint256 noteSeed, uint256 actorSeed) external {
        (bool ok, uint256 i) = _pickUnspent(noteSeed);
        if (!ok) return;
        Note memory n = notes[i];
        address a = actors[actorSeed % 3];
        if (a == n.depositor) return;
        attackAttempts++;
        IGhostPayShieldedPool.RagequitProof memory rq;
        rq.pubSignals = [n.commitment, n.nullifierHash, n.value, n.label];
        rv.accept(rq.pubSignals);
        vm.prank(a);
        try pool.ragequit(rq) {
            attackSuccesses++;
        } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 1 days));
    }
}

/// SP-CON-4, SP-CON-5, SP-CON-11 invariants.
contract GhostPayShieldedPoolInvariantTest is PoolBase {
    PoolHandler internal h;

    function setUp() public override {
        super.setUp();
        h = new PoolHandler(pool, token, wv, rv);
        targetContract(address(h));
    }

    /// SP-CON-5: pool balance equals the sum of unspent note values (standard token).
    function invariant_valueConservation() public view {
        assertEq(token.balanceOf(address(pool)), h.ghostUnspent());
    }

    /// SP-CON-4: no double spend, no stale-root or foreign-depositor payout ever succeeds.
    function invariant_noAttackSucceeds() public view {
        assertEq(h.attackSuccesses(), 0);
    }

    /// Nullifier set matches the model exactly.
    function invariant_nullifierSet() public view {
        uint256 n = h.notesLength();
        uint256 spent;
        for (uint256 i; i < n; ++i) {
            (,,, uint256 nh,, bool isSpent) = h.notes(i);
            assertEq(pool.nullifierSpent(nh), isSpent);
            if (isSpent) spent++;
        }
        assertEq(spent, h.ghostSpent());
    }

    /// Tree size and root window (SP-CON-11).
    function invariant_rootHistory() public view {
        uint256 size = pool.currentTreeSize();
        assertEq(size, h.ghostLeaves());
        assertEq(h.rootsLength(), size + 1);
        if (size == 0) return;
        assertEq(pool.currentRoot(), h.rootAtSize(size));
        uint256 from = size > 80 ? size - 80 : 1;
        for (uint256 s = from; s <= size; ++s) {
            assertEq(pool.isKnownRoot(h.rootAtSize(s)), size - s < 64);
        }
    }
}
