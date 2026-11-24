# Near-finished GhostPay integration — 2026-11-24 UTC

## Source and status

This branch combines the already reviewed fiat, countdown, POS and QR changes for one normal main integration. It introduces no additional behavioral repair. The integration worker is `/root/branch_inventory`; coordinator `/root` owns remote publication and integration authority. Independent verifier `/root/completion_review` reviewed the frozen combined runtime below and found no blocking preservation or cross-feature issue.

- Branch: `integration/near-finished-20261124`.
- Ownership claim committed before integration: `963895773eec7d2886791a53a2cd8762c5afadac`.
- Tested combined source commit: `10d8ecdbf80233a551f95f9f87489cd78692c4db`.
- Tested combined source tree: `4f2ab0617b8ea99159f1e6dde85121ab136acc39`.
- Actual main at qualification: `706188000c38b3dde5a3a362370a530870aa7587`, tree `f46350ea01dd29b3186ae080498cf35894b99728`.
- Local source-equivalent main: `518a812731ee5281cf80cd08eee4b31216464bc1`, the same tree as actual main.
- This handoff is the only file added after the tested source commit. Its final documentation commit has no runtime, test, dependency, configuration or registry changes.

| Donor | Published head to preserve | Qualified donor tree | Local exact-tree representative |
| --- | --- | --- | --- |
| #568 fiat output bound | `c9ebbdd41368f65cab27c909a146dc7d0960553d` | `f59848c47328679f0bcbfd1faad0f832f0a45d68` | `938968decae7425568030c0ba40730939ffceca8` |
| #574 countdown | `96d20f778e3f92fa26144c9f97525eae4b3290a1` | `cd5461839d1b9394692a5dc65de9aac269f02561` | `2c2192cfef88705994dcfb9964a3f4690a4d2f72` |
| #576 POS | `4ae333d3ffa85eb14c074a543bdc084370dd1e49` | `4d79a7c7cd1a14262a05b41c5030a121da7306fb` | `c434322273ba727cbc7a1392159df099347a142e` |
| #581 QR | `74121278a08eaf4eddd85651a4518ef657aeeb16` | `d51fba8f5fb6e3200261d7ec44c803986931cee7` | `baa495646eef5be0870dba5af3a2c41d9f2da793` |

The coordinator verified each published donor tree against its local representative. The first three published donors each retain their original implementation head plus actual main as parents; the QR publication retains original #581 `41a598b8433e10a95598c72c2a23027e63010024` plus actual main. The intended integration publication preserves actual main and all four published heads as parents. Use a normal merge to preserve these histories; a squash would not preserve the reviewed ancestry.

## Scope and preservation

The changes bound forward fiat conversion output, reject invalid countdown values, preserve POS state across malformed clocks and late observations, and finish the QR runtime/image/camera/matrix stack. QR includes the reviewed responsive SVG rendering correction and pinned jsQR version-23 alignment correction with package and static-site license notices. Each donor's source, tests, build configuration and notices are retained exactly.

The four donor diffs have 43 unique paths relative to the frozen main. Their only shared path is `docs/ai/ACTIVE_WORK.md`. All 42 non-registry paths match their donor Git blobs exactly: three fiat, three countdown, ten POS and 26 QR. No other main path changed. The registry preserves every complete main and donor document as ordered lines, including the original ownership records and premerge claims. No conflict markers remain.

All four local donor representatives are ancestors of the combined source commit. POS also retains original #406 `506604288e31c195c852fa2e8896e131da34bc3b`, #411 `482d36ad436f4b27b2d86ff9a2c22daf150000ad`, and #576 `a2c9bdf08549d53f27a1e57bd868f8c37c789ec0`. Main's merged package fixes, including button-label and NFC bounds regressions, and its schedule clock-rollback fix remain unchanged.

Clipboard #580/#553 and broad #504 remain with their existing owners and are outside this composition. The independently reviewed #504 head `1a7447d58c08363209b6b9b67e9a6afad07d87f3` and the known #553 checkpoint `068fbc36b80311c107dfd3619d631fca794fac58` are not ancestors of the QR donor. No donor branch was rewritten by this integration worker.

## Combined native verification

The following results were obtained on the combined source commit above, with one test worker and no source/test edits between gates.

