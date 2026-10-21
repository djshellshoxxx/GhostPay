# Audit 05: web-app (`apps/web`)

AI-assisted review, not an independent professional audit. Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). All `file:line` refs are relative to `apps/web/` in that snapshot unless prefixed.

## Summary

No XSS / DOM-injection sink found in app source (no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, string timers, `target=_blank` links, or `href` from untrusted data; wallet icons only reach an `<img src>` after a strict `data:image/...;base64,` regex). Key handling in `session.ts` / `keystore.ts` is sound in design (SecretBox, AEAD with bound AAD, scrypt, strict parse). Worker boundary is clean (no network APIs; key sent once, zeroised).

Main problems are trust-boundary and failure-mode gaps in the pay / scan flows:

- 4 medium: payment path trusts an unsigned, un-chain-verified manifest (WEB-APP-01); post-broadcast failure re-arms "Send" and says "Nothing was sent" (WEB-APP-02); path-scoped Pages hosting shares storage with sibling sites (WEB-APP-03); scan checkpoint is key-agnostic and RPC-poisonable so payments can be silently skipped (WEB-APP-04).
- 6 low, 1 info. One prior item regressed or was never fixed (S3-15 chain relabel, WEB-APP-05). Several prior items remain open unchanged (table at end).

No critical or high findings. No code was executed; this is static review only.

## Method

- Read all non-test source under `src/` (lib, views, components, features/btc, features/registry), `public/_headers`, `public/ghostpay-embed-v1.js`, `index.html`, `vite.config.ts`, `scripts/scan-bundle.mjs`, `DEVIATIONS.md`, `package.json`.
- Followed calls into `packages/chain-adapters` (`deploymentsSignature.ts`, `deploymentsVerify.ts`, `adapter.ts`), `packages/core-crypto/src/secret.ts` where behaviour decided a finding.
- Read prior audits: `docs/audits/03-security-review-client-relayer.md`, `docs/audits/04-*`, `docs/remote/pages-prototype.md`, `docs/operators/mirror-hosting.md`. Marked regressions vs carry-overs.
- Grep sweeps: HTML sinks, `window.open`, storage use, `verifyManifestState`, `secondaryClient`, `requireSession`, `trust`/`warning` rendering.
- Did not run forge, node, vitest or Playwright. No PoC executed; each finding cites the exact code path instead.

## Findings

### WEB-APP-01 Medium: payment, sweep and registry paths trust a manifest that is neither signed nor chain-verified, and the UI hides that

Regression/partial-fix of S3-01.

- `src/lib/defaultServices.ts:27` `loadManifest: (id) => loadManifest(id)` passes no release key; `RELEASE_KEY` in `packages/chain-adapters/src/deploymentsSignature.ts` is `undefined`, so on every enabled (test) chain `verifyManifestSignature` returns `unsigned-dev` (`manifest.ts:51`).
- `verifyManifestState` (on-chain `FEE_RECIPIENT`, `ANNOUNCER`, `FEE_BPS`, router/sweepRelayer codehash check, `manifest.ts:69`) is called only in `src/views/Scan.tsx:66`. `Pay.tsx:78` (`useManifest`), `Sweep.tsx:16`, `CreateInvoice.tsx:34` use the raw loaded manifest. `createEvmAdapter` only compares chain ids (`adapter.ts:144`).
- `trust`/`warning` of `unsigned-dev` is rendered only in `Scan.tsx:121`. Pay, Sweep and the fee disclosure show nothing; `Disclosure.tsx:44` still prints "this app does not verify manifest signatures" (stale text, wrong for signed manifests, silent on the unsigned-dev state).
- Every downstream guard is circular: `pay.ts:223` compares `built.tx.to` with `ctx.manifest.router`; `txGuard.ts:39` builds `reviewPolicy` from the same manifest; `sweep.ts:143,151,165-172` signs the EIP-712 sweep and an ERC-2612 permit with `spender = manifest.sweepRelayer`.

Exploit: `deployments/<chainId>.json` is served `no-store` and is not part of the hashed bundle (`public/_headers`, `Home.tsx` release check hashes only the entry script). A mirror, CDN or the gh-pages branch owner serves the genuine, hash-matching JS with a manifest whose `router`/`feeRecipient`/`sweepRelayer` point at attacker contracts. Pay shows the attacker router as "Contract (router)", preview, tx-review and `assertReadyToSend` all pass, the payer approves tokens to the attacker router and pays. In Sweep the stealth key signs a permit for the attacker "sweepRelayer". Testnet-only today (non-testnets fail closed without a key), so impact is test funds; it must be closed before any mainnet enable.

