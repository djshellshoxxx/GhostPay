# QR browser branch completion — 2026-11-24

## Preserved sources

The main-targeting `finish/qr-browser-qualification-20261124` candidate retains PR #581 at `41a598b8433e10a95598c72c2a23027e63010024`, including its original camera attach/fallback, platform-candidate selection and sparse SVG repairs. The isolated decoder repair `ad9d264b5ecd9c430951c957a9f41796225c2f5b` is also retained in local history. Original donor branches are unchanged.

The browser-qualified composition is `da1a3c9a9c31bfe87f785d5ab5d9d006ec8ef099`, tree `141ba1b304577a59df7324438a93526f1307a36e`. It includes main `706188000c38b3dde5a3a362370a530870aa7587` and preserves the incoming package fixes verbatim. Only the additive ownership registry conflicted; every nonblank line from both parents, including multiplicity, was retained. The entire web and QR package source trees match the decoder worker's final source. This handoff is a documentation-only successor to that browser-qualified composition.

## Reproduced failure and bounded repair

The original #581 full and lean hosted browser jobs failed the Create invoice QR screenshot → image picker → invoice preview journey. The coordinator also reproduced the image-decoding failure locally on the original source. The saved synthetic screenshot contained a version-25 QR with 117 modules; instrumenting an in-memory copy of the pinned decoder showed an invalid estimate of 115. Trying 113 still failed; trying 117 decoded the original signed invoice.

The separate worker reproduced that failure using deterministic pixel frames and found the independent version-23 alignment-table defect. The repair vendors the pinned upstream decoder with its original license and exactly two documented corrections. The coordinator independently compared the full bundle with the installed upstream bytes, inspected the bounded neighbor retry, source/license provenance test and positive/negative dense-image regressions, and found no blocking issue. See `QR_DECODER_COMPLETION_20261124.md` and the package's `vendor/PROVENANCE.md` for exact patches and checksums.

No screenshot, invoice key, modified installed dependency, test bypass, runtime network dependency, workflow change or release-gate change is committed.

## Executed verification

Runtime: Node 24.22.3, npm 11.19.1, Playwright 1.64.1. Browser image checks used the existing Chrome for Testing headless shell 156.0.8078.4. All wallet/invoice data were synthetic and app traffic was intercepted by the existing local test.

| Check | Result and scope |
| --- | --- |
| Original QR package suite before decoder repair | 249 tests passed; this did not cover the failing browser raster |
| Added dense-QR tests on original decoder | Two reproduced failures and five passing controls |
| QR package suite after repair | 258 tests, 12 files, no failures/skips; original coverage thresholds passed |
| Package typecheck, lint, build, secret scan, archive inclusion and Vite lazy import | Passed on the worker's exact repair source |
| Reconciled QR package and six incoming main package builds | Passed before browser execution |
| Full web production build and postbuild scanner | Passed on the browser-qualified composition |
| Full-profile original `qr-invoice-image.spec.ts` | 1/1 passed: screenshot import, signature preview, damaged-image rejection, wrong-family rejection, explicit open and expected description |
| Lean web production build and postbuild scanner | Passed on the same source |
| Lean-profile original `qr-invoice-image.spec.ts` | 1/1 passed, with the same original assertions |
| Decoder lazy chunk in the real web build | Present as `assets/jsQR-CXbQcN9U.js` |
| Source retention and merge ancestry | Passed; QR and web blobs unchanged from the independently reviewed repair |

Both browser image commands used the existing Playwright configuration and `--project=desktop`, with only `GHOSTPAY_CHROMIUM` and `GHOSTPAY_LOCAL_BUILD_PROFILE` selecting the available executable/profile. The original browser test file remains byte-identical to #581; temporary screenshot capture instrumentation was removed before qualification.

## Camera and hosted gates still required

An attempted full-profile run of the image and both virtual-camera specs with installed full Chromium 156.0.8078.79 could not launch any browser. Each of the six selected tests stopped before application execution at Chromium's process-singleton initialization: `socket() failed: Operation not permitted`. This is an environment-blocked attempt, not a passing camera result or an application assertion failure. The working headless shell supports the image journey but is not the full fake-camera runtime required by these specs.

No camera tests, original assertions, permissions or CI gates were altered to hide this limitation. Fresh hosted full/lean camera and repository CI remain required for this new source. No physical-device or WebKit acceptance is claimed. The coordinator must read back the published tree, inspect exact-head hosted results, and recheck main and integration ownership before any merge. No shared integration or deployment occurred during this local completion.
