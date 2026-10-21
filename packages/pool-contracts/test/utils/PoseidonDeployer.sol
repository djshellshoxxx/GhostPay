// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
// Imported so that the vendored libraries are compiled and their artifacts can be deployed.
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

import {IPoseidonT3, IPoseidonT4} from "../../src/interfaces/IPoseidon.sol";

/// @notice Deploys the unmodified poseidon-solidity libraries as standalone contracts.
abstract contract PoseidonDeployer is CommonBase {
    function deployPoseidon() internal returns (IPoseidonT3 h3, IPoseidonT4 h4) {
        h3 = IPoseidonT3(_create(type(PoseidonT3).creationCode));
        h4 = IPoseidonT4(_create(type(PoseidonT4).creationCode));
    }

    function _create(bytes memory code) private returns (address a) {
        assembly ("memory-safe") {
            a := create(0, add(code, 0x20), mload(code))
        }
        require(a != address(0) && a.code.length != 0, "poseidon deploy failed");
    }
}
