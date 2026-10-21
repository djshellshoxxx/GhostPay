# Top 8 buildable specs

Selection rule: highest score first, ties broken by impact, prerequisites pulled forward (ledger-export needs local-store). Chosen: ux-errors, ux-glossary, quick-request, net-status, mode-guard, local-store, ledger-export, onboarding. Next in line: pay-reconcile, sweep-guide, backup-bundle (all score 2.5, impact 5). Full format: one file per feature in [specs/](specs/); this page repeats the same text for the top 8.

Common rules for all specs: MUST/SHOULD use RFC 2119 meaning; "package" means a new workspace under `packages/` with no UI; "UI wiring" is the only place `apps/web` is touched; tests are vitest unless stated.

---

## ux-errors: Error recovery guidance
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

### Problem
Errors are generic ("Something went wrong. Nothing was sent.", "Blocked by a safety check (CODE)") and give no next step.

### Exists today (verified in repo) vs missing
- apps/web/src/lib/errors.ts:19-43 userMessage maps InvoiceError/ChainAdapterError/GhostPayCryptoError to fixed text; chain-adapter codes are shown raw (errors.ts:38).
- docs/user/troubleshooting.md has a symptom table that the app does not link to.
- Missing: everything described under Design.

### Design
Pure map from stable error code (plus context: view, chain, has-RPC, has-relayer) to {summary, cause, steps[], severity, retrySafe, helpAnchor}. Steps are plain text keys, never interpolated user input. The app shows summary + "What to do" list + retry-safety line ("Nothing was sent" only when the caller proves it). Unknown codes fall back to a generic entry that still lists the three universal steps (check RPC, reload, see troubleshooting).

### Privacy and security impact
No telemetry; no error text leaves the device. Messages must never echo links, keys, RPC URLs (preserves errors.ts contract). "Copy diagnostics" button copies only code + app version, never state.

### Build ownership
- NEW package: `packages/ux-errors` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-errors`.
- Public API (exports from `src/index.ts`):
- `recover(code: string, ctx: {view; chainId?; hasRpc; hasRelayer; online}): Guidance`
- `listCodes(): string[] (for coverage test)`
- `type Guidance = {summary; steps: string[]; retrySafe: "yes"|"no"|"unknown"; docAnchor?: string; severity: "info"|"warn"|"error"}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/errors.ts (add code passthrough; keep userMessage signature)
- apps/web/src/components/Common.tsx (Notice gets optional steps list)
- each view that renders userMessage (Pay, Scan, Sweep, Settings, SellerKeys, CreateInvoice): replace text with <ErrorNotice error=...>
- Add `@ghostpay/ux-errors` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **UXERR-1** MUST Every ChainAdapterError, InvoiceError and GhostPayCryptoError code known to the app has a Guidance entry; a test enumerates the code unions and fails on a missing one.
2. **UXERR-2** MUST Guidance text contains no interpolation of user-supplied strings.
3. **UXERR-3** MUST "retrySafe: yes" only for errors raised before any signing or broadcast.
4. **UXERR-4** MUST Output is deterministic and pure (no I/O).
5. **UXERR-5** SHOULD Link each entry to the matching docs/user/troubleshooting.md row anchor.
6. **UXERR-6** SHOULD Offer context-aware first step (no RPC configured -> "Add an RPC in Settings" button).

### Acceptance tests
1. **T-1** Given every code in the three error enums, recover() returns non-empty summary and >=1 step.
2. **T-2** Property: no output contains a 0x-prefixed 40-hex run or "https://" for arbitrary ctx.
3. **T-3** With ctx.hasRpc=false and code=RPC_UNREACHABLE the first step names Settings.
4. **T-4** Unknown code returns the generic entry.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## ux-glossary: In-app glossary, contextual help, plain-language labels
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

### Problem
Terms such as stealth address, view tag, scheme id, permit, relayer, slippage, basis points appear unexplained (CreateInvoice.tsx:173-174 "Maximum slippage (basis points)"; Scan.tsx "One-time address").

