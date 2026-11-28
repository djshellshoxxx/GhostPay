# Canonical QR continuation composition — 2026-11-24

## Source and ownership

Worker `/root/ui_data_review` completed this bounded integration in isolated
`integration/qr-composition-20261124`, based on
`fb12a3302d9a85aa8777805bbdaab1bf2770ea16`. The root checkout and donor branches
were not modified. The additive ownership claim preceded implementation.

| Step | Commit |
| --- | --- |
| Ownership claim | `7c506ac6c675987ab6c26398169e9c886e48e4bd` |
| Merge original #581 head | `4174152644e2c9a645b75b3ab16d42ed7b3243e1` |
| Merge original #605 head and reconcile canonical ESM | `50aab6f36031bca1afb366f73901dbbaef548179` |

The exact qualified implementation is **`50aab6f36031bca1afb366f73901dbbaef548179`**,
tree **`fc6739726cd37b22653eba2e0f12814023d3afa6`**. This handoff and the completion
entry are added afterward without changing production, tests or build inputs.
Both original donor heads are retained as merge ancestors:

- #581: `74121278a08eaf4eddd85651a4518ef657aeeb16`.
- #605: `73f521bad57c24e44fe5c69fbdeecd1d2da2fec1`.

## Canonical composition and compatibility

#581 supplies the static ESM decoder, typed declaration, TypeScript emission,
responsive `QrView` rendering, browser license notice, first usable native
candidate selection, and one transition to software reading after a native
exception. Ordinary empty native frames continue using native detection.

#605 contributes its existing 17-line bounded retry and seven dense-image tests.
The canonical ESM factory body is byte-identical to #605's factory body after
removing the respective wrappers. Both existing semantic corrections remain:
the version-23 alignment center is `78`, and an invalid safe-integer dimension
congruent to `3 mod 4` may add its two neighboring valid dimensions within
`21..177`. Original candidates retain priority. The pinned locator returns at
most two candidates, so there are at most four additions and six total
candidates per scan pass. Extraction, format/version checks, Reed–Solomon
correction, payload decoding and result construction remain unchanged.

There is one tracked vendor runtime, `src/vendor/jsqr-1.4.0.mjs`, and one
production lazy import. #605's separate CJS module/declaration and package
`files` addition were not retained. The package manifest and lockfile are
byte-unchanged from the base. Camera and matrix-generation production files
already matched the donors and remain unchanged from the base.

The reader, renderer, ESM declaration, emission configuration, shared camera
and native-candidate tests, browser support/specifications, #581's nine
interoperability cases, and #605's seven dense-image cases retain their donor
bytes. Ownership conflicts were resolved by union; each parent's full ordered
registry lines were preserved. The reader conflict selected the canonical
#581 ESM import while retaining the identical shared reader behavior.

## Exact provenance and distribution

Both existing provenance suites remain, with five tests in total. Their
complete-source expectations now reconstruct the canonical ESM wrapper and
both exact factory corrections. The pinned upstream hash, unique correction
anchors, metadata assertion, embedded license, separate byte-identical license
fixture and exact static notice assertions are retained. No checksum-only
substitution, skipped assertion or softened comparison was introduced.

The source banner, two provenance documents, browser notice and fixed local
hash were updated together. The historical donor handoffs remain source-pinned
records of their earlier qualification; their browser results are not claimed
as tests of this composition.

| Artifact | SHA-256 |
| --- | --- |
| Pinned upstream distribution | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Canonical ESM source | `59aacb21b5dbb23ef246e504992dcf1b3ca4567d2b1523c9e51835bd32aeb368` |
| Unmodified upstream license, 11,358 bytes | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |
| Emitted package module | `d23bfdd6b72d550548ae34ca63c676c7aa96545b88603ee148d6e897602fb171` |
| Full and lean decoder chunk, 129,968 bytes | `b6cf717fd832375561ff2db02a32d5761e8a8546cfde017d23731299031b19be` |
| Full and lean browser notice, 11,945 bytes | `8b2f1c4a56d9d35cb7c47a0b590b79f69dce0c14cba6227ac6e8d238614520b0` |

