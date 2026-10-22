# Audit 05: privacy-e2e (end-to-end flows and feature interactions)

Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). Paths below are relative to the repo root of that snapshot.
This is an AI-assisted review, not an independent professional audit.

## Summary

Flow reviewed: seller keygen -> invoice link -> payment (router) -> announcement -> scan -> sweep (direct and relayer), plus the Bitcoin silent-payments tab, the scheme-2 policy router, and Tron key reuse. Most privacy limits are honestly disclosed (README, `docs/user/privacy-limits.md`, D1/D2/D3/D8 from audit 04). The new problems are leaks added by later features, and docs that describe defences the code does not have:

| ID | Sev | Title |
|---|---|---|
| PRIVACY-E2E-01 | medium (high once BTC mainnet is enabled) | BTC scan sends every detected output (txid:vout) to the Esplora server. The UI says the server only learns block heights |
| PRIVACY-E2E-02 | medium | EVM scan leaks matches to the RPC: an `eth_balance`/`balanceOf` read of each direct-announcement stealth address, and one extra `eth_blockNumber` per match (S3-02 fix regression) |
| PRIVACY-E2E-03 | medium | BTC sweep pre-selects every found output and spends them all in one tx (common-input-ownership link), with no warning |
| PRIVACY-E2E-04 | medium | The user docs say "the app warns when the destination looks used". No such check is wired (`describeDestination` is dead code) |
| PRIVACY-E2E-05 | low (carried, still open) | Scheme-2 `policyHash` is unsalted and public in router calldata and account storage. Factory comment claims no linkability |
| PRIVACY-E2E-06 | low | The direct-sweep error advises funding the one-time address with native coin, with no linkage warning |
| PRIVACY-E2E-07 | low | A relayer quote discloses owner, destination and IP before the user commits to relaying |
| PRIVACY-E2E-08 | info | Privacy docs and the threat model are stale about what the scan sends and what the app verifies |
| PRIVACY-E2E-09 | info | Plaintext scan checkpoints in `localStorage` reveal seller use, chains and scan progress on the device |

No critical findings. No finding in this area causes direct loss of funds.

## Method

- Static reading of the snapshot. No JS was executed and no forge PoC was needed: every finding is a deterministic call sequence that can be read off the code.
- Files read in full or in the relevant part:
  - Web libs: `apps/web/src/lib/{pay,payExec,scanClient,sweep,relayerClient,invoiceCreate,fragment,jitter,settings,defaultServices,session}.ts`.
  - Web views: `apps/web/src/views/{Pay,Scan,Sweep,CreateInvoice}.tsx`, `apps/web/src/App.tsx`.
  - BTC feature: `apps/web/src/features/btc/{scan,sweep,wallet,network,esplora,BtcView}.ts(x)`.
  - Chain adapters: `packages/chain-adapters/src/{adapter,router,scanVerify,logs}.ts`, `packages/core-crypto/src/metadata.ts`.
  - Invoice schema: `packages/invoice-schema/src/envelope.ts`.
  - Tron and policy scheme: `packages/tron-adapter/src/meta.ts`, `packages/policy-scheme/src/{meta,policy,derive}.ts`.
  - Contracts: `packages/contracts/src/{GhostPayPolicyRouter,PolicyAccount,PolicyAccountFactory}.sol`.
  - Relayer: `apps/relayer/src/{server,service,limiter}.ts`, `apps/relayer/PRIVACY.md`.
- Compared with:
  - Audits: `docs/audits/03`, `docs/audits/04` (D1 to D11), `docs/remote/round-audits/policy-scheme.md`, `docs/remote/anonymization-research.md`.
  - Threat model and research: `docs/threat-model/THREAT_MODEL.md`, `docs/remote/research/chain-analysis-attacks.md`, `docs/remote/specs/address-safety.md`.
  - User docs: `docs/user/{privacy-limits,receive-and-scan,sweep-and-gas-privacy}.md`, `README.md`.
- Prior known items are not re-reported unless their status changed: D1, D2, D3, D4, D8, S3-03 bearer link in history, and gas buffer linkage.

## Findings

