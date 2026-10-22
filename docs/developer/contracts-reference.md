# Contracts reference

Source of truth: `packages/contracts/src/*.sol` and `src/interfaces/*.sol` (read at commit `7aee906`), the normative
`docs/CONTRACTS_SPEC.md`, and `packages/contracts/DEVIATIONS.md` (where the code differs from the spec, **the code wins**).
Solidity `0.8.28`, EVM `cancun`, optimizer 200 runs, `bytecode_hash = "none"`, `cbor_metadata = false`, OpenZeppelin
Contracts 5.6.1 vendored under `lib/`. Every contract: no owner, no proxy/upgrade, no pause, no `delegatecall`, no
arbitrary external call, immutable configuration, full NatSpec (`scripts/check-natspec.sh` enforces it for four of the five
contracts; see [testing.md](testing.md)). Nothing is deployed anywhere; no external audit exists.

| Contract | File | Scheme | Role |
|---|---|---|---|
| `GhostPayRouter` | `src/GhostPayRouter.sol` | 1 | checkout router: fee split + exact announcement |
| `GhostPaySweepRelayer` | `src/GhostPaySweepRelayer.sol` | n/a | gas-sponsored sweep of a stealth EOA's ERC-20s |
| `PolicyAccountFactory` | `src/PolicyAccountFactory.sol` | `0x47500002` | CREATE2 EIP-1167 clone factory + flat fee |
| `PolicyAccount` | `src/PolicyAccount.sol` | `0x47500002` | policy-guarded account (clone target) |
| `GhostPayPolicyRouter` | `src/GhostPayPolicyRouter.sol` | `0x47500002` | checkout router that pays only factory-predicted policy accounts |
| `IERC5564Announcer` | `src/interfaces/IERC5564Announcer.sol` | | CC0 reference interface (pragma relaxed to `^0.8.23`) |

The standard ERC-5564 announcer (`0x55649E01B5Df198D18D95b5cc5051630cfD45564`) and ERC-6538 registry
(`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`) are used as deployed and never modified. The deterministic deployer in the spec
(`0x4e59b44847b379578588920ca78fbf26c0b4956c`) is not used by any script.

Common error names are identical across `IGhostPayRouter` and `IGhostPayPolicyRouter` (same selectors; asserted by
`test_errorSelectorsMatchSchemeOneRouter`). OpenZeppelin errors that can surface: `SafeERC20FailedOperation(address)`,
`ReentrancyGuardReentrantCall()`, `ECDSAInvalidSignature()`, `ECDSAInvalidSignatureLength(uint256)`,
`ECDSAInvalidSignatureS(bytes32)`, `InvalidShortString()`, `StringTooLong(string)`, and from `Clones`: `FailedDeployment()`,
`InsufficientBalance(uint256,uint256)`.

## 1. `GhostPayRouter`

```solidity
constructor(IERC5564Announcer announcer, address feeRecipient)
//  reverts ZeroAddress if either is zero; InvalidStealth if feeRecipient == address(this)
uint256 public constant FEE_BPS = 25;    uint256 public constant BPS = 10_000;
uint256 public constant SCHEME_ID = 1;   address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
IERC5564Announcer public immutable ANNOUNCER;   address public immutable FEE_RECIPIENT;
```

| Function | Value | Notes |
|---|---|---|
| `payERC20(IERC20 token, address stealth, uint256 gross, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata)` | 0 | allowance of `gross` required |
| `payERC20WithPermit(token, stealth, gross, minNet, deadline, ephemeralPubKey, metadata, uint8 v, bytes32 r, bytes32 s)` | 0 | `permit(msg.sender, this, gross, deadline, v, r, s)` inside `try/catch`; token must have a nonzero address and `block.timestamp <= deadline` before the permit is tried |
| `payNative(address stealth, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata)` | `gross = msg.value` | |
| `payERC20WithBuffer(token, stealth, gross, minNet, deadline, uint256 maxBufferWei, ephemeralPubKey, metadata)` | buffer | `msg.value` is a native gas buffer forwarded to `stealth`; no fee on it |
| `receive()` / `fallback()` | | always revert `NoDirectETH()` |

