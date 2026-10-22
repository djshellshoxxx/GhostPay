# Research: user safety around recovery and usability

Date 2026-10-21. Branch `claude/remote-extensions-1`. Author: research subagent. Scope: lost-key/lost-device recovery, backup UX, error text, a11y/cognitive load, localisation, onboarding, testnet-to-mainnet progression, user comms without admin, stuck/wrong-address funds, mobile/in-app browsers.

## 0. Method and source status

Read: `README.md`, `docs/remote/modules-needed.md` (rank 11 "Backup/recovery": Partial), `docs/remote/security-specs/key-lifecycle.md` (KL-1..KL-33, draft), `incident-response.md`, `docs/user/troubleshooting.md`, `docs/remote/usability/specs/{i18n,onboarding,a11y-pass}.md`, `apps/web/src/lib/{keystore,errors,session,format}.ts`, `views/SellerKeys.tsx`, `GhostPayRouter.sol` (lines 150-157). `docs/remote/audits/*` (haiku) not relied on.

Retrieved 2026-10-21 (verified, via fetch):
- BIP-352 Backup and Recovery: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki
- ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md
- ERC-6538: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-6538.md
- ERC-55: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-55.md
- ERC-2612: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-2612.md
- SLIP-39: https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0039.md
- WCAG 2.2 criterion list (partial, titles/levels only): https://raw.githubusercontent.com/w3c/wcag/main/guidelines/index.html
- WebAuthn (first 100k chars only; BE/BS definitions seen, PRF section NOT read): https://raw.githubusercontent.com/w3c/webauthn/main/index.bs
- Bybit/Safe{Wallet} front-end tamper (secondary press, via search, not primary): https://slowmist.medium.com/bybits-1-5-billion-theft-unveiled-safe-wallet-front-end-code-tampered-84b78f0fa9c2 ; https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-breached-safe-wallet-developer-machine/amp/

Unreachable (DNS blocked): www.w3.org, eips.ethereum.org, arxiv.org, unicode.org, webkit.org, developer.mozilla.org. 404 on guessed paths: ERC-3085, ERC-1193, ERC-6963 raw (paths wrong or moved). Consequently UNVERIFIED (from memory, flagged where used): Trojan Source (Boucher/Anderson, arXiv 2111.00169), UTS #39 confusables, Safari 7-day script-storage cap, MDN storage-persist behaviour, EIP-1193 error codes, WCAG SC bodies beyond titles. No primary doc for Umbra/Fluidkey recovery behaviour was reachable; search returned only an audit and hackathon pages.

## 1. Findings that shape the recommendations

