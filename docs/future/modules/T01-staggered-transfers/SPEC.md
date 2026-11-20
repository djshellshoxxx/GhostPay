# T01 — User-controlled staggered transfers

| Field | Value |
| --- | --- |
| Module | T01 / staggered-transfers |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/t01-staggered-transfers |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Allow a user to divide a transfer into a bounded, explicitly reviewed series of sends with selected intervals and optional bounded jitter. The user sees exact amounts, destinations, costs and schedule before consenting and separately authorizes each due leg with fresh transaction data. Timing does not hide transparent-chain linkage; a closed browser performs no transfers.

1. User creates a 2–8-leg plan, checks the exact sum, destination/stealth allocation, interval bounds, invoice expiry and itemized maximum cost.
2. While the app remains active, a due leg becomes ready for review; the user checks fresh balance, nonce and fee quote, then explicitly signs that leg.
3. User cancels unsent legs or resumes an interrupted plan. Submitted/unknown legs are reconciled before any replacement; already sent funds are never treated as undone.

## 2. Provenance and source reuse

Primary source: [docs/remote/privacy-specs/amount-blurring.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/remote/privacy-specs/amount-blurring.md). Owner requirement: [issue #288 A/C](https://github.com/djshellshoxxx/GhostPay/issues/288); related P11 timing policy and existing local scheduling are reuse inputs. This future paid feature remains outside v1.0/v1.1 release gates.
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/amount-blur/src/split.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/amount-blur/src/split.ts) | planSplit, reviewPlan, remainingAfter, assertDistinctPartKeys | Reuse split accounting and distinct-key validation; UI execution/consent remains additional. |
| [packages/amount-blur/src/schedule.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/amount-blur/src/schedule.ts) | planSchedule | Reuse bounded interval planning; no scheduler is authorized to auto-sign. |
| [packages/ux-schedule/src/scheduled.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-schedule/src/scheduled.ts) | schedulePayment, tick, confirm, cancel | Reuse reminder/state semantics; confirmed reminder is not transaction finality. |
| [packages/privacy-pipeline/src/executor.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/executor.ts) | createExecutor, createRun, simulateWithDrivers | Reuse orchestration concepts only after review; any autoContinue must be disabled for fresh-per-leg consent. |
| [packages/amount-blur/DEVIATIONS.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/amount-blur/DEVIATIONS.md) | UI/scheduler and differential Anvil acceptance absent | Preserve testnet gates and report unqualified integration instead of assuming completeness. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P11](https://github.com/djshellshoxxx/GhostPay/blob/future/p11-metadata-timing-policy/docs/future/modules/P11-metadata-timing-policy/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md). Optional integrations: [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md), [T02](https://github.com/djshellshoxxx/GhostPay/blob/future/t02-intermediary-routing/docs/future/modules/T02-intermediary-routing/SPEC.md).
Proposed owned paths: apps/web/src/features/staggered-transfers/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own multi-leg user workflow, journal and consent reducer; P11 supplies pure timing policy, P05 encrypted storage, P06 signing and FEE01 exact fees. Optional P09/P10 select explicit gas/submission services. T02 composition needs its own reviewed plan and cost bound. Exclude unattended transfers, background/service-worker signing, plaintext keys, pre-signed queues, new anonymity claims and new fee rates.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface StaggeredLegV1 {
  index: number; destination: string; amountBase: string;
  ephemeralPublicKey: string; dueAfterPreviousConfirmationMs: number;
  maximumFeesByAsset: FeeQuoteV1["maximumTotalsByAsset"];
  state: "planned" | "waiting" | "ready" | "reviewed" |
    "submitted" | "outcome-unknown" | "confirmed" | "cancelled";
  intentDigest?: string; expectedTxHash?: string;
}
interface StaggeredPlanV1 {
  version: 1; planId: string; revision: number;
  chainId: number; asset: string; totalBase: string;
  invoiceDigest: string; expiresAtMs: number;
  maximumTotalsByAsset: FeeQuoteV1["maximumTotalsByAsset"];
  feeQuoteDigest: string;
  legs: readonly StaggeredLegV1[];
}
interface StaggeredService {
  plan(raw: unknown, ctx: OperationContext): Promise<ModuleResult<StaggeredPlanV1>>;
  reviewLeg(planId: string, index: number, ctx: OperationContext):
    Promise<ModuleResult<{ intentDigest: string }>>;
  submitReviewedLeg(intentDigest: string, ctx: OperationContext):
    Promise<ModuleResult<StaggeredPlanV1>>;
  cancelUnsent(planId: string, ctx: OperationContext): Promise<ModuleResult<StaggeredPlanV1>>;
}
~~~

Signed intent binds plan revision, leg index, chain, destination, ephemeral public key, exact amount, nonce, expiry and the exact per-asset fee caps. Sum actual leg values and existing protocol rounding; never silently increase total to fit a denomination. Any allowed rounding increase needs separate exact-amount consent. FeeQuoteV1 is the authoritative FEE01 type: maximumFeesByAsset limits one leg and maximumTotalsByAsset limits the entire plan. Each map key resolves to the same validated AssetRefV1 network and asset identity used in the quote; reject symbol-only, unknown or colliding identities.

Independent key recovery applies to payer-controlled sources and any self-controlled intermediate addresses before funding them. A merchant destination is a public output derived through the provider from the verified invoice, with a distinct address and ephemeral public key for each part; apply assertDistinctPartKeys before review. The payer never obtains the merchant spending key. Buyer ephemeral secrets discarded after public derivation are not recovery artifacts and must not be retained or requested for backup. Canonical spec18 governs the seller's discovered, cryptographically matched stealth-address recovery; it is not a prerequisite for the buyer to possess seller keys. Optional T02 intermediates additionally require T02's reviewed recovery-format extension for unannounced self-controlled keys.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

Planned legs wait unsigned. A timer may move waiting to ready but cannot open a signer or send. Browser sleep/reload makes overdue work review-required; time jumps never replay legs. Fresh user action prepares/signs only one leg. Persist the intent/expected transaction identity before broadcast; timeout becomes outcome-unknown. Lock or closure stops future work; recovery resumes from encrypted journal without signing automatically.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: STAGGER_PLAN_INVALID, STAGGER_NOT_DUE, STAGGER_REVIEW_STALE, STAGGER_TOTAL_MISMATCH, STAGGER_FEE_CAP, STAGGER_OUTCOME_UNKNOWN. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Leg count | 2–8, preserving amount-blur HARD_MAX_PARTS | Reject larger requests; no hidden subdivision. |
| Schedule | Proposed maximum 24 hours and always before invoice/deadline margin | Bound jitter with CSPRNG; no Math.random. |
| Pending plans | 16/profile; one signing operation at a time | Keep unknown legs locked against duplicate execution. |
| Plan input | 64 KiB; positive uint256 amounts | Check exact conservation and existing minimum-part bounds. |
| Fee freshness | Re-quote each leg; at most 60-second reviewed quote | Enforce remaining caps independently per network/asset; changed totals invalidate consent. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Chain observer | Truthful direct-transfer comparison and distinct destinations | Common source, amounts, timing and funding remain traceable. |
| Suspended/closed browser | Unsigned journal and explicit resume | Scheduled time is best effort; payment may be delayed. |
| Unknown submission | Expected hash/nonce journal and reconciliation | A provider outage may delay safe retry. |
| Cost amplification | Per-leg and plan-wide caps for each exact network/asset, including partial execution | Multiple transactions usually incur more gas and protocol rounding. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Issue #288 requires a separately disclosed optional feature charge but does not approve a price or recipient. FEE01 must define charge timing, partial completion, cancellations and refunds before paid execution. Preview all gas, per-leg protocol rounding, service charges and maximumTotalsByAsset for the whole plan, with each leg's allocation shown separately. Do not charge the full plan again on resume or duplicate confirmation. A missing approved model keeps paid execution unavailable.

FEE01 accounts for each exact network/asset independently: remaining authority is its accepted plan maximum minus prior validated fees/gas and any reserved unresolved liability in that same asset. A fresh quote must fit both the leg allocation and the remaining plan authority for every asset; changed quotes, cancellation and restart cannot reset spent costs or silently increase caps. Missing asset entries provide no authority. An ERC-20 transfer may incur token-denominated protocol/feature fees and native-asset gas: preserve two integer ledgers, cap each separately, and never subtract gas units from the token balance or sum their unlike base units. Display-only currency conversions do not authorize settlement or increase either cap.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| T01-AC01 | Two-to-eight-leg plans conserve the exact approved total and reject integer overflow or dust violations. |
| T01-AC02 | Jitter remains within user-selected bounds and cannot outlive invoice expiry. |
| T01-AC03 | Timers, hidden tabs, service workers and closed-browser recovery never sign or broadcast automatically. |
| T01-AC04 | Each leg requires fresh explicit review and signing after balance, nonce, chain and fees are revalidated. |
| T01-AC05 | Changing a leg, destination or fee total invalidates the prior plan consent. |
| T01-AC06 | Cancelling unsent legs does not erase submitted/unknown legs or claim funds returned. |
| T01-AC07 | Broadcast timeout prevents another signature until independent reconciliation. |
| T01-AC08 | Duplicate clicks, reload and account changes cannot double-send or accept stale callbacks. |
| T01-AC09 | Each network/asset's leg and plan caps deduct its prior actual costs and unresolved reservations; restart cannot reset them or reuse authority. |
| T01-AC10 | Recovery coverage is required for payer-controlled sources and funded self-controlled intermediates only; merchant destinations require public invoice derivation verification, and privacy text acknowledges public-chain traceability. |
| T01-AC11 | Browser sleep/clock changes mark overdue work for review without signing a backlog burst. |
| T01-AC12 | Existing testnet-only package gates remain intact until separately qualified deployment decisions. |
| T01-AC13 | A valid merchant invoice can produce all parts without seller spending keys or retained buyer ephemeral secrets; mutated derived destinations or repeated per-part ephemeral public keys fail before review. |
| T01-AC14 | An ERC-20 plan with token fees and native gas retains separate caps and prior-cost ledgers after partial execution/restart; exceeding either cap rejects even when the other has capacity, with no cross-asset netting. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Define plan/journal schemas and exact conservation fixtures using amount-blur; preserve all existing guards.
2. Connect pure P11 schedule policy to reminder-only UI; test sleep, clock change and closed-tab semantics.
3. Integrate FEE01 per-network/asset caps and per-leg consent digests; test rounding, drift, partial charges, ERC-20/native-gas separation and resume accounting.
4. Connect P05/P06 plus existing transaction verification; persist expected identity and test unknown outcomes/replay.
5. Add cancellation/recovery UI and independent key-export drills for self-controlled sources/intermediates; verify merchant public derivation, distinct per-part ephemeral public keys, absence of seller-key/ephemeral-secret backup demands and zero signatures while waiting.
6. Perform independent browser/chain simulation and privacy comparison; qualify any optional T02 composition separately.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/amount-blur/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/amount-blur/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/amount-blur
npm test -w @ghostpay/amount-blur -- --maxWorkers=1
npm run lint -w @ghostpay/amount-blur
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Use a new encrypted multi-leg namespace; existing single-delay reminders are not converted into send authority. Reconcile legacy experimental plans before import; raw signed payloads are refused. Rollback stops new plans and leaves submitted leg journals/recovery exports accessible through existing tools.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: feature price, recipient, fee enforcement, partial refund rules, supported assets/chains and permitted schedule horizon. Existing library fee constants are implementation references, not authorization of a new product price. No paid release is enabled by this spec.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