Every function is `nonReentrant` (storage-based `ReentrancyGuard`, not transient, for chains without Cancun transient
storage; DEVIATIONS 11).

**Rules and check order** (first failing check wins; DEVIATIONS 5):

1. `payERC20WithBuffer` only: `msg.value == 0` -> `BufferRequired`; `msg.value > maxBufferWei` -> `BufferTooLarge`.
2. ERC-20 paths: `token == 0` -> `ZeroAddress`. Permit path: this check and the deadline check run before the permit.
3. `block.timestamp > deadline` -> `Expired` (the deadline is inclusive).
4. `stealth` is zero, the router, or `FEE_RECIPIENT` -> `InvalidStealth`.
5. `gross == 0` -> `ZeroAmount`. `fee = gross * 25 / 10_000` (floor; a `gross` above `type(uint256).max / 25` panics on
   overflow). `net = gross - fee` (always >= 1). `net < minNet` -> `SlippageExceeded`.
6. `ephemeralPubKey.length != 33` or first byte not `0x02`/`0x03` -> `InvalidEphemeralKey`.
7. Metadata must be exactly 57 bytes: ERC-20 `viewTag(any) || 0xa9059cbb || token(20) || net(32 BE)`; native
   `viewTag(any) || 0xeeeeeeee || NATIVE(20) || net(32 BE)` -> else `InvalidMetadata`. The view tag cannot be verified.
8. Transfers. ERC-20: record `balanceOf(stealth)` and `balanceOf(FEE_RECIPIENT)`; if `fee != 0` `safeTransferFrom(msg.sender,
   FEE_RECIPIENT, fee)` and emit `FeeCollected`; `safeTransferFrom(msg.sender, stealth, net)`; the balance deltas must equal
   `net` and `fee` exactly -> else `UnexpectedBalanceDelta` (rejects fee-on-transfer and rebasing). Native: if `fee != 0`
   `call{value: fee}` to `FEE_RECIPIENT` then `FeeCollected`; `call{value: net}` to `stealth`; failure ->
   `NativeTransferFailed`. The `call`s are written in assembly so no return data is copied (a return-data bomb cannot
   inflate the payer's gas; audit L-01). Buffer: after the token transfers, `_sendNative(stealth, msg.value)`.
9. `ANNOUNCER.announce(1, stealth, ephemeralPubKey, metadata)`; the announcer emits `Announcement` with
   `caller == router`.

**Events**: `FeeCollected(address indexed token, uint256 amount)` with `token = NATIVE` for ETH, emitted **only when
`fee > 0`** (no payer, stealth or invoice fields). The announcement comes from the announcer, not the router.

**Errors**: `ZeroAddress`, `InvalidStealth`, `Expired`, `ZeroAmount`, `SlippageExceeded`, `InvalidEphemeralKey`,
`InvalidMetadata`, `UnexpectedBalanceDelta`, `NativeTransferFailed`, `BufferTooLarge`, `BufferRequired`, `NoDirectETH`.

**Invariants** (tested): the router holds zero tokens and zero ETH after any call; per call and in aggregate `fee + net ==
gross`; the stealth address receives exactly the metadata `net`; a fee-on-transfer token can never succeed; plain ETH is
rejected. Not guaranteed: that `stealth` was derived from the announced key or that the view tag is right (an attacker can
announce junk), that the payer's `gross` is "fair", or that a blacklisted fee recipient does not stop payments (audit
M-01, accepted: ADR-0013).

## 2. `GhostPaySweepRelayer`

Lets a stealth EOA that holds ERC-20 but no gas move tokens; anyone may submit the stealth key's EIP-712 order and is
reimbursed in tokens through the signed `fee`.

