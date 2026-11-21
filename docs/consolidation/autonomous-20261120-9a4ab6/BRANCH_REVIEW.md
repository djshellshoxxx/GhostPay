# GhostPay immutable branch census and recovery review

Date: 20 November 2026 (Pacific). Worker: `/root/branch_recovery`.
Task branch: `codex/ghostpay-census-20261120-9a4ab6`.
This evidence extends the existing `docs/ai/ACTIVE_WORK.md` registry and preserves
the original 392-branch census. No branch, PR, lock or shared target was changed.

## Frozen sources and completed work

- Main: `aec179910c39081d820396409ff3139ff2264132`.
- Integration PR #307: `5a745d4b5fba69b66a9779f88aefc63c253a4f27`.
- Worker base: `95a1e93c62bbc378e02716a23c05a1993d0f79db` (ownership-only
  successor of the frozen integration source).
- **410 remote branch heads** were frozen in one local ref snapshot, excluding
  symbolic `origin/HEAD`. The full clone avoids the GitHub comparison API's
  changed-file cap. There are **18 new branch names** and **zero missing names**
  relative to the preserved 392-branch snapshot.
- Every related branch was compared with both exact target SHAs: ancestry,
  ahead/behind, all best merge bases, patch equivalence, final mode/blob identity
  for donor-changed application paths, and identical complete/application trees.
- **111 open PRs** were enumerated through four disjoint creation-date searches
  returning 8, 27, 32 and 44 results. Each result set was below the 100-item cap.
  Exact PR head/base metadata was fetched for every PR. All 111 corresponding
  local changed-file comparisons completed without missing objects or errors.

## Mechanical classification

| Classification | Main | PR #307 |
| --- | ---: | ---: |
| Ancestor or equal | 189 | 199 |
| Documentation or nonapplication delta | 79 | 79 |
| All donor-changed application mode/blob tuples retained | 7 | 12 |
| Application differences requiring semantic review | 133 | 118 |
| Coordination metadata; never merge as application source | 1 | 1 |
| Unrelated publication history (`gh-pages`) | 1 | 1 |
| Total | 410 | 410 |

Of the historical **138** application candidates, comparison with #307 now finds
14 ancestors, 11 documentation/nonapplication deltas, 11 with every changed
application blob retained, 1 coordination-only metadata ref, and 101 remaining
application-difference candidates. These are branch classifications, not distinct
feature counts, completion percentages or merger qualifications.

The full-tree fingerprints identify **5 identical-tree groups**; application-tree
fingerprints identify **38 groups**. Patch-ID matches occur on 51 branches against
each target, representing 45 distinct matched commit IDs against main and 47
against #307. Neither identical patch IDs nor ahead counts captures every squash,
composed fix or superseding implementation; the exact blob and source review
steps are needed as well. An ancestor classification establishes history only;
it does not prove that later changes never regressed an older feature.

Multiple best merge bases occur in 13 main comparisons and 43 #307 comparisons.
The generator compares **every** best base and records a conservative union of
changed paths, together with each base's path count. It neither selects an
arbitrary merge base nor claims a merge simulation succeeded. The authoritative
integration-lock ref is explicitly classified as coordination metadata even
though its metadata-only tree mechanically differs from historical product code.

## Source-reviewed duplication and supersession

These dispositions were checked against actual source on frozen #307. No test
execution is claimed by this inventory worker.

| Donor branch / short immutable head | Source finding | Disposition |
| --- | --- | --- |
| `chatgpt/ghostpay-rpc-filter-guard-20261114` / `dfed84c18b`; `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` / `cf5e876ce1`; `chatgpt/zero-codex/pages-scan-transfer-filter-20261114` / `7b6c4983e5` | `scanSpam.ts` already binds returned transfer emitter and block range to the request; small comment or later adjacent changes explain different whole-file blobs. | Behavior retained; do not implement three more copies. |
| `chatgpt/zero-codex/pages-negative-fiat-regression-20261114` / `9bdc9cbade` | `formatFiat` already separates sign and absolute minor-unit magnitude before integer division and remainder formatting. | Behavior retained; later parsing guards account for file differences. |
| `codex/ghostpay-cloud-41868394956` / `f34a80f710` | `validateLineItems` already uses `Array.from` so holes are visited; `schema.test.ts` retains the missing-slot regression. | Behavior and regression retained. |
| `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117` / `8aed22ad44` | Current `TagArchive.test.tsx` retains cleanup and adds explicit failed-download/backup-checklist assertions. | Superseded by stronger current regression. |
| `claude/vigilant-johnson-yjgq94` / `4403d3703c` | Current settings test already expects unverified-download keys to remain loaded with a warning. | Behavior covered by current wording. |
| `fix/remediation-b16c7936-5ce634` / `0b213bd9d4` | Current `scanClient.ts` passes page matches to checkpoint selection and adds an above-floor condition, allowing a replay without indefinitely pinning resumed scans. | Older patch is superseded; replacing current code would discard the floor safeguard. |
| PR #289 / `856b2d60fd` | Base64 runtime guard retained; test difference removes an unused callback parameter. | Equivalent fix with lint-compatible current test. |
| PR #265 / `c591b54078` | Current canonical arrays capture data descriptors, reject accessor elements, and avoid overridden map/get traps, extending dense-array/extra-key checks. | Superseded by the stronger current canonicalizer. |
| `automation/20261120T0035Z/worker/qr-kind-primitives` / `17333ceda7` | Current QR type guard has the same primitive/own-key rejection; tests cover all eight flag combinations and hostile coercion getters. | Runtime equivalent and current regression coverage broader. |
| `fix/remediation-f95457fd-22ecf9` / `6b3e689c15` | Proposed legacy detection labels every differing payer/chain key as legacy, blocking legitimate later payment scopes. Existing rejection and test evidence are preserved in `docs/consolidation/main-unique-code-20261120/recovered-fixes/REPORT.md`. | Intentionally rejected; never restore this patch as a missing safeguard. |

