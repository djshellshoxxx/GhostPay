# Team E: browser, static hosting, privacy, network metadata, storage, supply chain, deployment integrity

Target: candidate `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (PR #203 head). Reviewed read-only in `/home/user/wt/cand`;
builds and test runs used Team E's own worktree `$SP/out/E/wt` at the same SHA (`npm ci --ignore-scripts` exit 0,
`npm run build:libs` exit 0). Date 2026-11-18.

**This is an AI-assisted review, not an independent audit.** Tags: VERIFIED = code read or command run at `7a620ff1`;
INFERRED = reasoned from verified evidence; UNVERIFIED = claim only, or needs repository settings, a live site, or another browser.
`SP=/tmp/claude-0/-home-user-GhostPay/1a417f89-b8af-5af7-9d18-ac9fe0e45379/scratchpad`. Logs are in `$SP/out/E/logs/`.

## 0. Bottom line

- The default lean bundle makes no third-party request and has no telemetry, no service worker, no cookies and no built-in RPC.
  Every network destination is one the user configured and then triggered (VERIFIED: bundle scan, source tests, and a
  Chromium walk through all 9 lean views and all 12 full views of the built artifacts).
- Key material never touches storage in plaintext (VERIFIED: e2e `app.spec.ts:168` plus Team E's own storage dump).
  Several public but linkable identifiers are stored in plaintext.
- The main risks are in hosting and deployment, not app code: the shared `github.io` origin (E-01), a likely stale
  prototype on the `gh-pages` branch (E-02), an origin gate that trusts what it is told (E-03), and a deploy trust
  boundary that rests on unverified repository settings with an unsigned Pages artifact (E-04).
- One privacy feature does not work at all: the spec-10 "local proxy" scan path is blocked by the app's own CSP
  (E-05, confirmed in Chromium). It fails closed, so nothing leaks.
- Supply chain is in good shape. Production dependencies have 0 npm advisories. The lockfile is 100 % sha512 from
  registry.npmjs.org. All 111 actions are SHA-pinned. The release tarball and SBOM are byte-reproducible across two
  clean clones. Dev tooling has 14 high advisories (picomatch ReDoS, no upstream fix yet).

## 1. Findings

Severity: Critical/High/Medium/Low/Info. Status: CONFIRMED | SUSPECTED | INTENDED | MISSING-COVERAGE | UNVERIFIED.
Machine-readable copy: `$SP/out/E/findings.json`.

| ID | Area | Sev | Status | Title / evidence (short) | Affected | Remediation | Verification |
|---|---|---|---|---|---|---|---|
| E-01 | hosting / origin | High (payments on) / Medium (demo) | CONFIRMED (design, owner action open) | **GP-PAGES-01 shared origin.** `https://djshellshoxxx.github.io` is also served to 35 other Pages sites of the account. GitHub search API, 2026-11-18: 36 repos with `has_pages=true`, including GhostPay; no `djshellshoxxx.github.io` root repo. Any of them is same-origin. It can read or rewrite `localStorage` and IndexedDB: RPC URLs (may carry API keys), `pinnedSigners` (makes the invoice review say "pinned by you", `en.json:2037`), the encrypted vault (offline scrypt attack; plaintext `meta.metaAddress`/`signer`, `keystore-portable.ts:9-18`), and checkpoints. It can delete the vault (key loss without a file backup). It can iframe or open `/GhostPay/` and script it, reading keys loaded in memory. CSP `'self'` admits sibling paths. A future root user site could register a `/`-scoped service worker over `/GhostPay/` (INFERRED). Mitigations VERIFIED: `build-pages.sh:93-101` refuses manifests on a shared origin unless `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet`; the banner warns (built `index.html`). | All lean features on Pages; seller keys reused later on mainnet (keystore is chain-agnostic) | Repo-level custom domain (CNAME on the GhostPay repo itself, not the user site) or a dedicated account/org. Until then, payments only on a dedicated origin, plus a written owner acceptance. Tell users that keys loaded on a shared origin are testnet-only forever. | Live check: page origin equals the dedicated origin (E-03); a sibling-origin read probe fails |
| E-02 | deployment | Medium | SUSPECTED (live state UNVERIFIED) | **Stale prototype probably published from `gh-pages`.** `origin/gh-pages` = `cc8d0794` (2026-10-21, "Publish GhostPay build…"). Repo `has_pages=true` (search API). `docs/pages/README.md:173` says the Source must still be switched to GitHub Actions, which implies the branch source is active today. That bundle loads `./deployments/<id>.json` at runtime **without signature verification** (function `Xg` in `assets/index-Bmfq019n.js`). It has no mirror banner and no shared-origin warning, and predates the GP-PAGES-02/04 and R-01 fixes. It runs outside every `pages.yml` gate and before ADR-0029 is accepted. | Anyone visiting `/GhostPay/` today | Owner: Settings > Pages > Source = GitHub Actions, or unpublish. Delete or archive `gh-pages`. Then run `scripts/pages/smoke.mjs <live url> --commit <sha>` | Live smoke shows `build-info.json` for the dispatched commit and the mirror banner |
| E-03 | deployment / origin gate | Medium | CONFIRMED | **The origin gate trusts a declared variable.** `shared` comes only from the `*.github.io` host suffix of `GHOSTPAY_PAGES_ORIGIN` (`build-pages.sh:60-69`). Nothing checks that the deployed `page_url` has that origin (`pages.yml:213-261`; `smoke.mjs` has no origin assertion). A user-site custom domain (`example.com/GhostPay/`, shared with every project site) passes as "dedicated". So does a declared domain whose CNAME was never set. | Pages testnet beta | In the deploy/smoke jobs, assert `new URL(page_url).origin === vars.GHOSTPAY_PAGES_ORIGIN`, and that the Pages config has a repo-level `cname` and `https_enforced`. Fail otherwise. Treat any account-wide domain as shared. | Workflow test with a mismatched origin goes red |
| E-04 | deployment integrity / CI | High (if unprotected) | UNVERIFIED (repo settings) | **The deploy trust boundary is not shown to be in place.** In-tree note: "main has NO branch protection or rulesets (checked 2026-11-04 …)" (`.github/workflows/ghostpay-codex-cloud.yml:57`). Pages publishes whatever `main` holds, gated only by `workflow_dispatch` on main, `deploy=true` and `github-pages` environment rules (`pages.yml:59-69,213-233`, not readable here). The Pages artifact is not attested or signed and is not bound to the release trust root: `release.yml:39-66,194-197` verifies signed tags and attests, `pages.yml` does neither. `allowed_signers` has no key (release fails closed). The agent workflow holds `contents: write` + PAT and may merge `apps/*`/`packages/*` after human approval (`ghostpay-codex-cloud.yml:21-28,35-52`). | Code served to every Pages user | Rulesets on `main` (required review + status checks, no force-push); `github-pages` env: main only + required reviewers; `actions/attest-build-provenance` on the Pages `SHA256SUMS`; publish signed SHA256SUMS out of band; optionally require dispatch from a signed tag checked by `verify-tag.sh` | Owner screenshots/API output of rulesets and env; `gh attestation verify` on served files |
| E-05 | scan privacy (spec 10) | Medium | CONFIRMED | **The "local proxy" scan transport cannot work.** Settings accepts `http://127.0.0.1\|localhost\|[::1]` endpoints and indexers (`scanPrivacy.ts:72-98`, `en.json:309`). Spec 10 §1 and `docs/pages/README.md:49` promise this. The CSP `connect-src 'self' https: wss:` (`index.html:13`, `public/_headers:5`, `deploy/nginx/security-headers.conf:3`) blocks plain-http loopback. Chromium probe on the built Pages artifact: `connect-src http://127.0.0.1:47126/` violation, 0 requests reached the proxy (`logs/csp_loopback_probe.json`). The scan is blocked, with no fallback (no leak). There is no e2e test under a real CSP. | Private scanning for non-Tor-Browser users; the "Paranoid" preset with local proxy | Add `http://127.0.0.1:* http://localhost:* http://[::1]:*` to `connect-src` (meta, `_headers`, nginx), or accept only https loopback and document mkcert. Add a Playwright test with a loopback forwarder under the meta CSP. Fix the docs. | e2e: scan through a local forwarder succeeds, and nothing is contacted directly |
| E-06 | RPC config | Low | CONFIRMED | **`wss://` is accepted but never usable.** `validateRpcUrl` accepts wss (`rpc.ts:87`); the Settings hint says "https:// and wss://" (`en.json:11`, `docs/pages/README.md:48`). Both transports refuse non-http(s) (`rpc.ts:97`, `net-transport/src/fetchTransport.ts:39`), so every call fails closed. CSP `wss:` widens `connect-src` for nothing. | Settings RPC | Reject wss in `checkRpcUrl` or implement a WS transport; drop `wss:` from CSP if unused | Unit test plus copy update |
| E-07 | RPC transport hygiene | Low | CONFIRMED | **The default RPC transport lacks request hardening.** `chain-adapters` `fetchTransport` sends POST with `redirect:'error'` only (`rpc.ts:103-109`). It omits `credentials:'omit'`, `cache:'no-store'` and `referrerPolicy:'no-referrer'`, which net-transport (`fetchTransport.ts:52-55`), the relayer client, indexer and merchant-profile fetches set. Today the document `no-referrer` meta and cross-origin credential defaults mask this (no leak seen). `privacyInvariants.test.ts` checks only `apps/web/src`, not packages. | All Settings-RPC traffic (pay, scan, sweep, registry) | Set the three options. Extend the invariants test to `packages/chain-adapters` and `net-transport`. | Unit assertion on fetch init |
| E-08 | URL / history | Low | INTENDED (documented residual; VERIFIED) | **The invoice fragment outlives address-bar clearing.** In a persistent Chromium profile, after `#gpi=…` was auto-cleared (`fragment.ts:20-26`, `AppShell.tsx:97-115`; `location.href` clean), the full URL with fragment remained in `History.urls`, `Sessions/*`, `Top Sites` and `segmentation_platform/ukm_db` (Team E walk). This is documented (S3-03; `en.json:766,908`; `privacy.html:40`; `README.md:256`). Not documented: browser history **sync** to the vendor's cloud. | Payers who click invoice links | Mention sync/cloud history. Prefer paste or passphrase links for shared or printed contexts (already offered). | Copy review |
| E-09 | storage linkability | Low | CONFIRMED | **Plaintext linkable identifiers.** Checkpoint keys `ghostpay.scan.checkpoint.v2.<chain>.<sha256(spend\|view pub)>` plus block heights (`scanClient.ts:661-700`, `ux-vault/src/seller-scope.ts:8-10`); the reconciliation envelope `sellerKeyId`/`chainId` (`reconciliation-portable.ts:407-430`); the vault `meta.metaAddress`/`signer`; tag `chainId`/`createdAt`/`updatedAt` (`tags.ts:8-20`); sessionStorage journals with one-time owner addresses and tx hashes (`sweepAttemptJournal.ts:5-14`, `duplicateAttemptJournal.ts:4-23`). Anyone holding the meta-address plus profile or origin access can confirm the seller and their scan progress. Documented (`en.json:273`, `docs/user/privacy-limits.md:40`). | Device users; sibling Pages sites (E-01) | Pseudonymize slot names with a key derived from the viewing key; keep only what the unlock UX needs in plaintext | Storage-dump test asserts no meta-derived identifiers |
| E-10 | storage retention | Low | CONFIRMED | **No in-app "erase all GhostPay data".** Users are told to clear site data (`en.json:273`). On `github.io` that wipes all 36 sites' data, and the user cannot scope it. Legacy plaintext ledger is read-only and deletable (`reconciliationLedger.ts:51-63`). | All profiles | Confirmed wipe of `ghostpay.*` local/session keys and the 3 IndexedDB DBs, with a backup warning | e2e: storage empty after wipe |
| E-11 | framing / COOP | Low | CONFIRMED (documented limitation) | **No clickjacking/COOP protection on Pages and no JS fallback.** A meta CSP cannot carry `frame-ancestors`. There is no `window.top !== window.self` guard in lean (only `embedHost.ts:144` checks parent), so any site can frame the app, and an opener can navigate the tab. Partitioned storage limits cross-site impact. The ADR-0029 mitigation "no one-click fund movement" holds. | Pages lean | Lean-only frame guard (refuse to render when framed); drop `window.opener` at startup | e2e: framed load shows "open in its own tab" |
| E-12 | UX safety | Info | CONFIRMED | **A banner link can cost unsaved keys.** The Pages banner link (`build-pages.sh:148`) opens in the same tab. There is no `beforeunload` guard anywhere (grep). Clicking it with unsaved keys loses them. | Pages lean | `target=_blank rel="noopener noreferrer"`, or a `beforeunload` prompt while the backup is unverified | e2e |
| E-13 | build guards | Low | CONFIRMED | **Guard gaps.** `scan-bundle.mjs` inline-script, CSP and referrer checks cover `index.html` only (`scan-bundle.mjs:153-183`). `help.html`/`privacy.html` go unchecked in full/self-host builds (Pages re-checks every HTML file, `verify-pages-site.mjs:238-241`; both pages ship `script-src 'none'`). The two exclusion lists diverge: `localBuildProfile.mjs:122` vs `verify-pages-site.mjs:51` (`chain-evm-extra` missing from the verifier). The R-01 end-tag fix is VERIFIED (`scanBundle.test.ts:131` passes). | Full/self-host release tarball | Scan every `*.html`; one shared exclusion list | Unit tests |
| E-14 | supply chain | Low | CONFIRMED | **Dev-tree advisories.** `npm audit` (all): 30 (14 high, 16 low, 0 critical). High: picomatch ≤4.0.7 ReDoS GHSA-fc5q-39xc-vjpf via vite 8.3.5, vitest 5.0.5, coverage-v8, typescript-eslint, tinyglobby, fdir, hardhat; no fixed release exists (latest 4.0.7). Low: elliptic GHSA-848j-6mx2-7j84, cookie <0.7, @sentry/node (hardhat tree). `--omit=dev`: **0**. CI gates prod only (`ci.yml:114`, `release.yml:93`). | Build/CI hosts only | Track; add an `overrides` pin when picomatch ships a fix; non-blocking full-tree audit report | `npm audit` |
| E-15 | self-host supply chain | Low | CONFIRMED | **Self-host images and HSTS.** Images are pinned by tag only: `docker-compose.yml:53` (`nginx-unprivileged:1.27-alpine`), `deploy/tor/Dockerfile:2`, `infra/web/Dockerfile:9`. Dependabot has no docker ecosystem. nginx sends no HSTS (relies on an external TLS terminator). The relayer image is digest-pinned. | Full profile / self-host / onion | Digest pins, dependabot `docker` entries, HSTS at the terminator | Config review |
| E-16 | docs accuracy | Low | CONFIRMED | **Stale privacy threat model.** `PRIVACY_THREAT_MODEL.md:16` says `net-transport` and `scan-source` are "not imported by apps/web". They are: `apps/web/package.json`, `scanPrivacy.ts:27-28`, and the lean bundle contains net-transport (2 kB) and scan-source (8 kB). This understates shipped behaviour and hides E-05. | Docs | Refresh §1.1/§5 | Doc review |
| E-17 | privacy claims | Low | CONFIRMED | **Overclaims and imprecise copy.** See §8. Top items: `en.json:1100` "It hides which seller owns the one-time address" (unqualified); `docs/developer/api/policy-scheme.md:233` "stay unlinkable"; `docs/pages/README.md:48-49` (wss, local proxy). | UI/docs | Qualify per §8 | Copy review |
| E-18 | Tor Browser | Info | VERIFIED (static) / INFERRED (runtime) / UNVERIFIED (real TB) | **Tor Browser compatibility.** The bundles have no WASM, WebGL, SharedArrayBuffer or service worker (token counts 0). They need JS, module workers, Web Crypto and IndexedDB. TB "Safest" disables JS: only the noscript and help/privacy pages work. JIT-less cost: scrypt N=2^17 took 28.3 s vs 0.51 s with JIT (`node --jitless` bench); ECDH ≈4 ms either way. Camera QR uses canvas `getImageData` (`qr-exchange/src/readers.ts`), which TB canvas protection likely blocks (paste fallback exists). TB always runs private browsing, so the vault and checkpoints do not survive a restart (INFERRED). Onion-served app: onion (http) RPC is rejected by `validateRpcUrl` and the CSP. `deploy/tor` untested (`TOR.md:8`). Firefox and WebKit are untested (`DEVIATIONS.md:258`). | Tor users | Manual TB QA (Standard/Safer); KDF progress text; document TB persistence | QA record |
| E-19 | logging | Info | CONFIRMED | **React logs caught errors.** `createRoot` is called without `onCaughtError`/`onUncaughtError` (`main.tsx:11`). React therefore logs caught render errors to the console (bundle `console.error` comes only from React internals). The UI never renders raw messages (`errors.ts:68-80`). Error objects may hold input snippets. | Local console | Pass sanitized root error handlers | Unit |
| E-20 | integrity / SRI | Info | CONFIRMED | **No SRI and no durable signed checksums.** The app entry has no SRI. That adds little: the host also serves `index.html`. Embed SDK SRI tooling is not wired (`apps/web/README.md:57`; full only). Pages `SHA256SUMS` live only in the run summary and a 14-day artifact, unsigned (ADR-0029 gate 2 open). Overlaps E-04. | Verification by users | See E-04 | — |
| E-21 | release keys | Info | CONFIRMED | **No test-key denylist.** `parseReleaseKeys` (`validate-deployments.mjs:38-43`) has no denylist for the public Playwright manifest key (0x07×32, `e2e/prepare-manifest.mjs:21-22`). A misconfigured repo variable would trust manifests signed with a public key. | Pages/release builds | Denylist known test public keys | Unit |
| E-22 | network metadata | Info | INFERRED (browser standard) | **RPC request fingerprint.** Every CORS RPC call carries `Origin: <app origin>`, UA and Accept-Language. JSON-RPC ids are per-client counters (`rpc.ts:227,236`). `eth_chainId` is re-checked every 60 s (`rpc.ts:229`). Optional 60-90 s auto-scan. The RPC can therefore tag a GhostPay user and their session cadence. Not in user docs (grep). | All RPC users | Document; consider random ids | Doc |
| E-23 | deploy smoke | Info | CONFIRMED | **The post-deploy smoke only idles.** It loads the home view and waits 3 s (`smoke.mjs:100-112`). Team E's local walk covered all views; the live smoke does not. | Pages | Click every lean view, open a fixture invoice, then assert no request outside the site | Smoke run log |

