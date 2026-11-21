# Qualified integration queue review

**Result:** reuse the already-qualified #328 source and preserve #331's existing
merge history. Neither is present in frozen #307. Refresh #307 with current main's
six product/test paths, then compose the existing dependent follow-ons only after
their actual source passes the required gates. #333 remains failed; #344 is its
existing test-synchronization successor. #338 already has independently reviewed
package qualification, while its donor CI and any final composition still need
their own completion. #339 and #341 are unique, disjoint package candidates;
#341 alone does not repair a browser feature in current #307.

This is an evidence snapshot under the existing ACTIVE_WORK registry, not a new
integration ledger or permission to change shared targets. The assigned
generation-11 lease owner remains `994a0d214fb9-root-r3`; this reviewer did not
acquire, release or change it. Root owns subsequent coordination and actions.

## Exact review boundaries

| Role | Immutable source |
| --- | --- |
| Review branch base | `5e882df84df70f1eca7a02b2079ab5e502cd76c0` |
| Main, independently re-read through GitHub ref API | `aec179910c39081d820396409ff3139ff2264132` |
| Integration PR #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| Last main ancestor incorporated by #307 | `bfebea0acf213a113d2740366fd592042661ca67` |
| Existing #328 qualification evidence | `b9911c7228e95a3f8a6666d10aae50bcda08bd7d` |
| Actual current Sweep branch ref after #331 | `2748c9bfd55bd226c7801c15a7acdd955ab70339` |

Worker: `/root/queue_review`; additional read-only hygiene source review:
`/root/queue_review/hygiene_source`. Dedicated branch:
`audit/ghostpay-qualified-queue-20261120-9a4ab6`.

The final PR/check/workflow refresh began **2026-11-20 23:49:33 UTC**. All nine
refreshed candidate heads remained unchanged. Reads are non-atomic; a table of
queued checks is an observation, not a prediction. Formal submitted reviews and
inline review threads were empty for #307, #328, #331, #333, #335, #338, #339,
#341 and #344. Existing independent reviews in committed evidence remain distinct
from GitHub's empty formal-review arrays.

## Current qualification snapshot

“Pending” counts both queued and in-progress check records. The three completed
conditional skips on older heads are the unchanged Pages release gate, deploy
and post-deployment smoke jobs. Inspection of #328's `.github/workflows/pages.yml`
confirms those jobs are publishing-dispatch conditions; they are not waived PR
tests. Newly started heads have only the first of those skips so far.

| PR / exact head prefix | Metadata state | Successful checks | Pending | Failed | Conditional skips | Workflow finding |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| #307 / `5a745d4b` | Open draft | 12 | 24 | 0 | 1 | CI, Pages and Integration queued; Tor running. Hosting, CLI, Beta and dynamic CodeQL succeeded. |
| #328 / `81598d93` | Closed, unmerged, draft | 36 | 0 | 0 | 3 | All five PR workflows and the additional dynamic CodeQL run succeeded. |
| #331 / `f5e04a30` | Merged into the older Sweep branch | 33 | 0 | 0 | 3 | All six PR workflows succeeded. |
| #333 / `3172a93c` | Open draft | 28 | 0 | 2 | 3 | CI failed; the other four workflows succeeded. |
| #335 / `e31a0905` | Open draft | 29 | 1 | 0 | 3 | CI aggregate remains queued; the other four workflows succeeded. |
| #338 / `692cac58` | Open draft | 28 | 7 | 0 | 3 | CI pending; the other five PR workflows and dynamic CodeQL succeeded. |
| #339 / `d03600ca` | Open draft | 16 | 18 | 0 | 3 | CI pending; the other four PR workflows and dynamic CodeQL succeeded. |
| #341 / `78137622` | Open draft | 12 | 19 | 0 | 3 | CI pending; the other five workflows succeeded. |
| #344 / `a88157b5` | Open draft | 2 | 26 | 0 | 1 | CI, Pages, Beta and Tor queued; direct lookup also confirms queued Hosting kit at this same head. |

Snyk's separate commit status was successful for every inspected head, including
#329, #334 and the already-incorporated #325. The #344 runs collection omitted
Hosting kit even though its check records were present; direct run
`44836839505` confirmed the same `a88157b5` head and queued state. This
collection omission is recorded rather than treated as an absent required gate.

The initial #307 CodeQL summary was neutral while its Actions-language analysis
was queued. The final refresh recorded successful dynamic CodeQL and no neutral
check. It is not carried forward as an unresolved failure.

