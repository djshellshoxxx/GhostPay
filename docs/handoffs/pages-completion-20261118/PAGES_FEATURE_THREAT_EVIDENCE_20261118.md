# Pages A–F feature and TM1–TM15 evidence map — 2026-11-18

Reviewed runtime source: `e85db1ef942bda9cb54317a6c036a22484b46ff9`. Starting main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.

This is a bounded source-and-evidence assessment for the coordinator. It does not certify final combined tests, hosted CI, a deployment or external-network behavior. Tests present in source and tests actually executed are kept separate. Narrower/reviewer reruns overlap larger selections; do not sum them into a distinct test total.

## A–F feature mapping

### A. Stealth keypair export and recovery

**Implemented:** K01–K06 have source implementations and browser entry points for scheme-1 EVM: validated public records, authenticated single-key encryption, explicit/re-authenticated export, independent recovery, bounded archive and separate master-pair backup.

**Actually verified:** Local unit/property/crypto/recovery checks executed; actual fresh-browser and external device/wallet flows remain unqualified. Later E10 supplies the pinned native-toolchain recovery result. Evidence: E4, E5, E11, E10.

**Remaining:** Final combined coverage/browser/profile validation, interrupted/fresh-browser recovery acceptance and external wallets/devices. E10 supplies later pinned Foundry interoperability evidence; later source still needs its own qualification.

**Blocker:** Browser execution environment and external acceptance; pinned native tooling now has the bounded E10 result.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `packages/ux-vault/src/stealth-export-portable.ts`, `apps/web/src/lib/paymentKeyExport.ts`, `apps/web/src/components/StealthExportPayment.tsx`, `apps/web/src/components/StealthExportRecovery.tsx`, `scripts/recovery/stealth-export-recover.mjs`.

### B. Privacy and threat model

**Implemented:** See all 15 rows below. The v4 names, consent, memory-only destination history, RPC flags and minimized receipts are wired. Several compound recommendations are partial and TM13 is outside Pages.

**Actually verified:** Focused local regression executions and independent source reviews; no real-network anonymity or routing claim. Evidence: E1, E2, E4, E5, E6.

**Remaining:** Per-invoice signer design, quote correlation, complete bounded-evidence traffic evaluation, real Tor and final browser acceptance; keep exposed headers/journals explicit.

**Blocker:** External network/browser qualification and specific protocol/product decisions.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `docs/threat-model/TM_IMPLEMENTATION_20261118.md`.

### C. Invoice and payment flow

**Implemented:** Encrypted default, signature validation, optional trusted-signer policy, chain/payee/tamper/expiry checks, transaction review, duplicate/uncertain journals, cancellation/network switching and signed receipts have source paths. The Pay UI uses pins for trust display without enabling requirePinnedSigner globally.

**Actually verified:** Invoice-schema 728 and ux-core 119 passed in stage 1; privacy component selections passed. #233 browser fixtures have fresh upstream hosted execution (E9), but not at this combined snapshot. Evidence: E1, E2, E9.

**Remaining:** Final combined Pay/wallet/browser tests, same-nonce replacement and pending-reload journeys, approved signed testnet manifest and real wallet/network acceptance.

**Blocker:** Exact-head hosted/full-browser qualification and approved external deployment inputs. Optional two-provider manifest readback remains Scan-only; do not silently add another observer to Pay/Sweep.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `apps/web/src/views/Pay.tsx`, `apps/web/src/views/CreateInvoice.tsx`, `apps/web/src/lib/pay.ts`, `apps/web/src/lib/payExec.ts`, `apps/web/src/lib/transactionOutcome.ts`, `apps/web/src/lib/duplicateAttemptJournal.ts`, `packages/invoice-schema/src/envelope.ts`.

### D. Scan, sweep and reconciliation

**Implemented:** Private v4 checkpoint names, bounded scan/bulk evidence, cancellation, resume/reorg/provider comparison, explicit balance consent, destination checks, transaction review and local encrypted reconciliation exist. Non-EVM spent recognition remains outside lean.