```solidity
struct Sweep { address token; address owner; address destination; address feeTo;
               uint256 amount; uint256 fee; uint256 deadline; uint256 nonce; }
struct PermitSig { uint256 value; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }
bytes32 public constant SWEEP_TYPEHASH = keccak256("Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)");
constructor()   // EIP712("GhostPaySweepRelayer", "1")
function sweepWithPermit(Sweep calldata s, bytes calldata sweepSig, PermitSig calldata permit) external;
function sweep(Sweep calldata s, bytes calldata sweepSig) external;       // allowance already granted
function nonceUsed(address owner, uint256 nonce) external view returns (bool used);
function DOMAIN_SEPARATOR() external view returns (bytes32 separator);    // plus OZ eip712Domain()
event Swept(address indexed token, address indexed owner, address indexed destination, uint256 amount, uint256 fee);
```

**Check order** (DEVIATIONS 10): `block.timestamp > deadline` -> `Expired`; `amount <= fee` -> `InvalidAmount`; any of
`destination`, `feeTo`, `owner`, `token` zero -> `ZeroAddress`; any equal to the relayer -> `SelfAddress`; signature
(`ECDSA.recover`, rejects high-s) must recover to `owner` -> `InvalidSignature`; nonce bit unused -> else
`NonceAlreadyUsed`, then **the nonce is consumed before any external call**; `sweepWithPermit` only: `permit.value <
amount` -> `PermitValueTooLow`, then `permit(owner, this, permit.value, permit.deadline, v, r, s)` in `try/catch`;
then `safeTransferFrom(owner, destination, amount - fee)` and, if `fee != 0`, `safeTransferFrom(owner, feeTo, fee)`. The
balance deltas must be exact for owner (falls by `amount`), destination (`+net`) and `feeTo` (`+fee`) -> else
`UnexpectedBalanceDelta`; this also makes `destination == owner`, `feeTo == owner` and `feeTo == destination` revert
(DEVIATIONS 9). `Swept` is emitted last. `nonReentrant`.

Nonces are unordered, per owner: `word = nonce >> 8`, `bit = 1 << (nonce & 0xff)`. The submitter cannot change any signed
field. The `permit.deadline` is **not** covered by the sweep signature (not exploitable: the permit is itself signed by the
owner). Only EOA signers (no ERC-1271); DAI-style permit is not supported; the contract does not know the F-SPONSOR price
policy (the relayer service and client enforce `<= 300 bps`). Residual economics (audit L-03): after a successful
simulation the owner can move the tokens away (the relayer loses gas), and a hostile token's `permit()` can burn the
supplied gas inside the `try/catch`.

**Errors**: `ZeroAddress`, `SelfAddress`, `Expired`, `InvalidAmount`, `InvalidSignature`, `NonceAlreadyUsed`,
`PermitValueTooLow`, `UnexpectedBalanceDelta`.

**Invariants** (tested): a nonce is single-use; the relayer cannot alter destination/amount/fee; token balances equal the
sum of the signed orders; the relayer never holds tokens.

## 3. `PolicyAccountFactory` and `PolicyAccount`

Policy-guarded account (**experimental**, ADR-0014). Funds go to the clone
`A_acct = CREATE2(factory, salt = keccak256(abi.encode(owner, policyHash)), EIP-1167 clone of IMPLEMENTATION)` with
`policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot))`. The address depends on chain, factory and
implementation.

### `PolicyAccountFactory`

```solidity
uint256 public constant MAX_DELAY = 30 days;   uint256 public constant MIN_DELAY = 1 hours;
address public immutable IMPLEMENTATION;  address public immutable FEE_TOKEN;
uint256 public immutable FLAT_FEE;        address public immutable FEE_RECIPIENT;
constructor(address implementation_, address feeToken_, uint256 flatFee_, address feeRecipient_)
//  ZeroAddress if implementation_/feeRecipient_ is zero or (flatFee_ != 0 && feeToken_ == 0); ImplementationHasNoCode
function deploy(address owner, address destination, uint256 delay, bytes32 limitsRoot) external returns (address account);
function predictAddress(address owner, bytes32 policyHash) external view returns (address account);
function policyHashOf(address destination, uint256 delaySeconds, bytes32 limitsRoot) public pure returns (bytes32 hash);
event AccountDeployed(address indexed account);   // no owner or policy data on purpose
event FeeWaived(address indexed account);         // emitted before AccountDeployed when the fee was waived
```

