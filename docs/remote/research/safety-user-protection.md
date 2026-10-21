# Research: protecting users from phishing, mistakes and hostile counterparties

Date: 2026-10-21 (all retrieval dates). Branch `claude/remote-extensions-1`. Scope: user-facing safety of the static web app, relayer client, invoice links and sweeps. Repo-internal claims cite audit IDs (S3-xx, G-xx, D-x) from `docs/audits/` and `docs/threat-model/THREAT_MODEL.md`; items from `docs/remote/audits/*` are haiku output and **unverified**.

## 0. Method and reachability

- Read: README, `docs/remote/modules-needed.md`, `specs/address-safety.md`, `specs/tx-review.md`, THREAT_MODEL (4.2, 6.1, 6.2, D7), `apps/web/public/_headers`, `apps/web/src/lib/{wallet,payExec,pay,sweep,settings,release}.ts`.
- Reachable (2026-10-21): `raw.githubusercontent.com` (ERCs/EIPs, Permit2 README), WebSearch.
- **Unreachable**: `www.usenix.org`, `www.nccgroup.com` (DNS fail); `ensdomains/docs` raw path and ERC-7702 raw path returned 404 (path guesses, not host blocks). Secondary summaries via WebSearch are marked "(secondary)".
- Nothing here was tested against a live wallet; the app has never run against a real wallet (README).

## 1. What the repo already does (do not rebuild)

