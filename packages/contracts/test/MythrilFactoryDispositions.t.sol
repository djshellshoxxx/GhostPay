// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm, VmSafe} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Errors} from "@openzeppelin/contracts/utils/Errors.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PolicyAccount} from "../src/PolicyAccount.sol";
import {PolicyAccountFactory} from "../src/PolicyAccountFactory.sol";
import {IPolicyAccount} from "../src/interfaces/IPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";
import {NoReturnToken} from "./mocks/NoReturnToken.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";

// Adversarial dispositions of the eight PolicyAccountFactory Mythril 0.24.8 records of
// contract-analysis run 43981233671, artifact 14290880802 (R4..R11; see
// docs/audits/mythril-14290880802-factory-dispositions.md).
// Every test name starts with the record id(s) it is evidence for. All keys/addresses are synthetic.

/// @dev Code run by `HookedFeeToken.transferFrom` before it moves funds: the exact window in which
/// Mythril reports "state access after external call" (R5, R9) and "call to user-supplied address" (R10).
interface IFeeHook {
    function onTransferFrom(address from, address to, uint256 value) external;
}

/// @dev Standard OZ ERC-20 whose `transferFrom` first hands control to an arbitrary hook. Configuration
/// lives in storage only, so the runtime code can also be etched at a Mythril-solved address.
contract HookedFeeToken is ERC20 {
    IFeeHook public hook;

    constructor() ERC20("Hooked fee token", "HOOK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHook(IFeeHook hook_) external {
        hook = hook_;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        IFeeHook h = hook;
        if (address(h) != address(0)) h.onTransferFrom(from, to, value);
        return super.transferFrom(from, to, value);
    }
}

/// @dev Re-enters `deploy` (same and different parameters) from inside the fee transfer.
contract ReenterDeployHook is IFeeHook {
    PolicyAccountFactory internal immutable FACTORY;
    bytes internal sameCall;
    bytes internal otherCall;
    uint256 public calls;
    bool public sameOk;
    bool public otherOk;
    bytes public sameErr;
    bytes public otherErr;

    constructor(PolicyAccountFactory factory_, bytes memory sameCall_, bytes memory otherCall_) {
        FACTORY = factory_;
        sameCall = sameCall_;
        otherCall = otherCall_;
    }

    function onTransferFrom(address, address, uint256) external {
        calls++;
        (sameOk, sameErr) = address(FACTORY).call(sameCall);
        (otherOk, otherErr) = address(FACTORY).call(otherCall);
    }
}

/// @dev From inside the fee transfer: tries to initialise the not-yet-created clone address with
/// attacker parameters, tries to initialise the implementation, and pre-funds the counterfactual address.
contract HijackInitHook is IFeeHook {
    address internal immutable PREDICTED;
    address internal immutable IMPLEMENTATION;
    address internal immutable ATTACKER;
    uint256 public predictedCodeLengthDuringFee = type(uint256).max;
    bool public predictedInitCallOk;
    bool public implInitOk;
    bytes public implInitErr;
    bool public prefundOk;

    constructor(address predicted_, address implementation_, address attacker_) payable {
        PREDICTED = predicted_;
        IMPLEMENTATION = implementation_;
        ATTACKER = attacker_;
    }

    function onTransferFrom(address, address, uint256) external {
        predictedCodeLengthDuringFee = PREDICTED.code.length;
        bytes memory init =
            abi.encodeCall(IPolicyAccount.initialize, (ATTACKER, ATTACKER, 1 days, bytes32(0)));
        (predictedInitCallOk,) = PREDICTED.call(init);
        (implInitOk, implInitErr) = IMPLEMENTATION.call(init);
        (prefundOk,) = PREDICTED.call{value: 1 ether}("");
    }
}

/// @dev Test-only: makes the CREATE2 target occupied between the factory's `AlreadyDeployed` check and
/// `cloneDeterministic` (impossible on a real chain without the factory itself; simulated with a cheatcode)
/// to prove that a CREATE2 failure after the fee call rolls the fee back.
contract EtchCollisionHook is IFeeHook {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal immutable PREDICTED;

    constructor(address predicted_) {
        PREDICTED = predicted_;
    }

    function onTransferFrom(address, address, uint256) external {
        VM.etch(PREDICTED, hex"00");
    }
}

/// @dev ERC-20 whose `balanceOf(blocked)` or `allowance` reverts (a fee token with broken view functions).
contract ViewRevertToken is ERC20 {
    address public blockedBalanceOf;
    bool public allowanceReverts;

    error ViewUnavailable();

    constructor() ERC20("View revert", "VRT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlockedBalanceOf(address account) external {
        blockedBalanceOf = account;
    }

    function setAllowanceReverts(bool flag) external {
        allowanceReverts = flag;
    }

    function balanceOf(address account) public view override returns (uint256) {
        if (account != address(0) && account == blockedBalanceOf) revert ViewUnavailable();
        return super.balanceOf(account);
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        if (allowanceReverts) revert ViewUnavailable();
        return super.allowance(owner, spender);
    }
}

/// @dev Exposes the ERC-20 view selectors as state-mutating functions; the factory reaches them with
/// STATICCALL (IERC20 declares them `view`), so the write inside must make the read fail.
contract MutatingViewToken {
    uint256 public reads;
    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => uint256)) internal _allowances;

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function balanceOf(address account) external returns (uint256) {
        reads++;
        return _balances[account];
    }

    function allowance(address owner, address spender) external returns (uint256) {
        reads++;
        return _allowances[owner][spender];
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _allowances[from][msg.sender] -= amount;
        _balances[from] -= amount;
        _balances[to] += amount;
        return true;
    }
}

/// @dev Returns the 32-byte word 2 (not ABI `true`) from `transferFrom`; optionally moves funds first.
contract NonCanonicalTrueToken is ERC20 {
    bool public moveFunds;

    constructor() ERC20("Non-canonical true", "NCT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setMoveFunds(bool flag) external {
        moveFunds = flag;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (moveFunds) super.transferFrom(from, to, value);
        assembly ("memory-safe") {
            mstore(0x00, 2)
            return(0x00, 0x20)
        }
    }
}