`deploy` (nonReentrant, callable by anyone, address independent of who pays): zero `owner`/`destination` ->
`ZeroAddress`; `delay == 0 || delay > MAX_DELAY` -> `InvalidDelay`; `delay < MIN_DELAY` -> `DelayTooShort(delay)`; code at
the predicted address -> `AlreadyDeployed(predicted)` (checked before any fee). Fee (`FLAT_FEE != 0`): `trySafeTransferFrom`
from the caller to `FEE_RECIPIENT`; if it succeeds the recipient delta must equal `FLAT_FEE` (`UnexpectedFeeDelta`); if it
fails **and** the caller's balance and allowance both cover the fee, the fee is **waived** (the token or recipient is at
fault; audit M-03 / DEVIATIONS R11, so counterfactual funds are not frozen); if balance or allowance is short ->
`FeeTransferFailed`. Then `cloneDeterministic` and `initialize`. Gas starvation cannot buy a waiver
(`test_deploy_gasStarvationCannotTriggerWaiver`). Calldata publishes the full policy pre-image (see `policy-scheme.md`).

### `PolicyAccount`

```solidity
uint256 public constant MAX_DELAY = 30 days;
address public owner; uint64 public delay; bool public initialized; address public destination;
bytes32 public limitsRoot; bytes32 public policyHash;
address public pendingDestination; uint64 public pendingEffectiveAt; bytes32 public pendingProposalId;

struct Withdraw   { address token; uint256 amount; uint256 deadline; uint256 nonce; bytes32 limitLeafHash; }
struct LimitProof { uint256 limit; uint64 windowSeconds; bytes32[] proof; }
struct Request    { address token; Status status; uint64 executeAfter; uint64 windowSeconds; uint256 amount; uint256 limit; }
enum Status { None, Pending, Executed, Cancelled }

function initialize(address owner_, address destination_, uint256 delay_, bytes32 limitsRoot_) external;
function requestWithdraw(Withdraw calldata w, LimitProof calldata lp, bytes calldata sig) external returns (bytes32 id);
function executeWithdraw(bytes32 id) external;
function cancel(bytes32 id, bytes calldata sig) external;
function proposeDestination(address newDestination, uint256 deadline, uint256 nonce, bytes calldata sig) external returns (bytes32 id);
function executeDestinationChange() external;
function cancelDestination(bytes32 id, bytes calldata sig) external;
function requests(bytes32 id) external view returns (Request memory);
function nonceUsed(uint256 nonce) external view returns (bool);
function windowState(address token) external view returns (uint64 window, uint64 bucket, uint256 current, uint256 previous);
function DOMAIN_SEPARATOR() external view returns (bytes32);
receive() external payable {}      // no fallback
```

Events: `WithdrawRequested(bytes32 indexed id, address token, uint256 amount, uint64 executeAfter)`,
`WithdrawExecuted(bytes32 indexed id, address destination, address token, uint256 amount)`,
`WithdrawCancelled(bytes32 indexed id)`, `DestinationProposed(bytes32 indexed id, address newDestination, uint64
effectiveAt)`, `DestinationChangeCancelled(bytes32 indexed id)`, `DestinationChanged(bytes32 indexed id, address
newDestination)`.

Errors: `ZeroAddress`, `InvalidDelay`, `AlreadyInitialized`, `UnauthorizedInitializer`, `Expired`, `ZeroAmount`,
`InvalidToken`, `InvalidSignature`, `NonceAlreadyUsed`, `InvalidLimitProof`, `LimitLeafMismatch`, `InvalidLimit`,
`AmountExceedsLimit`, `WindowLimitExceeded`, `WindowMismatch`, `NotPending`, `TimelockActive(uint64 availableAt)`,
`ProposalPending`, `NoProposal`, `InvalidDestination`, `NativeTransferFailed`, `UnexpectedBalanceDelta`.

