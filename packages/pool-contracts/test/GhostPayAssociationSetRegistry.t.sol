// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";

/// SP-ASP-1, SP-ASP-2 (registry side).
contract GhostPayAssociationSetRegistryTest is Test {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

    event RootPublished(address indexed publisher, uint256 indexed root, uint64 index, string uri);

    GhostPayAssociationSetRegistry internal reg;
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");

    function setUp() public {
        vm.chainId(31_337);
        vm.warp(1000);
        reg = new GhostPayAssociationSetRegistry();
    }

    function test_publishAndViews() public {
        (uint256 root, uint64 at, uint64 idx) = reg.latest(a);
        assertEq(root, 0);
        assertEq(at, 0);
        assertEq(idx, 0);
        assertFalse(reg.wasPublished(a, 5));

        vm.expectEmit(address(reg));
        emit RootPublished(a, 5, 1, "ipfs://x");
        vm.prank(a);
        reg.publish(5, "ipfs://x");
        (root, at, idx) = reg.latest(a);
        assertEq(root, 5);
        assertEq(at, 1000);
        assertEq(idx, 1);
        assertTrue(reg.wasPublished(a, 5));
        assertEq(reg.supersededAt(a, 5), 0);
        // Isolation: b has nothing.
        assertFalse(reg.wasPublished(b, 5));
        (root,,) = reg.latest(b);
        assertEq(root, 0);

        vm.warp(2000);
        vm.prank(a);
        reg.publish(6, "");
        assertEq(reg.supersededAt(a, 5), 2000);
        assertEq(reg.supersededAt(a, 6), 0);
        (root, at, idx) = reg.latest(a);
        assertEq(root, 6);
        assertEq(at, 2000);
        assertEq(idx, 2);
        assertTrue(reg.wasPublished(a, 5));
    }

    function test_republishSameAndOldRoot() public {
        vm.startPrank(a);
        reg.publish(5, "");
        vm.warp(1100);
        reg.publish(5, "again");
        assertEq(reg.supersededAt(a, 5), 0, "re-publishing the latest root does not supersede it");
        (,, uint64 idx) = reg.latest(a);
        assertEq(idx, 2);
        vm.warp(1200);
        reg.publish(6, "");
        assertEq(reg.supersededAt(a, 5), 1200);
        vm.warp(1300);
        reg.publish(5, "back");
        assertEq(reg.supersededAt(a, 5), 0, "old root re-activated");
        assertEq(reg.supersededAt(a, 6), 1300);
        vm.stopPrank();
    }

    function test_invalidRoot() public {
        vm.startPrank(a);
        vm.expectRevert(IGhostPayAssociationSetRegistry.InvalidRoot.selector);
        reg.publish(0, "");
        vm.expectRevert(IGhostPayAssociationSetRegistry.InvalidRoot.selector);
        reg.publish(P, "");
        vm.expectRevert(IGhostPayAssociationSetRegistry.InvalidRoot.selector);
        reg.publish(type(uint256).max, "");
        reg.publish(P - 1, "");
        vm.stopPrank();
    }

    function testFuzz_publisherIsolation(address x, address y, uint256 r1, uint256 r2) public {
        vm.assume(x != y);
        r1 = bound(r1, 1, P - 1);
        r2 = bound(r2, 1, P - 1);
        vm.prank(x);
        reg.publish(r1, "");
        vm.prank(y);
        reg.publish(r2, "");
        (uint256 lx,,) = reg.latest(x);
        (uint256 ly,,) = reg.latest(y);
        assertEq(lx, r1);
        assertEq(ly, r2);
        if (r1 != r2) {
            assertFalse(reg.wasPublished(x, r2));
            assertFalse(reg.wasPublished(y, r1));
        }
    }
}