Exact run IDs, check names, URLs, source SHAs, comments, status records and the
earlier CodeQL observation are preserved in
[QUEUE_REVIEW.github.json](QUEUE_REVIEW.github.json). Key run links:
[#328 CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44790328213),
[#331 CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44794764058),
[#333 failed CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44797683772),
[#344 pending CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836839436).

## #328: qualified source was closed without being incorporated

The PR remains pinned to
`81598d93dd82cc440526c866d42b55be0657895b`. Its discussion, formal reviews and
inline review threads are empty. The timeline contains its three source commits,
cross-references from #330 and #307, and a closure event at
`2026-11-20T23:05:07Z` with no associated commit or reason. There is no recorded
rejection or superseding implementation in that timeline. The reason for closure
cannot be inferred from silence.

Source comparison is decisive about incorporation:

| Object | Main and #307 | #328 |
| --- | --- | --- |
| `packages/ux-vault/src/vault.ts` | `2cb0dbee41ab47e4bba5dcb3c2246d5547af8bdb`, identical to the pre-fix base | `402da7d6761b0c19eedcb8c0f6af2996f9411f5e` |
| `vault.rekey-lock.test.ts` | Absent | Present |
| Source ancestry | #328 is an ancestor of neither target | Three-commit original history retained |

The existing correction captures the starting context and installs the new
context after persistence only while that same context still owns the session.
Both targets retain the old unconditional assignment. Searching the vault path
at all 111 frozen open-PR heads found no exact donor blob or exact donor assignment
guard. That bounded search is not a proof against every possible semantic rewrite,
but it found no competing copy that would justify discarding this donor.

The evidence commit `b9911c72` has **exact source parent `81598d93`** and
changes only three documentation paths. Its existing
[qualification report](https://github.com/djshellshoxxx/GhostPay/blob/b9911c7228e95a3f8a6666d10aae50bcda08bd7d/docs/consolidation/continuation-r2-20261120/VAULT_REKEY_QUALIFICATION.md)
records **285/285 original ux-vault tests, eight complete files, zero skips**,
unchanged coverage thresholds, successful original typecheck/lint/build, and
independent source approval. This reviewer inspected that record and source
identity and did **not** repeat the completed tests.

**Disposition:** reuse the original donor history and link its preserved evidence.
The closed PR should be reconciled explicitly by the integration owner; closure
must not be relabeled as either a successful merge or a source rejection. No
implementation rewrite or duplicate regression is needed. A new combined tree
requires its own applicable checks even though this donor is now qualified.

## #331 and the dependent backup/archive stack

#331's recorded merge commit is
`2748c9bfd55bd226c7801c15a7acdd955ab70339`, with ordered parents
`1788f1e0a0fe1fb22bb887427c47bdd62db78c1a` and
`f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`. Its tree is
`9cf5006b14404c3d96ea0d040a42b5feab8d87ca`, exactly the qualified #331 tree.
GitHub's live Sweep ref points to that merge. Neither the merge nor the source
head is an ancestor of #307 or main.

The 18 changed paths under application directories between #325 and #331 include
runtime, tests, catalogs and `apps/web/DEVIATIONS.md`. Every corresponding #307
entry still equals #331's base entry, so none of this follow-on is present as an
identical final blob. The actual runtime changes add session-owned expiry,
synchronous authority revocation and a restricted encrypted-backup recovery path.
The preserved #331 evidence records 3,155 original web tests passed and 13
unchanged optional skips; its completed hosted gates belong to that source,
not to the later backup/archive revisions.

The exact source chain is:

| Contribution | Exact head | Actual dependency |
| --- | --- | --- |
| Idle/session authority (#331) | `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` | #325 `1788f1e0` |
| Backup preflight/write ownership (#333) | `3172a93ceb8fce5a4343a93b453dcc0e68f09d87` | #331 head is an ancestor |
| Receipt archive identity (#335) | `e31a090501b3f5e77afcee812323e6f69e1fd565` | #333 head is an ancestor |
| Request-file completion synchronization (#344) | `a88157b53d1e0925350d5c8db047eabb4365f4e9` | #335 head is an ancestor |

Within this queue, the only shared product path is `SellerKeys.tsx` between
#331 and #333. #333's complete runtime blob includes #331's recovery behavior
plus the subsequent synchronous write ownership and unlock-preflight changes.
Replaying an older #314/#319 implementation independently would bypass this
already-reviewed composition. #335 changes `ReceiptPanel.tsx` and two tests;
its base runtime entry still equals #307's runtime entry, and its reviewed diff
preserves the current print helper while giving archive completion its own
receipt identity and pending-write lifetime.

### The failed gate is identified, and its successor already exists

The original #333 web job
[`136548344602`](https://github.com/djshellshoxxx/GhostPay/actions/runs/44797683772/job/136548344602)
failed in the request-file passphrase test while the rendered UI still reported
“Opening invoice…” / “Reading invoice…”. Its own result was **3,180 passed,
one failed, one skipped**. The second failed check, `typescript`, is the
aggregate result job: its log reports a failed required dependency. It is not
evidence of a separate TypeScript compiler defect.

#344 adds nine lines to the existing request-file test, awaiting its actual
submitted decryption promise through a call-through spy and asynchronous `act`.
The real KDF operation, original assertions, 15-second DOM timeout and 60-second
test timeout remain. No production file changes. Source inspection confirms this
bounded synchronization change; its existing report records 163 passing Pay
compatibility cases, typecheck, serial lint and build. Its focused coverage
subset exits and first killed lint attempt remain documented, and are not
called a full-web pass.

**Disposition:** preserve #331's actual merge and the complete
#333 → #335 → #344 ancestry. Do not separately promote the failed #333 head on
the strength of #331's results. Qualify the corrected descendant source, then
integrate that source or advance the existing stack under the current owner.
A passing descendant can qualify the retained earlier changes in that exact
composition; it does not rewrite the historical failed #333 outcome.

## Current main: preserve #329 and #334 before final composition

Main `aec17991` contains #329 at merge
`784b445f6bc5c641e8e85d4e28b730e044791f40` and #334 at the main head itself.
Their original donor heads are `cff631b5c32a86adfa2d79c342e497e91a8573a5`
and `9dcd2d88ff32060e519ef18e2d8753691b56abc1`. The inspected donor gates are
green: #329 has 32 successful checks/three conditional skips; #334 has 36/three.

Since #307's last incorporated main, these are the six changed product/test paths:

- TRON: `packages/tron-adapter/src/rpc.ts`, `scan.test.ts`,
  `apps/web/src/features/tron/chain.hardening.test.ts` and `fixtures.testutil.ts`.
- Fee-cap validation: `packages/metadata-hardening/src/btc.ts` and
  `btc.fee-policy.test.ts`.

All six #307 entries remain identical to the common base. None overlaps the
narrow queue's changed product paths. Preserve the current-main ancestry and
the complete range fixtures when preparing the next composition. This is a
source/path finding; no merge simulation, new composed tree or runtime validation
is claimed. Documentation conflicts, especially additive ACTIVE_WORK claims,
still need ownership-preserving resolution.

The separate #340 → #342 TRON stack is outside this bounded review and overlaps
the already-merged TRON hardening test. Its existing owner must reconcile that
fixture before any later addition; do not restore the older incomplete-range
behavior while importing a genesis guard.

## #338: reuse authoritative PR and already-completed package evidence

#338 remains the authoritative feature PR at
`692cac58b1c345137264936e60bee7b1e2eed8b2`. Its two product/test paths are
missing from both targets as corrected blobs. The frozen full census found no
other open PR owning those two paths.

The existing security worker qualified application/test source
`cd5f01ff1d6fef2041654d213509d1a1ec3e0be6`, preserving the donor's exact
`spend.ts` blob `4bd08c0b56f7321e0ea06941e4f48e0659f66273` and regression
blob `8ffcf80a6a37178fe36ada08340e58fb43926a17`, both mode `100644`.
This reviewer independently compared those tuples. The committed
[qualification report](SECURITY_BTC_QUALIFICATION.md), preserved locally at
evidence commit `c536f998eceefa6bd87f8066f904db7ced4b7071` with publication
coordinator-owned, and [independent source review](BRANCH_BTC_PREVIEW_REVIEW.md)
record:

- Complete package coverage: **563/563 tests, 33 complete files, zero skips**.
- Original package typecheck, build and typed lint passed on unchanged source.
- Default-concurrency coverage and the 768-MiB lint attempt exited 137; the
  single-worker complete coverage run and 384-MiB lint run passed. Those attempts
  remain separate, with no source, assertion or coverage-threshold relaxation.

These results qualify that package composition. They neither turn pending donor
CI into success nor qualify a future combined integration/browser artifact.
#334's fee-cap change is in a separate package, so it is not a prerequisite of
the preview validation call. Preserve and reuse the original #338 source rather
than opening a competing implementation.

## #339 and #341: unique package work with a browser-scope correction

The independent hygiene review found no source obstacle to preserving these
two disjoint candidate histories. Both remain subject to their pending CI and
package/composition qualification.

**#339:** both targets retain old `verify.ts` blob
`7bbcbe44b385053f5308e1cfa380e2655eef95d1`; the donor's corrected blob is
`46f2c12c7418e84cf019f1e8b9ac4156683adba9`. The final delta is four package
source/test paths. It validates returned event consistency against the requested
token/range and canonical identity, deduplicates repeated identities, and discards
conflicting identities. This is not independent chain-finality evidence.

Preserve the complete `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4` source
history, including the corrections after initial runtime commit `951cd589`.
Final runtime narrowing is `44d9a35a`; final test correction is
`ab7640f7`. All later changes through `d03600ca` affect only its handoff
document, despite their receipt/privacy discussion. Importing just the first
runtime commit would omit those corrections.

**#341:** both targets retain old `ledger.ts` blob
`05d7f8eb0cb723266eac7a9a644053e29c2d653c`; the new blob is
`7bc637d024db317e12bc08847d19e8348e4cbcd9`. The correction and new regression
are the only two product paths. It uses the already-declared chain-adapters
dependency and existing `findChain` export to apply enabled/testnet policy to
the ledger while preserving the shared narrow PoC RPC guard.

The PR handoff's assertion that the current #307 browser already consumes this
ledger is unsupported. Both current #307 and #341's own `apps/web` tree have
zero references to `DestLedger`, `@ghostpay/hygiene`, `linkedSources` or
`recordAcknowledgedReuse`. The browser caller exists in the separate privacy
stack, including #326 `a34ce43e296e302e3e65ed077ea8ac892c5189a1`, whose
web dependency and Sweep helper references were independently confirmed here.
The #326 → #327 → #336 sources still carry the old ledger blob.

**Disposition:** #339 and #341 may qualify independently as package corrections.
Compose #341 before or with the eventual owner-controlled privacy stack, and
qualify its actual warning UI on that combined source. Package tests alone must
not be described as restoring current #307 browser warnings or proving encrypted
backup/browser acceptance.

## Actionable order and remaining gates

1. Let current-head #307 checks complete or prepare its isolated successor under
   the existing owner; retain current main `aec17991` and all six main changes.
   Preserve the old #307 head and evidence rather than overwriting its history.
2. Reconcile closed #328 and reuse its complete original source with the
   `b9911c72` evidence pointer. Existing package/hosted success needs no duplicate
   test execution here. Qualify the resulting composition at its own head.
3. Preserve #331's actual merge record and the ordered dependent stack. Treat
   #344 as the existing corrected descendant to qualify for backup/archive work;
   keep #333's failed head unpromoted.
4. Add the independently reviewed #338 source when its applicable donor and
   resulting-head gates permit; carry forward the existing 563-case evidence.
   Its paths are independent of the main, vault and backup/archive contributions.
5. Continue #339/#341 under their present owners. Preserve their complete narrow
   histories, finish package/hosted checks, and reserve #341 browser claims for
   the actual privacy-stack composition.

These independent source contributions do not impose an artificial serial order
on unrelated qualification work. The mandatory source ordering is the existing
idle → backup → archive → request-file chain; the six current-main changes must
survive every eventual composition. Final integration must recheck live source
heads, active ownership, donor evidence, applicable required checks and the
actual resulting tree. Neither an empty review array nor GitHub's computed
mergeability is a substitute for those gates.

## Evidence and verification

- [QUEUE_REVIEW.github.json](QUEUE_REVIEW.github.json): exact metadata/check/run
  observations, #328 closure timeline, failed #333 job steps and bounded original
  log excerpts. The connector rejected the annotations endpoint; job logs and
  step metadata supplied the actual failure evidence.
- [QUEUE_REVIEW.source.json](QUEUE_REVIEW.source.json): complete donor-changed
  path lists, source/base/target mode-and-blob tuples, ancestry/merge bases,
  overlap matrix, exact evidence-parent checks and bounded open-PR/caller searches.
- [BRANCH_REVIEW.md](BRANCH_REVIEW.md) and its frozen 111-PR/410-ref census remain
  the prior inventory evidence; this bounded review does not replace that census.

Only this report, its two evidence files and an additive ACTIVE_WORK claim were
written. Git object inspection, JSON validation and whitespace checks are review
verification, not product-test execution. No tests, exploit reproduction,
production edits, remote messages, push, lease mutation, merge, release or
deployment were performed.
