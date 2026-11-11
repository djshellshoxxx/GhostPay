# GhostPay privacy and metadata-leakage threat model

Status: **pre-audit, nothing deployed, testnet only.** This is a design-level analysis written from the code as it stands, with `file:line` citations. It is not a test result, not an audit and not a guarantee. It complements the security-oriented [THREAT_MODEL.md](THREAT_MODEL.md) (keys, funds, release integrity) and is paired with the per-datum [metadata exposure matrix](metadata-exposure-matrix.md). The plain-language version for users is [docs/user/privacy-limits.md](../user/privacy-limits.md).

**GhostPay does not make payments anonymous.** It reduces one thing: a seller's receiving address is not reused or published, so a stranger cannot read "who is paid" off an invoice. Payer address, token, amounts, time and use of the GhostPay router are public on-chain, and several services you must trust (RPC, relayer, host) see more than the chain does. Where this document says "hidden" it means hidden from the named adversary under the named assumptions, nothing more.

Conventions: paths are relative to the repository root. "Verified in code" means the call was read at the cited line; no network traffic was captured. Mitigation status vocabulary: **implemented+tested**, **implemented, untested**, **library only (not wired into the app)**, **recommended**, **out of scope**.

## 1. Method and scope

Traced from source (not from documentation): `apps/web/src` (scan, pay, sweep, registry, Bitcoin, Solana, Tron views), `packages/chain-adapters/src` (RPC, logs, payment verification, registry), `packages/solana-stealth`, `apps/relayer/src`, `packages/cli`, `deploy/`, and `apps/web/scripts/scan-bundle.mjs`. Existing documents were read only to find claims to check: `docs/audits/17-final-security-snapshot.md`, `docs/audits/12-privacy-profiles-qa.md`, `apps/relayer/PRIVACY.md`, `deploy/TOR.md`, and the READMEs of `packages/privacy-profiles`, `metadata-hardening`, `net-transport`, `hygiene`, `scan-source`, `pir-two-server`.

Out of scope: contract-level privacy (router, pools, payer-hiding contracts; none deployed), wallet-extension internals, legal analysis, and anything about mainnet (disabled in `packages/chain-adapters/src/config/chains.ts`).

### 1.1 The most important finding about mitigations

The privacy packages `net-transport` (Tor/SOCKS/OHTTP profiles), `privacy-profiles`, `hygiene` (fresh destinations, decoy-batched reads, address-free verification), `metadata-hardening`, `scan-source` (range padding, PIR) and `pir-two-server` are **not imported by `apps/web`, `apps/relayer` or `packages/cli`** (a search of those sources and `package.json` files for `@ghostpay/<name>` finds no importer; only `qr-exchange` and `relayer-guard` are wired). `packages/metadata-hardening/README.md` and `packages/hygiene/README.md` say the same. Their READMEs describe behavior of the libraries, not of the shipped app. Where this document lists Tor profiles, decoy queries or PIR as mitigations, they are **library only** and give a user of the web app **no protection today**.

## 2. Assets

