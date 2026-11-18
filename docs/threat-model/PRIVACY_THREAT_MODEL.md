# GhostPay privacy and metadata-leakage threat model

Status: **pre-audit, testnet only; no public deployment is qualified by this document.** Current behavior below was checked against combined local source `e85db1ef942bda9cb54317a6c036a22484b46ff9` on 2026-11-18. This is source analysis, not a network capture or independent external audit. The [TM1–TM15 implementation ledger](TM_IMPLEMENTATION_20261118.md) separates actual local execution from remaining acceptance; the [completion report](../handoffs/pages-completion-20261118/COMPLETION_REPORT.md) records later integration and qualification. [THREAT_MODEL.md](THREAT_MODEL.md) covers keys, funds and release integrity. The older [per-datum matrix](metadata-exposure-matrix.md) remains a historical inventory where its status conflicts with this source-pinned update. The user guide is [privacy-limits.md](../user/privacy-limits.md).

**GhostPay does not make payments anonymous.** Each scheme-1 payment uses a fresh receiving address, but the seller's public meta-address and invoice signer remain stable identifiers. Payer address, token, amount, time and router use are public on-chain. RPC, relayer, host and invoice recipients can learn additional links. "Hidden" below always means hidden from a named observer under the stated assumptions.

Conventions: paths are relative to the repository root. Source inspection establishes implemented behavior; a test file establishes an intended regression. Only executed commands and their recorded source revisions establish test results. Historical passes do not qualify this combined candidate.

## 1. Method and scope

The active Pages profile is `AppLean.tsx` with `CORE_ORDER` from `AppShell.tsx`: Home, Seller keys, Create, Pay, Scan, Sweep, Registry, Settings and About. This review also identifies retained full-profile and relayer behavior so that their source presence is not confused with Pages acceptance. Source inputs include `apps/web/src`, `packages/chain-adapters/src`, the privacy libraries, `apps/relayer/src`, hosting scripts and the linked handoffs.

Out of scope: contract-level privacy (router, pools, payer-hiding contracts; none deployed), wallet-extension internals, legal analysis, and anything about mainnet (disabled in `packages/chain-adapters/src/config/chains.ts`).

### 1.1 Libraries and application wiring

`apps/web` now imports `net-transport` for browser selection/disclosures, `hygiene` for destination checks,
`metadata-hardening` for relayer body padding, and `scan-source` for indexer/range behavior. These imports do not
activate every capability of those libraries. Tor routing is ambient browser behavior; the page cannot establish
or verify a SOCKS route. OHTTP, I2P, Nym, per-invoice signer keys, amount noise and PIR remain unqualified or unwired.
`scanPrivacy.ts` exposes RPC or indexer sources, not a PIR selection. Bulk receipt evidence is optional and off
by default. The [TM ledger](TM_IMPLEMENTATION_20261118.md) records each recommendation separately.

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
| A8 | Viewing key | Reveals incoming payments. In scheme 1, a viewing private key plus any one-time private key and its public announcement also permits recovery of the master spending key. Do not delegate both secrets together. |

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

1. The browser, OS, wallet extension and the served JavaScript are not compromised. A compromised page defeats everything, and `connect-src 'self' https: wss:` (`apps/web/index.html`, `apps/web/public/_headers:4`) does not restrict where it can send data unless the host sets `GHOSTPAY_CONNECT_ORIGINS` (`apps/web/scripts/csp.mjs`).
2. The user chooses their own RPC provider. The app ships **no default RPC** (`rpcUrls` defaults to `{}` at `apps/web/src/lib/settings.ts`; a scan with none configured stops with "Configure an RPC", `apps/web/src/views/Scan.tsx`). Whoever the user pastes is trusted with everything in section 5.2.
3. Sensitive payment and recovery operations do not require a GhostPay-operated server. A user-selected relayer is optional infrastructure; its operator and upstream RPC have their own observation capabilities.
4. The app is testnet only; no deployment manifest ships.

## 5. What each component does on the network (verified in code)

### 5.1 No telemetry

The reviewed production source defines no analytics or remote error-reporting service. Error handling remains local. `apps/web/src/privacyInvariants.test.ts` checks source-level telemetry identifiers, origin literals, audited fetch references and relayer log fields; `apps/web/scripts/scan-bundle.mjs` checks generated assets and the network-free worker. These checks do not prove that a compromised host, dependency, extension or runtime-built endpoint is harmless.

