# Metadata exposure matrix

Companion to [PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md). Pre-audit, testnet only. Derived from code reading, not traffic capture. This is not an anonymity claim: it lists who can learn what.

## Legend

Cells: **L** learned (by design or inevitably), **C** conditional (see the note in the row), **N** not learned from this item (given the assumptions in the threat model), **-** not applicable.

Columns: **Node** = EVM RPC (including a configured second RPC), Esplora, Solana or Tron node. **Rly** = relayer operator. **Chain** = chain observer. **Host** = static host, CDN, reverse proxy. **Net** = ISP or local network. **Peer** = payer, invoice or receipt holder, another party. **Dev** = device thief or later local user.

Mitigation status: **IT** implemented and tested; **IU** implemented, untested; **LIB** library only, not wired into the app; **REC** recommended (see the threat model, section 9, `R#`); **OOS** out of scope (inherent or not addressable by the client).

Paths are relative to the repository root.

## A. Data items observed during use

| # | Data item | Node | Rly | Chain | Host | Net | Peer | Dev | Evidence | Mitigation status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Client IP and user agent | L | L (hashed only for rate limits) | N | L | C (destination host, SNI) | N | N | `apps/relayer/PRIVACY.md`; `apps/relayer/src/limiter.ts:43-73`; `deploy/nginx/nginx.conf:13,69` (`access_log off`; `proxy_set_header X-Forwarded-For`) | Relayer hashing and nginx `access_log off`: IT/IU. Tor/VPN: user action. `net-transport` profiles: LIB (R14) |
| 2 | That this device uses GhostPay (asset fetch) | N | N | N | L | L | N | C (history) | `apps/web/index.html:10`, `public/_headers`; fetch sites `lib/defaultServices.ts`, `lib/manifest.ts`, `lib/relayerClient.ts` | Self-host or onion: IU (`deploy/TOR.md` untested). Referrer policy: IT (scan-bundle) |
| 3 | Seller keys (viewing, spending) | N | N | N | N | N | N | C (only if passphrase falls) | Worker has no network API: `apps/web/scripts/scan-bundle.mjs:43`, `apps/web/src/lib/scanClient.ts:185`; keystore `lib/keyVault.ts:14-17` | IT |
| 4 | Scan start block, progress, scan timing | L | N | N | N | C (volume) | N | L (plaintext checkpoint) | `packages/chain-adapters/src/logs.ts:243`; `apps/web/src/lib/scanClient.ts:430-470` | Range padding: LIB (`packages/scan-source`, R15). Checkpoint encryption: REC (R8) |
| 5 | View tag, seller address or key in the log filter | N | N | N | N | N | N | N | Filter is `[Announcement, schemeId]` only: `logs.ts:243` | Implemented by construction at the cited line (not separately asserted by a test I verified); MH-SCAN-1 assertion LIB |
| 6 | Which announcements matched this seller (EVM) | L (per-match receipt and tx reads) | N | N | N | C (burst after match) | N | N | `packages/chain-adapters/src/payments.ts:257-258`; `scanClient.ts:278`; second RPC `payments.ts:125-130` | REC (R12); decoy batching LIB (`packages/hygiene` `batchedRead`) |
| 7 | One-time (stealth) address balance | C (only on Sweep open or opt-in `observeBalance`) | C (via permit reads or quote) | L (public) | N | N | L (payer knows it) | N | `payments.ts:80-87,102,169` (off by default); `apps/web/src/views/Sweep.tsx:55-70`; `lib/sweep.ts:75-79` | Default-off in scan: IT. Auto-read on Sweep open: REC (R1) |
| 8 | Link payer -> one-time address | N (not asked) | N | L (announcement and transfer) | N | N | L (payer) | C (payment records) | Router flow `THREAT_MODEL.md` 3.2; `lib/pay.ts` | OOS (inherent: public chain) |
| 9 | Link one-time address -> seller (before sweep) | C (match reads, row 6) | C | N from chain data alone | N | N | C (payer may know the seller by invoice) | C | Row 6; invoice flow `lib/invoiceCreate.ts` | IT for hiding it from chain readers; leaks via rows 6, 10, 11 |
| 10 | Sweep destination | L (direct sweep raw tx; relayed: via relayer's RPC) | L | L | N | N | L (anyone can follow) | N | `lib/sweep.ts:274-342`; `lib/relayerClient.ts:72-110`; `apps/relayer/PRIVACY.md` | Fresh destination: guidance only; reuse warning not implemented (`lib/sweep.ts:71` unused, R7). Self-derived fresh destination: LIB (`packages/hygiene`) |
| 11 | Link one-time address -> destination (sweep) | L | L | L | N | N | L | N | Sweep tx is public | OOS (inherent). Timing batching: guidance |
| 12 | Amount and token | C (in rows 6, 10) | L (quote and sweep) | L | N | N | L | C | `payments.ts:257`; `relayerClient.ts:72-110` | Amount noise/rounding: LIB (`packages/metadata-hardening` AMT-1/2) |
| 13 | Payer address | C (payer's own RPC reads: allowance, permit, estimateGas) | N | L | N | N | L | C | `apps/web/src/lib/payExec.ts:120-173`; `lib/pay.ts:206,216,321`; `lib/txGuard.ts:107` | OOS for chain; use own RPC |
| 14 | Registrant looked up in the registry | L | N | C (eth_call not on chain) | N | N | N | N | `apps/web/src/features/registry/RegistryView.tsx:210`; `packages/chain-adapters/src/registry.ts:113-160` (`buildLookupCall`, `lookupMetaAddress`) | REC (R2); payers who get the meta-address from an invoice make no registry call |
| 15 | Meta-address published in the registry | L (anyone can read) | L | L (permanent) | N | N | L | N | `apps/web/src/lib/registry.ts:8-9`; `views/SellerKeys.tsx:318` | UI warning: IT; history permanence: OOS |
| 16 | Seller's stable identifiers across invoices (meta-address, signer key) | N | N | N | N | N | L (any invoice or receipt holder) | C | `apps/web/src/lib/receipts.ts:11-22`; `views/CreateInvoice.tsx:32,198` | Per-invoice keys: LIB (metadata-hardening ID-1/ID-2, R10) |
| 17 | Invoice contents | N | N | N | N (fragment not sent) | N | L (bearer link) | C (browser history) | `lib/fragment.ts`; `App.tsx:68-86` | Fragment auto-clear: IT. Encrypt by default: REC (R10) |
| 18 | Gas-funding transfer into a one-time address | L (if via its RPC) | L (relayer path avoids it) | L | N | N | L (if payer-funded buffer) | N | `lib/pay.ts:217-238`; `lib/sweep.ts:296-300` | Relayed sweep avoids funding: IT; buffer is public: OOS. Funding guard: LIB (`packages/hygiene` `fundingGuard`) |
| 19 | Bitcoin: scanned block heights and block contents | L | N | N | N | C | N | N | `apps/web/src/features/btc/esplora.ts:225-235`; `btc/BtcView.tsx:187-188` | Disclosure in UI: IT. Own Esplora: user action |
| 20 | Bitcoin: which outputs are yours (outspend query per match) | L | N | C | N | C | N | N | `btc/esplora.ts:245-250`; `btc/scan.ts:83` | REC (R13) |
| 21 | Solana: which stealth addresses are yours (getBalance per match) | L | N | C | N | C | N | N | `apps/web/src/features/solana/scan.ts:76`; `solana/sweep.ts:81`; PoC only | REC (R13); global memo-program paging does not name the seller: `packages/solana-stealth/src/scan.ts:70` |
| 22 | Tron: matched address and funding tx memo reads | L | N | C | N | C | N | N | `apps/web/src/features/tron/scan.ts:70,81`; `tron/rpc.ts:43,69`; PoC only | REC (R13) |
| 23 | Relayer request timing and quote-to-sweep join | N | L | L (sweep tx) | N | C | N | N | `lib/relayerClient.ts:72-110`; `apps/relayer/PRIVACY.md` | Padding/jitter/pinning: LIB (metadata-hardening REL-2/3/4, R11) |
| 24 | RPC and relayer URLs in use | N | N | N | N | N | N | L (plaintext) | `apps/web/src/lib/settings.ts:30-45,141` | REC (R4); encrypted settings not implemented |
| 25 | Tags, labels, notes, verified-payment records | N | N | N | N | N | N | C (count, chain, timing visible; content encrypted) | `lib/tags.ts:5-20,259`; `lib/idbStore.ts:8-33`; `lib/reconciliationVault.ts:79,531` | IT (encryption); metadata: OOS |
| 26 | Wallet-attempt journal (account, tx hash) | N | N | N | N | N | N | C (tab-scoped plaintext) | `lib/duplicateAttemptJournal.ts:26-35` | Cleared with the tab: IU |
| 27 | Error messages and crash reports | N | N | N | N | N | N | N | No telemetry or reporting endpoint: grep of `apps/web/src`, `apps/relayer/src`, `packages/cli/src` | IT (`apps/web/src/privacyInvariants.test.ts`, `apps/web/scripts/scan-bundle.mjs`) |
| 28 | Relayer logs (addresses, amounts, IPs) | N | N (by construction) | N | N | N | N | N | `apps/relayer/src/log.ts:8-16,40-55` | IT (field-list test in `privacyInvariants.test.ts`; log scan in `apps/relayer/src/api.test.ts`) |
| 29 | Registry/relayer requests carry cookies or referrer | N | N | N | N | N | N | N | `lib/relayerClient.ts` sets `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`; default RPC transport omits both (`packages/chain-adapters/src/rpc.ts:99-105`) | Relayer client: IT. RPC transport: REC (R3), page-level `no-referrer` covers it |
| 30 | CLI activity | N | N | N | N | N | N | C (output files, mode 0600) | `packages/cli/src/run.ts:38`; `src/node-io.ts:21-22` | IT (CLI is offline; no network code) |

## B. Mitigation inventory (what exists vs what is wired)

| Mitigation | Rows it addresses | Status | Wired into app |
|---|---|---|---|
| No telemetry, no remote origins, tight CSP option, no-referrer | 2, 27, 29 | IT | Yes |
| Network-free scanning worker | 3, 5 | IT | Yes |
| Encrypted keystore, tag vault, reconciliation vault | 3, 25 | IT | Yes |
| Fragment auto-clear | 17 | IT | Yes |
| Relayer log allowlist, hashed rate keys | 1, 28 | IT | Yes (relayer) |
| Onion service for web bundle | 2 | IU (untested per `deploy/TOR.md`) | Deploy profile |
| `net-transport` (Tor SOCKS, onion, I2P, Nym, OHTTP) | 1 | LIB; real networks unverified | No |
| `hygiene` (fresh destination, decoy-batched reads, address-free verification, buffer rounding) | 6, 7, 10, 18 | LIB | No |
| `scan-source` / `pir-two-server` | 4, 6 | LIB; research PoC | No |
| `metadata-hardening` | 12, 16, 23 | LIB | No |
| `privacy-profiles` (preset rules; stress-tested, `docs/audits/12-privacy-profiles-qa.md`) | settings policy | LIB | No |
| Decoy queries in a shipped flow | 6, 7 | **Not implemented** | No |
| Destination-reuse detection | 10 | **Not implemented** | No |

## C. How to keep this current

`apps/web/src/privacyInvariants.test.ts` fails if a telemetry identifier, third-party origin literal, extra reference to the global `fetch` (AST check: bare, aliased, `window`/`globalThis`/`self.fetch`; an endpoint or `fetch` reached only through runtime-built property names is not detected), analytics package or relayer log field is added. If it fails, review rows 1, 2, 27, 28 and 29 before editing the test. A new RPC method on a scan, sweep or pay path should add or change a row here.