1. ERC-5564 defines no recovery path and no backup procedure (verified: page silent). Funds at a stealth address need the spend key; scanning needs the view key. Loss of the spend key = permanent loss; loss of the view key = cannot discover payments, but the on-chain announcements stay public so a restored view key recovers them by rescanning from the registration block.
2. BIP-352 (verified): addresses derived independently, so backups are essential; labels "SHOULD be included in the backup"; seed-only recovery requires scanning up to ~100k labels; always scan change label m=0; restore needs a scan "since the last backup". Matches KL-12/KL-29.
3. ERC-6538 (verified): re-registering replaces the meta-address; no remove function; guidance "if a key is compromised, quickly remove registration". GhostPay does not appear to use the registry (not checked); if adopted, rotation = overwrite, and a compromise advisory must say old-address payments still land on the compromised key.
4. Repo gaps: random (non-seed) keys: `SellerKeys.tsx` generate/import/export three secrets (`spend`, `view`, `signing`) as hex; the keystore is the only backup (`keystore.ts`: scrypt, `MIN_PASSPHRASE = 10`, `MAX_N = 1<<20`, `MAX_KEYSTORE_BYTES = 8 KiB`); troubleshooting says "no recovery", "Keys disappeared: tabs forget keys by design", tags have no encrypted export. `errors.ts` userMessage is already safe by construction (generic fallback, no input echo); but `error.path` is appended for SCHEMA, `ChainAdapterError.code` shown raw. `index.html` `lang="en"`, no `Intl` use, `parseUnits` strict ".". a11y: aria-live region, labelled sections exist; `Field` inputs use `inputMode="decimal"`. No idle-key-wipe on `visibilitychange` confirmed by grep (KL-27 not implemented).
5. Router rejects plain ETH (`receive()`/`fallback()` revert `NoDirectETH`) so the common mistake of sending ETH to the router fails safely; ERC-20 `transfer` directly to router/relayer/announcer address cannot be rejected and is permanently stuck (no rescue by design, ADR-0006 area). A token sent directly to a one-time stealth address (bypassing router) is NOT stuck: it is recoverable if the announcement/ephemeral key exists; if no announcement was emitted, the funds are unreachable even to the seller because the ephemeral key is unknown (inferred from ERC-5564 derivation; verify with a test).
6. ERC-55 (verified): checksum catches typos with ~99.98% probability (0.0247% false pass) but is not a defence against lookalike/poisoning; it is only case.
7. SLIP-39 (verified): Shamir shares with checksum; advises AGAINST auto-correcting mistyped words; wrong passphrase undetectable; English only; designed for BIP-32 seeds, not arbitrary 3x32-byte random keys (would need a master-secret wrapper). Relevant if a seed-based key mode is ever added.
8. ERC-2612 (verified): permit signatures are censorable by the relayer holder; deadline limits withholding; signer can self-submit to bump nonce. Relevant to sweep UX: the "relayer sweep stuck" rescue is to do a direct sweep or self-submit the permit.
9. Bybit/Safe incident (secondary sources): malicious JS served from the vendor's S3 bucket targeted specific wallets; multisig signers saw a benign UI. Lesson: users cannot rely on the UI; need an independent display (hardware/second device) of the decoded destination, and a way for the project to warn quickly.
10. WCAG 2.2 (titles/levels verified, bodies not): 2.5.8 Target Size (Minimum) AA; 3.3.7 Redundant Entry A; 3.3.8 Accessible Authentication (Minimum) AA; 3.2.6 Consistent Help A; 3.3.3 Error Suggestion AA; 2.2.1 Timing Adjustable A; 1.3.5 Identify Input Purpose AA; 2.4.11 Focus Not Obscured (Minimum) AA. (3.3.4 Error Prevention and 1.4.10 Reflow exist in the standard; the fetched index lacked their titles, so confirm.)

## 2. Recommendations

Effort S (<1 day), M (days), L (weeks). "Owner" = needs an owner decision/cost/service.

### R1. Backup completeness and restore verification
- Threat: user exports a keystore, never tests it; file corrupt, wrong passphrase typed once (typo at export), or unicode normalisation mismatch -> funds locked. Today export asks the passphrase twice but does not prove the file decrypts.
- Change: in `apps/web/src/lib/keystore.ts` export path, after encrypt, immediately decrypt the produced blob in memory and compare the derived meta-address; only then offer download (matches KL-15/KL-16 spirit). In `SellerKeys.tsx` add a "Test my backup" step: import the file+passphrase into a throwaway context and show only the meta-address checksum, not keys. Put non-secret `metaAddress` + short checksum in the file name/header (KL-16). Record scan start block (birthday) in `meta` so a restore scan is bounded (BIP-352 "scan since last backup" idea applied to EVM). NFKC already applied in `derive`; add a note in UI that passphrase is normalised, and test a passphrase with composed/decomposed forms (round-trip test in `keystore.test.ts`).
- Effort S/M. Residual: user loses both file and passphrase. Priority: P0 (before any mainnet). Owner decision: none.

### R2. Passphrase and import hardening
- Threat: weak passphrase (10 chars), attacker-supplied KDF cost DoS (S3-13), password-manager autofill into the wrong field.
- Change: `MIN_PASSPHRASE` 10 -> 12 code points (KL-14) plus a local strength check (length + denylist, no network; do not ship zxcvbn blindly, check THIRD_PARTY.md); `MAX_N` allowlist to exactly 1<<17 (KL-13); show "Import takes about N seconds" progress and a cancel (WCAG 2.2.1 spirit). Offer an optional "passphrase hint stays on this device only" -- NOT recommended; skip (hints leak).
- Effort S. Residual: offline brute force of a stolen file bounded by scrypt cost. Priority: P0. Owner: none.

