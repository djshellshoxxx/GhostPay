# GhostPay Contracts Specification (normative)

Solidity `0.8.28`, EVM `cancun`, optimizer 200 runs, OpenZeppelin Contracts `5.x` (pinned in `lib/`), Foundry. All contracts: no owner, no upgrade proxy, no pause, no `delegatecall`, no arbitrary external call, immutable configuration, full NatSpec. Standard ERC-5564 announcer (`0x55649E01B5Df198D18D95b5cc5051630cfD45564`) and ERC-6538 registry (`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`) are used as deployed; GhostPay never re-implements or modifies them. Where a chain lacks them, the CC0 reference contracts are deployed through the deterministic deployer (`0x4e59b44847b379578588920ca78fbf26c0b4956c`) with the salt from ERC-5564 and the resulting address verified before use.

Shared constants: `SCHEME_ID = 1` (secp256k1 with view tags). Ephemeral key: 33-byte compressed point, first byte `0x02` or `0x03`.

## 1. `GhostPayRouter`

```solidity
constructor(IERC5564Announcer announcer, address feeRecipient)   // both non-zero, feeRecipient != address(this)
uint256 public constant FEE_BPS = 25;  uint256 public constant BPS = 10_000;
IERC5564Announcer public immutable ANNOUNCER;  address public immutable FEE_RECIPIENT;

function payERC20(IERC20 token, address stealth, uint256 gross, uint256 minNet, uint256 deadline,
                  bytes calldata ephemeralPubKey, bytes calldata metadata) external;
function payERC20WithPermit(IERC20 token, address stealth, uint256 gross, uint256 minNet, uint256 deadline,
                  bytes calldata ephemeralPubKey, bytes calldata metadata,
                  uint8 v, bytes32 r, bytes32 s) external;            // ERC-2612 permit(owner=msg.sender, spender=this, value=gross, deadline)
function payNative(address stealth, uint256 minNet, uint256 deadline,
                  bytes calldata ephemeralPubKey, bytes calldata metadata) external payable;  // gross = msg.value
function payERC20WithBuffer(IERC20 token, address stealth, uint256 gross, uint256 minNet, uint256 deadline,
                  uint256 maxBufferWei, bytes calldata ephemeralPubKey, bytes calldata metadata) external payable; // buffer = msg.value, no fee on buffer

event FeeCollected(address indexed token, uint256 amount);   // token = address(0xEeee...) for native. No payer, stealth or invoice fields.
```

Rules (all functions): `nonReentrant`; `block.timestamp <= deadline`; `stealth` not zero, not `this`, not `FEE_RECIPIENT`; `gross > 0`; `fee = gross * FEE_BPS / BPS`; `net = gross - fee`; `net >= minNet && net > 0`; `ephemeralPubKey.length == 33` and prefix 02/03; `metadata.length == 57` with
- ERC-20: `metadata[1:5] == 0xa9059cbb`, `metadata[5:25] == token`, `metadata[25:57] == net` (big-endian);
- native: `metadata[1:5] == 0xeeeeeeee`, `metadata[5:25] == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`, `metadata[25:57] == net`;
- `metadata[0]` (view tag) is unconstrained (the router cannot verify it).

ERC-20 transfer path: record balances of `stealth` and `FEE_RECIPIENT`; `safeTransferFrom(msg.sender, FEE_RECIPIENT, fee)` (skipped if `fee == 0`), `safeTransferFrom(msg.sender, stealth, net)`; require the balance deltas equal `fee` and `net` exactly (rejects fee-on-transfer, rebasing-on-transfer tokens). Router must hold zero token balance afterwards (checked by invariant tests, not at runtime). Native path: `call{value: fee}` to `FEE_RECIPIENT`, `call{value: net}` to `stealth`, both must succeed. Then `ANNOUNCER.announce(1, stealth, ephemeralPubKey, metadata)`. `payERC20WithBuffer` additionally requires `msg.value <= maxBufferWei`, `msg.value > 0`, forwards `msg.value` to `stealth` before announcing. `receive()`/`fallback()` revert. No function sweeps stray funds (documented: accidental transfers to the router are unrecoverable).

Custom errors (exact names): `ZeroAddress`, `InvalidStealth`, `Expired`, `ZeroAmount`, `SlippageExceeded`, `InvalidEphemeralKey`, `InvalidMetadata`, `UnexpectedBalanceDelta`, `NativeTransferFailed`, `BufferTooLarge`, `BufferRequired`, `NoDirectETH`.

## 2. `GhostPaySweepRelayer`