### PRIVACY-E2E-01 (medium; high once BTC mainnet is enabled): BTC scan reveals every received output to the Esplora operator

- `apps/web/src/features/btc/scan.ts:77-82`: after the full-block BIP-352 scan, each candidate is checked with `client.isUnspent(c.txid, c.vout)`.
- That call is `GET /tx/:txid/outspend/:vout` (`apps/web/src/features/btc/esplora.ts:195-199`). It is issued only for outputs that matched the user's scan key.
- The block download itself (`/block/:hash/txs/:start`) is privacy-preserving, since everyone downloads the same pages. The follow-up queries hand the server the exact list of the user's silent-payment outputs, tied to the client IP and the scan session.
- UI copy is wrong: `BtcView.tsx:187` says *"The server learns which block heights you scan and any transaction you broadcast."*
- The code comment is misleading: `scan.ts:40` says *"the server sees block heights and outpoints only"*. The outpoints are the user's payments.
- Exploit: the user points the tab at any third-party Esplora (the hint encourages "any Esplora-compatible REST server"). The operator logs `outspend` requests per IP. After one scan it knows every payment the seller received in the range, and their amounts from the public tx. The sweep is then broadcast via `POST /tx` from the same IP, which also gives it the destination. This removes BIP-352's main light-client property.
- Fix:
  - Determine spentness locally from the downloaded blocks: scan forward to the tip and track spends of candidate outpoints. Alternatively, fetch spend status for all outputs of the block or tx (`/tx/:txid/outspends`) for a decoy set, or skip the check and let the sweep fail.
  - Correct the hint text.

### PRIVACY-E2E-02 (medium): EVM scan tells the RPC which announcements are the seller's (regression from the S3-02 fix)

- `apps/web/src/lib/scanClient.ts:159-169` calls `verifyReceipt` for every match, inline in the scan loop.
- `packages/chain-adapters/src/scanVerify.ts:60-74`:
  - Every match triggers `client.blockNumber()` (line 63).
  - Every non-router match (`viaRouter == false`) that is past finality triggers `eth_getBalance(stealth, block)` or `eth_call balanceOf(stealth)` at two blocks (`balanceAt`, lines 32-45, 70-73).
- A page of `fetchAnnouncements` has a fixed RPC shape: `getBlock`, `blockNumber`, `getBlock`, `getLogs`..., `getBlock` (`logs.ts:180-231`). So the number of extra `eth_blockNumber` calls between two pages equals the number of matches in that page's block window.
- Exploit 1, direct payments: a payer (or anyone who knows the public meta-address) can send a direct announcement plus a transfer to a derived stealth address. On the seller's next scan, the seller's RPC receives `eth_getBalance(<that stealth>)` from the seller's IP. With N such payments, the RPC can cluster all N stealth addresses to one IP, without the seller ever opening Sweep.
- Exploit 2, router payments: on low-traffic chains (every enabled chain is a testnet; early mainnet would look the same) a 1000-block window often holds 0 to 2 announcements. The count of extra `eth_blockNumber` calls then identifies which announcements are the seller's.
- Docs say the opposite:
  - `privacy-limits.md` says the RPC learns a one-time address "when you check its balance".
  - `THREAT_MODEL.md:24,86-91` says the scan sends only block ranges and that balance verification is "not yet" done.
  - `anonymization-research.md:526` sets "no per-address RPC read for scans" as an acceptance criterion.
- Fix:
  - Defer verification until the user selects a match (or the sweep view), and disclose it there.
  - Fetch the head once per page and pass it into `verifyReceipt`.
  - For direct announcements, verify through the `Transfer` logs to the stealth address. Fetch them by token-wide range rather than by address, or offer "verify on demand".

### PRIVACY-E2E-03 (medium): BTC sweep consolidates all payments by default

