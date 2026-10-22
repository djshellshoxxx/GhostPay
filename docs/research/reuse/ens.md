# ENS reuse research (module: ens)

Scope: ENS name normalization (ENSIP-15), resolution / CCIP-read (EIP-3668) offchain resolver, multichain address records (ENSIP-9/11 coinType).
Method: read-only. WebSearch/WebFetch, `gh api` (403 for these repos, so metadata came from github.com pages and atom feeds). No clone, no install, no code copied.
Repo check: `packages/` and `apps/` contain no ENS module (existing: address-safety, chain-adapters, core-crypto, ...).

## Candidates

| # | Repo | Licence (verified) | Latest commit (atom feed, fetched 2026-10-21) | Stars | Maintained? | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|
| 1 | https://github.com/adraffy/ens-normalize.js (npm `@adraffy/ens-normalize` 1.11.1) | MIT. LICENSE: https://raw.githubusercontent.com/adraffy/ens-normalize.js/main/LICENSE (first line "MIT License", "Copyright (c) 2021 Andrew Raffensperger"). package.json license "MIT". | 845cb5acf5ea9553cb79568e4b43dfbd48d57980, 2026-09-22 ("fix rpc and sepolia eth stuff") | 73 | Yes, active 2026. Unicode 17.0.0, CLDR 47. | Use as dependency. Source in src/ (13 files: all, decoder, encoder, include-*, lib, make*, nf*, parts, utils). Dist entries: index.mjs/.cjs, index-xnf.* | Runtime: none. Dev: rollup, @rollup/plugin-alias, @rollup/plugin-terser. |
| 2 | https://github.com/ensdomains/ensjs (npm `@ensdomains/ensjs` 5.2.4) | MIT. LICENSE: https://raw.githubusercontent.com/ensdomains/ensjs/main/LICENSE ("MIT License", "Copyright (c) 2022 ENS Labs Limited"). packages/ensjs/package.json license "MIT". | 18d73d1bb41bdbd951d71870b2bac69974d3e25a, 2026-10-19 (release merge) | 158 | Yes, very active. Monorepo (docs, ensjs-abi, ensjs, query-core, react). | Reference for multichain addr API (coinType handling, `./utils/v2`, `./public/v2`). Too heavy to copy whole. | @adraffy/ens-normalize 1.10.1, @ensdomains/address-encoder 1.1.4, @ensdomains/content-hash 3.1.0-rc.1, dns-packet ^5.3.1, ts-pattern ^5.4.0. Peer: viem, graphql, @ensdomains/dnsprovejs. |
| 3 | https://github.com/ensdomains/offchain-resolver (npm `@ensdomains/offchain-resolver-gateway` 0.2.1) | MIT. LICENSE: https://raw.githubusercontent.com/ensdomains/offchain-resolver/main/LICENSE ("MIT License", "Copyright (c) 2021 Ethereum Name Service (ENS)"). Gateway package.json license "MIT". | 099b7e9827899efcf064e71b7125f7b4fc2e342f, 2024-02-03 (demo bugfix) | 147 | Stale: no commit in ~2.7 years at fetch date. Reference implementation of CCIP-read gateway. | packages/gateway/src: index.ts, json.ts, server.ts, utils.ts, offchainexample.eth.json. packages/contracts (resolver Solidity), packages/client. | Gateway: @chainlink/ccip-read-server ^0.2.1, @chainlink/ethers-ccip-read-provider ^0.2.3, @ensdomains/ens-contracts ^0.0.8, @ensdomains/offchain-resolver-contracts ^0.2.1, ethers ^5.7.2, commander ^8.3.0, dotenv ^15.0.0. Ethers v5 (not viem). |
| 4 | https://github.com/namestonehq/TheOffchainResolver.sol | Not verified (no LICENSE fetched) | Not checked | Not checked | Not checked | Solidity offchain resolver, alternative to #3 | Not checked |