Lets a stealth EOA that holds ERC-20 but no gas move tokens, with anyone (the relayer) paying gas, reimbursed in tokens.

```solidity
struct Sweep { address token; address owner; address destination; address feeTo;
               uint256 amount; uint256 fee; uint256 deadline; uint256 nonce; }
struct PermitSig { uint256 value; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }
// EIP-712 domain: name "GhostPaySweepRelayer", version "1", chainId, verifyingContract
// SWEEP_TYPEHASH = keccak256("Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)")
function sweepWithPermit(Sweep calldata s, bytes calldata sweepSig, PermitSig calldata permit) external;
function sweep(Sweep calldata s, bytes calldata sweepSig) external;     // allowance already granted
function nonceUsed(address owner, uint256 nonce) external view returns (bool);   // bitmap, unordered nonces
function DOMAIN_SEPARATOR() external view returns (bytes32);
event Swept(address indexed token, address indexed owner, address indexed destination, uint256 amount, uint256 fee);
```

Rules: `block.timestamp <= deadline`; `amount > fee`; `destination`, `feeTo`, `owner`, `token` non-zero and not `this`; signer recovered with OZ `ECDSA.recover` (rejects malleable high-s) must equal `owner`; nonce unused then consumed **before** external calls; `sweepWithPermit` calls `permit` inside `try/catch` (a front-run permit must not block the sweep) and requires `permit.value >= amount`; transfers `safeTransferFrom(owner, destination, amount - fee)` and, if `fee > 0`, `safeTransferFrom(owner, feeTo, fee)`; balance-delta checks as in the router; `nonReentrant`. Anyone may relay. The relayer cannot change destination, amount, or fee. The contract has no knowledge of F-SPONSOR pricing.

Token support matrix: works with ERC-20 tokens with ERC-2612 `permit` (e.g. USDC v2.2 on supported chains, DAI-style permit NOT supported) or tokens where the stealth address has already granted allowance. Tokens without permit (e.g. USDT) require the Feature-1 native gas buffer instead. EIP-3009 `receiveWithAuthorization` is a documented future function, not built.

## 3. Feature-1 gas buffer

Implemented as `payERC20WithBuffer` in section 1. Client calculation: `bufferWei = ceil(gasLimit * maxFeePerGas * (10_000 + safetyBps) / 10_000)`.

## 4. Policy-guarded stealth account (scheme id `0x47500002` = "GP" + 2) , built after the core audit

Goal: a stolen stealth key cannot redirect funds faster than `2 × delay`, and the honest owner (who holds the same key) can cancel within that window. It is a delay, not a prevention: the thief can cancel the owner's actions and re-propose without limit, so funds stay safe only while the owner (or a watcher with a pre-signed cancel) cancels every hostile proposal in time (packages/contracts DEVIATIONS "Spec observations", R17). Hardened derivation reuses scheme-1 maths to obtain the **owner** EOA address `A_owner`; funds are sent to the counterfactual account `A_acct = CREATE2(factory, salt = keccak256(abi.encode(A_owner, policyHash)), clone-of(implementation))`.

