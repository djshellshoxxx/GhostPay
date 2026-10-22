// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {WithdrawVerifier} from "pool-verifiers/WithdrawVerifier.sol";
import {RagequitVerifier} from "pool-verifiers/RagequitVerifier.sol";

/// @title Verifier smoke tests (INSECURE DEV CEREMONY keys)
/// @notice Checks the generated verifiers accept the committed fixtures and reject tampered or
///         non-canonical public signals (checkField). Not a pool test.
contract VerifiersTest is Test {
    uint256 internal constant P =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

    WithdrawVerifier internal w;
    RagequitVerifier internal r;

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    function setUp() public {
        w = new WithdrawVerifier();
        r = new RagequitVerifier();
    }

    function _proof(string memory json) internal pure returns (Proof memory p) {
        uint256[] memory a = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".pB[0]");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".pB[1]");
        uint256[] memory c = vm.parseJsonUintArray(json, ".pC");
        p.a = [a[0], a[1]];
        p.b = [[b0[0], b0[1]], [b1[0], b1[1]]];
        p.c = [c[0], c[1]];
    }

    function _w(string memory name) internal view returns (Proof memory p, uint256[9] memory s) {
        string memory json = vm.readFile(string.concat("../fixtures/", name));
        p = _proof(json);
        uint256[] memory x = vm.parseJsonUintArray(json, ".pubSignals");
        for (uint256 i = 0; i < 9; i++) {
            s[i] = x[i];
        }
    }

    function test_withdrawFixturesVerify() public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        assertTrue(w.verifyProof(p.a, p.b, p.c, s));
        (p, s) = _w("withdraw-noasp-full.json");
        assertTrue(w.verifyProof(p.a, p.b, p.c, s));
    }

    function test_withdrawTamperEachSignal() public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        for (uint256 i = 0; i < 9; i++) {
            uint256[9] memory t = s;
            t[i] = (t[i] + 1) % P;
            assertFalse(w.verifyProof(p.a, p.b, p.c, t));
        }
    }

    function test_withdrawRejectsNonCanonicalSignal() public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        for (uint256 i = 0; i < 9; i++) {
            uint256[9] memory t = s;
            t[i] = t[i] + P; // same field element, non-canonical encoding
            assertFalse(w.verifyProof(p.a, p.b, p.c, t));
        }
    }

    function test_withdrawRejectsUnswappedG2() public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        uint256[2][2] memory b = [[p.b[0][1], p.b[0][0]], [p.b[1][1], p.b[1][0]]];
        assertFalse(w.verifyProof(p.a, b, p.c, s));
    }

    function testFuzz_withdrawRandomContextRejected(uint256 ctx) public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        vm.assume(ctx != s[8]);
        s[8] = ctx;
        assertFalse(w.verifyProof(p.a, p.b, p.c, s));
    }

    function test_ragequitFixture() public view {
        string memory json = vm.readFile("../fixtures/ragequit.json");
        Proof memory p = _proof(json);
        uint256[] memory x = vm.parseJsonUintArray(json, ".pubSignals");
        uint256[4] memory s = [x[0], x[1], x[2], x[3]];
        assertTrue(r.verifyProof(p.a, p.b, p.c, s));
        for (uint256 i = 0; i < 4; i++) {
            uint256[4] memory t = s;
            t[i] = (t[i] + 1) % P;
            assertFalse(r.verifyProof(p.a, p.b, p.c, t));
            t = s;
            t[i] = s[i] + P;
            assertFalse(r.verifyProof(p.a, p.b, p.c, t));
        }
    }

    function test_withdrawProofDoesNotVerifyAsRagequit() public view {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        assertFalse(r.verifyProof(p.a, p.b, p.c, [s[0], s[1], s[2], s[3]]));
    }

    function test_gas() public {
        (Proof memory p, uint256[9] memory s) = _w("withdraw-asp.json");
        uint256 g = gasleft();
        w.verifyProof(p.a, p.b, p.c, s);
        uint256 used = g - gasleft();
        emit log_named_uint("WithdrawVerifier.verifyProof gas (9 signals, incl. call)", used);
        assertLt(used, 300_000);
    }
}
