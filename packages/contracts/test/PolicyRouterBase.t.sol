// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {IGhostPayPolicyRouter} from "../src/interfaces/IGhostPayPolicyRouter.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Shared fixture for the policy router: reference announcer, a fee-free factory, the router,
/// a standard token and helpers. The policy account address is recomputed independently (EIP-1167 +
/// CREATE2) and cross-checked against the factory in the tests.
abstract contract PolicyRouterBase is Test {
    ERC5564Announcer internal announcer;
    PolicyAccount internal impl;
    PolicyAccountFactory internal factory;
    GhostPayPolicyRouter internal router;
    MockERC20 internal token;

    address internal feeRecipient = makeAddr("feeRecipient");
    address internal alice = makeAddr("alice");
    address internal owner = makeAddr("stealthOwner");
    address internal destination = makeAddr("coldDestination");
    bytes32 internal policyHash;
    address internal stealth; // predicted policy account

    uint256 internal constant GROSS = 1_000_000_000; // 1000 units @ 6 decimals
    uint256 internal constant DELAY = 1 days;
    uint256 internal constant SCHEME = 0x47500002;
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        announcer = new ERC5564Announcer();
        impl = new PolicyAccount();
        factory = new PolicyAccountFactory(address(impl), address(0), 0, feeRecipient);
        router =
            new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), feeRecipient, factory);
        token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(alice, type(uint128).max);
        vm.prank(alice);
        token.approve(address(router), type(uint256).max);
        vm.deal(alice, 1000 ether);
        policyHash = keccak256(abi.encode(destination, DELAY, bytes32(0)));
        stealth = _predict(owner, policyHash);
    }

    /// @dev Independent CREATE2 derivation of the clone address (does not ask the factory).
    function _predict(address o, bytes32 h) internal view returns (address) {
        return Clones.predictDeterministicAddress(
            address(impl), keccak256(abi.encode(o, h)), address(factory)
        );
    }

    function _ref() internal view returns (IGhostPayPolicyRouter.PolicyRef memory) {
        return IGhostPayPolicyRouter.PolicyRef({owner: owner, policyHash: policyHash});
    }

    function _ref(address o, bytes32 h)
        internal
        pure
        returns (IGhostPayPolicyRouter.PolicyRef memory)
    {
        return IGhostPayPolicyRouter.PolicyRef({owner: o, policyHash: h});
    }

    function _noPermit() internal pure returns (IGhostPayPolicyRouter.PermitSig memory) {
        return IGhostPayPolicyRouter.PermitSig({v: 27, r: bytes32(0), s: bytes32(0)});
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