The invariant and bundle suites are complementary: static matching cannot establish absence of every possible egress path. The current Pages hosting test selection ran at `0bbd8965`; actual commands and qualification limits belong to the completion report. Source-matched whole-build and browser checks still remain separate requirements.

### 5.2 EVM scan (seller)

| Step | Call | Evidence | Leaks to ADV-RPC |
|---|---|---|---|
| Head, block hashes | `eth_blockNumber`, `eth_getBlockByNumber` | `packages/chain-adapters/src/logs.ts`, `rpc.ts` | That this IP is scanning, and the block ranges |
| Announcements | `eth_getLogs` on the announcer, topics `[Announcement, schemeId]` only, windows up to `getLogsMaxRange` (1000) | `logs.ts`; `chains.ts` | Scan start block and progress. **No view tag, address or key is in the filter**; matching is local in a worker with no network API (`apps/web/src/lib/scanClient.ts`, `scripts/scan-bundle.mjs`) |
| Per matched router announcement | `eth_getTransactionReceipt` and `eth_getTransactionByHash` for the announcement's tx hash; `eth_blockNumber`; `eth_getBlockByNumber` twice | `packages/chain-adapters/src/payments.ts`; called from `scanClient.ts` | **The exact transactions that paid this seller.** The provider can tell which announcements matched the viewing key, hence which stealth addresses and which payer txs are this seller's. Anyone can fetch any tx, so the *volume* of matches is the signal |
| Per-address balance | `eth_getBalance` / `balanceOf` via `eth_call` on the stealth address | `payments.ts`, gated by `observeBalance` (`payments.ts`); `scanClient.ts` does not pass it | **Not issued by default.** Documented as disabled because it reveals the match |
| Second provider | The same page of logs, blocks, receipts and transactions | `scanClient.ts`; `payments.ts` (secondary verify) | ADV-RPC for the second provider learns the same match set. A second RPC doubles exposure, it does not split it |
| Tx-hash "did this pay me" helper | `eth_getTransactionReceipt` for a user-typed hash | `payments.ts` | That tx hash |

The default scan still performs match-linked receipt/transaction validation. When `bulkEvidence` is enabled, `scanClient.ts` and the chain-adapter evidence helper read router receipts for all selected page transactions up to a cap before applying local matches. Cancellation is checked between asynchronous stages. This trades additional traffic for less direct match signaling on covered pages; overflow/fallback, other request types, timing, non-router lanes and a second provider remain observable. It is not a general anonymity guarantee. Historical audit wording about recipient-filtered Transfer log queries should not be used to describe the current receipt-based path.

### 5.3 EVM sweep (seller)

| Step | Call | Evidence | Learned by |
|---|---|---|---|
| Explicit balance-check action | `eth_getBalance` or `balanceOf` of the one-time address; opening the view or changing the match alone does not issue it | `apps/web/src/views/Sweep.tsx`; `apps/web/src/lib/sweep.ts` | ADV-RPC learns the address, request timing and connecting IP after the disclosed user action. Selection/session changes invalidate the read; every refresh needs another click. |
| Direct sweep | `eth_gasPrice`, `eth_getTransactionCount(owner,'pending')`, `eth_getBalance(owner)`, `eth_estimateGas{from: owner}`, `eth_call` dry run, `eth_sendRawTransaction` | `apps/web/src/lib/sweep.ts` | ADV-RPC: owner, destination (in the raw tx), amount, IP, time |
| Relayed sweep | `POST /v1/quote` with chain, token, **owner, destination, amount**; `POST /v1/sweep` with the signed order, EIP-712 signature, optional permit, quote token | `apps/web/src/lib/relayerClient.ts`, `apps/web/src/views/Sweep.tsx`; relayer side `apps/relayer/PRIVACY.md` | ADV-RLY: stealth address, destination, token, amount, fee, IP (hashed for rate limiting), timing; quote and sweep carry the same tuple so they are trivially joined. Permit reads (`nonces`, `name`) go to the user's RPC with the owner address (`apps/web/src/lib/pay.ts`) |
| Relayer's own RPC | Simulation `eth_call` containing the full sweep, then the signed tx | `apps/relayer/PRIVACY.md` ("What other parties see"), `apps/relayer/src/chain.ts` | The relayer operator's RPC provider |

