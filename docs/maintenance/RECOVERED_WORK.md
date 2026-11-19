# Recovered and preserved work

## Completed in this execution

- Historical source-audit PR #214 was independently reviewed and merged at `ffd982a7aea2856c186b40ef236a39720a1b81f5`.
  It adds 110 lines to one audit-ledger file. Applicable scoped CI and CodeQL passed; twelve application jobs were
  intentionally skipped by existing path filters. This is documentation qualification only.
- All 255 advertised PR heads were fetched, including closed PR heads. Original source branches remain intact.

## Recovery candidates under verification

| Source | Preserved behavior / evidence | Destination and status |
| --- | --- | --- |
| #239 `4a1b181c89e02ee564b5568d4b4b8d689f5e42c5` | Atomic restoration, download retries, actual-promise KDF synchronization and key-export invalidation barrier | New isolated recovery reconciliation candidate; runtime qualification pending |
| #240 `38d69832ddc58ec27a19c00dbe3c89347c577495` | Raw-byte BOM refusal, event-time external-copy checks and independent master-restore/keyboard acceptance | Selective port into the same candidate; no restoration of polling-based flaky cases |
| #215/#216 | User/developer guidance and continuation history | New documentation recovery branch; stale current-main statements superseded by pinned current observations |
| #139/#140/#153 | Historical audit, maintenance and continuation evidence absent from main | Dated archive with original head/blob provenance; not installed as current operational instructions |
| #250 | Date validation, finite retry bounds, complete TRON ranges | Existing current promotion candidate; reviewed, waiting for full exact-head CI |
| #245/#247/#253 | Positive-value proof inputs, AST scanner and binary SOCKS parsing | #257 preserves selected safeguards while keeping major dependency upgrades out |

Previously integrated work is distinguished from work recovered by this execution. #241, #237 and #242 were
already merged before this task started. The initial census and Git history establish that distinction.

## Verified recovery and documentation milestone

- [PR #259](https://github.com/djshellshoxxx/GhostPay/pull/259), head `4ff80733a3b36019e2f12fc21a8448e7666b6049`,
  preserves #215/#216 ancestry and 158 absent/differing historical sections from #139/#140/#153. All 158 sections,
  ten original source files, recorded hashes and 123 relative links were checked. Its twenty changed paths are
  documentation only. The unchanged secret scan also passed. Applicable hosted CI is pending, not green.
- [PR #260](https://github.com/djshellshoxxx/GhostPay/pull/260), latest documentation head
  `f3bb7c662274c4a4394324c405b49517ad2b1461`, retains the reviewed product tree from `789e6350` / local `3110611e`.
  Five newly recovered cases failed against #239 and all five passed against the reconciled runtime; 34 other
  cases were deselected by the same filter. The three tested files cover BOM refusal and event-time custody.
  Secret scanning, 113 action-reference pins, diff checks and independent review passed. Ten combined Spec 18
  browser cases exist but have not been executed as a combined browser suite.
- Runtime diagnostics used 288 original lockfile-hash-verified cached packages and temporary noCheck JS emission
  for nineteen libraries after complete installs/builds were killed. No repository dependency declarations,
  KDF costs, assertions, timeouts or gates were changed. The five passes do not qualify typecheck, lint,
  production build, complete recovery/session suites, coverage or full/lean browsers. The broader twelve-file
  attempt exited 137 without an aggregate result. See #260's `RECOVERY_RECONCILIATION_20261119.md` and validation.json.

At this milestone, another coordinator held the observed main integration lease. These drafts were published and reviewable;
main promotion remains blocked on the applicable current-head checks, upstream #238/#239 qualification where
relevant, and coordinated integration. No auto-merge, deployment, lease takeover or source branch deletion is enabled.

## Final preservation update

At the final 08:22:46 UTC observation, that lease was released and the three published candidates were #259,
#260 and maintenance #263. Independent source comparison found #260's recovery safeguards and regression assertions
already retained in the separately owned broad #262 candidate at `b1757f5b`. No #262 runtime pass or main integration
is inferred from that comparison. Do not count the preserved implementation twice or retire its source while the
combined candidate remains unqualified. Exact evidence and next steps: [FINAL_CHECKPOINT.md](FINAL_CHECKPOINT.md).