Behaviour:

- **Initialise**: the implementation locks itself in its constructor (`initialized = true`, immutable `_IMPLEMENTATION`).
  `initialize` recomputes `Clones.predictDeterministicAddress(_IMPLEMENTATION, keccak256(abi.encode(owner_,
  keccak256(abi.encode(destination_, delay_, limitsRoot_)))), msg.sender)` and requires it to equal `address(this)`; so only
  the deployer that derived this very address from these very arguments can initialise it, once (`UnauthorizedInitializer`,
  `AlreadyInitialized`). `delay_` must be in `[1, 30 days]` (`InvalidDelay`).
- **requestWithdraw** (nonReentrant, anyone relays an owner signature): `Expired`, `ZeroAmount`, `InvalidToken` (token ==
  the account), signature over `id = structHash(Withdraw)` must recover to `owner`, nonce consumed; with `limitsRoot != 0`
  the leaf `keccak256(bytes.concat(keccak256(abi.encode(token, lp.limit, lp.windowSeconds))))` must equal the signed
  `limitLeafHash` (`LimitLeafMismatch`) and verify against `limitsRoot` (`InvalidLimitProof`); a limited leaf needs a
  nonzero window (`InvalidLimit`) and `amount <= limit` (`AmountExceedsLimit`). Stores `executeAfter = now + delay`.
- **executeWithdraw** (anyone): `NotPending`, `TimelockActive(executeAfter)`; marks Executed, books the amount against the
  token's two-bucket window (`WindowLimitExceeded`, `WindowMismatch`), pays **`destination` as of execution time** (native
  via assembly `call`, ERC-20 via `safeTransfer` with exact balance-delta checks).
- **cancel / cancelDestination**: owner signature over `CancelWithdraw(id)` / `CancelDestination(id)`; no nonce (bound to
  one id, idempotent).
- **proposeDestination**: `Expired`, `InvalidDestination` (zero or the account), `ProposalPending` if one is pending, owner
  signature over `ProposeDestination`, nonce; effective at `now + 2 * delay`. **executeDestinationChange** (anyone) after
  that (`NoProposal`, `TimelockActive`).
- **Limits**: `limitsRoot == 0` means no limits; otherwise a token without a leaf can never be withdrawn. A leaf with
  `limit == type(uint256).max` is unlimited. The window is two fixed buckets of `windowSeconds`: the amount paid in the
  current plus previous bucket never exceeds `limit` (conservative: after a full spend the next can wait up to two windows).
- Everything is authorised by an EIP-712 owner signature; domain name `"GhostPayPolicyAccount"`, version `"1"`, chain id and
  the **clone's own address**.

Not provided: any recovery or guardian path (a lost key locks funds; a stolen key can request withdrawals to the owner's
destination and contest destination changes), rescue of stray assets (NFTs, ETH sent to the implementation, tokens without a
leaf, lossy tokens), 2300-gas senders cannot fund a clone (EIP-1167 `delegatecall`; DEVIATIONS P14). Pending requests
never expire and pay the destination current at execution (R13).

**Invariants** (tested): funds only leave to `destination`; timelocks are never shortened; an executed id cannot re-execute;
no unrecorded allowance; window cap respected; foreign signatures never accepted; the policy is immutable.

## 4. `GhostPayPolicyRouter`

Like `GhostPayRouter` (same fee, check order, 57-byte metadata, assembly native sends, exact deltas) but it pays only
policy accounts and announces scheme `0x47500002`.

