// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {EchidnaPolicy} from "./EchidnaPolicy.sol";

/// @notice Deterministic reachability checks for the Echidna PolicyAccount harness. They drive only the
/// harness's own action functions, in Echidna's starting environment (timestamp 1524785992, block 4370000,
/// deployer 0x40000 funding the constructor with `balanceContract` from echidna.yaml), and read back only
/// the harness's own `echidna_*` properties. A canary returning false means Echidna would report it falsified.
contract EchidnaPolicyReachabilityTest is Test {
    uint256 internal constant ECHIDNA_START_TIME = 1_524_785_992;
    uint256 internal constant ECHIDNA_START_BLOCK = 4_370_000;
    address internal constant DEPLOYER = address(0x40000);
    address internal constant S1 = address(0x10000);
    address internal constant S2 = address(0x20000);
    address internal constant S3 = address(0x30000);
    uint256 internal constant BALANCE_CONTRACT = 1000 ether;
    uint256 internal constant DELAY = 1 days;

    EchidnaPolicy internal h;

    function setUp() public {
        vm.warp(ECHIDNA_START_TIME);
        vm.roll(ECHIDNA_START_BLOCK);
        vm.deal(DEPLOYER, BALANCE_CONTRACT);
        vm.prank(DEPLOYER);
        h = new EchidnaPolicy{value: BALANCE_CONTRACT}();
    }

    /// @dev Every non-canary property of the harness.
    function _assertSafety() internal view {
        assertTrue(h.echidna_funds_only_to_destination(), "funds_only_to_destination");
        assertTrue(h.echidna_destination_only_changes_via_timelock(), "destination_via_timelock");
        assertTrue(h.echidna_timelocks_never_shortened(), "timelocks_never_shortened");
        assertTrue(h.echidna_policy_immutable(), "policy_immutable");
        assertTrue(h.echidna_rolling_window_cap(), "rolling_window_cap");
    }

    /// @dev Echidna applies a transaction's time and block delay before executing it.
    function _tx(address sender, uint256 timeDelay, uint256 blockDelay) internal {
        vm.warp(block.timestamp + timeDelay);
        vm.roll(block.number + blockDelay);
        vm.prank(sender);
    }

    function test_threeNativeExecutionsReachableThroughHarnessActions() public {
        assertTrue(h.echidna_canary_exec_native(), "canary starts unfalsified");
        // Three owner-signed native requests on three distinct pool nonces (0, 1, 2), 1 wei each.
        h.request(true, 0, 0, false);
        h.request(true, 0, 1, false);
        h.request(true, 0, 2, false);
        assertFalse(h.echidna_canary_request_ok(), "three requests accepted");
        vm.warp(block.timestamp + DELAY);
        h.execute(0);
        h.execute(1);
        assertTrue(h.echidna_canary_exec_native(), "two executions do not satisfy the canary");
        h.execute(2);
        assertFalse(h.echidna_canary_exec_native(), "third native execution falsifies the canary");
        _assertSafety();
    }

    function test_nativeExecutionBeforeDelayDoesNotCount() public {
        h.request(true, 0, 0, false);
        h.request(true, 0, 1, false);
        h.request(true, 0, 2, false);
        vm.warp(block.timestamp + DELAY - 1);
        h.execute(0);
        h.execute(1);
        h.execute(2);
        assertTrue(h.echidna_canary_exec_native(), "timelocked executions must not count");
        _assertSafety();
    }

    function test_nativeRequestsAndOpenRequestExecutorReachNativeCanary() public {
        h.requestNative(0, 0);
        h.requestNative(0, 1);
        h.requestNative(0, 2);
        vm.warp(block.timestamp + DELAY);
        // Index 0 always names the oldest request still open, so three calls execute three requests.
        h.executePending(0);
        h.executePending(0);
        assertTrue(h.echidna_canary_exec_native(), "two executions do not satisfy the canary");
        h.executePending(0);
        assertFalse(h.echidna_canary_exec_native(), "third native execution falsifies the canary");
        _assertSafety();
    }

    function test_tokenRequestsAndOpenRequestExecutorReachTokenCanary() public {
        h.requestToken(0, 0);
        h.requestToken(0, 1);
        h.requestToken(0, 2);
        vm.warp(block.timestamp + DELAY);
        h.executePending(7);
        h.executePending(7);
        h.executePending(7);
        assertFalse(h.echidna_canary_exec_token(), "three token executions falsify the canary");
        assertTrue(h.echidna_canary_exec_native(), "no native execution happened");
        _assertSafety();
    }

    function test_openRequestExecutorStillWaitsForTheTimelock() public {
        h.requestNative(0, 0);
        h.requestNative(0, 1);
        h.requestNative(0, 2);
        vm.warp(block.timestamp + DELAY - 1);
        h.executePending(0);
        h.executePending(1);
        h.executePending(2);
        assertTrue(h.echidna_canary_exec_native(), "timelocked executions must not count");
        vm.warp(block.timestamp + 1);
        h.executePending(0);
        h.executePending(0);
        h.executePending(0);
        assertFalse(h.echidna_canary_exec_native(), "executions count once the delay has elapsed");
        _assertSafety();
    }

    function test_openRequestExecutorSkipsCancelledAndExecutedRequests() public {
        h.requestNative(0, 0);
        h.requestNative(0, 1);
        h.requestNative(0, 2);
        h.requestNative(0, 3);
        h.cancelWithdraw(0);
        vm.warp(block.timestamp + DELAY);
        // `execute(0)` keeps naming the cancelled request and never succeeds ...
        h.execute(0);
        h.execute(4);
        h.execute(8);
        h.reExecute(0);
        assertTrue(h.echidna_canary_exec_native(), "cancelled request cannot execute");
        // ... while `executePending(0)` moves on to the requests that are still open.
        h.executePending(0);
        h.executePending(0);
        h.executePending(0);
        assertFalse(h.echidna_canary_exec_native(), "three open requests executed");
        // Nothing open is left: further calls are no-ops and executed requests stay closed.
        h.executePending(0);
        h.reExecute(1);
        h.reExecute(2);
        h.reExecute(3);
        _assertSafety();
    }

    /// @dev The call sequence Echidna 2.2.7 printed when it falsified `echidna_canary_exec_native` on
    /// 2026-11-16 (harness sha256 6a6e6921..., PolicyAccount sha256 c860fcf7..., same as this tree;
    /// docs/handoffs/agents/team-j-analyzer-evidence/echidna-attempt-2.raw.log.gz). Senders, arguments and
    /// delays are copied exactly; the opaque `reinit` bytes32 argument is replaced by zero because every
    /// `reinit` reverts with AlreadyInitialized before reading it.
    function test_replaysEchidnaFalsifyingSequence() public {
        _tx(S2, 547_623, 4896);
        h.reinit(address(0xd0003), address(0x2fffffffd), 1_524_785_991, bytes32(0));
        _tx(S1, 127_251, 255);
        h.cancelDest();
        _tx(S2, 66_543, 12_155);
        h.cancelDest();
        _tx(S3, 298_899, 32_737);
        h.requestWrongKey(
            false,
            72_728_828_711_447_043_797_374_752_064_072_474_527_144_164_409_090_769_327_686_196_255_332_245_498_356,
            97
        );
        _tx(S3, 448_552, 45_473);
        h.reinit(
            address(0xd0002),
            address(0x2fffffffd),
            112_689_953_832_456_148_568_706_374_526_366_320_343_141_625_107_781_875_108_651_318_217_475_383_375_315,
            bytes32(0)
        );
        _tx(S1, 412_373, 15_798);
        h.request(true, 1_524_785_991, 137, false);
        _tx(S1, 254_414, 4462);
        h.request(true, 1_524_785_991, 0, false);
        _tx(S1, 378_016, 32_147);
        h.execute(250);
        _tx(S1, 434_894, 32);
        h.executeDest();
        _tx(S2, 332_369, 15_368);
        h.cancelDest();
        _tx(S1, 209_930, 23_275);
        h.requestWrongKey(
            false,
            102_381_309_568_755_019_074_170_318_819_383_773_447_892_433_373_917_291_287_004_633_152_604_082_960_057,
            37
        );
        _tx(S1, 415_353, 33_357);
        h.execute(250);
        _tx(S2, 420_078, 53_011);
        h.reinit(
            address(0x2fffffffd),
            address(0x62d69f6867A0A084C6d313943dC22023Bc263691),
            type(uint256).max,
            bytes32(0)
        );
        _tx(S3, 338_920, 255);
        h.request(true, 1_524_785_993, 58, false);
        _tx(S1, 407_328, 30_304);
        h.request(true, 1_524_785_991, 137, true);
        _tx(S1, 401_699, 59_983);
        h.propose(255, 101, false);
        _tx(S2, 405_856, 60_267);
        h.execute(245);
        _tx(S1, 66_543, 59_981);
        h.request(true, 1_524_785_991, 137, false);
        _tx(S2, 203_833, 53_011);
        h.cancelWithdraw(177);
        assertTrue(h.echidna_canary_exec_native(), "two native executions before the last call");
        _tx(S1, 206_186, 32);
        h.execute(250);
        assertFalse(
            h.echidna_canary_exec_native(), "Echidna's sequence reaches three native executions"
        );
        _assertSafety();
    }
}
