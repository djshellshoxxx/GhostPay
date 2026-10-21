// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Base} from "../Base.t.sol";
import {PermitToken} from "../mocks/PermitToken.sol";

/// @notice Mutation-testing killer: `payERC20WithPermit` must announce (gambit GhostPayRouter #15).
contract MutationRouterPermitAnnounceTest is Base {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function test_payERC20WithPermit_announces() public {
        (address payer, uint256 pk) = makeAddrAndKey("permitPayer");
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

        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, address(router), _eph(), meta);
        vm.prank(payer);
        router.payERC20WithPermit(
            IERC20(address(t)), stealth, GROSS, net, dl, _eph(), meta, v, r, s
        );
    }
}
