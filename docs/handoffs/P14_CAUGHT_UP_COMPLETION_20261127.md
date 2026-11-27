# P14 F4: truthful scanner completion — 2026-11-27 UTC

PR: [#747](https://github.com/djshellshoxxx/GhostPay/pull/747). Branch:
`finish/p14-caught-up-20261127-d81a`.

## Source, ownership and integration order

This repairs an **already-integrated incomplete P14 contract**, not newly recovered
unmerged functionality. Provenance: #658, `claude/priv-t02-rpc-disclosure`, head
`9aed3886693270524beb118685e5947469899c43`; original PRIV-06 regression
`28725635c3c1f2f56a609533515115c6c4ec27b5`. Initial main was
`9ae770203d69d23bdc8735912dfe98af5944d4d6`. Current main
`3f7fcd0a7042eef0f03f1b513bb65f1037998c07` adds #746's session/import tests.

The refreshed 154-PR inventory and subsequent updated/new PRs found eleven runtime
heads with the same terminal defect and no competing F4 implementation. P14 F1
explicitly leaves F2-F4 unclaimed. Existing #696/#728 cover/replay hunks and #720's
manifest verification tests remain owned. The new `Scan.caughtUp.test.tsx` avoids
editing #720's existing `Scan.test.tsx`.

This candidate includes #745 head `84d95d627750fc80dd1b496429c3942f49101c6b` by
ordinary merge, so the integration tree can qualify together. **Merge #745 first**,
verify resulting main and applicable checks, then qualify #747's unchanged final
tree against that main. Do not merge the combined branch ahead of its prerequisite.
All original source branches and frozen archive refs remain unchanged.

## Defect and completed behavior

A secondary RPC can cap fetching below the primary's observed head without
`fetchAnnouncements` reporting truncation. Previously that made `caughtUp` true.
The separate lag diagnostic applies only when the gap exceeds finality depth.

The older F4 statement that Scan did not consume this flag is stale. Current
`Scan.tsx` uses it to qualify late-payment review. A one-block lag could therefore
enable that review without the separate lag warning. Existing explicit acceptance
still reverified the transaction; this finding does not demonstrate fund loss.

The terminal flag now requires both an untruncated fetch and
`cursor.nextBlock > res.head`, where `res.head` is the primary provider's observed
head for that page. Its documentation explicitly excludes proof of complete history,
log inclusion/completeness, durable storage and the latest live tip. A selected start
cursor may already be beyond that observed head.

The original `if (!res.truncated) break` remains: a lagged run ends instead of polling
the same empty terminal page. Fetch bounds, returned observations, finality replay
tails, checkpoint ownership, discrepancy handling, lag threshold, reorg processing,
budgets and session/route guards are unchanged. No RPC calls, signing, submission,
contract, chain, storage format or feature activation were added.

## Acceptance evidence

- Lag of one block, exactly finality depth and a larger amount all report false.
  Exact request windows, payment IDs, cursor, checkpoint histories and lag threshold
  remain asserted. Bounded page counts detect an accidental retry loop.
- No-secondary, equal-head and ahead-secondary controls retain true at the observed
  primary head. Existing limits, backlog, disagreement, failed-head and cancellation
  regressions remain intact.
- A lagged scan keeps earlier observations and a replay checkpoint. A later scan
  re-verifies the retained tip observation and discovers a previously unscanned payment.
- The real mounted Scan journey, real scanner/worker logic and encrypted reconciliation
  vault preserve verified evidence while a one-block lag withholds late acceptance.
  An explicit rescan of the payment range after the secondary catches up restores the
  action. No decision is persisted automatically: the seller's click rechecks receipts
  through both providers before storing the deterministic decision timestamp.

All fixtures are synthetic and local. The UI test freezes Date while retaining real
asynchronous timers, uses disposable keys and in-memory guarded CAS storage, and wraps
both mock RPCs in the existing manifest fixture. It does not mock `runScan` or remove
its verification/persistence logic. Its soft assertion still fails the test on the
old incorrect button, while allowing the positive recovery path to run.

## Actual verification

Pinned Node **22.23.5**, npm **10.9.9**, original lockfile; no dependency upgrades.
Runtime commit `234cd96c8`; independent unit test source
`49081a3726f51612748f2b3075fba1d0a81a0869`; UI test source
`ff616b9b4172141ba67f8c3e7ed99b6909383e34`. Reviewed composition:
`54cc6fa58205784bfbd05c6b8bdded4a8e93efe8`.

| Check | Actual result |
| --- | --- |
| Original checkpoint suite | 54 passed |
| Revised checkpoint suite against unchanged runtime | **55 passed, 4 failed**, only expected-false/actual-true completion labels |
| New seller journey against unchanged runtime | **1 failed**, incorrect late-acceptance action; subsequent recovery assertions passed |
| Corrected checkpoint + new UI + existing Scan suites | **93 passed**, 3 files |
| Existing scanner, ownership and disclosure suites | **188 passed**, 5 files |
| Combined #745/#746/F4 web verification | **303 passed**, 10 files, no skips/failures |
| Combined complete scan-source suite | **125 passed**, 10 files, existing coverage gates passed |
| Web typecheck, lint and lean build/bundle scan | Passed; typecheck repeated after combining #745/#746 |
| Scan-source build after combining #745 | Passed |
| Secret scan and whitespace checks | Passed |
| Independent AI review | No blocking findings; independently repeated **60 tests**, 2 files |

Combined scan-source coverage: 98.64% statements, 95.45% branches, 100% functions/lines.
Independent review confirmed bounded termination, retained evidence/recovery, strict
decision authorization, existing session/route guards, and regression strength. It is
AI source review, not external professional approval.

Current-head hosted gates, final main integration and post-merge checks remain pending
at this source checkpoint. The PR is the live record for exact published/merge SHAs and
gate results. Do not infer merge or release approval from these local results.

## Browser qualification limit

The shared RPC-backed scan journey and Settings layouts were additionally exercised
during #745 qualification: 8 passed and 1 WebKit failure. The same unchanged scan test
fails on main `9ae77020` with the same six inline-style CSP violations; source attribution
is unresolved. See [the exact comparison](https://github.com/djshellshoxxx/GhostPay/pull/745#issuecomment-7209052906).
That baseline finding is not waived or described as a passing WebKit journey.
Those browser runs are not claimed as an executed F4-specific browser scenario; the
F4 seller acceptance/recovery journey above ran in jsdom. Applicable hosted browser
checks remain gates. Physical devices, external wallets and live Tor were not tested.

## Coordination checkpoint

Generation-66 release `443b806fd6f0ec4861cf8ea828c7111b7fa8c199` again set expiry equal
to heartbeat/release. Acquisition parent `8f6c7190c1ed797e6d2dad3cd84025150cad830b`
recorded expiry `2026-11-27T03:53:36.000Z`. Independently reviewed repair
`c3e4bc1e68953ef4fcda8480a78557d44d88ab91` restores only that expiry and preserves
the explicit release and all other fields. Sole-parent, single-file, non-force expected-
SHA publication, remote readback and the unchanged validator passed. No old acquisition
commit or validator was normalized.

Separate generation **67** acquisition `cc660a57680cdf22afb5a2aad5bf9daa673c6a3b`:
owner `chatgpt-d81aef3d1ca8-p14-integration`; cooperative token
`e5ee28d0-eea5-4ed3-8c06-300444205ef2`; base `3f7fcd0a7`; acquired/heartbeat
`2026-11-27T03:46:14.074Z`; initial expiry `2026-11-27T04:46:14.074Z`.
Remote parent/tree/state and the unchanged ownership assertion passed. This is historical
acquisition evidence: re-read the live lock and assert ownership before any integration.
Expiry never permits takeover. On release, preserve the prior heartbeat and expiry;
add the release time without making expiry equal to heartbeat.

## Remaining queue

P14 F3's indexer completion caveat is the next source-proven, unclaimed narrow repair:
use the captured run plan, preserve outcomes/counts, append an honest omission caveat,
and qualify security-key locale fallback plus a small browser layout case. It needs a
fresh claim before editing. This is another integrated finding, not an unmerged import.

The private durable scan journal #248 and P0 Worker B refund lifecycle remain unique
but owned/blocked; persistent timestamp retention is explicitly deferred. The ten
stopped workstreams and all frozen archives remain excluded. See the prior
[consolidation handoff](P14_LIGHT_EVIDENCE_COMPLETION_20261127.md) for source pins.
This is not exhaustive semantic clearance of every historical branch.

