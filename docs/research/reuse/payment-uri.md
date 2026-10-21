# Reuse research: payment-uri

Research date: 2026-10-21. Read-only. No clone, no install, no code copied into the repo.

## Repo check

`packages/` has no payment-URI module. Related existing packages: `invoice-schema`, `address-safety`, `btc-payjoin`, `btc-silent-payments`. `address-safety` layout (vitest, tsconfig.build.json, DEVIATIONS.md, README.md) is the template to mirror.

## Access limits (verified)

- GitHub API (`api.github.com`, `gh api`) returned 403 for all candidate repos: "GitHub access to this repository is not enabled for this session".
- `add_repo` to attach `solana-foundation/pay` was denied by the auto-mode classifier. Not retried.
- So SHAs below come from github.com HTML pages fetched via WebFetch, and file contents from raw.githubusercontent.com. Each SHA is marked by source.

## Candidate table

| # | Repo / package | Licence (verified from) | SHA (source) | Last commit | Stars | Maintained? | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|---|
| 1 | https://github.com/bitcoinjs/bip21 (npm `bip21` 3.0.0) | MIT. LICENSE file https://raw.githubusercontent.com/bitcoinjs/bip21/master/LICENSE, "MIT License / Copyright (c) 2018 bitcoinjs". npm also says MIT. | `96ea0444cfb5e226a7fe9e402f5c567f24690528` (github.com/bitcoinjs/bip21/commits/master page). Unverified by API. | Page: Jul 20, 2024 ("Merge pull request #19 from Nesopie/feat/hybrid"). CONFLICT: npm `time.modified` 2025-06-27. Verify before pinning. | 57 | Low-activity, small, stable spec-level library | `index.js` (about 50 lines): `decode(uri, urnScheme)`, `encode(address, options, urnScheme)`. Tests in `test/`. | `query-string ^9.0.0` |
| 2 | https://github.com/niteshbalusu11/bip-321 (npm `bip-321` 0.0.11) | MIT. LICENSE https://raw.githubusercontent.com/niteshbalusu11/bip-321/master/LICENSE, "MIT License / Copyright (c) 2026 Nitesh". | `5ac9579ce2a4e26016472654598085d64d9d34dd` (commits/master page), msg "bump version". | May 27, 2026 | 1 | Active but single-author, pre-1.0 | `index.ts` (`parseBIP321`, `encodeBIP321`, `getValidPaymentMethods`, network checks, pop/req-pop handling), `validators.ts`, `index.test.ts`, `AGENTS.md`. Covers onchain, BOLT11, BOLT12 offers, silent payments, Ark. | `@noble/hashes ^2.0.1`, `@scure/base ^2.0.0`, `bitcoinjs-lib ^7.0.0`, `light-bolt11-decoder ^3.2.0`, `light-bolt12-decoder ^1.0.3` |
| 3 | https://github.com/solana-foundation/pay (npm `@solana/pay`) | Repo root MIT. LICENSE https://raw.githubusercontent.com/solana-foundation/pay/main/LICENSE, "MIT License / Copyright (c) 2026 Solana Foundation". npm `@solana/pay` 1.0.26: Apache-2.0 per registry. The package LICENSE was not readable (404). | `ec82eef769098d885ad9bde4f3e1669352ef6f42` (commits/main page), msg "fix(deps): eMudhra no problem (#531)" | Oct 21, 2026 (today) | ~1.8k | Yes, very active, 945 commits | Package at `typescript/packages/solana-pay`. v1.0 API: `encodeURL`, `parseURL`, `createTransfer`, `validateTransfer`. Spec docs: solana.com/docs/tools/solana-pay | v1.0 uses `@solana/kit` v6 per README. npm `repository` field still points at legacy `solana-labs/solana-pay`. |
| 4 | https://github.com/brunobar79/eth-url-parser (npm `eth-url-parser` 1.0.4) | MIT per npm. Repo LICENSE NOT verified. | NOT obtained | npm publish 2022-05-01 | not checked | No (last publish 2022) | EIP-681 / EIP-831 parse + build. Combines parity-js erc681 with an older tokenkit `eip681`. | not checked |

Reference-only (GPL, not copyable):

- https://github.com/parity-js/erc681 (npm `@parity/erc681` 0.1.1). License GPL-3.0 per npm. Npm publish 2023-02-28. Parses only the `pay` prefix; chain id defaults to 1.

No standalone EIP-3770 reference implementation was found. Data source: https://github.com/ethereum-lists/chains (short-name registry, licence NOT verified in this run). Safe app uses the prefix format.

