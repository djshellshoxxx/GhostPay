// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Shared fixture and independent EIP-712 / merkle helpers for the PolicyAccount tests.
/// The helpers recompute every hash by hand; they never ask the contracts for digests.
abstract contract PolicyBase is Test {
    PolicyAccount internal impl;
    PolicyAccountFactory internal factory;
    PolicyAccount internal acct;
    MockERC20 internal feeToken;
    MockERC20 internal token;
    MockERC20 internal tokenU; // unlimited leaf
    MockERC20 internal tokenBad; // finite limit with zero window

    uint256 internal ownerPk;
    address internal owner;
    address internal destination = makeAddr("coldDestination");
    address internal newDest = makeAddr("newDestination");
    address internal relayer = makeAddr("relayer");
    address internal payer = makeAddr("payer");
    address internal feeRecipient = makeAddr("feeRecipient");

    uint256 internal constant DELAY = 1 days;
    uint256 internal constant FLAT_FEE = 3e6;
    uint256 internal constant LIMIT = 1000e6;
    uint256 internal constant NATIVE_LIMIT = 10 ether;
    uint64 internal constant WINDOW = 1 days;
    uint256 internal constant START = 1_700_000_000;
    // secp256k1 group order
    uint256 internal constant N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant WITHDRAW_TH = keccak256(
        "Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)"
    );
    bytes32 internal constant CANCEL_WITHDRAW_TH = keccak256("CancelWithdraw(bytes32 id)");
    bytes32 internal constant PROPOSE_TH =
        keccak256("ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)");
    bytes32 internal constant CANCEL_DEST_TH = keccak256("CancelDestination(bytes32 id)");

    bytes32[4] internal leaves;
    bytes32 internal root;

    function setUp() public virtual {
        vm.warp(START);
        impl = new PolicyAccount();
        feeToken = new MockERC20("USD Coin", "USDC", 6);
        token = new MockERC20("Token", "TKN", 6);
        tokenU = new MockERC20("Unlimited", "UNL", 6);
        tokenBad = new MockERC20("Bad", "BAD", 6);
        factory = new PolicyAccountFactory(address(impl), address(feeToken), FLAT_FEE, feeRecipient);
        (owner, ownerPk) = makeAddrAndKey("stealthOwner");

        leaves[0] = _leaf(address(token), LIMIT, WINDOW);
        leaves[1] = _leaf(address(0), NATIVE_LIMIT, WINDOW);
        leaves[2] = _leaf(address(tokenU), type(uint256).max, 0);
        leaves[3] = _leaf(address(tokenBad), 100, 0);
        root = _hashPair(_hashPair(leaves[0], leaves[1]), _hashPair(leaves[2], leaves[3]));

        feeToken.mint(payer, 1000e6);
        vm.prank(payer);
        feeToken.approve(address(factory), type(uint256).max);
        acct = _deploy(owner, destination, DELAY, root);
        token.mint(address(acct), 1_000_000e6);
        tokenU.mint(address(acct), 1_000_000e6);
        tokenBad.mint(address(acct), 1_000_000e6);
        vm.deal(address(acct), 100 ether);
    }

    // ------------------------------------------------------------------ deployment

    function _deploy(address o, address d, uint256 delay, bytes32 limitsRoot)
        internal
        returns (PolicyAccount a)
    {
        vm.prank(payer);
        a = PolicyAccount(payable(factory.deploy(o, d, delay, limitsRoot)));
    }

    // ------------------------------------------------------------------ merkle

    function _leaf(address t, uint256 limit, uint64 window) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(t, limit, window))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Proof for leaf `i` of the 4-leaf fixture tree.
    function _lp(uint256 i) internal view returns (IPolicyAccount.LimitProof memory lp) {
        bytes32[] memory p = new bytes32[](2);
        p[0] = leaves[i ^ 1];
        uint256 j = (i / 2) ^ 1;
        p[1] = _hashPair(leaves[j * 2], leaves[j * 2 + 1]);
        uint256[4] memory lim = [LIMIT, NATIVE_LIMIT, type(uint256).max, 100];
        uint64[4] memory win = [WINDOW, WINDOW, 0, 0];
        lp = IPolicyAccount.LimitProof({limit: lim[i], windowSeconds: win[i], proof: p});
    }

    // ------------------------------------------------------------------ EIP-712

    function _domain(address a, uint256 chainId) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256("GhostPayPolicyAccount"), keccak256("1"), chainId, a
            )
        );
    }

    function _digestFor(address a, uint256 chainId, bytes32 structHash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("\x19\x01", _domain(a, chainId), structHash));
    }

    function _sign(uint256 pk, address a, uint256 chainId, bytes32 structHash)
        internal
        pure
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digestFor(a, chainId, structHash));
        return abi.encodePacked(r, s, v);
    }

    function _w(address t, uint256 amount, uint256 nonce)
        internal
        view
        returns (IPolicyAccount.Withdraw memory)
    {
        return IPolicyAccount.Withdraw({
            token: t,
            amount: amount,
            deadline: vm.getBlockTimestamp() + 1 hours,
            nonce: nonce,
            limitLeafHash: _fixtureLeaf(t)
        });
    }

    /// @dev Leaf of the fixture tree for `t` (zero for tokens that have none).
    function _fixtureLeaf(address t) internal view returns (bytes32) {
        if (t == address(token)) return leaves[0];
        if (t == address(0)) return leaves[1];
        if (t == address(tokenU)) return leaves[2];
        if (t == address(tokenBad)) return leaves[3];
        return bytes32(0);
    }

    /// @dev Order whose signed `limitLeafHash` is the leaf of `lp` for `t` (for custom trees).
    function _wFor(address t, uint256 amount, uint256 nonce, IPolicyAccount.LimitProof memory lp)
        internal
        view
        returns (IPolicyAccount.Withdraw memory w)
    {
        w = _w(t, amount, nonce);
        w.limitLeafHash = _leaf(t, lp.limit, lp.windowSeconds);
    }

    function _wHash(IPolicyAccount.Withdraw memory w) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(WITHDRAW_TH, w.token, w.amount, w.deadline, w.nonce, w.limitLeafHash)
            );
    }

    function _sigW(uint256 pk, address a, IPolicyAccount.Withdraw memory w)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, a, block.chainid, _wHash(w));
    }

    function _sigCancel(uint256 pk, address a, bytes32 id) internal view returns (bytes memory) {
        return _sign(pk, a, block.chainid, keccak256(abi.encode(CANCEL_WITHDRAW_TH, id)));
    }

    function _pHash(address d, uint256 deadline, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(PROPOSE_TH, d, deadline, nonce));
    }

    function _sigPropose(uint256 pk, address a, address d, uint256 deadline, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, a, block.chainid, _pHash(d, deadline, nonce));
    }

    function _sigCancelDest(uint256 pk, address a, bytes32 id)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, a, block.chainid, keccak256(abi.encode(CANCEL_DEST_TH, id)));
    }

    // ------------------------------------------------------------------ flows

    /// @dev Signs with the owner key and submits from `relayer`; returns the id.
    function _request(PolicyAccount a, address t, uint256 amount, uint256 nonce, uint256 lpIndex)
        internal
        returns (bytes32 id)
    {
        IPolicyAccount.Withdraw memory w = _w(t, amount, nonce);
        bytes memory sig = _sigW(ownerPk, address(a), w);
        IPolicyAccount.LimitProof memory lp = _lp(lpIndex);
        vm.prank(relayer);
        id = a.requestWithdraw(w, lp, sig);
    }

    /// @dev Request on the fixture account, wait the delay, execute.
    function _withdraw(address t, uint256 amount, uint256 nonce, uint256 lpIndex) internal {
        bytes32 id = _request(acct, t, amount, nonce, lpIndex);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        vm.prank(relayer);
        acct.executeWithdraw(id);
    }

    function _propose(address d, uint256 nonce) internal returns (bytes32 id) {
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sigPropose(ownerPk, address(acct), d, dl, nonce);
        vm.prank(relayer);
        id = acct.proposeDestination(d, dl, nonce, sig);
    }

    function _emptyLp() internal pure returns (IPolicyAccount.LimitProof memory lp) {
        lp = IPolicyAccount.LimitProof({limit: 0, windowSeconds: 0, proof: new bytes32[](0)});
    }
}
