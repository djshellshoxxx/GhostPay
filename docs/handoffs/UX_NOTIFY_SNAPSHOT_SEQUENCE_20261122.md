# UX-NOTIFY-SNAPSHOT-SEQ — BUG-ONLY handoff (2026-11-22 UTC)

## Exact sources and scope
- Repository: `djshellshoxxx/GhostPay`. Main was independently read from Git ref `refs/heads/main` at `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Work branch: `automation/20261122/bug/notify-snapshot-seq-r9`; draft PR [#465](https://github.com/djshellshoxxx/GhostPay/pull/465).
- Pre-fix `packages/ux-notify/src/notification.ts` Git blob: `22051d5e5db4aa2d6811113809020102aa05bf1d`. Post-fix blob: `ff87a3c48ac89ec71fd6419e6bd70c7e3b4d10b8`.
- Registry claim commit: `d4668781e038709deed2dfeadcd2bbfd0b88db63`. Regression-first commit: `8e6ce9f03e97dc9d429d77cbac0d7fd7edd90c29`. One-guard production fix: `d471d53ac10afc0c1380523cd3e51b44142917ee`.
- Owned runtime: `packages/ux-notify/src/notification.ts`; new tests: `packages/ux-notify/src/notification.snapshot-seq.test.ts`. No other source, dependencies, workflow, contracts or wallet state modified.

## Confirmed failure and root cause
`NotificationQueue.snapshot()` stores a monotonic `seq` and generated ids `n1`, `n2`, etc. `parseSnapshot()` previously validated the id shape and duplicate ids but did not verify `Number(id.slice(1)) <= seq`. Consequently a persisted record `n1` combined with `seq: 0` passed validation. `NotificationQueue.restore()` set `seq = 0`, and the next unrelated `push()` allocated another `n1`. Accessors such as `get`, `markRead` and `dismiss` address records by id and could therefore select the wrong notification. This is a local state-integrity/correctness bug, not a claimed fund-transfer exploit.

Regression committed before the fix covers the invalid rewind with one and multiple records; controls cover valid empty sequence and valid restored sequence after a dismissed record (new id `n3`). The fix adds the single condition `Number(id.slice(1)) > seq` to the existing `record_id` validation, without changing snapshot structure, rendering, dedupe, or expiry behavior.

## Reproduction and qualification honestly recorded
- A Node.js v22.16.0 *source-equivalent* reproduction on the pre-fix id condition showed `n1` + `seq:0` accepted, followed by duplicate next-id allocation. The repaired condition passed 10/10 isolated checks for rewind, existing duplicates, invalid id shape, and valid monotonic counters.
- This was **not** a local checkout, repository Vitest run, typecheck, lint, build, native browser run or full source-hash-matched execution. The source blobs, commits and added test file above identify the exact GitHub source for hosted qualification.
- The regression-only commit's five hosted workflows were initially queued; earlier ones were cancelled or superseded after the fix was pushed. Do **not** count cancellation as RED execution or as a passed regression.
- Exact-head CI, Pages, Hosting kit, Beta acceptance, CLI operator qualification and Snyk are **not declared green** until their final conclusions are checked at the final PR head.
- Independent code review by a genuinely separate verifier was unavailable; author self-check is **not** independent approval.

## Ownership and integration
- REST open PR inventory was 223 entries in pages 100/100/23, and the changed-file lists of all 223 were checked against the exact runtime path and new test path with no direct collision. This is a point-in-time check; repeat it before integration. The active ownership registry on main was read. Existing `#407` owns `ux-flow/undo.ts` and `#220` owns `ux-flow/reconcile.ts`; neither was modified.
- Draft PR #390 rendered-text bound remains at `b655bc273a6704c9c140287b8adcdf4085b91882`, open/non-draft. Its five exact-head workflows passed and its GitHub review list is empty. It was not edited or merged.
- Integration metadata Git ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` contains `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: `status:held`, owner `994a0d214fb9-root-r3`, generation 11, recorded expiry `2026-11-21T00:16:57.174Z`. That timestamp is past, but the status is not marked released. No assumption of current lease authority, takeover, ref mutation or merge is made.

## Unfinished gates / next worker
1. Fetch the final draft PR head SHA and exact-head conclusion of each required hosted GitHub Actions workflow; fix **actual** failures only on this isolated owned branch and preserve others' changes.
2. Check existing native browser verification requirements for notification restore flows; execute/apply only when supported. No claimed browser pass in this run.
3. Obtain independent review; refresh open PR ownership and integration status with the proper coordinator. Merge only when all required gates and lawful integration-lock ownership are satisfied; otherwise remain draft.
4. Rotate to a separate unowned BUG-ONLY Pages function after this PR is handed off. Do not add features, dependencies, policy changes or contract/fund interactions.
