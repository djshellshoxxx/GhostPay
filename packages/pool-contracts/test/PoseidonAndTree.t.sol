// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {InternalLeanIMT, LeanIMTData} from "lean-imt/InternalLeanIMT.sol";

import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";
import {PoolLeanIMT, LeanTree} from "../src/lib/PoolLeanIMT.sol";

import {PoseidonDeployer} from "./utils/PoseidonDeployer.sol";

/// @notice Holds a PoolLeanIMT and the original zk-kit InternalLeanIMT side by side.
contract TreePair {
    using PoolLeanIMT for LeanTree;
    using InternalLeanIMT for LeanIMTData;

    LeanTree internal ours;
    LeanIMTData internal ref;
    IPoseidonT3 internal immutable H;

    constructor(IPoseidonT3 h) {
        H = h;
    }

    function insert(uint256 leaf) external returns (uint256 a, uint256 b) {
        a = ours.insert(H, leaf);
        b = ref._insert(leaf);
    }

    function state()
        external
        view
        returns (
            uint256 rootA,
            uint256 rootB,
            uint256 depthA,
            uint256 depthB,
            uint256 sizeA,
            uint256 sizeB
        )
    {
        return (ours.root(), ref._root(), ours.depth, ref.depth, ours.size, ref.size);
    }

    function has(uint256 leaf) external view returns (bool a, bool b) {
        return (ours.has(leaf), ref._has(leaf));
    }
}

/// SP-CON-14: Solidity Poseidon and LeanIMT equal circomlibjs / zk-kit lean-imt (TS) reference values,
/// and PoolLeanIMT equals the original zk-kit Solidity implementation.
contract PoseidonAndTreeTest is Test, PoseidonDeployer {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

    IPoseidonT3 internal t3;
    IPoseidonT4 internal t4;
    string internal json;

    function setUp() public {
        (t3, t4) = deployPoseidon();
        json = vm.readFile("test/fixtures/poseidon-vectors.json");
    }

    function test_poseidonT3_vectors() public view {
        uint256[] memory a = vm.parseJsonUintArray(json, ".t3.a");
        uint256[] memory b = vm.parseJsonUintArray(json, ".t3.b");
        uint256[] memory out = vm.parseJsonUintArray(json, ".t3.out");
        assertGt(a.length, 50);
        for (uint256 i; i < a.length; ++i) {
            assertEq(t3.hash([a[i], b[i]]), out[i]);
        }
    }

    function test_poseidonT4_vectors() public view {
        uint256[] memory a = vm.parseJsonUintArray(json, ".t4.a");
        uint256[] memory b = vm.parseJsonUintArray(json, ".t4.b");
        uint256[] memory c = vm.parseJsonUintArray(json, ".t4.c");
        uint256[] memory out = vm.parseJsonUintArray(json, ".t4.out");
        assertGt(a.length, 50);
        for (uint256 i; i < a.length; ++i) {
            assertEq(t4.hash([a[i], b[i], c[i]]), out[i]);
        }
    }

    /// poseidon-solidity reduces inputs mod P (circomlibjs would reject them); the pool never feeds
    /// unreduced values (leaves, labels and precommitments are checked `< P`).
    function test_poseidon_reducesInputs() public view {
        assertEq(t3.hash([P + 1, 2]), t3.hash([uint256(1), 2]));
    }

    function test_leanIMT_matchesReferenceVectors() public {
        uint256[] memory leaves = vm.parseJsonUintArray(json, ".imt.leaves");
        uint256[] memory roots = vm.parseJsonUintArray(json, ".imt.roots");
        uint256[] memory depths = vm.parseJsonUintArray(json, ".imt.depths");
        TreePair tp = new TreePair(t3);
        for (uint256 i; i < leaves.length; ++i) {
            (uint256 ra, uint256 rb) = tp.insert(leaves[i]);
            assertEq(ra, roots[i], "PoolLeanIMT root != @zk-kit/lean-imt (TS) root");
            assertEq(rb, roots[i], "zk-kit Solidity root != TS root");
            (,, uint256 da,,,) = tp.state();
            assertEq(da, depths[i]);
        }
    }

    function testFuzz_leanIMT_differential(uint256 seed, uint8 n) public {
        TreePair tp = new TreePair(t3);
        uint256 count = bound(n, 1, 40);
        for (uint256 i; i < count; ++i) {
            uint256 leaf = uint256(keccak256(abi.encode(seed, i))) % P;
            if (leaf == 0) leaf = 1;
            (uint256 ra, uint256 rb) = tp.insert(leaf);
            assertEq(ra, rb);
            (bool ha, bool hb) = tp.has(leaf);
            assertTrue(ha && hb);
        }
        (uint256 rootA, uint256 rootB, uint256 dA, uint256 dB, uint256 sA, uint256 sB) = tp.state();
        assertEq(rootA, rootB);
        assertEq(dA, dB);
        assertEq(sA, sB);
        (bool a2, bool b2) = tp.has(uint256(keccak256(abi.encode(seed, "absent"))) % P);
        assertEq(a2, b2);
    }
}
