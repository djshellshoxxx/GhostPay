# A4: user- and operator-facing documentation accuracy against current source

Worker: SECONDARY analysis worker A4. Read-only: no repository edit, commit, push, PR or comment.
Base: `origin/main` = `b890a766` (fetched 2026-11-28 ~02:20Z). Every `file:line` below is at `b890a766` unless a branch is named.
Scratch: detached worktree `/workspace/scratch/a4-docs-wt` (uncommitted scratch test `apps/web/src/__a4scratch/plan.test.ts`,
copy in `/workspace/scratch/a4-docs/plan.test.ts`); notes in `/workspace/scratch/a4-docs/`.

## How this was checked

- **Read in source**: every claim below was compared with the cited source line. "Verified" = read in source and/or run.
- **Run** (all green):
  - `node --test scripts/recovery/seller-keystore-recover.test.mjs` → 18/18 pass; `node --test scripts/recovery/stealth-export-recover.test.mjs` → 23/23 pass (Option B recovery procedure).
  - `npx vitest run src/App.test.tsx -t idle --coverage=false --maxWorkers=1` (apps/web) → 9 pass / 8 skipped by filter; includes
    `retains an unbacked invoice signer for encrypted recovery only after idle` (App.test.tsx:150) and
    `keeps keys whose only copy is an unverified download at idle lock` (App.test.tsx:232).
  - Scratch test (4/4 pass): Tor Browser + "private path required" → `planScan` returns `ready` with `useSecondary: true`;
    Direct + required → `blocked`; default scan window 1000 blocks / jitter 0; `wss://` passes `validateRpcUrl` but
    `fetchTransport.send` rejects it (`/needs http/`).
  - Mechanical relative-link check over all in-scope files (`/workspace/scratch/a4-docs/linkcheck.py`): **no broken
    links** (only build outputs / `public/` assets, which resolve at serve time).
- **Inferred, not run**: browser CSP behaviour for `http://127.0.0.1` (from the CSP string + CSP spec; the repo already records
  the same conclusion). Whether the old `gh-pages` prototype is still served (fetch not permitted from this sandbox).

## Ranked summary (fund recovery and privacy first)