- `apps/web/src/features/btc/BtcView.tsx:113` sets `picked` to every found output after a scan.
- `sweep.ts:31-60` builds one transaction spending all selected inputs to one destination. `reviewSweep` raises warnings only for fee size and self-address (`sweep.ts:45-48`).
- Exploit: a seller receives silent payments from customers A, B and C, then presses Scan, Review, Sign and Broadcast with the defaults. The broadcast tx spends all three outputs together. The common-input-ownership heuristic publicly links A's, B's and C's payments to one owner and to the destination, which undoes BIP-352 unlinkability between payments.
- `chain-analysis-attacks.md:58` and `anonymization-research.md:417,526` list "never batch-sweep multiple S_i to one address / consolidation blocked in UI" as the fix. The BTC tab does the opposite.
- Fix:
  - Default to no selection, or one output.
  - Warn when more than one input is selected.
  - Optionally enforce one input per sweep and a fresh destination per sweep.

### PRIVACY-E2E-04 (medium, docs claim a defence that does not exist): no destination-reuse or "new destination" warning in Sweep

- `docs/user/sweep-and-gas-privacy.md` (Read-this-first item 2) says *"The app warns when the destination looks used"*.
- `docs/remote/specs/address-safety.md:55` says *"Sweep view ... labels `new` with the D1 linkability warning"*. The comment at `apps/web/src/lib/sweep.ts:70` says *"the UI shows the linkability warning for `new`"*.
- Reality:
  - `describeDestination` (`sweep.ts:71`) has no call site.
  - `Sweep.tsx:87,96,106` calls `checkDestination(destination, target.owner, loaded)` with no `known` list.
  - Nothing queries destination history (`eth_getTransactionCount`/balance, as D1 recommended).
  - No local record exists of destinations used in earlier sweeps.
  - The Sweep page shows only the static notice at `Sweep.tsx:128-130`.
- Exploit: a seller sweeps 10 payments, one after another, to their exchange deposit address. No warning is shown at any point, although the doc they were told to read says the app warns. All 10 one-time addresses, and so all 10 payers, are publicly joined to one identified wallet (D1 x N).
- Related: wallet-safety-01 in this round covers the address-poisoning side of the same dead code.
- Fix:
  - Keep an encrypted local list of used destinations (tag vault) and warn on reuse.
  - Do an opt-in history check through the user's RPC.
  - Until then, remove the sentence from the user doc.

### PRIVACY-E2E-05 (low, carried from round-audits/policy-scheme F-G, still open): scheme-2 policy hash links all of a payee's payments

- Every `GhostPayPolicyRouter` payment carries `PolicyRef{owner, policyHash}` in calldata (`interfaces/IGhostPayPolicyRouter.sol:18-20`, checked at `GhostPayPolicyRouter.sol:236-242`).
- `policyHash = keccak256(destination, delay, limitsRoot)` has no salt (`packages/policy-scheme/src/policy.ts:53-60`).
- Deployed accounts store `destination` and `policyHash` publicly (`PolicyAccount.sol:72-82,131-136`).
- So all payments to one scheme-2 meta-address share one public `policyHash`, and the destination can be brute-forced from candidate lists. The prior round measured about 19k hashes/s in JS.
- `PolicyAccountFactory.sol:25` says *"The event deliberately omits owner and policy data to avoid additional linkability"*. That is true for the event, but the deploy calldata and the account storage expose everything.
- Not reachable from the web app today (the scanner uses scheme 1 only), hence low. The status is unchanged since round-audits, so it is not a regression.
- Fix: add a salted commitment (factory and account change), or document scheme 2 as payee-linkable in user docs before exposing it.

### PRIVACY-E2E-06 (low): the in-app advice for a failed direct sweep links the seller's wallet

- `apps/web/src/lib/sweep.ts:249-251`: *"The stealth address has no native coin for gas. Use the relayer, or send a small amount of native coin to it first."*
- The common way to follow this advice is to send native coin from the seller's main wallet. That creates a public `wallet -> one-time address` edge before the sweep. The user doc warns about this (`sweep-and-gas-privacy.md` item 4), but the error message the user actually sees at that moment does not.
- Fix: append "funding it from your own wallet links that wallet to this payment".

### PRIVACY-E2E-07 (low): a relayer quote leaks the sweep plan before the user commits

