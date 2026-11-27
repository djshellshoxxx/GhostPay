# P14 F3: source-bound indexer completion disclosure — 2026-11-27 UTC

Branch: `finish/p14-indexer-completion-20261127-d81a`. Coordinator: ChatGPT
`d81aef3d1ca8`. This is a source and local-qualification checkpoint, not a claim of
completed F3 integration. The associated PR must record the final published head,
required reviews/checks, integration state, merge SHA and resulting-main checks.

## Provenance and ownership

This completes an **already-integrated incomplete P14 contract**, not newly recovered
unmerged donor functionality. Source: [#658](https://github.com/djshellshoxxx/GhostPay/pull/658),
`claude/priv-t02-rpc-disclosure`, head `9aed3886693270524beb118685e5947469899c43`;
original tested evidence `2ab3b243a57bb4e917fb6b9848f78a2a4347d312`. Acceptance derives
from [Spec 10](../specs/10-feature5-stage1-private-scanning.md) and finding F3 in the
[privacy evidence matrix](../research/privacy-evidence-matrix-2026-11-10.md).

Published ownership claim: `c11cbf5ff3abe94b64a1ee3f3538ff65e4d63218`. Separate
worktrees own the completion runtime/catalog keys, new component tests and new
browser test; one coordinator integrates. This handoff has a separate docs-only
worker. The coordinator owns the evidence-matrix, tracker and ACTIVE_WORK updates.

The refreshed heads were #720 `4f84e8190b31e9f86004c2d716dbd0b424b44776`,
#724 `2085ef4483d6387c4301a48c625e9e74c1042c4e`, and
#728 `298257fd251cf0dd64dc80a92198d296672a6cab`. Exact changes, claims and discussions
showed no competing F3 completion hunk. #720's manifest tests and #728's cover/route
work remain owned. The two existing Cancelled queries in `Scan.test.tsx` were
separately claimed after review confirmed that these queries and their surrounding
cancellation cases were outside those owners' changes; no manifest test was edited.

## Completed behavior and acceptance

The run's captured `plan.indexerUrl` selects an additive completion descriptor:

> An indexer can omit announcements even when block hashes match. These results may be missing payments.

The same non-sensitive caveat is included in the accessible completion announcement.
Later settings changes cannot relabel a completed result's source. RPC-source
completion has no indexer caveat even when an indexer URL is saved. Descriptors
retranslate without scanning again or writing checkpoints. The four catalogs
(`en`, `es`, `ja`, `ar`) contain the additive key in the existing security group;
non-English translations remain machine drafts under the unchanged native-review
and English security-fallback gate.

The touched post-run announcement previously said "Scan finished." after cancellation.
It now selects the existing `scan.done.cancelledEarly` before the limit/finished
selector, preserving the intended cancelled outcome. No cancellation key, count,
control flow or automatic-recheck behavior was added. Existing early-exit/error
paths remain unchanged.

| Acceptance boundary | Evidence retained by the tests |
|---|---|
| Omission within genuine headers | Real indexer/scanner path reports zero results with the caveat outside closed disclosure details; hashes do not establish completeness. |
| Returned payment evidence | Verified, claimed and pending results, counts, visible evidence and checkpoints retain their existing meanings. |
| Source and language changes | Both source directions preserve the completed result; unreviewed locales retain English security text; a test-only reviewed locale exercises descriptor translation and pending completion without replay. |
| Cancellation and safety limit | First-page evidence and resumable checkpoints remain; the unprocessed payment stays absent; cancellation terminates the worker and announces cancellation; safety-limit wording/counts remain distinct. |
| Invalid headers or changed route | Errors remain errors, with no invented completion, checkpoint or silent announcement-source fallback. |
| Existing cancellation guards | Both pending reconciliation cases still require no vault write; worker cancellation still requires termination and a cancel message. Separate visible-outcome/live-status assertions also reject "Scan finished." |

No new source, hosted service, verifier, contract, chain, storage format, dependency,
default privacy mode or experimental activation is introduced. Evidence authenticity,
checkpoint behavior, route/session guards and signing/submission authorization are
not relaxed. The caveat provides disclosure, not an omission detector or a proof of
complete payment history.

## Source checkpoints and actual local results

- Runtime/catalog source commits: `8e759f909d10fda4ce958f6ca050ee02bb0fb282` and
  cancellation follow-up `cfa09cdff90a55cfeaa0411942d39815602367ed`.
- New component tests: `a9c5ae96aee5cea3e45ee70f07bfaeefe67ee54c`.
- New browser test: `bb33bb6a602cfc560d6366130bdbfc46ac8ac65d`.
- Existing cancellation-query clarification: `603b09bef5abf878b71848d8cbeff12302664cbf`.
- Locally qualified combined checkpoint: `a7dc365eb60d82584da722713453a594be954fc0`,
  tree `6eddf87796c679adc865d40aa86e3959a1ea40c4`.

These are recorded runs, with overlapping suites; their counts must not be summed
as independent coverage. All fixtures use synthetic payments and local mock
transports, with no funds or third-party runtime targets.

| Check | Actual result |
|---|---|
| Existing focused baseline | 21 passed. |
| New component suite against old runtime | 10 failed, 4 passed; the missing disclosure/cancellation semantics were exposed. |
| New component suite after repair | 14 passed. |
| Integrated `Scan.test.tsx`, `Scan.indexerCompletion.test.tsx`, `Scan.caughtUp.test.tsx` | 48 passed. |
| Seven privacy/i18n suites | 75 passed. |
| Independent runtime verification | 35 passed; overlaps the above coverage. |
| Independent runtime, new-test and cancellation-query reviews | No blocking finding in the reviewed scope; AI reviews, not external professional approval. |
| Full web typecheck and lint | Passed. |
| Lean build and bundle scan | Passed; bundle scan covered 18 files. |
| Secret and whitespace checks | Passed. |
| Catalog validation | Four catalogs, zero errors, 988 existing warnings. |
| Translation extraction | 2,438 used keys, zero missing, 174 unused. |

## Browser qualification and open limit

The two baseline browser cases failed for the missing caveat. After the repair,
six targeted cases passed at `9d8be1d007c0cd176bdceaac930311b3986387c0`, tree
`dd5127a6632b253f1ae03587844f146dfbc52c78`, web tree
`b0d8c9821a834a074bb39ea20aa5968f27d33dee`. Each engine exercised 1280px English and
320px Arabic RTL, using the actual bundled scanner worker and settings/scan UI.
The tests checked the closed disclosure, visible caveat, public indexer query shape,
allowed request origins, wrapping and horizontal overflow. The completion runtime,
catalog/security-key and new browser-test blobs are unchanged between that browser
checkpoint and the locally qualified combined checkpoint above.

| Engine actually run | Qualification detail |
|---|---|
| Chrome `151.0.7922.34` | Available-browser fallback; the locked Chromium download returned HTTP 403. This is not a locked Chromium execution. |
| Firefox `157`, revision `1555` | Locked browser build. |
| WebKit `27.2`, revision `2370` | Locked browser build; `bypassCSP: false`. |

**OPEN: separate baseline WebKit inline-style CSP finding.** WebKit recorded nine
inline-style CSP rejections per case. Six passing targeted cases do **not** mean
zero CSP violations, and this test does not enforce a clean CSP/console log. Keep
that finding open and separately qualified; do not infer that F3 caused or repaired
it. No physical devices, external wallets, deployed site or live Tor path were tested.
No live provider or operator-privacy qualification is claimed.

## Integration state and precise resumption

- F2 [#745](https://github.com/djshellshoxxx/GhostPay/pull/745) merged as
  `3c9fc0ab518b8a308716dc87cc860424118718eb`; all 41 resulting-main checks passed.
- F4 [#747](https://github.com/djshellshoxxx/GhostPay/pull/747) merged as
  `6b323a99df1238cb5ebe7248528cc7bce5140e80`, tree
  `964bbe42e35ae8cf71a554e09261c01f1acb0dcd`. Candidate
  `1308f18574c78bdfd5602337c1c27a2c87a27d34` had 42 checks: 39 successes and three
  expected publishing skips. **F4 resulting-main checks were RUNNING at this
  checkpoint; they are not claimed complete here.**
- Historical lease only: generation 67, owner
  `chatgpt-d81aef3d1ca8-p14-integration`, renewal ref
  `29787d2a08a4e7d421863eda3defbdd8149aec25`, expiry
  `2026-11-27T05:34:09.559Z`. This record is not current lock authority. Re-fetch and
  validate the live lock state under its stored protocol before integration.

Next: verify F4's resulting-main checks, re-fetch main/source heads and ownership,
publish the final F3 candidate and supporting record, and run all applicable hosted
checks against the exact required candidate/integration state. Resolve blocking
findings and required reviews, validate/acquire or renew the integration lease, then
merge only when every applicable gate passes. Record the final PR/head/merge and
verify resulting main before advancing the queue. Refresh uniqueness after merging.
The separate WebKit finding remains open until its own source-backed resolution.

The remaining queue retains active ownership of journal/refund work, offline drafts
(#717/#728), and diagnostics (#442); timestamps #383/#587/#609 remain owner-deferred.
Already-represented/superseded residuals include #541, #616, the CryptoKey variable-name
change, #419 via #422, and #127/#126/#125 via #189 plus later independent changes.
These dispositions are evidence to refresh, not permission to take another worker's
paths. Preserve initial dirty local work, donor refs and all 34 frozen archive refs.

All ten stopped streams remain excluded: F01 GhostTips, F02 GhostStore, F04 merchant
dashboard/analytics, F08 GhostID, F09 GhostPOS, F11 GhostTeams, F12 GhostBridge/P2P-Offramp
integration, F13 fiat conversion, P07 encrypted device synchronization, and F14
multi-chain routing. P14 RPC provider disclosure remains included. Follow the current
[owner directive](../ai/STOP_WORK_20261125.md) and newer explicit owner decisions;
this handoff authorizes no stopped-product completion or activation.
