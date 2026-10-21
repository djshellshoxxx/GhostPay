# Consumer usability and growth features (individual users)

Date: 2026-10-21. Branch `claude/remote-extensions-1`. Lens: individuals (tips, friends, handles, onboarding, mobile, hygiene). Proposal only; no source changed. `features.md` (sibling agent) did not exist when this was written, so overlap was checked only against the repo; reconcile when it lands.

Status words: Exists (file:line), Partial, Missing. Effort S/M/L. Impact 1 to 5.

## 0. Ground rules (every feature below must satisfy)

- No third-party call by default. Anything that contacts a name server, a domain, a push service or a store is opt-in, off by default, and says which observer learns what (README "Security limitations"; Roadmap "Shared implementation gates").
- Keys stay local. No custody, no hosted account, no analytics, no referral IDs, no tracking pixels (SECURITY.md "No analytics, telemetry").
- No claim of anonymity. Copy says "hygiene" and "what others can see", never "private score 100/100" (README line 5, `docs/user/privacy-limits.md`).
- New code goes in a new package (pure TS, no DOM) with the web view as a thin consumer; the bundle scan (`apps/web/scripts/scan-bundle.mjs`) must stay green.
- Non-manipulative: no streaks, no loss framing, no countdown nags, no social sharing prompts. Every nudge is dismissible permanently.

## 1. What already exists (verified in code)

| Area | Evidence | Gap for consumers |
|---|---|---|
| Invoice link + QR + copy | `apps/web/src/views/CreateInvoice.tsx:195-196`, `lib/qr.ts:9-20` (local QR; errors when link too long) | Fixed-amount, signed invoice only; no open-amount "pay me" link, no share sheet, no poster |
| Pay-side receipt | `views/Pay.tsx:552-557` (JSON download with a confirm), `lib/payExec.ts` `buildReceipt` | Payer-only, raw JSON, not shareable or verifiable by the seller |
| Tx result is in React state only | `views/Pay.tsx:43` `useState<SubmitResult>`; no `localStorage`/IndexedDB write for pending txs (grep: only settings, idbStore, keystore, tags persist) | Refresh or tab kill loses the hash of an in-flight payment |
| Client labels | `lib/tags.ts` (AES-GCM + HMAC lookup, keyed from viewing key) | Labels per received announcement only; no address book for payees |
| Pinned signers | `lib/settings.ts:13`, `views/Pay.tsx:48-58`, `views/Settings.tsx:19` | Paste-a-hex-list UX; no names |
| Wallet discovery | `lib/wallet.ts:42-64` EIP-6963 + `window.ethereum` | Mobile browsers have no injected wallet; no WalletConnect (would be a third-party relay) |
| Keystore export/import | `lib/keystore.ts:66` `encryptKeystore`, scrypt N=2^17 + AES-GCM | No backup reminder, no test-restore, no persistent-storage request, no recovery sheet |
| Delay jitter | `lib/jitter.ts:9` `randomDelayMs`, settings `delayMinSec/MaxSec` `settings.ts:8` | Only for announcement/sweep timing; no user-scheduled payments |
| Policy accounts | `packages/policy-scheme/src/{policy,limits,router}.ts`, `packages/contracts/src/PolicyAccount.sol:115-295` (timelocked withdraw, per-token limits, cancel, destination change) | Contracts + library only; README: "no client support, no recovery path. Do not use them." |
| Embed button | `apps/web/public/ghostpay-embed-v1.js` (popup only) | Needs an `#gpi=` invoice per button; no static tip button |
| Installability | `index.html:14` `rel="icon" href="data:,"`; `public/` has only `_headers`, `deployments`, `ghostpay-embed-v1.js`; no `manifest.webmanifest`, no service worker | Not installable, no offline shell |
| Camera | `public/_headers:9` Permissions-Policy denies `camera=()` | In-app QR scanning impossible in the web build |
| Names / registry | README links ERC-6538 but no code resolves ENS or reads the registry (grep `ens`, `6538` in `apps`,`packages/*/src`: no resolver) | Payers must paste a 142-char `st:eth:0x...` string |
| Already in the roadmap (not repeated here) | Gas buffer (F1), embed widget (F2), milestone escrow (F3), client tagging (F4), blinded scanning (F5), jitter UX (F6) | -- |