/// @dev `transferFrom` reverts with 128 KiB of revert data and moves nothing (return-data bomb).
contract ReturnBombToken is ERC20 {
    constructor() ERC20("Return bomb", "BOMB") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        assembly {
            revert(0x00, 0x20000)
        }
    }
}

/// @dev Standard ERC-20 whose `transferFrom` burns `burnGas` before transferring (gas-starvation probe).
contract GasBurnToken is ERC20 {
    uint256 public burnGas;

    constructor() ERC20("Gas burn", "GAS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBurnGas(uint256 burnGas_) external {
        burnGas = burnGas_;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        uint256 start = gasleft();
        uint256 burn = burnGas;
        while (start - gasleft() < burn) {}
        return super.transferFrom(from, to, value);
    }
}

/// @dev Test-only implementation (not production): its `initialize` re-enters the factory, which is the
/// only way the fresh clone could call back during the window Mythril reports in R6.
contract ReentrantInitImplementation {
    function initialize(address owner_, address destination_, uint256 delay_, bytes32 root_)
        external
    {
        PolicyAccountFactory(msg.sender).deploy(owner_, destination_, delay_ + 1, root_);
    }
}

/// @dev Test-only implementation whose `initialize` always reverts (rollback after the fee pull).
contract RevertingInitImplementation {
    error InitRefused();

    function initialize(address, address, uint256, bytes32) external pure {
        revert InitRefused();
    }
}

/// @dev Deploys its own clone of the implementation, so a third party can try to initialise it.
contract ForeignCloner {
    function cloneOf(address implementation, bytes32 salt) external returns (address) {
        return Clones.cloneDeterministic(implementation, salt);
    }
}

