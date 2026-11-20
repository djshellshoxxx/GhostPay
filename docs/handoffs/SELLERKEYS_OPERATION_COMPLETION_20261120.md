# SellerKeys backup operation completion — 2026-11-20

## Scope and source

This continuation finishes the operation-ownership work from PR #314 on the static
browser application. It does not change keystore formats, authentication, cryptography,
storage transactions, session guards, or release gates.

- Branch: `fix/ghostpay-backup-completion-20261120`.
- Starting PR #314: `740efcf061c1ca97a562b85be742dd59f3ad0911`.
- Main at discovery: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Ownership claim: `8b5a123f`.
- Added regression tests: `6550e157`.
- Runtime repair: `177c578b5804c7b81e82f64af962511a6e8ef671`.

Publication recreates the same three local trees through the authenticated GitHub
Git-data connector, retaining the original PR #314 parent and test-before-runtime
order. Commit IDs differ because GitHub creates the commit metadata. Exact mapping:

| Checkpoint | Published commit | Verified tree |
| --- | --- | --- |
| Ownership | `b458d59f367fb27bc274ffe235de8fd917f50539` | `f162a22fd54b6da73b843cf7f54b42e3cb3dc140` |
| Regression tests | `1f0d9a20153aed9e9c54609c703c359f43b72853` | `c2d5c0f5ddf25b03e6aa1ef3027ebc66024940a1` |
| Runtime repair | `dd827f02d387afd27b2678c62583b46d5f2f2320` | `41e718103e1cb06319251d6202b5f9922f982e53` |

The existing PR correctly retires an obsolete export/import or verification busy
flag when another operation takes the shared controller. This continuation retains
that behavior and corrects the adjacent unlock/write lifetime mismatch.

## Confirmed behavior and repair

The original component used one `vaultBusy` flag for cancellable vault unlock and
independent durable save/delete operations. Three controlled component regressions
confirmed different consequences:

1. Backup verification could supersede an unlock and abort its controller while the
   unlock and delete controls remained disabled indefinitely.
2. A seller-session change could re-enable Save while the preceding save still had
   not returned.
3. Editing the unlock passphrase could re-enable Confirm delete while deletion was
   still pending. Session changes and app lock must also preserve write ownership.

The component now keeps `unlockBusy` and `vaultWriteBusy` separately and derives
the shared disabled state from both. Unlock cancellation and completion release
only unlock state. Save/delete completion release only write state. Session changes,
unrelated edits and app lock do not claim that a pending write has completed.
The Cancel vault unlock control appears only for an actual pending unlock.

All existing controller, generation, session-version, reauthentication, exact-vault
record and durable-write safeguards remain unchanged. The tests use deliberately
held asynchronous seams and synthetic local records; they exercise control ownership,
not cryptographic assurance or external systems.

## Executed qualification

Dependencies were copied from the already installed QA checkout only after checking
that its package-lock blob matched this branch (`8ce2a5bb315cd84f45d3351131de0914337224ae`).
Relative workspace links resolve within this worktree. The complete web dependency
closure was then rebuilt serially from this worktree's source with a 1536 MiB Node
heap bound. The repository's build scripts and original Vitest/Vite configuration
were preserved.

- Baseline runtime from PR #314 with the added regressions: **3 failed, 2 passed**.
  The three failures were the expected busy-state assertions listed above.
- Runtime repair, `vitest run src/views/SellerKeys.operation.test.tsx --maxWorkers=1`:
  **5 passed**.
- Broader `npm exec --workspace @ghostpay/web -- vitest run src/views/SellerKeys --maxWorkers=1`:
  **6 files passed, 54 tests passed, one worker error**. The worker running the large
  `SellerKeys.test.tsx` file was terminated by `SIGKILL` after 137 seconds. This is
  incomplete execution, not a passing seven-file suite or an assertion failure.
- Scoped typed ESLint for the two changed TSX files with a 512 MiB heap limit exited
  **134**, exhausting the V8 heap. There is no completed lint result for this repair.
- Full web typecheck, build and browser checks were not rerun locally for this repair.
  Hosted CI remains required. No compiler, linter, test, coverage or memory gate in
  the repository was changed to turn an incomplete check into a pass.

## Independent source review

Fresh worker `integration_review` independently compared runtime `177c578b` and
tests `6550e157` with PR #314 `740efcf0`. The reviewer found no introduced source
blocker: cancellation/reset sites clear only unlock state, durable callbacks own
write state, their union still disables conflicting vault actions, and the existing
controller/generation/installed-session guards are unchanged. The reviewer did not
independently execute tests; execution evidence above belongs to the implementation
worker.

## Existing upstream hosted evidence

GitHub reports the following workflows successful for the unchanged PR #314 head
`740efcf061c1ca97a562b85be742dd59f3ad0911`:

- [CI 44704998117](https://github.com/djshellshoxxx/GhostPay/actions/runs/44704998117):
  all 24 jobs succeeded, including web tests, full/lean browser tests, typed checks,
  lint, and the aggregate jobs.
- [Pages 44704998075](https://github.com/djshellshoxxx/GhostPay/actions/runs/44704998075).
- [Beta acceptance 44704998104](https://github.com/djshellshoxxx/GhostPay/actions/runs/44704998104).
- [Hosting kit 44704998093](https://github.com/djshellshoxxx/GhostPay/actions/runs/44704998093).

This supersedes the original handoff's pending upstream execution status. It is
historical qualification of PR #314, not hosted qualification of this new runtime
repair or a combined integration candidate.

## Integration handoff

Root authorized publication of a new isolated draft branch; root owns integration.
Preserve PR #314
ancestry and both focused regressions while incorporating this continuation. Check
the actual combined source and all applicable hosted gates before main promotion.
The broader recovery branches modify SellerKeys separately and need semantic
reconciliation; do not replace their source blindly with this branch's file.
