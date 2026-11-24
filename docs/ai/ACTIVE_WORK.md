# Scan-source consolidation candidate — 2026-11-24 UTC

Coordinator: 20261124T0037Z, one sequential ChatGPT coordinator; no delegated workers or independent approval. Branch `automation/20261124T0037Z/coordinator/scan-source-rollup`, exact parent #527 `482d6ab973389083126dd8794f2b21d096a04977`, main/merge base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Own only this isolated branch, the additive claim and `docs/handoffs/SCAN_SOURCE_ROLLUP_20261124.md`. Preserve all donor commits from #520, #523 and #527; no new production edits or donor branch writes. The parent stack passed all five hosted workflow groups; main-targeting qualification and independent review remain required. Acceptance: main-relative comparison preserves exact three source/test blobs, no unrelated changes, main-targeting draft with explicit supersession-for-integration (not closing donor PRs), no shared ref update. No integration lock acquired; generation 12 was released at observation. No merge, deployment, release, real funds or policy changes.

---

# 20261123T2235Z — range scan record-isolation integration regression

Worker: one sequential coordinator/test author; no native independent verifier. Branch `automation/20261123T2235Z/test/scan-range-record-isolation` based on #523 exact head `36cf79d0ce4a31f79a5799af2f8f5e30bd244029`; main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned paths: new `packages/scan-source/src/range.announcement-boundary.test.ts`, this additive claim, and new `docs/handoffs/SCAN_RANGE_RECORD_ISOLATION_20261123.md`. No production edits. #520/#523 own validator source/test; #222/#249/#238/#262/#264/#278/#372 own range source and existing range tests. Do not edit those paths or their branches.

Acceptance: demonstrate that a malformed individual record does not interrupt a multi-window range scan, that valid records before and after it remain in deterministic order with precise skipped accounting and unchanged coverage, and that a real backend rejection remains a rejection. Use synthetic testnet fixtures only, no network or real funds. Exact-head hosted CI and independent review required. Lock generation 12 released, not acquired. No shared integration or deployment.

---

# Scan-source proxy fixture lint follow-up — 2026-11-23T20:41Z

Cycle 20261123T2041Z; one sequential coordinator (no independent worker). Isolated child `automation/20261123T2041Z/bug/scan-proxy-test-lint` of PR #520 at `74164baa0c0781955383794d5243f5ed25e46ae4`, main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Owned paths: `packages/scan-source/src/validate.test.ts`, this additive claim, and new `docs/handoffs/SCAN_PROXY_FIXTURE_LINT_20261123.md`. No production edits; preserve #520's original head and all regression assertions.
Acceptance: resolve hosted lint job 137928103881 at line 31 (unsafe Reflect.get return) by typing the proxy result as unknown; retain throwing metadata and revoked proxy scenarios; requalify exact-head lint and all applicable CI. No gate changes, deployment, real funds or shared integration. Lock observed released generation 12, not acquired. Independent review outstanding. Recent PRs #522/#521/#519/#518/#516, C1 #504, #517, #380/#471 and dependency updates #493/#492 checked for test-path overlap; none found.

---

# R-Scan-20261123 — fail closed on unreadable untrusted announcement records

Worker: sequential GhostPay engineering coordinator (one execution; no independent native workers or reviewer available).
Cycle: `20261123T1840Z`. Isolated branch: `automation/20261123T1840Z/bug/scan-announcement-getters`. Exact base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: this additive claim, `packages/scan-source/src/validate.ts`, additive tests in `packages/scan-source/src/validate.test.ts`, and `docs/handoffs/SCAN_ANNOUNCEMENT_ACCESSOR_BOUNDARY_20261123.md`.
Dependencies: none; do not edit or merge C1 #504 or its children #510→#512→#517. Repository integration lock `automation/ghostpay-integration-lock` last read released generation 12; no lock acquired and no authority to integrate main.
Finding: exported `parseAnnouncement(raw: unknown)` promises never to throw on hostile records, but reads nine record properties directly. An input accessor or revoked Proxy throws, aborting the scan instead of dropping that malformed record. Reproduction must be a failing regression before repair.
Acceptance: getter/trap and revoked-Proxy cases return `undefined` without throwing; all raw fields, including optional transactionHash, are read no more than once; normal records, malformed optional hashes, canonical IDs and count/drop semantics remain unchanged. No crypto, backend, contract, deployment, dependency or real-funds edits. Hosted exact-head typecheck, lint, unit/browser gates and independent verification required before merge; do not interpret standalone checks as full qualification.

