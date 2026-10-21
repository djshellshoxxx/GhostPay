# Round audit: apps/web (security)

Branch `claude/remote-extensions-1`, 2026-10-21. Scope: `apps/web/src/**`, `public/_headers`, `index.html`, `public/ghostpay-embed-v1.js`, `scripts/scan-bundle.mjs`, `vite.config.ts`, `package.json`. Findings only; no fixes claimed, no source edited.

Ran: `npx vitest run src/lib src/scanBundle.test.ts` (20 files, 235 tests, all pass); `npm audit --omit=dev` (0 vulnerabilities, repo root); a scrypt timing script (below). Not run: Playwright e2e, full web suite with views, real wallet/RPC/relayer. "Verified" = read in code at the cited line; "Run" = executed.

Counts: High 1 (inherited), Medium 4, Low 9, Info 6.

## 1. Threat model

Assets: seller spending/viewing/invoice-signing keys (in-memory `SecretScalar` in `session.ts:35`); derived stealth keys (transient in `sweep.ts`); keystore file + passphrase; local tag vault (IndexedDB ciphertext, `tags.ts`); settings in `localStorage` (RPC URLs, relayer URL, pinned signers, `settings.ts:391`); invoice link (bearer, URL fragment); payer funds in flight (router calldata, permit, approval); seller funds on stealth addresses.

Trust boundaries: page JS (CSP `script-src 'self'`) | scanner Worker (viewing key in, matches out, no network) | wallet extension (EIP-1193, semi-trusted) | user RPC (untrusted for data, chain id checked in chain-adapters) | relayer (untrusted, fee-capped, signature-bound fields) | static host (trusted for code and manifest, see H1) | same-origin storage.

Adversaries: A1 malicious payer/announcer (forged announcements, hostile token metadata); A2 malicious RPC; A3 malicious relayer; A4 malicious seller (invoice fields: quote window, memo, line items); A5 network/host/CDN compromise; A6 other code on same origin (shared GitHub Pages origin); A7 local attacker with disk/profile access; A8 malicious keystore/invoice file supplied to a victim; A9 malicious merchant page (embed SDK).

Out of scope per `docs/threat-model/THREAT_MODEL.md` assumptions: compromised browser/OS/extension, a consistently lying wallet with no independent RPC.

## 2. Findings

### H1 (High, inherited S3-01). Router, sweep relayer, announcer and fee recipient come from an unauthenticated same-origin JSON
- Evidence: `manifest.ts:23-33` fetches `deployments/<chainId>.json`, only format-validates via `loadDeployment`; `pay.ts:218-228` `assertReadyToSend` compares the built tx against the same `ctx.manifest.router`. `Disclosure.tsx` admits "this app does not verify manifest signatures". `_headers` serves `/deployments/*` `no-store`, outside the release hash (`release.ts` hashes only the entry script).
- Impact: a host/CDN/DNS compromise (A5) or any same-origin writer swaps the router and fee recipient; every local check passes. The preview proves "tx matches manifest", not "manifest is right". (Whoever controls the host can also swap JS, so this is the same root of trust; the manifest is the only part not even covered by a published hash.)
- Repro: serve a different `deployments/84532.json`; `Pay` accepts it (`manifest.test.ts` shows loader accepts any well-formed file). Not run end to end.
- Suggested fix: signed manifest with a key pinned in the bundle or published out of band; include manifest hash in release hash; refuse unsigned manifest on mainnet chains.

### M1 (Medium). Relayed sweeps are rejected by the shipped relayer: request body lacks top-level `chainId`
- Evidence: `relayerClient.ts:70-78` `SweepSubmission` has no `chainId`; `sweep.ts:133-141` posts `{sweep, sweepSig, permit, quoteToken}`. `apps/relayer/src/validate.ts:76` `parseObject(body, 'request', ['chainId','sweep','sweepSig','quoteToken'], ['permit'])` requires `chainId`. Quote body does include it (`relayerClient.ts:73`). `sweep.test.ts` uses a fake fetch, so the mismatch is invisible to tests. Confirms haiku `code-btcapps.md` item 1 (reading `parseObject` strictness in `codec.ts` not done; the required-key list is explicit).
- Impact: every relayed sweep fails with `invalid_*` HTTP 400 (functional/availability, seller funds not lost; direct sweep still works). Also means the relayed path is untested against the real server.
- Repro: run apps/relayer, POST the exact client body from `sweep.test.ts`. Not run.
- Suggested fix: add `chainId` to the submission and a cross-app contract test that feeds `submitSweep`'s body to `parseSweepRequest`.

