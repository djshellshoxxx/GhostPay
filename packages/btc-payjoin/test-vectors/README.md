# Test vectors

- `bip78-appendix.json`: the four PSBTs of the "Test vectors" section of BIP-78 (P2SH-P2WPKH input, original feerate 2 sat/vB, `maxadditionalfeecontribution=182`, `additionalfeeoutputindex=0`), extracted programmatically from `https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki` on 2026-10-21. The `sha256_of_raw_bip` field pins the page that was read. Used by `src/bip78-vector.test.ts`.
- Negative vectors are hand-built in the tests (`src/sender/checks.test.ts`, `src/receiver/receiver.test.ts`) by editing an honest proposal; they are not stored as files.
