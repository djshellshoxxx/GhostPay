# GhostPay core blue-team source audit — 19 November 2026

**Status: complete for the declared core/latest-feature source scope, including the final branch delta. Zero scoped versions remain unread.**

The audit records **seven confirmed production findings: four Medium and three Low**. Two are newly confirmed integration issues; five describe defects on reviewed earlier/main snapshots with corrections already present in a later candidate or separate fix branch. No application fix was applied by this audit.

## Read the results

- [findings.md](findings.md): canonical issue register, branch dispositions, immutable source evidence, impact limits and remediation.
- [observations.md](observations.md): test/harness weaknesses, qualification gaps, stale documentation, known hardening and trust boundaries.
- [coverage.md](coverage.md): exact completion totals, scope, methods and exclusions.
- [validation.md](validation.md): identity/accounting checks and resolutions of independent-review discrepancies.
- [reviewer-notes/README.md](reviewer-notes/README.md): complete reviewer records and fresh-worker handoffs.

## Final coverage

| Category | Distinct paths | Path/blob versions | Version-lines | Pending |
|---|---:|---:|---:|---:|
| Production and build/configuration | 331 | 435 | 99,027 | 0 |
| Supporting resources | 5 | 8 | 10,469 | 0 |
| Tests and test support | 435 | 549 | 113,317 | 0 |
| **Deduplicated total** | **770** | **991** | **222,767** | **0** |

A version is a unique repository path plus Git blob. Full-baseline/complete-diff review credits unchanged lines through the named full baseline; version-lines are not a claim that every unchanged line was displayed repeatedly. The 46-line announcer serves both application deployment and test support and is counted once in the combined total.

## Source cut and freshness

The original snapshot surveyed 319 remote refs and 85 open PRs, selecting 28 relevant source-bearing refs at or after the frozen main. A final read-only ref check at **19 November 2026, 10:51:27 p.m. America/Los_Angeles** (20 November 06:51:27 UTC) surveyed 367 refs and detected a newer main plus recent core/hosting work. Five additional pinned snapshots were reviewed through all new selected blobs and necessary hosting dependencies. This produces 33 reviewed source snapshots across 32 branch names; main is represented at both cuts.

| Snapshot | Immutable commit |
|---|---|
| Initial main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Final-cut main | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| Combined candidate #302 | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| Amount-validation #303 | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| ERC-20 simulation #305 | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| Quick-hide #300 | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| Clipboard #297 | `04910f65dc0268e41519c4b1a44e83264272f0bf` |
| Final payment-URI correction | `0fa33f7101f3c9ac4d685673aece16eda6e98366` |
| Final recovered-fixes integration | `0e926f8b4cf7f307c3174f3a03298ff310cb1808` |
| Final unique-code integration | `885b9569e6fc99e43bf01d23305494275e10120e` |
| Final Tor/static-hosting feature | `e60c69f32dbbd9edf7e81ed8866144d665e3de9a` |

Final main differs from initial main in documentation and the static-export profile/tests. Its payment, wallet, sweep and scanner code implicated by the findings is unchanged. A fix in a sibling branch is not assumed merged into main or another candidate. Future-only, documentation-only and redundant audit branches were classified without expanding the review into unrelated products. Full pins and classifications are in [source-scope.json](source-scope.json), [branch-inventory.json](branch-inventory.json) and [final-ref-check.json](final-ref-check.json). Later remote activity is outside this finite source cut.

## Findings at a glance

| ID | Severity | Defect | Main / candidate disposition |
|---|---|---|---|
| BROWSER-01 | Medium | Wallet-attempt records and confirmed-clear controls become unreachable because core callers omit the new wallet context. | New in quick-hide #300; absent on main/#302/#297. |
| PN-01 | Medium | Receipt polling can associate an unbound receipt with the requested transaction. | Present on main; corrected in #302. |
| PN-02 | Medium | Native sweep can sign a changed balance rather than the reviewed amount. | Present on main; corrected in #302. |
| PN-03 | Medium | An in-flight sweep can retain old authorization after the visible review context changes. | Present on main; corrected in #302. |
| PN-04 | Low | Malformed nonempty ERC-20 simulation results can be described as a successful dry run. | Present on main/#302; corrected separately in #305. |
| PN-05 | Low | Receipt introduction/help promises recipient comparison even for an allowed receipt that omits the address. | New wording gap in #302's minimal-receipt integration. |
| SN-K01 | Low | Scan cancellation does not prevent some subsequent RPC dispatches. | Present on main; corrected in #302. |

The existing Pay route clearing/retry regression was found during full test review. It should expose BROWSER-01 on #300 when run; this audit did not run it. Earlier checkpoint language implying no Pay route test is explicitly superseded.

## Scope and method

Reviewed the lean EVM Pages entry and core routes; custody/session, encrypted storage and recovery; invoice/signature/receipt/QR handling; wallet payment and sweep authority; RPC evidence, scanning and network consent; core router/relayer contracts; build, artifact and publication controls; latest privacy features; and the final static/Tor hosting changes and their necessary first-party dependencies. Associated core tests, fixtures, browser journeys and modified hosting qualification/support source are included. English UI/security copy is included; this is not a translation audit of every catalog.

Each fresh worker received exact immutable pending path/blob assignments. Coverage came from full source reads or fully read counterparts plus complete added/deleted diffs. Truncated output was repaired before credit. English coverage explicitly composes the root's partial ranges with the successor's remaining ranges. An independent accounting pass identified 37 versions with ambiguous historical method labels; fresh reviewers reread all 37 and recorded exact lineage before completion.

Excluded future-only pool/confidential/payer-hiding designs, deferred non-EVM/policy/full-profile UI, independent hosted backend and native/proxy/CLI products, third-party library internals and advisory research, optional I2P/interactive hosting-wizard paths, live deployment/chain state, and unrelated historical code. Incidental shared-package or mixed-test reads do not claim those excluded products were audited. Conservative static closure does not prove emitted bundle contents.

## Authorized changes and publication

Application source, tests, dependencies, configuration and deployments were left unchanged. Only this audit directory and the audit's entry in `docs/ai/ACTIVE_WORK.md` are changed. No target tests, builds, servers, probes, wallet actions or transactions were run. Git/object inspection and audit bookkeeping were used to verify source and coverage.

The notes are on local branch `audit/ghostpay-blue-team-20261119`. Automatic approval review rejected publishing that branch, citing uncertainty about the remote and authorization to send repository-derived audit notes externally. The remote was subsequently verified as `djshellshoxxx/GhostPay`; publication was not retried or bypassed. No remote audit branch or PR was published by this task. The complete notes are ready for an explicit publication decision.
