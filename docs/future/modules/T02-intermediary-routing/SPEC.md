# T02 — Self-controlled intermediary-address routing

| Field | Value |
| --- | --- |
| Module | T02 / intermediary-routing |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/t02-intermediary-routing |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Offer an explicitly selected, bounded route through self-controlled intermediate addresses while keeping every funded self-controlled address independently recoverable. The user sees all hops, estimated gas, protocol/service fees and public linkability before authorizing. This module provides controlled routing and recovery, not anonymity or a custodial intermediary.

1. User chooses a route, reviews every address and cost, then verifies encrypted independent recovery material for all intermediate keys before funds enter the route.
2. After each previous leg confirms, the next leg receives fresh review of balance, nonce, destination and fee bounds and requires explicit user authorization.
3. If cancelled, interrupted or unavailable, the UI identifies the last known funded address and provides independent key recovery plus reconciliation without requiring the selected relayer.

## 2. Provenance and source reuse

Primary source: [docs/remote/privacy-specs/hops.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/remote/privacy-specs/hops.md). Owner requirement: [issue #288 B/C](https://github.com/djshellshoxxx/GhostPay/issues/288). Existing experimental hop code must be reused selectively and independently qualified; forwarding does not make public EVM transfers unlinkable.
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/hops/src/plan.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hops/src/plan.ts) | planHops, validatePlan, previewCost, fingerprintReport | Reuse bounded plan/cost logic; defaultHops must not automatically enable routing. |
| [packages/hops/src/execute.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hops/src/execute.ts) | runHopLeg, resumeLeg, resumePlan | Reuse explicit leg execution/reconciliation after reviewing session authorization and unknown-outcome gaps. |
| [packages/hops/src/store.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hops/src/store.ts) | serializePlan, parsePlan, createSealedPlanStore, assertNoPresign | Reuse canonical sealed journals with no persisted signatures. |
| [packages/hygiene/src/hop-source.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hygiene/src/hop-source.ts) | createHopAddressSource | Reuse scoped withSecretAt allocator through P06; addresses are never announced, so recovery needs a separately reviewed provider format extension. |
| [packages/hops/DEVIATIONS.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hops/DEVIATIONS.md) | Direct execution unsupported; Anvil acceptance not built | Do not infer production support or a working direct fallback from plan validation. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P08](https://github.com/djshellshoxxx/GhostPay/blob/future/p08-linkability-analysis/docs/future/modules/P08-linkability-analysis/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md). Optional integrations: [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md).
Proposed owned paths: apps/web/src/features/intermediary-routing/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own route preview, recovery gate, explicit per-leg consent and funding-state UI. P05 persists encrypted state, P06 owns address/key allocation, P08 supplies truthful linkability and FEE01 quotes. A separately reviewed P05/P06 recovery-format extension for unannounced self-controlled keys is a hard prerequisite to funding routes, not a change to canonical spec18. Optional P09/P10 services cannot become mandatory for recovery. Exclude pooled custody, new derivation cryptography, hidden extra hops, guardians, automatic rerouting and transparent-chain anonymity claims.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface RecoveryCoverageV1 {
  version: 1; routeId: string; routeRevision: number; network: string;
  addressFingerprints: readonly string[]; exportFormatId: string;
  verifiedAtMs: number; derivationEvidenceDigest: string;
  independentRestoreEvidenceDigest: string;
}
interface RoutedLegV1 {
  index: number; from: string; to: string;
  sourceKeyRef: string; expectedAmountBase: string;
  maximumFeesByAsset: FeeQuoteV1["maximumTotalsByAsset"];
  intentDigest?: string;
  state: "planned" | "recovery-ready" | "reviewed" |
    "submitted" | "outcome-unknown" | "confirmed" | "cancelled";
  expectedTxHash?: string;
}
interface IntermediaryRouteV1 {
  version: 1; routeId: string; revision: number;
  chainId: number; asset: string; legs: readonly RoutedLegV1[];
  recoveryCoverageDigest: string; feeQuoteDigest: string;
  maximumTotalsByAsset: FeeQuoteV1["maximumTotalsByAsset"];
  disclosureDigest: string;
}
interface RoutingService {
  prepare(raw: unknown, ctx: OperationContext): Promise<ModuleResult<IntermediaryRouteV1>>;
  verifyRecovery(raw: unknown, ctx: OperationContext): Promise<ModuleResult<RecoveryCoverageV1>>;
  reviewLeg(routeId: string, index: number, ctx: OperationContext):
    Promise<ModuleResult<{ intentDigest: string }>>;
  reconcile(routeId: string, ctx: OperationContext): Promise<ModuleResult<IntermediaryRouteV1>>;
}
~~~

sourceKeyRef identifies a P06-managed key, not serializable secret material. RecoveryCoverage binds the exact route revision, network, self-controlled address set, authenticated backup and independent restore evidence; a download click alone is insufficient. verifiedAtMs is UTC epoch milliseconds. Merchant final destinations require verified public invoice derivation and never payer access to the merchant spending key.

createHopAddressSource produces never-announced self-controlled addresses. Canonical spec18 requires discovered, cryptographically matched announcements for its payment-key exports and therefore does not already cover these intermediates. P05/P06 must separately specify, review and qualify a versioned recovery-format extension with distinct format identification and authenticated key-origin metadata. Do not invent announcement locators or relabel unannounced records as canonical spec18 payment exports; spec18 and its beta priority remain unchanged.

The extension must contain enough encrypted material for independent reconstruction: either the derived private/public keypair or all required secret material and documented derivation scheme/version, parameters, index/path and context. Bind the expected public key/address and exact network to the authenticated record. An independent offline restore must derive the public address from the recovered key and compare it with the route before coverage is accepted; public fingerprints or a seed reference without its necessary reconstruction material are insufficient. Keep secrets in provider-scoped export/import operations, not the public coverage record. Missing, unsupported or mismatched coverage for any funded self-controlled source/intermediate blocks funding.

FeeQuoteV1 is the authoritative FEE01 type: maximumFeesByAsset limits one leg and maximumTotalsByAsset limits the entire route. Map keys must resolve to the same validated AssetRefV1 network and asset identities as the quote; reject symbol-only, unknown or colliding identities. Keep native gas and token-denominated costs distinct.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

Route states: drafted, recovery-unverified, recovery-ready, reviewed, active, interrupted or complete. Each leg is unsigned until due, current and explicitly reviewed. Persist nonce/expected hash before broadcast; an unknown outcome locks that leg and downstream routing. Cancellation stops future legs, not prior transactions. Resume identifies the last confirmed funded address and separately reconciles all uncertain transfers before proposing any spend.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: ROUTE_RECOVERY_INCOMPLETE, ROUTE_RECOVERY_FORMAT_UNAVAILABLE, ROUTE_ADDRESS_REUSED, ROUTE_LEG_NOT_READY, ROUTE_FEE_CAP, ROUTE_OUTCOME_UNKNOWN, ROUTE_DIRECT_UNSUPPORTED. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Forwarding legs | 1–4 existing package limit; at most 3 intermediate addresses plus final destination | Show leg count distinctly from intermediate-address count. |
| Active routes | 8/profile; one unresolved leg per route | No parallel conflicting spends from the same source. |
| Plan/export metadata | 128 KiB plus bounded provider recovery envelope | Reject raw signed queues and unexpected secret fields. |
| Recovery verification | Every self-controlled source/intermediate before route funding | Atomic, revision-bound coverage; merchant destination uses public derivation verification, not payer key recovery. |
| Quotes | Fresh per leg; reviewed for at most 60 seconds | Deduct prior actual costs and unresolved reservations per exact network/asset; never reset caps after restart. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Known-source chain tracer | Display complete public graph and comparison to direct payment | Forwarding remains traceable even with delays/fresh addresses. |
| Lost intermediate key | Verified independent export before funding | Lost all copies/passwords cannot be repaired by publisher. |
| Relayer outage/censorship | User retains keys and separate recovery path | Existing direct hop execution is not implemented and must not be promised. |
| Cost/amount erosion | Exact leg-by-leg amount ladder and cumulative caps per network/asset | Multiple fees/gas can consume small balances. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Issue #288 requests a distinct optional routing charge but leaves rates, recipient and enforcement undecided. Quote feature cost separately from per-leg gas, existing fees and external relayer reimbursement. Preserve current policy and disclose incompatible routes. Existing experimental MAX_LEG_FEE_BPS/default caps are safeguards, not approved new prices. Cancellation/recovery cannot force additional paid hops.

Before initial funding, FEE01 supplies maximumTotalsByAsset for the entire route and separate current-leg allocations. Remaining authority for each exact network/asset equals its accepted route cap minus prior validated fees/gas and reserved unresolved liabilities in that asset; a new leg must fit both its allocation and every remaining route cap. Missing asset entries provide no authority. Re-quoting, interruption, gas top-ups or restart never erase prior costs or raise approved caps. For ERC-20 routing, token-denominated fees and native-asset gas remain separate ledgers at every intermediate: validate gas funding separately and never net unlike units. A deficient native gas cap blocks the leg even when the token-fee cap has capacity, and vice versa; optional display conversions cannot alter settlement authority.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| T02-AC01 | Routing remains disabled unless explicitly selected; existing defaultHops cannot turn it on. |
| T02-AC02 | Preview counts every intermediate and forwarding leg and rejects hidden destinations. |
| T02-AC03 | Funding is blocked until every self-controlled source/intermediate has revision-bound independent recovery coverage; a merchant final destination requires public verification, never its spending key. |
| T02-AC04 | The reviewed unannounced-key extension restores expected public keys/addresses on the exact network using an independent offline verifier; missing derivation material, wrong address/network or tampering blocks funding. |
| T02-AC05 | Fresh per-leg authorization binds chain, amount, destination, nonce, expiry and exact network/asset fee caps. |
| T02-AC06 | Timeout/unknown outcome prevents downstream forwarding and duplicate signing. |
| T02-AC07 | Cancellation preserves stranded-fund location, evidence and exportable recovery material. |
| T02-AC08 | No signatures or raw secret fields appear in serialized plan/journal/telemetry. |
| T02-AC09 | Each network/asset's remaining route cap deducts prior actual costs and unresolved reservations; resume or gas top-ups cannot reset it or permit duplicate charges. |
| T02-AC10 | A direct-unsupported path returns a typed refusal, never an invented fallback. |
| T02-AC11 | Test fixtures demonstrate publicly traceable hop chains and avoid anonymity scores. |
| T02-AC12 | Original testnet and supported-token gates remain unchanged until independent qualification. |
| T02-AC13 | Never-announced hop addresses require the separately reviewed P05/P06 format extension; absent capability, fabricated announcement evidence or relabelled spec18 exports reject while canonical spec18 fixtures remain unchanged. |
| T02-AC14 | An ERC-20 route with token fees plus native gas enforces separate leg/route caps and subtracts prior costs in each asset after interruption; excess in either ledger rejects without cross-asset netting. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Reconcile existing hops deviations and define unambiguous leg/intermediate semantics; retain current guards.
2. Claim a separate P05/P06 provider slice to specify and review an encrypted recovery-format extension for never-announced self-controlled keys, including complete derivation/address-verification evidence and offline restore vectors. T02 consumes that capability before funding; test missing/tampered/wrong-network/wrong-address backups, fabricated announcements and format confusion, with canonical spec18 unchanged.
3. Integrate P08/FEE01 route preview with exact amount ladder and cumulative caps per network/asset; test fee erosion, changed quotes, ERC-20/native-gas separation and prior-cost accounting after interruption.
4. Adapt scoped executor/journal for fresh explicit authorization, session invalidation and unknown outcomes; test crashes around submit.
5. Build interruption/cancellation/independent-recovery UI; never imply unsupported direct execution works.
6. Independently qualify local-chain legs, recovery and transparent-linkability demonstrations before considering any enabled release.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/hops/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hops/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/hops
npm test -w @ghostpay/hops -- --maxWorkers=1
npm run lint -w @ghostpay/hops
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

New route journals use versioned encrypted storage and explicit recovery coverage. Existing experimental plans can import only after full validation and recovery reconciliation against the reviewed unannounced-key format; never assume old backups or canonical spec18 payment exports cover all intermediate addresses. Rollback disables new routes but retains journals, key exports and independent ordinary-wallet recovery.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: pricing/recipient/enforcement, supported tokens/chains, approval and qualification of the separate P05/P06 unannounced-key recovery format, whether and how direct execution will be qualified, gas funding and partial-fee/refund policy. No new custody, guardians, production route or privacy claim is approved here.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
