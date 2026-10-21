// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {WithdrawVerifier} from "pool-circuits-verifiers/WithdrawVerifier.sol";
import {RagequitVerifier} from "pool-circuits-verifiers/RagequitVerifier.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../src/interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {PoseidonDeployer} from "./utils/PoseidonDeployer.sol";

/// End-to-end with REAL Groth16 proofs from packages/pool-circuits (INSECURE DEV CEREMONY keys) and
/// the generated verifiers. Fixture: test/fixtures/proofs/pool-e2e.json, produced by
/// scripts/gen-proof-fixtures.mjs for exactly this deterministic deployment. Every value the
/// fixture claims (scope, labels, commitments, roots, context) is re-derived on-chain here.
contract RealProofTest is Test, PoseidonDeployer {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    address internal constant RECIPIENT = 0x000000000000000000000000000000000000dEaD;
    address internal constant RELAYER = 0x0000000000000000000000000000000000001234;
    address internal constant FEE_TO = 0x0000000000000000000000000000000000005678;
    address internal constant PUBLISHER = 0x0000000000000000000000000000000000009ABc;

    IPoseidonT3 internal t3;
    IPoseidonT4 internal t4;
    WithdrawVerifier internal wv;
    RagequitVerifier internal rv;
    GhostPayAssociationSetRegistry internal registry;
    MockERC20 internal token;
    GhostPayShieldedPoolERC20 internal pool;
    string internal json;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.chainId(31_337);
        vm.warp(1_760_000_000);
        (t3, t4) = deployPoseidon();
        ERC5564Announcer announcer = new ERC5564Announcer();
        registry = new GhostPayAssociationSetRegistry();
        wv = new WithdrawVerifier();
        rv = new RagequitVerifier();
        token = new MockERC20("T", "T", 6);
        pool = new GhostPayShieldedPoolERC20(
            IGhostPayShieldedPool.PoolConfig({
                asset: address(token),
                announcer: IERC5564Announcer(address(announcer)),
                registry: IGhostPayAssociationSetRegistry(address(registry)),
                withdrawVerifier: IWithdrawVerifier(address(wv)),
                ragequitVerifier: IRagequitVerifier(address(rv)),
                poseidonT3: t3,
                poseidonT4: t4,
                denomination: 0,
                maxDeposit: 1e30,
                maxRelayerFeeBps: 500,
                aspGraceSeconds: 600
            })
        );
        json = vm.readFile("test/fixtures/proofs/pool-e2e.json");
        assertEq(
            vm.parseJsonAddress(json, ".pool"), address(pool), "fixture pool address: regenerate"
        );
        assertEq(
            vm.parseJsonAddress(json, ".token"), address(token), "fixture token address: regenerate"
        );
        token.mint(alice, 10_000_000);
        token.mint(bob, 10_000_000);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
        vm.prank(bob);
        token.approve(address(pool), type(uint256).max);
    }

    function _u(string memory key) internal view returns (uint256) {
        return vm.parseJsonUint(json, key);
    }

    function _withdrawal() internal view returns (IGhostPayShieldedPool.Withdrawal memory w) {
        w = IGhostPayShieldedPool.Withdrawal({
            recipient: RECIPIENT,
            relayer: RELAYER,
            relayerFee: _u(".withdrawal.relayerFee"),
            feeTo: FEE_TO,
            deadline: _u(".withdrawal.deadline"),
            aspPublisher: PUBLISHER,
            announce: ""
        });
    }

    function _wproof() internal view returns (IGhostPayShieldedPool.WithdrawProof memory p) {
        uint256[] memory a = vm.parseJsonUintArray(json, ".withdraw.pA");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".withdraw.pB[0]");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".withdraw.pB[1]");
        uint256[] memory c = vm.parseJsonUintArray(json, ".withdraw.pC");
        uint256[] memory s = vm.parseJsonUintArray(json, ".withdraw.pubSignals");
        p.pA = [a[0], a[1]];
        p.pB = [[b0[0], b0[1]], [b1[0], b1[1]]];
        p.pC = [c[0], c[1]];
        for (uint256 i; i < 9; ++i) {
            p.pubSignals[i] = s[i];
        }
    }

    function _rproof() internal view returns (IGhostPayShieldedPool.RagequitProof memory p) {
        uint256[] memory a = vm.parseJsonUintArray(json, ".ragequit.pA");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".ragequit.pB[0]");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".ragequit.pB[1]");
        uint256[] memory c = vm.parseJsonUintArray(json, ".ragequit.pC");
        uint256[] memory s = vm.parseJsonUintArray(json, ".ragequit.pubSignals");
        p.pA = [a[0], a[1]];
        p.pB = [[b0[0], b0[1]], [b1[0], b1[1]]];
        p.pC = [c[0], c[1]];
        for (uint256 i; i < 4; ++i) {
            p.pubSignals[i] = s[i];
        }
    }

    /// Both deposits, then the ASP publication; asserts every derived value equals the fixture.
    function _setupState() internal {
        assertEq(pool.SCOPE(), _u(".scope"), "SCOPE");
        vm.prank(alice);
        (uint256 cA, uint256 lA) = pool.deposit(_u(".noteA.value"), _u(".noteA.pre"));
        vm.prank(bob);
        (uint256 cB, uint256 lB) = pool.deposit(_u(".noteB.value"), _u(".noteB.pre"));
        assertEq(lA, _u(".noteA.label"), "label A");
        assertEq(lB, _u(".noteB.label"), "label B");
        assertEq(cA, _u(".noteA.commitment"), "commitment A (Solidity PoseidonT4 vs circuit)");
        assertEq(cB, _u(".noteB.commitment"), "commitment B");
        assertEq(pool.currentRoot(), _u(".stateRoot"), "state root (Solidity LeanIMT vs circuit)");
        assertEq(pool.currentTreeDepth(), 1);
        vm.prank(PUBLISHER);
        registry.publish(_u(".aspRoot"), "fixture");
    }

    function test_realWithdrawWithAsp() public {
        _setupState();
        IGhostPayShieldedPool.Withdrawal memory w = _withdrawal();
        IGhostPayShieldedPool.WithdrawProof memory p = _wproof();
        assertEq(p.pubSignals[8], uint256(keccak256(abi.encode(w, pool.SCOPE()))) % P, "context");
        uint256 gasBefore = gasleft();
        vm.prank(RELAYER);
        pool.withdraw(w, p);
        emit log_named_uint("withdraw gas (real verifier, ASP on)", gasBefore - gasleft());
        uint256 value = _u(".withdrawnValue");
        uint256 fee = w.relayerFee;
        assertEq(token.balanceOf(RECIPIENT), value - fee);
        assertEq(token.balanceOf(FEE_TO), fee);
        assertEq(token.balanceOf(address(pool)), 1_500_000 - value);
        assertTrue(pool.nullifierSpent(_u(".noteA.nullifierHash")));
        assertTrue(pool.isLeaf(_u(".changeCommitment")));
        // Replay of the identical proof.
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.withdraw(w, p);
        // Malleated proof (-A, -B, C) also satisfies the pairing; the nullifier still blocks it.
        IGhostPayShieldedPool.WithdrawProof memory m = _wproof();
        // Negating a point negates its y coordinate; pB rows are [x, y] (each an Fq2 pair).
        m.pA[1] = (Q - m.pA[1]) % Q;
        m.pB[1] = [(Q - m.pB[1][0]) % Q, (Q - m.pB[1][1]) % Q];
        assertTrue(wv.verifyProof(m.pA, m.pB, m.pC, m.pubSignals), "malleated proof verifies");
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.withdraw(w, m);
    }

    /// bn254 base field modulus (G1/G2 coordinates).
    uint256 internal constant Q =
        21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;

    function test_realProof_tamperedWithdrawalFieldRejected() public {
        _setupState();
        IGhostPayShieldedPool.WithdrawProof memory p = _wproof();
        for (uint256 i; i < 5; ++i) {
            IGhostPayShieldedPool.Withdrawal memory w = _withdrawal();
            if (i == 0) w.recipient = alice;
            if (i == 1) w.relayerFee = 0;
            if (i == 2) w.feeTo = alice;
            if (i == 3) w.deadline = w.deadline - 1;
            if (i == 4) w.announce = hex"00";
            vm.prank(RELAYER);
            vm.expectRevert(IGhostPayShieldedPool.ContextMismatch.selector);
            pool.withdraw(w, p);
        }
    }

    function test_realProof_tamperedSignalOrPointRejected() public {
        _setupState();
        IGhostPayShieldedPool.Withdrawal memory w = _withdrawal();
        // Change commitment and nullifier hash pass every pre-check, so only the verifier stops them.
        for (uint256 i; i < 2; ++i) {
            IGhostPayShieldedPool.WithdrawProof memory p = _wproof();
            p.pubSignals[i] = (p.pubSignals[i] + 1) % P;
            vm.prank(RELAYER);
            vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
            pool.withdraw(w, p);
        }
        // Withdrawn value (within fee bounds), proof points.
        IGhostPayShieldedPool.WithdrawProof memory q = _wproof();
        q.pubSignals[2] += 1;
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.withdraw(w, q);
        q = _wproof();
        q.pC[0] = (q.pC[0] + 1) % Q;
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.withdraw(w, q);
        // Unswapped G2 coordinates (wrong calldata encoding).
        q = _wproof();
        q.pB = [[q.pB[0][1], q.pB[0][0]], [q.pB[1][1], q.pB[1][0]]];
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.withdraw(w, q);
        // Naming another ASP publisher changes the bound context.
        IGhostPayShieldedPool.Withdrawal memory w2 = _withdrawal();
        w2.aspPublisher = alice;
        IGhostPayShieldedPool.WithdrawProof memory p2 = _wproof();
        vm.prank(RELAYER);
        vm.expectRevert(IGhostPayShieldedPool.ContextMismatch.selector);
        pool.withdraw(w2, p2);
    }

    /// Documented behaviour (audit I-3): a proof with an off-curve point makes the bn254 precompile
    /// fail, which consumes all gas forwarded to it; only the submitter pays.
    function test_offCurvePointBurnsSubmitterGas() public {
        _setupState();
        IGhostPayShieldedPool.Withdrawal memory w = _withdrawal();
        IGhostPayShieldedPool.WithdrawProof memory q = _wproof();
        q.pC[0] = (q.pC[0] + 1) % Q; // (x+1, y) is not on the curve
        uint256 g = gasleft();
        vm.prank(RELAYER);
        (bool ok,) = address(pool).call{gas: 3_000_000}(
            abi.encodeCall(IGhostPayShieldedPool.withdraw, (w, q))
        );
        uint256 used = g - gasleft();
        assertFalse(ok);
        assertGt(used, 2_900_000, "almost all forwarded gas consumed");
        emit log_named_uint("gas burnt by off-curve proof (3M forwarded)", used);
        // A well-formed but wrong proof (valid points) costs only a normal verification.
        IGhostPayShieldedPool.WithdrawProof memory r = _wproof();
        r.pubSignals[0] = (r.pubSignals[0] + 1) % P;
        g = gasleft();
        vm.prank(RELAYER);
        (ok,) = address(pool).call{gas: 3_000_000}(
            abi.encodeCall(IGhostPayShieldedPool.withdraw, (w, r))
        );
        assertFalse(ok);
        emit log_named_uint("gas of an on-curve wrong proof", g - gasleft());
        assertLt(g - gasleft(), 1_000_000);
    }

    /// The generated verifier rejects non-canonical (>= P) public signals (`checkField`).
    function test_verifierCheckField() public {
        _setupState();
        IGhostPayShieldedPool.WithdrawProof memory p = _wproof();
        assertTrue(wv.verifyProof(p.pA, p.pB, p.pC, p.pubSignals));
        for (uint256 i; i < 9; ++i) {
            IGhostPayShieldedPool.WithdrawProof memory t = _wproof();
            t.pubSignals[i] = t.pubSignals[i] + P;
            assertFalse(wv.verifyProof(t.pA, t.pB, t.pC, t.pubSignals));
        }
        IGhostPayShieldedPool.RagequitProof memory r = _rproof();
        assertTrue(rv.verifyProof(r.pA, r.pB, r.pC, r.pubSignals));
        for (uint256 i; i < 4; ++i) {
            IGhostPayShieldedPool.RagequitProof memory t = _rproof();
            t.pubSignals[i] = t.pubSignals[i] + P;
            assertFalse(rv.verifyProof(t.pA, t.pB, t.pC, t.pubSignals));
        }
    }

    function test_realRagequit() public {
        _setupState();
        IGhostPayShieldedPool.RagequitProof memory r = _rproof();
        assertEq(r.pubSignals[0], _u(".noteB.commitment"));
        assertEq(r.pubSignals[1], _u(".noteB.nullifierHash"));
        // Not the depositor.
        vm.prank(alice);
        vm.expectRevert(IGhostPayShieldedPool.NotDepositor.selector);
        pool.ragequit(r);
        uint256 before = token.balanceOf(bob);
        uint256 gasBefore = gasleft();
        vm.prank(bob);
        pool.ragequit(r);
        emit log_named_uint("ragequit gas (real verifier)", gasBefore - gasleft());
        assertEq(token.balanceOf(bob), before + _u(".noteB.value"));
        vm.prank(bob);
        vm.expectRevert(IGhostPayShieldedPool.NullifierSpent.selector);
        pool.ragequit(r);
        // Tampered value with the same proof.
        IGhostPayShieldedPool.RagequitProof memory t = _rproof();
        t.pubSignals[1] = 1;
        vm.prank(bob);
        vm.expectRevert(IGhostPayShieldedPool.InvalidProof.selector);
        pool.ragequit(t);
    }

    function test_realWithdrawThenRagequitSameNoteBlocked() public {
        _setupState();
        vm.prank(RELAYER);
        pool.withdraw(_withdrawal(), _wproof());
        // Alice cannot ragequit note A (its nullifier is spent); the circuit fixture for B is bob's.
        assertTrue(pool.nullifierSpent(_u(".noteA.nullifierHash")));
        assertFalse(pool.nullifierSpent(_u(".noteB.nullifierHash")));
    }
}
