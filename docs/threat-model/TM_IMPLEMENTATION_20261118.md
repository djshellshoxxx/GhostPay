# TM1–TM15 implementation and evidence — 2026-11-18

## Ownership and source boundary

Worker: branch-archaeology/security-tooling lane; coordinator: current Pages completion session.
Branch: `integration/ghostpay-doc-evidence-20261118`.
Reviewed runtime source: `e85db1ef942bda9cb54317a6c036a22484b46ff9`.
Owned files: this ledger, `README.md`, `docs/threat-model/PRIVACY_THREAT_MODEL.md`, `docs/DEPLOYMENT_MANIFEST.md` and `deploy/TOR.md`.
Acceptance: refresh #223's useful documentation against the combined source; distinguish source presence,
actual local execution and missing release acceptance; preserve residual risks and historical evidence.
No runtime, test, dependency, gate, deployment or release change belongs to this documentation lane.

The current [completion report](../handoffs/pages-completion-20261118/COMPLETION_REPORT.md) records later
qualification and integration decisions. This ledger does not certify a deployed site, a real Tor route or
public-network anonymity.

Independent documentation review checked the production import lists and CI prerequisite/aggregate facts,
and found no whole-candidate, Tor or mandatory-signer-pinning overclaim. Its two precision corrections are included:
public announcement fields remain visible to providers, and later pinned native-toolchain evidence is separate
from the original recovery lane. This documentation work ran no additional product tests.

## How to read the status

`IMPLEMENTED_LOCAL` means the narrow requested behavior is wired and related local regressions ran. It does not certify the whole candidate. `PARTIAL` means a compound recommendation or its necessary acceptance remains unfinished. `DOCUMENTED_UNQUALIFIED` records accurate guidance without external execution. `DEFERRED_OUTSIDE_PAGES` preserves work outside the active lean routes.

## Recommendations

### TM1: Sweep balance consent

**Status: IMPLEMENTED_LOCAL.** Opening/selecting a payment discloses its one-time address to an RPC provider.

Opening Sweep, changing rows and changing inputs do not initiate a balance read. Every balance refresh needs a disclosed click; stale session/selection/RPC results are invalidated, including the async client-acquisition boundary.

Source: `apps/web/src/views/Sweep.tsx`. Regression definitions: `apps/web/src/views/Sweep.test.tsx`.

Execution references: E1, E2.

Remaining: Run actual combined-source browser journeys and rapid-switch/lock behavior in the intended browser configuration.

Limit: A deliberate read and a later sweep still expose the address, request timing and connecting IP. Already-sent requests cannot be recalled.

### TM2: Provider exposure notices

**Status: PARTIAL.** Users do not know which scan/export/sweep activity identifies their payments to a provider.

Pages scan/sweep and recovery-export views contain per-flow notices. The obsolete automatic-balance wording was corrected. The fresh threat-model ledger replaces stale all-library/not-implemented claims.

Source: `apps/web/src/views/Scan.tsx`, `apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/components/StealthExportPayment.tsx`. Regression definitions: `apps/web/src/lib/scanPrivacy.test.ts`, `apps/web/src/components/StealthExportPayment.test.tsx`, `apps/web/src/i18n/securityKeys.test.ts`.

Execution references: E4, E6, E8.

Remaining: Review full-profile notices separately, keep older audit/matrix claims historical, and perform native-language/accessibility acceptance.

Limit: A disclosure establishes informed action, not provider confidentiality. Critical unreviewed translations intentionally use English.

### TM3: RPC metadata controls

**Status: IMPLEMENTED_LOCAL.** Ambient cookies, referrers or HTTP cache increase unintended metadata retention.

The shared fetch transport sets credentials omit, no-referrer, no-store and redirect error. #220 and #222 overlap was resolved without dropping the POST regression.

Source: `packages/chain-adapters/src/rpc.ts`. Regression definitions: `packages/chain-adapters/src/rpc.test.ts`.

