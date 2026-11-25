# FC-03: Solana/TRON meta-address and memo interoperability alignment

Testnet and proof-of-concept scope only. Nothing here enables mainnet; nothing is deployed or audited.

## Provenance
- Donor: PR #376, branch `recover/ghostpay-chain-interop-20261121-5ceb`, head `f717157271fe494eb8094e504e9fec8276d51fcc` (base `eb59d93c`).
- Integration base: `origin/main` `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f`.
- Branch `claude/fc03-chain-interop-20261125`; donor merged with `--no-ff` as `166a9b114747eb3bf6ba3d66050fa9ba44687f31`.
- Merge conflict: only `docs/ai/ACTIVE_WORK.md`, resolved by union. The donor's 2026-11-21 block is marked historical (its lease is not active) and separated by a blank line.
- Changed workspaces: `packages/chain-solana`, `packages/chain-tron`, `packages/cli`, `test-vectors/meta-address-sol-tron-v1.json`.

## Review follow-ups applied after the merge (test-first)
Each new test was shown failing against the pre-change source (source reverted to the committed version, test run, then restored), then passing.
1. Docs aligned: `packages/solana-stealth/README.md` and `docs/remote/chain-ports/solana-impl.md` describe `st:sol:` and base58 `gpst1:` memos, not `gpsol:`/base64url.
2. `chain-solana` `deriveStealthPayment(string)` refuses a mainnet `st:sol:` meta-address with `CHAIN_DISABLED`. Tests: `stealth.test.ts` (red: "expected function to throw"; green afterwards). Decoding a mainnet address without `expectedCluster` is unchanged (the CLI inspect path and shared vectors need it to refuse or compare); see limitations.
3. `@security` warnings on `buildTrc20TransferRequest` and `deriveTronStealthPayment` (no in-repo consumer composes them; exports kept).
4. `createTronAdapter` refuses any chain id containing "mainnet" with `TronError` `INVALID_INPUT` (no `CHAIN_DISABLED` code exists in `TronError`). Test in `adapter.test.ts` (red then green).
5. ACTIVE_WORK hygiene as above.
6. Counts refreshed only where re-measured (chain-tron README, chain-solana DEVIATIONS); others remain the donor's 2026-11-18 numbers.
7. Pre-existing defect fixed in FC-03: `packages/solana-stealth/src/meta-address.ts` `encodeMetaAddress` did not validate the cluster at runtime; an unknown string produced `Uint8Array.of(1, undefined)`, silently encoding the mainnet byte. It now throws `INVALID_META_ADDRESS` for any non-own-property cluster (same guard as chain-solana). Test in `stealth.test.ts` (red: "expected undefined to be 'INVALID_META_ADDRESS'").

## Browser-alignment check
- The web app imports `@ghostpay/solana-stealth` and `@ghostpay/tron-adapter` (`apps/web/src/features/{solana,tron}/wallet.ts`), not `chain-solana`/`chain-tron`.
- The donor's `chain-solana/src/interop.test.ts` and `chain-tron/src/interop.test.ts` load the web-side source plus `test-vectors/solana-stealth.json` and the shared `meta-address-sol-tron-v1.json`, and compare field by field. They pass in the runs below.
- `packages/payment-uri` handles plain addresses only (no `st:sol`, `st:trx`, `gpst1`); no overlap.
- TRON `buildPaymentRequest` still throws `MEMO_NOT_BOUND` (`adapter.test.ts`). Solana adapter keeps mainnet absent; CLI inspect refuses mainnet recipients.

## Local results (Windows host, shared 4 GB machine; run on head containing the follow-ups)
- `npm ci --ignore-scripts`: completed. `npm run build:libs`: NOT run to completion (stopped at about 24 of 69 libraries because of load); chain-solana, chain-tron and cli were built, solana-stealth and tron-adapter were not.
- typecheck and lint, exit code 0 for each of solana-stealth, chain-solana, chain-tron, cli.
- chain-tron `npm test`: 6 files, 55/55 pass; coverage 100% statements (168/168), branches (107/107), functions (38/38), lines (140/140).
- cli `vitest run --coverage --testTimeout=400000`: 37 files, 575 passed, 2 skipped (577); coverage statements 98.41%, branches 97.29%, functions 99.07%, lines 99.34%. (An earlier run with the default 60 s timeout had 5 timeouts in key-derivation tests under load; they pass with the longer timeout.)
- chain-solana `npm test` (final round, after the object-overload guard): 108/115 pass; solana-stealth `npm test` (earlier run): 130/137 pass. FC-03 local Windows re-run only; the donor recorded 111/111 on Linux and `packages/chain-solana/DEVIATIONS.md` keeps the donor numbers. All 14 failures are `adapter-types.test.ts`, which reads `packages/chain-adapters/src/adapter.ts` with an LF-only regex and fails on this CRLF checkout (`core.autocrlf=true`); both files are unchanged by this work. Coverage was not reported for these two because the run failed; their results on Linux are left to hosted CI.
- `git diff --check origin/main...HEAD`: clean.

## Known limitations (reviewer nits, recorded not fixed)
- CLI localnet hint versus `ENABLED_SOLANA_CHAINS`: the hint text may name localnet where the enabled set differs.
- `metadataHex` is vestigial in the Solana announcement path.
- A `TronError` `LEGACY` branch is unreachable.
- The interop tests import sibling workspace source (`solana-stealth`, `tron-adapter`) without declared dependencies.
- There is no legacy `gpsol:` scan path (legacy input is rejected).
- `decodeMetaAddress` without `expectedCluster` still parses mainnet addresses (needed to report and refuse them); only derivation refuses them.
- `buildTrc20TransferRequest` and `deriveTronStealthPayment` stay exported; protection is a documentation warning plus the adapter's `MEMO_NOT_BOUND`.
- Local `build:libs` incomplete; the full CI suite is the authority.

## Final round (second review)
- Object overload of chain-solana `deriveStealthPayment` refuses a decoded mainnet `SolanaMetaAddress` with `CHAIN_DISABLED` before any RNG draw (test counts draws; red then green: "expected function to throw an error, but it didn't"). The `CHAIN_DISABLED` message is now neutral for both callers (the object overload and `createSolanaAdapter`): "this testnet proof of concept refuses mainnet".
- `docs/remote/chain-ports/solana-impl.md` states the ADR-0017 derivation (Z=r*V, no cofactor step, SHA-256 view tag); `packages/solana-stealth/README.md` says the base64url memo is rejected as `INVALID_ANNOUNCEMENT` (only `gpsol:` meta-addresses get `LEGACY_META_ADDRESS`).
- FC-03 claim owned paths extended; `DEVIATIONS.md` restored to the donor's status text (transient local results live only here).
- Local, final round: chain-solana typecheck exit 0, lint exit 0; cli `chain-commands.test.ts` 45/45; chain-solana 108/115 (the 7 failures are the CRLF-sensitive `adapter-types.test.ts`).
- Additional limitation: the chain-tron mainnet check in `createTronAdapter` is a denylist (chain id containing "mainnet"); an allowlist would be stronger. The adapter's payment build always throws `MEMO_NOT_BOUND` regardless.
