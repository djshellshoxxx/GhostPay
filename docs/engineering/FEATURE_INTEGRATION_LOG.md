# Feature integration log

Append-only. Each entry: what merged, the exact source, the evidence, and the lock state.

## 2026-11-23 — integration lock generation 11 released on owner authorization

- Lock branch `automation/ghostpay-integration-lock`: `6edfcd4d` (held, gen 11, `994a0d214fb9-root-r3`, expired
  2026-11-21T00:16:57Z) → `e7ab06d0` (released, gen 11). The repository owner confirmed in Claude Code session
  `keen-volta-8ctx9x` that the prior coordinator had stopped and authorized the release. That confirmation is the
  stop evidence the protocol requires. The 2026-11-20 expiry-only takeover (`4621502d`) stays reverted.
- `827cbf99`: generation 12 acquired by `claude-keen-volta-8ctx9x` (base `eb59d93`). `082e754f`: released after the merge below.
  All lock pushes were non-force fast-forwards.

## 2026-11-23 — P0-RCPT receipt chain-lookup fail-closed stack → `main` `8ddb344973e80b8e1eda6821e970ee6a2b808b29`

- Source: #449 `ff8c800a495f1cc4d2df704d321b3d22e6f67a78` → #450 `5aa0194f1a27ab3d6ba96a28e62fe604d8d8451d` → #452
  `d0814403c69e1cc18960a0ce2df75c1c49e96e44`, linear on `eb59d93`. #452 retargeted to `main` and merged with a merge
  commit (original commits kept). #449 shows merged. #450 is still open because its base is #449's branch; all of its
  commits are ancestors of `8ddb3449`, so nothing of it is lost.
- Path: `packages/ux-receipts/src/verify.ts` plus three regression test files and handoffs.
- Evidence:
  - Exact-head hosted checks on `d0814403`: 35 of 35 success or skipped (CI run 45004368863, Pages 45004368886,
    Beta 45004368946, Hosting 45004368893, CLI 45004368973).
  - Independent review (Worker F, this session, throwaway worktree): RED on parent → GREEN on head for each PR
    (#449 6 fail/1 pass → 7/7; #450 8 fail/5 pass → 13/13; #452 7 fail/2 pass → 9/9). `ux-receipts` 146/146, coverage
    99.75/98.28/98.07/99.67 (thresholds 95/90/95/95), typecheck and eslint clean, `git merge-tree` vs `main` clean;
    19 adversarial probes (revoked proxies, throwing `then`, boxed primitives, sparse/array facts, null-prototype
    envelopes) all failed closed.
- Scope note: no workspace currently imports `@ghostpay/ux-receipts`. The web app's receipt verification uses
  `@ghostpay/invoice-schema`. Runtime fund-safety impact today is therefore nil; the fix matters when the package is wired in.
- Follow-ups (low, see [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)): RCPT-L1 and RCPT-L2 are fixed on the FC-04 branch (commit 752828f6, tests in
  `packages/ux-receipts/src/verify.accessor-boundary.test.ts`), pending integration; not merged.
- Post-merge CI on `8ddb3449`: pending at time of writing (see [REGRESSION_RESULTS.md](REGRESSION_RESULTS.md)).

## 2026-11-24 — P0-JRNL durable wallet-attempt journal → `main` `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`

- PR #500, exact head `9a67daf281ae04511bd843cd62623610c15aad16`. That head is the branch with main `03695a7b` merged in; the only
  conflict was `docs/ai/ACTIVE_WORK.md`, and both sides' entries are kept. Merged with a merge commit, so the original commits are kept.
- Contents: #427 `e9404bad` → #440 `2b73dec3` → #441 `3c21b021` → #443 `4e1fa095` (fast-forwarded), the M1 commits of this
  session, commits by another agent on the owner's account (`b9141125`, `b29ef7bc`, `3776d9bc`, `25005c51`, `a23a9f99`), and #545
  (`d1e167f1`, REV-L2: Pay checks the committed IndexedDB journal before permit, approval and payment prompts).
- Evidence on the exact head:
  - Hosted: 42 of 42 checks success or skipped (CI run 45411913721, Pages 45411913724, Beta acceptance 45411913754, Hosting kit
    45411913691, CLI 45411913714, CodeQL 45411899452).
  - Local (`npm ci`, `build:libs`, `forge build --offline`): typecheck 0, lint 0; `REQUIRE_ANVIL=1 npm test` 3289 passed /
    1 skipped / 0 failed, coverage 93 / 89.34 / 94.47 / 96.78, nocov 3/3; anvil devnet browser journey 3/3.
- Lock: generation 19 (`chatgpt-f80482f352bc-all-branch-review`) had been released at 14:09Z. Generation 20 was acquired by
  `claude-keen-volta-8ctx9x` at `332fb6f6` and released at `4fe06565` after the merge. Every lock push was a non-force fast-forward.
