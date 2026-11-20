# F12 — GhostBridge optional P2P-Offramp handoff

| Field | Value |
| --- | --- |
| Module | F12 / ghostbridge |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f12-ghostbridge |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Connect GhostPay and an optional P2P-Offramp workflow through explicit signed handoffs while keeping both products independent. External escrow state, fiat claims and GhostPay invoice settlement remain distinct. An on-chain payment does not prove fiat finality; partner status cannot authorize GhostPay to spend.

1. User selects acquire or convert and reviews the exact partner, asset, network, amount limits, terms and fields to disclose.
2. User exports an encrypted handoff or explicitly opens the selected external origin; the trade runs under its own acceptance rules.
3. Returned evidence is imported and verified locally; GhostPay independently checks its own payment before updating that separate status.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/12-ghostbridge.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/12-ghostbridge.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/sdk/src/builder.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/sdk/src/builder.ts) | encodeInvoiceLink, parseInvoiceLink | Reuse invoice exchange; define a separate bridge domain and envelope. |
| [packages/sdk/src/verify.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/sdk/src/verify.ts) | verifyInvoice, verifyFragment | Reuse invoice verification; neither verifies a bank transfer. |
| [packages/invoice-schema/src/sign.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/sign.ts) | canonicalInvoiceBytes, verifyInvoiceSignature | Preserve canonical signing conventions; invoice signatures are not trade authority. |
| [packages/sdk/src/merchant.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/sdk/src/merchant.ts) | createMerchantApi | Existing optional remote API is not a mandatory bridge backend. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P04](https://github.com/djshellshoxxx/GhostPay/blob/future/p04-encrypted-offline-invoices/docs/future/modules/P04-encrypted-offline-invoices/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md). Optional integrations: [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md).
Proposed owned paths: apps/web/src/features/ghostbridge/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own envelope validation, dual-status reducer, disclosure UI and selected-origin navigation. P04 owns invoices and encryption; P06 owns signatures. Inject existing encrypted persistence, never a bridge-specific vault. Exclude brokerage, escrow control, dispute decisions, automatic fiat transfer and shared view/spend keys. File exchange must remain usable without a partner browser adapter.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface BridgeIntentV1 {
  version: 1; domain: "GhostPay.GhostBridge.Intent.v1";
  intentId: string; action: "acquire" | "convert";
  invoiceCommitment: string; chainId: number; asset: string;
  maximumCryptoBase: string; partnerProtocol: string;
  expiresAtMs: number; nonce: string; disclosureDigest: string;
  issuerFingerprint: string; signature: string;
}
interface BridgeEvidenceV1 {
  version: 1; intentId: string; evidenceId: string;
  partnerProtocol: string;
  tradeState: "quoted" | "crypto-escrowed" | "fiat-claimed" |
    "escrow-released" | "disputed";
  publicTxHashes: readonly string[]; signature: string;
}
interface BridgeService {
  preview(raw: unknown, ctx: OperationContext): Promise<ModuleResult<BridgeIntentV1>>;
  exportIntent(digest: string, ctx: OperationContext): Promise<ModuleResult<Uint8Array>>;
  importEvidence(raw: unknown, ctx: OperationContext): Promise<ModuleResult<BridgeEvidenceV1>>;
}
~~~

A disclosure digest binds exactly what the user released; new fields require renewed review. Use random handoff IDs instead of global customer identifiers. Callback origins, nonce and response type are explicitly selected and schema checked. Unsupported partner protocol versions fail closed. No arbitrary return URL, executable attachment or script supplied by the partner may run.

The separate fiat-confirmed-by-user state can only be created by an explicit local user acknowledgement bound to this intent and selected evidence. It is not an accepted BridgeEvidenceV1 wire value: imported partner data cannot manufacture local confirmation. Retain the acknowledgement as an encrypted, actor-labeled local record. Even this user assertion does not establish bank finality or independently verify GhostPay invoice settlement.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

Lifecycle: draft, reviewed, exported, external-pending, evidence-received, independently-checked, completed, cancelled or disputed. Store partner trade status and GhostPay payment status independently. Duplicate evidence IDs are idempotent; conflicting evidence becomes disputed. Cancellation cannot cancel an accepted external escrow. Restore preserves intent digest, partner version and unresolved evidence; never create a replacement trade on an unknown outcome.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: BRIDGE_PROTOCOL_UNSUPPORTED, BRIDGE_INTENT_EXPIRED, BRIDGE_DISCLOSURE_CHANGED, BRIDGE_EVIDENCE_CONFLICT, BRIDGE_WRONG_CHAIN. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Handoff | 32 KiB decoded; maximum 24-hour validity | Bound before parse and reject duplicate/critical fields. |
| Evidence | 64 KiB; 16 transaction references | Large attachments require a separate explicit path. |
| Active intents | 64/profile | Require explicit archival; retain unresolved trades. |
| Verification | 30-second attempt; one selected origin | Timeout yields unknown; no background polling or fallback. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Partner/counterparty | Minimal field preview and exact signed intent | Selected trade amount and voluntary identity disclosures. |
| Fiat service | Separate user approval and status vocabulary | Bank records and reversibility remain. |
| Forged partner evidence | Version/signature checks plus own-chain verification | Off-chain partner assertions still require trust. |
| Callback substitution | Exact origin, nonce and bounded schema | Selected external site controls its own UI. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Itemize external spread, escrow fees, gas, existing protocol fees and any separately approved add-on. Opening a handoff or importing evidence is not approval to trade. An indicative rate never authorizes conversion; both external and GhostPay transactions require their own consent.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F12-AC01 | Disabled bridge performs zero partner requests on app launch or invoice import. |
| F12-AC02 | Wrong domain, altered asset and wrong chain are rejected before navigation. |
| F12-AC03 | Expanded disclosure invalidates approval and demands a fresh preview. |
| F12-AC04 | Replayed evidence cannot create another trade or duplicate payment. |
| F12-AC05 | A signed fiat-claimed event cannot mark fiat final or a GhostPay invoice paid. |
| F12-AC06 | Partner outage leaves intent recoverable by file export/import. |
| F12-AC07 | Account change suppresses late verification and clears private trade rows. |
| F12-AC08 | Cancelled local intents retain external obligations and unresolved status. |
| F12-AC09 | Redirect attacks, oversized envelopes and conflicting evidence cause no key leakage. |
| F12-AC10 | Compatibility fixtures pin both products and reject unknown protocol versions. |
| F12-AC11 | Imported evidence claiming local fiat confirmation is rejected; only a fresh explicit local acknowledgement can create that separate state, without implying bank finality. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Pin a supported partner protocol and independent signed fixtures; define rejection behavior before any network work.
2. Implement dual-status reducer; test disagreement, replay, reorg and cancellation limits.
3. Connect P04/P06 and injected persistence; verify no key-bearing handoff data.
4. Add file-first exchange and selected-origin navigation; test origin/nonce binding and disclosure changes.
5. Build explicit fee/status UI and a cross-product recovery drill; independently review settlement claims.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/sdk/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/sdk/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/sdk
npm test -w @ghostpay/sdk -- --maxWorkers=1
npm run lint -w @ghostpay/sdk
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Start disabled with no partner endpoints. New bridge intents occupy a versioned namespace; ordinary invoices are never migrated into trades automatically. Rollback disables new handoffs and refresh while retaining exportable evidence and independent payment recovery.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: partner versions and origins, accepted evidence categories, supported assets/chains, external disclosure fields and any paid service. Partner compatibility and fiat qualification remain unverified until both exact revisions are tested.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
