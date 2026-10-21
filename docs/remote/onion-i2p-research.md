# Anonymity-network hosting and client options for GhostPay (Tor, I2P, and other overlays)

Status: research only. Nothing here is built, deployed or tested. ADR-0015 still forbids any public instance or hosted relayer until its gates are met; this document does not change that. No code in `apps/` was changed. Retrieval date for every source: **2026-10-21**.

## 0. How to read this document

### 0.1 Source rules and what was actually reachable

The research sandbox could not reach most project websites (`community.torproject.org`, `spec.torproject.org`, `geti2p.net`, `i2pd.readthedocs.io`, `docs.onionshare.org`, `whonix.org`, `developer.mozilla.org`, `w3.org`, GitLab, `docs.rs` all returned a proxy 403 or no connection). Primary material was therefore fetched from upstream **source repositories and release tarballs**, which are the projects' own files but are in some cases GitHub mirrors that may be stale. Each claim names its source ID. "Two-source" means two independent fetched files agree. Anything not backed by a fetched file is marked **unverified**.

| ID | What was fetched | Where from | Caveat |
|---|---|---|---|
| T1 | Tor manual `doc/man/tor.1.txt`, tor 0.4.9.11 | `http://archive.ubuntu.com/ubuntu/pool/universe/t/tor/tor_0.4.9.11.orig.tar.gz` (upstream release tarball, redistributed by Ubuntu) | Canonical page `https://2019.www.torproject.org/docs/tor-manual.html` not fetched |
| T2 | SOCKS extensions | `https://raw.githubusercontent.com/torproject/torspec/main/socks-extensions.txt` | GitHub mirror; its README says the project moved to GitLab (stale risk) |
| T3 | Onion service v3 spec `rend-spec-v3.txt` | `https://raw.githubusercontent.com/torproject/torspec/main/rend-spec-v3.txt` | Same stale mirror; the current spec site is `https://spec.torproject.org/rend-spec/` (not fetched) |
| T4 | Proposal 327 (PoW over intro) | `.../torspec/main/proposals/327-pow-over-intro.txt` | Mirror copy says `Status: Draft`; the feature has since shipped (see T1, T5) |
| T5 | Tor Community portal pages: client-auth, onion-location, dos, https | `https://raw.githubusercontent.com/torproject/community/main/content/onion-services/advanced/<page>/contents.lr` | GitHub mirror of `community.torproject.org`; currency not verifiable. The `setup`, `vanguards`, `onionbalance` pages were 404 on the mirror |
| T6 | Tor support FAQ "onion icons in the address bar" | `https://raw.githubusercontent.com/torproject/support/main/content/onionservices/onionservices-5/contents.lr` | Mirror |
| T7 | Vanguards add-on README | `https://github.com/mikeperry-tor/vanguards` (shallow clone; last commit 2023-10-31) | Maintenance of add-on appears dormant |
| T8 | OnionBalance README | `https://github.com/asn-d6/onionbalance` (shallow clone, HEAD 2026-02-02) | Not the Tor Project GitLab canonical repo |
| T9 | OnionShare docs `docs/source/{features,security}.rst` | `https://github.com/onionshare/onionshare` (shallow clone, HEAD 2026-10-16) | |
| W1 | W3C Secure Contexts source `index.bs` | `https://raw.githubusercontent.com/w3c/webappsec-secure-contexts/main/index.bs` | Editor's draft source, not the rendered REC |
| W2 | Firefox source: `modules/libpref/init/StaticPrefList.yaml`, `dom/security/nsMixedContentBlocker.cpp` | `https://raw.githubusercontent.com/mozilla/gecko-dev/master/...` | Mirror of mozilla-central |
| N1 | `socks-proxy-agent` 10.1.0 (published 2026-06-08 per npm metadata) | `https://registry.npmjs.org/socks-proxy-agent/-/socks-proxy-agent-10.1.0.tgz` | Not Tor-specific |
| I1 | Java I2P site sources: `spec/b32encrypted.rst` (accurate for 0.9.47, 2020-08), `spec/encryptedleaseset.rst` (0.9.66, 2025-05), `pages/site/docs/api/{samv3,i2pcontrol,socks,i2ptunnel}.html`, `about/browser-config.html` | `https://github.com/i2p/i2p.www` (shallow clone; HEAD 2026-02-10). Canonical `https://geti2p.net/en/docs/...` not fetched | Template-source HTML |
| I2 | i2pd docs: `docs/user-guide/{tunnels,configuration}.md`, `docs/tutorials/{http,blinded-addresse}.md`, `docs/devs/api/{SAM,I2PControl}.md` | `https://github.com/PurpleI2P/i2pd_docs_en` (HEAD 2026-10-18); i2pd 2.59.0 source tarball from the Ubuntu pool | |
| O-* | Other networks: READMEs and docs from shallow clones of `oxen-io/lokinet`, `nymtech/nym`, `katzenpost/katzenpost`, `yggdrasil-network/yggdrasil-go`, `cjdelisle/cjdns`, `hyphanet/fred`, `ipfs/kubo`, `markqvist/Reticulum`, `gitlab.com/veilid/veilid` | HEAD commit dates are given in section 5 | GNUnet could not be cloned or fetched at all |

Not fetched at all (so every claim about them is **unverified**): Whonix documentation, Tor Browser manual and security-level docs, MDN, Tor Browser's own pref file, the Tor Project's current spec site, any wallet vendor documentation, any RPC provider's Tor policy.

### 0.2 What is being hosted (from the repo)

Read: `README.md`, `docs/APP_AND_RELAYER_SPEC.md`, `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`, `docs/operators/{mirror-hosting,local-scanner-and-rpc}.md`, `docs/threat-model/THREAT_MODEL.md`, `apps/relayer/{README,PRIVACY}.md`, `apps/relayer/deploy/ghostpay-relayer.service`, `apps/web/public/_headers`, `apps/web/index.html`, and the code points cited below.

- **Web app**: static React/Vite SPA, no server routes, invoice in `location.hash`. CSP (both `_headers` and the meta tag in `index.html`): `default-src 'self'; script-src 'self'; ... connect-src 'self' https: wss:; ... worker-src 'self'`. Meta fallback has no `frame-ancestors`. `Referrer-Policy: no-referrer`. A "no Tor mode" statement appears in `THREAT_MODEL.md` (row "RPC learns IP") and `local-scanner-and-rpc.md`.
- **Hard https/wss assumptions in code** (these block a pure-onion deployment as shipped):
  - RPC URLs: `validateRpcUrl` and `apps/web/src/lib/settings.ts` accept only `https:`/`wss:`, no credentials, no fragment (`packages/chain-adapters/src/rpc.test.ts` pins this, including rejecting `http://`).
  - Relayer URL: `checkRelayerUrl` (`apps/web/src/lib/settings.ts:49`) requires `https:`.
  - Relayer config: `allowedOrigins` entries must be exact `https` origins, `http` only for localhost (`apps/relayer/src/config.ts:124`); plain-http RPC URLs are rejected at startup (README).
  - The bundle scanner (`apps/web/scripts/scan-bundle.mjs`) fails on `http://` literals (spec section 1).
