# F18 — Editable privacy presets and capability selection

| Field | Value |
| --- | --- |
| Module | F18 / privacy-modes |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f18-privacy-modes |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Provide editable Standard, Enhanced, Shielded and Maximum presets that explain their actual capabilities, dependencies, costs and remaining disclosures. Users may independently disable nonessential modules. A preset proposes settings; it cannot invent capability evidence, grant paid consent or silently downgrade an active private-required operation.

1. User selects a preset and sees a proposed difference from current settings, including unavailable modules and reasons.
2. User edits individual toggles, reviews dependency/conflict explanations, costs and observers, then explicitly accepts the resulting configuration.
3. At action time the app re-evaluates capability health and quote freshness. Lost privacy requirements block or request a reviewed change; the label alone never authorizes execution.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/18-privacy-modes.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/18-privacy-modes.md). Issue [#284](https://github.com/djshellshoxxx/GhostPay/issues/284) adds Shielded and independently editable module toggles; presets are proposed bundles, not proof of protection.
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/privacy-profiles/src/catalogue.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-profiles/src/catalogue.ts) | OPTION_CATALOGUE, OPTION_GROUPS | Reuse descriptive data and maturity fields; map new canonical module IDs without parallel rule tables. |
| [packages/privacy-profiles/src/resolve.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-profiles/src/resolve.ts) | applyPreset, setOption, acknowledge | Existing applyPreset proposes downgrades; new UX must preview/accept rather than silently commit them. |
| [packages/privacy-profiles/src/evaluate.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-profiles/src/evaluate.ts) | evaluate, explain, honestLabel | Reuse explicit blockers, trust parties and remaining visibility; no numeric anonymity score. |
| [packages/privacy-pipeline/src/validate.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/validate.ts) | validate, projectToSelection | Reuse pipeline consistency checks; reconcile duplicated legacy rule data before adding another resolver. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P11](https://github.com/djshellshoxxx/GhostPay/blob/future/p11-metadata-timing-policy/docs/future/modules/P11-metadata-timing-policy/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md), [P18](https://github.com/djshellshoxxx/GhostPay/blob/future/p18-telemetry-release-integrity/docs/future/modules/P18-telemetry-release-integrity/SPEC.md). Optional integrations: [P01](https://github.com/djshellshoxxx/GhostPay/blob/future/p01-tor-onion-hosting/docs/future/modules/P01-tor-onion-hosting/SPEC.md), [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P03](https://github.com/djshellshoxxx/GhostPay/blob/future/p03-local-stealth-scanning/docs/future/modules/P03-local-stealth-scanning/SPEC.md), [P04](https://github.com/djshellshoxxx/GhostPay/blob/future/p04-encrypted-offline-invoices/docs/future/modules/P04-encrypted-offline-invoices/SPEC.md), [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P07](https://github.com/djshellshoxxx/GhostPay/blob/future/p07-encrypted-device-sync/docs/future/modules/P07-encrypted-device-sync/SPEC.md), [P08](https://github.com/djshellshoxxx/GhostPay/blob/future/p08-linkability-analysis/docs/future/modules/P08-linkability-analysis/SPEC.md), [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md), [P12](https://github.com/djshellshoxxx/GhostPay/blob/future/p12-selective-disclosure-proofs/docs/future/modules/P12-selective-disclosure-proofs/SPEC.md), [P13](https://github.com/djshellshoxxx/GhostPay/blob/future/p13-confidential-amounts/docs/future/modules/P13-confidential-amounts/SPEC.md), [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md), [P15](https://github.com/djshellshoxxx/GhostPay/blob/future/p15-anonymous-withdrawals/docs/future/modules/P15-anonymous-withdrawals/SPEC.md), [P16](https://github.com/djshellshoxxx/GhostPay/blob/future/p16-shielded-cross-chain/docs/future/modules/P16-shielded-cross-chain/SPEC.md), [P17](https://github.com/djshellshoxxx/GhostPay/blob/future/p17-private-fee-outputs/docs/future/modules/P17-private-fee-outputs/SPEC.md), [P19](https://github.com/djshellshoxxx/GhostPay/blob/future/p19-optional-fee-gateway/docs/future/modules/P19-optional-fee-gateway/SPEC.md), [T01](https://github.com/djshellshoxxx/GhostPay/blob/future/t01-staggered-transfers/docs/future/modules/T01-staggered-transfers/SPEC.md), [T02](https://github.com/djshellshoxxx/GhostPay/blob/future/t02-intermediary-routing/docs/future/modules/T02-intermediary-routing/SPEC.md).
Proposed owned paths: apps/web/src/features/privacy-modes/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own preset selection, configuration-review reducer and capability/fee presentation. P11 provides minimization/timing policies, FEE01 quotes and P18 integrity/no-telemetry controls. All optional module descriptors are declarative and statically reviewed; they cannot load arbitrary code. Exclude protocol implementation, automatic feature purchase, hidden fallback and claims that Maximum is presently qualified.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface PrivacySelectionV1 {
  version: 1; revision: number;
  preset: "standard" | "enhanced" | "shielded" | "maximum" | "custom";
  enabledModuleIds: readonly string[];
  requiredModuleIds: readonly string[];
  descriptorSetDigest: string; acknowledgedDisclosureDigests: readonly string[];
}
// Consumer-derived evaluation; these are not extra CapabilityDescriptorV1 fields.
interface CapabilityEvaluationV1 {
  version: 1; moduleId: string; descriptorDigest: string;
  evidence: CapabilityDescriptorV1["evidence"];
  supportedInContext: boolean;
  registryMaturity: "existing" | "poc" | "spike-gated" | "experimental" |
    "test-only" | "stub" | "watch" | "unknown";
  availability: "untested" | "available" | "unavailable" | "stale";
  observationContextDigest: string; observedAtMs?: number;
  reasons: readonly string[];
}
interface SelectionReviewV1 {
  version: 1; proposed: PrivacySelectionV1;
  evaluatedCapabilities: readonly CapabilityEvaluationV1[];
  unavailable: readonly string[]; dependencyChanges: readonly string[];
  disclosures: readonly string[]; quoteDigest?: string;
  qualification: "unqualified" | "partially-qualified" | "qualified-for-context";
}
interface PrivacySelectionService {
  propose(preset: string, ctx: OperationContext): Promise<ModuleResult<SelectionReviewV1>>;
  setModule(id: string, enabled: boolean, ctx: OperationContext):
    Promise<ModuleResult<SelectionReviewV1>>;
  commit(reviewDigest: string, expectedRevision: number,
    ctx: OperationContext): Promise<ModuleResult<PrivacySelectionV1>>;
}
~~~

Consume CapabilityDescriptorV1 exactly as defined in COMMON: schema, moduleId, implementationVersion, evidence, chainsAndAssets, requires, optionalPorts, limits, reveals and optional qualificationRef. It does not define availability, support or maturity fields. F18 derives a separate CapabilityEvaluationV1: descriptor/qualification evidence supplies historical qualification, descriptor chainsAndAssets plus validated current chain/asset/dependency context determine support, the reviewed registry/legacy catalogue supplies maturity, and already-consented live provider observations determine runtime availability. Missing registry maturity stays unknown; no network probe is created merely to fill this view.

A qualified descriptor can currently be unavailable, and a reachable fixture-only provider remains unqualified. Untested or stale observations cannot be upgraded to available from evidence alone. Observation context binds endpoint/policy revision, session epoch, browser, network and asset and is invalidated when those change. Derived evaluation records are display/decision inputs, not authority to alter descriptors or grant network/spend consent. Descriptor IDs are stable; archived 5a–5l labels map through the registry without activating duplicate modules. Qualification binds browser, chain, asset, provider, build and evidence revision; no global boolean can certify all contexts. Paid quote acknowledgement and privacy acknowledgement are distinct records.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

States: current, editing, evaluating, review-required, accepted, blocked or stale. Setting changes create a draft and never alter an in-flight transaction plan. Dependency removal identifies affected choices and requests review; it cannot silently re-enable a disabled paid feature. Legacy resolver downgrades remain proposals. Descriptor/fee/context changes invalidate the pending review digest and action-time authorization.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: PRESET_UNKNOWN, PRESET_DEPENDENCY_CONFLICT, PRESET_CAPABILITY_UNAVAILABLE, PRESET_REVIEW_STALE, PRESET_FEE_UNQUOTED, PRESET_EVIDENCE_INCOMPLETE. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Descriptor set | 64 modules; 256 dependency edges | Reject cycles/unknown critical fields before evaluation. |
| Selection export | 64 KiB canonical JSON; no credentials | Bound input and reference encrypted provider records only. |
| Evaluation | 50 ms pure-rule target on baseline device | Benchmark later; bounded operation count and cancellable provider checks. |
| Remote work | Zero automatic discovery from toggles | Provider tests require separate consent. |
| Saved variants | 16 encrypted custom presets/profile | Explicit replace/export beyond the limit. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Misleading preset name | Display actual qualification and unresolved evidence | Maximum cannot guarantee anonymity. |
| Silent dependency downgrade | Show exact delta and require new acceptance | User may choose weaker settings knowingly. |
| Malicious descriptor | Statically reviewed schema and integrity-bound catalogue | A compromised delivered application remains dangerous. |
| Fee bundling | Independent line items and separate consent | External provider pricing may change after review. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

FEE01 itemizes applicable modules, overlapping discounts/bundles, gas and external charges. Toggling local privacy settings never causes an automatic payment. A preset cannot grant consent on behalf of a user or hide paid alternatives. Missing approved fee policy marks the paid capability unavailable while free/local settings remain usable.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F18-AC01 | Presets resolve deterministically and display every difference before committing. |
| F18-AC02 | Disabling a nonessential module stays disabled after recalculation. |
| F18-AC03 | Missing dependencies are explained without automatically purchasing or activating them. |
| F18-AC04 | Existing applyPreset downgrade results never silently replace private-required settings. |
| F18-AC05 | Research/stub capabilities cannot be advertised as available or qualified by a preset. |
| F18-AC06 | Maximum is labeled unqualified unless exact-context end-to-end evidence exists. |
| F18-AC07 | Price/recipient/context changes invalidate the review and require fresh acceptance. |
| F18-AC08 | No module toggle emits endpoint requests without separate network consent. |
| F18-AC09 | In-flight transaction plans retain their original approved configuration. |
| F18-AC10 | Keyboard and screen-reader users can inspect dependency errors, remaining visibility and itemized fees. |
| F18-AC11 | A qualified descriptor with unavailable or stale live observations retains its evidence label but cannot authorize execution; no invented availability field is read from CapabilityDescriptorV1. |
| F18-AC12 | A reachable fixture-only provider remains unqualified, unsupported chain/asset context stays blocked, and absent maturity/observations remain unknown/untested without automatic network probes. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Reconcile catalogue/pipeline rule ownership and map stable IDs; derive CapabilityEvaluationV1 from the unchanged shared descriptor, reviewed registry and consented observations. Test aliases, cycles, unknown metadata and evidence-versus-availability separation.
2. Build pure draft/review/commit reducer with deterministic config digests; test disabled-module persistence.
3. Integrate P11/FEE01/P18 ports; test unpaid local settings, unquoted paid modules and evidence limits.
4. Implement editable presets and accessible dependency/disclosure UI; test no-silent-downgrade semantics.
5. Run combined configuration matrix and independent privacy-copy review; collect actual Maximum evidence separately.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/privacy-profiles/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-profiles/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/privacy-profiles
npm test -w @ghostpay/privacy-profiles -- --maxWorkers=1
npm run lint -w @ghostpay/privacy-profiles
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Import old Standard/Enhanced/Maximum preferences as unqualified draft selections, preserving existing strict requirements. Do not reinterpret old Maximum as approval of Shielded or paid modules. Rollback restores a known compatible local selection; otherwise block affected operations and preserve exportable settings.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: final preset memberships, supported context matrix, evidence expiry policy and which requirements may permit explicit downgrade. Shielded and Maximum remain unavailable for unsupported or unreviewed protocols; no label substitutes for qualification.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
