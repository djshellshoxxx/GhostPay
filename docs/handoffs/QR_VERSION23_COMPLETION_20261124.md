# QR fallback and final #581 qualification — 2026-11-24 UTC

## Source and ownership

Worker `/root/qr_completion` on isolated `finish/qr-581-20261124`; coordinator `/root` owns publication and integration. Original PR #581 head: `41a598b8433e10a95598c72c2a23027e63010024`. Original worker/donor branches remain unchanged.

Final implementation and static notice: **`4da0221e23bda44207016d123e4debcbeb350187`**, tree **`a1d53adf52f8d62de71e7f7cccd22f8106b29635`**. This handoff is added afterward without changing production, test, dependency or build inputs.

| Step | Exact local commit |
| --- | --- |
| Responsive invoice renderer correction | `4cc28bd014cb69f4f3ae27af7179b9700f46ea41` |
| Version-23 failing regressions | `b8c88bf1042c3be928108ad818a71a1ee1a0a775` |
| Static decoder correction | `fb9cf1dfeed7f6db7a16a0a6322a14850d3ca1ab` |
| Compose current-main source | `a470d4d6e0f39c735cbecfe9444e5dca54fa315b` |
| Static browser notice and provenance check | `4da0221e23bda44207016d123e4debcbeb350187` |

Coordinator-supplied main: `706188000c38b3dde5a3a362370a530870aa7587`, tree `f46350ea01dd29b3186ae080498cf35894b99728`. Local source-equivalent `518a812731ee5281cf80cd08eee4b31216464bc1` has that exact tree and was merged here. Only `docs/ai/ACTIVE_WORK.md` conflicted; every line of both parent registries was preserved in sequence. Remote publication must retain original PR and actual-main ancestry; the local equivalent is not represented as published main.

## Demonstrated defects and bounded repairs

[QR_INVOICE_IMAGE_COMPLETION_20261124.md](QR_INVOICE_IMAGE_COMPLETION_20261124.md) retains the paired browser evidence for responsive raster failure. `QrView` now uses `geometricPrecision` to preserve fractional module coverage. The original image acceptance test and its signature, chain, explicit-review, damaged-image, unsupported-family and zero-external-request assertions are byte-unchanged.

Independent review then found a separate fallback defect. Pinned jsQR 1.4.0 lists version-23 alignment centers `[6, 30, 54, 74, 102]`; the generator uses `[6, 30, 54, 78, 102]`. Through the actual exported reader, five pristine version-23-L cases returned `null`: 1004/1030-byte ASCII, 1005-byte UTF-8, and accepted 1008/1048-byte v2 settings exports. The RED commit recorded **5 failures and 4 passing controls**. Version 22/24/25, version-23-M and blank-image controls passed; not every version-23 code fails.

The reader now lazily imports a static ESM snapshot of the existing pinned distribution. Its entire original factory body has exactly **one changed byte**, alignment-center digit `4` to `8`. The outer UMD dispatch is mechanically adapted to an ordinary static ESM export. There is no runtime source rewriting, `eval`, dynamic function construction, node_modules mutation or dependency/lockfile change. Public decoder interfaces and resource cleanup remain unchanged. TypeScript emits the module and a typed declaration.

The normal package suite checks the original distribution hash, reconstructs the complete expected local file using only the approved wrapper/table changes, compares every byte, and checks both license artifacts. The vendor README records a deliberate upgrade/removal path.

## Distribution and attribution

| Material | SHA-256 |
| --- | --- |
| Original pinned jsQR distribution | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Corrected local source | `0b7c699a00742b28091ab75aa56f86ff05a7b036af73fe8359b33aa920f3e992` |
| Unmodified upstream license | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |
| Browser notice, 11867 bytes | `136542397628a4f479ea7ff2fe56e5951c1540b4c546ff3bda36d2df5a1c85ec` |
| Emitted package module | `e8249901653e0f76c80af163663b74d08fc0c9f88f114f739d8e9234ad39a93e` |
| Minified decoder chunk, both profiles | `416fdb09b1ade282c4c29e58d8888d7ae821c73a939164d4cf8a4b317b3ff997` |

The package module retains the complete Apache-2.0 license in its banner. Vite strips comments, so both browser profiles separately include `licenses/jsqr-1.4.0.txt` through the existing public-directory copy. Both final emitted notices equal source byte for byte; lean's `publicCopied` proof includes this path. The notice contains upstream attribution, complete license, correction description and source hashes. No minifier, build gate, CSP or runtime setting was changed for attribution.

## Final composed-source verification