### Exists today (verified in repo) vs missing
- apps/web/src/components/Disclosure.tsx LIMITS and fee lists (static explanatory text).
- apps/web/src/views/About.tsx privacy notes.
- docs/user/*.md plain-language guides not reachable from the UI.
- Missing: everything described under Design.

### Design
Typed glossary: term id -> {label, plain (<=25 words), detail (<=120 words), related[]}. A <Term id> inline component renders a button opening an accessible disclosure (details/summary pattern, no tooltip-only). A Help view lists all terms with search. "Plain labels" map internal names to user words (stealth address -> one-time address, basis points -> percent with the bps value shown in parentheses). Field hints reference term ids.

### Privacy and security impact
Static bundled text, no remote fetch. Text reviewed for claims: never say "anonymous"; each privacy term links to privacy-limits wording.

### Build ownership
- NEW package: `packages/ux-glossary` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ux-glossary`.
- Public API (exports from `src/index.ts`):
- `getTerm(id): Term | undefined`
- `searchTerms(q: string): Term[] (case-folded substring, locale-independent)`
- `bpsToPercent(bps: number): string  // 50 -> "0.5 %"`
- `TERM_IDS: readonly string[]`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/components/Common.tsx (Term component, keyboard operable)
- apps/web/src/state.tsx + App.tsx (add ViewId 'help')
- apps/web/src/views/Help.tsx (new)
- apps/web/src/views/CreateInvoice.tsx, Scan.tsx, Sweep.tsx, Settings.tsx (wrap jargon in <Term>)
- Add `@ghostpay/ux-glossary` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **UXGLO-1** MUST Every term id referenced in the UI exists (test scans a registry file).
2. **UXGLO-2** MUST Each plain definition <=25 words and contains no unexplained term id.
3. **UXGLO-3** MUST Term disclosure is operable by keyboard and announced to screen readers.
4. **UXGLO-4** MUST No definition claims anonymity or unlinkability.
5. **UXGLO-5** SHOULD Link to docs/user pages by relative path text (no network).
6. **UXGLO-6** SHOULD Help view deep-linkable by in-app state only (no query string).

### Acceptance tests
1. **T-1** bpsToPercent(25)=="0.25 %", bpsToPercent(1)=="0.01 %", bpsToPercent(10000)=="100 %".
2. **T-2** searchTerms("one-time") returns the stealth-address entry.
3. **T-3** Lint test: no definition matches /anonymous|untraceable|unlinkable(?! is not)/i.
4. **T-4** Render test: Tab+Enter opens a Term, aria-expanded toggles.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## quick-request: Quick payment request (amount + memo in three fields)
Impact 4/5 | Effort S | Score 4 | Build wave 0 | Depends on: none

### Problem
Create invoice needs chain, token, currency, line items, tax, fee policy, slippage, quote TTL (CreateInvoice.tsx:84-181) even for "send me 25 USDC".

### Exists today (verified in repo) vs missing
- apps/web/src/lib/invoiceCreate.ts:87 buildInvoiceLink (full form -> signed link).
- apps/web/src/views/CreateInvoice.tsx:10-30 form state with defaults.
- Missing: everything described under Design.

### Design
A preset layer that expands {amount, token, chain?, note?, validFor?} into a full InvoiceForm using safe defaults (fixed_token mode, one line item "Payment request" or the note, tax 0, seller_pays, expiry 24 h, no quote). Presets are data: "Simple request", "Tip jar (no amount)" is NOT included (schema needs amount). UI: collapsed "Simple / Advanced" toggle; Simple shows three fields and the resulting preview total; Advanced is the current form pre-filled from the preset.

### Privacy and security impact
Pure local transformation. Defaults must not add identifying fields (no seller name, no email). Note text is encrypted by default in simple mode (flag on) but UI still warns the key is in the link.

### Build ownership
- NEW package: `packages/request-kit` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/request-kit`.
- Public API (exports from `src/index.ts`):
- `expandRequest(r: SimpleRequest, nowSec: number): InvoiceForm`
- `validateRequest(r): RequestProblem[]`
- `SIMPLE_DEFAULTS: Readonly<InvoiceFormDefaults>`
- `type SimpleRequest = {chainId; token: "native"|Address; amount: string; note?: string; validForHours?: number}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/CreateInvoice.tsx (mode toggle; call expandRequest; reuse buildInvoiceLink)
- Add `@ghostpay/request-kit` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **QUICK-1** MUST expandRequest output passes the existing buildInvoiceLink validation without edits to invoice-schema.
2. **QUICK-2** MUST Amount parsed with parseUnits semantics (no float, no rounding); invalid -> RequestProblem, never throws.
3. **QUICK-3** MUST Defaults: fixed_token, tax 0, seller_pays, validFor 24 h (max 90 days as today).
4. **QUICK-4** MUST No default may enable fiat_quote while FEEDS is empty.
5. **QUICK-5** SHOULD Remember last-used chain/token in localStorage via try/catch (per-viewer convenience).
6. **QUICK-6** SHOULD Show the exact total and fee the payer will see.

### Acceptance tests
1. **T-1** expandRequest({amount:"25.5",token:"native"}) -> tokenAmount 25.5 ETH-units string and totals consistent with Pay recomputation (lib/pay.ts:80).
2. **T-2** Amount "1e3", "-1", "0", "1.0000000000000000001" (19 dp) each produce a RequestProblem.
3. **T-3** Round trip: build link, parse with parseFragment, signature valid, lineItems length 1.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## net-status: Status and health page
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

### Problem
Failures (no RPC, wrong chain id, relayer down, wrong device clock, blocked storage) surface late and cryptically; invoice expiry depends on the device clock.

### Exists today (verified in repo) vs missing
- apps/web/src/views/Settings.tsx:47-60 per-chain RPC "Test" (chain id check only).
- apps/relayer/src/server.ts:24-33,233 serves GET /healthz and /v1/info.
- apps/web/src/lib/release.ts release-hash widget (Home.tsx:20-60).
- apps/web/src/lib/settings.ts storage-failure tolerance (saveSettings returns false).
- Missing: everything described under Design.

### Design
Check runner: independent checks return {id, status: ok|warn|fail|skipped, detail}. Checks: RPC reachable + chain id; latest block age (stale RPC); clock skew vs latest block timestamp (warn >120 s); relayer /healthz and /v1/info (only if relayerUrl set); manifest loaded per chain; storage available (localStorage, IndexedDB); wallet detected; worker support; secure context. Every network check goes only to endpoints the user configured, user-initiated (button) and never automatic on load. Results are held in memory.

### Privacy and security impact
No third-party endpoints (no "is the internet up" ping to a vendor). Relayer probe reveals IP to the relayer the user already chose; show that in the button label. No result persisted.

### Build ownership
- NEW package: `packages/net-status` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/net-status`.
- Public API (exports from `src/index.ts`):
- `runChecks(env: CheckEnv, which?: CheckId[]): Promise<CheckResult[]>`
- `type CheckEnv = {rpc(chainId): Promise<RpcLike|undefined>; fetchFn; nowMs; storage probes; wallets: () => Promise<number>}`
- `clockSkewSec(localNowMs: number, blockTimestampSec: number): number`
- `CHECK_IDS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Status.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId 'status', nav entry)
- apps/web/src/views/Settings.tsx (link to Status after Test)
- Add `@ghostpay/net-status` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **NETST-1** MUST No check runs without a user action.
2. **NETST-2** MUST Each check has a timeout (default 8 s) and cannot throw out of runChecks.
3. **NETST-3** MUST Relayer checks are skipped when relayerUrl is empty.
4. **NETST-4** MUST Clock skew uses the RPC block timestamp, never a third-party time server.
5. **NETST-5** SHOULD Copyable plain-text report with no URLs (hosts replaced by "RPC for <chain name>").
6. **NETST-6** SHOULD Pair each fail with a ux-errors Guidance if installed.

### Acceptance tests
1. **T-1** Mock RPC with chainId mismatch -> fail "different chain".
2. **T-2** Block timestamp 10 min behind local clock -> warn with skew≈600.
3. **T-3** relayerUrl="" -> relayer check skipped, zero fetch calls (spy).
4. **T-4** Report string contains no "http" substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## mode-guard: Testnet / practice mode and network badge
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

### Problem
Nothing on screen says which network or risk mode you are in (header App.tsx tagline only); when mainnets are enabled a testnet/mainnet mix-up costs real money; new users have no safe way to rehearse.

### Exists today (verified in repo) vs missing
- packages/chain-adapters/src/config/chains.ts:34-35 testnet:true flag; mainnets enabled:false.
- apps/web/src/App.tsx header shows static tagline only.
- apps/web/src/views/Pay.tsx review shows chain name but no mode styling.
- Missing: everything described under Design.

### Design
Derive a Mode ("testnet" | "mainnet") per chain from ChainConfig.testnet. Persistent header badge showing mode, and the Pay/Sweep/Create views show a colour-independent banner ("TESTNET: coins have no value" / "MAINNET: real money"). Mainnet actions require a one-time per-session acknowledgement. Practice mode: generates a clearly marked sample invoice for a testnet and walks through review with the wallet step stubbed to "dry run" (builds and decodes calldata via existing preview but does not call sendViaWallet). Practice invoices carry memo prefix "PRACTICE" and are signed with a throw-away key.

### Privacy and security impact
No data leaves device. Practice key is ephemeral and unrelated to seller keys (never reuse seller signing key for samples).

### Build ownership
- NEW package: `packages/mode-guard` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/mode-guard`.
- Public API (exports from `src/index.ts`):
- `modeOf(chain: {testnet: boolean}): "testnet"|"mainnet"`
- `banner(mode): {text; ariaLabel; tone}`
- `needsAck(mode, session: {acked: Set<number>}, chainId): boolean`
- `practiceInvoice(nowSec): {form: InvoiceForm; signingKey: ephemeral}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/App.tsx (header badge)
- apps/web/src/views/Pay.tsx, Sweep.tsx, CreateInvoice.tsx (banner component)
- apps/web/src/views/Pay.tsx (dry-run path before sendViaWallet)
- Add `@ghostpay/mode-guard` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **MODEG-1** MUST Badge text distinguishes modes without relying on colour alone.
2. **MODEG-2** MUST Practice mode never calls wallet.sendViaWallet, relayer or any RPC write method (spy test).
3. **MODEG-3** MUST Practice invoice is rejected by a payer on any non-testnet chain.
4. **MODEG-4** MUST Mainnet acknowledgement is per session, in memory only.
5. **MODEG-5** SHOULD Show native symbol value disclaimer on testnets.

### Acceptance tests
1. **T-1** modeOf({testnet:true})=="testnet".
2. **T-2** Practice run: zero calls to eth_sendTransaction/eth_sendRawTransaction.
3. **T-3** needsAck true first time on mainnet chain, false after ack, always false on testnet.
4. **T-4** Axe-style test: banner has role and text, no colour-only cue.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## local-store: Encrypted local store (ledger, templates, contacts, profiles namespace)
Impact 5/5 | Effort M | Score 2.5 | Build wave 0 | Depends on: none

### Problem
Only tags persist (encrypted). Scan matches are memory-only (state.tsx matches; Scan.tsx:70 app.setMatches([])), issued invoices, receipts and contacts vanish on reload, blocking dashboards, exports, reconciliation and templates.

### Exists today (verified in repo) vs missing
- apps/web/src/lib/tags.ts HKDF(viewing key)->AES-GCM + HMAC lookup, IdbTagStore apps/web/src/lib/idbStore.ts (tags only, DB "ghostpay-tags").
- apps/web/src/lib/scanClient.ts:149 plain checkpoints in localStorage keyed by chain only (no profile namespace).
- apps/web/src/lib/session.ts:29 single in-memory key session.
- Missing: everything described under Design.

### Design
Generic typed collections over IndexedDB with the tags.ts crypto pattern: per-profile random salt, HKDF(viewing key, info="GhostPay/local-store/v1/<collection>") -> AES-256-GCM non-extractable key, HMAC lookup tokens, AAD binds {schemaVersion, collection, profileId}. Collections: ledger (matches, receipts), invoices (issued metadata, no secrets), templates, contacts. Versioned migrations; quota-error handling; lock/unlock reuses vault idle lock. Profile id is a random 16-byte value, giving namespace for later multi-profile. Existing tag vault migrates in place (read old DB, rewrite, keep old until user confirms).

### Privacy and security impact
Ciphertext only on disk; collection names and sizes are visible to local attackers (documented). Never stores spending/signing keys. Unlock requires keys in memory. Wipe API deletes DB. No network.

### Build ownership
- NEW package: `packages/local-store` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/local-store`.
- Public API (exports from `src/index.ts`):
- `openStore(idb: IDBFactory|MemoryBackend, profileId): Store`
- `store.unlock(viewingKey: Uint8Array): Promise<void>; lock(); wipe()`
- `store.collection<T>(name, codec): {put(id,v); get(id); list(filter?); delete(id); count()}`
- `codec = {version: number; parse(unknown): T; migrate(from: number, raw): unknown}`
- `exportRaw(): Promise<EncryptedDump>; importRaw(d) (consumed by backup-bundle)`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/services.ts + defaultServices.ts (add store to Services)
- apps/web/src/App.tsx (lock on idle, as vault today)
- apps/web/src/views/Scan.tsx (persist matches after scan)
- Add `@ghostpay/local-store` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **LOCAL-1** MUST All records encrypted with a fresh 96-bit IV; AAD mismatch makes decryption fail (tamper test).
2. **LOCAL-2** MUST Wrong viewing key cannot decrypt; unlock verifies via check record like tags.ts.
3. **LOCAL-3** MUST Keys derived with distinct HKDF info per collection.
4. **LOCAL-4** MUST Schema parse rejects unknown fields; migrations are pure and tested.
5. **LOCAL-5** MUST Works against MemoryBackend (tests) and real IndexedDB.
6. **LOCAL-6** MUST Never writes plaintext, raw addresses or unkeyed hashes.
7. **LOCAL-7** SHOULD Quota/ storage-eviction detection with navigator.storage.persist() request (user gesture).
8. **LOCAL-8** SHOULD Bulk put in one transaction.

### Acceptance tests
1. **T-1** Round trip put/get/list per collection.
2. **T-2** Flip one ciphertext byte -> get throws DECRYPT, other records unaffected.
3. **T-3** Swap ciphertext between two records -> AAD failure.
4. **T-4** Scan raw IDB dump (memory backend): no occurrence of any known plaintext address/label.
5. **T-5** Migration v1->v2 fixture converts and re-encrypts.
6. **T-6** Concurrent puts keep consistent counts.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## ledger-export: CSV / accounting export
Impact 4/5 | Effort S | Score 4 | Build wave 1 | Depends on: local-store

### Problem
Sellers cannot get payments into a spreadsheet or accounting tool; the only exports are the keystore and a payer JSON receipt.

### Exists today (verified in repo) vs missing
- apps/web/src/components/Common.tsx:63-76 downloadText (local Blob download).
- apps/web/src/lib/payExec.ts:142-160 buildReceipt (payer side JSON only).
- No CSV code (grep "csv" in apps/web/src: 0 hits).
- Missing: everything described under Design.

### Design
Pure formatter from ledger rows to CSV (RFC 4180) with presets: generic, Xero-style, QuickBooks-style, plain "date,chain,asset,gross,fee,net,tx/announcement,invoice label,tag,note". Amounts are decimal strings from bigint (formatUnits), never floats; fiat column only when a fiat value was recorded at receipt time (see fiat-display). Formula-injection guard: cells starting with = + - @ tab or CR are prefixed with a single quote.

### Privacy and security impact
Export contains amounts and one-time addresses: confirm dialog + header comment row is NOT added (keeps CSV clean); file is local only. Option "omit addresses" on by default.

### Build ownership
- NEW package: `packages/ledger-export` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/ledger-export`.
- Public API (exports from `src/index.ts`):
- `toCsv(rows: LedgerRow[], opts: {preset; omitAddresses: boolean; locale?: "invariant"}): string`
- `csvEscape(cell: string): string`
- `PRESETS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Scan.tsx (Export button next to matches) or new Ledger view
- apps/web/src/components/Common.tsx (reuse downloadText)
- Add `@ghostpay/ledger-export` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **LEDGE-1** MUST Cells beginning with = + - @ \t \r are neutralised (OWASP CSV injection).
2. **LEDGE-2** MUST Fields with comma, quote or newline are quoted and quotes doubled.
3. **LEDGE-3** MUST Decimal amounts exact for 18-decimal bigints (no Number conversion).
4. **LEDGE-4** MUST Output uses CRLF and UTF-8 with no BOM unless requested.
5. **LEDGE-5** MUST Empty ledger -> header only.
6. **LEDGE-6** SHOULD Date column ISO-8601 UTC (reuse formatUnix style).
7. **LEDGE-7** SHOULD Deterministic row order (block, logIndex).

### Acceptance tests
1. **T-1** Label "=HYPERLINK(...)" exports as "'=HYPERLINK(...)".
2. **T-2** Amount 123456789012345678901n at 18 dp exports "123.456789012345678901".
3. **T-3** Round trip through a CSV parser preserves commas/quotes/newlines in notes.
4. **T-4** omitAddresses=true -> no 0x40-hex substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.

---

## onboarding: Onboarding wizard with safe defaults
Impact 5/5 | Effort M | Score 2.5 | Build wave 1 | Depends on: ux-glossary, net-status

### Problem
First run shows 8 tabs and a blank Settings page; payments need an RPC the user must find (no default RPC built in, Settings.tsx:71), a manifest, keys, a backup; steps are not ordered.

### Exists today (verified in repo) vs missing
- apps/web/src/views/Home.tsx:20-60 three role cards.
- apps/web/src/views/SellerKeys.tsx generate/import/export.
- apps/web/src/views/Settings.tsx RPC + relayer fields.
- DEFAULT_SETTINGS lib/settings.ts:19-29 (no RPC, delay 120-900 s, autoClearFragment true).
- Missing: everything described under Design.

### Design
Role-based checklist state machine (Seller | Payer), each step with done-predicate computed from app state: [choose role] -> [pick network (testnet default)] -> [RPC: explain options (own node, provider, Tor via network-privacy spec); no preselected vendor; test via net-status] -> [seller: generate keys -> download encrypted keystore (must pass passphrase policy; "I saved it" requires a re-import test) -> optional local-store setup] -> [payer: wallet detect]. Progress persisted as booleans in localStorage (per-viewer convenience, try/catch). Safe defaults table lives in the package and is the single source for DEFAULT_SETTINGS deltas. Skippable at any step; wizard never auto-reopens after dismissal (Help view can reopen).

### Privacy and security impact
Wizard never suggests a specific RPC vendor or sets one silently. States, per-RPC trade-offs in neutral language (provider sees IP and queried addresses). Does not store any key, passphrase or URL.

### Build ownership
- NEW package: `packages/onboarding` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/onboarding`.
- Public API (exports from `src/index.ts`):
- `steps(role: Role): Step[]`
- `nextStep(role, s: Snapshot): StepId|"done"`
- `type Snapshot = {hasRpc: Record<number,boolean>; hasKeys; keystoreVerified; walletFound; manifestLoaded; networkChosen}`
- `SAFE_DEFAULTS: Readonly<SettingsPatch>`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

### UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Home.tsx (checklist card)
- apps/web/src/views/Onboarding.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId, first-run flag)
- apps/web/src/views/SellerKeys.tsx (emit keystoreVerified)
- Add `@ghostpay/onboarding` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

### Requirements
1. **ONBOA-1** MUST Never preselect or hard-code an RPC URL.
2. **ONBOA-2** MUST Seller path cannot reach "done" until a keystore was exported AND re-imported (verification) or the user explicitly ticks "I accept losing funds if keys are lost".
3. **ONBOA-3** MUST Testnet is the default network while mainnets are disabled and a banner is shown (mode-guard).
4. **ONBOA-4** MUST Every step is skippable and resumable; keyboard operable; focus moves to the step heading.
5. **ONBOA-5** MUST No step writes secrets to storage.
6. **ONBOA-6** SHOULD Offer "Practice with a sample invoice" (mode-guard).
7. **ONBOA-7** SHOULD Estimate time per step.

### Acceptance tests
1. **T-1** nextStep for a new seller returns "network" then "rpc" then "keys" in order.
2. **T-2** Snapshot with keys but keystoreVerified=false -> not done.
3. **T-3** Storage throwing on access -> wizard still works in-memory.
4. **T-4** Playwright: complete seller path on mock RPC; no request to non-user hosts (network log).
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
