// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {GhostPayRouter} from "ghostpay-contracts/GhostPayRouter.sol";
import {GhostPayPolicyRouter} from "ghostpay-contracts/GhostPayPolicyRouter.sol";
import {PolicyAccount} from "ghostpay-contracts/PolicyAccount.sol";
import {PolicyAccountFactory} from "ghostpay-contracts/PolicyAccountFactory.sol";
import {IERC5564Announcer} from "ghostpay-contracts/interfaces/IERC5564Announcer.sol";
import {IGhostPayRouter} from "ghostpay-contracts/interfaces/IGhostPayRouter.sol";
import {IGhostPayPolicyRouter} from "ghostpay-contracts/interfaces/IGhostPayPolicyRouter.sol";
import {ERC5564Announcer} from "ghostpay-utils/ERC5564Announcer.sol";
import {MockERC20} from "ghostpay-mocks/MockERC20.sol";
import {PermitToken} from "ghostpay-mocks/PermitToken.sol";

/// @notice Shared fixture: reference announcer, both GhostPay routers, tokens and calldata helpers.
abstract contract PHBase is Test {
    ERC5564Announcer internal announcer;
    GhostPayRouter internal router;
    GhostPayPolicyRouter internal policyRouter;
    PolicyAccountFactory internal policyFactory;
    MockERC20 internal token; // 6 decimals, no permit
    PermitToken internal ptoken; // 6 decimals, ERC-2612

    address internal feeRecipient = makeAddr("feeRecipient");
    address internal stealth = makeAddr("stealth");
    address internal sponsor = makeAddr("sponsor");
    address internal sponsorFeeTo = makeAddr("sponsorFeeTo");
    address internal policyOwner = makeAddr("policyOwner");
    bytes32 internal policyHash = keccak256("policy");
    address internal policyStealth;

    uint256 internal payerPk;
    address internal payer;

    uint256 internal constant GROSS = 1_000_000_000; // 1000 units @ 6 decimals
    uint256 internal constant SPONSOR_FEE = 2_000_000;
    uint256 internal constant T0 = 1_700_000_000;

    function setUp() public virtual {
        vm.warp(T0);
        (payer, payerPk) = makeAddrAndKey("payer");
        announcer = new ERC5564Announcer();
        router = new GhostPayRouter(IERC5564Announcer(address(announcer)), feeRecipient);
        policyFactory =
            new PolicyAccountFactory(address(new PolicyAccount()), address(0), 0, feeRecipient);
        policyRouter = new GhostPayPolicyRouter(
            IERC5564Announcer(address(announcer)), feeRecipient, policyFactory
        );
        policyStealth = policyFactory.predictAddress(policyOwner, policyHash);
        token = new MockERC20("USD Coin", "USDC", 6);
        ptoken = new PermitToken(6);
    }

    function _fee(uint256 gross) internal pure returns (uint256) {
        return gross * 25 / 10_000;
    }

    function _eph() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x02), bytes32(uint256(0x1234)));
    }

    function _erc20Meta(address asset, uint256 net) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0xab), bytes4(0xa9059cbb), asset, net);
    }

    /// @dev Plain GhostPayRouter.payERC20 calldata.
    function _plainCalldata(address tok, address to, uint256 gross)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeCall(
            IGhostPayRouter.payERC20,
            (
                IERC20(tok),
                to,
                gross,
                gross - _fee(gross),
                T0 + 1 days,
                _eph(),
                _erc20Meta(tok, gross - _fee(gross))
            )
        );
    }

    /// @dev GhostPayPolicyRouter.payERC20 calldata (stealth must be the predicted policy account).
    function _policyCalldata(address tok, uint256 gross) internal view returns (bytes memory) {
        return abi.encodeCall(
            IGhostPayPolicyRouter.payERC20,
            (
                IERC20(tok),
                policyStealth,
                IGhostPayPolicyRouter.PolicyRef({owner: policyOwner, policyHash: policyHash}),
                gross,
                gross - _fee(gross),
                T0 + 1 days,
                _eph(),
                _erc20Meta(tok, gross - _fee(gross))
            )
        );
    }

    function _typed(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(domainSeparator, structHash);
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
