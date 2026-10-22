// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GhostPayRouter} from "../../src/GhostPayRouter.sol";
import {GhostPayPolicyRouter} from "../../src/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "../../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../../src/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "../../src/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "../utils/ERC5564Announcer.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @notice Halmos symbolic specs (round-3b starter set; research R-1 RT-1, PR-1, FA-1).
/// `check_*` functions are ignored by `forge test` and run with:
/// `halmos --root packages/contracts --match-contract RouterHalmos` (see docs/remote/fixes-round3b-contracts.md).
contract RouterHalmos is Test {
    ERC5564Announcer internal announcer;
    GhostPayRouter internal router;
    GhostPayPolicyRouter internal policyRouter;
    PolicyAccountFactory internal factory;
    MockERC20 internal token;

    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA11CE);

    function setUp() public {
        announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), FEE_RECIPIENT);
        PolicyAccount impl = new PolicyAccount();
        factory = new PolicyAccountFactory(address(impl), address(0), 0, FEE_RECIPIENT);
        policyRouter =
            new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), FEE_RECIPIENT, factory);
        token = new MockERC20("USD Coin", "USDC", 6);
        token.mint(ALICE, type(uint128).max);
        vm.prank(ALICE);
        token.approve(address(router), type(uint256).max);
    }

    function _meta(address asset, uint256 net) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), asset, net);
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234)));
    }

    /// RT-1: for every gross and every admissible stealth, a successful payment moves exactly gross from
    /// the payer, splits it into net + floor(gross * 25 / 10000), and leaves nothing in the router.
    function check_payERC20_conservation(uint256 gross, address stealth) public {
        vm.assume(gross > 0 && gross <= type(uint128).max);
        vm.assume(stealth != address(0) && stealth != address(router));
        vm.assume(stealth != FEE_RECIPIENT && stealth != ALICE && stealth != address(token));
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        uint256 a0 = token.balanceOf(ALICE);
        uint256 s0 = token.balanceOf(stealth);
        uint256 f0 = token.balanceOf(FEE_RECIPIENT);
        vm.prank(ALICE);
        router.payERC20(
            IERC20(address(token)), stealth, gross, net, 1, _eph(), _meta(address(token), net)
        );
        assertEq(a0 - token.balanceOf(ALICE), gross);
        assertEq(token.balanceOf(stealth) - s0, net);
        assertEq(token.balanceOf(FEE_RECIPIENT) - f0, fee);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(fee + net, gross);
    }

    /// PR-1: the policy router never accepts a stealth address other than the factory clone for `salt`.
    function check_policyRouter_rejectsNonCloneStealth(bytes32 salt, address stealth) public {
        address expected =
            Clones.predictDeterministicAddress(factory.IMPLEMENTATION(), salt, address(factory));
        vm.assume(stealth != expected);
        vm.deal(ALICE, 1 ether);
        vm.prank(ALICE);
        (bool ok,) = address(policyRouter).call{value: 1 ether}(
            abi.encodeCall(
                policyRouter.payNative,
                (stealth, salt, 0, type(uint256).max, _eph(), _meta(address(0), 0))
            )
        );
        assertFalse(ok);
    }

    /// FA-1: a successful deploy creates the account at `predictAddress(owner, policyHashOf(...))`,
    /// initialised with exactly the deployed policy.
    function check_factory_deployMatchesPrediction(
        address owner,
        address destination,
        uint256 delay,
        bytes32 limitsRoot
    ) public {
        address predicted = factory.predictAddress(
            owner, factory.policyHashOf(destination, delay, limitsRoot)
        );
        address account = factory.deploy(owner, destination, delay, limitsRoot);
        assertEq(account, predicted);
        PolicyAccount a = PolicyAccount(payable(account));
        assertEq(a.owner(), owner);
        assertEq(a.destination(), destination);
        assertEq(uint256(a.delay()), delay);
        assertEq(a.policyHash(), keccak256(abi.encode(destination, delay, limitsRoot)));
    }
}
