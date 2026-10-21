# Reuse research: chain-data

Status: READ-ONLY research. No clone, no install, no code copied. Commit SHAs and last-commit dates NOT verified (GitHub API and `gh` returned 403 for these repos in this session; web pages did not show SHA/date). Star counts are approximate from github.com page render.

## Existing code in repo
- `packages/chain-adapters/src/config/chains.ts` and `tokens.ts`: GhostPay's own chain + token config. Package is `@ghostpay/chain-adapters`, license UNLICENSED, uses viem 2.57.7.
- No other chain-metadata package found in `packages/` or `apps/`.

## Candidates

| # | Repo | Licence (verified) | Licence file | SHA | Last commit | Stars | Maintained? | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|---|---|
| 1 | https://github.com/ethereum-lists/chains | **MIT** (NOT CC0 as the task assumed). Verbatim: "MIT License", "Copyright (c) 2026" | https://raw.githubusercontent.com/ethereum-lists/chains/master/LICENSE | unverified | unverified | ~9.8k | Yes (4,393 commits, active per page) | `_data/chains/eip155-<chainId>.json` schema (keys: name, chain, icon, rpc[], features[], faucets[], nativeCurrency{name,symbol,decimals}, infoURL, shortName, chainId, networkId, slip44, ens{registry}, explorers[{name,url,icon,standard}]). Sample checked: `eip155-1.json` (Ethereum Mainnet, chainId 1). Data files are the reuse target, not code. | none (data) |
| 2 | https://github.com/Uniswap/token-lists | **MIT**. Verbatim: "MIT License", "Copyright (c) 2020 Uniswap". package.json license: "MIT" | https://raw.githubusercontent.com/Uniswap/token-lists/main/LICENSE | unverified | unverified | ~1.7k | Moderate (148 commits; SDK tag 1.0.0-beta.35) | `src/types.ts` (TokenInfo{chainId,address,name,decimals,symbol,logoURI?,tags?,extensions?}, TokenList{name,timestamp,version,tokens,tokenMap?,keywords?,tags?,logoURI?}); token-list JSON schema. Small, easy to port types by hand. | devDeps only (tsdx, typescript, eslint); package main `dist/index.js`, typings `dist/index.d.ts` |
| 3 | https://github.com/trustwallet/assets | **MIT**. Verbatim: "MIT License", "Copyright (c) 2019-2023 Trust Wallet" | https://raw.githubusercontent.com/trustwallet/assets/master/LICENSE | unverified | unverified | ~5.4k | Yes (15,729 commits) | Data only. `blockchains/<chain>/info/info.json` schema (name, website, description, explorer, symbol, type, decimals, status, tags[], links[{name,url}]); `blockchains/ethereum/info/info.json` checked. Logos are per-asset images: licence of images not verified separately (treat as needing review before shipping). | none (data) |
| 4 | https://github.com/Uniswap/default-token-list | Not checked. Search result cited as GPL-3.0 on Uniswap org page (third-party aggregator, unverified) | not fetched | - | - | - | - | - | - |

Notes on candidates:
- "Issuer address pages" (task term) not researched: no repo identified. Treat as unresolved; the official explorer pages (Etherscan etc.) are links, not copyable code.
- Search hit `ApeWorX/py-tokenlists` (MIT) is a Python port, not useful for a TS monorepo. Not recommended.
- Search hits for `Allfeat/chaindata`, `connext/chaindata`, `Arianee/chains` are unverified forks or unrelated; not evaluated.

## Recommendation

**Per candidate:**
- ethereum-lists/chains: **copy (data), MIT** (attribution required; keep LICENSE notice in copied files). Do not copy whole repo; copy only the entries GhostPay supports (its chain list in `chains.ts`) into a generated JSON, or depend on it at build time.
- Uniswap/token-lists: **adapt** (types only, MIT attribution). Re-type TokenInfo/TokenList in GhostPay rather than adding the dependency.
- trustwallet/assets: **reference-only** for metadata shape. Do not copy logos until image licences are verified.

**Overall: adapt.** Do not add a runtime dependency on any of these. Chain data is small and changes slowly; a pinned, vendored snapshot is safer.

## Integration plan (adapt, GhostPay)

Target path: `packages/chain-data/` (new, private, `license: UNLICENSED`, with `THIRD_PARTY_NOTICES.md` listing ethereum-lists/chains MIT and Uniswap/token-lists MIT, copyright lines verbatim above).

Files:
- `packages/chain-data/data/eip155-<chainId>.json`: vendored copy of ethereum-lists entries for only the chains in GhostPay's `packages/chain-adapters/src/config/chains.ts`. Record source commit SHA in a header file `data/SOURCE.md` (SHA must be filled in by someone with GitHub access; not verified here).
- `packages/chain-data/src/types.ts`: `ChainInfo` and `TokenInfo` / `TokenList` types, field names matching the upstream schemas above.
- `packages/chain-data/src/index.ts`: API shape:
  - `getChain(chainId: number): ChainInfo | undefined`
  - `listChains(): ChainInfo[]`
  - `getNativeCurrency(chainId: number): {name,symbol,decimals}`
  - `getExplorer(chainId: number): string | undefined`
  - `validateTokenList(json: unknown): TokenList` (zod or hand-written; reject chainId mismatch)
- `packages/chain-data/scripts/sync.ts`: optional, offline-only generator that reads a local checkout path (no network at build time).

Tests (vitest, matching chain-adapters):
- Snapshot test: every chainId in chain-adapters config resolves via `getChain`.
- Schema test: each vendored JSON parses; `chainId` equals filename suffix; `nativeCurrency.decimals` is an integer.
- Negative test: unknown chainId returns undefined; token list with wrong chainId rejected.
- No network in tests.

Consumers: `chain-adapters` imports `getChain`/`getExplorer` only; no change to adapter logic.

## Risks
- Supply chain: data-only copy removes runtime dependency risk. The sync script must not run in CI with network access unpinned.
- Abandonment: ethereum-lists/chains is active; Uniswap/token-lists is moderately active; trustwallet/assets is large and active. Vendoring makes abandonment a non-issue for runtime.
- Licence traps: (a) ethereum-lists is MIT, not CC0; keep attribution. (b) Uniswap default-token-list is reported GPL-3.0 (unverified) - do NOT copy from it. (c) trustwallet/assets logos and token images carry their own rights; do not copy images. (d) Explorer URLs and RPC endpoints in the data may be third-party, rate-limited, or require API keys: do not ship public RPC URLs as defaults without review.
- Data accuracy: chain metadata (chainId, RPCs, explorers) can drift or be malicious in forks; pin SHA, review diffs on each refresh.
- Unverified: all SHAs, last-commit dates, and exact star counts. Re-verify with an authorized `gh` session before relying on them.

## Next steps
1. Attach repos with `add_repo` (read) so SHAs and dates can be recorded.
2. Confirm which chainIds GhostPay supports from `chains.ts`.
3. Decide vendored-data vs. build-time dependency.