The Sweep view calls the existing destination classifier and an in-memory used-destination ledger in `lib/sweep.ts`. It warns about known-wallet and reused destinations without claiming that an unfamiliar address is safe. History is advisory and lasts only for the current seller session: app lock, key changes and reload clear it. The old plaintext `ghostpay.sweepDestinations.v1` entry is removed best effort and never read into the new ledger. A completion from an older session cannot repopulate it. No cross-session or cross-device reuse protection is provided.

### 5.4 EVM pay (payer)

The payer's RPC (the app's, not the wallet's) sees the payer address through `allowance` and permit reads (`apps/web/src/lib/payExec.ts`), `eth_gasPrice` and `eth_estimateGas{from: payer}` (`apps/web/src/lib/pay.ts`) and the `eth_call` simulation (`apps/web/src/lib/txGuard.ts`). The transaction itself is sent by the wallet extension through the wallet's own provider, which the app cannot see or control. The optional random delay is local scheduling (`apps/web/src/lib/jitter.ts`, `Pay.tsx`): nothing is queued or sent while waiting, no cover traffic is created.

The optional secondary RPC is currently a **Scan** comparison setting. Ordinary Pay/Sweep manifest readback
uses the primary client (`AppShell.tsx`, `lib/manifest.ts`); supplying a second Scan endpoint does not add another
payment/sweep observer. Spec 01's optional two-provider policy remains incomplete for those flows. See
[deployment-manifest trust status](../DEPLOYMENT_MANIFEST.md).

### 5.5 Registry (EIP-6538)

Lookup issues `eth_call stealthMetaAddressOf(registrant, 1)` via `lookupMetaAddress` (`apps/web/src/features/registry/RegistryView.tsx`; lookup in `buildLookupCall`/`lookupMetaAddress`, `packages/chain-adapters/src/registry.ts`). ADV-RPC learns **which registrant address the payer is looking up**, that is, who is about to be paid. Publishing (`registerKeys`) writes the meta-address permanently under the publisher's wallet address; clearing writes empty bytes but history stays on-chain (`apps/web/src/lib/registry.ts`). The UI warns about the link (`apps/web/src/views/SellerKeys.tsx`).

### 5.6 Bitcoin silent payments (full profile, outside the active Pages routes)

The retained Bitcoin implementation reads block/header data and can derive spend state from scanned blocks.
At the reviewed snapshot, an unknown local spend state can still trigger an Esplora outspend query; signing also
requires current spend validation. The provider can learn the matching outpoint through those queries. #219's
separate consent/worker/header changes are not qualified by this Pages review. Do not describe local spent-output
recognition as an unconditional removal of provider linkage.

### 5.7 Solana and Tron (full profile, outside the active Pages routes)

The current `features/solana/scan.ts` and `features/tron/scan.ts` retain amounts from announcement/transaction data
without a separate balance read for every match; balance checks are deferred to sweep. Nodes still see requested
slots, blocks, signatures and transactions and later address-bearing sweep requests. These experimental paths
have separate interoperability and external acceptance requirements; their presence does not expand Pages scope.

### 5.8 Local storage (A7)

