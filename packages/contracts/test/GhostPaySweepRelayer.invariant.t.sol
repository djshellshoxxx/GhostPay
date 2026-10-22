// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";

import {SweepBase} from "./SweepBase.t.sol";
import {IGhostPaySweepRelayer} from "../src/interfaces/IGhostPaySweepRelayer.sol";
import {GhostPaySweepRelayer} from "../src/GhostPaySweepRelayer.sol";
import {PermitToken} from "./mocks/PermitToken.sol";

/// @notice Signs sweeps with the owner's key and submits them (and tampered / replayed variants) from
/// arbitrary relayers, tracking ghost accounting.
contract SweepHandler is SweepBase {
    uint256 public constant NONCE_SPACE = 24; // small on purpose to force replays

    mapping(uint256 => uint256) public successes; // nonce => successful sweeps
    uint256 public movedToDestination;
    uint256 public movedToFeeTo;
    uint256 public tamperAccepted;
    uint256 public totalSuccess;
    uint256 public totalFeeSigned;
    uint256 public totalAmountSigned;

    constructor(GhostPaySweepRelayer relayer_, PermitToken token_, uint256 pk_, address owner_) {
        relayer = relayer_;
        token = token_;
        ownerPk = pk_;
        owner = owner_;
        vm.prank(owner_);
        token_.approve(address(relayer_), type(uint256).max);
    }

    /// @dev Honest submission; may be a replay of an already-used nonce (must then fail).
    function submit(uint256 nonceSeed, uint256 amount, uint256 fee, address by) external {
        uint256 nonce = nonceSeed % NONCE_SPACE;
        amount = bound(amount, 1, 1e12);
        fee = bound(fee, 0, amount - 1);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(nonce);
        s.amount = amount;
        s.fee = fee;
        bytes memory sig = _sign(ownerPk, s);
        vm.prank(by);
        try relayer.sweep(s, sig) {
            successes[nonce]++;
            totalSuccess++;
            movedToDestination += amount - fee;
            movedToFeeTo += fee;
            totalFeeSigned += fee;
            totalAmountSigned += amount;
        } catch {}
    }

    /// @dev A relayer alters one field after the owner signed; this must never succeed.
    function submitTampered(
        uint256 nonceSeed,
        uint256 amount,
        uint256 fee,
        uint256 field,
        address by
    ) external {
        uint256 nonce = (nonceSeed % NONCE_SPACE) + 1000; // distinct nonce range, never used honestly
        amount = bound(amount, 2, 1e12);
        fee = bound(fee, 0, amount - 2);
        IGhostPaySweepRelayer.Sweep memory s = _sweep(nonce);
        s.amount = amount;
        s.fee = fee;
        bytes memory sig = _sign(ownerPk, s);
        field = field % 4;
        if (field == 0) s.destination = by;
        else if (field == 1) s.feeTo = by;
        else if (field == 2) s.amount = amount + 1;
        else s.fee = fee + 1;
        if (field <= 1 && by == (field == 0 ? destination : feeTo)) return; // not a change
        vm.prank(by);
        try relayer.sweep(s, sig) {
            tamperAccepted++;
        } catch {}
    }
}

contract GhostPaySweepRelayerInvariantTest is StdInvariant, SweepBase {
    SweepHandler internal handler;
    uint256 internal startBalance;

    function setUp() public override {
        super.setUp();
        handler = new SweepHandler(relayer, token, ownerPk, owner);
        token.mint(owner, 1e30);
        startBalance = token.balanceOf(owner);
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](2);
        sel[0] = SweepHandler.submit.selector;
        sel[1] = SweepHandler.submitTampered.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    /// @notice Each sweep nonce is consumed at most once.
    function invariant_nonceSingleUse() public view {
        for (uint256 n; n < handler.NONCE_SPACE(); n++) {
            assertLe(handler.successes(n), 1, "nonce reused");
            assertEq(relayer.nonceUsed(owner, n), handler.successes(n) == 1);
        }
    }

    /// @notice A submitter can never change destination, amount or fee after the owner signed.
    function invariant_relayerCannotAlterSignedTerms() public view {
        assertEq(handler.tamperAccepted(), 0);
        for (uint256 n; n < handler.NONCE_SPACE(); n++) {
            assertFalse(relayer.nonceUsed(owner, n + 1000));
        }
    }

    /// @notice Destination and feeTo receive exactly what the signed orders specify; nothing is kept.
    function invariant_balancesMatchSignedOrders() public view {
        assertEq(token.balanceOf(destination), handler.movedToDestination());
        assertEq(token.balanceOf(feeTo), handler.movedToFeeTo());
        assertEq(handler.movedToDestination() + handler.movedToFeeTo(), handler.totalAmountSigned());
        assertEq(token.balanceOf(owner), startBalance - handler.totalAmountSigned());
        assertEq(token.balanceOf(address(relayer)), 0);
        assertEq(address(relayer).balance, 0);
    }
}
