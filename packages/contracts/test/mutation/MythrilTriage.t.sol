// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PolicyBase} from "../PolicyBase.t.sol";

/// @notice Evidence tests for Mythril triage (docs/remote/mutation-and-mythril.md).
contract MythrilTriageTest is PolicyBase {
    /// SWC-110 "assertion violation in compiler generated code" on the factory dispatcher:
    /// unknown selectors / short calldata must revert with EMPTY returndata (no Panic).
    function testFuzz_factoryUnknownCalldataRevertsWithoutPanic(bytes calldata data) public {
        bytes4 sel = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
        vm.assume(
            data.length < 4 || (
                sel != factory.deploy.selector && sel != factory.predictAddress.selector
                    && sel != factory.policyHashOf.selector
            )
        );
        (bool ok, bytes memory ret) = address(factory).call(data);
        assertFalse(ok);
        assertEq(ret.length, 0);
    }

    function test_factoryEmptyCalldataReverts() public {
        (bool ok, bytes memory ret) = address(factory).call("");
        assertFalse(ok);
        assertEq(ret.length, 0);
    }
}
