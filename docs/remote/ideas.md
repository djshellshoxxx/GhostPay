# GhostPay extension ideas

Branch `claude/remote-extensions-3`, 2026-10-21. Status: **proposals only**. Nothing here is specified, reviewed, built or legally vetted. Inputs: README, MASTER_BLUEPRINT, POST_LAUNCH roadmap (Features 1-6), FEE_SCHEDULE, `docs/user/privacy-limits.md`, THREAT_MODEL (D1-D10, S3-xx), `docs/remote/research.md`, `docs/remote/gap-analysis.md`. Module names below come from those documents and were not re-checked against source.

## Ground rules used for every idea

1. **No anonymity claims.** Payer, token, amounts, timing and router use stay public. Each idea says what it does *not* hide.
2. **Weakening flag.** An idea tagged **[WEAKENS]** reduces privacy compared with today, even if optional. These default off and need explicit warning copy.
3. **Custody/legal flag.** An idea tagged **[LEGAL]** touches custody, money transmission, sanctions, tax or data-controller duties. This is not legal advice; owner counsel decides (FEE_SCHEDULE section 6, ADR-0006).
4. **Contracts are immutable.** Anything needing a router or relayer contract change means a new deployment plus audit. It is marked "needs contract change" and costed as L.
5. **Hosted services see everything they are given.** Any hosted view-key, indexer or push service is excluded; self-hosted software is fine (see rejected list).
6. **Egress discipline.** New network calls must fit the CSP and the bundle scan; every idea that adds a third party says so.

**Scoring.** Score = Value (1-5) + Privacy contribution (1-5, 2 = neutral, 1 = weakens) + Strategic fit (1-5), minus effort (S 0, M 1, L 2), minus 1 if [LEGAL], minus 1 if [WEAKENS]. Maximum 15. It is a sorting aid, not a measurement. Effort: S under a week, M weeks, L a quarter or needs a contract/design decision. Risk is delivery plus security risk.

---

## A. Sender and receiver privacy

### A1. Link hygiene: paste-to-import and passphrase-protected invoice links
- **Pitch:** Let payers paste an invoice into the app instead of clicking it, and let sellers add a passphrase sent over a second channel.
- **Benefit:** The link stops landing in browser history (S3-03), chat link previews and clipboard managers as a fully readable invoice.
- **Privacy impact:** Reduces *local and third-party leakage of the invoice contents*. Does **not** hide anything on-chain, does not revoke a link already shared, and the passphrase can still be phished or leaked. A pasted link is still readable by page scripts and extensions.
- **Design/deps:** `invoice-schema` envelope gets an optional scrypt-wrapped key mode (same KDF family as `keystore.ts`); `Pay` view gets an import box; "Create" offers "open link" vs "copy payload". Reuses AES-GCM envelope and strict parser.
- **Effort:** S. **Risk:** Low (new envelope version needs parser fuzz). **Legal:** none.
- **Score:** 4+4+4 = **12**.

### A2. Per-client (per-invoice-group) meta-addresses
- **Pitch:** Derive a separate meta-address per client from one master seed so two invoices no longer prove "same seller" (D3).
- **Benefit:** Clients cannot compare notes and link each other's payments to you via the meta-address.
- **Privacy impact:** Removes the *meta-address* linkage only. Same payer, same router, same sweep destination, same invoice-signing key or same relayer still link things. Needs distinct view keys per child (a shared view public key would itself link them), so **scan cost grows linearly** with the number of children (one ECDH per child per announcement; view tags help only per child). Seller must still back up one seed.
- **Design/deps:** `core-crypto` hierarchical derivation (needs an ADR and test vectors), `keystore.ts`, `scannerCore.ts`, tag vault (child index in records). Registry publication (ERC-6538) only for a public "root" child.
- **Effort:** M. **Risk:** Medium (derivation design errors are unrecoverable; scan cost). **Legal:** none.
- **Score:** 4+5+4-1 = **12**.

### A3. Sweep destination hygiene wizard
- **Pitch:** Before sweeping, check the destination against your own history and offer a fresh destination derived from a separate wallet seed.
- **Benefit:** Directly attacks D1, the largest privacy hole: the payer can follow funds to your destination.
- **Privacy impact:** Local heuristics only (destination reuse, same-amount, near-time sweeps, already-linked addresses). It cannot see what outside analysts or the payer already know, and a fresh destination still links to the stealth address in the sweep transaction. Not an anonymity guarantee.
- **Design/deps:** `Sweep` view, `lib/sweep.ts`, tag vault for history, gap-analysis item 13; HD destination list needs a small second derivation path (not the stealth seed).
- **Effort:** M. **Risk:** Low. **Legal:** none.
- **Score:** 5+4+5-1 = **13**.