Execution references: E5.

Remaining: Complete final dependency-aligned combined tests and built-browser verification.

Limit: These flags do not hide IP, target origin, RPC method/body or provider logs; browser/extension compromise remains outside this control.

### TM4: Secret-bearing endpoint storage

**Status: IMPLEMENTED_LOCAL.** Provider API credentials embedded in endpoint paths/queries persist in plaintext browser preferences.

Settings flags likely path/query secrets and offers session-only RPC endpoints held in module memory. Persisted settings omit an exact endpoint selected for session-only storage.

Source: `apps/web/src/lib/settings.ts`, `apps/web/src/views/Settings.tsx`. Regression definitions: `apps/web/src/lib/settings.test.ts`, `apps/web/src/views/Settings.test.tsx`.

Execution references: E2.

Remaining: Actual browser storage-denial/reload acceptance and clear user guidance for existing saved endpoints.

Limit: Detection is heuristic; saved non-session URLs remain plaintext. Memory-only endpoints are still visible to a compromised active page.

### TM5: Tight hosting egress policy

**Status: PARTIAL.** A broad connect-src permits more exfiltration destinations if script execution is compromised.

Build-time GHOSTPAY_CONNECT_ORIGINS support, CSP/artifact checks, declared-origin guards and hosting guidance exist. Generic csp.mjs builds still use self/https/wss if no allowlist is configured.

Source: `apps/web/scripts/csp.mjs`, `apps/web/scripts/scan-bundle.mjs`, `scripts/pages/verify-pages-site.mjs`, `deploy/BUILD-WEB.md`. Regression definitions: `apps/web/src/buildScripts.test.ts`, `apps/web/src/scanBundle.test.ts`.

Execution references: E3.

Remaining: Qualify final release artifacts with the approved dedicated origin and exact allowlist, then inspect actual served policy. GitHub Pages does not apply a custom _headers file.

Limit: CSP is one layer and does not protect against an origin/host that serves changed code; user-added endpoints may be blocked by a tight build.

### TM6: Honest Tor boundary

**Status: DOCUMENTED_UNQUALIFIED.** An onion-hosted bundle is mistaken for Tor-routed RPC or payment anonymity.

Tor guidance separates bundle hosting, browser routing and independent RPC/wallet traffic and retains UNTESTED status. Settings exposes the acknowledged network selection. This documentation refresh corrects the older deploy/TOR.md statement denying that control and records the plain-HTTP loopback CSP limit.

Source: `deploy/TOR.md`, `apps/web/src/views/Settings.tsx`, `apps/web/src/lib/defaultServices.ts`. Regression definitions: `apps/web/src/views/Settings.test.tsx`.

Execution references: no recommendation-specific executed result claimed in this ledger.

Remaining: Execute real Tor bootstrap/reachability/browser/provider tests and record their versions, source and traffic boundary. Plain-HTTP loopback compatibility remains constrained by the shipped CSP.

Limit: The browser page cannot verify Tor routing; the provider still sees request content; wallet-extension traffic is outside app control.

### TM7: Destination reuse without plaintext linkage

**Status: IMPLEMENTED_LOCAL.** Repeated or known-wallet sweep destinations link payments; persisting the warning history can create an extra local linkage record.

Classifier warnings are wired into Sweep. The address-link ledger is in memory, reset on lock/session changes, protected by epochs against late results, and copied on read. The legacy plaintext key is deleted best effort and never imported.

Source: `apps/web/src/lib/sweep.ts`, `apps/web/src/views/Sweep.tsx`. Regression definitions: `apps/web/src/lib/sweep.destinations.privacy.test.ts`, `apps/web/src/views/Sweep.test.tsx`.

Execution references: E2.

Remaining: Final combined qualification and actual browser lock/reload/session acceptance.

Limit: Warnings cover only the active session and are advisory. Earlier sessions/devices are not checked; denied storage can retain ignored legacy bytes.

