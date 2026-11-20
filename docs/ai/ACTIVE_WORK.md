# Final QR flag-coverage reconciliation — cycle 20261120T0035Z

- Worker: native ChatGPT `/root/spec_verification_review`, delegated by coordinator `/root`.
- Branch: `automation/20261120T0035Z/worker/qr-flag-coverage`; exact refreshed base PR #290 `ec546311f994fe1db544fe85ff2aa6db428d67d4`.
- Owned paths: `apps/web/src/lib/qrKinds.test.ts`, `docs/handoffs/QR_FLAG_COVERAGE_20261120.md`, and this additive claim only.
- Reconciliation: #290 has absorbed the hostile-getter cases, explicit error-class assertions and original sixteen-mapping controls. Preserve all of those tests and its production/design files. Retain only the still-missing stateful unverified case and replace the existing mapping block with a complete typed Record and all eight flag combinations.
- Acceptance: one added test and one strengthened existing test, repository Vitest and scoped lint on the exact new source, independent review, and an accurate final handoff. No duplicate implementation or repeated generic matrix.
- Dependencies: the earlier supplement's dependencies/build prerequisites remain applicable because #290 changed only this test file since `aaa8a7e2`; preserve previous branch `automation/20261120T0035Z/worker/qr-review-supplement` at `0c3893db` as historical evidence. Prior results do not qualify this new source without a fresh run.
- Restrictions: no production, design, dependency, workflow, security-gate, shared integration, lock, deployment or remote changes. This is the final bounded scope; coordinator owns publication and final hosted qualification.

---
# Independent final Sweep authority review — 2026-11-20 UTC

Worker: `/root/custody_transaction_audit`, delegated independent reviewer.
Branch: `review/ghostpay-sweep-boundary-20261120`.
Base: canonical PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`.
Owned writes: new reviewer-only `apps/web/src/lib/sweep.boundaryAudit.test.ts`, this additive claim, and
`docs/engineering-handoffs/remediation-20261120/custody-audit/`.
Acceptance: execute the existing Sweep authority tests and independently exercise the real network authorization/RPC
client plus actual cryptographic signing across session revocation, delayed deadline checks, and the final handoff.
Tests use offline synthetic JSON-RPC responses; they are not a browser, development-chain, or external-testnet qualification.
No product, dependency, workflow, fee, contract, gate, remote-ref, deployment or shared-ledger mutations.
The other coordinator owns the invoice-replacement browser failure and merchant-ledger correction.

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


## Release remediation: Pages artifact promotion gate — 2026-11-19

Worker: `/root` in workspace `a7189299ede1`, separate from the continuous integration coordinator in `0a7bc3583588`.
Branch: `fix/ghostpay-pages-integrity-gate-20261120`.
Base: canonical PR #278, `d74af79ebabdc8cead843361c3497b46d8c421f9`; live main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned paths: `scripts/pages/build-pages.sh`, new `scripts/pages/build-pages-artifact-gate.test.mjs`, and `docs/engineering-handoffs/remediation-20261120/` coordinator evidence only. Independent reviewer owns its own child evidence directory.
Scope: execute the existing independent artifact verifier against the completed site, trusted build-generated SHA256SUMS, and exact expected source before promoting the site/evidence to final output. Preserve the verifier's trust assumptions and all release policies.
Acceptance: failing regression on original builder; successful fresh 16-file artifact; tampered/missing/extra/symlink/ambiguous/wrong-source artifacts fail before promotion; original Pages tooling gates pass; independent adversarial review and exact-source qualification. No test threshold, runtime feature, privileged attestation job, signing key or deployment-policy changes.
Coordination: the other active coordinator owns the renewed preflight browser observation repair and merchant-ledger zero-payment recovery. Those paths and shared integration refs are not modified here. The metadata lease remains separate and must be reacquired with current ownership before shared integration.

# 2026-11-20 — Independent live CI and CodeQL finding reconciliation

Worker: `/root/live_ci_audit`, delegated by remediation coordinator in workspace `a7189299ede1`.
Branch: `review/ghostpay-ci-audit-20261120`; base PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`.
Owned writes: this additive claim and `docs/engineering-handoffs/remediation-20261120/ci-audit/` only.
Acceptance: retrieve exact-source run/job evidence, classify the current failures, independently inspect both current CodeQL annotations and execute their unchanged fixture tests, preserve raw public API responses, source hashes, commands and limitations. Distinguish analyzer alerts from demonstrated product vulnerabilities and fixture false positives. No alert suppression, dismissal, source change, dependency change, workflow mutation, remote write, deployment or release approval.
Coordination: the earlier continuous coordinator owns the active invoice-replacement browser observation repair and merchant-ledger correction in separate `0a7bc3583588` worktrees. This audit does not duplicate either implementation. The remediation coordinator owns Pages artifact gate integration; the independent artifact reviewer owns its verification.

Coordinator-authorized follow-up: this worker additionally owns exactly `packages/chain-adapters/src/deployments.test.ts` and `scripts/tests/privacy-csp-bundle.test.mjs` to express the two intentionally malformed fixed fixtures directly. Preserve byte-for-byte generated inputs and every existing assertion, run the unchanged fixture suites before and after, record independent equivalence evidence, and obtain a separate source review plus fresh hosted CodeQL. This is test-fixture clarification, not a demonstrated runtime vulnerability repair or an alert dismissal. All production, workflow and analyzer-policy files remain outside this claim.

