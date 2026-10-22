# Spec: Payer address hiding (fresh payer wallet, sponsored and relayed payments)

Status: **spec, not built**. Date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: **testnet-only proof of concept** (Ethereum Sepolia `11155111`, Base Sepolia `84532`, plus a local anvil chain). Legal questions are deferred by the owner (noted once in section 14, nothing here blocks on them). Nothing in this spec has run against a real wallet, RPC, bundler, paymaster or chain.

Evidence tags: **[R]** repo file read, **[P]** primary source fetched 2026-10-21 (retrieval date for every URL below), **[U]** unverified: from memory or inference, verify before relying on it.

Read for this spec: `README.md`, `docs/CONTRACTS_SPEC.md`, `docs/remote/anonymization-research.md` (sections 4.4, 4.6, 4.7, 6.2), `docs/remote/onion-i2p-research.md`, `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md`, `packages/contracts/src/GhostPayRouter.sol`, `GhostPayPolicyRouter.sol`, `docs/remote/specs/relayer-guard.md`, `packages/relayer-guard/package.json`.

## 1. Goal

Offer four user-selectable **payer modes** (`payerMode`) that reduce what an observer learns about *who paid* an invoice, and say exactly what each does not do:

| Mode | Name | One line |
|---|---|---|
| `PH-0` | `direct` | Today's behaviour. Payer wallet calls the router. Baseline for tests and UI. |
| `PH-1` | `fresh-wallet` | Client-only tooling: one fresh payer key per payment, funding planner and linter that flag links between the funder and the payer. |
| `PH-2` | `permit-relay` | A new immutable `GhostPayPayRelay` pulls tokens from the payer by ERC-2612 permit and calls the router; a sponsor pays gas. Payer needs no native token. No 7702, no 4337. |
| `PH-3` | `eip7702-sponsored` | Fresh payer EOA delegates (EIP-7702) to a new `GhostPayPayerDelegate`; a sponsor submits the type-4 tx. Payer is `msg.sender` at the router. |
| `PH-4` | `erc4337-paymaster` | Payer is a counterfactual ERC-4337 account; a verifying paymaster sponsors; a bundler submits. |

The user picks the mode in the app (or CLI); the PoC ships all four plus a comparison table the UI renders from `PAYER_MODE_INFO` (section 5).

## 2. Threat addressed and what it does NOT protect

**Addressed (partially):**
- T1: the payer's *long-lived* wallet being visible as the sender of the payment and linked to its history (README L1 [R]). PH-1 attacks this by never paying from a long-lived wallet.
- T2: **gas-funding leakage**: a fresh payer wallet must receive native gas from somewhere, and that funding tx links the payer wallet to the funder (ERC-5564 Security Considerations [P]: "The wallet that funds the stealth address MUST NOT have any physical connection to the stealth address owner"; same logic applies to the payer side). PH-2/3/4 remove the *native-token* funding tx for the payer wallet by having a sponsor pay gas.
- T3: seller-side casual view: for `PH-2` the token `Transfer` into the stealth address comes from the shared relay contract, not from the payer wallet.