Twelve additional branches have every donor-changed application mode/blob tuple
retained at #307; their exact paths and hashes are mechanically represented in
the lossless details file. This scoped result does not assert all documentation,
workflows or historical behavior on those branches is redundant.

## Recovery candidates and dependency order

| Source | Verified relationship or missing contribution | Next action under existing ownership |
| --- | --- | --- |
| #325 `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a` | Is an ancestor of frozen #307; Sweep consent/signing lifetime is already incorporated. | Preserve; no duplicate implementation. |
| Main `aec179910c39081d820396409ff3139ff2264132` | Adds #329 complete TRON ranges and #334 fee-cap validation after #307's incorporated main `bfebea0a`. | Reconcile qualified main changes into a future combined candidate through the lease holder. |
| Closed unmerged #328 `81598d93dd82cc440526c866d42b55be0657895b` | Neither main nor #307 contains its guarded post-await vault context assignment. Evidence successor `b9911c7228e95a3f8a6666d10aae50bcda08bd7d` preserves qualification work. | Preserve as an unintegrated safety fix; review/qualify existing source, do not mistake closed status for incorporation. |
| Merged #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` | Merged into its earlier Sweep stack, but is **not** an ancestor of frozen #307 or main. | Retain idle-session work and follow its existing stack; “merged” alone does not mean the authoritative candidate includes it. |
| #333 `3172a93ceb8fce5a4343a93b453dcc0e68f09d87` → #335 `e31a090501b3f5e77afcee812323e6f69e1fd565` → #344 `a88157b53d1e0925350d5c8db047eabb4365f4e9` | Existing continuation for backup preflight, receipt identity, and real decryption-completion test synchronization. | Complete its owner-controlled qualification and integrate in dependency order, including idle-session ancestry. Do not independently replay overlapping #314/#319/#332 fixes. |
| #338 `692cac58b1c345137264936e60bee7b1e2eed8b2` | Existing narrow Bitcoin preview network validation and deterministic tests. Only open PR owning the two source/test paths. | Current security worker reuses exact donor blobs; independent source review is in `BRANCH_BTC_PREVIEW_REVIEW.md`. |
| #339 `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4` | Existing hygiene Transfer evidence token/range/identity binding and deduplication. | Preserve focused owner branch and qualify before integration; do not equate address reuse warnings with settlement proof. |
| #340 `f9344a16fdefd1151189d8fd613ef3d1ca6a75c4` → #342 `06fd87c3e90000118ffa94048529db36f0a67d41` | Selected TRON genesis guard plus legacy test-call compatibility repair. | Preserve parent ordering and reconcile `chain.hardening.test.ts` with already-merged #329. |
| #341 `78137622011528a646ae94155ee4acf7f72e1e2a` | Existing session-only reuse ledger support across enabled EVM testnets. | Reuse focused source; final combined-source checks remain separate from donor CI. |
| #326 → #327 → #336 | Active required-privacy, retention reconciliation, and wallet-consent browser-test stack. | Continue current ownership and protect sole-copy recovery/uncertain transaction state; no duplicate stack. |
| #310, #322, #323, #324 | Signed invoice functionality overlaps #307; merchant projection, offline receipt assurance and recurring-preview modules remain separate active branches. | Reconcile F03 overlap. Continue F04/F05/F10 with existing owners; module exports alone are not proof of a complete UI or payment/recovery guarantee. |

This is a bounded semantic review of priority and small-difference candidates,
plus a complete mechanical inventory. The remaining broad donors retain explicit
semantic-review and qualification work. No whole-repository feature-completion
percentage can be derived honestly from branch counts.

## Ownership checks and evidence access

The 111-PR exact-source overlap check found no open PR changing
`apps/web/src/lib/sweepAttemptJournal.ts` or the proposed strict-JSON regression
path. It found only #338 touching the Bitcoin spend preview source/test, and no
open PR changing the already-merged metadata-hardening fee-cap source/test. Root
approved the workers' isolated scopes and received those results before edits.

- `BRANCH_FROZEN_REFS.json`: original 410 immutable branch-name/head pairs.
- `BRANCH_CENSUS.json`: readable index, summaries, groups and detail hashes.
- `BRANCH_CENSUS_DETAILS.json.gz`: lossless compact JSON containing complete path
  lists and patch-equivalent/unique commit IDs. Standard-library gzip; no extra
  package required. The index records compressed/uncompressed SHA-256 hashes.
- `BRANCH_CENSUS_GENERATOR.py`: reruns comparisons against the existing frozen
  refs file without changing branches, working trees, remote refs or the lease.
- `BRANCH_OPEN_PRS.json`: all 111 pinned PRs, creation-window completeness and
  the exact owned-path overlap results. Bodies are left out to avoid duplicating
  historical ledgers and handoffs.

Validation: all Git comparisons completed, both classification totals equal 410,
the preserved historical subset contains 138 refs, no prior branch name is lost,
and the compressed detail hashes/index are checked before commit. Source review
is not a product-test pass, donor CI is not combined-candidate CI, and this worker
did not merge, publish a release, deploy or perform a live transaction.
