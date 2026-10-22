// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {GhostPayPayRelay} from "../../src/GhostPayPayRelay.sol";
import {IGhostPayPayRelay} from "../../src/interfaces/IGhostPayPayRelay.sol";
import {GhostPayRouter} from "ghostpay-contracts/GhostPayRouter.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {IERC5564Announcer} from "ghostpay-contracts/interfaces/IERC5564Announcer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC5564Announcer} from "ghostpay-utils/ERC5564Announcer.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";

interface Hevm {
    function sign(uint256 sk, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 sk) external returns (address);
    function prank(address who) external;
}

/// @notice Echidna harness for GhostPayPayRelay (PH-2). The harness signs payment orders for a fixed
/// payer key (hevm.sign) and submits them as an arbitrary sponsor, also in tampered / replayed / expired
/// variants. `echidna_canary_*` are EXPECTED TO FAIL (they prove the success path is reached).
/// @dev Echidna's EVM reports chain id 1; this subclass only overrides the constructor chain check.
contract RelayForEchidna is GhostPayPayRelay {
    function _chainId() internal pure override returns (uint256) {
        return CHAIN_LOCAL;
    }
}

contract EchidnaRelay {
    Hevm internal constant HEVM = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 internal constant PAYER_PK = 0xA11CE5EC12E7;
    uint256 internal constant MINTED = 1e30;
    address internal constant STEALTH = address(0xB0001);
    address internal constant FEE_TO = address(0xC0001);
    address internal constant ROUTER_FEE = address(0xD0001);

    GhostPayPayRelay internal relay;
    GhostPayRouter internal router;
    MockERC20 internal token;
    address internal payer;

    uint256 internal sumGross;
    uint256 internal sumFee;
    uint256 internal okPays;
    bool internal tamperOk;
    bool internal haveFirst;
    IGhostPayPayRelay.PayIntent internal firstI;
    bytes internal firstData;
    bytes internal firstSig;

    constructor() payable {
        router = new GhostPayRouter(IERC5564Announcer(address(new ERC5564Announcer())), ROUTER_FEE);
        relay = new RelayForEchidna();
        token = new MockERC20("T", "T", 6);
        payer = HEVM.addr(PAYER_PK);
        token.mint(payer, MINTED);
        HEVM.prank(payer);
        token.approve(address(relay), type(uint256).max);
    }

    function _calldata(uint256 gross, address to) internal view returns (bytes memory) {
        uint256 net = gross - gross * 25 / 10_000;
        return abi.encodeCall(
            IGhostPayRouter.payERC20,
            (
                IERC20(address(token)),
                to,
                gross,
                net,
                block.timestamp + 1 days,
                abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234))),
                abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), address(token), net)
            )
        );
    }

    function pay(uint256 gross, uint256 fee, uint8 nonceSel, uint8 mode) public {
        mode %= 5;
        gross = 400 + (gross % 1e12);
        fee = fee % 1e12;
        uint256[4] memory ns = [uint256(0), 1, 256, type(uint256).max];
        bytes memory data = _calldata(gross, mode == 3 ? address(0xBEEF) : STEALTH);
        IGhostPayPayRelay.PayIntent memory i = IGhostPayPayRelay.PayIntent({
            payer: payer,
            router: address(router),
            token: address(token),
            stealth: STEALTH,
            gross: gross,
            sponsorFee: fee,
            sponsorFeeTo: FEE_TO,
            deadline: mode == 4 ? block.timestamp - 1 : block.timestamp + 1 hours,
            nonce: ns[nonceSel % 4],
            payloadHash: keccak256(data)
        });
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                relay.DOMAIN_SEPARATOR(),
                keccak256(abi.encode(relay.PAYINTENT_TYPEHASH(), i))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = HEVM.sign(PAYER_PK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        uint256 signedFee = fee;
        if (mode == 2) i.sponsorFee = fee + 1;
        bool replay = mode == 1 && haveFirst;
        if (replay) {
            i = firstI;
            data = firstData;
            sig = firstSig;
        }
        try relay.pay(i, data, sig, IGhostPayPayRelay.PermitSig(0, 0, 0, 0, 0)) {
            if (mode == 2 || mode == 3 || mode == 4 || replay) tamperOk = true;
            ++okPays;
            sumGross += i.gross;
            sumFee += replay ? 0 : signedFee;
            if (!haveFirst) {
                haveFirst = true;
                firstI = i;
                firstData = data;
                firstSig = sig;
            }
        } catch {}
    }

    // ---- properties ----

    function echidna_relay_never_holds_tokens() external view returns (bool) {
        return token.balanceOf(address(relay)) == 0;
    }

    function echidna_no_tampered_or_replayed_success() external view returns (bool) {
        return !tamperOk;
    }

    function echidna_conservation() external view returns (bool) {
        return token.balanceOf(STEALTH) + token.balanceOf(ROUTER_FEE) == sumGross
            && token.balanceOf(FEE_TO) == sumFee
            && MINTED - token.balanceOf(payer) == sumGross + sumFee;
    }

    function echidna_no_residual_allowance() external view returns (bool) {
        return token.allowance(address(relay), address(router)) == 0;
    }

    /// @dev EXPECTED TO FAIL: proves a successful payment is reachable.
    function echidna_canary_pay_reachable() external view returns (bool) {
        return okPays == 0;
    }
}
