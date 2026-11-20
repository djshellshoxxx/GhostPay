# Final source coverage

**All selected source, resource and test/support versions are reviewed. Pending: zero.**

| Category | Distinct paths | Path/blob versions | Version-lines | Pending |
|---|---:|---:|---:|---:|
| Production and build/configuration | 331 | 435 | 99,027 | 0 |
| Supporting resources | 5 | 8 | 10,469 | 0 |
| Tests and test support | 435 | 549 | 113,317 | 0 |
| **Deduplicated total** | **770** | **991** | **222,767** | **0** |

## Evidence model

[source-scope.json](source-scope.json) and [test-scope.json](test-scope.json) describe the finite inventory. [coverage-reconciled.json](coverage-reconciled.json) and [test-coverage-reconciled.json](test-coverage-reconciled.json) are the authoritative completion ledgers. Each record retains immutable path/blob/representative commit and points to its exact reviewer evidence. Both pending lists are empty.

The original scope contained 930 distinct path/blob versions across 718 paths and 210,696 version-lines. The final cut adds 61 distinct versions and 52 paths, producing the totals above. Identical blobs shared by branches are reviewed once. Changed/deleted lines in complete diffs are reviewed explicitly and unchanged lines inherit from an identified full baseline. The 46-line announcer overlap is subtracted from the combined total.

The initial conservative lean closure has 270 files and 899 edges, with explicit exclusions. It is a static superset before tree shaking and is not an emitted-artifact claim. Final hosting dependency and test-helper closure is recorded in the round-8/round-9 reports. Optional I2P and interactive wizard references are outside that Tor call path. Current core-path variants at all five final pins were reconciled against the initial reviewed union; no new selected core variant was left unmatched.

The initial 54 generic root attestations are retained only as superseded history. Five unique pairs have explicit full-read evidence from other reviewers. The remaining 37 pairs received 27 fresh full reads and ten complete dependent diffs in round 8. English resources use an explicit disjoint composition of 322 root lines and 2,208 successor lines for the baseline, followed by all three complete version diffs.

Historical handoff reports can contain unread arrays that were subsequently assigned and completed. They are preserved as provenance, not open work. This ledger does not assert a passing test run, full dependency audit, complete translation review, live-chain truth or deployment security.
