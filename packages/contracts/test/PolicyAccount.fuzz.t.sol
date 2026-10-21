// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {PolicyBase} from "./PolicyBase.t.sol";
import {PolicyAccount} from "../src/PolicyAccount.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";

/// @notice Fuzz tests: window cap vs a reference model, timelocks, nonces and signature integrity.
contract PolicyAccountFuzzTest is PolicyBase {
    struct Model {
        bool started;
        uint256 bucket;
        uint256 cur;
        uint256 prev;
        uint256 n;
        uint256[6] times;
        uint256[6] paid;
    }

    /// @dev Withdraw sequences with arbitrary gaps. Every outcome is compared with an independent
    /// two-bucket reference model, and no window-length interval may ever exceed the cap.
    function testFuzz_withdrawAmountsVsWindowCap(
        uint64[6] memory rawAmounts,
        uint32[6] memory rawGaps
    ) public {
        Model memory m;
        for (uint256 i; i < 6; i++) {
            vm.warp(vm.getBlockTimestamp() + bound(rawGaps[i], 0, 3 days));
            _step(m, bound(rawAmounts[i], 1, LIMIT), i);
        }
    }

    function _step(Model memory m, uint256 amount, uint256 nonce) internal {
        bytes32 id = _request(acct, address(token), amount, nonce, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);

        uint256 b = vm.getBlockTimestamp() / WINDOW;
        uint256 cur = m.cur;
        uint256 prev = m.prev;
        if (!m.started || b != m.bucket) {
            prev = (m.started && b == m.bucket + 1) ? m.cur : 0;
            cur = 0;
        }
        bool expectOk = prev + cur + amount <= LIMIT;

        try acct.executeWithdraw(id) {
            assertTrue(expectOk, "executed above model cap");
            m.started = true;
            m.bucket = b;
            m.cur = cur + amount;
            m.prev = prev;
            m.times[m.n] = vm.getBlockTimestamp();
            m.paid[m.n] = amount;
            m.n++;
            // Property: the amount paid in any WINDOW-long interval ending now is within the cap.
            uint256 sum;
            for (uint256 j; j < m.n; j++) {
                if (m.times[j] + WINDOW > vm.getBlockTimestamp()) sum += m.paid[j];
            }
            assertLe(sum, LIMIT, "window cap violated");
        } catch {
            assertFalse(expectOk, "model says it should have executed");
        }
    }

    /// @dev A request can be executed iff `delay` has passed, for any delay in the allowed range.
    function testFuzz_timelockExact(uint256 delay, uint256 wait) public {
        delay = bound(delay, 1, 30 days);
        wait = bound(wait, 0, 31 days);
        PolicyAccount a = _deploy(owner, destination, delay, bytes32(0));
        token.mint(address(a), 100);
        IPolicyAccount.Withdraw memory w = _w(address(token), 100, 1);
        bytes32 id = a.requestWithdraw(w, _emptyLp(), _sigW(ownerPk, address(a), w));
        vm.warp(vm.getBlockTimestamp() + wait);
        if (wait >= delay) {
            a.executeWithdraw(id);
            assertEq(token.balanceOf(destination), 100);
        } else {
            vm.expectRevert();
            a.executeWithdraw(id);
        }
    }

    /// @dev A destination change can be applied iff `2 * delay` has passed.
    function testFuzz_destinationTimelockExact(uint256 delay, uint256 wait) public {
        delay = bound(delay, 1, 30 days);
        wait = bound(wait, 0, 61 days);
        PolicyAccount a = _deploy(owner, destination, delay, bytes32(uint256(0xd357)));
        uint256 dl = vm.getBlockTimestamp() + 1 hours;
        a.proposeDestination(newDest, dl, 1, _sigPropose(ownerPk, address(a), newDest, dl, 1));
        vm.warp(vm.getBlockTimestamp() + wait);
        if (wait >= 2 * delay) {
            a.executeDestinationChange();
            assertEq(a.destination(), newDest);
        } else {
            vm.expectRevert();
            a.executeDestinationChange();
            assertEq(a.destination(), destination);
        }
    }

    /// @dev Flipping any single byte of a valid signature makes the request fail.
    function testFuzz_corruptedSignature_reverts(uint8 pos, uint8 mask) public {
        mask = uint8(bound(mask, 1, 255));
        pos = uint8(bound(pos, 0, 64));
        IPolicyAccount.Withdraw memory w = _w(address(token), 5, 1);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        sig[pos] = bytes1(uint8(sig[pos]) ^ mask);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        vm.expectRevert();
        acct.requestWithdraw(w, lp, sig);
        assertFalse(acct.nonceUsed(1));
    }

    /// @dev Every nonce is usable exactly once.
    function testFuzz_nonceSingleUse(uint256 nonce) public {
        IPolicyAccount.Withdraw memory w = _w(address(token), 1, nonce);
        bytes memory sig = _sigW(ownerPk, address(acct), w);
        IPolicyAccount.LimitProof memory lp = _lp(0);
        assertFalse(acct.nonceUsed(nonce));
        acct.requestWithdraw(w, lp, sig);
        assertTrue(acct.nonceUsed(nonce));
        vm.expectRevert(IPolicyAccount.NonceAlreadyUsed.selector);
        acct.requestWithdraw(w, lp, sig);
    }

    /// @dev Whatever the caller, funds only reach the destination.
    function testFuzz_executorCannotDivertFunds(address caller, uint96 amount) public {
        vm.assume(caller != address(acct) && caller != destination);
        uint256 amt = bound(amount, 1, LIMIT);
        bytes32 id = _request(acct, address(token), amt, 1, 0);
        vm.warp(vm.getBlockTimestamp() + DELAY);
        uint256 callerBefore = token.balanceOf(caller);
        vm.prank(caller);
        acct.executeWithdraw(id);
        assertEq(token.balanceOf(caller), callerBefore);
        assertEq(token.balanceOf(destination), amt);
    }
}