- `policyHash = keccak256(abi.encode(destination, delaySeconds, perTokenLimitsRoot))` is part of the seller's scheme-2 meta-address. It hides the destination only with a high-entropy `perTokenLimitsRoot`: with a zero root, a candidate destination is confirmed by trying the 1 h .. 30 d delay range. `deploy` calldata publishes the full pre-image, so the first deployment reveals the destination and links the seller's deployed accounts. The checkout router takes only the per-payment CREATE2 salt `keccak256(abi.encode(A_owner, policyHash))`, never `policyHash`, so router payments are not linked to the seller (packages/contracts DEVIATIONS R10).
- `PolicyAccountFactory(address implementation, address feeToken, uint256 flatFee, address feeRecipient)` immutable. `deploy(owner, destination, delay, limitsRoot)` checks `policyHash`, pulls `flatFee` of `feeToken` from `msg.sender` to `feeRecipient` (F-SECURE; waived, with a `FeeWaived` event, only when the token refuses the transfer although the caller's balance and allowance cover the fee, so a blacklisted or paused fee recipient cannot freeze counterfactual funds, DEVIATIONS R11), deploys the minimal clone (EIP-1167) and initialises it once. Anyone can deploy; the account address is independent of who pays.
- `PolicyAccount` rules: only `destination` may receive funds; `requestWithdraw(Withdraw w, LimitProof lp, bytes sig) returns (bytes32 id)` where `Withdraw{token, amount, deadline, nonce, limitLeafHash}` and `LimitProof{limit, windowSeconds, proof}` (EIP-712 `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)`, signed by `owner`; `limitLeafHash` is the limit's merkle leaf and the supplied proof must use it) starts a timer and records the current destination, `executeWithdraw(id)` callable by anyone after `delay` (reverts `DestinationChangedSinceRequest` if the destination changed since the request; DEVIATIONS R14), `cancel(id, sig)` by owner; destination change = `proposeDestination` + `2 × delay` timelock + owner signature, cancellable; per-token cap enforced with two fixed buckets of `windowSeconds` (bucket = `timestamp / windowSeconds`; `previous + current <= limit` at every booking, so up to two windows may pass before the next full spend; leaf = `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; no cap when `limitsRoot == 0`; the cap is booked at `executeWithdraw`, not at request; a token whose `windowSeconds` differs from the recorded one reverts `WindowMismatch`); no `delegatecall`, no generic `execute`, no ETH callback logic beyond `receive()`.
- Announcement: `schemeId = 0x47500002`, `stealthAddress = A_acct`, same ephemeral key/view tag derivation as scheme 1. Scanner derives `A_owner`, predicts `A_acct`, compares.
- Fee: F-SECURE flat fee, immutable per factory deployment. Documented limitation: opt-in, new scheme, no wallet interoperability, key theft still permits withdrawals to the owner's own destination after the delay.

### 4.1 `GhostPayPolicyRouter` (scheme id `0x47500002`)

`src/GhostPayPolicyRouter.sol`: the checkout router for scheme-2 policy accounts. The scheme-1 `GhostPayRouter` hard-codes `SCHEME_ID = 1` and cannot announce `0x47500002`.

- Constructor `(IERC5564Announcer announcer, address feeRecipient, PolicyAccountFactory factory)`, all immutable (`ANNOUNCER`, `FEE_RECIPIENT`, `FACTORY`). Reverts `ZeroAddress` (any zero argument), `InvalidStealth` (`feeRecipient == address(this)`), `FactoryHasNoCode`. No owner, admin, pause or upgrade; `receive`/`fallback` revert `NoDirectETH`.
- Entry points (all `nonReentrant`; `PolicyRef{address owner; bytes32 policyHash}`, `PermitSig{uint8 v; bytes32 r; bytes32 s}`): `payERC20(token, stealth, policy, gross, minNet, deadline, ephemeralPubKey, metadata)`, `payERC20WithPermit(..., PermitSig permit)`, `payNative(stealth, policy, minNet, deadline, ephemeralPubKey, metadata)` (payable), `payERC20WithBuffer(token, stealth, policy, gross, minNet, deadline, maxBufferWei, ephemeralPubKey, metadata)` (payable; `msg.value` is forwarded to `stealth` as gas buffer, `BufferRequired` if zero, `BufferTooLarge` above `maxBufferWei`).
- Policy binding runs first in every entry point: `policy.owner != 0` (`ZeroAddress`) and `stealth == FACTORY.predictAddress(owner, policyHash)` else `NotPolicyAccount(expected)`. Deployed and counterfactual accounts are accepted.
- Fee: same as the scheme-1 router: `FEE_BPS = 25`, `fee = gross * 25 / 10_000` rounded down, sent to `FEE_RECIPIENT`; `net = gross - fee >= minNet`; `FeeCollected(token, fee)` only when `fee > 0` (native token sentinel `0xEeee...EEeE`). ERC-20 transfers use SafeERC20 with exact balance-delta checks (`UnexpectedBalanceDelta`).
- Announcement: after the transfer, `ANNOUNCER.announce(0x47500002, stealth, ephemeralPubKey, metadata)`; metadata is the 57-byte layout `viewTag || marker || asset || net` of the scheme-1 router (ephemeral key 33 bytes, prefix 02/03). `stealthAddress` is `A_acct`.
- Events/errors: `FeeCollected(address indexed token, uint256 amount)`; errors as in `IGhostPayPolicyRouter` (names shared with `IGhostPayRouter` have identical selectors, plus `FactoryHasNoCode` and `NotPolicyAccount`).

## 5. Test requirements (Foundry)

Unit, fuzz (10 000 runs), invariants (router holds zero tokens; `fee + net == gross`; `net` receipt equals metadata amount; sweep nonce single-use; relayer cannot alter destination/amount/fee). Mock tokens: standard, no-return-value, returns-false, fee-on-transfer, reentrant (ERC-777-style hook), permit token, blacklisting, 2 and 18 decimals. Event ABI test against the canonical announcer. Fork-style test using the CC0 reference announcer source compiled locally. Gas snapshot.
