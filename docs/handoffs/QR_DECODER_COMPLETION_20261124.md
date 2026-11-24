# QR software decoder completion — 2026-11-24

## Source

- Branch: `finish/qr-decoder-20261124`.
- Original #581 parent: `41a598b8433e10a95598c72c2a23027e63010024`.
- Qualified source: `a5f7ab49768798a37dc5b676ccec84ca28beeab7`.
- Qualified tree: `a4ac2f5a617bdca697eb968b968ef83ad5b526a0`.
- Regression-first commit: `1a3be2c10` in the preserved branch history.

The branch retains the existing #581 camera/image fallback, generation and
privacy behavior. It changes only the QR package's software-decoder import and
package file inclusion, adds the pinned decoder copy with two bounded repairs,
and adds regression/provenance evidence. No original branch was overwritten.

## Confirmed failures and repairs

1. `jsqr@1.4.0` uses an incorrect version-23 alignment center, `74` instead of
   `78`. A deterministic valid version-23 image fails at integer module scale
   with the original decoder and decodes after the single table correction.
2. The original locator can estimate an impossible side of 115 modules for a
   rendered version-25 QR whose correct side is 117. Independent instrumentation
   of the failing synthetic browser screenshot found correct finder positions,
   but decoding only succeeded after extracting with the correct neighboring
   dimension. A deterministic 704-pixel fixture at 5.6 pixels/module reproduces
   this without any captured invoice or key material.

The decoder now retains all original candidates and, only when a locator side
is congruent to 3 modulo 4, appends its two valid neighbors at minus/plus two.
Neighbors are restricted to QR sides `21..177`. The original locator emits at
most two candidates, so at most four additional attempts are possible. Extraction,
format/version validation, Reed-Solomon correction, payload decoding and result
construction are unchanged. Severe image damage still returns no result.

## Dependency and license treatment

`packages/qr-exchange/vendor/jsQR.cjs` is the exact published upstream UMD bundle
plus a modification notice and these two corrections. Apache-2.0 `LICENSE` is
copied byte-for-byte. A narrow declaration describes only the reader's used
surface. The unchanged pinned npm dependency remains the canonical test/control
source. No installed dependency, lockfile, dependency version, install script or
external source was modified.

The provenance regression verifies the full bundle against the pinned upstream
SHA-256 and the exact two patches, as well as the complete license bytes. See
`packages/qr-exchange/vendor/PROVENANCE.md` for the independent alignment-table
reference, checksums and maintenance instructions.

## Actual verification

Node `v24.22.3`, npm `11.19.1`, pinned Vitest `5.0.5` and TypeScript `5.9.3`.
Dependencies were reused read-only from the coordinator's matching lockfile
installation. Package tests resolve core/invoice dependencies to local source.

| Check | Result |
| --- | --- |
| New dense-QR regression on original #581 decoder | 2 failed, 5 passed: version-23 and fractional version-25 failures reproduced |
| Dense-QR and provenance suites after repair | 9 passed |
| `npm test -w @ghostpay/qr-exchange -- --maxWorkers=1` | 258 tests passed in 12 files, no failures/skips |
| Existing source coverage gate | 97.50% statements, 95.05% branches, 100% functions, 99.11% lines; thresholds and include/exclude configuration unchanged |
| Package typecheck, typed lint, build | Passed |
| Package dry-run archive | Includes `vendor/jsQR.cjs`, declaration, license and provenance; import remains valid from compiled `dist/readers.js` |
| Vite 8.3.5 in-memory build of compiled reader | Passed; emitted separate reader and local-decoder chunks, confirming lazy CommonJS bundling without app configuration changes |
| Committed-secret scan | Passed |
| Authored-file whitespace check | Passed; exact upstream license retains its original terminal blank line |

The vendored third-party bundle is outside the preexisting `src/**/*.ts` coverage
scope. This is not a coverage exclusion change. The two corrections are tested
behaviorally and constrained by complete-source provenance equality.

Upstream bundle SHA-256 remains
`bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
Vendored bundle SHA-256 is
`2a9787a0e41d9eef2540aa43ca99d9ca8de4d092697d79e5fd051a3f8c584530`.

## Coordinator continuation

Merge this isolated candidate into the existing #581 completion branch without
discarding its donor history. Independently review the exact bounded patches,
rerun actual browser image exchange in both Pages profiles, then inspect the
published candidate's exact-head CI and current integration ownership. This
worker did not publish, merge a shared ref, deploy, change release gates, or
perform any real-wallet or live-funds operation. No browser pass is claimed here.
