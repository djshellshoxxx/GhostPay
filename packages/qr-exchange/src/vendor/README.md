# Local jsQR 1.4.0 correction

`jsqr-1.4.0.mjs` is a static copy of the existing pinned `jsqr@1.4.0` distribution, from `dist/jsQR.js` in the package by Cosmo Wolfe and contributors. The complete, unmodified Apache-2.0 license is embedded in the module’s preserved attribution banner so the emitted package retains it. Browser minification removes comments; `apps/web/public/licenses/jsqr-1.4.0.txt` separately supplies the complete license, attribution and correction provenance at `licenses/jsqr-1.4.0.txt` in both production profiles.

The original version-23 table lists alignment centers `[6, 30, 54, 74, 102]`. The independent QR encoder places them at `[6, 30, 54, 78, 102]`. The incorrect decoder entry causes several valid version-23-L codes to return `null`, including accepted GhostPay v2 settings exports. `readers.version23.test.ts` exercises the public generator, software reader, settings parser and image-import boundary with deterministic pixel grids. Adjacent versions, version-23-M, UTF-8 text and blank images remain covered.

There are precisely two mechanical wrapper changes and one semantic correction:

1. Replace the UMD environment-dispatch prefix with the attribution banner and `const jsQR = (function() {`.
2. Replace the outer `});` suffix with `})();` and `export default jsQR;`.
3. Within the unchanged factory body, change only the version-23 alignment center `74` to `78`.

No runtime source rewriting or evaluation occurs. The local reader lazily imports this ordinary ESM file; the TypeScript package build emits it to `dist/vendor`. `jsqr-1.4.0.d.mts` describes the exact pinned public function signature using type-only imports. The npm manifest and lockfile remain unchanged, so the original package stays available for an independent provenance check.

| Component | SHA-256 |
| --- | --- |
| Original `jsqr@1.4.0/dist/jsQR.js` | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Local `jsqr-1.4.0.mjs` | `0b7c699a00742b28091ab75aa56f86ff05a7b036af73fe8359b33aa920f3e992` |
| Unmodified upstream license | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |

`vendor.provenance.test.ts` verifies the original package hash, reconstructs the expected local module from that original using the exact changes above, compares the entire file byte for byte, and checks the complete embedded license and static browser notice. This runs in the normal package test suite and must be revisited deliberately if the pinned dependency changes. Do not update hashes to accept unrelated vendor edits. Replace this snapshot with a qualified upstream release or alternative decoder only after the provenance and interoperability checks pass; then remove the local copy, declaration, build-copy configuration, public notice and snapshot-specific provenance test together.

Upstream project: <https://github.com/cozmo/jsQR>. This correction retains the original decoder algorithm and its documented camera/image limitations.