| Gate | Actual result |
| --- | --- |
| Merchant-hooks package suite | 52/52 tests in five files; 100% statements/functions/lines, 99.62% branches |
| Fiat package suite | 54/54 tests in two files; 100% statements/functions/lines, 99.31% branches |
| QR-exchange package suite | 261/261 tests in twelve files; 97.50% statements, 95.05% branches, 100% functions, 99.11% lines |
| Formatter, countdown, scheduler/jitter and QR view/frame suites | 78/78 tests in eleven files |
| Total focused unit tests | 445/445, zero skips |
| Money and POS reducer parity | 5/5; includes 200 generated lifecycles and 200 malformed-input cases against both reducers |
| Builds of merchant-hooks, ux-fiat and qr-exchange | Passed; merchant-hooks also rebuilt invoice-schema |
| Typechecks and repository ESLint for those three packages | Passed |
| Typed ESLint for all eight changed web TypeScript files | Passed |
| Full web typecheck, Vite production build and original postbuild scan | Passed in both full and lean browser runs |
| Full-profile original image and POS browser scenarios | 6/6 passed, 39.4 seconds including build/startup |
| Lean-profile original image and POS browser scenarios | 6/6 passed, 31.1 seconds including build/startup |
| Static jsQR license notice in both build outputs | Byte-identical to the source notice, SHA-256 `136542397628a4f479ea7ff2fe56e5951c1540b4c546ff3bda36d2df5a1c85ec` |
| Repository committed-secret scan and whitespace checks | Passed |

Package commands used `NODE_OPTIONS=--max-old-space-size=384`:

```sh
npm run build -w @ghostpay/merchant-hooks -w @ghostpay/ux-fiat -w @ghostpay/qr-exchange
npm run test -w @ghostpay/merchant-hooks -w @ghostpay/ux-fiat -w @ghostpay/qr-exchange -- --maxWorkers=1 --no-file-parallelism
npm run typecheck -w @ghostpay/merchant-hooks -w @ghostpay/ux-fiat -w @ghostpay/qr-exchange
npm run lint -w @ghostpay/merchant-hooks -w @ghostpay/ux-fiat -w @ghostpay/qr-exchange
node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs
```

The selected web unit files were `src/lib/format.countdown.test.ts`, `format.test.ts`, `jitter.test.ts`, `qr.test.ts`, `qrContrast.test.ts`, and `src/components/QrView{,.i18n}.test.tsx` plus `QrFrame{,.i18n,.largeWarning,.security}.test.tsx`. The command used native Vitest with `--maxWorkers=1 --no-file-parallelism` and a 768 MB Node heap. Typed ESLint used the unchanged repository config for the three changed formatter files, `QrView.tsx`, and `e2e/{helpers,qr-camera.spec,qr-invoice-image.spec,pos-terminal.spec}.ts`.

## Browser acceptance

Both profiles used the original committed Playwright configuration, desktop project, one worker, zero retries and zero skips. The successful command from repository root was:

```sh
GHOSTPAY_CHROMIUM=/workspace/scratch/efb8df2579c9/mobile-browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell GHOSTPAY_LOCAL_BUILD_PROFILE=full NODE_OPTIONS=--max-old-space-size=1024 npm run test:e2e -w @ghostpay/web -- qr-invoice-image.spec.ts pos-terminal.spec.ts --project=desktop
```

The lean run used the same command with `GHOSTPAY_LOCAL_BUILD_PROFILE=lean`. The configuration's normal `npm run build && npm run preview` path built the actual combined web source and ran the original postbuild scan. The QR case rendered Create Invoice, decoded its screenshot through the real image-import path, rejected damaged and unsupported-family input, and retained the original review/no-external-request assertions. The five POS cases exercised paid, expired and cancelled sales, clock recovery and late-payment rejection, failed-clock cancellation and empty reload. The POS route handler served the unchanged combined checkout's actual HTML/CSS/JavaScript and pinned QR renderer.

The first invocation placed `--project desktop` before the filenames. This Playwright version interpreted those filenames as additional project names and stopped before build or tests. The setup error is preserved separately; it is not a product failure or a passing run. Reordering the existing arguments resolved it without configuration or assertion changes.

Runtime was Node `v24.22.3` and Chrome for Testing headless shell `156.0.8078.4`. These browser selections do not qualify physical cameras or the unsupported local fake-camera path. The eventual integration PR still requires the normal complete hosted gates.

## Dependency provenance

The lockfile is unchanged, SHA-256 `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`. Installed versions were TypeScript 5.9.3, Vitest/coverage-v8 5.0.5, ESLint 10.15.0, typescript-eslint 8.73.0, Playwright 1.64.1, Vite 8.3.5, fast-check 4.10.2 and qrcode-generator 2.0.4. Workspace package links point to this combined checkout.