## 2. Comparable products (primary sources, retrieved 2026-10-21)

| Ref | Product / spec | URL | Takeaway used here |
|---|---|---|---|
| R1 | LNURL-pay LUD-06 | https://raw.githubusercontent.com/lnurl/luds/luds/06.md | Static QR/link returns min/max range and a `text/plain` description: "open amount within a range" pay link (F1) |
| R2 | Lightning Address LUD-16 | https://raw.githubusercontent.com/lnurl/luds/luds/16.md | `user@domain` resolved by `GET https://<domain>/.well-known/lnurlp/<user>`; the domain sees every lookup (F4 opt-in only) |
| R3 | BOLT12 offers | https://raw.githubusercontent.com/lightning/bolts/master/12-offer-encoding.md | Reusable offer with `offer_description`, `offer_absolute_expiry`, `offer_quantity_max`: reusable pay-me object with expiry and description (F1, F3) |
| R4 | ZIP-321 payment URIs (Zcash) | https://raw.githubusercontent.com/zcash/zips/main/zips/zip-0321.rst | `label` and `message` params; wallets MUST show label distinct from the address (F1, F5) |
| R5 | Umbra | https://raw.githubusercontent.com/ScopeLift/umbra-protocol/master/README.md | Pay `bob.eth`; recurring "Alice sends 1,000 Dai each week" use case; keys published under ENS (F4, F12) |
| R6 | ERC-6538 registry | https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-6538.md | Singleton registry maps address/ENS to stealth meta-address per scheme (F4) |
| R7 | BIP-352 Silent Payments, labels | https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki | Labels tell Bob where a payment came from but link addresses to one owner; "labels are not a way to manage separate identities" (F1 per-link labels must say the same) |
| R8 | BIP-329 wallet label export | https://raw.githubusercontent.com/bitcoin/bips/master/bip-0329.mediawiki | Portable label export prevents lock-in (F5, F11 export format) |
| R9 | Safe Allowance Module | https://raw.githubusercontent.com/safe-global/safe-modules/main/modules/allowances/README.md | Per-delegate, per-token allowances with reset; model for friendly "allowance" vocabulary (F13) |
| R10 | EIP-681 URIs | https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-681.md | `ethereum:<addr>@<chain>?value=` camera-app interop (F9 open-with) |
| R11 | BIP-21 | https://raw.githubusercontent.com/bitcoin/bips/master/bip-0021.mediawiki | `label`, `message` conventions (F1) |
| R12 | MDN web app manifest | https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/progressive_web_apps/manifest/index.md | `display: standalone`, `start_url`; installability (F9) |
| R13 | MDN `navigator.share` | https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/navigator/share/index.md | Needs `web-share` permission policy + user activation; `canShare` for files (F1, F15) |
| R14 | MDN `StorageManager.persist` | https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/storagemanager/persist/index.md | Ask for persistent storage so keystore/tags are not evicted (F11) |
| R15 | Capacitor | https://raw.githubusercontent.com/ionic-team/capacitor/main/README.md | "Cross-platform apps with JavaScript and the Web": wrap the static bundle (F18) |
| R16 | EIP-5564 | https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-5564.md | Basis for everything stealth; unchanged |

Not retrievable: BTCPay Server docs (guessed raw paths on `btcpayserver/btcpayserver-doc` returned 404; GitHub API 403). Fluidkey, Ko-fi, Buy Me a Coffee sites blocked or non-primary; not cited. No claim about their features is made.

## 3. Feature catalogue

Format: problem; why people pick/keep it; design; privacy/security; deps; effort; impact; owner dir.

