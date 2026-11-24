# GP-BUG-10 — preserve lock revocation during address-book vault rekey

Date: 2026-11-20. Scope: `packages/ux-vault` (standalone address-book session API, **not** a proven current Pages UI exploit).

## Exact source and test-first sequence

- Main at discovery: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Report: read-only bugcheck PR #312, `docs/notes/bugcheck-2026-11-19/details/core-packages.md` / CP-02.
- Isolated branch: `fix/ghostpay-vault-rekey-lock-revocation-20261120`.
- Regression-first commit: `68c77b7f9f108d54de0dd1592f432bb27603838e` (new `packages/ux-vault/src/vault.rekey-lock.test.ts`).
- Production fix: `f7bc60a1b704392e70fe5918766f70a4ab53fb78` (one captured key-context reference and one guarded assignment in `packages/ux-vault/src/vault.ts`).
- Original runtime file blob: `2cb0dbee41ab47e4bba5dcb3c2246d5547af8bdb`; new file blob: `402da7d6761b0c19eedcb8c0f6af2996f9411f5e`.

## Reproduction and behavior

The original `changePassword` serial operation captures the book, then awaits storage, authentication, KDF and ciphertext persistence. `lock()` synchronously clears `ctx` and `book`. Previously the async continuation unconditionally assigned `ctx = fresh`, resurrecting a nominally unlocked session with no book. A source-pinned audit reproduced that contradiction on main.

The new deterministic Vitest regression pauses the profile ciphertext write, locks the session during the pending password change, releases the write, then checks: the existing session stays locked; book and backup access remain denied; the old password no longer unlocks; the new password succeeds only by explicit fresh unlock. The implementation captures `c` from `live()`, and installs the new `ctx` **only if `ctx === c`** after persistence. This mirrors the existing `mutate`/import lifecycle guard.

Storage-side re-encryption may finish after lock; this change only prevents resurrecting in-memory authority. No password storage, cipher, backup format, RPC, fee, custody, workflow, dependency or deploy policy changes.

## Validation status and integration

- Baseline reproduction is documented in PR #312; **the new committed Vitest regression has not been executed locally** because this invocation cannot resolve `github.com` for a checkout, and repository dependencies are absent.
- GitHub pull-request CI (package tests, TypeScript, lint and security workflows) must run on this exact head and be reviewed. Fix reproducible failures without weakening this lifecycle assertion.
- No independent verification, complete beta qualification or release approval is claimed.
- Compared main-relative file paths for active PRs #307, #278, #264, #262, #319 and #325. None of their reported changed paths included `packages/ux-vault/src/vault.ts` (note compare endpoints for very broad PRs may truncate the changed-file list at 300).
- Shared integration/coordination lock is claimed by another worker in recent docs; this branch does **not** modify the lock, merge into main or deploy.
- Subsequent coordinator: refresh main and PR heads; execute and review exact-head tests; recheck overlap and lock; merge this focused PR only after required gates pass.
