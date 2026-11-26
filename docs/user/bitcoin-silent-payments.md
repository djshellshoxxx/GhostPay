# Bitcoin silent payments

> **Experimental, testnet only, unaudited.** Mainnet is disabled in the code. Bitcoin is not connected to the router, the relayer or the Ethereum invoice flow. Do not send real bitcoin.

GhostPay's Bitcoin tier uses BIP-352 silent payments. The seller shares one reusable `sp`/`tsp` address. Each payment creates a fresh taproot output that only the seller can find and spend. The engine is `packages/btc-silent-payments`. The UI is the **Bitcoin** view of the full web profile (`apps/web/src/features/btc`). The lean GitHub Pages profile intentionally excludes Bitcoin; this work preserves that build boundary.

## Networks

| Network | Silent-payment prefix | Regular prefix | Enabled in the app |
|---|---|---|---|
| testnet4 | `tsp` | `tb` | yes |
| signet | `tsp` | `tb` | yes |
| regtest (local node) | `tsp` | `bcrt` | yes |
| mainnet | `sp` | `bc` | **no** |

Source: `apps/web/src/features/btc/network.ts`. The app refuses a server whose genesis hash does not match the selected network.

## Seller: receive

1. Open **Bitcoin** in the web app and choose a test network.
2. Create a wallet. The app generates a random 32-byte seed. It is not stored, and it stays hidden until you press **Show backup seed**. It hides again after 60 seconds or as soon as the tab is hidden; you can show it again while the wallet is loaded. Write it down offline.
3. **Copy seed** asks first: other apps and web pages can read the clipboard, and it may be kept in a clipboard history or synced to your other devices. Hiding, automatic hiding, Lock, the app lock and leaving the view empty the clipboard if it still holds the backup, and leave anything copied since alone. When the browser does not let GhostPay check or clear the clipboard at the time (for example when the app locks itself while you are away), GhostPay leaves it unchanged, says so, and tries once more at your next click or key press in the page; you can also choose **Empty clipboard**, which removes whatever the clipboard holds. A delay chosen in Settings (30 or 60 seconds) adds a timed check. Clipboard history and synced copies may remain.
4. Share the `tsp1...` address, the `bitcoin:?sp=...` link or the QR code.
5. The keys stay in page memory. They are wiped when you press **Lock**, when the app locks, or when you leave the view.

## Seller: scan

Scanning needs an Esplora-compatible server URL that you supply. No public server is hard-coded.

- The app downloads each block's transactions and computes the tweak locally. Keys never leave the page.
- In full-block mode the server sees the block range and your network connection. Optional per-outpoint spent checks are off by default. Enabling **Also ask the server** reveals the queried output's transaction ID and output index to that server. Broadcasting separately reveals the transaction you send.
- A malicious server can hide payments, invent payments (see below) or lie about spent state. It cannot spend your funds.
- Each scanned block is checked locally: the header hashes to the served block hash, its proof of work meets the network limit, txids recomputed from the served transactions produce the header's Merkle root, and the witness data matches the coinbase witness commitment (BIP-141). Omitted, injected or edited transactions in a block are refused.
- Before scanning, the view loads and rechecks a header chain anchored to the pinned genesis block, then checks linkage, proof of work, difficulty rules, timestamps and versions. Among branches the server supplies, it keeps the one with the most cumulative work. Every scanned block must match this checked chain at its height, even when the requested scan starts later than genesis.
- This is header-chain validation, not full transaction/script validation. A server can hide a heavier chain or mine its own heavier fork cheaply on a test network. The previous-output scripts used for tweak derivation remain server-supplied. Local spent detection uses the consumed outpoints committed by the verified transaction IDs. A provider-query result remains that provider's report. Confirm a payment with a source you trust before relying on it. See the [exact scan disclosures](../../apps/web/src/features/btc/verification.ts).
- Each call scans at most 500 new blocks. Resuming can additionally revalidate up to 500 historical matched blocks; the UI reports the recovery page separately.

Run your own Esplora-compatible node if you can. See [Local scanner and RPC](../operators/local-scanner-and-rpc.md).

### Choosing a spent-check mode

