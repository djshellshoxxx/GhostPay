// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {GhostPayPayRelay} from "../src/GhostPayPayRelay.sol";
import {IGhostPayPayRelay} from "../src/interfaces/IGhostPayPayRelay.sol";
import {GhostPayRouter} from "ghostpay-contracts/GhostPayRouter.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {IERC5564Announcer} from "ghostpay-contracts/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "ghostpay-utils/ERC5564Announcer.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";

/// @notice Drives the relay with valid, tampered, replayed and donated inputs and keeps ghost accounting.
contract RelayHandler is Test {
    GhostPayPayRelay public immutable RELAY;
    GhostPayRouter public immutable ROUTER;
    address public immutable FEE_RECIPIENT;
    address public immutable SPONSOR_FEE_TO;

    MockERC20[] public tokens;
    address[] public payers;
    uint256[] public payerKeys;
    address[] public stealths;

    mapping(address token => uint256) public sumGross;
    mapping(address token => uint256) public sumSponsorFee;
    mapping(address token => uint256) public donated;
    mapping(address token => uint256) public minted;
    uint256 public successes;
    uint256 public rejections;
    // (payer, nonce) pairs that succeeded
    address[] public usedPayer;
    uint256[] public usedNonce;
    // sponsor-controllable fields that must never reach a different destination
    uint256 public tamperSuccesses;
    bool public haveFirst;
    IGhostPayPayRelay.PayIntent internal firstIntent;
    bytes internal firstData;
    bytes internal firstSig;

    constructor(
        GhostPayPayRelay relay_,
        GhostPayRouter router_,
        address feeRecipient_,
        address sponsorFeeTo_
    ) {
        RELAY = relay_;
        ROUTER = router_;
        FEE_RECIPIENT = feeRecipient_;
        SPONSOR_FEE_TO = sponsorFeeTo_;
        uint8[3] memory decs = [uint8(2), 6, 18];
        for (uint256 k; k < 3; ++k) {
            MockERC20 t = new MockERC20("T", "T", decs[k]);
            tokens.push(t);
        }
        for (uint256 k; k < 3; ++k) {
            (address a, uint256 pk) = makeAddrAndKey(string.concat("payer", vm.toString(k)));
            payers.push(a);
            payerKeys.push(pk);
            stealths.push(makeAddr(string.concat("stealth", vm.toString(k))));
            for (uint256 j; j < 3; ++j) {
                tokens[j].mint(a, type(uint112).max);
                minted[address(tokens[j])] += type(uint112).max;
                vm.prank(a);
                tokens[j].approve(address(relay_), type(uint256).max);
            }
        }
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 k) external view returns (address) {
        return address(tokens[k]);
    }

    function payerCount() external view returns (uint256) {
        return payers.length;
    }

    function stealthAt(uint256 k) external view returns (address) {
        return stealths[k];
    }

    function payerAt(uint256 k) external view returns (address) {
        return payers[k];
    }

    function usedCount() external view returns (uint256) {
        return usedPayer.length;
    }

    function donate(uint256 tokenSel, uint256 amount) external {
        MockERC20 t = tokens[tokenSel % 3];
        amount = bound(amount, 0, 1e30);
        t.mint(address(RELAY), amount);
        donated[address(t)] += amount;
    }

    function _calldata(address t, address stealthTo, uint256 gross)
        internal
        view
        returns (bytes memory)
    {
        uint256 net = gross - gross * 25 / 10_000;
        return abi.encodeCall(
            IGhostPayRouter.payERC20,
            (
                IERC20(t),
                stealthTo,
                gross,
                net,
                block.timestamp + 1 days,
                abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234))),
                abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), t, net)
            )
        );
    }

    function _sign(uint256 pk, IGhostPayPayRelay.PayIntent memory i)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            RELAY.DOMAIN_SEPARATOR(), keccak256(abi.encode(RELAY.PAYINTENT_TYPEHASH(), i))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @param mode 0 = valid, 1 = replay of first success, 2 = tampered fee, 3 = tampered stealth in
    /// calldata, 4 = expired
    function pay(
        uint256 payerSel,
        uint256 tokenSel,
        uint256 gross,
        uint256 fee,
        uint256 nonce,
        uint256 mode
    ) external {
        payerSel %= 3;
        mode %= 5;
        address t = address(tokens[tokenSel % 3]);
        gross = bound(gross, 400, 1e24);
        fee = bound(fee, 0, 1e24);
        bytes memory data = _calldata(t, mode == 3 ? address(0xBEEF) : stealths[payerSel], gross);
        IGhostPayPayRelay.PayIntent memory i = IGhostPayPayRelay.PayIntent({
            payer: payers[payerSel],
            router: address(ROUTER),
            token: t,
            stealth: stealths[payerSel],
            gross: gross,
            sponsorFee: fee,
            sponsorFeeTo: SPONSOR_FEE_TO,
            deadline: mode == 4 ? block.timestamp - 1 : block.timestamp + 1 hours,
            nonce: nonce,
            payloadHash: keccak256(data)
        });
        bytes memory sig = _sign(payerKeys[payerSel], i);
        if (mode == 2) i.sponsorFee = fee + 1; // sponsor tries to raise its own fee after signing
        bool replay = mode == 1 && haveFirst;
        if (replay) {
            // exact replay of the first successful order (same intent, calldata and signature)
            i = firstIntent;
            data = firstData;
            sig = firstSig;
        }
        _submit(i, data, sig, mode, replay, fee);
    }

    function _submit(
        IGhostPayPayRelay.PayIntent memory i,
        bytes memory data,
        bytes memory sig,
        uint256 mode,
        bool replay,
        uint256 signedFee
    ) internal {
        try RELAY.pay(i, data, sig, IGhostPayPayRelay.PermitSig(0, 0, 0, 0, 0)) {
            // Only the unmodified, in-time, first-use orders may succeed.
            if (mode == 2 || mode == 3 || mode == 4 || replay) ++tamperSuccesses;
            ++successes;
            sumGross[i.token] += i.gross;
            sumSponsorFee[i.token] += replay ? 0 : signedFee;
            if (!haveFirst) {
                haveFirst = true;
                firstIntent = i;
                firstData = data;
                firstSig = sig;
            }
            usedPayer.push(i.payer);
            usedNonce.push(i.nonce);
        } catch {
            ++rejections;
        }
    }
}

