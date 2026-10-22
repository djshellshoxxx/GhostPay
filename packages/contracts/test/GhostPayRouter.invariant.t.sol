// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GhostPayRouter} from "../src/GhostPayRouter.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";

/// @notice Drives the router with arbitrary valid and invalid payments and tracks ghost accounting.
contract RouterHandler is Test {
    GhostPayRouter public immutable ROUTER;
    address public immutable FEE_RECIPIENT;
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address[] public tokens; // standard 2/6/18 decimals + no-return + fee-on-transfer (always rejected)
    address[] public stealths;
    address[] public payers;

    mapping(address => uint256) public sumGross;
    mapping(address => uint256) public sumFee;
    mapping(address => uint256) public sumNet;
    uint256 public nativeGross;
    uint256 public nativeFee;
    uint256 public nativeNet;
    uint256 public bufferTotal;
    uint256 public successes;
    uint256 public rejections;

    constructor(GhostPayRouter router_, address feeRecipient_, address[] memory tokens_) {
        ROUTER = router_;
        FEE_RECIPIENT = feeRecipient_;
        tokens = tokens_;
        for (uint256 i; i < 4; i++) {
            stealths.push(makeAddr(string.concat("stealth", vm.toString(i))));
            address p = makeAddr(string.concat("payer", vm.toString(i)));
            payers.push(p);
            vm.deal(p, 1_000_000 ether);
            for (uint256 j; j < tokens_.length; j++) {
                _mint(tokens_[j], p, type(uint112).max);
                vm.prank(p);
                // Low-level: the no-return token has no bool return value to decode.
                (bool ok,) = tokens_[j].call(
                    abi.encodeWithSignature(
                        "approve(address,uint256)", address(router_), type(uint256).max
                    )
                );
                require(ok, "approve");
            }
        }
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function stealthCount() external view returns (uint256) {
        return stealths.length;
    }

    function _mint(address t, address to, uint256 amt) internal {
        (bool ok,) = t.call(abi.encodeWithSignature("mint(address,uint256)", to, amt));
        require(ok, "mint");
    }

    function _meta(address asset, uint256 net, bool native) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes1(0x77), native ? bytes4(0xeeeeeeee) : bytes4(0xa9059cbb), asset, net
        );
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x03), bytes32(uint256(99)));
    }

    function payERC20(uint256 tokenSeed, uint256 payerSeed, uint256 stealthSeed, uint256 gross)
        external
    {
        address t = tokens[tokenSeed % tokens.length];
        address payer = payers[payerSeed % payers.length];
        address st = stealths[stealthSeed % stealths.length];
        gross = bound(gross, 1, 1e30);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(payer);
        try ROUTER.payERC20(
            IERC20(t), st, gross, net, block.timestamp, _eph(), _meta(t, net, false)
        ) {
            successes++;
            sumGross[t] += gross;
            sumFee[t] += fee;
            sumNet[t] += net;
        } catch {
            rejections++;
        }
    }

    function payBadMetadata(uint256 tokenSeed, uint256 stealthSeed, uint256 gross, uint256 skew)
        external
    {
        address t = tokens[tokenSeed % tokens.length];
        address st = stealths[stealthSeed % stealths.length];
        gross = bound(gross, 1, 1e30);
        uint256 net = gross - gross * 25 / 10_000;
        skew = bound(skew, 1, 1e6);
        vm.prank(payers[0]);
        try ROUTER.payERC20(
            IERC20(t), st, gross, 0, block.timestamp, _eph(), _meta(t, net + skew, false)
        ) {
            revert("bad metadata accepted");
        } catch {
            rejections++;
        }
    }

    function payNative(uint256 payerSeed, uint256 stealthSeed, uint256 gross) external {
        address payer = payers[payerSeed % payers.length];
        address st = stealths[stealthSeed % stealths.length];
        gross = bound(gross, 1, 1000 ether);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(payer);
        ROUTER.payNative{value: gross}(st, net, block.timestamp, _eph(), _meta(NATIVE, net, true));
        successes++;
        nativeGross += gross;
        nativeFee += fee;
        nativeNet += net;
    }

    function payBuffer(
        uint256 tokenSeed,
        uint256 payerSeed,
        uint256 stealthSeed,
        uint256 gross,
        uint256 buffer
    ) external {
        address t = tokens[tokenSeed % tokens.length];
        address payer = payers[payerSeed % payers.length];
        address st = stealths[stealthSeed % stealths.length];
        gross = bound(gross, 1, 1e30);
        buffer = bound(buffer, 1, 10 ether);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(payer);
        try ROUTER.payERC20WithBuffer{value: buffer}(
            IERC20(t), st, gross, net, block.timestamp, buffer, _eph(), _meta(t, net, false)
        ) {
            successes++;
            sumGross[t] += gross;
            sumFee[t] += fee;
            sumNet[t] += net;
            bufferTotal += buffer;
        } catch {
            rejections++;
        }
    }

    /// @dev Attacker donates tokens / forces ETH to the router; the *pay* flows must still not retain.
    function warpTime(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 1 days));
    }
}