**Actually verified:** Stage-1 192 web tests, related privacy 174 and independent cancellation 6/scanClient 92 passed. These selected results overlap and are not a complete reconciliation/system run. Evidence: E1, E2, E6, E9.

**Remaining:** Combined restart/reorg/storage-denial/concurrent-scan tests, real browser/replacement/retry journeys and provider/public-network acceptance. Preserve the existing uncertain-send journals.

**Blocker:** Full combined qualification and external provider/browser acceptance.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanCursorSlot.ts`, `packages/chain-adapters/src/payments.ts`, `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/reconciliationVault.ts`, `apps/web/src/lib/reconciliationLedger.ts`.

### E. Backup, idle lock and device sleep

**Implemented:** GP-PAGES-02 file verification and matching-before-activation, explicit unsaved-key handling, session generations and GP-PAGES-04 wall/monotonic expiry/rollback guards exist. Export/recovery operations recheck cancellation and selected-export identity.

**Actually verified:** Clock/storage/session/recovery selections executed locally, including stale-operation regressions. Physical sleep/resume, cross-tab/browser lifecycle and external devices were not exercised. Evidence: E1, E3, E4, E11.

**Remaining:** Actual process restart, OS suspension/wake, browser navigation and fresh-profile restore at the intended serving origin; final combined lint/coverage.

**Blocker:** Device/browser lifecycle acceptance and complete candidate qualification.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `apps/web/src/lib/keyVault.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/AppShell.tsx`, `apps/web/src/components/StealthExportRecovery.tsx`.

### F. Application quality, accessibility and localization

**Implemented:** Core lean routes, onboarding, privacy disclosures, settings/network controls, recovery UI, frame/origin/unload guards, fixed error reporting and locale fallback are present. Security-critical untranslated strings intentionally fall back to English.

**Actually verified:** 135 hosting web tests and 92 script tests; locale validation 0 errors with explicit fallback warnings. No combined-head actual browser/a11y/device/native-language acceptance. Upstream #233 browser evidence is separate (E9). A separate worker is fixing the caught-root-error smoke gap after this source snapshot. Evidence: E3, E4, E8, E9.

**Remaining:** Integrate/review smoke regression; run full/lean browser journeys, project-subpath and dedicated-origin builds, keyboard/screen-reader/mobile checks and native translation review.

**Blocker:** Browser launch environment, real devices and human native-language/accessibility acceptance.

**Estimate boundary:** The approximate percentage is calculated from the explicit criteria/points below. A 100% source-presence score does not establish complete feature acceptance. Later combined tests can update verification points; external gates remain separate.

**Source:** `apps/web/src/AppShell.tsx`, `apps/web/src/main.tsx`, `apps/web/src/views/Settings.tsx`, `apps/web/src/i18n/securityKeys.ts`, `apps/web/src/i18n/translator.ts`, `scripts/pages/smoke.mjs`.

## Approximate checklist estimates

These are conservative judgments over named directive criteria, not percentages of security, reliability or release readiness. Each implementation criterion earns 1 for wired behavior, 0.5 for partial behavior and 0 if absent. Each verification criterion earns 1 for sufficient matching local proof of that narrow requirement, 0.5 for unit/component or upstream evidence with required wider acceptance missing, and 0 when no executed evidence is identified. Hosted browser evidence on an upstream synthetic merge does not become combined-head evidence. Later coordinator tests may update these points.

| Feature | Implementation points | Implementation estimate | Verification points | Verification estimate |
|---|---:|---:|---:|---:|
| A | 6/6 | 100% | 4.5/6 | 75% |
| B | 11/15 | 73% | 8/15 | 53% |
| C | 12/12 | 100% | 5.5/12 | 46% |
| D | 9.5/10 | 95% | 7/10 | 70% |
| E | 9/9 | 100% | 7.5/9 | 83% |
| F | 9.5/11 | 86% | 4.5/11 | 41% |

### A criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| K01 address/public record | 1 | 1 |
| K02 authenticated keypair codec | 1 | 1 |
| K03 deliberate browser export | 1 | 0.5 |
| K04 independent recovery/interoperability | 1 | 1 |
| K05 bounded archive | 1 | 0.5 |
| K06 separate master backup/fresh profile | 1 | 0.5 |

### B criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| TM1 | 1 | 1 |
| TM2 | 0.5 | 0.5 |
| TM3 | 1 | 1 |
| TM4 | 1 | 0.5 |
| TM5 | 0.5 | 0.5 |
| TM6 | 1 | 0.5 |
| TM7 | 1 | 0.5 |
| TM8 | 1 | 1 |
| TM9 | 1 | 0.5 |
| TM10 | 0.5 | 0.5 |
| TM11 | 0.5 | 0 |
| TM12 | 0.5 | 0.5 |
| TM13 | 0.5 | 0 |
| TM14 | 0.5 | 0.5 |
| TM15 | 0.5 | 0.5 |

### C criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| Encrypted default | 1 | 0.5 |
| Valid signatures | 1 | 1 |
| Optional signer pinning | 1 | 1 |
| Payee and chain validation | 1 | 0.5 |
| Tamper detection | 1 | 1 |
| Expiration and stale state | 1 | 0.5 |
| Duplicate prevention | 1 | 0 |
| Network switching | 1 | 0 |
| Fee disclosure | 1 | 0.5 |
| Payment cancellation | 1 | 0 |
| Failed/pending recovery | 1 | 0 |
| Receipt verification | 1 | 0.5 |

### D criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| Private checkpoints | 1 | 1 |
| Resume behavior | 1 | 0.5 |
| Bounded queries | 1 | 1 |
| Reorg handling | 1 | 1 |
| Session cancellation | 1 | 1 |
| Spent/unspent recognition | 0.5 | 0.5 |
| Balance-refresh consent | 1 | 1 |
| Destination validation | 1 | 0.5 |
| Review before signing | 1 | 0.5 |
| Reconciliation and duplicate suppression | 1 | 0 |

### E criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| Backup completeness/restoration | 1 | 0.5 |
| Independent backup verification | 1 | 1 |
| Idle lock | 1 | 1 |
| Physical suspension/wake | 1 | 0.5 |
| Clock rollback | 1 | 1 |
| Late async operations | 1 | 1 |
| Session changes | 1 | 1 |
| Tab navigation | 1 | 0.5 |
| Sensitive-operation cancellation | 1 | 1 |

### F criteria

| Criterion | Implementation points | Verification points |
|---|---:|---:|
| Seller onboarding | 1 | 0.5 |
| Invoice creation/sharing | 1 | 0.5 |
| Pay/receipt UX | 1 | 0.5 |
| Scan/sweep UX | 1 | 0.5 |
| Backup/recovery UX | 1 | 0.5 |
| Settings/network configuration | 1 | 0.5 |
| Privacy explanations | 1 | 1 |
| Contextual help | 1 | 0 |
| Responsive layouts | 0.5 | 0 |
| Accessibility | 0.5 | 0 |
| Localization | 0.5 | 0.5 |

## TM1–TM15

### TM1. Sweep balance consent — IMPLEMENTED_LOCAL

**Threat:** Opening/selecting a payment discloses its one-time address to an RPC provider.

**Current behavior:** Opening Sweep, changing rows and changing inputs do not initiate a balance read. Every balance refresh needs a disclosed click; stale session/selection/RPC results are invalidated, including the async client-acquisition boundary.

**Source:** `apps/web/src/views/Sweep.tsx`.

**Regression definitions:** `apps/web/src/views/Sweep.test.tsx`.

**Current-session execution references:** E1, E2.

**Remaining work:** Run actual combined-source browser journeys and rapid-switch/lock behavior in the intended browser configuration.

**Residual limits:** A deliberate read and a later sweep still expose the address, request timing and connecting IP. Already-sent requests cannot be recalled.

### TM2. Provider exposure notices — PARTIAL

**Threat:** Users do not know which scan/export/sweep activity identifies their payments to a provider.

**Current behavior:** Pages scan/sweep and recovery-export views contain per-flow notices. The obsolete automatic-balance wording was corrected. The fresh threat-model ledger replaces stale all-library/not-implemented claims.

**Source:** `apps/web/src/views/Scan.tsx`, `apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/components/StealthExportPayment.tsx`.

**Regression definitions:** `apps/web/src/lib/scanPrivacy.test.ts`, `apps/web/src/components/StealthExportPayment.test.tsx`, `apps/web/src/i18n/securityKeys.test.ts`.

**Current-session execution references:** E4, E6, E8.

**Remaining work:** Review full-profile notices separately, keep older audit/matrix claims historical, and perform native-language/accessibility acceptance.

**Residual limits:** A disclosure establishes informed action, not provider confidentiality. Critical unreviewed translations intentionally use English.

### TM3. RPC metadata controls — IMPLEMENTED_LOCAL

**Threat:** Ambient cookies, referrers or HTTP cache increase unintended metadata retention.

**Current behavior:** The shared fetch transport sets credentials omit, no-referrer, no-store and redirect error. #220 and #222 overlap was resolved without dropping the POST regression.

**Source:** `packages/chain-adapters/src/rpc.ts`.

**Regression definitions:** `packages/chain-adapters/src/rpc.test.ts`.

**Current-session execution references:** E5.

**Remaining work:** Complete final dependency-aligned combined tests and built-browser verification.

**Residual limits:** These flags do not hide IP, target origin, RPC method/body or provider logs; browser/extension compromise remains outside this control.

### TM4. Secret-bearing endpoint storage — IMPLEMENTED_LOCAL

**Threat:** Provider API credentials embedded in endpoint paths/queries persist in plaintext browser preferences.

**Current behavior:** Settings flags likely path/query secrets and offers session-only RPC endpoints held in module memory. Persisted settings omit an exact endpoint selected for session-only storage.

**Source:** `apps/web/src/lib/settings.ts`, `apps/web/src/views/Settings.tsx`.

**Regression definitions:** `apps/web/src/lib/settings.test.ts`, `apps/web/src/views/Settings.test.tsx`.

**Current-session execution references:** E2.

**Remaining work:** Actual browser storage-denial/reload acceptance and clear user guidance for existing saved endpoints.

**Residual limits:** Detection is heuristic; saved non-session URLs remain plaintext. Memory-only endpoints are still visible to a compromised active page.

### TM5. Tight hosting egress policy — PARTIAL

**Threat:** A broad connect-src permits more exfiltration destinations if script execution is compromised.

**Current behavior:** Build-time GHOSTPAY_CONNECT_ORIGINS support, CSP/artifact checks, declared-origin guards and hosting guidance exist. Generic csp.mjs builds still use self/https/wss if no allowlist is configured.

**Source:** `apps/web/scripts/csp.mjs`, `apps/web/scripts/scan-bundle.mjs`, `scripts/pages/verify-pages-site.mjs`, `deploy/BUILD-WEB.md`.

**Regression definitions:** `apps/web/src/buildScripts.test.ts`, `apps/web/src/scanBundle.test.ts`.

**Current-session execution references:** E3.

**Remaining work:** Qualify final release artifacts with the approved dedicated origin and exact allowlist, then inspect actual served policy. GitHub Pages does not apply a custom _headers file.

**Residual limits:** CSP is one layer and does not protect against an origin/host that serves changed code; user-added endpoints may be blocked by a tight build.

### TM6. Honest Tor boundary — DOCUMENTED_UNQUALIFIED

**Threat:** An onion-hosted bundle is mistaken for Tor-routed RPC or payment anonymity.

**Current behavior:** Tor guidance separates bundle hosting, browser routing and independent RPC/wallet traffic and retains UNTESTED status. Settings exposes the acknowledged network selection. This documentation refresh corrects the older deploy/TOR.md statement denying that control and records the plain-HTTP loopback CSP limit.

**Source:** `deploy/TOR.md`, `apps/web/src/views/Settings.tsx`, `apps/web/src/lib/defaultServices.ts`.

**Regression definitions:** `apps/web/src/views/Settings.test.tsx`.

**Current-session execution references:** No recommendation-specific executed result claimed here.

**Remaining work:** Execute real Tor bootstrap/reachability/browser/provider tests and record their versions, source and traffic boundary. Plain-HTTP loopback compatibility remains constrained by the shipped CSP.

**Residual limits:** The browser page cannot verify Tor routing; the provider still sees request content; wallet-extension traffic is outside app control.

### TM7. Destination reuse without plaintext linkage — IMPLEMENTED_LOCAL

**Threat:** Repeated or known-wallet sweep destinations link payments; persisting the warning history can create an extra local linkage record.

**Current behavior:** Classifier warnings are wired into Sweep. The address-link ledger is in memory, reset on lock/session changes, protected by epochs against late results, and copied on read. The legacy plaintext key is deleted best effort and never imported.

**Source:** `apps/web/src/lib/sweep.ts`, `apps/web/src/views/Sweep.tsx`.

**Regression definitions:** `apps/web/src/lib/sweep.destinations.privacy.test.ts`, `apps/web/src/views/Sweep.test.tsx`.

**Current-session execution references:** E2.

**Remaining work:** Final combined qualification and actual browser lock/reload/session acceptance.

**Residual limits:** Warnings cover only the active session and are advisory. Earlier sessions/devices are not checked; denied storage can retain ignored legacy bytes.

### TM8. Private v4 checkpoint names — IMPLEMENTED_LOCAL

**Threat:** Public meta-address keys allow an observer of browser storage to test which seller was scanned.

**Current behavior:** Private HKDF-SHA256 v4 names use the correct loaded viewing key, chain and key identifier. Key lending/caches are session-bound. v1/v2 and both conflicting v3 formats are ignored and purged best effort; rescan is intentional.

**Source:** `apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanClient.ts`.

**Regression definitions:** `apps/web/src/lib/scanCursorSlot.test.ts`, `apps/web/src/lib/scanClient.test.ts`.

**Current-session execution references:** E1, E2.

**Remaining work:** Combined restart, storage denial, multi-tab and reorg browser acceptance; retain the rescan/migration disclosure.

**Residual limits:** Cursor contents remain plaintext/unauthenticated; opaque identifiers and block progress still reveal use. Public reconciliation/key-vault headers are a separate residual.

### TM9. Minimal receipts — IMPLEMENTED_LOCAL

**Threat:** A receipt unnecessarily adds the one-time address and increases linkability to the seller signer.

**Current behavior:** Receipt payload omits stealthAddress by default. An explicit checkbox is required to include it; both forms remain signed and bound to invoice/payment facts. #233 retains signature/tamper assertions in browser fixtures.

**Source:** `apps/web/src/lib/receipts.ts`, `apps/web/src/components/ReceiptPanel.tsx`.

**Regression definitions:** `apps/web/src/lib/receipts.test.ts`, `apps/web/src/components/ReceiptPanel.test.tsx`, `apps/web/e2e/pages-devnet.spec.ts`.

**Current-session execution references:** E2, E9.

**Remaining work:** Repeat the actual #233 Pages/browser journey at the final combined candidate. E9 proves upstream browser execution only; collection/component tests are not substitutes.

**Residual limits:** Transaction hash, chain, amount, invoice digest and stable signer still allow public-chain and peer linkage.

### TM10. Invoice confidentiality and identity rotation — PARTIAL

**Threat:** Plaintext invoice details and stable identity keys correlate invoices.

**Current behavior:** CreateInvoice defaults to encryption. The standard bearer link contains its key; passphrase mode is separate. Pay checks signatures and displays optional pinned-signer trust. Per-invoice signer selection is not implemented in the Pages creation flow.

**Source:** `apps/web/src/views/CreateInvoice.tsx`, `apps/web/src/lib/invoiceCreate.ts`, `apps/web/src/views/Pay.tsx`, `packages/invoice-schema/src/envelope.ts`.

**Regression definitions:** `apps/web/src/views/CreateInvoice.test.tsx`, `apps/web/src/test/pagesInvoiceTamper.test.ts`, `packages/invoice-schema/src/envelope.test.ts`.

**Current-session execution references:** E1, E2, E9.

**Remaining work:** Design and qualify per-invoice signer behavior if required, including trust/receipt compatibility. Run real encrypted-invoice and tamper browser acceptance.

**Residual limits:** Bearer-link holders can decrypt private details; public amount/chain and stable meta-address remain linkable. #234 does not force Pay UI to reject every unpinned signer.

### TM11. Relayer traffic and retention — PARTIAL

**Threat:** Quote and sweep reveal and correlate owner, destination, amount, IP and timing.

**Current behavior:** Web requests use fixed-size padding buckets; compatible server validation/ingress configuration and retention documentation exist. A specific old-server refusal permits one unpadded retry. Signed quote tuples remain part of the protocol.

**Source:** `apps/web/src/lib/relayerClient.ts`, `apps/relayer/src/server.ts`, `apps/relayer/PRIVACY.md`.

**Regression definitions:** `apps/web/src/lib/relayerClient.test.ts`.

**Current-session execution references:** No recommendation-specific executed result claimed here.

**Remaining work:** Separate optional-relayer compatibility and actual ingress qualification; a quote-less design needs fee/signature/protocol work. No hosted service is required by Pages.

**Residual limits:** Padding changes request size only. Operator/proxy/RPC retention and quote correlation remain. Real Tor ingress was not executed.

### TM12. Bulk receipt evidence — PARTIAL

**Threat:** Per-match receipt reads identify which announcements belong to the seller.

**Current behavior:** An optional cap up to 500 fetches router evidence for selected page transactions before local matching. Abort propagation now stops scheduling additional requests and invalidates late work; scanClient regression was independently rerun.

**Source:** `packages/chain-adapters/src/payments.ts`, `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanPrivacy.ts`.

**Regression definitions:** `packages/chain-adapters/src/payments.bulkCancellation.test.ts`, `apps/web/src/lib/scanClient.test.ts`, `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts`.

**Current-session execution references:** E2.

**Remaining work:** Measure complete RPC traces for covered/overflow/non-router pages and adversarial providers. Decide/document acceptable traffic cost and defaults rather than claiming general unlinkability.

**Residual limits:** Off by default. Bounds, fallback, other calls, second providers, timing and request volume limit privacy; already-dispatched requests remain observable.

### TM13. Non-EVM match privacy — DEFERRED_OUTSIDE_PAGES

**Threat:** Outspend and per-match balance requests reveal matched BTC/Solana/Tron addresses.

**Current behavior:** Retained full-profile source moves Solana/Tron balance reads to sweep. Bitcoin has local spend evidence with a provider fallback for unknown state; #219 consent/worker/header work remains separately valuable.

**Source:** `apps/web/src/features/btc/scan.ts`, `apps/web/src/features/solana/scan.ts`, `apps/web/src/features/tron/scan.ts`.

**Regression definitions:** `apps/web/src/features/btc/scan.localSpends.test.ts`, `apps/web/src/features/solana/chain.hardening.test.ts`, `apps/web/src/features/tron/chain.hardening.test.ts`.

**Current-session execution references:** No recommendation-specific executed result claimed here.

**Remaining work:** Consolidate #219 consent/worker/header semantics and separately qualify each experimental chain with external fixtures; do not enable those routes to finish the Pages beta.

**Residual limits:** Unknown spend state and signing can still require address/outpoint queries. None of these full-profile paths is certified by the Pages local results.

### TM14. Network selection and own-node enforcement — PARTIAL

**Threat:** A profile label may imply private routing while cached clients still reach a third-party provider.

**Current behavior:** Acknowledged per-purpose direct/Tor Browser selection and own-node policy are exposed in Settings. createSelectedRpc enforces allowed own-node targets before construction and every dispatch/retry; no direct fallback on policy refusal.

**Source:** `apps/web/src/lib/defaultServices.ts`, `apps/web/src/views/Settings.tsx`, `packages/net-transport/src/selection.ts`.

**Regression definitions:** `apps/web/src/lib/defaultServices.networkGuard.test.ts`, `apps/web/src/views/Settings.test.tsx`.

**Current-session execution references:** E2.

**Remaining work:** Real Tor/OHTTP/own-node/browser acceptance is absent; profile provenance and all request-purpose boundaries need independent network verification.

**Residual limits:** Tor Browser mode still uses ambient fetch and cannot prove routing. Endpoint syntax is not ownership proof; already-sent requests cannot be withdrawn. The validator permits plain-http loopback scan proxies, but the shipped CSP blocks them and the build allowlist parser excludes http; this compatibility gap remains open.

### TM15. Padded scan ranges and PIR research — PARTIAL

**Threat:** Precise range boundaries expose start/progress and activity correlation.

**Current behavior:** padBlocks is wired through scan-source.padRange and the fixed-window decorator with validated caps and head/grid bounds; default extra padding is zero. Active scan source choices are RPC and indexer, not PIR.

**Source:** `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/views/Settings.tsx`, `packages/scan-source/src/padded.ts`.

**Regression definitions:** `apps/web/src/lib/scanPrivacy.test.ts`, `apps/web/src/views/Settings.test.tsx`.

**Current-session execution references:** E2.

**Remaining work:** Qualify real-provider request counts/bounds and separately review any future experimental PIR integration. Do not label existing library code a shipped toggle.

**Residual limits:** Padding costs additional requests and does not hide IP, overall scan volume, timing or follow-on address/transaction queries.

## Executed evidence register

### E1 — `305ccb0d570c27a47435083059492edc819a0101`

Focused web 192 passed; invoice-schema 728 passed; ux-core 119 passed. These are lane results, not final combined qualification.

Coordinator owns the exact stage-1 command ledger; do not reconstruct an unrecorded selection from these totals.

**Artifacts:** `stage1-web-tests.log`, `stage1-invoice-tests.log`.

### E2 — `821d1035b3e8b20921904f5c3bf6411f22ea3346`

Privacy selection: 8 files, 174 passed after rebuilding affected libraries. Independent reviewer: bulk cancellation 6 passed and scanClient 92 passed. Counts overlap and are not additive coverage.

Independent reviewer selected the cancellation suite and scanClient suite with one worker; coordinator owns the privacy 8-file selection.

**Artifacts:** `privacy-focused-tests.log`, `analysis-ci/independent-bulk-cancellation.log`, `analysis-ci/independent-scan-client.log`.

### E3 — `0bbd8965`

Hosting selection: 135 web tests and 92 Pages/workflow script tests passed. Fixed root-error marker reporting. The later caught-root-render smoke correction is separate work.

See coordinator command ledger. Local tests do not establish an actual built-browser smoke pass.

**Artifacts:** `pages-hosting-web-green.log`, `pages-hosting-script-green.log`, `pages-error-red.log`.

### E4 — `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`

Recovery web selection 135 passed (12 files); core-crypto 75 passed; ux-vault isolated retry 348 passed with original coverage thresholds. Independent export UI/security-key selection 24 passed and overlaps the 135. Node recovery 15 passed/1 native-tool skip, then supplemental raw-key Anvil/cast case passed with Foundry 1.5.1; that run did not qualify required 1.8.5; see the later E10 execution.

Exact commands, environment and limits are in the recovery handoff. Some unchanged library source was built at 705ded7c; final web source is pinned here.

**Artifacts:** `analysis-security/recovery-web-final.log`, `analysis-security/recovery-vault-coverage-retry.log`, `analysis-security/recovery-node-after-build.log`, `analysis-security/recovery-raw-key-foundry151.log`, `security-tooling-evidence/recovery-independent-export-ui.log`.

### E5 — `0b67fa9fbd125b18412ef53a5d377ab5ccd460e2`

RPC 87; viewing-key boundary 1; deployment command 3; i18n 27; web display/hardening 59; Mythril helper 13; static helper 8; automation 27; unchanged security gates 33: all passed in their selections. Three affected library typecheck/lint scripts passed. No analyzer campaign or container rebuild was performed.

Exact commands and file hashes are retained under docs/handoffs/security-tooling-20261118. These totals are separate suite executions, not a whole-repository total.

**Artifacts:** `security-tooling-evidence/package-test-results.json`, `security-tooling-evidence/package-static-results.json`, `security-tooling-evidence/node-green-results.json`.

### E6 — `27e80199`

37 scan-privacy disclosure tests passed after removing the obsolete automatic-sweep-balance wording.

Coordinator-confirmed source binding; exact command in coordinator ledger.

**Artifacts:** `sweep-disclosure-green.log`.

### E7 — `ef464ee5`

Clean install, 77 library builds, 5 dependency tooling tests, 88 confidential-amounts tests and 73 privacy-pools tests passed; 4 existing artifact-dependent tests skipped. Production audit zero findings; full audit remains 14 high/16 low affected-package entries. Two web build attempts terminated 137 during TypeScript.

Exact commands and dependency hashes are in the handoff. This lane is not a full security-audit clearance.

**Artifacts:** `analysis-ci/dependency-audit-production.json`, `analysis-ci/dependency-audit-full.json`, `analysis-ci/dependency-build-libs.log`.

### E8 — `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`

4 catalogs checked, 0 errors, 434 fallback/existing warnings. Extraction: 2,229 used keys, 0 missing from English, 136 unused. Native-language review was not performed.

node scripts/i18n/check.mjs; node scripts/i18n/extract.mjs.

**Artifacts:** `analysis-security/recovery-i18n.log`, `analysis-security/recovery-i18n-extract.log`.

### E9 — `5ce26fc6023c048ecfcb81b959a939e673f9d0e9`

PR #233 Pages browser: 16/16; beta browser: 3/3, with CLI 124 and library acceptance passing. These jobs checked the upstream synthetic merge, not e85db1ef or the final combined candidate.

Actual hosted checkout and counts were read from job logs by the CI worker; the documentation lane did not rerun them. Check-runs on a synthetic merge may be empty because workflow records use the PR head.

**Artifacts:** `https://github.com/djshellshoxxx/GhostPay/actions/runs/44304211061/job/134801443002`, `https://github.com/djshellshoxxx/GhostPay/actions/runs/44304211191/job/134801441908`.

