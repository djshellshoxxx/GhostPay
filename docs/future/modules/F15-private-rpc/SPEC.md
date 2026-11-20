# F15 — Private RPC and scanning configuration workflow

| Field | Value |
| --- | --- |
| Module | F15 / private-rpc |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f15-private-rpc |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Provide a coherent user workflow for choosing RPC, scan and broadcast policies and seeing what each route exposes. Configuration must describe observed reachability and declared routing separately. A browser page cannot prove the operating system or a wallet extension is using Tor, so a toggle must never appear as verified anonymity.

1. User selects self-hosted RPC, explicit endpoint, Tor Browser path or approved local proxy and previews the requests needed for testing.
2. User separately approves a bounded reachability/chain check and saves a policy only after inspecting its actual disclosures.
3. Private-required operation stops when its route fails. A temporary downgrade, if permitted by policy, is separately reviewed for the exact action and duration.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/15-private-rpc.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/15-private-rpc.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [apps/web/src/lib/scanPrivacy.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts) | sanitizeScanPrivacy, checkScanEndpoint, planScan | Reuse existing endpoint/settings validation; avoid a second network policy implementation. |
| [apps/web/src/lib/scanPrivacy.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts) | openScanClients, createWindowedScanClient | Preserve current selected-provider and windowed-scan behavior through P02/P03. |
| [apps/web/src/lib/scanPrivacy.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts) | describeScanDisclosureMessages, privatePathForbidsDirect | Reuse honest exposure disclosures and no-direct-fallback intent. |
| [apps/web/src/lib/settings.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/settings.ts) | Existing settings boundary | Integrate one settings namespace; inspect current schema before any migration. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P03](https://github.com/djshellshoxxx/GhostPay/blob/future/p03-local-stealth-scanning/docs/future/modules/P03-local-stealth-scanning/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md). Optional integrations: [P01](https://github.com/djshellshoxxx/GhostPay/blob/future/p01-tor-onion-hosting/docs/future/modules/P01-tor-onion-hosting/SPEC.md), [P07](https://github.com/djshellshoxxx/GhostPay/blob/future/p07-encrypted-device-sync/docs/future/modules/P07-encrypted-device-sync/SPEC.md).
Proposed owned paths: apps/web/src/features/private-rpc/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own configuration forms, explicit test controls, health/status reducer and exposure display. P02 owns transport authorization, P03 local discovery and P10 private submission. Optional P01 describes hosting; optional P07 syncs only user-approved encrypted settings. Do not create new HTTP/WSS clients, force OS proxy settings, probe networks on startup or store endpoint secrets in plaintext settings.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface NetworkProfileV1 {
  version: 1; profileId: string; revision: number;
  transport: "direct" | "tor-browser" | "local-proxy";
  requirement: "best-effort" | "private-required";
  rpcEndpointRef: string; scanEndpointRef?: string;
  broadcastEndpointRef?: string; chainId: number;
  approvedDisclosureDigest: string;
}
interface NetworkObservationV1 {
  version: 1; profileRevision: number;
  checkedAtMs: number;
  reachability: "untested" | "reachable" | "blocked" | "unknown";
  chainVerified: boolean; routingEvidence: "declared" | "measured";
  evidenceRef?: string; observerIds: readonly string[];
}
interface NetworkConfigurationService {
  preview(raw: unknown, ctx: OperationContext): ModuleResult<NetworkProfileV1>;
  test(profile: NetworkProfileV1, ctx: OperationContext):
    Promise<ModuleResult<NetworkObservationV1>>;
  commit(profile: NetworkProfileV1, expectedRevision: number,
    ctx: OperationContext): Promise<ModuleResult<NetworkProfileV1>>;
}
~~~

Endpoint references resolve through P02; credentials live only in provider-approved secret storage. A measured result needs explicit evidence and scope, never the hostname alone. Records distinguish asset origin, RPC origin, scanner and broadcast provider. Declared Tor Browser use does not certify extension traffic. Downgrade consent is an expiring operation-scoped token, never an implicit global preference rewrite.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

States: unconfigured, draft, test-consent, testing, reviewed, active, degraded or blocked. Editing endpoints cancels the old test and invalidates observations. Saving uses a revision check; successful network test does not itself save or authorize future requests. Unknown test status remains unknown. Recovery restores preferences but requires fresh endpoint/chain validation before network use.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: NETWORK_PROFILE_INVALID, NETWORK_TEST_UNCONSENTED, NETWORK_CHAIN_MISMATCH, NETWORK_ROUTE_REQUIRED, NETWORK_PROFILE_STALE, NETWORK_TEST_INCONCLUSIVE. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Profiles | 16 local network profiles | Explicit replace/archive before expansion. |
| Endpoint input | 2,048 characters; provider-specific approved schemes | Reject embedded credentials in public export and dangerous URL forms. |
| Explicit test | At most 4 approved requests; 15-second deadline | No retries to unselected endpoints or hidden fallback. |
| Observations | 64 encrypted summaries; no request bodies | Avoid query/account history in diagnostics. |
| Concurrent tests | One/profile revision | Endpoint edits cancel old observations. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| RPC observer | Clear disclosure and optional own node | Queries, ranges, payloads and timing may remain observable. |
| Wallet extension | Separate outside-app traffic notice | Its own endpoints cannot be controlled by page JavaScript. |
| Failed private route | Fail closed and explicit scoped downgrade | Availability can decrease; connection errors do not prove privacy. |
| Diagnostic leakage | Redacted bounded status summaries | Provider hostname itself may reveal user infrastructure. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Local endpoint selection, own-node use and privacy settings do not acquire an automatic GhostPay add-on charge. Selected third-party services may charge independently and require their own quote/consent. A route-health check cannot enroll the user into a paid provider.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F15-AC01 | Opening settings and editing a URL emit zero network calls until explicit test consent. |
| F15-AC02 | An old test response cannot mark a newly edited endpoint as reachable. |
| F15-AC03 | Wrong-chain results prevent profile activation for that chain. |
| F15-AC04 | Private-required outage emits zero direct fallback requests across retries and reload. |
| F15-AC05 | Endpoint secrets never appear in plaintext export, UI errors or diagnostic logs. |
| F15-AC06 | Wallet traffic is labeled separately from app-owned routing guarantees. |
| F15-AC07 | Restored preferences require fresh validation and do not imply enduring test success. |
| F15-AC08 | Downgrade consent expires and applies only to the reviewed operation. |
| F15-AC09 | Indexed/windowed scans retain provider privacy limits and bounded behavior. |
| F15-AC10 | Keyboard and screen-reader users can distinguish declared, measured, blocked and unknown states. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Define profile/observation schemas and adapt current scanPrivacy settings without duplicating transport policy.
2. Implement pure test/commit revision reducer; test endpoint edits, cancellation and stale responses.
3. Connect explicit P02 test requests and P03/P10 capability status; verify request count and no fallback.
4. Add disclosure/settings UI and redacted diagnostics; test locked screens and endpoint-secret export.
5. Run browser network traces, reload and explicit downgrade cases; separately collect real Tor evidence only when available.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/net-transport/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/net-transport/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/net-transport
npm test -w @ghostpay/net-transport -- --maxWorkers=1
npm run lint -w @ghostpay/net-transport
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Migrate existing scan settings additively with a preview and preserved strictness. Never convert private-required into best-effort. New profiles start untested. Rollback disables the new settings UI but retains a valid strict existing policy or blocks network use until the user selects one.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: supported proxy transports, permissible explicit test endpoints, diagnostic retention and whether scoped downgrades are allowed. Actual Tor route qualification is a separate evidence task; no static page inference is sufficient.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
