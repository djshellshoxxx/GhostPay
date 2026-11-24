# Local jsQR 1.4.0 corrections

`jsqr-1.4.0.mjs` is a static copy of the existing pinned `jsqr@1.4.0` distribution, from `dist/jsQR.js` in the package by Cosmo Wolfe and contributors. The complete, unmodified Apache-2.0 license is embedded in the module’s preserved attribution banner so the emitted package retains it. Browser minification removes comments; `apps/web/public/licenses/jsqr-1.4.0.txt` separately supplies the complete license, attribution and correction provenance at `licenses/jsqr-1.4.0.txt` in both production profiles.

The original version-23 table lists alignment centers `[6, 30, 54, 74, 102]`. The independent QR encoder places them at `[6, 30, 54, 78, 102]`. The incorrect decoder entry causes several valid version-23-L codes to return `null`, including accepted GhostPay v2 settings exports. `readers.version23.test.ts` exercises the public generator, software reader, settings parser and image-import boundary with deterministic pixel grids. Adjacent versions, version-23-M, UTF-8 text and blank images remain covered.

There are precisely two mechanical wrapper changes and two semantic corrections:

1. Replace the UMD environment-dispatch prefix with the attribution banner and `const jsQR = (function() {`.
2. Replace the outer `});` suffix with `})();` and `export default jsQR;`.
3. In the factory body, change the version-23 alignment center `74` to `78`.
4. When the locator estimates a safe-integer side congruent to `3 mod 4`, append its two neighboring valid dimensions, minus/plus two, restricted to `21..177`. Original candidates retain priority. The pinned locator returns at most two original candidates, so the retry adds at most four candidates, six total per scan pass. Extraction, format/version checks, Reed–Solomon correction, byte/text decoding and result construction are unchanged. `readers.dense-qr.test.ts` retains the existing valid version-25 fractional-grid case, integer-grid and adjacent-version controls, and damaged-image rejection.

No runtime source rewriting or evaluation occurs. The local reader lazily imports this ordinary ESM file; the TypeScript package build emits it to `dist/vendor`. `jsqr-1.4.0.d.mts` describes the exact pinned public function signature using type-only imports. The npm manifest and lockfile remain unchanged, so the original package stays available for an independent provenance check.

| Component | SHA-256 |
| --- | --- |
| Original `jsqr@1.4.0/dist/jsQR.js` | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Local `jsqr-1.4.0.mjs` | `59aacb21b5dbb23ef246e504992dcf1b3ca4567d2b1523c9e51835bd32aeb368` |
| Unmodified upstream license | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |

`vendor.provenance.test.ts` verifies the original package hash, reconstructs the expected local module from that original using the exact changes above, compares the entire file byte for byte, and checks the complete embedded license and static browser notice. `readers.vendor-provenance.test.ts` independently retains the donor's complete-source reconstruction, pinned package metadata, and byte-for-byte license-copy check against `vendor/LICENSE`. Both run in the normal package test suite and must be revisited deliberately if the pinned dependency changes. Do not update hashes to accept unrelated vendor edits. Replace this snapshot with a qualified upstream release or alternative decoder only after the provenance and interoperability checks pass; then remove the local copy, declaration, build-copy configuration, public notice, license fixture and snapshot-specific provenance tests together.

The static ESM module, renderer and interoperability work is preserved from #581 (`74121278a08eaf4eddd85651a4518ef657aeeb16`); the bounded retry and dense-image coverage are preserved from #605 (`73f521bad57c24e44fe5c69fbdeecd1d2da2fec1`). Only this ESM module is imported at runtime; the original pinned dependency remains a provenance and test control.

Upstream project: <https://github.com/cozmo/jsQR>. These corrections retain the original decoding validations and documented camera/image limitations.