Not findings (VERIFIED good): no telemetry or analytics (`privacyInvariants.test.ts` passes); no fixed third-party origin
in the source or either bundle; RPC user-selected with no default and no silent fallback (`settings.ts:19-29`,
`AppShell.tsx:206-225`; Settings hint "No default RPC is built in"); relayer opt-in (`settings.ts:22`), contacted only on
Quote/Relay clicks (`Sweep.tsx:176-188`); fiat pricing only via Chainlink feeds read through the user's RPC
(`pay.ts:177-207`), no price API anywhere (grep); JSON-RPC response identity (`jsonrpc`, `id`, no batch) and the 2 MiB
streamed cap (`rpc.ts:380-398,112-124`); clipboard writes only from click handlers (`Common.tsx:61-74`,
`SecretBackup.tsx:180-215`) and a backup copied to the clipboard is cleared on app lock; no clipboard reads; `no-referrer` in every HTML
entry; EIP-6963 icons accepted only as data URIs (`wallet.ts:59-96`; CSP `img-src 'self' data:`); release-hash fetch
same-origin, `credentials:'omit'` (`release.ts:11-24`); merchant-profile fetch click-only with an 8 KB cap (`embedHost.ts:57-82`,
full only); PRs #110/#111/#196-#200 all ancestors of the candidate (`git merge-base --is-ancestor`, 0 unique patches).