| Store | Content | Protection | Evidence |
|---|---|---|---|
| `localStorage` `ghostpay.settings.v1` | RPC URLs (primary, secondary), relayer URL, delay range, pinned signers, theme | **Plaintext.** Settings warns about secret-looking RPC paths/queries and offers session-only endpoint storage in module memory. The heuristic can miss secrets; previously saved endpoints are not silently removed without the user saving the selection | `apps/web/src/lib/settings.ts`; `views/Settings.tsx` |
| `localStorage` `ghostpay.scan.checkpoint.v4.<hkdf>` | Next block, last block number and hash. HKDF-SHA256 uses the loaded seller's private viewing key and versioned chain/key-ID info; access is bound to that seller and session. v1/v2 and both incompatible v3 formats are never read or migrated: they require a rescan and are purged best effort when storage supports enumeration | **Plaintext contents; pseudonymous names.** Public seller keys alone do not derive a slot name, but stored block data and opaque names remain visible and are not authenticated by this change. Storage failures, non-enumerable adapters or older tabs can leave legacy records behind; those records are still ignored. A v4 slot shows GhostPay was used in this browser | `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanCursorSlot.ts`; [format and migration limits](../handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md) |
| IndexedDB `ghostpay-tags` | Client labels, invoice labels, notes, matched payment data | AES-256-GCM, key from HKDF of the viewing key; per-record AAD binds chain, record id and lookup token. Record count, chain ids, record ids, HMAC lookup tokens and write timing are visible | `apps/web/src/lib/tags.ts`; `apps/web/src/lib/idbStore.ts` |
| IndexedDB `ghostpay-encrypted-seller-vault` | Encrypted keystore | Passphrase-based encryption of secret contents; the keystore format exposes its public meta-address and signer header | `apps/web/src/lib/keyVault.ts`; `packages/ux-vault/src/keystore-portable.ts` |
| IndexedDB `ghostpay-reconciliation-encrypted` | Verified-payment records (stealth address, tx hash, amount) | Encrypted; scope `sellerKeyId:chainId` is plaintext | `apps/web/src/lib/reconciliationVault.ts` |
| `sessionStorage` wallet-attempt journal | Account, chain, kind, tx hash of wallet attempts | Plaintext, per tab; retained through reload to prevent duplicate/uncertain sends, cleared with the tab | `apps/web/src/lib/duplicateAttemptJournal.ts` |
| `sessionStorage` sweep-attempt journal | Owner, chain, nonce, hashes, status and relayed order when applicable | Plaintext, per tab; safety state for uncertain submissions, not an encrypted transaction archive | `apps/web/src/lib/sweepAttemptJournal.ts` |
| Sweep destination history in memory | Links between sources and destinations in the current seller session | Not persisted; reset on app lock/session changes; legacy plaintext deletion is best effort | `apps/web/src/lib/sweep.ts`; `sweep.destinations.privacy.test.ts` |
| `localStorage` locale | Language code | Plaintext | `apps/web/src/i18n/storage.ts` |
| Browser history | Full invoice link including the `#gpi=` fragment | Outside the app. Fragment is stripped from the address bar by default after reading (`apps/web/src/App.tsx`), but the history database may already hold it | `apps/web/src/lib/fragment.ts` |

### 5.9 Invoice links, QR codes and receipts

Invoice encryption is **on by default** in `views/CreateInvoice.tsx`. Ordinary encrypted links carry the decryption key in the same fragment, so the holder can read the private fields; public fields such as chain and amount remain visible. A separate passphrase mode has its own protection. The fragment is not part of the HTTP request, but browser history, copying and QR capture can still expose the bearer link. QR generation and decoding are local. The invoice meta-address and signer are stable; per-invoice signer selection is not wired into this flow.

`ReceiptPanel.tsx` and `lib/receipts.ts` omit `stealthAddress` by default and require a visible opt-in to include it. A minimized signed receipt still contains the transaction hash, chain, amount, invoice digest and signer key, so its holder can follow public-chain links. Minimization does not make a receipt unlinkable.

Spec 18 secret exports require explicit authorization and re-authentication. A single payment-key export performs an address-bearing code check after the visible RPC disclosure; simply opening payment details or exporting the public record does not make that request. Encrypted keypair archives have authenticated but readable headers that link their entries. Immutable JavaScript strings and browser-managed memory cannot be securely erased; byte-buffer cleanup is best effort.

### 5.10 Hosting

The page and reference `_headers` declare `no-referrer`. The default RPC transport additionally sends `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'no-store'` and `redirect: 'error'` (`packages/chain-adapters/src/rpc.ts`). These options do not hide the destination, connecting IP or RPC content from the provider. The reference nginx disables its access log, but a CDN, reverse proxy, relayer operator or upstream RPC may retain its own data. GitHub Pages does not apply another host's `_headers` format; the built meta CSP, declared-origin guards and actual serving configuration need separate checks.

The scan endpoint validator accepts plain HTTP on loopback for `local-proxy`, but the shipped broad CSP permits
only `'self' https: wss:` and the build allowlist parser accepts only HTTPS/WSS origins. Thus a cross-origin
`http://127.0.0.1`, `http://localhost` or `http://[::1]` scan proxy is blocked by that policy. Validator acceptance
is not browser reachability. This remains a compatibility limitation, not a reason to weaken the CSP or to fall
back silently to another provider.

