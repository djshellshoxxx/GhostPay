# GP-BUG-BOOK-SPARSE-R13 — Source-pinned BUG-ONLY handoff (2026-11-22)

## Baseline and scope
- Repository: https://github.com/djshellshoxxx/GhostPay
- Observed live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
- Isolated branch: `automation/20261122/bug/ux-links-book-sparse-entries-r13`
- Owner claim commit: `206adc7bd4dfc0f08fa80c9a65fa6715aa32a2e7`
- Regression-first commit: `4e3208f438b9faf0065c29998e6167886210d3ba`
- Minimal repair commit: `4159c2d082a8da6c290c5a3c099d5967a1659181`
- Source `packages/ux-links/src/book.ts`: original Git blob `4c29d848f4712af4bd1b855f879134b5940a66d3`; repaired blob `89e9340f01d39133149874cef430072885193686`.
- Owned paths: `packages/ux-links/src/book.ts`, `packages/ux-links/src/book.sparse-entries.test.ts`, append-only `docs/ai/ACTIVE_WORK.md` claim, this new file. No other source changes.

## Finding and actual reproduction
`validateBook` accepts untrusted runtime book objects. It validates the array length but uses `raw.forEach((x, i) => ...)` to validate entries. JavaScript `Array.prototype.forEach` skips missing indexes in sparse arrays. Three isolated Node 22.16.0 control-flow reproductions demonstrated silent dropping of (1) first, (2) middle, and (3) trailing entries: lengths 1→0, 3→2, and 2→1. Since `serializeBook` calls `validateBook`, this can silently serialize the smaller record set. This is a local malformed runtime state/data-loss bug, **not** a claim about JSON.parse producing sparse arrays or an external exploit.

The regression file was committed **before** the source fix. It tests each hole location, serialization rejection, and ordinary dense/empty/JSON-import behavior. The minimal source change replaces `forEach` with `for (const [i, x] of raw.entries())`. Array iterators visit missing indexes as `undefined`, which the existing `exactRecord` validator rejects with the existing `BOOK` error; valid dense arrays retain their prior semantics. No new dependency or exported contract change.

## Verification and limitations
- Executed standalone Node 22.16.0 source-equivalent iteration/validation reproduction: 3 malformed inputs accepted/dropped by the original loop, 3 typed BOOK rejections by the repaired loop, plus normal dense/empty controls — 5 scoped repaired checks passed.
- This is **not** a complete, hash-matched TypeScript execution, repository Vitest, typecheck, lint, build, native browser test, or independent review. The runtime cannot resolve `github.com` to obtain a full Git checkout, and no full-repo local test is claimed.
- The committed Vitest regression is pending authoritative hosted CI execution. Confirm exact-head GitHub Actions after draft PR publication, then repair any real failure on this branch within its claimed paths.

## Ownership, related PR and integration status
- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/ai/ACTIVE_WORK.md` on main before work.
- Paginated live snapshot: 235 open pull requests. All 235 changed-file inventories inspected; **none changed `packages/ux-links/src/book.ts` or the new focused test**. PR #399 owns `request.ts` (so a separate candidate for invalid lifetime options was explicitly skipped); #392 owns `qr.ts`; broad #238/#262/#264/#278/#372 and related PRs touch existing ux-links test files/package metadata. No owner branch was edited. Recheck collision snapshot before merge.
- PR #390 (rendered display-text bound) remains open, non-draft at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`. Its five hosted workflow groups completed success; exact-head Pages/browser and Beta/browser jobs passed. 39 GitHub check-runs included 3 skipped deployment/release-specific jobs; review API returned zero reviews. No owner branch modification or merge.
- Integration-lock control ref `automation/ghostpay-integration-lock` observed at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: generation 11, status `held`, external owner `994a0d214fb9-root-r3`. Timestamp expiry is not release or takeover authority. No lock mutation, deployment, release, or main merge.

## Remaining qualification and next worker
1. Check the exact draft-PR head commit and all required hosted CI, focused Vitest, lint/typecheck and native browser gates; fix only genuine failures on this branch without changing owner-held files.
2. Obtain an actual separate independent review when available; do not self-certify.
3. Recheck main/head, open PR changed paths and external integration lease prior to any merge. Merge only after all user-required gates are satisfied and legitimate released/held lock ownership is available; otherwise leave draft.
4. Next BUG-ONLY cycle: rotate to a different unowned existing Pages/package runtime function. Avoid the current ux-links request/QR owners and this book source until merged/closed.

No feature, general consolidation, wallet/contract/fund operation, network attack, or deployment occurred.