contract GhostPayPayRelayInvariantTest is StdInvariant, Test {
    GhostPayPayRelay internal relay;
    GhostPayRouter internal router;
    RelayHandler internal handler;
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal sponsorFeeTo = makeAddr("sponsorFeeTo");

    function setUp() public {
        vm.warp(1_700_000_000);
        ERC5564Announcer announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        relay = new GhostPayPayRelay();
        handler = new RelayHandler(relay, router, feeRecipient, sponsorFeeTo);
        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](2);
        sels[0] = RelayHandler.pay.selector;
        sels[1] = RelayHandler.donate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// Relay never holds more than what was donated: it keeps no payment funds (PH-2-REQ-4).
    function invariant_relayHoldsOnlyDonations() public view {
        for (uint256 k; k < handler.tokenCount(); ++k) {
            address t = handler.tokenAt(k);
            assertEq(IERC20(t).balanceOf(address(relay)), handler.donated(t));
        }
    }

    /// Tamper, replay and expired modes never succeed (sponsor cannot alter signed fields).
    function invariant_noTamperedOrReplayedSuccess() public view {
        assertEq(handler.tamperSuccesses(), 0);
    }

    /// Total payer debit equals sum(gross + sponsorFee); stealth and fee recipients receive exact shares.
    function invariant_conservationAndExactShares() public view {
        for (uint256 k; k < handler.tokenCount(); ++k) {
            address t = handler.tokenAt(k);
            uint256 debit;
            uint256 stealthSum;
            for (uint256 p; p < handler.payerCount(); ++p) {
                debit += handler.minted(t) / handler.payerCount()
                - IERC20(t).balanceOf(handler.payerAt(p));
                stealthSum += IERC20(t).balanceOf(handler.stealthAt(p));
            }
            assertEq(debit, handler.sumGross(t) + handler.sumSponsorFee(t), "payer debit");
            assertEq(IERC20(t).balanceOf(sponsorFeeTo), handler.sumSponsorFee(t), "sponsor fee");
            assertEq(
                stealthSum + IERC20(t).balanceOf(feeRecipient),
                handler.sumGross(t),
                "stealth+router fee"
            );
        }
    }

    /// Every success marked its (payer, nonce) as used, and nonces are single-use.
    function invariant_successfulNoncesAreUsed() public view {
        for (uint256 k; k < handler.usedCount(); ++k) {
            assertTrue(relay.nonceUsed(handler.usedPayer(k), handler.usedNonce(k)));
        }
    }

    function invariant_callSummary() public view {
        assertEq(handler.successes(), handler.usedCount());
    }
}
