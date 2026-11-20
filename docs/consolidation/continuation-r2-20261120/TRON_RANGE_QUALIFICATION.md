# TRON range completeness: qualification and handoff

## Result and source

The recovered range-completeness check passed the complete original TRON adapter coverage suite, all three web TRON test files, package gates, full web TypeScript/typed lint, and the original full-profile production build with its postbuild scanner. All gates ran once against unchanged application/test source.

- Qualified source: `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272`.
- Qualified tree: `46c186bfb4f7e15b384c9a0ba361790d8c7e6876`.
- Base: PR [#321](https://github.com/djshellshoxxx/GhostPay/pull/321), `87c3bf5a59f4d443c9e5cf81368162554a5315c3`.
- Selected donor: PR [#271](https://github.com/djshellshoxxx/GhostPay/pull/271), `429a4de80b9ec53177b17d89d18ce8ec91a08814`.
- Test-first checkpoint: `e1575f7a07c0fbe881697a0561457eae9f240523`.
- Qualification worker: `/root/range_qualification_r2`; independent source reviewer: `/root/ci_triage_r2`.

The code requires every requested height, in order, before a page can yield payment observations or trigger address/memo lookups. Only `getBlockRange` changed at runtime: seven additions and five deletions. Its three associated test/fixture files preserve complete-range behavior, test missing endpoints/interior heights, and correct the mock node to return empty blocks throughout the requested range. All four product blobs exactly match the selected donor. The existing #321 cancellation source and regression file are unchanged.

## Controlled RED and corrected GREEN

The coordinator executed the tests-only checkpoint before runtime recovery. The qualification worker read its complete JSON outputs and command metadata.

| Selection | RED result | GREEN result |
| --- | --- | --- |
| Package scanner file | 25 passed, 2 expected failures | Included in the complete package run below |
| Web hardening file | 30 passed, 4 expected failures | 34 passed |
| Complete TRON adapter package | Not claimed for RED | **107 passed, zero failed, zero skipped; 10 files** |
| Complete web TRON selection | Not claimed for RED | **50 passed, zero failed, zero skipped; 3 files** |

The six RED failures are the intended missing/absent-range acceptance and strict-genesis behavior. No unrelated failure appeared. The 50 web cases comprise 34 hardening cases, 15 view cases and one lock-lifecycle case. Do not add the focused RED/GREEN subsets or the earlier #321 qualification counts to these totals.

Original global package coverage thresholds **95% statements / 90% branches / 95% functions / 95% lines** passed unchanged. Measured coverage: **97.04% statements / 93.36% branches / 98.93% functions / 99.11% lines**.

## Executed gates

| Gate | Outcome | Duration |
| --- | --- | --- |
| libraries | Passed | 118.256 s |
| package coverage | Passed | 5.349 s |
| package typecheck | Passed | 2.079 s |
| package lint | Passed | 4.083 s |
| package build | Passed | 2.658 s |
| web tron | Passed | 16.763 s |
| web typecheck | Passed | 17.336 s |
| web lint | Passed | 37.684 s |
| full build | Passed | 20.894 s |
| secrets | Passed | 0.11 s |
| whitespace | Passed | 0.008 s |

The adjacent JSON preserves every exact command, working directory, environment, timestamp, exit code, original stdout bytes in lossless JSON strings, and SHA-256 hashes. Test runs used one worker and a 512 MiB heap. Full gates used 1536 MiB. No retry, assertion relaxation, suppression, dependency edit, threshold change or gate modification occurred.

The web test selection used the original Vite/Vitest configuration. It was not a complete web coverage/nocov run. The original full TypeScript and typed ESLint gates still covered the entire web source and E2E source.

## Full-profile production build

`GHOSTPAY_LOCAL_BUILD_PROFILE=full GP_COMMIT=bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272 npm run build --workspace @ghostpay/web` passed, including the original TypeScript, Vite and postbuild scanner. The scanner validated **19 files**, reporting no dynamic code, unexpected origins, source maps or loose deployment JSON. Generated files total **2,991,905 bytes**; every path, size and hash is recorded in the JSON. `build-info.json` records the qualified local source commit. This is local build evidence, not a deployed or hosted-attested artifact.

The build emitted nonfatal warnings for late `help.css` resolution, `node:http` browser externalization, mixed static/dynamic QR-reader imports and the existing configured chunk-size threshold. `help.css` exists in the output. No warning threshold was changed.

## Source and dependency provenance

The clean detached qualification checkout stayed at the exact source/tree above before and after all gates. Source-matched libraries were rebuilt there with the original `npm run build:libs`. External third-party dependencies were reused from the already qualified Sweep installation; root/workspace manifests, lockfile and relevant configuration were verified identical before reuse. The checkout's `@ghostpay` links pointed to its own packages/builds. Local versions were Node v24.22.3 and npm 11.19.1. This is not a fresh-install claim.

A post-run audit found two inherited cache links, `.vite-temp` and `.vitest-cache`, still pointing to the Sweep cache directories. All recorded runs therefore used source-path-specific shared caches. After every gate completed, only the qualification checkout's two links were replaced with empty local cache directories; shared targets and dependency directories were preserved. No fully isolated-cache execution is claimed. The cache audit and precise timing are included in the JSON.

## Independent review and remaining boundary

The source reviewer approved the immutable runtime before GREEN and found no blocking source/test issue. The review checked strict parser/range bounds, refusal before page yields/address lookups, complete positive fixtures, exact donor blobs and preserved cancellation behavior. The reviewer did not execute the qualification commands; this worker did.

No source changed during qualification. The final documentation-only commit adds this evidence and updates ownership status. The coordinator owns public commit mapping, fresh head/overlap checks, applicable hosted CI and integration-lease ownership before promotion. The older donor's browser-infrastructure failure does not qualify this composition. Browser acceptance, the full web coverage/nocov suite and hosted gates remain separate. No browser, live RPC, wallet, funds, release or deployment action occurred.
