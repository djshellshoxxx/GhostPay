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
  - Local, as recorded by that session (`npm ci`, `build:libs`, `forge build --offline`): typecheck 0, lint 0; `REQUIRE_ANVIL=1 npm test` 3289 passed /
    1 skipped / 0 failed, coverage 93 / 89.34 / 94.47 / 96.78, nocov 3/3; anvil devnet browser journey 3/3.
- Lock: generation 19 (`chatgpt-f80482f352bc-all-branch-review`) had been released at 14:09Z. Generation 20 was acquired by
  `claude-keen-volta-8ctx9x` at `332fb6f6` and released at `4fe06565` after the merge. Every lock push was a non-force fast-forward.
- Post-merge push CI on `c8e131c1`: CI run 45415639617 and Hosting kit 45415639485 succeeded.

## 2026-11-25 — P1-LATE late-payment seller reconciliation → `main` `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`

Recorded from repository history; this session did not perform this merge.

- PR #635 (`claude/p1-late-reconciliation`), exact head `205f8fd7db7d45efb46acd0dce7c9c869691dc06`, merged with a merge
  commit on 2026-11-25T10:26Z. It consolidates #533 `90e3fff0` → #546 `711168f1` → #575 `5a225f6c` → #599 → #625
  `694383f7` and #590's receipt-binding commit `4cf0d3bb` (as `0c2e4e00`); all five stack heads are ancestors of `main`.
- Lock: generation 23 (`claude-local-p1-late-reconciliation`, `d9a45653`) was released unmerged at `749fa059`; generation 24
  was acquired at `5341a32d` and released at `9dc8e4ac` after the merge (lock commit records 40 pass, 3 skipped, 0 fail on the head).
- Post-merge push CI on `aaa71a11`: CI run 45595034543 and Hosting kit 45595034817 succeeded.
- PR state on 2026-11-26: #533 shows merged; #575, #590, #599 and #625 are closed as superseded and #546 as already
  integrated. Handoff: `docs/handoffs/P1_LATE_CONSOLIDATION_20261124.md`.

## 2026-11-26 — LATE-LM1 invoice reservation fix → `main` `9d92472a46a4e37f847472276d77e3b4ce158e80`

- PR #716, exact head `b536fdda9f899e43e8a66cf07bc8f18312f327ae` on base `e7e98109`. Main had since moved 8 commits, touching two
  unrelated files; `git merge-tree` was clean. Shared-core reconciliation maintenance, permitted by
  [STOP_WORK_20261125](../ai/STOP_WORK_20261125.md) ("individual invoice status, payment evidence, reconciliation").
- Change: in `proposeInvoiceMatch`, a live linked record in a pending or unverified state also reserves its invoice. Only an
  `invalidated-after-reorg` tombstone frees it. Found by the Worker F2 review of #533→#546→#575.
- Evidence:
  - Hosted: 42 of 42 checks success or skipped (CI run 45799816592, Pages 45799816651, Beta 45799816576, Hosting kit
    45799816495, CLI 45799816443, CodeQL 45799806753).
  - Local: the regression fails before the fix (proposal `exact`) and passes after; ux-vault 398/398 (coverage
    96.67/93.37/99.07/98.48); `REQUIRE_ANVIL=1 npm test -w @ghostpay/web` 4135 passed / 2 pre-existing expected-fail /
    1 skipped, coverage 93.22/89.58/95.02/96.99.
- Lock: generation 47 acquired by `claude-keen-volta-8ctx9x` at `b5e5cdb7`, released at `09dd9791`. Both pushes non-force.

## 2026-11-26 — P0-KEYS evidence and tracker status → `main` `4eb02bb36470eb88f3529b01108f380b1b54af71`

- PR #727 (docs only), exact head `cac14b75` on base `c7c6349c`; it carried #721 (`a308b086`). Merged with a merge commit.
- Evidence: [`milestones/M2-P0-KEYS.md`](milestones/M2-P0-KEYS.md). P0-KEYS reached `main` through #539 and #707 (#718
  `c7c6349c`).
- Lock: generation 51 acquired by `claude-nifty-bohr-5ra2ap` at `7bbf85f3`, released at `8844fb6c`. Both pushes non-force.
- Release-readiness record for this SHA: [`RELEASE_READINESS_20261126.md`](RELEASE_READINESS_20261126.md).