### M2 (Medium). "Wipe keys from memory" does not lock the tag vault or clear scan matches / sweep target
- Evidence: `SellerKeys.tsx:153` calls only `clearSession()`; `session.ts:126-133` zeroizes keys and summary only. `TagVault.lock()` is called only from the idle timer (`App.tsx:~75`), the Lock button and `wipe` (`Scan.tsx:288,297`). `app.matches` (`App.tsx` state) and `sweepTarget` are never reset on `clearSession`. After wipe, the vault's non-extractable CryptoKeys stay usable; `Scan.tsx:246` `unlocked` stays true; decrypted tag list state (`Scan.tsx:244`) stays rendered if the user is on the Scan page.
- Impact: after the user believes keys are gone, client labels (decrypted) and the stealth-address list (linked to the identity) remain in memory/UI for up to the idle timeout (default 15 min, `settings.ts:384`); loading a different identity keeps the old identity's vault unlocked, so new-identity tags are written under the old viewing-key-derived key and `Unlock` is not offered (cross-identity mixing). Memory-only; a local attacker or shoulder surfer benefits.
- Repro: generate keys, unlock tags, wipe keys, open Scan: tags remain. Code-verified; not run.
- Suggested fix: subscribe to session change and call `vault.lock()`, `setMatches([])`, `selectForSweep(undefined)`.

### M3 (Medium). Scan results are not scoped to the chain they were found on; sweep target chain is whatever the selector shows
- Evidence: `Scan.tsx:17` chain selector is only disabled while running (`:107`); `app.matches` is cleared only in `begin` (`:70`); `Matches` receives `props.chainId` = current selector (`:141,229`) and `app.selectForSweep({ match: m, chainId: props.chainId })`. `ScanMatch` (`scanClient.ts:21`) carries no chain id. `describe(m, chainId)` (`Scan.tsx:147`) decodes the token with the wrong chain's allowlist.
- Impact: scan chain A, switch selector to B, click "Sweep": `Sweep` reads balance/builds the tx for chain B for an address found on A (stealth address is key-derived so the same address exists on B). Mislabelled amounts/tokens, tags saved under the wrong chain id, and a direct sweep signed for chain B. No fund loss path found (the key still only controls that address), but a user can broadcast to the wrong chain, or misread a token symbol.
- Repro: Scan chain A, change selector to B, sweep. Code-verified; not run.
- Suggested fix: store `chainId` in `ScanMatch`/`app.matches` and ignore the selector in `Matches`.

### M4 (Medium). Direct sweep executes arbitrary, announcement-supplied token contracts with the stealth key; UI notice contradicts behaviour
- Evidence: token comes from attacker-controlled announcement metadata (`Sweep.tsx:26`, `parseMetadata` in scan). `Sweep.tsx:127` says "This token is not on the allowlist. It will not be swept from here." but `onDirect` (`:102-111`) and its button (`:159`) are gated only on `balance`, not on `tokenCfg`. `sweep.ts:163-200` then sends `eth_estimateGas`/`transfer` to the arbitrary token with the stealth key as `msg.sender`, gas = 1.2x estimate (no cap), paid from the stealth address's native balance.
- Impact (A1): a payer announces `token = attacker contract`; seller clicks the sweep button; the contract runs with stealth address as caller and drains native gas up to the balance check, or reports huge `balanceOf`. It cannot move assets it has no allowance on, so loss is bounded to gas/native dust at that address, plus phishing-by-contract-call risk (e.g. contract that also calls other contracts as the stealth address, which holds only what was sent to it). Contradicts the documented allowlist claim (THREAT_MODEL S3-09 Low/Open covers destination only).
- Repro: unit test with `meta.token` not in `findToken`; button remains enabled. Code-verified.
- Suggested fix: require `tokenCfg !== undefined` for both modes; cap gas.

### L1 (Low). Keystore import accepts parameters that force ~1.1 GB and 12-50 s scrypt before authentication
- Evidence: `keystore.ts:89-91` bounds N<=2^20, r<=16, p<=4; derive runs before AEAD check (`:99`). Run: N=2^17,r8 -> 1.9 s, 190 MB RSS; N=2^20,r8 -> 14.0 s, 1130 MB RSS; N=2^19,r16 -> 11.7 s, 1130 MB; N=2^20,r16,p4 -> rejected by noble `maxmem` (2^31). N=2^19,r16,p4 (not run) would be about 4x the p=1 time. File is capped at 8 KiB (`SellerKeys.tsx:249`, `keystore.ts:76`).
- Impact: a hostile keystore (A8) makes the tab consume >1 GB / tens of seconds (scryptAsync yields, UI stays responsive, no cancel). Needs the victim to pick the file.
- Suggested fix: cap `128*r*N` to roughly the default (e.g. 2^17*8), only accept the shipped parameter set, add a cancel.

