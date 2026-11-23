# QR SVG sparse matrix rejection — 2026-11-23

## Scope and source pins

- Main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Task branch: `automation/20261123T2221Z/bug/qr-svg-sparse-matrix`.
- Ownership claim commit: `49eb3d7a56cc766d585a8ed88672ad7efb6fb89e`.
- Regression committed before production repair: `afb2325df6d2d22dc9bdd5c8f3de01d4acbb9724`.
- Production repair: `1588d7a93a7006c6ce72b6e01d1debd134aef374`.
- Original/repaired generate.ts blobs: `87c7b111242706aae34756bfe2d7f4bcb059d10c` / `5fc59aca0415ef345f52e62e33fc11ab5e53dd5b`. Runtime errors.ts blob: `60b18daf6a7319f1dc8fe11272474181a9fb40ae`.
- Read AGENTS.md, WORKFLOW, HANDOFF and ACTIVE_WORK. All 279 open PR changed-file inventories from initial snapshot through #524 checked for packages/qr-exchange/src/generate*; no collision. No newer open PR at branch creation; main rechecked unchanged. Existing generate.test.ts untouched. No owner or shared branch changes.

## Reproduction and repair

qrSvgPath validates array length and calls Array.every, which skips holes. Missing modules are then treated as light cells, so an incomplete matrix is rendered as a seemingly valid SVG path. A 21x21 all-hole array returns an empty string instead of BAD_INPUT. Indexed reads now require a boolean before emitting the corresponding path. Valid dense matrices, dimensions, quiet-zone offset and QR generation remain unchanged.

## Executed evidence

Git checkout unavailable: git ls-remote failed DNS resolution of github.com. Copied exact production generate.ts and errors.ts from connector, independently matched both original blob hashes with git hash-object. TypeScript 5.8.3 compilation (target es2022, commonjs, esModuleInterop, strict) and Node 22.16.0 direct assertions: 6/10 passed before, 10/10 after; failures were first, middle, last missing cell and all holes. Additional neighboring checks: explicit undefined, nonboolean, wrong length/version, dense all-light and two dark corner coordinates. Actual QrExchangeError dependency executed; qrcode-generator was an unused throwing stub (qrMatrix not exercised). Repaired local blob matches GitHub returned blob. Dedicated Vitest file committed first, but full repo Vitest, lint, typecheck, build, QR generation/decoding and native browser checks not run locally. No independent verifier available.

## Coordination and remaining gates

PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882`: live draft=false, mergeable=false, 39 checks (36 success/3 skipped), five normal workflow groups plus PR #390 workflow success, Snyk success, no submitted reviews. Existing branch untouched. Lock ref `automation/ghostpay-integration-lock` at `082e754f44944ebb4be283f89176b966bf8f7b4f`: generation 12 released, not acquired. No merge until exact final-head required CI, applicable native browser qualification, independent review, refreshed ownership and legitimate integration authorization. No release/deployment, network probes, fund/contract interactions or new dependencies. Record hosted exact-head state in draft PR comment.