contract GhostPayRouterInvariantTest is StdInvariant, Test {
    GhostPayRouter internal router;
    RouterHandler internal handler;
    address internal feeRecipient = makeAddr("feeRecipient");
    address[] internal tokens;

    function setUp() public {
        ERC5564Announcer announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        tokens.push(address(new MockERC20("A", "A", 2)));
        tokens.push(address(new MockERC20("B", "B", 6)));
        tokens.push(address(new MockERC20("C", "C", 18)));
        tokens.push(address(new NoReturnToken()));
        tokens.push(address(new FeeOnTransferToken()));
        handler = new RouterHandler(router, feeRecipient, tokens);
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](5);
        sel[0] = RouterHandler.payERC20.selector;
        sel[1] = RouterHandler.payNative.selector;
        sel[2] = RouterHandler.payBuffer.selector;
        sel[3] = RouterHandler.payBadMetadata.selector;
        sel[4] = RouterHandler.warpTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function _recipientsBalance(address t) internal view returns (uint256 total) {
        total = IERC20(t).balanceOf(feeRecipient);
        for (uint256 i; i < handler.stealthCount(); i++) {
            total += IERC20(t).balanceOf(handler.stealths(i));
        }
    }

    /// @notice The router never keeps tokens or native value.
    function invariant_routerHoldsNothing() public view {
        for (uint256 i; i < tokens.length; i++) {
            assertEq(IERC20(tokens[i]).balanceOf(address(router)), 0, "router token balance");
        }
        assertEq(address(router).balance, 0, "router native balance");
    }

    /// @notice Sum of recipient + fee balance deltas equals the sum of successful grosses (per token).
    function invariant_recipientsPlusFeeEqualGrosses() public view {
        for (uint256 i; i < tokens.length; i++) {
            address t = tokens[i];
            assertEq(_recipientsBalance(t), handler.sumGross(t), "recipients+fee == gross");
            assertEq(handler.sumFee(t) + handler.sumNet(t), handler.sumGross(t), "fee+net == gross");
            assertEq(IERC20(t).balanceOf(feeRecipient), handler.sumFee(t), "fee recipient delta");
        }
    }

    /// @notice Same accounting for the native asset, including untaxed gas buffers.
    function invariant_nativeAccounting() public view {
        uint256 total = feeRecipient.balance;
        for (uint256 i; i < handler.stealthCount(); i++) {
            total += handler.stealths(i).balance;
        }
        assertEq(total, handler.nativeGross() + handler.bufferTotal(), "native recipients+fee");
        assertEq(handler.nativeFee() + handler.nativeNet(), handler.nativeGross());
        assertEq(feeRecipient.balance, handler.nativeFee(), "buffer is never charged a fee");
    }

    /// @notice The fee-on-transfer token can never complete a payment.
    function invariant_feeOnTransferNeverSucceeds() public view {
        address fot = tokens[4];
        assertEq(handler.sumGross(fot), 0);
        assertEq(IERC20(fot).balanceOf(feeRecipient), 0);
    }
}