QR: npm `qrcode` 1.5.4, MIT per npm (MIT shown for 1.5.3; 1.5.4 entry truncated, not confirmed). Repo `soldair/node-qrcode`. Use as a dependency, not copied.

Spec sources (text only): EIP-681 https://eips.ethereum.org/EIPS/eip-681 (security note: ENS must not override hex address). BIP-21 https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki. BIP-321 is the successor. EIP-3770 https://eips.ethereum.org/EIPS/eip-3770 (Draft). ERC-7828 is the successor direction.

## Recommendation

| Scheme | Decision | Reason |
|---|---|---|
| BIP-21 | **adapt** | `bitcoinjs/bip21` is MIT and about 50 lines. Copy `index.js` logic into `packages/payment-uri/src/bip21.ts` with an MIT attribution header and tests. Reimplement the amount check and `+` handling. Do not add `query-string`. |
| BIP-321 | **reference-only** (test vectors after review) | MIT, but v0.0.11, 1 star, single author, and pulls 5 deps including bitcoinjs-lib 7. Use `validators.ts` and `index.test.ts` as a checklist. Port only the parsing rules we need. Revisit when stable. |
| Solana Pay | **depend** (pinned) or **reference-only** | Apache-2.0 npm package, active. Pin exact version after checking the package LICENSE and the `@solana/kit` peer tree. Wrap `encodeURL`/`parseURL` behind our own types. Licence conflict (repo MIT vs npm Apache-2.0) must be resolved by reading the package-level LICENSE. |
| EIP-681 | **reference-only**, write our own | GPL-3 parity code cannot be copied. `eth-url-parser` is MIT on npm but unmaintained since 2022 and its repo licence is unverified. The spec is short. Implement from the EIP text. |
| EIP-3770 | **none** (spec only) | No reference code. Use ethereum-lists/chains data only after licence check. |
| QR rendering | **depend** `qrcode` (MIT) | Do not reimplement. Verify 1.5.4 licence in its package. |

## Integration plan (GhostPay)

- Target path: `packages/payment-uri/` (mirror `packages/address-safety`: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `README.md`, `DEVIATIONS.md`, `src/`).
- Files: `src/bip21.ts` (adapted from bitcoinjs/bip21 with attribution), `src/bip321.ts` (own implementation, vectors from bip-321 tests), `src/eip681.ts` (own), `src/solana-pay.ts` (thin wrapper over `@solana/pay`), `src/index.ts`.
- API shape:
  - `parsePaymentUri(input: string): PaymentRequest` where `PaymentRequest` is a discriminated union on `scheme: 'bip21' | 'bip321' | 'eip681' | 'solana-pay'`, with `address`, `network`, `amount` (decimal string, never float), `label`, `message`, `chainId?`, `token?`.
  - `encodePaymentUri(req: PaymentRequest): string`.
  - Parsers throw a typed `PaymentUriError`; no partial results for amounts.
- Tests (vitest): round-trip encode/decode; bitcoinjs/bip21 cases re-expressed; BIP-321 vectors; EIP-681 cases (`pay-` prefix, `value` in wei, `chainId`, function calls rejected); Solana Pay `encodeURL`/`parseURL` round-trip; malformed percent-encoding (bip-321 notes `decodeURIComponent` throws uncaught); amount edge cases (negative, `NaN`, commas, exponent).
- Do not import `@solana/pay` or bip-321 into `core-crypto` or `address-safety`.

## Risks

- Supply chain: `bip-321` pulls 5 deps; `@solana/pay` pulls `@solana/kit`. Pin exact versions, review lockfile diff, run `npm audit`.
- Abandonment: `eth-url-parser` last published 2022; `bip-321` has 1 star and pre-1.0 version. Do not depend on either.
- Licence traps: `@solana/pay` repo MIT vs npm Apache-2.0 (and legacy `solana-labs` repo field); `@parity/erc681` GPL-3.0; ethereum-lists/chains licence unverified; `eth-url-parser` repo LICENSE unverified.
- Unverified SHA: bitcoinjs/bip21 `96ea044` is from a page, not the API; its date (Jul 2024) conflicts with npm (2025-06-27). Re-check before pinning or citing.
- Spec drift: BIP-321 still evolving; EIP-681 wallet support is patchy; EIP-3770 is Draft and debated (CAIP-10 alternative, ERC-7828 successor).
- Security: EIP-681 ENS names must not override hex addresses. Validate checksum (EIP-55) and reject mixed-network inputs.
- Not verified in this run: GitHub API metadata (commit counts, last push), repo-level LICENSE for eth-url-parser and solana-pay package, per-file SPDX headers.