# Independent artifact security review — 2026-11-19 Vancouver

Worker: `/root/artifact_security_review`; branch `review/ghostpay-artifact-remediation-20261120`.
Base: canonical PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`.
Owned writes: this additive claim and `docs/engineering-handoffs/remediation-20261120/artifact-review/` only.
Acceptance: execute current verifier tests, independently challenge manifest/file/source identity assumptions, verify a fresh payments-disabled artifact when the coordinator's dependencies are prepared, and preserve exact evidence.
Boundaries: read-only product, tests and workflows until an independently observed defect is reported and scoped with the coordinator. No remote mutation, integration, release-policy change, signing, deployment or funds.

Additional coordinator-authorized independent review: exact CodeQL fixture correction `008ccdcf05b703cea51ffc4fdaa42fc279281d81`. Read-only source inspection, AST-derived byte-equivalence proof and original focused test replay; no production or test changes authored by this reviewer. Review and evidence remain in the owned artifact-review directory.

## Independent final remediation review — 2026-11-19

Worker: `/root/final_independent_review`, fresh reviewer of the bounded release-remediation cycle.
Branch: `review/ghostpay-final-remediation-20261120`.
Initial review base: `3814ad2efffc6588f1c176a39b1090033f2f3537` (new Sweep authority tests on PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`).
Owned paths: this additive claim and `docs/engineering-handoffs/remediation-20261120/final-review/` only.
Scope: independently review the added Sweep authority tests, Pages artifact promotion gate and exact CodeQL fixture clarification, then inspect the coordinator's frozen combined source and qualification evidence. Production, existing test sources, workflow policy and shared tracking remain owned by their implementers.
Acceptance: confirm source identities, perform meaningful focused execution, identify differences between tested behavior and release claims, and provide exactly one release-readiness verdict with precise remaining requirements. No remote mutation, shared integration, deployment, release or security-gate waiver.

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


# Completion and consolidation cycle — 2026-11-20