### A4. Randomized sweep timing window
- **Pitch:** Sweep at a random time inside a user-set window instead of immediately after the payment.
- **Benefit:** Weakens the "payment, then sweep within minutes" timing heuristic.
- **Privacy impact:** Timing friction only; no cover traffic. Payer who watches the address still sees the sweep when it happens. The tab or relayer job must stay alive; a pre-signed relayed sweep sits with the relayer (it sees all fields) until it submits, and its deadline is capped at 30 minutes.
- **Design/deps:** Reuse `lib/jitter.ts` CSPRNG and rejection sampling; foreground scheduler like Feature 6, never a stored raw signed tx. Longer windows need a relayer that holds signed sweeps (more trust) or the user's open tab.
- **Effort:** S. **Risk:** Low (stale-balance and nonce handling). **Legal:** none.
- **Score:** 3+3+4 = **10**.

### A5. Multi-relayer selection and self-submit
- **Pitch:** Maintain a signed list of relayers; the client picks randomly or by best quote, and always offers "submit it myself".
- **Benefit:** No single operator sees all sweeps; resilience against censorship; competition on fees.
- **Privacy impact:** Spreads what each operator learns; every chosen relayer still sees owner, destination, amount, fee and timing. Quote shopping itself *discloses* the same sweep intent to several relayers (do not quote-shop by default; pick one). IP still visible unless used with A6.
- **Design/deps:** The `GhostPaySweepRelayer` signature already binds `feeTo` and destination, so any relayer can submit. Needs a relayer list format with signature (like the deployment manifest), `relayerClient.ts` changes, relayer `/v1/info` conformance tests.
- **Effort:** M. **Risk:** Medium (list governance, malicious relayers that only censor). **Legal:** operators carry their own duties (ADR-0006).
- **Score:** 4+4+4-1 = **11**.

### A6. Tor/onion/proxy-aware RPC mode with fixed-window queries
- **Pitch:** First-class support for onion or proxied RPC endpoints, padded fixed block windows, and a "no direct fallback" switch (Feature 5 stage 1).
- **Benefit:** The RPC provider no longer learns your IP together with the addresses you check (D8).
- **Privacy impact:** Protects IP-to-query linkage *only if* traffic really goes through Tor or a proxy. Browsers cannot speak SOCKS, so this means Tor Browser, an onion-reachable RPC gateway, or a user-run local proxy. Does not hide transaction broadcast content, timing, browser fingerprint, or the static host fetch. Padding hides range of interest, not that you scan.
- **Design/deps:** `chain-adapters/rpc.ts` and `logs.ts`, `Settings`, CSP `connect-src` changes (opt-in origins), Playwright egress test; wires in `requestWithFallbackCheck` (gap item 7).
- **Effort:** M. **Risk:** Medium (users misread it as strong anonymity). **Legal:** none.
- **Score:** 4+4+4-1 = **11**.

### A7. Decoy and indirect balance lookups
- **Pitch:** Check a stealth address via a batch of random decoy addresses or via `Transfer` logs instead of a single-address balance query.
- **Benefit:** Hides *which* one-time address you are about to sweep from the RPC provider.
- **Privacy impact:** Weak: decoys are distinguishable if poorly chosen, a provider that logs all queries sees a set including yours, and the sweep or broadcast reveals the address anyway. Meaningful only against passive query logging.
- **Design/deps:** `chain-adapters/rpc.ts` multicall batching, decoys drawn from recent announcement addresses so they look plausible.
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 3+3+3 = **9**.

### A8. Consolidated sweeps [WEAKENS]
- **Pitch:** Sweep many one-time addresses to one destination in one transaction to save gas.
- **Benefit:** Cheaper and fewer prompts.
- **Privacy impact:** **Weakens.** It publicly links every swept address to each other and to your destination. Each payer who knows their one-time address can then see your *other* incoming payment addresses and amounts. Do not enable by default.
- **Design/deps:** Relayer batch endpoint, multi-signature sweep contract change (needs contract change) or wallet batching of direct sweeps.
- **Effort:** L. **Risk:** Medium. **Legal:** none beyond normal.
- **Score:** 3+1+2-2-1 = **3**. Recommend not building except as an explicit advanced "I accept the link" option, if ever.

### A9. Pooled or delayed sweep pool [LEGAL] [WEAKENS-trust]
- **Pitch:** Deposit swept funds into a shared pool and withdraw later to a new address.
- **Benefit:** Would break the sweep-to-destination link.
- **Privacy impact:** In principle larger anonymity set; in practice it is a **mixer**, requires holding funds, needs ZK proofs the project has not specified (Blueprint: do not claim a SNARK hides linkage by itself), and its set would start near zero.
- **Design/deps:** New custody contracts, circuit, relayer; conflicts with "no custody, no admin" and ADR-0006.
- **Effort:** L+. **Risk:** Very high (exploits, sanctions precedent for mixers). **Legal:** severe red flag (money-transmission, sanctions, criminal exposure for operators).
- **Score:** 2+2+1-2-1 = **2**. **Not recommended.** Listed because it was asked for; use A3, A4, A6 instead.