### R3. Redundant backup channels (offline/paper/Shamir)
- Threat: single-file backup in one cloud folder; device + file lost together.
- Change (design now, build later): `packages/secret-box` or new `packages/key-backup`: (a) printable "recovery sheet" = QR + checksummed text of the encrypted keystore (not plaintext keys) with the meta-address for identification; (b) optional M-of-N split of the keystore passphrase-derived key or of a 32-byte master seed using SLIP-39 semantics if and only if GhostPay moves to a seed-derived key mode (generate `spend`/`view` by HKDF from one 256-bit master; today three independent random keys, so SLIP-39 cannot be applied directly). Follow SLIP-39's rule: no automatic typo correction; checksum and report only. English-only wordlist caveat -> localisation risk (section R9).
- Effort L. Residual: seed-mode migration is a breaking format change (new `v: 2`; keep v1 import). Priority: P1. Owner decision: seed-derived keys vs random keys (affects BTC silent payments too, which uses BIP-352 seed convention).

### R4. Lost device and lost view key (recovery by rescan)
- Threat: user with passphrase+file on a new device cannot find past payments (RPC `eth_getLogs` ranges, start block unknown).
- Change: `scanClient.ts`/`Scan.tsx`: default start block = keystore-recorded birthday (R1) else the deployment-manifest `startBlock`; surface "Recovery scan" mode with progress and resumable cursor; document in `docs/user/receive-and-scan.md`. Treat announcement-match as a claim (existing doc) and show the real balance. Encrypted export of tags (already flagged "no recovery") via `secret-box` so a device loss does not lose invoice-to-payment mapping; keep tags optional.
- Effort M. Residual: RPC providers prune logs; archive-capable RPC required (document). Priority: P1. Owner: none (RPC choice stays the user's).

### R5. Compromise and rotation messaging
- Threat: user thinks "rotate" fixes old exposure. ERC-6538: re-register overwrites; old outputs remain under the old key.
- Change: implement KL-18/KL-19 wording in `SellerKeys.tsx`: rotation creates a new keystore, keeps old decryptable, prompts to sweep old outputs first, states that payments sent to the old meta-address (invoices still circulating) go to the old key. Add "retired keys" list so the app keeps scanning old keys until balances are zero.
- Effort M. Residual: invoices already shared. Priority: P1. Owner: none.

### R6. Error messages and secret hygiene
- Threat: secrets or private context in error text, logs, clipboard, screenshots, bug reports.
- Change: (a) keep `userMessage` default; add a lint rule/test in `apps/web` that no `catch` renders `e.message` directly (grep shows `Pay.tsx:294`, `Settings.tsx:43`, `Scan.tsx:91`, `QrView.tsx:13` compare `e.message` to sentinel strings only; fine). (b) `ChainAdapterError.code` and `GhostPayCryptoError.code` shown raw: map to human text with a "copy diagnostic code" button that contains only the code + app version + release hash, never URLs/addresses. (c) Never put keys/passphrases in `<input value>` after failed import (KL-26): clear state on failure. (d) Failed-import messages must not distinguish "wrong passphrase" from "corrupt file" in a way that helps oracle attacks beyond what AEAD already gives; current text combines both (good, keep). (e) Add `Referrer-Policy: no-referrer` and clipboard auto-clear (timer, best-effort; browsers may refuse) for exported text; warn that clipboard managers and keyboards (mobile) can record.
- Effort S/M. Residual: browser extensions can read DOM. Priority: P1. Owner: none.

### R7. Idle lock, tab-hide wipe, autofill
- Threat: shared/stolen unlocked device; mobile app switching keeps keys in memory.
- Change: implement KL-27: on `visibilitychange` hidden for >60 s (and on `pagehide`), drop keys in `session.ts`; add manual "Lock now" button in header; password inputs: `autoComplete="off"` on import, `new-password` only for export fields (S3-26); `type="password"` is already used for hex keys. Do not make users type a passphrase through a cognitive test: WCAG 3.3.8 requires paste allowed and no puzzle/transcription; ensure `onPaste` not blocked and password managers work (the "recovery sheet" in R3 must be scannable/pastable, not retype-only).
- Effort S. Residual: JS memory cannot be guaranteed wiped (KL-23). Priority: P1. Owner: none.

### R8. Accessibility (WCAG 2.2) for money-moving screens
- Threat: users with low vision/motor/cognitive limits mis-send, mis-copy, or abandon backup steps; error identification absent.
- Change in `apps/web/src/styles/app.css` and views: targets >= 24x24 CSS px (2.5.8); sticky header must not obscure focus (2.4.11); one help link in same place on every view (3.2.6, Home/About); do not ask the user to re-enter data already given within a flow (3.3.7: Pay -> review must not make them retype the amount/recipient; the passphrase confirm field in export is a recognised exception for confirmation); error text adjacent to field with `aria-describedby`/`aria-invalid` and a suggestion (3.3.3); review-before-confirm step for Pay and Sweep is already in the design: add a reversible/confirm step for key export/wipe; no timeouts without warning (2.2.1) - relayer quote expiry and idle lock need a visible countdown and "extend"; `Alert` icons exist (`Common.tsx` uses glyph + text, good: not colour-only). Add `axe-core` test to Playwright e2e (new devDependency, record in THIRD_PARTY.md) and a keyboard-only e2e of backup/restore. Manual screen-reader pass (NVDA/VoiceOver) before mainnet.
- Effort M. Residual: automated tools cover ~a third of issues (general knowledge, unverified here). Priority: P1 (P0 for backup and pay flows). Owner: cost of a manual a11y audit if desired.

### R9. Localisation risks (amounts, RTL, homoglyphs)
- Threat: decimal comma/period confusion mis-sends 1000x (`1,000` read as 1.000); RTL/bidi control characters reorder displayed addresses/amounts; lookalike characters in invoice labels/ENS-like names; non-ASCII digits (Arabic-Indic) parsed or displayed differently; English-only security strings translated wrongly.
- Change: follow `usability/specs/i18n.md` IN-1..IN-6 and add: (a) amount input stays ASCII "." and rejects "," with a specific hint rather than guessing (never infer from locale); show amount review in canonical digits plus unit and chain name, with grouping separators suppressed in review (IN-2). (b) Render addresses, hashes, amounts in `<bdi>`/`dir="ltr"` `unicode-bidi: isolate` monospace; strip/escape bidi controls (U+202A-202E, U+2066-2069), zero-width and tag characters from invoice free text before display (modules-needed rank 5 notes invoice text accepts them; Trojan Source documents the bidi class of attack, UNVERIFIED source unreachable). (c) Mixed-script/confusable warning on seller display name using a bundled UTS #39 skeleton table (UNVERIFIED; source unreachable): flag, do not block. (d) Show first/last 6+ chars with a "compare in full" view for addresses; ERC-55 is typo detection only (0.0247% false-pass, verified), not anti-poisoning. (e) `SECURITY_KEYS` fall back to English unless reviewed (IN-3). (f) Set `<html lang dir>` at runtime.
- Effort L (i18n core) / S (bidi strip + ltr isolation). Residual: translation errors in safety text. Priority: P0 for bidi/amount canonicalisation, P2 for full translation. Owner decision: which locales (cost of reviewers).

### R10. Onboarding education and cognitive load
- Threat: first-run user skips backup, thinks the app is a custodian, misreads "no recovery".
- Change: implement `usability/specs/onboarding.md`: role-based checklist, testnet default, a mandatory "backup test" gate before an invoice link can be created or shared (seller) -- R1 predicate `backupVerified` stored non-secretly in settings; plain-language one-screen explanation: "We cannot recover your keys. Nobody can." Show a 3-item "what GhostPay can/cannot do" (README honest-status table style). Chunk long flows (<= 5 steps), one decision per screen, no jargon (use the ux-glossary). Include "what if I lose X" matrix: file / passphrase / device / browser data / seed (n/a) with outcome.
- Effort M. Residual: users click through. Priority: P1. Owner: copy review.

### R11. Safe testnet-to-mainnet progression
- Threat: user tries real money on an unaudited, immutable system; testnet token/mainnet confusion; wrong-chain sends.
- Change: (a) keep `enabled: false` mainnets; add a hard in-app banner and colour theme per network class; mainnet requires typed confirmation of an amount cap acknowledgement ("I understand contracts are immutable and unaudited") until an audit exists. (b) Per-chain value cap in the UI (not enforceable on-chain, so state as advice) tied to manifest field `maxRecommendedUsd`-style (new schema field, owner). (c) Testnet faucets and fake tokens flagged; chain id and name always shown on review and signed in wallet (existing chain-mismatch checks). (d) Staged launch plan: testnet soak with recovery drill (KL-30), then mainnet with small cap and a visible "launch tier" label in the manifest. Use only testnets named in deployment-runbook (Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, Hoodi); testnet longevity is outside the project's control (check each network's current status before pinning docs; not verified here).
- Effort M. Residual: caps are advisory. Priority: P0 for banner/ack; P2 schema cap. Owner decision: audit-gate criteria and caps.