- **Secure-context-dependent APIs actually used**: `crypto.subtle` AES-GCM in `apps/web/src/lib/keystore.ts:36-45` (throws "no Web Crypto support" when absent), `crypto.subtle` in `packages/invoice-schema/src/envelope.ts` (AES-GCM invoice envelope), `crypto.subtle.digest` in `apps/web/src/lib/release.ts:18`, `navigator.clipboard.writeText` in `apps/web/src/components/Common.tsx:46`. `crypto.getRandomValues` is used widely. No `serviceWorker` registration exists in `apps/web/src` (grep: none). A dedicated module Worker is used for scanning (`workerFactory.ts`).
- **Relayer**: Node 22, `node:http`, listens on `127.0.0.1:8787` by default (`relayer.config.example.json`), expects a TLS reverse proxy and `trustProxyHops`. RPC egress uses global `fetch` (`packages/chain-adapters/src/rpc.ts:92-101`); there is no proxy/SOCKS support. Per-IP and per-owner token buckets, hashed IPs with rotating in-memory salt, body cap 16 KiB, queue, breaker, daily budget, one in-flight tx per chain, in-memory state only.
- **Existing project statements on Tor**: playbook line 97 (publish same static artifact to a controlled onion host from an isolated runner), lines 175-195 (protected `tor-publish` environment, `ONION_DEPLOY_KEY`), `mirror-hosting.md` "Tor onion service" (not built or tested, audit B-07), ADR-0015 (Tor only with stated limits). One sentence in `mirror-hosting.md` ("Browsers over Tor cannot use `wss:`/`https:` RPCs without leaking nothing extra") is garbled and should be rewritten when that file is next edited.

---

## 1. Tor v3 onion services for the SPA and the relayer

### 1.1 Minimal service definition

Verified in T1 (tor.1, 0.4.9.11):

- `HiddenServiceDir <dir>`: one directory per service; Tor creates it if absent; each service needs its own; cannot add a new onion service to a running instance if `Sandbox` is on.
- `HiddenServicePort <virtport> [target]`: target can be `addr`, `port`, `addr:port` or `unix:<path>`; repeated lines with the same virtport are chosen at random.
- `HiddenServiceVersion 3` is the only supported version (default 3).
- v3 address format: `base32(PUBKEY | CHECKSUM | VERSION) + ".onion"` (T3, line 2265).

Illustrative torrc (not a tested deployment):

```
HiddenServiceDir /var/lib/tor/ghostpay-web/
HiddenServicePort 80 unix:/run/ghostpay/web.sock      # static files via nginx/caddy
HiddenServiceDir /var/lib/tor/ghostpay-relayer/
HiddenServicePort 80 127.0.0.1:8787                   # relayer node:http
```

Key-file names inside `HiddenServiceDir` (`hostname`, `hs_ed25519_secret_key`, ...) and file permissions: **unverified** (the Community "setup" page was not retrievable; neither T1 nor T3 names the files). Operational consequence that is established by the address format itself: the onion address is derived from the service's public key, so losing the private key means a new address and compromising it means impersonation. Back the directory up offline and encrypted; document rotation in the release manifest. The playbook already requires a "compromise recovery, key rotation" test (line 331).

### 1.2 Private (client authorization) versus public

Verified in T5 (client-auth) and T1:

- v3 client authorization is x25519. Service side: `<HiddenServiceDir>/authorized_clients/*.auth`, one line each, `descriptor:x25519:<base32 pubkey>`. Client side: `ClientOnionAuthDir`, file suffix `.auth_private`, content `<onion-address-without-.onion>:descriptor:x25519:<base32 privkey>` (T1 and T5 agree). Tor Browser can take the private key through its UI (T5, links to the Tor Browser manual, which was not fetched).
- Once enabled, "anyone with the address will not be able to access it" (T5). Authorization is only enabled if tor loads at least one valid file. **Revoking a client requires deleting the `.auth` file and restarting tor** (T5).
- OnionShare's security design (T9) states the same property from the user side: with the key, access; without it an attacker who learns the address "still can't access anything".

Mapping to GhostPay:

| Component | Recommendation | Why |
|---|---|---|
| Static SPA mirror | **Public** (no client auth) | Payers arrive from an invoice link and must be able to load the app. Auth would require distributing a per-payer key. |
| Relayer for general sellers | **Public** | Same reason; abuse control is at the application layer (section 1.7). |
| Staging / pilot relayer, private operator console, `/healthz` metrics | **Client-authorized** | Small known audience; hides the existence of the endpoint from scanners. Revocation needs a restart, so it is not a per-user kill switch. |

### 1.3 Single onion versus full onion

Verified in T1: `HiddenServiceSingleHopMode 1` together with `HiddenServiceNonAnonymousMode 1` makes one-hop circuits to intro/rendezvous points. "One-hop circuits make Single Onion servers easily locatable, but clients remain location-anonymous", and use of a single onion may be statistically distinguishable. A hidden-service directory used in single-hop mode "can NEVER be used again" for a normal hidden service, you cannot run both from one tor instance, and `SocksPort` must be 0 on that instance.

Implication: the **static SPA** host is a candidate for single onion only if the operator accepts that its location is not hidden (it is published through a CDN or a named operator anyway) and wants lower latency/load for payers. The **relayer** needs outbound RPC and holds a hot key, so it would need a *second* tor instance for outbound SOCKS if made single-onion; simpler and safer: keep the relayer a full (anonymous) onion service if the operator's location should stay hidden, else do not use an onion at all for its server side and rely only on clients reaching it through Tor exits... which defeats the purpose. Decision for the owner (open question Q1).

### 1.4 DoS and abuse controls (tor-level)

Verified in T1 and T5 (dos), with T3/T4 as background:

