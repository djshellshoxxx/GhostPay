// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GhostPayRouter} from "../../src/GhostPayRouter.sol";
import {IERC5564Announcer} from "../../src/interfaces/IERC5564Announcer.sol";
import {ERC5564Announcer} from "../utils/ERC5564Announcer.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {FeeOnTransferToken} from "../mocks/FeeOnTransferToken.sol";

/// @notice Echidna harness for GhostPayRouter. The harness is the payer. All stealth recipients come from
/// a small pool of code-less addresses so balance deltas are attributable.
/// Properties are `echidna_*` (must hold); `echidna_canary_*` are EXPECTED TO FAIL and prove the
/// success paths are reachable (a passing canary means the corresponding path was never exercised).
contract EchidnaRouter {
    GhostPayRouter internal router;
    MockERC20 internal token;
    FeeOnTransferToken internal fotToken;
    address internal constant FEE_RECIPIENT = address(0xFEE0000);
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 internal totalGrossErc20;
    uint256 internal totalGrossNative;
    bool internal perCallBroken;
    uint256 internal totalBuffer;
    uint256 internal okErc20;
    uint256 internal okNative;
    uint256 internal okBuffer;
    uint256 internal okFeeNonZero;

    constructor() payable {
        ERC5564Announcer a = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(a)), FEE_RECIPIENT);
        token = new MockERC20("T", "T", 6);
        token.mint(address(this), type(uint120).max);
        token.approve(address(router), type(uint256).max);
        fotToken = new FeeOnTransferToken();
        fotToken.mint(address(this), type(uint120).max);
        fotToken.approve(address(router), type(uint256).max);
    }

    receive() external payable {}

    function _s(uint8 i) internal pure returns (address) {
        return address(uint160(0xA0000 + (i % 4)));
    }

    function _meta(bytes1 tag, bytes4 marker, address asset, uint256 net)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(tag, marker, asset, net);
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234)));
    }

    function _sum(IERC20 t) internal view returns (uint256 s) {
        s = t.balanceOf(FEE_RECIPIENT);
        for (uint8 i = 0; i < 4; i++) s += t.balanceOf(_s(i));
    }

    function payErc20(uint8 si, uint256 gross, bytes1 tag) external {
        gross = gross % (type(uint120).max / 2);
        uint256 fee = gross * 25 / 10_000;
        uint256 sumBefore = _sum(token);
        uint256 feeBefore = token.balanceOf(FEE_RECIPIENT);
        bytes memory meta = _meta(tag, 0xa9059cbb, address(token), gross - fee);
        if (_tryErc20(si, gross, gross - fee, meta)) {
            okErc20++;
            if (fee != 0) okFeeNonZero++;
            totalGrossErc20 += gross;
            if (
                token.balanceOf(FEE_RECIPIENT) - feeBefore != fee
                    || _sum(token) - sumBefore != gross
            ) perCallBroken = true;
        }
    }

    function _tryErc20(uint8 si, uint256 gross, uint256 net, bytes memory meta)
        internal
        returns (bool ok)
    {
        try router.payERC20(token, _s(si), gross, net, block.timestamp, _eph(), meta) {
            ok = true;
        } catch {}
    }

    /// @dev Fee-on-transfer token must always revert, never leave a residue.
    function payFotToken(uint8 si, uint256 gross) external {
        gross = gross % (type(uint120).max / 2);
        uint256 net = gross - gross * 25 / 10_000;
        try router.payERC20(
            IERC20(address(fotToken)),
            _s(si),
            gross,
            0,
            block.timestamp,
            _eph(),
            _meta(0xab, 0xa9059cbb, address(fotToken), net)
        ) {} catch {}
    }

    function payNative(uint8 si, uint256 gross, bytes1 tag) external {
        gross = gross % (address(this).balance + 1);
        uint256 fee = gross * 25 / 10_000;
        uint256 net = gross - fee;
        address st = _s(si);
        uint256 before = FEE_RECIPIENT.balance + _s(0).balance + _s(1).balance + _s(2).balance
            + _s(3).balance;
        try router.payNative{value: gross}(
            st, net, block.timestamp, _eph(), _meta(tag, 0xeeeeeeee, NATIVE, net)
        ) {
            okNative++;
            totalGrossNative += gross;
            uint256 afterB = FEE_RECIPIENT.balance + _s(0).balance + _s(1).balance + _s(2).balance
                + _s(3).balance;
            if (afterB - before != gross) perCallBroken = true;
        } catch {}
    }

    function payWithBuffer(uint8 si, uint256 gross, uint256 buffer) external {
        gross = gross % (type(uint120).max / 2);
        buffer = buffer % (address(this).balance + 1);
        uint256 net = gross - gross * 25 / 10_000;
        uint256 sumBefore = _sum(token);
        try router.payERC20WithBuffer{value: buffer}(
            token,
            _s(si),
            gross,
            net,
            block.timestamp,
            buffer,
            _eph(),
            _meta(0xab, 0xa9059cbb, address(token), net)
        ) {
            okBuffer++;
            totalBuffer += buffer;
            totalGrossErc20 += gross;
            if (_sum(token) - sumBefore != gross) perCallBroken = true;
        } catch {}
    }

    /// @dev Anyone may try to push tokens or ETH at the router; the router must refuse plain ETH.
    function sendEthDirect(uint256 v) external {
        v = v % (address(this).balance + 1);
        (bool ok,) = address(router).call{value: v}("");
        if (ok) perCallBroken = true;
    }

    function directTokenTransfer(uint256 v) external {
        // Tokens sent straight to the router are unrecoverable by design (documented); the property below
        // excludes this ghost amount so it still detects any *router-caused* retention.
        v = v % 1e12;
        token.transfer(address(router), v);
        donated += v;
    }

    uint256 internal donated;

    // ---------------- properties ----------------

    function echidna_router_never_holds_tokens() external view returns (bool) {
        return token.balanceOf(address(router)) == donated && fotToken.balanceOf(address(router)) == 0
            && address(router).balance == 0;
    }

    function echidna_fee_plus_net_eq_gross() external view returns (bool) {
        return !perCallBroken && _sum(token) == totalGrossErc20;
    }

    function echidna_native_fee_plus_net_eq_gross() external view returns (bool) {
        uint256 s = FEE_RECIPIENT.balance + _s(0).balance + _s(1).balance + _s(2).balance
            + _s(3).balance;
        return !perCallBroken && s == totalGrossNative + totalBuffer;
    }

    function echidna_fee_recipient_only_gets_bps() external view returns (bool) {
        // FEE_RECIPIENT token balance <= 25 bps of total gross (+ rounding down only reduces it).
        return token.balanceOf(FEE_RECIPIENT) <= totalGrossErc20 * 25 / 10_000 + 1;
    }

    // canaries: EXPECTED TO FAIL
    function echidna_canary_erc20_success() external view returns (bool) {
        return okErc20 < 5;
    }

    function echidna_canary_native_success() external view returns (bool) {
        return okNative < 5;
    }

    function echidna_canary_buffer_success() external view returns (bool) {
        return okBuffer < 5;
    }

    function echidna_canary_nonzero_fee() external view returns (bool) {
        return okFeeNonZero < 5;
    }
}
