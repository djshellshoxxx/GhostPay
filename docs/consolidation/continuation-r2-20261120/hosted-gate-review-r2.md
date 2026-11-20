# GhostPay hosted-gate readiness snapshot R2

**All nine reviewed candidates remain blocked by unfinished hosted work. No failing conclusion was observed in this snapshot.** Source heads, stack bases and main were unchanged. All nine PRs remained open drafts; GitHub reported them conflict-free, which does not establish qualification.

Recorded between **2026-11-20T18:54:42.903Z** and **2026-11-20T18:59:21.272Z**. These sequential reads are not an atomic view or an ongoing monitor. Full source identities, check/job/run URLs, returned pagination counts and timestamps are in [hosted-gate-review-r2.json](hosted-gate-review-r2.json).

## Latest checks associated with each frozen head

| PR | Head | Successful | Queued | Running | Intentional skip observed | Returned checks |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) | `2876b7db` | 16 | 19 | 1 | 3 | 39 |
| [#321](https://github.com/djshellshoxxx/GhostPay/pull/321) | `87c3bf5a` | 14 | 20 | 0 | 3 | 37 |
| [#325](https://github.com/djshellshoxxx/GhostPay/pull/325) | `1788f1e0` | 5 | 5 | 1 | 1 | 12 |
| [#326](https://github.com/djshellshoxxx/GhostPay/pull/326) | `a34ce43e` | 1 | 8 | 1 | 1 | 11 |
| [#327](https://github.com/djshellshoxxx/GhostPay/pull/327) | `9608ec99` | 0 | 7 | 0 | 1 | 8 |
| [#328](https://github.com/djshellshoxxx/GhostPay/pull/328) | `81598d93` | 0 | 13 | 0 | 1 | 14 |
| [#329](https://github.com/djshellshoxxx/GhostPay/pull/329) | `cff631b5` | 0 | 10 | 0 | 1 | 11 |
| [#331](https://github.com/djshellshoxxx/GhostPay/pull/331) | `f5e04a30` | 0 | 11 | 0 | 1 | 12 |
| [#333](https://github.com/djshellshoxxx/GhostPay/pull/333) | `3172a93c` | 0 | 8 | 0 | 1 | 9 |

No failure, canceled, timed-out, action-required or stale check conclusion appeared. **Snyk's classic commit status was successful on all nine heads.** The classic combined status covers that returned status context; it does not mean all GitHub Actions passed. Check-run, workflow-run and classic-status collections each fit one complete 100-item page for every head; none was truncated.

## Workflow-level evidence and missing aggregates

| PR | Completed successful workflows | Queued workflows | Running workflows |
| --- | ---: | ---: | ---: |
| #307 | 7 | 1 | 0 |
| #321 | 5 | 1 | 0 |
| #325 | 0 | 5 | 1 |
| #326 | 0 | 5 | 0 |
| #327 | 0 | 4 | 0 |
| #328 | 0 | 6 | 0 |
| #329 | 0 | 5 | 0 |
| #331 | 0 | 6 | 0 |
| #333 | 0 | 5 | 0 |

The final **`typescript` and `contracts` aggregate jobs are absent from every current check list**. Their workflow definitions use `always()` after the relevant dependency groups and reject dependency outcomes outside success or an applicable skip. Heavy CI jobs depend on the changed-file classifier. Thus the shorter lists on newer PRs are incomplete workflow progress, not evidence that those PRs require fewer gates. Do not treat the present check count as the eventual total.

For [#307 CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44774255974), 22 jobs were instantiated; 19 remained queued without an assigned runner, one browser job was running, and two had succeeded. [#321 CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44776094456) also had 22 instantiated jobs, including 20 queued without an assigned runner. [#328 CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44790328213) had only its queued changes and secrets jobs instantiated. The API returned no explicit queue reason. No billing, outage, scheduling-capacity or approval explanation is inferred from `queued` or `runner_id=0`.

## Why the observed skips are expected

The source-pinned [common Pages workflow](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/.github/workflows/pages.yml) validates pull requests without publishing. Its release gate requires a manual dispatch on main with `deploy=true`; the site emits `publish=false` on PR events, deployment requires `publish=true`, and smoke depends on deployment. The completed #307/#321 Pages runs therefore correctly show release-gate, deployment and smoke skips. On newer runs, only the release-gate skip has appeared so far.

The [v1.1 Pages variant inherited by #326/#327](https://github.com/djshellshoxxx/GhostPay/blob/a34ce43e296e302e3e65ed077ea8ac892c5189a1/.github/workflows/pages.yml) additionally attests served-file checksums before a publishing deployment. That job has the same `publish=true` condition and should be skipped for PR validation when instantiated. This is an expected difference between the two workflow versions. It does not remove any source-test requirement.

Both [common CI](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/.github/workflows/ci.yml) and [v1.1 CI](https://github.com/djshellshoxxx/GhostPay/blob/a34ce43e296e302e3e65ed077ea8ac892c5189a1/.github/workflows/ci.yml) retain the code-change condition and final aggregate gates; v1.1 also runs recovery tooling tests. These product PRs are not being classified as documentation-only by this report.

## Stack identities and promotion limits

Main remained `aa3df1cb37274fae73af0ca957183c15c51b62d3`. #307, #321 and #328 target that main head. #325 targets #307; #331 targets #325; #333 targets #331; #329 targets #321. #326 targets required-v1.1 `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`, and #327 targets #326. Full ref names and parent source identities are retained in JSON.

Required-check enforcement was not enumerated in this review. The earlier branch-protection API 403 remains unresolved, and an empty rulesets list does not prove absence of protection. Reported conflict-free mergeability and successful local tests cannot replace unfinished applicable hosted gates. Retargeting, changing source, or integrating a changed main requires a fresh review of source/base identities and all applicable checks.

This reviewer performed only read-only GitHub queries and source inspection. No tests, builds, browser journeys, artifact re-execution, dependency installation, source/ref changes, PR changes, job reruns/cancellations, lease operation or deployment were performed. The report records a point-in-time readiness result and grants no merge or release approval.


## Requested additional reads

PR #333 was published while this report was being prepared. Its initial read at 2026-11-20T18:58:39.658Z confirmed source `3172a93ceb8fce5a4343a93b453dcc0e68f09d87` on #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`, with eight queued checks, one expected release-gate skip, five queued workflows and successful Snyk status. Its Pages/CI blobs match the common workflow source. The original eight candidates were not polled again; each row retains its own timestamps in JSON.

The coordinator also requested a metadata-only inspection of [PR #332](https://github.com/djshellshoxxx/GhostPay/pull/332), head `71632fa389ae93824b2f42d265278a9bd0f6de59`, targeting main `aa3df1cb37274fae73af0ca957183c15c51b62d3` from `automation/20261120T1840Z/bug/receipt-archive-identity`. It remains an open draft for GP-BUG-01: receipt archive status must belong to the exact signed receipt, and pending archive writes are serialized. The author states two component regressions were authored but not executed locally because checkout was blocked by DNS. Its metadata explicitly identifies overlap with #307 ReceiptPanel print work and requires preserving that implementation. No code review or test outcome is inferred from the description; this separate owned work is excluded from the nine-candidate gate counts. No takeover, source edit or write was performed.