### F1. Pay-me link and share kit (open-amount tip/request link)
- Problem: payers need a 142-char meta-address or a one-off invoice; there is no reusable "pay me" object. Status: Missing.
- Why: the single feature that makes GhostPay usable for tips, friends and freelancers without creating an invoice per payment (R1, R3 do this on Lightning).
- Design: fragment `#gpm=v1.<base64url(JSON)>`: `{chainId, metaAddress, token?, suggested:[amounts], min?, max?, label?, message?, expiresAt?, signer?, sig?}`. Payer app builds a local draft invoice with the payer-chosen amount (payer-side, unsigned unless `sig` present; trust level shown as in `pay.ts` pinned/unpinned). Share kit: `navigator.share` (R13) with copy fallback, SVG/PNG QR, printable poster page, `label`/`message` shown distinct from address (R4).
- Privacy: link is public by design; label shows the same-owner caveat (R7). Reusing one meta-address across links is already how the scheme works; each payment still uses a fresh stealth address. Per-link labels are cosmetic only and must say so. No server.
- Deps: `invoice-schema` (draft-invoice builder), `Pay.tsx` accepting draft; address-safety spec for text sanitising. Effort M. Impact 5. Owner: new `packages/pay-link`.

### F2. Quick request and split bill
- Problem: friends splitting dinner must fill the full invoice form (`CreateInvoice.tsx`, line items, tax). Partial.
- Why: 3-field flow (amount, token, note) plus "split N ways" yields N links with distinct nonces; shareable by message app.
- Design: preset over existing `createInvoice` (`invoiceCreate.ts`); 1 hour default expiry; split creates N invoices of `ceil(total/N)` with explicit rounding shown; each link independently expiring.
- Privacy: invoice link remains a bearer secret (`CreateInvoice.tsx:192` warning kept verbatim). Note in UI that N links to one meta-address are linkable to one payee.
- Deps: none beyond `invoice-schema`. Effort S. Impact 4. Owner: `packages/pay-link` (builders) + web view.

### F3. Tip page and poster generator
- Problem: creators want a page to put in a bio or a printed QR at a counter. Missing.
- Why: a self-contained static HTML file the user can host anywhere (IPFS, GitHub Pages, USB) with preset amounts and one "Pay with GhostPay" popup button (reuses `ghostpay-embed-v1.js`).
- Design: generator emits one `.html` with inline CSS, no JS beyond the existing embed pattern (same-origin rule at `ghostpay-embed-v1.js` header), plus SVG poster. Optional goal bar is manual text only (no chain reads).
- Privacy: page contains only public meta-address and text; generator runs offline; sanitises all strings (no `innerHTML`).
- Deps: F1. Effort M. Impact 3. Owner: new `packages/tip-page`.

### F4. Handles with privacy-safe naming (ENS optional)
- Problem: `st:eth:0x...` is unshareable by voice. Missing.
- Why: "pay alice" is the habit that retains users (R5).
- Design, in order of safety: (a) local petnames (F5, no network); (b) signed handle card: `alice` + meta-address + signer, shared as a link, TOFU-pinned; (c) opt-in ENS text record or ERC-6538 read (R6) through the user's own RPC; (d) opt-in `https://domain/.well-known/ghostpay/<name>.json` modelled on LUD-16 (R2).
- Privacy/security: (c) tells the user's RPC which name is looked up; (d) tells the domain the payer's IP and the name. Both default off and labelled. CCIP-Read/offchain resolution disabled (third-party gateway). First resolution is pinned; any change to the resolved meta-address is a hard stop with side-by-side fingerprint. ENS ownership can change, so resolution never replaces the pin. Resolver output passes `sanitizeDisplayText`.
- Deps: F5, address-safety spec, chain-adapters RPC. Effort M. Impact 4. Owner: new `packages/handles`.

### F5. Encrypted contact book
- Problem: payee identity is a hex string; `pinnedSigners` is a textarea (`Settings.tsx:19`). Partial.
- Why: names, notes, last-paid, pinned signer and "usual token" turn repeat payments into two taps.
- Design: reuse the `tags.ts` envelope (HKDF subkeys, AES-GCM, HMAC lookup). Record: `{name, metaAddress|handle, signer?, notes, createdAt}`. Import/export as encrypted JSON with BIP-329-style plain fields (R8) so users can leave.
- Privacy: encrypted at rest under a key derived from the user's secret; nothing leaves the browser. A lost key loses the book; F11 covers backup.
- Deps: address-safety (lookalike warning on near-duplicate names/addresses). Effort M. Impact 4. Owner: new `packages/contact-book`.

