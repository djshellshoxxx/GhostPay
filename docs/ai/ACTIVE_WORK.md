# Account switch and vault-lock privacy for #286, requirement 3

Worker `1078cbc0eb89` on `fix/286-account-vault-privacy`, based on #372 at `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`. Main observed at `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Coordination recorded on #544. The GP-PAGES-04 owner retains the clock, session, key vault, shell, and idle tests.

Owned changes on this child are limited to Pay and Registry privacy invalidation, the reconciliation ledger, the shell's shared transient presentation through the privacy provider, wallet attempt presentation, Scan tag label drafts and lock notifications in the tag vault, and focused tests for these paths. Acceptance covers account replacement including A–B–A, delayed wallet and vault reads, cached state across routes, reload, app lock, and retained encrypted records and duplicate-attempt evidence. Preserve existing recovery paths and check the full and lean builds. Release checklist and verification evidence belong to this child until integrated and independently reviewed.

# Preserved composition ownership records

## #367 integration and this worker

# Recovery/privacy composition — 2026-11-20 Pacific

Worker: `/root/recovery_integration`; coordinator `5ceb6203640a-root`.
Branch: `integrate/ghostpay-recovery-privacy-20261121-5ceb`; preserved runtime parents #367 `50ccf5c8b396247b524e5115ebe51575ca79d318` and #361 `4ccb3db334de7d7cada305a11243c9e3efddc4f6`. The earlier selective claim below is superseded before any product edit: payment-key export requires the donor's network-authorization service, which #367 lacks. Preserve that complete accepted dependency closure by composing both existing stacks; do not weaken export grants to fit the older service API.
Owned integration resolution: `apps/web/e2e/{core-journey,pages-devnet}.spec.ts`, `apps/web/src/AppShell.tsx`, `components/TagArchive.test.tsx`, `features/tron/chain.hardening.test.ts`, `i18n/securityKeys.ts`, `lib/{qrKinds.ts,qrKinds.test.ts,session.idleLock.test.ts,sweep.ts}`, `views/{Pay.tsx,SellerKeys.tsx,Sweep.quoteLifecycle.test.tsx,Sweep.tsx}`, `deploy/TOR.md`, this additive registry and the existing idle-session review. Cleanly merged donor paths are reviewed for preservation; no unrelated new implementation is authored.
Acceptance: preserve newer #333 backup preflight/durable-write ownership, sleep-aware revocation, F03 request files, current TRON and fee fixes from #367; preserve #361 Spec18 independent key recovery, endpoint grants, mandatory privacy controls, wallet disclosure and its reviewed lifecycle fixes. Retain both sets of tests, assertions, thresholds and original histories. Verify each manual hunk, run focused recovery/payment/privacy tests and original typecheck/lint/build, then obtain independent whole-composition review and hosted CI. No claim of release readiness from local focused passes. Root owns publication/shared refs/lock; no remote writes by this worker.
Status: amended claim committed before product merge.

---

# Spec 18 selective recovery integration — 2026-11-20 Pacific

Worker: `/root/recovery_integration`; coordinator `5ceb6203640a-root`.
Branch: `integrate/ghostpay-spec18-recovery-20261121-5ceb`; base #367 `50ccf5c8b396247b524e5115ebe51575ca79d318`; exact donor #361 `4ccb3db334de7d7cada305a11243c9e3efddc4f6`.
Owned paths and acceptance criteria: [scoped recovery claim](../handoffs/SPEC18_SELECTIVE_RECOVERY_20261121_5CEB.md). Recover the donor's existing codec, export/recovery UI, session/credential safeguards and independent interoperability tests while preserving this base's newer backup/idle/F03 behavior. Record exact source provenance and all manual adaptations. No unrelated private-scan/privacy/dependency import. Existing claims and donor branches are preserved. Root owns independent review, publication, shared refs and integration lock; this worker performs isolated local engineering only.
Status: claimed before source edits; no verification result yet.

---

# Isolated idle, scan and current-main candidate — 2026-11-20 Pacific

Worker: fc3db078ca12-root-r2; independent composition reviewer: /root/r2_idle_composition_review.
Branch: integration/ghostpay-idle-scan-candidate-20261121-fc3db.
Base: integration PR307 at 5a745d4b5fba69b66a9779f88aefc63c253a4f27.
Pinned donors: PR344 a88157b53d1e0925350d5c8db047eabb4365f4e9 (existing idle/backup/receipt/request-file stack); PR350 89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8 (scan helper plus current main aec179910c39081d820396409ff3139ff2264132).
Scope: isolated source-preserving composition, additive ownership resolution, and new docs/consolidation/idle-scan-candidate-20261121-fc3db/ evidence. Donor runtime paths remain exact; no donor branch is edited. A separate worker may contribute only the new wallet.finalAccount.test.ts and its handoff after independent review.
Acceptance: preserve all donor histories and every intended blob/mode/type, retain every existing claim, preserve main's six TRON/fee product/test changes, verify the current combined source with applicable original gates, and publish only a reviewable candidate. Source-specific donor CI is not a combined-source pass.
Ownership: complete current branch/PR and raw-claim review found no existing equivalent composition. Shared integration lock generation 11 remains held by 994a0d214fb9-root-r3 at c196151daf8233f96045fd205b2d899c9e8cc97d; expiry does not authorize takeover. This worker owns only this new isolated candidate and its evidence, not shared integration/main or frozen donor paths.
State: claimed before composition. No shared ref update, lock takeover, manual workflow dispatch, release, deployment or funds operation is part of this task.
# Silent final wallet account reread regression — November 20, 2026 (Pacific)

Worker: `/root/r2_privacy_qualification`, delegated by `fc3db078ca12-root-r2`.
Branch: `test/ghostpay-wallet-final-account-r2-20261120`.
Base: exact integration PR #307 `5a745d4b5fba69b66a9779f88aefc63c253a4f27`.
Owned paths: new `apps/web/src/lib/wallet.finalAccount.test.ts`, new `docs/handoffs/WALLET_FINAL_ACCOUNT_REGRESSION_20261120.md`, and this additive ownership entry only.
Overlap check: no history for the proposed test path across available refs; the exact-path claim search across 425 distinct available branch heads found only the parent coordinator's explicit reservation for this delegated contribution in candidate `b0bc4fecbea288f646d7960ab2b58679e1887ef6`. Existing wallet source/tests, browser fixture/cases, receipt/hash safeguards and all other claims stay outside this task.
Acceptance: with the actual wallet APIs and existing MockWallet pattern, keep the first account reread valid, change the returned account silently during the final network check, and prove send/signature rejection before submission and before attempt-journal access or mutation where applicable. No `accountsChanged` event or application-authority revocation may cause the rejection. Include unchanged-account controls that exercise successful send/journal and signature behavior. This fills negative coverage for an existing runtime guard; no current runtime defect is asserted.
Validation ownership: author tests and commit locally first. Do not install a separate dependency tree or start heavy checks. Root will supply the exact-lock combined #307/#344/#350 source for actual focused execution and independent review; all unrun gates remain pending until that evidence exists. No runtime, workflow, dependency, configuration, threshold, timeout or existing browser assertion changes are authorized.
State: claim preceded authoring; four regression cases are authored with Vitest execution, typecheck, typed lint and independent review still pending on the coordinator's combined source. Node syntax-only validation passed. Root owns composition, qualification and any remote publication. No shared integration/main update, lease action, workflow dispatch, deployment or real-funds operation is included.

---

# R3 qualified Sweep integration and current-main refresh — 2026-11-20 UTC

Worker: `994a0d214fb9-root-r3`; independent composition reviewer: `r3_branch_recovery`.
Isolated branch: `integration/ghostpay-refresh-main-20261120-r3`.
Base: qualified #325 merge `394793b1276aeac337aedde30499548bb57eadf9`, whose tree is
exactly #325 `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`; original #307
`2876b7db580e47a880d5951ce9e62941bcf76fdf` is retained as its first merge parent.
Current main for this composition: `bfebea0acf213a113d2740366fd592042661ca67`,
including the separately merged #321 TRON cancellation and #330 census.
Owned edits: additive this ownership registry and scoped consolidation evidence.
Integration scope: retain both complete source histories and every donor blob/mode;
resolve only the additive ownership-document conflict by preserving both sides.
No other source conflict was found by independent object-level merge review.
Acceptance: verify ordered parents, all contributed source blobs and modes, both
ownership blocks, secret/whitespace checks and unchanged original workflows/gates;
publish a non-force successor of #307 for fresh combined-head CI before main promotion.
Original #307 and #325 checks are source-specific historical successes, not a pass
for the new composition. Root acquired cooperative integration generation 11 before
shared-target updates; verify the current lease and branch heads before publication.
No deployment, contract change, dependency change, signing or live transaction is included.
# SellerKeys preflight ownership continuation — 2026-11-20

Worker: `/root/remaining_branches_r3`, delegated by the consolidation coordinator.
Branch: `fix/ghostpay-backup-preflight-20261120-r2`; exact base: final idle
`7417881ac7f243b50f7b5c1682c66a4e3f87c736` (runtime frozen at
`1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`).
Donor: refreshed PR #314, `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`,
runtime commit `49535f3bdbdda6f133e397097e56a8dde8413d94`.
Owned paths: only operation ownership in `apps/web/src/views/SellerKeys.tsx`;
new `apps/web/src/views/SellerKeys.ownership.test.tsx`;
new `apps/web/e2e/backup-ownership.spec.ts`; this additive registry entry and
`docs/handoffs/SELLERKEYS_PREFLIGHT_20261120_R2.md`.
Final evidence scope, authorized before packaging: additive
`docs/consolidation/backup-preflight-r2-20261120/` contains source-pinned reports
and lossless original qualification/review artifacts. Runtime remains frozen.
Acceptance: a canceled or superseded recoverability preflight cannot begin a late
unlock or display a stale replacement prompt; export must recheck operation and
session ownership after authorization and before encryption; synchronous durable
write ownership must refuse duplicate/colliding save/delete or unlock work while
retaining busy state until the actual write settles. Preserve current separate
`unlockBusy` / `vaultWriteBusy`, all five original operation regressions, idle
suspension visibility, own-installation handling, and every PR #325/#307 safeguard.
Record tests before runtime; recover the donor's 17 component regressions as an
additional file and its two browser journeys without replacing current tests.
Use bounded controlled RED followed by independent source review and applicable
qualification. Root schedules processes, supplies linked existing dependencies,
and owns remote publication/integration. No installs or dependency copies.
Ownership: idle source and final docs are frozen. Parent explicitly authorized this
continuation in the available backup worktree; original #314/#319, the previous
backup branch, and idle/Sweep worktrees remain unchanged.
Browser limit: original donor browser bodies did not execute because Chromium
could not launch. The same local socket restriction remains; hosted full/lean
browser acceptance is required and authored journeys are not passing evidence.
Status: tests-first checkpoint `1a69f706` precedes frozen runtime `fde65b79`.
Independent source review approved that runtime. Controlled RED: 19 pass / 3 expected
failures; same 22-case GREEN passed; separate overlapping compatibility gate passed
246/246 across 12 complete files, all with zero skips. Original web typecheck/lint,
lean build/postbuild and full/lean static two-case collection passed. Browser bodies
remain unexecuted. Final documentation/evidence preserves the qualified application,
test and configuration bytes. Required exact published-head checks and hosted browser
acceptance remain open; parent owns the stack on PR #331. Full evidence and handoff:
`docs/consolidation/backup-preflight-r2-20261120/REPORT.md` and
`docs/handoffs/SELLERKEYS_PREFLIGHT_20261120_R2.md`.

---

# Sweep consent and review lifetime consolidation — 2026-11-20 (Pacific)

Worker: `994a0d214fb9-root`; source triage: `branch_inventory`; independent resulting-tree review follows composition.
Branch: `integration/ghostpay-sweep-consent-20261120`; base: published PR #307 head `2876b7db580e47a880d5951ce9e62941bcf76fdf`. Donor: PR #272 `63ff40d57af879a3d82166450f63aadb7bf0d5ff`, retaining #231/#252 explicit balance consent and quote/direct/relayed/replacement lifetime guards.
Owned paths: the donor's `Sweep.tsx`, Sweep tests, `scanPrivacy.ts` and test, four affected browser journeys, locale/security-key additions, additive source-pinned consolidation evidence and this registry. Existing completed invoice, backup, print and Tor work stays in the base.
Acceptance: preserve donor ancestry, the current canonical ERC-20 transfer test fixture and every unrelated base change; resolve only additive ownership conflicts; independently review the resulting source; execute the existing Sweep/privacy/lifecycle and relevant shared regressions before draft publication. All applicable combined-head hosted checks remain required before main promotion.
Coordination: PR #307 remains frozen while its full web suite and hosted checks are pending. This separate candidate introduces no dependency, contract, relayer-server, release or deployment change. No inherited donor result is relabeled as validation of this new composition.

Accepted successor scope, recorded before edits: selectively retain `6ed5c66b514e11eaca1817c6b83a863b2ebaf89e`, `d14ac788da5254890e683f191a91ba619d1dd102`, `ba6b6d44a16d151b53f104715754c4a9bfd9610b` and `a603603d5e84814451c6f77945871e9224467b32`. Additional owned paths are `apps/web/src/lib/sweep.ts`, its original test fixtures and the exact `sweep.reviewAuthority.test.ts` donor blob from `8ca38218ba87a5cee479ea5885b6a00bc0791f28`. These complete caller review checks before local signing, preserve current-context error handling, handle a session unavailable before authorization, and bind native amount to the explicitly reviewed balance. Adapt the lock-before-authorization regression to existing session APIs. Preserve original assertions and post-handoff evidence; do not import the broader privacy network, idle-session or native-fee workflow. Execute the new regression against the unchanged helper before runtime adaptation.

---

# Consolidation continuation and completion — 2026-11-20 (Pacific)

