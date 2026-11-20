# GhostPay core and recent-feature source security audit

**Completed for 24 immutable snapshots. Audit date: November 19, 2026 (America/Los_Angeles).**

The review covers the active static-browser core, its first-party dependencies, core/policy contracts, directly supporting tests and build/release controls, and the selected latest feature/hosting candidates. All in-scope first-party code and configuration versions have a final disposition; the pending queue is empty. Application, test and configuration code was not changed.

The main conclusion is **branch divergence**. Several fixes exist in named feature branches while the reviewed current `main` still carries older implementations. A recent branch name does not establish that it includes every other recent fix. No High or Critical finding was established by this static review; this is not a guarantee of absence.

## Read the results

- [Full findings and observations](FINDINGS.md): 58 distinct records with conditions, impact limits, remediation, source anchors and future acceptance criteria.
- [Branch applicability](branch-applicability.md): 16 finding rows × seven primary snapshots, with 112 source-backed cells.
- [Machine-readable findings](findings.json), [scope](scope.json), [coverage](coverage.json) and [empty pending queue](pending.json).
- [Independent findings quality review](findings-quality-review.md), [final verification](VERIFICATION.md) and [continuation/handoff](continuation.md).
- [Lane records](lanes/README.md) and [dependency/import evidence](evidence/README.md).

## Priorities

| Priority | Finding | Why it matters | Source disposition |
|---|---|---|---|
| 1 | CUSTODY-01 — idle-lock authority, Medium | Ordinary seller authority can survive the expected lock boundary, including while custody is checked. | Current main, unique-code, recovered-fixes and Tor affected; release/completion/quick-hide correct it. |
| 1 | PUI-03 — stale sweep review, Medium | An earlier transaction context can continue after visible review inputs change. | Same main-derived set affected; release/completion/quick-hide correct it. |
| 1 | PUI-01 — receipt identity/status, Medium | Inconsistent selected-RPC data can be attributed to the wrong transaction/outcome. | Completion and recovered-fixes correct both checks; the hash-only worker fix is partial. |
| 1 | SCAN-NET-02 — session-only scan settings, Medium | A selected independent secondary can be silently omitted when private scanning rereads stripped persisted settings. | Release/completion/privacy family affected; defect-specific path absent in current main-derived implementations. |
| 2 | HOST-LATEST-01 — recovery backup cleanup, Medium operational | A failed replacement plus failed restore can be followed by deletion of the retained helper backup. | Shared helper has the same affected blob across all 24 snapshots; fresh-output wrapper limits exposure. |
| 2 | CUSTODY-02 — archived receipt dates, Low | An authenticated same-seller/same-chain archive can contain a date that passes integer checks but fails history formatting. | Remains in all seven primary snapshots. |
| 2 | PUI-02 / PUI-05 — result and amount parsing, Low | Runtime input guards remain inconsistent across branches. | Recovered-fixes carries the inspected corrections; completion still has the cited gaps. |
| 2 | PS2-01 — privacy wallet-attempt wiring, Low | Missing account prop hides recovery/history controls; journal duplicate protection remains. | Quick-hide and its privacy snapshot. |
| 3 | Assurance and operator defects | Invariant/result checks, zero-check local CI success, legacy configuration/build issues and tooling cleanup need precise repair. | See per-record scope; these are not all browser vulnerabilities. |

The private-scan integrity case requires **readable persisted settings, a usable primary, a selected session-only secondary and `plan.useSecondary=true`**. A missing primary fails visibly and closed. The receipt-date issue requires an authenticated archive/history path. No live theft, chain-state forgery or fund-loss magnitude was established. Source evidence and remediation for every row are in the [catalogue](FINDINGS.md).

## Coverage and boundaries

| Measure | Final count |
|---|---:|
| Frozen branch/commit snapshots | 24 |
| Inventoried unique path/blob units | 1,689 |
| Distinct inventoried paths | 1,384 |
| Reviewed source/configuration/supporting-text versions | 1,403 |
| Structurally reviewed data versions | 28 |
| All reviewed versions / distinct paths | 1,431 / 1,175 |
| Explicitly inventoried excluded versions | 258 |
| Pending in-scope code/configuration versions | 0 |