### F6. Privacy hygiene coach
- Problem: users cannot tell if their setup leaks. Missing.
- Why: honest "here is what others can see about you today" is the differentiator against wallets that overclaim.
- Design: pure function `assess(state) -> Finding[]`, each finding `{id, severity, observer, whatLeaks, fix, optionalLink}`. Checks from local state only: default or no RPC set (`settings.rpcUrls` empty means RPC choice unknown); relayer configured (relayer sees owner, destination, amount, timing); jitter range tiny (`delayMinSec`); `autoClearFragment` off; sweep destination reused or equals a funded owner address (D1); destination previously used as a destination in this browser (hashed memory); invoice links stored in history; no backup exported; release hash not verified; persistent storage not granted. Output is a checklist with colour-free text and a count of open items, not a 0 to 100 score.
- Privacy: computed locally; the destination memory stores only `HMAC(key, address)`. No network checks. The report states unknowables ("we cannot see your wallet's other activity").
- Deps: settings, sweep (`sweep.ts:44 checkDestination`), address-safety. Effort M. Impact 5. Owner: new `packages/privacy-coach`.

### F7. Visibility lens ("who can see this?")
- Problem: privacy limits live on About/docs, not on the screen where the user acts. Partial (`Disclosure.tsx`).
- Why: a per-step panel for Pay/Sweep/Create listing payer, seller, RPC, relayer, link holders and what each learns builds trust faster than marketing.
- Design: data-driven table keyed by `action` and by current settings (e.g. relayer set: adds a row). Each row links to the relevant `docs/user` page.
- Privacy: static content plus local settings; no new data. Must stay in sync with `privacy-limits.md` via a test that asserts every observer in the table appears in that doc.
- Deps: none. Effort M (content + doc-sync test). Impact 4. Owner: new `packages/visibility-lens`.

### F8. Payment tracker and pending-payment recovery
- Problem: hash and status are React state (`Pay.tsx:43,533`); refresh loses them. Missing.
- Why: "did it go through?" anxiety is the top abandonment cause for payers; resumable status removes it.
- Design: write `{chainId, hash, createdAt, expectedStealth?, amount, token}` to IndexedDB before wallet prompt resolves; on load, re-check receipt via the user's RPC; status steps: submitted, included, N confirmations (chain-specific finality hint), seller can see it after announcement scanned. Entries expire after 30 days; one-click delete.
- Privacy: stored locally, encrypted when a profile key exists, else plain with a visible notice; amounts/time are sensitive so the clear-all is prominent.
- Deps: `payExec.ts`, `idbStore.ts`. Effort S. Impact 4. Owner: new `packages/pay-tracker`.

### F9. Installable PWA shell and open-with
- Problem: not installable; no offline load; QR from camera apps cannot open GhostPay. Missing (`index.html:14`).
- Why: home-screen icon and offline launch are what make a web wallet feel like an app (R12).
- Design: build step emits `manifest.webmanifest` (name, icons, `display: standalone`, `start_url`, `protocol_handlers` for `web+ghostpay`) and a service worker that precaches the exact hashed assets listed in the release manifest. No runtime caching of RPC or relayer traffic. Update flow: new version is downloaded, its release hash is shown next to the old one, applied only after user confirms; never `skipWaiting` silently. Accepts `ethereum:` (R10) and `web+ghostpay:` links and maps them to the pay view.
- Privacy/security: a service worker is persistent code; a compromised update would persist, so signed-release hash check is mandatory before activation and the SW file is itself in the hashed set. CSP already has `worker-src 'self'` (`index.html:10`); `_headers` must serve SW with `Cache-Control: no-cache`. Offline mode never queues payments.
- Deps: release manifest/hash (`lib/release.ts`), `scripts/`. Effort M. Impact 5. Owner: new `packages/pwa-shell` (build tool) + `apps/web/public`.

### F10. Pocket wallet (capped local pay key) for wallet-less payers
- Problem: phones have no injected wallet (`wallet.ts:42-64` only EIP-6963/`window.ethereum`); WalletConnect needs a relay. Missing.
- Why: lets a new user pay with a small balance they fund once; removes the biggest first-payment blocker on mobile.
- Design: local EOA generated in browser, stored with `secret-box`/keystore envelope, hard cap (e.g. configurable, default low) enforced client-side, shown as "pocket money, not savings". Receive-only until funded. Export/import via F11.
- Security: browser key is exposed to a compromised frontend (README: "A compromised frontend can steal keys") so cap and warning are part of the feature; auto-lock via `lockTimeoutMin`; no seed phrase display by default.
- Deps: `secret-box`, F11. Effort L. Impact 5. Owner: new `packages/pocket-wallet`. Gate: after manifest authentication (S3-01) is fixed.

