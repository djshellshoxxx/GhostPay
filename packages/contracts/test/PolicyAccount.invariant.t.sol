// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {PolicyBase} from "./PolicyBase.t.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";

/// @notice Drives a policy account with random owner-signed orders, thief-signed orders, relayers, time
/// jumps and destination changes while keeping ghost accounting for the invariants.
contract PolicyHandler is PolicyBase {
    uint256 public constant NONCE_SPACE = 24; // small on purpose to force replays

    address public thief;
    uint256 public thiefPk;

    bytes32[] public ids;
    mapping(bytes32 => uint256) public requestedAt;
    mapping(bytes32 => uint256) public executedAt;
    mapping(bytes32 => uint256) public execCount;
    mapping(bytes32 => address) public idToken;

    bytes32[] public proposals;
    mapping(bytes32 => uint256) public proposedAt;
    uint256 public changesApplied;
    uint256 public earliestViolation; // non-zero if a change was applied before 2x delay
    uint256 public badSigAccepted;
    uint256 public windowViolations;
    /// @dev Executions that paid a destination other than the one current at request time (round-3b).
    uint256 public boundDestinationViolations;
    mapping(bytes32 id => address) internal destAtRequest;

    uint256 public totalInToken;
    uint256 public totalInTokenU;
    uint256 public totalInEth;

    // Executions of the limited token (timestamps, amounts), for the sliding-window check.
    uint256[] internal execTimes;
    uint256[] internal execAmounts;

    constructor() {
        setUp();
        (thief, thiefPk) = makeAddrAndKey("thief");
        totalInToken = token.balanceOf(address(acct));
        totalInTokenU = tokenU.balanceOf(address(acct));
        totalInEth = address(acct).balance;
    }

    function account() external view returns (PolicyAccount) {
        return acct;
    }

    function tok() external view returns (MockERC20) {
        return token;
    }

    function tokU() external view returns (MockERC20) {
        return tokenU;
    }

    function dest0() external view returns (address) {
        return destination;
    }

    function dest1() external view returns (address) {
        return newDest;
    }

    function ownerAddr() external view returns (address) {
        return owner;
    }

    function limitsRootV() external view returns (bytes32) {
        return root;
    }

    function delayV() external pure returns (uint256) {
        return DELAY;
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }

    function _tok(uint256 sel) internal view returns (address t, uint256 lpIndex) {
        sel = sel % 3;
        if (sel == 0) return (address(token), 0);
        if (sel == 1) return (address(0), 1);
        return (address(tokenU), 2);
    }

    function fund(uint256 sel, uint256 amount) external {
        amount = bound(amount, 1, 1e12);
        (address t,) = _tok(sel);
        if (t == address(token)) {
            token.mint(address(acct), amount);
            totalInToken += amount;
        } else if (t == address(tokenU)) {
            tokenU.mint(address(acct), amount);
            totalInTokenU += amount;
        } else {
            vm.deal(address(acct), address(acct).balance + amount);
            totalInEth += amount;
        }
    }

    function request(uint256 sel, uint256 amount, uint256 nonceSeed, address by) external {
        (address t, uint256 lpi) = _tok(sel);
        amount = bound(amount, 1, t == address(0) ? NATIVE_LIMIT : LIMIT);
        IPolicyAccount.Withdraw memory w = _w(t, amount, nonceSeed % NONCE_SPACE);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(lpi);
        vm.prank(by);
        try acct.requestWithdraw(w, lp, sig) returns (bytes32 id) {
            ids.push(id);
            requestedAt[id] = block.timestamp;
            idToken[id] = t;
            destAtRequest[id] = acct.destination();
        } catch {}
    }

    function requestWithBadSignature(uint256 sel, uint256 amount, uint256 nonceSeed) external {
        (address t, uint256 lpi) = _tok(sel);
        IPolicyAccount.Withdraw memory w = _w(t, bound(amount, 1, 1000), 1000 + nonceSeed % 8);
        bytes memory sig = _sigW(thiefPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(lpi);
        vm.prank(thief);
        try acct.requestWithdraw(w, lp, sig) {
            badSigAccepted++;
        } catch {}
    }

    function execute(uint256 idxSeed, address by) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idxSeed % ids.length];
        uint256 amount = acct.requests(id).amount;
        vm.prank(by);
        try acct.executeWithdraw(id) {
            execCount[id]++;
            if (acct.destination() != destAtRequest[id]) boundDestinationViolations++;
            executedAt[id] = block.timestamp;
            if (idToken[id] == address(token)) {
                execTimes.push(block.timestamp);
                execAmounts.push(amount);
                uint256 sum;
                for (uint256 i; i < execTimes.length; i++) {
                    if (execTimes[i] + WINDOW > block.timestamp) sum += execAmounts[i];
                }
                if (sum > LIMIT) windowViolations++;
            }
        } catch {}
    }

    function cancel(uint256 idxSeed, bool useOwner) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idxSeed % ids.length];
        bytes memory sig = _sigCancel(useOwner ? ownerPk : thiefPk, address(acct), id);
        try acct.cancel(id, sig) {
            if (!useOwner) badSigAccepted++;
        } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 3 days));
    }

    function propose(bool toNew, uint256 nonceSeed) external {
        address d = toNew ? newDest : destination;
        uint256 dl = block.timestamp + 1 hours;
        uint256 nonce = 100 + nonceSeed % NONCE_SPACE;
        bytes memory sig = _sigPropose(ownerPk, address(acct), d, dl, nonce);
        try acct.proposeDestination(d, dl, nonce, sig) returns (bytes32 id) {
            proposals.push(id);
            proposedAt[id] = block.timestamp;
        } catch {}
    }

    function proposeWithBadSignature() external {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sigPropose(thiefPk, address(acct), thief, dl, 999);
        try acct.proposeDestination(thief, dl, 999, sig) {
            badSigAccepted++;
        } catch {}
    }

    function executeDestination() external {
        bytes32 id = acct.pendingProposalId();
        uint256 proposed = proposedAt[id];
        try acct.executeDestinationChange() {
            changesApplied++;
            if (block.timestamp < proposed + 2 * DELAY && earliestViolation == 0) {
                earliestViolation = block.timestamp;
            }
        } catch {}
    }

    function cancelDestination(bool useOwner) external {
        bytes32 id = acct.pendingProposalId();
        bytes memory sig = _sigCancelDest(useOwner ? ownerPk : thiefPk, address(acct), id);
        try acct.cancelDestination(id, sig) {
            if (!useOwner) badSigAccepted++;
        } catch {}
    }

    function actors() external view returns (address[5] memory a) {
        a = [owner, relayer, thief, feeRecipient, address(this)];
    }
}