The source/configuration/supporting-text units total 239,643 target-version lines; data units add 63,710. These are sums of version lengths, including delta-reviewed variants, not a claim that every line was independently reread for every branch. Different paths retain distinct units even if their bytes match. Complete source bodies or complete deltas against fully read bases were reviewed. A search result, inventory or truncated read did not satisfy coverage. Exact totals and provenance are in [coverage.json](coverage.json).

The ledger explicitly excludes 258 encountered units. Broader paused CLI/server/native products, unrelated other-chain implementations, future pool/confidential-amount/payer-hiding proposals, vendor internals, generated output and historical archives remain outside scope. The final path-based closure also accounts for unreviewed supporting Markdown, ignore metadata, historical gas snapshots and a favicon; none is executable/configuration code. See [the independent closure review](lanes/coverage-qa-supplement.md). This is completion of the requested core/latest scope, not a claim that every file in the wider monorepo was reviewed. Ancillary boundary findings keep their inactive or conditional labels.

## Branch interpretation

Original main is `c977b5d6723f6822c3b5d86cd6b231712c53c395`; the freshness snapshot is `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. The latter changes documentation/hosting code but retains the earlier browser runtime. Tor `14a7526` matches the freshness main for all finding paths in the independent matrix. Completion `e22c174` includes stronger session, sweep and receipt boundaries but still carries the private-scan settings, receipt-date and simulation-result issues. Recovered-fixes `6c65cc3` fixes several parsing/QR/receipt boundaries while retaining the older idle-lock and sweep implementations. Quick-hide `1376289` retains older receipt/QR-expiry behavior and adds its own WalletAttempts wiring regression.

The [matrix](branch-applicability.md) uses affected, fixed in source, not present, conditional and partially corrected. “Not present” means the defect-specific feature path is absent; it is not a verified fix. No branch has been merged, deployed or declared release-qualified by this audit.

## Contract and design qualifications

Six previously tracked conditional protocol risks are retained separately: fee-token-dependent policy deployment, shared-policy correlation, immutable asset eligibility/withdrawal assumptions, sender-controlled fee waiver economics, immutable fee-recipient availability, and sponsored-sweep execution costs. Four have Medium conditional impact and two Low conditional economic impact. They do not establish that the active lean application uses the affected configuration.

Policy deployment is permissionless, so a failure affecting one payer does not prove all deployment routes are blocked. Equal public policy hashes establish correlation, not common identity. Missing immutable asset eligibility differs from temporary token incompatibility. Failed router fee delivery rolls the payment back atomically. The experimental web policy helper rejects nonzero factory fees. No production relayer-service failure was established. These limits form part of [CW2-K01 through CW2-K06](FINDINGS.md#cw2-k01).

## Dependency metadata

Read-only `npm audit --package-lock-only --ignore-scripts` checks were recorded for the two selected lockfile families. Both production dependency graphs reported zero known advisories. Both complete development graphs reported **17 Low affected package entries representing two advisory families**, cookie `GHSA-pxg6-pf52-xh8x` and elliptic `GHSA-848j-6mx2-7j84`. Seventeen is not the count of distinct vulnerabilities. Main has 286 production / 814 total dependency entries; completion has 286 / 820. Registry results are time-bound and do not replace source review or establish runtime exploitability. Vendor implementation internals were not reviewed. See [raw evidence](evidence/README.md) and [DEP-01](FINDINGS.md#dep-01).

## Method, review assurance and delivery

Workers performed static body/delta reads, traced callers and trust boundaries, and handed unfinished units to fresh successors with exact path/blob inventories. Separate workers reconciled branch applicability and challenged finding severity/conditions. The final ledger supersedes earlier partial lane queues. Tests were read for intended assertions; they were not run. No application, analyzer, exploit, live probe, browser flow, transaction or deployment was executed. No product fixes were applied.

The completed audit is committed on `docs/ghostpay-core-readonly-audit-20261119`. The user authorized continuing with publication on November 20, 2026 (America/Vancouver), in direct response to the request to approve pushing this completed audit-notes branch. The earlier automatic approval rejection is retained as history; the authorization hold no longer applies. The review remains frozen to its 24 recorded source snapshots. Publication does not merge product changes or extend the audit to unreviewed code.