Recommendation: pass the pinned release key (and make `RELEASE_KEY` non-empty before enabling any non-test chain); call `verifyManifestState` inside `useManifest`/`loadManifest` path so every flow gets the on-chain check; show the `unsigned-dev` warning banner in Pay, Sweep, Create, Registry; fix `Disclosure.tsx:44` text; hash the manifest into the published release set. Confidence: high (static trace).

### WEB-APP-02 Medium: error after the wallet already broadcast says "Nothing was sent" and re-enables "Send" (duplicate payment)

- `payExec.ts:44-61` `submitTx` calls `sendViaWallet` (tx broadcast, hash obtained) and only then `verifySubmission` / `pollReceipt`. Either can throw: `SubmissionMismatchError` (`wallet.ts:250-256`), a ChainAdapter/RPC error, or `UserFacingError('Your RPC returned an unexpected ...')`.
- `Pay.tsx:313-317` catch: `setError(userMessage(e)); setPhase('prepared');` The hash is dropped (`result` never set), `built` is kept, so the "Send payment in my wallet" button (`Pay.tsx:585+`) is live again. `errors.ts:42` default text for any non-user-facing error is "Something went wrong. Nothing was sent."

Failing input: native-token invoice, user's RPC returns HTTP 500 / malformed JSON on `eth_getTransactionByHash` right after the wallet returns the hash. UI says nothing was sent; user clicks Send again; `assertReadyToSend`, deadline (20 min) and `simulateCall` all pass for a native payment, so a second payment of the full gross goes out. Also applies to token payments where the user had a pre-existing allowance >= 2x gross. (Permit and exact-approval token flows fail on the second send, which limits it.) For `SubmissionMismatchError` the message tells the user not to trust the payment but the UI still offers Send.

Recommendation: after `sendViaWallet` returns, persist `{hash}` in component state and switch to a "submitted, verification failed" state with the hash; never return to `prepared`; make the generic message not claim "Nothing was sent" for post-broadcast failures. Confidence: high.

### WEB-APP-03 Medium (conditional on hosting): path-scoped GitHub Pages hosting shares origin storage with sibling sites

- The live prototype is `https://djshellshoxxx.github.io/GhostPay/` (`docs/remote/pages-prototype.md:3`). Origin is the whole `*.github.io` user site; any other Pages project (or compromised repo) of that account runs script in the same origin.
- The app keeps security-relevant state in same-origin storage: `localStorage['ghostpay.settings.v1']` (`settings.ts:27,121`: RPC URLs, relayer URL, `pinnedSigners`), `ghostpay.scan.checkpoint.v1.<chainId>` (`scanClient.ts:220`), IndexedDB `ghostpay-tags`. `sanitizeSettings` accepts any https RPC/relayer and any 66-hex pinned key (`settings.ts:66-110`).

Exploit: sibling page writes settings with `rpcUrls[<chain>]=https://attacker/rpc`, `relayerUrl=https://attacker`, `pinnedSigners=[attacker signer]`. Result: attacker invoices render green "pinned by you" (`pay.ts:54`), attacker RPC fabricates "verified" receipts for scan matches and "Independently verified" submissions, relayer sees owner/destination/amount. Today the prototype has no manifest (Pay/Scan/Sweep disabled), so only key generation/import is exposed; the gap is real for any future path-based deploy and no doc mentions it (`mirror-hosting.md` lists no shared-origin warning). Also no `frame-ancestors`/`X-Frame-Options` on Pages (carry-over S3-11).

Recommendation: host on a dedicated origin (own domain / `*.pages.dev`), state this in `pages-prototype.md`; optionally HMAC or version-bind settings to detect external edits. Confidence: high on mechanism, medium on current impact.

### WEB-APP-04 Medium: scan checkpoint is not bound to key or RPC; resume is default; single-RPC omission becomes permanent

- `Scan.tsx:20` `resume` defaults true, `Scan.tsx:27,58` loads `ghostpay.scan.checkpoint.v1.<chainId>`; `scanClient.ts:195` saves after every page. The key (spending/viewing public key) is not part of the storage key or value.
- `Scan.tsx:78-93` never passes `secondaryClient`; `compareProviders` (`scanClient.ts:176`) is dead code in the UI, so a single RPC decides completeness.

Scenario A: user scans with keys A to head, wipes, imports keys B (rotation/restore from keystore, second seller profile in same browser), clicks Start scan with the pre-checked "Resume from checkpoint": B's scan starts at A's head and every earlier payment to B is never shown. Scenario B: a malicious/lagging RPC omits logs in a range; `fetchAnnouncements` still returns a cursor, checkpoint advances, and later scans (even with a good RPC) resume past the omitted blocks; the seller never sees those payments (lost sales / unclaimed funds).

Recommendation: key the checkpoint by `sha256(spendingPub|viewingPub)` + chainId, store the RPC identity note, expose a second-RPC setting and wire `secondaryClient`, show "resumed from block N (checkpoint)" prominently and offer "rescan from block". Confidence: high.

