# TRON prior art: reuse research

Scope: TronWeb licence, TRC-20 helpers, Base58Check libs, Nile testnet tooling.
Method: read-only WebSearch/WebFetch. No clone, no install, no code copied.
GitHub REST API returned 403 to WebFetch, so dates/stars come from HTML pages (lower confidence). "not shown" = not visible on fetched page.

## Repo check

- `packages/`: address-safety, btc-*, chain-adapters, confidential-*, contracts, core-crypto, external-pools-*, invoice-schema, ops-monitor, payer-*, policy-scheme, pool-*, relayer-guard, secret-box, solana-stealth, tx-review. No TRON package.
- `apps/`: relayer, web.
- grep `tron` in packages/apps .ts/.json: only `packages/policy-scheme/src/eip712.ts`, `apps/web/e2e/flows.spec.ts` (likely incidental text; not checked further).
- Root `package.json` license: UNLICENSED (copyleft-free, but MIT code needs its notice kept).

## Candidates

| # | Repo / package | URL | Licence (verified source) | SHA / version | Last commit | Stars | Maintained? | Reusable files/dirs | Deps |
|---|---|---|---|---|---|---|---|---|---|
| 1 | tronprotocol/tronweb (npm `tronweb`) | https://github.com/tronprotocol/tronweb | MIT License, "Copyright (c) 2023 TRON Foundation" (raw LICENSE at https://raw.githubusercontent.com/tronprotocol/tronweb/master/LICENSE; read via summariser, not byte-verified) | master 974ea0bcd98c2a10f2e94addd55d4fa3b199f98a; npm 6.5.1 | Sep 16 2026 (merge PR #723 release/v6.5.1) | 571 | Yes, active release cadence (v6.5.1) | Use as dependency. Relevant APIs: `tronWeb.transactionBuilder.triggerSmartContract`, `triggerConstantContract`, `tronWeb.address.fromHex/toHex`, `tronWeb.utils`. Source `src/` (not copied). | axios, bignumber.js, ethereum-cryptography, ethers, eventemitter3, google-protobuf, semver, tslib, validator |
| 2 | sterliakov/tronweb (TSTron) | https://github.com/sterliakov/tronweb | MIT per README text; LICENSE at https://raw.githubusercontent.com/sterliakov/tronweb/master/LICENSE reads "MIT License, Copyright (c) 2019 TRON Foundation" (fork keeps upstream notice) | not shown | not shown | 1 | Doubtful: search snippet says releases not updated in long time; fork submitted to Tron Grand Hackathon S3 | Reference only: typed TS rewrite of TronWeb (`src/`) if we need types beyond upstream | not checked (package.json at repo root) |
| 3 | by-aneex/Token | https://github.com/by-aneex/Token | Search snippet says MIT; **unverified**: repo URL returned 404 on fetch of page and LICENSE | not shown | not shown | not shown | Unknown; snippet says unaudited, not affiliated with TRON DAO/Tether | None. Solidity TRC-20 contract only, not relevant to backend code | n/a |
| 4 | tronweb3/tron-dapp-quickstart | https://github.com/tronweb3/tron-dapp-quickstart | MIT license (sidebar text "MIT license"; LICENSE file exists at https://github.com/tronweb3/tron-dapp-quickstart/blob/main/LICENSE; text not read verbatim) | not shown | not shown (2 commits only) | 12 | Low activity | Reference only: TRC-20 transfer example via `transactionBuilder.triggerSmartContract`; React 19 + Vite + TS template (`src/`) | React, Vite (frontend only) |
| 5 | paulmillr/scure-base (npm `@scure/base`) | https://github.com/paulmillr/scure-base | MIT License, "Copyright (c) 2022 Paul Miller" (raw LICENSE: https://raw.githubusercontent.com/paulmillr/scure-base/main/LICENSE, verbatim first lines fetched) | not shown | not shown | 181 | Yes, audited, widely used (README: "Audited & minimal implementation of bech32, base64, base58, base32 & base16") | Depend: `createBase58check(sha256)` for Base58Check with 0x41 prefix | none claimed (not checked) |
| 6 | smartcontractkit/smart-contract-examples, `data-feeds/tron/getting-started` | https://github.com/smartcontractkit/smart-contract-examples/tree/main/data-feeds/tron/getting-started | **Not shown** (no LICENSE in directory listing) | not shown | not shown | not shown | Unknown | Reference only: TronBox + TronWeb Nile deploy flow, `.env` `PRIVATE_KEY_NILE` pattern | TronBox, TronWeb |

