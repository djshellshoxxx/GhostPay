// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

import {GhostPayAssociationSetRegistry} from "../../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../../src/GhostPayShieldedPoolERC20.sol";
import {IERC5564Announcer} from "../../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../../src/interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../../src/interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "../../src/interfaces/IPoseidon.sol";
import {MockWithdrawVerifier, MockRagequitVerifier} from "../mocks/PoolMocks.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ERC5564Announcer} from "../utils/ERC5564Announcer.sol";

/// @notice TEST ONLY. Deploys the Echidna fixture to a LOCAL anvil (chain 31337 only), because
/// Echidna's EVM runs at chain id 1 and the pool constructor refuses non-testnet chains. Echidna then
/// forks this anvil state (`rpcUrl`) and fuzzes the already-constructed pool. Uses mock verifiers.
/// Run: anvil & forge script test/echidna/EchidnaFixture.s.sol --rpc-url http://127.0.0.1:8545 \
///        --broadcast --private-key <anvil account 0 key>
contract EchidnaFixture is Script {
    function run() external {
        require(block.chainid == 31_337, "local anvil only");
        vm.startBroadcast();
        address h3 = _create(type(PoseidonT3).creationCode); // nonce 0
        address h4 = _create(type(PoseidonT4).creationCode); // nonce 1
        ERC5564Announcer announcer = new ERC5564Announcer(); // nonce 2
        GhostPayAssociationSetRegistry registry = new GhostPayAssociationSetRegistry(); // 3
        MockWithdrawVerifier wv = new MockWithdrawVerifier(); // 4
        MockRagequitVerifier rv = new MockRagequitVerifier(); // 5
        MockERC20 token = new MockERC20("Echidna", "ECH", 18); // 6
        GhostPayShieldedPoolERC20 pool = new GhostPayShieldedPoolERC20(
            IGhostPayShieldedPool.PoolConfig({
                asset: address(token),
                announcer: IERC5564Announcer(address(announcer)),
                registry: IGhostPayAssociationSetRegistry(address(registry)),
                withdrawVerifier: IWithdrawVerifier(address(wv)),
                ragequitVerifier: IRagequitVerifier(address(rv)),
                poseidonT3: IPoseidonT3(h3),
                poseidonT4: IPoseidonT4(h4),
                denomination: 0,
                maxDeposit: 1e30,
                maxRelayerFeeBps: 500,
                aspGraceSeconds: 600
            })
        ); // 7
        vm.stopBroadcast();
        console2.log("pool", address(pool));
        console2.log("token", address(token));
        console2.log("withdrawVerifier", address(wv));
        console2.log("ragequitVerifier", address(rv));
    }

    function _create(bytes memory code) internal returns (address a) {
        assembly ("memory-safe") {
            a := create(0, add(code, 0x20), mload(code))
        }
        require(a != address(0), "create failed");
    }
}