| Control | torrc | Default | Notes |
|---|---|---|---|
| Intro-point rate limiting | `HiddenServiceEnableIntroDoSDefense 1`, `HiddenServiceEnableIntroDoSRatePerSec`, `HiddenServiceEnableIntroDoSBurstPerSec` | disabled (0) | T1 explains the limitation: the defence is at the intro point; an attacker can flood *all* intro points and make the service unreachable while sparing the tor instance. |
| Proof of work | `HiddenServicePoWDefensesEnabled 1`; `HiddenServicePoWQueueRate` (default 250/s), `HiddenServicePoWQueueBurst` (default 2500) | disabled (0) | Puzzle is optional for clients; requests are prioritised by effort; suggested effort adapts to load and the puzzle is disabled when not overloaded (T1). Needs tor >= 0.4.8.1 with the `pow` module, and the Equi-X/HashX puzzle libraries only if built with `--enable-gpl`; check `tor --list-modules` and `tor --version` (T5). `CompiledProofOfWorkHash` applies to services and clients. T4 (proposal 327) is `Draft` in the mirror; the shipped behaviour is described by T1/T5, which agree with each other. |
| Per-circuit stream cap | `HiddenServiceMaxStreams <n>`, `HiddenServiceMaxStreamsCloseCircuit 1` | 0 (unlimited) | Directly useful: the relayer needs very few parallel streams per client. |
| Intro points | `HiddenServiceNumIntroductionPoints` | 3, max 20 | |
| Vanguards | tor option `VanguardsLiteEnabled` (`auto`, default); add-on `mikeperry-tor/vanguards` | | T1 describes the option for *clients* ("guard discovery attacks"); T7 describes the add-on, which manages `HSLayer2Nodes`/`HSLayer3Nodes` via the control port and notes distro packages are "typically out of date". Whether vanguards-lite protects *services* by default in current tor: **unverified** (Community "vanguards" page 404 on the mirror). The add-on repo's last commit is 2023-10-31. |