### 5.11 Relayer retention (from code, to be compared with `apps/relayer/PRIVACY.md`)

The log line is a closed schema `requestId, route, status, chainId, txHash, errorClass` with each value re-validated (`apps/relayer/src/log.ts`); the new invariant test pins the field list. Rate-limit keys are `HMAC-SHA256(random in-memory salt, IP)` truncated to 128 bits, dropped on salt rotation (`apps/relayer/src/limiter.ts`). Raw IP exists in memory for the request. The relayer cannot be made to forget what it saw during a request, and an operator who modifies the code or runs a logging proxy is outside these properties.

## 6. What each adversary learns, and what limits it

### ADV-RPC (RPC provider, second RPC, Esplora, Solana/Tron node)

**Learns**: IP, scan ranges and timing; matched transactions in the default EVM validation path; the one-time address on a disclosed balance-check/export action and on sweep; owner, destination and amount of a direct sweep; payer allowance/permit reads; registry lookups; and submitted transactions. Bulk evidence can reduce one match signal under its bounded conditions. Full-profile Esplora fallback and later Solana/Tron sweep reads have their own linkage.
**Does not receive**: the viewing or spending secret, or invoice contents. Matching uses a network-free worker (`scanClient.ts`, scan-bundle `WORKER_FORBIDDEN`). The announcement log filter contains no seller-specific view tag or one-time address; the provider can still see all public fields in the announcements it returns.
**Mitigations today**: user-selected endpoints, per-flow disclosures, optional bulk evidence and range padding, a local-proxy scan path, and acknowledged own-node selection. `createSelectedRpc` rechecks own-node restrictions at each dispatch, including cached clients and retries; an already-sent request cannot be recalled. Tor Browser selection describes ambient routing and does not verify the browser or network. The second provider is an integrity cross-check and increases exposure. Running a dedicated node also does not eliminate timing correlation at its network peers.

### ADV-RLY (relayer operator)

**Learns**: stealth address, destination, token, amount, fee, timing, IP (and the hashed bucket), and can censor, delay, or log if modified. Quote and sweep requests are separable only by timing, and carry the same tuple.
**Does not learn**: keys; it cannot change destination, amount or fee (enforced by the on-chain signature).
**Mitigations today**: a user may sweep directly or choose a relayer. The web client pads request bodies into size buckets by default; an older relayer's specific pre-parse refusal permits one unpadded retry. Padding hides neither the tuple nor IP/timing, and responses remain unpadded. Onion-ingress configuration and limited-retention documentation exist, but real Tor acceptance is missing. The signed fee/quote design still repeats an owner/destination/amount tuple; a quote-less protocol is not implemented.

### ADV-CHAIN (chain observer)

**Learns, permanently**: payer address, token, gross and net amounts, fee flow, that the router was used, timing, the announcement (stealth address, ephemeral key, view tag, metadata), the sweep `stealth -> destination` with amount, any gas-funding transfer into the one-time address, and registry publications.
**Does not learn (from chain data alone)**: which seller owns an announcement's stealth address, until a sweep, gas funding, address reuse or timing/amount correlation links it.
**Mitigations today**: use a fresh destination, avoid known-wallet gas funding and avoid consolidation. The UI warns about known-wallet destinations and reuse observed in the current session only. The warning is not proof that an address is fresh or unlinked. See section 7 for persistent chain-level limitations.

### ADV-HOST (static host, CDN, onion operator)

**Learns**: IP, user agent, asset paths and timing of app loads. The fragment is not sent by HTTP. Runtime manifests are bundled and signed; the legacy unsigned runtime-fetch loader was removed. These source properties do not constrain a host that serves different JavaScript. Root error handlers report only fixed local markers, not mutable exception content, and define no remote reporting endpoint.
**Can also**: serve modified code, which defeats every property here (integrity model in `THREAT_MODEL.md`, `deploy/BUILD-WEB.md`).
**Mitigations today**: self-host; Tor onion service (`deploy/TOR.md`, compose profile `onion`): hides the visitor's IP from the host and the host's location from the visitor. **Limits**: `deploy/TOR.md` itself states image build, bootstrap and reachability are **untested**; the onion origin is plain `http:` and the CSP `connect-src 'self' https: wss:` blocks plain-http RPC URLs, so RPC calls from an onion-loaded page still go to an https endpoint of the user's choosing and are not hidden by the onion.

