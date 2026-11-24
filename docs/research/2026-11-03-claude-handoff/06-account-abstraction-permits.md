# Account abstraction, sponsorship, permits, and policy-account interoperability

**Research snapshot:** 2026-11-03 handoff; source and upstream reads completed during the 2026-11-04 UTC session. **Purpose:** concrete implementation guidance for Claude after the lean release gates, not authorization to deploy additional financial infrastructure. **Evidence:** source inspection and upstream reference checks only; this research did not execute the cited tests, contact a public bundler, submit a transaction, or independently audit these contracts.

**Decision:** keep the existing, deliberately restricted sponsorship modules. Qualify their versioned interfaces with the already-installed viem before introducing another AA SDK. Treat ERC-7677 as an adapter around GhostPay's quote and authorization policy; keep Permit2 and ERC-3009 as separate, deferred token-acquisition mechanisms. Do not turn the experimental destination-restricted `PolicyAccount` into a generic ERC-4337 account.

## 1. Repository truth and current ownership

Inspection baseline is PR #47 at [`f8193502e602c99bb24ff956f142671750b744a0`](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0), compared with main `0014bc5b26c7487ea1f9fb230194c36673193236`. References below are relative to the repository root unless linked explicitly. Older research in [`../reuse/aa-sponsor.md`](../reuse/aa-sponsor.md) and [`../reuse/permit2.md`](../reuse/permit2.md) is useful history; the findings here supersede the particular license, pin, and integration claims identified below.