### R12. Communication and kill-switch without an admin
- Threat: contracts have no pause/owner; a bug or frontend compromise (Bybit/Safe pattern) needs a fast, trustworthy warning and a way to stop users using bad deployments.
- Change: layered, all off-chain: (a) signed advisory file `advisories.json` published at a fixed path and mirrored; signed with a release/advisory key (separate from release key; threshold-signed if owner chooses); app fetches it at load (one GET to same origin, no analytics) and shows a blocking banner for matching `manifest hash`/router address/app version; fail-open for availability but visible "advisory feed unreachable" status. This is the "kill switch": the manifest/app refuses to build payments to a flagged router (the manifest is already the deployment gate; README: "Without a manifest the web app disables payment"). (b) Manifest revocation list (`revoked` array in the manifest schema; ties to S3-01 manifest authentication, rank 1 in modules-needed). (c) Out-of-band channels: SECURITY.md contact, status page on a different host, mirrors/onion (see `onion-i2p-research.md`), a "what to do if advisory" runbook for sweepers: sweep out of any stealth balance first, because stealth addresses are EOAs under user control, independent of router bugs. (d) Document honestly that on-chain funds in an exploited immutable router cannot be frozen. (e) Do not let the advisory feed carry arbitrary HTML/links; text only, length-capped, no auto-redirect (avoids turning the kill switch into a phishing vector).
- Effort M/L. Residual: attacker with the advisory key can DoS the app; threshold signing and user-pinned "ignore advisories" setting (default on, but disclosed) balance this. Priority: P0 design, P1 build. Owner decision: advisory key custody, who may sign, hosting of a second origin (cost).

