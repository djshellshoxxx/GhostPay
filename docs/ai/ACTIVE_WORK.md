# P08 future specification — 2026-11-19

Worker: ChatGPT specification team; coordinator owns publication.
Branch: `future/p08-linkability-analysis`.
Source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; docs foundation: `524aa18bdcd307a3129bbb7a6b7e74838819331e`.
Owned path: `docs/future/modules/P08-linkability-analysis/SPEC.md` and this additive claim.
Acceptance: source-grounded modular contract, dependencies, failure/recovery,
privacy/fee limits, acceptance cases and planned checks; verified remote spec.
Documentation only: no implementation, main merge, deployment, activation or fee decision.
Existing source and other ownership claims are preserved.

# Future module specifications — 2026-11-19

Worker: ChatGPT coordinator with independent roadmap, branch and architecture reviewers.
Branch: `docs/ghostpay-future-module-specs-20261119`.
Base commit: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: new `docs/future/modules/**` and this additive claim.
Scope: 40 separate module specifications covering the 18 products, P01–P19,
T01/T02 and shared FEE01; preserve aliases and existing spec18 priority.
Acceptance: all source IDs covered, hard dependency graph acyclic, real code
reuse documented, independent branch/spec publication verified, documentation-only
diffs. No implementation, main merge, deployment, activation, fee decisions or release
changes. Feature branches append their own claim before their specification commit.

# Historical security promotion — 2026-11-19

Worker: `history_census`; branch: `integration/ghostpay-historical-security-promotion-20261119`.
Base/main: `e454de6abfefda70d82784fafc1d8949b277c334`.
Owned integration: exact PR245 `baa032547a16196005dccc30a247acd55d4f62c6` and
PR247 `20207a930336da95e78ad1d6f4987b3c74fc535a`, preserving both source parents,
all ownership claims and their existing evidence. Resolve registry append collisions only;
the focused main does not contain the broader master scanner changes.
Optional source-only guard: the two net-harness source/test hunks from PR253
`303ba1114fd78426162c4728f1778f66d64088f4`, excluding its major dependency train.
Acceptance: merged pool helpers/witness fixtures and AST source scanner equal reviewed
candidate source; untouched main content remains intact; bounded affected checks and
exact dependency provenance recorded. No circuit, contract, protocol, release or gate change,
no active source-branch overwrite, no remote mutation. Coordinator owns final publication/CI.

# Historical pool repair main reconciliation — 2026-11-19

Worker: actions_repair, assigned by the pre-merge reconciliation coordinator.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Starting local head: `a85896ab6bb1b60eee9c9ad4ddc0e43d9ede9645`; reviewed tree:
`7f85edb78d56c9c981ba1bc3745c3f3ccbeb07d8`. Merge target: main
`e454de6abfefda70d82784fafc1d8949b277c334`, independently observed after PR #242 merged.
Owned scope: this additive claim, preservation of the existing pool repair while
merging current main, and scoped validation evidence. Preserve both source histories,
all ownership sections, and the reviewed pool implementation/test blobs. Run the
19 helper tests on Node 22 and obtain independent integration-diff review. Source
conflicts require inspection; publication and hosted qualification remain coordinator-owned.

# Historical scanner repair main reconciliation — 2026-11-19

Worker: actions_repair, assigned by the pre-merge reconciliation coordinator.
Branch: `repair/ghostpay-history-scanner-20261118-local`.
Starting local head: `3db24b5496a2d1979a55757a2b83eb8dd362614b`; reviewed tree:
`96e15f7544b592bac8da065ad64188f56b0d9f4d`. Merge target: main
`e454de6abfefda70d82784fafc1d8949b277c334`, independently observed after PR #242 merged.
Owned scope: this additive claim, preservation of the existing AST scanner repair
while merging current main, and scoped validation evidence. Preserve both source
histories, all ownership sections, and the reviewed scanner implementation/test blobs.
Run all 88 scanner/privacy tests on Node 22, scan the resulting eligible production
sources, and obtain independent integration-diff review. Source conflicts require
inspection; publication and hosted qualification remain coordinator-owned.

# Browser network isolation: unowned transport gaps — 2026-11-18