To avoid recompiling unrelated packages, 61 existing QR-worker package output directories were copied only after comparing the entire tracked package tree and root package/config/lock blobs. Every copied output file was then byte-compared. Invoice-schema's existing local output was retained and subsequently rebuilt by the merchant-hooks build. The changed merchant-hooks, ux-fiat and qr-exchange packages were freshly built from the union. The QR-worker cache provenance traces to source-identical package inputs at `6ea8140c468b2f1ad0036737a2e13f8cad8d30cb`, with its main-affected libraries freshly rebuilt before reuse. No dependency or cache source was changed.

## Independent review and remaining integration gates

`/root/completion_review` independently verified source commit `10d8ecdbf80233a551f95f9f87489cd78692c4db` and tree `4f2ab0617b8ea99159f1e6dde85121ab136acc39`: exact donor tree entries, no non-registry overlap or extra paths, all four donor ancestries, complete registry content, unchanged QR vendor/notice hashes and no cross-feature runtime issue. This is an AI-assisted engineering review, not a submitted GitHub review or external audit.

The fresh published donor workflows were queued/pending during qualification. Earlier donor-head hosted successes and this exact combined local verification are distinct evidence. No hosted-success claim is made for an unpublished/new integration head. Preserve the complete CI, Pages, Hosting kit, Beta acceptance and applicable browser/security gates on the eventual published integration PR.

The next coordinator must refresh live main, all donor/integration heads, owners, reviews and exact-head checks. Preserve the five intended publication parents (actual main plus the four published heads in the table), independently compare the actual publication tree, and use the existing atomic cooperative integration lease only when ready to merge. Do not hold the lease while waiting for CI. Recheck lease, main, PR head and checks immediately before a normal merge; verify the resulting main tree and release only the owned lease. If main has moved, qualify the actual updated composition. Existing completion/consolidation automations can resume from this handoff without weakening gates or enabling native auto-merge.

No remote mutation, shared lease change, deployment, release, real wallet transaction or real funds operation was performed by this integration worker.

## Evidence fingerprints

Logs and machine-readable proofs were captured under `/workspace/scratch/74aa08c7aedc`; the source pins, results and acceptance requirements above remain sufficient to reproduce qualification if that temporary workspace is unavailable.

| Evidence | SHA-256 |
| --- | --- |
| `near-finished-package-builds.log` | `ed3d26c0284ebd26ae51cbf645917a2ab890e3339d4bcac1d0a48cf2476ece6c` |
| `near-finished-package-tests.log` | `cb15cc540f0a34251d7368ca684ecf642618fbedce588f01733972f756b2a442` |
| `near-finished-package-typechecks.log` | `f334f183ce09e9089125fa54a268934a97c88039c241e91812f54cb6bf3f9d50` |
| `near-finished-package-lints.log` | `d748d034d4b2ab2d797208cc1d88fcce10c6c29b3b96fc4a245e8cc32cf44bae` |
| `near-finished-web-tests.log` | `93699db116273553e0879b42ea01ebb2c1890667710b302ccf45f43ea7e9e6cc` |
| `near-finished-web-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `near-finished-parity.log` | `4f10999ffa31e431dfe4b0ba4d60c843a66269a7e2e3c8a9fcd98e9fcd2de1fc` |
| `near-finished-browser-full.log` | `37b6fb258e64e043e9c492ae3eba3597aa78bd192e1259bd8d71f6f826d0c604` |
| `near-finished-browser-lean.log` | `b2906b5f3f7ba51244d268028ef67de4fdc180d6d2a0ebda9d5855710cc75830` |
| `near-finished-secrets.log` | `273277e5da1ce7eea08d91903610788d94c50266906f03c78a247dc730dd22b9` |
| `near-finished-browser-full-setup.log` | `7e67a13fad1f40408f28314f7327974cb984244a51517bfdb07f3628eb03e3ac` |
| `near-finished-source-proof.json` | `fdd3ffa94843b58f1281094d155d06fd54ec7d4ab622c53d85ce8fd0f954b3e9` |
| `near-finished-dependency-reuse.json` | `6f7db754fc4cc530bcabf850cf267d0ee22d864f74853eff30bb7d2c02913508` |
| `near-finished-static-notice.json` | `3fe321e3153301a1ebdad05a76473c7bb561ea629359ef249b3c844339d0a312` |
