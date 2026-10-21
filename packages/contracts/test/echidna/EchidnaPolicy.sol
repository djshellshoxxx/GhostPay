// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {PolicyAccount} from "../../src/PolicyAccount.sol";
import {IPolicyAccount} from "../../src/interfaces/IPolicyAccount.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

interface HevmP {
    function sign(uint256 sk, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 sk) external returns (address);
}

/// @notice Echidna harness for PolicyAccount. The harness deploys the clone, holds the owner key
/// (hevm.sign) and drives every entry point. Properties: funds leave only to the timelocked destination,
/// timelocks are never short-circuited, the stored policy never changes except via the 2x-delay path,
/// and the rolling window cap holds. `echidna_canary_*` are EXPECTED TO FAIL (reachability proofs).
contract EchidnaPolicy {
    HevmP internal constant HEVM = HevmP(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 internal constant OWNER_PK = 0xB0B5EC12E7;
    uint256 internal constant WRONG_PK = 0xBAD5EC12E7;

    uint256 internal constant DELAY = 1 days;
    uint256 internal constant TOKEN_LIMIT = 1e12;
    uint256 internal constant NATIVE_LIMIT = 50 ether;
    uint64 internal constant WINDOW = 1 days;
    uint256 internal constant TOKEN_FUND = 1e15;
    uint256 internal constant NATIVE_FUND = 500 ether;

    bytes32 internal constant WITHDRAW_TH = keccak256(
        "Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)"
    );
    bytes32 internal constant CANCEL_WITHDRAW_TH = keccak256("CancelWithdraw(bytes32 id)");
    bytes32 internal constant PROPOSE_TH =
        keccak256("ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)");
    bytes32 internal constant CANCEL_DEST_TH = keccak256("CancelDestination(bytes32 id)");

    address internal constant D0 = address(0xD0001);
    address internal constant D1 = address(0xD0002);
    address internal constant D2 = address(0xD0003);

    PolicyAccount internal acct;
    MockERC20 internal token;
    address internal owner;
    bytes32 internal root;
    bytes32 internal leafT;
    bytes32 internal leafN;
    bytes32 internal initialPolicyHash;

    struct Rec {
        bytes32 id;
        address token;
        uint256 amount;
        uint256 requestedAt;
        uint256 executeAfter;
        bool executed;
    }

    Rec[] internal recs;

    struct Exec {
        uint256 at;
        uint256 amount;
    }
    mapping(address => Exec[]) internal execs;

    address internal ghostDest = D0;
    bytes32 internal ghostProposal;
    uint256 internal ghostEffectiveAt;
    address internal ghostPending;

    bool internal payoutWrong;
    bool internal earlyExec;
    bool internal earlyDestChange;
    bool internal windowViolated;
    bool internal unauthorizedSuccess;
    bool internal doubleExecuted;
    bool internal pendingMoved;
    uint256 internal okRequest;
    uint256 internal okExecTok;
    uint256 internal okExecNative;
    uint256 internal okDestChange;
    uint256 internal okCancel;

    constructor() payable {
        owner = HEVM.addr(OWNER_PK);
        PolicyAccount impl = new PolicyAccount();
        token = new MockERC20("T", "T", 6);
        leafT = keccak256(bytes.concat(keccak256(abi.encode(address(token), TOKEN_LIMIT, WINDOW))));
        leafN = keccak256(bytes.concat(keccak256(abi.encode(address(0), NATIVE_LIMIT, WINDOW))));
        root = leafT < leafN
            ? keccak256(abi.encodePacked(leafT, leafN))
            : keccak256(abi.encodePacked(leafN, leafT));
        initialPolicyHash = keccak256(abi.encode(D0, DELAY, root));
        address a = Clones.cloneDeterministic(
            address(impl), keccak256(abi.encode(owner, initialPolicyHash))
        );
        acct = PolicyAccount(payable(a));
        acct.initialize(owner, D0, DELAY, root);
        token.mint(a, TOKEN_FUND);
        (bool ok,) = a.call{value: NATIVE_FUND}("");
        require(ok);
    }

    receive() external payable {}

    // ---------- helpers ----------
    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", acct.DOMAIN_SEPARATOR(), structHash));
    }

    function _sig(uint256 pk, bytes32 structHash) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = HEVM.sign(pk, _digest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _nonce(uint8 n) internal pure returns (uint256) {
        uint256[6] memory t = [uint256(0), 1, 2, 256, 257, type(uint256).max];
        return t[n % 6];
    }

    function _dest(uint8 i) internal pure returns (address) {
        return i % 3 == 0 ? D0 : (i % 3 == 1 ? D1 : D2);
    }

    // ---------- actions ----------
    function request(bool native, uint256 amount, uint8 nonceIdx, bool bigAmount) external {
        _request(OWNER_PK, native, amount, nonceIdx, bigAmount);
    }

    /// @dev Same, but signed by a key that is not the owner: must never succeed.
    function requestWrongKey(bool native, uint256 amount, uint8 nonceIdx) external {
        _request(WRONG_PK, native, amount, nonceIdx, false);
    }

    function _request(uint256 pk, bool native, uint256 amount, uint8 nonceIdx, bool bigAmount)
        internal
    {
        address t = native ? address(0) : address(token);
        uint256 limit = native ? NATIVE_LIMIT : TOKEN_LIMIT;
        amount = 1 + (amount % (bigAmount ? limit * 2 : limit));
        IPolicyAccount.Withdraw memory w = IPolicyAccount.Withdraw({
            token: t,
            amount: amount,
            deadline: block.timestamp + 1 hours,
            nonce: _nonce(nonceIdx),
            limitLeafHash: native ? leafN : leafT
        });
        bytes32 id = keccak256(
            abi.encode(WITHDRAW_TH, w.token, w.amount, w.deadline, w.nonce, w.limitLeafHash)
        );
        IPolicyAccount.LimitProof memory lp;
        lp.limit = limit;
        lp.windowSeconds = WINDOW;
        lp.proof = new bytes32[](1);
        lp.proof[0] = native ? leafT : leafN;
        try acct.requestWithdraw(w, lp, _sig(pk, id)) {
            if (pk != OWNER_PK) {
                unauthorizedSuccess = true;
                return;
            }
            okRequest++;
            recs.push(Rec(id, t, amount, block.timestamp, block.timestamp + DELAY, false));
            if (amount > limit) unauthorizedSuccess = true; // over-limit request accepted
            if (acct.requests(id).executeAfter != block.timestamp + DELAY) earlyExec = true;
        } catch {}
    }

    function execute(uint8 idx) external {
        if (recs.length == 0) return;
        Rec storage r = recs[idx % recs.length];
        address dest = acct.destination();
        uint256 beforeD = r.token == address(0) ? dest.balance : token.balanceOf(dest);
        uint256 beforeA =
            r.token == address(0) ? address(acct).balance : token.balanceOf(address(acct));
        uint256 beforeOthers = _others(r.token, dest);
        try acct.executeWithdraw(r.id) {
            if (r.executed) doubleExecuted = true;
            r.executed = true;
            if (block.timestamp < r.requestedAt + DELAY) earlyExec = true;
            uint256 afterD = r.token == address(0) ? dest.balance : token.balanceOf(dest);
            uint256 afterA =
                r.token == address(0) ? address(acct).balance : token.balanceOf(address(acct));
            if (afterD - beforeD != r.amount || beforeA - afterA != r.amount) payoutWrong = true;
            if (_others(r.token, dest) != beforeOthers) payoutWrong = true;
            if (r.token == address(0)) okExecNative++;
            else okExecTok++;
            // rolling window: sum of payouts in (now - WINDOW, now] must not exceed the limit
            execs[r.token].push(Exec(block.timestamp, r.amount));
            uint256 limit = r.token == address(0) ? NATIVE_LIMIT : TOKEN_LIMIT;
            uint256 sum;
            Exec[] storage es = execs[r.token];
            for (uint256 i = 0; i < es.length; i++) {
                if (es[i].at + WINDOW > block.timestamp) sum += es[i].amount;
            }
            if (sum > limit) windowViolated = true;
        } catch {}
    }

    function _others(address t, address dest) internal view returns (uint256 s) {
        address[3] memory ds = [D0, D1, D2];
        for (uint256 i = 0; i < 3; i++) {
            if (ds[i] == dest) continue;
            s += t == address(0) ? ds[i].balance : token.balanceOf(ds[i]);
        }
    }

    function cancelWithdraw(uint8 idx) external {
        if (recs.length == 0) return;
        Rec storage r = recs[idx % recs.length];
        try acct.cancel(r.id, _sig(OWNER_PK, keccak256(abi.encode(CANCEL_WITHDRAW_TH, r.id)))) {
            okCancel++;
            if (r.executed) doubleExecuted = true; // cancelling an executed request must fail
            r.amount = 0; // cancelled: must never pay out; executing later must revert (checked below)
            r.executed = true;
        } catch {}
    }

    /// @dev Executing a cancelled/executed request again must always revert.
    function reExecute(uint8 idx) external {
        if (recs.length == 0) return;
        Rec storage r = recs[idx % recs.length];
        if (!r.executed) return;
        try acct.executeWithdraw(r.id) {
            doubleExecuted = true;
        } catch {}
    }

    function propose(uint8 destIdx, uint8 nonceIdx, bool wrongKey) external {
        address nd = _dest(destIdx);
        uint256 dl = block.timestamp + 1 hours;
        uint256 n = _nonce(nonceIdx);
        bytes32 id = keccak256(abi.encode(PROPOSE_TH, nd, dl, n));
        try acct.proposeDestination(nd, dl, n, _sig(wrongKey ? WRONG_PK : OWNER_PK, id)) {
            if (wrongKey) {
                unauthorizedSuccess = true;
                return;
            }
            ghostProposal = id;
            ghostPending = nd;
            ghostEffectiveAt = block.timestamp + 2 * DELAY;
        } catch {}
    }

    function executeDest() external {
        address pend = acct.pendingDestination();
        bool had = acct.pendingEffectiveAt() != 0;
        try acct.executeDestinationChange() {
            okDestChange++;
            if (!had || block.timestamp < ghostEffectiveAt) earlyDestChange = true;
            ghostDest = pend;
            ghostEffectiveAt = 0;
            ghostPending = address(0);
            ghostProposal = bytes32(0);
        } catch {}
    }

    function cancelDest() external {
        bytes32 id = ghostProposal;
        try acct.cancelDestination(id, _sig(OWNER_PK, keccak256(abi.encode(CANCEL_DEST_TH, id)))) {
            ghostEffectiveAt = 0;
            ghostPending = address(0);
            ghostProposal = bytes32(0);
        } catch {}
    }

    /// @dev Anyone may attempt to initialise again with any args: must always fail.
    function reinit(address o, address d, uint256 delay_, bytes32 lr) external {
        try acct.initialize(o, d, delay_, lr) {
            unauthorizedSuccess = true;
        } catch {}
    }

    // ---------- properties ----------
    /// @dev Every unit funded is either still in the account or sits at one of the three possible
    /// destinations; nothing can leave to any other address.
    function echidna_funds_only_to_destination() external view returns (bool) {
        bool tok = token.balanceOf(address(acct)) + token.balanceOf(D0) + token.balanceOf(D1)
                + token.balanceOf(D2) == TOKEN_FUND;
        bool nat = address(acct).balance + D0.balance + D1.balance + D2.balance == NATIVE_FUND;
        return tok && nat && !payoutWrong && !unauthorizedSuccess;
    }

    function echidna_destination_only_changes_via_timelock() external view returns (bool) {
        return acct.destination() == ghostDest && !earlyDestChange;
    }

    function echidna_timelocks_never_shortened() external view returns (bool) {
        if (earlyExec || earlyDestChange || doubleExecuted) return false;
        // pending proposal keeps exactly the effective time it was created with (never moves earlier)
        uint64 eff = acct.pendingEffectiveAt();
        if (eff != ghostEffectiveAt) return false;
        if (
            eff != 0
                && (acct.pendingDestination() != ghostPending
                    || acct.pendingProposalId() != ghostProposal)
        ) {
            return false;
        }
        // stored executeAfter of every request is immutable
        for (uint256 i = 0; i < recs.length; i++) {
            IPolicyAccount.Request memory q = acct.requests(recs[i].id);
            if (q.executeAfter != recs[i].executeAfter) return false;
        }
        return true;
    }

    function echidna_policy_immutable() external view returns (bool) {
        return acct.owner() == owner && acct.delay() == DELAY && acct.limitsRoot() == root
            && acct.policyHash() == initialPolicyHash;
    }

    function echidna_rolling_window_cap() external view returns (bool) {
        return !windowViolated;
    }

    // canaries: EXPECTED TO FAIL
    function echidna_canary_request_ok() external view returns (bool) {
        return okRequest < 3;
    }

    function echidna_canary_exec_token() external view returns (bool) {
        return okExecTok < 3;
    }

    function echidna_canary_exec_native() external view returns (bool) {
        return okExecNative < 3;
    }

    function echidna_canary_dest_change() external view returns (bool) {
        return okDestChange < 2;
    }

    function echidna_canary_cancel() external view returns (bool) {
        return okCancel < 2;
    }
}
