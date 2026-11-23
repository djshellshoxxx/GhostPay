# GhostPay BUG-ONLY handoff: CSV ChunkWriter duplicate header (2026-11-22 UTC)

## Baseline and scope

- Main: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (verified unchanged immediately before the claim).
- Baseline production file: `packages/ux-export/src/encoder.ts`, Git blob `b54cdede86aee5802045e73461a65e18bf3311e9`.
- Branch: `automation/20261122T0522Z/bug/ux-export-header-once-r3`, draft PR [#444](https://github.com/djshellshoxxx/GhostPay/pull/444), target main.
- Single existing-functionality fix: public `ChunkWriter.header()`, documented “first call only,” did not check `this.started`. Repeated calls appended a second header anywhere in output; output is no longer a single-header ledger CSV.
- Explicitly excluded: new features, importer/exporter redesign, broader refactors, wallet/funds/RPC/contract paths, dependencies, real network traffic, deployment, release, shared branch or lease changes.

## Reproduction and root cause

Main source uses:
```ts
header(fields: readonly string[]): string | undefined {
  this.started = true;
  if (this.bom) this.add('\ufeff');
  this.add(this.line(fields));
  return this.take();
}
```
There is no ownership gate after `started` becomes true. Local Node 22 source-*equivalent clause replay* (not installed repository Vitest) ran header `id`, row `one`, header `id`: `{"rejected":false,"csv":"id\\r\\none\\r\\nid\\r\\n","headers":2}`. The malformed CSV can be reproduced without any external inputs.

## Test-first isolated changes

1. Task ownership claim on branch: `f41f211bffea15850940bc390a83aa9776f5f7aa`, additive section in `docs/ai/ACTIVE_WORK.md`.
2. Regression **before** production source change: `1ceb4d2bac7e346aa07dca38e0e151d7bc933a3c`, new `packages/ux-export/src/encoder.header-once.test.ts`. Tests assert rejection before buffered flush, after chunk emission, no accidental mutations, and unchanged normal BOM/row behavior.
3. Minimal production repair: `3db28c4e933f90ee7f614d94d047ee35a9161676`, one conditional before `this.started = true`:
```ts
if (this.started) throw new ExportError('INVALID_OPTION', 'header already written');
```
   Repaired source Git blob: `8efebae83688c389ca641b85476f5cdb3d2b2e74`. Existing `ExportError` is already imported. No other production change.
4. This additive source-pinned handoff commit, without modifying existing handoffs.

## Verification performed and limitations

- Executed the baseline source-equivalent replay with Node 22: duplicate header accepted and duplicate header in resulting text.
- Executed repaired source-equivalent replay with Node 22: seven independent clause assertions passed (before-header row rejection; one header; rows; duplicate rejection with `INVALID_OPTION`; preserved output; subsequent rows), plus a deliberate duplicate-header throw. These are **not** locally run repository Vitest or build.
- No local repository checkout: container DNS cannot resolve `github.com`; no claim that the full TypeScript package, browser, lint or tests ran locally.
- Hosted GitHub Actions: regression-only commit was briefly published to draft PR #444; at the first read its workflow set was pending/in-progress/cancelled after newer push, **not** claimed as a completed red test. The repaired and handoff exact head must have its own all-required GREEN checks.
- PR #390 exact source head `b655bc273a6704c9c140287b8adcdf4085b91882`: CI, Hosting kit, Pages, Beta acceptance and CLI operator qualification all succeeded; GitHub review list empty. It remains under separate ownership; no edits made.
- Ownership: **202/202 other open PRs examined** using the GitHub changed-filename inventory across all 196 source-pinned R30 PR numbers plus the six newer PRs #438–#443. No PR changed `packages/ux-export/src/encoder.ts` or `packages/ux-export/src/encoder.header-once.test.ts` at this scan. The task PR #444 is the sole same-file owner. The 196 IDs were pinned at GitHub blob `d5819519bdc67e09e521ca32277a27a72a7b6a26` in R30 PR #438, head `745004a16dbb712a1085d3e7377d9abe951e9599`; the six additions were read live. All 202 inventory calls succeeded, with zero errors and zero collisions. This is an exact-file check; it is not blanket semantic approval of broad PRs.
- Independent human/separate-worker verification not available here. No GitHub approval claimed.
- Generation-11 integration lease is reported held by another coordinator in recent GhostPay coordination handoffs. No lease acquisition or merge.

## Required gates and next owner action

1. Inspect [draft PR #444](https://github.com/djshellshoxxx/GhostPay/pull/444) at its latest commit; establish that focused Vitest, typecheck, lint, builds, and required hosted workflow groups are GREEN at **that same head**. Do not count superseded/cancelled workflow runs.
2. Confirm no current PR or active-worker path conflicts, and test normal CSV imports (including BOM and CRLF) where practical.
3. Obtain independent review from a genuinely separate verifier and any required native browser qualification.
4. Only a legitimate released/transferred integration lock owner may merge, and only after all other gates; otherwise leave draft and pass forward.
