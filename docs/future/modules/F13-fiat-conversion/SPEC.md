# F13 — Privacy-aware optional fiat conversion

| Field | Value |
| --- | --- |
| Module | F13 / fiat-conversion |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f13-fiat-conversion |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Let users compare optional fiat conversion offers without treating a display exchange rate as an executable trade. Show net delivery, spread, charges, expiry and provider visibility before external handoff. No account, provider or fiat service is required for core GhostPay or local indicative conversion.

1. User chooses asset, amount, currency and explicitly selected providers, then approves a field-level request disclosure.
2. Bounded quotes appear with independent freshness and fee breakdowns; incomplete providers remain visibly unavailable.
3. User selects current terms and explicitly continues to the provider. Fiat-claimed, user-reviewed delivery and crypto settlement remain separate.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/13-fiat-conversion.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/13-fiat-conversion.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/ux-fiat/src/rate.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-fiat/src/rate.ts) | parseRate, classifyAge, checkRateJump | Reuse exact rate validation; executable offers need separate provider authentication. |
| [packages/ux-fiat/src/convert.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-fiat/src/convert.ts) | toFiatMinor, fromFiatMinor | Reuse integer rounding; neither function executes a conversion. |
| [packages/ux-fiat/src/view.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-fiat/src/view.ts) | computeFiatView | Preserve stale/unknown display semantics. |
| [packages/chain-adapters/src/quote.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/quote.ts) | readPrice, fiatToTokenAmount, createAggregatorReader | Approved reference feeds remain distinct from off-ramp quotes and use selected RPC. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P11](https://github.com/djshellshoxxx/GhostPay/blob/future/p11-metadata-timing-policy/docs/future/modules/P11-metadata-timing-policy/SPEC.md). Optional integrations: [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md).
Proposed owned paths: apps/web/src/features/fiat-conversion/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own quote aggregation, comparison reducer, disclosure preview and optional external handoff. Existing P02 reuse is limited to approved JSON-RPC reference-price reads through its closed RpcPurpose/method/params contract; it is not an HTTP quote-provider API. P11 minimizes fields and optional FEE01 supplies approved GhostPay fee lines. External fiat quotes require a separately reviewed, narrow non-RPC service-request port in the network-policy provider lane before this product can enable them. F13 must not overload RpcPurpose, add ambient fetch or build its own transport wrapper. Exclude KYC collection, automatic signup, bank integration, hosted exchange and custody. Sensitive bank/contact data belongs to the separately chosen external provider, never routine quote telemetry.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface ConversionRequestV1 {
  version: 1; requestId: string; chainId: number; asset: string;
  cryptoBase: string; fiatCurrency: string;
  direction: "crypto-to-fiat" | "fiat-to-crypto";
  providerIds: readonly string[]; disclosureDigest: string;
}
interface ConversionQuoteV1 {
  version: 1; quoteId: string; requestDigest: string; providerId: string;
  executable: boolean; fiatMinor: string; fiatDecimals: number;
  cryptoBase: string;
  feeItems: readonly { kind: string; asset: string; amountBase: string }[];
  issuedAtMs: number; expiresAtMs: number; termsDigest: string;
  signature?: string;
}
// Consumer requirements for a future provider-owned port; not an existing P02 API.
interface FiatServiceRequestRequirementsV1 {
  version: 1; purpose: "fiat-quote";
  endpointId: string; method: "POST";
  requestTargetDigest: string; bodyDigest: string; disclosureDigest: string;
  expiresAtMs: number; responseByteLimit: number; maximumRequests: 1;
}
interface ConversionService {
  quote(request: ConversionRequestV1, ctx: OperationContext):
    Promise<ModuleResult<readonly ConversionQuoteV1[]>>;
  select(quoteId: string, termsDigest: string, ctx: OperationContext):
    Promise<ModuleResult<{ handoffDescriptor: string }>>;
}
~~~

Validate fiat precision through an explicit supported table; provider decimal fields are not authoritative. Use rational rates and state rounding direction. An executable offer requires an accepted provider identity/trust policy; unsigned indicative rates cannot silently become executable. Fees in different assets stay separate unless a disclosed FX basis is explicitly accepted.

The proposed service-request provider is limited to approved fiat-quote endpoints and request/response schemas. It first returns a read-only preview, then mints a provider-registered, opaque, nonserializable, single-dispatch consent handle only after explicit acceptance. The handle binds endpoint identity, exact HTTP method, canonical URL/path/allowed-header digest, body digest, disclosure, policy revision, session epoch, operation, expiry and response bounds. Immediately before atomic consumption, recompute the actual request digests; changed, expired, reused, revoked or forged consent refuses before transport. Inspection does not dispatch. Redirects, retries and another endpoint require fresh consent. No generic arbitrary-URL proxy or secret-bearing headers are exposed to F13. Until this provider extension is approved and available, external quotes return unavailable; local display conversion and consented RPC reference-price reads remain usable.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

States: idle, disclosure-review, requesting, quoted, selected, external-pending, delivered-claimed, delivery-reviewed, expired or cancelled. Amount, currency, network, provider or terms changes invalidate the selection. Partial provider failures never introduce an unselected provider or invented price. Saved quotes are evidence of terms, not payment; restoring a quote rechecks expiry. Unknown delivery remains pending external review.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: CONVERSION_PROVIDER_UNAVAILABLE, CONVERSION_QUOTE_STALE, CONVERSION_DECIMALS_UNSUPPORTED, CONVERSION_TERMS_CHANGED, CONVERSION_RESPONSE_INVALID, CONVERSION_SERVICE_PORT_UNAVAILABLE, CONVERSION_SERVICE_CONSENT_INVALID. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Providers | 5 selected; 2 concurrent requests | No hidden fan-out or background discovery. |
| Response | 64 KiB/provider; 20 quotes/provider | Bound response read and reject truncated signatures. |
| Request | 8 KiB; up to uint256 amount | Reject signs, exponent notation and excess precision. |
| Executable expiry | Provider expiry capped by 5 minutes | Never extend expiry; indicative quotes cannot authorize trade. |
| Timeout/storage | 15 seconds/provider; 100 explicit encrypted saves | Partial failures are shown; no automatic purchase history. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Quote provider | Explicit endpoint and field consent | Amount, currency, timing and network origin remain visible. |
| Price manipulation | Authenticated executable terms and exact units | Reference markets may differ legitimately. |
| Fiat counterparty | Separate onboarding/approval | Identity requirements and reversals may remain. |
| Malicious response | Strict schema and text-only rendering | Marketing claims are not settlement evidence. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Separate spread, provider charges, gas, protocol fees and optional feature charges. Compare only equivalent chain/asset/currency/payout assumptions. Local display conversion and quote inspection do not trigger a new GhostPay fee. Terms changes require renewed approval; provider refundability remains explicit.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F13-AC01 | Empty provider selection yields zero remote provider calls on launch and amount entry. |
| F13-AC02 | Requests contain exactly approved fields and only target selected providers. |
| F13-AC03 | Boundary fixtures preserve exact rounding across token and fiat scales. |
| F13-AC04 | Expired or changed terms disable execution while retaining historical evidence. |
| F13-AC05 | Provider outage cannot substitute an unselected provider or synthetic executable quote. |
| F13-AC06 | Unsupported decimals and oversized payloads do not update totals. |
| F13-AC07 | Account or amount changes discard stale responses and invalidate old handoffs. |
| F13-AC08 | Fiat-claimed callbacks never imply irrevocable delivery or invoice finality. |
| F13-AC09 | Cross-asset fee comparisons disclose FX basis and never sum incomparable units. |
| F13-AC10 | Keyboard users receive fee/expiry changes before external navigation. |
| F13-AC11 | Without the approved non-RPC service-request provider, external quotes remain unavailable and no ambient fetch or RpcPurpose extension occurs; local display and authorized RPC reference reads still work. |
| F13-AC12 | Endpoint/method/body/disclosure changes, expired or consumed consent, and oversized responses refuse at the service-provider boundary; inspection alone and concurrent handle reuse produce no unauthorized dispatch. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Define quote/request schemas and supported currency precision; test exact-unit and malformed-input cases.
2. Adapt ux-fiat freshness/conversion logic while keeping indicative/executable types separate.
3. In the network-policy provider lane, specify and independently approve the narrow non-RPC quote-request port and consent contract first; F13 then consumes it without ambient fetch. Test digest binding, single dispatch, disclosure equality, partial failures and cancellation. Existing P02 remains limited to approved RPC reference reads.
4. Add comparison and handoff reducer; verify changed terms and unknown delivery recovery.
5. Build accessible fee views and optional encrypted saves; independently review provider assumptions.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/ux-fiat/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-fiat/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/ux-fiat
npm test -w @ghostpay/ux-fiat -- --maxWorkers=1
npm run lint -w @ghostpay/ux-fiat
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Start disabled with an empty provider set; existing fiat-display behavior remains independent. New records use a separate encrypted schema. Migration cannot enroll providers or disclose historical invoices. Rollback disables quote/handoff requests while preserving terms and unresolved external references.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: accepted providers, currencies, jurisdictions/payout methods, quote-signing trust anchors, spread policy and optional fee model. Provider-lane approval of the narrow service-request contract is a separate implementation prerequisite; no current P02 capability is presumed to provide it. A working reference-rate adapter is not qualification of a fiat provider.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