### TM8: Private v4 checkpoint names

**Status: IMPLEMENTED_LOCAL.** Public meta-address keys allow an observer of browser storage to test which seller was scanned.

Private HKDF-SHA256 v4 names use the correct loaded viewing key, chain and key identifier. Key lending/caches are session-bound. v1/v2 and both conflicting v3 formats are ignored and purged best effort; rescan is intentional.

Source: `apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanClient.ts`. Regression definitions: `apps/web/src/lib/scanCursorSlot.test.ts`, `apps/web/src/lib/scanClient.test.ts`.

Execution references: E1, E2.

Remaining: Combined restart, storage denial, multi-tab and reorg browser acceptance; retain the rescan/migration disclosure.

Limit: Cursor contents remain plaintext/unauthenticated; opaque identifiers and block progress still reveal use. Public reconciliation/key-vault headers are a separate residual.

### TM9: Minimal receipts

**Status: IMPLEMENTED_LOCAL.** A receipt unnecessarily adds the one-time address and increases linkability to the seller signer.

Receipt payload omits stealthAddress by default. An explicit checkbox is required to include it; both forms remain signed and bound to invoice/payment facts. #233 retains signature/tamper assertions in browser fixtures.

Source: `apps/web/src/lib/receipts.ts`, `apps/web/src/components/ReceiptPanel.tsx`. Regression definitions: `apps/web/src/lib/receipts.test.ts`, `apps/web/src/components/ReceiptPanel.test.tsx`, `apps/web/e2e/pages-devnet.spec.ts`.

Execution references: E2, E9.

Remaining: Repeat the actual #233 Pages/browser journey at the final combined candidate. E9 proves upstream browser execution only; collection/component tests are not substitutes.

Limit: Transaction hash, chain, amount, invoice digest and stable signer still allow public-chain and peer linkage.

### TM10: Invoice confidentiality and identity rotation

**Status: PARTIAL.** Plaintext invoice details and stable identity keys correlate invoices.

CreateInvoice defaults to encryption. The standard bearer link contains its key; passphrase mode is separate. Pay checks signatures and displays optional pinned-signer trust. Per-invoice signer selection is not implemented in the Pages creation flow.

Source: `apps/web/src/views/CreateInvoice.tsx`, `apps/web/src/lib/invoiceCreate.ts`, `apps/web/src/views/Pay.tsx`, `packages/invoice-schema/src/envelope.ts`. Regression definitions: `apps/web/src/views/CreateInvoice.test.tsx`, `apps/web/src/test/pagesInvoiceTamper.test.ts`, `packages/invoice-schema/src/envelope.test.ts`.

Execution references: E1, E2, E9.

Remaining: Design and qualify per-invoice signer behavior if required, including trust/receipt compatibility. Run real encrypted-invoice and tamper browser acceptance.

Limit: Bearer-link holders can decrypt private details; public amount/chain and stable meta-address remain linkable. #234 does not force Pay UI to reject every unpinned signer.

### TM11: Relayer traffic and retention

**Status: PARTIAL.** Quote and sweep reveal and correlate owner, destination, amount, IP and timing.

Web requests use fixed-size padding buckets; compatible server validation/ingress configuration and retention documentation exist. A specific old-server refusal permits one unpadded retry. Signed quote tuples remain part of the protocol.

Source: `apps/web/src/lib/relayerClient.ts`, `apps/relayer/src/server.ts`, `apps/relayer/PRIVACY.md`. Regression definitions: `apps/web/src/lib/relayerClient.test.ts`.

Execution references: no recommendation-specific executed result claimed in this ledger.

Remaining: Separate optional-relayer compatibility and actual ingress qualification; a quote-less design needs fee/signature/protocol work. No hosted service is required by Pages.

Limit: Padding changes request size only. Operator/proxy/RPC retention and quote correlation remain. Real Tor ingress was not executed.

### TM12: Bulk receipt evidence