### F11. Backup and recovery kit
- Problem: keystore export exists but nothing prompts it, verifies it, or protects storage. Partial (`keystore.ts:66`).
- Why: losing keys with no recovery is the top reason users abandon self-custody tools; test-restore builds confidence.
- Design: (1) `navigator.storage.persist()` request after first key creation (R14); (2) "Back up now" state with last-export timestamp, no timer nag, one reminder after first received payment; (3) test-restore: decrypt file in memory, compare the derived meta-address to the live one, discard; (4) printable recovery sheet containing the encrypted blob as QR + passphrase hint field (never the passphrase); (5) export of contacts/tags in one archive (R8 style).
- Privacy: all local; the sheet is ciphertext. Passphrase strength via `passphraseProblem` (`keystore.ts:61`).
- Deps: keystore, tags, F5. Effort M. Impact 5. Owner: new `packages/backup-kit`.

### F12. Payment plans (scheduled and delayed payments, honestly)
- Problem: users expect "pay rent on the 1st". A browser app cannot sign while closed, and a server that holds a pre-signed payment would learn it (and a relayer would see payer, timing). Missing.
- Why: recurring tips and rent (R5 weekly example) without custody.
- Design: local plan `{payee ref, amount, token, cadence, nextDue}`; when the app is open (or installed PWA launched) due plans appear as a one-tap pay with the usual review screen. Optional local Notification when open; no push server. "Delay" = payer-side wait before submit using `jitter.ts` for timing-privacy, shown as such. True on-chain delay is F13.
- Privacy: plan list encrypted like F5. No pre-signed transactions stored.
- Deps: F5, F8. Effort M. Impact 3. Owner: new `packages/payment-plans`.

### F13. Friendly allowance profiles on policy accounts
- Problem: `PolicyAccount` has timelocks and per-token limits but only contracts and a library exist; vocabulary (Merkle limits, windows) is developer-only. Missing UI.
- Why: "Daily spending (max X/day), Savings (7-day delay), Kid allowance" are the control people want, and none require custody (R9 shows the pattern on Safe).
- Design: presets compile to `Policy {destination, delaySeconds, limitsRoot}` (`policy-scheme/src/policy.ts:16`) via `buildLimitsTree`; a simulator panel answers "if my key leaks, what can an attacker take, and how long do I have to cancel?" using `PolicyAccount.requestWithdraw/cancel` semantics.
- Security: ADR-0014 marks it experimental; README: no recovery path. Ship only after contract audit and a recovery design; UI must state "lose the owner key, lose the funds".
- Deps: audit of contracts, client scheme support, F14. Effort L. Impact 4. Owner: new `packages/policy-presets`.

### F14. Vault watch (pending-withdrawal alert and cancel)
- Problem: a timelock only protects if someone looks. Missing.
- Design: on app open, read `requests(id)` and pending destination change from the user's RPC for known policy accounts; show a red banner with "Cancel" (signed `cancel`). Optional local notification when installed. No server watcher by default; an optional self-hosted watcher can be a later operator doc.
- Privacy: RPC learns the account address (disclosed). Deps: F13. Effort M. Impact 3. Owner: `packages/policy-presets`.

### F15. Shareable receipts
- Problem: the only receipt is a payer-local JSON with amount and time (`Pay.tsx:552`). Partial.
- Why: freelancers and friends need "I paid" proof that the other side can verify without trusting a screenshot.
- Design: payer receipt link `#gpr=v1.<chainId, txHash, optional fields>` where the verifier re-reads the receipt and announcement via its own RPC and checks token/amount/stealth destination; fields (amount, note) are selected by the payer, default hash only. Seller acknowledgement: invoice `signer` key (`schema.ts` `signer`) signs `{invoiceNonce, txHash}`, producing a seller-signed "received" card. Render as local SVG; `navigator.share` with files where `canShare` (R13).
- Privacy: a receipt link publicly links payer to payee for anyone who holds it; disclose before share. Never includes viewing keys. No upload.
- Deps: `invoice-schema` sign, chain-adapters logs. Effort M. Impact 4. Owner: new `packages/receipts`.