Worker: ChatGPT lead with separate transport implementer and independent privacy reviewer.
Branch: `codex/ghostpay-browser-isolation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (live `main`).
Owned paths: `packages/net-transport/src/fetchTransport.ts`, `fetchAdapter.ts` and new focused
transport isolation tests; `packages/solana-stealth/src/rpc.ts`, `packages/tron-adapter/src/rpc.ts`
and new `rpc.isolation.test.ts` tests (chain adapter worker); `apps/web/src/lib/release.ts`, its
focused tests, a new browser network isolation spec; new machine-readable egress inventory
and scoped isolation documentation; new `scripts/tests/network-egress-inventory.test.mjs` and
independently authored `scripts/tests/network-isolation-native.test.mjs` QA. Both chain RPC files were checked against all 39 open
PRs, including new recovery #239 (`d2c64522`); no current PR changes either file.
Acceptance: reproduce and fix unintended redirect egress, cancelled/stale request dispatch,
unbounded transport failure and untrusted error disclosure in these paths; prove no fallback,
bounded failure and fixed error messages with controlled fixtures and browser requests. Record
source-pinned findings, exact checks and unresolved integration dependencies.
Status: implemented and independently re-reviewed in draft PR #241. Hosted first-head typecheck,
unit/integration suites and lean browser acceptance passed; 11 lint errors were corrected with their
adversarial assertions preserved. Final-head checks and the separately owned policy integration are
tracked in `docs/handoffs/BROWSER_NETWORK_ISOLATION_2026-11-18.md` and the PR.

Active inputs remain read-only: privacy #222 (`2bc20982`), own-node #228 (`685fe1a3`), Sweep
consent #231 (`d9ff3868`), browser fixtures #233 (`67cf835d`), integration #238 (`198aa5ba`),
recovery/keypair exports and Mythril remediation. Their UI, service policy, settings, scan,
Sweep, catalogs, consolidation ledgers and release gates are not owned by this task. The
five lower-level transport files were compared against these heads and are unchanged; this
lane extends existing adapters without a second policy engine. Recheck all heads before PR.

# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
The test file is imported from the separate review lane; product edits start after this claim. PR #209's frame and
unload changes remain on its own branch. No deployment, signing, publication, mainnet, or release-gate changes.

# Repository consolidation — 2026-11-18 (active)

Status (coordinator update): every worker lane below has completed and been integrated after review; the worker
branches were local only and are not pushed. Integrated as: specs `b20e1c98`; cigates `15c302cd`; mythril-expiry
`1fa4179f` (+ review `3f10fcaf`); tagarchive `0dda9ca1`; mythril-factory `afbce0a6` (+ review `1e1121b3`); reimport
`84b4e605` (+ `86b6e9e5`, `4a3d47d8`); echidna `81aa5e68`. Coordinator fixes: bundle scanner `b441cc64`/`5ddb042a`,
audit test `bbd24cd0`, blocked keystore download `cfb482f9`. Remaining work is coordinator-owned: final CI evidence,
census at the final head and the promotion packet. Open draft PR #204 (another session, base `main`) conflicts in
`.github/workflows/ci.yml` and `CLAUDE.md` and is not part of this consolidation.

Coordinator: Claude Code session (integration owner). Integration branch: `nodata/wizardly-allen-qwol6u`, created from
unified `beb525dd` (tree `36177d29`), main ancestry merged at `f5e10f84` (tree unchanged), Pages #200 lineage merged at
`d39e304a`. The coordinator alone owns this branch, the consolidation ledgers under `docs/handoffs/consolidation-20261118/`,
`package-lock.json`, this registry and the merge sequence. Worker branches are local task branches based on `d39e304a`;
each commits only inside its owned paths and is integrated by the coordinator after review.

| Worker branch | Owned paths | Acceptance |
|---|---|---|
| `consolidation/20261118-reimport` | `apps/web/e2e/core-journey.spec.ts`, keystore import/session lifecycle source and focused tests only as diagnosis requires | Establish the cause of the #201/#202 verified-keystore reimport timeout with synthetic secrets; minimal regression-backed fix; original stale-session assertions and #202 control both execute and pass. |
| `consolidation/20261118-tagarchive` | full-profile `TagArchive` component and its focused test | Port #193 blocked-click regression; cleanup on throwing click; success and failure messaging verified; lean bundle untouched. |
| `consolidation/20261118-specs` | `docs/specs/**`, `docs/future/privacy-architecture/**` | Integrate #190/#191; spec 18 canonical; privacy 5k corrected; unrelated future specs remain proposed. |
| `consolidation/20261118-cigates` | `.github/workflows/release.yml`, `contract-analysis.yml`, `nightly.yml`, workflow tests/runbook | Source-matched analyzer success becomes an enforced promotion condition; missing/skipped/cancelled evidence fails. |
| `consolidation/20261118-echidna` | `packages/contracts/test/echidna/**`, Echidna config/corpus/runner tests | Demonstrate >= 3 successful native policy withdrawals without lowering the threshold or weakening properties. |
| `consolidation/20261118-mythril-expiry` | new expiry-focused contract tests, expiry disposition record | Individual dispositions for the three expiry-timestamp Mythril records. |
| `consolidation/20261118-mythril-factory` | new factory-focused contract tests, factory disposition record | Individual dispositions for the eight factory/OpenZeppelin call-path Mythril records. |

Out of scope for every worker: protected-main merge, deployment, release signing/publication, Wiki publication, branch
deletion, real funds, new custody/authority surfaces, and spec 18 key-export implementation (next phase).

The ChatGPT "zero-codex" rotation automation is an active external writer on `chatgpt/zero-codex/*` branches (observed
pushes 2026-11-18 01:39-01:44 UTC). Those branches are read-only inputs here; heads are rechecked before integration.

> Current coordination status (2026-11-16): all listed source lanes have completed and their reviewed changes are integrated through `2962554d`. The claims below preserve history. Final hosted candidate qualification and development artifact verification are coordinator-owned; current gates are recorded in [the authoritative ledger](../handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md).

## Team H dedicated BTC scan worker — 2026-11-16

Worker: btc_worker, Caveman. Branch: `codex/unified-btc-worker`; base `a94989ce`.
Owned paths: BTC scan worker/client/protocol, scan.ts, BtcView and focused tests, browser acceptance, worker handoff.
Acceptance: responsive cancel through worker termination; bounded messages; ephemeral scan key copies; checkpoint acknowledgments preserve encrypted CAS commits; restored matches require fresh validation; no spend secret sent to worker or secrets sent over network/storage. No mainnet enablement or release claim.

## Team A hosted-CI reconciliation repair — 2026-11-16

Worker: ci_reconciliation agent, Caveman. Branch: `codex/unified-ci-reconciliation`.
Base: `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: CLI reconciliation source/test/helper files and `apps/web/src/components/ReconciliationLedger.invoices.test.tsx`; related reconciliation sources only after coordination.
Acceptance: reproduce hosted CLI and web matching failures, preserve canonical block-time semantics, repair their cause, pass focused and broader affected tests, typecheck/lint, independent review and source-pinned handoff. No dependency, BTC or other web-test ownership.
Status: completed at product source `e79821d3`, compiled fixture `612d3c35`. Full CLI 570/570, compiled acceptance 21/21, native devnet acceptance 124/124, browser ledger 36/36 and independent time regressions 9/9 passed. Coverage, typechecks, scoped lint and build passed. See `docs/handoffs/agents/TEAM_A_CI_RECONCILIATION.md`.

## Team H encrypted BTC scan continuity — 2026-11-16

Worker: btc_persistence agent, Caveman. Branch: `codex/unified-btc`; base `f783f14e`.
Owned paths: `apps/web/src/features/btc/scan*`, `BtcView*`, wallet documentation and scoped tests; package scan-state interfaces only if required.
Acceptance: opt-in encrypted wallet/network-scoped IndexedDB state; per-block crash/cancel resume; canonical reorg rollback; no persistent secret/tweak bytes; restored outputs require fresh source/header validation before sweeping; stale-session and cross-tab writes fail closed. Reuse existing HKDF/AES-GCM and transactional CAS patterns. No mainnet enablement or external-node qualification claim.

# Unified completion coordinator — 2026-11-16

Owner: root coordinator. Branch: `codex/ghostpay-unified-completion`; base `0c4c3c8d951a9d6e71affcdaa26478911c8037f1`.
Owned paths: integration conflicts, locale/security catalogs, master completion ledger, final evidence and handoffs.
Acceptance: preserve source ancestry and verified behavior; classify new identity/privacy disclosures; run combined-head checks and record remaining gates. Worker branches own their separate modules; no protected-main merge, deployment, signing or release.

## Historical and worker claims

## Ops-monitor W3 streamed artifact cap — 2026-11-16

Worker: current Codex child agent. Branch: `codex/ghostpay-ops-response-cap-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `packages/ops-monitor/src/fetcher.ts`, focused fetcher tests, this registry, task handoff.
Acceptance: enforce release-artifact byte cap while streaming; refuse oversized declared lengths without consuming the
body; cancel rejected streams without waiting on a remote cancel promise; preserve exact-limit bytes, malformed/missing
length handling and UTF-8 bytes split across chunks.
Status: implemented. Full package suite passes 113/113 with 98.01% statements, 93.59% branches, 97.72% functions and
99.78% lines; package typecheck/build and focused ESLint pass. Full package lint terminated with exit 137; external
HTTP receiver acceptance was not run.
## Team A unified reconciliation review — 2026-11-16

Worker: reconciliation agent, Caveman workflow. Branch: `codex/unified-reconciliation`.
Base: `27852ba898968a08f7d7c448fac8b19058189281` (PR #186).
Owned paths: chain-adapters logs/rpc/scanVerify and tests; vault reconciliation modules/tests; web scanner and reconciliation libraries/tests.
Acceptance: canonical header timestamps survive scanning and encrypted persistence; provider disagreement, reorg, imported history, duplicate conflicts and finality remain fail-closed; exact bigint arithmetic is preserved. Run targeted tests, correct reproduced defects, and provide a source-pinned handoff. No public-chain writes or release qualification claim.

## Historical and worker claims

## Canonical block-time reconciliation — 2026-11-16

Worker: canonical-time implementation agent. Branch: `codex/ghostpay-canonical-time-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: chain-adapter block references and announcement scanner; portable reconciliation record/matcher;
reconciliation tests and related security-key/locale entries if new message key is needed; this registry and handoff.
Acceptance: only timestamp from a canonical block header matching announcement block number/hash can establish
invoice timing; new verified late-scanned pre-expiry payments can match; post-expiry payments remain ambiguous;
legacy/imported records without block timestamp never become exact through wall-clock fallback; optional field keeps
old vault data readable; reorg and backup/import behavior remain sound.
Status: implementation and regression coverage complete. `git diff --check` and locale JSON/key parity pass; `npm ci --ignore-scripts --no-audit --no-fund` exited 137, so focused tests, typechecks and build cannot run here (Vitest and TypeScript unavailable).

## Unified registry ENS lookup — 2026-11-16

Worker: Team B registry. Branch: `codex/unified-registry`. Base: `365a1c38`.
Owned paths: chain-adapters registry and ENS helpers/tests/index exports; web registry view/tests;
`docs/handoffs/agents/TEAM_B_REGISTRY_UNIFIED.md`.
Acceptance: explicit ENS lookup uses only the selected, already-validated Ethereum or Sepolia RPC;
normalizes names, validates returned addresses and meta-addresses, never follows offchain gateways,
and rejects stale UI results. No cross-chain fallback or delegated signing/sending UI is added.
Locale additions are coordinated with the integration owner.
## Unified Team D — verified matrix — 2026-11-16

Worker: matrix; branch `codex/unified-matrix`; base `365a1c38`.
Owned paths: `packages/chain-adapters/config/matrix.json`, `scripts/check-chain-matrix.mjs`,
`scripts/lib/chain-matrix.mjs`, companion tests, release gate wiring and operator matrix documentation.
Acceptance: all configured chains/tokens/feeds have provenance-aware cells; malformed or mismatched data fails;
release verification refuses every enabled chain with an unverified required cell. Existing development configuration
remains available. No deployment addresses, code hashes, source attestations or runtime verification are invented.
Status: implementation in progress; external deployment/RPC acceptance remains pending.
## Unified observability review and completion — 2026-11-16

Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source.
Status: matrix implemented at `aa1d5153`; quote-decimal agreement implemented at `39f79175`. Targeted checks passed; final combined web typecheck/CI and external deployment/RPC acceptance remain pending.
Follow-on ownership: `packages/chain-adapters/src/quote.ts` and tests; `apps/web/src/lib/pay.ts` and tests.
Acceptance: configured feed decimals must agree with the RPC result before any quote/payment request is produced;
generic standalone `readPrice` callers may omit the expected-decimals parameter.
## Team B/I template issuance follow-on — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `e84e72d9`.
Owned paths: merchant template issuer component/helper/tests, merchant profile panel, SDK v2/tests,
`invoiceCreate.ts` exact-second expiry support and tests, related specification/user docs. Catalogs remain coordinator-owned.
Acceptance: only a matching loaded signer with verified backup or prior explicit waiver may create a new signed
invoice from a verified template; exact minor amount, chain/token allowlists, requested expiry and stale-state guards
must hold. Optional amount requests require signed `allowAmount`; they never edit an existing payer invoice.

## Team B/I unified merchant embedding — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `365a1c38`.
Owned paths: `App.tsx`, merchant-profile components and tests, `embedHost.ts` and tests,
`merchantIdentity.ts` and tests, embedding documentation. Catalog changes belong to the coordinator.
Acceptance: explicit HTTPS loading with bounded/cancellable fetch; verified signed profile presentation;
user-confirmed source-origin/full-key pins, mismatch warnings without silent replacement; signed template display
without changing or authorizing an invoice. Remains excluded from the lean Pages profile.
Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source. Completed through `364efaf3902351886eb2baa739e8e0dc70101617`: bounded webhook lifecycle, rejection detector, exact gas/loss/fee and quote counters, latency histograms, log severity and native authenticated scrape. Full relayer gate 443/443 with zero skips; coverage, typecheck, build and full lint pass. Independent agent review found no blocker. Provider-disagreement and stale-feed detectors remain dependent on absent provider/feed inputs. See `docs/handoffs/agents/TEAM_C_UNIFIED.md`.

# Active AI work registry

## Registry bundle egress correction — 2026-11-16

Worker: Team B registry. Branch: `codex/fix-registry-bundle-egress`. Base: `53d2163be5f7eaa8592750649d54df06b133b80c`.
Owned paths: `packages/chain-adapters/src/registryEns.ts`, its tests, this claim and the correction handoff.
Acceptance: preserve selected-RPC-only ENS behavior while eliminating the viem PublicClient/default-chain dependency
graph; reproduce the unchanged full and lean bundle guards before correction, then pass both real builds and scans.
No host allowlist, source guard, security policy, RPC default or test threshold may be weakened.

## Relayer observability spec 07 completion — 2026-11-16

Worker: current Codex worker. Branch: `codex/ghostpay-observability-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `apps/relayer/src/config.ts`, `server.ts`, `runtime.ts`, `alerts.ts`, `metrics.ts`, `metricsServer.ts`,
their focused tests, `apps/relayer/README.md`, `docs/operators/relayer-monitoring.md`, this registry.
Acceptance: add opt-in loopback metrics listener, authenticated `/metrics` and `/v1/stats`, signed HMAC-SHA256
alerts with 15-minute per-event/chain dedupe, and safe shutdown. Preserve request-path behavior. Add endpoint,
signature, privacy, SSRF and shutdown tests.
Handoff: local implementation committed on this branch. `git diff --check` passes. `npm ci --ignore-scripts --no-audit --no-fund` exits 137. Targeted Vitest cannot load `vitest/config`; typecheck lacks `tsc`; lint lacks `eslint`. No test suite, typecheck, lint, real Prometheus scrape, or receiver acceptance completed. Keep spec 07 partial until real scrape and receiver acceptance pass. Exact source pin is in task handoff.

## Merchant identity localization and security classification — 2026-11-16

Worker: current Codex session using Caveman workflow. Branch: `codex/ghostpay-caveman-followup-20261116`, base
`4ee9dd770826e705cb8c2437a53cf6714a003635`.
Owned paths: `apps/web/locales/{es,ja,ar}.json`, `apps/web/src/i18n/securityKeys.ts`,
`apps/web/src/i18n/securityKeys.test.ts`, this registry.
Acceptance: match all source catalog keys in locale drafts; classify merchant identity verification disclosures as
security-critical so unreviewed translations cannot replace English; pass catalog and security-key regressions.
Status: locale/security source fix implemented. GitHub logs confirmed 12 locale-key validation errors and the exhaustive security-key census failure on the 4ee9dd77 candidate. Reviewed #178 recovery: current source already revokes its Blob URL and removes the anchor on click or append failure; current tests cover both paths, so #178 source change is superseded. Local dependency installation is unavailable (npm ci exits 137); catalog shape and diff checks remain available. Exact-head hosted CI is still required.

## Registry builder acceptance — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-registry-lifecycle-20261116`, base `7a208005`.
Owned paths: web `features/registry/registry.anvil.test.ts`, this record, continuation evidence.
Acceptance: the recovered builders execute against the local reference registry; a valid delegated registration works,
replay fails, nonce invalidation rejects a previously signed update and fresh authorization succeeds. No public-chain
transaction, wallet signing UI or production contract modification.
Completed: five native Anvil/reference-registry tests passed with zero skips, web typecheck and focused lint passed.
Local reference compiler is solc 0.8.38; hosted pinned-compiler checks remain required.

## Merchant profile stream cap — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-profile-cap-20261116`, base `beb99464`.
Owned paths: web `embedHost.ts`, `embedHost.test.ts`, `e2e/reconciliation.spec.ts`, and this record.
Profile tests: 47 plus 77 integration/privacy cases passed; web typecheck/full lint passed.
Also scope the reconciliation browser assertion to the invoice identity paragraph after the amount summary added a
second nested hint. Preserve the digest, language-change, backup import and lock assertions. Baseline #182 browser
CI reproduced the strict-selector failure; final browser execution remains required.
Acceptance: enforce the existing 8192-byte profile limit during streaming, cancel rejected responses without waiting
on remote cancellation, preserve signed-profile verification and fetch privacy options, and test exact boundaries,
lying/missing length headers and split UTF-8. No UI/network enablement or new endpoint is introduced.

## Custody recovery — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-custody-caveman-20261116`, base `47f92f6f`.
Owned paths: `keystore-portable.ts`, web `keyVault.ts`, `keyVault.test.ts`, `keystore.test.ts`, and the SellerKeys comment.
Recover the two isolated custody fixes from `dded4c02` and `f12f9418`, reproduce their regressions against the published
candidate, then qualify normalized password policy and verified-copy checks before integration. No other local branch
payload is imported. Recovery source and final checks must be recorded in the continuation handoff.

## Caveman continuation — 2026-11-16

- Worker: current Codex session, sequential implementation and review.
- Branch: `codex/ghostpay-caveman-completion-20261116`.
- Published base: `b4be8866f6ff883fbbedc49be88b5b251a7d270e` (#179). Recovery inputs: #180 and #181.
- Owned paths: `packages/ux-vault/src/reconciliation-amounts*`, `portable.ts`; web invoice summary and reconciliation ledger components/tests; associated locale/security keys; registry builder verification; relevant completion documentation.
- Acceptance: exact bigint invoice totals from explicit live final-at-scan links; scope-wide conflict rejection and deduplication; no inferred linking or settlement claim; UI wiring and translation safeguards; package builds, regression/property tests, typecheck and lint. Validate recovered analyzer and registry helpers before publishing.
- Status: implemented; final hosted checks pending. Existing source branches remain unchanged. This record supersedes no other worker claim.

The same branch also owns integration review of #164's `payer-sponsor`, `pool-relayer`, QR warning and source-gate
changes. Acceptance includes preserving both sets of linear-parser regressions and rejecting invalid queue limits.

This file is a coordination template, not a live lock service. Always inspect open PRs and branch heads before relying on it.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| Codex browser cleanup worker | `codex/ghostpay-download-cleanup-20261116` | `f6728033258edf203f35fe1a064660fb6ff233ce` (test-only #178) | `apps/web/src/components/Common.tsx`; `apps/web/src/components/Common.test.tsx`; this registry | Failed downloads preserve the thrown error and release the Blob URL and temporary anchor; successful downloads retain the deferred revocation window | Implemented; test-only `1ed3926b` reproduced 2 failures / 12 passes, corrected suite 14/14 passes and targeted ESLint passes. Combined-tree typecheck/build/CI still required. |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | Integrated locally; coordinator owns final combined-head verification |

| Codex historical preflight review | `codex/ghostpay-policy-preflight-20261116` | `d239d520294513114e686bd2d2e94422436fb327` | Read-only policy send/journal assessment; this registry and consolidation ledger | Verify whether historical remediation is safely recoverable; run current behavior tests | Complete: historical patch already intentionally rejected; 37/37 focused tests passed |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | In progress |
| Codex linear parser worker | `codex/ghostpay-linear-parsers-20261116` | `30733000` | `packages/i18n/src/ux/readability.ts`; readability regression tests; `packages/ops-monitor/src/fetcher.ts`; fetcher regression tests; this registry | Remove confirmed polynomial regex paths while preserving sentence and URL semantics; pass adversarial-input regressions and seeded equivalence checks | Implemented. Test-only `28a94f25` reproduced both performance failures. Corrected full suites: i18n 213/213, ops-monitor 106/106, coverage gates pass; 2,000 seeded equivalence cases pass; both typechecks and i18n lint pass. Ops-monitor lint terminated by local memory limits (exit 137); CI required. |

Incoming Pages #173–#177 records are preserved in their source history; their fixes are integrated here for combined-head validation. This branch owns only consolidation, not the original workers’ branches.

Workers should update their task-branch copy and communicate ownership through the PR description. Do not treat absence from this table as proof a path is free.

| Fuzz harness QA | `codex/ghostpay-fuzz-harness-20261116` | `d26418c2539619fb75783a82886a96971142d226` | `packages/contracts/scripts/run-echidna.sh`, `scripts/tests/echidna-runner.test.mjs` | Reject missing/duplicate/unknown property results and abnormal exits; require all real properties passed and all canaries failed; validate with offline executable fixtures | Complete: 13/13 offline runner regressions passed; bash syntax and diff checks passed; real Echidna campaign not run |
| protocol_qa | codex/ghostpay-protocol-qa-20261116 | d26418c2539619fb75783a82886a96971142d226 | packages/ux-vault/src/reconciliation-portable.ts; apps/web/src/lib/reconciliationMatch.test.ts; apps/web/src/lib/reconciliationVault.invoices.test.ts | Imported historical annotations cannot reserve a current invoice; verified live links still reserve it; encrypted import/confirmation and bounded property regressions pass | Implemented; 3 regressions RED before fix, 28 matching/vault tests GREEN, 150 property cases, typecheck/lint passed; full coverage retry pending after worker SIGKILL |
| spec-acceptance worker | codex/ghostpay-pages-runtime-acceptance-20261116 | 30733000 | apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/devnet/pages.ts if needed; docs/handoffs/GHOSTPAY_SPEC_STATUS_2026-11-16.md | Built Pages artifact handles same-nonce cancellation without false payment success or duplicate send; seller profile survives browser-process restart with encrypted vault, checkpoint and reconciliation intact | in progress |
| security_notes | codex/ghostpay-security-20261116 | d26418c2539619fb75783a82886a96971142d226 | PolicyReceive.tsx; PolicyReceive.regression.test.tsx; policyTime.ts/test; relayer config.ts/config.test.ts/ops.test.ts/README.md | Preserve fresh withdrawal-attempt discovery, render arbitrary chain timestamps without throwing, require explicit development/test mode for ephemeral relayer state; targeted regressions and lint/typecheck | implemented; targeted verification complete; independent review requested |
| security_notes | codex/ghostpay-security-20261116 | 1acb7b79 | packages/cli/src/invoice-parity.test.ts; packages/payer-hiding-contracts/test/GhostPayErc4337.t.sol; security remediation note | Assert disabled-chain inspection classification and fuzz EntryPoint rejection of inverted paymaster windows without deposit expenditure | implemented; 11 CLI tests and 10,000 inverted-window fuzz cases passed |
| Mythril gate QA | `codex/ghostpay-mythril-gate-20261116` | `b4be8866` | `packages/contracts/scripts/run-mythril.sh`; `scripts/tests/mythril-runner.test.mjs`; this registry | Reject abnormal tool exits and malformed/incomplete reports; preserve pinned analyzer invocation; prove gates with offline executable fixtures | Complete: test-only `5e7c23c3` reproduced 9 failures / 10 passes; corrected Mythril fixtures 19/19 and existing Echidna fixtures 13/13 pass; bash syntax and diff checks pass. No real symbolic-analysis run claimed. |

## Coordinator status — 2026-11-16

All scoped worker patches above are integrated locally and source-reviewed in PR #179. The coordinator owns
final combined-head CI and the completion task ledger. Earlier in-progress statuses describe original worker
claims; they do not imply that those source branches were modified or that release gates passed.

| Codex registry builder worker | `codex/ghostpay-registry-recovery-20261116` | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | `packages/chain-adapters/src/registryDelegation.ts`; companion tests; `src/index.ts` export; scoped spec audit note | Match canonical ERC-6538 calldata; validate registrants/keys/signature bytes; retain opaque ERC-1271 signatures; no sends, signing, pins or UI enablement | Recovered from recorded source after environment loss. 40 focused tests/3 files and 200 seeded cases passed locally. Typecheck/lint killed137; build/export and recovered-tree verification pending. |

## Unified independent security and authority review — 2026-11-16

Worker: Team J (`security_inventory`). Branch: `codex/unified-audit`. Base: `365a1c38770ba02826d7e039dbeef44e5a966323`.
Owned paths: this claim and `docs/handoffs/agents/TEAM_J_UNIFIED.md`; product edits require coordinator notification first.
Acceptance: independently inspect PR #184, execute supported security gates, inventory authority-model and external-adapter blockers, and reconcile relevant historical branch provenance without claiming an external audit.
Team B/I milestone: implementation `4655bab8` is committed. Final focused integration has 116 passing tests and
web typecheck/focused lint pass, using coordinator catalog overlay `cb6a3de3`. Independent reviewers found and
rechecked pin concurrency, stale consent and remote iframe corrections. Browser acceptance is added but unrun.
See `docs/handoffs/agents/TEAM_B_UNIFIED.md`; coordinator owns final combined-head qualification.

## BlindBit gRPC-Web adapter — 2026-11-16

Worker: fresh Team H transport, Caveman workflow. Branch: `codex/unified-blindbit-grpc`; base `492cc20d`.
Owned paths: new btc-silent-payments scan gRPC-Web adapter/generated schema/tests, index export, package dependency/lock additions, transport provenance and handoff. Existing scan state/BTC UI remain owned by Team H persistence.
Acceptance: explicit HTTPS endpoint, no wallet key request fields, bounded/cancellable unary frames, strict protobuf/domain validation, network/hash agreement, exact satoshi amounts, pinned MIT provenance. Live proxy/oracle qualification remains external.

Follow-up: coordinator authorized the isolated `packages/contracts/scripts/run-echidna.sh` and
`scripts/tests/echidna-runner.test.mjs` correction after the checksum-pinned native 2.2.7 campaign completed
300,021 Router calls and emitted final `passing` property statuses rejected by the prior parser. Require the
completed configured call budget while retaining abnormal-exit, complete-inventory and failing-canary checks.
Independent review requested from `final_review`; no contract or analyzer setting changes.

Hosted follow-up authorized by coordinator: extract Echidna/Mythril into a read-only, path-scoped PR and reusable
workflow called by nightly; preserve analyzer settings, failing outcomes and bounded source-pinned report artifacts.
Owned additional paths: `.github/workflows/{nightly,contract-analysis}.yml`, contract script compatibility/report
helpers and `scripts/tests/contract-analysis-workflow.test.mjs`. No dispatch, publication, release or deployment.

Team B/I follow-on: `5d36ac5d` implements merchant-key-authorized template issuance and signed-permission amount
requests. Final focused integration: 115 tests passed; full web typecheck/focused lint passed. Independent final review
is source-pinning this commit. Profile-only automatic checkout remains a documented destination/fee/pricing/signature
schema or signing-transport decision; it is not a missing local merchant signing path anymore.
## Coordinator hosted-CI regression repair — 2026-11-16

Worker: root, Caveman. Branch: `codex/ghostpay-unified-completion`; base `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: `apps/web/src/lib/relayerClient.ts`, its tests, and `tagArchive.test.ts`.
Acceptance: reconcile browser pre-broadcast classifications with the current public relayer API; preserve unknown-response refusal safety; guarantee the archive-corruption fixture changes ciphertext; run focused regressions and independent review. CLI and ledger fixtures are owned by ci_reconciliation separately.

## Dependency remediation — 2026-11-16

Owner: dependency agent, Caveman workflow. Branch: `codex/unified-dependencies`; base `ab5039a3da0a1653df85b8ecbda6973947827547`.
Owned paths: workspace package manifests, package-lock and dependency evidence/handoff.
Acceptance: fix confirmed compatible security updates, preserve runtime/protocol pins unless necessary, audit exact resulting lock and verify affected tooling. Do not force major migrations to conceal remaining findings.
Status: implementation `379fe300` preserves all production lock records; complete audit is 17 low findings, production audit zero. npm 10 clean install, five dependency integration checks, affected lint, Hardhat compile/typecheck and 39 router/chain-guard tests pass. Full FHE fuzz and npm 11 clean install exited 137 locally and remain unqualified. See `docs/handoffs/agents/TEAM_J_DEPENDENCIES_UNIFIED.md`.
## Team D optional quote protections — 2026-11-16

Worker: price_gates, Caveman. Branch: `codex/unified-price-gates`; base `b0b7afa9de68510b821cc702a0f82847a205495b`.
Owned paths: `packages/chain-adapters/src/quote.ts`, quote tests, spec-03 status and this handoff. No dependency, relayer signed-quote ABI or web caller edits.
Acceptance: configured sequencer outage/grace, fresh reference-feed deviation and USD peg checks fail closed with exact bigint boundaries; standalone conversion rejects malformed price precision; no invented feed addresses or activation claims. Required production pins, external feed tests and relayer protocol integration remain separately recorded.
## Fresh final integration review — 2026-11-16

Owner: final_review, Caveman workflow. Branch: `codex/unified-final-review`; initial review base `f5142b19a6868f155b682eed50f606603cb68b97`, documentation worktree base `53d2163b`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md` and this claim only. Product sources remain read-only.
Acceptance: inspect cross-module authority, runtime export/build-profile, network and concurrency boundaries of the integrated candidate and newly completed workers; pin findings to source, verify corrections independently where practical, and distinguish source review from release or external audit qualification.

Milestone: reviewed the pinned sources in `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md`; no additional blocking source defect found. Independent focused merchant tests 21/21 and Echidna parser fixtures 22/22 passed. Coordinator owns final combined-source qualification. Follow-up dependency remediation is outside this milestone until its source is ready.

Follow-up: reviewed the dedicated BTC worker, dependency remediation, CLI canonical-time propagation, relayer refusal classification and optional price guards at the exact revisions in the handoff. Worker network/artifact and late-response cleanup findings were corrected before clearance. Independent additional selections passed: worker/bridge 16/16, dependency tooling 5/5, CLI timing 9/9 and quote guards 19/19. All clearance is source-scoped; final combined-head gates and external acceptance remain coordinator responsibilities.

Current follow-up: hosted analyzer workflow source cleared at `6fb739ed` with 5/5 independent helper/workflow tests; pure Bitcoin output proof helper cleared at `a4496071` with 34/34 tests after coinbase exclusion. Relayer feed/provider source cleared at `87f3dd50` with 29/29 independent tests after correcting a feed-validity deadline lost across nonce/signing awaits. Integrated Bitcoin source/light-mode product source cleared at `d9ba1253` after mandatory proof integration and bounded tweak cleanup, with 34/34 independent tests and a final 12/12 worker rerun. Coordinator-owned critical locale integration and combined artifact/browser gates remain separate.

## Team H source selection, full-block cross-check and light inclusion proofs — 2026-11-16

Worker: btc_sources, Caveman. Branch: `codex/unified-btc-sources`; base `25bbf1e3c87b9b2d8feeeeaca804027511b18608`.
Owned paths: Bitcoin view, scan source composition, typed worker oracle bridge and focused tests; spec-12 source status and handoff. Root owns locale catalogs and security-key classification.
Acceptance: optional user-selected BlindBit HTTP or HTTPS gRPC-Web data must agree with every locally verified Esplora block before results or checkpoints are accepted; exact network and full-index capabilities; no worker network API or keys in source requests; bounded/cancellable transport; source edits invalidate prior work; encrypted history is freshly revalidated. Preserve own Esplora mode A and stronger full-block Merkle/witness checks. No mainnet enablement, invented endpoints, hosted scan-key mode or SPV-only claim.


Scope continuation: parent explicitly authorized light oracle scans with mandatory per-match raw-transaction/Merkle proof against checked headers, current outspend checks, optional full second-source agreement and accurate omission/privacy limitations. No separate direct-bitcoind adapter is required for the existing own-node Esplora architecture.

Team H source status: implementation `d5632c9e` plus review follow-up `d9ba1253` complete and independently source-cleared. Scoped oracle/UI/transport/policy tests and all 17 chain-view outcomes pass; final web typecheck/scoped lint/full+lean build and unchanged bundle guards pass sequentially. Root owns critical locale merge and combined artifact/browser gates. Handoff: `docs/handoffs/agents/TEAM_H_SOURCES_UNIFIED.md`.

## Team C/D configured source checks — 2026-11-16

Worker: relayer_sources, Caveman. Branch: `codex/unified-relayer-sources`; base `ccd7721a797ae8b1d73adfd8568c7227d5a356c9`.
Owned paths: `apps/relayer` source/config/tests, operator monitoring documentation and this handoff. No dependency or signed-quote schema changes.
Acceptance: opt-in canonical-header agreement compares two actual configured providers; configured registry-feed pricing fails closed on stale/invalid rounds without fixed fallback; quote expiry cannot exceed feed validity; truthful bounded telemetry; source-pinned tests and independent review. Existing fixed pricing remains a separately documented legacy mode.
Status: final source `87f3dd50`; independent review and 29 focused tests passed. Full native-inclusive relayer gate passes 475/475 with original coverage thresholds, full lint/typecheck/build. Quote ABI remains unchanged; production source pins, live acceptance and signed round-identity schema remain explicit gates. See `docs/handoffs/agents/TEAM_C_SOURCES_UNIFIED.md`.

## Team G escrow supporting model — 2026-11-16

Worker: escrow_support, Caveman. Branch: `codex/unified-escrow-support`.
Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: `scripts/experimental/milestone-escrow/**`, spec 17 implementation status,
escrow reuse/research documentation, and `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Acceptance: isolated, unaccepted deterministic stage model; explicit dispute/release variants;
exact conservation, domain/replay, timing, terminal-state and canonical replay evidence;
decision table with custody/dispute/recovery consequences; independent review.
No guardian-model duplication, product import, Solidity custody contract, admin authority,
dependency change, UI activation, deployment or claim that spec 17 is complete.

Milestone complete: source `307f9008`; standalone 19/19 tests, model 100% line/branch/function
coverage, and independent source/test review by `final_review2`. All 42 state/action pairs and
15,444 bounded transition attempts are covered. Handoff: `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Authority decisions and product escrow implementation remain blocked; no fund path was enabled.

## Team I final hosted browser repairs — 2026-11-16

Worker: browser_finish, Caveman workflow. Branch: `codex/unified-browser-final`; base `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: browser reconciliation fixtures, skip-link focus and pairing error behavior/tests; browser handoff. No locale, BTC source, relayer or native registry edits.
Acceptance: explain checkpoint55e8 hosted browser failures from exact logs; preserve canonical payment authority and all accessibility/rejection assertions; fix source bugs with focused regression evidence; record local browser launch limits honestly.

Team I browser repair milestone: source `9642e75a` repairs skip-link order and canonical RPC test evidence; 77 focused DOM tests, typecheck and scoped lint passed. Pairing generic-status browser failure remains explicitly pending hosted rerun with stronger diagnostics and unchanged original assertion. See `docs/handoffs/agents/TEAM_I_BROWSER_FINAL.md`.

## Fresh final delta review — 2026-11-16

Owner: final_review2, Caveman workflow. Branch: `codex/unified-final-delta-review`; base `191bbce3c30d94b8f48f767b7ab77ec739e62b9a`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md` and this claim. Product sources are read-only.
Acceptance: independently review new delegated registry signing, isolated escrow supporting harness, corrected worker fetch injection/CI setup, browser regression repairs, and oracle critical-message integration. Preserve prior reviewed-source evidence and separate execution, external acceptance, and final-candidate gates. Record findings at exact source pins and execute bounded focused regressions when available.

Review milestone: source-scoped delta review complete in `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md`. Independent workflow 5/5, worker/privacy 51/51, locale 12/12, delegated helper 53/53, native registry 9/9, escrow model 19/19 and browser DOM 34/34 passed. Hosted pairing rejection status remains pending actual browser rerun; final combined qualification remains coordinator-owned.
# Qualified source promotion — 2026-11-18

Worker: ChatGPT integration coordinator. Branch: `integration/ghostpay-qualified-fixes-20261118`.
Base: `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` (reviewed PR #241 merged into main).
Owned paths: integration of already independently reviewed #237, #227, #234 and #235; their nonconflicting source/tests;
this registry and `docs/consolidation/master-20261118/QUALIFIED_GROUP.md`.
Acceptance: preserve all source parents and worker claims, qualify the combined tree against current main, independently review,
then merge only with successful applicable checks. Existing strict Mythril release failure remains explicit and unchanged.
No deployment, release, branch deletion or shared-branch rewrite.



## Beta acceptance log artifact capture — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-beta-log-artifact-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main).
Owned paths: `.github/workflows/beta-acceptance.yml`; this claim;
`docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.

Acceptance: trace the observed missing artifact in run `44279444368`, job `134715943959`, to the retained
log paths and the exact pinned upload action behavior; enable hidden-file inclusion only for the existing
`scripts/beta/.state/*.log` upload. Preserve the path, artifact name, retention, permissions, failure behavior,
acceptance commands and every existing gate. Run existing relevant workflow/action checks and inspect the
exact diff; add no setting-mirroring test. No product/dependency change, new infrastructure, deployment,
workflow rerun, publication or upload of state JSON/private fixture material.

Status: workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377` adds only the requested boolean
input. Existing workflow checks pass 6/6 with no skips; action-pin check passes all 111 references;
`git diff --check` passes. Coordinator and privacy reviewer independently cleared that exact workflow
source after checking the pinned upstream filter, retained logs and unchanged upload scope. No new test,
dependency, build, upload or rerun. Hosted artifact existence remains unverified; early failures can still
precede log creation, and the earlier browser acceptance failure remains red. Evidence and integration
limits: `docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.

# Historical source-sink scanner reconciliation — 2026-11-18


# Historical pool input guard recovery — 2026-11-18

Worker: history_review, coordinated by the pre-merge repair lead.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `packages/pool-circuits/src/inputs.ts`, `src/helpers.test.ts`, `test/witness.test.ts`,
the package `DEVIATIONS.md`, this claim and a scoped merge-readiness handoff.
Acceptance: recover the existing historical nonzero-input guards from
`ea1f0b244f0adf4794e55cda6dc7dbd1e5f4039c` and property regression from
`768b1f4cc86638e747cb1553297d012973c4cbb0`; reproduce the present helper/contract
mismatch, preserve valid positive values and full withdrawals, and qualify the
minimal repair independently. All 44 open PR file lists were checked; none
changes the two owned source/test paths. The existing pool circuit constraints,
proof artifacts, contracts, crypto, dependencies, deployment and security gates
remain outside this scope. The coordinator owns publication and integration.

Owned paths: `apps/web/scripts/scan-bundle.mjs`, its `.d.mts` declaration,
`apps/web/src/scanBundle.test.ts`, this claim and a source-pinned scanner handoff.
Acceptance: reproduce the source scanner's false negatives after nested template,
regex and JSX text; reconcile only the TypeScript AST source-sink check from
historical `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6`; retain current built-artifact,
HTML, CSP, deployment and release-boundary checks unchanged. Add behavioral
regressions, use already-declared TypeScript without dependency changes, fail on
unparsable source, and independently review before integration.
Ownership check: open PRs #209 and #238 still contain the old comment stripper;
their separately owned hosting/HTML/deployment changes are preserved. Original
branches remain read-only. No workflow, contract, paid-automation or deployment changes.

Status: implementation `b22d71475e84519af7fdad9a5571452e088bc4ae` has reproduced
regressions (4 failed / 15 passed before correction; 19/19 after), package
typecheck/lint/build, secret scan and action pins passing. Available full package
coverage passes 23 tests at 100% statements/branches/functions/lines; 59 existing
artifact-dependent tests remain skipped because wasm/zkeys are absent. Node 22.23.5
also passes all 19 helper tests. See the source-pinned handoff under
`docs/consolidation/merge-readiness/HISTORICAL_POOL_VALUES_20261118.md`.

## Shared invoice signer-policy extraction — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-invoice-validation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main). Source reviewed:
PR #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`, #209
`b5e2ea3e5030b56c79063eb1f91c8a634ee5d740`, and #211
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

Owned paths: `packages/invoice-schema/src/{envelope.ts,errors.ts,pinnedSigner.test.ts}`;
`packages/invoice-schema/{README.md,DEVIATIONS.md}`; `packages/ux-core/src/{errors.ts,errors.test.ts}`;
this claim; `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.

Acceptance: reproduce the missing opt-in `requirePinnedSigner` contract on main before implementation;
restore only the shared parser guard and fixed typed error/catalog entries; verify real signatures,
plaintext/encrypted/passphrase paths, invalid-signature precedence, default compatibility and
unchanged format/schema/decryption failures. Run affected package tests/typecheck/lint/build and
existing browser-consumer regressions with matching compiled packages. Document that no current
browser caller opts into this policy and that default unpinned-seller review remains unchanged.
No CLI, relayer, backend, experimental, dependency, cryptographic-format or browser trust-policy
changes. Independent source review and exact-head hosted CI remain integration gates; no publication
or browser-execution claim from this worker.

Status: additive API implementation and local review complete at product/test source
`079222115f494d966f1f25be31ffca4d66346461`; regression commit `e3a34d4081aa63d05f36c2e82961299fadaf3f76`
reproduces 10 signer-policy failures and 1 catalog failure against main. Full invoice-schema 728/728 and
ux-core 119/119 pass with original coverage thresholds; affected package typecheck/lint/build pass.
Existing Pay/Receipt tests pass 153/153 at `964b60d6`, before the sole final catalog identity-wording
correction. Privacy reviewer independently passes 13 signer + 15 catalog tests at final source;
coordinator independently passes the same 13 signer cases. Both source reviews find no blocker.
These independent counts overlap author coverage. No browser/default enforcement, cryptographic format,
optional backend or experimental changes. Exact-head hosted CI and browser acceptance remain separate.
Evidence and integration limits: `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.



## Main-targeted Pages checkpoint v4 extraction — 2026-11-18

Worker: ChatGPT privacy_review, Caveman surgical-patch.
Branch: `chatgpt/ghostpay-pages-checkpoint-v4-20261118`; base main
`dfc75ef2087fa6463ae59e0818abec01796c578d`. Reviewed #222-lane source input:
`1dd0fa6152f67010dd38db35d46d102130b583f3`, preserved with its handoff at
`f90499d2925a965b73533da2650c60ca9ea119ed`.
Owned paths: `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanClient.test.ts`,
`apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanCursorSlot.test.ts`,
`apps/web/src/lib/scanCheckpointPrivacy.test.ts`,
`apps/web/src/lib/scannerCore.spam.nocov.test.ts`, checkpoint row only in
`docs/threat-model/PRIVACY_THREAT_MODEL.md` and the browser-profile row only in
`docs/threat-model/THREAT_MODEL.md` (coordinator-approved), this claim and
`docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`.
Acceptance: extract only identity-bound v4 checkpoint persistence/lending and the
relevant regressions onto main; preserve main scanner body, evidence/reorg/finality
checks and application behavior. No #222 bulk-evidence feature, transport/BTC/contract
or dependency changes. Reproduce main's legacy behavior before product edits; run
focused/full scanClient tests, million-announcement resume, whole-web typecheck and
scoped lint; request independent source/test review. Record both source lanes, old
record rescan and privacy/storage limits. No remote mutation, duplicate PR, merge,
deployment or local browser-pass claim.
Status: completed at main product/test source
`7c37de5154ac18e06725ecde6d194185b2e820f2`. Main RED commit
`1d8e61776b2e28a4a4d2e082399eefe58148ea7c` reproduced 5 failures/2 controls.
Full scanner/privacy/helper selection passed 110/110; million-announcement resume
passed 1/1; full-web typecheck1536MiB and scoped lint passed. Independent recovery_review
found no blocking source issue and reran 20 privacy/helper plus 3 pending-corroboration
lifecycle cases at the exact source. Main scanner bytes before persistence are unchanged
except the helper import; no #222 bulk-evidence code was copied. Public/unauthenticated
cursor values, deliberate legacy rescan, existing same-key-restore AbortSignal dependency,
sole-copy idle-retention policy and lack of cross-tab locking remain explicit.
See `docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`. Publication and combined
candidate qualification remain coordinator-owned; no duplicate #222-lane PR.

# Historical pool input guard recovery — 2026-11-18

Worker: history_review, coordinated by the pre-merge repair lead.
Branch: `repair/ghostpay-history-pool-values-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `packages/pool-circuits/src/inputs.ts`, `src/helpers.test.ts`, `test/witness.test.ts`,
the package `DEVIATIONS.md`, this claim and a scoped merge-readiness handoff.
Acceptance: recover the existing historical nonzero-input guards from
`ea1f0b244f0adf4794e55cda6dc7dbd1e5f4039c` and property regression from
`768b1f4cc86638e747cb1553297d012973c4cbb0`; reproduce the present helper/contract
mismatch, preserve valid positive values and full withdrawals, and qualify the
minimal repair independently. All 44 open PR file lists were checked; none
changes the two owned source/test paths. The existing pool circuit constraints,
proof artifacts, contracts, crypto, dependencies, deployment and security gates
remain outside this scope. The coordinator owns publication and integration.

Status: implementation `b22d71475e84519af7fdad9a5571452e088bc4ae` has reproduced
regressions (4 failed / 15 passed before correction; 19/19 after), package
typecheck/lint/build, secret scan and action pins passing. Available full package
coverage passes 23 tests at 100% statements/branches/functions/lines; 59 existing
artifact-dependent tests remain skipped because wasm/zkeys are absent. Node 22.23.5
also passes all 19 helper tests. See the source-pinned handoff under
`docs/consolidation/merge-readiness/HISTORICAL_POOL_VALUES_20261118.md`.

# Historical source-sink scanner reconciliation — 2026-11-18

Worker: actions_repair, Caveman investigate-first; parent owns publication and integration.
Branch: `repair/ghostpay-history-scanner-20261118-local`.
Base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (refreshed main).
Owned paths: `apps/web/scripts/scan-bundle.mjs`, its `.d.mts` declaration,
`apps/web/src/scanBundle.test.ts`, this claim and a source-pinned scanner handoff.
Acceptance: reproduce the source scanner's false negatives after nested template,
regex and JSX text; reconcile only the TypeScript AST source-sink check from
historical `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6`; retain current built-artifact,
HTML, CSP, deployment and release-boundary checks unchanged. Add behavioral
regressions, use already-declared TypeScript without dependency changes, fail on
unparsable source, and independently review before integration.
Ownership check: open PRs #209 and #238 still contain the old comment stripper;
their separately owned hosting/HTML/deployment changes are preserved. Original
branches remain read-only. No workflow, contract, paid-automation or deployment changes.

## P08-A04 local history coverage

Worker `/root/store` on `feature/p08-local-history-coverage`, based on `future/p08-linkability-analysis` at `80bc065fa666b31445ad6a1078e0d751dcfe4259`. The original P08 specification claim owns documentation. This branch owns only `packages/hygiene/src/future/linkability/historyCoverage{,.test}.ts`, this additive claim and the P08-A04 handoff. Acceptance classifies a trusted, complete local snapshot of an exact chain, profile and history revision as empty or populated, while missing, partial, imported, stale or differently scoped evidence stays unknown. The test uses synthetic in-memory data. It does not change ledger persistence, the public package surface, Pages composition or transaction authorization.
