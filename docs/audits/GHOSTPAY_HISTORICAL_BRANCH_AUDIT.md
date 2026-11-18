# GhostPay historical branch and PR audit

Baseline `a89a2e94` (PR #157 head, `integration/consolidated-2026-11-14`). `main` (`bd2652bf`) is its ancestor.
Date of audit: 2026-11-18. Per-branch rows live in [the final ledger](../consolidation/GHOSTPAY_FINAL_INTEGRATION_LEDGER.md).

## Counts
- Remote branches: 176. Fully contained in baseline: 130. With commits outside it: 46.
- Of the 46: 14 DEFERRED, 8 DEFERRED_DOCS_ONLY, 22 DUPLICATE_SUPERSEDED, 1 INTEGRATED, 1 INTEGRATE_AFTER_FIXES.
- No branch was classified REQUIRES REIMPLEMENTATION or UNSAFE TO MERGE outright; two groups are DEFERRED for owner decisions that look like unsafe-to-merge-unreviewed (vendored binary, reverted payment guard).
- PR coverage is incomplete: only the first page of open PRs (30 newest, #124 to #163, via the GitHub API) was read. Older open PRs and recently closed PRs were
  NOT enumerated or paginated, so this audit's PR inventory is partial. Branch coverage (176 branches, by git) is complete. #164 (this run's draft PR) was closed without merge on 2026-11-18.

## Key findings
1. **#151 lean-core**: only one change was missing from baseline (A5-2, the invalid workflow fragment). Two other changes conflicted and baseline's versions
   are stronger (codex-cloud auto-merge gate; `assertInvoiceStillPayable`). The reachability proof and remaining audit fixes are patch-equivalent in baseline.
2. **#159, #161, #162, #163 and both rpc-filter-guard branches** are one fix seen five times. The off-filter transfer guard was missing and is now ported once, with its test.
   The bearer-QR `qrKinds` fix was already in baseline.
3. **Reverted payment guard**: `fix/remediation-f95457fd-22ecf9` re-applies a fix that baseline deliberately reverted (`051c1c12`, no reason recorded).
   Reading the diff, the guard refuses a new payment when any other payment record exists for the same payer and chain, which looks over-broad. That is a hypothesis;
   it was not reproduced. Deferred for an owner decision or a narrower design (flag only unscoped legacy records).
4. **Vendored `viem` tarball** (4 October branches): adds a repacked dependency binary and a rewritten `normalize-sbom.mjs`; the branch's own test fails against baseline's script
   (5 of 6 cases not ok). Not imported. Dependency provenance policy is an owner decision.
5. **`b16c7936` router-claim replay**: baseline has the stricter version (`> floor`). Merging the branch would weaken it.
6. **Old lineages** (`laughing-bardeen`, `cloud-recovery`, `remote-extensions-10`): no unique non-doc files, except an older `breaker.ts` that baseline moved to `relayer-guard` with tests.
7. `gh-pages` has unrelated history and is a deploy branch; never merge.
8. No branch, backup or historical ref was deleted or force-pushed.

## Not done
- Docs-only branches (8) were classified by file list; content not read line by line.
- Agent infrastructure (#152 and `automation/*`, `codex/setup-autonomous-agent`) was not independently reviewed or changed beyond deleting the invalid workflow fragment.
- Dependabot npm updates need a regenerated lockfile and full CI.