### A10. Payer-side fragmented payments
- **Pitch:** Let the payer split one payment into several random-sized payments to separate one-time addresses.
- **Benefit:** Defeats naive "exact invoice amount" matching by analysts and by other invoice holders.
- **Privacy impact:** Sum, token, payer, time and router use remain visible; several announcements from one payer in one window are an obvious cluster. Costs extra gas and extra router fees (rounding per payment). Mostly cosmetic.
- **Design/deps:** `payExec.ts` multi-call (wallet batch, see D8) and seller scanner summing by invoice nonce (needs per-invoice reconciliation, gap item on Scan).
- **Effort:** M. **Risk:** Medium (seller must accept partial payments). **Legal:** none.
- **Score:** 2+2+2-1 = **5**.

### A11. Ephemeral per-invoice signing keys (option)
- **Pitch:** Sign each invoice with a fresh key instead of one long-lived invoice-signing key.
- **Benefit:** The signing key no longer links invoices together (a second D3-style identifier).
- **Privacy impact:** Removes signer linkage. Cost: the signature then proves nothing about *who* issued it, which defeats seller pinning (ADR-0002). Offer as a mode, not default for sellers who want recognizable identity.
- **Design/deps:** `invoice-schema` signing, `CreateInvoice`, UI wording about "unpinned".
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 3+4+3 = **10**.

---

## B. Recovery and usability

### B1. Encrypted backup, restore drill and scan-state restore
- **Pitch:** One encrypted archive covering seeds, tags and scan cursors, with a mandatory restore test before first funds.
- **Benefit:** Most real losses are lost devices. Also avoids full rescans (which means fewer range queries) after restore.
- **Privacy impact:** Local only. The archive is as strong as the passphrase (offline guessing possible); an archive file in cloud storage is ciphertext whose existence and size leak. Does not hide anything on-chain.
- **Design/deps:** Feature 4 export/import and key rotation (gap item 8), keystore scrypt format, AAD versioning, round-trip tests.
- **Effort:** M. **Risk:** Medium (data loss bugs). **Legal:** none.
- **Score:** 5+2+5-1 = **11**.

### B2. Shamir (SLIP-39 style) social recovery
- **Pitch:** Split the seller seed into guardian shares, offline and client-side, no on-chain guardian contract.
- **Benefit:** Recovery without trusting one device or a custodian.
- **Privacy impact:** Guardians learn that you hold GhostPay keys and nothing about payments unless threshold shares combine. Threshold collusion or theft equals full key loss. Does not help against a compromised page. Not a substitute for B1.
- **Design/deps:** New audited Shamir library (`THIRD_PARTY.md` review), print/QR share flow, restore view. Not a policy-account recovery (D6 stays separate).
- **Effort:** M. **Risk:** Medium (user error). **Legal:** guardians holding keys is a custody-adjacent question for third-party-operated variants; keep it user-held shares only.
- **Score:** 4+2+3-1 = **8**.

### B3. QR, animated QR and NFC tap
- **Pitch:** Chunked animated QR for large invoices, EIP-681 style payment URIs, and Web NFC tap to deliver the same URI (Android Chrome).
- **Benefit:** In-person and cross-device payments without typing or messengers (which leak the link).
- **Privacy impact:** Keeps the invoice off chat apps and the network. NFC/QR do not hide anything on-chain and a nearby camera or reader can capture the link. Web NFC availability is narrow.
- **Design/deps:** Local QR already exists; add chunking, URI scheme, NFC module behind feature detection.
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 4+2+4 = **10**.

### B4. Installable mobile PWA with passkey unlock
- **Pitch:** Offline-capable PWA caching a hashed bundle, with WebAuthn (passkey) wrapping of the local keystore.
- **Benefit:** Phone-first sellers and payers; faster launches; fewer host requests.
- **Privacy impact:** Fewer contacts with the static host (good); the service worker is a **new update channel** (a compromised host can still ship a malicious worker; same D7 class), and cached assets must be verified against the signed release hash. Passkey PRF support varies; do not weaken the passphrase fallback.
- **Design/deps:** `public/_headers`, build hash manifest, service worker with explicit update prompt, keystore wrap; blocked on ADR-0015 hosting.
- **Effort:** M. **Risk:** Medium. **Legal:** none.
- **Score:** 5+3+5-1 = **12**.

### B5. Local accounting export
- **Pitch:** CSV, JSON, Beancount/ledger and QuickBooks/Xero import files generated entirely in the browser from tags and invoices.
- **Benefit:** Makes the product viable for bookkeeping.
- **Privacy impact:** Local only; the exported file is plaintext, so handle it carefully. Use the invoice's quoted fiat amount, not a price API, so exporting causes **no network request**. Historical price fetches would leak interest to a third party; offer a user-imported price CSV instead.
- **Design/deps:** Tag vault, `invoice-schema`, new export view; warn on plaintext download.
- **Effort:** S. **Risk:** Low. **Legal:** tax treatment varies; label as informational.
- **Score:** 4+2+4 = **10**.