### ADV-NET (ISP, local network)

**Learns**: that the device connects to the app host, to the RPC provider's host (SNI), to the relayer's host, at what times and in what volumes, which fingerprints scan bursts and sweep requests. Content is TLS-protected.
**Mitigations today**: Tor Browser or a VPN for all traffic (user action, not verifiable by the page). **Limits**: moves trust to the VPN or exit; does not hide content from the destination; per-request circuit isolation is not available to a web page.

### ADV-PEER (payer, invoice holders, receipt holders, other sellers' payers)

- **The payer** knows the one-time address and the payment tx, so they can follow the funds to the sweep destination. This cannot be fixed by the client; the only defense is a fresh destination and not consolidating with funds you want unlinked.
- **Holder of an invoice link** reads the whole invoice and the seller's meta-address and signer public key. **Anyone holding two invoices** from one seller can link them (stable meta-address; the invoice signer key is also stable unless per-invoice keys are used, `metadata-hardening` ID-1/ID-2, not wired).
- **Receipt holder** can link the transaction hash, amount and signer key even when the optional one-time address field is omitted (section 5.9).
- **Mitigations today**: share invoices over a channel you trust; passphrase-protected invoices; per-client meta-addresses are a design idea only (`docs/specs/ideas/03-per-client-meta-addresses.md`).

### ADV-DEV (device thief or later local user)

**Learns without any passphrase**: saved non-session RPC/relayer URLs, any credentials embedded in those URLs, pinned public signer keys, checkpoint block progress, tab-scoped wallet/sweep attempt state, locale and possibly the invoice fragment from browser history. Opaque v4 checkpoint names cannot be derived from public seller keys alone. Public keystore/recovery headers, reconciliation scope, record counts, chains and timing still expose metadata. Encrypted secret contents, tags, notes and payment payloads require their keys/passphrases.
**Mitigations today**: private browser window; clear site data; keystore passphrase; auto-lock timeout. **Limits**: a live compromised session can read decrypted state.

## 7. What GhostPay does NOT protect

- **Timing correlation.** A payment at block N and a sweep at N+k are linked by timing; the optional pay-side delay (`jitter.ts`) is local scheduling friction, no cover transactions exist, and a delay chosen by the payer does not delay the seller's sweep.
- **Amount correlation.** Net amounts are public, and an exact amount that appears at the destination links it to the payment. Amount rounding or noise is library only (`metadata-hardening` AMT-1/2) and costs money.
- **Sweep consolidation.** Multiple one-time addresses sent to one destination become linked. Current-session reuse warnings are advisory; they cannot undo or reliably detect links from earlier sessions or other devices.
- **Gas-funding links.** Funding a one-time address with gas from another wallet links the two; the payer's optional gas buffer is public and links payer to one-time address (`apps/web/src/lib/pay.ts`).
- **Address reuse at the destination.** If the destination has history, everyone sees it is yours and can see its balance.
- **The payer-follows-funds link** (ADV-PEER).
- **The RPC provider knowing which transactions are yours.** Section 5.2.
- **Anonymity set.** Every GhostPay payment goes through one router with a fixed announcement shape, so the set is "GhostPay users on that chain", not everyone.
- **View-tag filtering is not privacy.** The log download is unchanged; it only saves CPU.
- **Registry publication** permanently ties a wallet address to a meta-address.
- **A compromised device, extension, wallet or host.**

## 8. Mitigations available today, honestly rated

Source presence and test definitions are listed below. Current local execution is recorded in the
[TM ledger](TM_IMPLEMENTATION_20261118.md); no row grants whole-candidate or deployed-site qualification.

