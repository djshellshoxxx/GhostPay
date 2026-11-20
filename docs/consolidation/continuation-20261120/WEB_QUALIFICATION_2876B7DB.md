# Web qualification of PR #307 at `2876b7db`

All local qualification gates below passed on **`2876b7db580e47a880d5951ce9e62941bcf76fdf`**, tree **`0b5bfcd30c9b0f3c25e1bd35be1207714f711193`**. This evidence-only descendant does not change the qualified source or move PR #307. It does not qualify later feature commits.

The [machine-readable record](WEB_QUALIFICATION_2876B7DB.json) contains exact commands, UTC timestamps, all 13 expanded skipped-test names, source/configuration hashes, and raw log/report SHA-256 values. Raw logs remain in scratch; the durable metrics and hashes do not preserve those raw bytes.

## Source and execution

- Repository: `djshellshoxxx/GhostPay`; [PR #307](https://github.com/djshellshoxxx/GhostPay/pull/307).
- Runtime: Node **24.22.3**, npm **11.19.1**. This local runtime is distinct from configured hosted qualification.
- Lockfile SHA-256: `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.
- Original prerequisite/static evidence recorded **2026-11-20T16:38:08.485515+00:00**.
- Full web result recorded **2026-11-20T17:11:20.958277+00:00**.
- HEAD, source tree, lockfile and empty `git status --porcelain=v1` verified again **2026-11-20T17:15:11.519961+00:00**.
- Worker: `combined_qualification`; evidence branch: `evidence/ghostpay-web-qualification-20261120`. Ownership is limited to this Markdown and its adjacent JSON. No tests are rerun for evidence publication; the later separately authorized lean build is recorded below.

## Completed local gates

| Gate | Exact command (repository root unless noted) | Exit |
| --- | --- | --- |
| Fresh locked installation | `NODE_OPTIONS=--max-old-space-size=1024 npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --maxsockets=2` | 0 |
| Production dependency graph | `npm ls --all --omit=dev` | 0 |
| Original complete library build | `NODE_OPTIONS=--max-old-space-size=1024 npm run build:libs` | 0 |
| Full web TypeScript | `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web` | 0 |
| Full typed ESLint (`src` and `e2e`) | `NODE_OPTIONS=--max-old-space-size=1536 npm run lint --workspace @ghostpay/web` | 0 |

The fresh install added 722 packages. TypeScript and ESLint emitted no source diagnostics. Existing npm configuration/deprecation warnings remain in the hashed logs. The original prerequisite checkpoint records its observation time; individual process start/end times were not separately captured. JSON labels filesystem log modification times explicitly rather than presenting them as completion timestamps.

## Complete original web test gate

The unchanged web script is `vitest run --coverage && vitest run --config vitest.nocov.config.ts`. Both stages ran sequentially once from `apps/web`, through `node ../../node_modules/vitest/vitest.mjs`. Each used `NODE_OPTIONS=--max-old-space-size=512`, `--maxWorkers=1`, and additional JSON reporting. All original tests, configuration, exclusions and coverage thresholds remained intact. Nocov started only after coverage succeeded.

| Stage | Started (UTC) | Files | Tests | Elapsed | Exit |
| --- | --- | --- | --- | --- | --- |
| Original coverage | 2026-11-20 16:44:22.156584 | 208 passed, 2 skipped | 2,969 passed, 13 skipped | 1,565.30 s | 0 |
| Original nocov | 2026-11-20 17:10:27.453459 | 3 passed | 3 passed | 32.61 s | 0 |
| **Combined** | — | **211 passed, 2 skipped** | **2,972 passed, 13 skipped, 0 failed** | **1,597.91 s** | **0** |

No retry, assertion failure, heap failure, SIGKILL or aggregation error occurred in this full attempt. Host memory observations are not a cgroup limit: the executor did not expose a mounted cgroup interface. The prior interrupted attempts remain historical failures/incomplete attempts, not additional passes. Earlier focused selections overlap the full run and must not be added to these counts.

| Coverage metric | Covered / total | Actual | Original threshold |
| --- | --- | --- | --- |
| Statements | 13,329 / 14,281 | **93.33%** | 90% |
| Branches | 9,416 / 10,503 | **89.65%** | 85% |
| Functions | 2,663 / 2,806 | **94.90%** | 90% |
| Lines | 10,750 / 11,079 | **97.03%** | 90% |

## Exact skip disposition

**Thirteen skipped tests occur in three files; only two files are entirely skipped.** Registry has one passing prerequisite assertion plus eight skipped integration assertions. These are the original source guards, not newly introduced exclusions.

| File | Passed / skipped | Source-supported condition |
| --- | --- | --- |
| [`regtest.e2e.test.ts`](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/apps/web/src/features/btc/regtest.e2e.test.ts) | 0 / 1; fully skipped | At least one of `GHOSTPAY_REGTEST_URL`, `GHOSTPAY_REGTEST_SEED`, `GHOSTPAY_REGTEST_DEST` is undefined. Source describes the live bitcoind/Esplora regtest prerequisite. |
| [`registry.anvil.test.ts`](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/apps/web/src/features/registry/registry.anvil.test.ts) | 1 / 8; partially skipped | Nested suite uses `describe.skipIf(!available)`; availability checks the configured Anvil path form, solc path and reference contract. `REQUIRE_ANVIL=1` makes missing availability fail the outer assertion. |
| [`paymentEvidence.anvil.test.ts`](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/apps/web/src/features/policy/paymentEvidence.anvil.test.ts) | 0 / 4; fully skipped | Availability requires a successful Anvil version probe and five contract artifacts. `REQUIRE_ANVIL=1` adds a failure when prerequisites are unavailable. |

The exact expanded test names are preserved from the Vitest JSON reporter in the adjacent record. No separate historical environment snapshot isolates which optional prerequisite was missing; this record does not guess. Skipped live-chain integration assertions remain unexecuted.

## Evidence boundaries and remaining gates

This completes the exact-source local locked-install, library-build, typecheck, lint, original web-unit-test and subsequent lean production-build gates. It does not establish hosted CI or browser success. Before main promotion, require applicable current-head hosted checks, full/lean browser suites, Pages build/artifact/browser acceptance, CodeQL, and complete Tor qualification.

The existing source-pinned [invoice-file review](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/docs/consolidation/invoice-file-20261120/REVIEW.md) records Chromium failing to create its required socket before a page exists; no new browser attempt was made here. The [Tor qualification handoff](https://github.com/djshellshoxxx/GhostPay/blob/2876b7db580e47a880d5951ce9e62941bcf76fdf/docs/handoffs/TOR_QUALIFICATION_REPAIR_20261120.md) retains its application/browser/container gates. DOM tests are not browser acceptance.

Evidence-branch changes are limited to this Markdown and its JSON record. Source, tests, manifests, lockfile, gate configuration, main, PR #307, release/deployment state and the consolidation lock remain unchanged.

## Subsequent original lean production build

One separately authorized build ran on the same unchanged `2876b7db580e47a880d5951ce9e62941bcf76fdf` source:

```bash
NODE_OPTIONS=--max-old-space-size=1536 GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web
```

- **Exit 0**, one attempt, **22.34 seconds**. Started **2026-11-20 17:25:09.701584 UTC**; completed **17:25:32.037225 UTC**.
- The original `tsc -p tsconfig.json --noEmit && vite build` and original `node scripts/scan-bundle.mjs` postbuild both passed.
- Postbuild verified **17 files**, validated the bundled deployment source, and found no dynamic code, unexpected origins, source maps, or loose deployment JSON.
- Generated local `apps/web/dist` contains **17 files / 2,481,926 bytes**. Every output path, size and SHA-256 is recorded in the JSON. Raw output files are not committed.
- Build log: `qualification-lean-build-2876b7db.log`, 2,517 bytes, SHA-256 `44012c86c975c045e1113222b32723c5df794cc0af26c690ea0fa9710ae6c080`.
- Before and after: HEAD/tree matched the qualified source, `git status --porcelain=v1` was empty, and the lockfile hash was unchanged. No retry or source/configuration edit occurred.

The exact requested command did not supply `GP_COMMIT`; generated `build-info.json` reports `commit: "unknown"`. This external evidence binds the verified source and emitted bytes; the output is not claimed as an identified release artifact. Scope is the **lean local production build**. No browser was launched, no full-profile production build was run, and nothing was deployed.

Nonfatal warnings are retained: npm's existing proxy setting, late resolution of `help.css` (present in final output), browser externalization of `node:http`, mixed static/dynamic QR-reader imports, and a chunk above the original 1,200 kB warning threshold. No warning threshold or gate was changed. Browser acceptance and the hosted release gates remain separate.