- `Sweep.tsx:84-89` -> `sweep.ts:98` -> `relayerClient.ts:73` POSTs `{owner, destination, amount}` to `/v1/quote`, from the user's IP.
- The fee does not depend on `destination`. The relayer uses it only for the equality checks and the HMAC binding (`apps/relayer/src/service.ts:231-253`).
- A user who requests a quote, sees the fee, and then switches to "Directly" has already given the relayer operator `IP <-> one-time address <-> destination`, with nothing on chain involving the relayer.
- Fix: quote without the destination (bind the destination only in the signed order), or state the disclosure next to the quote button.

### PRIVACY-E2E-08 (info): privacy docs and the threat model do not match the code

- `docs/user/receive-and-scan.md` says *"Today the app still shows announced amounts without checking the chain balance"* and *"The app shows included, not final"*. `verifyReceipt` (claimed/pending/verified, finality depth) now exists.
- `THREAT_MODEL.md:91,164` still lists S3-02 as "not yet / in progress", and its scan-flow diagram omits the per-match RPC reads from 02.
- `privacy-limits.md` RPC row: see 02. Relayer row ("hashed IP"): matches the code (`limiter.ts:43-113`, HMAC with a rotating salt).
- `BtcView.tsx:187`: see 01.
- `apps/relayer/PRIVACY.md:8` mentions `trustProxyHops`, but the code uses `trustedProxies` (`server.ts:118`).

### PRIVACY-E2E-09 (info): scan checkpoints reveal seller activity on the device

- `apps/web/src/lib/scanClient.ts:220-253` stores `ghostpay.scan.checkpoint.v1.<chainId>` = `{nextBlock, last{number,hash}}` in plaintext `localStorage`.
- Anyone with access to the browser profile learns that this device belongs to a GhostPay seller, on which chains, and when it last scanned. The threat model mentions only settings and RPC URLs in `localStorage`.
- Fix: optionally keep checkpoints inside the encrypted tag vault, and disclose this in `privacy-limits.md`.

## Checked and found consistent (no finding)

- Invoice encryption: the AES-GCM key travels in the fragment, and both the UI (`CreateInvoice.tsx:185,198`) and the docs say so honestly.
- Fragment auto-clear: `App.tsx:60-75`. History persistence is known (S3-03).
- Router metadata (`core-crypto/src/metadata.ts`) carries only tag, selector, token and net. No invoice id or nonce goes on chain.
- The local receipt (`payExec.ts:149-167`) holds the invoice nonce. It is downloaded only after a confirm dialog, and nothing is sent anywhere.
- Ephemeral keys are freshly derived per `build()` (`adapter.ts:183-185`).
- The jitter delay uses a CSPRNG and runs before wallet confirmation (`jitter.ts:9-24`). The docs describe it correctly as friction, not anonymity.
- The relayer stores only HMAC'd IP buckets in memory, and logs only requestId, route, status and txHash (`server.ts:213-218`, `service.ts:472`).
- Relayer `feeTo` must equal the configured address (`service.ts:269`), so it cannot be used for per-user tagging.
- BTC keys come from an independent random seed (`features/btc/wallet.ts:23-44`), so EVM and BTC keys are not reused.
- Tron reuses the scheme-1 secp256k1 keys (`tron-adapter/src/meta.ts:16-41`): `st:trx:` and `st:eth:` encode the same bytes. This is a stable cross-chain identifier, the same class as D3 and not new. Tron is not wired into the web app.
- The web app CSP has no third-party origins. The static host learns the chain id through the manifest fetch, which is covered by the "which app files you fetched" row in the docs.

## Not reviewed

- Solana stealth package (`packages/solana-stealth`) and the Tron scan, tx and RPC code paths (only key reuse was checked).
- `packages/external-pools*`, `pool-*`, `payer-hiding-contracts`, `payer-sponsor`, `btc-payjoin`, `confidential-*`. These are not reachable from the app flows reviewed.
- Registry publishing (`features/registry`), beyond the documented wallet-to-meta-address link.
- Wallet discovery and EIP-6963 metadata exposure (`lib/wallet.ts`).
- Ops and deployment (`infra/`) log retention in practice. Only the relayer code paths were read.
- Timing side channels in the scanner worker, and browser fingerprinting.
- No dynamic network traces were captured. Findings 01 and 02 are derived from the call sequences in code, not from captured RPC or Esplora logs.