Unverified or not checked: #4 licence and metadata; `@ensdomains/address-encoder` and `@ensdomains/content-hash` licences (not fetched, only dependency names known); commit SHAs are HEAD of `main` at fetch time and may move. `gh api` and api.github.com returned 403 for all three repos, so star counts and dates come from github.com HTML.

## Recommendation

1. **ENS name normalization: `depend`** on `@adraffy/ens-normalize@1.11.1` (MIT, zero runtime deps, actively maintained, ENSIP-15 reference). Do not copy src/: it is generated (rollup, Unicode tables), so copying breaks upgrades.
2. **Multichain address records: `reference-only`** for ensjs (`packages/ensjs/src`, coinType and address-encoder usage). Depending on the full `@ensdomains/ensjs` pulls viem, graphql and dnsprovejs peers. Prefer `@ensdomains/address-encoder` only after its licence is verified (currently unverified). Alternative: implement the small ENSIP-11 coinType rule in-house with a test vector table.
3. **CCIP-read gateway: `adapt`** from `packages/gateway/src/server.ts` and `utils.ts` (MIT, copy with the licence header kept). Port from ethers v5 to viem and from the stale ccip-read-server to a plain HTTP handler. Contract side (`packages/contracts`) stays reference-only; GhostPay should take its own contract audit path.
4. Overall decision: `depend` (normalization) + `adapt` (gateway). No wholesale copy.

## Integration plan (GhostPay)

- Target path: `packages/ens/` (new workspace package, `@ghostpay/ens`). Keep it aligned with `packages/address-safety` (the nearest existing module).
- Dependency: `@adraffy/ens-normalize@1.11.1` pinned exact. Add a `LICENSES-THIRD-PARTY.md` entry with MIT text and copyright line from the LICENSE file above.
- API shape (proposed):
  - `normalizeName(name: string): string` wraps `ens_normalize` (throws on invalid, never silently fallback).
  - `namehash(name: string): \`0x${string}\`` (ENSIP-1). Use this package's own implementation or viem's `namehash` once checked; add vectors.
  - `resolveAddress(name, chainId | coinType): Promise<\`0x${string}\` | null>`, `resolveRecord(name, key)`.
  - `coinTypeForChain(chainId): bigint` implementing ENSIP-11 (`0x80000000 | chainId` for EVM chains, coin type 60 for default).
  - `ccipReadGateway(handler)` adapted from offchain-resolver gateway: verify request, sign response with a key from env, return `{ data }`.
- Tests:
  - Vectors for normalization: reject `"ab‌c.eth"` style confusables, uppercase `"Vitalik.eth"` to `"vitalik.eth"`, emoji labels. Use ENSIP-15 test file from the adraffy repo as a fixture only after checking its licence (MIT, fine).
  - namehash vectors: `""` -> zero hash, `"eth"` -> `0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae`.
  - coinType: chainId 1 -> 60, chainId 10 -> `0x80000000 | 10`.
  - Gateway: unit test with mock resolver; reject bad signature; reject expired TTL.
- Run location: no network in unit tests; mock RPC.

## Risks

- Supply chain: `@adraffy/ens-normalize` is a single-maintainer package. Pin exact version, verify npm integrity, review diff on upgrade (Unicode table regeneration is large). Single-author repo is a bus-factor risk.
- Abandonment: `ensdomains/offchain-resolver` last commit 2024-02-03, ethers v5, `@chainlink/ccip-read-server` 0.2.x. Treat as reference, not dependency.
- Licence traps: all verified candidates are MIT. Unverified: namestonehq TheOffchainResolver.sol, address-encoder, content-hash. Do not copy until checked. The Dart port `ens_normalize` lists BSD-3-Clause and "unknown" elsewhere; do not use it as a source for licence.
- Security: CCIP-read gateway signs responses. Key management and signer allowlist are required; a compromised gateway can lie unless the resolver verifies the signer on-chain. Check the signer address handling in `packages/contracts` before adapting.
- Name spoofing: normalization must run before any lookup or display. Un-normalized input to resolution is a phishing vector.
- Chain state: ENS on-chain data changes; cache with TTL, not indefinitely.