### F16. Escrow-lite (single release with timeout refund)
- Problem: strangers want hold-and-release. Overlaps Roadmap F3 (milestone escrow); Missing in code.
- Design: reuse F3 contract design reduced to one milestone; consumer wrapper only. Recommendation: do not build a separate contract; ship it as a "1 milestone" template of F3 after F3's audit.
- Privacy/security: conditional custody (Roadmap F3 text); needs independent audit. Effort L. Impact 2 (until F3 exists). Owner: `packages/contracts` (F3 owner), not a new consumer package.

### F17. Safety checklist and practice mode
- Problem: first-time users skip release verification, test restore and a small test payment. Missing.
- Why: guided rehearsal on testnet (only Sepolia/Base Sepolia are enabled, README) lets people learn with no value at risk.
- Design: ordered, user-ticked tasks (verify release hash, back up, test-restore, send 1 test payment, sweep to fresh destination, review visibility lens). Progress is a count, no streaks, no confetti, no share button, hide forever option. A task auto-completes only from observable local facts (e.g. export file hash produced), never from self-report alone where checkable.
- Privacy: local flags only. Deps: F6, F11. Effort S. Impact 3. Owner: new `packages/safety-checklist`.

### F18. Mobile app (Capacitor)
- Problem: store presence, native camera QR, share sheet and biometric unlock are web-impossible or weak (`_headers:9` denies camera). Missing.
- Design: wrap the verified static bundle (R15); native plugins for camera scan and OS keystore-wrapped unlock; app loads only bundled assets; update only through store release matching the signed release hash.
- Security: store review, signing keys, reproducibility are new trust roots; plugin supply chain adds third-party code (THIRD_PARTY.md update). Effort L. Impact 4. Owner: new `apps/mobile`. Gate: after F9 proves the demand.

### F19. App badge and glanceable status
- Design: `navigator.setAppBadge` with count of unswept/pending items computed when the app is open; no background fetch (a timer polling RPC would leak IP and cadence). Native widgets deferred to F18 and show last-known local state only.
- Effort S. Impact 1. Owner: `packages/pwa-shell`.

### F20. Offline app share ("pass it on")
- Problem: censorship and trust: users cannot hand a verified copy to a friend. Missing.
- Why: referral-free growth: the app spreads by a file plus a hash, not by tracking links.
- Design: export the exact installed bundle as one archive with `SHA256SUMS` and the signed-release verify steps; receiver opens it locally or from any host and sees the same release hash as the sender. No invite codes, no attribution.
- Security: receiver must verify against the published signing key (fingerprint not yet published, README). Deps: release scripts. Effort M. Impact 3. Owner: new `packages/app-share`.

### F21. Seller invoice ledger
- Problem: created invoices are not tracked against received payments. Missing.
- Design: local list of created invoices (status open/expired/matched). Metadata carries no invoice id (`core-crypto/src/metadata.ts`: 57 bytes, view tag + token + amount; SPEC_REVIEW A1), so matching is heuristic (token, exact amount, announcement time within validity). Mark "probable match" never "paid"; user confirms.
- Privacy: local, encrypted. Deps: Scan view, tags. Effort M. Impact 4. Owner: new `packages/invoice-ledger`.

### F22. Manual-rate fiat hint
- Problem: fiat invoices are disabled (no oracle feeds, ADR-0012). Partial.
- Design: user types an approximate rate once, UI shows "about X in your currency" with the rate and a "not a quote" label; never stored in an invoice. Effort S. Impact 2. Owner: web lib.

## 4. Ranked table

Score = impact^2 x 10 / effort points (S=1, M=2, L=4). Ties broken by dependency order and privacy value.

