# F14 — Privacy-aware multi-chain route comparison

| Field | Value |
| --- | --- |
| Module | F14 / multichain-routing |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f14-multichain-routing |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Compare qualified direct payment routes across explicitly supported chains/assets while making cost and privacy differences visible. A route comparison is not permission to bridge, swap, change invoice terms or spend. Favor an explicitly selected compatible direct payment; represent unsupported and unqualified routes as unavailable instead of quietly substituting them.

1. Payer loads an authenticated invoice and selects the networks/assets it actually permits; the app validates deployment and token metadata.
2. User compares exact input/output amounts, itemized fees, finality assumptions and observers, then selects one current quote.
3. Wallet/network and transaction preview are checked again before separate signing. A source-chain transfer alone never establishes destination invoice settlement.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/14-multichain-routing.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/14-multichain-routing.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/chain-adapters/src/config/chains.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/config/chains.ts) | CHAINS, findChain, requireEnabledChain | Reuse enabled-network boundary; comparison must not enable unsupported networks. |
| [packages/chain-adapters/src/deployments.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/deployments.ts) | validateManifest, loadDeployment | Reuse bounded manifest validation and expected-chain binding. |
| [packages/chain-adapters/src/verify.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/verify.ts) | verifyManifestSignature, verifyDeployment | Reuse signature/code/deployment checks; chain availability is not deployment qualification. |
| [packages/chain-adapters/src/quote.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/quote.ts) | readPrice, fiatToTokenAmount | Reuse exact reference conversion; route execution terms remain separately authorized. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P08](https://github.com/djshellshoxxx/GhostPay/blob/future/p08-linkability-analysis/docs/future/modules/P08-linkability-analysis/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md). Optional integrations: [P13](https://github.com/djshellshoxxx/GhostPay/blob/future/p13-confidential-amounts/docs/future/modules/P13-confidential-amounts/SPEC.md), [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md), [P16](https://github.com/djshellshoxxx/GhostPay/blob/future/p16-shielded-cross-chain/docs/future/modules/P16-shielded-cross-chain/SPEC.md).
Proposed owned paths: apps/web/src/features/multichain-routing/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own route-comparison model and UI. P02 supplies network requests, P08 supplies linkability observations and FEE01 supplies fee accounting. P13/P14/P16 integrations remain explicitly optional and unavailable without independent capability qualification. Exclude bridge deployment, new exchange protocols, automatic cross-chain recovery, arbitrary liquidity calls and widening chain allowlists.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface RouteCandidateV1 {
  version: 1; routeId: string; invoiceDigest: string;
  kind: "direct" | "external-swap" | "external-bridge";
  sourceChainId: number; destinationChainId: number;
  inputAsset: string; outputAsset: string;
  inputBase: string; minimumOutputBase: string;
  manifestDigest: string; policyDigest: string;
  quoteExpiresAtMs: number; observerIds: readonly string[];
  capabilityIds: readonly string[]; feeQuoteDigest: string;
}
interface RouteSelectionV1 {
  version: 1; routeId: string; candidateDigest: string;
  acceptedDisclosureDigest: string; acceptedFeeDigest: string;
}
interface RouteService {
  compare(invoiceDigest: string, ctx: OperationContext):
    Promise<ModuleResult<readonly RouteCandidateV1[]>>;
  select(raw: unknown, ctx: OperationContext): ModuleResult<RouteSelectionV1>;
  revalidate(selection: RouteSelectionV1, ctx: OperationContext):
    Promise<ModuleResult<RouteCandidateV1>>;
}
~~~

Bind route identity to invoice, chain pair, token contracts, deployment digest, minimum output, quote expiry and fee terms. Comparison sorting is deterministic and explains its basis; a cheapest badge does not mean lowest risk. Cross-chain candidates carry independent source/destination finality and refund assumptions. Do not treat token symbols as unique asset identifiers.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

States: discovering, validated, quoted, selected, review-required, submitted, source-confirmed, destination-pending, settled or recovery-required. Each phase retains source and destination evidence separately. Network/account changes invalidate selection. Reorg or unknown bridge outcome cannot trigger automatic replacement or mark invoice paid. An expired candidate is retained for explanation but cannot be submitted.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: ROUTE_UNQUALIFIED, ROUTE_MANIFEST_MISMATCH, ROUTE_QUOTE_EXPIRED, ROUTE_ASSET_MISMATCH, ROUTE_TERMS_CHANGED, ROUTE_DESTINATION_UNKNOWN. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Candidates | 16 route candidates across 8 enabled chains | Reject expansion; do not contact every known chain. |
| Network fan-out | 4 concurrent reads; 30-second comparison deadline | Only selected approved providers. |
| Route legs | Direct initial implementation; maximum 4 described external legs | External execution requires separate approved adapter. |
| Manifest/quote | Existing 16 KiB manifest cap; 64 KiB route envelope | Bound before signature and graph processing. |
| Expiry | At most 120 seconds for executable route preview | Revalidate actual provider expiry and current terms. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| RPC/provider | Explicit query consent and P02 policy | Selected chains, ranges and requested amounts may be visible. |
| Malicious asset metadata | Manifest-bound addresses/decimals and independent checks | Token issuer and contract risks remain. |
| Bridge/LP | Qualified optional adapter and separate approval | Custody, censorship, liquidity and timing assumptions remain. |
| Misleading cheapest route | Comparable unit totals plus risk/observer disclosure | Fees and execution conditions can change after preview. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Show base protocol fee, module charges, source/destination gas and external conversion/bridge costs separately. Never compare totals by adding unrelated token units. Missing or stale fees disable execution rather than show zero. Existing protocol fee compatibility is required; an alternative path cannot be labeled equivalent if it bypasses an approved fee rule.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F14-AC01 | Unsupported chains remain unavailable and cause no probe or wallet-switch request. |
| F14-AC02 | Wrong-chain manifests, token decimals and substituted contract addresses are rejected. |
| F14-AC03 | A route quote cannot change invoice asset or recipient without new explicit review. |
| F14-AC04 | Quote expiry and wallet/network changes invalidate previous selection. |
| F14-AC05 | Same-symbol tokens on different chains remain distinct in preview and accounting. |
| F14-AC06 | Private-required provider failure cannot fall back to another route silently. |
| F14-AC07 | Source confirmation alone leaves a bridged destination invoice pending. |
| F14-AC08 | A reorg preserves evidence and requires reconciliation before retry. |
| F14-AC09 | Fee totals are comparable only under an explicit conversion basis. |
| F14-AC10 | Keyboard and screen-reader users receive observer/fee differences before route acceptance. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Define route candidate/schema and deterministic comparison fixtures; test symbols, decimals and chain-binding boundaries.
2. Adapt existing manifest/deployment checks via P02; preserve all current network gates.
3. Integrate P08/FEE01 summaries; test incomplete fees and truthful risk comparisons.
4. Implement selection/revalidation state and direct-route transaction handoff; test expiry and stale account completion.
5. Add disabled optional adapter descriptors and recovery UI; independently review cross-chain claims before any experimental execution.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/chain-adapters/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/chain-adapters
npm test -w @ghostpay/chain-adapters -- --maxWorkers=1
npm run lint -w @ghostpay/chain-adapters
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Default disabled; existing direct payments retain their normal path. Migrate only explicit route preferences, never infer consent from prior chain usage. New saved selections must be revalidated after upgrade. Rollback keeps unresolved source/destination evidence exportable and returns new payment creation to existing qualified direct paths.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: qualified chain/asset matrix, acceptable external protocols, pricing conversion basis, slippage/expiry policy and finality thresholds. P16 research cannot make a bridge supported merely by registering its descriptor.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