### WEB-APP-05 Low: Scan page relabels matches with the currently selected chain (S3-15 not fixed)

`ScanMatch.chainId` exists (`scanClient.ts:27`, comment cites S3-15) but `Scan.tsx:157-158,181,205,223,239` use `props.chainId` (the dropdown, changeable when not running, `Scan.tsx:114`). `app.matches` is global (`state.tsx:32`, `Scan.tsx:76`).

Failing input: scan Base Sepolia, find a 10 USDC match, switch the dropdown to Sepolia: row is described with Sepolia's token table / native symbol, "Save tag" stores the tag under Sepolia, "Sweep this payment" calls `selectForSweep({match, chainId: <Sepolia>})` so Sweep reads balance, manifest and token allowlist of the wrong chain. Funds are not stolen (guards use the chain actually selected and the user's own key) but amounts/symbols shown are wrong. Fix: use `m.chainId` everywhere, or clear matches on chain change. Confidence: high.

### WEB-APP-06 Low: hash change mid-flow leaves a stale prepared payment under a different invoice

`App.tsx:69-75` handles `hashchange` by setting a new fragment and `view='pay'`. `Pay.tsx:52-76` re-parses and sets `phase='review'` but does not reset `built`, `wallet`, `bufferQuote`; `Pay.tsx:526` still renders `FinalPreview` and `onSend` (`Pay.tsx:301`) sends the old `built`. `assertReadyToSend` (`pay.ts:218`) compares router, chain, token, gross/fee/net with the new `ctx` but never the stealth destination or seller.

Scenario: user prepares invoice A (same chain, token and amount as B), pastes invoice B's link into the address bar of the same tab; header shows B's seller fingerprint, the "Send payment" panel still pays A's one-time address. If chain/amounts differ the preview mismatch throws or render fails instead. Low (needs user navigation in the same tab). Fix: key Pay state on the fragment (`key={fragment}` or reset in the parse effect) and compare stealth/metadata in `assertReadyToSend`. Confidence: high on code path.

### WEB-APP-07 Low: compatibility accessor leaves plaintext spending/viewing/signing scalars on the heap

`session.ts:193-198` `requireSession()` opens all three SecretBox values and keeps the copies in `issued` (up to 24) until `clearSession`. Used by `Scan.tsx:71,278` and `invoiceCreate.ts:94`. After one scan or one invoice creation the spending key exists as a plain `Uint8Array` for the rest of the session, which defeats the S3-08 SecretBox design (`withSessionSecrets` wipes after use). No remote exploit; matters for memory-dump/debugger/extension-with-heap-access scenarios. Fix: use `withSessionSecrets` / `revealViewingKey()` (`session.ts:182`, already present and unused) at the three call sites and delete `requireSession`. Confidence: high.

### WEB-APP-08 Low: signing key separation not enforced; idle lock does not wipe keys

- `session.ts:147-151, 233-241`: `importSession` / `importKeystore` accept a signing key equal to the spending or viewing key; only spending != viewing is checked (`session.ts:140`). The UI hint says it "must not" be (`SellerKeys.tsx:119` hint). Reuse puts the spending public key into every invoice `signer` and uses the stealth spending key for ECDSA invoice signatures (ADR-0002 separation lost).
- `App.tsx:91-105` idle timer locks only the tag vault; seller keys stay in memory until wipe/close (documented, `DEVIATIONS.md` item 11; Settings hint says so). Low because documented.

Confidence: high.

### WEB-APP-09 Low: Bitcoin feature trusts the Esplora server and shows no decoded signed transaction

Test networks only, unaudited PoC (disabled mainnet is enforced by genesis check, `esplora.ts:221`).
- `esplora.ts:182-192` / `scan.ts:80`: payment existence, amounts and unspent status come solely from the server; no header/PoW/merkle check. A hostile server can fabricate "found N unspent payments" (any amount) for the wallet's own address (it knows the public address) and a seller may act on it. Amounts cannot cause a mis-spend (taproot sighash commits to amounts, wrong values give an invalid tx).
- `BtcView.tsx:349` states the silent-payment output key "is not shown"; `sweep.ts:278-305` only compares fee/vsize after building; the signed raw tx is never decoded to confirm output script/amount against the review before broadcast. Same package builds review and tx, so a package bug is not caught.
- `BtcView.tsx:101` `checkNetwork` is only run in scan; `client()` at broadcast (`BtcView.tsx:145`) does not re-check, and the URL field stays editable between scan and broadcast (testnet tx would simply be rejected on a mainnet server; low).
- `BtcView.tsx:82` request amount uses `Number(...) * 1e8` float math (display/URI only).

Confidence: medium.