### L2 (Low). Passphrase policy is length-only (10 chars)
- Evidence: `keystore.ts:33,76-80` `passphraseProblem`. scrypt 2^17/8/1 is about 1.9 s here (Run). The keystore holds spending+viewing+signing keys, so an offline attacker with the file brute-forces only the passphrase.
- Suggested fix: entropy estimate or minimum 12+ with word-list guidance; consider raising N.

### L3 (Low). Signing key may equal spending or viewing key
- Evidence: `session.ts:101-105` only rejects spending == viewing; `importSession` (`:111`) and `importKeystore` (`:153-156`) accept `signingKey` equal to either. ADR-0002 requires a separate key (hint text at `SellerKeys.tsx:293` says so). Key reuse across signature domains (invoice signing vs stealth spending) is the reason for the separation.
- Suggested fix: reject equality for all three pairs.

### L4 (Low). Import error paths leave secret scalars un-zeroized
- Evidence: `session.ts:108-112`: if the viewing key parse or `keySetFromScalars` throws, already-created `spending`/`viewing` scalars are not zeroized (`install` is never reached). `importKeystore` zeroizes `secrets.*` (`:161`) but the scalars from `secretScalarFromBytes` (copies, per core-crypto) leak on throw. Memory hygiene only; JS strings from the password inputs (`SellerKeys.tsx:186-188`, `useState('')`) cannot be wiped.
- Same class: `scanClient.ts:67` `createWorker()` outside the `try` (viewing key not zeroized if it throws; matches haiku L8, verified).

### L5 (Low). `runScan` can hang and Cancel does nothing while a worker reply is pending
- Evidence: `scanClient.ts:71-74` routes a worker `error` to `ready`, which has already resolved, so a batch-time error never resolves `pending`; `:105-108` waits with no timeout and no `signal` listener, so `abort()` only takes effect between pages (`:99,101`). Worker currently only emits `NOT_STARTED` (`scannerCore.ts:111`), so latent. Matches haiku L7. Also a double click on "Start scan" can start two scans: `setRunning(true)` happens after `await app.getRpc` (`Scan.tsx:52,69`).
- Impact: UI stuck in "running"; two concurrent workers each holding a viewing-key copy.

### L6 (Low). Relayer client buffers the whole body before the 16 KiB cap
- Evidence: `relayerClient.ts:204-205` `await res.text()` then length check. Bounded by the 15 s abort (`:190-192`), which also aborts the body read. Matches haiku L4, verified.

### L7 (Low). Settings, pinned signers and IndexedDB share the origin
- Evidence: fixed keys `ghostpay.settings.v1` (`settings.ts:391`), `ghostpay.scan.checkpoint.v1.` (`scanClient.ts:149`), IDB `ghostpay-tags` (`idbStore.ts:6`). `DEVIATIONS.md` item 6/19 names GitHub Pages as a target host.
- Impact (A6): on `user.github.io/…` any other repo page on the same origin can write `localStorage`: replace RPC URLs (malicious RPC, see A2), change the relayer URL, add attacker signer pins (so a forged invoice shows "pinned by you", `pay.ts:51-53`), or poison scan checkpoints (skip blocks). Also settings are plaintext (documented). Conditional on deployment; custom domain avoids it.
- Suggested fix: document "dedicated origin only"; integrity-protect pins (e.g. HMAC under a user passphrase) or store pins encrypted.

### L8 (Low). Submission verification can be skipped silently ("not-visible-yet") and the receipt is not bound to calldata
- Evidence: `wallet.ts:258-260` returns `'not-visible-yet'` after 6 tries (9 s); `payExec.ts:255-262` then proceeds to `pollReceipt`, which checks only `to` (`wallet.ts:285`) and `status`; nothing compares `input`/`value` of the mined tx to the preview. `SubmitResult.verification` carries the state but the receipt `included` is still reported. Threat model treats the wallet as semi-trusted; a wallet that mutates calldata and whose tx is slow to propagate to the user's RPC is the case.
- Suggested fix: after receipt, re-run `verifySubmission` or fetch the tx by hash and compare; show an explicit "unverified" state.