**Status: PARTIAL.** Per-match receipt reads identify which announcements belong to the seller.

An optional cap up to 500 fetches router evidence for selected page transactions before local matching. Abort propagation now stops scheduling additional requests and invalidates late work; scanClient regression was independently rerun.

Source: `packages/chain-adapters/src/payments.ts`, `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanPrivacy.ts`. Regression definitions: `packages/chain-adapters/src/payments.bulkCancellation.test.ts`, `apps/web/src/lib/scanClient.test.ts`, `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts`.

Execution references: E2.

Remaining: Measure complete RPC traces for covered/overflow/non-router pages and adversarial providers. Decide/document acceptable traffic cost and defaults rather than claiming general unlinkability.

Limit: Off by default. Bounds, fallback, other calls, second providers, timing and request volume limit privacy; already-dispatched requests remain observable.

### TM13: Non-EVM match privacy

**Status: DEFERRED_OUTSIDE_PAGES.** Outspend and per-match balance requests reveal matched BTC/Solana/Tron addresses.

Retained full-profile source moves Solana/Tron balance reads to sweep. Bitcoin has local spend evidence with a provider fallback for unknown state; #219 consent/worker/header work remains separately valuable.

Source: `apps/web/src/features/btc/scan.ts`, `apps/web/src/features/solana/scan.ts`, `apps/web/src/features/tron/scan.ts`. Regression definitions: `apps/web/src/features/btc/scan.localSpends.test.ts`, `apps/web/src/features/solana/chain.hardening.test.ts`, `apps/web/src/features/tron/chain.hardening.test.ts`.

Execution references: no recommendation-specific executed result claimed in this ledger.

Remaining: Consolidate #219 consent/worker/header semantics and separately qualify each experimental chain with external fixtures; do not enable those routes to finish the Pages beta.

Limit: Unknown spend state and signing can still require address/outpoint queries. None of these full-profile paths is certified by the Pages local results.

### TM14: Network selection and own-node enforcement

**Status: PARTIAL.** A profile label may imply private routing while cached clients still reach a third-party provider.

Acknowledged per-purpose direct/Tor Browser selection and own-node policy are exposed in Settings. createSelectedRpc enforces allowed own-node targets before construction and every dispatch/retry; no direct fallback on policy refusal.

Source: `apps/web/src/lib/defaultServices.ts`, `apps/web/src/views/Settings.tsx`, `packages/net-transport/src/selection.ts`. Regression definitions: `apps/web/src/lib/defaultServices.networkGuard.test.ts`, `apps/web/src/views/Settings.test.tsx`.

Execution references: E2.

Remaining: Real Tor/OHTTP/own-node/browser acceptance is absent; profile provenance and all request-purpose boundaries need independent network verification.

Limit: Tor Browser mode still uses ambient fetch and cannot prove routing. Endpoint syntax is not ownership proof; already-sent requests cannot be withdrawn. The validator permits plain-http loopback scan proxies, but the shipped CSP blocks them and the build allowlist parser excludes http; this compatibility gap remains open.

### TM15: Padded scan ranges and PIR research

**Status: PARTIAL.** Precise range boundaries expose start/progress and activity correlation.

padBlocks is wired through scan-source.padRange and the fixed-window decorator with validated caps and head/grid bounds; default extra padding is zero. Active scan source choices are RPC and indexer, not PIR.

Source: `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/views/Settings.tsx`, `packages/scan-source/src/padded.ts`. Regression definitions: `apps/web/src/lib/scanPrivacy.test.ts`, `apps/web/src/views/Settings.test.tsx`.

Execution references: E2.

Remaining: Qualify real-provider request counts/bounds and separately review any future experimental PIR integration. Do not label existing library code a shipped toggle.

Limit: Padding costs additional requests and does not hide IP, overall scan volume, timing or follow-on address/transaction queries.

## Current-session execution register