## 2. Static hosting review

| Item | State | Evidence |
|---|---|---|
| Lean vs full | Lean = `AppLean.tsx` (CORE views only), lean module proof, no embed SDK; full adds BTC/Solana/TRON/policy, merchant profile, embed SDKs | `vite.config.ts:91-101`, `localBuildProfile.mjs:102-135,227-273`; built: lean 17 files, full 19 files, Pages 16 files |
| CSP (meta) | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'` | `index.html:11-14`; help/privacy: `script-src 'none'; connect-src 'none'` (`help.html:8`, `privacy.html:8`) |
| CSP (headers) | Same + `frame-ancestors 'none'`, XFO DENY, nosniff, Permissions-Policy (camera self), COOP; nginx adds COEP | `public/_headers:4-10`, `deploy/nginx/security-headers.conf:3-9`; removed for Pages (`build-pages.sh:126-127`); `embedHeaders.test.ts` pass |
| Pages build | Clean `env -i`, lean only, manifests refused on mainnet, origin recorded, banner injected, independent verifier, SHA256SUMS + evidence | `build-pages.sh`; run: "Pages site verified: 16 files; DEMO" exit 0 (`logs/build_pages.log`) |
| Determinism | Pages lean assets byte-identical to a plain lean build of the same tree (`index-BP5q6kVy.js` sha256 `6e4a1385…`) | `logs/pages_assets.sha` = `logs/lean_assets.sha` |
| Deploy gating | `workflow_dispatch` + main + `deploy=true`; deploy `needs: [site, acceptance, release-gates]` (implicit `success()`); smoke after deploy (detects, cannot roll back) | `pages.yml:59-69,169-171,213-261`; repo settings UNVERIFIED (E-04) |
| Shared origin | See E-01, E-03 | |
| SRI | None for the app; see E-20 | |
| Service worker | None (0 bundle tokens; `getRegistrations()` = 0 in walk) | `logs/egress_walk.json` |
| nginx | No access log, `server_tokens off`, dotfiles/maps denied, exact `/api/` routes, body caps; no HSTS (E-15) | `deploy/nginx/nginx.conf:14-16,84-118` |
| Tor | v3 onion, `SocksPort 0`, `ControlPort 0`, no single-hop; untested | `deploy/tor/torrc:1-12`, `TOR.md:8` |

