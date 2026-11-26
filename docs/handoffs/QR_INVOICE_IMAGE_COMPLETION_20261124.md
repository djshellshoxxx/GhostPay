# Rendered invoice QR completion — 2026-11-24 UTC

## Source and ownership

- Original PR: #581, `codex/qr-exchange-browser-completion`, exact parent `41a598b8433e10a95598c72c2a23027e63010024`.
- Isolated completion branch: `finish/qr-581-20261124`, worker `/root/qr_completion`, coordinated by `/root`.
- Verified implementation: `4cc28bd014cb69f4f3ae27af7179b9700f46ea41`, tree `b82223bc46cf7e3d01778a63e5dae46ff5f9ed15`.
- Changed production blob: `apps/web/src/components/QrView.tsx`, `c9d216f393966f135a6491360cd2bc455405af35`.
- The implementation changes one SVG rendering attribute and adds its rationale. The ownership entry is additive. This handoff is a later documentation-only change.
- The original candidate and donor branches remain unchanged by this worker. Root owns publication, independent integration checks and the integration lease.

## Reproduced failure and repair

Hosted CI run `45335095001` failed the original `qr-invoice-image.spec.ts` in both profiles. The full job `138275808118` passed 83 tests, failed this one and skipped one. Its retained error context reports **No QR code was found in that image**, before any invoice preview. The failure was a real raster-decoding problem.

The local native reproduction rendered a version-25 invoice QR with a `125 × 125` viewBox at `352 × 352` CSS pixels and device scale factor 2. The screenshot was `704 × 706` pixels, with black modules, a white background and the existing four-module quiet zone. The drawing area gives fractional module widths. `crispEdges` snaps those edges to the pixel grid; the resulting image failed the actual jsQR reader.

Three paired browser trials each used a fresh synthetic invoice and captured the same SVG before and after changing only `shape-rendering`. Each original `crispEdges` image produced the no-QR result. Each corresponding `geometricPrecision` image completed the original invoice journey, including chain and signature preview, damaged-image rejection, unsupported payment-family rejection, explicit opening of payment review, matching description and zero external requests.

`QrView` now uses `geometricPrecision` to preserve module coverage at responsive widths. Matrix generation, QR data, the viewBox, quiet zone, black/white colors, captions, decoding, invoice trust checks and exported SVG text remain unchanged. Standalone SVG downloads retain their exact six-pixel module grid and existing rendering setting. The original end-to-end test and all of its assertions are unchanged.

## Verification

The application source in the implementation commit passed these checks:

| Check | Actual result |
| --- | --- |
| Original invoice-image Playwright journey, full profile | 3/3 repeated runs passed |
| Original invoice-image Playwright journey, lean profile | 3/3 repeated runs passed |
| Whole-web TypeScript, Vite production build and original postbuild bundle scan | Passed in both profiles using the normal `npm run build` pipeline |
| QR matrix, contrast, QrView and QrFrame component suites | 52/52 tests in eight files passed, one worker, no skips |
| Typed ESLint of changed production file | Passed, zero output |
| Repository secret scan | Passed |
| Git whitespace check | Passed |
| Independent source review by `/root/completion_review` | No blocking finding; checked unchanged matrix, quiet-zone, export and trust boundaries |

The browser runs used Google Chrome for Testing headless shell `156.0.8078.4`, Playwright `1.64.1`, and synthetic invoices. A local uncommitted Playwright config selected only the desktop project and a separate result directory. The full and lean acceptance tests used the existing production build, bundle scan and preview commands. The full repeat run reused the production output from the immediately preceding successful full build; the lean run rebuilt through the normal pipeline.

Selected unit command, from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run \
  --maxWorkers 1 --no-file-parallelism --coverage.enabled false \
  src/lib/qr.test.ts src/lib/qrContrast.test.ts \
  src/components/QrView.test.tsx src/components/QrView.i18n.test.tsx \
  src/components/QrFrame.test.tsx src/components/QrFrame.i18n.test.tsx \
  src/components/QrFrame.largeWarning.test.tsx src/components/QrFrame.security.test.tsx
```

## Environment provenance and incomplete attempts

Cached third-party dependencies were reused without changing a manifest or lockfile. Workspace links point to the isolated checkout. Compiled output from 64 unchanged packages was copied only after comparing every tracked package input and the root lock/configuration against the existing mobile-qualification checkout at `6ea8140c468b2f1ad0036737a2e13f8cad8d30cb`. The differing QR package was rebuilt locally. A broad library build was stopped before completion and is not counted as a pass.

An initial local web typecheck could not resolve the cached `@bufbuild/protobuf` dependency. Linking the already-installed declared dependency from the existing mobile checkout resolved that environment error. Both subsequent normal web builds typechecked successfully.

A broader local grouping began with the multipart camera test and failed because this headless-shell runtime lacks the full Chromium fake-camera facility, as documented in `e2e/camera-browser.ts`. That grouping was stopped and is not counted as successful camera qualification. The original #581 hosted full and lean jobs had already passed the camera cases. Hosted checks on the eventual published completion head remain the integration gate. Physical-device qualification remains open.

The independent reviewer also identified a separate version-23 alignment-table inconsistency in the pinned jsQR dependency. Its public-function qualification and correction are being coordinated separately. This renderer change leaves that dependency untouched.

## Evidence fingerprints

Raw diagnostic files remained outside the repository; these hashes identify the local evidence used above.

| Evidence | SHA-256 |
| --- | --- |
| Hosted full Playwright artifact `14901603067` | `7d59989cce1303b69caad6d6bb72832bc628d764606e3e2c2c8598f4647206cd` |
| Original responsive SVG screenshot | `08ebac742772f681227635770fc423f40b33d68178f6e1e5e559875fdc032926` |
| Paired same-invoice browser trials | `ea8baefc4ce83feb2308226c3215e9c58c3b586d415caf8267b37fcb576f8ec9` |
| Full original image-journey repeats | `d485cc4ea0ca99f85243f3b16239ab95d0bc985fcf8ea382edbe4bc7e413c104` |
| Lean original image-journey repeats | `d1b0261cfa78b2560376f9a57e69ac0c32da2d80ee48af7a93ab33c3f30145c7` |
| Eight-file unit selection | `ba3767c62ed2a2ca4f09ce3e5ef54a91de5503c2d36a65c8d3a9c771c249d4ec` |
| Dependency-source comparison record | `aa929e0e7ddc09c520913b9974bde88abebdc4b65f2d99987aee194c1e5c722a` |

No release, deployment, real-funds transaction, external blockchain request, dependency update or shared-branch mutation was performed by this worker.

## Subsequent qualification

The independent version-23 defect is now corrected and verified on the current-main composition. See [QR_VERSION23_COMPLETION_20261124.md](QR_VERSION23_COMPLETION_20261124.md) for the source pin, vendor provenance, final package suite, both production-profile image journeys and retained license artifacts. The historical renderer evidence above remains unchanged.
