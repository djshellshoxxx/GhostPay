// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {IGhostPayPayerDelegate} from "../src/interfaces/IGhostPayPayerDelegate.sol";
import {GhostPayRouter} from "ghostpay-contracts/GhostPayRouter.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {IERC5564Announcer} from "ghostpay-contracts/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "ghostpay-utils/ERC5564Announcer.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";

/// @notice Drives a delegated payer EOA with valid, tampered, replayed and foreign-signed orders.
contract DelegateHandler is Test {
    GhostPayPayerDelegate public immutable IMPL;
    GhostPayRouter public immutable ROUTER;
    MockERC20 public immutable TOKEN;
    address public immutable PAYER;
    uint256 internal immutable PAYER_PK;
    address public immutable SPONSOR_FEE_TO;
    address public immutable STEALTH;

    uint256 public sumGross;
    uint256 public sumFee;
    uint256 public successes;
    uint256 public tamperSuccesses;
    uint256[] public usedNonces;
    bool internal haveFirst;
    IGhostPayPayerDelegate.PayIntent internal firstIntent;
    bytes internal firstData;
    bytes internal firstSig;

    constructor(
        GhostPayPayerDelegate impl,
        GhostPayRouter router,
        MockERC20 token,
        address payer,
        uint256 pk,
        address feeTo,
        address stealth_
    ) {
        IMPL = impl;
        ROUTER = router;
        TOKEN = token;
        PAYER = payer;
        PAYER_PK = pk;
        SPONSOR_FEE_TO = feeTo;
        STEALTH = stealth_;
    }

    function usedCount() external view returns (uint256) {
        return usedNonces.length;
    }

    function _data(uint256 gross, address to) internal view returns (bytes memory) {
        uint256 net = gross - gross * 25 / 10_000;
        return abi.encodeCall(
            IGhostPayRouter.payERC20,
            (
                IERC20(address(TOKEN)),
                to,
                gross,
                net,
                block.timestamp + 1 days,
                abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234))),
                abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), address(TOKEN), net)
            )
        );
    }

    function _sign(uint256 pk, address verifying, IGhostPayPayerDelegate.PayIntent memory i)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GhostPayPayerDelegate"),
                keccak256("1"),
                block.chainid,
                verifying
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            domain, keccak256(abi.encode(IMPL.PAYINTENT_TYPEHASH(), i))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @param mode 0 valid, 1 exact replay of first success, 2 sponsor raises fee, 3 calldata stealth swapped,
    /// 4 expired, 5 signed by a foreign key
    function pay(uint256 gross, uint256 fee, uint256 nonce, uint256 mode) external {
        mode %= 6;
        gross = bound(gross, 400, 1e24);
        fee = bound(fee, 0, 1e24);
        bytes memory data = _data(gross, mode == 3 ? address(0xBEEF) : STEALTH);
        IGhostPayPayerDelegate.PayIntent memory i = IGhostPayPayerDelegate.PayIntent({
            router: address(ROUTER),
            token: address(TOKEN),
            stealth: STEALTH,
            gross: gross,
            sponsorFee: fee,
            sponsorFeeTo: SPONSOR_FEE_TO,
            deadline: mode == 4 ? block.timestamp - 1 : block.timestamp + 1 hours,
            nonce: nonce,
            payloadHash: keccak256(data)
        });
        bytes memory sig = _sign(mode == 5 ? uint256(keccak256("foreign")) : PAYER_PK, PAYER, i);
        uint256 signedFee = fee;
        if (mode == 2) i.sponsorFee = fee + 1;
        bool replay = mode == 1 && haveFirst;
        if (replay) {
            i = firstIntent;
            data = firstData;
            sig = firstSig;
        }
        try GhostPayPayerDelegate(payable(PAYER)).pay(i, data, sig) {
            if (mode == 2 || mode == 3 || mode == 4 || mode == 5 || replay) ++tamperSuccesses;
            ++successes;
            sumGross += i.gross;
            sumFee += replay ? 0 : signedFee;
            usedNonces.push(i.nonce);
            if (!haveFirst) {
                haveFirst = true;
                firstIntent = i;
                firstData = data;
                firstSig = sig;
            }
        } catch {}
    }
}

contract GhostPayPayerDelegateInvariantTest is StdInvariant, Test {
    GhostPayPayerDelegate internal impl;
    GhostPayRouter internal router;
    MockERC20 internal token;
    DelegateHandler internal handler;
    address internal payer;
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal sponsorFeeTo = makeAddr("sponsorFeeTo");
    address internal stealth = makeAddr("stealth");
    uint256 internal constant INITIAL = type(uint112).max;

    function setUp() public {
        vm.warp(1_700_000_000);
        uint256 pk;
        (payer, pk) = makeAddrAndKey("payer");
        router =
            new GhostPayRouter(IERC5564Announcer(address(new ERC5564Announcer())), feeRecipient);
        impl = new GhostPayPayerDelegate();
        token = new MockERC20("T", "T", 6);
        token.mint(payer, INITIAL);
        // Equivalent of an applied EIP-7702 authorisation (code = 0xef0100 || delegate); the real
        // type-4 path is exercised in GhostPayPayerDelegate.t.sol.
        vm.etch(payer, abi.encodePacked(hex"ef0100", address(impl)));
        handler = new DelegateHandler(impl, router, token, payer, pk, sponsorFeeTo, stealth);
        targetContract(address(handler));
    }

    function invariant_payerAllowanceAlwaysZero() public view {
        assertEq(token.allowance(payer, address(router)), 0);
    }

    function invariant_payerNativeStaysZero() public view {
        assertEq(payer.balance, 0);
    }

    function invariant_delegationCodeUnchanged() public view {
        assertEq(payer.code, abi.encodePacked(hex"ef0100", address(impl)));
    }

    function invariant_noTamperedOrReplayedSuccess() public view {
        assertEq(handler.tamperSuccesses(), 0);
    }

    function invariant_exactDebitAndShares() public view {
        assertEq(
            INITIAL - token.balanceOf(payer), handler.sumGross() + handler.sumFee(), "payer debit"
        );
        assertEq(token.balanceOf(sponsorFeeTo), handler.sumFee(), "sponsor");
        assertEq(
            token.balanceOf(stealth) + token.balanceOf(feeRecipient),
            handler.sumGross(),
            "router split"
        );
    }

    function invariant_successfulNoncesUsed() public view {
        for (uint256 k; k < handler.usedCount(); ++k) {
            assertTrue(GhostPayPayerDelegate(payable(payer)).nonceUsed(handler.usedNonces(k)));
        }
        assertEq(token.balanceOf(address(impl)), 0);
    }
}