## 3. Network egress inventory

All "auto" rows fire only when the user has configured the destination. VERIFIED by the Chromium walk
(`$SP/out/E/scripts/egress_walk.mjs`; logs `egress_walk.json`, `egress_walk_full.json`). It served the built
artifact under `/GhostPay/`, opened `#gpi=…`, clicked every nav view, generated keys, saved an RPC URL, revisited
Pay/Scan/Sweep/Registry/Create, then clicked Test. Result: **0 foreign requests until Test**, then 3 POSTs (1 + 2
retries) to the probe RPC. 0 requests outside `/GhostPay/`.

### 3.1 Lean (Pages default)

| Destination | Trigger | Default | Sent | Code |
|---|---|---|---|---|
| Same origin `/GhostPay/*` | Page load; locale chunk on language switch; Home re-fetches the entry script for its hash | yes | file GETs (`no-store`, no credentials for the hash) | `Home.tsx:16-34`, `release.ts:19` |
| Settings RPC (per chain) | Settings **Test**; Pay on invoice open (manifest read-back + context, automatic once a manifest is bundled); Scan; Sweep balance (auto, unless a private path is required); Registry lookups/publish; tx verification | no URL by default | JSON-RPC POST, `Origin` header, see §4 | `Settings.tsx:81-97`, `Pay.tsx:398-427,467,693,743`, `Sweep.tsx:95-113`, `RegistryView.tsx:114-117` |
| Second RPC (per chain) | Scan only (skipped when a local proxy is required) | none | same windows, block reads, verification | `Scan.tsx:218`, `scanPrivacy.ts:233-235` |
| Custom scan endpoint | Scan (privacy settings) | none | via net-transport (`omit`/`no-store`/`no-referrer`); http loopback blocked by CSP (E-05) | `scanPrivacy.ts:634-654` |
| Indexer `GET /v1/logs` | Scan with source=indexer (testnets only) | off | windows | `scanPrivacy.ts:508-524,573-606` |
| Relayer `/v1/quote`, `/v1/sweep` | Sweep → Quote / Relay buttons | URL empty | owner, destination, token, amount, fee, signature | `relayerClient.ts:115-195`, `Sweep.tsx:176-215` |
| Wallet extension (in-page EIP-1193) | Pay connect/sign/send; Registry publish | — | accounts, chain switch, tx, typed data; the wallet's own RPC is outside GhostPay | `wallet.ts:158-383` |
| Camera | QR import click | — | local only | `CameraImporter.tsx:248` |
| Anchors only | User click (help/privacy/banner) | — | navigation to github.com, eips.ethereum.org, bitcoin.org, paulmillr.com, viem.sh, react.dev | `help.html:26,139-148` |

