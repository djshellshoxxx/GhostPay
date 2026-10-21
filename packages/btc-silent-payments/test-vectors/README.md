# Test vector provenance

All files were downloaded unmodified with `curl -sSL` on **2026-10-21** from
`https://raw.githubusercontent.com/bitcoin/bips/master/`. `git ls-remote https://github.com/bitcoin/bips HEAD`
returned commit **`130b8e0fa7f30fa45532f080b87b8db27a79e46e`** at the same time. The raw downloads and the
`ls-remote` call were separate requests, so a push between them is theoretically possible; the SHA-256 sums
below identify the exact bytes that were tested.

| File | Source path (under `bitcoin/bips` master) | SHA-256 | Used by |
|---|---|---|---|
| `send_and_receive_test_vectors.json` | `bip-0352/send_and_receive_test_vectors.json` | `f5f9ed4a...4af1` | `src/vectors.test.ts` (28 cases, 28 sending + 29 receiving vectors) |
| `bip-0352.mediawiki` | `bip-0352.mediawiki` | `a64d3b9e...f4ff4` | reference text for the implementation |
| `reference.py`, `bitcoin_utils.py` | `bip-0352/reference.py`, `bip-0352/bitcoin_utils.py` | `ca44bd58...3124a`, `80dd73fd...7b5` | reference only (the Python reference needs the vendored `secp256k1lab`, which is not saved here); never executed |
| `bip-0350.mediawiki` | `bip-0350.mediawiki` | `63634b06...a0dec` | `src/bech32m.test.ts` parses the Bech32m and segwit vectors out of this file |
| `bip-0032.mediawiki` | `bip-0032.mediawiki` | `e5e00a82...7f11f` | `src/bip32.test.ts` parses test vectors 1 to 4 (extended private keys) out of this file |

Full sums: run `sha256sum test-vectors/*`.

Do not edit these files. To refresh, re-download, update this table, rerun `npm test` and review any diff.
The test suite asserts the exact vector counts (28 / 28 / 29) so a silently changed file fails loudly.