### L9 (Low). Scan list shows announcement-claimed amounts without a "claimed" qualifier
- Evidence: `Scan.tsx:147-152` `describe` prints `metadata.netAmount` and the allowlist symbol from attacker-controlled metadata (A1). Threat model S3-02 (Medium, In progress). Sweep uses on-chain balance (`Sweep.tsx:38`), so no fund error, but dust/fake-amount spoofing misleads accounting and "payments found" counts.

### L10 (Low). Gas parameters from an untrusted RPC are not sanity-bounded in `directSweep`
- Evidence: `sweep.ts:167-170` `maxFeePerGas = 2*gasPrice`, `priority = gasPrice/10`; native sweep sets `value = balance - 21000*maxFee` (`:180-182`). A malicious RPC (A2) reporting a large `eth_gasPrice` makes the effective tip up to about 5% of the balance (21000*g/10 with 42000*g ~ balance) flow to the block builder if it colludes, with no sanity bound against `eth_maxPriorityFeePerGas`/history. ERC-20 path trusts `eth_estimateGas` the same way (`:187`). No theft path to the attacker beyond tip. `quoteBuffer` (`pay.ts:180-185`) does cap.
- Suggested fix: cap gas price (e.g. a hard maximum) and show max fee before signing; there is no confirmation screen for direct sweep at all (`Sweep.tsx:159` signs and broadcasts on one click; destination is not echoed back).

### L11 (Low). Tag record AAD binds only the chain id (known S3-16)
- Evidence: `tags.ts:71-73`; `find` (`:177-180`) returns the payload of whichever record the lookup index returns without checking `payload.stealthAddress` against the requested address. Disk-write attacker (A7) can swap ciphertexts between records to mislabel clients. Also plaintext metadata in IDB: `chainId`, `createdAt/updatedAt`, ciphertext length (label length) (`idbStore.ts`, `tags.ts:24-34`). Concurrent `save` duplicates and all-or-nothing `list` (haiku L9) verified by reading `tags.ts:147-190`.

### L12 (Low). CSP: broad `connect-src`, meta CSP lacks `frame-ancestors`, no Trusted Types
- Evidence: `_headers:5` and `index.html:10` `connect-src 'self' https: wss:` (documented, DEVIATIONS 20): any script that does execute can exfiltrate keys to any https origin; the only barrier is `script-src 'self'`. Meta CSP cannot carry `frame-ancestors` (ignored in meta), `X-Frame-Options`, `COOP` or `Permissions-Policy`; on a host that cannot apply `_headers` (GitHub Pages) the page is frameable (clickjacking of confirm buttons; wallet prompts remain outside the frame). No `require-trusted-types-for 'script'`, no `upgrade-insecure-requests`, no HSTS in `_headers` (host-level). Positives verified: `script-src 'self'` and `style-src 'self'` without `unsafe-*`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `worker-src 'self'`; `scan-bundle.mjs` asserts these; no inline style (`grep style={` empty).
- Impact assumes an XSS or malicious dependency; none found in app code (below).

### I1 (Info). Positive checks, verified in code
- Injection/XSS: grep for `dangerouslySetInnerHTML|innerHTML|eval|new Function|document.write` over `src` and `public` returns only comments and `scan-bundle.mjs`; all user/invoice/wallet text rendered through React text nodes; wallet names/icons sanitised (`wallet.ts:34-39,27-28,60`), icons accepted only as `data:image` base64 (and `img-src` allows `data:`; SVG icon data URIs are not scripted in `<img>`).
- Worker: `scannerCore.ts` and `scanner.worker.ts` use no network API (also enforced by `scan-bundle.mjs:WORKER_FORBIDDEN` and a test); viewing key zeroized at `scannerCore.ts:57-59` and `scanClient.ts:140`; `checkAnnouncement` never throws on malformed logs.
- Crypto: keystore AES-256-GCM, random 128-bit salt and 96-bit IV per file (`keystore.ts:73-74` area), AAD binds meta+KDF params, NFKC passphrase, `extractable=false`, plaintext zeroized, wrong passphrase and tamper indistinguishable. Tags: HKDF with random per-profile salt and distinct `info`, fresh IV per write. Jitter uses CSPRNG rejection sampling (`jitter.ts:25-37`). Sweep nonce is 128-bit CSPRNG (`sweep.ts:101-105`), permit domain checked against on-chain `DOMAIN_SEPARATOR` (`pay.ts:324-336`), derived stealth key verified against the owner before use (`sweep.ts:34-42`), signed raw tx hash verified against the RPC reply (`:197`).
- Replay: EIP-712 sweep carries chain id and verifying contract (via `buildSweepTypedData`), random nonce and 20 min deadline; direct sweep tx carries `chainId`; nonce `pending` from RPC. Reentrancy not applicable (client).
- Relayer fee: capped 300 bps by `assertSponsorFeeAcceptable` (`chain-adapters/src/fees.ts:162-167`), `fee >= amount` rejected, `feeTo` excluded if owner/destination. The relayer also compares `feeTo` with its own config (`apps/relayer/src/service.ts:229`). Haiku/spec claim R-03 (client should pin `feeTo` to the manifest) is a design question: `feeTo` is the relayer's sponsor address and the manifest `feeRecipient` is the router fee recipient, so a literal equality check as proposed may be wrong; unverified, needs a spec decision.
- Dependencies: exact pins in `package.json`; `@noble/hashes@2.4.0` is now in `package-lock.json` (DEVIATIONS item 1 is stale); `npm audit --omit=dev` clean (Run). Versions such as react 19.3.1 / vite 8.3.5 are newer than my knowledge and not independently verified.