```solidity
constructor(IERC5564Announcer announcer, address feeRecipient, PolicyAccountFactory factory)
//  ZeroAddress; InvalidStealth if feeRecipient == address(this); FactoryHasNoCode; caches FACTORY.IMPLEMENTATION()
uint256 public constant FEE_BPS = 25; BPS = 10_000; SCHEME_ID = 0x47500002;  address public constant NATIVE = 0xEeee...EEeE;
IERC5564Announcer public immutable ANNOUNCER;  address public immutable FEE_RECIPIENT;  PolicyAccountFactory public immutable FACTORY;
struct PermitSig { uint8 v; bytes32 r; bytes32 s; }

function payERC20(IERC20 token, address stealth, bytes32 salt, uint256 gross, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata) external;
function payERC20WithPermit(IERC20 token, address stealth, bytes32 salt, uint256 gross, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata, PermitSig permit) external;
function payNative(address stealth, bytes32 salt, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata) external payable;
function payERC20WithBuffer(IERC20 token, address stealth, bytes32 salt, uint256 gross, uint256 minNet, uint256 deadline, uint256 maxBufferWei, bytes ephemeralPubKey, bytes metadata) external payable;
```

First check in **every** entry point (before the buffer, token-zero and deadline checks, R4): `stealth` must equal
`Clones.predictDeterministicAddress(IMPLEMENTATION, salt, FACTORY)`, else `NotPolicyAccount(expected)`. The argument is
the per-payment `salt = keccak256(abi.encode(owner, policyHash))` (round-3 audit N-01: the seller-constant `policyHash`
never appears in calldata; the router can no longer detect a zero owner, such an account can never be deployed). Errors:
those of `GhostPayRouter` plus `FactoryHasNoCode` and `NotPolicyAccount(address expected)`. The router proves the paid
address is a clone slot of the immutable factory and implementation; it cannot prove the salt has a meaningful pre-image or
that the owner belongs to the payee.

## 5. EIP-712 summary

| Contract | Domain (name, version, chainId, verifyingContract) | Struct string |
|---|---|---|
| `GhostPaySweepRelayer` | `"GhostPaySweepRelayer"`, `"1"`, chain, the relayer | `Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)` |
| `PolicyAccount` | `"GhostPayPolicyAccount"`, `"1"`, chain, the **clone** | `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)` |
| | | `CancelWithdraw(bytes32 id)` |
| | | `ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)` |
| | | `CancelDestination(bytes32 id)` |

Domain type string: `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)`. Digest:
`keccak256(0x1901 || domainSeparator || structHash)` where `structHash = keccak256(abi.encode(TYPEHASH, fields...))`.
TypeScript counterparts: `buildSweepTypedData`/`sweepDigest`/`sweepDigestManual` (chain-adapters) and
`build*TypedData` (policy-scheme); the policy-scheme anvil test checks typehashes and domain separators against the
deployed contracts. Typehash and selector values: [byte-layouts.md](byte-layouts.md#selectors-topics-and-typehashes).

## 6. Gas notes

No number below was measured for this document (`forge` was not run; the shared tree was in flux). Treat them as
structure and order of magnitude, and re-measure with `forge snapshot` / `forge test --gas-report`.

- **Router ERC-20 payment**: two `transferFrom`s (one when `fee == 0`, i.e. `gross < 400`), four `balanceOf` reads, one
  announcer call that emits a `LOG4` carrying 256 bytes of data, one storage-based reentrancy guard write. Calldata is 420
  bytes (`payERC20`), 516 (permit), 452 (buffer), 356 (native); see [byte-layouts.md](byte-layouts.md).
- **Router native payment**: two value `call`s with all remaining gas (no return data copied) plus the announcer call; the
  fee call is skipped for `gross < 400`.
- **Permit path** adds the token's `permit` call (in a typical ERC-2612 token: an `ecrecover`, a nonce write and an
  allowance write). It sits inside `try/catch`, so a front-run permit does not revert the payment; the failed `permit`
  call is the only extra cost.
- **Sweep nonces**: one storage word covers 256 nonces. By EVM rules (EIP-2929/3529; not measured) the first use of a word
  is a zero-to-nonzero write (about 22 100 gas cold) and later nonces in the same word are nonzero-to-nonzero (about 5 000
  cold), so allocating nonces sequentially is cheaper than random 256-bit nonces.