| Rank | ID | Feature | Effort | Impact | Score | Owner dir |
|---|---|---|---|---|---|---|
| 1 | F8 | Payment tracker and pending recovery | S | 4 | 160 | `packages/pay-tracker` |
| 2 | F2 | Quick request and split bill | S | 4 | 160 | `packages/pay-link` |
| 3 | F1 | Pay-me link and share kit | M | 5 | 125 | `packages/pay-link` |
| 4 | F6 | Privacy hygiene coach | M | 5 | 125 | `packages/privacy-coach` |
| 5 | F9 | PWA shell and open-with | M | 5 | 125 | `packages/pwa-shell` |
| 6 | F11 | Backup and recovery kit | M | 5 | 125 | `packages/backup-kit` |
| 7 | F17 | Safety checklist and practice mode | S | 3 | 90 | `packages/safety-checklist` |
| 8 | F7 | Visibility lens | M | 4 | 80 | `packages/visibility-lens` |
| 9 | F5 | Encrypted contact book | M | 4 | 80 | `packages/contact-book` |
| 10 | F15 | Shareable receipts | M | 4 | 80 | `packages/receipts` |
| 11 | F4 | Handles / optional ENS | M | 4 | 80 | `packages/handles` |
| 12 | F21 | Seller invoice ledger | M | 4 | 80 | `packages/invoice-ledger` |
| 13 | F10 | Pocket wallet | L | 5 | 62 | `packages/pocket-wallet` |
| 14 | F3 | Tip page / poster | M | 3 | 45 | `packages/tip-page` |
| 15 | F12 | Payment plans | M | 3 | 45 | `packages/payment-plans` |
| 16 | F14 | Vault watch | M | 3 | 45 | `packages/policy-presets` |
| 17 | F20 | Offline app share | M | 3 | 45 | `packages/app-share` |
| 18 | F13 | Allowance profiles | L | 4 | 40 | `packages/policy-presets` |
| 19 | F18 | Mobile (Capacitor) | L | 4 | 40 | `apps/mobile` |
| 20 | F22 | Manual-rate fiat hint | S | 2 | 40 | `apps/web/src/lib` |
| 21 | F19 | Badge / glance | S | 1 | 10 | `packages/pwa-shell` |
| 22 | F16 | Escrow-lite | L | 2 | 10 | `packages/contracts` (F3 owner) |

Sequencing note: F10, F13/F14 and F18 are gated (S3-01 manifest authentication; policy-account audit and recovery design; F9 adoption). F4 and F15 need address-safety (spec in `docs/remote/specs/address-safety.md`).

## 5. Top 10 buildable specs

All packages: TypeScript strict, ESM, pure logic (no DOM, no network) with injected `Clock`, `RandomSource`, `Storage`/`Rpc` interfaces; vitest with coverage thresholds like sibling packages; each ships `README.md` and `DEVIATIONS.md`. Web wiring is a separate step. Common AT: bundle scan passes; no `fetch`/`XMLHttpRequest`/`WebSocket` call is added by the package (grep test).

### S1. `@ghostpay/pay-tracker` (F8)
- MUST persist a record before the wallet prompt resolves and update it on each state change; MUST survive reload.
- MUST re-check status via injected `Rpc` only; MUST NOT call any other endpoint.
- MUST expire records after a configurable TTL (default 30 days) and expose `clearAll()`.
- SHOULD encrypt records when a profile key is provided; SHOULD show finality hint from chain config.
- AT: simulate reload mid-flight, record restored and status resolves from mocked receipt. AT: tx dropped/replaced shows `unknown`, not `failed`. AT: `clearAll` leaves zero records. AT: no network call without injected Rpc.

### S2. `@ghostpay/pay-link` quick request + split (F2)
- MUST build N invoices via `invoice-schema` with unique nonces and shared expiry; MUST show rounding (`ceil`) and total delta before creation.
- MUST reject N<1 or N>50 (`MAX_LINE_ITEMS` spirit) and amounts that overflow.
- SHOULD default expiry to 1 hour, max 30 days.
- AT: split 100.00 by 3 gives 33.34 x3 with stated delta 0.02, all nonces distinct. AT: every link parses with `parseFragment`. AT: warning text for bearer secret present verbatim.

### S3. `@ghostpay/pay-link` pay-me link (F1)
- MUST define `#gpm=v1.` with a strict parser (length cap, unknown-key rejection, chain/token allowlist, `sanitizeDisplayText` on label/message).
- MUST show label distinct from address and show the pinned/unpinned state; unpinned requires explicit confirm.
- MUST let the payer choose the amount within `[min,max]`; MUST NOT embed secrets (no viewing key).
- SHOULD provide share via `navigator.share` with copy fallback, and a printable poster.
- AT: fuzz parser, no throw other than typed errors, round-trip stable. AT: link with `max < min` rejected. AT: bidi/zero-width label rejected. AT: payer amount outside range disables Pay.

