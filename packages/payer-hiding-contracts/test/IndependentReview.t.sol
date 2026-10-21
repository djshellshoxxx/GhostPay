// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {GhostPayPayRelay} from "../src/GhostPayPayRelay.sol";
import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {IGhostPayPayRelay} from "../src/interfaces/IGhostPayPayRelay.sol";
import {IGhostPayPayerDelegate} from "../src/interfaces/IGhostPayPayerDelegate.sol";
import {PHBase} from "./PHBase.t.sol";

/// @dev Minimal NFT used only to show the delegated-EOA receive limitation.
contract ReviewNft is ERC721("ReviewNft", "RNFT") {
    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @notice PoCs from the independent AI review (docs/remote/privacy-specs/audit-payer-sponsor.md,
/// section "Independent AI review (opus)"). Each test demonstrates a Low/Info behaviour; none is a
/// fund-loss bug beyond what the payer signed.
contract IndependentReviewTest is PHBase {
    GhostPayPayRelay internal relay;
    GhostPayPayerDelegate internal delegate;

    function setUp() public override {
        super.setUp();
        relay = new GhostPayPayRelay();
        delegate = new GhostPayPayerDelegate();
        token.mint(payer, 10 * GROSS);
    }

    // ---------- helpers ----------

    function _relayIntent(uint256 nonce)
        internal
        view
        returns (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig)
    {
        data = _plainCalldata(address(token), stealth, GROSS);
        i = IGhostPayPayRelay.PayIntent({
            payer: payer,
            router: address(router),
            token: address(token),
            stealth: stealth,
            gross: GROSS,
            sponsorFee: SPONSOR_FEE,
            sponsorFeeTo: sponsorFeeTo,
            deadline: T0 + 1 hours,
            nonce: nonce,
            payloadHash: keccak256(data)
        });
        sig = _sig(
            payerPk,
            _typed(relay.DOMAIN_SEPARATOR(), keccak256(abi.encode(relay.PAYINTENT_TYPEHASH(), i)))
        );
    }

    function _noPermit() internal pure returns (IGhostPayPayRelay.PermitSig memory) {
        return IGhostPayPayRelay.PermitSig({value: 0, deadline: 0, v: 0, r: 0, s: 0});
    }

    function _delegateDomain() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPayPayerDelegate"),
                keccak256("1"),
                block.chainid,
                payer
            )
        );
    }

    function _delegateIntent(uint256 nonce)
        internal
        view
        returns (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig)
    {
        data = _plainCalldata(address(token), stealth, GROSS);
        i = IGhostPayPayerDelegate.PayIntent({
            router: address(router),
            token: address(token),
            stealth: stealth,
            gross: GROSS,
            sponsorFee: SPONSOR_FEE,
            sponsorFeeTo: sponsorFeeTo,
            deadline: T0 + 1 hours,
            nonce: nonce,
            payloadHash: keccak256(data)
        });
        sig = _sig(
            payerPk,
            _typed(_delegateDomain(), keccak256(abi.encode(delegate.PAYINTENT_TYPEHASH(), i)))
        );
    }

    function _delegateTo(address impl) internal {
        Vm.SignedDelegation memory sd = vm.signDelegation(impl, payerPk);
        vm.attachDelegation(sd);
    }

    // ---------- IR-01: no on-chain cancellation; "soft cancels" are revived ----------

    /// Relay: the payer "cancels" a signed order by revoking the allowance, later approves again for an
    /// unrelated reason; the old, still unexpired order can then be executed by anyone.
    function test_IR01_relay_revokedOrderRevivesAfterReApproval() public {
        (IGhostPayPayRelay.PayIntent memory i, bytes memory data, bytes memory sig) =
            _relayIntent(7);

        vm.prank(payer);
        token.approve(address(relay), 0); // intended cancellation
        vm.prank(sponsor);
        vm.expectRevert();
        relay.pay(i, data, sig, _noPermit());
        assertFalse(relay.nonceUsed(payer, 7), "nothing marks the order as cancelled");

        vm.prank(payer);
        token.approve(address(relay), type(uint256).max); // later, for a new order

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        relay.pay(i, data, sig, _noPermit());
        assertTrue(relay.nonceUsed(payer, 7), "old order executed after re-approval");
    }

    /// Delegate: the payer clears the EIP-7702 delegation to "cancel" an unsubmitted order, then
    /// re-delegates (for example for the next payment); the old unexpired order is live again.
    function test_IR01_delegate_clearedOrderRevivesAfterReDelegation() public {
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) =
            _delegateIntent(7);

        _delegateTo(address(delegate));
        Vm.SignedDelegation memory clear = vm.signDelegation(address(0), payerPk);
        vm.attachDelegation(clear);
        assertEq(payer.code.length, 0);

        _delegateTo(address(delegate));
        uint256 before = token.balanceOf(payer);
        vm.prank(makeAddr("stranger"));
        GhostPayPayerDelegate(payable(payer)).pay(i, data, sig);
        assertEq(before - token.balanceOf(payer), GROSS + SPONSOR_FEE, "old order executed");
    }

    // ---------- IR-02: delegate zeroes a pre-existing payer -> router allowance ----------

    function test_IR02_delegate_wipesPreexistingRouterAllowance() public {
        _delegateTo(address(delegate));
        vm.prank(payer);
        token.approve(address(router), 5 * GROSS); // payer's own standing approval
        (IGhostPayPayerDelegate.PayIntent memory i, bytes memory data, bytes memory sig) =
            _delegateIntent(1);
        vm.prank(sponsor);
        GhostPayPayerDelegate(payable(payer)).pay(i, data, sig);
        assertEq(token.allowance(payer, address(router)), 0, "standing approval silently removed");
    }

    // ---------- IR-03: delegated EOA cannot receive ERC-721 safe transfers ----------

    function test_IR03_delegatedPayerRejectsSafeNftTransfer() public {
        ReviewNft nft = new ReviewNft();
        address from = makeAddr("nftHolder");
        nft.mint(from, 1);
        _delegateTo(address(delegate));
        vm.prank(from);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, payer));
        nft.safeTransferFrom(from, payer, 1);
    }
}
