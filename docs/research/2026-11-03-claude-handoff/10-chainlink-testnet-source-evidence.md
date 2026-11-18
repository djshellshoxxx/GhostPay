# Chainlink testnet source evidence: unblock PR #72

**The primary-source download blocker described in PR #72 is resolved by the evidence in this directory.** Both requested Chainlink reference-data files were retrieved successfully on **2026-11-04 UTC**, preserved byte for byte, parsed, and tied to their networks through Chainlink's own documentation source. Claude can use this evidence when resuming that PR. This research does not change GhostPay's feed registry or establish live contract health.

The inspected blocked-work note is [PR #72's `SOURCES-2026-11-04.md`](https://github.com/djshellshoxxx/GhostPay/blob/76199cdac3ee336e2751995d511111467141d943/docs/chains/SOURCES-2026-11-04.md). It requests Base Sepolia ETH/USD and USDC/USD if listed, Sepolia USDC/USD if listed, and the heartbeat of the existing Sepolia ETH/USD feed. All four records are present in the retrieved primary data.

## 1. Exact evidence files

| Network | Preserved source | Retrieval completion (UTC) | Size / records | SHA-256 of exact bytes |
|---|---|---|---|---|
| Sepolia | [feeds-ethereum-testnet-sepolia.json](evidence/chainlink/feeds-ethereum-testnet-sepolia.json) | 2026-11-04 02:40:56.007237 | 55,997 bytes / 61 | `0c61b93d68190e6327d7f8418aad99a11037dc27bed6aa6ec97e92f905977652` |
| Base Sepolia | [feeds-ethereum-testnet-sepolia-base-1.json](evidence/chainlink/feeds-ethereum-testnet-sepolia-base-1.json) | 2026-11-04 02:40:57.356696 | 9,848 bytes / 11 | `8a170a72bcdf8bd41a977334a9ee0659bcae01b628a967052886b3fe618b34bc` |

Original primary-source URLs:

- <https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia.json>
- <https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia-base-1.json>

The [machine-readable retrieval manifest](evidence/chainlink/retrieval-manifest.json) records URLs, network bindings, byte counts, hashes, exact array positions and selected fields. The files are complete source snapshots, not reconstructed extracts. Retrieval used ordinary `curl` HTTPS requests with the inherited session network configuration; both requests reported HTTP 200. The web-search fetcher could not open these JSON endpoints, but the shell retrieval succeeded. No proxy, access-control or credential change was used.

Timestamps are the original completed curl output files' UTC modification times, recorded before their exact bytes were copied into this repository. Copy or checkout modification times do not reproduce retrieval times. HTTP response headers, ETags and publisher signatures were not captured. The hashes identify these bytes; they are not a Chainlink-signed authenticity statement. Refresh the source if later changes matter to the implementation under review.

## 2. Requested records

Use the **proxy** address for these ordinary price-feed records. `contractAddress` is the separately recorded underlying aggregator address. Array positions below are zero-based JSON Pointers into the saved files.

| Network / chain ID | JSON Pointer | Feed / path | Proxy address | Feed decimals | Heartbeat in seconds |
|---|---|---|---|---:|---:|
| Sepolia / 11155111 | `/29` | ETH / USD — `eth-usd` | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 8 | **3600** |
| Sepolia / 11155111 | `/2` | USDC / USD — `usdc-usd` | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | 8 | **86400** |
| Base Sepolia / 84532 | `/7` | ETH / USD — `eth-usd` | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` | 8 | **1200** |
| Base Sepolia / 84532 | `/10` | USDC / USD — `usdc-usd` | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` | 8 | **86400** |

Three selection details matter:

1. **Do not select by display name alone.** The Sepolia file also has an `ETH / USD` record at `/27` with path `eth-usd-nops`, another proxy, and `docs.hidden: true`. The four selected records above have no hidden flag. Chainlink's own metadata loader excludes records with `docs.hidden === true`.
2. **Use `decimals`, not `decimalPlaces`.** The Base Sepolia entries have `decimalPlaces: 9` but `decimals: 8`; the selected Sepolia ETH feed has `decimalPlaces: 3` but `decimals: 8`. Display precision is not the integer answer scale. A later contract read should independently confirm the selected proxy's `decimals()`.
3. **Heartbeat metadata is not a fresh round.** The values above describe the source's heartbeat field. They do not prove that a feed is presently updating, define GhostPay's tolerated quote age, or replace checking the returned round and timestamp. Keep any maximum-age/grace policy explicit and separately justified.

## 3. Why these URLs are official network metadata

The JSON documents do not contain their own chain-ID fields. Their network binding is supplied by the official `smartcontractkit/documentation` repository, inspected at commit **`182823c5db0756af3b0dd6a6de6225d2675cb5cf`**:

| Official source | Observed evidence |
|---|---|
| [`src/features/data/chains.ts`](https://github.com/smartcontractkit/documentation/blob/182823c5db0756af3b0dd6a6de6225d2675cb5cf/src/features/data/chains.ts) | Associates the first RDD URL with **Sepolia Testnet**, query `ethereum-sepolia`, and the second with **Base Sepolia testnet**, query `base-sepolia`. Both entries declare `networkType: testnet`. |
| [`src/config/data/chains.json`](https://github.com/smartcontractkit/documentation/blob/182823c5db0756af3b0dd6a6de6225d2675cb5cf/src/config/data/chains.json) | Supplies chain IDs **11155111** for Ethereum Sepolia and **84532** for Base Sepolia. |
| [`src/features/data/api/index.ts`](https://github.com/smartcontractkit/documentation/blob/182823c5db0756af3b0dd6a6de6225d2675cb5cf/src/features/data/api/index.ts) | Fetches network `rddUrl` metadata and filters hidden entries before presenting feeds. |
| [`src/features/feeds/components/Tables.tsx`](https://github.com/smartcontractkit/documentation/blob/182823c5db0756af3b0dd6a6de6225d2675cb5cf/src/features/feeds/components/Tables.tsx) | Displays `heartbeat` with an `s` suffix and separately uses `metadata.decimals`; normal price-feed address links use the proxy address. |

The manifest records each inspected source file's Git blob hash. The documentation commit pins the URL mapping and field interpretation; it does **not** turn the mutable remote JSON into content at that commit. The saved JSON hashes and retrieval times supply the separate data snapshot.

## 4. Suggested continuation for Claude

1. Refresh PR #72 and its current owner before editing. Reconcile the old blocked status with this successful retrieval instead of retrying the same environment failure indefinitely.
2. Verify the saved byte hashes and selected JSON Pointers. Use this report and manifest as the dated, primary-source evidence requested by `docs/chains/SOURCES-2026-11-04.md`.
3. Prepare any registry change in the existing price-feed implementation and existing PR lane. The research proves listing and source metadata; decide separately whether each network/feed belongs in the supported product/profile.
4. Before claiming operational support, verify chain identity, proxy contract code, `decimals()`, usable `latestRoundData()` values/timestamps, and the application's freshness/refusal behavior. A current Chainlink listing is insufficient evidence of those runtime properties.
5. Reconcile [report 07](07-merchant-delivery-oracles.md)'s health and L2 policy findings with the intended configuration. Do not remove conservative behavior merely because the download blocker is resolved.

**Execution boundary:** the evidence preparation fetched public metadata, inspected official source, parsed JSON and verified hashes. It did not call a chain RPC, execute a transaction, run the price-feed application tests, alter `FEEDS`, or enable additional chains.