| Surface | Inspected implementation | Actual remaining work and ownership |
|---|---|---|
| `packages/payer-sponsor/src/erc4337/{userop,paymaster,account}.ts` | Packed v0.7 UserOperation, version-specific hash, factory address/initCode, restricted expected call batch, paymaster data/signature helpers, EntryPoint code-hash verification already exist. | A bundler transport and real bundler qualification remain. This is not an empty AA package. |
| `packages/payer-sponsor/src/sponsor/{service,http,wire,viemChain}.ts` | Quote/submit/sponsor-userop flows, strict parsing, simulation, signer injection, rate/breaker/loss controls and fee-log verification already exist. | The package has no process entry point or operator configuration; quotes live in process memory. The present operation submission constructs an outer `handleOps` transaction. ERC-7677 is absent. See `DEVIATIONS.md` and `SponsorService.submitUserOp`. |
| `packages/payer-sponsor/src/eip7702/intent.ts` and `packages/payer-hiding-contracts/src/GhostPayPayerDelegate.sol` | Chain-specific, allowlisted delegate authorization, separate payment intent, clearing authorization, delegation-designator check, and delegate contract already exist. | Public wallet/RPC capability, persistent delegation lifecycle and recovery qualification remain. The code is gated to test chains. |
| `packages/payer-hiding-contracts/src/GhostPayPayRelay.sol` | ERC-2612/allowance pull plus payer-signed payment intent; `SignatureChecker.isValidSignatureNow` supports the relay-order authorization boundary. | Contract-wallet compatibility must be checked separately at the token authorization boundary. A valid relay-order signature does not establish that a token accepts the same signature scheme. |
| `packages/contracts/src/PolicyAccount.sol`, `packages/policy-scheme`, `apps/web/src/features/policy` | Experimental receiver policy account, EIP-712 withdrawal requests, delay, destination restriction, rolling-window caps, nonce bitmap, derivation, scanner and UI are present. | Keep feature gating and its distinct account model. [PR #65](https://github.com/djshellshoxxx/GhostPay/pull/65), inspected at `b220f0b0764fe7d8af7fe1491c44032e0ce38255`, owns session, reviewed-transaction, deadline and verified-approval guards on the policy send path. Do not duplicate that patch. |
| `packages/contracts/src/GhostPayRouter.sol`, `packages/chain-adapters/src/permit.ts`, existing Sweep | ERC-2612 and allowance support, token preflight and permit classification already exist. | Permit2 and ERC-3009 remain additional mechanisms. PR #69 owns permit-refusal wording; do not recast that UI wording work as an unimplemented permit backend. |

The sponsorship README and chain guards restrict the package to chain IDs 31337, 11155111 and 84532. Its own deviations explicitly identify the local `handleOps` test as **not a public-bundler test**. Preserve that distinction and the testnet restrictions. The package describes gas sponsorship as removing a native-gas funding link while leaving the payer/token-funding relationships and sponsor observations visible; retain that accurate product description.

**Priority notation:** D1 means first qualification work when this deferred lane is deliberately opened; D2 means a later, separately scoped capability. None of the following is a reason to expand the lean EVM release now. Core payment evidence, transaction outcome and finality guidance is in [01](01-evm-payment-correctness.md).

## 2. D1 — Use viem's versioned bundler boundary; retain GhostPay's account policy

### Exact reuse candidate

GhostPay already pins `viem` **2.57.7** in `packages/payer-sponsor/package.json`. The upstream tag `viem@2.57.7` resolves to commit **`bd8e313490d6f788a5d6f93c76f55fed606d78b9`**. Relevant paths are:

- `src/account-abstraction/utils/userOperation/getUserOperationHash.ts` and `.test.ts` — inspected; explicit 0.6/0.7 versus 0.8/0.9 handling.
- `src/account-abstraction/actions/bundler/waitForUserOperationReceipt.ts` — inspected; waits for operation inclusion and returns the UserOperation receipt.
- `src/account-abstraction/clients/createBundlerClient.ts`, `actions/bundler/getSupportedEntryPoints.ts`, `estimateUserOperationGas.ts`, `sendUserOperation.ts`, and `getUserOperationReceipt.ts` — paths verified in the pinned tree; their complete implementations were not independently reviewed in this lane.

**License:** pinned root `LICENSE` is MIT, copyright 2023-present weth LLC. **Disposition:** use the existing dependency's public AA API for a narrow transport adapter; adapt the inspected hash fixtures. Do not copy library internals or add an account implementation merely because viem provides an adapter for another wallet. [U1]

### Concrete GhostPay changes to propose

Keep `getUserOpHashV07`, `buildUserOperation`, `assertPayerCalls`, `buildInitCode`, `computeAccountAddress` and `verifyEntryPoint` as explicit compatibility boundaries. Add a bundler port beside `SponsorChain`, with a deliberate distinction between **UserOperation hash** and **outer transaction hash**. The existing `submitUserOp` sends a transaction containing `handleOps`; a bundler-facing submission has different request, receipt and retry semantics.

Configure an explicit tuple of chain, EntryPoint address, EntryPoint version, expected runtime-code hash, factory, account implementation and paymaster. The current GhostPay hash helper explicitly excludes v0.8. The pinned viem source takes an `entryPointVersion` argument and switches hash rules; a package upgrade or use of the latest ERC-4337 webpage must not silently change the GhostPay protocol. [U1, U2]

`GhostPayPayerAccount.validateUserOp` recovers its owner against the **raw UserOperation hash**. The paymaster flow separately recovers an EIP-191 message signature in `SponsorService.submitUserOp`. Keep these signature domains distinct. A generic wallet adapter that adds a personal-sign prefix to the account-owner hash is not interchangeable with this account.

GhostPay intentionally sponsors the first operation of a fresh account: `checkUserOp` rejects a nonzero nonce and checks factory/owner/salt data. Supporting a previously deployed account would require a new ownership and nonce policy, not removal of that condition.

### Acceptance evidence

Use a local, version-pinned bundler fixture when implementation is authorized, then a separately approved public-testnet qualification. Require:

1. Differential equality between GhostPay's v0.7 packed/hash output, viem with version `0.7`, and the pinned EntryPoint's on-chain hash; record chain, EntryPoint, factory, account and paymaster code identities.
2. Explicit mismatch refusal for an unsupported EntryPoint/version; no fallback from v0.7 to a newer hash format.
3. Operation receipt reconciliation that checks the target operation's success and exact GhostPay router/transfer evidence. An outer transaction receipt can succeed while an inner operation fails; the current service already checks sponsor-fee evidence, and that check should remain.
4. Durable submission identity and recovery after timeout/restart. The current `execute` path deletes its quote before simulation/send and maps unexpected chain errors to `UNAVAILABLE`; production qualification must preserve an operation's known identifiers and uncertain status before encouraging a new payment.
5. Inclusion and chain-finality tracking as separate stages. Viem's inspected UserOperation wait helper describes one-confirmation inclusion; it does not establish GhostPay's chosen finality policy. [U1]

These are acceptance requirements, not claims that the referenced tests have run or that the source review proved a specific failure against deployed infrastructure.

## 3. D1 — Wrap the sponsor in ERC-7677 without replacing its authorization policy

The optional ERC-7677 adapter remains explicitly unimplemented in `packages/payer-sponsor/DEVIATIONS.md`. The useful upstream is already within viem:

- `src/account-abstraction/actions/paymaster/getPaymasterStubData.ts`
- `src/account-abstraction/actions/paymaster/getPaymasterData.ts`

Both were inspected at the same viem commit and serialize their corresponding `pm_*` RPC method with the UserOperation, EntryPoint, chain ID and context. **License/disposition:** MIT; adopt the dependency's client and use its request/response shapes as interoperability fixtures for a GhostPay server adapter. [U1]

The standard distinguishes estimation stub data from final sponsorship data. For v0.7 the stub response must provide `paymasterPostOpGasLimit`; `isFinal: true` can skip the second call in cases where the stub data is already valid final data. GhostPay's paymaster uses a signature, so do not infer `isFinal` simply because a stub endpoint exists. [U3]

**Mapping:** add a protocol adapter alongside `sponsor/http.ts` and `sponsor/wire.ts`; call the existing `SponsorService`/quote policy rather than moving pricing, chain allowlisting or payload validation into generic JSON-RPC plumbing. Keep context fields deliberately small and validated. The current two-step GhostPay flow solves a real dependency: the paymaster authorization binds the operation, and the owner signature binds the paymaster data.

**Acceptance:** serialized round trips with the pinned viem client; separate stub and final-signature cases; explicit version mismatch; bounds on gas-related fields; expiry between estimation and signing; refusal when final operation data differs from the approved quote; preservation of token, amount, router calldata, fee recipient and account identity; no claim that an accepted sponsorship response is an included payment. ERC-7677 standardizes the service interface; it does not supply GhostPay's economic or authorization policy. [U3]

## 4. D1 — Qualify EIP-7702 as a persistent account lifecycle

`buildDelegatePayIntent` already supplies a chain-specific authorization and validates the delegate against the manifest. `buildClearingAuthorization` already emits a zero-address authorization, and `isDelegatedTo` checks the exact delegation designator. This is existing implementation to qualify, not a feature to recreate.

EIP-7702 delegation persists beyond one payment, and authorization processing is not rolled back when the transaction's execution fails. Therefore payment success, transaction success, and current delegation state must be shown and stored separately. [U4]

**Reuse:** viem `src/actions/wallet/prepareAuthorization.ts`, inspected at `bd8e313...`, fills missing fields, reads the account's pending nonce and adjusts it for a self-executing transaction. Use its public API or mirror its documented input expectations in a small adapter. Preserve GhostPay's intentional rules against chain ID zero and unlisted delegates. **License/disposition:** MIT; dependency adapter and fixture source. Do not replace the specialized delegate with viem's generic simple-7702 account implementation merely to reuse a client convenience method. [U1]

**Mapping:** `eip7702/intent.ts`, `sponsor/service.ts:submitEip7702`, `sponsor/viemChain.ts`, and `GhostPayPayerDelegate.sol`. Introduce a clear state model for authorization prepared, submitted, observed delegation, payment evidence, clearing submitted and clearing observed. Read authoritative account code and nonce when recovering a workflow; a successful clearing request is not proof that clearing is mined.

**Acceptance:** sponsor-executed versus self-executed nonce expectations; duplicate pending requests; wallet refusal; provider support for simulation with authorization lists; failed payment with delegation still present; separate clearing confirmation; inability to change the reviewed payment intent when preparing the authorization; and retained manifest/code identity checks. Use local controlled fixtures, then the actual supported wallets and test-chain RPCs. The existing Anvil e2e is valuable but does not establish those public-provider capabilities.

## 5. D2 — Permit2 is a separate approval relationship, not a universal zero-approval path

### Verified upstream and correction to earlier notes

`Uniswap/permit2` main resolved through the GitHub commits API to **`cc56ad0f3439c502c246fc5cfcc3db92bb8b7219`** during this pass. This confirms the previously HTML-derived candidate pin; it does not identify bytecode on any target network. Inspected files:

- `src/SignatureTransfer.sol`
- `src/libraries/PermitHash.sol`
- `src/libraries/SignatureVerification.sol`
- root `LICENSE`

The root license and inspected source headers are MIT. The signature transfer uses an unordered nonce bitmap; the hash includes the spender derived from the caller, and witness variants add application data. The verifier includes an ERC-1271 path for contract signers. [U5]

**Disposition:** design-only for the lean release; later integrate a verified external Permit2 deployment through a minimal interface and adapt conformance cases. Do not vendor the full Permit2 contract system or add the archived standalone SDK on the strength of the older note. This pass did not inspect the replacement SDK monorepo and makes no new claim about its suitability.

Uniswap's official documentation makes the prerequisite explicit: the token owner first approves the Permit2 contract. SignatureTransfer then grants a single nonce-scoped transfer to the spending application. That differs from a native token ERC-2612 permit, and the initial token approval still needs its own funding and wallet path. [U6]

**Mapping:** future token acquisition beside `GhostPayPayRelay.pay` or a new deliberately versioned router entry point, plus a typed-data builder beside `relay/intent.ts`. Keep the present `chain-adapters/src/permit.ts` classification for token-native permits; do not rename every permit mechanism into one boolean capability.

A Permit2 signature's token allowance or transfer authorization is not by itself GhostPay's full payment order. Retain the signed intent binding to the reviewed router, stealth destination, gross amount, sponsor fee, fee recipient and calldata, or explicitly encode the required terms in a witness with a reviewed type string. Exact transfer evidence and chain/deployment verification remain necessary.

**Acceptance:** distinguish token-to-Permit2 allowance from Permit2-to-application permission; verify per-chain deployment code identity rather than assume a universal address; EOA versus ERC-1271 fixtures; single-use nonce invalidation; witness/type agreement; bounded authorized versus requested amounts; and exact expected recipient/net/fee behavior. No permissive generic-spender import into the existing restricted policy account.

## 6. D2 — ERC-3009 needs a token/deployment capability matrix

Verified upstream: `circlefin/stablecoin-evm` commit **`fc85788bc7c23cefe3df1a757133048bfddadeaa`**. Inspected `contracts/v2/EIP3009.sol`, `contracts/v2/FiatTokenV2_2.sol`, `test/v2/GasAbstraction/testReceiveWithAuthorization.ts` and root `LICENSE`. Root and inspected file licenses are **Apache-2.0**. The contract source is Solidity 0.6.12. [U7]

**Disposition:** adapt interface/test semantics and token fixtures, preserve notices when copying applicable material; do not import the complete token implementation into GhostPay's Solidity 0.8.28 application. The old note's broad token/version generalizations should become verified deployment records. A token symbol or chain name is insufficient evidence that a particular authorization interface, overload or signing scheme works.

ERC-3009 authorizes a transfer with validity bounds and a random 32-byte nonce, unlike the sequential nonce of ERC-2612. Its receive form requires the payee to be the caller. The inspected Circle implementation also provides bytes-signature variants and contract-wallet tests; this capability must not be projected onto every deployed token that implements some form of ERC-3009. [U7, U8]

**Mapping:** a future acquisition adapter for `GhostPayPayRelay`/router, typed data adjacent to `relay/intent.ts`, and token capability configuration alongside existing permit metadata. When a router or relay receives tokens to complete another action, evaluate `receiveWithAuthorization` for that receiver-bound pull. Retain GhostPay's separate payment intent and verify the resulting transfer amount before announcing a payment.

**Acceptance:** exact token address and implementation identity, domain name/version, supported signature overloads, EOA versus contract-wallet behavior, validity boundaries, cancellation/nonce state, exact receiver, paused/blocked-token behavior, and full rollback if the downstream GhostPay payment does not complete. The source tests demonstrate useful fixture coverage; this pass did not run them or qualify any public USDC deployment.

## 7. Account compatibility must be explicit

| Account or authorization | Existing GhostPay behavior | Integration rule |
|---|---|---|
| Scheme-1 stealth EOA | Owner key signs existing EVM paths. | Preserve the lean flow and its exact payment evidence. |
| PH-2 relay payer | Relay order uses `SignatureChecker`; token pull uses ERC-2612 or allowance. | Validate order-signature capability separately from token permit capability. A contract wallet can use an allowance path even when a native permit interface is unsuitable. |
| PH-4 `GhostPayPayerAccount` | v0.7, immutable owner/EntryPoint, raw-hash owner recovery, EntryPoint-only generic batch execution. | Use a GhostPay-specific account adapter; don't assume another wallet's signature encoding or factory semantics. |
| Receiver `PolicyAccount` | ECDSA owner, signed withdrawal requests, fixed destination, delay/caps; no general execution or approval method in its reviewed interface. | Keep it distinct from the PH-4 payer account. Adding generic `execute`, token approvals or account modules would change its central invariant, not merely improve compatibility. |
| EIP-7702 payer EOA | Persistent delegation and separately signed payment intent. | Treat authority, delegation and payment states independently. |
| Permit2 / ERC-3009 signer | New backend capability, not existing lean support. | Qualify signature method, token allowance/authorization, nonce and deployment together. |

PR #65's web guards do not convert the receiver policy account into an AA payer. They protect its existing reviewed transaction path. Any future compatibility proposal should state which row changes and the resulting asset-control behavior before selecting an upstream account implementation.

## 8. License correction: match the EntryPoint version actually used

GhostPay's test-only fetch script requests `@account-abstraction/contracts@0.7.0`. The upstream **v0.7.0** tag resolves to **`7af70c8993a6f42973f520ae0752386a5032abe7`**. At that exact commit, both `contracts/core/EntryPoint.sol` **and `contracts/core/BasePaymaster.sol`** have **GPL-3.0** file headers; the root LICENSE is GPLv3. [U2]

The older `reuse/aa-sponsor.md` suggested that `BasePaymaster.sol` was MIT based on a different branch. That statement must not authorize copying the v0.7.0 file. Keep the current test-only/reference boundary and retain GhostPay's own interface and contract design. Any future code copying must check the exact selected revision and dependency closure. A package metadata field alone does not settle a conflicting file header. This is a provenance finding, not a conclusion about the licensing status of the whole GhostPay project.

## 9. Sources and verification limits

| ID | Primary source / exact evidence | Use in this report |
|---|---|---|
| U1 | [Viem 2.57.7 pinned tree](https://github.com/wevm/viem/tree/bd8e313490d6f788a5d6f93c76f55fed606d78b9); [hash implementation](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/account-abstraction/utils/userOperation/getUserOperationHash.ts); [hash tests](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/account-abstraction/utils/userOperation/getUserOperationHash.test.ts); [stub client](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/account-abstraction/actions/paymaster/getPaymasterStubData.ts); [final-data client](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/account-abstraction/actions/paymaster/getPaymasterData.ts); [authorization preparation](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/actions/wallet/prepareAuthorization.ts); [UserOperation wait](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/account-abstraction/actions/bundler/waitForUserOperationReceipt.ts); [MIT license](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/LICENSE). | Inspected named source and hash-test files; other client paths inventory-only. No execution. |
| U2 | [Account abstraction v0.7.0](https://github.com/eth-infinitism/account-abstraction/tree/7af70c8993a6f42973f520ae0752386a5032abe7); [EntryPoint](https://github.com/eth-infinitism/account-abstraction/blob/7af70c8993a6f42973f520ae0752386a5032abe7/contracts/core/EntryPoint.sol); [BasePaymaster](https://github.com/eth-infinitism/account-abstraction/blob/7af70c8993a6f42973f520ae0752386a5032abe7/contracts/core/BasePaymaster.sol); [license](https://github.com/eth-infinitism/account-abstraction/blob/7af70c8993a6f42973f520ae0752386a5032abe7/LICENSE); [current ERC-4337 specification](https://ercs.ethereum.org/ERCS/erc-4337). | Tag resolved through Git ref/tag objects; source headers and root license read. Current specification is conceptual context, not a v0.7 release artifact. |
| U3 | [ERC-7677 paymaster web-service capability](https://ercs.ethereum.org/ERCS/erc-7677). | Non-GitHub normative interface, stub/final split and v0.7 gas fields. Standard's CC0 notice; no server code imported. |
| U4 | [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702). | Non-GitHub normative authorization and persistent delegation semantics; CC0 notice. |
| U5 | [Permit2 pinned source](https://github.com/Uniswap/permit2/tree/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219); [SignatureTransfer](https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/src/SignatureTransfer.sol); [PermitHash](https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/src/libraries/PermitHash.sol); [SignatureVerification](https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/src/libraries/SignatureVerification.sol); [MIT license](https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/LICENSE). | Source, nonce/signature/intent constraints; no deployed-bytecode or target-chain qualification. |
| U6 | [Uniswap Permit2 overview](https://developers.uniswap.org/docs/protocols/permit2/overview). | Non-GitHub official operational documentation: initial token approval and two permission models. Documentation license not independently verified; cited/paraphrased only. |
| U7 | [Circle EIP3009 implementation](https://github.com/circlefin/stablecoin-evm/blob/fc85788bc7c23cefe3df1a757133048bfddadeaa/contracts/v2/EIP3009.sol); [FiatTokenV2_2](https://github.com/circlefin/stablecoin-evm/blob/fc85788bc7c23cefe3df1a757133048bfddadeaa/contracts/v2/FiatTokenV2_2.sol); [receive authorization tests](https://github.com/circlefin/stablecoin-evm/blob/fc85788bc7c23cefe3df1a757133048bfddadeaa/test/v2/GasAbstraction/testReceiveWithAuthorization.ts); [Apache-2.0 license](https://github.com/circlefin/stablecoin-evm/blob/fc85788bc7c23cefe3df1a757133048bfddadeaa/LICENSE). | Inspected source and test semantics, including contract-wallet fixture paths. No claim about a token deployed on a particular chain. |
| U8 | [ERC-3009 transfer with authorization](https://eips.ethereum.org/EIPS/eip-3009). | Non-GitHub normative transfer/receive, validity and nonce semantics; CC0 notice. |

This lane deliberately does not equate another forge with better provenance. Standards and official project documentation outside GitHub were used to test API semantics; reusable code pins above come from verified upstream source repositories. No equally qualified alternative AA or permit implementation was established on GitLab, Codeberg or SourceHut in this bounded follow-up. The broader non-GitHub discovery evidence is in the other handoff reports. Candidate-source license checks are not dependency-closure or legal reviews.

**Suggested execution order for Claude when the deferred lane is opened:** preserve PR #65/#69 ownership; correct the v0.7 BasePaymaster license note; add a versioned bundler port and conformance fixtures; implement the optional ERC-7677 adapter; qualify EIP-7702 lifecycle and recovery; only then select a real token/deployment requirement for Permit2 or ERC-3009. Keep the lean release and the policy account's destination/delay/cap invariants intact.