Because PoW is **off by default**, the shipped config must turn it on explicitly for the relayer onion, and a test must confirm `pow: yes` on the packaged tor (the Debian/Ubuntu archive build's `--enable-gpl` status is **unverified**).

### 1.5 OnionBalance

T1 documents `HiddenServiceOnionBalanceInstance 1` and an `ob_config` file with `MasterOnionAddress <frontend>.onion` inside the instance's `HiddenServiceDir`. T8 (the README of a GitHub mirror, HEAD 2026-02-02) says it distributes requests across backend tor instances, removes single points of failure and "protects the identity key", and that it "is under active development and likely contains bugs". How OnionBalance interacts with client authorization or PoW: **unverified**.

For GhostPay: usable for the **stateless static mirror** only. The relayer is not horizontally scalable as written: one in-flight tx per chain with a single hot key and nonce management, and in-memory rate limits/budget (relayer README). A second relayer instance needs its own hot key and its own budget; do not put two behind one OnionBalance name without that.

### 1.6 Tor over Docker, process placement

The repo has `apps/relayer/Dockerfile` (distroless, non-root) and a systemd unit with `RestrictAddressFamilies=AF_INET AF_INET6`. No Tor-in-Docker pattern was fetched; the following is design guidance, not sourced:

- Run `tor` as a separate container/unit from the relayer, sharing only a Unix socket (T1 allows `unix:` targets) so the relayer can keep `listen` bound to loopback or a socket and never accept clients directly. The relayer's `listen` currently takes host/port only (`relayer.config.example.json`); socket support would be a code change (section 4.4).
- Isolation consistent with ADR-0015 and playbook line 192: the onion host is a dedicated machine/runner; the `tor-publish` job pushes the *signed release artifact*, never PR source.
- If Tor also provides outbound SOCKS for the relayer, use a **separate tor instance/SocksPort** for that (tor.1 requires `SocksPort 0` in single-onion mode and keeping roles apart is also cleaner for logging).

### 1.7 Application-layer rate limiting behind an onion

Established from the code and T1: Tor delivers every onion client to the service as a connection from the local tor process. Behind `HiddenServicePort 80 127.0.0.1:8787` every request arrives from `127.0.0.1`. The relayer's per-IP bucket (`rate_limited_ip`, hashed with a rotating salt; `trustProxyHops` 0 uses the socket address) would then collapse into **one global bucket**: either one abusive client locks out everyone, or limits are set so high they do nothing. Mitigations, in order of strength:

1. Rely on what is keyed by something the attacker cannot cheaply multiply: the **per-owner bucket** (only applies to `/v1/sweep` after signature recovery), global **daily budget**, bounded **queue**, **gas caps**, and the **breaker** (all exist).
2. Put **tor-level** controls in front (PoW, intro DoS, `HiddenServiceMaxStreams`).
3. Add an **unauthenticated-endpoint cost**: `/v1/quote` is only IP-limited today (relayer README "Not covered"). Under an onion it needs either PoW at the tor layer or an app-layer challenge.
4. Do not invent a per-client identifier from circuit data in the relayer; it does not exist at the HTTP layer. (For I2P, i2pd offers one; see 3.3.)

### 1.8 Browser and HTTP considerations for `http://*.onion`

**Secure context.** Two sources agree that `http://x.onion` is not a secure context by default:

- W1 (W3C "Is origin potentially trustworthy?" algorithm): trustworthy = `https`/`wss`, loopback IPs, `localhost` names, `file`, schemes the UA treats as authenticated, or an origin "configured as trustworthy". There is **no `.onion` rule**.
- W2 (Firefox): the pref `dom.securecontext.allowlist_onions` exists with default `false` (`StaticPrefList.yaml`, line 4341), and `nsMixedContentBlocker::IsPotentiallyTrustworthyOnion` returns true for hosts ending `.onion` only if that pref is true.

So in a stock Firefox/Chromium-family browser, an `http://` onion page gets no `crypto.subtle`, no service workers, no `navigator.clipboard`. **Whether Tor Browser sets `dom.securecontext.allowlist_onions = true`: unverified** (Tor Browser's own prefs and release notes were not fetched). Treat the Tor-Browser-only assumption as a hypothesis that must be tested on the shipping Tor Browser before relying on it. Chromium's behaviour for `.onion`: **unverified** (the Chromium source file path tried returned 404).

Impact on GhostPay if the page is *not* a secure context:

| Feature | Effect |
|---|---|
| Seller keystore export/import (`keystore.ts`) | Breaks: AES-GCM via `crypto.subtle` throws. |
| Encrypted invoice envelope (`invoice-schema/envelope.ts`) | Breaks for encrypt/decrypt. |
| Release-hash widget (`release.ts`) | Breaks (and is not a real integrity control anyway, audit S3-04). |
| Copy buttons (`Common.tsx:46`) | Breaks unless guarded (not verified whether the call is guarded). |
| Stealth derivation, signing, scanner worker | Not dependent on `crypto.subtle` (pure noble code; `getRandomValues` use is widespread). Whether `getRandomValues` is available in a non-secure context: **unverified from fetched sources** (MDN not fetched); it is widely implemented as available, but test it. |
| Service worker | App registers none. A future offline cache would need a secure context. Keep it that way; also note the playbook already lists "service-worker cache poisoning" and fragment-in-SW-cache as review items (lines 266, 308). |
| Dedicated Worker, IndexedDB, localStorage | No secure-context requirement is claimed in W1; availability in Tor Browser private modes: **unverified**. |

**HTTPS for onion.** T5 (https page) lists the options: CA-issued certs for v3 onions are allowed by the CA/Browser Forum since 2020; at the time of that page only DigiCert (EV) and HARICA (DV) issued them, and the page hoped Let's Encrypt would follow (current status: **unverified**). Tor Browser does not warn on plain-HTTP onions (T5 and T6 agree: T6 lists the onion icon as meaning "served over HTTP, or HTTPS with a CA-issued certificate", and "HTTPS with a self-signed certificate"). Certificate Transparency leaks `.onion` names for CA-issued certs (T5 item 3). T5 also says a Tor Browser feature to verify self-made onion-key-signed chains is only an open proposal. Trade-off for GhostPay: an HTTPS onion (HARICA DV) would restore a conventional secure context and satisfy the existing https-only validation, at the cost of a CT-public onion name and a CA relationship; plain HTTP is simplest but depends on the unverified Tor Browser secure-context behaviour above and needs the code/CSP changes in section 4.

**Mixed content / cookies.** T5 item 4 warns that serving both HTTP and HTTPS for an onion can leak secure cookies and recommends relative links. GhostPay uses relative base `./`, no cookies, and no third-party origins, which fits.

**Onion-Location.** T5: header valid only if (a) the value is an `http:`/`https:` URL with a `.onion` host, (b) the page defining it is served over HTTPS, (c) the page is not itself an onion site; an HTML `<meta>` form also exists. Tor Browser shows a purple pill. Fits the Cloudflare Pages `_headers` primary host; the GitHub Pages degraded mirror could only use the meta form, whose exact attribute syntax was not verified. Security caveat: the clearnet host that advertises the onion is the trust anchor for the address; if the host is compromised it can advertise a malicious onion. So publish the onion address in the signed release manifest as well (playbook already requires "onion artifact hash" in release record, line 199).

**CSP for an onion mirror.** Keep the same `_headers` content served by nginx/Caddy (mirror-hosting.md says so). Required changes are only about `connect-src` (section 4). Do not add `upgrade-insecure-requests`.

**Same-origin vs separate relayer onion.** With a reverse proxy serving the SPA and proxying `/v1/` to the relayer on the *same* onion, `connect-src 'self'` suffices and no CORS is needed. But the relayer still checks the `Origin` header (`origin_not_allowed`) and `allowedOrigins` rejects `http://*.onion` (config.ts:124), and the app's `checkRelayerUrl` rejects non-https. So code changes are needed either way.

### 1.9 Clients on the same page: service workers and WebCrypto summary

As above: no service worker is in use; WebCrypto is used in three places; the plan must either guarantee a secure context (HTTPS onion or a verified Tor Browser allowlist) or add a non-`subtle` fallback (the repo already ships `@noble/hashes`/`@noble/ciphers`-class code through its dependency closure, ADR-LOG amendment 2026-10-21; whether AES-GCM from noble is acceptable for the keystore is a crypto-review decision, not a hosting one).

---

## 2. Clients: Tor Browser, Tor-routed RPC/relayer, wallets, Node egress

### 2.1 Tor Browser as the client

Tor Browser as the intended client is **unverified in its details** (Tor Browser manual and security-level pages not fetched). Established facts from fetched sources: it can open v3 onion services, handles client-auth keys (T5 pointer), shows the onion icon states in T6, and does not warn for HTTP onions (T5, T6). Behaviour to test rather than assume: security level "Safest" (JavaScript restrictions) versus a React SPA; IndexedDB/localStorage persistence; private-window storage; letterboxing/fingerprint effects on QR rendering; whether `navigator.clipboard` works.

### 2.2 Wallet extensions in Tor Browser

**Unverified.** The Tor support page about installing extensions returned 404 on the mirror. The app discovers wallets by EIP-6963 plus a labelled `window.ethereum` fallback (`apps/web/src/lib/wallet.ts`); WalletConnect-style adapters are not built (`apps/web/DEVIATIONS.md` item 7). What the repo already requires and has not done: "Test Tor/RPC fallback and measure IP/DNS leakage with controlled endpoints, **including wallet RPC traffic**" (playbook line 323). The central risk is independent of Tor: a wallet extension talks to *its own* RPC provider (often a vendor's), and that connection is outside GhostPay's control. Whether that traffic goes through Tor Browser's proxy for an installed extension: **unverified**. Treat "payer connects a wallet" as a metadata leak to the wallet vendor/RPC unless proven otherwise. Hardware or air-gapped signing is the clean alternative but is not built.

### 2.3 SOCKS5h from Node (relayer egress over Tor)

Verified from N1 (socks-proxy-agent 10.1.0 source, `dist/index.js` `parseSocksURL`):

| URL scheme | Hostname resolved locally? |
|---|---|
| `socks://` (no version) | no (remote; comment says "default to 5h") |
| `socks5h://`, `socks4a://` | no (remote) |
| `socks5://`, `socks4://` | **yes** (`lookup = true` -> local `dns.lookup`) |

So `socks5://127.0.0.1:9050` would leak every RPC hostname to the local resolver; `socks5h://` or `socks://` must be used. Tor side (T1, T2): Tor supports SOCKS4/4a/5, SOCKS5 USERNAME/PASSWORD "used as a method to implement stream isolation", a `RESOLVE` extension (0xF0), and `SafeSocks 1` makes tor "reject application connections that use unsafe variants of the socks protocol -- ones that only provide an IP address, meaning the application is doing a DNS resolve first"; `TestSocks 1` logs which variant each connection used. Therefore: set `SafeSocks 1` on the relayer's dedicated SocksPort as a **fail-closed DNS-leak guard**, and add a startup/CI test that a `socks5://` config fails.

Implementation reality: the relayer's RPC path is Node's global `fetch` (undici), which does not speak SOCKS; `socks-proxy-agent` is an `http.Agent` for `http`/`https`/`ws` modules (N1 README). Using it means replacing `fetchTransport` with an `https.request`-based transport (or an undici dispatcher using a SOCKS connector, which was not researched). Not a drop-in.

### 2.4 Stream isolation

Verified in T1 (`SocksPort` flags): `IsolateClientAddr` and `IsolateSOCKSAuth` on by default; `IsolateDestAddr`, `IsolateDestPort`, `IsolateClientProtocol` optional; `KeepAliveIsolateSOCKSAuth`; `SessionGroup`; different SocksPorts are isolated from each other by default. For the relayer: give **each logical upstream purpose its own SOCKS username** (e.g. random per sweep session vs. a stable one for `eth_gasPrice`/health polling) and use a dedicated SocksPort. For browser users in Tor Browser, per-site isolation is a Tor Browser feature that is **unverified** here.

### 2.5 Reaching chain RPC via Tor: exit versus onion RPC

- **Via exit** (works today with the https/wss rule): provider sees an exit IP, not the user's; the exit sees the destination host and TLS SNI but not JSON-RPC content because it is TLS. Many providers rate-limit or block exits: **unverified**. The playbook says Tor fallback must be measured (line 323).
- **Onion RPC**: the user's own node (`local-scanner-and-rpc.md` option 4 already suggests "your own node reached through Tor onion service") exposed as an onion service. Public RPC providers running onion endpoints: **unverified for every provider**. To use it from the SPA, the app must accept `http://<onion>` (or `ws://`) RPC URLs, which `validateRpcUrl` forbids; CORS on the node must allow the app's origin; and in a non-secure-context page, mixed-content rules (W2 shows how Firefox special-cases `.onion`) must permit it: a plain-HTTP onion RPC from an HTTPS clearnet page would be blocked as mixed content, so onion RPC pairs with the **onion-hosted** SPA only.
- Add client auth (1.2) on the personal-node onion; the browser then needs the key in Tor Browser.

### 2.6 GhostPay-specific correlation and metadata risks (Tor does not remove these)

Established from the repo's own threat model (`THREAT_MODEL.md`, `privacy-limits.md`, `PRIVACY.md`, playbook "Metadata joins" line 291):

1. **Public chain data is unchanged by any overlay**: payer, amount, token, timing, use of the router, and the ERC-5564 announcement (stealth address, ephemeral key, view tag, metadata) are on-chain. Tor hides *who connected*, not *what was posted*.
2. **Relayer sees owner (stealth address), destination, amount, token and timing in the request body** (PRIVACY.md). Tor removes the IP, not these fields; the destination is the linkability bomb (audit D1). A `/v1/quote` and the matching `/v1/sweep` carry the same tuple, so they are linkable to each other by content regardless of circuits; what Tor can prevent is linking *different* sweeps of one seller by circuit/IP, which needs per-sweep isolation.
3. **Relayer as fee payer**: the relayer's hot-key address is the tx sender on every sponsored sweep and `feeTo` is fixed in the signed order, so all of that relayer's sweeps cluster on-chain; a user who sweeps both via relayer and directly leaves two fingerprints. The relayer's own funding transactions link it to its operator unless funded carefully (operator OPSEC, outside the app).
4. **Timing**: payer jitter (Feature 6) exists; a seller who sweeps minutes after a payment lets the payer follow funds (README "A sweep can undo the privacy"). Tor adds latency noise of a different kind but does not decorrelate "announcement at block N, sweep request at N+k". A mixnet with cover traffic (section 5, Nym) addresses *network-observer* timing but, per Nym's own docs, not the destination's view.
5. **RPC read patterns**: scanning downloads all announcements (no address leakage), but sweeping does balance/nonce/code reads on one-time addresses (audit D8): "this circuit cares about this address". Use a distinct circuit for per-address reads versus bulk log scans.
6. **Announcer-event scanning cost** pushes users to few providers, concentrating exposure.
7. **Fragments**: invoice links are bearer secrets and the host never sees the fragment (`THREAT_MODEL.md`); an onion host sees only file requests and the client's circuit.
8. **Host integrity is separate from transport integrity**: a v3 onion address authenticates the *server key*, not the *bundle*; S3-01 (unauthenticated manifest) and S3-04 (self-attested release hash) still apply. Do not describe an onion mirror as "verified".

---

## 3. I2P

### 3.1 Implementations and client plumbing

Verified in I1/I2:

- **Java I2P** and **i2pd** (C++) are the two main routers. SAM is "the recommended protocol for non-Java applications ... supported by multiple router implementations"; "i2pd does not currently support most 3.2 and 3.3 features" (I1 `samv3.html`, 2025-04, API 0.9.66). SOCKS 4/4a/5 exists as a client tunnel but "There is no SOCKS outproxy so it is of limited use" and the project strongly warns that socksifying arbitrary applications is "extremely dangerous" (I1 `socks.html`). BOB is deprecated. I2PControl is a JSON-RPC 2.0 interface, default `https://localhost:7650`, API v1 (I1 `i2pcontrol.html`, accurate for 0.9.52, 2022-01); i2pd documents extra requests (I2 `I2PControl.md`).
- **HTTP proxy**: i2pd defaults `httpproxy.enabled true`, port 4444, `senduseragent false`, `addresshelper true`, optional `outproxy` URL (I2 `configuration.md`); the i2pd tutorial recommends the HTTP proxy for browsing "as i2pd filters certain HTTP request headers" and offers an "I2PD Browser" bundle (a pre-configured Firefox ESR) (I2 `http.md`). Java I2P's HTTP client tunnel strips `Accept*` (except `Accept` and `Accept-Encoding`), `Referer`, `Via`, `From`, replaces Host with b32, and supports HTTPS via CONNECT (I1 `i2ptunnel.html`).

### 3.2 Eepsite hosting, b32 / b33, encrypted leasesets

- **i2pd server tunnel**: `[anon-website] type = http, host = 127.0.0.1, port = 8080, keys = anon-website.dat`; the `.b32.i2p` address is shown in the web console (I2 `http.md`). Tunnel options relevant to an API service: `accesslist`/`whitelist` (allowed b32 clients), `maxconns`-style streaming limits via `i2p.streaming.maxConnsPerMinute`, `gzip`, `enableuniquelocal`, `i2pheaders` (I2 `tunnels.md`).
- **Encrypted LeaseSet2**: server tunnels only (`server`, `http`, `irc`), signature type RedDSA (`signatureType=11`) and `i2cp.leaseSetType=5`; i2pd generates blinded keys and publishes an encrypted LS2; clients reach it with a **b33** address shown in the console. Optional client authorization `i2cp.leaseSetAuthType` 0/1(DH)/2(PSK) (I2 `blinded-addresse.md`). The spec side (I1 `b32encrypted.rst`, 2020-08, accurate for 0.9.47): the address keeps the `.b32.i2p` suffix but is 56+ characters (vs 52) because it contains the unblinded public key, signature types and a checksum, with flag bits for "secret required" and "per-client auth". `encryptedleaseset.rst` (accurate for 0.9.66, 2025-05) specifies the blinding/encryption. Two-source agreement that b33 is a longer `.b32.i2p` form and that encrypted LS needs the public key at the client.
- **i2pd per-client addressing**: with `enableuniquelocal` (default true for IPv4) the connection to the local server comes from `127.x.y.z` derived from the peer's ident hash (I2 `tunnels.md`), and `i2pheaders` can add `X-I2P-*` headers (default listed as true). This gives an HTTP service a per-peer handle that Tor does not (cf. 1.7); whether a browser's I2P destination is stable across visits (making it a tracking handle): **unverified**. Never trust `X-I2P-*` headers if any other path can reach the backend.

### 3.3 Clients and the browser

Browser: configure HTTP proxy 127.0.0.1:4444 (i2pd) or the Java router's default HTTP proxy (port not verified); harden the browser yourself ("Do your own research", I2 `http.md`). Apps: SAM (non-Java) or I2PControl for router management; SOCKS only with care. Server-to-server (relayer RPC egress over I2P) is not a thing: I2P is an in-network overlay, and clearnet RPC needs an **outproxy** (a Java I2P/i2pd HTTP-proxy outproxy; HTTPS CONNECT supported on the Java side per I1). Outproxy risks (not Tor-style exits): the outproxy operator sees destination and, for plain HTTP, content; the i2pd docs example shows a named public outproxy URL (`http://exit.stormycloud.i2p`), so exits are few and operator-run. Reliability, TLS interception and block policies of outproxies: **unverified**.

### 3.4 JavaScript, WebCrypto and secure contexts on I2P

W1 has no rule for `.i2p`; so `http://xxxx.b32.i2p` is not a potentially trustworthy origin by the spec, same as `.onion` (and there is no `.i2p` pref analogous to `dom.securecontext.allowlist_onions` found in W2: grep of `StaticPrefList.yaml` for onion returned only that pref and three unrelated `.onion` comments (HTTPS upgrade, referrer, a hostname pref)). Consequence: the same breakage list as in 1.8 (keystore, envelope, release hash, clipboard) applies and, unlike Tor Browser, there is no known browser that allowlists `.i2p` (**unverified**; the I2P browser-config page fetched is only a template include). Workarounds are the same: an HTTPS server tunnel with a self-signed or privately-issued certificate imported into the I2P browser profile (not tested; **unverified** how I2P Browser/Firefox handles it), or removing `crypto.subtle` dependencies.

### 3.5 I2P versus Tor for this app

| Aspect | Tor | I2P |
|---|---|---|
| Clearnet RPC from the relayer | Mature exit network, SOCKS5h, stream isolation, `SafeSocks` guard (T1, T2) | No exits by design; outproxy only (I1, I2) |
| Hosting a public SPA for strangers | Tor Browser is a common client; Onion-Location discovery (T5) | Needs an I2P router + configured browser; smaller audience (**unverified** sizing) |
| Server DoS controls | PoW, intro DoS, stream caps (T1) | `accesslist`, streaming conn limits (I2) |
| Private service | x25519 client auth (T1, T5) | Encrypted LS2 + DH/PSK client auth (I2) |
| Per-client abuse handle | none | `127.x.y.z` per peer (I2) |
| Browser secure context | Unverified for Tor Browser; no for others | No known allowlist |
| Docs and maintenance | Tor 0.4.9.11 current in the pool | i2pd 2.59.0 and Java I2P repo active (HEAD 2026-10-20) |

Verdict: I2P is a plausible **secondary hosting mirror for the static SPA** and a possible home for a **relayer reachable only to I2P users**, but it cannot replace Tor for the "hide my IP from the RPC provider" client goal.

---

## 4. Recommendation for GhostPay

### 4.1 Architecture (target, behind ADR-0015)

```
 Payer / seller (Tor Browser)
   |  http(s)://<web>.onion  (public v3 onion, PoW on)         static dist/, headers from _headers
   |  http(s)://<web>.onion/v1/*  OR  http://<relayer>.onion   relayer (public v3 onion, PoW on, MaxStreams low)
   |                                     |
   |                                     +--> relayer process --SOCKS5h, per-session auth--> tor (separate instance) --> RPC (https via exit, or own-node onion)
   +--> RPC for scan/read: user-chosen; own node as client-authorised onion preferred; exit-routed https as fallback
 Clearnet primary (Cloudflare Pages) advertises Onion-Location (HTTPS page -> .onion) and the signed release lists the onion address + artifact hash
```

Principles: (1) onion mirror serves byte-identical `dist/` from the signed release; (2) the relayer stays a separate onion with its own hot key and budget; (3) clients do bulk scans and per-address reads over separate circuits; (4) overlays hide network identity, not on-chain linkage, and the UI copy must say so (privacy-limits).

### 4.2 Delta to the threat model

| Area | New or changed risk | Control |
|---|---|---|
| Hosting | Onion host operator is a new Frontend-compromise point (same class as audit D7) | Dedicated host; deploy only signed tag; hash compare with clearnet and IPFS mirror (playbook line 328) |
| Key custody | Onion identity key theft = impersonation of the mirror | Offline encrypted backup; rotation procedure; publish address in signed manifest |
| Advertising | Compromised clearnet host can advertise a rogue onion via Onion-Location | Address also in signed release and out-of-band channels |
| Abuse | Per-IP limits meaningless behind tor (1.7) | PoW, stream cap, per-owner and budget limits |
| Secure context | `crypto.subtle` features fail on HTTP onions in non-allowlisting browsers | Decide HTTPS onion vs feature fallback; test on shipped Tor Browser |
| Egress | Relayer RPC becomes a Tor-exit-path user: provider blocks, exit sees SNI | Fallback provider list, own node onion option |
| DNS | `socks5://` misconfig leaks hostnames locally | `socks5h`, tor `SafeSocks 1`, startup check |
| Correlation | Overlay creates a false sense of unlinkability | Copy and docs: overlays do not hide announcements, sweep destination, relayer fee-payer cluster |
| Wallet | Extension traffic outside GhostPay control | Documented leak; test per playbook line 323 |
| Availability | Onion DoS, descriptor churn | PoW, MaxStreams, OnionBalance for static only |

### 4.3 CSP / config flags that would be needed (names are proposals)

Web (an onion build profile, e.g. `VITE_HOSTING_PROFILE=onion`):

- Separate `_headers.onion` and meta CSP. `connect-src 'self'` plus an explicit allowlist: `http://<relayer>.onion` (only if the relayer is a separate onion) and any user-chosen onion RPC origins; drop the broad `https: wss:` in this profile if the product can accept "RPC = same-origin proxy or listed origins" (this would also shrink S3-11, but changes UX; owner decision). Whether a CSP host-source `*.onion` wildcard is accepted by browsers: **unverified**; prefer exact hosts. Never `http:` wholesale. No `upgrade-insecure-requests`.
- Settings validators: opt-in acceptance of `http://<56-char-v3>.onion[:port]` (and `ws://`) for RPC and relayer, only when `location.hostname` ends in `.onion`; keep https/wss-only for the clearnet build. Update `scan-bundle.mjs` to allow the profile's onion literals and nothing else.
- `Onion-Location` added to the clearnet `_headers` only after the onion address exists.

Relayer:

- `allowedOrigins`: accept exact `http://<56>.onion` origins under an explicit `allowOnionOrigins` flag; same-origin onion proxying still sends `Origin`.
- `upstream.socks`: `{ url: "socks5h://127.0.0.1:9150", isolateBy: "session" }`; refuse `socks5://` and `socks4://` at config validation (N1 semantics); require tor `SafeSocks 1`.
- `listen`: add a Unix-socket option so tor reaches the relayer without loopback TCP.
- `rateLimit`: new mode `bucketBy: "owner+global"` (no per-IP) when `trustProxyHops` cannot discriminate clients; document that per-IP is disabled behind onion.
- Tor config shipped as an operator template (not a secret): `HiddenServicePoWDefensesEnabled 1`, `HiddenServiceEnableIntroDoSDefense 1` with explicit rate/burst, `HiddenServiceMaxStreams`, `HiddenServiceMaxStreamsCloseCircuit 1`, client auth for staging.

### 4.4 Tests required (before any claim)

1. Header snapshot test for the onion `_headers` and meta CSP; bundle-scan test that onion literals are the only `http://` allowed.
2. Playwright egress test run against the onion profile: no request outside same-origin, the configured relayer onion and configured RPC (the existing egress test covers parse/review only; audit 01 item 12).
3. Secure-context matrix: load the SPA from a non-secure origin (e.g. plain-HTTP LAN host) and assert graceful, user-visible failure for keystore/envelope/clipboard rather than a crash; repeat on real Tor Browser release.
4. SOCKS transport unit tests with a fake SOCKS5 server: assert the CONNECT carries a domain name (no local resolution), a unique username per session, and that `socks5://` config is rejected.
5. Integration (isolated runner, never PR-triggered): real tor with `SafeSocks 1`; verify `TestSocks` shows only safe requests; verify no non-Tor DNS from the relayer container (network namespace with no resolver).
6. Descriptor/PoW check: `tor --list-modules` shows `pow: yes`; a load test with and without PoW against the relayer onion.
7. Wallet leak measurement and RPC fallback tests listed at playbook line 323; Tor-exit-blocked-provider fallback test.
8. Release test: SHA-256 of served files over clearnet, IPFS and onion are identical (playbook line 328); key-rotation drill (line 331).

### 4.5 Phased plan

| Phase | Scope | Exit criteria |
|---|---|---|
| P0 | Decide owner questions (Q1-Q4 below); fix wording in `mirror-hosting.md`; add this research to the docs index | Written decisions in ADR log |
| P1 | **Static onion mirror only**, testnet manifests, staging behind client auth; PoW on; manual Tor Browser compatibility run (secure-context behaviour, storage, wallet) | Tests 1, 3, 6, 8 pass; results recorded |
| P2 | Client-side: documented Tor Browser workflow, own-node onion RPC guide, app option for onion RPC/relayer URLs | Tests 2, 7 pass |
| P3 | Relayer egress over Tor (SOCKS5h, isolation), no-onion-server first (relayer still https clearnet) | Tests 4, 5 pass |
| P4 | Relayer as onion service (public or client-authorised) | Abuse model (1.7) validated under load |
| P5 | Optional: I2P mirror of the static SPA; IPFS pin as integrity mirror; evaluate Nym mix-fetch as an experimental client transport | Separate ADR for each |

### 4.6 Open risks

- Tor Browser secure-context behaviour for `.onion` is unverified; if false, the HTTPS-onion or no-`subtle` path is mandatory.
- Wallet extensions in Tor Browser: unverified, likely the largest practical leak.
- Relayer cannot be IP-rate-limited behind tor; abuse resistance relies on tor-level PoW whose packaging (`--enable-gpl`) is unverified.
- RPC provider acceptance of Tor exits unverified; public onion RPC endpoints unverified.
- The Tor docs used are mirrors that may be stale; re-verify against `community.torproject.org`, `spec.torproject.org`, the current tor manual and the Tor Browser manual before publishing operator guidance.
- Single-key custody of the onion identity and the hot key on the same host is a bad combination; keep them on separate machines.
- Legal/compliance: an onion-hosted relayer with default allow-all `PolicyGate` has the same ADR-0006 exposure; anonymity of the operator does not remove the owner's responsibility.
- Over-claiming: an onion URL could be mis-read as "payments are anonymous". Copy must not say that.

---

## 5. Other overlay networks

Evidence: README/docs cloned 2026-10-21; "HEAD" is the date of the latest commit in a shallow clone (a lower bound on activity, not a health rating). Maturity statements beyond those files are unverified.

| Network | Anonymity model (from its own docs) | Can host arbitrary HTTP (SPA + relayer API)? | Browser secure context / WebCrypto / service worker | Maintenance (HEAD) | Client-side use for hiding relayer/RPC timing |
|---|---|---|---|---|---|
| **Lokinet** (Oxen) | "layer 3 onion routing protocol (LLARP)"; client can see only one of {your IP+encrypted data, exit's view of a `.loki` address}, "never both" (`docs/net-comparisons.md`); `.loki` services published anonymously; exits are opt-in and manually chosen | Yes in principle: IP-level, any TCP service on a `.loki` address; docs do not give a hosting walkthrough (`snapps-dev-guide.md` is "TODO") | Not documented. `.loki` over HTTP is not on W1's trustworthy list, same as `.onion`/`.i2p`. No Lokinet-aware browser ("does not provide a web browser") | 2026-07-08 (last commit: apt signing key update); activity level otherwise **unverified** | Possible via system VPN-style interface with an exit; docs say exit selection is out-of-band; no isolation/PoW features documented |
| **Nym mixnet** | Sphinx packets through 3 mix layers with per-hop delays, Poisson sending and cover traffic; resists network-level observers; docs state mixing "does not protect you against the server you are talking to" (`network/threat-model/two-layer-model.mdx`). Per-request exit rotation "not available in the SDKs yet": the destination can group your requests (`choose-config.mdx`, 2026-07-29) | Not as a public web host for unmodified browsers. Services talk to Nym clients ("end to end"), clearnet reached via exit gateways/IPR | `@nymproject/mix-fetch` v2: browser `fetch()` replacement running smolmix WASM in a Web Worker, WebSocket to the entry gateway, rustls TLS inside WASM, IPR exit (docs `lastUpdated` 2026-06-05). CSP needs: connect to the gateway over `wss:` (already allowed by `https: wss:`), and WebAssembly instantiation under `script-src 'self'` may need `'wasm-unsafe-eval'`: **unverified**, must be tested | 2026-10-20 (very active) | **Best-documented timing-hiding client option**: fits the browser model and the scan/sweep pattern; costs latency; relayer would still see content; needs an architecture ADR; the project's docs even frame wallet queries as the use case ("server cannot tell which addresses I care about" vs "can group my queries, but they are padded and decorrelated") |
| **Katzenpost** | Post-quantum mix network designed against passive global adversaries; "mere end to end encryption alone cannot protect against" traffic analysis (`README.md`); Pigeonhole storage layer atop it (ephemeral boxes, ~2 weeks) | No: messaging and an append-only storage layer, not HTTP hosting | N/A for a web page; no browser client documented in the fetched README | 2026-10-17 | Not a drop-in transport for JSON-RPC/HTTP; a custom client would be research work. Possible future channel for out-of-band invoice delivery (not designed) |
| **Yggdrasil** | "end-to-end encrypted IPv6 network", "early-stage implementation" (`README.md`). No anonymity claim in the fetched files; peers see IP addresses (**unverified**, not stated in fetched files) | Yes, any IPv6 app, but node IPv6 address is stable and derived from the key | `http://[200:...]` is not a secure context by W1 (no rule) | 2026-10-08 | Encryption and routing only: does not hide who talks to whom from peers: not an anonymity option |
| **cjdns** | "encrypted IPv6 network using public-key cryptography ... distributed hash table for routing". FAQ: "No, Cjdns is not anonymous, nor is it intended to be" (`doc/faq/general.md`) | Yes (IPv6 apps) | Same non-secure-context outcome | 2025-12-10 | Not an anonymity option |
| **Hyphanet (Freenet), `fred`** | "censorship-resistant communication and publishing ... distributed, encrypted, decentralized datastore" (`README.md`); darknet/opennet modes appear in `NEWS.md`; formal anonymity properties **unverified** | Static "freesites" through the node's local web interface (127.0.0.1) with a content filter (`ContentFilterToadlet` exists in source); an interactive relayer API is not a fit; whether it strips JS: **unverified** | Served from the local node over plain `http://localhost`-class origin (secure per W1 because loopback), but content filtering likely breaks an SPA: **unverified** | 2026-09-19 | High latency, store-and-forward; not a fit for RPC/relayer calls |
| **GNUnet** | Not fetched (clone and access failed) | **Unverified** | **Unverified** | **Unverified** | **Unverified** |
| **IPFS (Kubo)** | Not an anonymity network. The fetched config doc notes TLS/HTTP2 are required for delegated routing providers "for privacy reasons" (`docs/config.md`); no anonymity claim | Yes for **static** content: gateway and subdomain gateway at `http://localhost:8080/` give each content root its own origin (`docs/gateway.md`); no dynamic API hosting | `*.localhost` / loopback gateway origins are potentially trustworthy per W1 rule 4-5, so a **local** gateway gives a secure context on plain HTTP; a remote gateway is just another host (as `mirror-hosting.md` already says) | 2026-09-27 | Integrity layer (CID = content hash) for the static bundle; reach it through Tor/local gateway to avoid exposing which CID you fetch. Does not hide relayer/RPC timing |
| **Veilid** | "peer-to-peer network for easily sharing various kinds of data", aimed at social-media style data; its core README mentions "private routed operations" (a routing context). Anonymity guarantees not verified | Not an HTTP hosting platform | N/A | 2026-10-18 (GitLab) | Library for Rust/Flutter apps; no browser/HTTP story fetched |
| **Reticulum** | Cryptography-based networking stack; "initiator anonymity ... does not include source addresses on any packets"; X25519/Ed25519, forward secrecy available; **not IP-based** (can use IP as a carrier) (`README.md`). The repo is a read-only mirror and carries a warning about fake/LLM-generated imitations | No standard HTTP; apps are Reticulum-native | N/A for browsers | 2026-09-30 (mirror) | Not applicable to browser + EVM RPC; only conceivable via custom gateways |

### 5.1 Ranked recommendation (hosting, then client transport)

**Hosting the SPA and relayer**

1. **Tor v3 onion services**: only option with verified operator controls (PoW, intro DoS, stream caps, client auth, Onion-Location), a large Tor Browser client base and clearnet egress for the relayer. Main gap: secure-context uncertainty.
2. **I2P eepsite (static SPA; optionally relayer for I2P-native users)**: verified server tunnels, encrypted leasesets, b33, SAM/I2PControl; no exits, no secure-context path, smaller audience.
3. **IPFS static pin** *(integrity mirror, not privacy)*: complements both; local-gateway origin is a secure context.
4. **Lokinet**: architecturally able to host arbitrary TCP, but the fetched docs are thin (apps guide "TODO"), no browser, uncertain activity.
5. Not suitable as hosts for this app: Nym (client transport), Katzenpost, Veilid, Reticulum, Hyphanet (static, filtered), Yggdrasil and cjdns (no anonymity). GNUnet: not assessed.

**Client-side transport to hide relayer/RPC timing**

1. **Tor via SOCKS5h with stream isolation** (browser: Tor Browser; relayer: dedicated SocksPort), verified controls in section 2.
2. **Nym mix-fetch** *(experimental, ADR first)*: stronger against network-level timing observers, still shows the destination everything; per-request exit rotation not shipped; WASM + CSP unverified.
3. **I2P** only for I2P-hosted components.
4. Others: not applicable.

---

## 6. Unverified claims (explicit list)

- Tor Browser sets `dom.securecontext.allowlist_onions` (or otherwise treats HTTP onions as secure contexts). Chromium behaviour for `.onion`.
- `crypto.getRandomValues`, IndexedDB and localStorage availability on non-secure origins and in Tor Browser private windows.
- Names/permissions of files inside `HiddenServiceDir`; Tor Browser UI for client-auth keys; revocation behaviour beyond what T5 states.
- Whether current tor gives onion *services* vanguards-lite by default; whether distro tor packages are built with `--enable-gpl` (PoW puzzle libraries).
- Whether Let's Encrypt (or any CA other than DigiCert/HARICA) issues onion certificates today (T5 is dated).
- OnionBalance interaction with client auth and PoW; Whonix guidance (no Whonix doc fetched at all).
- Wallet extensions in Tor Browser: install policy, network path, DNS behaviour.
- Tor-exit acceptance by RPC providers; existence of onion RPC endpoints at any provider.
- Tor Browser per-site circuit isolation and "Safest" level versus a React SPA.
- Java I2P default HTTP proxy port and desktop behaviour; stability of a browser's I2P destination across sessions; HTTPS-with-self-signed handling in I2P browsers; outproxy reliability/policy; any `.i2p` secure-context allowlist.
- Browser acceptance of a CSP `*.onion` host-source; Nym mix-fetch needing `'wasm-unsafe-eval'`.
- Lokinet recent activity beyond the last commit date; Yggdrasil peer IP visibility; Hyphanet anonymity properties and JavaScript filtering; Veilid anonymity guarantees; all GNUnet claims.
- The currency of all mirror-sourced Tor documents (T2-T6, T8) versus `community.torproject.org` / `spec.torproject.org` / GitLab.
- Undici/SOCKS connector options for Node `fetch` (only `socks-proxy-agent` with `http`/`https` modules was inspected).

## 7. Owner questions

- Q1. Is operator anonymity for the relayer a requirement (full onion + separate outbound tor), or is location-hidden hosting not needed (then onion adds little for the server side)?
- Q2. HTTPS onion (CA certificate, public CT entry) versus plain HTTP onion plus a `crypto.subtle` fallback?
- Q3. Accept a narrower onion-profile CSP (`connect-src` allowlist) even if it constrains user-chosen RPC URLs?
- Q4. Is a Nym mix-fetch experiment in scope after the Tor phases, or explicitly out?
