# F03 verification environment

Repository base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Runtime: Node `24.22.3`, npm `11.19.1`; repository requires Node >=22.
Tools: TypeScript `5.9.3`, Vitest `5.0.5`, Vite `8.3.5`, Playwright `1.64.1`.

The isolated checkout uses local copies of prepared dependencies. The initial older copy lacked
`@bufbuild/protobuf` and several updated transitive packages. Exact versions were recovered from
another prepared installation without modifying its files. A complete check of all 637 nonoptional
lockfile entries then found zero missing entries and zero version mismatches. No manifest or lockfile
was changed. This is version verification of a prepared install, not a fresh network install or
proof of every dependency's package-manager integrity field.

All 17 web workspace dependencies were built from this checkout's source in dependency order.
The initial attempt stopped on missing protobuf; the subsequent complete build succeeded after
restoring the exact locked dependencies. The invoice-schema package was rebuilt after its codec
implementation commit.

The transitive web-test dependency `@ghostpay/relayer-guard` was also built from this source after
the first whole-web typecheck reported its missing output. The corrected whole-web typecheck
passed at both the lock repair and final catalog checkpoints. Typed lint for every changed feature
TypeScript file and the full invoice-schema suite/coverage also passed.

Two ordinary npm web builds exited 137 before Vite emitted a result. Serial direct execution of
the unchanged typecheck, Vite build and original post-build bundle scanner subsequently passed
for full and lean profiles. The successful typecheck used a 1,280 MiB Node heap; Vite/scanner used
1,024 MiB and `RAYON_NUM_THREADS=2`. Resource scheduling was bounded without changing any source,
build-profile guard, scanner or acceptance threshold. Detailed actual commands and artifact
inventories are recorded in `evidence/` and summarized in `QUALIFICATION.md`.

## Browser execution limit

Chromium `156.0.8078.79` exists at `/usr/bin/chromium`. A minimal Playwright launch failed before
opening a page with `socket() failed: Operation not permitted (1)` in Chromium's process-singleton
initialization. No browser interaction, screenshot or browser-network trace was produced. No
launch bypass was attempted. DOM tests and QR image decoding remain distinct from real browser
execution. The existing CI workflow runs Playwright for both full and lean profiles; current-head
results must be checked independently.

## Design references

The file workflow uses the standard local File/Blob interface and strict UTF-8 decoding:

- [W3C File API: Blob and arrayBuffer](https://w3c.github.io/FileAPI/#dom-blob-arraybuffer).
- [WHATWG Encoding: TextDecoder and fatal decoding](https://encoding.spec.whatwg.org/#interface-textdecoder).

The application uses the repository's established download helper and invoice verification code.
These standards describe the browser APIs, not GhostPay feature correctness or release readiness.