| Mitigation | Current implementation | Residual limitation |
|---|---|---|
| No configured telemetry; bundled assets and worker network checks | Source invariants and bundle scanner | Static checks do not constrain a compromised runtime or host |
| Tight `connect-src` via `GHOSTPAY_CONNECT_ORIGINS` | Build-time allowlist support; hosting guidance | Generic builds remain broad without configuration; production hosting/origin acceptance is separate |
| Network-free match worker | Local matching; no network API in its allowed bundle | Default receipt validation can still reveal matches |
| No default RPC; explicit provider selection | Per-chain configuration and first-use/network notices | Chosen providers see requests |
| Own-node guard | Restricts every selected RPC dispatch to accepted loopback/onion endpoints | Endpoint ownership and real routing are not verified; already-sent requests remain observable |
| Fragment auto-clear | Removes a consumed fragment from the address bar | History, clipboard and screenshots may already contain it |
| Encrypted tag, keystore and reconciliation contents | Existing authenticated encryption | Public headers, scope, counts/timing and safety journals remain visible |
| v4 scan checkpoint names | HKDF from the private viewing key, bound to the selected seller/session | Cursor contents are plaintext and unauthenticated; legacy cleanup is best effort |
| Sweep balance consent and destination warnings | Explicit per-read action; session-memory history | Later sweep requests reveal addresses; no cross-session reuse protection |
| Minimized receipts and encrypted invoice default | Wired into receipt/invoice views | Transaction hashes and stable signer/meta-address identifiers still link activity |
| Tor Browser selection and onion recipe | Disclosures/configuration exist | Real Tor, I2P, Nym and OHTTP acceptance is unverified; a page cannot establish its own Tor route |
| Relayer request-body padding | Web client and server support | Quote/sweep tuples, timing, IP and unpadded fallback remain observable |
| Bulk receipt evidence | Optional bounded page-level receipt reads | Off by default; cost, overflow, timing and other request classes limit privacy |
| Padded scan ranges | `scan-source.padRange` in fixed-window scans | Additional traffic; no PIR choice in the active scan UI |
| Other library capabilities | Some decoy, per-invoice signer, amount-noise and PIR primitives remain standalone | Importing a package does not wire or qualify all of its features |

## 9. Recommended mitigations (prioritized, lowest risk first)

The numbered recommendations below preserve the original threats and scope; they are not a list of wholly absent features. Their current implementation, executed evidence and remaining work are mapped individually as TM1–TM15 in the [implementation ledger](TM_IMPLEMENTATION_20261118.md). Owners: **core** = web/shared adapters; **relayer** = optional service/client; **QR** = invoice/receipt exchange; **infra** = hosting, CSP and operations documentation.

