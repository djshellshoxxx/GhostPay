# GhostPay R59 — test-first consolidation invariant repair and donor path triage

Checked 2026-11-23T08:09:21Z UTC. Exact main at evidence read: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. This report is about engineering evidence and safety, not beta release qualification.

## Confirmed ledger correctness defects, reproduced against previous exact source

Validator before fix: `scripts/consolidation/validate-ledger.mjs`, original Git blob `00c921c70a5a8988b03aac8062fa0a126d52ee50`. Direct V8 execution of that source wrongly accepted a standalone ledger containing the exact same branch name and SHA both as a **live** `records[]` entry and an allegedly HTTP-404 **retired** history, with a doubled global unresolved count (synthetic result `globalUnresolved:2` for one real unresolved branch). A second independent defect allowed a `finalized:true` retired record with `disposition:unique-but-incomplete` to bypass the fail-closed disposition rule that applied to live branches.

- Regression-first commit: `2eb7f43f3523b61b3b4bfb43a1b547978c00e391`. Added tests for identical-ref collision, legitimately recreated branch at a *different* SHA, and illicit finalization of dangerous retired work.
- Fix: `3978ae22af6101e7e05f21f6e2b0d983d9b2ffa9`. Reject identical-SHA live/retired double-counting; require retired finalization to obey the same unresolved-disposition guard. A previously deleted ref may be recreated under the same name with *different* SHA, retaining historical evidence for the old ref.
- Regression fixture correction: `f230f392bbf846934aa9c2bbc25898cbbf7abbf0`. Existing historical-state transition test now uses a plausible finalized-looking disposition to reach its intended *cross-checkpoint* check instead of terminating at the new standalone safety gate.

Direct V8 replay of **exact new committed source** Git blob `e87cf8041aeeab66e99e7468338a2ed4f8a7947a` and test blob `ca0536442db7df5b10bfed2034519769a572d97f`: **25/25 test definitions pass**, no observed failures. Only Node imports/CLI bootstrap were removed for replay; this is **not native Node test runner, application tests, browser E2E or independent review**. Hosted exact-commit workflow results must be rechecked after the final docs commit.

## Previously incomplete historical security donor: one path-equivalence finding, no blanket disposition

Donor `codex/ghostpay-security-audit-20261030` immutable commit `63994db6cff8b3b3ca698427eee9e95904230546`: compared to main `8ddb3449...`, diverged **5 ahead / 1398 behind**, 15 changed files. There is no API compare-file cap on these 15 paths.

One donor-only test at `apps/relayer/src/secrets.test.ts` Git blob `b4d4236ede8c70056165709a2508c089306269b2` covers checked-file replacement and post-check file growth. Main no longer contains this exact path because the generic secret loader moved into `packages/relayer-guard/src/secrets.ts` Git blob `d519892bdb89efbfdf44b4ccb1b435e50b16635a`. Its existing same-package test Git blob `ba997aa9b5a2762dcb7f543d945cc26b81ba4f8b` already covers **both** those cases and adds leaf-symlink refusal, permissions, source validation and redacted errors. This is **semantic coverage of one obsolete donor test**, not a claim that the whole security branch is integrated. The production loader now uses `O_NOFOLLOW|O_NONBLOCK`, bound `fstatSync`, and 4097-byte `readSync` on one descriptor; importing the donor's old standalone relayer loader could weaken the newer implementation.

The donor's `packages/chain-adapters/src/rpc.test.ts` and `scanHardening.test.ts` test-title sets are included in current main (the current scan test adds an AR2 range-evidence regression). Remaining donor differences still need current-source semantic review before any final disposition; relayer features are **out of Pages-only beta scope** and must not be imported indiscriminately. No real-funds or relayer service testing was performed.

## Ownership and gates

All edits are within consolidation PR #471's preexisting owned validator/test paths or fresh R59 documentation. Dedicated BUG-only owner PR #501 (`packages/ux-links/src/tip.ts` and its new test) is untouched. Recovery #372, wallet journal #500 and all stack owners remain untouched. Metadata lock at `082e754f44944ebb4be283f89176b966bf8f7b4f` is **released generation 12**, not equivalent to independent review or merge approval. GitHub branch-protection read remains HTTP 403. No application code merge, release, deployment or claim of a fixed security gate.