Lean bundle: 12 npm packages (react-dom, jsqr, @noble/curves, viem, @noble/hashes, @adraffy/ens-normalize,
qrcode-generator, react, @scure/base, scheduler, abitype, ox) and 11 workspace packages (chain-adapters, ux-vault,
invoice-schema, qr-exchange, payment-uri, core-crypto, tx-review, scan-source, address-safety, secret-box,
net-transport); 339 rendered modules (`pages-demo/evidence/ghostpay-lean-build.json`). URL literals in lean JS:
w3.org namespaces, react.dev/viem.sh/4byte error text only (inert; `scan-bundle.mjs:14-22`).

### 3.2 Full (self-host / advanced) adds

| Destination | Trigger | Default | Code |
|---|---|---|---|
| Esplora + oracle + second server (BTC) | BTC view actions | empty | `BtcView.tsx:65-71,188-191`, `oracleBridge.ts:33` |
| Solana RPC, TRON HTTP API | Solana/TRON view actions | empty | `SolanaView.tsx:121`, `TronView.tsx:107` |
| Merchant profile URL (`?gpmu=` prefill) | **Load profile** click | — | `MerchantProfilePanel.tsx:75-99`, `embedHost.ts:57-82` |
| Embed `postMessage` to parent | Only with `VITE_EMBED_IFRAME=1` and a verified profile | off | `embedHost.ts:143-160` |
| Embed SDK served to merchant pages | Merchant page load (CORS `*`) | — | `public/_headers:28-36` |

Full walk: 12 views, 0 foreign requests until Test (`logs/egress_walk_full.json`).

## 4. Metadata leakage (observer → learns → mitigation → residual)

