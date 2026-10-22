# 10 Client-side-only hosting constraints (cross-cutting, the 10 shortlisted ideas)

Status: proposed | Applies to: A3, A1, B7, A2, B1, A6, D2, B6, A5, E1 (specs 01-09) | Effort: S (about 3 d: CI checks and docs) | Owner: WEB, DOC, OWN | Branch `claude/remote-extensions-3`, 2026-10-21
Sources: SPEC_REVIEW A11; `apps/web/public/_headers`; `docs/operators/mirror-hosting.md`; ADR-0015; DEVELOPER_SPECIFICATION hosting diagram (GitHub Pages, IPFS, onion mirrors); `apps/web/scripts/scan-bundle.mjs`.
Facts about third-party platform limits that this repo does not contain are marked UNVERIFIED and must be re-checked against the platform docs before relying on them.

## 1. The rule

Every shortlisted idea must work when the only thing the project operates is a **static file host** that serves the released `dist/` byte for byte. Anything that needs an operator-run process (API, directory, indexer, sync, webhook, push, analytics, build-on-demand, edge function) is either redesigned to run in the browser / on the user's own device, or **rejected**. A user-chosen third party (their own RPC, their own wallet, a relayer they pick) is not "operator-run by the project", but each such dependency is named, optional where possible, and listed in the privacy-limits table.

## 2. Static-host capability matrix

| Capability | Cloudflare Pages / Netlify (primary) | GitHub Pages (degraded mirror) | IPFS gateway / local node | Onion mirror (static) |
|---|---|---|---|---|
| Response headers (`_headers`: CSP, Referrer-Policy, XFO, Permissions-Policy, COOP) | Yes | **No** (SPEC_REVIEW A11) | **No** (gateway sets its own; `_headers` ignored) | Depends on the server; usually yes |
| Meta CSP | Works | Works (only protection) | Works | Works |
| `frame-ancestors`, `X-Frame-Options` | Header | Not enforceable (ignored in meta) | Not enforceable | Header if server allows |
| Meta `Referrer-Policy` | Redundant | Works (only way) | Works | Works |
| `Permissions-Policy` | Header | Cannot set (meta not supported; UNVERIFIED for iframes `allow` only) | Cannot set | Header |
| `Cache-Control` per path | Yes | No (platform default; UNVERIFIED value) | Immutable by CID | Server |
| Path prefix | Root | `/<repo>/` project path (relative base required) | `/ipfs/<cid>/` on path gateways, root on subdomain gateways | Root |
| Origin shared with other sites | No | `<user>.github.io` is shared by all of that user's project pages (storage is per origin, not per path) | **Path gateways share one origin across all CIDs**; subdomain gateways give one origin per CID | Per onion host |
| Storage persistence across releases | Same origin, persists | Same origin, persists | **New CID = new origin on subdomain gateways** -> IndexedDB/localStorage start empty | Persists |
| Server rewrites (SPA fallback) | Optional `_redirects` | None (404 for deep links; UNVERIFIED a 404.html trick is not relied on) | None | Server |
| Size and file limits | Per-file and file-count limits exist (UNVERIFIED numbers) | Site size and bandwidth soft limits exist (UNVERIFIED numbers) | Gateway-dependent | Server |
Design consequences, applied to all ten ideas:
1. **Meta-tag floor.** `index.html` carries the full CSP and `referrer` as meta tags (without `frame-ancestors`), so header-less hosts keep script/connect restrictions. A CI test asserts the meta CSP is a superset-compatible copy of `_headers` minus the header-only directives.
2. **Hash routing and relative base only.** No feature may depend on server rewrites or an absolute `/` base. Invoice data stays in the URL fragment (never sent to a host).
3. **Storage is per origin and fragile.** Anything the user must not lose (keys, tags, cursors) is covered by the encrypted backup (idea B1 / spec 04) and a visible "your data lives only in this browser origin" notice, especially on IPFS where updates change origins.
4. **No runtime config fetch.** Manifests, relayer list, token allowlist, fixtures and strings are bundled (hashed). Today `deployments/<chainId>.json` is fetched same-origin at runtime with `no-store`; per mirror-hosting.md it moves into the bundle. No feature may add a new same-origin mutable JSON.
5. **No third-party fetch by default.** The only cross-origin requests are to endpoints the user typed or imported (RPC, optionally relayers). `connect-src 'self' https: wss:` stays broad because of that (S3-11); each idea adds a Playwright egress assertion that lists exactly which hosts it contacts.
6. **Verification outside the page.** `SHA256SUMS` / signed release (ADR-0015, spec for E2) is the only integrity anchor. The in-page release widget is self-attested (S3-04) and no idea relies on it.
7. **Service workers are not used** in v1 of these ideas (a mutable cache layer on a host that cannot set headers is an additional integrity risk). PWA is a separate, later decision (idea B4).

