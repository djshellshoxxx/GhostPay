# jsQR 1.4.0 with two bounded correctness repairs

`jsQR.cjs` is the published `jsqr@1.4.0` `dist/jsQR.js` bundle with its original
Apache-2.0 license copied verbatim into `LICENSE`. The npm dependency remains
pinned and unchanged as a source/control reference; no install-time patch or
network fetch is needed. The `.cjs` extension marks the original UMD/CommonJS
module correctly inside this ESM package. `jsQR.d.cts` exposes only the surface
used by the reader. The dependency remains lazy-loaded and locally bundled.

Upstream repository: <https://github.com/cozmo/jsQR>.

| Input | SHA-256 |
| --- | --- |
| Published `dist/jsQR.js`, 256,885 bytes | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Published `LICENSE`, 11,358 bytes | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |

The only upstream content changes, apart from the required modification notice,
are these two corrections:

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
   total. All extraction, format/version checks, Reed-Solomon correction,
   byte/text decoding and result construction remain unchanged.

`src/readers.vendor-provenance.test.ts` verifies the upstream checksum, version,
license bytes, and complete vendored source against that upstream bundle plus
the notice and these exact two changes. A dependency update must explicitly
reconcile this patch; it cannot silently change the decoder.

`src/readers.dense-qr.test.ts` exercises the real lazy-loaded decoder using
synthetic pixel frames. It preserves original-decoder controls, covers the two
previously failing dense QR cases and neighboring working versions, and checks
that severe image damage still returns no result. No real payment data is used.