**Does NOT protect (state this in UI copy, PO-docs, and the comparison table):**
- N1: **The payer is never hidden from a chain analyst.** In PH-3 and PH-4 the payer account is `msg.sender` at the router and the source of the token transfers [R: `GhostPayRouter._pull` uses `safeTransferFrom(msg.sender, ...)`]. In PH-2 the payer is the `from` of `Transfer(payer -> relay)` in the same transaction. There is no mixing, no crowd, no shielded pool here. Real sender privacy needs a pool (`anonymization-research.md` 6.2 "pay from pool", out of scope here).
- N2: **Token funding link remains.** Sponsorship removes the *native gas* funding link only. The payer wallet still has to receive the payment tokens from somewhere; that transfer links it to the token source. This is the largest honest gap; PH-1 guidance addresses it, nothing automatic does.
- N3: **Trust shifts to the sponsor**: the sponsor (relay operator, 7702 submitter, paymaster + bundler) sees payer address, stealth address, token, amount, invoice-derived metadata, client IP and timing. The sponsor can censor and can grief (burn the payer's time, not funds, if intents are signed). Section 8.
- N4: The sponsor hot key, relay contract, 7702 delegate code, paymaster address and counterfactual account factory are **public fingerprints** labelling "GhostPay sponsored payer" (`anonymization-research.md` 4.6/4.7 [R]).
- N5: Network metadata (IP, RPC provider, wallet vendor RPC) is unchanged (`onion-i2p-research.md` [R], D8). PH-2/3/4 add the sponsor as a new IP observer.
- N6: Stealth-address recipient side (L3: payer can follow `S1`) is unchanged; payer-hiding is orthogonal to the sweep/exit specs.
- N7: **Mainnet is out of scope.** Chain allowlist is enforced in code (PH-GEN-1).

## 3. Primary-source facts used

- **EIP-7702** (status Final [P]; https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7702.md, retrieved 2026-10-21; the rendered eips.ethereum.org host was unreachable from the sandbox, the GitHub raw source was used): `SET_CODE_TX_TYPE = 0x04`, `MAGIC = 0x05`, `PER_AUTH_BASE_COST = 12500`, `PER_EMPTY_ACCOUNT_COST = 25000`. Authorization tuple `[chain_id, address, nonce, y_parity, r, s]`, signed message `keccak(MAGIC || rlp([chain_id, address, nonce]))`; valid if `chain_id` is 0 or the current chain, `nonce < 2**64-1`, signer code empty or already delegated, and signer's current account nonce equals `nonce`. Effect: code set to `0xef0100 || address`; `address == 0x0` clears. The authority's nonce is incremented. Security text: delegates should require a signature over replay protection, `value`, `gas`, `target`/`calldata`; "A poorly implemented delegate can allow a malicious actor to take near complete control over a signer's EOA." Section "Front running initialization" requires init to be signed by the EOA. Self-sponsoring breaks `msg.sender == tx.origin` assumptions.
- **ERC-4337** (status Final [P]; https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-4337.md, retrieved 2026-10-21): bundlers package `UserOperation`s into a `handleOps(PackedUserOperation[] ops, address payable beneficiary)` tx; `PackedUserOperation` includes `sender`, `nonce`, `initCode`, `callData`, `accountGasLimits`, `preVerificationGas`, `gasFees`, `paymasterAndData`, `signature`; with a non-empty `paymasterAndData` the EntryPoint calls `validatePaymasterUserOp` and optionally `postOp`; bundlers simulate before accepting. `sender` and paymaster are in public `handleOps` calldata; the on-chain tx `from` is the bundler.
- **ERC-7677** (status **Review** [P]; https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7677.md): `pm_getPaymasterStubData` / `pm_getPaymasterData` JSON-RPC for paymaster web services. Not Final: treat as an optional adapter, not a dependency.
- **ERC-5564** (Final [P]; https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md): funding-link quote above.
- **ERC-2612** (Final [P]; .../ERCS/erc-2612.md): signed `permit`. **ERC-3009** (status **Draft** [P]; .../ERCS/erc-3009.md): `receiveWithAuthorization` requires caller == payee, which is why it would suit a relay, but Draft and not in the PoC.
- **ERC-7710** (Draft [P]) and **ERC-7579** (not checked): mentioned only as possible future delegate/account standards; unused.
- EntryPoint addresses (v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, v0.8 `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`): **[U]**, not in the fetched ERC text. The build MUST verify deployed code hash against a manifest before use (PH-4-REQ-2).
- Whether Sepolia and Base Sepolia have activated EIP-7702 (Pectra) and whether anvil/Foundry in the repo toolchain support type-4 txs (`vm.signDelegation`, `vm.attachDelegation` exist in the vendored `forge-std` [R: `packages/contracts/lib/forge-std/src/Vm.sol:1444,1486`]; solc `0.8.28` may not accept `evm_version = "prague"` [U]): **[U]**, resolve in the first build spike (open questions Q1, Q2).

## 4. Fit with `GhostPayRouter` and `GhostPayPolicyRouter`

Facts [R]: both routers take tokens from `msg.sender`; `payERC20WithPermit` calls `permit(msg.sender, address(this), gross, ...)` so a **third party cannot submit a payer's permit to the router**: the permit owner is always the router's caller. The router never records the payer; the ERC-5564 announcement is emitted by the router and carries no payer. `payERC20WithBuffer` forwards the *caller's* native value to the stealth address (irrelevant here; PH modes MUST NOT use it unless the payer account holds native token, in which case it is `PH-1` territory). `GhostPayPolicyRouter` adds a `PolicyRef policy` argument and `_checkPolicyAccount(stealth, policy)`; its `payERC20`/`payERC20WithPermit` have the same `msg.sender` semantics and the policy variant adds a `PermitSig` struct instead of `v,r,s`.

Consequences:
1. **No router edit is needed** for any PH mode, because each mode makes the *payer-controlled account* (or a relay holding the tokens) the router's `msg.sender`.
2. Permit paths: PH-2 is the only mode where the permit is signed to a *relay* (spender = relay), and the relay calls the router's plain `payERC20` after `forceApprove`; the router's own `payERC20WithPermit` is not used. PH-3: delegate code runs as the payer, so it may call `approve` then `payERC20`, or the router's `payERC20WithPermit` with a payer-signed permit. PH-4: account calls `approve` + `payERC20` in one `executeBatch`; permit is not needed (and token ERC-1271 permit support is **[U]**).
3. Both routers are supported by one `RouterTarget = 'ghostpay' | 'policy'` parameter; the policy variant adds the `PolicyRef` argument (`IGhostPayPolicyRouter.sol` [R]) and its different selector. The relay and delegate take the router address and **encoded router calldata hash** in the signed intent, so they need no router-specific ABI knowledge beyond one `payERC20` call shape per router (two thin `Encoder` implementations in TS; in Solidity the relay receives opaque `routerCalldata` bound by `payloadHash`, see 6.2).
4. Possible router improvement (NOT in PoC, not required): a router entry point taking an EIP-712 payer-signed intent would remove the relay hop. Routers are immutable and undeployed [R: README], so this is a v2-router discussion, listed in section 13 as Q5.

## 5. User-visible option

Setting `payerMode: 'direct' | 'fresh-wallet' | 'permit-relay' | 'eip7702-sponsored' | 'erc4337-paymaster'` (default `direct`). The UI MUST show, before signing, for the chosen mode: (a) who pays gas, (b) who sees payer address + IP, (c) the sponsor fee in tokens, (d) the line "The payer address is still public." Machine-readable table:

```ts
export interface PayerModeInfo {
  mode: PayerMode;
  needsNativeGasOnPayer: boolean;
  needsPermitToken: boolean;      // PH-2 only
  needsChainFeature: 'none' | 'eip7702' | 'erc4337-entrypoint';
  sponsorSees: ('payer'|'stealth'|'amount'|'token'|'ip'|'timing')[];
  hidesFromObservers: ('gas-funding-link'|'seller-sees-payer-as-transfer-sender')[]; // never 'payer'
  fingerprint: string;            // e.g. 'relay contract address', 'delegate code 0xef0100||addr'
  effort: 'S'|'M'|'L';
}
export const PAYER_MODE_INFO: Record<PayerMode, PayerModeInfo>;
```

`hidesFromObservers` MUST NOT ever contain `'payer'` (PH-GEN-3, test).

## 6. Architecture and interfaces

### 6.1 Ownership (build)

New, nothing else touched by the build:

| Path | Owner of | Contents |
|---|---|---|
| `packages/payer-hiding/` | TS library `@ghostpay/payer-hiding` (viem 2.57.7 pinned like siblings [R]; node built-ins; vitest, fast-check) | `src/modes.ts`, `src/freshWallet/{derive,fundingPlan,lint,hygiene}.ts`, `src/relay/{intent,encode}.ts`, `src/eip7702/{authorization,intent,submit}.ts`, `src/erc4337/{userop,account,paymasterClient}.ts`, `src/routerTargets.ts`, `src/chainGuard.ts`, `src/sponsorPolicy.ts`, `src/index.ts`, tests, `DEVIATIONS.md`, `README.md` |
| `packages/payer-hiding-contracts/` | Foundry project (own `foundry.toml`, `remappings.txt` pointing to `../contracts/lib`; imports `../contracts/src/interfaces/*` read-only) | `src/GhostPayPayRelay.sol`, `src/GhostPayPayerDelegate.sol`, `src/GhostPayPayerAccount.sol`, `src/GhostPayPayerAccountFactory.sol`, `src/GhostPayVerifyingPaymaster.sol`, `src/interfaces/*`, `test/*` (unit, fuzz, invariant, fork-free 7702 and 4337 tests), `script/DeployPayerHiding.s.sol` |
| `apps/payer-sponsor/` | Sponsor service for testnet (HTTP, Node, reuses `@ghostpay/relayer-guard` for breaker/limiter/client IP [R: spec]) | `src/server.ts`, `src/sponsor.ts` (modes 2-4 handlers), `src/budget.ts`, `src/config.ts`, `src/log.ts` (field allowlist), tests incl. anvil e2e |
| `apps/payer-sponsor/DEVIATIONS.md` | | |

PoC may add the contracts to `packages/payer-hiding-contracts` only; **no file under `packages/contracts/src` is edited**.

### 6.2 `GhostPayPayRelay` (PH-2)

Immutable, no owner, no upgrade, no pause, no delegatecall; `nonReentrant`; EIP-712 domain `name "GhostPayPayRelay"`, `version "1"`, `chainId`, `verifyingContract`.

```solidity
struct PayIntent {
  address payer; address router; address token; address stealth;
  uint256 gross;            // amount the ROUTER pulls (router fee included)
  uint256 sponsorFee;       // extra tokens paid to sponsorFeeTo
  address sponsorFeeTo;
  uint256 deadline; uint256 nonce;
  bytes32 payloadHash;      // keccak256(routerCalldata)
}
// PAYINTENT_TYPEHASH = keccak256("PayIntent(address payer,address router,address token,address stealth,uint256 gross,uint256 sponsorFee,address sponsorFeeTo,uint256 deadline,uint256 nonce,bytes32 payloadHash)")
struct PermitSig { uint256 value; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }

function pay(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig, PermitSig calldata permit) external;
function nonceUsed(address payer, uint256 nonce) external view returns (bool);
function DOMAIN_SEPARATOR() external view returns (bytes32);
event Paid(address indexed token, address indexed router, uint256 gross, uint256 sponsorFee);   // no payer, no stealth
error Expired(); error BadSignature(); error NonceUsed(); error PayloadMismatch(); error UnexpectedBalanceDelta();
error RouterCallFailed(); error ResidualAllowance(); error ZeroAddress();
```

`pay`: check `block.timestamp <= deadline`; `keccak256(routerCalldata) == payloadHash`; verify signature (OZ `SignatureChecker`, so EOA and ERC-1271 payers) ; consume nonce (bitmap) **before** external calls; `try permit(payer, this, permit.value, permit.deadline, v, r, s)` and require `permit.value >= gross + sponsorFee` (skip when `permit.deadline == 0` and allowance is pre-granted); `safeTransferFrom(payer, this, gross + sponsorFee)` with balance-delta check; `forceApprove(router, gross)`; low-level `router.call(routerCalldata)` (the **only** external call to an intent-named target; `routerCalldata` must start with the selector of `payERC20` for either router, checked against a constant two-element selector set); require resulting allowance == 0 and relay token balance == `sponsorFee`; `safeTransfer(sponsorFeeTo, sponsorFee)`; require final balance == 0; emit `Paid`. Native-token payments are not supported by PH-2 (payer would need native balance and a native payer needs gas anyway).

Trust/limits: sponsor cannot change `stealth`, `gross`, router, calldata, fee or fee recipient; relay holds zero tokens after every call (invariant). Known cost: payer address appears as `Transfer(payer -> relay)` in the same tx.

### 6.3 `GhostPayPayerDelegate` (PH-3)

Code delegated to by the payer EOA via EIP-7702; runs with `address(this) == payer`. Single purpose, no generic `execute`, no `delegatecall`, no initializer (nothing to front-run; EIP-7702 init-front-running section [P]).

```solidity
struct PayIntent { address router; address token; address stealth; uint256 gross; uint256 sponsorFee;
                   address sponsorFeeTo; uint256 deadline; uint256 nonce; bytes32 payloadHash; }
// EIP-712 domain: name "GhostPayPayerDelegate", version "1", chainId, verifyingContract = address(this) (the payer EOA)
// PAYINTENT_TYPEHASH = keccak256("PayIntent(address router,address token,address stealth,uint256 gross,uint256 sponsorFee,address sponsorFeeTo,uint256 deadline,uint256 nonce,bytes32 payloadHash)")
function pay(PayIntent calldata i, bytes calldata routerCalldata, bytes calldata sig) external;   // anyone (sponsor) may call
function clearNonceBitmap... // none; nonces are in ERC-7201 namespaced storage "ghostpay.payerdelegate.v1"
event Paid(address indexed token, uint256 gross, uint256 sponsorFee);
```

`pay`: `ecrecover(digest, sig) == address(this)` (OZ `ECDSA.recover`, low-s) ; deadline; payloadHash; selector allowlist as in 6.2; nonce consumed in namespaced storage first; `token.approve(router, gross)`; router call; `token.approve(router, 0)`; `token.transfer(sponsorFeeTo, sponsorFee)`. Because `address(this)` is the payer, the router's `msg.sender` is the payer EOA. Delegation code `0xef0100 || delegate` stays on the payer address after the payment (fingerprint N4); `eip7702/authorization.ts` can build a **clearing authorization** (`address = 0x0`, [P]) the sponsor may include in the *next* sponsored tx if the user chooses "clean up"; fresh payers are one-shot so the default is to abandon the address.
Authorization nonce: for a fresh EOA, 0, if the payer is not the tx sender (sponsor sends). Chain id in the tuple MUST be the target chain id, never 0 (PH-3-REQ-3).

### 6.4 `GhostPayPayerAccount`, `GhostPayPayerAccountFactory`, `GhostPayVerifyingPaymaster` (PH-4)

- `GhostPayPayerAccount`: minimal ERC-4337 account for an EntryPoint passed at construction (immutable), single ECDSA owner, `validateUserOp(PackedUserOperation, bytes32 userOpHash, uint256 missingAccountFunds)`, `executeBatch(Call[] calls)` only callable by the EntryPoint, no `delegatecall`, no module system. Deployed by the factory via `initCode`; counterfactual address `CREATE2(factory, salt = keccak256(owner, saltNonce), clone-of(implementation))` (EIP-1167, same pattern as `PolicyAccountFactory` [R]). Calls used: `token.approve(router, gross)`, `router.payERC20(...)`, `token.approve(router, 0)`, `token.transfer(sponsorFeeTo, sponsorFee)`.
- `GhostPayVerifyingPaymaster`: pays gas for a `UserOperation` iff `paymasterData` carries a signature by the immutable `verifyingSigner` over `(userOpHash-excluding-paymaster-sig, validUntil, validAfter, chainId, paymaster)`; deposit and stake managed by an immutable `sponsorAdmin` (testnet only; this is the single owner-like role in the PoC and MUST be documented as such); `postOp` unused. Reference implementations to prefer over fresh code: eth-infinitism `account-abstraction` `SimpleAccount`/`VerifyingPaymaster` **[U version, license and audit status unchecked]**; if vendored, record in `THIRD_PARTY.md`. A paymaster that is paid in ERC-20 instead of sponsor ETH is a stretch goal, not PoC.
- Client side `erc4337/paymasterClient.ts` talks to `apps/payer-sponsor` (own JSON endpoints) and optionally implements ERC-7677 `pm_getPaymasterStubData`/`pm_getPaymasterData` (Review status [P]) behind an adapter interface.

### 6.5 TS library (`@ghostpay/payer-hiding`)

```ts
export type PayerMode = 'direct'|'fresh-wallet'|'permit-relay'|'eip7702-sponsored'|'erc4337-paymaster';
export type RouterTarget = { kind: 'ghostpay'|'policy'; address: Address; policy?: PolicyRef };

// chainGuard.ts
export const TESTNET_CHAIN_IDS: readonly [11155111, 84532, 31337];
export function assertTestnet(chainId: number): void;              // throws PayerHidingError('MAINNET_FORBIDDEN')

// freshWallet
export function derivePayerKey(seed: Uint8Array, invoiceId: Uint8Array, index: number): { privateKey: SecretBytes; address: Address };
export interface FundingPlanInput { payer: Address; neededToken: bigint; neededGasWei: bigint; knownMine: Address[]; sellerDestinations: Address[]; chainId: number; }
export interface FundingPlan { steps: FundingStep[]; warnings: Warning[]; delayMs: number; roundedGasWei: bigint; }
export function planFunding(input: FundingPlanInput, rng: () => number): FundingPlan;
export function lintFunding(tx: FundingTx[], knownMine: Set<Address>, sellerDestinations: Set<Address>): Warning[]; // pure, over supplied tx list; no RPC inside

// relay / 7702 / 4337 intent builders (viem typed-data, no signing keys held)
export function buildRelayIntent(args): { typedData: TypedData; routerCalldata: Hex; intent: RelayPayIntent };
export function buildDelegatePayIntent(args): { authorization: AuthorizationRequest; typedData: TypedData; routerCalldata: Hex };
export function buildUserOperation(args): { userOp: PackedUserOperation; userOpHash: Hex };
export function encodeRouterPay(target: RouterTarget, args: PayArgs): Hex;      // payERC20 for either router
export function decodeAndCheckPayload(target, routerCalldata, intent): void;    // review step: calldata == signed fields

// sponsor client
export interface SponsorClient { quote(req): Promise<SponsorQuote>; submit(req): Promise<{ txHash: Hex }>; }
```

`apps/payer-sponsor` HTTP (JSON, no cookies, no analytics; same field-allowlist logging rule as the relayer [R: privacy-ops PO-COR-2]):

`POST /v1/quote {mode, chainId, token, gross} -> {sponsorFee, sponsorFeeTo, expiresAt, quoteId}`; `POST /v1/submit {mode, quoteId, ...mode payload} -> {txHash}`; `GET /v1/health`. `quoteId` random, not derived from payer/IP (PO-COR-2). Sponsor refuses mainnet chain ids (PH-GEN-1).

## 7. Requirements

### General (`PH-GEN`)
1. PH-GEN-1 (MUST): Every library, CLI and sponsor entry point calls `assertTestnet(chainId)`; chain ids not in `TESTNET_CHAIN_IDS` fail with `MAINNET_FORBIDDEN`. Contracts carry no chain gating (immutable, chain-agnostic), the deploy script refuses non-testnet ids.
2. PH-GEN-2 (MUST): No mode requires a change to `packages/contracts/src/**`; build adds only the paths in 6.1.
3. PH-GEN-3 (MUST): No UI string, `PAYER_MODE_INFO`, doc or log claims the payer is hidden/anonymous; `hidesFromObservers` never contains `'payer'`. Test greps the shipped strings for `anonymous|untraceable|hidden payer`.
4. PH-GEN-4 (MUST): Sponsor service logs only a field allowlist (`mode, chainId, outcome, latencyBucket, txHash`); no payer, stealth, IP, calldata, quote contents (PO-COR-2/-5 style [R]).
5. PH-GEN-5 (MUST): Default `payerMode` is `direct`; selecting any other mode is explicit and shows the sponsor-trust and token-funding-link notices (N2, N3).
6. PH-GEN-6 (SHOULD): The sponsor never signs or broadcasts anything not matching a signed intent whose `payloadHash`/calldata passes `decodeAndCheckPayload`.

### PH-1 fresh wallet
7. PH-1-REQ-1 (MUST): `derivePayerKey` is deterministic from `(seed, invoiceId, index)` with domain separation; distinct `(invoiceId, index)` yield distinct keys; keys live only in `SecretBytes` from `@ghostpay/secret-box` [R: modules-needed] and are zeroed on scope exit.
8. PH-1-REQ-2 (MUST): `planFunding` never plans funding from an address in `knownMine` or `sellerDestinations`; it returns `warnings` with code `FUNDER_IS_KNOWN` and `ok=false` instead.
9. PH-1-REQ-3 (MUST): `lintFunding` emits `SAME_SENDER_RECEIVER` when a funding source equals a seller destination, `SHARED_FUNDER` when the same funder funded the payer and any `knownMine`/prior payer key, `EXACT_AMOUNT` when native funding equals the minimal required gas to the wei, `NO_DELAY` when funding-to-payment gap < `minDelayMs` (default 10 min on testnet, user-adjustable), `LEFTOVER_RETURN` when residual is sent back to the funder.
10. PH-1-REQ-4 (MUST): Gas funding amount is rounded **up** to a coarse grid (2 significant figures, as in `anonymization-research.md` 4.4 [R]) and a random delay uniform in `[minDelayMs, 3*minDelayMs]` is drawn from an injected `rng`.
11. PH-1-REQ-5 (MUST): `lintFunding` and `planFunding` perform **no network I/O** (they take tx lists as input); the optional `fetchFundingHistory(rpc, address)` helper is separate and its docstring/UI states that it sends the address to the RPC provider (D8 [R]).
12. PH-1-REQ-6 (MUST): Planner output contains an explicit warning `TOKEN_FUNDING_LINK` that the token source is linked to the payer (N2), and never states otherwise.
13. PH-1-REQ-7 (SHOULD): One payer key per payment by default; reuse of a payer key for a second invoice emits `PAYER_REUSE`.
14. PH-1-REQ-8 (SHOULD): Testnet guidance lists faucet and bridge options generically without naming URLs the build has not verified; faucet providers see the requesting IP/account (note, no invented endpoints).

### PH-2 permit relay
15. PH-2-REQ-1 (MUST): `pay` reverts on: expired deadline, bad signature (EOA and ERC-1271 payer), used nonce, `keccak256(routerCalldata) != payloadHash`, selector not in the `payERC20` set of both routers, balance-delta mismatch (fee-on-transfer token), non-zero residual allowance, non-zero final relay balance.
16. PH-2-REQ-2 (MUST): Nonce is consumed before any external call; replay of the same `(intent, sig)` reverts.
17. PH-2-REQ-3 (MUST): A front-run `permit` (nonce consumed by another party) does not block `pay` when allowance is sufficient (try/catch, same as router [R]).
18. PH-2-REQ-4 (MUST): Invariants (Foundry): relay token balance is 0 after every call; the sponsor (caller) cannot change `stealth`, `gross`, `sponsorFee`, `sponsorFeeTo`, router; total payer debit == `gross + sponsorFee`.
19. PH-2-REQ-5 (MUST): Router sees `msg.sender == relay`; announcement and `FeeCollected` are emitted as for a direct payment (test against both routers and the CC0 announcer mock [R: CONTRACTS_SPEC section 5]).
20. PH-2-REQ-6 (MUST): `Paid` event contains no payer or stealth.
21. PH-2-REQ-7 (SHOULD): Works with the repo mock tokens `PermitToken`, `MockERC20` (pre-approved), `NoReturnToken`; rejected cleanly with `FeeOnTransferToken`, `FalseReturnToken`; reentrant/hook token cannot reenter (`nonReentrant`) [R: `packages/contracts/test/mocks`].

### PH-3 EIP-7702 sponsored
22. PH-3-REQ-1 (MUST): With `vm.signDelegation`/`attachDelegation` (or anvil type-4), a payer EOA holding tokens and **zero native balance** completes a payment through a sponsor tx; router `msg.sender == payer`; sponsor receives `sponsorFee` tokens.
23. PH-3-REQ-2 (MUST): Delegate rejects: signature not by `address(this)`, wrong `chainId` or `verifyingContract` in the domain, used nonce, `payloadHash` mismatch, selector outside allowlist, expired deadline. Direct calls to the delegate implementation address (not through an EOA) cannot move funds.
24. PH-3-REQ-3 (MUST): `buildDelegatePayIntent` sets authorization `chain_id` to the target chain (never `0`), `nonce` to the payer's current account nonce read by the caller, and refuses a delegate address that is not in the deployment manifest (reuse `packages/chain-adapters` manifest format conceptually; PoC may use a local JSON).
25. PH-3-REQ-4 (MUST): After `pay`, allowance of the router from the payer is 0 (test).
26. PH-3-REQ-5 (MUST): Library exposes `buildClearingAuthorization` (address `0x0` [P]) and the e2e test shows code is cleared and the payer address is not re-usable by the old delegate intent (nonce state persists in namespaced storage).
27. PH-3-REQ-6 (SHOULD): If the chain/RPC does not support type-4 txs (capability probe: `eth_sendRawTransaction` dry-run on anvil, or chain-id allowlist from manifest), mode `eip7702-sponsored` is disabled in `PAYER_MODE_INFO` availability with reason `NO_7702`.
28. PH-3-REQ-7 (MUST): Delegate has no generic `execute`, no `delegatecall`, no initializer, no `receive` logic beyond accepting ETH.

### PH-4 ERC-4337
29. PH-4-REQ-1 (MUST): On local anvil with an EntryPoint deployed, a counterfactual `GhostPayPayerAccount` with zero native balance deploys via `initCode` and pays through `handleOps` called by an EOA acting as bundler; paymaster pays gas; router `msg.sender == account`.
30. PH-4-REQ-2 (MUST): The client refuses an EntryPoint whose `extcodehash` differs from the manifest entry. EntryPoint addresses in code are marked **[U]** until verified from the official release.
31. PH-4-REQ-3 (MUST): Paymaster rejects: signature by another key, expired `validUntil`, wrong chain/paymaster in signed data, a changed `callData`/`sender` (userOpHash binding). `executeBatch` callable only by the EntryPoint.
32. PH-4-REQ-4 (MUST): `buildUserOperation` + `userOpHash` match a reference computation from the ERC text (`PackedUserOperation` hash per [P] section on `getUserOpHash`; test vector committed to `test-vectors/`).
33. PH-4-REQ-5 (SHOULD): Run the same e2e against one real public bundler on a testnet if the owner supplies an endpoint; else mark "not run" in `DEVIATIONS.md`.
34. PH-4-REQ-6 (MUST): Paymaster deposit/stake admin is documented as the sole privileged role of the PoC; no other contract in this spec has an owner.

### Sponsor (`apps/payer-sponsor`)
35. SP-REQ-1 (MUST): Quote returns `sponsorFee >= estimated gas cost * (1 + safetyBps)` in token units using an injected price source; the sponsor refuses a submit whose simulation (`eth_call`/`handleOps` simulation) reverts.
36. SP-REQ-2 (MUST): Per-IP/bucket limits, breaker and loss budget from `@ghostpay/relayer-guard` (IPv6 /64, trusted-proxy parsing) [R]; a sponsored tx that mines but reverts because payer state changed charges the loss budget.
37. SP-REQ-3 (MUST): The sponsor holds only a testnet hot key; config rejects a key funded on a mainnet chain id; key never logged (reuse `secret-box`).
38. SP-REQ-4 (SHOULD): Clients may reach the sponsor through any HTTP proxy/Tor; sponsor works without cookies or auth headers.

## 8. Trust shifted to the sponsor, and gas-funding leakage

| Observer | PH-0 | PH-1 | PH-2 | PH-3 | PH-4 |
|---|---|---|---|---|---|
| Chain analyst: payer address | visible | visible (fresh) | visible in same-tx `Transfer(payer->relay)` | visible (`msg.sender`) | visible (`handleOps` sender) |
| Chain analyst: gas funder of payer | payer's own funder | funder (fresh wallet link, mitigated by guidance) | none (sponsor is tx sender) | none | none (bundler tx sender, paymaster) |
| Chain analyst: token source of payer | visible | visible | visible | visible | visible |
| Seller UI: sender of transfer into `S1` | payer | fresh payer | relay | payer | account |
| Sponsor / operator | n/a | n/a | payer, stealth, token, amount, IP, timing | same | same + bundler mempool |
| Fingerprint | none | none | relay contract, sponsor key | delegate code on payer, sponsor key | factory+account code, paymaster, bundler |

Gas-funding leakage specifics: (a) sponsor hot-key funding links sponsor to its operator (`onion-i2p-research.md` section 2.6(3) [R]); (b) all sponsored payments cluster on the sponsor address, which both creates a crowd (all GhostPay sponsored payers) and a label; (c) the sponsor fee (a token amount to `sponsorFeeTo`) is public and quote-derived, so quote values SHOULD be rounded to a grid; (d) if the sponsor is also the seller's relayer (`apps/relayer`), the same operator would see both ends: spec MUST NOT co-locate keys or logs; `apps/payer-sponsor` is a separate deployment with a separate hot key (SP-REQ-3). Sponsor fee collection can reveal the payer to a sponsor that also does KYC; none in PoC.

## 9. Test plan

- **Contracts (Foundry, `packages/payer-hiding-contracts/test`)**: unit per revert in 6.2-6.4; fuzz (10 000 runs, matching `CONTRACTS_SPEC.md` section 5 [R]) over `gross`, `sponsorFee`, deadlines, nonces, token decimals 2/18; invariant suites (relay zero balance, nonce single-use, sponsor cannot alter fields); mock tokens reused from `packages/contracts/test/mocks` via import path; both routers deployed against the CC0 announcer mock; 7702 tests with `signDelegation`/`attachDelegation` (blocked on Q2); 4337 tests with a locally compiled EntryPoint (source from the official repo, version pinned, **[U]**) and the account/paymaster above; gas snapshot.
- **TS (`packages/payer-hiding`, vitest + fast-check)**: planner/linter property tests (rounding up, delay bounds with injected rng, no-I/O check by running with network disabled), typed-data hash equality against Solidity (golden vectors in `test-vectors/payer-hiding/*.json`), `decodeAndCheckPayload` negative cases (changed stealth, amount, router, selector), mode info invariants (PH-GEN-3).
- **E2E (anvil, `apps/payer-sponsor/src/e2e.anvil.test.ts`)**: each mode pays a stealth address through each router; assertions: stealth balance == net, fee recipient == fee, payer native balance stays 0 (PH-2/3/4), sponsor token balance == `sponsorFee`, announcement decodes and the seller scan finds it (reuse `core-crypto` scan [R]).
- **Privacy regression test**: for each mode compute the set of addresses appearing in logs/trace; assert the documented observer table (section 8) by test, so the comparison table cannot drift from behaviour.
- **Abuse**: sponsor with `relayer-guard` fixtures: flood, breaker open/half-open, IPv6 /64.

## 10. PoC acceptance criteria

1. All five modes selectable from the CLI `ghostpay-payer pay --mode <m> --chain anvil|sepolia|base-sepolia` and from a library call; mainnet ids rejected.
2. Modes 2-4: payer native balance is `0` before and after, payment completes, stealth and fee recipient receive exact amounts, sponsor is paid `sponsorFee` in tokens.
3. Mode 1: planner flags each of the five lint conditions in fixtures; no network calls in planner/linter.
4. Observer table test (section 9) passes; UI copy audit (PH-GEN-3) passes.
5. Each contract: tests green incl. fuzz and invariants; `forge fmt`/lint clean per the existing package conventions.
6. `DEVIATIONS.md` in each new package records everything unverified: 7702 availability on Sepolia/Base Sepolia, EntryPoint addresses, real bundler run, ERC-1271 permit behaviour.
7. Nothing deployed to any real network by the build; deployment scripts exist and are dry-run on anvil only.

## 11. Edits to existing code (separate; NOT part of the PoC build, owner/other agents)

| File | Edit |
|---|---|
| `packages/chain-adapters/src/config/chains.ts` | Add per-chain capability flags `supports7702`, `entryPoint` (manifest-verified). |
| `packages/chain-adapters/src/deployments.ts` and `docs/DEPLOYMENT_MANIFEST.md` | Optional manifest entries for relay, delegate, factory, paymaster, EntryPoint with code hashes. |
| `apps/web` payment flow | Add the `payerMode` selector, notices (PH-GEN-5), and calls into `@ghostpay/payer-hiding`. |
| `apps/relayer` | None (kept separate by design, section 8(d)). |
| `docs/adr/ADR-LOG.md` | ADR-0009 ("Sponsorship without ERC-4337 for MVP") is partly superseded for payer-side sponsorship if PH-4 is kept; add an ADR. |
| `docs/user/privacy-limits.md` | State N1/N2 and the table in section 8. |
| `THIRD_PARTY.md` | If an EntryPoint/`account-abstraction` source is vendored. |

## 12. Effort and risks

| Piece | Effort |
|---|---|
| PH-1 library (derive, plan, lint) | S |
| PH-2 relay + TS builders + tests | M |
| PH-3 delegate + 7702 builders + tests | M (plus spike for Q1/Q2) |
| PH-4 account, factory, paymaster, userop builder, tests | L |
| `apps/payer-sponsor` + e2e | M |
| **Total** | **L** (about 3-4 parallel workstreams) |

Risks: (1) a poorly written delegate or account is a total-loss risk for the payer (EIP-7702 warning [P]); mitigated by the single-purpose design and signature-bound fields but this is unaudited code; (2) users read "sponsored" as "anonymous" (N1): copy tests; (3) sponsor key theft or drain: testnet key only, loss budget; (4) relay is a shared contract that becomes a label and potential griefing target; (5) 7702 persistent code on payer (N4); (6) 4337 toolchain/bundler variance and EntryPoint version pinning; (7) ERC-7677 is only Review status; (8) ERC-2612-only permit support limits PH-2 token coverage (USDT-style tokens unsupported, same matrix as `GhostPaySweepRelayer` [R]); (9) false sense that a fresh wallet funded from a CEX or the user's main wallet is private.

## 13. Open questions

- Q1: Are Sepolia and Base Sepolia type-4 (EIP-7702) capable today? Verify against chain clients/specs; **[U]**.
- Q2: Does the repo's Foundry/solc setup (`evm_version = "cancun"`, solc 0.8.28 [R]) run `attachDelegation` tests and accept the needed EVM version (Prague) or does the new package need a different toolchain? **[U]**.
- Q3: Vendor eth-infinitism `account-abstraction` (version, licence, audit status?) or write the minimal account/paymaster here? Default in spec: minimal own code for PoC, noting the security preference for audited code.
- Q4: Should the sponsor fee be mandatory (PoC default) or may the sponsor be the project itself (free testnet)? Pricing decisions are the owner's.
- Q5: Do we want a v2 router entry point taking a payer-signed intent (removes the relay hop, changes immutable contracts)? Deferred.
- Q6: Is a persistent 7702 delegate on payer EOAs acceptable given the fingerprint (shares `anonymization-research.md` Q4 [R])?
- Q7 (legal, deferred by owner, not blocking): operating a gas sponsor/relay and a token-denominated sponsor fee may have regulatory implications in some jurisdictions; not analysed here.

## 14. Sources (retrieved 2026-10-21)

- EIP-7702: https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7702.md (Final)
- ERC-4337: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-4337.md (Final)
- ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md (Final)
- ERC-7677: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7677.md (Review)
- ERC-2612: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-2612.md (Final)
- ERC-3009: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-3009.md (Draft)
- ERC-7710: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7710.md (Draft)
- Not fetched / unverified: eth-infinitism account-abstraction releases and EntryPoint addresses; Sepolia/Base Sepolia Pectra activation; Foundry type-4 support details; Elliptic ERC-4337 analytics view (cited via `anonymization-research.md`, not re-fetched).
