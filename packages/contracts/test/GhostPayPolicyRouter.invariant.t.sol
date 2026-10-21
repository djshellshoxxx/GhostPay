// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {GhostPayPolicyRouter} from "../src/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {IGhostPayPolicyRouter} from "../src/interfaces/IGhostPayPolicyRouter.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";

/// @notice Drives the policy router with valid payments to predicted accounts and with payments to
/// arbitrary (mostly wrong) recipients, tracking ghost accounting.
contract PolicyRouterHandler is Test {
    GhostPayPolicyRouter public immutable ROUTER;
    PolicyAccountFactory public immutable FACTORY;
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address[] public tokens;
    address[] public payers;
    address[] public owners;
    bytes32[] public hashes;
    address[] public dests;
    address[] public outsiders; // addresses that are never policy accounts

    mapping(address => uint256) public sumGross;
    mapping(address => uint256) public sumFee;
    mapping(address => uint256) public sumNet;
    uint256 public nativeGross;
    uint256 public nativeFee;
    uint256 public nativeNet;
    uint256 public bufferTotal;
    uint256 public successes;
    uint256 public wrongAccepted; // payments to a non-predicted address that succeeded (must stay 0)

    constructor(
        GhostPayPolicyRouter router_,
        PolicyAccountFactory factory_,
        address[] memory tokens_
    ) {
        ROUTER = router_;
        FACTORY = factory_;
        tokens = tokens_;
        for (uint256 i; i < 3; i++) {
            owners.push(makeAddr(string.concat("owner", vm.toString(i))));
            address d = makeAddr(string.concat("dest", vm.toString(i)));
            dests.push(d);
            hashes.push(factory_.policyHashOf(d, 1 days, bytes32(0)));
            outsiders.push(makeAddr(string.concat("outsider", vm.toString(i))));
        }
        for (uint256 i; i < 3; i++) {
            address p = makeAddr(string.concat("payer", vm.toString(i)));
            payers.push(p);
            vm.deal(p, 1_000_000 ether);
            for (uint256 j; j < tokens_.length; j++) {
                (bool ok,) = tokens_[j].call(
                    abi.encodeWithSignature("mint(address,uint256)", p, type(uint112).max)
                );
                require(ok, "mint");
                vm.prank(p);
                (ok,) = tokens_[j].call(
                    abi.encodeWithSignature(
                        "approve(address,uint256)", address(router_), type(uint256).max
                    )
                );
                require(ok, "approve");
            }
        }
    }

    /// @notice Every policy account the handler can pay (3 owners x 3 hashes).
    function accounts() public view returns (address[] memory a) {
        a = new address[](owners.length * hashes.length);
        for (uint256 i; i < owners.length; i++) {
            for (uint256 j; j < hashes.length; j++) {
                a[i * hashes.length + j] = FACTORY.predictAddress(owners[i], hashes[j]);
            }
        }
    }

    function outsiderCount() external view returns (uint256) {
        return outsiders.length;
    }

    function _ref(uint256 seed) internal view returns (bytes32 r, address acct) {
        address o = owners[seed % owners.length];
        bytes32 h = hashes[(seed / owners.length) % hashes.length];
        r = keccak256(abi.encode(o, h));
        acct = FACTORY.predictAddress(o, h);
    }

    function _meta(address asset, uint256 net, bool native) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes1(0x77), native ? bytes4(0xeeeeeeee) : bytes4(0xa9059cbb), asset, net
        );
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x03), bytes32(uint256(99)));
    }

    function payERC20(uint256 tokenSeed, uint256 payerSeed, uint256 refSeed, uint256 gross)
        external
    {
        address t = tokens[tokenSeed % tokens.length];
        (bytes32 r, address acct) = _ref(refSeed);
        gross = bound(gross, 1, 1e30);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(payers[payerSeed % payers.length]);
        try ROUTER.payERC20(
            IERC20(t), acct, r, gross, net, block.timestamp, _eph(), _meta(t, net, false)
        ) {
            successes++;
            sumGross[t] += gross;
            sumFee[t] += fee;
            sumNet[t] += net;
        } catch {}
    }

    function payWrongRecipient(
        uint256 refSeed,
        uint256 outsiderSeed,
        uint256 crossSeed,
        uint256 gross
    ) external {
        (bytes32 r, address acct) = _ref(refSeed);
        // Either an outsider or another valid account that does not match `r`.
        address target;
        if (crossSeed % 2 == 0) {
            target = outsiders[outsiderSeed % outsiders.length];
        } else {
            (, target) = _ref(refSeed + 1 + outsiderSeed % 8);
        }
        if (target == acct) return;
        gross = bound(gross, 1, 1000 ether);
        uint256 net = gross - gross * 25 / 10_000;
        address t = tokens[0];
        vm.startPrank(payers[0]);
        try ROUTER.payERC20(
            IERC20(t), target, r, gross, net, block.timestamp, _eph(), _meta(t, net, false)
        ) {
            wrongAccepted++;
        } catch {}
        try ROUTER.payNative{value: gross}(
            target, r, net, block.timestamp, _eph(), _meta(NATIVE, net, true)
        ) {
            wrongAccepted++;
        } catch {}
        vm.stopPrank();
    }

    function payNative(uint256 payerSeed, uint256 refSeed, uint256 gross) external {
        (bytes32 r, address acct) = _ref(refSeed);
        gross = bound(gross, 1, 1000 ether);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        vm.prank(payers[payerSeed % payers.length]);
        ROUTER.payNative{value: gross}(
            acct, r, net, block.timestamp, _eph(), _meta(NATIVE, net, true)
        );
        successes++;
        nativeGross += gross;
        nativeFee += fee;
        nativeNet += net;
    }

    function payBuffer(uint256 tokenSeed, uint256 refSeed, uint256 gross, uint256 buffer) external {
        address t = tokens[tokenSeed % tokens.length];
        (bytes32 r, address acct) = _ref(refSeed);
        gross = bound(gross, 1, 1e30);
        buffer = bound(buffer, 1, 10 ether);
        uint256 net = gross - gross * 25 / 10_000;
        bytes memory meta = _meta(t, net, false);
        vm.prank(payers[refSeed % payers.length]);
        try ROUTER.payERC20WithBuffer{value: buffer}(
            IERC20(t), acct, r, gross, net, block.timestamp, buffer, _eph(), meta
        ) {
            successes++;
            sumGross[t] += gross;
            sumFee[t] += gross - net;
            sumNet[t] += net;
            bufferTotal += buffer;
        } catch {}
    }

    /// @dev Deploys a paid-to account mid-run: payments must keep working once it has code.
    function deployAccount(uint256 refSeed) external {
        (, address acct) = _ref(refSeed);
        if (acct.code.length != 0) return;
        address d = dests[(refSeed / owners.length) % hashes.length];
        require(
            FACTORY.deploy(owners[refSeed % owners.length], d, 1 days, bytes32(0)) == acct,
            "predicted"
        );
    }

    function warpTime(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 1 days));
    }
}