### B6. Selective-disclosure receipts and auditor pack
- **Pitch:** Prove "I received this payment" (tx hash, invoice hash, seller signature, optional proof of control of the stealth address by message signature) without handing over the view key.
- **Benefit:** Tax and audit evidence, payer receipts, dispute resolution, all without exposing every payment.
- **Privacy impact:** Discloses *exactly* the selected payments and that they belong to you. Never offer "export view key" as the easy path, because it reveals the entire history and all future payments. Receipts are bearer-readable if forwarded.
- **Design/deps:** `invoice-schema` signing, message-signature by derived stealth key in the sweep module, a verifier page that reads chain data via the user's RPC (adds an RPC lookup for the verifier).
- **Effort:** M. **Risk:** Low-Medium (misreading of proof semantics). **Legal:** helpful for compliance; not itself a compliance programme.
- **Score:** 5+4+4-1 = **12**.

### B7. Claim-by-transaction-hash and scanner spam filtering
- **Pitch:** Let a payer hand over a tx hash so a payment whose view tag was wrong or hidden is still found (D4), and let sellers filter dust and unknown tokens.
- **Benefit:** No lost payments; a cleaner inbox.
- **Privacy impact:** The tx hash is already public; verification fetches the transaction through the seller's RPC (query leak, see A6). Filters are local. Also verify `Transfer`/`balanceOf` before showing amounts (S3-02).
- **Design/deps:** `scanClient.ts`, `scannerCore.ts`, `Scan.tsx` (gap items 2 and the D4 deep-scan mode), token allowlist, dust thresholds.
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 4+3+4 = **11**.

### B8. Internationalization and accessibility
- **Pitch:** Translations, RTL, axe-checked a11y, screen-reader pass and plain-language privacy copy.
- **Benefit:** Wider reach; accessibility is also a safety property for payment confirmation.
- **Privacy impact:** None directly; locale files must be bundled (no remote translation service). Translation errors in "what is public" copy can overclaim, so privacy strings need native review.
- **Design/deps:** Web DEVIATIONS (i18n missing), Playwright axe projects (gap item 11).
- **Effort:** M. **Risk:** Low. **Legal:** none.
- **Score:** 4+2+4-1 = **9**.

---

## C. Merchant tooling

### C1. Payment links and tip-jar pages
- **Pitch:** A static "pay me any amount" link or page with a QR code; every payment gets a new one-time address.
- **Benefit:** Creators and small shops get a zero-setup way to accept payment.
- **Privacy impact:** A tip jar is **public by nature**: the meta-address in the link is a stable identifier unless combined with A2. Tippers can't see each other's destination addresses, but they all share one meta-address. Pay-what-you-want amounts are public on-chain.
- **Design/deps:** `invoice-schema` "open amount" mode with no expiry, `CreateInvoice`, embed widget (Feature 2).
- **Effort:** S. **Risk:** Low. **Legal:** none beyond fee disclosure.
- **Score:** 4+2+5 = **11**.

### C2. Self-hosted scanner daemon with signed webhooks
- **Pitch:** A headless Node package that holds a **view key only**, scans chain logs and posts signed webhooks to the merchant's backend.
- **Benefit:** Real e-commerce order automation; the web app cannot do this.
- **Privacy impact:** The merchant's server learns every payment to the meta-address (a view key reveals all history and future payments). It never holds spend keys. **A GhostPay-hosted version must not exist**: it would see every customer payment and make the project a data controller. The daemon's RPC queries expose its IP to the provider unless A6 is applied.
- **Design/deps:** Reuse `core-crypto`, `chain-adapters` (logs, reorg safety), finality gating; HMAC-signed webhook payload with retries and idempotency keys; document view-key blast radius. Needs S3-02 balance verification first.
- **Effort:** L. **Risk:** Medium-High (view-key custody on a server). **Legal:** [LEGAL] flag if anyone hosts it for others.
- **Score:** 5+2+5-2-1 = **9**. (Rounded to 9; if the legal flag is not applied because only software is shipped, 10.)

### C3. POS (kiosk) mode
- **Pitch:** A full-screen cashier view that creates an auto-expiring invoice QR per sale and shows "paid" after finality.
- **Benefit:** In-store acceptance with a tablet or phone; pairs with B3 and B4.
- **Privacy impact:** Local scanning; the shop's device holds the view key (use a view-only mode, D2). Customers' payer addresses and amounts are public. Shows "paid" only after verified amount and finality, to avoid forged-announcement display (S3-02).
- **Design/deps:** Scanner worker, invoice creation, PWA, optional NFC; a sale ledger in the tag vault.
- **Effort:** M. **Risk:** Medium (false "paid" is a financial bug). **Legal:** merchant duties (receipts, tax) are theirs.
- **Score:** 5+2+5-1 = **11**.

