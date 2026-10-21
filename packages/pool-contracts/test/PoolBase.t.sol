// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {GhostPayShieldedPoolNative} from "../src/GhostPayShieldedPoolNative.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../src/interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";

import {MockWithdrawVerifier, MockRagequitVerifier} from "./mocks/PoolMocks.sol";
import {PermitToken} from "./mocks/PermitToken.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {PoseidonDeployer} from "./utils/PoseidonDeployer.sol";

/// @notice Shared fixture: ERC-20 pool over a permit token with mock (model) verifiers.
abstract contract PoolBase is Test, PoseidonDeployer {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    uint256 internal constant MAX_DEPOSIT = 1e30;
    uint256 internal constant FEE_BPS = 500;
    uint256 internal constant GRACE = 600;

    ERC5564Announcer internal announcer;
    GhostPayAssociationSetRegistry internal registry;
    MockWithdrawVerifier internal wv;
    MockRagequitVerifier internal rv;
    IPoseidonT3 internal t3;
    IPoseidonT4 internal t4;
    PermitToken internal token;
    GhostPayShieldedPoolERC20 internal pool;

    address internal alice;
    uint256 internal aliceKey;
    address internal bob = makeAddr("bob");
    address internal relayer = makeAddr("relayer");
    address internal recipient = makeAddr("recipient");
    address internal feeTo = makeAddr("feeTo");
    address internal publisher = makeAddr("publisher");

    uint256 internal nextSecret = 1;

    function setUp() public virtual {
        vm.chainId(31_337);
        vm.warp(1_760_000_000);
        (alice, aliceKey) = makeAddrAndKey("alice");
        announcer = new ERC5564Announcer();
        registry = new GhostPayAssociationSetRegistry();
        wv = new MockWithdrawVerifier();
        rv = new MockRagequitVerifier();
        (t3, t4) = deployPoseidon();
        token = new PermitToken(18);
        pool = new GhostPayShieldedPoolERC20(_config(address(token), 0));
        token.mint(alice, 1e24);
        token.mint(bob, 1e24);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
        vm.prank(bob);
        token.approve(address(pool), type(uint256).max);
    }

    function _config(address asset, uint256 denomination)
        internal
        view
        returns (IGhostPayShieldedPool.PoolConfig memory c)
    {
        c = IGhostPayShieldedPool.PoolConfig({
            asset: asset,
            announcer: IERC5564Announcer(address(announcer)),
            registry: IGhostPayAssociationSetRegistry(address(registry)),
            withdrawVerifier: IWithdrawVerifier(address(wv)),
            ragequitVerifier: IRagequitVerifier(address(rv)),
            poseidonT3: t3,
            poseidonT4: t4,
            denomination: denomination,
            maxDeposit: MAX_DEPOSIT,
            maxRelayerFeeBps: FEE_BPS,
            aspGraceSeconds: GRACE
        });
    }

    /// @dev Fresh field element used as precommitment / nullifier hash / change commitment.
    function _fresh() internal returns (uint256) {
        return uint256(keccak256(abi.encode("ghostpay-test", nextSecret++))) % P;
    }

    function _deposit(IGhostPayShieldedPool p, address from, uint256 value)
        internal
        returns (uint256 commitment, uint256 label)
    {
        uint256 pre = _fresh();
        uint256 msgValue = p.ASSET() == address(0) ? value : 0;
        vm.prank(from);
        (commitment, label) = p.deposit{value: msgValue}(value, pre);
    }

    function _w(address to, uint256 fee)
        internal
        view
        returns (IGhostPayShieldedPool.Withdrawal memory w)
    {
        w = IGhostPayShieldedPool.Withdrawal({
            recipient: to,
            relayer: relayer,
            relayerFee: fee,
            feeTo: feeTo,
            deadline: block.timestamp + 1 hours,
            aspPublisher: address(0),
            announce: ""
        });
    }

    function _ctx(IGhostPayShieldedPool p, IGhostPayShieldedPool.Withdrawal memory w)
        internal
        view
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(w, p.SCOPE()))) % P;
    }

    /// @dev Builds a withdraw proof against the pool's current root, `aspEnabled = 0`, and
    /// registers it with the model verifier.
    function _proof(
        IGhostPayShieldedPool p,
        IGhostPayShieldedPool.Withdrawal memory w,
        uint256 value,
        uint256 nullifierHash,
        uint256 newCommitment
    ) internal returns (IGhostPayShieldedPool.WithdrawProof memory pr) {
        pr.pubSignals = [
            newCommitment,
            nullifierHash,
            value,
            p.currentRoot(),
            p.currentTreeDepth(),
            0,
            0,
            0,
            _ctx(p, w)
        ];
        _accept(pr);
    }

    /// @dev Deep copy (memory struct and array assignments alias).
    function _copy(IGhostPayShieldedPool.WithdrawProof memory a)
        internal
        pure
        returns (IGhostPayShieldedPool.WithdrawProof memory b)
    {
        for (uint256 i; i < 9; ++i) {
            b.pubSignals[i] = a.pubSignals[i];
        }
        b.pA = [a.pA[0], a.pA[1]];
        b.pB = [[a.pB[0][0], a.pB[0][1]], [a.pB[1][0], a.pB[1][1]]];
        b.pC = [a.pC[0], a.pC[1]];
    }

    function _accept(IGhostPayShieldedPool.WithdrawProof memory pr) internal {
        MockWithdrawVerifier(IGhostPayShieldedPool(address(pool)).WITHDRAW_VERIFIER())
            .accept(pr.pubSignals);
    }

    function _rqProof(uint256 commitment, uint256 nullifierHash, uint256 value, uint256 label)
        internal
        returns (IGhostPayShieldedPool.RagequitProof memory pr)
    {
        pr.pubSignals = [commitment, nullifierHash, value, label];
        rv.accept(pr.pubSignals);
    }

    function _withdraw(
        IGhostPayShieldedPool p,
        IGhostPayShieldedPool.Withdrawal memory w,
        IGhostPayShieldedPool.WithdrawProof memory pr
    ) internal {
        vm.prank(relayer);
        p.withdraw(w, pr);
    }
}