| Observer | Learns | Mitigation in candidate | Residual (unavoidable or open) |
|---|---|---|---|
| Static host (GitHub Pages/Fastly; self-host or onion operator) | IP (not for onion), UA, load time, files fetched (a locale chunk reveals language) | No analytics/SW/third parties; fragment never sent; `no-referrer` | Can serve modified code (E-04); GitHub logs visitor IPs |
| Sibling Pages sites (shared origin) | Everything in storage; can script the app | Build refuses payments on a shared origin by default; banner | Full compromise if any sibling is compromised (E-01) |
| Settings RPC | IP, `Origin`, UA, Accept-Language, timing. **Pay:** invoice chain, router/announcer reads on invoice open, payer address (gas-buffer `eth_estimateGas` `from: wallet.account`, `Pay.tsx:743`), token/amount, fiat feed reads, payment tx hash. **Scan:** announcer `eth_getLogs` in grid windows (exact ranges if windows=0); exact block reads at checkpoint/page ends; receipt or one-time-address transfer-log reads for matched router payments (show which announcement is yours, `en.json:792`); polling cadence. **Sweep:** one-time address (balance auto-read), nonce, gas, raw tx (direct), destination. **Registry:** looked-up addresses/ENS names. | User choice, no default; fixed grid windows + CSPRNG order + jitter (`scanPrivacy.ts:356-464`); filters name only announcer + topic (`scanPrivacy.ts:321-330`); balance read on request under a required private path (`Sweep.tsx:45,95`); `observeBalance` off by default (`payments.ts:134`) | IP unless Tor Browser (local proxy broken, E-05); exact scan position from block reads; matched-announcement reveal; sweep links IP → one-time → destination |
| Second RPC | Same windows, block reads and verification requests; contacted directly even in tor-browser mode | Skipped when a local proxy is required | IP to a second party |
| Indexer (opt-in, testnet) | IP, windows, timing | Block hashes cross-checked against the user's RPC | Can omit announcements |
| Relayer (opt-in) | IP, owner (one-time address), destination, token, amount, fee, timing; its own RPC sees the simulation and broadcast | Opt-in, click-only; `omit`/`no-referrer`/`no-store` | Content is not hidden by any transport (`net-transport/src/claims.ts:35-41`) |
| Wallet extension and its RPC | Payer account, tx content, IP | Outside GhostPay | Documented (`claims.ts:40`) |
| Network observer (ISP/Wi-Fi) | DNS/SNI of github.io and RPC/relayer hosts, timing, volume | Tor Browser if the user runs it | Not hidden by the page |
| Tor exit (tor-browser mode) | Destination host/SNI, timing | — | Page cannot verify Tor (`claims.ts:32`) |
| Public chain (everyone) | Payer address, amount, token, time, router call, ERC-5564 announcement (ephemeral key, view tag, metadata); gas-buffer transfer payer → one-time address (links them); sweep one-time → destination; **gas payer linkage:** a direct ERC-20 sweep needs native gas at the one-time address (buffer = payer link; self-funding = seller wallet link); relayed sweep shows relayer + fee; registry registration permanently links wallet ↔ meta-address; router fee flow; anonymity set ≈ "GhostPay router users on that chain" | Fresh destination guidance, delay, relayer (none is unlinkability) | Graph analysis, amount/timing correlation (`docs/user/privacy-limits.md`) |
| Payer / invoice-link holder | Invoice contents; payer knows the one-time address and can follow the sweep | Passphrase links; address-bar clearing | Browser history and sync keep the link (E-08) |
| Device thief / later local user | RPC URLs (API keys), scan settings, checkpoints, plaintext meta-address in vault record, encrypted vault (offline scrypt N=2^17 attack), history links, tab journals | Keys encrypted; passphrase never stored; idle lock | E-09, E-10 |
| Browser vendor (sync/telemetry) | Synced history URLs incl. fragment (INFERRED); local UKM DB holds the URL (VERIFIED locally; upload UNVERIFIED) | — | E-08 |

## 5. Storage inventory

VERIFIED by code. Contents after keygen were also VERIFIED by the walk and by e2e `app.spec.ts:168` (no 64-hex value, no
meta fragment, no cookies).

| Location | Key / DB | Contents | Protection | Profile | Retention / deletion |
|---|---|---|---|---|---|
| localStorage | `ghostpay.settings.v1` | RPC URLs (primary/secondary per chain), relayer URL, delay, lock timeout, theme, autoClearFragment, pinnedSigners | **plaintext** (stated in UI) | lean+full | until site data cleared or changed in Settings |
| localStorage | `ghostpay.scanPrivacy.v1`, `ghostpay.scanLanes.v1` | transport, endpoints, indexer URLs, window/jitter, lane options | plaintext | lean+full | same |
| localStorage | `ghostpay.scan.checkpoint.v2.<chain>.<sha256(spend\|view)>` | nextBlock, last block number/hash | plaintext, linkable (E-09) | lean+full | per-key `clear()`; site data |
| localStorage | `ghostpay.locale` | language | plaintext | both | — |
| localStorage | `ghostpay.reconciliation.{enabled,records}.v1` | legacy plaintext ledger | read-only; new writes refused | both | delete/export supported |
| localStorage | `ghostpay.merchantKey.v1:<origin>` | pinned merchant signer | plaintext | full | forget with confirmation |
| localStorage | `ghostpay:durable-wallet-attempts:v1` | policy withdrawal journal | plaintext | full (experimental) | — |
| sessionStorage | `ghostpay.wallet-attempts.v1` | payer account, chain, attempt key, status, tx hash | plaintext, tab-scoped | both | tab close |
| sessionStorage | `ghostpay.sweep-attempts.v1` | chain, one-time owner, nonce, hashes, order ref, status (no keys/destination/amount) | plaintext, tab-scoped, fail-closed | both | tab close |
| IndexedDB | `ghostpay-encrypted-seller-vault` / `vault` / `current` | keystore JSON: scrypt N=2^17,r=8,p=1 + AES-256-GCM; **plaintext `meta.metaAddress`, `meta.signer`** (AAD) | encrypted secrets | both | opt-in save; confirmed delete; DB created on first visit (walk) |
| IndexedDB | `ghostpay-tags` | AES-GCM records, HMAC lookup keys; plaintext chainId, timestamps, keyVersion; keys from viewing key (HKDF) | encrypted | both | "Delete all tags" |
| IndexedDB | `ghostpay-reconciliation-encrypted` / `vaults` / `<sellerKeyId>:<chainId>` | envelope `{format,version,sellerKeyId,chainId,salt,iv,ciphertext}`; key = HKDF(viewing key) | encrypted; scope plaintext | both | — |
| IndexedDB | `ghostpay-btc-headers` | public BTC headers | public | full | "Forget saved headers" |
| Memory only | seller spending/viewing/signing keys, passphrases, BTC/Solana/TRON seeds | never persisted in plaintext; idle lock wipes recoverable keys | — | both | reload/lock |
| Clipboard | invoice links, payment requests, meta-address; full: raw seed (two-step warned) | cleared on lock where the browser allows | — | both | — |
| Downloads | encrypted keystore, encrypted reconciliation backup, receipts, proof-of-payment JSON (plaintext amount/time), QR SVG | per file | — | both | user |
| Browser-managed | history/session restore keep `#gpi=` URL (E-08); HTTP cache of assets | — | — | both | — |
| None | cookies, Cache Storage, service worker | — | — | — | VERIFIED 0 |