### C4. Subscriptions as invoice series with push reminders [WEAKENS]
- **Pitch:** Seller schedules invoice links; the payer gets a local reminder file and pays each one (no pull payments).
- **Benefit:** Recurring revenue without custody or allowances.
- **Privacy impact:** **Mildly weakens**: a regular amount at a regular time is a fingerprint that links successive payments to the same payer across addresses. Mitigate with jitter windows (Feature 6) and slightly varied due dates. A pull model via standing token allowances is rejected for now: it puts the payer's funds at risk from a bug in a pull contract (needs contract change).
- **Design/deps:** Invoice templates (C7), ICS calendar export (local), `jitter.ts`.
- **Effort:** M. **Risk:** Medium. **Legal:** consumer-protection rules for recurring billing apply to the merchant.
- **Score:** 4+1+4-1-1 = **7**.

### C5. Refund-from-stealth-address
- **Pitch:** Refund a payment by sending it back from the original one-time address, not from your main wallet.
- **Benefit:** Real shops need refunds, and a wrong-source refund would harm privacy.
- **Privacy impact:** Refunding from the destination wallet would **link your destination to the payer** (**do not do this**). Refunding from the stealth address shows observers a refund edge between that one-time address and the payer, which the payer knew anyway. Needs gas on the stealth address (use the relayer sweep with a refund destination) and the payer address read from the router transaction.
- **Design/deps:** `lib/sweep.ts` with destination = payer, payer address from tx decode, a tag-vault "refunded" state; the fee on the original payment is **not** returned (router has no refund path).
- **Effort:** M. **Risk:** Medium (wrong-address refund is final). **Legal:** refund obligations and dispute handling are the merchant's; no custody involved.
- **Score:** 4+3+3-1 = **9**.

### C6. Split payments and revenue share [LEGAL]
- **Pitch:** One checkout pays several parties, each to their own one-time address.
- **Benefit:** Marketplaces, agencies and collaborators share revenue automatically.
- **Privacy impact:** Multiple announcements in one transaction tell observers the payees are related (same checkout). Each payee's meta-address stays unlinked unless reused. A contract-level split changes the fee path and needs a new router deployment (needs contract change, L). A client-side batch (D8) needs no contract change but is not atomic without wallet support.
- **Design/deps:** `payExec.ts` multi-recipient, invoice schema "payees" array with per-payee amounts, fee rounding per leg.
- **Effort:** M (client batch) or L (contract). **Risk:** Medium-High. **Legal:** paying third parties on someone's behalf can look like money transmission if an operator is in the flow.
- **Score:** 3+2+3-1-1 = **6**.

### C7. Invoice templates and encrypted client directory
- **Pitch:** Reusable line-item templates and an encrypted address book of clients stored in the tag vault.
- **Benefit:** Faster invoicing and consistent labelling.
- **Privacy impact:** Stored encrypted locally; plaintext in memory while unlocked. Same limits as Feature 4. Clients' names never go on-chain.
- **Design/deps:** Tag vault schema versioning, `CreateInvoice`.
- **Effort:** S. **Risk:** Low. **Legal:** personal-data handling for client data is the merchant's.
- **Score:** 3+2+3 = **8**.

---

## D. Ecosystem