## 3. Per idea: what runs where, static needs, residual server dependency, elimination

Notation: Browser = main thread or Web Worker; "User RPC" = JSON-RPC endpoint the user configured; nothing here is operated by the project.

### A3 Sweep destination hygiene (spec 01)
- Runs in: Browser. Heuristics (reuse, same amount, near-time, already-linked) over the local encrypted tag vault; fresh-destination suggestions from a second derivation path in `core-crypto`.
- Static host needs: nothing beyond the bundle. No headers required.
- Residual server dependency: destination history (nonce, balance, prior transfers) needs chain reads. These go to the User RPC, which learns the destination under review.
- Elimination: no block-explorer API, no address-labeling service, no "known exchange" database fetched at runtime. Any label list is a pinned static JSON in the bundle with a date and source, shown as "as of <date>". Offline mode: heuristics over the local vault still work with no RPC; the RPC read is a button, not automatic.
- Verification: unit tests with injected RPC; Playwright egress shows only the user's RPC host.

### A1 Link hygiene: paste-import and passphrase links (spec 01)
- Runs in: Browser only. scrypt (same family as `keystore.ts`) + AES-GCM in a Worker; parse/format in `invoice-schema`.
- Static needs: the fragment never reaches the host, on any host. Meta `referrer=no-referrer` matters for outbound navigation. `history.replaceState` clears the fragment after read (works everywhere).
- Residual: none server-side. Browser history already containing the link cannot be fixed by any host. The passphrase travels over a channel the user chooses.
- Elimination: no short-link service, no "invoice by id" store (rejected: any server holding links sees them). Link size is bounded by URL limits, documented.
- Header-less hosts: unchanged behaviour, except the host (e.g. IPFS gateway) sees the request path and IP; the fragment is still local.

### A4 Randomized sweep timing (spec 01, bundled with A3/A1)
- Runs in: Browser foreground scheduler; tab must stay open.
- Residual: none. Elimination of the only server-ish variant: a relayer holding pre-signed sweeps until a random time is **rejected** (relayer would see and hold the order; also deadline cap). Background delivery by push/cron is rejected.

### B7 Claim-by-hash and spam filter (spec 02)
- Runs in: Browser. `eth_getTransactionByHash` / `eth_getTransactionReceipt` / `balanceOf` via the User RPC; verification and filtering in `scannerCore` (Worker).
- Static needs: bundle only. Token allowlist and dust thresholds are static JSON in the bundle.
- Residual: the User RPC learns the tx hash being claimed. A hosted "payment proof" or "is this scam token" API is not used.
- Elimination: no external token-list fetch at runtime (for example no remote curated lists); a dated snapshot ships in the bundle; users can add tokens locally. Receipt lookups require the user's RPC and say so. The payer hands the hash over any channel (paste); no inbox service.

### A2 Per-client meta-addresses (spec 03)
- Runs in: Browser; derivation in `core-crypto`; scan cost grows linearly in children, scanning in the existing Worker.
- Static needs: bundle only. Test-vector file ships with the repo.
- Residual: none. Optional ERC-6538 publication touches a user's wallet/RPC for the root child only.
- Elimination: no hosted "address book", no server-side child index. Child index lives in the encrypted vault and in the B1 backup. Scan budget enforced client-side (cap and warning).

### B1 Encrypted backup, restore drill, scan-state restore (spec 04)
- Runs in: Browser. Archive built in memory (scrypt + AES-GCM, versioned AAD), saved with a Blob download link and restored through `<input type="file">`; restore drill decrypts and compares in memory.
- Static needs: `blob:` download navigation must work under the CSP (verify in Playwright on Cloudflare-style headers and meta-only); no `connect-src` needed.
- Residual: none. The user decides where the file lives.
- Elimination: no cloud sync, no "backup to our servers", no account, no email delivery (rejected). Optional File System Access API save-to-folder is progressive enhancement, not required. Because IPFS/subdomain gateways change origin on every release, **B1 is the migration path across origins**; the notice in section 2 point 3 is mandatory there.
- Scan cursors restored from backup reduce RPC range queries; a restored cursor is validated against chain head via the User RPC.

