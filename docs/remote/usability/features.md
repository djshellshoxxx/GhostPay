# GhostPay usability features

Branch `claude/remote-extensions-1`, 2026-10-21. Goal: make GhostPay easier to use without weakening privacy or security. Every feature keeps the repo rules: no analytics, no third-party scripts, nothing sent to a host the user did not choose, keys never persisted in plaintext.

Score = impact (1-5) / effort weight (S=1, M=2, L=4). Waves = build order by dependency (see [specs/README.md](specs/README.md)). Each feature has a buildable spec in [specs/](specs/); the top 8 are also inlined in [top-specs.md](top-specs.md).

## Ranked table

| # | ID | Feature | Impact | Effort | Score | Wave | Depends on | New package | Exists in code? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [ledger-export](specs/ledger-export.md) | CSV / accounting export | 4 | S | 4 | 1 | local-store | `packages/ledger-export` | apps/web/src/components/Common.tsx:63-76 downloadText (local Blob down |
| 2 | [quick-request](specs/quick-request.md) | Quick payment request (amount + memo in three fields) | 4 | S | 4 | 0 | - | `packages/request-kit` | apps/web/src/lib/invoiceCreate.ts:87 buildInvoiceLink (full form -> si |
| 3 | [ux-errors](specs/ux-errors.md) | Error recovery guidance | 4 | S | 4 | 0 | - | `packages/ux-errors` | apps/web/src/lib/errors.ts:19-43 userMessage maps InvoiceError/ChainAd |
| 4 | [ux-glossary](specs/ux-glossary.md) | In-app glossary, contextual help, plain-language labels | 4 | S | 4 | 0 | - | `packages/ux-glossary` | apps/web/src/components/Disclosure.tsx LIMITS and fee lists (static ex |
| 5 | [contacts](specs/contacts.md) | Encrypted contacts and labelled destinations | 3 | S | 3 | 1 | local-store | `packages/contacts` | apps/web/src/lib/settings.ts:12,19 pinnedSigners plain in localStorage |
| 6 | [embed-snippet](specs/embed-snippet.md) | Embed snippet generator and checkout SDK helpers | 3 | S | 3 | 0 | - | `packages/embed-kit` | apps/web/public/ghostpay-embed-v1.js:1-40 usage and validLink rules (s |
| 7 | [mode-guard](specs/mode-guard.md) | Testnet / practice mode and network badge | 3 | S | 3 | 0 | - | `packages/mode-guard` | packages/chain-adapters/src/config/chains.ts:34-35 testnet:true flag |
| 8 | [net-status](specs/net-status.md) | Status and health page | 3 | S | 3 | 0 | - | `packages/net-status` | apps/web/src/views/Settings.tsx:47-60 per-chain RPC "Test" (chain id c |
| 9 | [search-filter](specs/search-filter.md) | Search, filter and multi-tag for payments | 3 | S | 3 | 1 | local-store | `packages/ledger-query` | apps/web/src/views/Scan.tsx:154-238 Matches list |
| 10 | [backup-bundle](specs/backup-bundle.md) | Encrypted full backup and restore | 5 | M | 2.5 | 1 | local-store | `packages/backup-bundle` | apps/web/src/lib/keystore.ts scrypt N=2^17 + AES-GCM keystore export/i |
| 11 | [local-store](specs/local-store.md) | Encrypted local store (ledger, templates, contacts, profiles namespace) | 5 | M | 2.5 | 0 | - | `packages/local-store` | apps/web/src/lib/tags.ts HKDF(viewing key)->AES-GCM + HMAC lookup, Idb |
| 12 | [onboarding](specs/onboarding.md) | Onboarding wizard with safe defaults | 5 | M | 2.5 | 1 | ux-glossary, net-status | `packages/onboarding` | apps/web/src/views/Home.tsx:20-60 three role cards. |
| 13 | [pay-reconcile](specs/pay-reconcile.md) | Invoice-to-payment reconciliation via payer proof | 5 | M | 2.5 | 1 | local-store | `packages/pay-reconcile` | apps/web/src/lib/payExec.ts:142-160 payer receipt includes invoiceNonc |
| 14 | [sweep-guide](specs/sweep-guide.md) | Guided sweep with fee preview | 5 | M | 2.5 | 0 | - | `packages/sweep-guide` | apps/web/src/views/Sweep.tsx:204-231 quote and sweep handlers |
| 15 | [a11y-pass](specs/a11y-pass.md) | Accessibility audit and accessible options | 4 | M | 2 | 0 | - | `packages/a11y-kit` | apps/web/src/App.tsx skip link, main focus on view change, sr-only liv |
| 16 | [fiat-display](specs/fiat-display.md) | Fiat display and privacy-safe price source | 4 | M | 2 | 0 | - | `packages/fiat-display` | packages/chain-adapters/src/quote.ts:36,46,123,152 FEEDS table, findFe |
| 17 | [pwa-offline](specs/pwa-offline.md) | Installable PWA and offline mode | 4 | M | 2 | 0 | - | `packages/pwa-shell` | apps/web/index.html:5-17 CSP meta, worker-src self allowed. |
| 18 | [receipts](specs/receipts.md) | Seller-signed receipts and proof-of-payment export | 4 | M | 2 | 2 | local-store, pay-reconcile | `packages/receipts` | apps/web/src/lib/payExec.ts:142-160 payer receipt (unsigned). |
| 19 | [share-safe](specs/share-safe.md) | Safe link sharing (passphrase-split, unfurl-safe, print card) | 4 | M | 2 | 0 | - | `packages/share-safe` | apps/web/src/views/CreateInvoice.tsx:188-197 link + QR + warning. |
| 20 | [templates](specs/templates.md) | Invoice templates and duplicate invoice | 4 | M | 2 | 1 | local-store | `packages/invoice-templates` | apps/web/src/lib/invoiceCreate.ts InvoiceForm shape (lines 20-40). |
| 21 | [kbd-palette](specs/kbd-palette.md) | Command palette and keyboard shortcuts | 2 | S | 2 | 1 | ux-glossary | `packages/command-palette` | apps/web/src/App.tsx:18 ORDER of views |
| 22 | [theme-pack](specs/theme-pack.md) | Selectable themes incl. cypher and high-contrast | 2 | S | 2 | 1 | a11y-pass | `packages/theme-pack` | apps/web/src/lib/settings.ts:11 theme union |
| 23 | [notify-local](specs/notify-local.md) | Local notifications (no third parties) | 3 | M | 1.5 | 1 | local-store | `packages/notify-local` | apps/web/src/views/Scan.tsx:45-96 manual scan with checkpoint resume. |
| 24 | [recurring](specs/recurring.md) | Recurring invoices (local reminders, manual issue) | 3 | M | 1.5 | 2 | templates, local-store | `packages/recurring-invoices` | No schedule code. Server-less constraint (MASTER_BLUEPRINT zero-server |
| 25 | [smart-wallet-compat](specs/smart-wallet-compat.md) | Smart-contract wallet (Safe) payer compatibility | 3 | M | 1.5 | 0 | - | `packages/wallet-compat` | apps/web/src/lib/payExec.ts ensureAllowance + permit path. |
| 26 | [i18n](specs/i18n.md) | Localisation (message catalogs, locale-safe amounts) | 4 | L | 1 | 1 | ux-glossary, ux-errors | `packages/i18n-core` | apps/web/src/lib/format.ts parseUnits strict "." decimal |
| 27 | [wallet-connect](specs/wallet-connect.md) | WalletConnect (opt-in) for mobile wallets | 4 | L | 1 | 1 | mode-guard | `packages/wallet-connect-adapter` | apps/web/src/lib/wallet.ts:45-72 discoverWallets |
| 28 | [embed-return](specs/embed-return.md) | Embed completion signal and return-to-merchant | 2 | M | 1 | 2 | embed-snippet, pay-reconcile | `packages/embed-return` | apps/web/public/ghostpay-embed-v1.js (noopener, noreferrer popup). |
| 29 | [profiles](specs/profiles.md) | Multiple seller profiles | 3 | L | 0.8 | 2 | local-store, backup-bundle | `packages/profiles` | apps/web/src/lib/session.ts:26-40 singleton current/publicSummary. |
| 30 | [hw-signer](specs/hw-signer.md) | Hardware-wallet payer path and signer abstraction | 2 | L | 0.5 | 0 | - | `packages/signer-abstraction` | docs/remote/modules-needed.md rank 12 (Missing). |
| 31 | [policy-undo](specs/policy-undo.md) | Cancel / undo UI for policy-account withdrawals | 2 | L | 0.5 | 1 | sweep-guide | `packages/policy-ui-kit` | packages/contracts/src/PolicyAccount.sol:17-19,48-58 delay, MAX_DELAY, |

## Candidate areas considered and how they were folded in

| Area from brief | Where |
|---|---|
| Onboarding wizard, safe defaults | onboarding |
| Plain-language UI, in-app help/glossary | ux-glossary (+ i18n for translation) |
| Payment links + QR (fragment-only) | Already exists (CreateInvoice.tsx:188-197, QrView.tsx, qr.ts:11); improved by share-safe, quick-request, embed-snippet |
| Invoice templates, recurring, payment requests | templates, recurring, quick-request |
| Multi-currency fiat display | fiat-display |
| Receipts, proof of payment | receipts, pay-reconcile (payer receipt already exists: payExec.ts:142-160) |
| Encrypted address book | contacts |
| CSV/accounting export | ledger-export |
| Wallet options | wallet-connect, smart-wallet-compat, hw-signer (injected/EIP-6963 exist: wallet.ts:45-72) |
| Mobile PWA/offline | pwa-offline |
| Notifications without third parties | notify-local |
| Merchant dashboard without backend, encrypted backup | local-store, backup-bundle, pay-reconcile, ledger-export |
| Search/filter/tagging | search-filter (single tag exists: Scan.tsx:205-227) |
| Multi-account/seller profiles | profiles |
| Embed widget/checkout SDK | embed-snippet, embed-return (popup SDK exists: public/ghostpay-embed-v1.js) |
| i18n | i18n |
| Accessibility | a11y-pass (basics exist: App.tsx skip link/focus, app.css 44 px targets, reduced motion) |
| Status/health page | net-status |
| Guided sweep with fee preview | sweep-guide |
| Dry-run / testnet mode | mode-guard |
| Undo/cancel for policy accounts | policy-undo (contract side exists; no client) |
| Error recovery guidance | ux-errors |
| Link preview-safe sharing | share-safe |
| Command palette / shortcuts | kbd-palette |
| Themes (cypher) | theme-pack |

## Cross-cutting findings

- **Unfixable-by-UI gap, fixable by process:** payments carry no invoice id by design (SPEC_REVIEW A1), so invoice-to-payment matching needs the payer proof flow in pay-reconcile rather than any on-chain change.
- **Persistence is the main blocker** for dashboard, export, search, templates and notifications: only tags persist (tags.ts, idbStore.ts); scan matches are memory-only (Scan.tsx:70). local-store is the foundation for 9 other features.
- **Chat providers see the key:** the encrypted-invoice key travels inside the link (envelope.ts:162-183). share-safe splits it without touching invoice-schema.
- **Address book vs hygiene:** hygiene.md wants a fresh destination per sweep; contacts therefore labels reuse as linking and does not nudge reuse.
- **Third-party exposure only where unavoidable and opt-in:** WalletConnect relay (wallet-connect), optional rate URL (fiat-display), optional webhook (notify-local, user-owned host). Web Push is rejected.
- **Unverified:** nothing here was run against a real wallet, chain or browser matrix; effort estimates are engineering judgement.

## Feature details

### ledger-export: CSV / accounting export
Impact 4/5 | Effort S | Score 4 | Build wave 1 | Depends on: local-store

#### Problem
Sellers cannot get payments into a spreadsheet or accounting tool; the only exports are the keystore and a payer JSON receipt.

#### Exists today (verified in repo) vs missing
- apps/web/src/components/Common.tsx:63-76 downloadText (local Blob download).
- apps/web/src/lib/payExec.ts:142-160 buildReceipt (payer side JSON only).
- No CSV code (grep "csv" in apps/web/src: 0 hits).
- Missing: everything described under Design.

#### Design
Pure formatter from ledger rows to CSV (RFC 4180) with presets: generic, Xero-style, QuickBooks-style, plain "date,chain,asset,gross,fee,net,tx/announcement,invoice label,tag,note". Amounts are decimal strings from bigint (formatUnits), never floats; fiat column only when a fiat value was recorded at receipt time (see fiat-display). Formula-injection guard: cells starting with = + - @ tab or CR are prefixed with a single quote.

#### Privacy and security impact
Export contains amounts and one-time addresses: confirm dialog + header comment row is NOT added (keeps CSV clean); file is local only. Option "omit addresses" on by default.

#### Build ownership
- NEW package: `packages/ledger-export` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ledger-export`.
- Public API (exports from `src/index.ts`):
- `toCsv(rows: LedgerRow[], opts: {preset; omitAddresses: boolean; locale?: "invariant"}): string`
- `csvEscape(cell: string): string`
- `PRESETS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Export button next to matches) or new Ledger view
- apps/web/src/components/Common.tsx (reuse downloadText)
- Add `@ghostpay/ledger-export` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **LEDGE-1** MUST Cells beginning with = + - @ \t \r are neutralised (OWASP CSV injection).
2. **LEDGE-2** MUST Fields with comma, quote or newline are quoted and quotes doubled.
3. **LEDGE-3** MUST Decimal amounts exact for 18-decimal bigints (no Number conversion).
4. **LEDGE-4** MUST Output uses CRLF and UTF-8 with no BOM unless requested.
5. **LEDGE-5** MUST Empty ledger -> header only.
6. **LEDGE-6** SHOULD Date column ISO-8601 UTC (reuse formatUnix style).
7. **LEDGE-7** SHOULD Deterministic row order (block, logIndex).

#### Acceptance tests
1. **T-1** Label "=HYPERLINK(...)" exports as "'=HYPERLINK(...)".
2. **T-2** Amount 123456789012345678901n at 18 dp exports "123.456789012345678901".
3. **T-3** Round trip through a CSV parser preserves commas/quotes/newlines in notes.
4. **T-4** omitAddresses=true -> no 0x40-hex substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### quick-request: Quick payment request (amount + memo in three fields)
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

#### Problem
Create invoice needs chain, token, currency, line items, tax, fee policy, slippage, quote TTL (CreateInvoice.tsx:84-181) even for "send me 25 USDC".

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/invoiceCreate.ts:87 buildInvoiceLink (full form -> signed link).
- apps/web/src/views/CreateInvoice.tsx:10-30 form state with defaults.
- Missing: everything described under Design.

#### Design
A preset layer that expands {amount, token, chain?, note?, validFor?} into a full InvoiceForm using safe defaults (fixed_token mode, one line item "Payment request" or the note, tax 0, seller_pays, expiry 24 h, no quote). Presets are data: "Simple request", "Tip jar (no amount)" is NOT included (schema needs amount). UI: collapsed "Simple / Advanced" toggle; Simple shows three fields and the resulting preview total; Advanced is the current form pre-filled from the preset.

#### Privacy and security impact
Pure local transformation. Defaults must not add identifying fields (no seller name, no email). Note text is encrypted by default in simple mode (flag on) but UI still warns the key is in the link.

#### Build ownership
- NEW package: `packages/request-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/request-kit`.
- Public API (exports from `src/index.ts`):
- `expandRequest(r: SimpleRequest, nowSec: number): InvoiceForm`
- `validateRequest(r): RequestProblem[]`
- `SIMPLE_DEFAULTS: Readonly<InvoiceFormDefaults>`
- `type SimpleRequest = {chainId; token: "native"|Address; amount: string; note?: string; validForHours?: number}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (mode toggle; call expandRequest; reuse buildInvoiceLink)
- Add `@ghostpay/request-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **QUICK-1** MUST expandRequest output passes the existing buildInvoiceLink validation without edits to invoice-schema.
2. **QUICK-2** MUST Amount parsed with parseUnits semantics (no float, no rounding); invalid -> RequestProblem, never throws.
3. **QUICK-3** MUST Defaults: fixed_token, tax 0, seller_pays, validFor 24 h (max 90 days as today).
4. **QUICK-4** MUST No default may enable fiat_quote while FEEDS is empty.
5. **QUICK-5** SHOULD Remember last-used chain/token in localStorage via try/catch (per-viewer convenience).
6. **QUICK-6** SHOULD Show the exact total and fee the payer will see.

#### Acceptance tests
1. **T-1** expandRequest({amount:"25.5",token:"native"}) -> tokenAmount 25.5 ETH-units string and totals consistent with Pay recomputation (lib/pay.ts:80).
2. **T-2** Amount "1e3", "-1", "0", "1.0000000000000000001" (19 dp) each produce a RequestProblem.
3. **T-3** Round trip: build link, parse with parseFragment, signature valid, lineItems length 1.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### ux-errors: Error recovery guidance
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

#### Problem
Errors are generic ("Something went wrong. Nothing was sent.", "Blocked by a safety check (CODE)") and give no next step.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/errors.ts:19-43 userMessage maps InvoiceError/ChainAdapterError/GhostPayCryptoError to fixed text; chain-adapter codes are shown raw (errors.ts:38).
- docs/user/troubleshooting.md has a symptom table that the app does not link to.
- Missing: everything described under Design.

#### Design
Pure map from stable error code (plus context: view, chain, has-RPC, has-relayer) to {summary, cause, steps[], severity, retrySafe, helpAnchor}. Steps are plain text keys, never interpolated user input. The app shows summary + "What to do" list + retry-safety line ("Nothing was sent" only when the caller proves it). Unknown codes fall back to a generic entry that still lists the three universal steps (check RPC, reload, see troubleshooting).

#### Privacy and security impact
No telemetry; no error text leaves the device. Messages must never echo links, keys, RPC URLs (preserves errors.ts contract). "Copy diagnostics" button copies only code + app version, never state.

#### Build ownership
- NEW package: `packages/ux-errors` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-errors`.
- Public API (exports from `src/index.ts`):
- `recover(code: string, ctx: {view; chainId?; hasRpc; hasRelayer; online}): Guidance`
- `listCodes(): string[] (for coverage test)`
- `type Guidance = {summary; steps: string[]; retrySafe: "yes"|"no"|"unknown"; docAnchor?: string; severity: "info"|"warn"|"error"}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/errors.ts (add code passthrough; keep userMessage signature)
- apps/web/src/components/Common.tsx (Notice gets optional steps list)
- each view that renders userMessage (Pay, Scan, Sweep, Settings, SellerKeys, CreateInvoice): replace text with <ErrorNotice error=...>
- Add `@ghostpay/ux-errors` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **UXERR-1** MUST Every ChainAdapterError, InvoiceError and GhostPayCryptoError code known to the app has a Guidance entry; a test enumerates the code unions and fails on a missing one.
2. **UXERR-2** MUST Guidance text contains no interpolation of user-supplied strings.
3. **UXERR-3** MUST "retrySafe: yes" only for errors raised before any signing or broadcast.
4. **UXERR-4** MUST Output is deterministic and pure (no I/O).
5. **UXERR-5** SHOULD Link each entry to the matching docs/user/troubleshooting.md row anchor.
6. **UXERR-6** SHOULD Offer context-aware first step (no RPC configured -> "Add an RPC in Settings" button).

#### Acceptance tests
1. **T-1** Given every code in the three error enums, recover() returns non-empty summary and >=1 step.
2. **T-2** Property: no output contains a 0x-prefixed 40-hex run or "https://" for arbitrary ctx.
3. **T-3** With ctx.hasRpc=false and code=RPC_UNREACHABLE the first step names Settings.
4. **T-4** Unknown code returns the generic entry.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### ux-glossary: In-app glossary, contextual help, plain-language labels
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

#### Problem
Terms such as stealth address, view tag, scheme id, permit, relayer, slippage, basis points appear unexplained (CreateInvoice.tsx:173-174 "Maximum slippage (basis points)"; Scan.tsx "One-time address").

#### Exists today (verified in repo) vs missing
- apps/web/src/components/Disclosure.tsx LIMITS and fee lists (static explanatory text).
- apps/web/src/views/About.tsx privacy notes.
- docs/user/*.md plain-language guides not reachable from the UI.
- Missing: everything described under Design.

#### Design
Typed glossary: term id -> {label, plain (<=25 words), detail (<=120 words), related[]}. A <Term id> inline component renders a button opening an accessible disclosure (details/summary pattern, no tooltip-only). A Help view lists all terms with search. "Plain labels" map internal names to user words (stealth address -> one-time address, basis points -> percent with the bps value shown in parentheses). Field hints reference term ids.

#### Privacy and security impact
Static bundled text, no remote fetch. Text reviewed for claims: never say "anonymous"; each privacy term links to privacy-limits wording.

#### Build ownership
- NEW package: `packages/ux-glossary` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-glossary`.
- Public API (exports from `src/index.ts`):
- `getTerm(id): Term | undefined`
- `searchTerms(q: string): Term[] (case-folded substring, locale-independent)`
- `bpsToPercent(bps: number): string  // 50 -> "0.5 %"`
- `TERM_IDS: readonly string[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/components/Common.tsx (Term component, keyboard operable)
- apps/web/src/state.tsx + App.tsx (add ViewId 'help')
- apps/web/src/views/Help.tsx (new)
- apps/web/src/views/CreateInvoice.tsx, Scan.tsx, Sweep.tsx, Settings.tsx (wrap jargon in <Term>)
- Add `@ghostpay/ux-glossary` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **UXGLO-1** MUST Every term id referenced in the UI exists (test scans a registry file).
2. **UXGLO-2** MUST Each plain definition <=25 words and contains no unexplained term id.
3. **UXGLO-3** MUST Term disclosure is operable by keyboard and announced to screen readers.
4. **UXGLO-4** MUST No definition claims anonymity or unlinkability.
5. **UXGLO-5** SHOULD Link to docs/user pages by relative path text (no network).
6. **UXGLO-6** SHOULD Help view deep-linkable by in-app state only (no query string).

#### Acceptance tests
1. **T-1** bpsToPercent(25)=="0.25 %", bpsToPercent(1)=="0.01 %", bpsToPercent(10000)=="100 %".
2. **T-2** searchTerms("one-time") returns the stealth-address entry.
3. **T-3** Lint test: no definition matches /anonymous|untraceable|unlinkable(?! is not)/i.
4. **T-4** Render test: Tab+Enter opens a Term, aria-expanded toggles.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### contacts: Encrypted contacts and labelled destinations
Impact 3/5 | Effort S | Score 3 | Build wave 1 | Depends on: local-store

#### Problem
Pinned seller keys are bare hex in a plain-text textarea (Settings.tsx:19,111); sweep destination is free text (Sweep.tsx:253); no labels, no poisoning protection.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/settings.ts:12,19 pinnedSigners plain in localStorage (max 50).
- apps/web/src/views/Pay.tsx:48 pinned usage.
- docs/remote/specs/address-safety.md (lookalike/poisoning checks).
- Missing: everything described under Design.

#### Design
Contact = {id, label, kind: signer|destination, value, note, createdAt}. Signers: label + compressed key; sync into the pin set passed to parseFragment (settings.pinnedSigners migrated here, old field kept readable). Destinations: label + address with a "reuse links your wallets" flag; hygiene prefers fresh destinations, so UI lists them as "known wallets" and warns on use. Duplicate/lookalike detection delegated to address-safety when available (prefix/suffix collision check implemented locally as fallback).

#### Privacy and security impact
Encrypted at rest (local-store); labels never leave device; export only via backup-bundle.

#### Build ownership
- NEW package: `packages/contacts` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/contacts`.
- Public API (exports from `src/index.ts`):
- `addContact/validate(c): Problem[]`
- `pinSet(contacts): string[]`
- `lookalike(addr, contacts): Contact[]  // same first4+last4`
- `codec for local-store`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Settings.tsx (pins section reads contacts)
- apps/web/src/views/Sweep.tsx (destination picker)
- apps/web/src/views/Pay.tsx (signer label display)
- Add `@ghostpay/contacts` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **CONTA-1** MUST Signer value validated as 66-hex 02/03 compressed point.
2. **CONTA-2** MUST Destination addresses stored lowercase and EIP-55 verified when mixed case.
3. **CONTA-3** MUST lookalike() flags any distinct address sharing first4+last4 hex.
4. **CONTA-4** MUST Migration copies settings.pinnedSigners without deleting until confirmed.
5. **CONTA-5** SHOULD Show label next to the key short-hex on Pay.

#### Acceptance tests
1. **T-1** Mixed-case address with bad checksum rejected.
2. **T-2** Two addresses sharing 0xabcd…1234 flagged.
3. **T-3** pinSet output equals legacy pins after migration.
4. **T-4** Invalid compressed key rejected.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### embed-snippet: Embed snippet generator and checkout SDK helpers
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

#### Problem
Merchants hand-write the data-invoice attribute and script tag; the SDK is popup-only and takes only a full invoice link (DEVIATIONS item 6).

#### Exists today (verified in repo) vs missing
- apps/web/public/ghostpay-embed-v1.js:1-40 usage and validLink rules (same-origin, https, fragment prefix, 22000 max).
- apps/web/src/embed.test.ts.
- Missing: everything described under Design.

#### Design
Generator builds a copy-paste HTML snippet (button, script tag, link) and a plain-link fallback; validates exactly the same rules as the embed script (shared validLink implemented in the package and imported by tests of both). Optional styled button variants (no inline style; class names + a tiny same-origin CSS file). Output HTML-escaped; a "test the button" preview opens the real popup.

#### Privacy and security impact
Snippet contains the invoice link (bearer): warn that embedding a per-invoice link in public HTML publishes it. Recommend per-order generation, not a static page.

#### Build ownership
- NEW package: `packages/embed-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/embed-kit`.
- Public API (exports from `src/index.ts`):
- `makeSnippet(link: string, appOrigin: string, opts: {label?: string}): string`
- `validateEmbedLink(link, appOrigin): "ok"|Reason`
- `escapeAttr(s): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (Embed tab after link creation)
- Add `@ghostpay/embed-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **EMBED-1** MUST validateEmbedLink equals the rules in ghostpay-embed-v1.js (cross-test with identical vectors).
2. **EMBED-2** MUST Attribute and text output escapes & < > " '.
3. **EMBED-3** MUST Refuses links on a different origin than appOrigin.
4. **EMBED-4** MUST No inline style/script emitted (CSP-friendly).
5. **EMBED-5** SHOULD Include SRI-free note: script served from same origin as app.

#### Acceptance tests
1. **T-1** Label `"><script>` is escaped.
2. **T-2** Link on other origin -> Reason "origin".
3. **T-3** Vectors shared with embed.test.ts all agree.
4. **T-4** Snippet round-trips through DOMParser with one button and one script.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### mode-guard: Testnet / practice mode and network badge
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

#### Problem
Nothing on screen says which network or risk mode you are in (header App.tsx tagline only); when mainnets are enabled a testnet/mainnet mix-up costs real money; new users have no safe way to rehearse.

#### Exists today (verified in repo) vs missing
- packages/chain-adapters/src/config/chains.ts:34-35 testnet:true flag; mainnets enabled:false.
- apps/web/src/App.tsx header shows static tagline only.
- apps/web/src/views/Pay.tsx review shows chain name but no mode styling.
- Missing: everything described under Design.

#### Design
Derive a Mode ("testnet" | "mainnet") per chain from ChainConfig.testnet. Persistent header badge showing mode, and the Pay/Sweep/Create views show a colour-independent banner ("TESTNET: coins have no value" / "MAINNET: real money"). Mainnet actions require a one-time per-session acknowledgement. Practice mode: generates a clearly marked sample invoice for a testnet and walks through review with the wallet step stubbed to "dry run" (builds and decodes calldata via existing preview but does not call sendViaWallet). Practice invoices carry memo prefix "PRACTICE" and are signed with a throw-away key.

#### Privacy and security impact
No data leaves device. Practice key is ephemeral and unrelated to seller keys (never reuse seller signing key for samples).

#### Build ownership
- NEW package: `packages/mode-guard` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/mode-guard`.
- Public API (exports from `src/index.ts`):
- `modeOf(chain: {testnet: boolean}): "testnet"|"mainnet"`
- `banner(mode): {text; ariaLabel; tone}`
- `needsAck(mode, session: {acked: Set<number>}, chainId): boolean`
- `practiceInvoice(nowSec): {form: InvoiceForm; signingKey: ephemeral}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/App.tsx (header badge)
- apps/web/src/views/Pay.tsx, Sweep.tsx, CreateInvoice.tsx (banner component)
- apps/web/src/views/Pay.tsx (dry-run path before sendViaWallet)
- Add `@ghostpay/mode-guard` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **MODEG-1** MUST Badge text distinguishes modes without relying on colour alone.
2. **MODEG-2** MUST Practice mode never calls wallet.sendViaWallet, relayer or any RPC write method (spy test).
3. **MODEG-3** MUST Practice invoice is rejected by a payer on any non-testnet chain.
4. **MODEG-4** MUST Mainnet acknowledgement is per session, in memory only.
5. **MODEG-5** SHOULD Show native symbol value disclaimer on testnets.

#### Acceptance tests
1. **T-1** modeOf({testnet:true})=="testnet".
2. **T-2** Practice run: zero calls to eth_sendTransaction/eth_sendRawTransaction.
3. **T-3** needsAck true first time on mainnet chain, false after ack, always false on testnet.
4. **T-4** Axe-style test: banner has role and text, no colour-only cue.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### net-status: Status and health page
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

#### Problem
Failures (no RPC, wrong chain id, relayer down, wrong device clock, blocked storage) surface late and cryptically; invoice expiry depends on the device clock.

#### Exists today (verified in repo) vs missing
- apps/web/src/views/Settings.tsx:47-60 per-chain RPC "Test" (chain id check only).
- apps/relayer/src/server.ts:24-33,233 serves GET /healthz and /v1/info.
- apps/web/src/lib/release.ts release-hash widget (Home.tsx:20-60).
- apps/web/src/lib/settings.ts storage-failure tolerance (saveSettings returns false).
- Missing: everything described under Design.

#### Design
Check runner: independent checks return {id, status: ok|warn|fail|skipped, detail}. Checks: RPC reachable + chain id; latest block age (stale RPC); clock skew vs latest block timestamp (warn >120 s); relayer /healthz and /v1/info (only if relayerUrl set); manifest loaded per chain; storage available (localStorage, IndexedDB); wallet detected; worker support; secure context. Every network check goes only to endpoints the user configured, user-initiated (button) and never automatic on load. Results are held in memory.

#### Privacy and security impact
No third-party endpoints (no "is the internet up" ping to a vendor). Relayer probe reveals IP to the relayer the user already chose; show that in the button label. No result persisted.

#### Build ownership
- NEW package: `packages/net-status` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/net-status`.
- Public API (exports from `src/index.ts`):
- `runChecks(env: CheckEnv, which?: CheckId[]): Promise<CheckResult[]>`
- `type CheckEnv = {rpc(chainId): Promise<RpcLike|undefined>; fetchFn; nowMs; storage probes; wallets: () => Promise<number>}`
- `clockSkewSec(localNowMs: number, blockTimestampSec: number): number`
- `CHECK_IDS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Status.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId 'status', nav entry)
- apps/web/src/views/Settings.tsx (link to Status after Test)
- Add `@ghostpay/net-status` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **NETST-1** MUST No check runs without a user action.
2. **NETST-2** MUST Each check has a timeout (default 8 s) and cannot throw out of runChecks.
3. **NETST-3** MUST Relayer checks are skipped when relayerUrl is empty.
4. **NETST-4** MUST Clock skew uses the RPC block timestamp, never a third-party time server.
5. **NETST-5** SHOULD Copyable plain-text report with no URLs (hosts replaced by "RPC for <chain name>").
6. **NETST-6** SHOULD Pair each fail with a ux-errors Guidance if installed.

#### Acceptance tests
1. **T-1** Mock RPC with chainId mismatch -> fail "different chain".
2. **T-2** Block timestamp 10 min behind local clock -> warn with skew≈600.
3. **T-3** relayerUrl="" -> relayer check skipped, zero fetch calls (spy).
4. **T-4** Report string contains no "http" substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### search-filter: Search, filter and multi-tag for payments
Impact 3/5 | Effort S | Score 3 | Build wave 1 | Depends on: local-store

#### Problem
Payments are an unsorted memory list; tags are one free-text label (Scan.tsx:205-227) with no search.

#### Exists today (verified in repo) vs missing
- apps/web/src/views/Scan.tsx:154-238 Matches list; 240-324 Tags list.
- apps/web/src/lib/tags.ts TagPayload single clientLabel/notes.
- Missing: everything described under Design.

#### Design
Pure query engine over ledger rows: free-text (case/NFC-folded) on label/note/tags, filters (chain, token, status, amount range, date range, swept/unswept), sort, tag set (<=10 tags each <=32 chars). Query is a typed object (no string DSL eval). Text search runs in memory after unlock (no index stored in plaintext).

#### Privacy and security impact
No plaintext index persisted; searching decrypted rows in memory only.

#### Build ownership
- NEW package: `packages/ledger-query` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ledger-query`.
- Public API (exports from `src/index.ts`):
- `query(rows: LedgerRow[], q: Query): LedgerRow[]`
- `normalizeTag(s): string`
- `facets(rows): {tags; tokens; chains}`
- `compareBy(field, dir)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (filter bar above Matches)
- Add `@ghostpay/ledger-query` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **SEARC-1** MUST Filtering never mutates rows.
2. **SEARC-2** MUST NFC + case-fold search (é matches e + combining accent).
3. **SEARC-3** MUST Amount range uses bigint compare.
4. **SEARC-4** MUST Query object validated; unknown fields ignored safely.
5. **SEARC-5** SHOULD Debounced input; result count announced in live region.

#### Acceptance tests
1. **T-1** Tag "Café" found by "cafe\u0301".
2. **T-2** Range [1,10) excludes 10.
3. **T-3** Stable sort preserves input order for ties.
4. **T-4** 10k rows query < 50 ms.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### backup-bundle: Encrypted full backup and restore
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: local-store

#### Problem
Clearing browser data loses tags, settings, checkpoints (docs/user/troubleshooting.md: "Tags gone ... There is no encrypted export yet"); keystore backup covers keys only.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/keystore.ts scrypt N=2^17 + AES-GCM keystore export/import (SellerKeys.tsx:56 download).
- docs/remote/modules-needed.md rank 11 (backup/recovery Partial); import cost uncapped (audit S3-13).
- Missing: everything described under Design.

#### Design
One versioned JSON envelope: {magic, v, kdf params, salt, nonce, ciphertext} holding a manifest of sections (settings, checkpoints, local-store dump, templates, contacts, profile meta, optionally the keystore). Passphrase -> scrypt (same params floor as keystore.ts) -> AES-256-GCM, AAD = magic||v||section-list. Import validates every section with its codec before applying; applies atomically (stage then swap); shows a diff summary (counts) and requires explicit merge/replace choice. KDF parameters on import are bounded (N<=2^20, r,p caps) to prevent DoS.

#### Privacy and security impact
Bundle never contains seller secrets unless the user ticks "include keys" (default off; keystore already exists). Passphrase strength meter reuses passphraseProblem. File is local only; no cloud sync. Warn that a backup containing the ledger reveals commercial history if passphrase is weak.

#### Build ownership
- NEW package: `packages/backup-bundle` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/backup-bundle`.
- Public API (exports from `src/index.ts`):
- `createBackup(sections: SectionData, passphrase: string, opts?: KdfOpts): Promise<string>`
- `inspectBackup(text): {v; sections: string[]; kdf}  // no decryption`
- `restoreBackup(text, passphrase): Promise<SectionData>`
- `applyPlan(current, restored, mode: "merge"|"replace"): Plan`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Settings.tsx (Backup & restore fieldset)
- apps/web/src/lib/services.ts (expose sections)
- Add `@ghostpay/backup-bundle` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **BACKU-1** MUST KDF parameter bounds enforced before any scrypt call.
2. **BACKU-2** MUST Wrong passphrase and tampered ciphertext are indistinguishable errors.
3. **BACKU-3** MUST Unknown section ids are ignored, not applied; unknown major version rejected.
4. **BACKU-4** MUST Restore is atomic: failure leaves existing data untouched.
5. **BACKU-5** MUST Passphrase min policy equals keystore.ts passphraseProblem.
6. **BACKU-6** SHOULD Embed a SHA-256 of plaintext sections inside the ciphertext for corruption detection.
7. **BACKU-7** SHOULD Dry-run restore preview.

#### Acceptance tests
1. **T-1** Round trip equality of all sections.
2. **T-2** N=2^25 in header -> rejected without running scrypt.
3. **T-3** Bit flip anywhere -> DECRYPT error.
4. **T-4** Restore with failing section codec leaves store unchanged (spy on writes).
5. **T-5** Bundle without keys section contains no 64-hex secret known to the test.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### local-store: Encrypted local store (ledger, templates, contacts, profiles namespace)
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none

#### Problem
Only tags persist (encrypted). Scan matches are memory-only (state.tsx matches; Scan.tsx:70 app.setMatches([])), issued invoices, receipts and contacts vanish on reload, blocking dashboards, exports, reconciliation and templates.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/tags.ts HKDF(viewing key)->AES-GCM + HMAC lookup, IdbTagStore apps/web/src/lib/idbStore.ts (tags only, DB "ghostpay-tags").
- apps/web/src/lib/scanClient.ts:149 plain checkpoints in localStorage keyed by chain only (no profile namespace).
- apps/web/src/lib/session.ts:29 single in-memory key session.
- Missing: everything described under Design.

#### Design
Generic typed collections over IndexedDB with the tags.ts crypto pattern: per-profile random salt, HKDF(viewing key, info="GhostPay/local-store/v1/<collection>") -> AES-256-GCM non-extractable key, HMAC lookup tokens, AAD binds {schemaVersion, collection, profileId}. Collections: ledger (matches, receipts), invoices (issued metadata, no secrets), templates, contacts. Versioned migrations; quota-error handling; lock/unlock reuses vault idle lock. Profile id is a random 16-byte value, giving namespace for later multi-profile. Existing tag vault migrates in place (read old DB, rewrite, keep old until user confirms).

#### Privacy and security impact
Ciphertext only on disk; collection names and sizes are visible to local attackers (documented). Never stores spending/signing keys. Unlock requires keys in memory. Wipe API deletes DB. No network.

#### Build ownership
- NEW package: `packages/local-store` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/local-store`.
- Public API (exports from `src/index.ts`):
- `openStore(idb: IDBFactory|MemoryBackend, profileId): Store`
- `store.unlock(viewingKey: Uint8Array): Promise<void>; lock(); wipe()`
- `store.collection<T>(name, codec): {put(id,v); get(id); list(filter?); delete(id); count()}`
- `codec = {version: number; parse(unknown): T; migrate(from: number, raw): unknown}`
- `exportRaw(): Promise<EncryptedDump>; importRaw(d) (consumed by backup-bundle)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/services.ts + defaultServices.ts (add store to Services)
- apps/web/src/App.tsx (lock on idle, as vault today)
- apps/web/src/views/Scan.tsx (persist matches after scan)
- Add `@ghostpay/local-store` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **LOCAL-1** MUST All records encrypted with a fresh 96-bit IV; AAD mismatch makes decryption fail (tamper test).
2. **LOCAL-2** MUST Wrong viewing key cannot decrypt; unlock verifies via check record like tags.ts.
3. **LOCAL-3** MUST Keys derived with distinct HKDF info per collection.
4. **LOCAL-4** MUST Schema parse rejects unknown fields; migrations are pure and tested.
5. **LOCAL-5** MUST Works against MemoryBackend (tests) and real IndexedDB.
6. **LOCAL-6** MUST Never writes plaintext, raw addresses or unkeyed hashes.
7. **LOCAL-7** SHOULD Quota/ storage-eviction detection with navigator.storage.persist() request (user gesture).
8. **LOCAL-8** SHOULD Bulk put in one transaction.

#### Acceptance tests
1. **T-1** Round trip put/get/list per collection.
2. **T-2** Flip one ciphertext byte -> get throws DECRYPT, other records unaffected.
3. **T-3** Swap ciphertext between two records -> AAD failure.
4. **T-4** Scan raw IDB dump (memory backend): no occurrence of any known plaintext address/label.
5. **T-5** Migration v1->v2 fixture converts and re-encrypts.
6. **T-6** Concurrent puts keep consistent counts.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### onboarding: Onboarding wizard with safe defaults
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: ux-glossary, net-status

#### Problem
First run shows 8 tabs and a blank Settings page; payments need an RPC the user must find (no default RPC built in, Settings.tsx:71), a manifest, keys, a backup; steps are not ordered.

#### Exists today (verified in repo) vs missing
- apps/web/src/views/Home.tsx:20-60 three role cards.
- apps/web/src/views/SellerKeys.tsx generate/import/export.
- apps/web/src/views/Settings.tsx RPC + relayer fields.
- DEFAULT_SETTINGS lib/settings.ts:19-29 (no RPC, delay 120-900 s, autoClearFragment true).
- Missing: everything described under Design.

#### Design
Role-based checklist state machine (Seller | Payer), each step with done-predicate computed from app state: [choose role] -> [pick network (testnet default)] -> [RPC: explain options (own node, provider, Tor via network-privacy spec); no preselected vendor; test via net-status] -> [seller: generate keys -> download encrypted keystore (must pass passphrase policy; "I saved it" requires a re-import test) -> optional local-store setup] -> [payer: wallet detect]. Progress persisted as booleans in localStorage (per-viewer convenience, try/catch). Safe defaults table lives in the package and is the single source for DEFAULT_SETTINGS deltas. Skippable at any step; wizard never auto-reopens after dismissal (Help view can reopen).

#### Privacy and security impact
Wizard never suggests a specific RPC vendor or sets one silently. States, per-RPC trade-offs in neutral language (provider sees IP and queried addresses). Does not store any key, passphrase or URL.

#### Build ownership
- NEW package: `packages/onboarding` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/onboarding`.
- Public API (exports from `src/index.ts`):
- `steps(role: Role): Step[]`
- `nextStep(role, s: Snapshot): StepId|"done"`
- `type Snapshot = {hasRpc: Record<number,boolean>; hasKeys; keystoreVerified; walletFound; manifestLoaded; networkChosen}`
- `SAFE_DEFAULTS: Readonly<SettingsPatch>`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Home.tsx (checklist card)
- apps/web/src/views/Onboarding.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId, first-run flag)
- apps/web/src/views/SellerKeys.tsx (emit keystoreVerified)
- Add `@ghostpay/onboarding` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **ONBOA-1** MUST Never preselect or hard-code an RPC URL.
2. **ONBOA-2** MUST Seller path cannot reach "done" until a keystore was exported AND re-imported (verification) or the user explicitly ticks "I accept losing funds if keys are lost".
3. **ONBOA-3** MUST Testnet is the default network while mainnets are disabled and a banner is shown (mode-guard).
4. **ONBOA-4** MUST Every step is skippable and resumable; keyboard operable; focus moves to the step heading.
5. **ONBOA-5** MUST No step writes secrets to storage.
6. **ONBOA-6** SHOULD Offer "Practice with a sample invoice" (mode-guard).
7. **ONBOA-7** SHOULD Estimate time per step.

#### Acceptance tests
1. **T-1** nextStep for a new seller returns "network" then "rpc" then "keys" in order.
2. **T-2** Snapshot with keys but keystoreVerified=false -> not done.
3. **T-3** Storage throwing on access -> wizard still works in-memory.
4. **T-4** Playwright: complete seller path on mock RPC; no request to non-user hosts (network log).
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### pay-reconcile: Invoice-to-payment reconciliation via payer proof
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: local-store

#### Problem
The chain carries no invoice id (SPEC_REVIEW A1; ADR-0003), so the seller sees "0.5 ETH from someone" and cannot tell which invoice was paid; single-use is enforced only off-chain.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts:142-160 payer receipt includes invoiceNonce, txHash, net amount.
- apps/web/src/views/Scan.tsx:147-152 describe(match) shows amount only.
- docs/SPEC_REVIEW.md:9 (A1) removed on-chain invoiceId deliberately.
- Missing: everything described under Design.

#### Design
(1) Seller ledger records each issued invoice (nonce, token, expected net amount, expiry, status). (2) Heuristic suggestions: unmatched scan matches proposed against open invoices by token + exact expected net within [issued, expiry] window; ambiguity shown, never auto-confirmed. (3) Exact path: payer "proof code" = base64url{nonce, chainId, txHash} (+ optional seller-signature challenge not needed); seller pastes it, the package verifies against a scanned match whose announcement tx equals txHash. Match status: open -> suggested -> confirmed -> swept. (4) Expiry/replay: a nonce already confirmed rejects second proof.

#### Privacy and security impact
No new on-chain data. Proof code reveals tx hash and nonce to whoever receives it (the seller, over the user's chosen channel); UI warns. Does not link payer wallet beyond what chain already shows.

#### Build ownership
- NEW package: `packages/pay-reconcile` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/pay-reconcile`.
- Public API (exports from `src/index.ts`):
- `suggestMatches(open: IssuedInvoice[], matches: LedgerMatch[]): Suggestion[]`
- `encodeProof(p: {nonce; chainId; txHash}): string; decodeProof(s): Proof (strict, size-bounded)`
- `confirm(ledger, proof, matches): Result  // verifies txHash == match tx and token/amount within invoice`
- `status machine: transition(inv, event)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (suggestion chips, "Paste payment proof")
- apps/web/src/views/Pay.tsx (show proof code after submit)
- apps/web/src/lib/payExec.ts (receipt gains proof)
- Add `@ghostpay/pay-reconcile` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **PAYRE-1** MUST Never auto-confirm an ambiguous heuristic match.
2. **PAYRE-2** MUST decodeProof rejects >512 bytes, non-canonical base64url, bad hex, and unknown versions.
3. **PAYRE-3** MUST A nonce can be confirmed once; second proof returns ALREADY_CONFIRMED.
4. **PAYRE-4** MUST Amount comparison uses bigint and the invoice net after fee policy.
5. **PAYRE-5** MUST Match requires same chainId and token.
6. **PAYRE-6** SHOULD Ledger shows partial/over payments distinctly.
7. **PAYRE-7** SHOULD Warn when proof tx predates invoice issue time.

#### Acceptance tests
1. **T-1** Two open invoices with equal amounts -> both suggested, none confirmed.
2. **T-2** Valid proof for match tx -> confirmed; replay -> ALREADY_CONFIRMED.
3. **T-3** Proof with txHash not in matches -> NOT_FOUND.
4. **T-4** Fuzz decodeProof: never throws non-ProofError.
5. **T-5** Underpayment -> status "partial".
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### sweep-guide: Guided sweep with fee preview
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none

#### Problem
Sweep screen is one long form: free-text destination, no direct-sweep gas estimate, no comparison of relayer vs direct, no confirmation tracking beyond a hash (Sweep.tsx:253,270-290).

#### Exists today (verified in repo) vs missing
- apps/web/src/views/Sweep.tsx:204-231 quote and sweep handlers; 270-276 relayer fee display; 285-290 hash only.
- apps/web/src/lib/sweep.ts:54,171 balance/gas reads.
- docs/remote/privacy-specs/hygiene.md HY-DST/HY-CON/HY-BUF (fresh destination, no consolidation, rounding).
- docs/remote/specs/address-safety.md, tx-review.md.
- Missing: everything described under Design.

#### Design
Step model: 1 balance & asset check -> 2 destination (derived fresh destination preferred per hygiene HY-DST; manual entry flagged "links your wallets") -> 3 method comparison table: relayer {fee, net, needs permit, relayer sees X} vs direct {est. gas, needs native coin at one-time address, net} computed with bigint, with the cheapest and the most private marked separately -> 4 review (reuse tx-review decoder when available) -> 5 submit -> 6 track (poll receipt via wallet.pollReceipt-style; show included/final per chain finalityDepth). Dust guard: net <= 0 or fee > 30 % of balance blocks with explanation.

#### Privacy and security impact
Comparison text states exactly what each path reveals. No auto-selection of destination; no batching of several one-time addresses (hygiene HY-CON). Estimates come only from the user's RPC and the chosen relayer.

#### Build ownership
- NEW package: `packages/sweep-guide` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/sweep-guide`.
- Public API (exports from `src/index.ts`):
- `compare(inputs: {balance; decimals; relayerQuote?; gasEstimate?; maxFeePerGas?}): MethodComparison`
- `dustVerdict(balance, fee): "ok"|"warn"|"block"`
- `stepFor(state): StepId`
- `netAfterFee(balance, fee): bigint`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Sweep.tsx (restructure into steps, reuse existing handlers)
- apps/web/src/lib/sweep.ts (expose gas estimate; read-only)
- Add `@ghostpay/sweep-guide` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **SWEEP-1** MUST Both methods shown whenever both are possible, with exact net amounts as bigint-derived strings.
2. **SWEEP-2** MUST Block when net<=0 or fee exceeds the 3 % relayer cap (existing client check) or 30 % dust threshold.
3. **SWEEP-3** MUST Destination equal to the one-time address is rejected (reuse checkDestination).
4. **SWEEP-4** MUST No step changes signing/broadcast logic; guide only orders and explains.
5. **SWEEP-5** MUST Finality shown from chain finalityDepth, not hard-coded.
6. **SWEEP-6** SHOULD Persist sweep state (ledger) after confirmation.
7. **SWEEP-7** SHOULD Explain gas funding privacy (link to hygiene wording).

#### Acceptance tests
1. **T-1** Balance 1000 units, relayer fee 40 -> net 960, ratio 4 % -> warn.
2. **T-2** Fee > balance -> block, no submit button enabled.
3. **T-3** compare() with only relayer quote returns direct as "unavailable: no native coin".
4. **T-4** Step order test through a mocked happy path.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### a11y-pass: Accessibility audit and accessible options
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

#### Problem
No axe or screen-reader audit has been run (apps/web/DEVIATIONS.md Unverified); no text-size, motion or contrast options beyond system theme.

#### Exists today (verified in repo) vs missing
- apps/web/src/App.tsx skip link, main focus on view change, sr-only live region.
- apps/web/src/components/Common.tsx:5 Notice role="alert" for errors.
- apps/web/src/styles/app.css:130,149,163,196,208,250,252 focus ring, 44 px targets, reduced motion.
- docs/remote/pages-theme/README.md contrast ratios (theme only).
- Missing: everything described under Design.

#### Design
(1) CI axe-core run in Playwright over every view and key states (fixed list). (2) Accessible-options settings: text size (100/125/150 %), high-contrast theme tokens, reduce motion override, "simple layout" (single column). (3) Pure helpers: contrast ratio calculator for theme token validation; heading-order and label checker used in tests. (4) Document keyboard map.

#### Privacy and security impact
Settings stored with other preferences; no assistive-tech detection or fingerprinting (never read matchMedia results into storage beyond the user's explicit choice).

#### Build ownership
- NEW package: `packages/a11y-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/a11y-kit`.
- Public API (exports from `src/index.ts`):
- `contrastRatio(fg: string, bg: string): number`
- `validateTokens(tokens): Violation[]  // min 4.5 text, 3 non-text`
- `headingOrder(html: string): Violation[]`
- `TEXT_SCALES`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/styles/app.css (tokens, scale class)
- apps/web/src/views/Settings.tsx (Accessibility fieldset)
- apps/web/src/lib/settings.ts (new fields via sanitizeSettings)
- apps/web/e2e (axe spec)
- Add `@ghostpay/a11y-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **AYPAS-1** MUST Zero axe "serious/critical" violations on all listed views.
2. **AYPAS-2** MUST All token pairs pass WCAG 2.2 AA contrast (computed by the package).
3. **AYPAS-3** MUST Text scale up to 200 % causes no horizontal scroll at 320 px.
4. **AYPAS-4** MUST New settings sanitised with defaults on bad input.
5. **AYPAS-5** SHOULD Document screen-reader walkthrough results (NVDA/VoiceOver) as manual evidence.

#### Acceptance tests
1. **T-1** contrastRatio("#000","#fff")==21 within 0.01.
2. **T-2** validateTokens flags a 3.9:1 pair.
3. **T-3** Playwright axe over 8 views: no serious+.
4. **T-4** 320 px viewport + scale 200 % : document.scrollWidth<=innerWidth.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### fiat-display: Fiat display and privacy-safe price source
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

#### Problem
Users think in fiat but see only token units; fiat-priced invoices cannot be paid (no feeds, quote.ts:36 FEEDS empty; DEVIATIONS item 4); only USD-style 2-decimal minor units are handled (format.ts:41-56).

#### Exists today (verified in repo) vs missing
- packages/chain-adapters/src/quote.ts:36,46,123,152 FEEDS table, findFeed, fiatToTokenAmount, createAggregatorReader (on-chain Chainlink read through the user RPC).
- apps/web/src/lib/format.ts:41-56 fiatDecimals/formatFiat.
- apps/web/src/lib/pay.ts:128-141 fiat_quote path.
- Missing: everything described under Design.

#### Design
Display-only approximation layer, never used to compute payable amounts. Sources in priority: (1) on-chain feed via the user RPC (existing aggregator reader, once FEEDS is populated and verified), (2) user-entered manual rate per pair, (3) cached last-good rate with age label. NO third-party price API by default; an optional user-configured HTTPS rate URL may be added via the network-privacy transport and is labelled "this host learns your IP and pair". Offline: show cached rate with "as of" age and a stale badge >1 h; no rate -> show nothing rather than guess. Currency display via formatFiat extended with Intl-free table of minor-unit exponents (ISO 4217 incl. 3-dec BHD/KWD).

#### Privacy and security impact
Fetching a price from a vendor reveals IP and interest; default path uses RPC the user already chose. Cache holds only pair, rate, timestamp (no amounts).

#### Build ownership
- NEW package: `packages/fiat-display` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/fiat-display`.
- Public API (exports from `src/index.ts`):
- `convertDisplay(tokenAmount: bigint, decimals, rate: Rate): {minor: bigint; currency}  // floor, display only`
- `rateFromFeed(answer: bigint, feedDecimals): Rate`
- `isStale(rate, nowSec, maxAgeSec): boolean`
- `fiatExponent(code): 0|2|3`
- `type Rate = {pair; num: bigint; den: bigint; asOf: number; source: "chain"|"manual"|"cache"|"url"}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/format.ts (extend fiatDecimals via package)
- apps/web/src/views/Pay.tsx, Sweep.tsx, Scan.tsx (secondary fiat line)
- apps/web/src/views/Settings.tsx (manual rates, optional URL)
- Add `@ghostpay/fiat-display` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **FIATD-1** MUST All conversion uses bigint rationals; no Number for money.
2. **FIATD-2** MUST Displayed fiat is always labelled "approx." and never feeds payment amount computation.
3. **FIATD-3** MUST Stale or missing rate hides the fiat line.
4. **FIATD-4** MUST No request to any host the user did not configure.
5. **FIATD-5** MUST Exponent table covers 0/2/3-decimal ISO currencies.
6. **FIATD-6** SHOULD Round half-up for display, floor for conservative receivable values; label which.

#### Acceptance tests
1. **T-1** 1 ETH at rate 2000.00 USD -> 200000 minor units.
2. **T-2** JPY exponent 0, BHD exponent 3 formatted correctly.
3. **T-3** Rate older than maxAge -> isStale true and UI shows no fiat.
4. **T-4** Network spy: zero fetches when source is manual/cache.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### pwa-offline: Installable PWA and offline mode
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

#### Problem
Not installable (index.html has no manifest/icon: line 17 icon data:,); creating invoices and reviewing already-opened links should work offline, but a reload offline fails.

#### Exists today (verified in repo) vs missing
- apps/web/index.html:5-17 CSP meta, worker-src self allowed.
- All invoice build/parse is local (invoiceCreate.ts, pay.ts review).
- docs/remote/pages-prototype.md: Pages host has no header control; base path /GhostPay/.
- Missing: everything described under Design.

#### Design
Service worker (same-origin, scope = app base) with a precache of the hashed build asset list, cache-first for those, network-only for everything else (RPC, relayer, manifests fetched fresh with fallback to last-good clearly labelled). Fragments never reach SW (not in request URLs). Update flow: on new version, show "Update available (hash abc…)" and require click; the release-hash widget (Home.tsx) still hashes the running script. webmanifest with name, icons, display standalone. The SW file and manifest are static files emitted by the build; `scan-bundle` allowlist updated.

#### Privacy and security impact
SW pins an old version until updated: shown with version and hash, with a "Remove offline copy" button (unregister + caches.delete). Cache holds public assets only; no keys, links or responses from RPC/relayer.

#### Build ownership
- NEW package: `packages/pwa-shell` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/pwa-shell`.
- Public API (exports from `src/index.ts`):
- `buildPrecacheList(distFiles: {path; bytes}[]): PrecacheEntry[]  // with SHA-256`
- `swPlan(routes): decision table (cache-first | network-only)`
- `shouldCache(url: URL, appOrigin): boolean`
- `versionLabel(entries): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/index.html (link manifest)
- apps/web/public/ (manifest, sw.js built by package)
- apps/web/src/main.tsx (register after load, opt-in)
- apps/web/src/views/Settings.tsx (Offline copy: enable/remove)
- apps/web/scripts/scan-bundle.mjs (allow sw.js)
- Add `@ghostpay/pwa-shell` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **PWAOF-1** MUST shouldCache is false for any cross-origin URL and for any URL with a query string or fragment.
2. **PWAOF-2** MUST SW never caches POST or responses to RPC/relayer URLs.
3. **PWAOF-3** MUST Registration is opt-in (user toggle), default off.
4. **PWAOF-4** MUST Update requires explicit user click; stale SW cannot silently serve a different version than shown.
5. **PWAOF-5** MUST "Remove offline copy" fully unregisters and clears caches.
6. **PWAOF-6** SHOULD Offline banner and disabled network-dependent buttons with reason.

#### Acceptance tests
1. **T-1** shouldCache(https://rpc.example/x) false; same-origin /assets/index-abc.js true; same-origin with ?x false.
2. **T-2** buildPrecacheList hashes every file once, deterministic order.
3. **T-3** Playwright offline: create invoice link works after enable + reload.
4. **T-4** After remove, navigator.serviceWorker.getRegistrations() is empty.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### receipts: Seller-signed receipts and proof-of-payment export
Impact 4/5 | Effort M | Score 2 | Build wave 2 | Depends on: local-store, pay-reconcile

#### Problem
Payers have only a local JSON receipt (Pay.tsx:552) that the seller never signed; sellers issue nothing; disputes rely on screenshots.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts:142-160 payer receipt (unsigned).
- packages/invoice-schema/src/sign.ts signing with the invoice-signing key.
- apps/web/src/views/Pay.tsx:552-557 confirm + download.
- Missing: everything described under Design.

#### Design
Receipt v1 = canonical JSON {kind, v, invoiceNonce, chainId, txHash, token, net, issuedAt, signer} signed with the seller invoice-signing key (domain-separated "GhostPay/receipt/v1"). Verifier (offline, pure) checks signature, optional pinned signer, and optional on-chain tx lookup via user RPC. Printable HTML/plain-text rendering without line-item data unless the seller opts in. Payer-side "proof of payment" = tx hash + invoice nonce + seller receipt.

#### Privacy and security impact
Receipt contains amount, tx and nonce; no new on-chain data. Opt-in to include line items. Signature proves seller key control, not identity (same caveat as invoices).

#### Build ownership
- NEW package: `packages/receipts` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/receipts`.
- Public API (exports from `src/index.ts`):
- `issueReceipt(p: ReceiptPayload, signingKey: SecretScalar): SignedReceipt`
- `verifyReceipt(r: unknown, opts: {pinnedSigners?}): VerifyResult`
- `renderReceiptText(r): string`
- `encode/decode (canonical, size-bounded)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Issue receipt on a confirmed match)
- apps/web/src/views/Pay.tsx (Import/verify seller receipt)
- Add `@ghostpay/receipts` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **RECEI-1** MUST Canonical encoding identical across runs (reuse invoice-schema canonical JSON).
2. **RECEI-2** MUST Domain separation prevents invoice signature being replayed as receipt signature.
3. **RECEI-3** MUST verifyReceipt never trusts unsigned fields; unknown keys rejected.
4. **RECEI-4** MUST Issuing requires status "confirmed" from pay-reconcile.
5. **RECEI-5** MUST Signing key never leaves SecretScalar handling.
6. **RECEI-6** SHOULD Receipt number (monotonic per profile) stored in ledger.

#### Acceptance tests
1. **T-1** Tamper any field -> INVALID_SIGNATURE.
2. **T-2** Invoice signature bytes re-labelled as receipt -> fail.
3. **T-3** Pinned signer mismatch -> verified but not trusted.
4. **T-4** Canonical output stable against fixture.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### share-safe: Safe link sharing (passphrase-split, unfurl-safe, print card)
Impact 4/5 | Effort M | Score 2 | Build wave 0 | Depends on: none

#### Problem
The invoice link is a bearer secret and its decryption key is inside it (envelope.ts:162-183); pasting it into a chat gives the chat provider everything, and previews/history copy it (CreateInvoice.tsx:191 warning only).

#### Exists today (verified in repo) vs missing
- apps/web/src/views/CreateInvoice.tsx:188-197 link + QR + warning.
- apps/web/src/components/QrView.tsx SVG download.
- packages/invoice-schema/src/envelope.ts:95,171 key in fragment, option encrypt.
- index.html:8 referrer no-referrer.
- Missing: everything described under Design.

#### Design
Share options: (a) Split mode: public link carries signed public part only; private part (line items, memo) delivered as a separate "details code" or passphrase-encrypted blob the payer pastes (scrypt + AES-GCM, same format family as backup). Requires a schema-compatible envelope variant: share-safe produces a v1 link with enc.k REMOVED and a separate key string; payer app joins them (pure client concat before parseFragment, so invoice-schema is untouched). (b) QR-only / print card layout with amount and expiry text (CSS print sheet). (c) Preview hygiene: app serves generic OG/Twitter text only (no per-invoice content possible since fragment is never sent). (d) Link size meter with 16 KiB limit and QR fit check.

#### Privacy and security impact
Splitting means one channel compromise no longer reveals details; advice text says use two channels. Never uses link shorteners or any server. Print card contains the link: warn about printers/spoolers.

#### Build ownership
- NEW package: `packages/share-safe` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/share-safe`.
- Public API (exports from `src/index.ts`):
- `splitLink(link: string): {publicLink: string; keyCode: string}  // keyCode = base32 groups with checksum`
- `joinLink(publicLink, keyCode): string`
- `checkKeyCode(s): boolean (checksum)`
- `sizeReport(link): {bytes; limit; qrFits}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (share mode radio, key code display)
- apps/web/src/views/Pay.tsx (key code input when fragment has enc stub)
- apps/web/src/styles/app.css (print rules)
- Add `@ghostpay/share-safe` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **SHARE-1** MUST joinLink(splitLink(x))==x for every valid encrypted v1 link.
2. **SHARE-2** MUST publicLink without keyCode never decrypts (parseFragment fails with DECRYPT, not partial text).
3. **SHARE-3** MUST Key code has a checksum so typos are detected before decrypt.
4. **SHARE-4** MUST No network request is made by any share function.
5. **SHARE-5** MUST Unencrypted links are refused for split mode with a clear message.
6. **SHARE-6** SHOULD Group key code in 4-char blocks, case-insensitive entry, ambiguity-free alphabet (no 0/O/1/I).

#### Acceptance tests
1. **T-1** Round trip on fixtures from invoice-schema test vectors.
2. **T-2** Flip one key-code character -> checkKeyCode false.
3. **T-3** Fuzz: arbitrary strings to joinLink never throw non-typed errors.
4. **T-4** Parsing publicLink alone yields DECRYPT error code.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### templates: Invoice templates and duplicate invoice
Impact 4/5 | Effort M | Score 2 | Build wave 1 | Depends on: local-store

#### Problem
Every invoice is re-typed (CreateInvoice.tsx:18-27 starts empty each visit).

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/invoiceCreate.ts InvoiceForm shape (lines 20-40).
- Missing: everything described under Design.

#### Design
Template = InvoiceForm minus per-invoice fields (nonce, expiry timestamps) with name and version, stored encrypted in local-store. Operations: save as template, apply, duplicate issued invoice (copies lineItems/tax/token, fresh nonce and expiry), import/export inside backup. Placeholders: {{date}} and {{counter}} in description expanded locally by a safe tokenizer (no eval, no arbitrary expressions).

#### Privacy and security impact
Templates are commercial data: encrypted at rest, excluded from analytics (none exist). Placeholder expansion is pure string replace of two fixed tokens.

#### Build ownership
- NEW package: `packages/invoice-templates` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/invoice-templates`.
- Public API (exports from `src/index.ts`):
- `toTemplate(form: InvoiceForm, name: string): Template`
- `applyTemplate(t: Template, ctx: {nowSec; counter}): InvoiceForm`
- `expandPlaceholders(s, ctx): string`
- `codec: parse/migrate (for local-store)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (template picker, Save as template)
- Add `@ghostpay/invoice-templates` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **TEMPL-1** MUST Applying a template always yields a fresh nonce and recomputed expiry.
2. **TEMPL-2** MUST Unknown placeholders are left literal and flagged, never evaluated.
3. **TEMPL-3** MUST Template parse rejects over-limit items (50) and descriptions (200 code points) as the schema does.
4. **TEMPL-4** MUST Stored only via local-store.
5. **TEMPL-5** SHOULD Duplicate keeps the original invoice nonce out of the new form.

#### Acceptance tests
1. **T-1** applyTemplate twice -> different nonces after build.
2. **T-2** "{{date}}" expands to ISO date from injected nowSec.
3. **T-3** "{{constructor}}" untouched.
4. **T-4** Oversized template rejected.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### kbd-palette: Command palette and keyboard shortcuts
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: ux-glossary

#### Problem
Eight nav buttons and long forms; power users and keyboard users have no quick actions.

#### Exists today (verified in repo) vs missing
- apps/web/src/App.tsx:18 ORDER of views; nav buttons.
- Missing: everything described under Design.

#### Design
Ctrl/Cmd+K opens a modal listing commands {id,title,keywords,run}; fuzzy match via simple subsequence scoring. Shortcuts: g then h/s/c/p/n/w (go-to), ? opens shortcut list. Single-key shortcuts disabled while focus is in an input, textarea, select, contenteditable or when a modal is open. No destructive commands (wipe keys, delete tags, send payment) are available from the palette without their normal confirmation screen.

#### Privacy and security impact
Local only; command usage not recorded.

#### Build ownership
- NEW package: `packages/command-palette` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/command-palette`.
- Public API (exports from `src/index.ts`):
- `rank(commands: Command[], q: string): Command[]`
- `parseChord(events): ChordResult`
- `isTypingTarget(el): boolean`
- `COMMANDS: readonly Command[] (no side-effect commands)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/App.tsx (global key listener, palette mount)
- apps/web/src/components/Palette.tsx (new)
- Add `@ghostpay/command-palette` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **KBDPA-1** MUST Shortcuts never fire inside form fields.
2. **KBDPA-2** MUST Palette is a focus-trapped dialog with Esc to close and focus return.
3. **KBDPA-3** MUST No command bypasses a confirmation.
4. **KBDPA-4** MUST Chord timeout 1 s.
5. **KBDPA-5** SHOULD Show shortcut hints in nav titles.

#### Acceptance tests
1. **T-1** Typing "g" in an input does not navigate.
2. **T-2** rank("sweep") puts Sweep first.
3. **T-3** Esc returns focus to opener.
4. **T-4** COMMANDS contains none tagged destructive.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### theme-pack: Selectable themes incl. cypher and high-contrast
Impact 2/5 | Effort S | Score 2 | Build wave 1 | Depends on: a11y-pass

#### Problem
Theme setting offers system/light/dark only (settings.ts:11,129); the cypher theme exists only as a Pages overlay (docs/remote/pages-theme) and cannot be chosen in the app.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/settings.ts:11 theme union; App.tsx data-theme effect.
- docs/remote/pages-theme/theme.css, apply-theme.sh, Michroma OFL font.
- apps/web/DEVIATIONS.md item 21: bundle scan forbids @font-face in app output.
- Missing: everything described under Design.

#### Design
Theme registry {id,label,tokens, optional cssFile}. Built-in tokens for light/dark/high-contrast live in the app CSS; cypher ships as a separate same-origin static CSS + font file loaded only when selected (link element appended by the app, CSP style-src/font-src self already allow). Scan-bundle allowlist extended for that one static file. All themes validated by a11y-pass contrast checker in CI.

#### Privacy and security impact
No remote fonts; selecting a theme fetches one same-origin file (visible only to the host serving the app anyway).

#### Build ownership
- NEW package: `packages/theme-pack` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/theme-pack`.
- Public API (exports from `src/index.ts`):
- `THEMES: readonly ThemeDef[]`
- `validateTheme(t): Violation[] (contrast via a11y-kit)`
- `themeAttr(id): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/settings.ts (theme union widened, sanitised)
- apps/web/src/views/Settings.tsx (select)
- apps/web/src/App.tsx (apply + lazy link)
- apps/web/scripts/scan-bundle.mjs (allow theme file)
- Add `@ghostpay/theme-pack` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **THEME-1** MUST Unknown stored theme falls back to system.
2. **THEME-2** MUST Every theme passes AA contrast validation.
3. **THEME-3** MUST Cypher animation-free; honours prefers-reduced-motion.
4. **THEME-4** MUST Theme file loaded only from same origin.
5. **THEME-5** SHOULD Preview swatch in Settings.

#### Acceptance tests
1. **T-1** sanitizeSettings({theme:"evil"}) -> "system".
2. **T-2** validateTheme(cypher) has no violations.
3. **T-3** Selecting cypher appends exactly one <link> to same-origin href.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### notify-local: Local notifications (no third parties)
Impact 3/5 | Effort M | Score 1.5 | Build wave 1 | Depends on: local-store

#### Problem
Sellers must keep the Scan tab open and press Start to learn of payments; no alert when a payment lands or an invoice is about to expire.

#### Exists today (verified in repo) vs missing
- apps/web/src/views/Scan.tsx:45-96 manual scan with checkpoint resume.
- apps/web/src/lib/jitter.ts jitter helpers.
- apps/web/src/App.tsx live region announce().
- Missing: everything described under Design.

#### Design
While the app is open: opt-in "watch mode" runs incremental scans on a jittered interval (reuse jitter.ts), raising in-app toasts, a title badge, and optional Notification API alerts (local, no push service). Optional self-hosted webhook: POST {event, count} to a user-entered https URL, with NO amounts, addresses or invoice data, to a host the user controls. Web Push and background sync are excluded (push service and vendor see metadata; SW cannot safely hold the viewing key).

#### Privacy and security impact
Watch mode increases RPC query frequency: show cost note and keep jitter. Webhook reveals IP/timing to the user's host; payload minimal and fixed-schema. Notification text shows counts only ("1 new payment") by default so lock-screens do not leak amounts.

#### Build ownership
- NEW package: `packages/notify-local` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/notify-local`.
- Public API (exports from `src/index.ts`):
- `nextDelayMs(base: number, jitter: number, rng): number`
- `diffMatches(prev, next): NewMatch[]`
- `buildNotification(events, opts: {showAmounts: boolean}): {title; body}`
- `webhookPayload(events): {event: "payments"; count: number; ts: number}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Watch toggle)
- apps/web/src/views/Settings.tsx (webhook URL with https validation)
- apps/web/src/App.tsx (toast region)
- Add `@ghostpay/notify-local` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **NOTIF-1** MUST Watch mode is off by default and stops on lock/wipe of keys.
2. **NOTIF-2** MUST Webhook payload is exactly {event,count,ts}; test rejects any extra field.
3. **NOTIF-3** MUST Webhook URL validated https, no credentials/fragment (like relayer URL).
4. **NOTIF-4** MUST Interval never below 30 s; always jittered.
5. **NOTIF-5** MUST Notification body hides amounts unless user opts in.
6. **NOTIF-6** SHOULD Pause watching when document hidden > N minutes (battery).

#### Acceptance tests
1. **T-1** nextDelayMs stays within [base-j, base+j] and >=30000 for 1000 samples.
2. **T-2** diffMatches returns only unseen announcement ids.
3. **T-3** webhookPayload has exactly 3 keys.
4. **T-4** Keys wiped -> watch timer cleared (fake timers).
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### recurring: Recurring invoices (local reminders, manual issue)
Impact 3/5 | Effort M | Score 1.5 | Build wave 2 | Depends on: templates, local-store

#### Problem
Subscriptions and rent need monthly re-issue; there is no server to send them.

#### Exists today (verified in repo) vs missing
- No schedule code. Server-less constraint (MASTER_BLUEPRINT zero-server) forbids background issuing.
- Missing: everything described under Design.

#### Design
Schedule rule {templateId, cadence (weekly|monthly|custom days), anchorDate, timezone-free UTC rule, lastIssued}. On app open the package computes due items; user clicks Issue (one at a time) producing a normal invoice from the template. Missed periods are listed, not auto-created. Link delivery stays manual (share-safe).

#### Privacy and security impact
No background execution, no push, no server; therefore no third party learns the schedule. Schedules are encrypted in local-store.

#### Build ownership
- NEW package: `packages/recurring-invoices` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/recurring-invoices`.
- Public API (exports from `src/index.ts`):
- `dueItems(rules: Rule[], nowSec: number): Due[]`
- `nextDue(rule, afterSec): number`
- `advance(rule, issuedAtSec): Rule`
- `validateRule(r): RuleProblem[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx or new Schedule view (Due list)
- Add `@ghostpay/recurring-invoices` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **RECUR-1** MUST Month arithmetic is calendar-correct in UTC (31 Jan + 1 month = 28/29 Feb).
2. **RECUR-2** MUST Never issues without a user action.
3. **RECUR-3** MUST Missed periods collapse into one list entry per period, capped at 12.
4. **RECUR-4** MUST Rule parse is bounds-checked.
5. **RECUR-5** SHOULD Show next 3 due dates.

#### Acceptance tests
1. **T-1** Monthly anchor Jan 31: Feb 28, Mar 31 sequence.
2. **T-2** Leap-year Feb 29 handling.
3. **T-3** Due list capped at 12 after 5 years offline.
4. **T-4** advance() is idempotent for the same issuedAt.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### smart-wallet-compat: Smart-contract wallet (Safe) payer compatibility
Impact 3/5 | Effort M | Score 1.5 | Build wave 0 | Depends on: none

#### Problem
Payer flows assume an EOA: ERC-2612 permit uses ecrecover signatures (docs/DEPLOYMENT notes; DEVIATIONS item 13 verifies recovery to the payer) which contract wallets cannot produce; multisigs also confirm asynchronously so a receipt poll may take days.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/payExec.ts ensureAllowance + permit path.
- apps/web/src/lib/wallet.ts:263-295 pollReceipt (finite timeout).
- Missing: everything described under Design.

#### Design
Detect contract-wallet accounts (eth_getCode on the connected account via user RPC) and switch to the approve + pay path (no permit), extend polling to "pending approval" state with no timeout error, show Safe-specific guidance (needs other signers). Pure decision helpers in the package; wallet session code only calls them.

#### Privacy and security impact
eth_getCode on payer address goes to the user RPC (payer address already revealed there by wallet flow); noted in disclosure.

#### Build ownership
- NEW package: `packages/wallet-compat` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/wallet-compat`.
- Public API (exports from `src/index.ts`):
- `isContractAccount(code: string): boolean`
- `choosePath(info: {isContract; tokenPermit: boolean}): "permit"|"approve"|"direct"`
- `pollPolicy(isContract): {timeoutMs: number|null; label: string}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/payExec.ts (use choosePath)
- apps/web/src/views/Pay.tsx (pending-signers message)
- Add `@ghostpay/wallet-compat` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **SMART-1** MUST Contract wallets never take the permit path.
2. **SMART-2** MUST Polling for contract wallets has no hard failure timeout; user can cancel waiting.
3. **SMART-3** MUST Chain/submission verification unchanged.
4. **SMART-4** MUST "0x" and "0x0" code treated as EOA.
5. **SMART-5** SHOULD Explain approval + pay are two transactions.

#### Acceptance tests
1. **T-1** isContractAccount("0x")==false, ("0x6080..")==true.
2. **T-2** choosePath({isContract:true,tokenPermit:true})=="approve".
3. **T-3** pollPolicy(true).timeoutMs===null.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### i18n: Localisation (message catalogs, locale-safe amounts)
Impact 4/5 | Effort L | Score 1 | Build wave 1 | Depends on: ux-glossary, ux-errors

#### Problem
All strings are inline English in TSX; no Intl use anywhere in apps/web/src (grep 0 hits); timestamps are UTC-only (format.ts formatUnix).

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/format.ts parseUnits strict "." decimal; formatUnix UTC ISO.
- apps/web/src/index.html lang="en".
- Missing: everything described under Design.

#### Design
Message catalogs keyed by id with ICU-lite plural/placeholder subset implemented locally (no eval); locale chosen by explicit setting (default from navigator.language but never sent anywhere). Amount INPUT stays canonical "." and the UI shows canonical value next to any localised rendering to avoid 1.000 vs 1,000 ambiguity; localised formatting via Intl.NumberFormat for DISPLAY only. RTL via dir attribute. Security-critical review texts (blockers, fee disclosure, irreversibility) require a reviewed translation flag per locale; unreviewed locales fall back to English for those keys. Pseudo-locale for tests.

#### Privacy and security impact
Locale preference is a fingerprinting bit; stored locally, never transmitted. Catalogs bundled (no remote fetch).

#### Build ownership
- NEW package: `packages/i18n-core` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/i18n-core`.
- Public API (exports from `src/index.ts`):
- `t(key, params?, locale): string`
- `pluralRule(locale, n): "one"|"other"|...`
- `formatAmountDisplay(value: bigint, decimals, locale): string`
- `missingKeys(catalog, base): string[]`
- `SECURITY_KEYS: Set<string>`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- nearly every view (string extraction) - serialise as a dedicated session after ux-glossary/ux-errors
- apps/web/src/state.tsx (locale in settings)
- apps/web/src/index.html (dir/lang set at runtime)
- Add `@ghostpay/i18n-core` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **IN-1** MUST No amount typed by the user is parsed with locale rules; only canonical decimal accepted by parseUnits.
2. **IN-2** MUST Every displayed localised amount is accompanied by canonical form on Pay review.
3. **IN-3** MUST Keys in SECURITY_KEYS fall back to English unless marked reviewed.
4. **IN-4** MUST Missing-key CI check against English base.
5. **IN-5** MUST Placeholders cannot inject markup (React text nodes only).
6. **IN-6** SHOULD Pseudo-locale (accented, +30 % length) in dev builds.

#### Acceptance tests
1. **T-1** pluralRule("en",1)=="one".
2. **T-2** Pseudo-locale build has no raw English visible in e2e snapshot.
3. **T-3** formatAmountDisplay(1000n,0,"de")=="1.000" and review shows "1000" canonical.
4. **T-4** Unreviewed locale returns English for SECURITY_KEYS.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### wallet-connect: WalletConnect (opt-in) for mobile wallets
Impact 4/5 | Effort L | Score 1 | Build wave 1 | Depends on: mode-guard

#### Problem
No mobile wallet path: only EIP-6963 and window.ethereum (wallet.ts:45; DEVIATIONS item 7; troubleshooting row "WalletConnect is not built").

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/wallet.ts:45-72 discoverWallets; 140-190 connectWallet/sendViaWallet/signTypedData share Eip1193Provider.
- Missing: everything described under Design.

#### Design
Adapter producing an Eip1193Provider-compatible object from a WalletConnect v2 session so the existing wallet.ts review/verification flow is reused unchanged (including verifySubmission via user RPC, which is what catches a lying wallet). Opt-in toggle with a disclosure: the WalletConnect relay (default vendor-hosted; self-hosted relay URL configurable) sees pairing metadata, IP and encrypted traffic timing. Pairing URI shown as QR/link locally. Dependency pinned and CSP connect-src already allows wss.

#### Privacy and security impact
Introduces a third-party relay: default OFF, loud disclosure, self-host option. Project id (if the relay requires one) is a user-supplied setting, never baked in. Session data not persisted beyond the tab by default.

#### Build ownership
- NEW package: `packages/wallet-connect-adapter` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/wallet-connect-adapter`.
- Public API (exports from `src/index.ts`):
- `createWcProvider(opts: {relayUrl?; projectId; chainId; storage: SessionOnly}): Promise<Eip1193Provider & {uri: string}>`
- `allowedMethods: readonly ["eth_chainId","eth_accounts","eth_sendTransaction","eth_signTypedData_v4","wallet_switchEthereumChain"]`
- `close()`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Pay.tsx wallet list (extra entry)
- apps/web/src/views/Settings.tsx (relay URL, project id, opt-in)
- apps/web/src/lib/defaultServices.ts
- Add `@ghostpay/wallet-connect-adapter` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **WALLE-1** MUST Only the listed methods are requested/forwarded.
2. **WALLE-2** MUST Adapter output passes the existing wallet.ts chain-id and submission checks unchanged.
3. **WALLE-3** MUST Off by default; first use shows the relay disclosure and requires a click.
4. **WALLE-4** MUST No project id or relay URL is hard-coded.
5. **WALLE-5** MUST Dependency added only after bundle-scan allowlist review.
6. **WALLE-6** SHOULD Deep-link button for mobile browsers.

#### Acceptance tests
1. **T-1** Provider.request("eth_sign",...) rejects (method not allowed).
2. **T-2** Mock relay: connectWallet() works through the adapter and sendViaWallet returns hash.
3. **T-3** Chain mismatch in session -> same WalletCallError as injected path.
4. **T-4** Network spy: no connection before opt-in.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### embed-return: Embed completion signal and return-to-merchant
Impact 2/5 | Effort M | Score 1 | Build wave 2 | Depends on: embed-snippet, pay-reconcile

#### Problem
Because the popup uses noopener there is no completion callback (embed header lines 1-14); merchants cannot know a payer finished.

#### Exists today (verified in repo) vs missing
- apps/web/public/ghostpay-embed-v1.js (noopener, noreferrer popup).
- payer receipt/proof (payExec.ts:142).
- Missing: everything described under Design.

#### Design
No postMessage back-channel (would let any opener learn payer state). Instead: after payment the payer sees a "Copy payment proof" code and an optional user-clicked "Return to merchant" button whose target origin must equal a returnOrigin listed inside the signed public invoice (needs optional schema field; if schema stays frozen use memo-free local config in Create page that renders an extra QR/button only for the seller's own site). Merchant verifies proof with pay-reconcile server-side or in a merchant tool using their own RPC.

#### Privacy and security impact
No cross-origin messaging; return is a user-initiated navigation with a proof code in the URL FRAGMENT only (never query). Allowed origin set is bound by the seller signature.

#### Build ownership
- NEW package: `packages/embed-return` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/embed-return`.
- Public API (exports from `src/index.ts`):
- `buildReturnUrl(returnOrigin: string, proof: string): string  // fragment only`
- `isAllowedReturn(inv: {returnOrigin?: string}, target: string): boolean`
- `verifyProofOffline(proof, expected): Result`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Pay.tsx (post-submit return button)
- packages/invoice-schema (optional field returnOrigin; owned by schema maintainers, separate change)
- Add `@ghostpay/embed-return` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **EMBED-1** MUST Return URL carries data only in the fragment.
2. **EMBED-2** MUST Only https origins exactly equal to the signed returnOrigin are allowed (no wildcards, no redirects).
3. **EMBED-3** MUST Without the schema field the feature is hidden (feature flag).
4. **EMBED-4** MUST Proof size-bounded and decoded strictly.
5. **EMBED-5** SHOULD Provide a reference merchant verifier snippet (Node, own RPC).

#### Acceptance tests
1. **T-1** isAllowedReturn false for lookalike origin and for http.
2. **T-2** buildReturnUrl output has no "?" and ends in #proof=...
3. **T-3** Schema fixture with returnOrigin signed -> accepted; tampered -> signature invalid.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### profiles: Multiple seller profiles
Impact 3/5 | Effort L | Score 0.8 | Build wave 2 | Depends on: local-store, backup-bundle

#### Problem
One in-memory key session (session.ts:29); checkpoints are keyed by chain only (scanClient.ts:149); sellers with several brands/businesses must reload keystores and mix local data.

#### Exists today (verified in repo) vs missing
- apps/web/src/lib/session.ts:26-40 singleton current/publicSummary.
- apps/web/src/lib/scanClient.ts:149-180 checkpoint keys chain-only.
- apps/web/src/lib/tags.ts per-profile salt (one profile today).
- Missing: everything described under Design.

#### Design
Profile = {id, name, metaAddressPublic, createdAt}. Registry holds names and ids only, in localStorage (no secrets; users should pick neutral names). Switching clears the in-memory session (zeroize) before loading the next keystore; all stores/checkpoints namespaced by profile id. Profiles are isolated: no cross-profile search. Invoice schema has no seller name, so profile name is local-only.

#### Privacy and security impact
Profile names are plaintext locally (warn: use neutral names). Switching wipes secrets from memory. No cross-profile linkage data stored.

#### Build ownership
- NEW package: `packages/profiles` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/profiles`.
- Public API (exports from `src/index.ts`):
- `createProfile(name): Profile`
- `namespace(profileId, key): string`
- `switchPlan(current?, next): Step[]  // zeroize, unlock, load`
- `validateName(s)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/session.ts (profile-aware install)
- apps/web/src/lib/scanClient.ts (namespaced checkpoint keys)
- apps/web/src/views/SellerKeys.tsx (profile switcher)
- apps/web/src/lib/defaultServices.ts
- Add `@ghostpay/profiles` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **PROFI-1** MUST Switching profiles zeroizes the previous session before the next is installed.
2. **PROFI-2** MUST Checkpoints/ledger keys include profile id; test proves no read across profiles.
3. **PROFI-3** MUST Migration: existing data becomes profile "Default" without loss.
4. **PROFI-4** MUST Profile names length-bounded, NFC, no control characters.
5. **PROFI-5** SHOULD Per-profile idle lock.

#### Acceptance tests
1. **T-1** Two profiles: checkpoint saved in A is invisible in B.
2. **T-2** Switch spy: zeroize called before install.
3. **T-3** Migration fixture preserves tags and checkpoint.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### hw-signer: Hardware-wallet payer path and signer abstraction
Impact 2/5 | Effort L | Score 0.5 | Build wave 0 | Depends on: none

#### Problem
Hardware users go through a browser wallet already (works via injected provider), but there is no explicit guidance, and stealth one-time keys cannot live on a device so sweeps stay software-signed (modules-needed.md rank 12).

#### Exists today (verified in repo) vs missing
- docs/remote/modules-needed.md rank 12 (Missing).
- apps/web/src/lib/wallet.ts Eip1193Provider interface.
- apps/web/src/lib/sweep.ts direct sweep signs with derived key in memory.
- Missing: everything described under Design.

#### Design
Phase 1 (S): guidance + capability detection text for hardware-backed injected wallets (payer side) incl. blind-signing warning, typed-data hash display for permit. Phase 2 (L, blocked on vendor research): Signer interface {address; signTransaction; signTypedData} implemented by InMemorySigner today; offline-sign export/import (QR/file) for sweeps so the stealth key can sign on an air-gapped machine: export unsigned tx (+ derived key via encrypted package) is NOT acceptable - instead export the derived one-time private key encrypted to an offline signer tool. Not specified beyond interface until reviewed.

#### Privacy and security impact
Exporting derived one-time keys is a security-sensitive act; Phase 2 requires security review before build. Phase 1 has no data flows.

#### Build ownership
- NEW package: `packages/signer-abstraction` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/signer-abstraction`.
- Public API (exports from `src/index.ts`):
- `interface Signer { address: string; signTransaction(tx): Promise<Hex>; signTypedData(json): Promise<Hex> }`
- `InMemorySigner(secret)`
- `describeSigningRisk(kind): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/sweep.ts (accept Signer)
- apps/web/src/views/Pay.tsx (hardware tips)
- Add `@ghostpay/signer-abstraction` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **HWSIG-1** MUST Signer interface introduces no behaviour change for existing sweeps (tests unchanged).
2. **HWSIG-2** MUST No private key crosses the interface; only signatures.
3. **HWSIG-3** MUST Phase 2 gated by explicit security review ticket.
4. **HWSIG-4** SHOULD Typed-data summary shown before any signature request.

#### Acceptance tests
1. **T-1** directSweep with InMemorySigner byte-identical output to current implementation on fixtures.
2. **T-2** Signer mock that rejects -> user-facing cancel message.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

### policy-undo: Cancel / undo UI for policy-account withdrawals
Impact 2/5 | Effort L | Score 0.5 | Build wave 1 | Depends on: sweep-guide

#### Problem
Policy accounts allow a delayed withdrawal that the owner can cancel, but there is no client; the README says do not use them.

#### Exists today (verified in repo) vs missing
- packages/contracts/src/PolicyAccount.sol:17-19,48-58 delay, MAX_DELAY, CancelWithdraw EIP-712.
- packages/policy-scheme (scheme 0x47500002 helpers).
- README: policy accounts contracts only, no client support, no recovery path.
- Missing: everything described under Design.

#### Design
Library for building/decoding Withdraw and CancelWithdraw typed data, computing the cancel window (delay, 2*delay) and listing pending withdrawals from logs; UI shows a countdown and a Cancel button producing the EIP-712 cancel signature. Build only after the contracts are audited and a deployment manifest exists.

#### Privacy and security impact
Pending-withdrawal reads go to the user RPC; no new data. Cancel is a public transaction.

#### Build ownership
- NEW package: `packages/policy-ui-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/policy-ui-kit`.
- Public API (exports from `src/index.ts`):
- `cancelWindow(w: Pending, delaySec): {opensAt; closesAt}`
- `buildCancelTypedData(id, chain): TypedData`
- `pendingFromLogs(logs): Pending[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

#### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Sweep.tsx or new Policy view
- Add `@ghostpay/policy-ui-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

#### Requirements
1. **POLIC-1** MUST Typed data matches CANCEL_WITHDRAW_TYPEHASH in the contract (fixture test against forge output).
2. **POLIC-2** MUST Never offered unless a manifest lists the factory.
3. **POLIC-3** MUST Countdown uses block timestamps, not the local clock.
4. **POLIC-4** SHOULD Explain that cancelling needs the same key.

#### Acceptance tests
1. **T-1** Typed-data hash equals Solidity-computed fixture.
2. **T-2** cancelWindow edge: exactly at closesAt -> closed.
3. **T-3** Feature hidden with no manifest entry.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