Worker: `994a0d214fb9-root`, with independent `branch_inventory`, `invoice_file_completion`, and `backup_completion` workers.
Branch: `integration/ghostpay-consolidation-20261120-r2`; base: `0e926f8b4cf7f307c3174f3a03298ff310cb1808` (PR #307). Current main at claim: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/views/Sweep.test.tsx`, additive consolidation records, and this registry. Worker branches separately own signed request-file qualification and SellerKeys operation lifetimes.
Acceptance: preserve #306's five reviewed source branches and #307's sixteen recovered modules; correct the legacy Sweep RPC fixture to return canonical ERC-20 transfer success without changing runtime validation or assertions; execute focused regression and applicable combined-head CI. Recheck donor/main heads and acquire the cooperative integration lease before shared-target updates. Integrate additional independently reviewed feature/fix branches only with passing checks and preserved scope.
Scope: static browser/Pages beta. Existing release, deployment, dependency, cryptographic, contract, and payment-enablement gates remain in force. Broad candidate branches require separate coherent qualification; source review alone is not a passing test result.

---

# Additional isolated consolidation recoveries — 2026-11-19 (Pacific)

Worker: `150ffd7f8079-root`; branch: `integration/ghostpay-main-recovered-fixes-20261120`.
Base: `6c65cc3fd31c9ae361f932bee4a3449d89ed776c`. User authorization remains consolidation of unique code into GhostPay main.
Additional owned paths: `scripts/automation/integration-lock.mjs`, `scripts/tests/integration-lock.test.mjs`, `scripts/pages/verify-pages-artifact.mjs`, `scripts/pages/verify-pages-artifact.test.mjs`, `scripts/pages/build-pages-artifact-gate.test.mjs`, `scripts/pages/build-pages.sh`, and `packages/chain-adapters/src/quote.test.ts`; additive consolidation provenance and this registry.
Scope: recover the reviewed cooperative integration-lock helper and tests; independently verify staged Pages bytes before either final output move; preserve quote decimal-boundary regression coverage. Six paths are exact reviewed donor blobs. Adapt only the verifier invocation immediately after the existing builder's build-log copy; preserve all other current builder content, executable mode, workflows, dependencies, contracts and deployment settings. Together with the prior claim this is 16 isolated modules and 38 source/test paths.
Review: `release_review` approved these seven paths and their existing dependencies. Prior donor test results are recorded as historical evidence, not qualification of this combined candidate. Require a fresh resulting-tree review and hosted CI before promotion. The lock helper must preserve its refusal to acquire any held lease, even when expired.
Local execution remains unavailable; no local tests are claimed. This ownership extension is recorded before source changes.

---

# Recovery of isolated unique fixes — 2026-11-19 (Pacific)

Worker: `150ffd7f8079-root`; isolated branch: `integration/ghostpay-main-recovered-fixes-20261120`.
Base: first consolidation candidate `885b9569e6fc99e43bf01d23305494275e10120e` (PR #306), main remains `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` at claim time.
Owned scope: exact source/test recovery for QR import visibility, canonical arrays, scanner scheme filtering, deployment dates, RPC retry/privacy options, merchant clocks, jitter expiry, base64url/QR/amount input validation, multipart idle expiry, receipt/hash validation with consumer fixture repairs, and ERC-20 simulation response validation. Detailed file/hash provenance will be under `docs/consolidation/main-unique-code-20261120/recovered-fixes/`.
Dependencies: existing main APIs and package versions; no new dependency, workflow, contract, deployment, fee or payment activation. Larger privacy/recovery/scan feature branches remain separate. Reviewers: `release_review` and `latest_fixes_review`, plus root diff inspection. Each source module has an existing regression suite included byte-for-byte; prior donor outcomes retain their source pins.
Acceptance: preserve current source outside the explicit 31 paths, repair known donor fixture/lint mismatches using already-reviewed final blobs, publish atomic recovery commits, inspect full resulting tree, and require hosted qualification before promotion. The #305 contribution has pending donor CI and is explicitly unqualified until this candidate passes. Never treat source extraction as the merger or qualification of all work on a broad donor branch.
Local executor is unavailable; no local tests are claimed. Ownership recorded before source changes.

---

---

# Receipt print isolation continuation — 2026-11-20

Worker: ChatGPT lead `/root`, with independent `print_isolation_review` worker.
Branch: `fix/receipt-print-isolation-312-20261120`.
Base: PR #316 `56b76e8fbae0aa0d3e9c9394616d4aa600d70fb7`, based on main
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; original finding GP-BUG-02 in #312.
Owned paths: `apps/web/src/styles/{app,print}.css`, printable bill/receipt component
print wiring and focused tests, a shared print-target lifecycle helper and its tests,
`apps/web/e2e/print-targets.spec.ts`, this additive registry entry and the existing
`docs/handoffs/RECEIPT_PRINT_TARGETS_20261120.md` continuation.
Acceptance: reproduce the original invisible receipt in Chromium print media;
select only the clicked receipt or bill; exclude other receipts, wallet UI, receipt
JSON/actions and secret QR; clean up after print/cancel, exceptions and unmount;
preserve normal screen output; pass focused regression tests, typecheck, lint,
static Pages build/bundle checks and independent review. Preserve the prior PR's
history and inspect its live head before publishing a continuation. No deployment,
contract, dependency, fee, wallet/signing or unrelated feature changes.
Status: implementation and independent source review complete; 53 focused tests,
typed lint, original-head regression comparison, lean Vite/bundle scan and secret
scan passed. Final hosted browser/typecheck/full CI remain pending; local Chromium
was socket-blocked and full-web TypeScript exited 137. Existing PR #316 hosted
CI/Pages/Beta acceptance/Hosting kit are green only at the starting base.

# Receipt/bill print-target isolation — 2026-11-20T12:41Z

Worker: ChatGPT automation cycle 20261120T1241Z, sequential implementer/auditor (no independent worker available).
Branch: `automation/20261120T1241Z/bug/receipt-print-css`; exact main base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/styles/print.css` and new `apps/web/e2e/print-targets.spec.ts`, plus a source-pinned `docs/handoffs/RECEIPT_PRINT_TARGETS_20261120.md` and this additive ownership entry. Do not modify adjacent active source branches.
Evidence: GP-BUG-02 in PR #312, independently source-confirmed; `print.css` applies `body * {visibility:hidden!important}` globally whereas `app.css` receipt override lacks `!important`. A bill sheet is mounted only during bill printing; a receipt print target is otherwise suppressed.
Acceptance: reproduce both print modes with print-media computed styles in a browser fixture; ensure receipt is visible without a bill, bill is visible without a receipt, and bill remains exclusive when both exist; all other UI stays print-hidden; retain sensitive-data print restrictions; source review against exact main files; run available tests or record unexecuted checks; preserve the branch as draft pending hosted qualification and separate review. No contracts, workflows, dependencies, Pages settings or deployments.
Status: implementation and six print-media fixture cases committed. Exact-source static/PostCSS syntax checks passed; repository Playwright, typecheck, lint, hosted CI and independent verification remain outstanding. Lock metadata is separate; no shared integration or protected-main merge attempted.


---

# Tor qualification repair — 2026-11-20 (Pacific)

Worker: `tor_completion`, delegated by the `994a0d214fb9-root` consolidation coordinator; independent reviewer: `integration_review`.
Branch: `fix/ghostpay-tor-qualification-20261120`; base: `e60c69f32dbbd9edf7e81ed8866144d665e3de9a` (PR #308).
Owned paths: `.github/workflows/tor-static.yml`, `tools/portable-hosting-kit/test/adapters/tor.test.mjs`, this additive registry entry, and `docs/handoffs/TOR_QUALIFICATION_REPAIR_20261120.md`.
Acceptance: compare the generated README onion-origin line exactly; install/build the complete workspace library dependencies required by whole-web typechecking, including existing test imports; preserve all source, typecheck, browser, container, no-bootstrap and deployment restrictions. Execute bounded native tests and independent source review. Require successful exact-head CodeQL and static Tor hosted qualification before promotion; source review and native tests do not establish browser, daemon or live-onion acceptance.
Coordination: root owns the generation-8 integration lease and all shared-target changes. This worker may publish only the new isolated repair branch and draft PR. Existing Tor, main, contracts, relayer runtime, dependency versions, and release/deployment gates remain outside this repair.

---

# Tor hosted qualification extension — 2026-11-19

Worker: coordinator `/root`, same Tor completion branch and base as below.
Owns new `.github/workflows/tor-static.yml` plus `scripts/tor/browser-acceptance.mjs`.
Reason: local Chromium exits before page assertions because socket() is denied;
Docker and Tor are unavailable. Add read-only CI for the lean artifact, offline
browser acceptance, and container configuration without launching an onion service.
No deployment credentials, Tor network bootstrap or public service.

# Tor static-hosting completion — 2026-11-19

Coordinator: ChatGPT `/root`; workers: `tor_scope_review`, `tor_hosting`, `tor_security`.
Branch: `feat/ghostpay-tor-completion-20261119`.
Base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (live main fetched at task start).
Scope: complete the existing 5g static HTTPS/onion hosting path with no mandatory
relayer; reuse the portable hosting kit, preserve explicit RPC/wallet disclosures,
and qualify the actual static browser artifact under independent origins/subpaths.
Owned paths: new `deploy/tor-static/`; Tor adapter source/tests/docs under
`tools/portable-hosting-kit/`; new Tor hosting tests/scripts and evidence under
`scripts/tor/` and `docs/handoffs/tor-completion-20261119/`; `deploy/TOR.md`;
new scoped spec `docs/specs/TOR_HOSTING_COMPLETION.md`; additive claim in this file.
Existing web runtime/build paths are read-only unless a demonstrated hosting blocker
requires a narrow, separately recorded ownership extension. Other open PR work is
preserved; no automatic integration of overlapping recovery/privacy work.
Acceptance: a static-only publish recipe with isolated identity storage, private
backend listener, safe Tor config and no silent clearnet fallback; validated v3
origins; focused tests, build/lint, browser request evidence, and independent defensive
source review. Actual Tor/runtime checks are required before claiming those outcomes;
missing capabilities stay explicit. No real funds or unsolicited live-service probes.
No deployment, public onion identity, release signing, gate relaxation or force push.
Status: claim recorded before implementation; design and current-source review begun.

## Tor origin validation extension — 2026-11-19

Worker: `tor_scope_review`, delegated by the Tor completion coordinator on the same
`feat/ghostpay-tor-completion-20261119` branch and base above.
Owned paths: `tools/portable-hosting-kit/src/config/host-config.mjs`,
`src/adapters/tor.mjs`, `src/serve/headers.mjs`, their focused tests, and the kit's
Tor/config documentation. Acceptance: one strict canonical HTTP v3 onion-origin
validator with checksum and generated port-80 consistency; direct adapter/header
calls refuse invalid onion origins; I2P and clearnet behavior remains unchanged.
Add bounded local validation regressions and record actual Node/lint/typecheck
results. No application runtime, RPC profile, deployment activation, or external
network behavior changes. This section is the worker's only registry edit.
# Pages scan: distinguish duplicate router callbacks from distinct router announcements (2026-11-21 UTC)

Cycle and coordinator: `20261121T0033Z-root`, one sequential assistant; no native subordinate workers or independent verifier available.
Task branch: `automation/20261121T0033Z/bug/router-duplicate-warning`, base main `aec179910c39081d820396409ff3139ff2264132`.
Owned paths: `apps/web/src/lib/scanMatches.ts`, `apps/web/src/lib/scanMatches.test.ts`, this additive task claim, and `docs/handoffs/SCAN_MATCH_DUPLICATE_ROUTER_20261121.md`. No other worker's branch or shared ledger is updated.
Finding (bounded source audit, unverified in browser): `sharedRouterAddresses` marks the same router announcement twice as a shared one-time address, even though its contract requires two different router records; an asynchronous duplicate/update should not be counted as a second record. Existing `placeScanMatch` usually deduplicates the live UI, so this is a defensive P3 false-positive warning correction, not a payment/cryptographic vulnerability.
Acceptance: a deterministic regression with duplicate announcement ID and same address does not trigger a shared-address warning, even after status refresh; two distinct router announcement IDs with the same address still trigger it. Preserve all public-scan replay filtering, one-time address identity, chain scope, and existing tests; no key, RPC, transaction, deployment or dependency changes.
Ownership reconciliation: recent overlapping UI PRs #278/#307/#317/#318 and current #341/#345, plus #262/#264 and #302, were inspected for changed paths; none currently modifies `scanMatches.ts` or `scanMatches.test.ts` (bounded PR sample, not full historical inventory). Recheck before integration. The durable integration lease on `automation/ghostpay-integration-lock` is **held by another coordinator, generation 11**, last read 2026-11-20T23:16:57Z; do not claim, release or merge any protected/shared branch.
Verification: add test before production fix, execute source-equivalent deterministic check only if original suite is unavailable, and preserve test/CI/independent-review limitations exactly. Existing `SECURITY.md` requirements apply. Draft PR only.

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

# Cycle 20261120T1600Z — PR317 exact-head regression repair

Worker: one ChatGPT implementation/verification lane; no concurrent independent verifier.
Branch: `automation/20261120T1600Z/bug/scan-tags-session-lifecycle`, based on PR #317 head `1e9c5bd40c3d7c0a67564c8598f5cf4fbd7c1ceb`; target is PR #317 owner, not main.
Owned paths: `apps/web/src/views/Scan.tsx`, `apps/web/src/views/Scan.tags.scope.test.tsx`, and a cycle-specific handoff. No other PR files claimed.
Evidence: [CI run 44756638658](https://github.com/djshellshoxxx/GhostPay/actions/runs/44756638658) shows the branch's new session-replacement test failing (requires fresh session re-unlock), pre-existing L1-04 error announcement disappearing after keyed remount, and lint `require-await` at test line 100.
Acceptance: preserve immediate no-stale-tag display and chain switching; preserve the L1-04 locked-vault/error assertion after pending unlock invalidation; require new-session re-unlock before loading tags; remove lint violation without relaxing assertions. Hosted exact-head CI and independent review before merging.
Integration lock observed released generation 7, not acquired; PR #278 owns overlapping broader Scan work and must be reconciled by its coordinator. No main changes or deployment.

---

---

# Independent F03 consolidation qualification — 2026-11-20

Worker: `invoice_file_completion`, delegated by the current unique-code consolidation coordinator.
Branch: `feature/ghostpay-invoice-file-completion-20261120`.
Source: canonical PR #310 head `1de98f6c9371010883253450446e6f7294da84fa` after its original owner's memo-locator repair.
Owned paths: this additive claim and `docs/consolidation/invoice-file-20261120/` qualification evidence.
Acceptance: independently inspect the existing repaired browser assertions and unchanged product boundary;
rebuild internal libraries from this worktree, execute the six existing request-file Playwright fixtures
in full and lean profiles where the installed browser permits execution, and report exact source and
results. Existing feature code, test assertions, build settings, timeouts, skips and coverage gates stay
unchanged unless a new demonstrated feature defect requires a separately recorded claim and review.
The original F03 owner's checkout, remote branch and round2 evidence are read-only. The root coordinator
owns final source integration, publication and main merge. No production payments or deployment.

---

# PR #310 invoice-file memo browser checks — 2026-11-20

Worker: ChatGPT `/root`; independent read-only reviewer: `/root/memo_review`.
Task branch: `fix/pr310-invoice-file-memo`; publication target: existing PR #310
branch `future/f03-private-payment-links`.
Base: `976d26ee791836c176431c8a5d0b825486f78caf`; observed main:
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/e2e/payment-request-file.spec.ts`, this additive claim,
and `docs/handoffs/PR310_MEMO_BROWSER_CHECKS_20261120.md`.
Acceptance: match complete labeled memo text in the payment-review region;
ensure locked and superseded memo absence checks detect labeled text; pass all
six invoice-file browser cases in both original full and lean configurations,
web typecheck and scoped typed lint; retain all existing assertions and gates.
Evidence: CI run `44692101562`, full job `136181689920` and lean job `136181689927`,
each failed the same four memo checks. Reinspect the PR head before publication.
Scope: test assertions only; preserve the F03 implementation and other workers.
Status: independent source review, full web typecheck, scoped typed lint, original
full/lean collection (six cases each), secret scan and whitespace check pass.
Local Chromium is blocked before assertions by socket permissions; hosted full/lean
browser qualification is required. See `docs/handoffs/PR310_MEMO_BROWSER_CHECKS_20261120.md`.

# F03 payment request interchange — 2026-11-19

Coordinator: ChatGPT `/root`; workers: `request_codec`, `request_browser`, `request_qa`.
Branch: `future/f03-private-payment-links`.
Base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (fresh origin/main clone).
Authorization: the owner explicitly requested selection and implementation of one future feature,
continuation of an existing branch if present, and fresh independent audits after completion.
Git branch inventory and connector search found no existing F03 branch at discovery.
Owned paths: new invoice-schema request-file module/tests/exports; new browser request-file
components/tests; minimal CreateInvoice/Pay integration; additive English catalog entries;
F03 specification, user guide, audit and handoff documents. No dependency, contract or fee changes.
Acceptance: the same signed envelope round-trips unchanged through URL, QR and bounded JSON file;
local explicit import preserves signature, signer, chain, expiry and payment review; stale reads
cannot replace current intent; affected-package gates, browser checks and fresh audits pass.
Existing invoice, QR and privacy work is preserved. No main merge or deployment is authorized.

Fresh audit generation: `f03_audit_standards`, `f03_audit_spec`, `f03_audit_privacy`.
Reviewed implementation: `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
Owned audit paths: respectively `docs/future/modules/F03-private-payment-links/audits/`
`STANDARDS.md`, `SPEC.md`, and `PRIVACY_SECURITY.md`. Production source is read-only
for all three auditors. Acceptance: full selected-feature source review, actual evidence limits,
concrete findings and independent follow-up on coordinator repairs. Root owns serial broad gates.
Audit repair: `f03_audit_spec` additionally owns focused app-lock regression additions in
`apps/web/src/views/Pay.requestFile.test.tsx`; root owns the minimal production repair.
Existing implementation is frozen until the new regression demonstrates the reported omission.
Catalog qualification repair: `f03_audit_standards` additionally owns additive `requestFile.*`
entries in `apps/web/locales/{ar,es,ja}.json`, using the existing unreviewed-English fallback
convention, and its report follow-up. The 45 missing-key failures are recorded before edits.
No existing translation or reviewed-security digest may change. Root owns final catalog check;
the separate specification/privacy workers independently review this bounded repair.
Status: selected implementation and fresh audits complete. The shared medium app-lock finding
is repaired with four independently RED/GREEN regressions; combined focused suite 114/114 and
full invoice-schema 813/813 with original coverage thresholds pass. Final product checkpoint
`e543d25fc7f3b65460518f4b3df4c513d34a1215` is published as exact-tree equivalent
`bd128598f1b4c5291dad5c003a4775ad47bbb888` in draft PR #310. Catalog, typed lint, typecheck,
full/lean static builds and original bundle scans pass. Actual Chromium execution remains
blocked locally and hosted checks remain pending. See the source map, audit reports, evidence
and successor prompt in `docs/future/modules/F03-private-payment-links/{QUALIFICATION,HANDOFF}.md`.

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



## Sweep balance query consent — 2026-11-18

Worker: ChatGPT recovery reviewer, Caveman workflow. Branch: `chatgpt/ghostpay-sweep-balance-consent-20261118`.
Base: refreshed `main` at `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.privacy.test.tsx`, necessary balance-query messages in
`apps/web/locales/{en,es,ja,ar}.json` and their `apps/web/src/i18n/securityKeys.ts` classification, this claim,
and `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`. The integration owner also approved explicit read-button
clicks in the shared `Sweep.test.tsx` setup and existing `e2e/{sweep,core-journey,pages-devnet,devnet-journey}.spec.ts`
sweep setup points; existing signing and payment assertions remain unchanged.
Acceptance: opening Sweep never requests a balance; one explicit click makes one balance-read invocation;
ordinary rerenders, errors and selection changes do not repeat it; changing the payment, asset, provider or session
invalidates pending results and requires a new click. Preserve the required-private-path warning and the existing
sweep controls. Disclose what the Settings RPC learns. Do not import #222's destination ledger or experimental features.
Scope distinction: the existing RPC transport has its own bounded retries; this task does not claim to change that
shared transport policy. Exact-head hosted CI and independent integration review remain required.

Milestone: runtime repair `d03d529f5b785dcd129b302d122b191d3d066214` passes 120 focused tests, whole-web typecheck
at a 1536 MiB heap cap, scoped lint and locale validation. Independent privacy review reports no remaining source
blocker and independently passes 72 consent/signing tests. Final E2E setup additions are reviewed and linted only;
browser execution and exact-head hosted CI remain required. See `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`.
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
## PR 231 standalone pre-merge disclosure repair — 2026-11-18

Worker: ChatGPT pre-merge lead; independent CI/privacy review by ci_inventory.
Branch: `repair/ghostpay-pr-231-20261118`.
Source: #231 `d9ff386807de724eb1a1c4d400c882df0fc20bb7` (full head verified in the handoff).
Target: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (main).
Owned paths: `apps/web/src/lib/scanPrivacy.ts`, its existing `scanPrivacy.test.ts`
regressions, `docs/consolidation/merge-readiness/PR231.md` and this claim.
Acceptance: reproduce the two exact hosted disclosure-equivalence failures;
extract only the scanPrivacy correction from `d6016a822f3bf238506ea5b426380bceb9d1ee83`;
retain every balance-consent/session guard and disclosure assertion; verify the
actual combined main/source tree. #222/#238 and their active source branches
are read-only. All source commits remain ancestors. Both sides of the only
merge conflict (independent ACTIVE_WORK claims) are retained. No contract,
dependency, cryptographic or gate changes.

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

---

## QA-03 typed decimal-option guard — 2026-11-20 UTC (same bounded cycle)

- Worker: sequential ChatGPT API-correctness lane; branch `automation/20261120T0641Z/bug/payment-uri-decimal-options`, base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Source: QA-03 / CORE-QA-02, documentation-only [PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) and current unchanged `packages/payment-uri/src/decimal.ts` blob `8d8ceb070d29d511a1080861f878bbc6d367798f`.
- Owned paths: `packages/payment-uri/src/decimal.ts`, new `decimal-options.test.ts`, additive claim, `docs/handoffs/PAYMENT_URI_DECIMAL_OPTIONS_20261120.md`. Separate from sibling QA-02 URI-length PR; do not edit its branch or owned paths.
- Acceptance: public parseDecimal accepts integer precision 0–77 consistently with toAtomic/formatAtomic; rejects fractional, nonfinite, negative, overly large and nonnumeric runtime precision options with stable typed INVALID_AMOUNT before BigInt exponentiation; preserve exact decimal roundtrips and fixed 8/18 scale behavior. Test first, no new feature or policy decisions.
- No native delegation or independent approval; local repo checkout was unavailable due blocked GitHub DNS. Require hosted real test/typecheck/lint and independent verification before merge. No shared ledger/main/lock/deployment changes.

---


# QC-01 encrypted reconciliation actionability — 2026-11-20

Worker/cycle: GhostPay scheduled cycle 10, sequential bug-test and integration triage; no independent worker delegated.
Branch: `automation/20261120T1042Z/bug/ledger-actionable-activation`.
Verified base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (main before this isolated task); tracking input blob: `c3b3f28796557d98536bf5220d5eb923a53eb935`.
Owned paths: `apps/web/src/components/ReconciliationLedger.test.tsx`, additive this ownership claim, isolated `docs/handoffs/LEDGER_ACTIONABILITY_20261120.md`.
Dependency/source: QA-309 QC-01 evidence in `docs/qa/2026-11-19-readonly/HANDOFF.md` on PR #309. No production logic or cryptographic policy change.
Acceptance: replace the two presence-only activation clicks with explicit enabled-state synchronization; add deterministic delayed readState regression proving no premature activation, one activation after the button becomes actionable, and imported historical data remains untrusted. Preserve original provenance assertions, avoid sleeps/timeout changes and test-product regressions.
Conflicts checked: open PR #306/#307/#310/#314 changed-file lists do not include this test; separate source owners preserved. Do not integrate or merge into main without external independent review and full exact-head CI; no deployment.
Status: ownership recorded before test modifications; repository tests not yet run.

---

# GP-BUG-03 — Chain-scoped encrypted tag list (2026-11-20)

Cycle: `20261120T1435Z`; worker: sequential coordinator acting as isolated bug implementer (no independent verifier available).
Branch: `automation/20261120T1435Z/bug/chain-scoped-tags`; exact base/main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/views/Scan.tsx`, new `apps/web/src/views/Scan.tags.scope.test.tsx`, additive `docs/ai/ACTIVE_WORK.md` claim, and a new `docs/handoffs/SCAN_TAG_SCOPE_20261120.md`.
Finding: GP-BUG-03, source-pinned audit #312; `Tags` retains an old chain's cached list when the chain picker changes and a stale `vault.list` result can repopulate the wrong view.
Acceptance: old-chain tags vanish synchronously on chain change; current chain list reloads while unlocked; asynchronous old-chain completion cannot overwrite current-chain data; returning to the earlier chain fetches its list; seller identity/session replacement cannot display an old list. Use real component tests with controlled local vault readbacks; preserve existing unlock, lock, wipe, session checks and no-network behavior.
Dependencies: main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`, existing audit PR #312 and unmerged broader #278. #278 changes Scan for private scanning but still contains this bug at inspected head `417f7c71`; do not edit its branch. Avoid work in #293's privacy/Settings and #316's print areas. Any merge requires new-head verification and integration-lease ownership. No deployment/release/funds.
Validation plan: test-first Vitest/jsdom; TypeScript, lint, web tests, full+lean hosted browser CI, independent review. Git CLI currently cannot resolve github.com, so local repository tests may be unavailable; report actual execution honestly.

---

# SellerKeys superseded operation state — 2026-11-20 08:35 UTC

- Cycle and worker: `20261120T0835Z` / coordinator acting as sequential bug-repair worker; no independent agent or review is claimed.
- Branch: `automation/20261120T0835Z/bug/sellerkeys-operation-supersession`; base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; originally reported source `apps/web/src/views/SellerKeys.tsx` blob `437c684af1fac0f759607bb3fe4f8e37238a3d89`.
- Owned paths: `apps/web/src/views/SellerKeys.tsx`, new `apps/web/src/views/SellerKeys.operation.test.tsx`, this additive claim and `docs/handoffs/SELLERKEYS_OPERATION_SUPERSESSION_20261120.md`.
- Finding: existing QA-01 from PR #309. An export superseded by backup verification strands `busy`; verification superseded by export strands `verifyBusy`. Preserve active-controller/generation checks; do not change persistent vault save/delete lifetimes or key custody.
- Dependencies/other owners: PR #309 documentation-only evidence; PR #278 recovery integration, PR #293 privacy and ongoing integration PRs #306/#307 are separate, active branches. Do not edit those branches or shared ledgers.
- Acceptance: deterministic held-operation regressions for both action orders and late settlement; correct controls after cancellation; no stale status; normal operation and explicit cancellation unchanged; source review, focused tests and hosted qualification on exact candidate. No production deployment or main merge.
- State: ownership registered before product or regression changes; code/test execution and independent review not yet claimed.

# SellerKeys operation completion — 2026-11-20

Worker: backup_completion, delegated by the unique-code consolidation coordinator.
Branch: `fix/ghostpay-backup-completion-20261120`.
Base: PR #314 `740efcf061c1ca97a562b85be742dd59f3ad0911`; main at discovery
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Owned paths: `apps/web/src/views/SellerKeys.tsx`,
`apps/web/src/views/SellerKeys.operation.test.tsx`, this additive claim, and
`docs/handoffs/SELLERKEYS_OPERATION_COMPLETION_20261120.md`.
Acceptance: independently verify the existing export/verification supersession repair;
separate cancellable unlock state from durable vault-write state if controlled tests
confirm the adjacent lifetime defect. Superseding an unlock must release only unlock
controls. An unrelated edit, session change or cancellable operation must not label a
pending vault save/delete complete or permit a duplicate. Preserve generation,
controller, session, reauthentication, and vault-write integrity guards.
Run focused original-config regressions, relevant TypeScript and lint; record actual
outcomes. Root owns remote publication and integration. Other branches remain untouched.

---

## Sweep quote and signing lifecycle correction — 2026-11-19

Worker: independent ChatGPT review agent, coordinated by the main consolidation agent.
Branch: `review/ghostpay-sweep-quote-lifecycle-20261119`; draft PR #272.
Base: `4085622463411d3ba27f4efb7b73a70575170535` (PR #252).
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.quoteLifecycle.test.tsx`,
and `docs/handoffs/agents/SWEEP_QUOTE_LIFECYCLE_20261119.md`.
Acceptance: prevent stale quotes and stale relayed, direct and same-nonce
replacement handoffs after balance, recipient, payment, provider, session, mode,
manifest or transport changes; retain submitted and uncertain-outcome evidence,
prior replacement hashes and journal compare-and-swap; preserve explicit balance
consent and existing vault, session and fee guards.

Initial quote/relayed head: `9e4ec2da024ef9a706e9d6cefa988d0a5dd9f7ac`.
Root coordinator approved the direct/replacement extension after reviewing that
head. This scope extension was recorded before source edits. Original #231/#252
and broad #262/#264 remain unchanged; main integration belongs to the coordinator.

Final source/test blobs: `2b832d371229385a2a1228e16320aceb9a64ee59` /
`41baa63e14fad5ea0dcf54c202b2ef3b0faa5476`.
Evidence: initial parent RED 28 failed/6 controls; quote/relayed GREEN 106/106;
extension RED 30 failed/40 controls at the initial head; final GREEN 142/142,
zero skipped; scoped type-aware lint, secret scan and diff check pass. Independent
source review approves both final blobs and unchanged post-handoff handling.
Prior full web build attempts were environment-limited (heap OOM 134, killed137);
final full typecheck/build, browser acceptance and exact-head hosted gates remain.
See the source-pinned handoff for commands and limits. Candidate remains draft.
No deployment, release or real transaction is authorized by this worker claim.


## Sleep-aware idle-session recovery — 2026-11-20

Worker: `/root/idle_completion_r2`, delegated by the consolidation coordinator.
Branch: `integration/ghostpay-idle-session-20261120-r2`; exact base: `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a` (PR #325).
Donor: PR #256, `e2ebb4902e53e2249c6585a1d72be6e1e416c36c`; common ancestor `14ded337a10c140d7a9f9a9238ec038587d925bb`.
Owned paths: `apps/web/src/AppShell.tsx`, `AppShell.idleClock.test.tsx`; `apps/web/src/lib/{session.ts,session.idleLock.test.ts,keyVault.ts,scanCursorSlot.ts,scanCursorSlot.test.ts}`; `apps/web/src/components/TagArchive.test.tsx`; only suspension integration in `apps/web/src/views/SellerKeys.tsx`; four idle-message additions in `apps/web/locales/{ar,en,es,ja}.json` and `apps/web/src/i18n/securityKeys.ts`; `apps/web/e2e/idle-session.spec.ts` and only invoice/idle deadline isolation in `core-journey.spec.ts` and `pages-devnet.spec.ts`; donor idle-session docs, scoped continuation evidence, and this additive record.
Acceptance: recover GP-PAGES-04 synchronous authority revocation, session-bound clock leases, sole-copy encrypted recovery and private-checkpoint revocation. Preserve PR #307's separate cancellable-unlock/durable-write lifetimes and every PR #325 Sweep guard. Union shared catalogs/claims; retain donor ancestry through a normal merge after a tests-only checkpoint. Correct the demonstrated expiry-fixture collision by placing payer time five minutes before and after signed invoice expiry, preserving all no-send/journal/reopen assertions and the 15-minute idle policy. Run decisive existing-API regressions against unchanged runtime, then qualify/review the actual combined source.
Ownership/dependencies: source-specific prior idle claims remain preserved as donor provenance. Current user continuation and coordinator assignment authorize this isolated recovery; donor branches and shared targets remain untouched. Existing dependencies are retained after exact root/web manifest, lock and build/test/lint configuration comparison; no install, copy or removal. Parent coordinates heavy checks and remote publication. No persistent-record deletion, contracts, relayers, live chain/wallet calls or deployment.
Status: claim recorded before test/runtime edits. Local browser execution remains unavailable under the existing socket policy; hosted full/lean acceptance is still required.

# Sleep-aware session security completion — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT coordinator with independent clock/lifecycle, vault/session and integration reviewers.
Branch: `chatgpt/ghostpay-idle-lifecycle-qualified-20261119`.
Qualified source base: PR #242, `ab4e0da2cfe2a18adac0424896fba0b40fac81a8`, subsequently merged
by another workstream as main `e454de6abfefda70d82784fafc1d8949b277c334` with an identical source tree.
Successor integration target: `integration/ghostpay-idle-session-completion-20261119`, from that main.
PR #227 `613667be4eeb132c7d21ccd06c627f9a7144d85b` is already an ancestor.
Owned paths: `apps/web/src/AppShell*`; idle-specific session/key-vault lifecycle changes and tests;
the idle-authority token in `apps/web/src/lib/scanCursorSlot.ts` and its regression tests;
`apps/web/e2e/idle-session.spec.ts`; directly required lock-state locale/security-key entries;
`apps/web/DEVIATIONS.md`; session-security guidance and `docs/handoffs/idle-session-20261119/`.
Acceptance: fail closed on expired/invalid clocks before activity; retire old timer/session generations;
synchronously revoke protected key operations at expiry; preserve sole-copy keys for the existing encrypted
backup/recovery path; qualify full/lean lifecycle behavior; independently review and integrate into the successor candidate.
No wallet encryption/KDF redesign, Spec 18 feature work, contract/analyzer remediation, network-isolation
redesign, dependency upgrade, deployment, release, force push or protection bypass. Other source branches
remain read-only; #238 and its recovery/privacy follow-ups continue independently outside this focused port.
Initial defects and exact acceptance evidence are tracked in the task handoff directory.

Provenance: the idle-only delta is ported from local `b2fb5f20455ca2823739f7a29ed784ec94e049c2`,
preserved remotely as `7e6089e2e40a2a7daf93961eddef17d3fe8501fd` on `chatgpt/ghostpay-idle-lifecycle-20261119`.
The broader #238 tree and its unrelated worker claims are not imported; this combined target requires fresh qualification.


### Idle recovery live-guidance follow-up — 2026-11-20

Worker/branch: `/root/idle_completion_r2`, `integration/ghostpay-idle-session-20261120-r2`. Qualified product checkpoint: `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`.
Additional owned path: only the two key-loss/retained-key rows in `docs/guides/troubleshooting-by-symptom.md`, plus this additive record.
Acceptance: resolve independent review finding IDLE-R2-DOC-01 by matching the already-recovered user troubleshooting guidance: a download requires verification before it counts as a surviving copy; idle-retained keys remain suspended for encrypted recovery until normal import/unlock. Preserve every application/test/configuration byte and request source-only review of the narrow documentation diff. Coordinator authorized this follow-up after runtime qualification.

Status at source freeze: product `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4` passed fresh independent source review, 575 focused tests across 26 complete files, original full web typecheck and typed lint, secret scan and whitespace checks. The coordinator approved the two-row guidance correction at `2605e1bf`, with its relative session-security link corrected in this documentation checkpoint. Application, test and configuration bytes remain frozen at the reviewed product. Complete original web coverage/no-coverage and lean build qualification run next on the final source tree; later evidence belongs on a separate evidence branch. Hosted browser/security/Pages promotion gates remain open. Source-pinned local evidence: `docs/consolidation/idle-session-r2-20261120/`.


## Receipt archive identity recovery R2 — 2026-11-20

Worker: `/root/receipt_identity_completion_r2`; coordinator owns publication; independent review: `/root/backup_independent_review_r2`.
Branch: `fix/ghostpay-receipt-archive-identity-20261120-r2`; base PR #333 `3172a93ceb8fce5a4343a93b453dcc0e68f09d87`.
Immutable donor: PR #332 `71632fa389ae93824b2f42d265278a9bd0f6de59`, original runtime `8e8dbedec71106b4417eada0579aee1d342fa449`; preserve its source branch/ownership.
Owned paths: this additive claim, `apps/web/src/components/ReceiptPanel.tsx`, new `ReceiptPanel.archive.regeneration.test.tsx` and `ReceiptPanel.archive.rejection.test.tsx`, source-pinned receipt handoff/evidence.
Acceptance: completed, delayed-success and delayed-rejection archive outcomes for A must not mark or report for distinct signed B; retain immutable pending writes and serialize within a mounted panel. Preserve every existing receipt/print test and all four newer print-target hunks. No signature/archive format, protocol, dependency, config, threshold, authority, fee, contract, relayer or deployment changes.
Status: completed locally on qualified source `a656c3e5dbc385a892e3efc9bd12389b214051b8`; RED 10 passing controls/3 expected failures, final 57/57 compatibility cases, original web type/lint/lean build/secret/whitespace gates passed. Independent runtime and test-correction reviews approved. Initial lint failure is retained; no assertions or rules weakened. Handoff: `docs/handoffs/RECEIPT_ARCHIVE_IDENTITY_R2_20261120.md`; evidence: `docs/consolidation/receipt-identity-r2-20261120/`. Root owns publication and required hosted/browser/full-web gates; no main/shared-ref mutation.


## Request-file passphrase completion synchronization — 2026-11-20 continuation R3

Worker: `/root/r3_feature_completion`; root owns independent review, publication
and integration. Branch: `fix/ghostpay-request-file-async-20261120-r3`.
Exact base: PR #335 `e31a090501b3f5e77afcee812323e6f69e1fd565`.
Owned paths: `apps/web/src/views/Pay.requestFile.test.tsx`, this additive claim,
and `docs/consolidation/request-file-async-r3-20261120/**`.
Acceptance: qualify and repair only the passphrase test's asynchronous completion
observation after hosted job `136548344602` on PR #333 exhausted its 15-second
DOM query while real scrypt was still opening the invoice. Observe the promise
returned by the actual single submitted `openFragment` call, retaining the real
KDF, all original assertions, the 15-second DOM query and 60-second configured
test bound. Preserve the original hosted failure and both lighter local controls;
no reproduced product defect is claimed. Add no extra decryption, precomputed
result, retry, sleep, dependency, timeout, coverage, product or workflow change.
Keep #333 backup ownership and #335 receipt identity/printing behavior intact.
Run the complete request-file and relevant Pay compatibility tests, original web
typecheck/lint/build, and record source/dependency provenance and limitations.
No local browser/socket attempts, remote mutation, live transaction or deployment.
Status: claim recorded before test changes; source confirmation granted by root.

Status update: bounded test-only implementation `9ca941305028fca0e68f86ca7e3ebe2becee724d`
passed 163/163 complete Pay compatibility cases, original web typecheck/lint and
lean build/postbuild. The original hosted failure, passing unmodified local
controls, focused-coverage threshold failures and first killed lint attempt are
preserved in `docs/consolidation/request-file-async-r3-20261120/`. Both focused
coverage selections pass 17 behavioral cases but retain exit 1 at the unchanged
global thresholds; no full-web coverage pass is claimed. Root owns independent
review, exact published-source hosted/browser qualification and integration.

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

# Isolated idle and scan qualification checkpoint — 2026-11-20 Pacific

Worker: `fc3db078ca12-root-r2`; source reviewer `/root/r2_idle_composition_review`; execution reviewer `/root/r2_ci_review`; wallet-test author and benchmark diagnostic reviewer `/root/r2_privacy_qualification`.
Owned branch: `integration/ghostpay-idle-scan-candidate-20261121-fc3db`.
Tested local source: `8f75770d5b3a935eddfddfb215f86bceb9e874e8`; public source checkpoint: `418054d5ca041973d31d514406ee4c6157ca919f`; identical complete tree: `130f42e633929e5d2c630ac9741f62d7fe9764e4`.
Source review: all original donor histories and 4,202 pre-existing nonregistry entries preserved; the only added product test is the four-case final-account regression file. Complete mapped publication trees and ordered parents were fetched and verified. This qualification addendum changes documentation only.
Executed: wallet focused tests 4/4; full web coverage 3,181 passed / 13 existing-rule skips; metadata-hardening 118/118; TRON adapter 107/107; original typed lint, full/lean TypeScript builds and bundle scans; original repository secret scan. All original coverage thresholds remain intact. Focused and full web selections overlap and must not be summed.
Unresolved: original separate no-coverage gate finished two passed / one failed at the cryptographic cost comparison; native Chromium failed during startup before page assertions, with 115 cases not run. Combined hosted CI and full/lean browser acceptance remain required. No local whole-gate or release pass is claimed.
Evidence: `docs/consolidation/idle-scan-candidate-20261121-fc3db/REPORT.md` and adjacent composition, publication, execution and lossless log artifacts retain both setup failures and final outcomes. Earlier donor/author handoffs remain historical records.
State: source and evidence prepared for isolated draft review. Shared integration/main remain outside this worker's ownership while generation 11 is held by `994a0d214fb9-root-r3`; no lock takeover, shared-target promotion, manual workflow dispatch, deployment or funds operation was performed.


## #361 privacy and recovery lineage

# Wallet disclosure quick-hide continuation above PR #354 — 2026-11-20 Pacific

- Worker: `/root/focus_recovery`, coordinated by `fc3db078ca12-root`.
- Local continuation: `test/ghostpay-disclosure-quick-hide-354-20261120`; ordered merge inputs are published #355 `f11792f7b9202512f0bf980a03f057e8a15836ae` and canonical #354 `8ce7f1db452167311876bd0707778c2e9c64f3df`.
- Concurrent #354 independently recovered the same runtime behavior, seven cancellation cases and two browser-driver repairs. Preserve its runtime, existing component test and browser files exactly. Both earlier ownership records remain intact.
- The remaining owned product path is only new `apps/web/src/components/WalletDisclosure.quickHide.test.tsx`, containing the three mounted quick-hide cases absent from #354. Update this additive claim and the existing recovery handoff; no other product change is claimed.
- Acceptance: run the three cases against original #352 runtime for controlled RED, restore exact #354 runtime, and run its canonical 13 cases plus the new three cases for GREEN. Preserve every assertion and gate. The successor must be an ordinary two-parent descendant of both published heads; no force update or rebase.
- State: claim recorded before authoring the separate regression file. Parent owns independent review, publication, retargeting and future integration. The old recovery evidence below remains historical evidence for its named sources.

# Wallet disclosure focus recovery — 2026-11-20 Pacific

- Worker: `/root/focus_recovery`, coordinated by `fc3db078ca12-root`.
- Branch: `fix/ghostpay-disclosure-focus-recovery-20261120`; exact base PR #352: `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94`.
- Owned paths: only `apps/web/src/components/WalletDisclosure.tsx`, `WalletDisclosure.test.tsx`, this additive claim and `docs/handoffs/DISCLOSURE_FOCUS_RECOVERY_20261120.md`.
- Donor: released browser-qualification branch `2affd298c364c284d4d74f703fd4a612cc0f16d9`; original runtime fix `883b05b11e8973044434cce25adf98795164dbd9`. Its handoff records completed source review and releases both paths to the coordinator. Current #348/#352 preserve the old component; main/#307 do not contain it.
- Acceptance: recover the exact donor test/runtime blobs onto the current privacy stack; reproduce the root/disabled-opener focus failures before restoring the fix, then execute the unchanged complete component test. Preserve newer locale, journal, inventory and devnet changes. Distinguish focused DOM evidence from browser/full-gate qualification.
- Boundaries: the existing integration lock and other branches remain untouched. Only a new isolated local branch is used. Publication, independent review and integration remain coordinator-owned.
- State: claim recorded before source changes. Existing #350 dependencies differ from this base lockfile; a matching scoped installation is required before any new test claim.

# Clipboard auto-clear safety primitive — cycle 20261120T004531Z

Worker: single ChatGPT operator; independent second worker unavailable in this invocation. Root integration coordinator for PR #278 is separate and holds integration lock generation 5.
Branch: `automation/20261120T004531Z/feature/clipboard-guard` based on exact draft #278 head `d74af79ebabdc8cead843361c3497b46d8c421f9`, current main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Scope: new `apps/web/src/lib/clipboardPrivacy.ts` and its tests, and bounded opt-in wiring to existing `apps/web/src/components/Common.tsx` plus focused regression tests; a task-specific handoff only. Do not touch Pay preflight/network-authorization, shared docs/automation, release branch or deployment workflows.
Dependency: issue #286 clipboard protection. Acceptance: configurable opt-in delayed clear, clear only if clipboard still equals copied value, newer same-value copy supersedes older timer, denied read/write silently leave clipboard untouched, default copy behavior unchanged. This is a reusable primitive, **not** completion of issue #286's end-user Settings control or global coverage.
Tests: first record negative reproductions for missing protection; then focused assertions and scoped TypeScript. Hosted CI and independent review required before integration. No integration lock acquired.

---

# Isolated consolidation follow-through — 2026-11-19

Worker: ChatGPT follow-through coordinator; independent consolidation, merchant and scanner reviewers.
Branch: `codex/ghostpay-consolidation-followthrough-20261119`.
Original base: PR #262 `c40b7581b9b996f33612186bc91960c65273cb64`; first refresh `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`.
Qualification base: `155d009160a6e5b2c24a91705c72fc8cca6ce815`; publication base: PR #262 `c7e09bc7cdb52e9172fa80fc2db83251fad6cd1a` (identical tree).
All incoming claims and evidence are retained.
Owned product paths: `packages/invoice-schema/src/json{,.test}.ts` and
`apps/web/src/lib/scannerCore{,.test}.ts`; this own registry entry and
`docs/consolidation/followthrough-20261119/`.
Scope: finish #265 array rejection with descriptor snapshots and avoid redundant crypto for unsupported scanner schemes.
The current base already integrates merchant-clock handling from #268. Preserve its two merchant files exactly;
the former #246 alternative and its 63-case result are superseded, historical evidence only.
Acceptance: regression-backed correction, ordinary JSON byte stability, valid-scan/replay/cancellation/progress behavior,
and the unchanged million-log corpus/180-second limit. Run original applicable tests, coverage, typecheck and lint.
Another coordinator owns shared integration. This branch remains isolated staging; shared tracking,
protected integration/main, active source branches, deployment, contracts, fees and recovery policy are unchanged.
Independent source reviews found no introduced blocker. The source-pinned handoff records actual execution:
focused scanner and million-log passes, full invoice-suite failures, and remaining hosted/browser qualification.
No repository-wide acceptance is inferred from focused checks.

# Automation cycle 20261119T095600Z — merchant profile clock validation

Worker: single ChatGPT implementation phase (no parallel independent verifier).
Branch: `automation/20261119T095600Z/bug/merchant-profile-clock`.
Base main SHA: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
Owned source: `packages/invoice-schema/src/merchantProfile.ts`, `packages/invoice-schema/src/merchantProfile.test.ts`; cycle-specific handoff only.
Finding: GP-AUD-208-01 in draft PR #266; signed profile may bypass expiry when caller provides NaN/undefined.
Acceptance: valid signed profile rejects invalid clocks deterministically; finite valid clocks preserve existing expiry boundaries; test is committed before implementation; run available checks and report unexecuted checks. Do not alter cryptographic signature or invoice formats.
Dependencies: audit #266; PR #265 owns separate json canonicalization. No shared integration lock acquired or merges authorized from this worker.

---

# Merchant profile invalid-clock integration — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator; independent source review by `privacy_completion`.
Branch: `codex/ghostpay-merchant-clock-integration-20261119`.
Base: `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33`.
Upstream: PR #268 at `ddfc8cfafa44b09103ced821f160c1d37fdfe552`; preserve its original source and ancestry, without changing its remote branch.
Owned paths: `packages/invoice-schema/src/merchantProfile.ts`, `packages/invoice-schema/src/merchantProfile.test.ts`, this additive claim, and `docs/consolidation/merchant-clock-20261119/` evidence.
Acceptance: run the exact upstream regression against unchanged baseline source, retain the finite/nonnegative verification-clock guard and existing expiry/signature behavior, run bounded original-config package checks, and obtain an independent exact-source review.
Scope: malformed verification clocks at the existing public API. No production exploit, clock-control, signature-bypass, full-workspace, coverage or deployment claim is implied. Do not change compiler/lint/coverage settings, signing formats, dependencies or adjacent feature paths.
Coordination: root holds expensive work while these bounded checks execute. Root remains responsible for final integration, rebuilt consumer outputs, publication and hosted qualification.

# Pages continuation integration — 2026-11-19

Worker: current ChatGPT consolidation coordinator (workspace 11e5ddb9da60).
Branch: `codex/ghostpay-private-checkpoint-browser-20261119` (PR #269).
Initial base: `c40b7581b9b996f33612186bc91960c65273cb64`.
Observed principal update: `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`.
Owned work: integrate the existing private-checkpoint browser correction with the
delegated private-scan error/lint repair and reauthenticated payment-key export
authorization repair; preserve the principal update and all ordered source parents.
Shared-file resolution is limited to additive ACTIVE_WORK claims. Runtime paths
remain with their delegated owners until their frozen source is independently reviewed.
Acceptance: preserve existing assertions, scoped network authorization, current-session
checks, endpoint binding, cancellation, and original qualification gates. Verify
published contents and provenance. Record baseline failures, partial observations,
interrupted checks, and unavailable execution separately; no passing-suite claim
without a completed result. The execution environment became unavailable during this
cycle, so reconstruct and review exact owned patches through the authorized connector.
Do not overwrite #262, main, another worker's branch, workflows, dependencies or gates.
Integration lock owner: `20261119T100000Z-11e5ddb9da60-root`; release after publication.
Status: source integrated for PR #269; applicable exact-source checks remain required.

# Payment export authorization completion — 2026-11-19

Worker: `feature_verification`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-export-authorization-20261119`.
Base: `c40b7581b9b996f33612186bc91960c65273cb64` (PR #262).
Owned paths: `apps/web/src/views/Scan.tsx`, its focused stealth-export integration tests,
`apps/web/src/lib/paymentKeyExport.ts`, new `paymentExportRpc.ts` and tests,
`apps/web/src/lib/networkAuthorization.ts` and focused action-policy tests,
`docs/privacy/network-egress-inventory.json`, this additive claim, and
`docs/handoffs/payment-export-authorization-20261119/`.
Acceptance: reproduce an explicit payment-key export failing after its scan grant expires
or is cancelled; obtain fresh, bounded authority only after an explicit export action,
bound to the original verified scan endpoint and chain. Preserve session and live-settings
checks, forbid fallback and unrelated RPC methods, propagate export cancellation, and
dispose each export authorization. Execute RED/GREEN integration regressions and independent
source review. Also normalize two existing Scan promise rejections identified in hosted
lint, preserving Error values and cancellation precedence. The coordinator owns integration
into continuation PR #269; this isolated source branch does not change #262, #269 or main.
No cryptographic-format, dependency, release-gate or deployment changes.
Status: confirmed two-case behavioral RED; initial repair reached both expected downloads,
then failed only an exact canonical-URL assertion. Final GREEN and inventory-runner validation
remain pending after executor interruptions. Source reconstructed from the exact base and
recorded patches when the workspace became unavailable; local claim/test commits remain
provenance, not claimed identical remote commit IDs. Details are in the scoped qualification.

# Private scan lint and rejection boundaries — 2026-11-19

Worker: `branches`, delegated by the continuation coordinator.
Branch: `codex/ghostpay-private-scan-lint-20261119`.
Base: `c40b7581b9b996f33612186bc91960c65273cb64` (PR #262).
Owned paths: `apps/web/src/lib/privateScanLifecycle.test.ts`,
`apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanClient.test.ts`,
`apps/web/src/views/Scan.privateCheckpoint.test.tsx`, this additive claim,
and a scoped qualification handoff. The feature worker owns `views/Scan.tsx`.
Acceptance: repair the inherited diagnostics identified by PR #248 lint job
`135425979082` without suppression or rule changes; retain mock assertions,
checkpoint promises and scan behavior; preserve Error identity and cancellation
precedence while replacing non-Error rejection causes with a fixed safe Error.
Add focused boundary regressions, obtain independent review, and run the bounded
original-config checks only after the coordinator grants the execution slot.
Other feature branches remain unchanged. No dependency, configuration, threshold,
remote publication, merge, deployment or release changes.

# Private checkpoint browser assertion repair — 2026-11-19

Worker: current ChatGPT consolidation coordinator, independently reviewed by the integration reviewer.
Branch: `codex/ghostpay-private-checkpoint-browser-20261119`.
Base: `c40b7581b9b996f33612186bc91960c65273cb64` (PR #262).
Owned paths: `apps/web/e2e/private-scan-checkpoints.spec.ts`, this additive claim,
and `docs/handoffs/PRIVATE_CHECKPOINT_BROWSER_20261119.md`.
Acceptance: preserve the original discovery, one-payment, no-payment-before-revalidation,
encrypted-storage, independent-profile, and concurrent-writer assertions while selecting
payment rows instead of every repeated rendering of the address. The unchanged browser
file (blob `db9e79a1337f1d8bcc423d0fc28c51e36975ee23`) already failed both full and lean
hosted browser jobs for PR #248 because the receipt repeats the payment address.
Obtain independent review and execute the available browser checks; record unavailable
or interrupted execution honestly. No runtime, storage, dependency, workflow or threshold changes.

# Canonical array repair integration — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-canonical-array-integration-20261119`.
Base: `e74ddd26b75912d770e05d51f0b9229756adc649` (root remains frozen during coverage).
Owned paths: `packages/invoice-schema/src/json.ts`, `json.test.ts`, this additive
claim, upstream PR #265 provenance, and `docs/consolidation/canonical-array-20261119/`.
Acceptance: preserve PR #265 head `c591b54078febcf24cba01b29bc173b2fac1f9cb` history
where merge-compatible; reproduce its checked-in regression against frozen baseline;
retain the reviewed own-key validation and every assertion, with bounded dense-array
controls and an explicitly documented cosmetic JSDoc correction if needed. Run
bounded original package tests and relevant package-only checks, obtain independent
privacy-worker review, and record failures/limits without weakening checks. Scope is
sparse/decorated inert arrays, not arbitrary hostile accessors/proxies or a demonstrated
signature exploit. No root checkout, other PR head, dependency, threshold, workflow,
mainnet, deployment or remote mutation. Root owns later integration and consumer gates.
Status: original PR ancestry retained via `7b264276`; reviewed product
`0f8dca27613fe9952cdb772cb10d05ced0f2b455`. Actual upstream Vitest baseline: 10 passed,
1 failed. Focused JSON/schema/signing/receipt selection: 200 passed in four files.
Package typecheck, typed lint and build passed. Privacy-worker source review found
no introduced blocker. Full package coverage and root consumer/release gates are not
claimed. Evidence: `docs/consolidation/canonical-array-20261119/QUALIFICATION.md`.

# Hosting export timestamp precision — 2026-11-19

Worker: `branch_recon`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-hosting-timestamp-20261119`.
Base: `74e3111f994481e7c9201ddb0494cf4a8405eadd`.
Owned paths: `tools/portable-hosting-kit/src/profiles/static-export.mjs`,
`tools/portable-hosting-kit/test/profiles/static-export.test.mjs`,
`tools/portable-hosting-kit/test/profiles/differential.test.mjs`, this additive claim,
and `docs/consolidation/hosting-timestamp-20261119/` evidence.
Acceptance: reproduce the source-versus-export HTTP timestamp second mismatch at a
fractional-millisecond boundary; preserve precise source timestamps, epoch and
pre-epoch behavior; retain all byte, URL, header, validator, no-follow and atomic
export checks. Run the focused regression before and after the minimal fix, obtain
independent recovery-worker review, and coordinate any larger kit/nginx replay with
the root worker's resource-bound gates. No web source, dependency, configuration,
assertion weakening, deployment, publication, or remote mutation.
Status: product `38fe7fdaf151ef433be9721af8fea7cbcdea89c4`; focused red 9/2 and
green 11/11; original full kit 285 passed, 0 failed, 14 skipped; kit typecheck and
lint passed. Recovery-worker review found no introduced blocker. Real nginx is
absent locally and its differential remains a hosted gate. Evidence:
`docs/consolidation/hosting-timestamp-20261119/QUALIFICATION.md`.

# QR import visibility cancellation — 2026-11-19

Worker: GhostPay automation bug worker, with a separate security reviewer.
Branch: `automation/20261119T073600Z/bug/camera-visibility`.
Base: `e454de6abfefda70d82784fafc1d8949b277c334` (current main at claim).
Owned paths: `apps/web/src/components/CameraImporter.tsx`, focused `CameraImporter` tests,
and `docs/handoffs/CAMERA_IMPORT_VISIBILITY_20261119.md`.
Acceptance: reproduce pending image/paste imports remaining authorized while the document is hidden;
abort those operations on hiding; reject late delivery and hidden dispatch; retain existing camera,
multipart, scope and retry behavior. Run focused tests and independent review before publication.
This isolated claim does not own other workers' scan, session, recovery, transport or integration paths.
Status: implemented at `d6e9dd38`; nine regressions failed on the original runtime and pass after repair.
All 77 focused importer tests pass. Independent security review found no source blocker and reran the
nine regressions successfully. Scoped TypeScript/typed lint pass; full hosted gates and integration remain
coordinator-owned. See `docs/handoffs/CAMERA_IMPORT_VISIBILITY_20261119.md` for exact evidence and limits.

# Camera visibility integration — 2026-11-19

Worker: `privacy_completion`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-camera-visibility-integration-20261119`.
Base: `74e3111f994481e7c9201ddb0494cf4a8405eadd`.
Owned paths: `apps/web/src/components/CameraImporter.tsx`, focused CameraImporter
visibility tests, this additive claim, and a scoped integration receipt.
Acceptance: reproduce PR #258's nine hidden-document regression cases against the
unchanged candidate runtime; merge exact `84398a79e18673f3e371a405931bc464e1cca99a`
with original ancestry; preserve idle pasted drafts, explicit retries, multipart,
scope cancellation and caller AbortSignal obligations; replay all importer tests
using the original configuration and reconciled compiled prerequisites; obtain
independent source review before coordinator integration. Preserve the original
PR author claim and receipt. No source edits outside the importer pair, no broader
web lint/typecheck, configuration/rule/threshold changes or remote mutation.
Status: original ancestry merged at `f0fe867d`; only the additive ownership registry
conflicted. Runtime/test blobs match upstream exactly. Original-config baseline nine
regressions failed, then all 77 importer tests passed on Node 22; independent source
review and qualification limits are in the scoped camera-visibility integration receipt.

# Settings exchange disclosure assertion reconciliation — 2026-11-19

Worker: `privacy_completion`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-settings-exchange-20261119`.
Base: `e76451ad56ba1634eed9d03468961900433fd130`.
Owned paths: `apps/web/src/views/Settings.exchange.test.tsx`, this additive claim,
and the scoped settings-exchange handoff/evidence.
Acceptance: reproduce the exact failing export selection case, distinguish missing
runtime disclosure from obsolete test wording, preserve preferences-only defaults,
explicit endpoint opt-in, exact listing, endpoint-path privacy and empty-section
assertions, and execute the repaired focused suite. Reuse an existing repair if
present. No runtime consent/export, locale, dependency, gate or threshold changes.
Independent recovery-worker source review and combined qualification remain required.
Status: test-only repair `83bc4f52`; original-config baseline 1 failed / 10 passed,
then 11/11 passed. Recovery worker independently pinned source review to that
commit with no blocker. Runtime and locale inputs are unchanged. Evidence:
`docs/handoffs/settings-exchange-20261119/REVIEW.md`. Combined qualification remains
coordinator-owned.

# Scan cancellation assertion reconciliation — 2026-11-19

Worker: `privacy_completion`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-scan-privacy-fixtures-20261119`.
Base: `e76451ad56ba1634eed9d03468961900433fd130`.
Owned paths: `apps/web/src/lib/scanPrivacy.authorization.test.ts`, this additive
claim, and scoped scan-cancellation handoff/evidence.
Acceptance: reproduce the four caller-cancellation failures; preserve the shared
`scan-aborted` sentinel consumed by Scan and scheduler/clients tests; recover the
existing assertion-only repair from `5c926889` if exact; retain all forbidden
dispatch, bounded abort propagation, queued-window and post-jitter assertions.
No production privacy/parser/authority, dependency, configuration or gate changes.
Focused original-config execution and independent recovery-worker review required.
Status: exact prior assertion repair restored at `9ae57de3`; original-config
baseline 4 failed / 1 control, followed by 5/5 passed. Recovery worker independently
pinned the source review with no blocker; runtime and all dispatch safeguards are
unchanged. Evidence: `docs/handoffs/scan-cancellation-20261119/REVIEW.md`.

# Tag archive idle regression reconciliation — 2026-11-19

Worker: `recovery_completion`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-tag-archive-idle-20261119`.
Base: `e76451ad56ba1634eed9d03468961900433fd130`.
Owned paths: `apps/web/src/components/TagArchive.test.tsx`, this additive claim and
scoped evidence under `docs/handoffs/tag-archive-idle-20261119/`.
Acceptance: reproduce the C-R11 full-unit failure with the original Vitest configuration,
identify stale UI expectations versus a real wiping defect, and preserve both passphrase
property/attribute clearing and the retained-copy backup-only boundary. Runtime edits
require a demonstrated defect and a separately announced scope. No root-checkout edits,
coverage threshold changes or broad qualification claims.
Status: original-config C-R11 selection reproduced one stale-form failure after the
61-second expiry; repaired selection passes with eight unrelated cases deselected.
All original mounted-field wiping assertions remain, followed by actual idle
retained-seller, suspended-authority and absent-archive checks. Runtime is unchanged.

# Idle regression type reconciliation — 2026-11-19

Worker: `recovery_completion`, delegated by the feature-consolidation coordinator.
Branch: `codex/ghostpay-idle-test-types-20261119`.
Base: `5dd63d651384a4712615e237bb09da3afcd40afb`.
Owned paths: `apps/web/src/AppShell.idleClock.test.tsx`,
`apps/web/src/lib/session.idleLock.test.ts`, and this additive claim.
Acceptance: reuse the exact eight-line test-only tail from PR #256 commit
`247c3353871bf67b6711aeacb5ad1e53faa77326` after independently confirming its runtime
safety behavior is already represented in the consolidated candidate. Preserve the
candidate's additional retained-copy raw/payment export test and every assertion.
Verify the source delta and whitespace; combined-head compilation and execution remain
coordinator gates. No runtime, dependency, threshold, workflow or release changes.
Status: the exact eight changed lines match the upstream patch; the extra raw/payment
export case is byte-preserved; `git diff --check` passes. No new test or lint run claimed.
# Pages artifact verifier race repair — 2026-11-19

Worker: `clock_hosting_review`, assigned by the consolidation coordinator.
Branch: `repair/ghostpay-276-artifact-races-20261119`.
Parent: PR #276 `f39a9dd36c09f8b02d937c5f3d19676d334976d6`.
Owned paths: `scripts/pages/verify-pages-artifact.mjs`, its original test file,
this additive claim, and `docs/handoffs/agents/PAGES_ARTIFACT_RACE_REPAIR_20261119.md`.
The original PR #276 branch remains read-only. This isolated follow-up retains
all six parent test groups and its original producer/workflow behavior.
Acceptance: reproduce the commit-read and symlink-swap false successes before
repair; parse commit metadata from the bytes whose hash passed; reject observed
file/inventory changes with validated regular-file descriptors and no-follow
opens; verify failure cleanup and the documented stable-input/platform boundary.
Coordinator-authorized review extension: reject directory-entry and manifest
bytes that do not round-trip through UTF-8, retaining valid Unicode filenames.
Run only dependency-free Node tests and source checks, obtain independent review,
and publish a draft with exact source/test pins. No real artifact, hosted CI,
deployment, main integration, or arbitrary concurrent-filesystem immunity claim.

# Pages multipart QR malformed Unicode guard — 2026-11-19

- Cycle/worker: `20261119T124337Z` / single ChatGPT coordinator with sequential bug, audit and documentation phases; no parallel or independent verifier available.
- Branch: `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard`; base `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrMultipart.ts`, `apps/web/src/lib/qrMultipart.test.ts`, this isolated claim and `docs/handoffs/QR_MULTIPART_SURROGATE_20261119.md`.
- Discovery: single QR `makeQr` rejects unpaired UTF-16 surrogates, but multipart `TextEncoder` silently replaces them with UTF-8 U+FFFD. Node 22 reproduction: `\uD800` encodes as `EF BF BD` while valid astral pairs round-trip unchanged.
- Acceptance: test-first rejection of isolated high/low surrogates and mixed strings by `toMultipart` and `multipartIfNeeded`; valid paired Unicode text still encodes and decodes; no QR/format/protocol change for valid payloads; no dependencies added; exact-head CI and separate review before merge.
- Coordination: inspected changed-file inventories of active PRs #238, #240, #243, #244, #246, #249–#252, #254–#256, #258, #260–#262, #264–#265, #267–#278; neither owned QR file appeared (bounded sample, not an exhaustive review of all open PRs). Broad #278 and recovery integration remain externally owned. Metadata lock generation 3 observed released at `6408563f55081ee941c2036086c025ebf63d2c96`; no shared lock acquired, no merge planned.

---

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

# Recovery authority boundary review — 2026-11-19

Worker: recovery_completion; branch: `codex/ghostpay-recovery-authority-20261119`.
Base: `b529a720` from existing master consolidation. The earlier main-based Spec18 port is preserved locally at `2176e4937a905d3c5603b5db9560d8675d0b51c5` and is superseded because the master already contains its strongest #239/#240/#256 behaviors.
Owned paths: `apps/web/src/lib/paymentKeyExport.ts`, focused recovered-key expiry regressions, `scripts/recovery/stealth-export-recover.test.mjs`, and scoped evidence/handoff.
Acceptance: reproduce and close any resumed-async/recovered-key loan that bypasses synchronous idle authority checks; preserve empty-session recovery, exact saved-byte verification, safe replacement, and boxed-key disposal. Retain independent recovery permission isolation on supported Node versions. No duplicate feature import, dependency, custody, contract, or release changes.
Status: implemented at `bdf6589f0dd07d9ab1935489c72160e1d99f2c82`; baseline five failures reproduced, 39 related tests pass on Node 24, six expiry cases plus independent recovery isolation pass on Node 22. Independent review and combined-head CI remain coordinator gates. Evidence: `docs/handoffs/recovered-key-authority-20261119/REVIEW.md`.

# Unified privacy follow-up — 2026-11-19

Worker: privacy_completion, coordinated by root.
Branch: `codex/ghostpay-profile-consistency-20261119`.
Base: existing master consolidation `b529a720cfbfa3c1056cc71085b4f163078e7591`.
Owned paths: `apps/web/src/lib/networkAuthorization.ts`, its profile-consistency and existing
authority tests, `apps/web/src/views/Settings.tsx`, `Settings.test.tsx`, this registry and scoped handoff.
Acceptance: refuse truncated saved profiles at both production authority and standalone RPC
boundaries; preserve stale-form revision checks across storage events without erasing drafts;
retain saved-secret UI persistence fixture from the existing master. Run red/green regressions.
Existing master already contains #248, #249, #251 and #256; do not duplicate their integration.
Follow-up source comparison identified missing final tails: #249 `c17e5c38` configured-CSP
scanner handling (five source/test files), #248 `18b36745` app-lock Scan pause and its tests,
and #251 `5ec15534` blocked-profile test assertions. Integrate these exact deltas while
preserving master AST/all-HTML scanning and the existing saved-endpoint UI fixture.
Additional acceptance: a changed network-profile record before its storage event must prevent
a pending private journal write; owned `Scan.tsx` and its private-checkpoint regression.
Status: three source-pinned follow-ups committed and 323 focused tests passed; evidence and
compiled-build limitations are in `docs/handoffs/privacy-master-followup-20261119/REVIEW.md`.
Combined-source CI and coordinator integration remain required.

# Spec 18 independent completion review — 2026-11-18

Coordinator: ChatGPT root a264. Branch: `chatgpt/spec18-recovery-reviewed-20261118-a264`.
Base: PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec`; main observed at
`dfc75ef2087fa6463ae59e0818abec01796c578d`. A concurrent local Spec 18 implementation
on `chatgpt/spec18-recovery-completion-20261118` is preserved read-only. This branch
integrates a fixed, hashed snapshot for independent testing and fixes, without
changing the original checkout or its branch.

Ownership: coordinator owns snapshot integration, browser acceptance, locales, reports
and publication; separate review lanes inspect crypto/offline recovery and UI/lifecycle
with edits assigned explicitly after findings. Acceptance: all twenty specified threats
are traced to source and executed tests; backup retention and verification stay distinct;
imports require fresh bound consent; offline recovery reproduces spending authority;
full feature gates execute or exact blockers are recorded. No release, deployment,
main merge, forced update, secret persistence or unrelated feature work.

Assigned lanes on this branch:

- `crypto_recovery_review`: `packages/ux-vault/src/stealth-export-portable*.ts`,
  `scripts/recovery/**`, the Spec 18 format reference and independent recovery guide.
  Acceptance: authenticated bounded recovery, authority reproduction and failure cleanup.
- `lifecycle_review`: `StealthExportRecovery`, `StealthExportVerification`, their tests,
  `StealthExportSelection.test.tsx`, and `paymentKeyExport` source/tests. Acceptance:
  bound fresh consent, verify-only disposal, selected-file and session cancellation.
  A reproduced import-preservation defect additionally assigns the narrow `session.ts`
  box/install transaction and `session.atomicity.test.ts`: stage the replacement
  before disposing the old keys and clean partially allocated secret boxes on failure.
- Coordinator: remaining export panels/Common, locales/security keys, browser tests,
  dependency preparation, combined qualification, evidence and integration.
- `recovery_recon`: read-only independent final source/threat review; sole write scope
  is `docs/handoffs/spec18-reviewed-20261118/THREAT_REVIEW.md`.

Hosted test follow-up, `lifecycle_review`: local source
`58995408bec0e072a969db7bd4eb4687579bd4a7`; findings from hosted jobs
`135206455356`, `135206455231` and `135206357114`.
Owned paths: the test-only receiver/type repairs in `apps/web/e2e/stealth-export.spec.ts`
and `apps/web/src/lib/session.atomicity.test.ts`; exact legacy `Verify backup` button
selectors across the affected `apps/web/e2e/` journeys. Acceptance: resolve the three
hosted typed-lint diagnostics and disambiguate legacy keystore verification from the
new Spec 18 verify-only button while retaining all assertions, timing and release gates.
Run only bounded focused checks during the coordinator's full web coverage run;
fresh hosted browser/lint results remain necessary. No runtime or remote changes.

Hosted real-crypto synchronization follow-up, `lifecycle_review`: local source
`7d99c223e977938cd96c5e496232bad44a3b4799`, published candidate
`b536b1c560c3de43b9b5a3bbbbb8bc34474fbe73`; hosted job `135212473022`.
Owned path: `apps/web/src/components/StealthExportVerification.test.tsx` only.
The two real-verification cases exceeded Testing Library's default polling deadline
while the KDF remained active. Observe the actual call-through verification promise
and await its settlement inside React `act` before the existing DOM assertions.
Require the real rejection for the wrong passphrase. Preserve cryptography, KDF cost,
all assertions, the global test deadline and every gate; no synthetic success or delays.
Acceptance: focused 14-case file and the existing 13-file feature selection execute,
with separate source review and a fresh hosted full-web result still required.

Final status: Spec 18 feature acceptance complete on local `8461dbdf`, published
`07a7497d1a0cb39fb6904e5c50f8a52db2285820` (identical tree
`6febc03ffd521fe9ac00ac10275f9ff625db509c`). Final hosted web coverage passes
3,000 tests with one existing BTC regtest skip; the separate nocov phase passes 3/3.
Vault 353/353, core crypto 76/76, all eight Spec 18 browser cases in each profile,
Pages Anvil 16/16, typechecking, source builds and production dependency audit pass.
Independent offline recovery passes 22/22 and synthetic Foundry spending passes 1/1.
All twenty threats are reviewed with no unresolved feature blocker. Draft PR #239
is stacked on the unchanged #238 base. Inherited owner-review/package-map gates,
chain-adapter lint and hostile-text navigation remain failed; release/device limits
remain explicit. Final report and raw evidence: `docs/handoffs/spec18-reviewed-20261118/`.
The final handoff commit changes documentation/evidence only. No merge or deployment.
# Pinned invoice signer completion — 2026-11-18

Worker: ChatGPT coordinator, protocol_validation, pin_management, and independent integration/security reviewers.
Branch: `chatgpt/ghostpay-pinned-signer-completion-20261119`.
Base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238; includes PR #234 at `5e9e7be70399a9818579cf87bd494e013e25d4f9`).
Owned paths: invoice-schema validation/error regressions; Pay inspection and focused lifecycle tests;
new invoice signer pin store/component and tests; additive signer i18n entries; dedicated browser acceptance;
user/developer signer documentation and this task's source-pinned qualification report.
Acceptance: preserve canonical secp256k1 signatures and all existing envelope formats; explicit local seller-key
pins and confirmed replacement; accurately separate signature validity from selected-key trust; invalid/missing/
unsupported/malformed/unavailable states; no stale asynchronous trust, cross-seller substitution or new network
requests; execute focused and full applicable qualification, and obtain independent security review.
PR #239/#240 recovery, #241 network isolation, session key lifecycles, unrelated lint/dependency gates and Mythril
findings remain separately owned. No smart-contract changes, main merge, deployment or release.

# Sleep-aware session security completion — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT coordinator with independent clock/lifecycle, vault/session and integration reviewers.
Branch: `chatgpt/ghostpay-idle-lifecycle-20261119`.
Base/integration target: PR #238, `integration/ghostpay-pages-completion-20261118`,
`198aa5baff22272453733a0f3dcfcac0e0994eec`; main `dfc75ef2087fa6463ae59e0818abec01796c578d`.
PR #227 `613667be4eeb132c7d21ccd06c627f9a7144d85b` is already an ancestor.
Owned paths: `apps/web/src/AppShell*`; idle-specific session/key-vault lifecycle changes and tests;
`apps/web/e2e/idle-session.spec.ts`; directly required lock-state locale/security-key entries;
`apps/web/DEVIATIONS.md`; session-security guidance and `docs/handoffs/idle-session-20261119/`.
Acceptance: fail closed on expired/invalid clocks before activity; retire old timer/session generations;
synchronously revoke protected key operations at expiry; preserve sole-copy keys for the existing encrypted
backup/recovery path; qualify full/lean lifecycle behavior; independently review and integrate into #238.
No wallet encryption/KDF redesign, Spec 18 feature work, contract/analyzer remediation, network-isolation
redesign, dependency upgrade, deployment, release, force push or protection bypass. Other source branches
remain read-only; #239/#240 overlaps must be reconciled only if they reach the selected integration head.
Initial defects and exact acceptance evidence are tracked in the task handoff directory.

# Browser network isolation completion — 2026-11-19 UTC

Worker: ChatGPT lead, bounded-transport implementer, policy/adapter implementer, independent review.
Branch: `codex/network-isolation-complete-20261119`.
Pinned inputs: main `dfc75ef2087fa6463ae59e0818abec01796c578d`; #238
`198aa5baff22272453733a0f3dcfcac0e0994eec`; #241
`e8857bfa1ec93fafa9ff83f63f7430ef26a362c2`. This isolated integration preserves
both input histories; source branches remain read-only. The stacked PR targets
`integration/ghostpay-pages-completion-20261118`.
Owned additions: central browser authorization/lifetime module and focused tests; bounded
Esplora/indexer/relayer follow-up and tests; per-dispatch service/scan authorization integration;
network-specific settings/Sweep/chain-view integration as required; browser/native regression
fixtures; network inventory, acceptance matrix, documentation and source-pinned evidence.
Unrelated session/key-export/recovery/signing behavior and all contracts/security gates are
outside this work. Recheck active source heads before publication; retain concurrent fixes.
Qualification update: source implementation and independent bounded review are complete; local full-web and package gates are running. Main rechecked at `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`: #241 and #237 were merged externally, and both exact inputs already exist in this branch. #238 remains at the pinned draft head. Chromium launch is blocked locally by a native socket permission error; final hosted browser/Pages qualification is required before completion is claimed.
Acceptance: fail closed on revoked or stale authorization/settings, preserve the exact selected
endpoint without fallback, bound non-cooperative fetch/reads/cleanup, invalidate old sessions and
cross-tab settings, action-scope Sweep consent, preserve offline actions and prove actual
outbound destinations in browser/native fixtures. No merge, deployment or release claim.


# Cycle 20261119T104800Z — browser jitter expiry clock rollback (isolated)

Coordinator: ChatGPT direct GitHub connector; execution one sequential assistant, no second independent reviewer/subagent.
Worker/role: bug repair and regression author.
Branch: `automation/20261119T104800Z/bug/jitter-expiry-rollback` (base main `14ded337a10c140d7a9f9a9238ec038587d925bb`).
Owned paths: `apps/web/src/lib/jitter.ts`, `apps/web/src/lib/jitter.test.ts`, `docs/handoffs/JITTER_EXPIRY_ROLLBACK_20261119.md`; claim on this branch only.
Dependencies: current `main`; #246/#262/#264 and recent focused #269–#272 inspected for modified-path overlap (none of these touched jitter source/tests). No other active worker's branch will be edited.
Acceptance: a scheduled invoice must not become ready solely because the system wall clock moves backward while a monotonic delay elapses; normal waiting/ready/expired/cancel behavior and sendNow behavior preserved. Commit regression test first, then minimal implementation; report actual checks and exact-head hosted gates.
Out of scope: money movement, backend, contracts, relayer, production deployment, UI policy or product decisions. No shared integration/ref update/merge without valid lock ownership and required independent verification.
Status: regression committed first at `2b7cedbd`, repaired at `dbe6e975`, and source-blob-identity Node verification passed (two RED-on-base/GREEN-on-fix scenarios, seven existing controls); isolated source TypeScript check passed. Repository Vitest/lint/build, exact-head hosted CI and independent verification remain pending. See `docs/handoffs/JITTER_EXPIRY_ROLLBACK_20261119.md` (handoff commit `3503075a`).

---

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



# Repository consolidation — 2026-11-18 (active)

# Pages smoke render-error regression — 2026-11-18

Worker: security_recovery, independent Pages review lane. Branch:
`integration/ghostpay-pages-smoke-render-errors-20261118`. Base:
`e85db1ef942bda9cb54317a6c036a22484b46ff9` (coordinator integration source).
Owned paths: `scripts/pages/smoke*`, a narrow render-error observer and its Node
regressions, this claim, and `docs/handoffs/agents/PAGES_SMOKE_RENDER_ERRORS_20261118.md`.
Acceptance: a caught, uncaught or recoverable React root error must fail the Pages
smoke check even when navigation still renders; arbitrary console messages and
error payloads must not be copied into the new failure record. Preserve existing
page-error, request-failure and foreign-request checks and manual deployment policy.
Run low-memory Node regressions only while the coordinator builds libraries.
No browser-pass claim, app/runtime change, remote mutation or deployment.
Status: source `a77cadbb7deca0cb2bf8829ed1215962bb8b4d9f` passes all 9 new
entrypoint regressions and the complete 95-test Pages Node suite with one worker;
the CI reviewer independently cleared the source and reran all 9 regressions.
The tests use synthetic browser events, so actual Chromium/hosted acceptance remains
pending. See `docs/handoffs/agents/PAGES_SMOKE_RENDER_ERRORS_20261118.md`.

# Pages beta consolidation continuation — 2026-11-18

Worker: ChatGPT coordinator, with independent branch archaeology, recovery/security and CI reviewers.
Branch: `integration/ghostpay-pages-completion-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: consolidation conflicts and Pages security/privacy integration, focused regression tests,
this registry, and `docs/handoffs/pages-completion-20261118/`.
Follow-up: the coordinator owns the legacy portable keystore's temporary passphrase-byte lifetime and its focused
regression in `packages/ux-vault/src/keystore-portable*`; archaeology independently reviews the change.
Recovery, dependency and security-tooling implementation use separate worktrees and branches.
Existing remote PRs are read-only source inputs. The #209 extraction includes Pages hosting protections,
root error reporting and backup navigation; release-test relaxation and unrelated workflow updates are excluded.
Acceptance: preserve non-custodial client-side key handling and testnet restrictions; integrate only reviewed changes;
execute focused and combined tests; obtain independent review; record source and evidence before any main merge.
No deployment, release, branch deletion, force-push, or paid agent workflow activation is authorized.
This restores the coordinator claim first committed in `b828b44e`, dropped during registry reconciliation.
Qualification update: the full `npm test` command completed at `e8c77e7e8699dd16b86b7a1ff90b834594d07105`
with exit 0 on Node 22.23.5/npm 11.21.2. The identical runtime tree was published as draft PR #238 at
`9bad95e5cc0ee73f5adb8d2c587161074b21e080`. Documentation integration `e033855b` changes no runtime/test input.
The coordinator owns final result/diagnostic reconciliation in the completion packet and the Pages README's
HTTP/CSP reachability clarification. Subsequent published-runtime full/lean builds, Pages static/loopback checks,
development release build and two-clean-clone reproducibility passed. The final isolated web lint retry exited 137;
actual browser attempts failed before application assertions. Strict Mythril, full dependency audit and final
candidate hosted/security gates remain unresolved. Completed execution and independent evidence review are in
[the completion packet](../handoffs/pages-completion-20261118/COMPLETION_REPORT.md); the PR body carries the final
documentation head, transport mapping and refreshed CI observation. No main merge or release is qualified.

# Pages privacy consolidation — 2026-11-18

Worker: ChatGPT coordinator. Branch: `integration/ghostpay-privacy-20261118`.
Base: `305ccb0d570c27a47435083059492edc819a0101` (reviewed narrow repairs staged from main).
Owned paths: privacy changes from #222, #228, #230 and #233, their integration conflicts and focused regressions.
Acceptance: preserve v4 checkpoint names and explicit balance-request lifecycle from #235/#231; encrypted invoice default,
minimized receipts, per-dispatch RPC policy and session-only sweep linkage must pass combined tests and independent review.
All publication, main merge, hosted qualification and release actions remain coordinator gated.


# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
Source `613667be` is now staged in the consolidation branch; final combined-head qualification remains pending.

# Session-only sweep destination history — 2026-11-18

Worker: ChatGPT security review, Caveman workflow. Branch: `chatgpt/ghostpay-sweep-ledger-memory-20261118`.
Base: PR #222, `2bc2098298d90928eb1acafad969f28316bb05fc`.
Owned paths: sweep destination history source/tests, the two Sweep view recording call sites and focused tests,
the existing reuse-warning messages, user privacy guidance, this claim and the task handoff.
Acceptance: no source/destination linkage is serialized to browser storage; delete only the legacy plaintext key
without importing it; clear memory on app lock and seller-session change; reject delayed records from old epochs;
retain nonblocking reuse warnings within the active session. Persistence across sessions stays unavailable until an
encrypted, explicitly opted-in design is qualified. Signing and duplicate-send journal behavior remain unchanged.
Local verification complete: 171 affected tests, focused lint, whole-web typecheck and i18n check passed.
Evidence and remaining integration gates: `docs/handoffs/GHOSTPAY_SWEEP_LEDGER_PRIVACY_20261118.md`.

# Pages Spec 18 recovery integration — 2026-11-18

Worker: security_recovery (independent integration lane). Branch:
`integration/ghostpay-recovery-completion-20261118`. Base:
`dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: Spec 18 export/recovery components and tests, paymentKeyExport and stealthExport
helpers, exact credential/session additions, ux-vault portable codec and tests, recovery
scripts/vectors, recovery i18n entries, exact Scan/SellerKeys wiring, and this handoff.
Inputs: #213 `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` and #229
`18110015e99efbeb4f23d47cd88bd6f917010108`. The coordinator owns unrelated
privacy/session/scanner changes and final integration. Acceptance: inspect current sources,
reconcile both PRs onto live main, reproduce and fix concrete defects, run complete focused
codec/recovery/vault checks plus web typecheck and scoped lint, and record exact evidence.
No remote mutation, deployment, release, mainnet enablement or browser-pass claim.
Status: integrated and independently reviewed at code/test source
`f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`. Web recovery selection 135/135,
core crypto 75/75 and complete vault coverage 348/348 pass; the independent
export/i18n selection passes 24/24. Node recovery passes 15 cases, with the
separate raw-key interoperability case passing on available Foundry 1.5.1 only.
Full-web typed lint remains blocked by executor memory; actual browser, pinned
Foundry 1.8.5 and final combined/hosted qualification remain pending. See
[the exact-source recovery handoff](../handoffs/agents/PAGES_RECOVERY_INTEGRATION_20261118.md).

# Recovery cancellation review — 2026-11-18

Worker: ChatGPT recovery review agent using the Caveman workflow. Branch:
`chatgpt/ghostpay-recovery-review-20261118`; base PR #213
`ebf7c92c3be1c7aebd37fc58b5567e114fb932fc`. Root coordinates integration.
Owned paths: `apps/web/src/components/StealthExportRecovery.tsx` and its test;
`docs/user/recover-stealth-payment-keys.md`; the scheme-1 boundary in the format reference and recovery script help;
the three existing payment-export warning strings in `apps/web/locales/{en,es,ja,ar}.json` (coordinator-approved);
this claim and the recovery review handoff.
Acceptance: reproduce a cancelled master-import request affecting a later export, bind replacement authorization
to the selected export and current operation, preserve lock/session guards, and verify the focused recovery suites.
Document the scheme-1 viewing-key plus payment-private-key spending-authority boundary. Other locale, session,
Scan and CI paths remain coordinator-owned. No remote mutation, deployment, release or real funds.

# Spec 18 key portability + consolidation follow-through — 2026-11-18 (ACTIVE)

Worker: Claude Code cloud session `ghostpay-consolidation-9xhtxg` (this session promoted PR #203 to `main` as
`5467c158`). Spec 18 work started 06:27 UTC from candidate `71abc7e5` (tree equal to `main` `5467c158`) on local branch
`spec18-local`; pushed to `claude/ghostpay-consolidation-9xhtxg-spec18`. Committed so far: format reference `a62f489d`,
codec `5c0a12cc`, independent recovery script + K04 anvil interop + user guide `b5762d19`; web UI, e2e, independent
review and verification in progress.

| Lane | Owned paths (exclusive) | Acceptance |
|---|---|---|
| Spec 18 K01-K06 (codec, recovery, web UI, e2e) | `docs/specs/18-stealth-keypair-export-formats.md`; `packages/ux-vault/src/stealth-export-portable*.ts`, `packages/ux-vault/src/{portable,portable-errors}.ts` export/error lines; `test-vectors/{generate-stealth-export.mjs,stealth-export.json}`; `scripts/recovery/**`; recovery user-guide page; `apps/web/src/lib/{stealthExport,paymentKeyExport}.ts` (+ tests), re-authentication helper lines in `apps/web/src/lib/{session,keyVault}.ts`; spec 18 entry points in `apps/web/src/views/{Scan,SellerKeys}.tsx`; `apps/web/src/components/StealthExport*.tsx`; `apps/web/e2e/stealth-export.spec.ts`; `stealthExport.*` / `error.stealthExport.*` keys in `apps/web/locales/*.json` and `apps/web/src/i18n/securityKeys.ts`; one glob added to the ts-test shard-0 script-test line in `.github/workflows/ci.yml` | Spec 18 acceptance list on one exact SHA; independent review; external wallet/device rows pending |
| #204 reconciliation (PR #206) | `CLAUDE.md`, `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md`, the ci.yml shard-0 script-test line | Merged after green CI |
| Security/release reconciliation (PR #212) | `docs/audits/{mythril-reevaluation,echidna-and-fee-token-review,ci-supply-chain-review}-20261118.md`, `docs/handoffs/consolidation-20261118/{OWNER_ACTION_PACKET,STATIC_BETA_DECISIONS}.md`, `docs/pages/PAGES_QUALIFICATION_20261118.md`, `scripts/contract-analysis/mythril-disposition-check.mjs` + test; already made before seeing #209's claim: `.github/dependabot.yml` (CI-06), `apps/web/package.json` `validate:deployments` script + `apps/web/src/validateDeploymentsScript.test.ts` + `apps/web/deployments/README.md` (B03) | Merged after green CI; #209 lanes B1/B4 may skip CI-06 and B03 |

Not claimed (left to PR #209 / #211): SEC-09/SEC-10 Pages origin and loopback CSP, every other #205 row.
Out of scope: deployment, signing, release, mainnet, contract source changes, branch deletion, owner decisions.


# Pages beta security tooling extraction — 2026-11-18

Worker: ChatGPT branch-archaeology/security-tooling worker. Coordinator: current Pages integration session.
Branch: `integration/ghostpay-security-tooling-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.

Owned paths: standalone Mythril disposition helper and its tests; web deployment-validator npm entrypoint and
regressions; local audit static helper and tests; HTTPS-only pinned download commands; bidirectional-character
source escapes; shared RPC fetch metadata regression; viewing-key boundary regression and directly related docs;
agent workflow path-policy and untrusted-input hardening plus focused tests; cached-solc integrity verification.
Source inputs: #212 + #225, #224 + #226, and selected security changes from #220. These branches remain read-only.

Acceptance: preserve source pins, current action pins, runner selection, existing workflow triggers and approval
gates; the Mythril helper remains unwired; reproduce applicable pre-fix regressions and run focused Node/Vitest,
typecheck, lint and security checks. No contract, D-1 proof-design, deployment, publication or gate-policy change.
The coordinator owns browser privacy/receipts, shared integration and remote writes. RPC fetch options overlap #222
and must resolve to the same `omit`/`no-referrer`/`no-store` behavior.

# Repository consolidation — 2026-11-18 (historical)
# Private seller scan completion — 2026-11-19

Owner: ChatGPT coordinator with independent scan reviewer, encrypted-storage worker and scan UI worker.
Branch: `chatgpt/ghostpay-private-scan-completion-20261119`.
Base: PR #235 `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1`; main observed
`dfc75ef2087fa6463ae59e0818abec01796c578d`. Updated main
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (#241 transport isolation and #237 log retention)
was merged into this feature branch at `684eec18` before combined qualification.
Owned paths: EVM `scanClient`, new `privateScanStore` and `privateScanLifecycle`, `views/Scan`,
scan services, focused scanner/storage/lifecycle/browser tests, minimal seller-vault deletion integration,
related locale strings and scoped user/developer/handoff documentation. The scanner's optional per-dispatch guard
in `scanPrivacy.ts` is included; PR #241 transport implementations remain separate. Storage worker owns
`privateScanStore.ts` and its tests; UI worker owns Scan/services and view/browser tests; coordinator owns
engine/lifecycle/integration. Independent reviewer owns only
`docs/handoffs/private-scan-independent-review.md` and otherwise remains read-only.
Acceptance: atomic encrypted discovery+cursor persistence; seller/network/config/session isolation;
safe interruption, recovery, cross-tab conflicts, deletion and reorg handling; bounded scan work;
failing-first regression evidence; full/lean browser qualification and unchanged security gates.
PR #238 is a read-only consolidation input; #241 transport modules, Spec 18 formats, contracts,
dependency inputs, automation branches and unrelated work stay with their existing owners.
No merge into main, deployment or release is authorized.

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

# Historical safeguard recovery — 2026-11-18

Worker: history_census (Caveman investigate-first), coordinated by master consolidation.
Branch: `integration/ghostpay-historical-fixes-20261118`.
Base: `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` (reviewed PR #241 merged).
Owned paths: `packages/chain-adapters/src/{deployments,quote,rpc}.ts` and focused tests;
`packages/tron-adapter/src/rpc.ts` block-range validation only and `scan.test.ts`; this claim and scoped handoff.
Source provenance: `e2fef011ca1195d6c5edaf4e1ea1055692462004`,
`b098b73a3a93bde331b7f49123e99d3406b6cb6f`, `c37604d1b1cf561573270d6cc002418003f80b69`.
Status: selected runtime safeguards recovered; baseline regressions reproduced; affected package coverage
passed (552 chain-adapter tests plus 104 TRON tests). Coordinator independently reviewed the source diff.
Concurrent typecheck was killed with exit 137; remaining checks and combined-source CI are recorded in the
scoped handoff, `docs/handoffs/consolidation-20261118/HISTORICAL_ADAPTER_SAFEGUARDS.md`.
Acceptance: reject impossible manifest calendar dates; bounded retries for non-finite inputs; preserve the existing
0..30 price-decimals bound with additional regressions; refuse incomplete/noncontiguous TRON block ranges;
preserve PR #241 transport isolation. The historical price-decimals runtime hunk is redundant and excluded.
Apply only those previously implemented safeguards and regressions, run focused failing/passing evidence and
affected package checks, then hand off for independent review. No new feature, dependency, policy, deployment or release.

# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
The test file is imported from the separate review lane; product edits start after this claim. PR #209's frame and
unload changes remain on its own branch. No deployment, signing, publication, mainnet, or release-gate changes.

# Repository consolidation — 2026-11-18 (active)



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



## Bitcoin spent-output privacy completion — 2026-11-18

Coordinator: ChatGPT `/root`, Caveman investigate-first. Branch:
`chatgpt/btc-spentness-private-scan-20261118`.
Base: main `dfc75ef2087fa6463ae59e0818abec01796c578d`; preserve PR #219
`9617e8572f9bc414410bd937b0e7718d0c5bd55c` through an explicit integration commit.
Owned paths: Bitcoin scan source/state and focused tests under
`packages/btc-silent-payments/src/scan/` and `apps/web/src/features/btc/`, Bitcoin
browser acceptance, existing Bitcoin English disclosures/fallback security keys,
Bitcoin documentation/DEVIATIONS, this claim, and a feature-specific qualification report.
Acceptance: local input matching, conservative unknown status, explicit provider
consent through worker dispatch/retry, encrypted resumption, reorg-safe spend
evidence, historical migration and deterministic regression/browser coverage.
Independent reviewer `spentness_review` reads all feature code without modifying it
and owns `docs/handoffs/btc-spentness-20261118/INDEPENDENT_REVIEW.md`.
Implementation worker `state_engine` owns the library's scan state/scanner source
and tests. `ui_consent` owns Bitcoin view/worker consent and browser tests.
The coordinator owns Esplora parsing, the web scan wrapper, header-result
invalidation, disclosures, documentation and combined qualification. These disjoint
paths are reviewed before integration.
PR #235 seller checkpoints, Spec 18 recovery, EVM, general network isolation,
contracts/Mythril, dependency upgrades and general consolidation are excluded.
No main merge, branch deletion, force-push, deployment or release publication.


## Sweep balance query consent — 2026-11-18

Worker: ChatGPT recovery reviewer, Caveman workflow. Branch: `chatgpt/ghostpay-sweep-balance-consent-20261118`.
Base: refreshed `main` at `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.privacy.test.tsx`, necessary balance-query messages in
`apps/web/locales/{en,es,ja,ar}.json` and their `apps/web/src/i18n/securityKeys.ts` classification, this claim,
and `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`. The integration owner also approved explicit read-button
clicks in the shared `Sweep.test.tsx` setup and existing `e2e/{sweep,core-journey,pages-devnet,devnet-journey}.spec.ts`
sweep setup points; existing signing and payment assertions remain unchanged.
Acceptance: opening Sweep never requests a balance; one explicit click makes one balance-read invocation;
ordinary rerenders, errors and selection changes do not repeat it; changing the payment, asset, provider or session
invalidates pending results and requires a new click. Preserve the required-private-path warning and the existing
sweep controls. Disclose what the Settings RPC learns. Do not import #222's destination ledger or experimental features.
Scope distinction: the existing RPC transport has its own bounded retries; this task does not claim to change that
shared transport policy. Exact-head hosted CI and independent integration review remain required.

Milestone: runtime repair `d03d529f5b785dcd129b302d122b191d3d066214` passes 120 focused tests, whole-web typecheck
at a 1536 MiB heap cap, scoped lint and locale validation. Independent privacy review reports no remaining source
blocker and independently passes 72 consent/signing tests. Final E2E setup additions are reviewed and linted only;
browser execution and exact-head hosted CI remain required. See `docs/handoffs/agents/SWEEP_BALANCE_CONSENT_20261118.md`.
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
## PR 231 standalone pre-merge disclosure repair — 2026-11-18

Worker: ChatGPT pre-merge lead; independent CI/privacy review by ci_inventory.
Branch: `repair/ghostpay-pr-231-20261118`.
Source: #231 `d9ff386807de724eb1a1c4d400c882df0fc20bb7` (full head verified in the handoff).
Target: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (main).
Owned paths: `apps/web/src/lib/scanPrivacy.ts`, its existing `scanPrivacy.test.ts`
regressions, `docs/consolidation/merge-readiness/PR231.md` and this claim.
Acceptance: reproduce the two exact hosted disclosure-equivalence failures;
extract only the scanPrivacy correction from `d6016a822f3bf238506ea5b426380bceb9d1ee83`;
retain every balance-consent/session guard and disclosure assertion; verify the
actual combined main/source tree. #222/#238 and their active source branches
are read-only. All source commits remain ancestors. Both sides of the only
merge conflict (independent ACTIVE_WORK claims) are retained. No contract,
dependency, cryptographic or gate changes.



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



## Beta acceptance log artifact capture — 2026-11-18





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

# Own-node request guard — 2026-11-18

Worker: ChatGPT privacy review agent using the Caveman workflow. Branch:
`chatgpt/ghostpay-own-node-guard-20261118`; base PR #222
`2bc2098298d90928eb1acafad969f28316bb05fc`.
Owned paths: `apps/web/src/lib/defaultServices.ts`, its focused tests, this claim,
`docs/handoffs/OWN_NODE_GUARD_REVIEW_20261118.md` and
`docs/handoffs/PRIVACY_CONSOLIDATION_REVIEW_20261118.md`.
Acceptance: switching to acknowledged own-node mode prevents cached RPC clients
and their retries from sending new requests to a third party. Refusals contain
no endpoint or request data. Loopback requests remain usable in own-node mode.
Other #222 findings and integration conflicts remain separate; no Tor or release
qualification, remote mutation, deployment or public-chain transaction.

## Privacy-default browser fixtures — 2026-11-18

Worker: ChatGPT recovery reviewer, Caveman workflow. Branch: `chatgpt/ghostpay-privacy-browser-fixtures-20261118`.
Base: PR #222 head `2bc2098298d90928eb1acafad969f28316bb05fc`; the failing hosted Pages job tested synthetic merge
`644a43ee6366298f418a0aca5a40ecf974871748` in run `44279444265`, job `134715947261`.
Owned paths: affected receipt/envelope/consent setup in `apps/web/e2e/{pages-devnet,core-journey,devnet-journey,flows,sweep}.spec.ts`,
`apps/web/e2e/devnet/pages.ts`, a pure invoice-tamper fixture helper, its focused `apps/web/src/test` regression,
this claim and `docs/handoffs/agents/PRIVACY_BROWSER_FIXTURES_20261118.md`.
Acceptance: assert minimized receipts omit the payment address, then explicitly opt into full receipts without
weakening signature/address assertions; preserve encrypted invoice defaults and prove altered amounts still decrypt
but fail signature verification; explicitly request Sweep balances before existing spend/dust assertions.
Runtime sources, defaults, dependencies, CI gates and skips remain unchanged. Local helper and existing UI tests,
scoped lint/typecheck and independent source review are evidence only for their stated scope. Local Chromium cannot
launch; no browser acceptance is claimed and fresh hosted CI remains required.

Milestone: repaired fixture source `6dc3ae7c419c8f706c11fc3d96de66e055ad165d` passes 49 focused tests, whole-web
typecheck at a 1536 MiB cap and scoped lint. Independent review reports no blocker and independently passes the
three pure tamper-helper tests. Playwright discovery lists 14 tests in three mocked suites without execution.
The prior hosted result remains 11 passed, 2 failed and 3 not run until fresh exact-source CI executes.
Handoff: `docs/handoffs/agents/PRIVACY_BROWSER_FIXTURES_20261118.md`.

## Pages beta dependency qualification — 2026-11-18

Worker: ci_qualification, Caveman investigate-first, lean-build and verify-and-stop workflows.
Branch: `integration/ghostpay-dependency-qualification-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: root/workspace package manifests, package-lock.json, dependency tooling regressions if a defect is reproduced, and a source-pinned dependency handoff. No application source, workflows, coverage configuration, contracts or deployment changes.
Acceptance: integrate the exact paired #210 and #236 dependency revisions; clean installation; library and web builds; relevant original coverage-enabled suites, typechecks and lints; full and production dependency audits; preserve pending browser and hosted qualification honestly. No forced peers, casts, blanket overrides or weakened gates.
Source candidates: #210 `4d19655a2e5d93ad9378803cd4163245168aca24`; #236 `defdaa308a2d05ab407af7e42f8dc457cf52d103`.

## Feature completion and consolidation — 2026-11-19

Worker: ChatGPT root coordinator with independent privacy, recovery, and branch-review workers.
Branch: `codex/ghostpay-feature-consolidation-20261119`.
Base: `ffd982a7aea2856c186b40ef236a39720a1b81f5` (verified live main at task start).
Owned paths: semantic integration of existing PRs; `packages/chain-adapters/src/payments.bulkCancellation.test.ts`;
`.claude/skills/ghostpay-package-map/PACKAGE_MAP.md` and dependency-closure guard data if supported by actual emitted-source evidence;
`apps/web/e2e/app.spec.ts` browser lifecycle fixture; scoped regression tests and
`docs/consolidation/feature-completion-20261119/**`. Privacy and recovery workers claim their own isolated paths.
Acceptance: retain original feature ancestry and main fixes, repair reproducible integration failures without
weaker assertions or gates, independently review combined source, run applicable validation, and merge only
qualified work under current repository protections. No mainnet deployment, release publication, branch deletion,
shared-branch rewrite, or finding suppression. External live writers remain read-only inputs until rechecked.


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


# Master repository reconciliation — 2026-11-18

Worker: ChatGPT integration coordinator. Branch: `integration/ghostpay-master-consolidation-20261118`.
Base: PR #238, `198aa5baff22272453733a0f3dcfcac0e0994eec`; initial main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: integration conflicts; branch/PR census and evidence in `docs/consolidation/master-20261118/`;
`scripts/tests/lean-core-reachability.test.mjs`, generated package map, `packages/chain-adapters/src/payments.bulkCancellation.test.ts`,
`apps/web/e2e/app.spec.ts`, and the export-cancellation regression only if still required after recovery reconciliation.
Independent workers own recovery reconciliation, CodeQL repairs and selected historical correctness fixes in separate worktrees.
Acceptance: evidence-backed disposition for every branch; preserve source provenance and security invariants; fix reproduced integration
failures; execute focused and combined qualification; merge only qualified groups under the user's master consolidation authorization.
Do not delete branches, force-push shared history, deploy, publish releases or weaken security requirements.


# Recovery reconciliation — 2026-11-18

Worker: independent feature/custody reviewer for the master consolidation. Branch:
`integration/ghostpay-recovery-reconciled-20261118`; base PR #239
`4a1b181c89e02ee564b5568d4b4b8d689f5e42c5`.

Owned paths: `apps/web/src/AppShell.tsx`, its beforeunload regression; the recovery and saved-export verification
components and their tests; `apps/web/e2e/stealth-export.spec.ts`, `stealthExportFixtures.ts`, `sweep.spec.ts`;
the focused SellerKeys recovery consent test; this claim and `docs/consolidation/RECOVERY_RECONCILIATION_2026-11-18.md`.

Acceptance: retain every PR #239 protection and selectively preserve PR #240's exact-file byte checks, current
external-copy unload guard, fresh replacement consent and keyboard recovery regressions. No changes to the codec,
custody model, contracts, dependencies, e2e helpers, remote source branches or security gates. Record actual test
results separately from static review. The master coordinator owns integration and publication.


## Master consolidation: bounded CodeQL reconciliation — 2026-11-18

Worker: independent CI/release reviewer, Caveman investigate-first.
Branch: `integration/ghostpay-codeql-reconciled-20261118`.
Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
Owned paths: `packages/pir-two-server/src/client.ts` and its regression tests;
`apps/web/src/views/Settings.test.tsx`; this claim; a scoped consolidation handoff.
Acceptance: reproduce the uncontrolled trailing-slash normalization mechanism, remove
quadratic processing without changing ordinary endpoint semantics, and keep regression
coverage; replace the Settings preloaded-storage fixture with an honest synthetic
test setup while preserving persisted-provider-warning and session-only assertions.
No CodeQL suppression, scanner exclusion, gate, dependency, crypto, network-policy or
release change. Record actual tests and source identities; hosted CodeQL must rerun
on the combined candidate before the alerts can be claimed closed.
# Existing runtime correctness recovery — 2026-11-18

Worker: feature/custody reviewer continuing the authorized all-repository consolidation.
Branch: `integration/ghostpay-runtime-recovery-20261118`; base
`c5f9b190935251c5274a434341f40db3c9175ef1`.
Owned paths: `packages/cli/**`, `apps/relayer/**`, `packages/relayer-guard/**`,
`apps/web/src/lib/relayerClient.ts` and its focused test; this claim and the scoped runtime recovery handoff.
Scope addition approved by the coordinator: `scripts/devnet/e2e.mjs`, only the PR #218 companion that aligns
the relayer fee recipient with the signed manifest while preserving the existing balance assertions.
Further test-only scope: `packages/invoice-schema/src/pinnedSigner.test.ts`, preserving four unique #218
regressions alongside the existing #234 tests. Invoice runtime and public behavior remain at the current base.
Acceptance: recover useful CLI input/redaction and relayer admission/fee/logging/limiter fixes from PR #218
`b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`, preserving PR #222 request padding and privacy controls.
Do not reapply invoice-schema #234, alter contract/policy/multichain behavior, change dependencies or weaken checks.
Inspect #211 for remaining unique work and report excluded architectural scope. Original branches are read-only;
coordinator owns integration/publication and exact combined-source validation.

# Existing policy validation recovery — 2026-11-18

Worker: feature/custody reviewer, after the independently reviewable #218 runtime group at `d80aa890`.
Branch: `integration/ghostpay-runtime-recovery-20261118`.
Owned paths: `packages/policy-scheme/src/{router.ts,router.test.ts,eip712.ts,limits.ts,derive.ts,negative.test.ts}`,
`packages/policy-scheme/README.md`, `apps/web/src/features/policy/{pay.ts,pay.selfcheck.test.ts,send.ts,send.test.ts}`,
this claim and focused source/provenance handoff.
Acceptance: recover the existing #211 decoder, policy-only signing, leaf recomputation and secret-copy lifetime
checks with paired prepare/send regressions. Retain current experimental/disabled exposure, L2 delay values,
contract runtime, dependency versions and v4 checkpoints. Separate asset-coverage UI and multichain format changes
remain outside this group. No local test/install workload during coordinator's resource limit; hosted combined
qualification and independent crypto/custody review remain required before promotion.

# Master consolidation: unique PR246 security safeguards — 2026-11-18

Coordinator owns the selective port of five reviewed paths from PR246
`28edbcf55093a6d6056232fd59ef37a2ae832b9a`: confidential router native forwarding,
ReturnBombStealth and its regression; deployment shell preflight and its offline tests.
Preserve current CLI, TRON completeness, browser-warning assertion, dependency boundary
review and all release/analyzer gates. Independent reviewer completed the exact source
crosswalk before this claim. No deployment, fee-token policy approval or source-branch edits.
# TM1–TM15 hardening completion — 2026-11-18

Coordinator: ChatGPT root; reviewers: browser_privacy, metadata_privacy, relayer_chain_privacy, acceptance_review.
Branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238), which already contains
main `dfc75ef2087fa6463ae59e0818abec01796c578d` and PR #222
`2bc2098298d90928eb1acafad969f28316bb05fc` as ancestors. The new PR will be stacked
on #238 so only the TM-specific continuation is proposed; existing integration is
an input, not repeated repository consolidation.

| Worker | Owned paths | TM acceptance |
|---|---|---|
| browser_privacy | `apps/web/src/lib/settings*.ts`, `apps/web/src/views/Settings*.tsx`; focused new privacy tests | TM4 session-only settings and credential-bearing configuration never leak through accidental persistence/export; TM1/TM2/TM3/TM7/TM14 existing implementations reviewed and qualified. |
| metadata_privacy | `apps/web/src/components/ReceiptPanel*.tsx`, `packages/scan-source/src/{padded,range}*.ts`, `apps/web/src/lib/scanPrivacy*.ts`, `apps/web/src/views/Scan{,.privacy.test}.tsx`; focused invoice/default acceptance tests | TM9 opt-in scoped to receipt identity; TM15 bounded/cancellable padding; TM8/TM10/TM12 source and test qualification while preserving checkpoint owner. |
| relayer_chain_privacy | Existing TM11 relayer privacy source/tests/docs and TM13 BTC/Solana/TRON flow-specific tests; runtime only for a confirmed in-scope defect | Strict padding/ingress/zero-log behavior; chain-specific query consent and sign-time checks. |
| acceptance_review | Read-only fourth-role review and acceptance-review report | Test coverage, active call paths, disclosure boundaries and independently reviewed corrections. |
| coordinator | CSP scripts/tests and deployment documentation; privacy matrix/defaults tests; catalogs after coordination; qualification and review evidence | TM5 generated meta/header/nginx validation; TM6 accurate Tor guidance; all 15 dispositions, independent cross-review and exact-source qualification. |

All 15 authoritative recommendations were read before product changes. First phase
is read-only source review, then failing regressions for each confirmed defect.
PR #241 owns general browser transports, #235 owns checkpoint architecture, #234
owns pinned invoice signers, and #239/#240 own Spec 18. Those implementations are
not independently redesigned. Main merges, deployment, release publication,
contracts/Mythril, unrelated dependency upgrades and general consolidation are
outside this task. Do not overwrite concurrent changes; recheck remote heads
before publication. Final source and test evidence belong in
`docs/handoffs/tm-hardening-20261118/`.

TM acceptance fixture follow-up: browser_privacy owns only the hostile-text case in `apps/web/e2e/app.spec.ts`; the existing dialog listener must acknowledge one expected outgoing beforeunload prompt without suppressing invoice-origin dialogs. Runtime/key retention and global helpers stay unchanged. acceptance_review independently reviews the fixture delta; hosted full/lean execution remains required.


# Sleep-aware session security completion — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT coordinator with independent clock/lifecycle, vault/session and integration reviewers.
Branch: `chatgpt/ghostpay-idle-lifecycle-qualified-20261119`.
Qualified source base: PR #242, `ab4e0da2cfe2a18adac0424896fba0b40fac81a8`, subsequently merged
by another workstream as main `e454de6abfefda70d82784fafc1d8949b277c334` with an identical source tree.
Successor integration target: `integration/ghostpay-idle-session-completion-20261119`, from that main.
PR #227 `613667be4eeb132c7d21ccd06c627f9a7144d85b` is already an ancestor.
Owned paths: `apps/web/src/AppShell*`; idle-specific session/key-vault lifecycle changes and tests;
the idle-authority token in `apps/web/src/lib/scanCursorSlot.ts` and its regression tests;
`apps/web/e2e/idle-session.spec.ts`; directly required lock-state locale/security-key entries;
`apps/web/DEVIATIONS.md`; session-security guidance and `docs/handoffs/idle-session-20261119/`.
Acceptance: fail closed on expired/invalid clocks before activity; retire old timer/session generations;
synchronously revoke protected key operations at expiry; preserve sole-copy keys for the existing encrypted
backup/recovery path; qualify full/lean lifecycle behavior; independently review and integrate into the successor candidate.
No wallet encryption/KDF redesign, Spec 18 feature work, contract/analyzer remediation, network-isolation
redesign, dependency upgrade, deployment, release, force push or protection bypass. Other source branches
remain read-only; #238 and its recovery/privacy follow-ups continue independently outside this focused port.
Initial defects and exact acceptance evidence are tracked in the task handoff directory.

Provenance: the idle-only delta is ported from local `b2fb5f20455ca2823739f7a29ed784ec94e049c2`,
preserved remotely as `7e6089e2e40a2a7daf93961eddef17d3fe8501fd` on `chatgpt/ghostpay-idle-lifecycle-20261119`.
The broader #238 tree and its unrelated worker claims are not imported; this combined target requires fresh qualification.

# BTC spentness consolidation — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT branch_recon, assigned by the current consolidation coordinator.
Branch: `codex/ghostpay-btc-consolidation-20261119`.
Base: `66e707d0676caa26e074c7e5e9f5db0285f6ca62`, which retains the existing master integration.
Selected source: PR #254 `8c1d87a2587281c32a5f1326a4f36cfada4384bc`; compare sibling
PR #244 `2364284a2717a22b895fcb7badeb2e7ae6bb0e48` for unique header/cancellation regressions.
Owned paths: `packages/btc-silent-payments/src/scan/`; `apps/web/src/features/btc/`;
BTC-specific browser tests, locale/security-key entries and user/spec documentation;
this claim and `docs/consolidation/btc-20261119/` evidence.
Acceptance: retain #254 ancestry and complete local/provider spentness semantics, preserve current
action-bound network authorization and cancellation, reconcile useful #244-only tests, execute
focused library/web/type/lint/browser checks available in the exact dependency environment, and
report remaining combined qualification explicitly. Source review by the coordinator remains required.
Privacy/recovery workers own their current shared lanes. No remote merge/push, contract change,
mainnet interaction, dependency upgrade or release action is included in this worker's assignment.

BTC consolidation checkpoint: product head `e741aa8e8228a2099ee5abe3fd73aa14ffb011b8`; merge source and focused evidence are recorded in `docs/consolidation/btc-20261119/QUALIFICATION.md`. Coordinator final review and combined hosted qualification remain pending.

# Manifest test integration repair — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT branch_recon, assigned by the current consolidation coordinator.
Branch: `codex/ghostpay-manifest-test-integration-20261119`.
Base: `cae9be35a006cdbf91113396bb9a86b85fc458a3` (the coordinator has merged this BTC lane).
Owned paths: `apps/web/src/lib/manifest.test.ts`; this claim and focused qualification evidence.
Acceptance: replace the obsolete scanner helper import with local TypeScript parse/print comment
removal; preserve all runtime-fetch, deployments, testnet, unsigned and signed-only assertions;
run the manifest test file with its original Vitest configuration. Independently review the
coordinator's current BTC network-egress inventory changes without editing their checkout.
No production scanner API change, broad compilation/lint retry, dependency change or remote write.

# Home release-hash authorization repair — 2026-11-19

Worker: privacy_completion; root delegated this exact hosted failure after the final PR sweep.
Branch: `codex/ghostpay-home-release-hash-20261119`.
Base: coordinator candidate `5dd63d651384a4712615e237bb09da3afcd40afb`.
Owned paths: `apps/web/src/views/Home.tsx`, a focused production-authority Home regression,
this registry and a scoped evidence handoff. Preserve strict network authorization parsing.
Acceptance: relative module script URLs under `/GhostPay/` resolve against `document.baseURI`
before granting authority; the exact resolved URL binds grant and digest fetch; cross-origin
targets remain refused; reproduce the hosted PR #251 failure before fixing it, then run focused
tests and obtain an independent recovery-worker review. No broad checks or remote mutation.
Status: implemented at `9bc9f1a19abedfc667db7931c9892d6cee1190d0`; baseline 3 failures/1 control,
30 focused tests pass. Independent scoped source review found no blocker; combined hosted
qualification remains required. See `docs/handoffs/home-release-hash-20261119/REVIEW.md`.

# TRON integration failure repair — 2026-11-19 UTC (ACTIVE)

Worker: ChatGPT branch_recon, assigned by the current consolidation coordinator.
Branch: `codex/ghostpay-tron-integration-repair-20261119`.
Base: `e76451ad56ba1634eed9d03468961900433fd130`.
Owned paths: `apps/web/src/features/chainViews.i18n.test.tsx`, the related
`chain.hardening.test.ts` coverage and TRON shared fixtures; `TronView.tsx`
and TRON chain/network/RPC wiring only if the reproduced root cause requires
a runtime correction; this claim and scoped qualification evidence.
Acceptance: reproduce the common TRON outcome/authority failures with current
verified library artifacts; identify runtime versus fixture cause; preserve
strict provider/genesis validation, receipt integrity and all authority/outcome
assertions; implement the smallest correction, run focused original-config
tests and obtain independent worker review. No root checkout mutation,
dependency upgrade, mainnet request, deployment or remote write.

## 2026-11-19T08:36Z — isolated JSON canonicalization correctness repair

- Worker: ChatGPT single sequential development/audit phase, cycle `20261119T083600Z`; no concurrent subagent and no independent review claimed.
- Branch: `automation/20261119T083600Z/bug/json-canonical-array`, exact base `14ded337a10c140d7a9f9a9238ec038587d925bb` (main observed at branch creation).
- Owned paths: `packages/invoice-schema/src/json.ts`, `packages/invoice-schema/src/json.test.ts`, and this own-branch claim only. Other owners' heads, docs/automation ledgers, contract, CLI and deployment code remain untouched.
- Finding: the exported `canonicalize` array code uses `Array.map` (which skips holes); a sparse array can silently canonicalize to a different array or invalid JSON. Reject unsupported sparse/extra-property array input rather than returning unrepresentative signed/serialized bytes.
- Acceptance: failing regression against baseline for holes and non-index/symbol own properties; minimal dense-array-preserving validation; regressions green, existing tests and TypeScript/lint when feasible; exact-head hosted CI, independent reviewer and lock-aware integration required before any merge.
- Conflicts/dependencies: PR #262/#264 touch `receipts.ts` but not the two owned `json*.ts` files at inspected heads; those large candidates remain active. PR #258/#261 CI is pending. Integration lock ref is released at observed `3ae60de55add2763aa7d7a44033d11b96df13adb`; no shared integration authorized by this task.


## 2026-11-19 — isolated final Pages qualification (246ff268d20d)

- Coordinator: ChatGPT root; branch `release/ghostpay-beta-qualification-20261119`.
- Base: PR #270 `73545f63112910d46002718354ab5e99f8652e1f`, retaining PR #262 and main `8f56376427c96881f49590920ff0bf8543ec81b4`.
- Scope: isolated reconciliation of compatible #269, #272, and #274 changes; exact-source Pages qualification; `docs/release/` evidence and branch disposition ledger. Independent workers own separate worktrees and explicitly assigned files.
- Acceptance: preserve source provenance, fail-closed session/network authority, private backup recovery, disabled demonstration payments, original test assertions and coverage gates. Run focused regressions and applicable builds/browser/security checks.
- Shared integration lock is held by `20261119T105500Z-0bed53303053-root`, generation 3. This branch does not acquire, supersede, or mutate that lease. Shared branch/main promotion remains blocked until the existing coordinator releases ownership and required checks pass.
- No edits to other checkouts, source branches, deployments, published tags, fee recipients, guardians, mainnet configuration, dependency versions, or security thresholds. Release/deployment remains conditional on ADR-0029, origin isolation and actual qualification.

## Sweep quote and signing lifecycle correction — 2026-11-19

Worker: independent ChatGPT review agent, coordinated by the main consolidation agent.
Branch: `review/ghostpay-sweep-quote-lifecycle-20261119`; draft PR #272.
Base: `4085622463411d3ba27f4efb7b73a70575170535` (PR #252).
Owned paths: `apps/web/src/views/Sweep.tsx`, `Sweep.quoteLifecycle.test.tsx`,
and `docs/handoffs/agents/SWEEP_QUOTE_LIFECYCLE_20261119.md`.
Acceptance: prevent stale quotes and stale relayed, direct and same-nonce
replacement handoffs after balance, recipient, payment, provider, session, mode,
manifest or transport changes; retain submitted and uncertain-outcome evidence,
prior replacement hashes and journal compare-and-swap; preserve explicit balance
consent and existing vault, session and fee guards.

Initial quote/relayed head: `9e4ec2da024ef9a706e9d6cefa988d0a5dd9f7ac`.
Root coordinator approved the direct/replacement extension after reviewing that
head. This scope extension was recorded before source edits. Original #231/#252
and broad #262/#264 remain unchanged; main integration belongs to the coordinator.

Final source/test blobs: `2b832d371229385a2a1228e16320aceb9a64ee59` /
`41baa63e14fad5ea0dcf54c202b2ef3b0faa5476`.
Evidence: initial parent RED 28 failed/6 controls; quote/relayed GREEN 106/106;
extension RED 30 failed/40 controls at the initial head; final GREEN 142/142,
zero skipped; scoped type-aware lint, secret scan and diff check pass. Independent
source review approves both final blobs and unchanged post-handoff handling.
Prior full web build attempts were environment-limited (heap OOM 134, killed137);
final full typecheck/build, browser acceptance and exact-head hosted gates remain.
See the source-pinned handoff for commands and limits. Candidate remains draft.
No deployment, release or real transaction is authorized by this worker claim.


## 2026-11-19 — Sweep signing review authority (246ff268d20d)

- Worker: independent security reviewer, delegated bounded implementation by final Pages coordinator.
- Branch: `review/ghostpay-final-security-20261119`; base `7f44cf742f25df25105a5a21d223b6d0d1efb62d`.
- Owned paths: `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/sweep.reviewAuthority.test.ts`, this claim and scoped evidence. Root owns the Sweep component; payment-export worker owns network/export source.
- Requirement: revalidate the user's live review before key derivation, immediately before every signature, after asynchronous helpers, and before external handoff. A stale recipient/balance/manifest review must not authorize a local signature merely because the journal hook later prevents transport.
- Acceptance: regression-first proof against the prior helper; focused real-signing controls, cancellation and post-handoff outcome tests; preserve all existing journal and uncertainty semantics; independent review by another worker. No contract, relayer server, dependency, gate, deployment or remote changes.


### Final Pages payment export reconciliation — 2026-11-19

Worker: `key_exports`; isolated branch `repair/ghostpay-final-key-exports-20261119`; base `7f44cf742f25df25105a5a21d223b6d0d1efb62d`.
Source: PR #269 `683f8587b8de45448f14aab0539cb07a5f21bce3`.
Owned paths: payment export RPC/key export and network-authorization code/tests, Scan view and its export/checkpoint tests, scanClient cancellation normalization/tests, privateScanLifecycle test, private-scan checkpoint browser test, payment-export network-egress inventory entries, and scoped evidence.
Acceptance: preserve existing session/profile/idle authority; secret exports obtain fresh address-bound permission independently of ended scans; cancellation and expired/replaced authority refuse late exports; original selected endpoint remains fixed; relevant original tests pass with no weakened assertions. Retain current merchant-profile and canonicalization code. No other source checkout, remote branch, shared integration lease, release or deployment mutation.

Follow-up assigned by the release coordinator: validate every network-authority clock sample. Reproduce invalid issuance/continuation clocks and observed rollback, permanently revoke affected grants, and preserve existing idle/request deadlines. Only `networkAuthorization.ts` and its focused tests are added to this same owned scope.

Sweep follow-up: the coordinator additionally assigned native-balance consent binding. Preserve early target-ownership validation, reject an on-chain balance that differs from the reviewed amount before fee work/signing, wipe derived material on refusal, and retain same-balance/replacement/post-handoff controls. Scope remains the same helper and its tests.

Final typecheck follow-up: the coordinator's complete web build reported TS2322 in the two actual-transaction sender-recovery assertions. Narrow captured RPC bytes to the EIP-1559 envelope actually emitted by the helper using a runtime test assertion; preserve all existing assertions and production source. Re-run the focused helper tests, typed lint and web TypeScript check; coordinator re-runs the combined build after integration.


## Final Pages dependency-tree qualification — 2026-11-19

Worker: `key_exports`, reassigned by the release coordinator. Branch `repair/ghostpay-dependency-qualification-20261119`, base `acdebc5a281d41bf0250e93bf217c04624fdd9d9`.
Scope: diagnose clean-install `npm ls --all --omit=dev` failures for existing viem/underscore/ws overrides; distinguish npm/environment behavior from actual lock drift. Own only dependency qualification evidence and a minimal manifest/lock/tooling fix if a genuine repository defect is reproduced. Preserve existing dependency versions, overrides, security checks and other workers' root installations.
Acceptance: exact-cause evidence, original dependency-tree/audit gate under the supported toolchain, no suppressed invalid edges, and no root node_modules mutation while tests run.


## Independent Pages artifact verifier review — 2026-11-19

Worker: `key_exports`, reassigned by the release coordinator. Branch `review/ghostpay-pages-artifact-20261119`; implementation baseline `acdebc5a281d41bf0250e93bf217c04624fdd9d9` plus isolated dependency evidence.
Scope: independently inspect and qualify PR #276 `f39a9dd36c09f8b02d937c5f3d19676d334976d6`; preserve its ancestry if compatible. Own only the new artifact verifier/test and scoped review evidence. Compare it with the existing site-safety verifier without replacing that verifier or loosening any gate.
Acceptance: run the original checksum/adversarial/CLI tests; check exact published blobs and parser/filesystem/trust boundaries; record limitations and merge risk. No dependency, workflow, application, deployment, remote-ref or shared-lock mutation.

## Final Pages environment recovery — 2026-11-19

- Worker: final release integration coordinator, with isolated native sweep, analyzer and QA workers.
- Branch: `release/ghostpay-beta-qualification-20261119`; recovered published base `7b4c1554382b05ac3fab48527aadf596d6b1ff7b`, tree `fe5b4c98d0b39c0d3ab88018efcc1ba600309c98`.
- Scope: recover the already reviewed PR #277 and #275 integrations, beta metadata, narrowly selected PR #255 analyzer changes, native fee-review work, and release evidence. Root owns integration, metadata and release documents; workers own their explicitly recorded source paths on separate branches.
- The replacement environment did not retain the previous temporary filesystem. Published history is intact. Unpublished local commits and missing logs remain historical identifiers until actual bytes are recovered. Reconstructed code requires fresh verification; old passing results do not qualify a different source tree.
- Acceptance: preserve existing and original PR ancestry; compare recovered source identities where recorded; obtain fresh tests and independent review; publish recoverable source checkpoints promptly. Do not weaken assertions, coverage thresholds, analyzer policy, deployment approvals or external review requirements. No main merge, public deployment, tag or release before all applicable gates pass.
## Policy Anvil fixture reconciliation — 2026-11-19

Worker: ChatGPT strict_json_review, delegated by the main consolidation coordinator.
Branch: `repair/ghostpay-270-policy-fixture-20261119`.
Base: `73545f63112910d46002718354ab5e99f8652e1f` (current PR #270).
Original source input `fefcd57fb2397685a361dcbb9b9cf705efbfc17b` is its
verified direct parent; the policy fixture blob is unchanged across that refresh.
Owned paths: `packages/policy-scheme/src/anvil.test.ts`, this additive claim and
`docs/handoffs/agents/POLICY_ANVIL_FIXTURE_20261119.md`.
Acceptance: recover only the eight-line historical fixture hunk from
`cd4539d2b7f3f14c63227c74d88c032e1e1f360d`, whose parent is
`95d2480a6e2bacf16fe3c142c38a2538758bd102`; retain strict builder and encoder
leaf/token binding and the intentionally malformed order's on-chain revert.
Do not copy the historical whole file or its earlier salt-only ABI changes.
Run bounded existing policy tests, typecheck and lint with source/dependency
provenance; require real Anvil and contract artifacts for an Anvil pass.
Obtain independent review, publish only this owned draft and preserve the parent.

Fresh overlap check before edits: private-scan lint branch
`1b010ec910d04df105fd662cc360629cb0a2f5dd` and export-authorization branch
`b0abb726c138ad1df2f03b7b102c9bd9de318887` own the remaining observed web lint
work; both retain the same unrepaired policy fixture blob as this base. This
worker makes no web/runtime/lint-site, dependency, threshold, workflow, contract,
main, lease, #264/#270/#272 or other-owner branch changes. The root coordinator
owns later integration and qualification.

## Recovered fail-closed Mythril evidence backport — 2026-11-19

Worker: `/root/provenance`, delegated by the final Pages integration coordinator.
Branch: `repair/ghostpay-analyzer-recovered-20261119`.
Base: published PR #278 `7b4c1554382b05ac3fab48527aadf596d6b1ff7b`.
Source: read-only PR #255 `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`.
Owned paths: `packages/contracts/scripts/{run-mythril.sh,mythril-compat.py,capture-mythril-evidence.py,collect-analysis-report.py}`; `scripts/tests/{mythril-runner.test.mjs,mythril-completeness.test.mjs,mythril-evidence.test.mjs,contract-analysis-workflow.test.mjs}`; exactly two path triggers and three evidence-environment lines in `.github/workflows/contract-analysis.yml`; this additive claim; `docs/handoffs/recovered-mythril-evidence-20261119/`.
Acceptance: recover the eight original blobs exactly; preserve current workflow semantics and strict analyzer failure behavior; execute all 54 dependency-free runner/completeness/evidence/workflow regressions with Node 22 and a 128 MB heap; retain fresh raw compressed evidence and independently review the result before integration. Native Mythril, Echidna and contract campaigns are not authorized or claimed by this scoped run.
Scope excludes contract/runtime/deployment changes, disposition exceptions, new release policy, dependency changes, shared integration/main promotion and all eight root-owned release documents. Earlier local implementation/evidence commits were lost with the previous executor and are historical identifiers only; this reconstruction receives new identities and fresh qualification. Original remote branches and other workers' claims remain unchanged.

Recovery qualification: implementation `bd05411b2a4c5b1b1793065bce1c10e0553cf952`; fresh baseline 9 failing regressions and 2 controls; full 54-case suite passed with no failures, skips or cancellations under Node 22.23.5 / 128 MB / serial; nine syntax/diff checks passed. Exact eight-blob provenance and fresh compressed logs are in `docs/handoffs/recovered-mythril-evidence-20261119/`. Independent coordinator review, integrated-source qualification and remote preservation remain pending at this checkpoint. No native analyzer/release pass is claimed.
## 2026-11-19 — Native fee review recovery after executor replacement

- Worker: security reviewer, delegated recovery by the final Pages coordinator.
- Branch: `repair/ghostpay-native-fee-recovered-20261119`; base `7b4c1554382b05ac3fab48527aadf596d6b1ff7b`.
- Owned paths: native sweep helper/component and their focused tests; the 17 native-review locale/security-label keys; native browser journey steps; the direct-sweep egress inventory entry/counts; this claim and scoped recovery evidence.
- Recovery target: the previously reviewed runtime `02760fb4f609615c6bf31592afc261d78c3dc82f`, with known helper blob `3710a28fe7e90c618d0b57da1aeed9f2a9adf599`, component blob `6da18522b825c99b4073fd238174f63a8a2b7b38`, helper-test blob `ead0a287483a65add77eb8ce1722cc05b235ec63` and component-test blob `e8d5fcb22def002ca90add99e344b4a132835c10`.
- Acceptance: reconstruct from retained source/patch context, compare recovered blobs with those exact identities, obtain fresh focused/type/lint/build results and independent review. The previous 342-case result is historical and does not qualify the recovered candidate. Lost raw diagnostics must not be invented or described as present.
- Boundaries: no contract, dependency, authority-module, mainnet, relayer-server or deployment changes. Coordinator owns publication of incremental commits and supplies the execution slot. Other workers' paths and histories remain untouched.

## PR 279 multipart QR integrity qualification — 2026-11-19

- Worker: `/root/security_review`, delegated by the final Pages coordinator.
- Branch: `repair/ghostpay-qr-surrogates-20261119`; base `75cc6149e2fd560f26725e806b24f859f999d647`.
- Original source: PR #279 `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0`; five commits above main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Owned paths: `apps/web/src/lib/qrMultipart.ts`, its focused test, the original PR handoff, this additive claim, and `docs/handoffs/qr-surrogate-review-20261119/`. QR package source/configuration is read-only; run its complete original suite to qualify framing and Unicode compatibility.
- Acceptance: independently run the exact upstream regression against the unchanged current helper; retain valid Unicode controls; preserve all original PR ancestry through a normal merge; run focused web QR tests, complete QR package coverage, package typecheck/build/lint and scoped web typed lint with original assertions/settings; obtain independent source review and report actual outcomes.
- Scope: reject lossy conversion of malformed UTF-16 to multipart QR bytes. No fund-loss or key-exposure exploit is claimed. No other web feature, native-sweep source, contract, dependency, threshold, workflow, network grant, mainnet or deployment change. Coordinator owns shared integration, publication and full application gates.


## Recovered native authority independent source review — 2026-11-19

Worker: `/root/provenance`, delegated read-only review by the integration coordinator.
Reviewed immutable source: security worker `ed95c5601b0ec127be56cad57fcb78d44954b2fb`; base published PR #278 `7b4c1554382b05ac3fab48527aadf596d6b1ff7b`.
Owned changes: this additive registry note and `docs/handoffs/recovered-native-authority-review-20261119/` only. No implementation/test modifications or runtime test execution.
Acceptance: compare recovered helper, component and adversarial tests with the retained independently reviewed final-02760 blob identities; inspect manifest expiry, one-time confirmation, session/scope/endpoint/replacement binding, signing boundaries and post-handoff outcomes. Report lost prior execution logs as unavailable and keep source review separate from new runtime/CI qualification.


## Complete branch census delta after recovery — 2026-11-19

Worker: `/root/provenance`, delegated read-only release qualification by the coordinator.
Owned writes: this additive entry and `docs/handoffs/branch-census-delta-20261119/` only. The established `docs/release/branch-disposition-ledger.json` remains unchanged.
Scope: paginate all live branches, preserve historical dispositions only for unchanged exact heads, mark every new/advanced head needs_review, record source-specific main/candidate/lease/CI observations and fresh candidate ancestry separately. No heavy fetch, product changes, test execution, source-branch writes, PR closures or workflow dispatch.
Acceptance: complete unique census with pagination evidence; pinned baseline hash; honest mixed observation timestamps; manual semantic review distinguished from ancestry; new recovery refs remain unqualified despite preserved history.
## 2026-11-19 — Final six-diagnostic web lint repair

Worker: `/root/key_exports`, explicitly delegated by the final Pages coordinator after the complete original ESLint run.
Branch: `repair/ghostpay-final-lint-20261119`; base `75cc6149e2fd560f26725e806b24f859f999d647`.
Owned paths: `apps/web/src/features/btc/scan.spentness-completion.test.ts`, `apps/web/src/lib/defaultServices.privacySelection.test.ts`, `apps/web/src/lib/defaultServices.test.ts`, `apps/web/src/lib/sweep.nativeReview.test.ts`, `apps/web/src/lib/sweep.ts`, `apps/web/src/views/Settings.test.tsx`; this additive claim and scoped review/evidence handoff only.
Acceptance: correct all six actual diagnostics without changing assertions, rules, coverage thresholds or configuration; retain asynchronous abort-fixture behavior; strictly validate the mock JSON-RPC body type; preserve assignment of the fee reserve on both native/ERC-20 branches. Run the affected original tests, original full web typecheck and original full ESLint under the coordinator-pinned Node 22 runtime, then obtain independent review and source preservation.
Evidence baseline: original `eslint --config ../../eslint.config.js src e2e` completed at this exact base with six errors, zero warnings, exit 1, 93.20 seconds, maximum child RSS 1,690,568 KiB; source remained unchanged. This is a genuine lint failure, not an infrastructure skip. Root owns integration, Pages/full coverage and publication; security worker's QR work is disjoint.

Six-diagnostic repair qualification: implementation `e8e2edecd0b989a90f5afb65622df4efefeebf93`, tree `477f8b25a744ba6ae9cd805776b234c1f27563f9`; 367 affected original tests in 10 files passed with no skips, full web typecheck passed, and full original web ESLint passed under Node 22.23.5. Independent provenance source review approved the exact delta without weakening assertions or gates. Source-pinned receipts, the six-error baseline and compressed raw logs are in `docs/handoffs/final-web-lint-repair-20261119/`. Coordinator integration and fresh combined QR+lint qualification remain required.


## Recovered contract analyzer environment and scoped review — 2026-11-19

Worker: `/root/provenance`, delegated by the final Pages integration coordinator.
Branch: `repair/ghostpay-analyzer-recovered-20261119`; prior preserved tail `422fe16e991035cccf1862f0b2f7c929242de33d`.
Owned writes: this additive claim and `docs/handoffs/recovered-contract-analyzers-20261119/` only; temporary official-tool environment/artifacts under `/dev/shm/ghostpay-slither-246ff268d20d`. Product, contract, workflow and root-owned release documents are unchanged.
Acceptance: install pinned official Slither 0.11.6 / solc-select 1.2.0 without global dependency changes or compatibility patches; execute the preserved one-thread production analysis with unchanged flags when coordinated resources allow; compare all 36 compilation inputs with the preserved record; retain fresh commands, exit statuses, output and limitations. Assess official pinned Mythril/Echidna feasibility and preserve the historical 11-record dispositions without declaring them closed or running a reduced campaign as a pass.
Also record read-only independent review of the coordinator-authorized six-file lint repair `e8e2edecd0b989a90f5afb65622df4efefeebf93`; no tests are independently rerun for that small review. Native analyzer results, test results and source review remain separate evidence.

Coordinator follow-up: after the fresh Slither pass, authorize the complete unchanged Echidna 2.2.7 runner in an isolated `/dev/shm` source/corpus directory: all three harnesses, original 300,000-call budget and four workers. Own the resulting scoped campaign evidence only. Preserve exact source inputs, full output and strict canary/property/completeness checks; do not infer a pass from partial output or installation. Heavy runtime is coordinated with the release coordinator; no contract, configuration, gate or other checkout mutations.

# Continuous engineering generation 1 — 2026-11-19

Worker: ChatGPT root coordinator (workspace 0a7bc3583588), with independent archaeology, bug/QA, and security workers.
Branch: `integration/ghostpay-continuous-20261119`.
Base: PR #278 `c993bb2340942c85dbf10303b61f69a91c4944e0`; observed main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Scope: continue the existing Pages beta candidate, prove semantic/behavioral uniqueness before extracting newer fixes, complete actual qualification, and repair confirmed failures. Preserve prior source ancestry and source-pinned evidence.
Owned source during generation 1: latest small-PR integration in `packages/invoice-schema/src/base64url*`, `apps/web/src/lib/buildProfile*`, `apps/web/src/lib/scanSpam*`, `apps/web/src/lib/merchantIdentity*`, and `apps/web/src/lib/qrKinds*`; exact paths are verified from each PR before integration. Root owns `docs/engineering-handoffs/continuous-20261119/` and the central evidence ledger. Worker changes use isolated worktrees and additive claims.
Acceptance: original-config regression failures on the unmodified candidate and passes on integrated fixes, independently reviewed product deltas, exact source/command/test receipts, refreshed upstream heads, normal CI-gated publication. Never infer full acceptance from focused checks or counts.
Release scope: static client-side, noncustodial EVM Pages beta. Future modules remain isolated; no fees, fund transactions, deployment, release publication, source-branch deletion, or protection bypass.

Continuous coordinator also owns the two intentional array-deletion fixtures in `packages/invoice-schema/src/json.test.ts`, which fail hosted lint at exact c993 source. Preserve both attack semantics and assertions while using an explicit property-deletion operation; no lint suppression or rule change.

# Continuous coordination tooling recovery — 2026-11-19

Worker: current root coordinator; source PR #261 `61f2b3729fa4b78c90d43a1ecd8c351e9c22f577`.
Owned paths: `scripts/automation/integration-lock.mjs` and `scripts/tests/integration-lock.test.mjs`, both absent from the c993 candidate. Recover these two files byte-for-byte, retain current application source and ledgers, and never merge the metadata-only control ref into application history.
Acceptance: unchanged real-Git concurrency/ownership/tag-isolation/expiry tests pass; independent review; source pin and full applicable qualification recorded. Extraction introduces no schedule, service, deployment, fee, or production configuration change.


# Generation 1 independent export-boundary security review — 2026-11-19

Worker: `security_gen1`, independent of the consolidation coordinator.
Branch: `review/ghostpay-continuous-security-20261119`.
Base: PR #278 `c993bb2340942c85dbf10303b61f69a91c4944e0`.
Owned paths: `apps/web/src/components/StealthExportCommon.tsx`, new
`apps/web/src/components/StealthExportCommon.expiry.test.tsx`, this additive claim,
and `docs/engineering-handoffs/generation1-security/`.
Scope: verify the final export UI handoff samples the synchronous session-expiry
boundary before accepting a result while browser lock events are delayed.
Acceptance: reproduce the failure on original source; preserve fresh empty-session
recovery and valid exports; cancel stale operations before download; retain existing
assertions, cryptographic work and limits; obtain separate review after repair.
No remote publication, contract, fee, deployment, dependency or gate changes.

# Continuous engineering independent generation 2 review — 2026-11-19

Worker: review_gen2, independent of generation 1 implementation.
Branch: `review/ghostpay-continuous-gen2-20261119`.
Base: security repair `84f39e41ef132af88b4ca3280818ed701026d412`; original candidate `c993bb2340942c85dbf10303b61f69a91c4944e0`.
Owned paths: `docs/engineering-handoffs/continuous-20261119/generation-2-review/` and any new uniquely named adversarial review tests only. Existing product files remain owned by their implementers.
Acceptance: independently reproduce the checked-in expiry test failures on original product source, verify the fixed source with original configuration, inspect fresh empty-session recovery, silent revision invalidation and reentrant callbacks; independently compare the five source extractions and lint fixture semantics. Report exact evidence and limits.
No remote writes, main/integration merge, production release, configuration relaxation or simulated browser acceptance.

# Continuous generation 3 feature-completeness review — 2026-11-19

Worker: `/root/completion_gen3`, delegated independent inventory by the continuous coordinator.
Branch: `review/ghostpay-completion-gen3-20261119`.
Base: `a1386906c264e2353e39ff8143083b0bbf107395`, tree `a386655a87e345bd036cf2d600aa1a1d4f0f1359`.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-3-completeness/` only.
Acceptance: map the maintained Pages 1.0 feature families to actual lean routes, implementation and regression coverage; inspect export/recovery, transaction failure behavior and static-origin boundaries; record a bounded original-configuration lean/frame/manifest test run and its exact source. Report confirmed gaps separately from current owned repairs and external release requirements. Do not infer complete behavior from source existence or repeat the mechanical 299-branch census as a fresh semantic audit.
Boundaries: no product, contract, test, dependency, workflow or release-policy changes. The coordinator, QA worker and security reviewer own the active runtime repairs and combined qualification. This worker performs no remote mutations, deployment, transactions, source-branch cleanup or release publication.

# Continuous engineering generation 1 — independent browser and bug qualification

Worker: `/root/qa_bug_gen1`, delegated by the continuous engineering coordinator.
Branch: `fix/ghostpay-continuous-qa-20261119`.
Base: PR #278 `c993bb2340942c85dbf10303b61f69a91c4944e0`.
Owned scope: existing browser acceptance under `apps/web/e2e/`, focused payment-export and private-checkpoint tests, and source-pinned evidence under `docs/engineering-handoffs/continuous-20261119/qa-gen1/`.
Acceptance: run the original focused payment-export/private-checkpoint runtime regressions and browser journeys with their existing gates; establish reproducible failures before any repair; preserve assertions, timeouts, privacy controls and static EVM beta scope. Coordinate any shared production module edits before writing. Use the coordinator's pinned dependency/build preparation and report observed results, not inferred passes.
Excluded: invoice-schema, buildProfile, scanSpam, merchantSignerPin and qrKinds source owned by the consolidation lane; contracts, fees, remote branch mutation, release and deployment.
Status: claimed; source inspection in progress; no execution result asserted.

# Independent QA verification generation 3 — 2026-11-19

Worker: qa_review_gen3; branch `review/ghostpay-qa-gen3-20261119`; base `95f28a04`.
Scope: independently inspect manifest-load generation binding and the three browser-fixture repairs; reproduce the original product regressions and fixed controls without changing assertions or thresholds.
Owned paths: `docs/engineering-handoffs/continuous-20261119/generation-3-qa-review/` and a separate reviewer-only manifest-boundary test if needed. Temporary baseline runtime substitution is confined to this worktree and restored byte-for-byte. No shared source or remote mutation.
Acceptance: source-pinned RED/GREEN, service replacement/cancellation checks, exact fixture semantics review, and original typed lint. Real browser startup is blocked in this executor; hosted browser evidence remains required.

### Generation 3 QA review completed — 2026-11-19

- Worker `qa_review_gen3` independently reviewed exact `95f28a04` and follow-up `45a5dcf7` on isolated branch `review/ghostpay-qa-gen3-20261119`. No product blocker found; baseline hook comparison is 3 RED / 1 existing PASS, fixed 4 GREEN; independent lifecycle plus supplied cases 8 GREEN, existing Pay 66 GREEN, web typecheck exit 0.
- Source-pinned report, raw receipts, and reviewer probe are retained in `docs/engineering-handoffs/continuous-20261119/generation-3-qa-review/`. Temporary probe removed and fixed runtime restored. No remote mutation. Hosted lean/full browser acceptance remains required on final combined source.


# Continuous engineering generation 4 — independent combined-source verification

Worker: `/root/integration_review_gen4`, fresh independent verifier.
Branch: `review/ghostpay-combined-gen4-20261119`.
Base: `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`, tree `7a7b189be05b802d3545e8823230076125d7bbf6`.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-4-integration-review/` only.
Acceptance: independently compare final combined product/test blobs to reviewed upstream, security, QA, lint and lock extractions; inspect integration boundaries and unchanged configurations/architecture; execute the original Pages tooling and integration-lock guard tests with actual counts and source pins. Root owns heavy combined coverage/type/lint/build and publication; another reviewer owns contract findings.
Boundaries: no product, test, contract, dependency, threshold, workflow, remote-ref, deployment or release changes. This review does not confer external security approval or substitute for hosted browser acceptance.

# Continuous generation 4 contract-finding review — 2026-11-19

Worker: `/root/security_findings_gen4`, independent of prior export, QA and completeness implementers.
Branch: `review/ghostpay-contract-findings-gen4-20261119`; base `aa9a66905022311a5861b04ff7ee05836c3c1d8d`.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-4-contract-review/` only.
Acceptance: independently map all ten exact c993 Mythril records to current unchanged contract source, assess concrete authorization/reentrancy/timestamp constraints with source and meaningful existing tests where executable, and preserve per-finding uncertainty and next steps. Internal assessment does not replace external review, change strict analyzer status, or waive findings. Confirmed defects are reported before any proposed product edits.
No contract, product, workflow, gate, dependency, remote-ref, fee, deployment or release changes.
# Continuous generation 5 development-dependency review — 2026-11-19

Worker: `/root/dependency_review_gen5`, independently delegated for current audit triage.
Branch: `review/ghostpay-dependency-gen5-20261119`.
Base: `3dc86fbc49e919e664230b63dae372ff79430fc5`; canonical candidate remains draft PR #278.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-5-dependency-review/` only.
Acceptance: trace current production-zero/full-17-low npm audit results through exact installed and locked dependencies, compare earlier dispositions, inspect current primary advisories and supported fix availability, and identify a concrete minimally disruptive repair if one exists. Preserve observed failures and advisory limitations.
Boundaries: no product, dependency, lockfile, workflow, gate, remote-ref, deployment or fee mutations. Coordinate any proposed dependency change before implementation. This is internal current advisory/graph assessment, not external security signoff or proof that dependencies contain no vulnerabilities.


# Generation 5 unpaid invoice tolerance correction — 2026-11-19

Worker: `/root/remaining_unique_gen5`, specifically authorized by the coordinator after source uniqueness review.
Branch: `fix/ghostpay-ledger-zero-payment-20261119`.
Base: `3dc86fbc49e919e664230b63dae372ff79430fc5`; candidate and main reconciliation blobs both `9e8b5e310e0c445c954e43de3ad712a1a88512b2`.
Owned writes: `packages/merchant-ledger/src/reconcile.ts`, `packages/merchant-ledger/src/ledger.test.ts`, the matching R4 boundary in `docs/remote/usability/specs/reconciliation.md`, this additive claim, and `docs/engineering-handoffs/continuous-20261119/generation-5-ledger-fix/`.
Upstream: exact missing guard/regression in `6db11492` retained at `security/mythril-full-remediation-20261118` (`16c48521`). Extract only this scope; other audit changes remain separate.
Acceptance: reproduce original upstream regression against unchanged current runtime; preserve zero-due semantics, genuine payments, expiry and tolerance behavior; add necessary boundary controls; run original package coverage, typecheck, lint and build, identify actual consumers, and submit frozen source for independent review. No Pages feature activation, fee, dependency, deployment, source-ref or release gate changes.

# Continuous generation 6 merchant-ledger review — 2026-11-19

Worker: `/root/merchant_review_gen6`, independent of remaining-uniqueness implementer.
Branch: `review/ghostpay-merchant-gen6-20261119`; base `3dc86fbc49e919e664230b63dae372ff79430fc5`.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-6-merchant-review/`; temporary independent test probes may execute only in this isolated checkout and are preserved as evidence.
Acceptance: independently reproduce nonzero invoices becoming paid solely through large tolerance; inspect zero-due/positive-payment/expiry/rejected-observation semantics; verify the exact final extracted source against baseline and original package tests, coverage, typecheck, lint and build. Identify actual consumers and scope, preserve configuration/gates, report actual source-pinned results.
Boundaries: no remote writes, dependency/fee/feature activation or broad beta approval. Root owns integration and the existing hosted candidate; implementing worker owns the production patch.

# Generation 5 composite-action dependency discovery — 2026-11-19

Worker: `/root/remaining_unique_gen5`; separately authorized by root after functional uniqueness evidence.
Branch: `fix/ghostpay-dependabot-composites-20261119`.
Base: `3dc86fbc49e919e664230b63dae372ff79430fc5`.
Owned writes: `.github/dependabot.yml`, this additive claim, and `docs/engineering-handoffs/continuous-20261119/generation-5-dependabot-fix/`.
Upstream: `b246782c`, retained at `claude/ghostpay-consolidation-9xhtxg-security` (`4894d0d8`).
Acceptance: root Actions updater currently discovers root action.yml/yaml and workflows, leaving three existing nested composite actions outside configured update manifests. Selectively add `/.github/actions/*` to the existing Actions directory list, preserve weekly cadence/group/PR limit/npm configuration, parse both semantic mappings and inventory concrete target files. Root independently reviews current primary-source discovery semantics before publication. No added schedule, action/dependency bump, workflow/gate edit, remote-ref mutation or deployment.

# Continuous qualification signer-fixture synchronization — 2026-11-19

Worker: root coordinator, independent follow-up review by qa_review_gen3.
Branch: integration/ghostpay-continuous-followup-20261119.
Owned path: apps/web/src/views/Pay.signer.test.tsx and source-pinned failure/repair receipts.
Acceptance: reproduce the one failing case from the original full web run (3837 pass,1 fail,13 skip); wait for the current manifest-dependent review control before asserting the existing disabled state. Retain selected-seller mismatch, absence of the prior pin, and zero RPC/wallet assertions. No production, timeout, configuration or gate changes.

# Generation 5 remaining uniqueness review — 2026-11-19

Worker: `/root/remaining_unique_gen5`.
Branch: `review/ghostpay-remaining-uniqueness-gen5-20261119`.
Base: `3dc86fbc49e919e664230b63dae372ff79430fc5`; frozen application input `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`.
Owned writes: this additive claim and `docs/engineering-handoffs/continuous-20261119/generation-5-remaining-uniqueness/` only.
Acceptance: refresh the selected still-actionable non-ancestor heads, compare all merge bases and exact final blobs, inspect distinct source behavior and tests against the current static EVM candidate, and record bounded fresh semantic classifications. Report any genuinely absent required behavior before proposing changes. Prior dispositions and patch uniqueness are not functional proof.
Boundaries: no product, dependency, test, workflow, contract, fee, remote-ref, deployment or release edits. Root owns live candidate and hosted qualification; the separate dependency worker owns current audit findings. This lane does not claim all remaining branches fully audited.

2026-11-20 update: initial eleven-head matrix and full final-blob receipts complete. The two confirmed recoveries were separately authorized and implemented on `fix/ghostpay-ledger-zero-payment-20261119` and `fix/ghostpay-dependabot-composites-20261119`, with their own claims and independent review; neither change is on this documentation branch. Coordinator requested a bounded continuation across the remaining 59 dated census rows in this same generation and owned evidence directory. Broad uninspected scopes remain UNKNOWN.


## 2026-11-20 — Replacement preflight observation follow-up

Worker: `/root/qa_bug_gen1`, explicitly delegated by the coordinator after hosted PR #278 job `135981022990`.
Branch: `fix/ghostpay-preflight-observation-20261120`.
Base: `3dc86fbc49e919e664230b63dae372ff79430fc5`; maintained product source matches the coordinator freeze `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`.
Owned paths: `apps/web/e2e/network-authorization.spec.ts`, a focused preflight request-order regression under `apps/web/src/views/`, and scoped evidence under `docs/engineering-handoffs/continuous-20261120/preflight-observation/`.
Acceptance: distinguish the six late observed requests from revoked-grant retries with the real authorization/RPC pipeline; preserve exactly two completed chain checks, no late foreign requests, no unexpected methods or raw transactions, all original timeouts and project gates. Repair only a proven runtime defect or the missing observation barrier. Notify the coordinator before any production edit.
Current evidence: hosted lean has 115 passed, one failed and five skipped; failing request snapshot is nine before release versus fifteen afterwards. Artifact `14588585398` contains a completed replacement context at failure and no trace capture. Browser startup is already known to be kernel-blocked locally, so no repeated launch or browser-pass claim is planned.
Status: claimed; diagnosis and deterministic reproduction in progress.
- Worker: `qa_review_gen3`, continuing an independent follow-up turn; this is not a newly spawned fresh agent. Branch: `review/ghostpay-browser-followup-20261120`; base local `3dc86fbc49e919e664230b63dae372ff79430fc5`, published equivalent `d74af79ebabdc8cead843361c3497b46d8c421f9`, tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`. Previous review/worktree preserved.
- Own paths: `docs/engineering-handoffs/continuous-20261119/browser-followup-review/` and this additive claim. Temporary independent test probes permitted in this isolated worktree, with evidence retained and probe removed afterward. Coordinate any product/test changes with `qa_bug_gen1`.
- Acceptance: distinguish authorized replacement manifest readbacks from stale-grant retries for the one remaining hosted browser failure; independently review and execute the exact repair/probe; preserve two chain checks, no new requests after old-request release, no raw/unexpected calls, and original timeouts. No remote mutations; hosted browser qualification remains separate.

### Browser follow-up independent review completed — 2026-11-20

- Continuing reviewer `qa_review_gen3` approved exact `89e163fcc24f72830c0a5876486a72178a9365e7` after independently reproducing the early observation failure (expected 9, received 15), then 11/11 focused GREEN including a reviewer-only late-success revoked-fetch variation. No production or gate relaxation found.
- Evidence and source hashes: `docs/engineering-handoffs/continuous-20261119/browser-followup-review/`. Exact committed test restored; temporary variant removed. Hosted lean/full browser rerun on the repaired combined head remains required. No remote mutation.
- Worker: continuing independent reviewer `qa_review_gen3`; not a new fresh agent. Separate worktree/branch `review/ghostpay-signer-followup-20261120`, base `3dc86fbc49e919e664230b63dae372ff79430fc5`. Browser follow-up evidence remains separate at commit `97fd030a`.
- Own paths: `docs/engineering-handoffs/continuous-20261119/signer-fixture-followup-review/` and this additive claim. Inspect root-owned `Pay.signer.test.tsx` synchronization change, reproduce unchanged fixture, and verify same disabled-Continue, selected-pin, no-RPC/no-wallet assertions after awaiting the current manifest state. No production edits or remote operations.

### Selected-signer fixture independent follow-up completed — 2026-11-20

- Continuing reviewer `qa_review_gen3` approved exact `f2b991f7eb2c843e96bb533729d71b6a537b9293`. Unchanged selected-seller case independently RED (missing Continue; one case run), then full fixed signer file 11/11 GREEN. The same failure is present in hosted d74 web job `135981023399`; no production, signer, network, timeout or gate changes.
- Source-pinned evidence: `docs/engineering-handoffs/continuous-20261119/signer-fixture-followup-review/`. Browser follow-up remains independently recorded at `97fd030a`; full combined qualification remains with the root workflow. No remote mutation.

### Continuous follow-up integration checkpoint — 2026-11-20

Root integrated the completed generation5 dependency/uniqueness evidence, independently verified merchant guard and composite-action discovery, and both independently reviewed browser/signer fixture repairs. Product/test inputs are frozen at2b7c015e28aa23f63ba39486ae7345983ce9ff97; subsequent handoff changes are documentation/evidence only. Original full web failure is retained; combined focused web13, full web typecheck/lint, merchant30 original coverage/build and113action pins pass. Exact-head hosted qualification and security/release gates remain pending. Six fresh generations completed; follow-up reviewer turns are reused agents after an actual further-spawn thread limit. No live-background claim is made for completed workers.
# Required privacy UX masking and private history — 2026-11-20

Worker: `/root/remaining_unique_gen5`, continuing the existing worker under the coordinator's new priority.
Branch: `feat/ghostpay-privacy-mask-history-20261120`.
Base: `417f7c71daf8645e1432f2ec8f070110879b80bd`; application source equals freeze `2b7c015e28aa23f63ba39486ae7345983ce9ff97`.
Requirement: issue #286 items 1 and 4, explicitly required for beta qualification.
Owned paths: `apps/web/src/AppShell.tsx`, new `AppShell.privacy.test.tsx`,
`apps/web/src/lib/privacyMode.tsx` and focused tests, new
`apps/web/src/components/{PrivacyControls,SensitiveContent,PrivateHistory}.tsx` and focused tests,
`apps/web/src/components/ReconciliationLedger.tsx` and new `ReconciliationLedger.privacy.test.tsx`,
`apps/web/e2e/privacy-mask-history.spec.ts`, this additive claim and
`docs/engineering-handoffs/continuous-20261120/privacy-mask-history/`.
Coordination: `qa_bug_gen1` owns Settings, settings model and Common/clipboard source;
the coordinator owns shared catalogs/source-English policy. No edits to their paths.
Acceptance: demonstrate baseline gaps; global screen/accessibility masking and deliberate 30-second reveal;
preserve mounted drafts and sole-copy recovery material; clear sensitive selection and move hidden focus safely;
revoke on expiration, visibility/pagehide, view/session/app-lock boundaries; history requires existing unlock
and separate reveal. No new plaintext history persistence or network lookup. Integration must also connect
wallet/account and direct vault-lock revocation before claiming those boundaries complete.
Limits: visual masking is not DOM/memory erasure or cryptographic lock. Existing backup custody,
contracts, fees, hosting, network authority, optional privacy 5a–5l and release gates stay under their original owners.
Product implementation is authorized after the coordinator reviewed the source gap and architecture.
No remote mutation; publication and independent review remain coordinator-owned.

Additional coordinator-authorized #4 scope: `apps/web/src/components/WalletAttempts.tsx`
and its test. Preserve the entire existing duplicate-safety journal, show a neutral unresolved-request
warning without account/hash details while disconnected, and expose only the connected account+chain
after explicit temporary history reveal in privacy mode. Root owns Pay/Registry call sites and account lifecycle.
Additional explicit lock integration: only the manual `Tags` lock handler in `apps/web/src/views/Scan.tsx`,
with an AppShell regression proving reveal revocation, retained seller identity and unchanged encrypted tag records.
Temporary per-operation vault closures in receipt/invoice workflows are outside this integration.
Authorized authority-preservation follow-up: new `apps/web/src/lib/executionSettings.ts` and its tests,
plus AppShell's private-preference update/storage handler. The comparison excludes only the two new UI fields;
qa_bug_gen1 owns their separate nonsecret storage key/API, and root owns Pay/Registry guard integration.
Existing raw execution-settings storage, external-setting revocation and network authority checks must remain intact.


## Independent privacy quick-hide feature — 2026-11-19 Pacific

Worker: `/root/new_feature_gen1`; branch `feat/ghostpay-privacy-quick-hide-20261120`.
Frozen dependency: existing masking/history implementation at `8be15289`; this branch is stacked on that recovered local source and is not a replacement for its actively advancing owner branch.
Owned source: new `apps/web/src/components/PrivacyQuickHide.tsx`, its focused tests, a minimal import/mount in `apps/web/src/AppShell.tsx`, and `apps/web/src/AppShell.quickHide.test.tsx`. Evidence: `docs/engineering-handoffs/privacy-quick-hide-20261120/`.
Purpose: when privacy mode is already enabled, an explicit Alt+Shift+H shortcut or accessible button revokes all temporary reveals. The action only hides, never reveals or changes privacy preferences, keys, backups, history or payment authority. Plain typing, other shortcuts, composition and prevented events retain their behavior. One listener is mounted with the shell and removed on disable/unmount.
Acceptance: demonstrate missing shortcut on frozen source; verify global and independent history reveals are revoked, unlock requirements remain, repeated activation cannot reveal, sensitive focus is moved by the existing boundary, underlying draft/session/recovery material remains intact, and unrelated key events are not consumed. Use original test/lint/typecheck settings and provide a fresh-review handoff.
No edits to existing privacy semantics, Settings, catalogs, clipboard primitives, contracts, fees, network, deployment or release gates; no remote writes. Root explicitly approved this separate feature scope after discovering active ownership of the prior clipboard implementation.


## Fresh quick-hide security/code review — generation 2

Worker: /root/security_review_gen2. Branch: review/ghostpay-quick-hide-gen2-20261120.
Exact feature source: 052ac56c36cf62419941223318d1b6a366954625; frozen privacy dependency: 8be15289.
Owned writes: this additive claim and docs/engineering-handoffs/security-review-gen2-20261120/ only.
Acceptance: independently inspect new shortcut source, shell integration and original focused tests for one-way hiding, keyboard/accessibility behavior, focus and listener lifecycle, preserved independent history authority and sole-copy material. Review the separately owned receipt-status repair at its later exact source. Preserve setup failures and distinguish focused execution from full/browser qualification.
No source-branch mutations, remote writes, contract/fee/deployment/release changes or security gate weakening.


## Required privacy specs and independent teams — 2026-11-20 UTC

Worker /root in workspace dc1ef37f4621. Base published 137628961463fc5abd8b7927b2efe6b18a0a206a. Owned M0 paths: docs/privacy-release/, tasks/plan.md, tasks/todo.md and this entry. Scope exactly #286/#287. Nine specs precede code, three parallel worker slots, fresh successor review. Preserve shared generation-6 integration lock, main and original branches. Initial unpublished local spec/candidate were lost in workspace cleanup; source and evidence reset to this published base. No deployment/release, gate waiver or dependency change.


## Global masking team generation 1

Worker /root; branch privacy/v1-masking-20261120; base bbcf71b7. Runtime retained from published13762896; owned writes limited to additive focused evidence and handoff unless inspection proves a defect. Review global SensitiveContent boundaries, temporary reveal expiry, one-way quick hide, preservation of recovery/drafts, accessibility/focus and app-shell integration. Execute original targeted tests. Independent successor receives exact-source evidence. No dependency, network, storage, recovery erasure, remote publication or release-gate changes.


## Required privacy candidate reconciliation — coordinator

Worker /root in dc1ef37f4621. Own isolated local candidates work/ghostpay-required-v1-candidate-20261120 and work/ghostpay-required-v11-candidate-20261120. Reconcile released feature branches only, preserve individual feature ancestry/evidence, record original gates on exact combined source. Existing shared integration lock and other coordinator's branches/main remain untouched. v1 candidate must not depend on v1.1 modules. Resolve shared-file appends/imports/catalog keys without discarding worker behavior. No remote push (automatic approval review rejected earlier push), release, deployment, security gate waiver or dependency update.


## Clipboard privacy team generation 1 — current-cycle qualification

Worker /root; branch privacy/v1-clipboard-20261120; base bbcf71b7. Own additive evidence under docs/privacy-release/evidence/v1-clipboard/ and this claim. Runtime is retained from published13762896 and is more advanced than standalone PR297 (digest ownership, cleanup generations, pending-clear serialization). Do not replace it with older PR source. Acceptance: original focused runtime/component/settings checks on this exact retained implementation, independent browser-permission and race review in a fresh successor. No runtime change without concrete missing behavior. No deployment, gate or remote writes.


## Private history team generation 1

Worker /root; branch privacy/v1-history-20261120; base bbcf71b7. Owned writes additive qualification evidence and next-generation handoff; published runtime retained unless concrete defect appears. Verify independent unlocked history reveal, account/chain/session scope, preservation of encrypted reconciliation and unresolved duplicate attempts, no new network lookup/plaintext history. Original focused tests, then fresh independent review. No storage migration, deletion, dependency, network, remote write or gate change.


## Privacy-safe output team generation 1

Worker /root; branch privacy/v1-outputs-20261120; base bbcf71b7. Owned runtime: lib/tagArchive.ts and features/policy/PolicyCreate.tsx; matching existing regression files, additive evidence and this entry. Inspection found export filenames still contain a policy-hash prefix and archive creation date. Replace only filename metadata with fixed neutral names while preserving canonical policy record and encrypted archive contents/recovery semantics. Existing wallet, masking, signature and storage lanes stay unchanged. Regressions before fix, focused original checks, fresh independent output review. No remote writes/deployment/gate change.


## v1.1 invoice minimization milestone 1 — 2026-11-20 UTC

Worker: `/root/invoice_gen1`; branch `privacy/v11-invoice-minimization-20261120`; base `bbcf71b79d4efd00892948faa833cb7d8f471406` (published product predecessor `137628961463fc5abd8b7927b2efe6b18a0a206a`). Own new `apps/web/src/lib/invoiceMetadata.ts` and tests, narrow `lib/invoiceCreate.ts`/tests and `views/CreateInvoice.tsx`/tests, feature-specific `invoice.metadata.*` localization entries, `docs/privacy-release/evidence/invoice-gen1.md`, and this entry. Specification `docs/privacy-release/v11-02-invoice-minimization.md` is committed before implementation. Acceptance: explicit pre-sign privacy-minimal mode, optional memo omitted and descriptions neutralized, required fields/math/encryption/normal mode preserved, invalid modes rejected, real UI option and original-code signature/fragment round-trip tests. Root owns shared i18n reconciliation and later retention integration. No external source copied, new dependencies, schema/crypto changes, deployment, release, remote writes, shared lock or other branch edits. First milestone will be handed to a fresh independent reviewer; incomplete checks remain open.

Completion of invoice minimization M1: source `7c39a080e8510587898e2a02435c7e967951e803`. Builder baseline 8 failures and UI baseline 4 failures; 51 focused cases and 74 CreateInvoice cases passed on the implemented source (four overlapping UI cases). Secret scan passed. Evidence: `docs/privacy-release/evidence/invoice-gen1.md`. No full typing/lint/browser/coverage/release claim. Root assigns a fresh reviewer and owns later retention reconciliation. This implementation worker releases its paths and execution window.

## v1.1 invoice minimization milestone 2 — 2026-11-20 UTC

Worker: `/root/invoice_gen2`; branch `privacy/v11-invoice-minimization-20261120`; base `186363a53ea7c5943fc2c6dc7c1406d5a874407e`, with M1 runtime `7c39a080e8510587898e2a02435c7e967951e803`. Fresh successor independently reviewed the specification, source and M1 evidence, including the four-test overlap between the 51-case and 74-case selections. Own `apps/web/src/lib/merchantTemplate.ts`, `apps/web/src/components/MerchantTemplateIssuer.tsx`, feature-specific merchant metadata tests, `docs/privacy-release/evidence/invoice-gen2*`, a narrow specification ownership update and this additive claim. Acceptance: expose deliberate pre-sign minimization on the remaining production invoice builder consumer, snapshot the option before asynchronous custody checks, preserve signed profile authority, quantities, amounts, fee policy and exact expiry, revoke prior/pending links on mode changes, and reset the option across seller sessions. Demonstrate the missing option on unchanged source, run focused merchant/metadata regressions, independently review all production builder consumers, and run scoped typed lint/full typing only in the coordinator's resource window. Root retains CreateInvoice retention insertion points, shared integration and publication. No new dependency, external source copy, signed-profile/schema/crypto mutation, network behavior, deployment, release, remote writes or weakened gates. Stop at the next tested milestone with exact-source evidence and a fresh-worker handoff.

M2 completion: runtime `e498ec59`, final tested source `4f288fcdc3acad66db16ddf70743ff05a903c973`, tree `a33173e9a40c83f853849a3ea0463632cc6ec82c`. Final focused selection passed 47 cases across six files, zero skips; secret scan and full feature whitespace check passed. Preserve baseline 13 failed/2 passed (including one invalid fixture) and initial 46 passed/1 failed before fixture repair. Original full web TypeScript was killed with exit 137 before diagnostics; typing and unrun scoped lint remain unqualified at coordinator direction pending a combined resource window. No browser/coverage/release acceptance. Detailed evidence and fresh successor scope: `docs/privacy-release/evidence/invoice-gen2.md`. This worker releases its paths and execution slot; no process remains active.


## v1.1 local destination reuse team, generation 1 — 2026-11-20 UTC

Worker `/root/address_gen1`; branch `privacy/v11-address-reuse-20261120`; exact base `bbcf71b7`. Owned paths: new `apps/web/src/lib/addressReuse.ts` and tests, new `AddressReuseNotice.tsx` and tests if needed, narrow `apps/web/src/views/Pay.tsx` and dedicated address reuse integration tests, additive i18n keys coordinated with root, this claim and `docs/privacy-release/evidence/address-gen1.md`. Spec `docs/privacy-release/v11-01-address-reuse.md` predates code. First milestone: bounded in-memory chain/account-scoped classifier distinguishing same-payment retry from another payment, wired into real EVM Pay review without new RPC/storage, focused tests and source-pinned successor handoff. Preserve transaction/recovery authority, original branches and all release gates. Root owns dependency setup, independent review and publication.

Address first milestone ownership clarification: new `lib/useAddressReuse.ts` separates provider/app-session effects from pure classifier; `address.reuse.*` catalog keys plus explicit SECURITY_KEY_GROUPS entry are coordinator-approved additive ownership. Other feature prefixes are unchanged.

## v1.1 local destination reuse team, generation 2 — 2026-11-20 UTC

Worker `/root/address_gen2`, fresh successor; branch `privacy/v11-address-reuse-20261120`; released base `69edfae56fa629f8d35c29d5007dc566d5585b22`, runtime `19fee82e88a72f38ad2fad87a216b508d6285f8e`. Owned paths continue the predecessor's classifier, hook and dedicated tests, narrow Pay integration if a concrete defect requires repair, this additive claim and `docs/privacy-release/evidence/address-gen2.md`. Independently review subscription failure and reentrancy, same-account provider replacement, stale work after disconnect/unmount, bounded observations and known-hash payment outcomes. Confirm the existing Sweep destination ledger overlap before adding any flow. Repair demonstrated lifecycle gaps with focused original-configuration tests; avoid duplicating the predecessor's completed 50-case suite without a remaining risk. Coordinate any Pay changes with the separate disclosure owner. Scoped lint is authorized at a 1024 MiB cap; full web typecheck waits for the coordinator's exclusive window. No new egress/persistence, dependencies, crypto, fees, contracts, deployment or release gate changes. No remote mutations; the coordinator preserves local evidence and the integration bundle.

Generation 2 released at repaired runtime `976f8d5eba33e4de24f2534f670f3b18ec63470e`: fresh review reproduced and fixed stale binding after unmount, qualified the existing address-reuse copy to intended/requested destinations, and verified the hook lifecycle and actual Pay known-hash/approval/late-outcome boundaries. Final hook source has 16 passing cases; final Pay/notice/security-key source has 23 passing cases. Sweep overlap is documented without new wiring. Typed lint/typecheck, browser and combined gates remain pending; the attempted lint call was aborted before dispatch to respect the coordinator's exclusive invoice window. Evidence and internal successor assignment: `docs/privacy-release/evidence/address-gen2.md`. Ownership released for integration; no remote writes.


## Retention team generation 1

Coordinator-owned feature branch privacy/v11-retention-20261120, base bbcf71b7. Owned paths: new lib/metadataRetention.ts and tests, components/MetadataRetentionControls.tsx and tests, narrow Settings.tsx and CreateInvoice.tsx integrations, additive retention.* source/catalog keys, and docs/privacy-release/evidence/retention-gen1.md. M1 deliberately covers disposable in-memory generated invoice presentation only, never saved invoices, transaction journals, vaults, keys, backups or security records. Preview/confirmation binds current revision; timer policy is opt-in and recorded separately. No general storage clearing. Specs exist before this claim. Fresh reviewer must assess eligibility and lifecycle before completion.


## v1.1 external-wallet disclosure — first implementation generation

Worker `/root/disclosure_gen1`; branch `privacy/v11-wallet-disclosure-20261120`; base `bbcf71b7` (published dependency `137628961463fc5abd8b7927b2efe6b18a0a206a`). The v11-03 spec was committed before code. Owned paths: new `apps/web/src/lib/walletDisclosure.ts` and tests, new disclosure React host/context and tests, narrow `wallet.ts` entry points, `AppShell.tsx`, Pay/Registry/Policy hook/pass-through integration, additive `wallet.disclosure.*` English keys and their critical-key classification, and `docs/privacy-release/evidence/disclosure-gen1.md`. Parent owns later v1 wallet lifecycle changes; address worker owns separate Pay destination warning.

M1 acceptance: immutable bounded request descriptor, explicit continue/cancel before account request, switch, signature and send, no provider calls to populate preview, no host silently allowing a production request, rejection before attempt-journal mutation, revocation on app/session/provider lifecycle, accessible privacy-aware dialog, focused original tests and exact evidence. Low-level wallet API keeps optional explicit integration injection for non-UI callers; all current application connection callers pass the required hook. Full release/browser qualification remains later. No dependency/contract/fee/gate/remote/deployment changes.


## Retention team generation 2 independent review

Worker /root/retention_gen2; branch privacy/v11-retention-20261120; base 2bd20ecb8ac437e2e3fb42fc953a11ed1ab24fca, runtime989e72687a9b7cefc369107cc6f09e38d270d0ce. Owned writes: lib/metadataRetention.ts, lib/useInvoicePreviewRetention.ts, their focused tests, MetadataRetentionControls.tsx and its focused tests, narrow existing CreateInvoice retention regression, docs/privacy-release/evidence/retention-gen2* and an additive spec eligibility matrix. Root owns shared integration and other feature overlap; wallet/Pay/Registry/Policy and merchant issuer changes require coordination.

Acceptance: independent review of revision-bound confirmation, listener/adapter failure and reentrancy, current-object lifecycle, clocks and preference reload/concurrency; census persisted transaction/invoice metadata and protect anything lacking positive nonessentialness proof. Do not infer settlement from timestamps or hashes, delete vaults/backups/pending records/security evidence, introduce generic origin clear or claim all #287 retention complete. Fix only concrete bounded defects and retain regression evidence. No dependency/wire/crypto/fee/network/security-gate or remote changes; full resource-intensive checks remain coordinator scheduled. Fresh next-generation handoff must cite exact source, actual results and remaining scope.


### Retention generation 2 milestone released

Worker /root/retention_gen2 completed independent bounded review at runtime/tests `1003569fed259317967a190c192ede5b9fd80ea9` (tree `543378407777642c9b7054825356b5500c356da4`). Five intended RED assertions reproduced; original four-file acceptance selection now21/21 pass with zero skips and exit0. Registry observer/disposal/capacity faults and ambiguous/oversized preference parsing repaired; protected persistent-store census recorded. No new cleanup adapter. #287 item4 remains partial; original typing/lint/browser/complete gates remain open. Evidence and fresh successor task: docs/privacy-release/evidence/retention-gen2.md and retention-gen2-census.md. Owned paths released; no active process or remote mutation.

M1 frozen at `15e14ba2f3e3ee45f49f6c14cf984776cf68e92b`: 80 focused tests and two original Pay/AppShell journeys pass; 64 Pay tests deliberately skipped by name filter. This worker releases source ownership for the parent's fresh successor. Comprehensive original UI fixture migration, independent review, type/lint/full/browser gates remain open. See `docs/privacy-release/evidence/disclosure-gen1.md` for exact sources, logs, API coordination and internal next task.


## Required privacy combined v1.1 reconciliation — generation 3

Worker /root/integration_gen3; delegated coordinator ownership of work/ghostpay-required-v11-candidate-20261120 in privacy-integration; base ecd2e3a107e36ad1da11601b6b29e1b7b3b17949. Merge exact released v1 candidate 891bf124e461271b2f55887a400bc94134824fcc and disclosure M2 ffac690096d6e267b136d5e35d242582587f12a7, preserving feature ancestry. Owned paths: shared wallet.ts/Pay/Registry/Policy/AppShell reconciliation, combined-only consent fixtures, additive catalog/classification resolution, and docs/privacy-release/evidence/integration-gen3*. Parent owns standalone v1 candidate and schedules original heavy gates; outputs M2 and merchant retention G3 remain independently owned until released.

Acceptance: compose v1 wallet lifetime guards/signals/final account verification with v1.1 mandatory immutable disclosure, preserve expected permission/switch events, refuse stale follow-up requests, and retain known/uncertain broadcast evidence. Preserve current-wallet attempt props, presentation-only settings identity and storage masking fallback. Explicit UI test approvals must use actual labelled dialogs without bypassing the gate. Record exact source and real focused results; no full/browser/hosted claim from partial tests. No dependency, crypto, fee, contract, wire, network-policy, remote publication, deployment, main or shared integration-lock change.


## Private history independent review — generation 2

Worker /root/history_gen2; branch privacy/v1-history-20261120; base814eb4d88f96cc797294a130583737d01cc19054. Reused released worktree privacy-address. Owned writes: narrow WalletAttempts wallet-scope prop wiring in Pay.tsx (two call sites), features/registry/RegistryView.tsx and features/policy/PolicyPay.tsx, focused matching regression coverage and docs/privacy-release/evidence/history-gen2*. Parent explicitly reserved these call-site spans; wallet_gen1 owns independent lifecycle hooks/guards and disclosure_gen2 owns consent presentation/fixtures. Existing component filters/reveal/confirmation and complete unknown/submitted journal records remain authoritative. Reproduce original blind-retry and policy clear failures before repairing caller scope; independently review history lock/account/reveal/accessibility and encrypted preservation. No network/storage/dependency/crypto/fee/contract changes or remote writes. Full original gates remain open under coordinator resource scheduling.


History generation 2 released after runtime4cc9026f and84 passing focused tests. Only the four claimed WalletAttempts prop spans changed in production. Original full/browser/hosted gates and combined provider lifecycle remain coordinator/successor work. No process remains active and no remote mutation occurred.


## Wallet lifecycle privacy generation 1 — required v1.0

Worker /root/wallet_gen1; branch privacy/v1-wallet-lock-20261120; base bbcf71b79d4efd00892948faa833cb7d8f471406. Own apps/web/src/lib/{wallet.ts,useWalletPrivacy.ts} and targeted matching regressions, views/Pay.tsx, features/{registry/RegistryView.tsx,policy/PolicyView.tsx}, additive evidence wallet-gen1 and this claim. The v1.0 spec is committed before implementation. Clear stale visible wallet/session authority on account, chain, disconnect, app/session lock and unmount; pending promises cannot restore revoked state or trigger follow-up signing/sends. Preserve known/uncertain broadcast outcomes, duplicate-attempt journal, encrypted records and sole-copy recovery material. Reuse existing guards. Independent successor receives bounded original test evidence and exact-source remaining work. Coordinate overlapping disclosure API with root; no v1.1 dependency, shared integration mutation, remote writes, dependency/crypto/contract/fee changes or weakened gates.


Wallet lifecycle generation1 released at tested runtime 74cb34cbc5f3f193e70430d17bef1ccafd00afca. Focused59/59 pass; evidence docs/privacy-release/evidence/wallet-gen1.md. Independent successor owns next review/repair; typing/lint/browser/full suite remain open.


## Wallet lifecycle generation 2 independent review

Worker /root/wallet_gen2; branch privacy/v1-wallet-lock-20261120; base2f2da8316ee025151e7f275eba5d9b93944a070c, runtime74cb34cbc5f3f193e70430d17bef1ccafd00afca. Owned paths: useWalletPrivacy.ts, wallet.ts lifecycle/connection guard spans, matching original/focused tests and narrow Pay/Registry/Policy lifecycle wiring, evidence/wallet-gen2*. History_gen2 owns four WalletAttempts wallet-prop spans; disclosure_gen2 owns independent v1.1 consent API/fixtures. Root reconciles candidate branches.

Acceptance: independent examination of competing connection scopes, provider listener disposal/reentrancy, app-lock/session expiry, stale promises and preserved known/unknown transaction evidence. Repair only concrete defects with original regression evidence. Standalone v1 has no v1.1 dependency; no key/backup/journal deletion, new RPC/dependency/wire/crypto/fee/contract change or remote mutation. Use bounded one-worker tests; full typing/lint/browser/hosted gates remain separately unqualified. Deliver source-pinned M2 handoff and release at verified milestone.


Wallet generation2 narrow adapter follow-through: the revised real Policy scan lifecycle regression at59cb2ce2 found one follow-up mock client read after session replacement while a prior log call ignored abort. Production defaultServices already guards transport authorization, so this is not evidence of external egress bypass. Coordinator explicitly approved extending owned scope to policy/scan2.ts optional read-lifetime guard and the existing PolicyReceive scan call; no shared adapter package, transport policy or new RPC. Preserve the stronger before/after-await cancellation regression and existing scanner results.


### Wallet generation 2 milestone released

Worker /root/wallet_gen2 completed independent review at `a431845b9f8a4daa1759893132c4452bf50ce618` (tree `698a00feb0a84fbd045f65956de40758ea2a94e3`), runtime `99b2c1668f126603b198adedf9adf3b8d8f2463c`. Reused independent history four-prop fix; guarded app-level Policy scan continuation for uncooperative clients; preserved original lifecycle/custody/journal invariants; added competing connection and late-outcome cases; corrected unsupported role-query test options. Focused scan36 and lifetime11 pass; wider219-selected attempt returned203 passes plus2SIGKILL worker errors, explicitly not passed; two killed original files subsequently29/29 pass in quiet window. Evidence and next-generation assignment: docs/privacy-release/evidence/wallet-gen2.md and wallet-gen2/evidence.json. No process active; paths released. Full combined typing/lint/coverage/browser/hosted gates remain open; no remote mutation.


## Global masking generation 2 independent review

Worker /root/masking_gen2; branch privacy/v1-masking-20261120; base1110d51fb512803353b3361e8f76ec5eefa177e9. Published13762896 runtime retained by generation1;49original focused cases passed there. Own additive review/evidence under docs/privacy-release/evidence/masking-gen2*, plus narrow privacyMode/SensitiveContent/PrivacyControls/PrivacyQuickHide regression and repair only if a concrete defect is established. Coordinator owns shared app reconciliation; wallet_gen2 owns account lifecycle and disclosure_gen2 owns its new dialog.

Acceptance: independent review of bounded reveal clocks, lock/session/visibility/route authority, safe focus and selection, one-way quick hide, visible/accessibility concealment and mounted draft/sole-copy recovery preservation. No claims of DOM/JS erasure. Execute only bounded original focused checks under1024MB/oneworker; original full typing and browser build remain blocked by coordinator resource failures, and no gate bypass is permitted. No dependencies, new egress, storage deletion, recovery changes, remote publication or release. Finish source-pinned evidence and a fresh successor task, then release.


### Masking storage-refresh boundary regression

Independent review found the execution-settings storage handler can reload default visual preferences after missing/corrupt/blocked UI-preference storage, unlike the UI-only handler which preserves current choices. Narrow additional owned span: AppShell.privacy.test.tsx storage-refresh regression, with AppShell.tsx onStorage fallback repair coordinated with root; disclosure's scope/provider additions remain untouched. Require current masking and draft/session preservation while retaining existing execution-grant revocation and permitting a deliberate later privacy toggle.


### Masking-only prepared Pay context stability

Root assigned the separately reproduced privacy-toggle/Pay-preparation gap to masking_gen2. Owned narrow spans: Pay.tsx execution-settings identity and refreshContext dependencies/current guards; new Pay.masking.test.tsx. Reuse the existing sameExecutionSettings boundary (only privacyMode/clipboardClearAfterMs excluded); every other current/future setting, endpoint/signer reference, session, invoice, network grant, quote and expiry remains guarded. Wallet lifecycle and disclosure APIs/consent helpers remain independently owned. Verify unchanged prepared payload, no extra privacy-triggered RPC/wallet activity, in-flight preparation preservation and execution-change refusal.


### Masking generation 2 released

Worker /root/masking_gen2 completed independent review and two bounded repairs at runtime `ea6759e50655e9a4a469bb59bd0cb05ca2515bf6` (tree `1edc0e83c0edc74516af6a4e327590725d39f306`). Four storage-refresh regressions and two prepared-Pay regressions reproduced; actual execution-setting revocation remained passing. Final original focused selection66/66 across8files, zero skips, exit0; secret/full-feature whitespace checks passed. Scoped typed lint was killed137 and remains open with full type/coverage/browser/hosted gates. Evidence and fresh successor assignment: docs/privacy-release/evidence/masking-gen2.md. Owned spans released; no active test process or remote mutation.


## Clipboard privacy independent review — generation 2

Worker /root/clipboard_gen2; branch privacy/v1-clipboard-20261120; base 52f1332f97a066c59318dfb8f7985f1deba2dd93, runtime retained from published137628961463fc5abd8b7927b2efe6b18a0a206a. Owned writes: docs/privacy-release/evidence/clipboard-gen2* and this additive claim; clipboardPrivacy.ts/Common.tsx/SecretBackup.tsx and their focused tests only if a concrete bounded defect is reproduced. Parent owns combined qualification, shared-file reconciliation and publication.

Acceptance: independently inspect digest-only ownership, reserved copy intent, pending-clear serialization, replacement races, denied/unavailable APIs, timer/disable/unmount cleanup and asynchronous backup generation. Preserve newer clipboard text, deliberate successful copies, keys and backups. No unconditional-clear fallback, plaintext timer retention, new dependency/network/storage/deployment/security-gate changes. Original browser journey is reviewed but execution awaits the coordinator's quiet build window; focused checks use original configuration and exact-source evidence. Retain browser/OS history and external race limitations. Release a source-pinned next-generation handoff at the bounded milestone.


### Clipboard generation 2 milestone released

Worker /root/clipboard_gen2 repaired queued-copy lifetime at `a17bad1900d58c005efd42ca308907531b2bd9ed` (tree `af710d89f790437fc56cc866f819ccb8fb304eb1`) after three real component regressions. Full focused seven-file selection77/77passed,zero skips,exit0; prior wrong-cwd startup and RED3fail/13filtered preserved. Secret scan and feature-range whitespace checks passed. Existing native clipboard/permission/history limitations remain explicit. Review/evidence/internal successor assignment: docs/privacy-release/evidence/clipboard-gen2.md. Full combined typing/lint/browser/coverage/hosted gates remain coordinator-owned and open. Owned paths released; no active process or remote mutation.


## External-wallet disclosure independent generation 2

Worker /root/disclosure_gen2; branch privacy/v11-wallet-disclosure-20261120; released predecessor7052b217ba4ac8ee8247371acd3429de7ff7d295, runtime15e14ba2f3e3ee45f49f6c14cf984776cf68e92b. Owned paths: disclosure library/presenter and focused tests, original Pay/Registry/Policy consent fixtures, missing es/ja/ar draft fallback catalogs, security classification tests, bounded browser journey if feasible, additive evidence. Root owns integration; v1 wallet team owns full connection/session lifecycle guards in parallel and will reconcile shared wallet/caller code. Acceptance: independent exact-request/privacy/lifecycle review, explicit per-request consent in actual existing journeys, no gate bypass or extra RPC, preserved journal/outcome/recovery behavior, source-pinned focused evidence and next-generation handoff. Hold test processes for root's quiet typecheck window. No new dependencies, crypto/fees/contracts/network/release or remote changes.

M2 focused review checkpoint frozen at `a3099a0bd26a2da055932f604f06c5bb2671542b`, tree `46a7bef86d000da69a8a0ff3a8c644b086c64958`: 18 complete files, 249 tests passed, zero skips, exit 0. Explicit consent now covers the original Pay/Registry/Policy, localization, signer and privacy-authority fixtures. Independent fixes cover draft fallback/classification, typed-domain chain display, and preservation of connected-wallet disclosure scope across visual-only settings changes. The history team's four-call-site repair is carried as `4109c034` from original `4cc9026f`. The bounded real browser case is authored but unexecuted. This worker releases source ownership to root/fresh generation; combined-source v1 lifecycle/masking fixture reconciliation and original type/lint/build/coverage/browser/hosted gates remain open. See `docs/privacy-release/evidence/disclosure-gen2.md` and its exact retained logs/next internal assignment. No remote mutation.


## Retention team generation 3 — merchant screen-result adapter

Worker /root/retention_gen3; branch privacy/v11-retention-20261120; base3521ad08b9833030d8f5757361a8f942386daad3. Owned writes: narrow MerchantTemplateIssuer.tsx hook/control integration, new MerchantTemplateIssuer.retention.test.tsx, this additive ownership entry, the bounded acceptance amendment in v11-04-retention.md, and docs/privacy-release/evidence/retention-gen3*. The coordinator owns integration with separately reviewed merchant invoice minimization; do not replace that feature's component or builder. Existing retention modules and persistent stores stay unchanged unless a demonstrated adapter defect requires explicit coordination.

Acceptance: the current completed merchant invoice presentation is the only newly eligible object. Existing preview/confirmation or opt-in active-page expiry can clear that display without altering editable settings, signed profile, seller/custody state, saved invoices, pending work, shared links or protected transaction/recovery evidence. Replaced results, old confirmation plans, unmount and late pending completion cannot clear a new result or resurrect an old registration. No new storage/network/crypto/dependency/fee/wire/gate changes. Commit acceptance before implementation, preserve real RED/GREEN evidence, and hand off exact source with broader persistent retention still open.


### Retention generation 3 merchant adapter released

Worker /root/retention_gen3 completed the bounded adapter at `4cf2b4b0439f11b614cc90ab0196afa021eb1fad` (tree `90046258fde81a8547655e8a966f20b762f791bc`). Specification/ownership preceded implementation;3intended RED cases now pass within29/29original focused cases across6files,0skips,exit0. Reused the existing identity registry/hook/controls for only completed merchant screen results; pending generation, original profile/draft/custody, shared links and protected persistent records remain unchanged. Evidence and fresh independent assignment: docs/privacy-release/evidence/retention-gen3.md. Broader retention and original complete gates remain open. Owned paths released; no active process, new dependency or remote mutation.


## Privacy-safe outputs team generation 2 independent review

Worker /root/outputs_gen2; branch privacy/v1-outputs-20261120; base 76ddb0309dcc941d0930d253d63460f1e7822453, runtime81e295a3cdf3e75d5a64f36cefe395aa233cce0c. Owned writes initially docs/privacy-release/evidence/outputs-gen2* and this additive claim. Review fixed filenames, all current browser export callers, neutral document titles/error/notification/log surfaces and preserved canonical/encrypted recovery payloads. Only a demonstrated defect may justify a narrow additional production/test claim. Other workers own masking, wallet lifecycle, disclosure, retention and integration; coordinate shared files with root.

Acceptance: independently inventory applicable output surfaces, inspect exact payload-versus-filename changes, execute bounded original checks as justified and preserve actual failures/skips. Existing deliberate invoice fragments/export bodies remain functional; no new Notification API, secret erasure, storage/network/dependency/crypto/fee/contract/gate changes. Full combined type/lint/browser/coverage gates remain root-scheduled. No remote writes, deployment or release. Commit exact-source review evidence and an internal fresh-generation handoff, then release.


### Outputs generation 2 demonstrated message-boundary repair scope

Coordinator confirmed narrow ownership of features/policy/chain.ts read-failure message, lib/paymentKeyExport.ts contract-code refusal descriptor, their existing policy.logic.test.ts/paymentKeyExport.test.ts regressions, four locale entries and explicit critical-key classification. Inspection found selected policy/stealth addresses retained and rendered by these UserFacingError paths. Preserve all RPC inputs, refusal/authorization behavior, export payload construction and known transaction outcomes. Regression before repair; no other caller/lifecycle/transport changes.


### Combined generation 3 lifecycle and retention reconciliation findings

The merged merchant retention UI reproduced a lost freshly opened cleanup confirmation twice at43a5c315 (combined54/55;isolated3/4). Own narrow MetadataRetentionControls.tsx revision-bound presentation repair and existing/new combined regression verification; preserve registry revalidation and every protected store. A plan captured at the current revision must remain visible despite delayed effects from earlier registration, while stale plans never authorize cleanup.

Own narrow walletAuthority reuse of the already reviewed observeWalletLifecycle contract plus disclosure regressions. Partial event-method availability must reject before disclosure/provider access, partial registration must clean up, and retained callbacks must be inert before reentrant removal. Preserve real approval, exact payload, known/unknown broadcast result and journal behavior. Root owns separate standalone masking stale-settings fallback and any Pay post-broadcast network-lifetime follow-through; do not overlap those edits.


Combined generation 3 browser fixture follow-through: coordinator authorizes v1.1-only e2e/helpers.ts, flows.spec.ts and core-journey.spec.ts explicit per-request disclosure decisions. Each helper invocation names the method and acts on the actual labelled dialog; no global hook, production gate bypass or unknown-prompt approval. Preserve cancellation, expiry, no-extra-send and durable journal assertions. These fixtures remain authored-only until the original built-browser gate runs. Standalone v1 keeps its own fixture lineage.

## Combined required privacy qualification — generation 4

Worker `/root/v11_qualification_gen4`; branch `work/ghostpay-required-v11-candidate-20261120`; released base `806ed96cde92237ce97533411e22c111a629f685`. Own the ancestry merge of final standalone v1 parent `573901ee1c66624e57143526571a3fd76f52f264`, narrowly necessary real-disclosure fixture reconciliation in `WalletPrivacy.lifecycle.test.tsx` and `e2e/flows.spec.ts`, and `docs/privacy-release/evidence/integration-gen4*`. The source-only consent merge reviewer owns no writes. Parent owns standalone v1, shared integration/main, resource scheduling and publication.

Acceptance: retain captured wallet and network RPC lifetime before acquisition, known hashes and unknown journals, explicit account and transaction disclosure, Pay's address-reuse listeners and same-tab original-account history reconnection. Preserve revision-bound retention controls and the joint merchant minimization/cleanup case. No pre-sign guard after broadcast, changed release gates, dependencies, expanded retention eligibility, or contracts/fees/crypto/network-policy changes. Author and merge first; execute original necessary focused checks only after the coordinator grants the sole heavy-process window. Preserve actual failures and exact source/tree/log evidence. Full original type/lint/coverage/build/browser/hosted qualification remains open until actually run; release a bounded source-pinned handoff with no remote mutation.


## Global masking generation 3 stale-update fallback

Worker /root/masking_gen3; branch privacy/v1-masking-20261120; base59188a23e7f98e3119011f160627f088ab88ed8d (released M2 plus supported role-query typing repair). Owned spans: AppShell.tsx updateSettings stale-execution-revision fallback, AppShell.privacy.test.tsx narrowly corresponding regressions, and docs/privacy-release/evidence/masking-gen3*. The independent generation4 review identified the sibling fallback left as an M2 inspection target. Root and integration_gen3 coordinate later candidate reconciliation; disclosure scope, Pay identity and other worker spans remain untouched.

Acceptance: reproduce missing/corrupt/inaccessible UI privacy storage after another-tab execution write whose storage event has not arrived, then refuse a stale clipboard-only/settings update while retaining the current mask. Preserve current draft/session, exact newer execution-storage bytes, return-false behavior, revision refresh, RPC/session-only cache clearing and network invalidation; valid explicit privacy choices remain usable. Minimal functional current-state fallback reuses loadPrivacyPreferences. Original focused RED/GREEN tests under one worker/1024MiB, exact source/log evidence, secret/diff checks, fresh successor handoff. No dependencies, storage format, network destinations, crypto/fees/contracts, remote publication, deployment or gate changes. Full combined typing/lint/browser qualification stays coordinator-owned.


### Masking generation 3 released

Worker /root/masking_gen3 completed the stale-settings-update follow-through at runtime `32930d6615310e78009b525841fec58cba07f805` (tree `4ae7a9626071a1961bd053a02902d958468d93f7`). Corrected tests-only baseline5f845ce8 reproduced6behavioral failures after an earlier immutable-authority fixture setup failure; final original four-file acceptance40/40passed,zero skips,8.30s,exit0. Only AppShell.updateSettings stale-revision visual fallback changed; newer execution bytes/refusal/network revocation remain. Secret and generation-range whitespace checks passed. Evidence and fresh successor task: docs/privacy-release/evidence/masking-gen3.md and masking-gen3/evidence.json. No active process or remote mutation; owned spans released. Full combined gates remain coordinator-owned.

### Outputs generation 2 released — 2026-11-20

Worker `/root/outputs_gen2` completed the independent output inventory and two narrowly authorized neutral-error repairs. Both regressions failed before production changes; final complete focused selection passed 107/107 in 8 files, zero skips, exit 0 at `5e28b52b418d9c6cb250f559e4f2ce5805425c64`, tree `389c34c055975916f9bdee8969ccfb6c20fe5c26`. The initial acceptance failure is retained; its old address-positive archive expectation was updated while retaining all whole-archive refusal and key-wipe checks. Secret scan and diff check pass. Review, original logs, hashes and fresh-successor instructions are in `docs/privacy-release/evidence/outputs-gen2.md` and `outputs-gen2/`. Ownership is released; no test/build process remains. Full combined type/lint/coverage/browser/hosted gates and integration remain root-owned. No remote mutation.


### Combined required privacy generation 3 released

Worker /root/integration_gen3 completed bounded reconciliation at runtime 881429236b0ae75ed2294cadbcba43d60f0ed444: original core/retention 138/138 and UI/catalog 68/68 passed in separate overlapping selections. Five observer RED failures and two timing-dependent merchant confirmation failures were reproduced and retained; shared observer reuse and revision-bound controls pass with original assertions unchanged. Independent read-only review found no new blocker in those deltas. Later exact-parent masking G3 merge b39fcd39 passed the combined original AppShell privacy file 18/18. Browser fixtures 87f6681e are authored-only. Source-pinned logs, limitations and fresh internal assignment: docs/privacy-release/evidence/integration-gen3.md and integration-gen3/evidence.json. All processes stopped; owned paths released to the coordinator/fresh qualification generation. Wallet G3 post-broadcast read-lifetime input and original full type/lint/coverage/build/browser/hosted gates remain next-generation work. No remote mutation.

## Wallet lifecycle generation 3: post-broadcast read authority

Worker /root/wallet_gen3; branch privacy/v1-wallet-lock-20261120; base c883dafb96f614b71aa98e3ecd2c7dae61487fcd. Owned paths: narrow Pay.tsx runtime RPC-scope capture, WalletPrivacy.lifecycle.test.tsx or a focused matching real-Pay regression, additive wallet-gen3 evidence and this claim. Independently verify the generation-4 static finding that a provider account/chain/disconnect event during a pending native send leaves the old payment RPC grant live. Reproduce before changing behavior; preserve returned transaction hashes, unknown outcomes and duplicate-attempt evidence, including a send already dispatched. Stop new reads from a revoked wallet operation without reusing signing-expiry checks after broadcast or claiming to cancel a transaction. Fresh deliberate verification may capture new authority. No shared transport/network policy, dependency, wire, crypto, fee, contract, v1.1 disclosure dependency, remote or release-gate changes. Root/integration own combined reconciliation; exact-source focused evidence and a fresh successor handoff are required.


### Wallet generation 3 coordinator-preserved release

Worker runtime3ef264fa and its17+271focused checks are preserved; the worker turn ended before documentation commit. Coordinator independently checked the exact diff and all retained log hashes and authored the source-pinned handoff without claiming a test rerun. Only documentation/logs added here. Runtime ownership is released; no process remains. Original combined gates stay open.

### Combined required privacy generation 4 released

Worker `/root/v11_qualification_gen4` merged final standalone v1 parent `573901ee1c66624e57143526571a3fd76f52f264` by ancestry and retained real v1.1 account/transaction approvals. Frozen combined source `85dd647cfd439a18e4885ab5ff9a9bf3a3bbad5c`, tree `78001180019ef9e3b6716217e2a35a41b1426d20`, passed 301/301 original focused cases across 14 complete files, zero skips, exit 0, 54.59 seconds. This includes all lifecycle cases and the existing merchant metadata/retention controls; no release command, threshold, gate, assertion or production behavior was changed beyond the incoming Pay lifetime repair. Secret and full required-feature whitespace checks passed. Fresh immutable-source review found no additional blocker in the narrow reconciliation. Exact receipts, retained logs, limits and successor assignment: `docs/privacy-release/evidence/integration-gen4.md` and `integration-gen4/evidence.json`. Full original type/lint/coverage/build/browser/hosted gates remain open. All execution stopped; owned paths released to coordinator/successor. No remote mutation.

## Required privacy final qualification and review package

Worker `/root`; branch `work/ghostpay-required-v11-candidate-20261120`; base `474d6e06ec2497b90071785039809e6925cfdd95`. The feature and integration teams have released their owned paths. Coordinator owns `docs/privacy-release/STATUS.md`, `docs/privacy-release/evidence/independent-gen4.md`, `docs/privacy-release/evidence/coordinator-qualification/`, current plan/checklist updates and small additive checkpoint links in `docs/release/RELEASE_BLOCKERS.md` and `docs/beta/CORE_BETA_COMPLETION_TRACKER.md`. Preserve all earlier owners and release requirements. Record exact source, commands, exits, interrupted checks and overlapping test counts; do not turn focused acceptance into a whole-release claim. The standalone v1 source remains independently frozen while its original gates execute. No application/configuration edits are included in this documentation claim. Preserve the held shared integration lock and other branches; no remote publication, deployment, release or main merge. Deliver a verified recoverable git bundle and concrete publication approval request only after completing the local review package.

## Clipboard original-suite follow-through — generation 3

Worker `/root/clipboard_gen3`; branch `privacy/v1-clipboard-20261120`; base `9174ea73eb7d232b2e07a3b07238e6f216cd9226`. The coordinator's original coverage shard at combined v1 source `573901ee1c66624e57143526571a3fd76f52f264` completed 512 cases and failed the existing Solana backup-copy/Lock case. Owned paths: narrow `apps/web/src/features/solana/SolanaView.test.tsx`, matching Solana/SecretBackup/clipboard runtime only if a demonstrated defect requires it, and `docs/privacy-release/evidence/clipboard-gen3*`. First establish the original published `13762896` behavior before classifying a regression. Preserve readable ownership comparison, denied/unavailable-read refusal, newer clipboard contents, warned deliberate copies, key wipe and native best-effort limits. An obsolete fixture may be repaired only with equivalent or stronger ownership/Lock assertions. Use the coordinator's sole heavy window for bounded original-config tests; no full gates, dependency/configuration/assertion weakening, new platform feature, remote mutation, release or shared integration-lock change. Preserve exact source/commands/exits and redact ephemeral test-generated seed values in committed failure logs while retaining the original raw hash. Obtain fresh source review and release a bounded successor handoff.

### Clipboard generation 3 released

Published `13762896` and current `e077b1b1` both reproduced the same original missing-read fixture failure. Fixture-only repair `aeefe366cb89b9e571a521f18a0aa9b61fd92070` preserves warning/exact-copy/exact-clear assertions, models readable ownership, adds three actual-view no-clobber/read-denial cases, and passes 95/95 cases in nine complete files, zero skips, exit 0. Production code is unchanged. Fresh immutable-source review found no blocker; secret/whitespace checks passed. Sanitized failure logs, original/sanitized hashes, complete receipts and successor assignment are in `docs/privacy-release/evidence/clipboard-gen3.md` and `clipboard-gen3/evidence.json`. All execution stopped, the temporary published-baseline checkout was removed, and owned paths are released. Original combined gates remain open; no remote mutation.

## Clipboard remaining caller fixtures — generation 4

Worker `/root/clipboard_gen4`; branch `privacy/v1-clipboard-20261120`; base `17df2a8e651483c9e66ebccee38f57187d7eb374`. Owned paths: `apps/web/src/features/btc/BtcView.test.tsx`, `apps/web/src/features/tron/TronView.test.tsx`, a minimal shared test fixture only if needed, and `docs/privacy-release/evidence/clipboard-gen4*`. Reproduce the three original warning/Lock/retry clipboard cases before any repair and compare published `13762896` behavior. Preserve explicit warning and exact copy, readable ownership comparisons, asynchronous safe clearing, denied-write retry, no extra clear, newer contents and key/lock presentation. No unconditional cleanup or production change without a demonstrated defect and coordinator agreement. Use the released sole heavy window for bounded original-config complete files, then fresh immutable-source review and source-pinned sanitized evidence. No new client feature, dependency, configuration, assertion weakening, full-gate execution, remote mutation, main/shared integration-lock change, deployment or release. Existing incomplete qualification stays open.

### Clipboard generation 4 released

Published `13762896` and current `70c27ed8` each reproduced the same three original BTC/TRON missing-read fixture failures. Fixture-only repair `6a71c69caac9b6c31e26e45bcea0651dd29398e4` preserves warning, exact copy/clear counts and BTC activation-retry behavior, models readable ownership and adds six actual-view no-clobber/read-denial cases. Acceptance passed 137/137 in 13 complete files, zero skips, exit 0. Production code is unchanged. Fresh immutable-source review found no blocker; secret/whitespace checks passed. Five sanitized compressed logs, exact receipts and internal successor assignment are in `docs/privacy-release/evidence/clipboard-gen4.md` and `clipboard-gen4/evidence.json`. Temporary baseline checkout removed; all processes stopped and owned paths released. Full original combined qualification remains open; no remote mutation.

### Required privacy coordinator checkpoint released

Coordinator `/root` completed the source-pinned status, retained qualification failures and latest clipboard follow-through at report commit `e93d74763579b5441e8250defc05f43f57b5232b`. Final application/fixture sources are standalone v1 `bb9a97a1a85558ba8d1dbd0191d851d97d439fad` and cumulative v1.1 `17c14695548c1e5d8f661ca551cf9c9ecc538d14`; subsequent ancestry/documentation commits change no application contents. All nine released feature heads are preserved by ancestry in the cumulative candidate. Twenty-one coordinator logs were verified against recorded sanitized/compressed hashes, all new report links resolve, and committed-secret/full feature-range whitespace checks passed. Complete original qualification remains open: type/lint/build commands were terminated, the original coverage sequence is incomplete, and the attempted built-browser selection ran no tests because its required build exited 137. Original v1 nocov passed4/4 at573901ee; integrated301 and clipboard137 focused selections retain their own exact-source limits. Retention remains partial and translations remain draft. No active execution or source owner remains; paths are released for the next authorized qualification/retention work. The verified git bundle is the review handoff. Main, shared integration ownership, deployment and release remain unchanged; GitHub publication still awaits explicit approval after automatic review rejected the earlier push.

## Payment proof presentation retention — 2026-11-20

Worker `/root/retention_completion`; independent eligibility reviewer `/root/retention_completion/eligibility_review`. Branch `feature/ghostpay-retention-completion-20261120`, isolated worktree `GhostPay-retention`, exact base `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`. The canonical privacy ref was refreshed at task start; prior privacy source claims are explicitly released above. Current open-PR inspection found no separate retention writer. Root owns PR #307 and shared integration lease generation 8; neither is changed here.

Owned paths: `apps/web/src/lib/metadataRetention.ts` and its tests; `lib/useInvoicePreviewRetention.ts`; `components/MetadataRetentionControls.tsx` and its tests; the `PaymentProofQr` span in `components/PaymentRequestQr.tsx` and a dedicated proof-retention test; the stable proof-source prop in `views/Pay.tsx` and its corresponding actual-view regression; one control in `views/Settings.tsx`; additive `retention.proof.*` catalog and security-classification entries; this ownership entry, the bounded acceptance amendment in `docs/privacy-release/v11-04-retention.md`, the corresponding status row, and `docs/privacy-release/evidence/retention-proof-preview-20261120*`.

Acceptance: close only a deliberately shown included-payment proof QR/textarea, a regenerable projection of the independently retained Pay result/context/built transaction. Each Show and replacement source gets a fresh lifetime token; live QR/text/copy/download behavior is preserved without a stored receipt snapshot. Replaced source/session, stale plans, pending/unconfirmed/reverted/unknown results, failed explicit Show actions and unmount cannot authorize cleanup. A later live update may leave a disposable shown text projection even when its QR exceeds capacity. Reuse the bounded registry, revision-bound manual confirmation and active-view timer with a separate default-off proof preference. Existing invoice consent must not expand. Copy/download, exact hashes, payment phase, pending operations and every protected durable store remain unchanged. Original-configuration synthetic component and actual-Pay regressions must record exact source and actual outcomes. Broader persistent retention and all unexecuted release gates remain partial/open.

The independent source review rejected a redundant Sweep hash notice as insufficient completion value and confirmed this proof projection's positive nonessentialness proof. No transaction status, receipt or returned hash authorizes durable deletion. No storage deletion handles, sensitive persistent collection, network call, new dependency, contract/fee/custody change, release-gate change, shared-branch edit or remote publication is included. Root reviews the final diff before any draft-branch publication.

### Proof preview browser assertion extension

Before edits, worker `/root/retention_completion` additionally claims only the first native-payment test in `apps/web/e2e/flows.spec.ts`, based on reviewed runtime `e075ab049210e7d6788dd4e7f71d196d2bffef8a`. Preserve every original payment/fee/calldata assertion and extend that already included-result flow with explicit proof preview/cancel/confirm plus unchanged submitted state, exports, journal bytes and wallet send count. This is an authored browser regression; collection is not browser execution. The established local browser-launch restriction is not bypassed, and browser/full release gates remain open. Root retains shared integration and publication ownership.

### Original typecheck prerequisite and fixture follow-through

The original full web typecheck at `8bb5eff0` exited 2 without a resource failure: existing cross-workspace test imports needed the local `relayer-guard` declarations, and two inherited `Pay.test.tsx` role queries used the unsupported `exact` option. Both queries are present in canonical base `8c196d12`; their literal accessible-name matching is already exact in the installed Testing Library implementation. Worker `/root/retention_completion` claims only removal of those two unsupported options, preserving names and assertions, then the original compiler/lint and affected Pay regressions. Building the existing exact-source prerequisite changes no relayer source or service behavior. No assertion, type rule or release gate is weakened.

### Coordinator-authorized inherited lint prerequisite repair

At source `e8b8bd334d6829de3145d350bd7d682c3e771383`, worker `/root/retention_completion` additionally claims only the seven inherited diagnostics identified by the original full lint and independently diagnosed by `/root/integration_review`: the unused `Page` type import in `apps/web/e2e/flows.spec.ts`; two Storage method captures in `apps/web/src/AppShell.privacy.test.tsx`; the existing promise wait and mock-return narrowing in `components/MerchantTemplateIssuer.retention.test.tsx`; and the two optional event-property type declarations in `lib/wallet.ts`. Root explicitly authorized these bounded prerequisites before edits. Preserve dynamic Storage receivers, the real merchant operation/rejection assertions, captured provider method targets, `.call(provider, ...)` and listener identity. Wallet typing must emit identical runtime JavaScript; no lint suppression, assertion change or gate/config change is permitted. Record exact-source affected-file regressions, original full typecheck/lint outcomes and fresh independent diff approval before publication.

### Proof preview handoff and source release

Worker `/root/retention_completion` completed the bounded adapter at runtime `e075ab049210e7d6788dd4e7f71d196d2bffef8a`, with final prerequisite/fixture source `b9fd13815d6b3ece0f081dd14c5f3009ca13e12e` (tree `f2401beadec3a4ea4d511cde7a78c7e7d4b58ff8`). Controlled RED preceded runtime. Original feature/shared selections passed 139 distinct cases in nine complete files; the 86-case proof/Pay rerun and 78-case prerequisite selection are separate overlapping evidence, not additions to139. Final original full web typecheck and typed lint, committed-secret scan and source-range whitespace checks passed. Wallet event typing emits byte-identical JavaScript to the canonical base. Root and independent eligibility/prerequisite reviewers approved the respective frozen source deltas; no open blocking source finding remains.

Evidence and next bounded task: `docs/privacy-release/evidence/retention-proof-preview-20261120.md`. Browser assertions were authored and collected under full/lean configuration, not executed. Catalog entries have source-English coverage; translation review, persistent retention and full v1.1/build/browser/hosted/release gates remain open. The canonical privacy ref was refreshed and remained `8c196d12`; no existing matching feature branch or PR was found. Source paths and execution slot are released. Root retains integration ownership and final publication review; only a new isolated draft branch targeting the canonical v1.1 branch is authorized, preserving test-before-runtime history. No main/shared integration/PR #307/lease mutation, deployment or release is included.

## Retention preference focus reconciliation — 2026-11-20

Worker `/root/retention_next_r2`; branch `feature/ghostpay-retention-focus-20261120`; exact published base `a34ce43e296e302e3e65ed077ea8ac892c5189a1`, tree `b277d0b71b0b6d9242d2d36cdfcadc3b1296f5d3`. Parent authorized this bounded continuation after the persistent-store census still supplied no positive nonessentialness proof. Current `work/future-feature-coordination-20261120` claims were inspected and do not own these paths. The existing PR #326, canonical v1.1, main and shared integration refs remain parent-owned and unchanged.

Owned paths: the focus/event lifecycle in `apps/web/src/components/MetadataRetentionControls.tsx`; its existing test file; a matching real proof-preview regression in `components/PaymentProofQr.retention.test.tsx` only if necessary; this additive claim, the bounded acceptance amendment in `docs/privacy-release/v11-04-retention.md`, and `docs/privacy-release/evidence/retention-focus-20261120*`.

Acceptance: on focus, reread the current category's persisted preference even when another tab's storage notification was missed. Update the displayed effective policy and invalidate a confirmation captured under a different effective policy. An unchanged effective policy preserves a still-current manual plan. Denied/malformed reads remain effectively off; no focus event silently approves manual cleanup. Keep invoice/proof categories separate across prop changes, preserve persisted choice on real remount, and remove every owned focus listener on unmount. Existing presentation timers and callbacks retain their exact semantics; every persistent financial, recovery, trust and security store stays excluded. Record controlled RED/GREEN results before parent-owned full gates and independent source review. Dependencies may be reused because base and previous reviewed source have identical package, lockfile and TypeScript configuration bytes; no install or copy is included.

### Retention focus reconciliation released

Worker `/root/retention_next_r2` completed the bounded control lifecycle repair at `acd584f07e0636697f5ecc0067dafc52c262727d`, tree `db63b8cfbb47e44cc0063c91dd93fcb36f0fd009`. Controlled tests-only source `5961e0e9` reproduced nine expected failures with 24 controls passing. Independent source reviewer `/root/ci_triage_r2` approved the immutable runtime before GREEN; the five complete affected files then passed 51/51 with zero skips. Original full web TypeScript and typed lint passed sequentially at 1536 MiB, and the original secret scan and source-range whitespace check passed. Evidence: `docs/privacy-release/evidence/retention-focus-20261120.md` and its adjacent execution index and raw logs. Persistent retention and unexecuted broader v1.1/browser/hosted/release gates remain open. No active test/build process remains; source ownership and the heavy-process slot are released. Parent owns isolated draft publication and integration; no existing remote ref or PR was changed here.


## Devnet wallet disclosure acceptance repair — 2026-11-20

Worker: `/root/retention_hosted_r2`, delegated by the consolidation coordinator.
Branch: `fix/ghostpay-devnet-wallet-consent-20261120-r2`; base: frozen PR #327 `9608ec996fb159f11b84b9baec0b48033a48a6a5`, on #326 and required-v1.1.
Owned paths: `apps/web/e2e/devnet/ui.ts`, `apps/web/e2e/devnet-journey.spec.ts`, `apps/web/e2e/pages-devnet.spec.ts`, this additive claim, and new `docs/consolidation/devnet-wallet-consent-r2-20261120/` evidence.
Acceptance: repair inherited acceptance drivers that click Connect and then wait for Prepare payment without approving the existing account-disclosure dialog. Reuse the established method-specific approval helper for deliberate account, chain-switch and transaction decisions. Preserve every original chain, journal, balance, duplicate, refusal and privacy assertion; never auto-approve unexpected requests. Preserve source runtime, dependencies, workflows and all frozen source branches.
Evidence: #326 hosted Pages job `136457928140` and beta job `136457926770`, associated head `a34ce43e296e302e3e65ed077ea8ac892c5189a1`, actually tested merge `adbcec37c3f589e9b1a0cc6ee419193ce90d355e`. Pages had 6 passed, 5 failed and 5 not run; beta library and CLI stages passed, browser stage failed all 3 cases. Seven failures wait for Prepare payment after Connect; one waits for a wrong-chain error before approving the account/switch request. Source equivalence establishes inherited drivers, not executed base qualification.
Validation: inspect exact request ordering and use original web typecheck/lint plus static full/lean collection only if matching dependencies exist. No browser/socket execution, dependency installation/copy, assertion relaxation or gate change. Full hosted acceptance remains required after publication.


### Devnet wallet disclosure repair completion checkpoint — 2026-11-20

Source is frozen at `420df3b55be2a4207950f312d2b0bd5b899602e2`, tree `c47596d02196c1d2cb38040a2f52fe24bd4d3081`. The coordinator independently approved the complete three-file E2E-only patch. Original full web typecheck and lint passed after restoring one missing own-worktree test dependency link; the first TypeScript failure remains in the evidence. Dedicated static collection found 3 devnet cases and 16 Pages cases; default full/lean collection found 136/126 cases. These are discovery counts, not browser passes.
The coordinator explicitly extended the initial no-install boundary after reviewing cached exact-lock tarballs and disk space, authorizing one offline selected web/root/tooling extraction with scripts disabled and no network fallback. It passed with unchanged manifests/lockfile; own workspace source/output provenance is recorded. No other worktree dependencies were removed or reused with mismatched versions.
Final handoff and 28 lossless original artifacts are under `docs/consolidation/devnet-wallet-consent-r2-20261120/`. No browser, server, anvil or RPC was started locally. Original hosted failures remain preserved; actual hosted acceptance of the corrected published tree and all other applicable gates remain required. Root owns publication and integration.


## Current-wallet privacy acceptance fixtures — 2026-11-20 (Pacific)

Worker: `/root/privacy_fixture_repair`, delegated by `9a4ab6c3d117-root`.
Branch: `test/ghostpay-privacy-fixtures-20261120-9a4ab6`. Exact base: existing
PR #336 `410353a23631234aa888e46f38df22291c699a26`; refreshed live head unchanged.
Owned writes: `apps/web/src/components/SharedComponents.i18n.test.tsx`, the reviewed
reference count in `docs/privacy/network-egress-inventory.json`, and only if an
assertion-preserving setup is established, the post-reload spans in
`apps/web/e2e/{devnet-journey,pages-devnet}.spec.ts`. Evidence prefix:
`docs/consolidation/autonomous-20261120-9a4ab6/PRIVACY_FIXTURE_*`. Existing #336
remains authoritative. Runtime, privacy/disclosure policy, signing, journal
retention, focus/cancellation tests, dependencies, configuration and gates are
read-only. Preserve original locale/hash/duplicate/refusal/no-send/outcome
assertions; provide current account/chain context; independently review the added
network reference before updating its count; run original affected gates and
report unavailable environments. No baseline reproduction, live financial action,
remote write, shared-ref or lease mutation. Root independently reviews and owns
publication. The frozen 111-PR path inventory and newer #345–#347 were inspected;
existing broader owners retain their claims. This is a narrow stacked correction.


### Privacy fixture correction completed

Corrective source `a02d640b7f847c006526d561467db9f348910d5a` changes exactly two
lines: the locale fixture supplies its existing wallet scope; the independently
reviewed Pay reference count changes 6 to 7 while three calls remain. Twenty tests
in two complete affected component files and all six original inventory checks
passed with zero skips/retries. Root independently approved the complete source
diff and account/chain/reference semantics. Production code, every assertion and
all gates remain unchanged. Matching-cache provenance and lossless results are in
`PRIVACY_FIXTURE_REPAIR.md` and adjacent records. Browser files were not modified
because required Anvil/Forge executables are unavailable; their acceptance and
other privacy failures remain open. Full-web and changed-head compiler/typed-lint
qualification are unclaimed. No heavy process remains; paths are released to root
for stacked draft publication into existing #336.

---

## 2026-11-21 — Wallet attempt journal reconnection E2E gate

- Worker: single connected GitHub assistant; branch `test/ghostpay-wallet-attempt-reveal-after-reconnect-20261121`, parent PR #348 head `26b45165c1d6de9e23f5b943ed46f3aa0908f45c`, main at discovery `aec179910c39081d820396409ff3139ff2264132`.
- Owned E2E tests: `apps/web/e2e/pages-devnet.spec.ts`, `apps/web/e2e/devnet-journey.spec.ts`; handoff `docs/handoffs/WALLET_JOURNAL_RECONNECT_BROWSER_20261121.md`. Ownership recorded first in this handoff at `84e9e3e5eeffe79cda7ebf9ab094ca86d4cfcd42`, before test edits.
- Evidence: failed exact-head Pages run 44844067142 and Beta acceptance run 44844067221 on #348; journal correctly hides saved payment hash after reload without account+chain. Baseline E2E asserts hash visible before renewed wallet consent, which violates current privacy behavior.
- Acceptance: before reconnect assert hash concealed while tab journal retained; after explicit wallet disclosure assert hash reappears; preserve no-double-send/nonce assertions. No runtime changes, hosted dependencies, fees, custody, RPC, deployment or main merge. Parent #348 and #336 must requalify after this stacked fix.
- Test source commits: `5960979d35b82232a61a41248a3c47bad7e3f664` and `9002a10bb36d054edb2db26a6fc06b7acc4c4a53`. Hosted checks pending, no local repo tests executed (container lacks GitHub network).
# Privacy browser lifecycle qualification — 2026-11-20 (Pacific)

Worker: `539818ee134f-root`, with independent `privacy_browser_triage` source/log
review and a fresh resulting-change review before publication.
Branch: `repair/ghostpay-privacy-browser-lifecycle-20261121-539818`.
Base: PR #352 `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94`, preserving the
#348 / #336 / #327 / #326 privacy stack and the two newer journal-reconnection
browser corrections. Current main: `aec179910c39081d820396409ff3139ff2264132`.
Owned source/test paths: `apps/web/src/components/WalletDisclosure.tsx`, its
existing `WalletDisclosure.test.tsx`, and the specific keyboard-navigation and
changed-wallet refusal cases in `apps/web/e2e/{app,flows}.spec.ts`. Also owns
additive evidence under `docs/consolidation/privacy-browser-20261121-539818/`
and this registry entry. Prior presenter ownership is released; current #348
and #352 edits are outside this scoped correction.
Acceptance: reproduce unusable opener focus restoration using the real presenter;
preserve successful opener restoration and replacement-dialog focus ownership;
keep the native quick-hide assertion unchanged. Reconcile keyboard traversal
with the existing header privacy switch and wallet-change cancellation with the
existing immediate invalidation contract, retaining all zero-send, transaction
and journal assertions. Run original-config focused regressions, relevant source
checks and native full/lean browser checks where the environment permits.
Record every failed, blocked or unexecuted check. Do not change runtime payment,
wallet consent, privacy masking, custody, dependencies, thresholds or timeouts.
The shared integration record remains held by its existing generation-11 owner;
this branch does not acquire or override it. No shared-target update, release,
deployment, real transaction or source-branch deletion is included.

Evidence extension: preserve the independent `scan_fix_review` qualification of
unchanged PR #350 `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` in the scoped
report directory. Its separate review branch and 35-test execution remain pinned
to that source; no Scan implementation is copied into this privacy branch.

---

# Spec 18 interoperability acceptance recovery — 2026-11-20 (Pacific)

Worker: `/root/r2_spec18_recovery`; coordinator: `539818ee134f-root`.
Branch: `integrate/ghostpay-export-recovery-acceptance-20261121-539818`.
Exact base: #355 `0fb2831a1b89430c69896f6db57306cd5518e55f`, which retains
canonical #354 runtime/browser fixes and the reconciled quick-hide regressions.
Donor: #346 `37760c3655c48fa190c0f2324072cb506cf1b88d`; exact test blob
`48322f29d828f3fbdf4645c39a461e4044635a52`.
Owned scope: new `apps/web/src/lib/paymentKeyExport.interop.test.ts`, this additive
claim, and `docs/consolidation/export-recovery-r2-20261121-539818/` only.
Acceptance: recover the exact donor test without reauthoring it; retain existing
runtime, assertions, KDF parameters, timeouts, scripts and configuration; verify
support source and dependency/build provenance; run the complete interop file
and relevant complete existing export/codec/recovery files sequentially with one
worker and bounded heap. Preserve complete outputs and every failed/blocked
invocation. No full coverage, browser, physical-device or spend result is inferred
from focused tests. #355 hosted CI is incomplete at assignment; the eventual
published source and composition still require applicable gates and review.
Existing broad Spec 18 and donor ownership remain authoritative. Original donor
branches, shared refs, integration lease, release and deployment are untouched.
Root owns fresh independent review and publication. No installs or remote writes
are authorized for this worker. The original claim-only local attempt was lost
in the workspace reset after disk exhaustion; no test was copied or executed in
that attempt. This restored branch starts from the same published parent.

---

# Recovery composition privacy repair — 2026-11-21

Worker: `/root/recovery_integration`; reviewer:
`/root/recovery_integration/privacy_source_review`; coordinator: `/root`.
Isolated local repair branch: `fix/recovery-composition-bulk-evidence-20261121`.
Frozen source parent: `1b24404fe045c512212c417b692246b4e8fb2814`.
Owned product paths: `apps/web/src/lib/scanClient.ts`, a new adjacent empty-bulk
evidence regression, and `packages/cli/src/receipt-parity.test.ts` only.
The first change fixes an independently reproduced ownership-dependent RPC
fallback when bulk evidence has no eligible transaction hashes. Missing proof
must stay unverified, without individual reads on either selected provider.
The CLI path recovers the existing #361 test-only optional-address correction;
no CLI runtime, contract or relayer implementation is imported.
The main local composition remains frozen during its running baseline checks.
All 70 dependency manifests/lockfile inputs match it exactly; shared library
sources are unchanged since the successful build. Reuse only those verified
installed dependencies and built libraries. Preserve source provenance, failure
logs and original assertions. No remote refs, locks, deployments or real-funds
operations belong to this worker. Root owns publication and final qualification.

Scope extension assigned by root after the above correction was independently
verified: recover PR #328 source `81598d93dd82cc440526c866d42b55be0657895b`,
runtime commit `f7bc60a1b704392e70fe5918766f70a4ab53fb78` and regression commit
`68c77b7f9f108d54de0dd1592f432bb27603838e`, in
`packages/ux-vault/src/vault.ts` and `vault.rekey-lock.test.ts` only. The guard
prevents an asynchronous password replacement from restoring locked authority.
Before changing this shared library, unlink the verified dependency/build reuse
symlinks for its output and install an independent exact-lock dependency tree;
do not write through symlinks into the still-running baseline worktree. Build
the changed library locally and rerun vault/portable recovery checks. The
original PR and all historical source refs remain untouched.

Additional bounded recovery from residual branch review: own the six files
`packages/hygiene/src/{fixtures.testutil.ts,verify.evidence-boundary.test.ts,verify.test.ts,verify.ts,ledger.browser-chains.test.ts,ledger.ts}`.
Recover exact source `0e19ccc7d52b0d160fb756089e6a843a1d2831d7`, which composes
PR #339 evidence binding/deduplication, #347 typed-lint correction, and #341
browser-testnet destination ledger support. Keep the narrower RPC helper
allowlist, independent finality limitations and all existing assertions.
The residual reviewer independently owns source comparison; this worker owns
selective recovery, package rebuild and executable qualification. No package,
contract, relayer or service dependency change is included.

## Settings partial-import reconciliation repair — 2026-11-21

Worker `/root/recovery_integration` owns `apps/web/src/views/Settings.tsx` and
`Settings.partialImportDrafts.test.tsx` on isolated branch
`fix/recovery-settings-drafts-20261121`, based on frozen
`b85e8160fbc1bc4b69b8652595a8adfd2defd927`. Fresh independent remaining-source
review reproduced both existing #353/#356 regressions from test donor
`82ab06f1bb6fc4b9df2b4ac87679a4029987a284`: a saved-settings effect overwrites
unselected unsaved fields after a partial import. Recover the exact test and
reconcile only changed saved fields while preserving explicit import selection,
immediate privacy preferences, session-only endpoint drafts, and unconditional
RPC-test authority cancellation. Use a fresh independent dependency installation
and copied, input-matched shared-library outputs. No shared dependency symlink,
original worktree source, native-browser child configuration, integration lock
or remote ref may be changed. Preserve the running b85 aggregate checks as a
separate source snapshot; the reviewer must verify the corrected head.

Root-approved extension after the remaining reviewer reproduced PR #244's
optional Bitcoin provider-consent leak: this worker also owns
`apps/web/src/features/btc/BtcView.tsx` and `BtcView.endpointConsent.test.tsx`.
Recover only source-change revocation of the optional provider-check choice
and the matching regression from donor
`981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`. Preserve the current disclosed,
mandatory light-scan checks; the donor's older separate-light-checkbox model
is explicitly not adopted. No policy or native-browser qualification paths
are included. Add `apps/web/src/views/Settings.savedReconciliation.test.tsx`
for focused retention and stale-test regressions without changing the exact
recovered partial-import test. The independent reviewer owns final source
review and unchanged-assertion reruns on the committed repair head.