### A6 Tor/proxy-aware RPC, fixed-window queries (spec 05)
- Runs in: Browser (`chain-adapters/rpc.ts`, `logs.ts`): fixed block windows, padding, "no direct fallback".
- Static needs: `connect-src` must allow the chosen endpoint; current `https: wss:` does. Browsers cannot speak SOCKS, so real IP protection needs Tor Browser, an OS/VPN-level proxy, or an onion-reachable HTTP(S) RPC; plain-HTTP `.onion` conflicts with the current https-only URL check and with mixed-content rules from an https-served page (treatment of `.onion` as secure: UNVERIFIED), so the supported path is: serve the app itself from the onion mirror or run it locally, and use onion RPC from there.
- Residual: none operated by the project. The user supplies the RPC; the static host still sees the user's IP at app load (unless the app is loaded via Tor).
- Elimination: no project-run RPC gateway, proxy, or "privacy RPC" (rejected: it would see every query, defeating the point). Documentation points to self-hosted nodes (`docs/operators/local-scanner-and-rpc.md`).
- Header-less hosts: meta CSP still limits scripts; `Permissions-Policy` missing is irrelevant here.

### D2 Watch-only mode and air-gapped signer (spec 06)
- Runs in: two Browser contexts: online watch-only page (view key only) and an offline signer page (spend key, EIP-712 builders, stealth tweak). Transfer by QR/animated QR, file, or paste.
- Static needs: the **signer must be runnable with no network**: ship it as a separate build target (`signer/`) that works from a local static server or from `file://` (needs a classic/IIFE bundle because Chromium blocks module scripts from `file://`; UNVERIFIED across browsers). It is distributed in the same hashed release so users verify it against `SHA256SUMS` on another machine. Camera scanning: `_headers` currently sets `camera=()` globally, which would block QR scanning; the signer/scan route must be served with `camera=(self)` on header-capable hosts, and on header-less hosts QR import falls back to image upload / paste (file route needs no permission).
- Residual: none. No pairing server, no relay of QR payloads.
- Elimination: no cloud "signing queue", no push to a phone app (rejected). Hardware wallet bridges that need a vendor service are out of scope (D3 notes HW cannot apply the stealth tweak).
- Origin hazard: on shared origins (path gateways, `github.io`) another site's script could read storage; the signer keeps keys out of storage entirely (memory only) and warns when `location.origin` is a shared-gateway origin.

### B6 Selective-disclosure receipts and auditor pack (spec 07)
- Runs in: Browser. Seller produces a receipt file (invoice hash, tx hash, seller signature, stealth-key message signature) locally; the verifier is a static page/tab that checks signatures offline and optionally fetches the tx via the verifier's own RPC.
- Static needs: bundle only; receipts are files, never URLs on a server. If shared as a link, data stays in the fragment.
- Residual: chain read for tx confirmation goes to the verifier's RPC (discloses the tx hash to that provider).
- Elimination: no hosted receipt store or "verify by id" endpoint (rejected: it would be a registry of who received what). No view-key export (explicitly not offered). The offline verification path needs no network at all and states what it can and cannot prove.

### A5 Multi-relayer selection and self-submit (spec 08)
- Runs in: Browser: signed/pinned static list verified locally (EIP-191 over canonical JSON), selection with CSPRNG, probe of the single chosen relayer, self-submit calldata/order-file builder, wallet or CLI broadcast.
- Static needs: list ships as a hashed bundle file; imported lists come from paste or file, never from a runtime URL. `connect-src` already allows the user's chosen relayer origin.
- Residual: **the relayer itself** (a third-party operator the user picks) when relayed mode is used; it is optional.
- Elimination: no relayer directory/health service/registry contract (rejected). Self-submit and direct sweep remove the relayer entirely. Liveness learned only by probing the chosen relayer.

### E1 "What is public" explainer and sandbox (spec 09)
- Runs in: Browser only, offline-capable: real crypto, in-memory chain simulator, bundled fixtures.
- Static needs: lazy chunk from the same origin; nothing else.
- Residual: none (no RPC, no testnet, no faucet).
- Elimination: the original testnet/faucet design (Sepolia, third-party faucet links) is replaced by the simulator. Anvil is a dev-time fixture generator only.