Worker: /root coordinator; independent code, security, feature and successor bug-hunt workers use dedicated worktrees.
Branch: integration/ghostpay-completion-20261120.
Base: 417f7c71daf8645e1432f2ec8f070110879b80bd (PR #278); main observed c977b5d6723f6822c3b5d86cd6b231712c53c395.
Owned writes: additive ownership/handoff records under docs/engineering-handoffs/completion-20261120, scoped integration of demonstrably missing #290/#295, #294, #298 and independently verified #292 fixes, plus regression-backed conflict repairs.
Acceptance: inspect live refs, exact changed blobs and existing implementations; retain attribution; independently review source; run original relevant tests, typecheck, lint, static build and hosted gates where available. Preserve all failing outcomes and explicit qualification limits.
Existing local clipboard, masking, wallet and catalog branches are advancing in a separate active run; freeze-only review is allowed, but do not mutate or duplicate their work. The new-feature worker will choose a nonoverlapping static browser feature on a separate branch.
No deployment, release, real funds, fees, contract changes, gate suppression, branch deletion or force push. This isolated candidate does not own the shared integration lease.

# Bounded continuation 20261120T003500Z — QR runtime keys and qualification

Worker: ChatGPT native coordinator `/root`, workspace `fc8b0b472d30`.
Independent native workers: `/root/base64_review`, `/root/qr_security_review`,
and `/root/ci_reconcile`; maximum concurrency is four including the coordinator.
Branch: `automation/20261120T003500Z/coordinator/qr-runtime-qualification`.
Exact base: published PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`;
observed main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.

Owned implementation: `apps/web/src/lib/qrKinds.ts` and `qrKinds.test.ts`.
Owned documentation: this additive claim, `docs/design/qr-colors.md`, and the
cycle-specific evidence under `docs/engineering-handoffs/continuous-20261119/`.
Canonical handoff/ledger updates are proposals on this isolated branch only.
No ownership of the existing release branch, browser follow-up, merchant-ledger,
dependency, contract, or other source-owner work is claimed.

Independent review confirmed that PR #285's own-key check still coerces array,
boxed-string, and object keys. A stateful conversion can select different keys
between validation and lookup. This is a low-severity API correctness defect;
no reachable external-input exploit has been demonstrated.
Acceptance: first reproduce failures through repository Vitest, reject every
non-primitive-string payload/frame kind with the existing TypeError messages,
never invoke conversion hooks, and preserve declared mappings, flags, warnings,
print rules, and frame UI behavior. Run focused regression/component checks,
applicable typecheck/lint/build and obtain separate exact-source review.

Dependencies and reconciliation: #285's production/test blobs already exist in
#278; #289's production blob also exists there and its unused test parameter is
already removed. Do not duplicate those repairs. Recheck upstream heads and
active local follow-ups before publication. Invoice-schema verification belongs
to the separate reviewer; those production/test files remain unchanged here.
Expected checks include base64url Vitest, invoice package qualification, QR
taxonomy/frame/classification tests, web typecheck/lint and static build checks.

Integration lock observed at `d6839d7c48edf5e71ddd35d3e87446b69c196b04`,
released generation 4. This cycle has not acquired or modified it. Any shared
integration requires a fresh valid lease and all other gates; isolated review
work may proceed. No deployment, release, funds, paid agents, workflow changes,
force-pushes, or security-gate waiver is authorized.

# Rejected QR fragment idle deadline — 2026-11-19

Worker: ChatGPT root, workspace `c374725a11b7`, with independent native reviewers.
Branch: `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7`.
Base: PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`, tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`.
Owned paths: `packages/qr-exchange/src/assembler.ts`, `packages/qr-exchange/src/assembler.test.ts`, this additive claim, and `docs/handoffs/qr-conflict-expiry-20261119/`.
Scope: rejected CRC-valid conflicting chunks must not refresh an incomplete transfer's idle deadline. The documented unchanged-state contract includes the expiry clock; accepted identical duplicates retain their existing refresh behavior.
Acceptance: deterministic regression fails against the unchanged base and passes after the minimal repair; confirm mismatch/malformed rejection, exact expiry boundary, accepted duplicate refresh, completion and reset controls; run the original package coverage suite, typecheck, build and lint without modifying configuration or thresholds; obtain an independent review and preserve source-pinned evidence.
Impact boundary: this is shared API contract correctness. The current browser importer already resets on `CHUNK_CONFLICT`; no browser exploit, integrity bypass or fund impact is asserted.
Ownership check: current #278 source and open ownership records were checked before edits. Preflight-observation, merchant-ledger recovery, Pages build tooling and CodeQL fixtures remain owned by other active workers. The shared integration lease is held by the separate coordinator; this worker will publish only an isolated branch/draft and will not update the shared candidate, merge main, deploy, change contracts/fees/dependencies/gates, or create automation.
## Cycle 20261120T0115Z — transaction receipt hash validation

- Worker: native ChatGPT `/root/spec_verification_review`, explicitly assigned by the coordinator; independent review remains with `/root/final_checkpoint_review`.
- Branch: `automation/20261120T0115Z/worker/receipt-hash-validation`.
- Exact base: PR #278 `417f7c71daf8645e1432f2ec8f070110879b80bd`. Existing #278 ownership and all earlier claims are preserved; this isolated follow-up does not edit its remote branch.
- Owned implementation: `apps/web/src/lib/wallet.ts` and `wallet.test.ts`. Compatibility-only scope: receipt-return fixtures in `apps/web/src/lib/payExec.acceptance.test.ts`, `apps/web/src/views/Pay.test.tsx`, and `apps/web/e2e/flowMocks.ts`, plus any directly affected receipt fixture demonstrated by focused tests. Preserve every existing assertion. Owned evidence: this additive claim and `docs/handoffs/RECEIPT_HASH_VALIDATION_20261120.md`.
- Confirmed baseline: `pollReceipt` accepts an otherwise valid receipt for a different transaction hash. The `submitTx` consumer can then associate that unrelated receipt status with a separately verified submitted transaction. This is receipt correlation correctness, not a new finality or trustless-RPC claim.
- Acceptance: commit and execute regressions against unchanged runtime for different, missing, non-string and malformed receipt hashes; require the existing fixed unexpected-receipt error for malformed fields and `SubmissionMismatchError('hash')` for a valid different hash. Preserve matching success/revert, case-insensitive hexadecimal identity, null/pending retries, destination checks, post-broadcast hash preservation and existing confirmation policy. Do not coerce untrusted hash values.
- Expected checks: actual repository Vitest wallet regressions and applicable payment consumers; scoped typed ESLint; applicable TypeScript check; independent exact-source review and test rerun. Report fixture repairs and unavailable browser/build/hosted gates explicitly. Root controls dependency setup, publication and qualification.
- Boundaries: no cryptographic, transaction construction, fee, contract, storage, dependency, workflow, release-gate, deployment, real-funds, external-schedule or shared-ref changes. No integration lock is claimed and no merge is attempted. Other active QR, clipboard, QR-expiry and Pages-artifact lanes remain untouched.

- Scope addendum before implementation: coordinator explicitly authorized one regression in `apps/web/src/lib/payExec.test.ts` to prove that a mismatched receipt preserves the original post-broadcast hash and prevents an automatic or duplicate resend. The three incomplete receipt fixtures in that file are also owned for `transactionHash`-only repairs. No existing assertion is weakened.

- Completion: frozen product/test `d08b8ec3ea3cb01c40e1de2ab4998a1c6f546c67` (published tree-identical counterpart `a221a9d5199bde11e45e1bc822e7305f4fe01bb9`) passes author180-test GREEN, original full web TypeScript and scoped typed lint; independent reviewer `/root/final_checkpoint_review` reproduced19-failure RED and180-test GREEN with no blocking scoped finding. Coordinator payments-disabled Pages build and16-file checksum/commit reverify pass. Full hosted/browser/coverage/integration gates remain separate. Source and failure transcripts: `docs/handoffs/RECEIPT_HASH_VALIDATION_20261120.md`. Runtime scope is frozen; root owns publication and integration.
## Scoped remediation baseline refresh — 2026-11-20 UTC

Worker: `/root` in workspace `a7189299ede1`; local branch `integration/ghostpay-remediation-successor-20261120`, publishing only to owned PR #292 branch `fix/ghostpay-pages-integrity-gate-20261120`.
Inputs: frozen scoped head `814950a1cf99e68765b85f241e6f4a0fc55ea9c6` and published canonical successor `417f7c71daf8645e1432f2ec8f070110879b80bd`; live main remains `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Owned operation: merge the published canonical baseline into this existing scoped PR; resolve only additive ownership-log conflicts and preserve both parents plus every source/test/config blob. No new production implementation, QR extraction, assertion, gate, fee or policy change.
Acceptance: independent input compatibility and final combined-source review, focused affected checks, then one expected-head non-force update and fresh exact-source hosted qualification. Preserve old artifact evidence at its actual source; do not relabel it as combined-source qualification. Keep subsequent receipts off the frozen PR head.
Coordination: generation5 canonical lease explicitly released at `2026-11-20T01:00:43Z`; this operation does not acquire or update the shared canonical ref, main, integration lock, deployment or release.
## 2026-11-20 — Code audit generation 1

Worker: `/root/code_audit_gen1`.
Branch: `audit/ghostpay-code-gen1-20261120`; base `417f7c71daf8645e1432f2ec8f070110879b80bd` (PR #278).
Owned paths: this additive claim and `docs/engineering-handoffs/continuous-20261120/code-audit-gen1/` initially. Source fixes require coordinator path coordination first.
Acceptance: compare the current source/test semantics of PRs #298, #297/#293, #295/#290/#285 and #294 with the pinned consolidation baseline; preserve and inventory relevant unpushed privacy branches without mutating them; independently review receipt/QR boundary correctness and repository/spec conformity; preserve evidence, actual test results and a fresh-successor handoff. No remote mutations, deployment, contracts, fees, workflow/gate weakening, or shared-branch edits.

Audit probe scope: temporary `apps/web/src/lib/wallet.receiptStatusAudit.test.ts` on this isolated worktree only, archived under the owned evidence directory and removed after execution. No production edit is authorized by this claim. Reproduce unrecognized numeric receipt statuses against baseline #278 and exact #298 wallet source; preserve valid success/failure and absent receipt controls. Dependencies are a private reflink copy of the existing locked installation; the two lockfile SHA-256 values match. Rebuild required local library outputs before running the original Vitest configuration.

## 2026-11-20 — Fresh security audit generation 1

Worker: `/root/security_audit_gen1`.
Branch: `audit/ghostpay-security-gen1-20261120`.
Base: `936d054ed067d89c773310d42e33939c1129bbfa` (PR #292, containing canonical #278 `417f7c71daf8645e1432f2ec8f070110879b80bd`).
Owned writes: this additive claim and `docs/engineering-handoffs/security-gen1-20261120/`; any runtime/test edit requires a distinct scoped claim and coordination before implementation.
Acceptance: independently identify current CodeQL annotations using live authenticated/public repository interfaces; inspect #292 artifact-promotion and adversarial-fixture boundaries; run original relevant verifier/promotion/CSP tests; investigate a distinct runtime authorization/privacy boundary and report only reproducible findings. Preserve exact source identities, actual results and uncertainty.
Boundaries: no remote writes, deployment, fee/contract changes, alert dismissal, analyzer suppression, security gate weakening, or mutation of another worker's source.

Security generation 1 temporary probe extension: `apps/web/src/lib/wallet.securitygen1.test.ts` is owned only for an isolated runtime probe of `pollReceipt` destination/status shape. No production file changes; preserve the probe as evidence and remove it from the test tree after execution. The root coordinator was notified of wallet.ts overlap with #298; any implementation belongs to a separately coordinated repair after consolidation.

Security generation 1 completed its bounded review: live CodeQL annotation identities resolved; #292 five-path review found no blocking scoped issue; 73 original artifact/CSP tests and 13 original deployment-manifest tests passed. Fixture equivalence is exact. Secret-export inspection is source-only; optional full library build stopped at the coordinator's freeze. The unexecuted receipt probe is evidence only and was removed from the application test tree. Handoff: `docs/engineering-handoffs/security-gen1-20261120/README.md`.


# Fresh generation 2 receipt-status bug hunt — 2026-11-20

Worker: /root/bug_hunt_gen2.
Branch: fix/ghostpay-receipt-status-20261120.
Base: 9e062b7150e74d1b20e34b0f120add660d9ef02e, the coordinator's isolated combined candidate.
Owned paths: apps/web/src/lib/wallet.ts, apps/web/src/lib/wallet.test.ts, apps/web/src/lib/payExec.test.ts, this additive claim, and docs/engineering-handoffs/completion-20261120/receipt-status/.
Acceptance: reproduce unsupported EIP-658 receipt statuses without claiming a revert, preserve valid zero/one, hash correlation, null-pending and legacy destination semantics, then verify the submitted transaction hash/journal remain authoritative and resend stays blocked. Run original focused suites, scoped typed lint and typecheck where executable; record infrastructure failures separately. Independent source review and exact-source hosted qualification remain required.
Boundaries: no remote/shared-branch changes, fees, contracts, deployment, gate changes or mutation of the concurrently active original privacy branches. Root owns integration.

Adjacent audit scope: temporarily collect apps/web/src/lib/wallet.transactionShapeAudit.test.ts to check JSON array coercion at verifySubmission. Archive the exact probe under the owned receipt-status evidence directory and remove it from active collection afterward; no extra production change is part of the frozen receipt-status fix.


## 2026-11-20 — Fresh transaction-field security review generation 4

Reviewer: `/root/final_security_gen4`.
Branch: `review/ghostpay-transaction-shapes-gen4-20261120`.
Initial base: `fa5d4b143c7459c99a201433e661f6650b957e3e`, preserving the separately reviewed receipt-status source `f77fe8572f54669098ee8cb5d47a6313ef72e37b`.
Owned writes: this additive claim and `docs/engineering-handoffs/security-review-gen4-20261120/`; temporary independent probes require a scoped addendum and must be archived outside active collection afterward. No production source changes are owned.
Acceptance: independently inspect the frozen transaction hash/input/data primitive-string repair and its original-config regressions; preserve nullish fallback, valid case normalization, safe errors, existing receipt guards and post-broadcast journal/no-resend semantics. Recheck the coordinator's final integrated product blobs and unchanged workflow/contract/fee/activation controls when supplied. Run only the assigned bounded independent test window, preserving exact source identities and all incomplete/resource-failure outcomes.
Boundaries: no remote writes, shared-branch mutation, deployments/releases, fee/contract changes, security-gate suppression, lost prior work or whole-product security certification. Prior partial Pay UI runs remain incomplete and are not aggregated.
# Fresh generation 3 transaction-field shape repair — 2026-11-20

Worker: /root/bug_hunt_gen3.
Branch: fix/ghostpay-transaction-field-shapes-20261120.
Base: fa5d4b143c7459c99a201433e661f6650b957e3e; predecessor's status repair runtime f77fe8572f54669098ee8cb5d47a6313ef72e37b remains preserved.
Owned paths: apps/web/src/lib/wallet.ts, apps/web/src/lib/wallet.test.ts, apps/web/src/lib/payExec.test.ts, this additive claim, and docs/engineering-handoffs/completion-20261120/transaction-shapes/.
Scope: reproduce the three established JSON-array hash/input/fallback-data acceptance cases, reject nonprimitive transaction fields before string normalization, preserve valid string normalization and input/data fallback semantics, and retain the original submitted hash/journal with no resend after post-broadcast verification fails.
Acceptance: permanent original-config RED regressions, minimal production repair, GREEN affected suites, coercion-hook and compatibility controls, scoped typed lint if available, independent source/test review and source-pinned handoff. Root/integration QA owns the coordinated broad build/typecheck window.
Boundaries: no remote or shared-branch mutation, deployment, release, real funds, contracts, fees, dependency/configuration/gate changes, unrelated cleanup or edits to actively advancing original privacy lanes.


## Coordinator continuation of transaction-field repair

The generation3 worker saved regression commit 795a3892ded8a8d20aea67b2b88d69620a4afdf5 before its turn ended. The coordinator continues this same scoped branch and owned files; no new branch or alternate security task is started. The coordinator executed the original wallet/payment regression baseline on that exact unchanged runtime, then will add only primitive-string checks before the existing normalization. Independent final_security_gen4 retains review ownership. Full combined checks remain with integration_qa_gen3.

## Fresh receipt-status security review — generation 2

Worker: /root/security_review_gen2. Branch: review/ghostpay-receipt-status-gen2-20261120.
Exact production source: f77fe8572f54669098ee8cb5d47a6313ef72e37b; regression baseline: b416ea615d40f6375c868b05e8af0683cf1e10fd.
Owned writes: this additive claim and docs/engineering-handoffs/security-review-gen2-receipt-20261120/ only.
Acceptance: independently review and execute unsupported-status rejection, preserve valid0/1/null-destination/hash behavior and submitted-journal/no-resend consumer outcomes. Keep new nearby array-field finding separate and unapproved until a successor reproduces and repairs it.
No runtime/source-branch mutation, remote writes, release, contracts, fees or security gate changes.


# Fresh integration QA generation 3 — 2026-11-20

Worker: /root/integration_qa_gen3, independent of the source implementers.
Branch: review/ghostpay-integration-qa-gen3-20261120.
Exact initial candidate: 9e062b7150e74d1b20e34b0f120add660d9ef02e, canonical baseline 417f7c71daf8645e1432f2ec8f070110879b80bd.
Owned writes: this additive claim and docs/engineering-handoffs/integration-qa-gen3-20261120/ only. Temporary independent probes may run in this isolated checkout and must be preserved as evidence or removed before finalization. Product source changes require coordination.
Acceptance: verify the four cumulative source candidates are ancestors; independently compare each of the 15 non-documentation input blobs and preserved browser/signer/control scopes; review standards and documented acceptance separately; run original QR package coverage, typecheck, lint and build plus original Pages verifier/promotion/CSP tests without gate changes. Record exact source, environment, actual failures and qualification limits.
Root owns publication and integration. The separate bug-hunt worker owns receipt-status and any further wallet boundary fixes; separate reviewer owns the new quick-hide feature and its active privacy dependency. Full web qualification must wait for the final wallet freeze and an exclusive resource window.
No shared-source or remote ref mutation, deployment, contract/fee change, real-funds operation, branch deletion, force push or security-gate weakening.

## Corrected-source lint and artifact QA — generation 3

The same independent worker /root/integration_qa_gen3 continues on branch review/ghostpay-final-artifact-qa-gen3-20261120, pinned to corrected product/test source 2149ad2814d9ae031b23322f87f74842af5dde78. Ownership remains this additive claim and docs/engineering-handoffs/integration-qa-gen3-20261120/ only. The earlier source 53f4253b baseline is preserved in separate checkpoint 758970ce. Verify the single-field shared policy receipt fixture correction, the original 15 source mappings and eight control scopes; then execute one approved full typed-lint retry at 1536 MiB and the original payments-disabled development Pages build with a 1024 MiB Node resource wrapper. Preserve all commands, environment overrides, exact artifacts and limits. Do not rerun the incomplete 900-second coverage command, modify gates, or deploy. Root schedules the sole execution window and owns hosted exact-head gates and publication.

Completed corrected-source results: original full-lint retry terminated with exit 137 before diagnostics; original development Pages build passed, including full web TypeScript and original gates, and all 16 promoted site files passed independent verification against the exact source and checksum inventory. The complete 21-file development output and evidence are preserved in the owned report directory. Payments remain disabled and release evidence is false. The heavy execution window has been released; original exact-head hosted lint, full coverage and browser qualification remain with root.


## 2026-11-20 — Policy receipt fixture repair, generation 7

Worker: `/root/policy_fixture_gen7`.
Branch: `fix/ghostpay-policy-receipt-fixture-20261120`.
Exact base: `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`.
Owned writes: `apps/web/src/features/policy/fixtures.testutil.ts`, this additive claim, and `docs/engineering-handoffs/completion-20261120/policy-receipt-fixture/` only.
Scope: restore the modeled receipt shape in the shared `walletMirror` test helper by supplying the same transaction hash returned by its transaction lookup and by `MockWallet.eth_sendTransaction`. The original full web coverage run on the frozen base exposed the missing field in policy send and guard consumers after receipt hash validation was consolidated.
Acceptance: preserve every existing assertion, deadline, timeout, policy outcome, configuration and production guard; retain the unchanged full-run failure evidence or execute a narrow unchanged-fixture baseline; run the affected original policy consumer suites with one worker after integration QA releases its exclusive execution window; deliver a clean committed source-pinned repair for independent coordinator review and original full requalification.
Coordination: inspected frozen active original policy privacy branch `037b6b896be70911bc715c868fa23bb83c35e47c` and wallet privacy branch `f94feab3d92e443666553eda62ac6a202bca9704`. Both still omit the receipt hash in this helper, and neither unique changed-path set owns a helper repair. Those branches remain untouched. Parent explicitly expanded this assignment from `send.test.ts` to this shared helper on the evidence from `/root/integration_qa_gen3`.
Boundaries: no production changes, assertion removal or weakening, test skips, runtime guard changes, dependency/configuration changes, remote/shared-branch writes, contract/fee/deployment changes, or parallel tests/builds during QA's exclusive window. Root owns consolidation and full requalification.

Completion: tested repair `898d3361af4320dccca7743d960b32a94fb66922`; coordinator independently approved the one-field source diff. All seven original helper consumers passed (87 tests, exit 0) with one worker and unchanged configuration/assertions/timeouts. The exclusive execution window is released. Lossless unchanged-source partial coverage failure evidence, exact focused output, dependency/input pins and integration limits are in `docs/engineering-handoffs/completion-20261120/policy-receipt-fixture/README.md`. Root owns full requalification; no whole-suite or aggregate coverage success is claimed by this worker.
## Integration QA final-source continuation — 2026-11-20

The same independent worker /root/integration_qa_gen3 continues; this is not another fresh agent.
Branch: review/ghostpay-integration-final-qa-gen3-20261120. Exact product/test source: 53f4253bd9afc33bea43a7bdfe95ae287e035bf7.
Ownership remains this additive claim and docs/engineering-handoffs/integration-qa-gen3-20261120/ only. Verify the final source against reviewed transaction repair c344334d and the original four imported candidates; then run original web QR, full web TypeScript, lint, configured coverage, no-coverage pass and development Pages build where resources permit. Root granted the sole execution window after independent wallet review.
Preserve initial 9e062b71 evidence, all failure outcomes and exact artifact identities. No repeated resource-only retry campaign, gate changes, deployment or remote mutation.

Final-source baseline checkpoint: the 15 inputs and eight preserved controls match; 87 web QR cases, full web TypeScript, and four original no-coverage cases pass. Full lint reached the explicit 1024 MiB heap limit. The original full coverage command reached its recorded 900-second overall cap after 1,467 passing lines and 19 real policy-fixture failures; it emitted no aggregate coverage. Source remained unchanged. Root assigned the shared missing-receipt-hash fixture to fresh policy_fixture_gen7, and this worker released the execution window after the no-coverage pass. Further combined qualification waits for a reviewed corrected source and a renewed exclusive window. Exact outcomes and lossless logs are under the owned evidence directory.
# Fresh remaining-source review, generation 5 — 2026-11-20

Worker: /root/remaining_sources_gen5; a separate read-only comparison worker may inspect one original source scope.
Branch: review/ghostpay-remaining-sources-gen5-20261120.
Base and frozen comparison: 53f4253bd9afc33bea43a7bdfe95ae287e035bf7.
Owned writes: this additive claim and docs/engineering-handoffs/completion-20261120/remaining-sources-gen5/ only.
Scope: up to three still-unresolved source heads after consulting the later four-small-source review: claude/ghostpay-lean-core-milestone-t5lwox, codex/ghostpay-security-audit-20261030, and integration/ghostpay-docs-recovery-20261119.
Acceptance: freshly verify each live ref, all best merge bases and current/source blobs; inspect the original intended behavior and current source/tests; record precise equivalent, superseded, future, unique or unknown dispositions with limits. Absent commits alone are not uniqueness evidence. Report any required missing behavior before proposing edits.
Boundaries: source-only comparison; no tests, builds, package installation, product/test/configuration changes, remote mutations, branch closure/deletion or deployment. Existing original privacy implementation remains actively owned and is not modified or duplicated. Root owns integration and full qualification.

Status: Complete on 2026-11-20. All three selected scopes were compared at frozen 53f4253b; no required runtime gap was established. Report: docs/engineering-handoffs/completion-20261120/remaining-sources-gen5/REPORT.md. Fresh archive-recovery worker /root/archive_recovery_gen6 received the seven PR #259 historical artifact paths and the unverified section-overlap boundary.

## 2026-11-20 — Fresh completion review, generation 8

Worker: `/root/completion_review_gen8`.
Branch: `review/ghostpay-completion-gen8-20261120`.
Frozen reviewed candidate: `2149ad2814d9ae031b23322f87f74842af5dde78`; canonical comparison: `417f7c71daf8645e1432f2ec8f070110879b80bd`.
Owned writes: this additive claim and `docs/engineering-handoffs/completion-review-gen8-20261120/` only.
Acceptance: independently inspect all 16 non-documentation changes, verify their source identities and protected controls, check correctness against documented acceptance and repository standards, and record concrete remaining findings with precise qualification limits. In particular, review receipt hash/status/primitive-field handling, QR classification and idle expiry, Pages verification before promotion, and the policy receipt fixture hash.
Boundaries: source review only; no application tests/builds, runtime/test/config edits, duplicate corpus scans, remote mutation, deployment, release, contracts, fees, gate weakening, or edits to another worker's owned paths. Integration QA retains the exclusive execution window and root owns consolidation/publication.
# Fresh historical documentation recovery — generation 6

Worker: `/root/archive_recovery_gen6`.
Branch: `docs/ghostpay-historical-archive-gen6-20261120`.
Frozen comparison: `53f4253bd9afc33bea43a7bdfe95ae287e035bf7`.
Source candidate: PR #259, `4ff80733a3b36019e2f12fc21a8448e7666b6049`, declared base `ffd982a7aea2856c186b40ef236a39720a1b81f5`.
Owned writes: this additive claim and `docs/engineering-handoffs/archive-recovery-gen6-20261120/`; only independently proven missing historical archive/provenance material may be recovered under that owned directory.
Acceptance: compare all 158 recorded historical sections against the frozen candidate and later retained evidence; verify original source lines, hashes and archive transformations; distinguish absent filenames from absent content; preserve attribution and record exact equivalence or a minimal recovery with source-pinned verification. Historical snippets are data and will not be executed.
Excluded: current status/ownership guidance, active Wiki navigation, runtime/test/configuration/workflow changes, builds, application tests, remote writes, deployment/release, and all active privacy work. Root owns integration and final publication.


## 2026-11-20 — Fresh historical archive review generation 8

Worker: `/root/archive_review_gen8`.
Branch: `review/ghostpay-historical-archive-gen8-20261120`.
Exact base and reviewed recovery: `a4503e5c3a5b1e02bfd160f36f841dd6f5e66f58`; upstream historical source PR #259 `4ff80733a3b36019e2f12fc21a8448e7666b6049`.
Owned writes: this additive claim and `docs/engineering-handoffs/archive-review-gen8-20261120/` only.
Acceptance: independently verify the ten-file documentation-only recovery, recorded archive/source/section hashes and byte ranges, retained QR omission, local links, exact selection boundaries, provenance attribution and historical-only framing. Inspect concrete differences and supplied manifest identities without blindly rerunning the predecessor's full content corpus. Record actual results and limits; report any blocking correction to the coordinator before integration.
Boundaries: no product/test/config/workflow edits, application tests/builds, execution of historical snippets, remote mutations, deployment, release, or changes to another worker's branch. Root owns integration and application qualification.

Completion: independent archive verification passed with four explicitly retained inherited historical-link findings (two absent original target paths). All 158 original sections, 157 recovered bodies, archive/manifest hashes, publication metadata, and 22 new local links were checked. The 30 later documentation changes through `be12cd043dbfc2f562368fd0ccc1a2a8c3f7a22f` contain no complete recovered section. No recovery bytes or product files were modified. Review evidence and the initial strict-target failure are preserved under `docs/engineering-handoffs/archive-review-gen8-20261120/`; root owns integration.


## 2026-11-20 — Separate quick-hide full typing qualification, generation 9

Worker: `/root/quick_hide_qa_gen9`.
Branch: `review/ghostpay-quick-hide-qa-gen9-20261120`.
Base and exact feature source: `c8a2d7ca7c6c1caa96256e1cd57ffd7afaafa9d5`; published `137628961463fc5abd8b7927b2efe6b18a0a206a`; exact common tree `da95c2f24426fd9dfd01e38472f07f5dc466cbf9`.
Owned writes: this additive claim and `docs/engineering-handoffs/quick-hide-qa-gen9-20261120/` only.
Scope and acceptance: verify local versus published feature tree and execute exactly one original full web typecheck using Node 24 and a 1024 MiB heap in the coordinator-assigned sole execution window. The coordinator authorizes read-only execution in the clean feature worktree, using its existing private dependencies and declaration outputs. Preserve exact command, source, environment, duration, raw log, exit status and any limits. Release the execution window immediately afterward.
Boundaries: no feature/runtime/test/configuration changes, dependency installation, tests or builds, active privacy lane mutation, remote writes, deployment, release, contract or fee changes, or additional retries. Prior 40-case focused runs and scoped lint are attributed to their executors; three previous full typing exit-137 failures remain historical incomplete attempts. Root retains integration/publication ownership.

Preparation clarification: the suggested author worktree has no node_modules directory. The compiler did not start during that preflight. This worker instead uses its own checkout, privately copying the existing installation and 65 package dist directories from the prior independent-review worktree after verifying the identical lockfile and all 65 full Git package trees. Only the ownership claim differs from the exact feature snapshot outside this documentation record. No install or rebuild is performed.

Completion: one original full web TypeScript invocation passed at execution `9a96ff659ff7295d00caf7a49a5d847d877eff9d`, exit 0 in 30.621 seconds. The execution checkout differs from feature `c8a2d7ca` / published `13762896` only by ownership documentation. All 65 declaration-source trees and copied output digests matched; all 68 workspace links resolve privately. The execution window is released. Earlier exit-137 attempts and setup-only failure remain explicit; full browser/coverage/hosted/integrated qualification stays with successors.


## 2026-11-20 — Fresh hosted and publication review, generation 11

Worker: `/root/hosted_review_gen11`. Branch: `review/ghostpay-hosted-gen11-20261120`.
Base: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, published consolidation PR #302.
Owned writes: this additive claim and `docs/engineering-handoffs/hosted-review-gen11-20261120/` only.
Scope: independently read published PR #302 and separate quick-hide PR #300 heads, available synthetic merge commit trees, original workflow metadata and selected completed logs. Bind each reported result to the observed commit/tree and timestamp.
Acceptance: preserve queued, skipped, missing and failed outcomes explicitly; distinguish completed checks from complete workflow/release qualification; retain source/metadata/log evidence and a bounded successor handoff. No application test, lint, typecheck, build, dependency copy or historical command execution.
Boundaries: no remote mutation, workflow rerun/dispatch/cancel, settings change, source edits, shared integration update, deployment, release, contracts, fees or gate waiver. Root owns publication and integration; the format worker owns the local execution window.

Completion: both published/local/synthetic merge trees and both merge parent lists were independently verified. Quick-hide's existing hosted web build and one Chromium rendering smoke passed; its separate kit job passed 296 cases with six skips. At the final 03:16 UTC observation, consolidation's six workflows and quick-hide's remaining three workflows were queued; no current CodeQL/Sonar result was observed. Full metadata, exact decoded logs, source bindings and limits are preserved in the owned review directory. No local application command or remote mutation occurred.


## Fresh format parser candidate port and review — generation 10, 2026-11-20

Worker: `/root/format_review_gen10`. Branch: `review/ghostpay-format-candidate-gen10-20261120`.
Base: published candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; original proposal PR #301 at `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7`.
Owned writes: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`, this additive claim, and `docs/engineering-handoffs/format-review-gen10-20261120/`.
Scope: independently review and port the original proposal's exact two production/test blobs onto the current candidate. Preserve original attribution. Commit the original regressions first on unchanged candidate runtime; then port the exact one-line guard after the original-config RED run. This separate port does not modify the original PR, the frozen candidate or a shared integration branch.
Acceptance: independently review the parseUnits runtime guard, supported precision domain, original regressions and current caller compatibility; execute bounded original-config focused RED/GREEN and scoped lint only in the coordinator's exclusive window; retain exact source/config/dependency identity and every failed or incomplete result. The PR301 main-based lock differs from the current candidate lock, so this run qualifies the isolated current-candidate port rather than claiming original-PR-lock execution.
Boundaries: no original/shared ref mutation, remote write, automatic integration, broad tests, unrelated source expansion, dependency upgrade, assertion/gate changes, contract/fee/deployment/real-funds action, or interference with active privacy ownership. Root owns final integration and publication.

Completion: original PR301 tests and runtime blobs were ported exactly onto candidate e22c1748. Tests-only d2d270ed reproduced two failures with ten controls passing; exact repair eb969686 passed all12 original repository cases and scoped typed lint. The full-disk setup refusal and zero-case missing-output startup failure are retained separately. Root independently inspected the final two-file diff, requested no source change, and retains publication/integration ownership. The exclusive execution window has been released. Evidence and successor tasks are in `docs/engineering-handoffs/format-review-gen10-20261120/README.md`.