| Check | Actual result |
| --- | --- |
| Normal qr-exchange suite with unchanged coverage thresholds | **261/261 tests, 12/12 files passed** |
| Coverage | Statements 97.50%; branches 95.05%; functions 100%; lines 99.11% |
| qr-exchange typecheck, ESLint, TypeScript build | Passed |
| Changed current-main package outputs rebuilt | i18n, merchant-hooks, merchant-billing, ux-export, ux-intake, ux-schedule, plus invoice-schema and qr-exchange passed |
| Full normal web TypeScript, Vite production build and original bundle scan | Passed |
| Full original invoice-image Playwright journey | **3/3 repeated runs passed** |
| Lean normal web TypeScript, Vite production build and original bundle scan | Passed |
| Lean original invoice-image Playwright journey | **3/3 repeated runs passed** |
| Emitted decoder and full license notice | Exact corrected table/notice bytes in both profiles |
| Repository secret scan and Git whitespace check | Passed |
| Independent final source/artifact review | PASS; no blocking finding at the implementation commit above |

The nine new interoperability tests use the public generator and real decoder with deterministic four-pixel module grids and a four-module white quiet zone. Settings cases also traverse `decodeQrImage`, parse the exact settings text, and verify bitmap closure/canvas reset. Three provenance tests cover vendor bytes, embedded license and static notice. Existing camera, error, native-detector and integrity cases still run in the normal suite.

Independent reviewer `/root/completion_review` verified the one-byte factory delta, static AST/no dynamic evaluation, typed emission, and **10/10 independent compiled public-API cases**; original jsQR still failed the same five version-23-L cases. The reviewer also executed the actual final minified decoder against a formerly failing 1030-byte fixture and accepted 1008-byte v2 settings export, and verified identical full/lean chunks, exact notices and unchanged original image assertions.

Browser acceptance used Chrome for Testing headless shell 156.0.8078.4, Playwright 1.64.1, synthetic invoices and existing local-origin interception. Local uncommitted config extends repository config, selects desktop and retains the normal build/preview pipeline. Each profile rebuilt freshly with this command from the repository root, replacing `full` with `lean` for the second run:

```sh
GHOSTPAY_CHROMIUM=/workspace/scratch/efb8df2579c9/mobile-browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell \
GHOSTPAY_LOCAL_BUILD_PROFILE=full NODE_OPTIONS=--max-old-space-size=1024 \
npm run test:e2e --workspace @ghostpay/web -- \
  --config playwright.qr-local.config.ts qr-invoice-image.spec.ts --repeat-each 3
```

Dependencies and unchanged compiled package outputs were reused under the source comparisons recorded in the earlier handoff. Every package production input changed by newly composed main was rebuilt before final browser runs.

## Evidence fingerprints and qualification limits

Local logs/artifact checks remain outside the repository:

| Evidence file | SHA-256 |
| --- | --- |
| `qr581-v23-red.log` | `e6cafd1394452170a0cdd580ff35347b2f683d72f4e4f6a119a550d5ebb8e0cc` |
| `qr581-final-library-builds.log` | `e91860c6e8bf2297dae432cd7300a66f2dfc8f731cd96b2e87d06caa70a13cc5` |
| `qr581-final-typecheck.log` | `9b98c0aab2d3bd4988d8cb79859671c410564ea8957093e9d2e6169359e829db` |
| `qr581-final-lint.log` | `2bc4aeb3a9ddd4fa5381928e0190aceee3465ee6ca9f7628915bb70535af62b6` |
| `qr581-final-package-test.log` | `ba4c9fd15c20c686d5b6d7142c708acf974b059d3501af4da40d4057529122c1` |
| `qr581-final-image-full.log` | `77a259fa53184f0cac2f7d66ce9bc8dc343c8d46573aec393b9c6a6e76a618f4` |
| `qr581-final-image-lean.log` | `ee8c24d9d22f1a68f59c9c70f404dc5990faee445eedca4ba8c1893e9f12c9d2` |
| `qr581-final-dist-full.json` | `26fb78c1115f57450f8db2daea426f2650424e86c618e9cd73aad16aca8b3a40` |
| `qr581-final-dist-lean.json` | `1b1ffda84037e6a55f8033b9cf36cf78e68c4065ab4141ce42a92e831e52ef49` |
| `qr581-final-secret-scan.log` | `273277e5da1ce7eea08d91903610788d94c50266906f03c78a247dc730dd22b9` |

Actual emitted chunks/notices are preserved as `qr581-final-{full,lean}-jsqr.mjs` and `qr581-final-{full,lean}-jsqr-notice.txt`. No new exact-head hosted CI is claimed here. The earlier renderer handoff records the stopped local fake-camera grouping: this headless shell lacks full Chromium virtual-camera support. Final hosted CI must qualify the unchanged camera cases on the published head. Physical-device camera qualification remains open as documented by the package; the demonstrated raster/version-23 defects are covered.

No release, deployment, payment execution, real-funds transaction, external blockchain request, dependency update, remote comment or remote branch mutation was performed by this worker. Root owns publication, independent integration checks and the integration lease.