### D1. Name resolution for sellers (ENS-style) with privacy guards [WEAKENS]
- **Pitch:** Resolve `shop.eth` to a meta-address through an ENS text record or off-chain resolver.
- **Benefit:** Memorable, typo-resistant payee names.
- **Privacy impact:** **Weakens for the seller**: a name ties a human identity to the meta-address publicly (like ERC-6538 registry publication). For the payer, resolution leaks "I am about to pay shop.eth" to the resolver/RPC unless done via the user's own node or Tor (A6). Phishing risks: homoglyph names, expired names re-registered by an attacker. Safer pattern: resolve once, then embed the meta-address in the signed invoice so payers don't need lookups.
- **Design/deps:** `chain-adapters` ENS resolution (CCIP-Read through the user's RPC only), cache, homoglyph warning, signed-profile fallback (D6).
- **Effort:** M. **Risk:** Medium. **Legal:** none; trademark disputes over names are the seller's.
- **Score:** 4+1+4-1-1 = **7**.

### D2. Watch-only mode and air-gapped sweep signer
- **Pitch:** Keep the spend key out of the online page: scan with a view-only profile, sign sweeps on an offline page or CLI via QR round trip.
- **Benefit:** Reduces D7 (frontend compromise = total compromise) for the important keys.
- **Privacy impact:** Neutral to positive: the online page holds only the view key (still reveals your history if stolen). The offline signer must itself be a verified build; QR transfers show the sweep (destination, amount) to whoever looks. Does not stop the online page from showing a wrong destination if the offline signer shows it too, so the signer shows the full decoded sweep for confirmation.
- **Design/deps:** `keystore.ts` split profiles, stealth key tweak done offline (`core-crypto`), `chain-adapters/sweep.ts` EIP-712 builders, animated QR (B3). Hardware wallets cannot apply the stealth tweak today (see D3).
- **Effort:** L. **Risk:** Medium-High. **Legal:** none.
- **Score:** 5+4+5-2 = **12**.

### D3. Hardware wallet support, realistic scope
- **Pitch:** Use hardware wallets where they actually help: as the payer wallet, the sweep destination, and the source of a deterministic seed.
- **Benefit:** Stronger key handling for the people who already own them.
- **Privacy impact:** A hardware wallet cannot compute per-payment stealth spend keys (the tweak is not a BIP-32 path), so **it cannot directly sign stealth sweeps**. A signature-derived seed (Umbra style) ends up in browser memory and is only as safe as the page. Deriving from a signature also lets anyone who gets that signature (phishing) regenerate the keys; domain-separate and warn. Destination on a hardware wallet is a straightforward win with A3.
- **Design/deps:** EIP-6963 wallets, signature-derived seed option in `keystore.ts`, docs on limits.
- **Effort:** M. **Risk:** Medium (signature-phishing class). **Legal:** none.
- **Score:** 4+2+4-1 = **9**.

### D4. WalletConnect (opt-in module) [WEAKENS]
- **Pitch:** Pay from mobile wallets via WalletConnect v2.
- **Benefit:** Reaches wallets without a browser extension.
- **Privacy impact:** **Weakens somewhat**: the relay infrastructure sees connection metadata (IP, timing, dapp domain); payloads are encrypted. It adds third-party egress and a new dependency on the supply-chain list. Keep it off by default and in a separately loaded chunk with its own CSP origin. EIP-681 QR deep links (B3) give mobile payments with less exposure.
- **Design/deps:** Web DEVIATIONS 7, CSP and bundle-scan updates, wallet adapter interface.
- **Effort:** M. **Risk:** Medium. **Legal:** none.
- **Score:** 4+1+3-1-1 = **6**.

### D5. Companion browser extension for key isolation
- **Pitch:** Keep keys in an extension context so a compromised website bundle cannot read or silently use them.
- **Benefit:** Directly targets D7 and removes "silent sweep signed by a compromised page" (4.4 in the threat model): the extension prompts for each sweep.
- **Privacy impact:** Hides keys from page JS but the extension itself is a high-value target and sees everything the page sends it. Extension permissions must be minimal. Store review and updates are a new trust path; Firefox/Safari versions double the work. Does not alter on-chain visibility.
- **Design/deps:** Port `core-crypto`, `keystore` and sweep builders into an extension service worker; messaging protocol with origin checks; reproducible extension build.
- **Effort:** L. **Risk:** Medium-High. **Legal:** none.
- **Score:** 5+4+4-2 = **11**.

### D6. Signed seller profile and identity pinning
- **Pitch:** A signed profile (name, meta-address, signing key) payers can pin once, served from the seller's own domain's `/.well-known/` or embedded in the link.
- **Benefit:** Payers can tell the real shop from a lookalike link (ADR-0002) and the embed widget gets its merchant profile.
- **Privacy impact:** Deliberately identity-revealing: it binds a domain to a meta-address (D3 identifying). Fetching the well-known file lets the seller's host see the payer's IP and timing unless embedded in the invoice. Seller's choice; pairs badly with A2/A11 unless the profile covers a root identity only.
- **Design/deps:** `invoice-schema` profile object, Feature 2 merchant profile, pinning store in local storage.
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 4+2+4 = **10**.

### D7. Bitcoin Silent Payments invoices
- **Pitch:** Wire `btc-silent-payments` into invoices so a seller can ask for BTC to an `sp1` address.
- **Benefit:** Reaches Bitcoin payers with similar one-time-address benefits and no router trust.
- **Privacy impact:** Silent payments reduce address reuse; BTC payer inputs, amounts and timing remain public. Payers need eligible inputs (no multisig; BIP-352), and light-client scanning discloses queries to an oracle unless self-hosted (research.md section 3). No fee can be enforced.
- **Design/deps:** `ChainAdapter` union ADR (gap list), BlindBit client, scan persistence, PSBT spend; the web integration is the large part.
- **Effort:** L. **Risk:** Medium. **Legal:** none beyond usual.
- **Score:** 4+4+5-2 = **11**.

### D8. One-prompt checkout (EIP-5792 `wallet_sendCalls`, EIP-681)
- **Pitch:** Batch approve plus pay into a single wallet prompt where the wallet supports it.
- **Benefit:** Fewer steps and no dangling approval after an abort (S3-19).
- **Privacy impact:** None either way; wallet providers still see the batch. Support is uneven, so keep the existing flow as fallback.
- **Design/deps:** `payExec.ts`, capability detection, tests against mock wallets; real wallets not yet tested (README).
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 3+2+3 = **8**.

---

## E. Growth and trust

### E1. Interactive "what is public" explainer and sandbox
- **Pitch:** A guided testnet demo where one tab plays payer, another plays seller, and an observer panel shows what each party can see.
- **Benefit:** Converts curiosity into understanding and sets honest expectations (reduces support load and overclaim).
- **Privacy impact:** Teaches the limits (payer can follow sweeps, router is enumerable). Uses testnet only; no analytics. Faucet links are third parties the user chooses to open.
- **Design/deps:** Sepolia and Base Sepolia (enabled today), existing views, `docs/user/privacy-limits.md` content as source of truth.
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 4+3+5 = **12**.

### E2. Verifiable-build badge and verifier CLI
- **Pitch:** A `ghostpay-verify` tool and public attestations so anyone can check a hosted build against the signed release from another machine.
- **Benefit:** Trust that can be checked, which beats a marketing claim; answers S3-04.
- **Privacy impact:** None added. It cannot detect a host that serves *you* a different bundle than the one verified, unless run from a separate machine/network.
- **Design/deps:** `scripts/` reproducible build, SBOM, SHA256SUMS, release workflow (blocked on ADR-0015 key and fingerprint).
- **Effort:** S. **Risk:** Low. **Legal:** none.
- **Score:** 3+3+5 = **11**.

### E3. CMS and storefront plugins
- **Pitch:** WooCommerce/WordPress-style plugins built on the embed widget plus the self-hosted scanner (C2).
- **Benefit:** Opens the large long-tail merchant market.
- **Privacy impact:** The store backend sees orders and any webhook data; plugin code runs in the merchant's trust domain. Must not phone home. Payer privacy is unchanged from the base protocol.
- **Design/deps:** Depends on C2, Feature 2 merchant profiles, stable HMAC webhook spec.
- **Effort:** L. **Risk:** Medium (supply chain, merchant misconfiguration). **Legal:** merchant tax and consumer duties.
- **Score:** 4+2+5-2 = **9**.

### E4. Honest cost comparison page
- **Pitch:** A calculator showing the 0.25 % router fee, optional relayer fee and gas versus typical processors, with the direct-pay path (no fee) explained.
- **Benefit:** Concrete reason to try it.
- **Privacy impact:** None (local arithmetic). Must say what you give up (no chargebacks, irreversible payments, pre-audit software) and avoid claiming "private".
- **Design/deps:** `chain-adapters/fees.ts` `FEE_SCHEDULE`, no external data.
- **Effort:** S. **Risk:** Low. **Legal:** comparative advertising claims must be accurate; counsel review.
- **Score:** 3+2+4 = **9**.

### E5. Bug bounty and public "privacy report card"
- **Pitch:** A living page listing known limits (D1-D10), audit status, open findings and bounty scope.
- **Benefit:** Credibility with privacy-sensitive users and security researchers.
- **Privacy impact:** None; it is documentation. It needs real budget and an independent audit first or it is hollow.
- **Design/deps:** `docs/audits/`, SECURITY.md, threat model statuses.
- **Effort:** S (page) plus owner budget. **Risk:** Low. **Legal:** safe-harbour wording for researchers.
- **Score:** 3+3+4 = **10**.

### E6. Publish SDK packages and propose the invoice format as an open standard
- **Pitch:** Release `core-crypto`, `invoice-schema` and the scanner as documented libraries and draft an ERC for the invoice envelope.
- **Benefit:** Other wallets and apps can pay GhostPay invoices; network effect and independent review.
- **Privacy impact:** Increases the anonymity set only if others use the same payment path. Third-party implementations may leak differently (e.g. hosted scanners), so publish a privacy conformance checklist.
- **Design/deps:** Licence decision (currently `UNLICENSED`, a blocker), API stabilization, DEVIATIONS docs, test vectors in `test-vectors/`.
- **Effort:** M. **Risk:** Medium (premature API freeze). **Legal:** licence and trademark choices (owner).
- **Score:** 4+3+5-1 = **11**.

---

## Considered and not recommended

- **Referral or rewards program.** Needs identity or tracking, or a router change (immutable). Conflicts with the no-analytics stance.
- **Hosted view-key scanning or push notifications.** The host would see all payments to a meta-address. Use C2 self-hosted instead.
- **Cover-transaction generation or multi-hop "peel" sweeps.** Costs fees, adds an unreliable cosmetic pattern, and analysts handle it routinely. Do not describe as protection.
- **Verified-merchant directory.** Opt-in only would still publish meta-address to business links, adds endorsement liability, and invites impersonation claims.
- **Pull-payment subscriptions via standing allowances.** Raises payer risk and needs a new audited pull contract; revisit only with a separate review.

---

## Ranked summary

| Rank | ID | Idea | Effort | Score | Flags |
|---|---|---|---|---|---|
| 1 | A3 | Sweep destination hygiene wizard | M | 13 | |
| 2 | A1 | Paste-import and passphrase links | S | 12 | |
| 2 | A2 | Per-client meta-addresses | M | 12 | scan cost |
| 2 | B4 | PWA with passkey unlock | M | 12 | hosting-gated |
| 2 | B6 | Selective-disclosure receipts | M | 12 | |
| 2 | D2 | Watch-only plus air-gapped signer | L | 12 | |
| 2 | E1 | Explainer and sandbox | S | 12 | |
| 8 | A5 | Multi-relayer | M | 11 | |
| 8 | A6 | Tor/onion RPC, padded queries | M | 11 | |
| 8 | B1 | Encrypted backup and restore drill | M | 11 | |
| 8 | B7 | Claim-by-hash, spam filter | S | 11 | |
| 8 | C1 | Payment links and tip jar | S | 11 | public meta |
| 8 | C3 | POS mode | M | 11 | |
| 8 | D5 | Companion extension | L | 11 | |
| 8 | D7 | Bitcoin Silent Payments invoices | L | 11 | |
| 8 | E2 | Verifiable-build CLI | S | 11 | |
| 8 | E6 | SDK and open invoice standard | M | 11 | licence |
| 19 | A4 | Randomized sweep timing | S | 10 | |
| 19 | A11 | Ephemeral signing keys | S | 10 | |
| 19 | B3 | QR and NFC | S | 10 | |
| 19 | B5 | Accounting export | S | 10 | |
| 19 | C2 | Self-hosted scanner and webhooks | L | 9-10 | LEGAL if hosted |
| 19 | D6 | Signed seller profile | S | 10 | identity-revealing |
| 19 | E5 | Bounty and privacy report card | S | 10 | |
| 26 | A7 | Decoy balance lookups | S | 9 | |
| 26 | B8 | i18n and a11y | M | 9 | |
| 26 | C5 | Refund-from-stealth | M | 9 | |
| 26 | D3 | Hardware wallet, realistic scope | M | 9 | |
| 26 | E3 | CMS plugins | L | 9 | |
| 26 | E4 | Cost comparison | S | 9 | claims review |
| 32 | B2 | Shamir recovery | M | 8 | |
| 32 | C7 | Templates and client directory | S | 8 | |
| 32 | D8 | One-prompt checkout | S | 8 | |
| 35 | C4 | Subscription series | M | 7 | WEAKENS (pattern) |
| 35 | D1 | Name resolution | M | 7 | WEAKENS (identity) |
| 37 | C6 | Split payments | M-L | 6 | LEGAL |
| 37 | D4 | WalletConnect | M | 6 | WEAKENS (relay metadata) |
| 39 | A10 | Fragmented payments | M | 5 | |
| 40 | A8 | Consolidated sweeps | L | 3 | WEAKENS |
| 41 | A9 | Pooled sweep pool | L+ | 2 | LEGAL, not recommended |

Ideas flagged WEAKENS or LEGAL: A8, A9, C2 (if hosted), C4, C6, D1, D4. Everything else is neutral or positive for privacy but none is an anonymity claim.

---

## Recommended top-10 shortlist

Chosen by score, then by whether the work is closable in-repo without owner secrets or a deployment (gap-analysis section 3), and whether it closes a named audit finding.

1. **A3 Sweep destination hygiene wizard** (closes D1 copy gaps; biggest real privacy gain).
2. **A1 Paste-import and passphrase links** (closes S3-03; small).
3. **B7 Claim-by-hash and spam filter** (closes D4, S3-02 together with the balance check).
4. **A2 Per-client meta-addresses** (D3; needs an ADR before code).
5. **B1 Encrypted backup and restore drill** (closes G-18; prerequisite for B2, C3, D2).
6. **A6 Tor/onion RPC mode, padded queries** (D8; Feature 5 stage 1).
7. **D2 Watch-only plus air-gapped signer** (D7 mitigation; larger build).
8. **B6 Selective-disclosure receipts** (compliance-friendly without view-key sharing).
9. **A5 Multi-relayer selection** (removes single-operator view; fits the existing signature design).
10. **E1 Explainer and sandbox** (honest onboarding; can run in parallel).

Next wave: C1 payment links, C3 POS, B4 PWA (after ADR-0015 hosting), E2 verifier CLI, D5 extension, D7 Bitcoin.

### What to spec first

1. **One spec: "Sweep and link hygiene" covering A3 + A1 + A4.** All three live in `Sweep`, `CreateInvoice`, `Pay` and the tag vault, are S-M, need no contract change and no owner decision, and fix the highest-severity open user-facing item (D1) plus S3-03. Include wording review so the UI never says "private" or "anonymous".
2. **Then B7** (scanner verification and claim flow), because C3 POS, C2 webhooks and every "paid" display depend on trustworthy amounts.
3. **Then an ADR for A2** (derivation scheme, scan-cost budget, interaction with ERC-6538 and the invoice signer) before any implementation, because a derivation mistake cannot be fixed after users hold funds.
4. **Defer** A8, A9, C6 and D4 until a privacy and legal review explicitly accepts their trade-offs.

### Open questions for the owner

- Licence and who may fork (blocks E6, E3).
- Whether any operator-hosted component (relayer list, scanner daemon, profile hosting) is acceptable, and under which terms (ADR-0006, D10).
- Budget for an independent audit and bounty (E5), since several ideas lean on audit status for credibility.
