// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";

import {PoolBase} from "./PoolBase.t.sol";
import {TreePair} from "./PoseidonAndTree.t.sol";

/// SP-CON-14 against the repo-wide cross-language vectors `test-vectors/shielded-pool.json`
/// (written by the pool-sdk / pool-circuits agents with poseidon-lite, zk-kit lean-imt and viem).
/// The contract is authoritative: a mismatch here means the vectors (or the SDK) must change.
contract SharedVectorsTest is PoolBase {
    string internal v;

    function setUp() public override {
        super.setUp();
        v = vm.readFile("../../test-vectors/shielded-pool.json");
    }

    function _key(string memory a, uint256 i, string memory b)
        internal
        pure
        returns (string memory)
    {
        return string.concat(a, "[", vm.toString(i), "]", b);
    }

    function test_poseidon() public view {
        for (uint256 i; i < 4; ++i) {
            uint256[] memory x = vm.parseJsonUintArray(v, _key(".poseidon.t3", i, ".in"));
            assertEq(t3.hash([x[0], x[1]]), vm.parseJsonUint(v, _key(".poseidon.t3", i, ".out")));
            x = vm.parseJsonUintArray(v, _key(".poseidon.t4", i, ".in"));
            assertEq(
                t4.hash([x[0], x[1], x[2]]), vm.parseJsonUint(v, _key(".poseidon.t4", i, ".out"))
            );
        }
    }

    function test_noteHashes() public view {
        for (uint256 i; i < 2; ++i) {
            uint256 pre = t3.hash(
                [
                    vm.parseJsonUint(v, _key(".notes", i, ".nullifier")),
                    vm.parseJsonUint(v, _key(".notes", i, ".secret"))
                ]
            );
            assertEq(pre, vm.parseJsonUint(v, _key(".notes", i, ".precommitment")));
            uint256 c = t4.hash(
                [
                    vm.parseJsonUint(v, _key(".notes", i, ".value")),
                    vm.parseJsonUint(v, _key(".notes", i, ".label")),
                    pre
                ]
            );
            assertEq(c, vm.parseJsonUint(v, _key(".notes", i, ".commitment")));
        }
    }

    function test_leanImtRoots() public {
        uint256[] memory leaves = vm.parseJsonUintArray(v, ".leanImt.leaves");
        TreePair tp = new TreePair(t3);
        for (uint256 i; i < leaves.length; ++i) {
            (uint256 ra,) = tp.insert(leaves[i]);
            assertEq(ra, vm.parseJsonUint(v, _key(".leanImt.trees", i, ".root")));
            (,, uint256 d,,,) = tp.state();
            assertEq(d, vm.parseJsonUint(v, _key(".leanImt.trees", i, ".depth")));
        }
    }

    /// Deploys a pool at the vector's pool address (constructor runs there, so SCOPE binds it).
    function test_contractScopeLabelsContext() public {
        address poolAt = vm.parseJsonAddress(v, ".contract.pool");
        address assetAt = vm.parseJsonAddress(v, ".contract.asset");
        assertEq(vm.parseJsonUint(v, ".contract.chainId"), block.chainid);
        vm.etch(assetAt, address(token).code);
        deployCodeTo(
            "GhostPayShieldedPoolERC20.sol:GhostPayShieldedPoolERC20",
            abi.encode(_config(assetAt, 0)),
            poolAt
        );
        GhostPayShieldedPoolERC20 p = GhostPayShieldedPoolERC20(payable(poolAt));
        assertEq(p.SCOPE(), vm.parseJsonUint(v, ".contract.scope"), "scope");
        assertEq(p.ASSET(), assetAt);

        // Fund alice on the etched token (OpenZeppelin ERC20: balances mapping at slot 0).
        vm.store(assetAt, keccak256(abi.encode(alice, uint256(0))), bytes32(uint256(1e24)));
        vm.prank(alice);
        (bool ok,) = assetAt.call(abi.encodeWithSignature("approve(address,uint256)", poolAt, 1e24));
        assertTrue(ok);
        for (uint256 i; i < 2; ++i) {
            vm.prank(alice);
            (, uint256 label) = p.deposit(i == 0 ? 1_000_000 : 1, _fresh());
            assertEq(label, vm.parseJsonUint(v, _key(".contract.labels", i, ".label")), "label");
        }

        // Context: a model proof carrying the vector's context passes the ContextMismatch check.
        IGhostPayShieldedPool.Withdrawal memory w = IGhostPayShieldedPool.Withdrawal({
            recipient: vm.parseJsonAddress(v, ".contract.withdrawal.recipient"),
            relayer: vm.parseJsonAddress(v, ".contract.withdrawal.relayer"),
            relayerFee: vm.parseJsonUint(v, ".contract.withdrawal.relayerFee"),
            feeTo: vm.parseJsonAddress(v, ".contract.withdrawal.feeTo"),
            deadline: vm.parseJsonUint(v, ".contract.withdrawal.deadline"),
            aspPublisher: vm.parseJsonAddress(v, ".contract.withdrawal.aspPublisher"),
            announce: vm.parseJsonBytes(v, ".contract.withdrawal.announce")
        });
        uint256 ctx = vm.parseJsonUint(v, ".contract.context");
        IGhostPayShieldedPool.WithdrawProof memory pr;
        pr.pubSignals =
            [_fresh(), _fresh(), 1_000_000, p.currentRoot(), p.currentTreeDepth(), 0, 0, 0, ctx];
        wv.accept(pr.pubSignals);
        vm.prank(w.relayer);
        vm.warp(1_800_000_000);
        p.withdraw(w, pr);
        assertTrue(p.nullifierSpent(pr.pubSignals[1]), "vector context accepted by the contract");
        pr.pubSignals = [
            _fresh(), _fresh(), 1_000_000, p.currentRoot(), p.currentTreeDepth(), 0, 0, 0, ctx + 1
        ];
        wv.accept(pr.pubSignals);
        vm.prank(w.relayer);
        vm.expectRevert(IGhostPayShieldedPool.ContextMismatch.selector);
        p.withdraw(w, pr);
    }
}