### E10 — `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`

Foundry 1.8.5 / solc 0.8.28: forge contracts 490 passed, 0 failed, 0 skipped across 34 suites. REQUIRE_ANVIL raw-key independent recovery: 1 passed, 0 failed, 0 skipped. These execute after the e85db1ef source snapshot; later vault cleanup is a separate source change.

Native toolchain/execution manifest is coordinator/CI-owned; actual totals were checked in retained logs. These do not replace final candidate browser, analyzer or release checks.

**Artifacts:** `analysis-ci/combined-forge-contracts-185.log`, `analysis-ci/combined-raw-key-anvil-185.log`, `analysis-ci/combined-foundry-config.json`.

### E11 — `e8c77e7e8699dd16b86b7a1ff90b834594d07105`

Four temporary-passphrase-byte regressions passed after four baseline failures. The fix owns and wipes the UTF-8 KDF input and returned raw key on success/rejection while retaining input until async derivation settles. Independent source review found no blocker. Immutable strings remain unwipable; the complete final package run is separate.

The coordinator executed the 4-case suite. The independent reviewer inspected committed source and hashes; no duplicated runtime run was performed.

**Artifacts:** `qualification/keystore-memory-red.log`, `qualification/keystore-memory-green.log`, `analysis-branches/KEYSTORE_SCRATCH_INDEPENDENT_REVIEW_20261118.md`.

## Material residual storage and trust limits

Keystore and recovery public headers remain readable. Reconciliation scope, encrypted record counts/chains/timing, and v4 cursor data remain visible. Wallet and sweep attempt journals are plaintext sessionStorage safety state retained across reload to prevent duplicate or uncertain sends; the removed destination-history record does not encrypt those journals. A private viewing key plus one exported one-time private key and its public announcement can recover the master spending key. JavaScript strings/browser-managed memory cannot be securely erased. No current code or evidence supports an anonymity claim.

The generic build CSP remains broad unless configured; a production allowlist and dedicated origin require qualification. Remote main/required checks and external approvals are coordinator-owned. The unresolved high development dependency advisories and unchanged failing/unavailable analyzer gates are not waived by these code improvements.
