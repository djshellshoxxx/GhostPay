# Meta-address fingerprint malformed UTF-16 repair — 2026-11-22 UTC

## Source and ownership pins

- Base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `automation/20261122T0123Z/bug/meta-fingerprint-surrogate`. Worker: one sequential ChatGPT BUG-ONLY coordinator; no genuine separate independent verifier.
- Original production blob `packages/address-safety/src/meta.ts`: `dd5230c5a4416bd0f2d5a3a7e79e982eca38487f`.
- Repaired production blob: `469bba356ada448a8833cecdb3ab013c453f6e0a`.
- Original test blob `meta.test.ts`: `2000eb2f753610d02ef0b63b589b7fa3128b8233`; regression test blob `9bc68f46aeb032a57ef9a2b77e5521e76e8b5f26`.
- Ownership/claim-only commit `8d8d3a27c1d2c0dff3f65a0510c1e24f77434333`; test-first commit `0761020fa5762f4ac35d26a4083d5b9fe8b5599f`; minimal production repair `b00bf9db7bc3c42b881357299feef71988d4b66d`.
- Inspected filenames of all 190 open PRs returned across GitHub REST pages 1 and 2 at discovery. None modified `meta.ts` or `meta.test.ts`; broad #372/#278/#264/#262/#238/#224 overlap `text.test.ts` and package manifests only. Reinspect if PR list changes.
- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, and actual 2026-11-21 GitHub heads. The existing integration lease branch `automation/ghostpay-integration-lock` @ `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` has generation 11, status `held`, owner `994a0d214fb9-root-r3`; expired timestamp is NOT transfer permission.

## Observed defect

`metaAddressFingerprint()` advertised hashing exact UTF-8 input for an out-of-band payee identity comparison. It accepted invalid UTF-16 strings. The imported `@noble/hashes` `utf8ToBytes()` uses `TextEncoder`, which silently substitutes U+FFFD for isolated high/low surrogate code units. Consequently `metaAddressFingerprint('\uD800') === metaAddressFingerprint('\uFFFD')` and likewise for `'a\uD800b'` versus `'a\uFFFDb'`. This is an encoding collision, not a SHA-256 collision or an established exploitable transaction path.

Baseline Node 22 `TextEncoder` / `crypto.createHash('sha256')` source-equivalent proof: 8/8 malformed examples accepted; high surrogate, low surrogate, and explicit replacement character produced identical fingerprint `83d5-44cc-c223-c057-d2bf`. The upstream noble-hashes implementation also delegates string encoding to `TextEncoder`.

## Regression-first correction

New Vitest test checks rejection of eight malformed UTF-16 cases as the existing `AddressSafetyError`; valid replacement character, valid astral surrogate pairs, normal fingerprints continue working. This was committed at `0761020f` BEFORE the production code. The correction at `b00bf9db` inserts one UTF-16 well-formedness scan before conversion; no hash, UI, schema, or dependency change.

## Executed verification, explicitly limited

- Original and patched `meta.ts` copied byte-for-byte from GitHub and verified locally with `git hash-object` to match GitHub blobs `dd5230c5...` and `469bba35...` respectively.
- Locally ran actual source-identical TypeScript with Node `v22.16.0 --experimental-strip-types`; external `@noble/hashes` import interfaces were substituted with Node SHA-256 and `TextEncoder` implementations, not installed noble packages. These are isolated source-equivalent checks, **not repository Vitest**.
- Baseline: zero of eight malformed surrogate examples rejected, i.e. all eight violate the added regression expectation. Repaired: 8/8 rejected as `AddressSafetyError`, 12 neighboring checks passed. Additional sweep: 2,052 invalid/boundary cases rejected; 1,024 valid astral surrogate pairs gave the same fingerprints as baseline.
- Isolated `tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck --allowJs` on both source-identical files completed without diagnostics using the stub module tree.
- Full repository `vitest`, `lint`, `build` and native browser testing **not executed locally**: repository checkout unavailable because DNS resolution for github.com fails. Hosted CI must verify exact proposed head and genuine package imports.
- PR #390 at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: 39 checks completed (36 success, 3 skipped; both lean and full browser checks success); five workflow runs success. GitHub review submissions: none. #419/#422 overlap the display text logic; no owner branch was touched.

## Remaining gates and next work

Create a narrowly scoped draft PR against `main`. Check exact-head hosted unit, type, lint, build and browser results; request and obtain actual independent verification. Recheck all ownership and integration dependencies. No merge without genuine integration lock transfer/release and all gates green. No fund interaction, contract call, deployment, real-world attack, feature addition or external repository code has been changed.
