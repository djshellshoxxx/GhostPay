# GhostPay remaining branch claims — complete frozen reconciliation

The four-PR sample in [#343](https://github.com/djshellshoxxx/GhostPay/pull/343) is now supplemented by a complete, exact-SHA accounting of **423 branch refs and 123 open PRs**. This report identifies where source is already incorporated, where useful work survives in another candidate, and which claims still require their existing owners to reconcile scope and qualification. It does not establish that any open PR is qualified, transfer ownership, or authorize a merge, retirement, workflow dispatch, release or deployment.

## Scope and fixed evidence boundary

The final ref cutoff is **2026-11-20 18:52:23 America/Los_Angeles / 2026-11-21 02:52:23 UTC**. Main is [aec179910c39081d820396409ff3139ff2264132](https://github.com/djshellshoxxx/GhostPay/commit/aec179910c39081d820396409ff3139ff2264132); the #307 integration candidate is [5a745d4b5fba69b66a9779f88aefc63c253a4f27](https://github.com/djshellshoxxx/GhostPay/commit/5a745d4b5fba69b66a9779f88aefc63c253a4f27). Main has advanced from the original #343 base `bfebea0acf213a113d2740366fd592042661ca67`.

The initial paginated inventory at 02:25:06 UTC covered 420 branches and 120 open PRs. The final cutoff added #353/#354/#355 and their three branch refs; all original heads and main remained unchanged. [source-snapshot.json](source-snapshot.json), [initial-source-snapshot.json](initial-source-snapshot.json) and [source-drift-check.json](source-drift-check.json) retain both observations. Later additions are outside this fixed snapshot. CI observation times are separate from the ref cutoff and retained per record.

This is an additive evidence index. Existing [`ACTIVE_WORK.md`](../../ai/ACTIVE_WORK.md), [`WORKFLOW.md`](../../ai/WORKFLOW.md), the integration lock, issue/finding IDs and source-pinned handoffs remain the ownership and workflow controls. Repeated headings or a branch name do not create a new task, and old completion prose does not establish current incorporation.

## Read the complete accounting

| Evidence | Purpose |
| --- | --- |
| [branch-index.md](branch-index.md) | All 423 refs, exact heads, source disposition, open PR/observed CI and next action |
| [pr-queue.md](pr-queue.md) | All 123 open PRs, exact heads and frozen target tips, CI observations and dependency actions |
| [branch-ledger.json](branch-ledger.json) | Ancestry, ahead/behind, merge bases, current content comparisons, dependencies and equal-head groups |
| [branch-paths.json](branch-paths.json) | Complete indexed donor path/mode/blob states, current and advertised PR base diffs, and overlap pairs |
| [patch-equivalence.json](patch-equivalence.json) | Stable non-document net-delta and nonmerge-commit patch IDs; no automatic supersession |
| [claim-ledger.json](claim-ledger.json) | Every registry read and preserved section identity, owner/status text, source pin and scope |
| [qualification.json](qualification.json) | Exact-head checks, statuses and review observations with observation phases and exclusions |
| [semantic-dispositions.json](semantic-dispositions.json) | Reviewed priority families, source comparisons and all nine historical code-ledger rows |
| [residual-dispositions.json](residual-dispositions.json) | Human triage of every mechanically unresolved branch; residuals are not a missing-feature count |
| [closed-prs.json](closed-prs.json) | Actual merge destinations, source/merge SHAs and event times |
| [independent-validation.json](independent-validation.json) and [validation.md](validation.md) | Independent method checks, controls, provenance and the precise limits of verification |

## What the 423 branch classifications establish

| Mechanical class | Refs | Meaning and action |
| --- | ---: | --- |
| Main baseline | 1 | The frozen comparison target |
| History in main | 188 | Source tip is an ancestor of main; retain provenance and do not replay that tip. Ancestry alone does not prove every behavior survives. |
| Documentation only | 66 | Donor-side delta has no paths classified as non-document; preserve claims/evidence and inspect scope before assigning product work. |
| Changed content present in main | 7 | Every non-document donor changed-path state, including mode and absence, exactly matches main; document the narrower incorporation claim. |
| History in an open candidate | 66 | Source ancestry exists in another open head; continue the containing lane and verify current behavior there. This is not main integration. |
| Changed content present in an open candidate | 15 | Exact donor changed-path states exist in a candidate without requiring ancestry; reconcile owners and avoid duplicate replay. |
| Unresolved content | 78 | Neither ancestry nor full exact changed-content matching resolves the branch mechanically; consult the separate semantic triage and owner-specific next action. |
| Coordination metadata | 1 | Sparse integration-lock tree; not a mass source-deletion change or product donor. |
| Publication ref | 1 | `gh-pages`, unrelated to application recovery. |
| **Total** | **423** | Every frozen ref is assigned exactly once. |

The residual semantic index preserves **79 source rows**: the original 76 plus all three cutoff additions. **78 are unresolved at the final cutoff**; #352 is retained as historical triage evidence but now has its history contained in #354/#355. This preserves the observation change without omitting a new head or counting a now-contained source as a current residual.

Changed paths are computed on the **donor side from its merge base**, so later additions on main are not mislabeled as donor deletions. The comparison retains every path; **48 branch deltas and five current-base PR deltas exceed 300 paths**. Docs classification includes `docs/`, `doc/`, `.agents/`, Markdown and explicit license/notice/changelog names. Workflows, configuration, dependencies and assets remain non-document unless they independently meet those documented rules.

The path table identifies **5,025 PR pairs sharing any changed path**. Only **746 share a non-document path**; **4,279 overlap solely in documentation**. Shared `ACTIVE_WORK.md` history must not be mistaken for thousands of product conflicts. Even a shared product path establishes a review dependency, not a conflict or duplicate implementation by itself.

The stable patch analysis covers **3,865 reachable commits**, including **3,427 nonmerge commits** and **1,848 non-document commit patches**, with 15 multi-branch net-delta patch groups. Historical patch equivalence can survive a later revert; it is supporting evidence for source review, not proof of current incorporation or acceptance. Empty documentation-only patches are not counted as implementation equivalence.

## Registry and ownership reconciliation

All **423 refs / 418 unique heads** were checked for `docs/ai/ACTIVE_WORK.md`: **255 present, 168 absent**, with **14,210 section occurrences**. The ledger preserves **507 record identities and 506 unique section texts**: 60 main headings, 359 additional original-PR variants, 85 further variants on refs without an open PR, and three new declarations from the cutoff additions. These are text/record counts, not independent task or feature counts. The main headings retain 26 integration-recorded and 34 historical dispositions.

Each record preserves its source SHA, raw scope/owner/status text and observed branch/PR relationships. Historical declarations remain distinguishable from current observed implementation. A missing registry is an explicit read result, not evidence that the branch is unowned; an old lock or heading does not authorize ownership transfer.

The integration-lock ref has only `integration-lock.json` in its tree at `c196151daf8233f96045fd205b2d899c9e8cc97d`. Its historical held/expiry metadata is recorded separately. Treating this sparse tree as hundreds of application deletions was incorrect; expiry alone does not authorize a takeover. Existing ownership and lock coordination must be checked again before action.

## Current PR observations and dependency corrections

The exact-head collection records **61 PRs with observed failure, 13 pending, 44 with success plus skipped/neutral checks, and five with observed success**. There are **117 drafts and six nondrafts**, with **zero formal GitHub approval submissions**. The collection contains 4,064 raw check runs, of which 3,994 were selected and 70 excluded under the documented workflow-context rules. None of these aggregate labels establishes that all applicable required gates, browser/external acceptance or independent review are satisfied.

The original 120 heads were observed at 02:26:09.723–02:26:42.069 UTC, with workflow-context clarification at 02:30:04.917 UTC. The three new heads were observed at 02:53:46.338–02:53:46.424 UTC. Original observations were preserved; this is not a claim that every check was refreshed at the final cutoff.

The #343 input row is its original documentation head `f9f2d9f42f3a7e733e8057bedf4f5ad95aeb22d7`. That run had eight successful checks and twelve skipped checks; the [job-log evidence](pr343-docs-only-evidence.json) explicitly records that heavy jobs were skipped for a documentation-only change. It does not verify the sampled product branches. Publishing this continuation creates a different documentation head; prior checks are not transferred to that new head.

For **76 of 123 PRs**, the API's advertised `base.sha` differs from the frozen tip of `base.ref`. All refs resolve and all head SHAs match the final branch inventory. Current comparisons and overlap accounting use the frozen target tip; the advertised-base diff remains separately available for provenance. This matters when a source branch advances after its earlier PR is merged.

Six children do not contain their current frozen parent tips: **#269/#270 → #262; #290/#293/#294 → #278; #341 → #307**. Four PRs target nonmain refs already in main: **#139/#140/#153/#160**. Their queue entries call for owner review of the current stack and any necessary retargeting; no PR was retargeted here. A clean mergeability flag, a draft flag or a historical green report is not qualification.

## Priority source and claim corrections

### 1. A merged child can still be absent from main and #307

This is the most consequential dependency correction.

| Event | Actual destination | Source / merge | UTC event time |
| --- | --- | --- | --- |
| [#325 merged](https://github.com/djshellshoxxx/GhostPay/pull/325) | `integration/ghostpay-main-recovered-fixes-20261120` (#307) | Source `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`; merge `394793b1276aeac337aedde30499548bb57eadf9` | 2026-11-20 23:17:17 |
| [#331 merged](https://github.com/djshellshoxxx/GhostPay/pull/331) | The still-existing `integration/ghostpay-sweep-consent-20261120` source branch of #325 | Source `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`; merge `2748c9bfd55bd226c7801c15a7acdd955ab70339` | 2026-11-20 23:29:16 |

The later #331 merge does not flow backward into #307. Git ancestry confirms that #325's merge is in #307, while #331's source is in neither frozen main nor #307. Its source is contained by [#333](https://github.com/djshellshoxxx/GhostPay/pull/333), which also contains the original #256 idle implementation.

**Disposition:** keep the #331/#333 idle and backup lane active until its source is incorporated into the chosen current integration target and qualified there. A ledger that marks idle completion integrated into main because #331 is merged loses real work. The exact merge events are preserved in [closed-prs.json](closed-prs.json).

The #307 [current-main report](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/docs/consolidation/current-main-r3-20261120/REPORT.md) explicitly excludes the smaller #331/#333/#335 stack. Frozen #307 is **88 commits ahead and 10 behind main**, with merge base `bfebea0acf213a113d2740366fd592042661ca67`. Its source checks do not qualify a future composition with the later main or idle/backup changes.

### 2. The old TRON pending-main descriptions are outdated

Three exact repair sources now have main merge commits in the frozen main history:

| Source | Main merge | Reconciled claim |
| --- | --- | --- |
| [#321 — cancellation](https://github.com/djshellshoxxx/GhostPay/pull/321), head `87c3bf5a59f4d443c9e5cf81368162554a5315c3` | `8c75581f0217dbc4ba6d052e54351594274e7b6e` | Source adopted by main |
| [#329 — complete ranges](https://github.com/djshellshoxxx/GhostPay/pull/329), head `cff631b5c32a86adfa2d79c342e497e91a8573a5` | `784b445f6bc5c641e8e85d4e28b730e044791f40` | Source adopted by main; final PR destination is main |
| [#334 — BTC fee-cap consistency](https://github.com/djshellshoxxx/GhostPay/pull/334), head `9dcd2d88ff32060e519ef18e2d8753691b56abc1` | `aec179910c39081d820396409ff3139ff2264132` | Source adopted by main |

This confirms incorporation of those exact sources, not new runtime/chain acceptance or immunity to later regressions. #307 includes #321, but not the later #329/#334 source tips.

[#340/#342](https://github.com/djshellshoxxx/GhostPay/pull/342) remains separate: it changes `apps/web/src/features/tron/rpc.ts` and `TronView.tsx` to bind selected Nile/Shasta identity, with the child fixing legacy test callers. #340 is an ancestor of #342, but neither is in main. The adapter cancellation/range repairs do not implement that browser identity guard. Keep the parent/child qualification sequence.

### 3. Spec18 recovery is preserved on branches but absent from current main/#307

The six named Spec18 implementation modules below exist at [#260's reconciled source](https://github.com/djshellshoxxx/GhostPay/pull/260), `f3bb7c662274c4a4394324c405b49517ad2b1461`, but have **no tree entry** in either frozen main or #307:

- `apps/web/src/components/StealthExportCommon.tsx`
- `apps/web/src/components/StealthExportRecovery.tsx`
- `apps/web/src/components/StealthExportVerification.tsx`
- `apps/web/src/lib/paymentKeyExport.ts`
- `packages/ux-vault/src/stealth-export-portable.ts`
- `scripts/recovery/stealth-export-recover.mjs`

The JSON records the exact tree queries and donor blob identities. This finding concerns the named Spec18 module family. Current main still has its older seller-keystore and sweep facilities; this review does not claim all recovery is absent, or test any recovery/refund guarantee.

[#239](https://github.com/djshellshoxxx/GhostPay/pull/239) and [#240](https://github.com/djshellshoxxx/GhostPay/pull/240) are sibling sources, neither an ancestor of the other. Their completion claims apply to their own acceptance scopes. [#260's source-pinned reconciliation](https://github.com/djshellshoxxx/GhostPay/blob/f3bb7c662274c4a4394324c405b49517ad2b1461/docs/handoffs/RECOVERY_RECONCILIATION_20261119.md) retains #239 atomic session replacement, generated-ciphertext retry and verification invalidation, and adds #240 strict saved-file byte checks and event-time unload custody checks. It has unresolved combined-source and broader qualification requirements.

Several later, still-divergent candidates already carry this recovered content. At #278, #292, #302 and #346, the recovery UI, verification UI, portable codec and standalone decoder are each byte-identical to #260, even though the #260 tip itself is not an ancestor. Other session, export and common-control files evolved. The JSON records an eight-path comparison across all seven relevant source heads.

**Disposition:** preserve and reconcile existing implementations; do not rebuild them from the specification. Recover the accepted scope through its current owners without bulk-importing old #238 ancestry. Preserve [#346's browser-to-standalone recovery evidence](https://github.com/djshellshoxxx/GhostPay/pull/346), then requalify against the final current session/idle composition. Neither older completion prose nor shared file hashes establishes present-main acceptance.

### 4. F03's runtime is already represented in #307

[#310](https://github.com/djshellshoxxx/GhostPay/pull/310), source `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`, has 19 non-document changed paths relative to its main merge base:

- **14 are exact mode/blob matches in #307**, including request-file codec, file input/download, Pay/CreateInvoice integration, interoperability tests and the browser specification.
- The remaining four locale files and `securityKeys.ts` differ only through later Sweep disclosure changes. Parsed JSON comparison identifies only `scanPrivacy.disclosure.sweepAuto`, `sweep.balanceRead.warning` and the added `sweep.balanceRead.note` keys in each locale. `securityKeys.ts` only adds the latter key.
- The two #310 commits absent from #307 are `7c30385a` (main reconciliation) and `dad6bc74` (qualification/audit documentation), not an additional F03 feature implementation.

**Disposition:** F03 runtime represented in an integration candidate, still not integrated main. Keep #310's evidence and active request-file test/repair descendants; do not merge duplicate F03 runtime as a separate independent feature. Main adoption and combined-source acceptance remain distinct gates.

### 5. F04/F05/F10 are distinct dormant milestones, not completed features

| PR | Verified source scope | Still unfinished |
| --- | --- | --- |
| [#322 — F04](https://github.com/djshellshoxxx/GhostPay/pull/322) | Five files under `features/future/merchant-dashboard/`; strict in-memory projection, evidence binding, deduplication and bounded selection | Trusted P03 evidence adapter, P05 journal/persistence, crash and cross-tab handling, dashboard UI, export and browser/device measurements |
| [#323 — F05](https://github.com/djshellshoxxx/GhostPay/pull/323) | Offline receipt review and cancellable import session under `features/future/ghostproof/`, plus existing-workspace dependency declarations | Real UI/app-lock integration, selective proof generation, authenticated evidence, export and browser/provider acceptance; ordinary signature checks do not establish settlement or ownership |
| [#324 — F10](https://github.com/djshellshoxxx/GhostPay/pull/324) | Bounded plan validation, due-period preview and single-use local review under `features/future/private-recurring/`, plus workspace declarations | P04 signing/templates, P05 atomic period reservation, two-tab/crash/failed-export handling, paused migration, reminders, UI and voluntary payer journey |

All three owned module trees are absent from both main and #307. Their own source-pinned handoffs explicitly mark the milestone disconnected from production routes. The three PRs have distinct useful implementation work, while the full named features remain incomplete. Preserve their existing owners and milestone boundaries. Their historical focused checks are not new full-candidate acceptance results.

### 6. Backup ownership must be reconciled as one implementation family

The old description that #319 "extends #314" should not be read as a Git dependency: **#314 is not an ancestor of #319**. #319 is, however, already an ancestor of #307 and #333.

[#333](https://github.com/djshellshoxxx/GhostPay/pull/333) selectively recovers the missing #314 behaviors on the idle candidate: ownership before unlock preflight, controller/session revalidation before export encryption, and one synchronous owner for durable save/delete operations. Its `SellerKeys.ownership.test.tsx` is **byte-identical** to #314's `SellerKeys.operation.test.tsx`, blob `05c846289be5827c2e9028c28661b1c2f242c9b0`. The original #319 operation file is preserved separately.

**Disposition:** continue/qualify #333 while retaining #319's separate cancellation and durable-write lifetimes. Do not independently replay both #314 and #333 or replace the newer whole `SellerKeys.tsx` with the older donor. #333's source is not yet in frozen main or #307. Its report distinguishes local unit/source evidence from unexecuted browser bodies.

### 7. All nine historical code-ledger rows checked; three reasons corrected

Every `sourceSha` in `docs/consolidation/ledger-code-branches.json` still matches the frozen live branch tip. The recorded narrow fixes remain represented, but three reason strings required greater precision:

1. **#161 tip equality:** #161 and `chatgpt/ghostpay-rpc-filter-guard-beta-20261114` share `73923350fcda62f00be0f2b83ad346f416a24bb6`. #162/pages-qr-combined has the distinct later tip `26f83ccdda98ee82c26ad5f71c3f90d90ad68c20`. `git cherry` marks all five #161 commits equivalent to main. Their common source should be retained once.
2. **Security donor D3/B2R:** `git cherry` does not report literal equivalence for those two commits. Main retains the behaviors through `apps/relayer/src/service.ts` deadline rechecks and queued-expiry regressions, and the relocated `apps/web/src/lib/opStackFee.ts` fallback that accepts only `ChainAdapterError.executionReverted`. `packages/chain-adapters/src/rpc.test.ts` explicitly records the B2R port. This is semantic retention evidence.
3. **AR2/secret loader:** AR2 `97787665` and descriptor-bound secret loading `63994db6` are actually patch-equivalent. The secret loader now resides in `packages/relayer-guard/src/secrets.ts` and is re-exported by the original relayer path. The dated `1d28f24` handoff is not another missing runtime repair.

The scan-filter donor family retains its address/range guards in main `scanSpam.ts` and its regression in `scanSpam.test.ts`. The lean-core #151 removal of the stale `openai-agents.yml` is present; current invoice deadline and guarded automation logic is retained. These are checks of the recorded narrow recovery claims, not an assertion that every historical branch or application behavior has been tested anew.

An independent documentation review checked the three reason-string corrections and the historical banner on `GHOSTPAY_MASTER_COMPLETION_LEDGER.md`; this is not a formal GitHub approval or product qualification. Original source SHAs, result fields and historical test provenance are preserved. The banner correctly distinguishes #203 head `71abc7e55c25d45b206ac47e5ddd24e072805710` and merge `5467c158069c5bab264b6a653ac56e89e13f3e13` (both ancestors of main) from the later same-named branch at open #221 `1c9a3ce4a103c86b9ca849a2fd5ed77f86c66849` (not an ancestor).

### 8. Future branch count is not an implementation count

There are **41** `future/` refs in the snapshot, including the separate F03 specification ref. **37 have documentation-only own deltas**; F03/F04/F05/F10 are the four with non-document implementation deltas.

This is a claim about those refs, not about every named concept. For example, Tor implementation work exists on #308/#320/#307 outside the P01 specification branch. Do not turn 40 specifications into 40 completed features, or turn 37 documentation-only refs into 37 wholly unimplemented concepts. Use the existing feature owners and actual source/evidence locations.

### 9. The final three additions preserve two distinct review lanes

[#353](https://github.com/djshellshoxxx/GhostPay/pull/353), head `a8c10a965f726a6c2dc8eb7391f495df833b3e9b`, adds `Settings.partialImportDrafts.test.tsx` and its ownership/handoff documentation on frozen #307. Its current-base delta is one test file plus two documents. Preserve this focused regression work and execute it against the chosen current integration composition; the original PR explicitly recorded the test as unrun.

[#354](https://github.com/djshellshoxxx/GhostPay/pull/354), head `8ce7f1db452167311876bd0707778c2e9c64f3df`, and [#355](https://github.com/djshellshoxxx/GhostPay/pull/355), head `f11792f7b9202512f0bf980a03f057e8a15836ae`, both target #352 at `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94`. Their runtime bodies express the same focus-recovery policy with condition-order/comment differences; their test files cover complementary cases and neither supersets the other. #354 adds seven fallback/cancel cases plus browser tab-order and account-invalidation assertions. #355 adds four real `PrivacyProvider`/quick-hide lifecycle cases, including inert-release timing, body/document-root and disabled-opener paths. Its source and unit-test blobs exactly preserve the corresponding files on the no-open-PR donor `fix/ghostpay-browser-acceptance-20261120-r3` at `2affd298c364c284d4d74f703fd4a612cc0f16d9`; the semantic supplement retains those blob comparisons.

**Disposition:** use one successor coordinated through the existing owners above #352, retain one intended runtime body, both unit-test groups and #354's browser assertions, then qualify that exact composition. Do not discard a test group because the runtime intent overlaps. The new exact-head CI observations were pending for all three PRs.

## Validation performed and limits

The reconciliation used local Git ancestry, complete merge-base diffs, tree/blob/mode comparisons, stable patch IDs, registry text/source indexing and read-only GitHub metadata/check/review collection. No product unit tests, builds, browser suites, live chain transactions or external acceptance checks were newly run by this reconciliation. Historical test evidence remains attached to the source and observation where it was produced.

An independent reviewer verified all **420 original branch rows and 64,073 donor path states**, all 120 current-base and 120 advertised-base PR diff records, and all 4,734 original overlap pairs. Regeneration with one worker versus four was byte-identical. A **12-branch/3-PR fixture** exercised squash equivalence, a cherry-pick followed by a revert, current content without ancestry, documentation-only empty changes, a main-only addition, a 305-path donor, sparse lock metadata, unrelated Pages history, an advanced parent, a retired parent and stale advertised base metadata.

The unchanged generator was then run on the final **423/123** snapshot. The separate final-cutoff review passed the three new donor path sets, their current and advertised PR diffs, immutable preservation of the original 120 qualification records and the new 47 check observations. The receipt distinguishes the original complete audit from the final delta audit. All **437 commit objects required by the frozen source pins** were present. See [independent-validation.json](independent-validation.json) and [validation.md](validation.md) for the retained receipts and hashes.

### Reproduce the source accounting

The generator uses Python's standard library and an existing full local Git mirror. Supply the saved snapshot and a mirror containing its pinned branch, main and advertised-base commit objects. It does not fetch, check out, modify refs or contact GitHub. From the repository root:

```sh
python docs/coordination/claims-20261120/build_branch_ledger.py \
  --snapshot docs/coordination/claims-20261120/source-snapshot.json \
  --git-dir /path/to/GhostPay.git \
  --output-dir /tmp/ghostpay-branch-reconciliation \
  --workers 4
```

Compare the three generated JSON files with the retained source/generator hashes. A new live inventory requires a new cutoff and observation phase; it must not silently replace source pins or old qualification evidence.

## Remaining actions after the completed census

1. **Reconcile the idle/backup composition through its existing lane.** Preserve #331's late source through #333/#335/#344, account for #307's newer and missing main repairs, and qualify the final combined source. Do not equate a merge into the old #325 branch with main or #307 adoption.
2. **Recover the existing Spec18 acceptance scope.** Coordinate the preserved #239/#240/#260 family and later candidates, retain #346's interoperability work, and verify against current session/idle handling. The six absent modules are concrete preserved source, not a request to rebuild the feature.
3. **Resolve overlapping work without erasing scope.** Treat F03 as represented in #307, #314/#319/#333 as one reconciled backup family, and #354/#355 as overlapping focus policy with complementary tests. Keep F04/F05/F10's dormant milestone boundaries and owners.
4. **Review the complete per-ref and per-PR dispositions.** The 78 mechanically unresolved branches are covered by separate human triage; their classification alone is not a finding of missing functionality. Address the six advanced-parent children, four retired bases and non-document overlaps using current ownership and source-specific acceptance criteria.
5. **Establish qualification on the eventual exact composition.** Resolve observed failures/pending jobs, execute applicable browser/external acceptance and obtain the required independent review. Five observed-success PRs and historical green reports do not establish general merge readiness. Recheck live heads and the integration lock before any later operational action.

The inventory and claim reconciliation are complete for the stated cutoff. Ownership, source incorporation, behavioral acceptance and permission to integrate remain separate decisions recorded through the existing workflow.