/// @notice Invariants of `PolicyAccount` over arbitrary call sequences.
contract PolicyAccountInvariantTest is StdInvariant, Test {
    PolicyHandler internal h;

    function setUp() public {
        h = new PolicyHandler();
        bytes4[] memory sel = new bytes4[](11);
        sel[0] = h.fund.selector;
        sel[1] = h.request.selector;
        sel[2] = h.requestWithBadSignature.selector;
        sel[3] = h.execute.selector;
        sel[4] = h.cancel.selector;
        sel[5] = h.warp.selector;
        sel[6] = h.propose.selector;
        sel[7] = h.proposeWithBadSignature.selector;
        sel[8] = h.executeDestination.selector;
        sel[9] = h.cancelDestination.selector;
        sel[10] = h.warp.selector; // weight time jumps higher
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
        targetContract(address(h));
    }

    /// @dev Funds only ever leave the account to the (at most two) destinations the owner chose;
    /// every other actor stays at zero and nothing is created or lost.
    function invariant_fundsOnlyLeaveToDestination() public view {
        address acct = address(h.account());
        address d1 = h.dest0();
        address d2 = h.dest1();
        assertEq(
            h.tok().balanceOf(acct) + h.tok().balanceOf(d1) + h.tok().balanceOf(d2),
            h.totalInToken()
        );
        assertEq(
            h.tokU().balanceOf(acct) + h.tokU().balanceOf(d1) + h.tokU().balanceOf(d2),
            h.totalInTokenU()
        );
        assertEq(acct.balance + d1.balance + d2.balance, h.totalInEth());
        address[5] memory a = h.actors();
        for (uint256 i; i < a.length; i++) {
            assertEq(h.tok().balanceOf(a[i]), 0);
            assertEq(h.tokU().balanceOf(a[i]), 0);
        }
        // Thief and relayers never received native coin either (`owner`, `relayer`, `thief`).
        assertEq(a[0].balance, 0);
        assertEq(a[1].balance, 0);
        assertEq(a[2].balance, 0);
    }

    /// @dev Timelocks are never shortened: executeAfter is exactly request time + delay, no request is
    /// executed earlier, and no destination change is applied before 2x delay.
    function invariant_timelocksNeverShortened() public view {
        uint256 n = h.idsLength();
        for (uint256 i; i < n; i++) {
            bytes32 id = h.ids(i);
            IPolicyAccount.Request memory r = h.account().requests(id);
            assertEq(r.executeAfter, h.requestedAt(id) + h.delayV());
            if (h.execCount(id) != 0) assertGe(h.executedAt(id), h.requestedAt(id) + h.delayV());
        }
        assertEq(h.earliestViolation(), 0);
        assertEq(h.account().delay(), h.delayV());
    }

    /// @dev An executed id is single-use.
    function invariant_executedIdSingleUse() public view {
        uint256 n = h.idsLength();
        for (uint256 i; i < n; i++) {
            bytes32 id = h.ids(i);
            assertLe(h.execCount(id), 1);
            if (h.execCount(id) == 1) {
                assertEq(
                    uint8(h.account().requests(id).status), uint8(IPolicyAccount.Status.Executed)
                );
            }
        }
    }

    /// @dev The account never grants an allowance to anybody.
    function invariant_noUnrecordedAllowance() public view {
        address acct = address(h.account());
        address[5] memory a = h.actors();
        for (uint256 i; i < a.length; i++) {
            assertEq(h.tok().allowance(acct, a[i]), 0);
            assertEq(h.tokU().allowance(acct, a[i]), 0);
        }
        assertEq(h.tok().allowance(acct, h.dest0()), 0);
        assertEq(h.tok().allowance(acct, h.dest1()), 0);
    }

    /// @dev No window-length interval ever saw more than the cap leave.
    function invariant_pendingRequestsPayOnlyTheirBoundDestination() public view {
        assertEq(h.boundDestinationViolations(), 0);
    }

    function invariant_windowCapRespected() public view {
        assertEq(h.windowViolations(), 0);
    }

    /// @dev Signatures from any key but the owner's are never accepted, for any action.
    function invariant_foreignSignaturesNeverAccepted() public view {
        assertEq(h.badSigAccepted(), 0);
    }

    /// @dev The owner, delay and limits root are immutable after initialisation.
    function invariant_policyImmutable() public view {
        assertEq(h.account().owner(), h.ownerAddr());
        assertEq(h.account().limitsRoot(), h.limitsRootV());
        address d = h.account().destination();
        assertTrue(d == h.dest0() || d == h.dest1());
        assertEq(
            h.account().policyHash(), keccak256(abi.encode(h.dest0(), h.delayV(), h.limitsRootV()))
        );
    }
}