Also found, not verified: `base58check` npm (last publish 2016 per snippet; reference only, do not use). `bs58check` npm (bitcoinjs; not checked). Nile faucet: https://nileex.io/join/getJoinPage (2000 TRX, 24 h cooldown per snippet). TronBox: no official repo confirmed in results; check tronbox.io.

## Recommendation

Decision per module part:

- **TronWeb (#1): depend**, do not copy. Large, generated/protobuf-heavy, many deps. Pin `tronweb@6.5.1` exact. MIT: keep notice if any code is ever copied.
- **Base58Check: depend on @scure/base (#5)**, MIT, audited. Do not copy base58check (2016). Helper: `createBase58check(sha256)`, prefix byte `0x41`.
- **TRC-20 helpers: write our own thin module (decision: none to copy).** Use TronWeb's `triggerSmartContract`/`triggerConstantContract` with standard ABI (`balanceOf`, `transfer`, `decimals`, `symbol`). Pattern shown in #4 (MIT) may be read and reimplemented.
- **Reference only:** #2 (types), #4 (transfer example), #6 (Nile deploy flow, licence not shown so no copy).
- **Excluded:** #3 unverified; do not depend on it.

Decision overall: **depend** (TronWeb + @scure/base), with TRC-20 wrapper written in-house.

## Integration plan

- Target path: new workspace package `packages/tron-trc20/` named `@ghostpay/tron-trc20` (matches `packages/*` workspace glob). Keep `packages/chain-adapters` untouched until API is stable, then add a TRON adapter there if it fits its interface.
- Deps: `"tronweb": "6.5.1"` (exact pin), `"@scure/base": "<pin exact after npm check>"`. Lockfile reviewed in PR.
- API shape (proposed):
  - `toBase58(hex41: string): string`, `toHex(base58: string): string`, `isValidAddress(s: string): boolean`
  - `trc20Balance(client, token: string, owner: string): Promise<bigint>`
  - `buildTrc20Transfer(client, {token, from, to, amount: bigint, feeLimitSun?}): Promise<UnsignedTx>` (no signing inside; signing via caller/wallet)
  - `trc20Meta(client, token): Promise<{symbol, decimals}>`
- Client factory takes `fullHost` injected (mainnet `https://api.trongrid.io`, Nile `https://nile.trongrid.io`); no hard-coded keys. Private key never passed to this package.
- Tests (vitest, match repo convention): unit tests with mocked `triggerConstantContract` for balance/meta; address round-trip tests using vectors generated and cross-checked against TronWeb itself (do not invent vectors); negative tests (bad checksum, wrong prefix, `amount` overflow). Optional integration test on Nile gated by env var `TRON_NILE_RPC`, skipped in CI.
- Nile testnet: faucet via https://nileex.io/join/getJoinPage; TronBox only if we need a deployed test token.

## Risks

- **Supply chain:** tronweb pulls ethers, axios, google-protobuf and others: large transitive surface. Pin exact, run `npm audit`, review lockfile diffs. Repo has `.github/workflows` for sterliakov only; upstream CI not verified here.
- **Abandonment:** #2 fork looks stale (1 star). #4 template low activity. #3 unverified. #6 unlicensed and unverified. Do not rely on them.
- **Licence traps:** #2 keeps upstream TRON Foundation MIT notice; any copy must keep it. #6 has no licence: reference only. #3 licence unverified: do not copy. Root repo is UNLICENSED, which is fine for depending on MIT libs but any copied MIT text must carry its notice.
- **Verification gaps:** GitHub API returned 403, so SHAs for #2, #4, #5 and stars/dates for some are "not shown". Licence text was read via a summariser, not byte-verified: check the raw LICENSE files directly before copying any notice. Copyright year for tronweb reads 2023; sterliakov fork reads 2019.
- **Security:** TRON private keys are secp256k1 and Base58 with 0x41 prefix; wrong prefix silently produces a valid-looking but wrong address. Test round-trips against TronWeb.
