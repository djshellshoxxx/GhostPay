# Bitcoin (BIP-352 silent payments)

Researched 2026-10-21. Code: `packages/btc-silent-payments` (engine), `apps/web/src/features/btc` (UI), `scripts/regtest` (local node). Proof of concept, unaudited, **mainnet disabled** (`BTC_NETWORKS` in `features/btc/network.ts`).

| Network | id | silent payment HRP | regular HRP | enabled |
|---|---|---|---|---|
| testnet4 | `testnet4` | `tsp` | `tb` | true |
| signet | `signet` | `tsp` | `tb` | true |
| regtest (local) | `regtest` | `tsp` | `bcrt` | true |
| mainnet | `mainnet` | `sp` | `bc` | **false** |

Genesis hashes (used to refuse a server on the wrong network; mainnet's is always refused) were read from Bitcoin Core `src/kernel/chainparams.cpp` on master, retrieved 2026-10-21 via raw.githubusercontent.com: testnet4 `00000000da84f2ba...a8bf043`, signet `00000008819873e9...bee1ef6`, regtest `0f9188f13cb7b2c7...6e2206`, mainnet `000000000019d668...a8ce26f` (full values in `network.ts`).

## How the web feature works

1. **Wallet**: random 32-byte seed -> BIP-32 paths `m/352'/1'/0'/{1',0'}/0` (`silentPaymentKeysFromSeed`, coin type 1 on every test network). The seed is never stored and stays hidden until "Show backup seed"; it hides again after 60 s or as soon as the tab is hidden, and copying it takes a second click after a clipboard warning ("Hide seed" and "Lock" empty the clipboard again, best effort; a clear the browser refuses, as on the idle app lock, is retried at the next click or key press in the page). Keys live in React state and are dropped on "Lock" or when you leave the view.
2. **Receive**: `tsp1...` address, `bitcoin:?sp=<addr>[&amount=<btc>]` link and QR, with payer instructions.
3. **Scan**: needs an Esplora-compatible server URL (user supplied; no public server is hard-coded because none could be verified from the build environment). `EsploraTweakSource` downloads each block's transactions (`/block/:hash/txs/:start`, 25 per page), computes the BIP-352 tweak `input_hash*A` locally and feeds the package scanner. The server sees block heights, outpoint spend checks (`/tx/:txid/outspend/:vout`) and anything you broadcast; it never sees keys. Consecutive scanned blocks must link by previous-block hash, but that links them only within the scan: the range is anchored to the pinned genesis only when the scan starts at block 0 or 1, and to no checkpoint, so a malicious server can invent a payment with a block it mined itself (cheap on test networks). It can also hide payments (denial of service) or lie about spent state, but cannot spend funds. At most 500 blocks per run. Heavy compared with a BlindBit oracle (tweak index, `BlindBitClient` exists in the package but is not wired in the UI yet: its HTTP routes are marked deprecated upstream).
4. **Sweep**: select outputs, enter destination (regular or `tsp1`) and a fee rate. `previewSweep` computes fee/vsize/amount without touching keys, the review card shows inputs, fee, amount and destination, and the sign button stays disabled until the user ticks the confirmation box. `signSweep` signs with the software key (BIP-341 key path), verifies every signature, and aborts if fee or size differ from what was reviewed. Broadcast is a separate explicit click.

## Fees, dust, RBF

- **Fee = ceil(rate x vsize)**. The package computes the exact vsize: about 10.5 vB fixed + 57.5 vB per P2TR key-path input + 31 vB per P2WPKH output / 43 vB per P2TR output. A one-input sweep to a `tsp1` or P2TR destination is about 111 vB.
- The app has **no fee oracle**; the user types sat/vB (the Esplora `/fee-estimates` call exists in the client but is not shown yet). Rates above 50 sat/vB, or a fee above 10% of the swept amount, show a warning. The package refuses rates above 10 000 sat/vB and fees above half the input when over 10 000 sats.
- **Dust**: package default 546 sats (the conservative P2PKH figure) for any output; a sweep whose net amount is below it is refused. Real policy dust thresholds depend on output type and the node's `dustrelayfee` (UNVERIFIED here: check the node version's docs). Sweeps have no change output; the "no change" shortcut avoids dust change.
- **Minimum relay fee**: default `minrelaytxfee` has changed between Bitcoin Core versions (historically 1 sat/vB, lowered in newer releases). UNVERIFIED for the version you run; on testnet4/signet check your node. Regtest here uses `-fallbackfee=0.0002`.
- **RBF**: all sweeps signal BIP-125 (`nSequence` 0xfffffffd). Newer Bitcoin Core versions default to full-RBF regardless of signalling (UNVERIFIED which version; check release notes). There is **no fee-bump UI yet**. To replace a stuck sweep, re-scan, select the same inputs and sweep with a higher fee rate: because the same inputs and recipient give the same derivation, the output key is unchanged and only the amount differs. Replacement with different inputs changes silent-payment output keys, so the transaction must be rebuilt (never edit bytes).
- A sweep to a silent payment address derives the output from the spent inputs; the exact output key is therefore not known until signing and is not shown in the review.

## Regtest

See `scripts/regtest/README.md`. The bitcoind image could not be downloaded in the build environment (bitcoincore.org is blocked and Core releases are not on GitHub), so the compose file takes a version and SHA-256 from you. Automated tests use an in-memory mock Esplora with real BIP-352 fixtures; `scripts/regtest/e2e.mjs` has been syntax-checked and its sender transaction logic verified offline, but not run against a live bitcoind.

## Open items

- BlindBit/Frigate source in the UI, label support in the UI, payment link import.
- CPFP/RBF fee-bump flow, fee estimates in the UI.
- Hardware signing (out of scope for the engine), PSBT export.
- Verify dust/min-relay/full-RBF defaults against the Core version used for testnet4.
