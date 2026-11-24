# jsQR 1.4.0 with two bounded correctness repairs

The canonical runtime decoder is `../src/vendor/jsqr-1.4.0.mjs`, a static ESM
copy of the published `jsqr@1.4.0` `dist/jsQR.js` factory with the two corrections
below. Its original Apache-2.0 license is embedded in the module and copied
verbatim into this directory's `LICENSE` fixture. The npm dependency remains
pinned and unchanged as a source/control reference; no install-time patch or
network fetch is needed. The ESM file is lazy-loaded and emitted to `dist/vendor`.
There is one runtime decoder copy; no separate CJS bundle is distributed.
See [the canonical source provenance](../src/vendor/README.md) for the exact
wrapper changes, local-source checksum, declaration and browser notice.

Upstream repository: <https://github.com/cozmo/jsQR>.

| Input | SHA-256 |
| --- | --- |
| Published `dist/jsQR.js`, 256,885 bytes | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Published `LICENSE`, 11,358 bytes | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |

Apart from the static ESM wrapper and modification notice, the only changes
to the pinned factory body are these two corrections:

1. Version 23's alignment-pattern centers are `[6, 30, 54, 78, 102]`. The pinned
   bundle incorrectly uses `74` as the fourth center. This is cross-checked
   against the pinned independent `qrcode-generator@2.0.4` table and
   [ZXing's Version table](https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/qrcode/decoder/Version.java).
   Deterministic valid version-23 images fail the original decoder and pass with
   this single table correction.
2. A QR side must equal `17 + 4 * version`. Fractional module rasterization can
   cause the upstream locator to return a dimension congruent to 3 modulo 4,
   such as 115 for an actual version-25 side of 117. For only that invalid case,
   append the two adjacent valid dimensions, minus/plus two, restricted to
   `21..177`. The original candidates are attempted first. The pinned locator
   produces at most two candidates, so this adds at most four attempts: six
   total per scan pass. All extraction, format/version checks, Reed-Solomon correction,
   byte/text decoding and result construction remain unchanged.

`src/readers.vendor-provenance.test.ts` verifies the upstream checksum, version,
license bytes, and complete canonical ESM source against that upstream factory
plus the exact wrapper, notice and these two changes. A dependency update must explicitly
reconcile this patch; it cannot silently change the decoder.

`src/readers.dense-qr.test.ts` exercises the real lazy-loaded decoder using
synthetic pixel frames. It preserves original-decoder controls, covers the two
previously failing dense QR cases and neighboring working versions, and checks
that severe image damage still returns no result. No real payment data is used.

This provenance and dense-image coverage originated in #605 at
`73f521bad57c24e44fe5c69fbdeecd1d2da2fec1`. Its CJS packaging remains in that
historical commit; the composition retains #581's static ESM distribution at
`74121278a08eaf4eddd85651a4518ef657aeeb16` with the same two factory corrections.