### R13. Rescue paths for stuck or wrongly sent funds
Cases (what is recoverable, by design):
| Case | Recoverable? | Path |
|---|---|---|
| ETH sent to router/relayer/announcer address | No loss: `receive()` reverts (`GhostPayRouter.sol:150`) | Wallet shows the revert; document |
| ERC-20 `transfer` straight to router/sweep relayer/announcer | No (no rescue, by design) | Warn at pay time; never display router as a "deposit address"; only the app builds router calls |
| Token to a one-time stealth address with announcement | Yes | Scan, sweep (direct or relayer) |
| Token to stealth address WITHOUT announcement | Only if payer kept the ephemeral key/derivation | Payer-side "export payment receipt" (ephemeral pubkey + stealth address + tx hash) to give seller; build `Import manual announcement` in Scan (S/M) |
| Wrong chain | Depends: same EOA key exists on all EVM chains, so a stealth address on chain A is controlled on chain B by the same derived key; token must exist there. Sweep UI must allow selecting the chain where the funds are | Document; allow manual chain + address entry |
| Sweep stuck (relayer down, permit withheld) | Yes | Direct sweep with own gas, or self-submit permit (ERC-2612 notes signer can submit directly, bumping nonce) |
| Token with blacklist/freeze | No | Warn |
| Seller lost spend key | No | Backups only |
| Sent to an old/rotated meta-address | Yes if old key kept | R5 retired-keys scanning |
- Change: `Scan.tsx` manual-announcement import, `Sweep.tsx` chain selector + "stuck sweep" help, payer receipt export in `Pay.tsx`, docs table in `docs/user/troubleshooting.md`. Gas for the first sweep from a fresh stealth address (needs native coin; relayer path exists) must be explained.
- Effort M. Residual: irreversible losses remain; stated plainly. Priority: P1. Owner: none.