### S4. `@ghostpay/privacy-coach` (F6)
- MUST be a pure `assess(state): Finding[]`; MUST name the observer for each finding; MUST NOT output a numeric "privacy score" or the word "anonymous".
- MUST store destination memory only as keyed HMAC.
- SHOULD cover: RPC unset, relayer set, jitter range, fragment auto-clear off, destination reuse, no backup, release unverified, persistence not granted.
- AT: table-driven state to expected finding ids. AT: snapshot has no forbidden words. AT: reused destination detected without storing the plain address. AT: zero network calls.

### S5. `@ghostpay/pwa-shell` (F9)
- MUST generate `manifest.webmanifest` and `sw.js` from the build output list with exact URLs and SHA-256 integrity; SW MUST NOT cache cross-origin or RPC/relayer requests.
- MUST NOT call `skipWaiting` without user confirmation; update UI MUST show old and new release hashes.
- MUST route `web+ghostpay:` and `ethereum:` (R10) links to the pay view via validated parsers; invalid links show an error, never auto-pay.
- SHOULD serve SW with `no-cache` via `_headers`.
- AT: Playwright: install prompt criteria met, offline reload shows shell. AT: tampered cached asset fails integrity and falls back to network refusal. AT: update waits for click. AT: CSP unchanged except documented `manifest-src`.

### S6. `@ghostpay/backup-kit` (F11)
- MUST request `navigator.storage.persist()` only after first key creation and record the result.
- MUST provide `testRestore(file, passphrase, liveMeta)` that decrypts in memory and compares meta-addresses, then zeroizes.
- MUST emit a recovery sheet containing ciphertext only; MUST NOT print the passphrase.
- SHOULD show last-export time; MUST NOT use timers or repeated nags (one reminder after first received payment).
- AT: wrong passphrase gives typed error, nothing written. AT: sheet text contains no key material (regex for 64-hex secrets). AT: restore of an altered file fails integrity.

### S7. `@ghostpay/safety-checklist` (F17)
- MUST list tasks as data with `verify?: (facts) => boolean`; MUST auto-complete only from observable facts.
- MUST NOT include streaks, scores, timers, share actions or loss messaging; MUST allow permanent dismissal.
- AT: lint test fails if task copy contains banned words ("streak", "don't miss", "hurry"). AT: dismissal persists. AT: task requiring backup completes only after a test-restore fact.

### S8. `@ghostpay/visibility-lens` (F7)
- MUST map each action (create, pay, scan, sweep, relayer sweep) to rows `{observer, learns, doc}` and adjust by settings.
- MUST fail CI if any observer is missing from `docs/user/privacy-limits.md` or any row lacks a doc link.
- AT: relayer enabled adds relayer row naming owner, destination, amount, timing. AT: doc-sync test passes on current docs.

### S9. `@ghostpay/contact-book` (F5)
- MUST encrypt records (AES-GCM, HKDF subkeys as `tags.ts`) and bind AAD to schema version.
- MUST warn on near-duplicate names (confusables) and on lookalike addresses via address-safety.
- MUST export encrypted and import with schema validation and size caps.
- SHOULD store pinned signer per contact and sync it into `pinnedSigners`.
- AT: tamper any ciphertext byte fails. AT: import of 10 MB file rejected. AT: lookalike address triggers hard stop. AT: export-import round trip equal.

### S10. `@ghostpay/receipts` (F15)
- MUST default receipt to `{chainId, txHash}` only; extra fields opt-in per field with a disclosure that the link joins payer and payee publicly.
- MUST verify by reading chain data through injected `Rpc`; MUST NOT trust amount in the link.
- MUST support seller acknowledgement signed by invoice `signer` over `{nonce, txHash}`; verifier checks the pinned signer.
- AT: forged amount in link is overridden by chain data and flagged. AT: ack with wrong signer fails. AT: link contains no viewing or spending key (byte scan). AT: round trip stable.
