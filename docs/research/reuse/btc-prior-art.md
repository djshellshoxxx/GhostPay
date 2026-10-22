# btc-prior-art: reuse research

Scope: BIP-352 reference + vectors, rust-payjoin, Rust silent-payments crate, bitcoind regtest image.
Method: WebSearch + WebFetch only. No clone, no install, no code copied. GitHub API returned 403/404 to WebFetch, so SHAs marked "unverified" where not seen directly.

## Existing repo state (checked)
- `packages/btc-silent-payments` exists (`@ghostpay/btc-silent-payments`, UNLICENSED, has `src`, `test-vectors`, `DEVIATIONS.md`). BIP-352 engine already in-repo. Reuse target is test-vector gap check, not a rewrite.
- `packages/btc-payjoin` exists (has `test-vectors`, `e2e`, `DEVIATIONS.md`).
- No regtest harness package found in `packages/` or `apps/`.

## Candidates

| # | Repo | Licence (verified file) | Commit (SHA) | Last commit | Stars | Maintained | Reuse targets | Deps / lang |
|---|---|---|---|---|---|---|---|---|
| 1 | https://github.com/bitcoin/bips | BSD-2-Clause, per BIP-352 header: "This BIP is licensed under the BSD 2-clause license." (`bip-0352.mediawiki`, raw fetch) | bip-0352.mediawiki last touched a99b3d36a7eb612911cac08ecda66a07285170ff (2026-09-24, "bip352: fix notation inconsistencies in overview") | 2026-09-24 (file) | not checked | yes (spec status Complete) | `bip-0352/send_and_receive_test_vectors.json`, `bip-0352/reference.py` | Python reference only |
| 2 | https://github.com/Sosthene00/rust-silentpayments | MIT. Raw LICENSE: "MIT License / Copyright (c) 2023 cygnet" (fork of cygnet3/rust-silentpayments) | 8e742261ad783d92aa6a77ac69e955f23ca90b92 ("Update README") | 2025-11-06 | 0 | stale-ish, 128 commits, no releases | `tests/` (vector harness), `src/` | Rust |
| 3 | https://github.com/payjoin/rust-payjoin | Repo page says MIT. Crate `payjoin` 1.2.0 Cargo.toml says `license = "MITNFA"`. **Raw LICENSE file not fetched (404 on master/main/LICENSE-MIT). Unverified.** | 0d80347e40ce7927960b799fd0946940732b8cd7 ("Lock and remap Dart native builds for reproducibility (#1996)") | 2026-10-21 | 166 | yes, very active, 3,159 commits, no GitHub releases shown | `payjoin/` (BIP-78/77 logic), `payjoin-test-utils/` | Rust; FFI bindings in `payjoin-ffi/` |
| 4 | https://github.com/anym001/docker-bitcoind | MIT. Raw LICENSE: "MIT License / Copyright (c) 2025 anym001" | not verified (API 403) | not verified | 1 | yes per README (official releases v28.0+) | `Dockerfile`, `scripts/`, `.hadolint.yaml` | Docker. Regtest support NOT confirmed (page did not show it) |

Excluded: Docker Hub images farukter/bitcoind, ulamlabs/bitcoind-custom-regtest (stale ~5-6 yrs, licence not seen); jirijakes/rust-bip352 (self-declared incomplete); electrs-http (not fetched); rust-esplora-client licence not seen.

## Recommendation

1. **BIP-352 vectors: copy** `send_and_receive_test_vectors.json` from bitcoin/bips into `packages/btc-silent-payments/test-vectors/` with BSD-2 notice kept (file header/README note). Verify the JSON diff vs existing vectors first. Source SHA to pin: a99b3d36... (file last change), not the vector file's own SHA (unverified).
2. **Reference.py: reference-only.** Python; use as an oracle in a test script, not shipped code.
3. **Sosthene00/rust-silentpayments: reference-only.** MIT permits copy, but Rust in TS repo. Use `tests/` as a second opinion for vector cross-check.
4. **rust-payjoin: reference-only** until LICENSE file verified. If MITNFA is confirmed, treat as non-permissive for copy (MITNFA carries extra terms; do not copy). Depend route (payjoin-ffi via WASM/node) is out of scope for now.
5. **anym001/docker-bitcoind: adapt** the Dockerfile pattern into `infra/regtest/` (or wherever the harness lives), pin a Bitcoin Core version, check regtest RPC config manually. MIT notice kept.

## Integration plan (GhostPay)
- Target path for vectors: `packages/btc-silent-payments/test-vectors/bip352-send-receive.json`. API: unchanged (`@ghostpay/btc-silent-payments` exports). Test: vitest test that loads the JSON, runs derive/scan functions, asserts outputs match. Fail on any mismatch.
- Regtest: new `infra/regtest/Dockerfile` adapted from #4. Test: an e2e spec in `packages/btc-payjoin/e2e` that boots regtest, mines 101 blocks, runs a payjoin round against the existing client. Gate behind a separate vitest config.
- Esplora client: not researched beyond search (no licence seen). Next step if wanted: check bitcoindevkit/rust-esplora-client and Blockstream's Esplora docs before choosing.

## Risks
- Supply chain: Docker image pulls a binary Bitcoin Core build. Pin by digest. Stars 1 for #4, so fork and own the Dockerfile.
- Abandonment: #2 last commit Nov 2025, #4 unknown. #3 active.
- Licence traps: MITNFA on payjoin crate (repo LICENSE unverified). BSD-2 on BIP needs notice retained if copied. `packages/btc-silent-payments` is UNLICENSED, so copied MIT/BSD code must keep its notice.
- Spec maturity: BIP-352 Complete per BIP status, but a99b3d36 shows ongoing wording edits. Re-check vectors on each spec change.
- Unverified: SHAs for #2 are from GitHub commits page, not API. Star counts are from page views.
