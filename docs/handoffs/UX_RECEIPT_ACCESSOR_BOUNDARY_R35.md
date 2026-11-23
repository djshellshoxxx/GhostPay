# R35 — fail closed on throwing receipt chain-evidence accessors (2026-11-22 UTC)

## Provenance and ownership
- Repository: `djshellshoxxx/GhostPay`; observed main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Parent: PR #450 exact head `5aa0194f1a27ab3d6ba96a28e62fe604d8d8451d`, stacked on PR #449 `ff8c800a495f1cc4d2df704d321b3d22e6f67a78`.
- Isolated child branch: `automation/20261122T0838Z/bug/receipt-accessor-failclosed`. Parent branches were not modified.
- Worker: one ChatGPT coordinator performing sequential author/audit/verification phases. No native subordinate worker, independent reviewer, Caveman runtime or separate paid agent.
- Claim committed before product edits: `498a53a34ea42cf324e486572349c61a95a1b997` (`docs/ai/ACTIVE_WORK.md`).
- Regression-first test: `1d7aebfe08dc80fba34a7f7d53658ecde64cdac1`, new `packages/ux-receipts/src/verify.accessor-boundary.test.ts`.
- Production correction: `8604ce31df1a674dd9032d5fe9d4c1532bc0f9d1`, `packages/ux-receipts/src/verify.ts` previous blob `d6d35eccd243c114d4b36d62cd7a841098dd72b1`, corrected blob `6c58b87907a0822265cde8c9b0fda27a00b1d818`.
- This handoff is branch-scoped, does not replace or overwrite legacy/consolidation ledgers.

## Finding GP-RECEIPT-ACCESSOR-R35
The existing `ChainVerifier.lookup` exception handler caught a rejected lookup promise but did not catch getters and Proxy traps on a *resolved* adapter object. Despite the documented `verifyReceipt` contract that verification failures degrade to `unavailable`, throwing `res.status`, `res.facts`, `facts.confirmed` or optional evidence accessors rejected the verification promise instead. This is a deterministic exported-library robustness defect. No actual exploitation, key exposure or funds loss is claimed.

The child correction wraps downstream runtime envelope and fact interpretation in a narrow `try/catch`, mapping exceptional adapter evidence to `none('unavailable')`. The parent #449/#450 malformed-type guards remain in place. Valid found/unconfirmed/not-found and comparison behavior are preserved; the package makes no new network requests.

## Reproduction and qualification boundary
- Node 22.16.0 **source-equivalent transcription**, executed in the container: 8 of 8 malformed getter/proxy cases threw before the guard; 8 of 8 returned `unavailable` after the guard; valid confirmed and not-found neighbor cases both remained unchanged. This is *not* repository Vitest, does not prove the full module was run, and cannot confer independent approval.
- Nine newly committed Vitest scenarios include eight malformed statuses/facts/accessor/proxy cases plus a two-case valid behavior assertion. The real regression tests require hosted execution.
- The isolated container could not clone from GitHub: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. No local repository Vitest, workspace lint/typecheck/build, browser, security/Mythril tests, or independent review was executed.
- At this cycle's start, the exact parent #450 had five completed SUCCESS workflow groups, including CI [#45001081648](https://github.com/djshellshoxxx/GhostPay/actions/runs/45001081648); these do **not** qualify the new child source. Fetch the child PR's exact-head CI and test output before promoting.

## Concurrency, scope, integration blockers
- Deliberately continues the existing #449 -> #450 stack, avoiding duplicate broad recovery/privacy work. Parent/child integration dependency must be honored.
- Integration metadata `automation/ghostpay-integration-lock` remained `held`, generation 11, owner `994a0d214fb9-root-r3`, ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, although the metadata expiry is old. Never steal ownership merely based on expiry. No shared integration/main update was attempted.
- No contracts, keys, fee policies, provider calls, PWA host, releases, tags, deployment settings, real funds, force push or new dependencies.
- SECURITY.md requires private reporting of actual vulnerabilities; this is logged as a low-priority defensive correctness finding with no demonstrated exploit.
- `docs/automation/` was absent on current main. This scoped claim and handoff are durable, without creating competing shared ledgers under a different lock owner.

## Exact next steps
1. Verify the new draft PR head, compare to #450, ensure no parent moves or new owner overlap; inspect exact-head workflow groups and the new Vitest test's actual run result.
2. Repair any genuine child-only typecheck, lint, test, build, browser or CI failure on an owned isolated follow-up branch; do not weaken gates.
3. Obtain independent review of the final source and regression (not the author's own audit), consider pathological changing/getter state separately if shown relevant, and coordinate with #450/#449 owners.
4. Only the authorized integration coordinator may merge after lock ownership and full release/deployment gates are satisfied. No release or deployment is authorized.
