# Merge queue

## Current dependency queue — 20261120T0035Z

1. Preserve original branches and handoffs. All eleven requested source fixes were already found in
   #278 d74af79e; do not import duplicate implementations.
2. The #278 owner has published 417f7c71. Require new exact-head original CI/browser/security
   evidence; old d74af79e CI failed and Contract analysis was cancelled.
3. The #290 owner must reconcile its reported conflict with advanced #278, preserving its primitive
   guards and existing regressions. No overwrite or rebase by this cycle.
4. Final #295 at 4493793a is stacked on #290 ec546311. It contains only two distinct coverage
   improvements; 54/54 local and fresh independent tests pass. Required hosted CI is still pending.
5. This documentation-only checkpoint is stacked on #261 61f2b372. It preserves the canonical
   ledgers and historical evidence; it does not authorize #261's older application tree for integration.
6. Before any shared update/merge, refresh source/target SHAs, reviews, effective branch requirements,
   downstream workflow triggers and the metadata lock. Another owner released generation 5 at
   c8517beb; this cycle never held it and does not claim the next generation. Protections remain unreadable (403).

Original #289 856b2d60 is red on lint, with the repair already in #278. Original #285 89942105
has five successful PR workflows plus dynamic CodeQL and Snyk; it still needs #290's runtime guards.
Prior standalone Node tests were not substituted for this cycle's real repository Vitest evidence.

Observed Pages publishing requires explicit main dispatch with deploy=true; release publishing uses
version tags. Neither was invoked and no workflow/production configuration changed. No main merge,
release, branch deletion, force push, security-gate waiver or real-funds operation.

## Historical queue

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