---

# R35 — reject throwing chain-lookup accessors (2026-11-22)

Worker: one sequential ChatGPT engineering coordinator/reviewer (no native subagents or independent verifier). Branch: `automation/20261122T0838Z/bug/receipt-accessor-failclosed`, based on PR #450 exact head `5aa0194f1a27ab3d6ba96a28e62fe604d8d8451d`; original parent untouched. Main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: additive claim here, `packages/ux-receipts/src/verify.ts`, new `packages/ux-receipts/src/verify.accessor-boundary.test.ts`, and `docs/handoffs/UX_RECEIPT_ACCESSOR_BOUNDARY_R35.md`.
Finding: PR #450 rejects malformed lookup values but reads `res.status`, `res.facts` and evidence getters outside the lookup exception handler. A resolved malicious or broken adapter object with a throwing property/get trap can make `verifyReceipt` reject instead of returning the existing `unavailable` result. The exported ChainVerifier is a local injected adapter; no external exploit is claimed.
Acceptance: deterministic regression-first cases for throwing status/facts/confirmed/amount/sender/recipient accessors and proxy property traps; all degrade to `unavailable`/`self_consistent_unverified`, while valid found and not-found behavior is unchanged. Use a bounded exception isolation around post-lookup facts processing; no network, custody, contract, protocol or dependency changes. Run bounded executable reproduction and hosted exact-head CI, preserve unrun tests honestly, require independent reviewer and integration lock before merging.
Ownership: deliberate child of active PR #450, which itself stacks on #449. Do not edit either parent branch. Other broad owner claims remain active. Integration metadata lock generation 11 belongs to another coordinator; expiry is not takeover authority. No main/shared-branch merge, release or deployment.

---

# R34 — malformed receipt chain-lookup boundary (2026-11-22)