| Mode | What is read | Spentness and disclosure |
| --- | --- | --- |
| Full Esplora scan | Headers and complete block transactions | Matches transaction inputs locally against this wallet's discovered outputs; no per-outpoint query by default. |
| Full scan with an independent oracle | The same complete blocks, plus oracle tweaks and outputs | Retains local detection; every scanned block's tweaks and outputs must agree with the oracle. |
| Light oracle scan | Oracle tweaks and outputs, plus proofs for matched transactions | Requires explicit provider-check consent before scanning. Proof requests reveal matching transaction IDs; spent checks reveal matching outpoints. No local block-input coverage is available. |

The **Also ask the server** setting is an authorization for the current scan configuration. Turning it off cancels
active optional checks and clears the prior result. A request already sent cannot be recalled. Selecting light mode
does not bypass consent; its required provider disclosure must be accepted before the scan starts.

### Understanding local, provider and unknown

**Local** means the available confirmed-block inputs cover each displayed output from discovery through the tip
captured for that scan. It does not prove the provider supplied the globally best chain and it does not see pending
mempool spends. A newer block can change the answer. After a header refresh extends the checked chain, refresh the
scan before selecting locally checked outputs again.

**Provider** means the explicitly authorized provider was asked about candidate outpoints. Its answer may include
mempool spends, but GhostPay cannot cryptographically prove that an output is unspent from that answer.

**Unknown** means the scan lacks enough input history or has not reached the observed tip. The UI keeps discoveries
visible and prevents selecting them for a sweep. It does not call them confirmed unspent. Continue scanning to the
tip, perform a fresh local scan from the wallet's birth height, or explicitly enable the provider check to refresh
the result.

### Saving progress and refreshing old history

**Save scan progress encrypted in this browser** stores Bitcoin-specific discovery and spent-block metadata, not
spend tweaks. Each completely processed block is committed before advancing the saved cursor. On reload, unlock
the same wallet, network and source configuration, enable continuity, and scan again. Historical matches must be
re-derived against checked headers; merely restoring the encrypted record does not make them spendable.

Older records have no evidence that every intervening block's inputs were tracked. They remain unknown after a
simple resume when that missing history matters. To refresh locally, forget the saved scan history, set the original
birth height and scan through the tip, continuing the bounded pages as needed. Alternatively, explicitly authorize
a provider check. That one check does not manufacture local historical coverage for future scans.

A reorganization removes spent determinations supported by orphaned blocks and rolls the cursor back to a known
common ancestor (or the birth height when the retained window cannot establish one). Canonical discoveries are
revalidated; displayed results with invalidated spending history become unknown until refreshed. Network, source,
mode and lock changes cancel the active scan and reject late results.

Local confirmed-block scanning does not detect all mempool spends. An output can therefore be unavailable when
broadcasting a sweep even after a complete local scan. The broadcast can be refused; a local status is not a
guarantee of spendability.

## Seller: sweep

1. Select the outputs to spend and enter a destination (a regular address or another `tsp1` address).
2. Enter a fee rate in sat/vB. The app has no fee oracle. Rates above 50 sat/vB or fees above 10 % of the amount show a warning.
3. Review the card: inputs, fee, amount and destination. The sign button stays disabled until you tick the confirmation box.
4. The app signs with the software key and checks every signature. It aborts if the fee or size differs from what you reviewed.
5. Broadcasting is a separate click.

The sweep uses BIP-125 signalling. The view has no fee-bump button or replacement workflow for a stuck, unconfirmed sweep.

## What is public

- Each payment creates an output on-chain. The payer can see the transaction they sent.
- Silent payments hide the link from the reusable address to the output, but the amounts, timing and spends remain visible.
- A sweep to a wallet you already use links that wallet to the funds. Use a fresh destination.

## Not in scope yet

- No relayer, no fee sponsorship and no GhostPay fee on this path.
- Hosted services that receive the scan key are absent. The optional BlindBit HTTP/HTTPS gRPC-Web modes keep keys local; deployed server/proxy compatibility needs separate acceptance.
- No fee estimator in the UI.
- Mainnet is disabled until the project's enablement checklist is complete and an independent audit exists.

## Testing

Use testnet4 or signet with coins from a faucet you verify. For a local test, run regtest with a Bitcoin Core node you compile or download yourself. The local regtest script in `scripts/regtest/` has not been run against a live `bitcoind` in this repository (see `docs/chains/bitcoin.md`).