contract MythrilFactoryDispositionsTest is Test {
    event AccountDeployed(address indexed account);
    event FeeWaived(address indexed account);

    // OZ 5.6.1 ReentrancyGuard storage slot (ReentrancyGuard.sol:36-37).
    bytes32 internal constant GUARD_SLOT =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;
    uint256 internal constant DELAY = 1 days;
    uint256 internal constant FEE = 3e6;
    bytes32 internal constant ROOT = keccak256("synthetic limits root");

    // Mythril 0.24.8 actors used in the run-14290880802 transaction sequences.
    address internal constant M_CREATOR = 0xafFEaFFEAFfeAfFEAffeaFfEAfFEaffeafFeAFfE;
    address internal constant M_ATTACKER = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;
    address internal constant M_SOMEGUY = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    // Mythril-solved deploy() arguments (records R4-R7, R9, R10).
    address internal constant M_OWNER = address(1);
    address internal constant M_DEST = 0xFFFFfb5f430064a4401430521dcdc03b0c002600;

    PolicyAccount internal impl;
    PolicyAccountFactory internal factory;
    MockERC20 internal feeToken;

    address internal owner = makeAddr("stealthOwner");
    address internal destination = makeAddr("coldDestination");
    address internal otherDestination = makeAddr("otherDestination");
    address internal payer = makeAddr("payer");
    address internal attacker = makeAddr("attacker");
    address internal feeRecipient = makeAddr("feeRecipient");

    function setUp() public {
        impl = new PolicyAccount();
        feeToken = new MockERC20("USD Coin", "USDC", 6);
        factory = new PolicyAccountFactory(address(impl), address(feeToken), FEE, feeRecipient);
        feeToken.mint(payer, 100 * FEE);
        vm.prank(payer);
        feeToken.approve(address(factory), type(uint256).max);
    }

    // =========================================================== shared helpers

    function _predict(PolicyAccountFactory f, address o, address d, uint256 delay, bytes32 r)
        internal
        view
        returns (address)
    {
        return f.predictAddress(o, f.policyHashOf(d, delay, r));
    }

    function _eip1167(address implementation) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"363d3d373d3d3d363d73", implementation, hex"5af43d82803e903d91602b57fd5bf3"
        );
    }

    function _assertPolicy(address account, address o, address d, uint256 delay, bytes32 r)
        internal
        view
    {
        PolicyAccount a = PolicyAccount(payable(account));
        assertTrue(a.initialized(), "initialized");
        assertEq(a.owner(), o, "owner");
        assertEq(a.destination(), d, "destination");
        assertEq(uint256(a.delay()), delay, "delay");
        assertEq(a.limitsRoot(), r, "limitsRoot");
    }

    function _guard(address f) internal view returns (uint256) {
        return uint256(vm.load(f, GUARD_SLOT));
    }

    function _fund(address token, address who, address spender, uint256 amount) internal {
        MockERC20(token).mint(who, amount);
        vm.prank(who);
        IERC20(token).approve(spender, type(uint256).max);
    }

    function _isCallKind(VmSafe.AccountAccessKind k) internal pure returns (bool) {
        return k == VmSafe.AccountAccessKind.Call || k == VmSafe.AccountAccessKind.StaticCall
            || k == VmSafe.AccountAccessKind.DelegateCall || k == VmSafe.AccountAccessKind.CallCode
            || k == VmSafe.AccountAccessKind.Create;
    }

    /// @dev Message calls and creates issued by `from`'s own frame (depth = entry depth + 1), in execution
    /// order. Depth matters: the recorder reports a nested DELEGATECALL's accessor as the delegating
    /// frame's msg.sender, so the clone's DELEGATECALL would otherwise be attributed to the factory.
    function _callsFrom(VmSafe.AccountAccess[] memory acc, address from)
        internal
        pure
        returns (VmSafe.AccountAccess[] memory out)
    {
        uint64 entryDepth = type(uint64).max;
        for (uint256 i; i < acc.length; i++) {
            if (acc[i].account == from && acc[i].kind == VmSafe.AccountAccessKind.Call) {
                entryDepth = acc[i].depth;
                break;
            }
        }
        uint256 n;
        for (uint256 i; i < acc.length; i++) {
            if (_issuedBy(acc[i], from, entryDepth)) n++;
        }
        out = new VmSafe.AccountAccess[](n);
        n = 0;
        for (uint256 i; i < acc.length; i++) {
            if (_issuedBy(acc[i], from, entryDepth)) out[n++] = acc[i];
        }
    }

    function _issuedBy(VmSafe.AccountAccess memory a, address from, uint64 entryDepth)
        internal
        pure
        returns (bool)
    {
        return entryDepth != type(uint64).max && a.accessor == from && a.depth == entryDepth + 1
            && _isCallKind(a.kind);
    }

    /// @dev Every DELEGATECALL recorded in `acc`.
    function _delegateCalls(VmSafe.AccountAccess[] memory acc)
        internal
        pure
        returns (VmSafe.AccountAccess[] memory out)
    {
        uint256 n;
        for (uint256 i; i < acc.length; i++) {
            if (acc[i].kind == VmSafe.AccountAccessKind.DelegateCall) n++;
        }
        out = new VmSafe.AccountAccess[](n);
        n = 0;
        for (uint256 i; i < acc.length; i++) {
            if (acc[i].kind == VmSafe.AccountAccessKind.DelegateCall) out[n++] = acc[i];
        }
    }

    // =========================================================== R4 (SWC-110, Low)
    // Mythril: "Exception State" in contract 0x72c6…5015, function fallback, PC 30, mapped to the whole
    // factory contract ("internal compiler generated code"). 0x72c6…5015 is Mythril's synthetic address
    // for the factory's first created account (CREATE address of 0x0901…B51F, nonce 0), i.e. the clone.

    function test_R4_mythrilCloneAccountAddressIsCreateNonceZeroOfModelFactory() public pure {
        assertEq(
            computeCreateAddress(0x0901d12ebE1b195E5AA8748E62Bd7734aE19B51F, 0),
            0x72C68108A82e82617B93D1bE0D7975d762035015
        );
    }

    function test_R4_cloneRuntimeIsExactEip1167_pc30IsGasNotInvalid() public {
        vm.prank(payer);
        address a = factory.deploy(owner, destination, DELAY, ROOT);
        bytes memory code = a.code;
        assertEq(code, _eip1167(address(impl)), "exact EIP-1167 runtime");
        assertEq(code.length, 45);
        assertEq(uint8(code[9]), 0x73, "PUSH20 implementation");
        assertEq(uint8(code[30]), 0x5a, "PC 30 is GAS");
        assertEq(uint8(code[31]), 0xf4, "PC 31 is DELEGATECALL");
        // Walk instruction boundaries: no INVALID (0xfe) opcode and no assert/Panic path exists.
        for (uint256 pc; pc < code.length; pc++) {
            uint8 op = uint8(code[pc]);
            assertTrue(op != 0xfe, "INVALID opcode in clone");
            if (op >= 0x60 && op <= 0x7f) pc += op - 0x5f;
        }
    }

    function test_R4_mythrilImplementationModelIsRejectedByConstructor() public {
        // Mythril solved implementation_ = address(1) (a precompile, no code) for every record.
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(address(1), address(0), 0, feeRecipient);
        vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
        new PolicyAccountFactory(makeAddr("eoaImplementation"), address(0), 0, feeRecipient);
    }

    function test_R4_cloneFallbackRevertsWithoutPanic_receiveAccepts() public {
        vm.prank(payer);
        address a = factory.deploy(owner, destination, DELAY, ROOT);
        bytes[4] memory inputs =
            [bytes(hex"deadbeef"), bytes(hex"01"), bytes(hex"ffffffff00"), bytes(hex"c4d66de8")];
        for (uint256 i; i < inputs.length; i++) {
            (bool ok, bytes memory ret) = a.call(inputs[i]);
            assertFalse(ok, "unknown selector must revert");
            assertEq(ret.length, 0, "no Panic(0x01) / no assert data");
        }
        (bool okValue,) = a.call{value: 1 ether}("");
        assertTrue(okValue, "receive() accepts native coin");
        assertEq(a.balance, 1 ether);
    }

    function test_R4_R5_doubleInitAndImplementationInitRevert() public {
        vm.prank(payer);
        address a = factory.deploy(owner, destination, DELAY, ROOT);
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        PolicyAccount(payable(a)).initialize(attacker, attacker, DELAY, bytes32(0));
        vm.prank(address(factory));
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        PolicyAccount(payable(a)).initialize(attacker, attacker, DELAY, bytes32(0));
        vm.expectRevert(IPolicyAccount.AlreadyInitialized.selector);
        impl.initialize(attacker, attacker, DELAY, bytes32(0));
        _assertPolicy(a, owner, destination, DELAY, ROOT);
    }

    function test_R5_foreignCloneCannotBeInitialisedByThirdParty() public {
        ForeignCloner cloner = new ForeignCloner();
        bytes32 salt = keccak256(abi.encode(owner, factory.policyHashOf(destination, DELAY, ROOT)));
        address foreign = cloner.cloneOf(address(impl), salt);
        assertTrue(foreign != _predict(factory, owner, destination, DELAY, ROOT));
        vm.prank(attacker);
        vm.expectRevert(IPolicyAccount.UnauthorizedInitializer.selector);
        PolicyAccount(payable(foreign)).initialize(owner, destination, DELAY, ROOT);
    }

    // =========================================================== R5 (SWC-107, Medium) / R9 (SWC-107, Medium)
    // Mythril: after the fee-token CALL (SafeERC20.sol:227, PC 2978, token modelled as attacker-controlled)
    // the factory performs CREATE2 (Clones.sol:104, PC 2887 = R9) and CALLs initialize (line 117, PC 999 = R5).

    function test_R5_R9_reentrantFeeTokenCannotReenterBeforeCreate2OrInitialize() public {
        HookedFeeToken token = new HookedFeeToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), type(uint256).max);
        ReenterDeployHook hook = new ReenterDeployHook(
            f,
            abi.encodeCall(f.deploy, (owner, destination, DELAY, ROOT)),
            abi.encodeCall(f.deploy, (owner, otherDestination, DELAY, ROOT))
        );
        token.setHook(hook);

        vm.prank(payer);
        address a = f.deploy(owner, destination, DELAY, ROOT);

        bytes memory reentrant =
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(hook.calls(), 1);
        assertFalse(hook.sameOk());
        assertEq(hook.sameErr(), reentrant, "same-salt re-entry blocked by guard");
        assertFalse(hook.otherOk());
        assertEq(hook.otherErr(), reentrant, "other-salt re-entry blocked by guard");
        assertEq(_predict(f, owner, otherDestination, DELAY, ROOT).code.length, 0);
        _assertPolicy(a, owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), 0, "fee debited exactly once");
        assertEq(token.balanceOf(feeRecipient), FEE, "fee credited exactly once");
        assertEq(_guard(address(f)), 1, "guard released");
    }

    function test_R5_R9_feeCallbackCannotPreInitialiseHijackOrBlockTheClone() public {
        HookedFeeToken token = new HookedFeeToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), type(uint256).max);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);
        HijackInitHook hook = new HijackInitHook{value: 1 ether}(predicted, address(impl), attacker);
        token.setHook(hook);

        vm.prank(payer);
        address a = f.deploy(owner, destination, DELAY, ROOT);

        assertEq(a, predicted);
        assertEq(hook.predictedCodeLengthDuringFee(), 0, "clone does not exist during fee call");
        assertTrue(hook.predictedInitCallOk(), "call to empty address is a no-op");
        assertFalse(hook.implInitOk());
        assertEq(
            hook.implInitErr(), abi.encodeWithSelector(IPolicyAccount.AlreadyInitialized.selector)
        );
        assertTrue(hook.prefundOk());
        _assertPolicy(a, owner, destination, DELAY, ROOT); // attacker parameters never stuck
        assertEq(a.balance, 1 ether, "pre-funded counterfactual balance kept, CREATE2 not blocked");
        assertEq(token.balanceOf(feeRecipient), FEE);
    }

    function test_R5_initializeFailureAfterFeePullRollsBackFee() public {
        RevertingInitImplementation badImpl = new RevertingInitImplementation();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(badImpl), address(feeToken), FEE, feeRecipient);
        vm.prank(payer);
        feeToken.approve(address(f), type(uint256).max);
        uint256 payerBefore = feeToken.balanceOf(payer);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);

        vm.prank(payer);
        vm.expectRevert(RevertingInitImplementation.InitRefused.selector);
        f.deploy(owner, destination, DELAY, ROOT);

        assertEq(feeToken.balanceOf(payer), payerBefore, "fee rolled back");
        assertEq(feeToken.balanceOf(feeRecipient), 0);
        assertEq(predicted.code.length, 0, "clone rolled back");
        assertEq(_guard(address(f)), 1);
    }

    function test_R9_create2FailureAfterFeeCallRevertsAtomically() public {
        HookedFeeToken token = new HookedFeeToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), type(uint256).max);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);
        token.setHook(new EtchCollisionHook(predicted));

        vm.prank(payer);
        vm.expectRevert(Errors.FailedDeployment.selector);
        f.deploy(owner, destination, DELAY, ROOT);

        assertEq(token.balanceOf(payer), FEE, "fee rolled back");
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(predicted.code.length, 0, "simulated collision rolled back too");
    }

    function test_R9_frontRunSameSaltDeploysVictimPolicy_victimPaysNothing() public {
        address predicted = _predict(factory, owner, destination, DELAY, ROOT);
        _fund(address(feeToken), attacker, address(factory), FEE);
        vm.prank(attacker);
        address a = factory.deploy(owner, destination, DELAY, ROOT);
        assertEq(a, predicted);
        _assertPolicy(a, owner, destination, DELAY, ROOT); // front-runner gains no authority

        uint256 payerBefore = feeToken.balanceOf(payer);
        uint256 recipientBefore = feeToken.balanceOf(feeRecipient);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyAccountFactory.AlreadyDeployed.selector, predicted)
        );
        factory.deploy(owner, destination, DELAY, ROOT);
        assertEq(feeToken.balanceOf(payer), payerBefore, "no second fee");
        assertEq(feeToken.balanceOf(feeRecipient), recipientBefore);
    }

    function test_R9_otherFactoryWithSameImplementationCannotOccupyAddress() public {
        PolicyAccountFactory other =
            new PolicyAccountFactory(address(impl), address(feeToken), FEE, feeRecipient);
        vm.prank(payer);
        feeToken.approve(address(other), type(uint256).max);
        address predicted = _predict(factory, owner, destination, DELAY, ROOT);
        vm.prank(payer);
        address squatted = other.deploy(owner, destination, DELAY, ROOT);
        assertTrue(squatted != predicted);
        assertEq(predicted.code.length, 0);
        vm.prank(payer);
        assertEq(factory.deploy(owner, destination, DELAY, ROOT), predicted);
    }

    // =========================================================== R5/R6/R9/R10: exact call and write sequence

    function test_R5_R6_R9_R10_exactCallOrderAndOnlyGuardWrites() public {
        address predicted = _predict(factory, owner, destination, DELAY, ROOT);
        vm.startStateDiffRecording();
        vm.prank(payer);
        address a = factory.deploy(owner, destination, DELAY, ROOT);
        VmSafe.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
        assertEq(a, predicted);

        VmSafe.AccountAccess[] memory calls = _callsFrom(acc, address(factory));
        assertEq(calls.length, 8, "eight factory-originated message calls/creates");
        VmSafe.AccountAccessKind S = VmSafe.AccountAccessKind.StaticCall;
        VmSafe.AccountAccessKind C = VmSafe.AccountAccessKind.Call;
        address t = address(feeToken);
        _expectAccess(calls[0], S, t, abi.encodeCall(IERC20.balanceOf, (payer))); // :130
        _expectAccess(calls[1], S, t, abi.encodeCall(IERC20.balanceOf, (feeRecipient))); // :131 R7
        _expectAccess(calls[2], S, t, abi.encodeCall(IERC20.allowance, (payer, address(factory)))); // :132 R8
        _expectAccess(
            calls[3], C, t, abi.encodeCall(IERC20.transferFrom, (payer, feeRecipient, FEE))
        ); // R10/R11
        _expectAccess(calls[4], S, t, abi.encodeCall(IERC20.balanceOf, (payer))); // :138
        _expectAccess(calls[5], S, t, abi.encodeCall(IERC20.balanceOf, (feeRecipient))); // :143
        assertEq(uint8(calls[6].kind), uint8(VmSafe.AccountAccessKind.Create), "CREATE2 (R9)");
        assertEq(calls[6].account, predicted);
        assertEq(calls[6].deployedCode, _eip1167(address(impl)));
        _expectAccess(
            calls[7],
            C,
            predicted,
            abi.encodeCall(IPolicyAccount.initialize, (owner, destination, DELAY, ROOT))
        ); // :117 R5
        for (uint256 i; i < calls.length; i++) {
            assertEq(calls[i].value, 0, "no value transferred");
            assertTrue(calls[i].account != owner && calls[i].account != destination, "R10");
        }
        // The single DELEGATECALL is the clone forwarding initialize to the fixed implementation.
        VmSafe.AccountAccess[] memory dcs = _delegateCalls(acc);
        assertEq(dcs.length, 1, "one DELEGATECALL");
        assertEq(dcs[0].account, address(impl));
        assertEq(
            dcs[0].data,
            abi.encodeCall(IPolicyAccount.initialize, (owner, destination, DELAY, ROOT))
        );

        // The factory's only persistent state is the guard: written 1->2 before any call and 2->1 after
        // initialize (the PC 1170 SSTORE Mythril maps to ReentrancyGuard.sol:99, R6).
        uint256 writes;
        for (uint256 i; i < acc.length; i++) {
            for (uint256 j; j < acc[i].storageAccesses.length; j++) {
                VmSafe.StorageAccess memory s = acc[i].storageAccesses[j];
                if (s.account != address(factory) || !s.isWrite) continue;
                assertEq(s.slot, GUARD_SLOT, "factory writes only the guard slot");
                assertFalse(s.reverted);
                if (writes == 0) {
                    assertEq(uint256(s.previousValue), 1);
                    assertEq(uint256(s.newValue), 2);
                } else {
                    assertEq(uint256(s.previousValue), 2);
                    assertEq(uint256(s.newValue), 1);
                }
                writes++;
            }
        }
        assertEq(writes, 2, "exactly ENTERED then NOT_ENTERED");
    }

    /// @dev R5 depends on initialize making no external call: the only message call or create recorded
    /// below the factory's initialize call is the clone's single DELEGATECALL to the fixed implementation.
    /// (Independent review: adding `destination_.call("")` to initialize left every other test passing.)
    function test_R5_initializeIssuesNoExternalCallBelowTheClone() public {
        address predicted = _predict(factory, owner, destination, DELAY, ROOT);
        vm.startStateDiffRecording();
        vm.prank(payer);
        factory.deploy(owner, destination, DELAY, ROOT);
        VmSafe.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();

        uint256 k = type(uint256).max;
        for (uint256 i; i < acc.length; i++) {
            if (acc[i].account == predicted && acc[i].kind == VmSafe.AccountAccessKind.Call) {
                k = i;
                break;
            }
        }
        assertTrue(k != type(uint256).max, "initialize call recorded");
        uint256 nested;
        for (uint256 i = k + 1; i < acc.length; i++) {
            if (acc[i].depth <= acc[k].depth || !_isCallKind(acc[i].kind)) continue;
            nested++;
            assertEq(
                uint8(acc[i].kind),
                uint8(VmSafe.AccountAccessKind.DelegateCall),
                "only DELEGATECALL"
            );
            assertEq(acc[i].account, address(impl), "only to the fixed implementation");
        }
        assertEq(nested, 1, "initialize makes no external call");
    }

    function _expectAccess(
        VmSafe.AccountAccess memory a,
        VmSafe.AccountAccessKind kind,
        address account,
        bytes memory data
    ) internal pure {
        assertEq(uint8(a.kind), uint8(kind), "kind");
        assertEq(a.account, account, "target");
        assertEq(a.data, data, "calldata");
        assertFalse(a.reverted, "reverted");
    }

    // =========================================================== R6 (SWC-107, Low)
    // Mythril: SSTORE at PC 1170 (source-mapped to ReentrancyGuard.sol:99 `= ENTERED`) after a call to a
    // fixed address; solved with flatFee == 0, so the only call is initialize on the fresh clone. Bytecode:
    // PC 1135 PUSH1 0x01 (NOT_ENTERED), PC 1137 PUSH32 guard slot, PC 1170 SSTORE, i.e. _nonReentrantAfter.

    function test_R6_guardIsHeldDuringInitialize_reentryFromCloneReverts() public {
        ReentrantInitImplementation reImpl = new ReentrantInitImplementation();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(reImpl), address(0), 0, feeRecipient);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        f.deploy(owner, destination, DELAY, ROOT);
        assertEq(predicted.code.length, 0);
        assertEq(_predict(f, owner, destination, DELAY + 1, ROOT).code.length, 0);
        assertEq(_guard(address(f)), 1);
    }

    function test_R6_feeFreeDeployMakesNoTokenCallAndReleasesGuard() public {
        MockERC20 unusedToken = new MockERC20("Unused", "UNU", 6);
        // Same shape as the Mythril R4/R6 model: flatFee == 0 (token address is irrelevant then).
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(unusedToken), 0, feeRecipient);
        assertEq(_guard(address(f)), 1);
        vm.startStateDiffRecording();
        address a = f.deploy(M_OWNER, M_DEST, 3600, bytes32(0));
        VmSafe.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
        VmSafe.AccountAccess[] memory calls = _callsFrom(acc, address(f));
        assertEq(calls.length, 2, "CREATE2 + initialize only");
        assertEq(uint8(calls[0].kind), uint8(VmSafe.AccountAccessKind.Create));
        assertEq(uint8(calls[1].kind), uint8(VmSafe.AccountAccessKind.Call));
        assertEq(calls[1].account, a);
        for (uint256 i; i < acc.length; i++) {
            assertTrue(acc[i].account != address(unusedToken), "fee token untouched");
        }
        assertEq(_guard(address(f)), 1, "released after the call");
        _assertPolicy(a, M_OWNER, M_DEST, 3600, bytes32(0));
        // Guard release is what lets the next independent deployment through.
        address b = f.deploy(M_OWNER, M_DEST, 3601, bytes32(0));
        assertGt(b.code.length, 0);
    }

    // =========================================================== R7 / R8 (SWC-113, Low)
    // Mythril: balanceOf(FEE_RECIPIENT) (line 131, PC 1668) and allowance (line 132, PC 1781) follow
    // another call in the same transaction; a permanently failing prior call would skip them.

    function test_R7_recipientBalanceOfRevertFailsClosedWithFullRollback() public {
        ViewRevertToken token = new ViewRevertToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);
        token.setBlockedBalanceOf(feeRecipient);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);

        vm.prank(payer);
        vm.expectRevert(ViewRevertToken.ViewUnavailable.selector);
        f.deploy(owner, destination, DELAY, ROOT);

        assertEq(predicted.code.length, 0);
        assertEq(token.balanceOf(payer), FEE);
        assertEq(token.allowance(payer, address(f)), FEE);
        assertEq(_guard(address(f)), 1);
    }

    function test_R8_allowanceRevertFailsClosedWithFullRollback() public {
        ViewRevertToken token = new ViewRevertToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);
        token.setAllowanceReverts(true);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);

        vm.prank(payer);
        vm.expectRevert(ViewRevertToken.ViewUnavailable.selector);
        f.deploy(owner, destination, DELAY, ROOT);

        assertEq(predicted.code.length, 0);
        assertEq(token.balanceOf(payer), FEE);
        assertEq(token.balanceOf(feeRecipient), 0);
    }

    function test_R7_R8_feeReadsAreStaticCalls_mutatingReadsFailClosed() public {
        MutatingViewToken token = new MutatingViewToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);

        vm.prank(payer);
        vm.expectRevert(); // EVM static-context violation inside the token, no return data
        f.deploy(owner, destination, DELAY, ROOT);

        assertEq(token.reads(), 0, "no read could change state");
        assertEq(predicted.code.length, 0);
    }

    function test_R7_R8_feeTokenWithoutCodeFailsClosed_feeFreeFactoryUnaffected() public {
        address noCode = makeAddr("feeTokenWithoutCode");
        PolicyAccountFactory f = new PolicyAccountFactory(address(impl), noCode, FEE, feeRecipient);
        vm.prank(payer);
        vm.expectRevert(bytes(""));
        f.deploy(owner, destination, DELAY, ROOT);
        assertEq(_predict(f, owner, destination, DELAY, ROOT).code.length, 0);

        PolicyAccountFactory free = new PolicyAccountFactory(address(impl), noCode, 0, feeRecipient);
        vm.prank(payer);
        address a = free.deploy(owner, destination, DELAY, ROOT);
        _assertPolicy(a, owner, destination, DELAY, ROOT);
    }

    // =========================================================== R10 (SWC-107 "user-supplied address", Low)
    // Mythril solved FEE_TOKEN (a constructor-set immutable) to its attacker actor. deploy() callers choose
    // only owner/destination/delay/limitsRoot, none of which is ever a call target.

    function testFuzz_R10_callTargetsAreFixedForAnyCallerInput(
        address o,
        address d,
        uint256 delay,
        bytes32 r,
        address caller
    ) public {
        delay = bound(delay, factory.MIN_DELAY(), factory.MAX_DELAY());
        vm.assume(o != address(0) && d != address(0) && caller != address(0));
        assumeNotForgeAddress(caller);
        vm.assume(caller != feeRecipient && caller != address(factory));
        vm.assume(o != address(feeToken) && d != address(feeToken));
        address predicted = _predict(factory, o, d, delay, r);
        vm.assume(d != predicted && o != predicted);
        _fund(address(feeToken), caller, address(factory), FEE);
        uint256 callerBefore = feeToken.balanceOf(caller);

        vm.startStateDiffRecording();
        vm.prank(caller);
        address a = factory.deploy(o, d, delay, r);
        VmSafe.AccountAccess[] memory calls =
            _callsFrom(vm.stopAndReturnStateDiff(), address(factory));

        assertEq(a, predicted);
        assertEq(calls.length, 8);
        for (uint256 i; i < calls.length; i++) {
            if (i < 6) assertEq(calls[i].account, address(feeToken), "fixed immutable token");
            else assertEq(calls[i].account, predicted, "fresh clone of fixed implementation");
        }
        assertEq(factory.FEE_TOKEN(), address(feeToken));
        assertEq(feeToken.balanceOf(caller), callerBefore - FEE);
    }

    // =========================================================== R11 (SWC-104, Medium)
    // Mythril: return value of the SafeERC20 CALL (SafeERC20.sol:227, PC 2978) "not checked". Bytecode
    // PC 2979-2991 consumes it (`and(success, eq(mload(0), 1))`, then the no-return-data rule at :239) and
    // PolicyAccountFactory.sol:135 branches on it. The module flags any CALL whose success can be 0 or 1 on
    // a path that still ends in RETURN, which is exactly the documented fee-waiver path.

    function test_R11_falseReturnWithFunds_waivesWithoutAnyBalanceChange() public {
        FalseReturnToken token = new FalseReturnToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        address predicted = _predict(f, owner, destination, DELAY, ROOT);
        vm.expectEmit(true, false, false, true, address(f));
        emit FeeWaived(predicted);
        vm.prank(payer);
        address a = f.deploy(owner, destination, DELAY, ROOT);
        _assertPolicy(a, owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), FEE);
        assertEq(token.balanceOf(feeRecipient), 0);
    }

    function test_R11_falseReturnWithoutFunds_revertsFeeTransferFailed() public {
        FalseReturnToken token = new FalseReturnToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE - 1);
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        f.deploy(owner, destination, DELAY, ROOT);
        assertEq(_predict(f, owner, destination, DELAY, ROOT).code.length, 0);
    }

    function test_R11_noReturnDataToken_collectsExactFee_insufficientAllowanceReverts() public {
        NoReturnToken token = new NoReturnToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, 2 * FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);
        vm.recordLogs();
        vm.prank(payer);
        address a = f.deploy(owner, destination, DELAY, ROOT);
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != FeeWaived.selector, "no waiver for void-return token");
        }
        _assertPolicy(a, owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), FEE);
        assertEq(token.balanceOf(feeRecipient), FEE);

        // Allowance is now 0: the void-return token reverts (underflow) and the factory refuses to waive.
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        f.deploy(owner, otherDestination, DELAY, ROOT);
    }

    function test_R11_nonCanonicalTrue_movingFundsReverts_notMovingWaives() public {
        NonCanonicalTrueToken token = new NonCanonicalTrueToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);

        token.setMoveFunds(true);
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.UnexpectedFeeDelta.selector);
        f.deploy(owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), FEE, "mutating failure rolled back");
        assertEq(token.allowance(payer, address(f)), FEE);

        token.setMoveFunds(false);
        vm.expectEmit(true, false, false, true, address(f));
        emit FeeWaived(_predict(f, owner, destination, DELAY, ROOT));
        vm.prank(payer);
        f.deploy(owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), FEE);
    }

    function test_R11_revertingTransferWithReturnDataBomb_waivesWithBoundedCopy() public {
        ReturnBombToken token = new ReturnBombToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE);
        vm.expectEmit(true, false, false, true, address(f));
        emit FeeWaived(_predict(f, owner, destination, DELAY, ROOT));
        vm.prank(payer);
        address a = f.deploy{gas: 2_000_000}(owner, destination, DELAY, ROOT);
        _assertPolicy(a, owner, destination, DELAY, ROOT);
        assertEq(token.balanceOf(payer), FEE);
    }

    function test_R11_revertingTransferWithInsufficientAllowance_doesNotWaive() public {
        BlacklistToken token = new BlacklistToken();
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), FEE - 1);
        token.setBlacklisted(feeRecipient, true);
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        f.deploy(owner, destination, DELAY, ROOT);
    }

    /// @dev A caller cannot starve an ordinary fee transfer into a failure and still have the 1/64 gas
    /// (EIP-150) left that the rest of deploy() needs; every success pays the fee, none waives it.
    function test_R11_gasStarvationOfOrdinaryFeeTransferNeverWaives() public {
        GasBurnToken token = new GasBurnToken();
        token.setBurnGas(500_000);
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), type(uint256).max);
        bytes memory data = abi.encodeCall(f.deploy, (owner, destination, DELAY, ROOT));
        uint256 ok;
        uint256 failed;
        for (uint256 g = 150_000; g <= 900_000; g += 2000) {
            uint256 snap = vm.snapshotState();
            vm.recordLogs();
            vm.prank(payer);
            (bool success,) = address(f).call{gas: g}(data);
            VmSafe.Log[] memory logs = vm.getRecordedLogs();
            if (success) {
                ok++;
                assertEq(token.balanceOf(feeRecipient), FEE, "every success pays the fee");
                for (uint256 i; i < logs.length; i++) {
                    assertTrue(logs[i].topics[0] != FeeWaived.selector, "no gas-induced waiver");
                }
            } else {
                failed++;
                assertEq(token.balanceOf(payer), FEE);
            }
            vm.revertToState(snap);
        }
        assertGt(ok, 0, "sweep reaches successful deployments");
        assertGt(failed, 0, "sweep reaches out-of-gas failures");
    }

    /// @dev Residual-risk boundary (not a production token): a fee token whose transferFrom needs more gas
    /// than ~63x the remainder of deploy() CAN be starved into the waiver path. Documents the bound.
    function test_R11_residual_gasHungryFeeTokenCanBeStarvedIntoWaiver() public {
        GasBurnToken token = new GasBurnToken();
        token.setBurnGas(20_000_000);
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), address(token), FEE, feeRecipient);
        token.mint(payer, FEE);
        vm.prank(payer);
        token.approve(address(f), type(uint256).max);
        vm.prank(payer);
        (bool success,) = address(f).call{gas: 19_000_000}(
            abi.encodeCall(f.deploy, (owner, destination, DELAY, ROOT))
        );
        assertTrue(success, "1/64 remainder suffices for the rest of deploy()");
        assertEq(token.balanceOf(payer), FEE, "fee waived by gas starvation");
        assertGt(_predict(f, owner, destination, DELAY, ROOT).code.length, 0);
    }

    // =========================================================== concrete replays of the Mythril sequences

    function test_replay_allMythrilCreationStepsAreInfeasible() public {
        // (feeToken, flatFee, feeRecipient) solved per record; implementation_ was address(1) in all.
        address[8] memory tok = [
            address(0),
            M_ATTACKER,
            address(0),
            0x0202010101010202010120010101010101400101,
            0x4000024000040102040101020810011002042008,
            M_ATTACKER,
            M_ATTACKER,
            0x0101200101010101010101004002400101010101
        ];
        uint256[8] memory fee = [
            uint256(0),
            0x4de2ef3f010104020801010101010104df28afff2ffeaffeaffeaffebfbecfff,
            0,
            0x5de2ef3f010101010101010202100208bbff855fe7cebabebe282ffebff407f7,
            0x70a00010010201008001010200400101affeafff37feb47eb6f6b7ff3bfecfff,
            0x4de2ef3f010104020801010101010104df28afff2ffeaffeaffeaffebfbecfff,
            0x5de8ef3f010101800001010101010101affecffeaffeaffeaffebcfecffebf7d,
            0x5de3923f018001010100404001020101aeafafefffab6eeffeafaeeffeb4304d
        ];
        address[8] memory rcp = [
            0x0204040108020401080101010101011001011001,
            0x0101400101010102010108020101020101010101,
            0x0102084001040102100480028001800202400201,
            0x4004000120024001010104800404010140010101,
            0x4008800802400140010202800801080401000240,
            0x0101400101010102010108020101020101010101,
            0x0101020101010102010801020101010201018001,
            0x0110010101020208044004020110800102010140
        ];
        for (uint256 i; i < 8; i++) {
            vm.expectRevert(PolicyAccountFactory.ImplementationHasNoCode.selector);
            new PolicyAccountFactory(address(1), tok[i], fee[i], rcp[i]);
        }
    }

    function test_replay_R5_R9_R10_attackerTokenWithMythrilArguments() public {
        // Valid implementation; the attacker actor itself is the (deployer-chosen) fee token.
        uint256 mFee = 0x4de2ef3f010104020801010101010104df28afff2ffeaffeaffeaffebfbecfff;
        address mRecipient = 0x0101400101010102010108020101020101010101;
        vm.etch(M_ATTACKER, address(new HookedFeeToken()).code);
        HookedFeeToken token = HookedFeeToken(M_ATTACKER);
        PolicyAccountFactory f =
            new PolicyAccountFactory(address(impl), M_ATTACKER, mFee, mRecipient);
        token.mint(M_CREATOR, mFee);
        vm.prank(M_CREATOR);
        token.approve(address(f), type(uint256).max);
        ReenterDeployHook hook = new ReenterDeployHook(
            f,
            abi.encodeCall(f.deploy, (M_OWNER, M_DEST, 524_560, bytes32(0))),
            abi.encodeCall(f.deploy, (M_OWNER, M_DEST, 3600, bytes32(0)))
        );
        token.setHook(hook);

        vm.prank(M_CREATOR);
        address a = f.deploy(M_OWNER, M_DEST, 524_560, bytes32(0));

        _assertPolicy(a, M_OWNER, M_DEST, 524_560, bytes32(0));
        assertFalse(hook.sameOk());
        assertFalse(hook.otherOk());
        assertEq(token.balanceOf(mRecipient), mFee);
        assertEq(token.balanceOf(M_CREATOR), 0);
    }

    function test_replay_R7_R8_secondIdenticalDeployRevertsBeforeAnyTokenCall() public {
        // R8's 3-step sequence repeats identical deploy() arguments; concretely the repeat stops at line 111.
        address mToken = 0x4000024000040102040101020810011002042008;
        uint256 mFee = 0x70a00010010201008001010200400101affeafff37feb47eb6f6b7ff3bfecfff;
        address mRecipient = 0x4008800802400140010202800801080401000240;
        address o = 0x0000000000080000000000000000000000000000;
        address d = 0x1000001000000000000000000000000000000000;
        vm.etch(mToken, address(new MockERC20("m", "m", 6)).code);
        PolicyAccountFactory f = new PolicyAccountFactory(address(impl), mToken, mFee, mRecipient);
        _fund(mToken, M_CREATOR, address(f), mFee);

        vm.prank(M_CREATOR);
        address a = f.deploy(o, d, 3840, bytes32(0));
        _assertPolicy(a, o, d, 3840, bytes32(0));

        vm.startStateDiffRecording();
        vm.prank(M_CREATOR);
        vm.expectRevert(abi.encodeWithSelector(PolicyAccountFactory.AlreadyDeployed.selector, a));
        f.deploy(o, d, 3840, bytes32(0));
        VmSafe.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
        assertEq(_callsFrom(acc, address(f)).length, 0, "no balanceOf/allowance call on the repeat");
    }

    function test_replay_R11_twoCallerSequenceWaivesOnlyBecauseTokenReturnsFalse() public {
        address mToken = 0x0101200101010101010101004002400101010101;
        uint256 mFee = 0x5de3923f018001010100404001020101aeafafefffab6eeffeafaeeffeb4304d;
        address mRecipient = 0x0110010101020208044004020110800102010140;
        vm.etch(mToken, address(new FalseReturnToken()).code);
        FalseReturnToken token = FalseReturnToken(mToken);
        PolicyAccountFactory f = new PolicyAccountFactory(address(impl), mToken, mFee, mRecipient);
        token.mint(M_SOMEGUY, mFee);
        token.mint(M_ATTACKER, mFee);

        vm.prank(M_SOMEGUY);
        address a1 = f.deploy(M_OWNER, 0x0000000001000002020201010101010100000048, 3600, bytes32(0));
        vm.prank(M_ATTACKER);
        address a2 = f.deploy(M_OWNER, 0x0000000001000002020201010101010100000049, 3600, bytes32(0));
        _assertPolicy(a1, M_OWNER, 0x0000000001000002020201010101010100000048, 3600, bytes32(0));
        _assertPolicy(a2, M_OWNER, 0x0000000001000002020201010101010100000049, 3600, bytes32(0));
        assertEq(token.balanceOf(M_SOMEGUY), mFee);
        assertEq(token.balanceOf(M_ATTACKER), mFee);

        // The same false-returning token with an underfunded caller is refused, not waived.
        vm.prank(payer);
        vm.expectRevert(PolicyAccountFactory.FeeTransferFailed.selector);
        f.deploy(M_OWNER, M_DEST, 3600, bytes32(0));
    }
}