## 4. Cross-cutting residual dependencies (all ten)
| Dependency | Who operates it | Required? | Disclosure |
|---|---|---|---|
| Static host / CDN | Project or mirror operator | Yes (to get the app) | Sees IP, UA, files, timing; never the fragment (privacy-limits.md) |
| User's RPC | User or third party | For chain reads/broadcast (A3, B7, A6, B6 verify, A5 self-submit, sweeps) | Learns IP and queried addresses/hashes |
| Relayer | Third party chosen by user | Optional (A5) | Sees the full sweep |
| Wallet | User | Payer path, self-submit | Sees the transaction request |
| Release signing key | Project owner (offline) | For verification (ADR-0015) | Key compromise = trust loss; not a runtime service |
Nothing in this table is a project-operated runtime service.

## 5. Rejected because they would need an operator-run service
Relayer directory or registry; hosted scanner/indexer/webhooks; backup sync; short links or invoice storage; receipt registry or verify-by-id; hosted privacy RPC/proxy; push notifications; analytics or error telemetry; remote token/scam lists and address-label APIs fetched at runtime; testnet faucet; signing-queue or pairing server for D2. Each remains rejected unless a future ADR explicitly accepts the operator burden and the legal and privacy consequences (ADR-0006).

## 6. Enforcement (build and CI)
1. `scan-bundle.mjs` ALLOWED_URLS stays minimal; add a rule: new network call sites require an entry in `docs/specs/ideas/egress-allowlist.json` (hostnames are runtime user data, so the allowlist records *categories*: `user-rpc`, `user-relayer`, `same-origin`).
2. Playwright egress suite parametrised per idea (the "contacts exactly" lists in section 3) run twice: with `_headers` applied (Cloudflare-like static server) and with headers stripped (GitHub-Pages-like static server serving under `/ghostpay/`), the second also on a path prefix.
3. Header test: `curl`-style check that `_headers` and meta CSP agree on `script-src`, `connect-src`, `object-src`, `base-uri`, `form-action`, `worker-src`.
4. Offline test: every feature marked "Browser only" has a test that runs with network disabled.
5. Origin-change test: simulate a new origin; confirm the backup-restore path (spec 04) restores keys, tags and cursors.
6. Lint rule: no `fetch`/`XMLHttpRequest`/`WebSocket` outside `lib/rpc*`, `lib/relayerClient.ts`, `lib/manifest.ts` (to be removed once manifests are bundled), `lib/release.ts`.
7. Docs: `docs/operators/mirror-hosting.md` gets a per-host feature table (which ideas are degraded where: embed iframe, camera permission, caching).

## 7. Failure modes
Header-less host: features keep working with the meta CSP, but clickjacking and `Permissions-Policy` protections are absent; D2 camera and embed iframe degrade as above. IPFS release update: origin change loses local data unless restored from backup. Shared-origin host: another script on the same origin can read storage; keys must not be persisted unencrypted (already the case) and the app warns. A platform changes limits: re-verify UNVERIFIED rows before each mirror release.

## 8. Test plan and acceptance criteria
Test plan = section 6. Acceptance:
- [ ] Each of the ten specs links to this document and its "residual dependency" paragraph matches section 3.
- [ ] CI runs the egress suite in both header modes and under a path prefix.
- [ ] Meta CSP present and verified against `_headers`.
- [ ] Offline tests exist for A1, A2, E1, B6 (verify), D2 signer.
- [ ] No new runtime-fetched same-origin JSON introduced by any idea.
- [ ] mirror-hosting.md updated with the degraded-feature table; every UNVERIFIED platform fact either verified (source and date) or left marked.

## 9. Audit checklist
1. Search diff for `fetch(`, `new WebSocket`, `sendBeacon`, `EventSource`, `importScripts`; each hit maps to a category in section 6.1.
2. Confirm no feature stores secrets in localStorage/IndexedDB unencrypted, given shared-origin hosts.
3. Confirm fragment-only data never copied into query strings, `document.referrer`-visible URLs or logs.
4. Confirm no service worker registered.
5. Confirm release artifacts for A5 list and D2 signer are inside `SHA256SUMS`.
6. Confirm mirror-hosting.md and privacy-limits.md describe degraded modes honestly.
7. Confirm every rejected item in section 5 has no hidden remnant (config flags, URLs, docs promising it).