| # | Doc | Finding | Impact | Owner / overlap |
|---|---|---|---|---|
| R1 | `docs/user/troubleshooting.md:25-26` | Wrong idle-lock rules and wrong recovery steps (unverified downloads and hex-without-signer are **retained**, not wiped; retained keys are **suspended**, a backup alone does not resume use) | High (recovery) | Unowned. #762 rewrites the matching in-app copy (`app.idle.suspended.body`); align wording |
| R2 | `docs/pages/README.md:33` | Says seller keys are "stored encrypted ... in this browser's storage"; they are memory-only unless the user saves the optional vault | High (key loss) | Unowned line. #762/#764 edit L95/L126, #720 edits L48 of the same file |
| R3 | `docs/user/README.md`, `docs/INDEX.md`, `recover-stealth-payment-keys.md:17` | The independent recovery guide is orphaned (no index links it) and says the export controls are "under review for the Pages client"; they ship in the lean build (#539 merged) | High (recovery discoverability) | #722 appends a section to `docs/user/README.md` (different hunk) |
| P1 | `docs/pages/README.md:50` | "private path required (Tor Browser or a local proxy) blocks the scan when that path is not available" — Tor Browser mode never blocks and still contacts the second RPC | High (privacy overclaim) | Unowned |
| P2 | `docs/pages/README.md:48-49`, `privacy-limits.md:63`, `PRIVACY_THREAT_MODEL.md:132,191` | `wss://` is accepted but unusable; local-proxy `http://127.0.0.1` is accepted but blocked by the shipped CSP on an HTTPS Pages origin | Medium-high | #720 rewrites L48 (keeps the wss wording). Discrepancy already recorded on main in `docs/pages/tor-rpc-compatibility.md:24-25` |
| P3 | `privacy-limits.md:48` (+ threat models, skill REFERENCE §1) | "The app ... **does not check** whether you have used [a destination] before" contradicts the same page (L179-185) and source: a tab-local reuse check is wired | Medium | Unowned. Skill `REFERENCE.md` §1 carries the same stale rule |
| P4 | `docs/user/product-guide.md:164-165` | "Settings transfer contains only delay range, idle-lock timeout, theme and fragment-clearing preference. Endpoints and pinned trust stay local." — optional RPC/relayer/signer sections exist | Medium (privacy: URLs can carry API keys) | Unowned |
| P5 | `privacy-limits.md:10`, `:170` | "The page that scans ... has no network access of its own"; "A second RPC adds ... availability" | Medium | Unowned. Recorded in `tor-rpc-compatibility.md:27` |
| P6 | `SECURITY.md:45` (+ `THREAT_MODEL.md`) | "The deployment manifest is not yet authenticated." — authenticated and read back since S3-01/SEC-14 | Medium | Unowned. PRIMARY P-M4 owns only `DEPLOYMENT_MANIFEST.md` + `apps/web/deployments/README.md` |
| P7 | `privacy-limits.md:62,144`, `seller-privacy.md:67-69`, `review-and-pay-an-invoice.md:33` | Funding-hygiene advice ("use the payer's gas buffer or a relayer") is not available in the Pages build | Medium | Coordinate with PRIMARY P-M1 (gas top-up linkage warning, sweep guide) |
| P8 | `PRIVACY_THREAT_MODEL.md`, `metadata-exposure-matrix.md` | One overclaim (tight CSP option "implemented/wired"; it is dead code) and five shipped mitigations still listed as missing | Medium (the user page links these as "detailed analysis") | Unowned |
| P9 | `docs/pages/README.md:35` | Direct sweep "sends only the signed transaction to your RPC" — it also sends balance/gas/nonce reads naming the one-time address | Low-medium | P-M1 changes direct sweep; keep wording generic |
| R4 | `product-guide.md:3`, `:146` | Header pins an old branch (#90); "recovery-only idle fix ... follows ... PR #577" (#577 closed unmerged; behaviour is on main) | Low-medium | Unowned |
| O1 | `docs/pages/README.md:177,202` | Owner checklist tells the owner to merge the closed #137 stack / export into #137 | Medium (operator) | Unowned lines |
| O2 | `README.md` Status (L13-73), L215 vs L269, L264 | Present-tense status about closed PRs; contradictory Pages/hosting statements; fiat feeds "not configured" | Medium (project description) | #639 edits other README hunks (L135-178) |
| O3-O9 | various | Tag archive not in Pages; two non-existent labels; deletion phrase; no-RPC wording; INDEX gaps; THREAT_MODEL statuses | Low | see per-document sections |
| H1-H5 | `apps/web/help.html`, `apps/web/privacy.html` | **For #766's owner**: master backup "not available" (it is), idle lock "clears keys", second-provider deployment check (not on main), "availability", "published Pages copy" | High (H1) to low | #766 only adds tooltip markup to these files; content unaddressed |

---

## 1. `docs/user/troubleshooting.md`

### R1a — L25 "Keys disappeared" (fund recovery)
- **Current**: "The idle lock (Settings) also wipes keys from memory, but only keys that can be loaded again: imported from a keystore or as hex, **downloaded as a keystore**, or saved in the browser vault. **Hex keys imported without their invoice-signing key are wiped too**: the signing key generated for them at the import is lost, and a notice says so"
- **Why wrong**:
  - A download alone is `backedUp` but not `verified` (`apps/web/src/lib/session.ts:74-80`); `loadedKeysRecoverable` returns true only for a verified external copy or a still-stored vault (`apps/web/src/lib/keyVault.ts:385-400`), so download-only keys are **retained** (`AppShell.tsx:228-230`, notice `app.idle.keptUnverified`). Test: `App.test.tsx:232` (run: pass).
  - Hex import without a signing key is origin `import-new-signer` → custody `external: 'none'` → `signerOnly` (`session.ts:302-303, 359, 171`); idle **retains** the keys with `app.idle.keptSigner` ("Seller keys stay loaded because the invoice-signing key has no backup", `AppShell.tsx:217`). Test: `App.test.tsx:150` (run: pass). Since `2a70c041` (2026-11-25, on main). The `app.idle.signerLost` message is only listed in `i18n/securityKeys.ts:1408`, never rendered.
- **Proposed**: "Tabs forget keys on reload by design. The idle lock (Settings) wipes keys from memory only when a recoverable copy is confirmed: imported from a keystore or with all three hex keys, a downloaded keystore you verified, or the browser vault they are tied to (still saved). Keys whose only copy is an unverified download, or hex keys imported without their invoice-signing key, are kept in this tab but locked (see the next row)." Fix column: "Import your encrypted keystore, unlock the browser vault, or enter your hex keys again."
- **Overlap**: none near main. Old lineages (#372, #609, #587, #569, #300, #294, #355, #383; 1185-1280 commits behind) also touch this file.

### R1b — L26 "Keys still loaded after the idle time" (fund recovery)
- **Current**: "Back them up under Seller keys (download the encrypted keystore, or save the vault again). Until then Create invoice, the meta-address and registry publishing need the typed waiver, and **Wipe keys from memory** asks before wiping them."
- **Why wrong**: after idle the session is **suspended**: every view except Seller keys is forced and its nav button disabled (`AppShell.tsx:123, 442`; test asserts Create invoice disabled, `App.test.tsx:170`). Protected operations throw `error.session.lockedBackupOnly` (`session.ts:370, 431`). A download alone stays "unverified" and keeps the keys retained. The in-app recovery route is "save and unlock a vault, or download **and verify** a keystore, wipe, then import" (`app.idle.suspended.body`; `docs/user/session-security.md:51-59` says the same). The typed waiver does not lift suspension. Cause column also omits "an unverified download" and "hex import with a generated signer".
- **Proposed** cause: "No confirmed copy of these keys exists outside this tab: they were generated here, their only copy is a download you have not verified, a hex import generated their invoice-signing key, or the vault they came from was deleted." Fix: "The session is locked except for backup. Either save an encrypted browser vault and choose **Unlock saved vault**, or download the encrypted keystore, verify it under **Verify backup**, choose **Wipe keys from memory** and import that file. Saving or downloading alone does not unlock the session. Closing the tab first loses the keys. See [Session inactivity](session-security.md)."
- **Overlap**: #762 (`audit/nov27-six-finding-integration`, behind 0) rewrites `app.idle.suspended.body` and `docs/user/session-security.md:70-75` (physical-access risk accepted 2026-11-27). Match its wording; do not edit session-security.md (owned by #762/#764).

### O7 — L28 vault deletion (low)
- **Current**: "choose **Delete encrypted vault**: it shows the vault's meta-address and asks no passphrase. Confirm only if ..."
- **Why**: for a vault that does not hold the loaded keys the button stays disabled until the displayed phrase is typed (`SellerKeys.tsx:501, 550`; `sellerKeys.deleteSoleCopy`).
- **Proposed**: "...it shows the vault's meta-address, asks no passphrase, and asks you to type the displayed phrase. Type it only if that is the meta-address of your keystore..."

### O2a — L30, L32 tag archive (low-medium, Pages)
- **Current**: "Restore an encrypted tag archive (Seller keys) if you downloaded one" / "Back up what you still need (keystore, tag archive)".
- **Why**: the tag archive (`BackupPanel`/`TagArchive`) is mounted only by the full shell (`apps/web/src/App.tsx:8, 26`); the lean/Pages shell has none (`AppLean.tsx`; `docs/pages/README.md:24` agrees). Pages users cannot back up tags at all.
- **Proposed**: add "(full build only; the GitHub Pages build has no tag archive, so tags there cannot be backed up)".

### O8 — L13 "Could not verify" (low)
- **Why**: without an RPC the payment flow is already disabled (`verifyManifestForFlow` fails closed, `apps/web/src/lib/manifest.ts:66-71`; `Pay.tsx:584`). Same stale sentence in `review-and-pay-an-invoice.md:40` ("If you have not configured your own RPC it says it could not verify").
- **Proposed**: cause "The RPC has not seen the transaction yet, or it failed"; drop the "no RPC configured" branch in both files.

## 2. `docs/pages/README.md`

### R2 — L33 key storage (fund recovery)
- **Current**: "Seller spending, viewing and signing keys are generated in the page and stored encrypted (passphrase-derived key, AEAD) in this browser's storage."
- **Why wrong**: generated keys are installed in memory only (`session.ts:308-311`); the encrypted vault is optional and user-initiated (Seller keys); the same page says "Keys without a backup are lost if the tab closes" (L55). A reader of L33 can believe keys persist.
- **Proposed**: "Seller spending, viewing and signing keys are generated in the page and held in memory. They are saved only if you download the encrypted keystore or choose to save the optional encrypted browser vault (passphrase-derived key, AEAD). They are never sent to GitHub, an RPC provider or a wallet."
- **Overlap**: #762/#764 edit L95 and L126 only; #720 edits L48 only. No conflict with L33.

### P1 — L50 Tor Browser "required" (privacy overclaim)
- **Current**: "A 'private path required' setting (Tor Browser or a local proxy) blocks the scan when that path is not available instead of falling back to a direct connection."
- **Why wrong**: `planScan` blocks only `requireProxy && transport === 'direct'` and a local proxy without an endpoint (`apps/web/src/lib/scanPrivacy.ts:259-276`); `privatePathForbidsDirect` is true only for `local-proxy` (`:253-256`), so Tor Browser mode also keeps the direct second RPC (`:288`). The page cannot detect Tor (`scanPrivacy.ts:10-11`; `privacy-limits.md:76` and `privacy.html` say so). Verified by scratch test. Also recorded at `docs/pages/tor-rpc-compatibility.md:26` (commit `20733b6a`, 2026-11-23), unfixed.
- **Proposed**: "**Scan privacy.** With 'private path required', a scan stops instead of falling back to Direct, and with a local proxy it stops when the proxy endpoint is missing and skips the second RPC. 'Tor Browser' is only your statement that you opened the page in Tor Browser: the page cannot check it, so a scan in an ordinary browser still goes out directly, including to a configured second RPC."

### P2 — L48-49 WSS and loopback HTTP
- **Current**: "Only `https://` and `wss://` URLs ... are accepted." / "Give it an HTTPS or WSS endpoint, or choose the local-proxy scan path in Settings, which accepts `http://127.0.0.1`, `http://localhost` or `http://[::1]` for scanning."
- **Why wrong**:
  - WSS: `validateRpcUrl` accepts `wss:` (`packages/chain-adapters/src/rpc.ts:87`) but the default transport refuses anything but http(s) (`rpc.ts:97`; tests `rpc.test.ts:16` and `:329`); the app uses that transport (`apps/web/src/lib/defaultServices.ts:39`). A WSS URL saves but every request fails.
  - Loopback HTTP: the scan validator allows it (`scanPrivacy.ts:88`), but the shipped meta CSP is `connect-src 'self' https: wss:` (`apps/web/index.html:13`) and Pages cannot add headers; a page served from an HTTPS Pages origin may not connect to `http://127.0.0.1`. (Inferred from CSP; the repo's own e2e uses `https://localhost:9050`, `apps/web/e2e/network-isolation.spec.ts:6`.) Both recorded at `docs/pages/tor-rpc-compatibility.md:24-25`.
- **Proposed**: "Only `https://` URLs without a username, password or fragment work for the primary and second RPC (`wss://` is accepted by the form but the app has no WebSocket client)." / "**Your own node.** Put TLS in front of it and give an `https://` endpoint. The local-proxy scan path needs an HTTPS loopback forwarder (for example `https://localhost:<port>`) that allows this site's origin (CORS); plain `http://` loopback is blocked by this site's content security policy."
- **Overlap**: #720 (`claude/vibrant-cori-scu18b`, behind 346) rewrites L48 (second-RPC manifest cross-check) and keeps "Only `https://` and `wss://`". Same line: coordinate or land after/with #720 / P-M4.

### P9 — L35 direct sweep (low-medium)
- **Current**: "A direct sweep signs a plain transfer ... inside the page and sends only the signed transaction to your RPC."
- **Why**: `directSweep` also sends `eth_getBalance(owner)`, `eth_estimateGas {from: owner}` etc. (`apps/web/src/lib/sweep.ts:582-623`), and the optional balance read sends the address (`sweep.balanceRead.note`).
- **Proposed**: "...inside the page; the one-time private key never leaves it. Your RPC receives the one-time address in balance, nonce and gas reads, then the signed transaction."
- **Overlap**: PRIMARY P-M1 changes direct-sweep review (`Sweep.tsx`, `lib/sweep.ts`); keep the wording at this generic level.

### L51 idle lock (low)
- "Keys that exist only in the tab ... are kept loaded and the app tells you to back them up" omits that the session is locked except for backup, and "The deadline is a wall-clock check" omits the monotonic clock (`AppShell.tsx:207-213`; `session-security.md:10-15`). Proposed: "...are kept in this tab but locked: only encrypted backup and verification work until you restore them (see [session security](../user/session-security.md)). The deadline uses both wall and monotonic time, so a device that slept past it locks as soon as the page is visible or used again."

### O1 — L177 (step 6) and L202 (step 14): owner checklist (operator)
- **Current**: "Pull request #137 is stacked: #137 → #135 → #98 → `main`. Either merge the stack ... or open one pull request from `claude/ghostpay-github-pages-up6cj6`" / "Export or copy the list into pull request #137".
- **Why wrong**: #137 closed unmerged 2026-11-18; #135, #98 are not open; the Pages tooling is already on main (`scripts/pages/build-pages.sh`, `.github/workflows/pages.yml:212, 254-268`).
- **Proposed**: step 6 "The Pages build and workflow are on `main`; the deploy job runs only from `main` (`pages.yml`). Confirm CI is green on the `main` commit you intend to publish." Step 14 "...into a dated record under `docs/handoffs/` (or the release-qualification PR) so each item can be fixed or dispositioned."

## 3. `docs/user/privacy-limits.md`

### P3 — L48 destination reuse
- **Current**: "The app recommends a fresh destination but **does not check** whether you have used one before."
- **Why wrong**: contradicts L179-185 of the same page. The sweep form checks the destination against other one-time addresses of the current scan and this tab's sweep history (`apps/web/src/views/Sweep.tsx:7, 180-185`; `apps/web/src/lib/destinationReuse.ts:3-4, 41`, session storage, 128 records; since `5e6827e4`, 2026-11-23).
- **Proposed** (keeps the REFERENCE §1 intent of not claiming general reuse detection): "The app recommends a fresh destination. It warns only when the destination is another one-time address from the current scan or one this tab already swept to; it cannot tell whether an address was used before elsewhere or on-chain."
- **Note**: `.claude/skills/ghostpay-security-invariants/REFERENCE.md` §1 still says "Do not claim the app checks destination reuse (not wired)". Per the skill's "Keeping it current" rule, update that line in the same PR or a reviewer will flag the corrected text.

### P5a — L10 scan page network
- **Current**: "The page that scans for your payments has no network access of its own"
- **Why**: only the matching worker is network-free (`apps/web/scripts/scan-bundle.mjs` `WORKER_FORBIDDEN`); the Scan page fetches logs and receipts (this page's own L30). Recorded `tor-rpc-compatibility.md:27`.
- **Proposed**: "Matching runs in a background worker that has no network access, and the log filter sent to your RPC provider contains no key, address or view tag. The Scan page itself still asks your RPC for announcements and for the receipts of payments that match (see below)."

### P5b — L170 second RPC
- **Current**: "A second RPC adds comparison and availability while sharing queries with another operator."
- **Why**: a second RPC that cannot be read stops the scan (`apps/web/src/lib/scanClient.ts:331-340`; `docs/pages/README.md:48` says so).
- **Proposed**: "A second RPC adds a cross-check, shares your queries with another operator, and stops a scan when it cannot be read; it does not add availability."

### P2b — L63 own node
- **Current**: "(the app accepts `https://` or `wss://` addresses only, so a local node needs TLS in front)"
- **Proposed**: "(the app works with `https://` addresses only, so a local node needs TLS in front; the local-proxy scan path also needs an HTTPS loopback forwarder on the GitHub Pages build)". Evidence as P2.
- **Overlap**: #720 edits L30 of this file only.

### P7 — L62 and L144 funding hygiene (Pages)
- **Current**: "Use the relayer path or the payer's buffer" (L62); "Use the gas buffer the payer can add or a relayer instead" (L144-145).
- **Why**: the lean/Pages build refuses buffer-policy (v2) invoices (`CreateInvoice.tsx:52-53`; `Pay.tsx:155-156, 327`) and ships no relayer (relayer URL empty by default, `docs/pages/README.md:61-63`). Same advice in `docs/user/seller-privacy.md:67-69`; `review-and-pay-an-invoice.md:33` lists the gas buffer without "full build only".
- **Proposed** (append to L62 and L144, and to seller-privacy L69): "The GitHub Pages build has neither: it refuses gas-buffer invoices and has no relayer unless you configure one. There, sweep native-coin payments directly (the fee comes out of the amount); an ERC-20 payment needs gas sent to the one-time address, which links the sender." And in review-and-pay L33: "**Gas buffer** (ERC-20 invoices, full build only; the Pages build refuses these invoices)."
- **Overlap**: PRIMARY P-M1 adds a gas top-up linkage warning and rewrites `docs/user/sweep-and-gas-privacy.md`; use the same wording.

### Low
- L74-75 "**opt-in and off by default**: fixed, grid-aligned scan windows ..." — default `windowBlocks: 1000` (`scanPrivacy.ts:65`; scratch test). Proposed: "Fixed 1,000-block announcement windows are on by default; random delays, the optional indexer and the local-proxy / Tor Browser modes are opt-in."
- L31 Esplora "each output that matched you (it is asked whether it was spent)" — provider spent checks are consent-only since #656 (`docs/user/bitcoin-silent-payments.md:31`; `PRIVACY_THREAT_MODEL.md:95`). Proposed: "...and, only if you turn on the provider spent check, each output that matched you."

## 4. `docs/user/product-guide.md`

### P4 — L164-165 settings transfer (privacy)
- **Current**: "Settings transfer contains only delay range, idle-lock timeout, theme and fragment-clearing preference. Endpoints and pinned trust stay local."
- **Why wrong**: export sections include RPC endpoints, second RPC endpoints, relayer URL and pinned signers when ticked (`apps/web/src/lib/settingsExchange.ts:41-58`; `settings.exchange.section.*` in `locales/en.json`); preferences are preselected (`settingsExchange.ts:12`). `public-device-exchange.md:8` and `help.html` describe this correctly.
- **Proposed**: "Settings transfer exports the delay range, idle-lock timeout, theme and fragment-clearing preference by default. RPC endpoints, second RPC endpoints, the relayer URL and pinned signer keys are included only if you tick them; full URLs travel with any key in their path or query."

### R4 — L3 and L146
- L3 "This guide describes the product-completion branch built on PR #90 (`5628bc00...`)" while `docs/user/README.md:9` calls it the "Current product guide". Proposed: "This guide describes `main` (checked 2026-11-28)."
- L146 "The recovery-only idle fix for that signer follows the [idle-lock integration branch](.../pull/577)." — #577 closed unmerged 2026-11-26; the behaviour is on main (`2a70c041`; `App.test.tsx:150`). Proposed: "At idle the app keeps that generated signer in the tab, locked, so you can still back it up (see [session security](session-security.md))."
- L164 and L146 fixes also make product-guide consistent with R1.

## 5. Recovery guide discoverability (R3)

- `docs/user/recover-stealth-payment-keys.md` (Spec 18 export, the reference script and seller-keystore recovery without GhostPay) is linked from **no** user-facing index: not `docs/user/README.md`, `docs/INDEX.md`, `README.md`, `product-guide.md`, `help.html` or `privacy.html` (only `docs/specs/18-stealth-keypair-export.md` links it). `session-security.md`, `privacy-masking.md` and `payment-request-files.md` are also missing from `docs/user/README.md`; `docs/INDEX.md` additionally misses `reconciliation-and-receipts.md`, `public-device-exchange.md`, `merchant-profiles.md` and all three `docs/pages/*.md` (mechanical check).
- `recover-stealth-payment-keys.md:17`: "The individual export controls are under review for the Pages client. ... tracked in [PR #539]". #539 merged 2026-11-24; the controls are mounted in core (lean) views: `StealthExportPayment` and `StealthExportArchive` in `Scan.tsx:610, 672-674`, `StealthExportMaster` and `StealthExportRecovery` in `SellerKeys.tsx:665, 708` (since `3faa3762`). L84-85 ("Use these steps in a build that includes **Open a stealth key export**") is now always true.
- **Proposed**: L17 → "The export and recovery controls are part of both the full and the GitHub Pages builds. Device and external-wallet qualification remain open (see 'Option C')." Add rows to `docs/user/README.md` "Start here": "[Recover payment keys without GhostPay](recover-stealth-payment-keys.md) — open export files and keystores with the offline reference script", "[Session inactivity and retained keys](session-security.md)", "[Privacy mode](privacy-masking.md)", "[Payment request files](payment-request-files.md)". Add a "Recover without GhostPay" pointer in product-guide "Restore the correct file" (after L144).
- **Overlap**: #722 (`nodata/inspiring-shannon-2ehl3u`, behind 360) appends a "Not in this beta or v1.0" section after L34 of `docs/user/README.md`; different hunk.

## 6. `SECURITY.md`

### P6 — L45
- **Current**: "The deployment manifest is not yet authenticated."
- **Why wrong**: manifests are compiled into the bundle (`apps/web/src/lib/bundledManifests.ts`), accepted only with a valid signature from release keys compiled in at build (`manifest.ts:33-47`, `releaseKeys.ts`), and read back on-chain before Pay/Sweep/Scan (`manifest.ts:53-71`; `Pay.tsx:584`, `Sweep.tsx:254`, `Scan.tsx:267`). README L261 and `privacy-limits.md:141` already say so; SECURITY.md contradicts them.
- **Proposed**: "Deployment manifests are checked against release keys compiled into the bundle and read back on-chain; no manifest or release key ships, so payment stays disabled, and these checks cannot detect a replaced app."
- **Overlap**: PRIMARY P-M4 adds secondary-RPC read-back and owns `docs/DEPLOYMENT_MANIFEST.md`, `apps/web/deployments/README.md`; do not claim the secondary cross-check here until P-M4 lands. Rest of SECURITY.md checked accurate.

## 7. `README.md`

- **O2a Status (L13-73)**: present-tense statements about closed drafts: L15 "**#145 remains the most recent fully qualified staged candidate**. Neither draft is merged" (#145, #150 closed 2026-11-15); L19 "The owner-controlled, unmerged Pages baseline is **draft PR #137**" (closed 2026-11-18; its tooling is on main). #135/#138/#141/#142/#143/#144 are not in the open-PR list (2026-11-28). L11 calls the dated records "historical evidence", but the heading says "Status (read this first)" and CLAUDE.md sends agents there. Proposed: keep the "Honest answer" table (L86-93, verified accurate: seven testnets `chains.ts:41-54`), replace L15-73 with one current paragraph ("The static Pages build tooling and workflow are on `main`; nothing is published or released; ADR-0029 is Proposed; release still needs ...") and move the dated history to a `docs/handoffs/` record.
- **O2b Hosting contradictions**: L215 "A prototype static build of `apps/web` **is published** from an orphan `gh-pages` branch" vs L269 "There is no deployment target, domain, ... Tor mirror **or Pages setup**". `origin/gh-pages` exists (`cc8d0794`, 2026-10-21; whether it is still served was not checked); `.github/workflows/pages.yml` has a gated deploy job (L212, L254-268); `deploy/TOR.md` has an onion profile; ADR-0029 is "Proposed" (`docs/adr/ADR-0029-github-pages-static-beta.md:3`). Proposed L269: "No hosting is authorized. A Pages workflow exists but deploys only on a manual owner dispatch from `main` after ADR-0029 is accepted; there is no domain, `ghostpay.eth` record or IPFS pin, and the Tor profile in `deploy/TOR.md` is untested." Proposed L215: "An October 2026 prototype build exists on the orphan `gh-pages` branch; it predates the current Pages build and must not be used."
- **O2c L264**: "Fiat-priced invoices are disabled in practice: no oracle feed addresses are configured (ADR-0012)." — `packages/chain-adapters/src/quote.ts:52-90` configures four testnet Chainlink feeds; the lean/Pages build refuses fiat-priced invoices (`CreateInvoice.tsx:52-53`; STOP_WORK containment note). Proposed: "Fiat-priced invoices are refused by the Pages build; the full build has testnet-only reference feeds (ETH/USD, USDC/USD on Sepolia and Base Sepolia). F13 fiat conversion is archived."
- **Overlap**: #639 (`nodata/magical-volta-z6taog`, behind 371) edits README L135, L137, L151, L178 (web dependency list, bundle-scan path, REQUIRE_ANVIL note — all three verified stale on main and correctly fixed there). Not counted here. (Developer-only, not ranked: the CI job list at L159-167 omits `lean-candidate`, `ghostid-native` and `contracts-extra`, `ci.yml:345, 427, 556`.)

## 8. Threat models (P8, O9)

`docs/threat-model/PRIVACY_THREAT_MODEL.md` (linked from `privacy-limits.md:5` as the detailed analysis):
- **Overclaim**: L48 and L188 present `GHOSTPAY_CONNECT_ORIGINS` / `csp.mjs` as an available tight-CSP option ("Implemented"). `apps/web/scripts/csp.mjs` is imported only by `src/buildScripts.test.ts`; nothing in `vite.config.ts` or the Pages build uses it (`apps/web/DEVIATIONS.md:119-123`; audit 24 line 882). Matrix L54 lists "tight CSP option" as IT / wired Yes. Proposed: "a tight-CSP helper exists but is not wired into any build; `connect-src` is always `'self' https: wss:`".
- **Shipped mitigations still listed as missing** (understates protection; these docs drive release reviews):
  - Sweep balance read on open (L78, L130; matrix L25 "Auto-read on Sweep open: REC (R1)") → read only on **Read balance from the Settings RPC** (`sweep.balanceRead.note`; `Sweep.tsx:211`).
  - Destination reuse "not implemented" (L83, L200; matrix L28, L66) → tab-local check (P3).
  - RPC transport lacks `credentials`/`referrerPolicy` (L120; matrix L47 "REC (R3)") → set (`rpc.ts:108-112`).
  - "Decoy queries in the app: Not implemented" (L201; matrix L65) → opt-in "Blur which payments matched among other lookups" (`settings.scanLanes.matchCover`; `lib/matchCover.ts`, tests `matchCover.test.ts`, `scanDisclosure.cover.test.ts`). `privacy-limits.md:101-133` already documents it.
  - 1.1 (L17) says `net-transport` and `scan-source` are not imported by `apps/web`; `apps/web/src/lib/scanPrivacy.ts:28-29` imports both (matrix L60, L62 "Wired: No").
  - L148 / L229 name three direct `fetch` call sites; the invariant test allows two (`privacyInvariants.test.ts:149`).
  - L166 "tab-scoped wallet-attempt entries" contradicts L110 ("shared by every tab"; `duplicateAttemptJournal.ts:34, 77`).
- Section 9 rows 1, 3 and 7 are done; mark them so.

`docs/threat-model/THREAT_MODEL.md` (pre-dates S3-01 closure):
- L67, L126, L149, L245, L254, L355, L364: manifest "fetched from host, unauthenticated", "not hashed", "S3-01 High, In progress" → bundled, signed, read back (P6 evidence).
- L164 "S3-02 ... In progress: seller UI shows claimed amounts" → claims are labelled "Claimed, not confirmed" (`scan.match.claimedPrefix`, `scan.match.claimedRouter/claimedDirect`).
- L181, L344 D1 "destination-history warning In progress" → shipped (P3).
- L328 "FEEDS empty so unused today" → four testnet feeds (`quote.ts:52-90`).
- L372 "the Bitcoin tier (`packages/btc-silent-payments` is not integrated)" → full shell mounts `BtcView` (`App.tsx:3, 20`).
- Proposed: a dated status refresh of these rows rather than line edits; leave the STRIDE structure.
- `metadata-exposure-matrix.md`: same rows as above.
- **Overlap**: none near main. Old lineages (#372, #609, #587, #569, #300, #294, #355, #383, #249, #238) edit these files but are 1185-1350 commits behind.

## 9. Lower-impact documents

- **`docs/user/receive-and-scan.md:29`** "tags move between devices only in an encrypted tag archive you download and import under Seller keys" → add "(full build; the Pages build has no tag archive)". Evidence O2a.
- **`docs/user/public-device-exchange.md:8, 21`**: labels "Settings → Transfer nonsecret preferences" and "**Apply imported preferences**" do not exist; the UI says "Move settings to your other devices" (`settings.exchange.title`) and "Apply selected settings" (`settings.exchange.apply`). The rest of the table is accurate (also lists second-RPC endpoints as an optional section, `settings.exchange.section.rpcUrlsSecondary`).
- **`docs/INDEX.md`**: claims to be "A map of every documentation file" (L3) but misses the 10 files listed in §5. Package rows L131, L133, L135, L188-189, L206-207, L210-211 say address-safety, relayer-guard and tx-review are "not wired in / not integrated / not implemented"; their READMEs (`packages/address-safety/README.md:13`, `packages/tx-review/README.md:9`, `packages/relayer-guard/README.md:12`) and imports (`apps/web/src/lib/sweep.ts:20-22`, `txGuard.ts:13`, `apps/relayer/src/limiter.ts`) show they are wired. L12-14 dated "Current product completion (2026-11-09)" headers. Developer-facing, low.

## 10. For #766's owner: `apps/web/help.html`, `apps/web/privacy.html`

#766 (`codex/beta-control-tooltips`, behind 0) changes these files only by adding tooltip markup (`git diff origin/main origin/codex/beta-control-tooltips -- apps/web/privacy.html`: link/tooltip attributes; help.html: tooltip section and markup). The content issues below remain on its head.
- **H1 (recovery, high)** help.html L129: "Master stealth backup (one file for every stealth key) — Not available in the app — Everything — Planned library code only". It ships: `StealthExportMaster` ("Master stealth key backup (encrypted)" / "Download master backup") in `SellerKeys.tsx:665`, and "Open a stealth key export" (`StealthExportRecovery`, `SellerKeys.tsx:708`) in both builds. Proposed row: "Master stealth key backup (Seller keys) | Spending and viewing keys for every scheme-1 payment, encrypted | The invoice-signing key; tags, history, settings | Implemented both builds". Consider one sentence pointing to the offline reference recovery script (`docs/user/recover-stealth-payment-keys.md`).
- **H2** help.html L136 ("Idle lock ... clears keys from memory"), L359 glossary ("Clears keys from memory after a period without input"), privacy.html L47 ("Idle lock clears them from memory"): only keys with a confirmed recoverable copy are cleared; others stay in the tab, locked (R1 evidence). Proposed glossary: "Locks the session after a period without input (default 15 minutes). Keys with a confirmed copy are cleared from memory; keys without one stay in the tab, locked except for backup. Stored records are not erased."
- **H3** help.html L266 ("When set, the reads that verify a deployment are compared with the primary") and L294 ("The optional second provider is used for verification"): not true on main; read-back uses the primary only (`Pay.tsx:584`, `Sweep.tsx:254`, `Scan.tsx:267` pass one client to `verifyManifestForFlow`/`verifyManifestState`, `manifest.ts:53-71`). PRIMARY P-M4 (and #720) implement exactly this; if P-M4 merges first the text becomes accurate, otherwise remove it.
- **H4** privacy.html L164: "A second provider adds comparison and availability" → see P5b.
- **H5** help.html L290: "The published Pages copy is a reduced build." Wording invariant (no published/hosted claims). Proposed: "The GitHub Pages build is a reduced build."
- Rest of both pages: checked the claims listed in "Checked and found accurate" below.

## 11. Ownership and claim check

- Claim registry (`origin/automation/ghostpay-work-claims:claims.json`, updated 2026-11-28T02:11Z): no claim on any file in this report except PRIMARY P-M1 (`docs/user/sweep-and-gas-privacy.md`, excluded here) and P-M4 (`docs/DEPLOYMENT_MANIFEST.md`, `apps/web/deployments/README.md`, out of scope). S-COORD lists "user-documentation accuracy review" as read-only analysis with no paths.
- Open PRs near main touching in-scope docs: #762 and #764 (`docs/pages/README.md` L95/L126, `docs/user/session-security.md` L70-75), #720 (`docs/pages/README.md` L48, `docs/user/privacy-limits.md` L30), #722 (`docs/user/README.md` appended section), #639 (`README.md` L135/L137/L151/L178), #766 (`help.html`, `privacy.html` markup). #760 touches none of these files (checked).
- About 15 other open PRs (#372, #609, #587, #569, #300, #294, #355, #383, #249, #238, #160, #140, #222, #229, #230) touch these docs from lineages 1185-1391 commits behind main; they cannot merge without rework, so the overlap is nominal.
- `docs/ai/ACTIVE_WORK.md` top entries on main and on `primary/feature-tracker-20261128` claim none of these documents.

## 12. Suggested claimable changes (small, non-overlapping hunks)

1. **Recovery docs** (R1, R2, R3, R4, P4, O7): `docs/user/troubleshooting.md` (L25-L28), `docs/pages/README.md` (L33, L51 only), `docs/user/product-guide.md` (L3, L146, L164-165, a recovery pointer), `docs/user/recover-stealth-payment-keys.md` (L17), `docs/user/README.md` (Start-here rows; rebase over #722), `docs/INDEX.md` (user/pages rows). No session-security.md edit (owned by #762).
2. **Privacy claims** (P1, P2, P3, P5, P6, P7, P9, L74, L31): `docs/pages/README.md` (L35, L49-50; L48 together with #720), `docs/user/privacy-limits.md` (L10, L31, L48, L62-63, L74, L144, L170), `docs/user/seller-privacy.md` (L67-69), `docs/user/review-and-pay-an-invoice.md` (L33, L40), `SECURITY.md` (L45), plus `.claude/skills/ghostpay-security-invariants/REFERENCE.md` §1 (destination-reuse and manifest lines). Coordinate wording with P-M1 (funding) and P-M4 (manifest).
3. **Threat-model status refresh** (P8, O9): `docs/threat-model/{PRIVACY_THREAT_MODEL,THREAT_MODEL,metadata-exposure-matrix}.md`. Larger but low conflict risk.
4. **README status/hosting** (O2): `README.md` L13-73, L215, L264, L269; rebase over #639.

## 13. Checked and found accurate (at `b890a766`)

- `docs/user/set-up-stealth-meta-address.md`: 14-character minimum, six-word suggestion, scrypt + AES-256-GCM (`packages/ux-vault/src/keystore-portable.ts:49, 62, 298`); idle retention statements match R1 evidence; labels exist.
- `docs/user/session-security.md`: consistent with `AppShell.tsx:200-260`, `session.ts`, `keyVault.ts:385-400` (L70-75 being rewritten by #762).
- `docs/user/recover-stealth-payment-keys.md` Option B: flags and refusal codes match `scripts/recovery/stealth-export-recover.mjs:739-877`; `@noble/curves`/`@noble/hashes` 2.4.0 match the lockfile; file names match `downloadNames`/export code; both recovery test files pass (18 + 23). Only L17 is stale (R3).
- `docs/user/fees.md`, `docs/user/ethereum-payments.md` (chain table = `chains.ts:41-54`), `docs/user/stablecoin-payments.md` (token table = `tokens.ts:29-41`; feed note = `quote.ts:52-90`), `docs/user/testnet-usage.md`.
- `docs/user/reconciliation-and-receipts.md` (500 caps `reconciliation-portable.ts:271, 403`; labels exist).
- `docs/user/privacy-masking.md` (30 s reveal `privacyMode.tsx:8`; Alt+Shift+H `PrivacyControls.tsx:9`; labels exist).
- `docs/user/payment-request-files.md`, `docs/user/technology-attribution.md` (all seven versions match `package-lock.json`).
- `docs/user/seller-privacy.md` except L67-69 (budget default 20,000 `scanPrivacy.ts:70`; labels exist).
- `docs/user/receive-and-scan.md` except L29; `docs/user/review-and-pay-an-invoice.md` except L33, L40.
- `docs/user/bitcoin-silent-payments.md` spot-checked (500-block cap `features/btc/scan.ts:30`, 60 s seed visibility `SecretBackup.tsx:12`, consent-only spent checks). `solana-payments.md` and `tron-payments.md` read, not source-checked (full build only, outside the Pages beta).
- `docs/pages/README.md` other sections: lean route list (`AppShell.tsx:70`), 60-90 s auto-rescan (`Scan.tsx:79-80`), build-check table, offline/draft section (`invoiceDraft.ts`), verification commands and referenced scripts exist.
- `SECURITY.md` except L45 (referenced files exist; workflows default to `contents: read` or `{}` with per-job grants).
- README "Honest answer" table (L86-93), fee summary, security-limitations summary except L264.
- Forbidden wording: no affirmative "anonymous", "unlinkable", "audited", "mainnet-ready" or "verified seller" in scope docs; "anonymity set" is used as REFERENCE §1 allows. Only H5 ("published Pages copy").
- Locales: es/ja/ar are marked "machine-drafted: needs native review" (`locales/*.json` `_meta`); `product-guide.md:190` is consistent; no in-scope doc claims reviewed translations.
- Links: no broken relative links in any in-scope file.

## 14. Not checked

- `docs/user/merchant-profiles.md` (full-build merchant profile; possibly F08-adjacent, out of scope as stopped-product documentation).
- `docs/user/sweep-and-gas-privacy.md` (PRIMARY), `docs/DEPLOYMENT_MANIFEST.md`, `apps/web/deployments/README.md` (PRIMARY), historical audit/handoff records.
- Whether `https://djshellshoxxx.github.io/GhostPay/` still serves the October prototype (not fetchable from this sandbox).