All results below belong to their listed source boundaries, not automatically to a later combined head. Selections and reviewer reruns overlap. The documentation worker did not run additional tests.

- **E1, `305ccb0d570c27a47435083059492edc819a0101`:** Focused web 192 passed; invoice-schema 728 passed; ux-core 119 passed. These are lane results, not final combined qualification.
- **E2, `821d1035b3e8b20921904f5c3bf6411f22ea3346`:** Privacy selection: 8 files, 174 passed after rebuilding affected libraries. Independent reviewer: bulk cancellation 6 passed and scanClient 92 passed. Counts overlap and are not additive coverage.
- **E3, `0bbd8965`:** Hosting selection: 135 web tests and 92 Pages/workflow script tests passed. Fixed root-error marker reporting. The later caught-root-render smoke correction is separate work.
- **E4, `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`:** Recovery web selection 135 passed (12 files); core-crypto 75 passed; ux-vault isolated retry 348 passed with original coverage thresholds. Independent export UI/security-key selection 24 passed and overlaps the 135. Node recovery 15 passed/1 native-tool skip, then supplemental raw-key Anvil/cast case passed with Foundry 1.5.1; that run did not qualify required 1.8.5; see the later E10 execution. See `docs/handoffs/agents/PAGES_RECOVERY_INTEGRATION_20261118.md` for commands and artifacts.
- **E5, `0b67fa9fbd125b18412ef53a5d377ab5ccd460e2`:** RPC 87; viewing-key boundary 1; deployment command 3; i18n 27; web display/hardening 59; Mythril helper 13; static helper 8; automation 27; unchanged security gates 33: all passed in their selections. Three affected library typecheck/lint scripts passed. No analyzer campaign or container rebuild was performed. See `docs/handoffs/GHOSTPAY_SECURITY_TOOLING_EXTRACTION_20261118.md` for commands and artifacts.
- **E6, `27e80199`:** 37 scan-privacy disclosure tests passed after removing the obsolete automatic-sweep-balance wording.
- **E7, `ef464ee5`:** Clean install, 77 library builds, 5 dependency tooling tests, 88 confidential-amounts tests and 73 privacy-pools tests passed; 4 existing artifact-dependent tests skipped. Production audit zero findings; full audit remains 14 high/16 low affected-package entries. Two web build attempts terminated 137 during TypeScript. See `docs/handoffs/agents/DEPENDENCY_QUALIFICATION_20261118.md` for commands and artifacts.
- **E8, `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`:** 4 catalogs checked, 0 errors, 434 fallback/existing warnings. Extraction: 2,229 used keys, 0 missing from English, 136 unused. Native-language review was not performed.
- **E9, `5ce26fc6023c048ecfcb81b959a939e673f9d0e9`:** PR #233 Pages browser: 16/16; beta browser: 3/3, with CLI 124 and library acceptance passing. These jobs checked the upstream synthetic merge, not e85db1ef or the final combined candidate.
- **E10, `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`:** Foundry 1.8.5 / solc 0.8.28: forge contracts 490 passed, 0 failed, 0 skipped across 34 suites. REQUIRE_ANVIL raw-key independent recovery: 1 passed, 0 failed, 0 skipped. These execute after the e85db1ef source snapshot; later vault cleanup is a separate source change.
- **E11, `e8c77e7e8699dd16b86b7a1ff90b834594d07105`:** Four temporary-passphrase-byte regressions passed after four baseline failures. The fix owns and wipes the UTF-8 KDF input and returned raw key on success/rejection while retaining input until async derivation settles. Independent source review found no blocker. Immutable strings remain unwipable; the complete final package run is separate.

## Remaining evidence boundary

The active source retains plaintext metadata and tab-scoped safety journals as described in `PRIVACY_THREAT_MODEL.md`. No new anonymity guarantee, external Tor validation, browser acceptance or native-language review is claimed. The coordinator records later build/test results, the separate caught-root-render smoke repair, hosted checks and release gates in the linked completion report.
