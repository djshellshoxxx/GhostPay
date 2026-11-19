# Merge queue

Snapshot baseline: `e454de6abfefda70d82784fafc1d8949b277c334`. Re-read every head and check before action.
No candidate listed below is approved for merge solely by this table.

| Candidate | Exact observed head | Dependency / blocker |
|---|---|---|
| #252 | `4085622463411d3ba27f4efb7b73a70575170535` | Narrow Sweep-consent candidate; main ancestor. CI 44476268589 queued; independent current-head review required. |
| #250 | `22af2074a086d9957a18e310ef8572b28d1facd0` | Historical adapter work; current-main delta and Pages scope need review. CI 44474453695 queued. |
| #256 | `df0d70de5b297391af5f1f2b786800a93b02ce52` | Active idle/session owner. CI 44477703334 pending. |
| #257 | `4f14d6f167c788f5ae2d019bc8482027495f3c6c` | Already contains #245/#247 and isolated SOCKS fix; dormant-pool scope and CI 44480223982 pending. |
| #255 | `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` | Active Mythril/contract-policy owner. Final refresh: analyzer job `135396814239` failed with 11 findings; full CI 44476066970 remains queued. Do not merge. |
| #239 + #240 | See branch inventory | Preserve six unique commits each; existing recovery owner reconciles on #238 lineage. |
| #238 | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Conflicts with main; multiple merge bases; requires deliberate combined qualification. |

At the snapshot, #250/#252/#255/#256/#257 had no submitted GitHub reviews. Their descriptions mention
prior agent review, which is not fresh independent verification of the final combined revision.

The baseline Pages workflow deploys only through explicit dispatch with `deploy=true` on main;
release publishing triggers on version tags. No automatic repository deployment from a normal main
merge was found. Recheck workflows and downstream triggers at the final head; do not deploy or alter
production/protection settings. The protected-branch endpoint is inaccessible to this connector (403).

## Current cycle publications

- [#258](https://github.com/djshellshoxxx/GhostPay/pull/258), `84398a79e18673f3e371a405931bc464e1cca99a`:
  independently reviewed QR importer fix, 77 focused tests and independent 9-case rerun passed;
  hosted qualification pending. Base includes documentation-only main advance `ffd982a7`.
- `automation/20261119T073600Z/coordinator/integration-lock`: independent 10-case lock verification,
  full census and persistent tracking. Local reviewed implementation `d3749e45`; publish as a separate
  draft PR so application qualification does not block reuse of the documented coordination protocol.
- Never merge `automation/ghostpay-integration-lock`; it is a control ref, not application source.

Keep unrelated improvements separable so one incomplete feature does not block another.

Final refresh: #258 full CI 44483607131 is queued. #252 full CI 44476268589 remains queued despite
passing Pages/browser/beta checks. #256 checks at previously observed df0d70de include cancellations;
re-read its live head rather than attributing old-head results to a newer revision. No source candidate
was promoted from partial or cancelled evidence.