### WEB-APP-10 Info: hosting-dependent hardening is still thin (carry-over S3-11, plus Trusted Types)

Meta CSP (`index.html:9`) has no `frame-ancestors`, `_headers` is ignored on Pages (`pages-prototype.md`), so on Pages every flow, including the one-click direct sweep (`Sweep.tsx` "Sign and broadcast directly", `Sweep.tsx:159`, no second confirmation), can be framed. `connect-src https: wss:` is broad by design; no `require-trusted-types-for 'script'`. Because no HTML sink exists this is defence in depth only.

### WEB-APP-11 Low: keystore import cost bounds still permit ~2 GiB / minutes of CPU from an 8 KiB file (carry-over S3-13)

`keystore.ts:30-32,130-132,43`: `N` up to 2^20, `r` up to 16, `p` up to 4, `maxmem 2**31`. A crafted keystore (user is socially engineered to open a "backup") asks scrypt for 128*N*r = 2 GiB and 4x the work on the main thread, freezing or crashing the tab (keys in memory lost). Passphrase minimum is 10 UTF-16 units, no strength check (`keystore.ts:33`). Fix: cap decrypt-side N*r*p to the encrypt-side constants (2^17,8,1) plus a small margin; run scrypt in a worker. Confidence: high.

## Reviewed and found OK

- Rendering: all untrusted invoice/wallet strings go through React text nodes; `safeText` neutralises bidi/invisible/mixed-script text (`displayText.ts`). QR is an SVG from React elements; downloaded SVG is numbers plus a fixed path (`qr.ts:156`).
- Wallet: EIP-6963 payloads validated (uuid/name stripped, icon regex, size cap, `wallet.ts:27-53`); accounts cross-checked via `eth_requestAccounts` + `eth_accounts`; chain id + `net_version` probe; account/chain re-read before every send/sign; permit signature recovered and compared to payer; tx re-fetched from user's RPC and compared field-by-field (fails only in the failure modes of WEB-APP-02).
- Worker: `scannerCore.ts` has no network or storage API, viewing key is zeroised in `ScanSession` ctor and in `finally` (`scanClient.ts:209-211`), replies have timeouts and cancel.
- Tags: HKDF-separated AES-GCM + HMAC keys, per-record IV, non-extractable, AAD binds chain; IndexedDB holds ciphertext, random ids, HMAC tokens, timestamps.
- Keystore format: AAD binds metaAddress/signer/KDF params; strict hex/JSON parsing; plaintext wiped. 
- Embed SDK: same-origin, https-only, fragment-prefix check, `noopener,noreferrer`, no innerHTML.
- Relayer client: https only, no credentials, redirect error, 16 KiB cap, 15 s timeout, strict response parsing, fee cap check before signing.
- Prior fixes visible in code: S3-02 `verifyReceipt` (claimed/pending/verified), S3-08 SecretBox (partial, see WEB-APP-07), S3-09 `txGuard` (fee/gas caps, tx-review, simulate), S3-12 `safeText`, S3-15 timeout/zeroise `finally`, S3-19 exact-amount approval + guard.

## Carry-overs still open (not re-scored)

| Prior id | State in this snapshot |
|---|---|
| S3-03 fragment persists in history DB | open, unfixable client-side; `clearFragment` uses `replaceState` only (`fragment.ts:15`) |
| S3-04 release hash self-attested | open (`release.ts:8`, `Home.tsx`); manifest also outside the hashed set (see WEB-APP-01) |
| S3-10 embed SDK mutable URL, no SRI | open (`public/_headers:24`, 1 h cache) |
| S3-11 meta-only CSP on Pages | open (WEB-APP-10) |
| S3-13 keystore cost/passphrase | open (WEB-APP-11) |
| S3-16 tag splice | open: `tags.ts:177` `find`/`open` do not check payload `stealthAddress` equals the requested one; AAD = chain only |
| S3-22 wallet name spoof, first-announce wins | open (`wallet.ts:52`); rdns collected but never shown |
| S3-25 settings in plaintext localStorage | open (WEB-APP-03 raises relevance) |
| S3-26 password manager / hex in React state | open |

## Not reviewed

- `packages/invoice-schema` `parseFragment`/crypto, `packages/tx-review`, `packages/address-safety`, `packages/btc-silent-payments`, `packages/secret-box` internals (only their call sites).
- Tests, e2e specs, `src/test/*` (read only for hints), `app.css`, accessibility.
- Built bundle (`dist`), `scan-bundle.mjs` logic beyond a read-through, dependency tree/lockfile contents and npm advisories, CI workflows, theme overlay, mirror procedures.
- Real wallet / RPC / browser behaviour, memory forensics, Firefox/Safari differences. Nothing was executed.
- Relayer behaviour and contracts (other audit areas).
