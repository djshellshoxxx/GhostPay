// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test, stdJson} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {GhostPayPayRelay} from "../src/GhostPayPayRelay.sol";
import {GhostPayPayerDelegate} from "../src/GhostPayPayerDelegate.sol";
import {GhostPayPayerAccount} from "../src/GhostPayPayerAccount.sol";
import {GhostPayPayerAccountFactory} from "../src/GhostPayPayerAccountFactory.sol";
import {GhostPayVerifyingPaymaster} from "../src/GhostPayVerifyingPaymaster.sol";
import {IGhostPayPayRelay} from "../src/interfaces/IGhostPayPayRelay.sol";
import {IGhostPayPayerDelegate} from "../src/interfaces/IGhostPayPayerDelegate.sol";
import {PackedUserOperation} from "../src/interfaces/IERC4337.sol";
import {RouterCall} from "../src/RouterCall.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {PackedUserOperation as EpOp} from "account-abstraction/interfaces/PackedUserOperation.sol";

/// @notice Recomputes, with the real contracts, every value in packages/payer-sponsor/test-vectors/ph-vectors.json
/// (produced by the TypeScript package). Agreement of both sides is the cross-language proof that the
/// TypeScript typed data, calldata and hashes are what the contracts verify.
contract GoldenVectorsTest is Test {
    using stdJson for string;

    string internal j;
    uint256 internal gross;
    uint256 internal sponsorFee;

    function setUp() public {
        vm.chainId(31_337);
        j = vm.readFile("../payer-sponsor/test-vectors/ph-vectors.json");
        gross = vm.parseUint(j.readString(".pay.gross"));
        sponsorFee = vm.parseUint(j.readString(".sponsorFee"));
    }

    function _a(string memory key) internal view returns (address) {
        return j.readAddress(string.concat(".addresses.", key));
    }

    function test_routerCalldata_isAcceptedByRouterCallMatches() public view {
        bytes memory data = j.readBytes(".routerCalldata");
        assertEq(keccak256(data), j.readBytes32(".payloadHash"));
        assertTrue(this.matches(data, _a("token"), _a("stealth"), gross));
    }

    function matches(bytes calldata d, address t, address s, uint256 g)
        external
        pure
        returns (bool)
    {
        return RouterCall.matches(d, t, s, g);
    }

    function test_relayDigest() public {
        deployCodeTo("GhostPayPayRelay.sol:GhostPayPayRelay", _a("relay"));
        IGhostPayPayRelay.PayIntent memory i = IGhostPayPayRelay.PayIntent({
            payer: _a("payer"),
            router: _a("router"),
            token: _a("token"),
            stealth: _a("stealth"),
            gross: gross,
            sponsorFee: sponsorFee,
            sponsorFeeTo: _a("sponsorFeeTo"),
            deadline: 1_700_003_600,
            nonce: 7,
            payloadHash: j.readBytes32(".payloadHash")
        });
        GhostPayPayRelay r = GhostPayPayRelay(_a("relay"));
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            r.DOMAIN_SEPARATOR(), keccak256(abi.encode(r.PAYINTENT_TYPEHASH(), i))
        );
        assertEq(digest, j.readBytes32(".expected.relayDigest"));
    }

    function test_delegateDigest() public {
        // the payer EOA runs the delegate code, so the domain's verifyingContract is the payer address
        address payer = _a("payer");
        GhostPayPayerDelegate impl = new GhostPayPayerDelegate();
        vm.etch(payer, address(impl).code);
        GhostPayPayerDelegate d = GhostPayPayerDelegate(payable(payer));
        IGhostPayPayerDelegate.PayIntent memory i = IGhostPayPayerDelegate.PayIntent({
            router: _a("router"),
            token: _a("token"),
            stealth: _a("stealth"),
            gross: gross,
            sponsorFee: sponsorFee,
            sponsorFeeTo: _a("sponsorFeeTo"),
            deadline: 1_700_003_600,
            nonce: 7,
            payloadHash: j.readBytes32(".payloadHash")
        });
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            d.DOMAIN_SEPARATOR(), keccak256(abi.encode(d.PAYINTENT_TYPEHASH(), i))
        );
        assertEq(digest, j.readBytes32(".expected.delegateDigest"));
    }

    function _op() internal view returns (EpOp memory op) {
        op.sender = _a("account");
        op.nonce = vm.parseUint(j.readString(".userOp.nonce"));
        op.initCode = j.readBytes(".expected.userOpInitCode");
        op.callData = j.readBytes(".expected.userOpCallData");
        op.accountGasLimits = j.readBytes32(".userOp.accountGasLimits");
        op.preVerificationGas = vm.parseUint(j.readString(".userOp.preVerificationGas"));
        op.gasFees = j.readBytes32(".userOp.gasFees");
        op.paymasterAndData = j.readBytes(".userOp.paymasterAndData");
    }

    function test_userOpHash_matchesEntryPointV07() public {
        deployCodeTo("EntryPoint.sol:EntryPoint", _a("entryPoint"));
        EpOp memory op = _op();
        assertEq(
            EntryPoint(payable(_a("entryPoint"))).getUserOpHash(op),
            j.readBytes32(".expected.userOpHash")
        );
    }

    function test_initCodeAndCallData_matchContracts() public {
        deployCodeTo("EntryPoint.sol:EntryPoint", _a("entryPoint"));
        GhostPayPayerAccountFactory f = new GhostPayPayerAccountFactory(_a("entryPoint"));
        bytes memory init =
            abi.encodePacked(address(f), abi.encodeCall(f.createAccount, (_a("owner"), 7)));
        // the vector's factory address is symbolic; the calldata part after the 20-byte address must match
        bytes memory want = j.readBytes(".expected.userOpInitCode");
        assertEq(keccak256(slice(want, 20)), keccak256(slice(init, 20)));
        GhostPayPayerAccount.Call[] memory calls = new GhostPayPayerAccount.Call[](4);
        address token = _a("token");
        address router = _a("router");
        calls[0] = GhostPayPayerAccount.Call(
            token, 0, abi.encodeWithSignature("approve(address,uint256)", router, gross)
        );
        calls[1] = GhostPayPayerAccount.Call(router, 0, j.readBytes(".routerCalldata"));
        calls[2] = GhostPayPayerAccount.Call(
            token, 0, abi.encodeWithSignature("approve(address,uint256)", router, 0)
        );
        calls[3] = GhostPayPayerAccount.Call(
            token,
            0,
            abi.encodeWithSignature("transfer(address,uint256)", _a("sponsorFeeTo"), sponsorFee)
        );
        assertEq(
            abi.encodeCall(GhostPayPayerAccount.executeBatch, (calls)),
            j.readBytes(".expected.userOpCallData")
        );
    }

    function test_paymasterHash() public {
        deployCodeTo("EntryPoint.sol:EntryPoint", _a("entryPoint"));
        deployCodeTo(
            "GhostPayVerifyingPaymaster.sol:GhostPayVerifyingPaymaster",
            abi.encode(
                _a("entryPoint"), makeAddr("signer"), makeAddr("admin"), 50 gwei, 2 gwei, 200_000
            ),
            _a("paymaster")
        );
        EpOp memory e = _op();
        PackedUserOperation memory op = PackedUserOperation(
            e.sender,
            e.nonce,
            e.initCode,
            e.callData,
            e.accountGasLimits,
            e.preVerificationGas,
            e.gasFees,
            e.paymasterAndData,
            ""
        );
        bytes32 h = this.pmHash(
            op,
            uint48(vm.parseUint(j.readString(".paymaster.validUntil"))),
            uint48(vm.parseUint(j.readString(".paymaster.validAfter")))
        );
        assertEq(h, j.readBytes32(".expected.paymasterHash"));
    }

    function pmHash(PackedUserOperation calldata op, uint48 until, uint48 after_)
        external
        view
        returns (bytes32)
    {
        return GhostPayVerifyingPaymaster(_a("paymaster")).getHash(op, until, after_);
    }

    function slice(bytes memory b, uint256 from) internal pure returns (bytes memory out) {
        out = new bytes(b.length - from);
        for (uint256 k; k < out.length; ++k) {
            out[k] = b[k + from];
        }
    }
}