- **Policy account**: `requestWithdraw` costs a signature recovery, a nonce write, a Merkle verification (`log2(leaves)`
  hashes) and a `Request` struct write; `executeWithdraw` adds the window bookkeeping. Clone deployment is an EIP-1167
  minimal proxy (about 45 bytes of runtime code) so `deploy` is cheap relative to a full contract, and every account call
  pays an extra `delegatecall` hop.
- **Whole-test gas from `.gas-snapshot`** (commit `7aee906`; includes harness setup, warm/cold effects of the mock token,
  so only useful for regression tracking, which CI enforces with `forge snapshot --check`):
  `GhostPayRouterTest:test_payERC20_emitsFeeCollected` 124 912, `test_payERC20_dustPaysNoFee` 121 627,
  `test_payNative_splitsFeeAndNet` 132 931, `test_buffer_forwardsValueWithoutFee` 187 180;
  `GhostPayPolicyRouterTest:test_payERC20_emitsFeeCollected` 130 263; `GhostPaySweepRelayerTest:test_sweep_withExistingAllowance`
  228 366, `test_sweep_zeroFeeSkipsFeeTransfer` 201 074; `PolicyAccountFactoryTest:test_deploy_happy_chargesFeeOnceAndInitialises`
  280 627.
- `foundry.toml` sets `bytecode_hash = "none"`, `cbor_metadata = false`: identical source and settings give identical
  bytecode. `forge build --sizes` is run in CI; contract sizes were not read for this page.

## 7. Deployment scripts (`packages/contracts/script/`)

| Script | Required env | Optional env | Reads back |
|---|---|---|---|
| `Deploy.s.sol` (router + sweep relayer) | `FEE_RECIPIENT` | `ANNOUNCER`, `ALLOW_CUSTOM_ANNOUNCER=1`, `EXPECTED_ANNOUNCER_CODEHASH`, `ALLOWED_CHAIN_IDS`, `ALLOW_LOCAL=1` | `FEE_RECIPIENT`, `ANNOUNCER`, `FEE_BPS == 25`, code present, relayer `DOMAIN_SEPARATOR != 0` |
| `DeployPolicy.s.sol` (implementation + factory) | `FEE_RECIPIENT`, `FEE_TOKEN`, `FLAT_FEE`, `MAX_FLAT_FEE` | `ALLOWED_CHAIN_IDS`, `ALLOW_LOCAL=1` | every factory immutable, `MIN_DELAY`, `MAX_DELAY`, implementation locked |
| `DeployPolicyRouter.s.sol` | `FEE_RECIPIENT`, `POLICY_FACTORY` | `ANNOUNCER`, `ALLOW_CUSTOM_ANNOUNCER=1`, `EXPECTED_ANNOUNCER_CODEHASH`, `EXPECTED_POLICY_FACTORY_CODEHASH`, `ALLOWED_CHAIN_IDS`, `ALLOW_LOCAL=1` | `FEE_RECIPIENT`, `ANNOUNCER`, `FACTORY`, `FEE_BPS`, `SCHEME_ID` |

Guard rails (`DeployBase.s.sol`): `FEE_RECIPIENT` mandatory, non-zero and not the broadcaster; built-in testnets are Sepolia
`11155111`, Base Sepolia `84532`, OP Sepolia `11155420`, Arbitrum Sepolia `421614`, Polygon Amoy `80002`, Hoodi `560048`;
anything else needs `ALLOWED_CHAIN_IDS` (comma list, trimmed, non-numeric entries abort with `InvalidChainIdEntry`); chain id
`31337` needs `ALLOW_LOCAL=1`. `scripts/pre-deploy-check.sh router|policy` prints the effective configuration and runs the
same static checks without broadcasting (it does not cover `DeployPolicyRouter`). `.env.example` does not list
`POLICY_FACTORY` or `EXPECTED_POLICY_FACTORY_CODEHASH`. Runbook: `docs/operators/deployment-runbook.md`;
[release-and-repro.md](release-and-repro.md#6-deploying-contracts).