- Chain mismatch: `wallet.ts:140-156` `connectWallet(wallet, expectedChainId)` reads `eth_chainId`, tries `wallet_switchEthereumChain`, re-reads, refuses on mismatch. Invoice chain is fixed by the invoice.
- Token allowlist per chain (`pay.ts:91`), "not on the allowlist" blocker.
- Approval is exact (`payExec.ts:62-82`: `buildApproveTx(token, spender, need)` with `assertApproveTx`); permit is exact-amount with 20 min deadline and signer recovery check (`payExec.ts:102-113`).
- Router payments: `decodePaymentCalldata`/`assertPreviewMatchesCalldata` (preview = calldata).
- CSP `script-src 'self'`, no inline script, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`; fragment-carried invoices (key never sent to host).
- Defaults: no RPC, no relayer URL, payment disabled without manifest (`settings.ts:16-18`, README).
- Known open (not new): S3-01 manifest unauthenticated (High), S3-04 hash widget ineffective, S3-09 sweep token/gas from forgeable metadata and one RPC, S3-12 bidi text, S3-19 approve-before-preview, S3-22 wallet picker lookalikes, D1 sweep destination, D7 frontend compromise = total.

## 2. Findings from primary sources

1. **Address poisoning is industrial.** Tsuchiya, Dong, Soska, Christin, "Blockchain Address Poisoning", USENIX Security 2025, arXiv:2501.16681 (<https://arxiv.org/abs/2501.16681>). Per abstract via search (secondary; usenix.org unreachable): 6,633 incidents, >= USD 83.8M lost, ~270M attack transactions against ~17M victims on Ethereum+BSC over two years; users copy from history. Implication: any "recent counterparties" list or paste-into-sweep flow is a target.
2. **Signature drainers dominate losses.** Scam Sniffer annual reports (<https://drops.scamsniffer.io/?p=971>, <https://drops.scamsniffer.io/scam-sniffer-2025-crypto-phishing-losses-fall-83-to-84-million/>, secondary summaries, own-methodology estimates): 2024 about USD 494M, Permit signatures 56.7% of large cases; 2025 USD 83.85M, drop attributed by commentators to wallet warnings and revoke tooling (opinion, not measured). New EIP-7702 delegation signatures flagged. Implication: GhostPay's permit and EIP-712 sweep signatures look exactly like drainer asks; users trained to refuse them or to sign anything.
3. **Permit properties** (ERC-2612, <https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-2612.md>, 2026-10-21): front-runnable (no loss to signer), zero-address `ecrecover` pitfall, relayer censorship bounded by `deadline`, ERC-20 approval race applies, cross-chain replay if domain separator is cached across a chain split. EIP-712 (<https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-712.md>): wallets "should refuse signing if [chainId] does not match the active chain"; replay protection is the application's job.
4. **Permit2** (<https://raw.githubusercontent.com/Uniswap/permit2/main/README.md>): expiring allowances and `SignatureTransfer` (single-use, leaves no allowance) exist precisely to avoid hanging approvals. Relevant model for "approve exact, expires, or none".
5. **Frontend compromise defeats address checks.** Bybit Feb 2025 (secondary only; NCC unreachable): injected JavaScript served from Safe{Wallet}'s cloud storage showed signers a benign transfer while the signed payload was a delegatecall; accounts differ on what hardware wallets displayed. Squarespace Domains hijacks July 2024 (Krebs, <https://krebsonsecurity.com/2024/07/researchers-weak-security-defaults-enabled-squarespace-domains-hijacks/>, secondary; cause disputed between researchers and Squarespace): DeFi frontends redirected at DNS. Implication: the app's own preview is not an independent check (already D7); only the wallet's own display and out-of-band verification are.
6. **Clear signing** ERC-7730 (<https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7730.md>, Draft): JSON descriptors binding contract address+chainId to human display (`intent`, `interpolatedIntent`, field formatters); the spec itself warns formatting can make unsafe transactions look benign and requires `context` binding. Implication: publish a descriptor for `GhostPayRouter`/`GhostPaySweepRelayer` so wallets that support it render "Pay X TOKEN to invoice, fee Y"; no wallet dependency on our side.
7. **Wallet-side origin binding exists for sign-in only** (ERC-4361, <https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-4361.md>): wallet compares message `domain` with request origin and must reject mismatch. EIP-712 has no equivalent; so GhostPay's typed-data `domain` cannot tell a wallet which website asked. Do not rely on wallet phishing protection to catch a lookalike GhostPay host.
8. **Provider discovery** (EIP-6963, <https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-6963.md>): `rdns`/`name` are self-attested; icons must render via `<img>`; duplicate `uuid` is a misbehaviour signal. Matches S3-22.
9. **Chain handling** (EIP-1193 <https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-1193.md>; EIP-3085 <https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-3085.md>): consumers must not assume chain/account stay current; handle `chainChanged`/`accountsChanged`; sign only with the chainId you chose, never one an RPC reports.
10. **Warnings** (Akhawe and Felt, "Alice in Warningland", USENIX Security 2013; usenix.org unreachable, figures from search summary, secondary): over 25M impressions; phishing/malware bypass ~10% Firefox vs ~25% Chrome; SSL warning bypass ~33% vs ~70%; presentation (opinionated, hard-to-click-through design) changed behaviour; technical users bypassed more. Implication: a warning with an easy "continue" and generic wording will be clicked through; reserve hard stops for high-precision signals and keep frequent soft notices out of the way. 2013 browser data, not wallets: apply as a design heuristic only.
11. **ERC-5564** (<https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md>) security section covers spam and funding links only; says nothing on announcement authenticity. Consistent with S3-02 (forged scanner amounts): never display "received X" from an announcement alone.

## 3. Recommendations

Effort S <= 2 days, M <= 2 weeks, L > 2 weeks. "Decision" = needs owner choice, cost or external service.

### R1. Official-origin pinning and lookalike-domain defense
- Threat: phishing clone or DNS hijack of the host (D7, 1.2, finding 5).
- Change: (a) project publishes one canonical origin list in `SECURITY.md` and in the signed release manifest; (b) app compares `location.origin` to a compiled-in list (`apps/web/src/lib/release.ts`) and, if different (clone host, `ipfs.io` gateway, localhost), shows a persistent non-dismissable banner "Unofficial host: verify before paying", with a developer-mode override; (c) `scripts/` emit an `origins.json` inside the hashed bundle. A clone can delete the check, so the real value is for forks/mirrors that keep code unmodified and for documentation; say so in UI help. (d) Recommend users install as PWA from the canonical origin or bookmark it; add `<link rel=canonical>`.
- Effort: S. Residual: attacker removes the check; only external verification (R2) helps. Priority: P2. Decision: yes, needs the domain (README: no official host yet, ADR-0015).

### R2. Release-check UX with signed manifest
- Threat: modified bundle served by host/CDN (S3-04, D7).
- Change: replace the same-origin hash widget with: detached signature over `SHA256SUMS` + deployment manifest (minisign or sigstore, per release.yml attestation); a "Verify this release" page that shows the hash, signer fingerprint, and a copy-paste offline command (`scripts/verify-release.sh`); signer fingerprint pinned in README, docs and every release note on at least two independent channels. Optional: ship the app also as a signed, versioned archive users can open from disk. Label the in-page hash as "informational, cannot detect a compromised host".
- Effort: M. Residual: users rarely verify; a compromised host still ships good-looking UI. Priority: P1 (blocks any mainnet; overlaps module rank 1/9). Decision: yes, signing key custody.

### R3. Authenticated manifest, on-chain read-back shown to the user
- Threat: poisoned router/fee recipient (S3-01, High).
- Change: compile manifest into the hashed bundle; on pay, read `FEE_RECIPIENT()`, `FEE_BPS()`, `ANNOUNCER()`, code hash from two independent RPCs; show router address + chain + fee in the review with an explorer link. Already planned; listed because it is the top safety item.
- Effort: M. Residual: compromised bundle (D7). Priority: P0. Decision: no.

### R4. Address-safety package and UI rules
- Threat: address poisoning, bidi/homoglyph text, wallet-name spoofing (finding 1, 8; S3-12, S3-22; D1).
- Change: implement `docs/remote/specs/address-safety.md`; add: (a) sweep destination picker defaults to the user's own saved/connected addresses, no free paste unless "advanced"; (b) never populate "recent addresses" from on-chain history, only from addresses the user explicitly saved or sent from this app; (c) EIP-55 strict parse; paste of an address that matches a saved one in first/last 4 nibbles but differs is a hard stop; (d) full address always shown in 4-char groups, middle highlighted alternating; (e) `sanitizeDisplayText` for invoice memo and wallet names; wallet icons via `<img>` only; (f) displayed "from" addresses on scan results come with "unsolicited transfers from unknown senders are ignored" (zero-value/dust ERC-20 transfers appear in explorers).
- Effort: M. Residual: first-time destination has nothing to compare; homoglyphs inside one script. Priority: P1. Decision: invoice schema bump for text rejection (owner/versioning).

### R5. Bearer-link phishing: malicious invoice links
- Threat: attacker mails "invoice" with own meta-address; payer pays attacker (S row 137; haiku M-1 unverified).
- Change: payee identity block on the pay screen: `payeeTrust` states (`pinned` green, `unpinned_valid_signature` amber, `invalid` red/blocked). For unpinned, require typing the first 6 and last 4 of the meta-address fingerprint (or comparing a 3-word fingerprint) read from a second channel; offer "Pin this seller" after first successful payment with a user-chosen label. Show invoice age and `expiresAt`; refuse expired invoices; show "link received via: bearer link, anyone holding it can read/redirect payment? No: only signature binds payee" wording consistent with THREAT_MODEL row S. Strip tracking params; open links only via fragment so referrer never leaks.
- Effort: M. Residual: attacker compromises the out-of-band channel; seller impersonation with a fresh signed invoice is indistinguishable without a pin. Priority: P1. Decision: UX copy; pin storage in IDB (existing `idbStore.ts`).

### R6. Wrong-chain / wrong-token payments
- Threat: pay on wrong chain, spoof tokens with same symbol, native vs wrapped confusion (finding 9, EIP-7528).
- Change: (a) subscribe to `chainChanged`/`accountsChanged` in `wallet.ts` and invalidate any prepared payment on change (check this is done; add test); (b) review screen prints chain name + id, token symbol + short address + explorer link, decimals-formatted gross, minNet, fee in the same unit; (c) allowlist entries carry a display name and logo-free label to avoid imagery spoofing; (d) native represented as `0xEeee...EEeE` only for display (ERC-7528), never accepted from invoice as a token address; (e) refuse fee-on-transfer/rebasing tokens by allowlist metadata; (f) for sweeps, token comes only from allowlist, native vs ERC-20 decided by allowlist (tx-review spec).
- Effort: S-M. Residual: a listed token later upgrades maliciously (proxy token); needs periodic review of the allowlist. Priority: P1. Decision: allowlist governance (who adds tokens).

### R7. Approval hygiene
- Threat: leftover or unlimited approvals; drainer-like permit asks (finding 2-4; S3-19).
- Change: (a) keep exact approvals (already); prefer permit when token supports it, but flag USDT-like tokens where `approve` needs reset-to-zero; (b) send approve only after the final review step, bundle approve+pay in one review, and offer "Revoke now" (`approve(router,0)`) on abort or failure; after success verify allowance is 0 and show it; (c) permit `deadline` capped at 20 min (exists) and `value` equals gross only; add assertion in `tx-review` that spender == manifest router; (d) "Approvals" panel in Settings listing allowances of the connected account to the router/sweep relayer per allowlisted token on this chain via `allowance()` reads, one-click revoke; (e) copy: "This signature lets the GhostPay router take exactly N TOKEN once, until HH:MM. It cannot take more." Never ask for `setApprovalForAll`, `increaseAllowance`, Permit2 batch, or EIP-7702 authorizations; `tx-review` returns Unknown for them so the app refuses.
- Effort: M. Residual: wallet UI may still show raw hex; revoke costs gas. Priority: P1. Decision: no.

### R8. Plain-language calldata review and simulation
- Threat: UI/preview drift or compromised bundle (finding 5, 6); S3-09, haiku L-04.
- Change: implement `specs/tx-review.md`; add `docs/descriptors/ghostpay-router.7730.json` and sweep relayer descriptor per ERC-7730 (`context` binding to manifest addresses/chainIds, `interpolatedIntent` like "Pay {amount} to invoice, fee {fee}"); submit to the wallet vendors' registries (Ledger descriptor registry; unverified existence/process, check at time). Add optional `eth_call` simulation on two RPCs showing balance deltas for payer/seller stealth/feeRecipient; label "informational". Show EIP-712 sweep typed data as a decoded table before `eth_signTypedData_v4`.
- Effort: M (decoder) + S (descriptors). Residual: simulation lies; compromised bundle changes decoder too, so the wallet's display and the descriptor are the independent leg. Priority: P1 (decoder), P3 (descriptors, dependent on vendor uptake). Decision: vendor registry process.

### R9. Relayer-malicious-fee and sweep-fee surprises
- Threat: relayer quotes huge fee or wrong `feeTo`; one lying RPC inflates gas (S3-09b; haiku M1/M2 unverified).
- Change: client-side caps before signing the relayed sweep: `fee <= min(maxFeeShareBps * amount, absolute cap)` default 5% and refuse otherwise, `feeTo == manifest feeRecipient`, `deadline <= now + 30 min`, `amount` shown net of fee with "you receive" first; direct-sweep `maxFeePerGas = min(2 x median(gasPrice from two RPCs), cap)` and share-of-amount cap; refuse sweeps where fee > balance/2 with an explanation and "wait" option; show exact fee in token and approx native. Contract side already binds fee in the signed struct (verify in `GhostPaySweepRelayer` tests). Relayer URL is empty by default; keep, and warn on first non-default relayer: "this server sees your IP and the one-time address".
- Effort: S-M. Residual: user accepts a 5% fee they cannot avoid on dust; unavoidable economics. Priority: P1. Decision: default cap values.

### R10. Clipboard hijacking and paste hygiene
- Threat: clipboard-swapping malware replaces addresses/links (no primary source retrieved; treat as well-known but unverified here).
- Change: after any paste of an address, re-render it in fixed groups and require the user to confirm first/last 4; offer QR and share-link flows instead of copying addresses; "Copy" buttons for the seller's meta-address show the fingerprint and re-read the clipboard (`navigator.clipboard.readText` needs permission; skip if denied) to detect a swapped value; do not auto-copy secrets; clear sensitive fields on blur. Cannot defeat malware that also controls the display.
- Effort: S. Residual: full endpoint compromise. Priority: P3.

### R11. Safe-by-default settings
- Threat: dangerous defaults.
- Change: keep: no default RPC/relayer, payment off until authenticated manifest, testnets only. Add: (a) advanced switches (custom token, custom RPC, direct sweep to arbitrary address, unpinned payee) hidden behind "Advanced" with a one-line risk each and default OFF; (b) mainnet chains require typing the chain name on first enable; (c) session auto-lock (default 15 min) clearing in-memory keys (`session.ts`); (d) default keystore export reminders; (e) `localStorage` RPC URLs plain-text caveat shown (exists); (f) telemetry none (exists).
- Effort: S-M. Residual: users enable everything. Priority: P2. Decision: no.

### R12. Warnings that work
- Threat: alert fatigue (finding 10).
- Change: three tiers only. Hard stop (no continue button; only "Back"; override requires developer mode): lookalike of saved address, token not allowlisted, chain mismatch, fee over cap, manifest/on-chain mismatch, unknown selector. Interrupt (explicit typed or checkbox confirmation, specific text naming the risk): unpinned payee, new sweep destination, unofficial host. Info (inline, never modal): everything else. Banned: generic "be careful" modals, red/amber on routine states. Warnings state the consequence and the one action. Usability-test with 5-8 people before mainnet (see `docs/remote/usability`). Track no telemetry: measure in moderated tests only.
- Effort: S (rules) + M (test round). Residual: motivated users still bypass (Akhawe: technical users bypass more). Priority: P2. Decision: budget for tests.

### R13. Social engineering
- Threat: fake support asking for keystore/seed, "urgent" invoices.
- Change: app never asks for a seed phrase and states this on key screens; keystore import wording "Only import a file you exported from GhostPay"; docs page "What GhostPay will never ask": seed phrase, keystore password, remote-access, sending a test payment first to an address given by DMs. SECURITY.md lists the only official contact channels (owner to confirm). Add a short "paid wrong person?" page.
- Effort: S. Residual: users ignore docs. Priority: P3. Decision: official channels list.

### R14. Mistake recoverability
- Threat: irrecoverable loss from sending to wrong address/chain, lost keys, expired invoices.
- Change: (a) show a two-step "review then send" with a 5 s cooldown on the first mainnet payment only; (b) payment receipts saved locally (tx hash, router, invoice id) exportable; (c) a "Something went wrong" page: wrong-chain payment recovery (funds to a stealth address on chain X are spendable only if the seller scans that chain; seller can sweep on any EVM chain where the address key works, since the one-time key is chain-agnostic. State only if verified by test, **unverified**); unspendable-token rescue guidance; (d) keystore backup prompt before the first receive; seller key backup verification (re-enter part of the file hash); (e) contracts have no admin so mistakes at contract level are final: add on-chain `refund` is out of scope, document honestly; recommend small first payment ("test with 1 USDC") in the pay flow for first-time payees; (f) cancel/replace guidance for stuck txs.
- Effort: M. Residual: immutable contracts mean no recovery for logic bugs. Priority: P2. Decision: whether to add a first-payment test flow (UX scope).

### R15. Approvals and signatures drainer-pattern self-check
- Threat: the app being mistaken for, or turned into, a drainer.
- Change: CI test that scans built code paths for any use of `setApprovalForAll`, `increaseAllowance`, `permit` with `value = MaxUint256`, `eth_sign`, `personal_sign` with non-text data, `wallet_requestExecutionPermissions`/7702 authorization (extend `scanBundle.test.ts`); fail the build. Publish what GhostPay ever asks a wallet to sign (exhaustive list) in `docs/user/` so users can pattern-match and reject anything else.
- Effort: S. Residual: none for this class beyond bundle compromise. Priority: P2. Decision: no.

## 4. Ranked roadmap

| Rank | Item | Threat | Effort | Priority | Decision / cost |
|---|---|---|---|---|---|
| 1 | R3 authenticated manifest + on-chain read-back shown | poisoned router/recipient | M | P0 | no |
| 2 | R2 signed release + verify page + pinned signer fingerprint | modified bundle | M | P1 | signing key custody |
| 3 | R8 tx-review decoder + typed-data decode (before signing) | preview drift, S3-09 | M | P1 | no |
| 4 | R9 relayer fee/feeTo/deadline caps; two-RPC gas | malicious fee | S-M | P1 | default caps |
| 5 | R7 approval hygiene (late approve, revoke, panel, refuse exotic asks) | lingering approval, drainer lookalike | M | P1 | no |
| 6 | R4 address-safety package + destination rules | poisoning, bidi | M | P1 | schema bump |
| 7 | R5 payee trust UI, pinning | malicious invoice | M | P1 | UX copy |
| 8 | R6 chain/token review and events | wrong chain/token | S-M | P1 | allowlist governance |
| 9 | R1 origin banner + canonical origin list | lookalike domain | S | P2 | needs domain |
| 10 | R11 safe defaults, auto-lock | dangerous defaults | S-M | P2 | no |
| 11 | R12 tiered warnings + usability round | alert fatigue | S+M | P2 | test budget |
| 12 | R14 recoverability (receipts, backup checks, test payment) | irreversible mistakes | M | P2 | UX scope |
| 13 | R15 drainer-pattern CI guard + signing list doc | trust confusion | S | P2 | no |
| 14 | R8b ERC-7730 descriptors | wallet-side clear signing | S | P3 | vendor process |
| 15 | R10 clipboard hygiene | clipboard swap | S | P3 | no |
| 16 | R13 social-engineering docs | impersonation | S | P3 | official channels |

## 5. Caveats

- No claim here has been exercised against a real wallet or chain.
- Statistics (finding 1, 2, 10) come from abstracts or search summaries; verify against the full papers/reports before quoting externally.
- Bybit and Squarespace accounts are secondary and partly disputed.
- Wallet-vendor behaviours (clear signing registries, phishing lists, 7702 handling) change quickly and were not checked.
- ERC-7730 is Draft; ERC-7715 (<https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7715.md>) was read for least-privilege and expiry principles only; GhostPay should not adopt it.