Worker: GhostPay consolidation R34, sequential author/test reviewer (not independent approval).
Branch: `automation/20261122-r34/bug/ux-receipts-lookup-boundary`; exact parent: PR #449 `ff8c800a495f1cc4d2df704d321b3d22e6f67a78`; PR target: `automation/20261122-r5/bug/ux-receipts-invalid-chain-facts` (stacked). Parent fixes invalid `facts.confirmed`; this child handles separate malformed *top-level* adapter responses and nonstring optional evidence, without replacing the parent fix.
Owned paths on this isolated child: `packages/ux-receipts/src/verify.ts` (additive guards after parent's existing checks), `packages/ux-receipts/src/verify.lookup-boundary.test.ts` (new), `docs/handoffs/UX_RECEIPT_LOOKUP_BOUNDARY_R34.md` (new), and this additive ownership note. Notify parent owner; preserve existing claims. Do not edit parent's branch, drop commits, merge into main or deploy.
Acceptance: regression tests fail on parent for resolved null/nonobject lookup and malformed sender/recipient facts; invalid evidence must return `unavailable`, `self_consistent_unverified`, `chain_unavailable`; preserve true/false confirmations, not-found, matching and mismatch cases. Run exact-head hosted CI; require external review, settled parent, and release lock transfer before any merge. Exclude relayer, contracts, production deployments and real funds.
Integration lock: held, generation 11, owner `994a0d214fb9-root-r3` (rechecked 2026-11-22). Never self-transfer.

---

# GP-BUG — Receipt verifier must not trust malformed chain confirmation evidence (2026-11-22)

Worker: ChatGPT BUG-ONLY coordinator, sequential reproduction/implementation, no independent verifier available.
Branch: `automation/20261122-r5/bug/ux-receipts-invalid-chain-facts`; exact base main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Owned paths: `packages/ux-receipts/src/verify.ts`, new `packages/ux-receipts/src/verify.invalid-facts.test.ts`, additive claim in this file, new `docs/handoffs/UX_RECEIPT_CHAIN_FACTS_20261122.md`. Do not modify `receipt.test.ts` or other branches.
Observed defect: injected `ChainVerifier.lookup` resolving `{ status: 'found', facts: { confirmed: 'yes', amountBase: '1500000' } }` can produce a `chain_confirmed` verdict despite a nonboolean confirmation field; a missing/null `facts` object may throw instead of degrading to `unavailable`. Root cause: runtime callback result is assumed to satisfy its static TypeScript type; `!f.confirmed` is a truthiness check.
Acceptance: test-first regressions for malformed found facts (nonboolean confirmed, null/missing facts), preserve exact valid true/false confirmation and matching behavior; minimal guard returning `unavailable` for malformed evidence; run available source-equivalent runtime checks and hosted exact-head package/CI; no new dependencies, network, funds, release, deployment or interfaces. Do not claim repository Vitest without checkout.
Ownership: all 207 open PR changed-file lists from snapshot through #448 inspected; no claim on these specific source/new test paths. PR #390 checked separately: head `b655bc273a6704c9c140287b8adcdf4085b91882`, 5 completed successful workflow groups, 0 GitHub reviews; no edits to owner branch. Generation-11 integration lock remains externally held by `994a0d214fb9-root-r3`; leave draft and unmerged until legitimate ownership transfer and independent review.

---

# GP-BUG-13 — stop buffered TRON scan yields after cancellation (2026-11-20)

Cycle/worker: `20261120T1635Z`, one ChatGPT coordinator running sequential implementation and audit; no separate native verifier available.
Branch: `automation/20261120T1635Z/bug/tron-scan-abort` based on main commit `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
Owned paths: `packages/tron-adapter/src/scan.ts`, new `packages/tron-adapter/src/scan.cancellation.test.ts`, an additive `docs/ai/ACTIVE_WORK.md` claim, and a dedicated `docs/handoffs/TRON_SCAN_ABORT_20261120.md`. No other files are claimed.
Evidence: GP-BUG-13/MC-01 in existing read-only bugcheck PR #312; abort during iteration of a buffered page permits a second matched payment after signal cancellation. Prior audit exercised two synthetic native payments without network access on main/integration.
Acceptance: preserve all valid native and TRC-20 detection, validation and pagination; return typed `ABORTED` rather than any further result after cancellation, including after delayed page or receipt readbacks and between same-page yields; add deterministic test-first Vitest regressions, with no real RPC/network or private keys; keep no-fee/non-custodial Pages behavior. No new dependencies, policy changes or contract edits.
Ownership reconciliation: current integration PR #307 does not change TRON adapter scan source/tests; broad PRs #278/#262/#264 own `scan.test.ts` but not the `scan.ts` production file. Use a new focused test file to avoid their test ownership. Recheck all heads before any future integration. The durable integration lock is **held by another coordinator at generation 8**; do not acquire, update its metadata, or merge into main.
Verification: run focused tests and applicable CI when available; record every not-run check and independent review requirement. Preserve unfinished work on a draft PR.

---

# Main unique-code consolidation — 2026-11-19 (Pacific)

Worker: `150ffd7f8079-root`, with independent `prior_consolidation`, `release_review`, and `latest_fixes_review` source reviewers.
Branch: `integration/ghostpay-main-unique-code-20261120`; base main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
User authorization: consolidate branches with unique code into GhostPay main.
Owned paths: additive branch provenance under `docs/consolidation/main-unique-code-20261120/`, this additive registry, and exact reviewed source/test contributions from PRs #279, #280, #281, #282 and #285. Preserve every existing registry section and donor parent. PR #267 was separately merged after exact-head checks passed.
Acceptance: compare donor source blobs and ancestry; retain all current main files except the five reviewed independent fixes; validate the combined candidate with existing CI; merge only qualified changes. Preserve blocked broad donors, runtime/payment safeguards, deployment triggers, dependency versions and security gates. No branch deletion or force update.
Execution: local executor unavailable; use connected GitHub source/CI tools. No local test execution is claimed.
Status: ownership recorded before source integration; integration lease generation 7.

---

# Pages multipart QR malformed Unicode guard — 2026-11-19

- Cycle/worker: `20261119T124337Z` / single ChatGPT coordinator with sequential bug, audit and documentation phases; no parallel or independent verifier available.
- Branch: `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard`; base `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrMultipart.ts`, `apps/web/src/lib/qrMultipart.test.ts`, this isolated claim and `docs/handoffs/QR_MULTIPART_SURROGATE_20261119.md`.
- Discovery: single QR `makeQr` rejects unpaired UTF-16 surrogates, but multipart `TextEncoder` silently replaces them with UTF-8 U+FFFD. Node 22 reproduction: `\uD800` encodes as `EF BF BD` while valid astral pairs round-trip unchanged.
- Acceptance: test-first rejection of isolated high/low surrogates and mixed strings by `toMultipart` and `multipartIfNeeded`; valid paired Unicode text still encodes and decodes; no QR/format/protocol change for valid payloads; no dependencies added; exact-head CI and separate review before merge.
- Coordination: inspected changed-file inventories of active PRs #238, #240, #243, #244, #246, #249–#252, #254–#256, #258, #260–#262, #264–#265, #267–#278; neither owned QR file appeared (bounded sample, not an exhaustive review of all open PRs). Broad #278 and recovery integration remain externally owned. Metadata lock generation 3 observed released at `6408563f55081ee941c2036086c025ebf63d2c96`; no shared lock acquired, no merge planned.

---

# 2026-11-19 · Fail-closed runtime build profile guard (isolated)

Coordinator and implementer: one ChatGPT assistant, sequential phases; no independent verifier spawned.
Cycle: `20261119-c977`; isolated branch: `automation/20261119-c977/bug/build-profile-failclosed`.
Base observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: `apps/web/src/lib/buildProfile.ts`, `apps/web/src/lib/buildProfile.test.ts`, this append-only claim, and isolated `docs/handoffs/BUILD_PROFILE_FAILCLOSED_20261119.md`.
Dependency/ownership: active consolidation PRs #246/#262/#264/#278 and QR #279 checked; none changes the two source/test paths as of branch creation. Existing metadata integration lock is released generation 3. The external GhostPay automation has a concurrently in-progress run; no integration or shared-ledger writes authorized for this branch.
Finding: `resolveProfile` narrows when exactly `lean`, but unexpected runtime values (outside the TypeScript union) are treated as `full` when all other values are `full`. This differs from the fail-closed `profileFromDefine` logic. No real-world exploit established.
Acceptance: test first; invalid explicit/shell/build values must resolve to lean, normal 3-source truth table unchanged; no feature widening, dependencies, workflows or build setting changes; record actual test execution and CI constraints; independent verification needed before merge.

---

# Run 20261119T1640Z — privacy-set 30-day coverage correctness

Worker: one ChatGPT coordinator, with sequential implementation and audit phases; no independent subagent.
Base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`; isolated branch: `automation/20261119T1640Z/bug/scan-privacy-partial-30d`.
Owned paths: `apps/web/src/lib/scanSpam.ts`, new `apps/web/src/lib/scanSpam.partial.test.ts`, and `docs/handoffs/SCAN_SPAM_PARTIAL_30D_20261119.md`. The claim is recorded here before source edits.
Finding: `anonymitySet()` reports 7-day and 30-day public announcement counts but calculates `partial` from only the 7-day lower bound. If a scan began ten days ago, the 30-day displayed count is incomplete yet the warning is absent.
Acceptance: a test that fails on baseline for incomplete 30-day coverage; 7-day/30-day counts remain unchanged; the `partial` flag marks incomplete 30-day history and gaps to head, but does not spuriously mark full available genesis history incomplete. Run available focused checks and report exact limits; avoid changing privacy policy, protocol, network access or real funds.
Dependencies/ownership: checked active #278/#264/#246/#238/#244/#251/#248/#249/#222/#219/#250/#269/#270/#279/#280 changed-file inventories; none owns `scanSpam.ts` or new focused test. Recheck before PR. The metadata integration lock was last observed released generation 3; no protected integration requested.
Status: claimed; implementation pending.

---

# Merchant key-pin strict JSON hardening — 2026-11-19 cycle 20261119T183817Z

- Worker: one ChatGPT operator (sequential source, test, and audit phases; no independent subordinate).
- Task branch: `automation/20261119T183817Z/bug/merchant-pin-duplicate-json`.
- Base `main` SHA: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned files: `apps/web/src/lib/merchantIdentity.ts`, `apps/web/src/lib/merchantIdentity.test.ts` and an isolated handoff `docs/handoffs/MERCHANT_PIN_STRICT_JSON_20261119.md`.
- Finding: ambiguous persisted signer-pin JSON (duplicate `v` or `signer` members) is accepted by `JSON.parse` as its final key value, despite the trusted-pin fail-closed contract. This is defensive local-storage validation; no remote compromise or fund-loss exploit claimed.
- Acceptance: reject duplicate-key and forbidden-key pin records as `unavailable`, never silently treat them as `absent`; valid persisted pins continue to be read, saved and removed; regression committed before source repair.
- Dependencies: reuse existing exported `parseStrictJson` (invoice-schema), no protocol/schema changes.
- Ownership check: open PRs including #238, #246, #262, #264, #278 and all current work listed through #281 inspected for these two files; none claimed them. Recheck heads before integration.
- Integration metadata ref remains outside this branch. No shared ledger or protected-branch update authorized from this worker.

---

# QR kind handling fail-closed — 2026-11-19 cycle 20261119T204728Z

- Worker: one ChatGPT coordinator, sequential implementation and read-only audit phases (no independent subagent; not independently approved).
- Task branch: `automation/20261119T204728Z/bug/qr-kind-failclosed`; exact base main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrKinds.ts`, `apps/web/src/lib/qrKinds.test.ts`, `docs/handoffs/QR_KIND_FAILCLOSED_20261119.md`, and this additive ownership claim only.
- Evidence: `kindForPayload` looks up a runtime key in a regular JavaScript object; for unknown keys it can return `undefined` or inherited properties such as `constructor`, while `unverified: true` can classify an unknown payload as caution. `qrKindClass` constructs arbitrary classes for unknown kinds.
- Acceptance: reject unrecognized runtime payload types and frame kinds before returning handling policies or CSS; preserve all valid QR kind/rule behaviors and print policy; commit a failing regression first, then fix; execute bounded Node proof and report exact CI and independent review gaps.
- Ownership: core active PRs #238/#243/#246/#251/#252/#255/#258/#261/#262/#264/#265/#268/#270/#274/#278/#279/#280/#281/#282 were inspected for these files; no direct overlap observed. Recheck at merge. No other branch or shared integration updates.
- Status: claimed; no merge, deployment, release, or production change authorized from this isolated worker.

---

# Focused hosting main reconciliation — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-hosting-main-reconcile-20261119`.
Starting PR #267 head: `c3a693e87053fbe91219f8edfe159a5ec0a37a34`.
Qualified main input: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: additive `docs/ai/ACTIVE_WORK.md` reconciliation and new evidence under
`docs/consolidation/hosting-timestamp-reconciliation-20261119/`. Incoming qualified
main source/test changes are preserved exactly; no runtime source or gate edits.
Acceptance: first preview merge conflicts; preserve main and focused ancestry;
retain all existing ownership sections; keep the complete 80-file hosting-kit tree
and its three reviewed timestamp source/test blobs exact; inspect the full resulting
source/config diff and run only checks needed for a concrete reconciliation risk.
Historical hosted kit/browser outcomes remain pinned to the earlier checkout;
new-head CI/build/browser qualification is coordinator-owned and remains pending.
No remote writes, force operations, mainnet, deployment or parallel heavy checks.
Status: claim recorded before merge; merge-tree preview found only this registry.

# Focused hosting timestamp promotion — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-hosting-timestamp-main-20261119`.
Base: `14ded337a10c140d7a9f9a9238ec038587d925bb`, independently verified as GitHub main.
Owned paths: the three reviewed source/test files from
`38fe7fdaf151ef433be9721af8fea7cbcdea89c4` under `tools/portable-hosting-kit/`,
the unchanged historical evidence in `docs/consolidation/hosting-timestamp-20261119/`,
new provenance in `docs/consolidation/hosting-timestamp-main-20261119/`, and this
additive claim. Acceptance: cherry-pick the exact reviewed fix without importing
feature-candidate ancestry; verify all three blobs and the complete kit tree match
the tested product; preserve every prior main claim; identify differences in root
configuration/lockfiles and record evidence limits honestly. Obtain independent
recovery-worker review. No other runtime, dependency, workflow, threshold, deployment
or remote changes. The coordinator owns publication and hosted qualification.
Status: exact `-x` cherry-pick product `f4464e57bc6743800c2564ddb71bb5b06f64eb35`;
complete kit tree and three product blobs equal the reviewed original. Historical
evidence copied byte-for-byte; root lock differences remain explicit. Recovery-worker
source review found no introduced blocker. No new runtime replay is claimed.
Provenance: `docs/consolidation/hosting-timestamp-main-20261119/PROVENANCE.md`.

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

## QA-02 payment URI builder length — 2026-11-20 UTC (automation cycle)

- Worker: sequential ChatGPT bug-repair coordinator; no subordinate or independent worker claimed.
- Isolated branch: `automation/20261120T0641Z/bug/payment-uri-aggregate-length`; exact base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Finding: QA-02 / CORE-QA-01, source-pinned read-only QA at PR #309 (source `c977b5d6723f6822c3b5d86cd6b231712c53c395`), applies unchanged to base.
- Owned paths: `packages/payment-uri/src/query.ts`, `bitcoin.ts`, `solana.ts`, `tron.ts`, new `builder-length.test.ts`, and `docs/handoffs/PAYMENT_URI_LENGTH_20261120.md`. This ownership registry entry is additive.
- Dependencies: existing `splitUri` cap `MAX_URI_LENGTH=2048`; no other owner found via current open-PR metadata and scoped search; refresh before integration. No contract, wallet, relayer or main changes.
- Acceptance: builders never return a URI that their matching parser rejects solely for exceeding 2048 encoded characters; reject overlength as typed `TOO_LONG`; preserve valid vectors, NFC text, token/reference/amount semantics; test below/at/above cap and original QA examples. Do not merge without full hosted qualification, independent review, fresh ownership and deployment-gate checks.
- Evidence at claim: repository Git checkout unavailable (GitHub DNS resolution failed); no repository tests run yet. Only scoped GitHub source inspected. Scope intentionally excludes unrelated findings QA-01/QA-03 and QC-01.


## TRON range completeness recovery — 2026-11-20 continuation R2

- Worker: `/root/branch_recovery_r2`; coordinator: `994a0d214fb9-root`.
- Branch: `integration/ghostpay-tron-range-20261120-r2`; exact base: `87c3bf5a59f4d443c9e5cf81368162554a5315c3` (PR #321, itself based on main `aa3df1cb37274fae73af0ca957183c15c51b62d3`).
- Owned product paths: `packages/tron-adapter/src/rpc.ts` limited to `getBlockRange`; `packages/tron-adapter/src/scan.test.ts`; `apps/web/src/features/tron/fixtures.testutil.ts`; `apps/web/src/features/tron/chain.hardening.test.ts`. Owned evidence: `docs/consolidation/continuation-r2-20261120/` and this additive claim.
- Acceptance: a requested block range must contain every requested height in order before scanner results or account/memo lookups proceed. Missing first, middle, last, or all blocks must fail with the existing typed invalid-response error. Preserve valid complete ranges, native/TRC-20 scanning, cancellation checks from #321, current RPC privacy isolation, parser bounds and original assertions.
- Provenance: selectively recover missing source from PR #271 head `429a4de80b9ec53177b17d89d18ce8ec91a08814`, retaining original completeness contribution `22af2074a086d9957a18e310ef8572b28d1facd0` and fixture/regression correction `146e52481733fec5fc95580eb9d2d41a01a05df0`.
- Ownership reconciliation: #271/#250 and broad #278/#262/#264 remain preserved donors. Root explicitly assigned this isolated recovery after current source/PR inspection. No existing donor branch is mutated. #321 owns `scan.ts` and its new cancellation test; those files remain unchanged. Other workers own retention and current CI triage. Root owns publication, shared refs, merge decisions and coordination metadata.
- Sequence: save full live branch census and this claim; commit recovered tests/fixture before runtime; execute controlled RED checkpoint through coordinator scheduling; restore only the missing range check; run applicable qualification and independent review. No dependency installation/copy or broad workflow rerun is part of this worker's initial scope.
- Evidence at claim: #271 has 36 successful hosted checks, three deployment-only skips and one beta failure during browser OS-package installation (Ubuntu mirror connection/resource failures, apt exit100). No beta assertions ran. Its prior successful source tests do not qualify this new composition. #321 current checks remain incomplete.


## TRON range completeness independent qualification — 2026-11-20

- Worker: `/root/range_qualification_r2`; coordinator: `/root`.
- Branch: `integration/ghostpay-tron-range-20261120-r2`. Frozen application/test input: `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272`, tree `46c186bfb4f7e15b384c9a0ba361790d8c7e6876`.
- Owned changes: additive qualification status here and `docs/consolidation/continuation-r2-20261120/TRON_RANGE_QUALIFICATION.{md,json}` only. Product source and previous ownership records are immutable inputs.
- Acceptance: read the independent source approval; verify the supplied RED evidence; rebuild matching libraries; execute original package coverage/typecheck/lint/build, all web TRON test files, full web TypeScript/typed lint, and the full-profile production build with original postbuild scan. Record exact commands, source, dependency reuse, results, limits and hashes. Preserve every original threshold and assertion.
- State at claim: source review approved by `/root/ci_triage_r2`; original library build is running in a separate clean detached qualification worktree. No GREEN or complete qualification result is asserted by this claim.
- Boundaries: no source/dependency/workflow changes, browser attempt, live RPC/funds, deployment, remote publication or shared-ref/lease mutation. Root owns publication and promotion.


Qualification completion: application/test source `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272` passed all eleven recorded gates once. Package coverage: 107/107; web TRON selection: 50/50; zero skips. Full web typecheck/lint and full-profile production build/postbuild scan passed. Independent source approval preceded GREEN. Exact commands, RED evidence, raw output bytes/hashes, dependency/cache provenance and all 19 build-artifact hashes are preserved in `docs/consolidation/continuation-r2-20261120/TRON_RANGE_QUALIFICATION.{md,json}`. Source remains unchanged; only documentation follows the qualified checkpoint. Hosted/browser/full-web-suite boundaries remain open. Worker processes stopped and heavy slot released; root owns publication and promotion.


---

# 2026-11-23 — QR SVG sparse matrix rejection

Worker: sequential ChatGPT BUG-ONLY coordinator; no separate independent verifier. Branch `automation/20261123T2221Z/bug/qr-svg-sparse-matrix` from `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: `packages/qr-exchange/src/generate.ts`, new `packages/qr-exchange/src/generate.sparse.test.ts`, new `docs/handoffs/QR_SVG_SPARSE_MATRIX_20261123.md`, and this additive claim only. All 279 open PR file inventories in the initial snapshot through #524 checked; no collision on generate paths. Newer open PRs checked before branch creation. Adjacent owner PRs remain untouched.
Observed source-matched Node reproduction: Array.every skips sparse slots, so an incomplete QR matrix emits a misleading SVG rather than BAD_INPUT (4/10 cases fail). Acceptance: test-first hole rejection at first/middle/last/all slots, preserve dense boolean matrices and dimension/type checks. No change to QR generation, dependencies, funds, contracts, release or deployment. Full hosted CI and independent review required; integration lease generation 12 released, not acquired. PR #390 exact head green; independent review absent; no owner branch edits.
---

# GP-BUG R16 — nonnegative near-tie fee savings (2026-11-23)

Worker: single automated BUG-ONLY coordinator, sequential source inspection, test and repair. No independent verifier available in this run.
Branch: `automation/20261123-r16/bug/ux-fees-neartie-savings`; source base main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
Owned paths: this additive claim; `packages/ux-fees/src/cheapest.ts`; new `packages/ux-fees/src/cheapest.tie-savings.test.ts`; new `docs/handoffs/UX_FEES_NEARTIE_SAVINGS_R16_20261123.md`.
Finding: existing tie-break allows a preferred or faster chain up to 1% more costly than the minimum; `savingsVsNext = metric(next) - metric(winner)` becomes negative when the next ranked chain is cheaper. This contradicts the nonnegative savings treatment already used for `savingsVsCurrent` and misstates a user-visible quote.
Acceptance: test first for preference and speed tie-breaks reporting nonnegative zero savings, preserve a positive saving for an actual cheaper winner and unchanged ordering/suggestion logic. Minimal clamp of the existing calculated saving, no new fields or features. Record exact source evidence, hosted CI and all unrun checks; request separate review. Do not change other PR branches or merge/release/deploy/fund-interact.
Preflight: live main, AGENTS.md/WORKFLOW.md/HANDOFF.md/ACTIVE_WORK.md, #390 exact-head green 5 workflows and 39 checks with zero submitted reviews; #390 mergeable=false; generation-12 metadata lease released at inspected commit `082e754f44944ebb4be283f89176b966bf8f7b4f` (no authority inferred). Prior 267-PR ownership snapshot plus fresh 2026-11-23 open-PR search and changed-file inspections of active broad donors (#238/#246/#262/#264/#278/#504), fee PRs (#421/#423/#425/#462) found no `cheapest.ts` claim. Full fresh 268-PR file-list scan was not completed, so recheck before integration.

## QR SVG sparse-cell qualification, 2026-11-24 UTC

Worker `codex-fe9aff486805` is qualifying the existing #525 change at `06973f60031c49c4e8004cffea77b5627bb81632` on main `f76904301cff0b24d65ea4e31cbf37d470db4d95` in `qualify/qr525-sparse-cells-20261124`. Owned files are `packages/qr-exchange/src/generate.ts` and `generate.sparse.test.ts` beside it. Resolve both hosted lint errors, check that missing SVG cells are rejected and verify valid coordinates with the package suite. Return the tested work to #525.