Each production profile emitted exactly one named decoder chunk, with identical
bytes between profiles. Both emitted notices equal the source notice byte for
byte. The package build emitted the ESM module/declaration, retained the full
embedded license and canonical reader import, and emitted no CJS decoder.

## Qualification of the composed source

| Check | Result |
| --- | --- |
| Complete qr-exchange suite with original coverage thresholds | **270/270 tests; 14/14 files; zero skips** |
| Package coverage | Statements **97.50%**; branches **95.05%**; functions **100%**; lines **99.11%** |
| qr-exchange typecheck, typed lint and build | Passed |
| Focused web QR, camera/importer, payment-QR and Pay suites | **348/348 tests; 24/24 files; zero skips** |
| Typed lint of changed web renderer and three browser/support files | Passed |
| Full web typecheck, production build and original bundle scan | Passed; **19 files** scanned |
| Lean web typecheck, production build and original bundle scan | Passed; **17 files** scanned |
| Independent source review | `/root/ui_data_review/qr_vendor_review` approved the exact implementation/tree above; no blocker |

The package used its normal `npm run test --workspace @ghostpay/qr-exchange --
--maxWorkers=1`, `typecheck`, `lint` and `build` scripts. Focused web tests used
the existing 24 files with one worker and coverage disabled for that subset;
no new cases were introduced. Production profiles used the normal
`npm run build --workspace @ghostpay/web` lifecycle, including full TypeScript
and the original postbuild scan, with `GHOSTPAY_LOCAL_BUILD_PROFILE` set to
`full` or `lean`.

Node `24.22.3` and npm `11.19.1` reused the installed dependencies with 68
workspace links pointing to this isolated checkout. Compiled outputs from 65
packages were copied; the changed QR package was rebuilt here, leaving outputs
from 64 unchanged packages reused. The donor output checkout differed from the
base only in consolidation documentation.
Checks ran sequentially with one test worker and a 1024 MiB Node heap limit.
No dependency versions, install inputs, build gates or workflow files changed.

Git whitespace checking is clean outside the byte-preserved upstream
`vendor/LICENSE` fixture. That fixture's original final blank line is retained
because the existing license assertion requires the complete original bytes.

## Evidence and remaining gates

Local evidence is in `/workspace/scratch/f80482f352bc/qr-composition-qualification.json`,
including exact commands, log hashes, source/tree pins, emitted artifacts and
independent-review status. Raw logs share that directory:

| Log | SHA-256 |
| --- | --- |
| `qr-composition-package-coverage.log` | `0d77d74e4a3dd33472c4edd87ff53eb3114bfdc33e9ca080a05d461ce4ddc1c4` |
| `qr-composition-package-typecheck.log` | `9b98c0aab2d3bd4988d8cb79859671c410564ea8957093e9d2e6169359e829db` |
| `qr-composition-package-lint.log` | `2bc4aeb3a9ddd4fa5381928e0190aceee3465ee6ca9f7628915bb70535af62b6` |
| `qr-composition-package-build.log` | `d7daaf349b8d8c501f105cd03303f2ba8969fc73d8dc67607f4db27084901a2f` |
| `qr-composition-web-focused-tests.log` | `8655403db6df9e72bebdf5a1747ead4ae9fc1c6e568e23650a9225dcae17a1ae` |
| `qr-composition-web-scoped-lint.log` | `9aac3da9a7039a99c345545c32f286aa65c358d571bfce7e00d94625d095c829` |
| `qr-composition-web-build-full.log` | `1b41196786b73298207eedac4c8fb39daeab59daaf86b9e263ba4d294bf981eb` |
| `qr-composition-web-build-lean.log` | `6998e05433996500f9baab419578f39b15f4515a6386f808b01463d9d9af67cf` |

No native browser cases were run here. The previously observed Chromium Unix
socket restriction remains; no installation or sandbox workaround was attempted.
The unchanged invoice-image and camera browser specifications remain available
for exact-head hosted qualification. Physical-device camera qualification also
remains open. The coordinator owns final combined review, hosted gates,
publication and main integration; this worker made no remote changes.
