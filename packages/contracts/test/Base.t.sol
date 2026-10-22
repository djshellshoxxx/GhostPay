// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Shared fixture: canonical reference announcer, router, a standard token and helpers.
abstract contract Base is Test {
    ERC5564Announcer internal announcer;
    GhostPayRouter internal router;
    MockERC20 internal token;

    address internal feeRecipient = makeAddr("feeRecipient");
    address internal stealth = makeAddr("stealth");
    address internal alice = makeAddr("alice");

    uint256 internal constant GROSS = 1_000_000_000; // 1000 units @ 6 decimals
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(alice, type(uint128).max);
        vm.prank(alice);
        token.approve(address(router), type(uint256).max);
        vm.deal(alice, 1000 ether);
    }

    function _fee(uint256 gross) internal pure returns (uint256) {
        return gross * 25 / 10_000;
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234)));
    }

    /// @dev 57-byte metadata: viewTag || selector || asset || net.
    function _meta(bytes4 marker, address asset, uint256 net) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0xab), marker, asset, net);
    }

    function _erc20Meta(address asset, uint256 net) internal pure returns (bytes memory) {
        return _meta(0xa9059cbb, asset, net);
    }

    function _nativeMeta(uint256 net) internal pure returns (bytes memory) {
        return _meta(0xeeeeeeee, NATIVE, net);
    }
}
