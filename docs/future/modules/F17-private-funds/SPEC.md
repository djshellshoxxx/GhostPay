# F17 — Private sweeping and offline fund management

| Field | Value |
| --- | --- |
| Module | F17 / private-funds |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f17-private-funds |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Give users a safe, explicit workflow for reviewing received funds, choosing a destination and signing a sweep locally or offline. Watch-only discovery remains separate from spending authority. The user can export independent recovery material and resume uncertain operations without relying on a GhostPay server or silently sending a second transaction.

1. User unlocks a watch-only view, selects verified received funds and reviews destination reuse, consolidation and gas-funding consequences.
2. User approves exact chain, asset, amount, destination, nonce and fee bounds, then invokes an approved scoped signer or exports an offline signing request.
3. After submission the local journal reconciles hashes, receipts and replacements. A locked or disconnected browser retains recoverable evidence without automatically resubmitting.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/17-private-funds.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/17-private-funds.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [apps/web/src/lib/sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts) | deriveVerifiedSweepKey, directSweep, relayedSweep | Reuse verified key derivation and established sweep paths; offline orchestration must preserve transaction guards. |
| [apps/web/src/lib/sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts) | reconcileSweepLock, isUnresolvedAttempt | Reuse unknown-outcome/replacement semantics instead of treating every exception as failure. |
| [apps/web/src/lib/sweepAttemptJournal.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweepAttemptJournal.ts) | writeSweepAttempt, readSweepAttempts, MAX_SWEEP_ATTEMPTS | Reuse bounded pre-submit attempt record; encrypted future integration must preserve existing pending locks. |
| [packages/tx-review/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/tx-review/src/index.ts) | review, assertReviewed, decodeTx, decodeTypedData | Reuse exact transaction intent comparison for all signer paths. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P08](https://github.com/djshellshoxxx/GhostPay/blob/future/p08-linkability-analysis/docs/future/modules/P08-linkability-analysis/SPEC.md). Optional integrations: [P03](https://github.com/djshellshoxxx/GhostPay/blob/future/p03-local-stealth-scanning/docs/future/modules/P03-local-stealth-scanning/SPEC.md), [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md), [T02](https://github.com/djshellshoxxx/GhostPay/blob/future/t02-intermediary-routing/docs/future/modules/T02-intermediary-routing/SPEC.md).
Proposed owned paths: apps/web/src/features/private-funds/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own fund-management UI, offline request/result envelope and orchestration reducer. P05 stores encrypted state, P06 provides signer roles, P08 computes local linkability. Optional scan, relayer and submission adapters remain independently chosen. Exclude hosted signing, arbitrary transaction import, auto-consolidation, hidden relayer fallback, guardian recovery and new cryptography.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface FundFeeCapV1 {
  asset: AssetRefV1; maximumBase: DecimalUnits;
}
interface FundActionV1 {
  version: 1; actionId: string; sourceRecordId: string;
  chainId: number; asset: string; destination: string;
  amountBase: string; maximumFeesByAsset: readonly FundFeeCapV1[];
  nonce: string;
  expiresAtMs: number; intentDigest: string;
  sourceEvidenceDigest: string; disclosureDigest: string;
}
interface OfflineSignRequestV1 {
  version: 1; action: FundActionV1;
  signerFingerprint: string; requestNonce: string;
}
interface FundJournalV1 {
  version: 1; actionId: string; revision: number;
  status: "reviewed" | "awaiting-signature" | "submitted" |
    "outcome-unknown" | "confirmed" | "replaced" | "cancelled";
  expectedTxHash?: string; observedTxHashes: readonly string[];
}
interface FundService {
  prepare(raw: unknown, ctx: OperationContext): Promise<ModuleResult<FundActionV1>>;
  acceptSigned(raw: unknown, ctx: OperationContext): Promise<ModuleResult<FundJournalV1>>;
  reconcile(actionId: string, ctx: OperationContext): Promise<ModuleResult<FundJournalV1>>;
}
~~~

The offline signer verifies the full decoded transaction against intentDigest and chain metadata; a signature alone is not sufficient. Returned signed data is accepted only for the exact pending request and then handled according to the submission policy, never retained as a scheduler queue. Keys are handled through P06; intended recovery exports follow canonical spec 18 rather than a second export format.

maximumFeesByAsset binds a separate cap to each exact network and asset identity from COMMON's AssetRefV1, never to a token symbol or decimal count. The complete canonical cap set is part of intentDigest; reject duplicate identities, omitted chargeable assets and changed caps. Native-asset gas and transfer-token or service fees remain separately itemized and are summed only within the same exact asset. When FEE01 is used, these caps map one-to-one to the accepted quote's maximumTotalsByAsset and may not exceed its authorized maxima. An optional fiat display cannot replace or combine these settlement caps.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

States include discovered-unverified, verified, reviewed, awaiting-signature, submitted, outcome-unknown, confirmed, replaced and cancelled. Revalidate evidence and fees before signing. Persist the attempt intent/expected hash before broadcast so a network timeout remains reconcilable. A duplicate click or stale offline response cannot create a second attempt. Reorged receipts return to unresolved status, not paid/final.
Reconciliation journals validated incurred costs in their original network/asset units, including spent gas, and subtracts them only from the matching authorized cap before a reviewed replacement or continuation of that action. Reload or replacement cannot reset prior costs. Unknown outcomes retain unresolved fee reservations; unavailable evidence cannot be treated as zero cost or free cap capacity.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: FUNDS_SOURCE_UNVERIFIED, FUNDS_DESTINATION_MISMATCH, FUNDS_SIGNER_MISMATCH, FUNDS_REQUEST_STALE, FUNDS_OUTCOME_UNKNOWN, FUNDS_RECOVERY_UNVERIFIED. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Concurrent spending | One unresolved attempt per chain/source | Reconcile before another signature or replacement. |
| Journal | Preserve current 64-attempt limit; 3 alternate hashes/attempt | Never evict an unresolved financial record. |
| Offline envelope | 64 KiB; one action and one transaction | Refuse extra transactions, unknown fields and oversized signatures. |
| Review expiry | At most 5 minutes before fresh preparation | Actual transaction/provider deadline may be stricter. |
| Fee-cap set | At most 8 distinct exact network/asset identities | Reject duplicate identities and any chargeable asset without its own cap. |
| Read budget | 4 concurrent selected-provider reads; 30-second attempt | Failure yields unknown rather than assumed unspent. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Destination substitution | Decode and compare complete intent on signer and receiver | User-selected destination may itself be linked. |
| Common exit/gas funder | P08 review before signing | Transparent transaction graphs remain traceable. |
| Relayer | Exact scoped order and selected endpoint | Destination, amount, timing and provider IP can remain visible. |
| Unknown outcome | Persist expected hash/nonce and reconcile | Unavailable chain evidence may delay safe retry. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Show direct gas, relayer reimbursement, protocol fees and optional module charges independently. No relayer is selected because a direct attempt failed. An unavailable fee quote blocks that path but cannot block exporting keys or recovering with independently supported tools. Fees are consented per exact signed action.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F17-AC01 | Watch-only mode never invokes a spending secret callback. |
| F17-AC02 | Unverified announcement data cannot become a spendable balance without independent evidence. |
| F17-AC03 | Modified offline destination, amount, nonce or chain is rejected before broadcast. |
| F17-AC04 | Duplicate clicks and replayed offline responses cannot produce duplicate submissions. |
| F17-AC05 | Broadcast timeout preserves an outcome-unknown journal and forbids blind re-signing. |
| F17-AC06 | Account switch or lock suppresses stale signing/reconciliation UI results. |
| F17-AC07 | Reorged receipts lose final status while preserving recoverable transaction evidence. |
| F17-AC08 | Partial failures preserve unrelated funds and unresolved source locks. |
| F17-AC09 | Independent spec18 export recovers the selected payment key without a GhostPay server. |
| F17-AC10 | No private key, invoice alias or full fund history appears in RPC/log/notification payloads. |
| F17-AC11 | An ERC-20 sweep with native-asset gas and token-denominated service fees enforces distinct approved caps; altered or missing caps reject, and reconciliation/reload preserves incurred costs and unresolved reservations in their own assets without cross-asset summation or cap reset. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Map existing Sweep and journal invariants to the new action reducer; add deterministic unknown/replacement fixtures.
2. Define bounded offline request/result schemas and integrate tx-review; test exact-intent substitution and replay.
3. Wire P05/P06/P08 provider ports and scoped signing; verify watch-only and lock boundaries.
4. Build recovery, fee and disclosure screens; test interrupted direct/relayed/offline paths without auto fallback.
5. Run independent key-export recovery and browser transaction-lifecycle review before enabling the workflow.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/tx-review/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/tx-review/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/tx-review
npm test -w @ghostpay/tx-review -- --maxWorkers=1
npm run lint -w @ghostpay/tx-review
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Additive migration imports existing unresolved attempt records without changing their nonce/hash or removing locks. Preserve legacy recovery formats and invoice verification. Rollback disables new workflow creation while retaining existing Sweep, encrypted exports and pending-transaction reconciliation.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: supported offline/hardware signer formats, per-asset recovery qualification and optional relayer providers. Separate fee/privacy decisions remain unresolved. Recovery must not require guardians, operator availability or a paid feature.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
