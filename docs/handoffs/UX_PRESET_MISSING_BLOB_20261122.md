# GP-BUG R8 — Prevent silent preset loss when stored ciphertext disappears

Date: 2026-11-22 (UTC). Scope: BUG ONLY, encrypted local payment presets. No contracts, funds, RPC, deployment, release or dependency changes.

## Live source and ownership

- Main baseline (ref observed live): `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Task branch: `automation/20261122-r8/bug/ux-presets-missing-blob` (independent of all other automation workers).
- Owner claim in additive `docs/ai/ACTIVE_WORK.md`: `3152bd013ef49247d87e83cbeb06130488758c78`.
- Failing regression committed *before* production repair: `6721fc6abe2664b251ca2200e416dd5cdc04e057` (`packages/ux-presets/src/store.missing-blob.test.ts`).
- Production fix commit: `7d752d6f4bc2d3e47d2383d3cbe02a6fde74c86d` (`packages/ux-presets/src/store.ts`, one conditional changed).
- Main source blob: `6224fca2309c883c33fa9811d9d773c3e699cefb`; fixed blob: `de6d506808adf433c5ffc25aff9d31fb48d74475`.
- The 219 open PRs in GitHub's three-page inventory (100+100+19) were checked with `list_pr_changed_filenames`: **no existing PR modified either owned production file or new regression filename** as of this run. Broad PRs #278/#262/#264 modify an adjacent `validate.test.ts` but not the chosen files. PR #417 changes `payAgain.ts`, not `store.ts`. Future owners must recheck exact heads and new PRs.

## Confirmed reproduction and root cause

`createPresetStore` remembers the last successfully written/read revision in its own instance. When `storage.get(slot)` subsequently resolves `null` (for example, after the store slot is deleted), `load()` on main previously returned a successful *empty* store with the previous revision. Consequently `list()` falsely claimed the preset list was empty, and `save()` could replace remembered encrypted records without detecting their disappearance. Corrupted or replayed ciphertext was correctly rejected elsewhere; the absent-blob path bypassed the same in-instance rollback protection.

The one-line repair changes only this null-blob case: when `lastRevision >= 0` (a successfully observed persisted blob), `load()` now returns the existing uniform `decrypt-failed` error. A never-initialized store (`lastRevision === -1`) remains empty and writable. The response leaks no storage payload.

The test-first Vitest regression checks disappearance after successful save and after a separate instance reads the ciphertext. It asserts list/get/save/remove return the existing uniform error, no overwrite occurs, restoring the original blob recovers the stored preset, and a fresh empty store remains usable.

## Executed qualification and limitations

- Node v22.16.0 isolated, source-equivalent *original null-blob conditional*: RED, expected `ok:false` after observed revision 1 but observed `ok:true, revision:1, presets:[]` (exit 1).
- Node v22.16.0 isolated source-equivalent fixed-conditional/state replay: GREEN, 11 assertions covering virgin store, observed revisions 0/1/2/safe-max, no writes on failed load and ciphertext restoration (exit 0).
- These are **not** local repository Vitest tests, source-import runtime, TypeScript typecheck, lint, build or browser checks. Native `git ls-remote` failed with DNS `Could not resolve host: github.com`; GitHub connector used for exact file reading and commits.
- Exact-head hosted GitHub CI for final PR head must be checked after publication; no status is preclaimed here. Browser behavior still requires qualification if this module is wired into Pages.
- Independent human/agent review: **not performed**; the single coordinator's own inspection cannot qualify as independent review.

## Integration gates and handoff

- PR #390 (separate owner) at `b655bc273a6704c9c140287b8adcdf4085b91882`: five workflow groups succeeded on that exact head (CI, Pages, Hosting kit, Beta acceptance, CLI operator qualification); no GitHub review submissions. Do not alter that branch without owner coordination.
- Shared generation-11 integration lock is recorded as **held by another coordinator**, `994a0d214fb9-root-r3`, in the current PR coordination evidence. It is not ours to transfer or release.
- Keep this repair on a draft PR. Merge only if exact-head all-required CI GREEN, applicable native browser verification, genuine independent review, no new file ownership/dependency overlap, and legitimate released/held integration-lease ownership. No deployment or release authorized.
- On next iteration, refresh live main, ownership and CI before picking a *different* unowned user-visible defect in another package/Pages runtime path; preserve this PR for its owner/reviewer.