### R14. Mobile and in-app browser pitfalls
- Threat: wallet in-app browsers (injected provider, no EIP-6963, different storage, no file download) break backup export; iOS/Android evict storage; clipboard/keyboard leaks; link-opening from messengers strips fragments (troubleshooting already notes re-encoding); tap-targets and zoom.
- Change: (a) Detect in-app/webview (feature-detect: download attribute unsupported, `window.ethereum` without EIP-6963, UA is last resort only) and block keystore generation there with "open in your normal browser to back up"; allow pay-only. (b) Do not rely on IndexedDB/localStorage for anything but non-secret settings; call `navigator.storage.persist()` where tags are stored and tell users data may be evicted (browser storage eviction and a Safari ~7-day script-writable-storage rule exist per WebKit/MDN: UNVERIFIED, pages unreachable). (c) Backup export on mobile: use `<a download>` fallback to Web Share API file sharing, and a copy-as-text option for the encrypted blob (8 KiB cap makes it feasible). (d) Fragment survival: invoice `#gpi=v1.` links lose fragments in some messengers; add a "link fell apart" check and QR path (exists `qr.ts`). (e) Keep WalletConnect gap visible in docs (not built). (f) Viewport/zoom: do not set `maximum-scale`; reflow at 320 px (WCAG 1.4.10 exists, body unverified).
- Effort M. Residual: wallet vendors vary. Priority: P1. Owner: none.

### R15. Recovery drills and metrics without telemetry
- Change: pre-launch checklist item KL-30 executed and logged in `docs/operators/`: fresh browser profile, restore from file, rescan, sweep on a testnet; repeat per release. No analytics: use opt-in local "backup status" indicator only.
- Effort S. Priority: P0 before mainnet. Owner: schedule.

## 3. Ranked roadmap

| Rank | Item | Threat | Effort | Priority | Needs owner/cost/service |
|---|---|---|---|---|---|
| 1 | R1 export self-verify + test-restore + birthday in keystore | unrecoverable backups | S/M | P0 | no |
| 2 | R12 signed advisory feed + manifest revocation (design) | no on-chain kill switch; frontend compromise | M/L | P0 design, P1 build | yes: key custody, second host |
| 3 | R11 mainnet banner, ack, staged launch gate | real-money use of unaudited immutable code | M | P0 | yes: criteria and caps |
| 4 | R9b/R9a bidi/zero-width strip, ltr isolation, canonical amounts | display spoofing, 1000x decimal errors | S | P0 | no |
| 5 | R2 passphrase 12+, KDF allowlist | brute force, DoS import | S | P0 | no |
| 6 | R15 recovery drill on testnet | untested recovery | S | P0 | schedule |
| 7 | R13 manual-announcement import, payer receipt, rescue table | wrong/stuck funds | M | P1 | no |
| 8 | R7 tab-hide wipe + lock button + paste-friendly auth | stolen/shared device | S | P1 | no |
| 9 | R10 onboarding gate on backup | skipped backups | M | P1 | copy review |
| 10 | R8 WCAG 2.2 fixes + axe e2e | exclusion, mis-sends | M | P1 | optional audit cost |
| 11 | R14 in-app browser detection, mobile export path | broken/blocked backup | M | P1 | no |
| 12 | R4 recovery scan UX + encrypted tags export | device loss | M | P1 | no |
| 13 | R5 rotation + retired keys | false sense of safety | M | P1 | no |
| 14 | R6 error code mapping + diagnostic copy | leaks, confusion | S/M | P1 | no |
| 15 | R3 paper/Shamir backup, seed-mode key format | single-channel backup | L | P1/P2 | yes: seed vs random keys |
| 16 | R9 full i18n + confusable table | locale errors | L | P2 | yes: locales, reviewers |

## 4. Open questions for the owner
1. Seed-derived single master secret (enables SLIP-39 and BIP-352-style recovery) versus today's independent random keys? Format change `v: 2`.
2. Who holds the advisory signing key and where is the second origin hosted?
3. Audit-gate criteria for enabling any mainnet and the per-chain value caps shown to users.
4. Which locales, and who reviews safety strings.
5. Does the app use ERC-6538 registry anywhere (affects rotation and compromise text)?

## 5. Caveats
Behavioural claims about third-party apps (Umbra, Fluidkey) are not made; no primary docs reachable. The Bybit/Safe account rests on secondary press and may be revised by the final post-mortem. Statements about Safari storage caps, MDN eviction, UTS #39, Trojan Source and EIP-1193 error codes are unverified from this run.
