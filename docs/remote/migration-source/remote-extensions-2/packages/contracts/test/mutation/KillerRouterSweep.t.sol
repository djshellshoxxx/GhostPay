// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Base} from "../Base.t.sol";
import {SweepBase} from "../SweepBase.t.sol";
import {PermitToken} from "../mocks/PermitToken.sol";
import {IGhostPaySweepRelayer} from "../../src/interfaces/IGhostPaySweepRelayer.sol";

/// @notice Killers for gambit mutants that survived the pre-existing suite
/// (see docs/remote/mutation-and-mythril.md).
contract RouterPermitAnnounceKillerTest is Base {
    bytes32 private constant ANNOUNCEMENT_SIG =
        keccak256("Announcement(uint256,address,address,bytes,bytes)");

    /// Mutant: `ANNOUNCER.announce(...)` deleted from payERC20WithPermit.
    function test_payERC20WithPermit_announcesToAnnouncer() public {
        (address payer, uint256 pk) = makeAddrAndKey("payer");
        PermitToken t = new PermitToken(6);
        t.mint(payer, GROSS);
        uint256 net = GROSS - _fee(GROSS);
        uint256 dl = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                payer,
                address(router),
                GROSS,
                t.nonces(payer),
                dl
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", t.DOMAIN_SEPARATOR(), structHash)));
        bytes memory meta = _erc20Meta(address(t), net);
        vm.recordLogs();
        vm.prank(payer);
        router.payERC20WithPermit(
            IERC20(address(t)), stealth, GROSS, net, dl, _eph(), meta, v, r, s
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 seen;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(announcer) && logs[i].topics[0] == ANNOUNCEMENT_SIG) {
                seen++;
                assertEq(address(uint160(uint256(logs[i].topics[2]))), stealth);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), address(router));
                (bytes memory eph, bytes memory m) = abi.decode(logs[i].data, (bytes, bytes));
                assertEq(eph, _eph());
                assertEq(m, meta);
            }
        }
        assertEq(seen, 1);
    }
}

contract SweepNonceKillerTest is SweepBase {
    /// Mutant: `word & bit` -> `word / bit`. A set HIGHER bit must not make a LOWER fresh nonce
    /// look used.
    function test_sweep_lowerNonceUsableAfterHigherNonceInSameWord() public {
        _approveRelayer(address(token), 3 * AMOUNT);
        IGhostPaySweepRelayer.Sweep memory hi = _sweep(8);
        relayer.sweep(hi, _sign(ownerPk, hi));
        IGhostPaySweepRelayer.Sweep memory lo = _sweep(1);
        relayer.sweep(lo, _sign(ownerPk, lo));
        assertTrue(relayer.nonceUsed(owner, 8));
        assertTrue(relayer.nonceUsed(owner, 1));
        assertFalse(relayer.nonceUsed(owner, 0));
        assertFalse(relayer.nonceUsed(owner, 2));
        assertFalse(relayer.nonceUsed(owner, 9));
    }

    /// Mutant: `if (s.fee != 0)` -> `if (true)`. A zero fee must not emit a zero-value transfer to
    /// `feeTo`.
    function test_sweep_zeroFeeEmitsNoTransferToFeeTo() public {
        IGhostPaySweepRelayer.Sweep memory s = _sweep(3);
        s.fee = 0;
        _approveRelayer(address(token), AMOUNT);
        bytes memory sig = _sign(ownerPk, s);
        vm.recordLogs();
        relayer.sweep(s, sig);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferSig = keccak256("Transfer(address,address,uint256)");
        uint256 transfers;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(token) && logs[i].topics[0] == transferSig) {
                transfers++;
                assertTrue(address(uint160(uint256(logs[i].topics[2]))) != feeTo);
            }
        }
        assertEq(transfers, 1);
    }
}