### I2 (Info). Metadata leakage inventory
- Relayer learns IP, owner (stealth), destination, token, amount, timing and links stealth -> destination by design (`Sweep.tsx:128`, quote sent before the user commits, `relayerClient.ts:73`). RPC provider sees scanned ranges and queried addresses (including stealth addresses on sweep). Hash fragment never leaves the page (`fragment.ts`, `Referrer-Policy: no-referrer`, `meta referrer`). `computeReleaseHash` re-fetches the entry script (own origin only).
- Local: checkpoint cursor and settings in `localStorage` plaintext; receipt JSON download has amounts/times with a confirm (`Pay.tsx:~552`).

### I3 (Info). Embed SDK (`public/ghostpay-embed-v1.js`)
- Same-origin https (or localhost) check, bounded length, `noopener,noreferrer`, no `innerHTML` (`:30-66`). `appOrigin` derives from `document.currentScript`; when null (dynamically injected) all buttons disable (fail closed). Served `Cross-Origin-Resource-Policy: cross-origin`, `max-age=3600`, no SRI published (S3-10).

### I4 (Info). Seller-controlled staleness window
- `pay.ts:148` clamps `maxAgeSeconds` to the seller's own `quote.expiresAt - quote.timestamp` up to 24 h (A4). With no verified feeds shipped (DEVIATIONS 4) the path is unreachable today; flag for when feeds land (matches `audits/security-tslibs.md`).

### I5 (Info). Sweep destination/quote UX
- No confirmation screen echoing the final destination before signing (relayed: `Sweep.tsx:150-155`; direct: `:159`). Only the `checkDestination` rules (`sweep.ts:44-52`: valid, not owner, not a GhostPay contract). Clipboard-swap malware is out of scope; echoing the checksummed destination would help.

### I6 (Info). Stale and carried-over items
- haiku `bugs-btcapps` L5 (prepared payment can be sent after invoice expiry): confirmed by reading `payExec.ts:322-326` (only `built.preview.deadline`). Low, business logic. L10 (`BigInt('0x')` in `permitReader.nonce`, `pay.ts:267,280`): confirmed; error would fall to the generic message, harmless. L11 (stale `balance`/`quote` in Sweep after switching selection, `Sweep.tsx:19-45`): confirmed; the quote is also per-owner so relayer rejects (not run).

## 3. Cross-check against existing docs

- THREAT_MODEL rows confirmed in code: S3-01 (H1), S3-02 (L9), S3-04 (hash widget same-origin, `release.ts:8-20`), S3-09 (extended by M4), S3-16 (L11), S3-19 (approval left in place: `payExec.ts:279-283` approves before the final preview; not re-tested).
- New relative to docs reviewed: M1, M2, M3, M4, L1, L3, L7, L8, L10.
- Haiku audits verified: `bugs-btcapps` L4, L5, L7, L8, L9, L10, L11 true as described; `code-btcapps` item 1 (wire mismatch) true (M1); its "High" rating is functional, so rated Medium here.
- `review-relayer-app.md` R-03 (feeTo not pinned to manifest): the code fact is verified; the proposed remedy is questionable (see I1).

## 4. Not covered / unverified

- Playwright e2e and the CSP under a real header host; Firefox/Safari; real wallets (EIP-6963 spoofing, malicious providers); real RPC reorg behaviour; `chain-adapters`/`core-crypto` internals (other round audits); relayer behaviour beyond `validate.ts`/`service.ts` greps; `CreateInvoice.tsx`, `About.tsx`, `QrView.tsx`, `Pay.tsx` rendering lines 340-616 read only by grep.