| # | Recommendation | Reduces | Files | Owner | Risk |
|---|---|---|---|---|---|
| 1 | Do not read the one-time address balance when Sweep merely opens; read on an explicit "Check balance" click with an on-screen note that the RPC will learn the address | ADV-RPC | `apps/web/src/views/Sweep.tsx` | core | Low |
| 2 | Show a per-flow provider-exposure notice (scan: "your RPC sees which transactions paid you"; Solana/Tron: per-match balance read) and update stale audit wording (PRIVACY-E2E-02) | Informed consent | `apps/web/src/views/Scan.tsx`, `features/solana`, `features/tron`, `docs/audits/17-*.md` | core | Low |
| 3 | Add `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'no-store'` to the default RPC transport | Defense in depth | `packages/chain-adapters/src/rpc.ts` | core | Low |
| 4 | Warn when an RPC URL contains a path or query secret and offer session-only storage; keep plaintext settings free of keys | ADV-DEV | `apps/web/src/lib/settings.ts`, `views/Settings.tsx` | core | Low |
| 5 | Make a tight `GHOSTPAY_CONNECT_ORIGINS` the documented default for any hosted build, plus a tested production `_headers` | Exfiltration, ADV-HOST | `apps/web/scripts/csp.mjs`, `deploy/BUILD-WEB.md`, `deploy/README.md` | infra | Low |
| 6 | Document the real Tor story: Tor Browser plus own-node or https RPC; the onion service covers the bundle only; keep "untested" until a smoke test runs | ADV-NET, ADV-HOST | `deploy/TOR.md`, `docs/user/privacy-limits.md` | infra | Low |
| 7 | Wire the existing destination classifier and a local used-destination ledger so a reused or known-wallet destination is warned | ADV-CHAIN | `apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/sweep.ts`, `packages/hygiene` | core | Low-medium |
| 8 | Replace `keyId = sha256(public meta-address keys)` in checkpoint keys with a random per-profile id, or encrypt checkpoints under the vault key | ADV-DEV (meta-address membership test) | `apps/web/src/lib/scanClient.ts` | core | Medium (migration) |
| 9 | Receipts: minimal-by-default payload (omit one-time address unless the payer asks) with a warning that a receipt links payer and signer key | ADV-PEER | `apps/web/src/lib/receipts.ts` | QR | Medium (schema) |
| 10 | Encrypt invoices by default (the key stays in the fragment) and offer per-invoice signer keys | ADV-PEER, ADV-HOST | `apps/web/src/views/CreateInvoice.tsx`, `packages/metadata-hardening` ID-1/ID-2 | core | Medium |
| 11 | Relayer: pad request bodies, support onion/Tor ingress, avoid a separate quote tuple (stateless fee schedule or quote-less sweep), document zero-log mode | ADV-RLY, ADV-NET | `apps/relayer/src/server.ts`, `apps/web/src/lib/relayerClient.ts`, `apps/relayer/PRIVACY.md`, `packages/metadata-hardening` REL-2/3/4 | relayer | Medium |
| 12 | Bulk evidence: fetch receipts for all router announcements on a page (or matched hashes mixed with decoys via `hygiene.batchedRead`) so the RPC cannot tell which matched | ADV-RPC | `packages/chain-adapters/src/payments.ts`, `apps/web/src/lib/scanClient.ts` | core | Medium-high (cost, correctness) |
| 13 | Bitcoin: detect spends locally from the scanned blocks instead of a per-output outspend query; Solana/Tron: defer balance reads to sweep time | ADV-RPC | `apps/web/src/features/btc/scan.ts`, `solana/scan.ts`, `tron/scan.ts` | core | Medium |
| 14 | Wire `net-transport` for Tor Browser (ambient) and a documented own-node mode; select profile per purpose; keep the first-use notice. Only after real Tor/OHTTP verification | ADV-NET | `apps/web/src/lib/defaultServices.ts`, `packages/net-transport` | core | High (unverified) |
| 15 | Wire `scan-source` padded ranges, then PIR research behind an experimental toggle | ADV-RPC | `packages/scan-source`, `packages/pir-two-server` | core | High |

## 10. Residual risks and honest limits of this analysis

- This review reads source and local mock-based regression results. It contains no real-network traffic capture, Tor Browser run, external-wallet acceptance or physical-device test. Source helpers and mocked transport tests do not establish deployed routing or anonymity.
- The relayer's `PRIVACY.md` retention claims are the operator's self-attestation, backed by the log-field tests; they say nothing about a proxy, CDN or RPC provider in front of or behind it.
- `fetch` indirection means other files accept an injected transport. The invariant checks audited direct call sites, not every future runtime composition or endpoint assembled from data.
- No claim in this document should be read as "private" or "anonymous". The system hides one-time addresses from casual readers of an invoice; anyone with the right vantage point can link far more.


### Merchant profile continuation — 2026-11-16

The full application adds a user-triggered HTTPS profile request through the existing injected `Services.fetchFn`.
Loading is never automatic from a query parameter, inline profile or embed SDK attribute. The visible disclosure
names IP/URL exposure; requests omit credentials/referrers, reject redirects, disable caching, and are bounded to
8192 streamed bytes and ten seconds. Editing/cancelling/unmounting invalidates pending results. Remote profiles must
carry a valid unexpired signature and include their source origin. No merchant URL or fixed provider is compiled in.

The user may independently confirm a full public key and store it for the fetched HTTPS origin. Origin/key pairs are
public `localStorage` preferences and can be read/modified by other code on that checkout origin; they are not an
independent identity service, atomic cross-device trust store, encrypted backup, or protection against origin compromise.
Changed keys are displayed without automatic replacement. Cooperating tabs use a nonwaiting Web Lock for origin-key
mutations, refuse absent/busy locking, and recheck active profile and stored key inside that lock. This cannot constrain
other code that already controls the origin. Remote-profile embed links open a popup during the click gesture, never
a timed iframe fallback. These pins do not feed invoice trust, payment authorization
or the iframe allowlist. Signed templates are inert displayed fields. The lean build excludes this surface.