| # | Asset | Why it matters |
|---|---|---|
| A1 | Payer-to-payee link (this payer paid this seller) | The core thing a stealth address is supposed to make non-obvious |
| A2 | Payee identity and cluster (which addresses are one seller's) | Meta-address, invoice signer key, sweep destinations, gas funders |
| A3 | Amounts and token | Public on-chain for EVM; reveals revenue and customer size |
| A4 | Balances and holdings of one-time and destination addresses | Public once the address is known; the question is who can learn *which* addresses are yours |
| A5 | Payment timing and activity pattern | When a seller scans, sweeps and is paid; online hours; location via IP |
| A6 | Network identity of the user (IP, user agent) | Links all of the above to a person |
| A7 | Local history (tags, notes, invoice links, checkpoints, settings) | What a device thief or a later browser user can read |
| A8 | Viewing key | Reveals all of a seller's incoming payments; treated as a privacy asset, not only a key-security one |

## 3. Adversaries

| Id | Adversary | Capability assumed |
|---|---|---|
| ADV-RPC | EVM RPC provider (and a configured second RPC), Esplora server, Solana or Tron node | Sees every request the app sends it, with IP and timing; may log; may lie (integrity is a separate model) |
| ADV-RLY | Relayer operator | Sees every request to the relayer, plus the relayer's own RPC provider sees its simulations and broadcasts |
| ADV-CHAIN | Chain observer / analyst | Reads all public chain data forever; can run clustering heuristics; passive |
| ADV-HOST | Static host, CDN, reverse proxy, onion-service operator | Sees who fetches the app files and when; can serve modified code (integrity model) |
| ADV-NET | Network observer (ISP, Wi-Fi operator, employer) | Sees destination hosts, SNI, volume and timing of connections; not TLS content |
| ADV-PEER | Other payment participants | The payer (knows the one-time address and tx), a holder of an invoice link, anyone holding two of a seller's invoices, a receipt recipient |
| ADV-DEV | Device thief or later local user | Can read browser storage and history of the origin; cannot read what is encrypted without the passphrase |

A global passive adversary that watches both the user's network and the chain (and can correlate timing) defeats most mitigations below. Nothing here is designed to resist it.

## 4. Assumptions

1. The browser, OS, wallet extension and the served JavaScript are not compromised. A compromised page defeats everything, and `connect-src 'self' https: wss:` (`apps/web/index.html:13`, `apps/web/public/_headers:4`) does not restrict where it can send data unless the host sets `GHOSTPAY_CONNECT_ORIGINS` (`apps/web/scripts/csp.mjs:1-6`).
2. The user chooses their own RPC provider. The app ships **no default RPC** (`rpcUrls` defaults to `{}` at `apps/web/src/lib/settings.ts:19`; a scan with none configured stops with "Configure an RPC", `apps/web/src/views/Scan.tsx:111-115`). Whoever the user pastes is trusted with everything in section 5.2.
3. There is no GhostPay server. The only first-party service is the optional relayer, and no relayer is operated by the project today.
4. The app is testnet only; no deployment manifest ships.

## 5. What each component does on the network (verified in code)

### 5.1 No telemetry

Searches of `apps/web/src`, `apps/web/index.html`, `apps/web/public`, `apps/relayer/src` and `packages/cli/src` for Sentry, PostHog, gtag, Google Analytics, Mixpanel, Amplitude, Segment, Plausible, Datadog, `sendBeacon`, `new Image()` pings and fixed third-party origins find none in production code. The only URL literals are the SVG namespace in `apps/web/src/lib/qr.ts` and the dummy `http://relayer.invalid` parse base in `apps/relayer/src/server.ts`. The CLI describes itself as offline (`packages/cli/src/run.ts:38`; it has no network calls). Error text is generated locally; there is no error-reporting endpoint.

Enforced by tests: `apps/web/scripts/scan-bundle.mjs` already scans the built bundle for unexpected origin literals against an allowlist of inert strings (`ALLOWED_URLS`, line 13), source maps, dynamic code, remote scripts/styles/fonts, and network APIs inside the scanner worker (`WORKER_FORBIDDEN`, line 43), and is unit-tested in `apps/web/src/scanBundle.test.ts`. It does **not** ban telemetry SDK names, `sendBeacon` outside the worker, or a runtime-built URL. `apps/web/src/privacyInvariants.test.ts` (added with this document) pins those gaps at the source level: no telemetry or beacon identifiers, no third-party origin literals, the global `fetch` (bare, aliased, or via `window`/`globalThis`/`self`, found with the TypeScript AST) referenced only in three audited files, no analytics packages in `package.json`, relayer requests sent without credentials or referrer, the relayer log schema is a closed allowlist. It does not replace the bundle scan and does not detect an endpoint assembled at runtime.

### 5.2 EVM scan (seller)

| Step | Call | Evidence | Leaks to ADV-RPC |
|---|---|---|---|
| Head, block hashes | `eth_blockNumber`, `eth_getBlockByNumber` | `packages/chain-adapters/src/logs.ts:201-309`, `rpc.ts:287-290` | That this IP is scanning, and the block ranges |
| Announcements | `eth_getLogs` on the announcer, topics `[Announcement, schemeId]` only, windows up to `getLogsMaxRange` (1000) | `logs.ts:243`; `chains.ts:33-40` | Scan start block and progress. **No view tag, address or key is in the filter**; matching is local in a worker with no network API (`apps/web/src/lib/scanClient.ts:185`, `scripts/scan-bundle.mjs:43`) |
| Per matched router announcement | `eth_getTransactionReceipt` and `eth_getTransactionByHash` for the announcement's tx hash; `eth_blockNumber`; `eth_getBlockByNumber` twice | `packages/chain-adapters/src/payments.ts:182-206, 257-258`; called from `scanClient.ts:278` | **The exact transactions that paid this seller.** The provider can tell which announcements matched the viewing key, hence which stealth addresses and which payer txs are this seller's. Anyone can fetch any tx, so the *volume* of matches is the signal |
| Per-address balance | `eth_getBalance` / `balanceOf` via `eth_call` on the stealth address | `payments.ts:80-87`, gated by `observeBalance` (`payments.ts:102, 169`); `scanClient.ts:278` does not pass it | **Not issued by default.** Documented as disabled because it reveals the match |
| Second provider | The same page of logs, blocks, receipts and transactions | `scanClient.ts:204, 301`; `payments.ts:125-130` (secondary verify) | ADV-RPC for the second provider learns the same match set. A second RPC doubles exposure, it does not split it |
| Tx-hash "did this pay me" helper | `eth_getTransactionReceipt` for a user-typed hash | `payments.ts:329` | That tx hash |

Discrepancy with documentation: `docs/audits/17-final-security-snapshot.md` (PRIVACY-E2E-02) says ERC-20 queries "filter by the exact stealth recipient". The current code does not issue a `Transfer` `getLogs` by recipient; it reads the transaction receipt (`payments.ts:257`) and matches the Transfer log inside it. The privacy consequence (provider learns which transactions matched) is the same; the audit wording is stale.

### 5.3 EVM sweep (seller)

| Step | Call | Evidence | Learned by |
|---|---|---|---|
| Open Sweep for a match | `eth_getBalance` or `balanceOf` of the one-time address, **automatically when the match is selected** | `apps/web/src/views/Sweep.tsx:55-70`, `apps/web/src/lib/sweep.ts:75-79` | ADV-RPC: this IP owns/controls that one-time address |
| Direct sweep | `eth_gasPrice`, `eth_getTransactionCount(owner,'pending')`, `eth_getBalance(owner)`, `eth_estimateGas{from: owner}`, `eth_call` dry run, `eth_sendRawTransaction` | `apps/web/src/lib/sweep.ts:274-342` | ADV-RPC: owner, destination (in the raw tx), amount, IP, time |
| Relayed sweep | `POST /v1/quote` with chain, token, **owner, destination, amount**; `POST /v1/sweep` with the signed order, EIP-712 signature, optional permit, quote token | `apps/web/src/lib/relayerClient.ts:72-110`, `apps/web/src/views/Sweep.tsx:143, 157`; relayer side `apps/relayer/PRIVACY.md` | ADV-RLY: stealth address, destination, token, amount, fee, IP (hashed for rate limiting), timing; quote and sweep carry the same tuple so they are trivially joined. Permit reads (`nonces`, `name`) go to the user's RPC with the owner address (`apps/web/src/lib/pay.ts:321-335`) |
| Relayer's own RPC | Simulation `eth_call` containing the full sweep, then the signed tx | `apps/relayer/PRIVACY.md` ("What other parties see"), `apps/relayer/src/chain.ts:141-155` | The relayer operator's RPC provider |

The destination-reuse warning is **not implemented**: `describeDestination` (`apps/web/src/lib/sweep.ts:71`) is imported by no view; the Sweep page shows static text only (`Sweep.tsx:202`). `docs/audits/17-final-security-snapshot.md` records the same.

### 5.4 EVM pay (payer)

The payer's RPC (the app's, not the wallet's) sees the payer address through `allowance` and permit reads (`apps/web/src/lib/payExec.ts:120, 138, 154, 173`), `eth_gasPrice` and `eth_estimateGas{from: payer}` (`apps/web/src/lib/pay.ts:206, 216, 235`) and the `eth_call` simulation (`apps/web/src/lib/txGuard.ts:107`). The transaction itself is sent by the wallet extension through the wallet's own provider, which the app cannot see or control. The optional random delay is local scheduling (`apps/web/src/lib/jitter.ts`, `Pay.tsx:490-491`): nothing is queued or sent while waiting, no cover traffic is created.

### 5.5 Registry (EIP-6538)

Lookup issues `eth_call stealthMetaAddressOf(registrant, 1)` via `lookupMetaAddress` (`apps/web/src/features/registry/RegistryView.tsx:210`; lookup in `buildLookupCall`/`lookupMetaAddress`, `packages/chain-adapters/src/registry.ts:113-160`). ADV-RPC learns **which registrant address the payer is looking up**, that is, who is about to be paid. Publishing (`registerKeys`) writes the meta-address permanently under the publisher's wallet address; clearing writes empty bytes but history stays on-chain (`apps/web/src/lib/registry.ts:8-9`). The UI warns about the link (`apps/web/src/views/SellerKeys.tsx:318`).

### 5.6 Bitcoin silent payments (testnet only)

The Esplora server sees: tip height; for every scanned height the block hash, **all transactions of the block** (`apps/web/src/features/btc/esplora.ts:225-235`), the header; for each detected output `GET /tx/<txid>/outspend/<vout>` (`esplora.ts:245-250`, called per match at `apps/web/src/features/btc/scan.ts:83`); fee estimates; and the broadcast raw transaction (`esplora.ts:261-263`). The match is revealed by the outspend query even though scanning itself is local. The UI discloses this (`BtcView.tsx:187-188`). No default server ships (`network.ts` only has a URL hint).

### 5.7 Solana and Tron (web feature views)

Solana: pages `getSignaturesForAddress` on the **global memo program** (`packages/solana-stealth/src/scan.ts:70`, `rpc.ts:164`) and `getTransaction` for each signature (`rpc.ts:233`) (the code itself notes this is O(all memos)); then `getBalance(stealthAddress)` for every match (`apps/web/src/features/solana/scan.ts:76`), repeated at sweep (`solana/sweep.ts:81`). The node learns every match. Tron: `getaccount` for every native match (`apps/web/src/features/tron/scan.ts:70`, `tron/rpc.ts:43`) and `gettransactionbyid` for its memo (`scan.ts:81`, `rpc.ts:69`). Both are described as proofs of concept.

### 5.8 Local storage (A7)

| Store | Content | Protection | Evidence |
|---|---|---|---|
| `localStorage` `ghostpay.settings.v1` | RPC URLs (primary, secondary), relayer URL, delay range, pinned signers, theme | **Plaintext.** A provider API key in an RPC URL path (the URL check rejects `user:pass@` but not path keys) is stored in the clear | `apps/web/src/lib/settings.ts:30-45, 141` |
| `localStorage` `ghostpay.scan.checkpoint.v2.<chainId>.<keyId>` | Next block, last block number and hash. `keyId = sha256(spendingPub|viewingPub)` | **Plaintext.** Reveals which chains were scanned and how far. Anyone who knows a seller's public meta-address can compute `keyId` and test whether this browser scans for it | `apps/web/src/lib/scanClient.ts:19-31, 430-470` |
| IndexedDB `ghostpay-tags` | Client labels, invoice labels, notes, matched payment data | AES-256-GCM, key from HKDF of the viewing key; per-record AAD binds chain, record id and lookup token. Record count, chain ids, record ids, HMAC lookup tokens and write timing are visible | `apps/web/src/lib/tags.ts:5-20, 108-118, 259`; `apps/web/src/lib/idbStore.ts:8-33` |
| IndexedDB `ghostpay-encrypted-seller-vault` | Encrypted keystore | Passphrase-based encryption | `apps/web/src/lib/keyVault.ts:14-17` |
| IndexedDB `ghostpay-reconciliation-encrypted` | Verified-payment records (stealth address, tx hash, amount) | Encrypted; scope `sellerKeyId:chainId` is plaintext | `apps/web/src/lib/reconciliationVault.ts:79, 531` |
| `sessionStorage` wallet-attempt journal | Account, chain, kind, tx hash of wallet attempts | Plaintext, per tab, cleared on tab close | `apps/web/src/lib/duplicateAttemptJournal.ts:26-35` |
| `localStorage` locale | Language code | Plaintext | `apps/web/src/i18n/storage.ts:3` |
| Browser history | Full invoice link including the `#gpi=` fragment | Outside the app. Fragment is stripped from the address bar by default after reading (`apps/web/src/App.tsx:68-86`), but the history database may already hold it | `apps/web/src/lib/fragment.ts` |

### 5.9 Invoice links, QR codes and receipts

The invoice is a bearer link carried in the URL fragment, which is not sent to the host (`THREAT_MODEL.md` section 3.1). QR codes are generated locally (`apps/web/src/lib/qr.ts:9`) and `packages/qr-exchange` is documented offline (its camera/jsQR path is bundled, not fetched). Invoice encryption is **opt-in** (`apps/web/src/views/CreateInvoice.tsx:32`) and the key is inside the same link, so it only hides content from casual viewers (`CreateInvoice.tsx:198`). A signed receipt contains the invoice digest, chain, tx hash, **one-time address**, asset, amount and the seller's signer public key (`apps/web/src/lib/receipts.ts:11-22`): whoever holds it can link payer-side facts to the signer key. The embed script opens the app in a `noopener,noreferrer` popup (`apps/web/public/ghostpay-embed-v1.js:55`), so the merchant page learns nothing back.

### 5.10 Hosting

`apps/web/index.html:10` sets `Referrer-Policy: no-referrer` via meta and `public/_headers` repeats it, so app navigation and RPC requests carry no referrer. The default RPC transport sets `redirect: 'error'` but not `credentials` or `referrerPolicy` (`packages/chain-adapters/src/rpc.ts:99-105`); cookies are not sent cross-origin by default and the page-level policy covers the referrer, so this is defense in depth only. The reference nginx has `access_log off` (`deploy/nginx/nginx.conf:13`) and passes the client IP to the relayer as `X-Forwarded-For` (`proxy_set_header X-Forwarded-For` in `location /api/`, `deploy/nginx/nginx.conf:69`). A CDN or other host in front keeps its own logs.

### 5.11 Relayer retention (from code, to be compared with `apps/relayer/PRIVACY.md`)

The log line is a closed schema `requestId, route, status, chainId, txHash, errorClass` with each value re-validated (`apps/relayer/src/log.ts:8-16, 40-55`); the new invariant test pins the field list. Rate-limit keys are `HMAC-SHA256(random in-memory salt, IP)` truncated to 128 bits, dropped on salt rotation (`apps/relayer/src/limiter.ts:43-88`). Raw IP exists in memory for the request. The relayer cannot be made to forget what it saw during a request, and an operator who modifies the code or runs a logging proxy is outside these properties.

## 6. What each adversary learns, and what limits it

### ADV-RPC (RPC provider, second RPC, Esplora, Solana/Tron node)

**Learns**: IP; scan start and progress; **the transactions that matched the seller's key (EVM per-match receipt reads, Esplora outspend per output, Solana/Tron balance reads)**; stealth addresses when Sweep opens (auto balance read); owner, destination, amount of a direct sweep; payer address and allowance/permit reads on pay; which registrant a payer looks up; every broadcast tx. A scan produces a bounded burst of requests whose size and timing correlate with payments received.
**Does not learn**: the viewing or spending key (verified: the worker gets the viewing key by message, never a network API; `scanClient.ts:185-190`, scan-bundle `WORKER_FORBIDDEN`), invoice contents (not sent), the view tag or any address in the log filter.
**Mitigations today**: run your own node (the web app accepts only `https://`/`wss://` URLs, `rpc.ts:75-90` via `settings.ts:34-41`, so a local node needs TLS in front); use Tor Browser (all page traffic, including RPC, is then Tor-routed; the exit sees the host; a clearnet provider still sees the request content); use different RPCs for scan and sweep. **Limits**: a self-hosted node that other people do not use makes *you* the only client, so a network observer of the node's peers can still correlate. `net-transport` profiles and `hygiene.batchedRead` (k=7 decoys) exist but are **library only**. The second-RPC cross-check is an integrity feature and increases leakage.

### ADV-RLY (relayer operator)

**Learns**: stealth address, destination, token, amount, fee, timing, IP (and the hashed bucket), and can censor, delay, or log if modified. Quote and sweep requests are separable only by timing, and carry the same tuple.
**Does not learn**: keys; it cannot change destination, amount or fee (enforced by the on-chain signature).
**Mitigations today**: run your own relayer or sweep directly; for the relayer's retention see `apps/relayer/PRIVACY.md` (self-attested; no external audit). **Limits**: nothing in the client hides the tuple from the relayer; request padding, submit jitter and relayer pinning are specified in `metadata-hardening` (REL-2/3/4) but not wired. Direct sweep exposes the same tuple to the RPC instead and needs gas in the one-time address, which creates a gas-funding link.

### ADV-CHAIN (chain observer)

**Learns, permanently**: payer address, token, gross and net amounts, fee flow, that the router was used, timing, the announcement (stealth address, ephemeral key, view tag, metadata), the sweep `stealth -> destination` with amount, any gas-funding transfer into the one-time address, and registry publications.
**Does not learn (from chain data alone)**: which seller owns an announcement's stealth address, until a sweep, gas funding, address reuse or timing/amount correlation links it.
**Mitigations today**: fresh destination per sweep (guidance only; the app does not check, section 5.3); batch sweeps; avoid gas funding from a known wallet; no consolidation (BTC outputs start unchecked, `apps/web/src/features/btc/BtcView.tsx`; EVM sweeps are per match). **Limits**: see section 7.

### ADV-HOST (static host, CDN, onion operator)

**Learns**: IP, user agent, which assets were fetched, timing, i.e. that a person opened GhostPay at a time. Not the fragment, keys, RPC traffic, or invoice contents (the app makes no calls back to the host except same-origin asset loads; verified by `privacyInvariants.test.ts`: the global `fetch` is referenced only in `defaultServices.ts`, `manifest.ts`, `relayerClient.ts`, and the manifest is bundled, not fetched: `apps/web/src/lib/defaultServices.ts:25-30, 38`).
**Can also**: serve modified code, which defeats every property here (integrity model in `THREAT_MODEL.md`, `deploy/BUILD-WEB.md`).
**Mitigations today**: self-host; Tor onion service (`deploy/TOR.md`, compose profile `onion`): hides the visitor's IP from the host and the host's location from the visitor. **Limits**: `deploy/TOR.md` itself states image build, bootstrap and reachability are **untested**; the onion origin is plain `http:` and the CSP `connect-src 'self' https: wss:` blocks plain-http RPC URLs, so RPC calls from an onion-loaded page still go to an https endpoint of the user's choosing and are not hidden by the onion.

### ADV-NET (ISP, local network)

**Learns**: that the device connects to the app host, to the RPC provider's host (SNI), to the relayer's host, at what times and in what volumes, which fingerprints scan bursts and sweep requests. Content is TLS-protected.
**Mitigations today**: Tor Browser or a VPN for all traffic (user action, not verifiable by the page). **Limits**: moves trust to the VPN or exit; does not hide content from the destination; per-request circuit isolation is not available to a web page.

### ADV-PEER (payer, invoice holders, receipt holders, other sellers' payers)

- **The payer** knows the one-time address and the payment tx, so they can follow the funds to the sweep destination. This cannot be fixed by the client; the only defense is a fresh destination and not consolidating with funds you want unlinked.
- **Holder of an invoice link** reads the whole invoice and the seller's meta-address and signer public key. **Anyone holding two invoices** from one seller can link them (stable meta-address; the invoice signer key is also stable unless per-invoice keys are used, `metadata-hardening` ID-1/ID-2, not wired).
- **Receipt holder** (section 5.9) can show payer, one-time address, amount and signer key.
- **Mitigations today**: share invoices over a channel you trust; passphrase-protected invoices; per-client meta-addresses are a design idea only (`docs/specs/ideas/03-per-client-meta-addresses.md`).

### ADV-DEV (device thief or later local user)

**Learns without any passphrase** (plaintext): RPC and relayer URLs (and any key embedded in an RPC path), pinned signer keys, which chains were scanned and how far, tab-scoped wallet-attempt entries, locale, and possibly the full invoice link from browser history. **Learns from metadata even with encrypted stores**: that a seller vault, a tag vault and a reconciliation vault exist, how many records, on which chains, when they changed. **Does not learn** (if the passphrase holds): keystore contents, tags, notes, verified-payment records.
**Mitigations today**: private browser window; clear site data; keystore passphrase; auto-lock timeout. **Limits**: a live compromised session can read decrypted state.

## 7. What GhostPay does NOT protect

- **Timing correlation.** A payment at block N and a sweep at N+k are linked by timing; the optional pay-side delay (`jitter.ts`) is local scheduling friction, no cover transactions exist, and a delay chosen by the payer does not delay the seller's sweep.
- **Amount correlation.** Net amounts are public, and an exact amount that appears at the destination links it to the payment. Amount rounding or noise is library only (`metadata-hardening` AMT-1/2) and costs money.
- **Sweep consolidation.** Sweeping several one-time addresses to one destination links them all to one owner. EVM sweeps are per match and the user picks the destination; the app does not warn if one destination is reused (not implemented).
- **Gas-funding links.** Funding a one-time address with gas from another wallet links the two; the payer's optional gas buffer is public and links payer to one-time address (`apps/web/src/lib/pay.ts:217-238`).
- **Address reuse at the destination.** If the destination has history, everyone sees it is yours and can see its balance.
- **The payer-follows-funds link** (ADV-PEER).
- **The RPC provider knowing which transactions are yours.** Section 5.2.
- **Anonymity set.** Every GhostPay payment goes through one router with a fixed announcement shape, so the set is "GhostPay users on that chain", not everyone.
- **View-tag filtering is not privacy.** The log download is unchanged; it only saves CPU.
- **Registry publication** permanently ties a wallet address to a meta-address.
- **A compromised device, extension, wallet or host.**

## 8. Mitigations available today, honestly rated

| Mitigation | Reduces | Status | Limit |
|---|---|---|---|
| No telemetry, no third-party origins, no remote fonts or scripts | ADV-HOST, third-party tracking | Implemented+tested (bundle scan `scan-bundle.mjs`, `scanBundle.test.ts`; source scan `privacyInvariants.test.ts`) | Does not constrain what a compromised page does; `connect-src` stays broad by default |
| Tight `connect-src` via `GHOSTPAY_CONNECT_ORIGINS` | Exfiltration by injected script | Implemented (`csp.mjs`), helpers unit-tested in `apps/web/src/buildScripts.test.ts` | Off by default; user-added RPCs are then blocked until `_headers` is edited |
| Matching in a network-free worker | RPC learning the key or the filter | Implemented+tested (worker scan) | Receipts of matched txs are still fetched |
| No default RPC; per-chain user-chosen RPC | A project-chosen provider seeing all users | Implemented | Users tend to paste a public provider |
| Own node | ADV-RPC | Works (any https/wss URL) | TLS required by `checkRpcUrl`; running a node is out of reach for most users |
| Fragment auto-clear | History leak of invoice | Implemented (`App.tsx:68-86`) | History may already hold it |
| Encrypted tag, keystore, reconciliation stores | ADV-DEV | Implemented+tested | Metadata and plaintext settings/checkpoints remain |
| Relayer minimal logging, hashed rate keys | ADV-RLY retention | Implemented+tested for log schema; retention claims self-attested | Operator can change code; relayer still sees the tuple |
| Tor onion service for the web bundle | ADV-HOST | Implemented, **untested** (`deploy/TOR.md`) | Does not cover RPC |
| `net-transport` profiles (Tor SOCKS, onion, I2P, Nym, OHTTP) | ADV-NET, ADV-RPC/RLY IP | **Library only**; real Tor/I2P/Nym/OHTTP **unverified** per its README; OHTTP HPKE not verified against RFC vectors | Hides IP, not content; never wired |
| `hygiene` decoy-batched reads, address-free verification, self-derived fresh destination, buffer rounding | ADV-RPC, ADV-CHAIN | **Library only** | Not selectable in the app |
| `scan-source` range padding, PIR (`pir-two-server`), light client | ADV-RPC | **Library only**; PIR research PoC | Not selectable |
| `metadata-hardening` (reduced tags, amount noise, per-invoice keys, relayer padding) | various | **Library only** | Each has a stated cost; none wired |
| Destination reuse warning | ADV-CHAIN | **Not implemented** (`describeDestination` unused) | Docs corrected, feature absent |
| Decoy queries in the app | ADV-RPC | **Not implemented in any shipped flow** | |

## 9. Recommended mitigations (prioritized, lowest risk first)

Owners: **core** = core product (apps/web, packages/chain-adapters); **relayer** = apps/relayer and its client; **QR** = QR/receipt/invoice exchange; **infra** = deploy, hosting, CSP, docs-as-ops. This worker changed no source outside new test and doc files.

| # | Recommendation | Reduces | Files | Owner | Risk |
|---|---|---|---|---|---|
| 1 | Do not read the one-time address balance when Sweep merely opens; read on an explicit "Check balance" click with an on-screen note that the RPC will learn the address | ADV-RPC | `apps/web/src/views/Sweep.tsx:55-70` | core | Low |
| 2 | Show a per-flow provider-exposure notice (scan: "your RPC sees which transactions paid you"; Solana/Tron: per-match balance read) and update stale audit wording (PRIVACY-E2E-02) | Informed consent | `apps/web/src/views/Scan.tsx`, `features/solana`, `features/tron`, `docs/audits/17-*.md` | core | Low |
| 3 | Add `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'no-store'` to the default RPC transport | Defense in depth | `packages/chain-adapters/src/rpc.ts:99-105` | core | Low |
| 4 | Warn when an RPC URL contains a path or query secret and offer session-only storage; keep plaintext settings free of keys | ADV-DEV | `apps/web/src/lib/settings.ts`, `views/Settings.tsx` | core | Low |
| 5 | Make a tight `GHOSTPAY_CONNECT_ORIGINS` the documented default for any hosted build, plus a tested production `_headers` | Exfiltration, ADV-HOST | `apps/web/scripts/csp.mjs`, `deploy/BUILD-WEB.md`, `deploy/README.md` | infra | Low |
| 6 | Document the real Tor story: Tor Browser plus own-node or https RPC; the onion service covers the bundle only; keep "untested" until a smoke test runs | ADV-NET, ADV-HOST | `deploy/TOR.md`, `docs/user/privacy-limits.md` | infra | Low |
| 7 | Wire the existing destination classifier and a local used-destination ledger so a reused or known-wallet destination is warned | ADV-CHAIN | `apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/sweep.ts:71`, `packages/hygiene` | core | Low-medium |
| 8 | Replace `keyId = sha256(public meta-address keys)` in checkpoint keys with a random per-profile id, or encrypt checkpoints under the vault key | ADV-DEV (meta-address membership test) | `apps/web/src/lib/scanClient.ts:19-31, 430-470` | core | Medium (migration) |
| 9 | Receipts: minimal-by-default payload (omit one-time address unless the payer asks) with a warning that a receipt links payer and signer key | ADV-PEER | `apps/web/src/lib/receipts.ts:11-22` | QR | Medium (schema) |
| 10 | Encrypt invoices by default (the key stays in the fragment) and offer per-invoice signer keys | ADV-PEER, ADV-HOST | `apps/web/src/views/CreateInvoice.tsx:32`, `packages/metadata-hardening` ID-1/ID-2 | core | Medium |
| 11 | Relayer: pad request bodies, support onion/Tor ingress, avoid a separate quote tuple (stateless fee schedule or quote-less sweep), document zero-log mode | ADV-RLY, ADV-NET | `apps/relayer/src/server.ts`, `apps/web/src/lib/relayerClient.ts`, `apps/relayer/PRIVACY.md`, `packages/metadata-hardening` REL-2/3/4 | relayer | Medium |
| 12 | Bulk evidence: fetch receipts for all router announcements on a page (or matched hashes mixed with decoys via `hygiene.batchedRead`) so the RPC cannot tell which matched | ADV-RPC | `packages/chain-adapters/src/payments.ts:257-258`, `apps/web/src/lib/scanClient.ts:278` | core | Medium-high (cost, correctness) |
| 13 | Bitcoin: detect spends locally from the scanned blocks instead of a per-output outspend query; Solana/Tron: defer balance reads to sweep time | ADV-RPC | `apps/web/src/features/btc/scan.ts:83`, `solana/scan.ts:76`, `tron/scan.ts:70` | core | Medium |
| 14 | Wire `net-transport` for Tor Browser (ambient) and a documented own-node mode; select profile per purpose; keep the first-use notice. Only after real Tor/OHTTP verification | ADV-NET | `apps/web/src/lib/defaultServices.ts`, `packages/net-transport` | core | High (unverified) |
| 15 | Wire `scan-source` padded ranges, then PIR research behind an experimental toggle | ADV-RPC | `packages/scan-source`, `packages/pir-two-server` | core | High |

## 10. Residual risks and honest limits of this analysis

- Network behavior was derived by reading code, not by capturing traffic. A passive test harness (instrumented fetch recording method names against a mock RPC for scan, pay and sweep) would turn section 5 into an automated check; that was not built here because it needs the full web test stack and mocks owned by other teams.
- The relayer's `PRIVACY.md` retention claims are the operator's self-attestation, backed by the log-field tests; they say nothing about a proxy, CDN or RPC provider in front of or behind it.
- `fetch` indirection means other files accept an injected `fetchFn`; the invariant test checks the three direct call sites and that no other transport primitive is used, not every injected caller.
- No claim in this document should be read as "private" or "anonymous". The system hides one-time addresses from casual readers of an invoice; anyone with the right vantage point can link far more.