contract GhostPayPolicyRouterInvariantTest is StdInvariant, Test {
    GhostPayPolicyRouter internal router;
    PolicyAccountFactory internal factory;
    PolicyRouterHandler internal handler;
    address internal feeRecipient = makeAddr("feeRecipient");
    address[] internal tokens;

    function setUp() public {
        ERC5564Announcer announcer = new ERC5564Announcer();
        factory =
            new PolicyAccountFactory(address(new PolicyAccount()), address(0), 0, feeRecipient);
        router =
            new GhostPayPolicyRouter(IERC5564Announcer(address(announcer)), feeRecipient, factory);
        tokens.push(address(new MockERC20("A", "A", 2)));
        tokens.push(address(new MockERC20("B", "B", 6)));
        tokens.push(address(new MockERC20("C", "C", 18)));
        tokens.push(address(new NoReturnToken()));
        tokens.push(address(new FeeOnTransferToken()));
        handler = new PolicyRouterHandler(router, factory, tokens);
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](6);
        sel[0] = PolicyRouterHandler.payERC20.selector;
        sel[1] = PolicyRouterHandler.payNative.selector;
        sel[2] = PolicyRouterHandler.payBuffer.selector;
        sel[3] = PolicyRouterHandler.payWrongRecipient.selector;
        sel[4] = PolicyRouterHandler.deployAccount.selector;
        sel[5] = PolicyRouterHandler.warpTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function _recipientsBalance(address t) internal view returns (uint256 total) {
        total = IERC20(t).balanceOf(feeRecipient);
        address[] memory a = handler.accounts();
        for (uint256 i; i < a.length; i++) {
            total += IERC20(t).balanceOf(a[i]);
        }
    }

    /// @notice The router never keeps tokens or native value.
    function invariant_routerHoldsNothing() public view {
        for (uint256 i; i < tokens.length; i++) {
            assertEq(IERC20(tokens[i]).balanceOf(address(router)), 0, "router token balance");
        }
        assertEq(address(router).balance, 0, "router native balance");
    }

    /// @notice Funds only ever reach predicted policy accounts or the fee recipient.
    function invariant_onlyPolicyAccountsReceive() public view {
        assertEq(handler.wrongAccepted(), 0, "non-predicted recipient accepted");
        for (uint256 i; i < handler.outsiderCount(); i++) {
            address o = handler.outsiders(i);
            assertEq(o.balance, 0, "outsider native");
            for (uint256 j; j < tokens.length; j++) {
                assertEq(IERC20(tokens[j]).balanceOf(o), 0, "outsider token");
            }
        }
    }

    /// @notice Sum of account + fee balances equals the sum of successful grosses (per token).
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
        address[] memory a = handler.accounts();
        for (uint256 i; i < a.length; i++) {
            total += a[i].balance;
        }
        assertEq(total, handler.nativeGross() + handler.bufferTotal(), "native recipients+fee");
        assertEq(handler.nativeFee() + handler.nativeNet(), handler.nativeGross());
        assertEq(feeRecipient.balance, handler.nativeFee(), "buffer is never charged a fee");
    }

    /// @notice The fee-on-transfer token can never complete a payment.
    function invariant_feeOnTransferNeverSucceeds() public view {
        assertEq(handler.sumGross(tokens[4]), 0);
    }
}