Multi-tab behaviour (VERIFIED code): the vault is a single record with `onblocked` → "close other tabs"
(`keyVault.ts:73-79`). Reconciliation uses compare-and-swap plus `BroadcastChannel` invalidation
(`reconciliationVault.ts:21-44,141-190`). Tag concurrency is tested (`tagsConcurrency.test.ts`). Attempt journals are
tab-scoped, so duplicate-payment protection does **not** span tabs (`sweepAttemptJournal.ts:5-8`). Seller keys live in
each tab's own memory.

## 6. URL, clipboard and logging

- **Fragment:** read once, then cleared with `history.replaceState(state, '', path+search)`. The pathname `//` case is
  handled (`fragment.ts:20-26`). It is cleared again on `hashchange` and when the setting is re-enabled
  (`AppShell.tsx:97-115`). VERIFIED: e2e `app.spec.ts:157` passes and the walk shows a clean `href`. Residual: E-08.
- **Referrer:** `<meta name="referrer" content="no-referrer">` in all three HTML entries, plus explicit
  `referrerPolicy` on most fetches (E-07 for the RPC).
- **console in production:** the bundle has only React-internal `console.error` (6). `console.warn`/`log`/`info`/`debug`
  appear 0 times (the app's `console.warn` sites are dead code or DEV-only: `manifest.ts:90`, `i18n/context.tsx:51`).
  See E-19.
- **Error text:** UI messages are i18n keys; ChainAdapter errors never echo URLs (`rpc.ts:75-91`); the relayer echoes
  the error class only (`relayerClient.ts:131-135`).

## 7. Supply chain results (commands run in `$SP/out/E/wt` @ 7a620ff1)

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | exit 0; 722 added, 791 audited; "30 vulnerabilities (16 low, 14 high)" |
| `npm audit --json` | exit 1; total 30: high 14, low 16, critical 0; deps prod 286, dev 524, optional 41, peer 13 (total 814) (`logs/npm_audit_all.json`) |
| `npm audit --omit=dev --json` | exit 0; **0 vulnerabilities** (`logs/npm_audit_prod.json`) |
| Lockfile scan (node) | lockfileVersion 3; 814 entries; 678 tarballs, all `registry.npmjs.org`, all `sha512-`; 68 workspace links; 0 missing integrity; install scripts only in dev (`fsevents` opt, `keccak`, `secp256k1`); CI uses `--ignore-scripts` everywhere |
| `bash scripts/check-actions-pinned.sh` | exit 0; "111 'uses:' reference(s) checked, all pinned to full SHAs with version comments" |
| `bash scripts/scan-secrets.sh` | exit 0; "no committed env files or key material" (regex-based; excludes docs, .github, tests, *.md). The pages.yml step is named "Secret and egress scan" but the script scans no egress (Info) |
| `TMPDIR=… KEEP=1 bash scripts/repro-check.sh --head` | exit 0; **REPRODUCIBLE**: `ghostpay-web-repro.tar.gz` `83400751…390bf`, `sbom.cdx.json` `a5b4eadc…8d45` identical across two clones/paths (same machine; full profile; channel `development`); SBOM CycloneDX 1.5, 142 components (whole prod tree, not just bundled code) |
| `bash scripts/pages/build-pages.sh $SP/out/E/pages-demo` | exit 0; 16 files; DEMO; `lockfileSha256 e025d878…`; `sharedOrigin: true`, `origin: null` |
| `npm run build -w @ghostpay/web` (full / lean) | exit 0 / 0; bundle scan passed 19 / 17 files |
| Tests | vitest web: 14 files, **239/239** (privacyInvariants, scanBundle, embedHeaders, fragment, AppLean.fragment, settings, relayerClient, scanPrivacy×3, hardening, buildScripts, release, wallet); chain-adapters `rpc.test.ts`+`scanHardening.test.ts` **112/112**; `node --test scripts/pages/*.test.mjs` **72/72**; `localBuildProfile.test.mjs` **33/33**; `release-*.test.mjs`+`workflows.test.mjs` 43 (42 pass, 1 skip: ssh-keygen missing); scan-secrets/lean-core-reachability/dependency-tooling **21/21**; Playwright lean `e2e/app.spec.ts` **12/12** (port moved 4173→4199 because Team F was using 4173; file restored after) |
| CI (claim, not re-run) | Qualified head `d91ae16a` run 44231986652: 24/24, e2e full 78/1 skip, lean 66/3 skip (`VALIDATION_MATRIX.md:20`) |
| Dependabot | weekly, grouped: github-actions and npm; no docker ecosystem (E-15) |
| release.yml | tag signature checked against the default-branch `allowed_signers` (empty → fail closed), analyzer evidence gate, `npm audit --omit=dev --audit-level=high`, deterministic build, self-check, `attest-build-provenance`, draft-only release; `verify-release.sh` checks hashes and manifest consistency (authenticity = signed tag + attestation). Builds the **full** profile; Pages publishes **lean** and has no signed counterpart (E-04/E-20) |
| `actions/setup-node` `cache: npm` in pages.yml | npm download cache only; comments say "No Actions cache anywhere" (Info). Tarballs are integrity-checked by `npm ci` |

## 8. Privacy-claim (overclaim) audit

Searched README, SECURITY, docs, `apps/web/locales/en.json`, `apps/web/*.html` and `apps/web/src` for
anonym, untrace, unlinkab, Monero, "fully private", invisible, "no one can", and similar
(559 raw hits, `logs/overclaim_grep.txt`). Almost every user-facing hit is a negation ("not anonymous", "not
unlinkable"). Research docs (`docs/remote/*`, `docs/research/*`) discuss Monero/Zcash as comparisons, not claims. Items to fix:

| path:line @7a620ff1 | Text | Issue | Suggested fix | Sev |
|---|---|---|---|---|
| `apps/web/locales/en.json:1100` | "It hides which seller owns the one-time (stealth) address." | Unqualified. The payer knows it; RPC receipt checks can reveal the match; sweeps link it; the relayer sees it | "…from third-party chain observers, until you sweep it to a known wallet" | Low |
| `docs/developer/api/policy-scheme.md:233` | "Undeployed, router-paid accounts stay unlinkable." | Absolute "unlinkable" (experimental feature) | "are not linked by the factory deployment" | Low |
| `docs/pages/README.md:49` | local-proxy path "accepts http://127.0.0.1 …" | False in the shipped CSP (E-05) | Fix the CSP or the text | Medium |
| `docs/pages/README.md:48`, `apps/web/locales/en.json:11` | "Only https:// and wss:// …" | wss never works (E-06) | Drop wss | Low |
| `apps/web/locales/en.json:2138` | "This hides your IP from the server, not what you send…" | Unconditional; true only if Tor Browser or proxy really routes over Tor. Prior GP-PAGES-06 judged it acceptable alongside hedged rows (`docs/pages/RELEASE_MATRIX.md:58`) | "can hide…, if…" | Info |
| `README.md:5` | "…a fresh one-time address that only the seller can find and spend from" | The payer also knows the address | "only the seller can detect (scan) and spend" | Info |
| `docs/threat-model/PRIVACY_THREAT_MODEL.md:16` | "net-transport … scan-source … not imported by apps/web" | Stale understatement (E-16) | Refresh | Low |
| `apps/web/locales/en.json:2139-2142` | Privacy set "low/medium/high" | Already hedged ("rough local heuristic, not a guarantee") | none | Info |
| `apps/web/locales/en.json:1943` | "Everything runs in your browser." | Computation yes; RPC/relayer traffic is remote | optional: "…except the RPC and relayer you choose" | Info |

No user-facing "anonymous", "untraceable" or "Monero-like" claim was found. Negated uses (sample): `README.md:7`,
`SECURITY.md:45`, `docs/user/privacy-limits.md:3`, `en.json:959,1103`, `docs/guides/faq.md:3-4,36-37`.

## 9. Gates required before a Sepolia beta (Team E view)

1. **G-E1 Origin:** a dedicated origin (repo-level custom domain or dedicated account), OR an explicit written owner
   acceptance of GP-PAGES-01 for test assets plus a keys-are-testnet-only warning. Plus the deployed-origin assertion (E-01, E-03).
2. **G-E2 Live site:** confirm Pages Source = GitHub Actions; retire/unpublish the `gh-pages` prototype; live
   `smoke.mjs` against the real URL with the dispatched commit (E-02).
3. **G-E3 Repo boundary:** `main` rulesets/branch protection and `github-pages` environment (main-only + required
   reviewers), evidenced (E-04).
4. **G-E4 Artifact authenticity:** attest the Pages `SHA256SUMS` (build provenance) and publish signed checksums out of
   band; release key in `allowed_signers` (ADR-0029 gate 2) (E-04, E-20).
5. **G-E5 Private scanning honesty:** make local-proxy work under the CSP or remove it from UI and docs; resolve wss
   (E-05, E-06), with an e2e test under a real CSP.
6. **G-E6 Live egress:** an extended smoke over every lean view plus a fixture invoice on the bundled testnet manifest,
   asserting only site + configured RPC are contacted (E-23).
7. **G-E7 Browser QA:** Firefox and Tor Browser (Standard, Safer) manual run recorded, including KDF time and
   persistence behaviour (E-18).
8. **G-E8 ADR-0029** moved from Proposed to Accepted by the owner.

Should-fix before beta (cheap): E-07 transport options, E-11 frame guard, E-12 banner link, E-17 copy, E-08 sync note,
E-10 wipe control, E-21 test-key denylist.

## 10. Unverified (and why)

- Live Pages state, Source setting, environment rules, branch protection: github.io is blocked by the sandbox proxy
  (HTTP 403 CONNECT), and the brief limits GitHub reads to search endpoints. GitHub MCP failed to connect.
- Tor Browser, Firefox and WebKit behaviour: only Chromium 1243 is available. The KDF slowdown is inferred from V8
  `--jitless`, not SpiderMonkey.
- Whether Chrome UKM or Sync uploads the fragment URL: only local profile storage was observed.
- `deploy/tor` and nginx were not built or run. Docker is present but out of scope for the time box.
- Real RPC providers, wallets and relayers were not contacted. RPC behaviour came from code, mocks and an invalid probe host.

## 11. Artifacts

- `$SP/out/E/SECURITY_PRIVACY_BROWSER.md` (this file), `$SP/out/E/findings.json`
- Scripts: `$SP/out/E/scripts/egress_walk.mjs`, `$SP/out/E/scripts/csp_loopback_probe.mjs`, `$SP/out/E/scripts/jitless_bench.mjs`
- Built artifacts: `$SP/out/E/pages-demo/{site,evidence}`, `$SP/out/E/dist-lean`, `$SP/out/E/dist-full`, `$SP/out/E/release-repro/{a,b}` (both repro builds; SHA256SUMS identical incl. release-manifest.json `1b226b8c…`)
- Logs: `$SP/out/E/logs/` (npm audit JSON, build logs, test logs, walk/probe JSON, repro log, bench, overclaim grep)
