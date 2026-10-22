# GhostPay hosting research

Retrieved: 2026-10-21 (all "retrieved" dates below are this date unless stated). Nothing was enabled or changed by this research.

## 0. Method and evidence quality (read first)

- The sandbox proxy denied outbound HTTPS to nearly all vendor sites (docs.github.com, developers.cloudflare.com, cloudflare.com, netlify.com, vercel.com, fly.io, hetzner.com, render.com, railway.com, pinata.cloud, ipfs.tech, ens.domains, torproject.org, letsencrypt.org, mdn). Only `raw.githubusercontent.com` worked.
- Therefore **primary-source claims** below cite the *source files of the vendor docs repositories* on raw.githubusercontent.com (e.g. `github/docs`, `cloudflare/cloudflare-docs`, `superfly/docs`, `ipfs/ipfs-docs`, `mdn/content`, `ethlimo/documentation`). These are the text behind the rendered docs but may be a few days ahead of or behind the live site, and contain template tags (`{% ifversion %}`). Status: **PRIMARY-SRC**.
- Claims taken from search-engine summaries of third-party/aggregator pages are marked **SECONDARY** (prices especially). Claims with no source found are marked **UNVERIFIED**. Do not treat SECONDARY or UNVERIFIED prices as quotes.
- Fly.io docs moved to Mintlify on 2026-09-23 (README of `superfly/docs`); paths cited are the new `.mdx` tree.

## 1. GitHub Pages

| Question | Finding | Status / source |
|---|---|---|
| Custom response headers? | **No documented mechanism.** Neither the publishing-source doc nor the limits doc mentions any header configuration; Pages is a fixed static server. Search summaries state the same. | UNVERIFIED as a negative (absence in docs); https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md ; SECONDARY search 2026-10-21 |
| `_headers` file | **Not a Pages feature** (it is a Cloudflare Pages/Netlify convention). No mention in GitHub docs. | UNVERIFIED negative; treat as unsupported |
| Meta CSP vs header | `frame-ancestors` is "not supported in the `<meta>` element". MDN also lists `sandbox` and `report-uri` as header-only in meta context (verify per directive page); `Content-Security-Policy-Report-Only` cannot be delivered by meta. So under Pages: no anti-framing protection, no CSP reporting. | PRIMARY-SRC https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/content-security-policy/frame-ancestors/index.md (frame-ancestors only). report-only/sandbox/report-uri in meta: SECONDARY, https://dbushell.com/2020/02/28/http-security-headers-and-inline-resources/ (search result, not opened) |
| Referrer-Policy, Permissions-Policy, COOP/CORP | Not settable by header. `<meta name="referrer">` exists in the HTML spec (not re-verified here). Permissions-Policy, COOP, CORP have no meta equivalent (standard browser behaviour, not re-verified here). | UNVERIFIED |
| Private-repo Pages by plan | Pages: public repos on Free / Free-for-orgs; public **and private** repos on Pro, Team, Enterprise Cloud, Enterprise Server. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/data/reusables/gated-features/pages.md |
| Private repo = private site? | **No.** "Pages sites are publicly available on the internet, even if the repository for the site is private". Private *publishing* (access control) exists only on GitHub Enterprise Cloud org project sites. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/private_pages_are_public_warning.md ; https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site.md |
| Custom domain + HTTPS | All Pages sites incl. custom domains support HTTPS + Enforce HTTPS. Cert is requested from Let's Encrypt after a DNS check. If CAA records exist, "at least one CAA record must exist with the value `letsencrypt.org`". Domain name must be < 64 chars. Apex: 4 A (185.199.108-111.153) and 4 AAAA (2606:50c0:8000-8003::153) records, or ALIAS/ANAME; `www` subdomains are "the most stable". Domain verification (TXT) blocks takeover by other GitHub users, incl. immediate subdomains. There is a "wildcard DNS warning" - avoid wildcard records. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https.md ; .../configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site.md ; .../troubleshooting-custom-domains-and-github-pages.md ; .../verifying-your-custom-domain-for-github-pages.md |
| DNSSEC with Pages | Not addressed in docs found. | UNVERIFIED |
| Caching | Pages Cache-Control/ETag behaviour not documented in sources found (commonly short max-age, not verified). Not controllable. | UNVERIFIED |
| Usage limits | Published site <= 1 GB; source repo recommended <= 1 GB; deploy times out at 10 min; **soft** 100 GB/month bandwidth; **soft** 10 builds/h (not applicable with a custom Actions workflow); rate limiting returns HTTP 429; exceeding quotas may lead to site not served or an email suggesting a CDN. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md |
| Logging | "the visitor's IP address is logged and stored for security purposes, regardless of whether the visitor has signed into GitHub or not." No access logs exposed to site owner (not documented either way). | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/what-is-github-pages.md (line ~92) |
| ToS: commercial / payments | Quote: "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)." and "GitHub Pages sites shouldn't be used for sensitive transactions like sending passwords or credit card numbers." **Risk: MEDIUM** for a payment-link app that takes a 25 bps fee (FEE_SCHEDULE), even though the app is a non-custodial static client and sends no secrets to the host. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md ; https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/no_sensitive_data_pages.md |
| ToS: crypto | AUP prohibits "cryptocurrency mining" and "using our servers for any form of excessive automated bulk activity ... to place undue burden on our servers". Incentives "such as cryptocurrency airdrops, tokens" tied to inauthentic engagement are prohibited. Nothing prohibits hosting a crypto-payment client per se. **Risk: LOW-MEDIUM** (enforcement is discretionary). | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/site-policy/acceptable-use-policies/github-acceptable-use-policies.md (lines ~59-69) |
| Actions deploy | Source = "GitHub Actions"; template flow: checkout -> (configure-pages) -> upload-pages-artifact -> deploy-pages. Env `github-pages`; docs "recommend that you add a deployment protection rule so that only the default branch can deploy". Job needs `pages: write` and `id-token: write`. Artifact: name `github-pages`, one gzip'd tar, **no symlinks/hard links**, <= 10 GB hard (1 GB supported), default `retention-days: 1`. | PRIMARY-SRC https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site.md ; https://raw.githubusercontent.com/actions/deploy-pages/main/README.md ; https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md ; https://raw.githubusercontent.com/actions/configure-pages/main/README.md |
| OIDC | deploy-pages mints a per-job OIDC token; the token's branch/ref claim is validated by the Pages deployment API against branch/environment protection. That is why both `pages: write` and `id-token: write` are needed. No cloud secret is needed. | PRIMARY-SRC https://raw.githubusercontent.com/actions/deploy-pages/main/README.md (section OIDC) |

Other Pages notes: Vite `base: './'` is already set in `apps/web/vite.config.ts`, so a project-site path (`/ghostpay/`) works without rebasing. Hash-routing/fragment is never sent in HTTP requests (standard HTTP behaviour, not re-verified here), so Pages' IP log does not capture `#gpi=`; the real fragment risks are Referer leakage (mitigated by meta referrer + `noreferrer`) and any third-party JS (none by spec).

## 2. Cloudflare Pages / Workers

| Item | Finding | Source |
|---|---|---|
| `_headers` | Plain file `_headers` in the static asset dir; applies to static asset responses only, **not** to Pages Functions/Worker responses. Syntax: URL pattern line, indented `Name: value`. Single splat, placeholders. Matching rules merge; duplicate header values are joined with comma. `! Header` detaches a default. Redirects are applied before headers. Example in docs sets `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy ... frame-ancestors 'none'`. **Limits: 100 header rules; 2,000 characters per line** (a long CSP must fit one line, so keep it < 2,000 chars). | PRIMARY-SRC https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/pages/configuration/headers.mdx |
| COOP/CORP | Any header name can be set via `_headers` (docs show arbitrary names); COOP/CORP not specifically tested. | PRIMARY-SRC (same) ; specific COOP/CORP behaviour UNVERIFIED |
| Free limits | 500 builds/month, 1 concurrent build, 20 min build timeout; 100 custom domains/project; 20,000 files/site; 25 MiB/file; 100 projects/account; unlimited preview deployments. | PRIMARY-SRC https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/pages/platform/limits.mdx |
| Direct upload | Lets CI push the already-built, hash-verified artifact (no Cloudflare-side build), which fits reproducible-build verification. Flow details not re-verified here. | UNVERIFIED (not opened) |
| Workers static assets | Same `_headers` file and same 100/2,000 limits apply. Static asset requests "free and unlimited". Docs are steering new projects to Workers; Pages still documented. Prefer Workers static assets for new projects if Pages is later deprecated (no deprecation notice read; check). | PRIMARY-SRC https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/workers/static-assets/headers.mdx ; .../workers/platform/pricing.mdx |
| Workers pricing | Free: 100,000 requests/day, 10 ms CPU/invocation. Paid: **$5/month minimum**, 10M requests + 30M CPU-ms included, then $0.30/M requests and $0.02/M CPU-ms; no egress charge. | PRIMARY-SRC https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/workers/platform/pricing.mdx ; .../workers/platform/limits.mdx |
| Workers as the relayer | Possible technically (secrets, cron), but the relayer needs nonce/queue state and a long-lived signer with bounded latency; that would need Durable Objects and a `nodejs_compat` rewrite of a `viem`-on-Node service. 10 ms CPU on Free is too low for secp256k1 + RPC work. **Not recommended**; the existing `apps/relayer` is a Node 22 Docker service. | Reasoned from limits above; nodejs_compat/viem compatibility UNVERIFIED |
| ToS on crypto | No cryptocurrency-specific prohibition found. Self-Serve agreement previously had section 2.8 (restricts disproportionate non-HTML content); search summaries say it was removed in 2023 and Developer Platform supplemental terms permit non-HTML on Pages/Workers except video. Exact current clause text **not read**. Community post notes a restriction against processing card data. | SECONDARY https://www.cloudflare.com/terms/ (not opened), https://news.ycombinator.com/item?id=35961697 ; UNVERIFIED quotes. Read the live Self-Serve Subscription Agreement + Developer Platform Service-Specific Terms before relying |
| Logging/privacy | Cloudflare terminates TLS and sees visitor IPs, URLs (not fragments) and headers; it is a third-party observer. Retention defaults not verified. | UNVERIFIED (retention); fragment point is standard HTTP |

## 3. Netlify, Vercel, and relayer hosts

| Host | Header control | Cost (retrieved 2026-10-21) | Notes / ToS | Status |
|---|---|---|---|---|
| Netlify | `_headers` file (convention; the repo's APP_AND_RELAYER_SPEC already assumes it) | Free plan reported as 300 credits/mo; production deploy 15 credits; bandwidth ~10-20 credits/GB (sources disagree). Credit-based pricing since 2026 | AUP/crypto clause not found | SECONDARY https://netli.fyi/blog/netlify-pricing-and-limits ; _headers support UNVERIFIED here |
| Vercel | `vercel.json` headers | Hobby free, but "restricted to non-commercial personal use only"; commercial = "any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project" incl. "taking payments from visitors"; donations are not commercial | **ToS risk HIGH on Hobby** for a fee-taking payment app; Pro required | SECONDARY (search summary of https://vercel.com/docs/limits/fair-use-guidelines, not opened) |
| Fly.io (relayer) | n/a (Node app sets its own headers/TLS) | shared-cpu-1x 256 MB: **$2.19/month**; 512 MB $3.69; dedicated IPv4 **$2/mo**; static egress IP **$0.005/h (~$3.60/mo)** per region (IPv6 not billed separately); volume $0.15/GB/mo; outbound $0.02/GB NA/EU; certs: first 10 hostnames free | Secrets: "encrypted and stored in a vault... The API servers can only encrypt"; "secret values are never logged"; but "People with deploy access **can** deploy code that reads secret values and prints them to logs". Logs: stdout via Vector -> NATS; Grafana log search "retains logs for 7 days". Region selectable per Machine. Fly proxy-level request logging/IP retention not found. | PRIMARY-SRC https://raw.githubusercontent.com/superfly/docs/main/about/pricing.mdx ; .../apps/secrets.mdx ; .../monitoring/logging-overview.mdx ; .../networking/egress-ips.mdx |
| Hetzner Cloud VPS (relayer) | n/a | Prices rose 2026-04-01 and again ~2026-06-15; CX22 reported EUR ~4-4.5/mo, CX23 EUR 3.99, CX33 EUR 6.49 (sources conflict; cost-optimized lines reported "unavailable" 2026-09-07). Budget **EUR 5-8/mo**, verify on Hetzner | Full control: no platform log unless you create one; EU (DE/FI) or US regions; included IPv4 static; hot key on disk (use systemd credentials / tmpfs, not env on a shared box) | SECONDARY https://agentdeals.dev/hetzner-pricing-2026 ; https://www.bitdoze.com/md/hetzner-cloud-cost-optimized-plans.md ; https://www.vincentschmalbach.com/hetzner-cheap-cloud-unavailable-price-increases/ |
| Render | n/a | Starter ~$7/service/mo; free tier sleeps after 15 min (unusable for a relayer) ; aggregator reports a 2026 plan restructure (conflict) | static outbound IPs / log retention not verified | SECONDARY https://costbench.com/compare/railway-vs-render/ |
| Railway | n/a | Hobby $5/mo with usage billing; conflicting free-credit claims | secrets handling / static IP / retention not verified | SECONDARY https://www.kunalganglani.com/blog/render-vs-railway-2026 |

## 4. IPFS, pinning, gateways, ENS

- IPFS public gateways (`ipfs.io`, `dweb.link`) are hosted "on a best-effort basis ... not intended to be part of your critical path or production infrastructure." Shared rate limits. PRIMARY-SRC https://raw.githubusercontent.com/ipfs/ipfs-docs/main/docs/concepts/public-utilities.md
- Path gateways "do not provide origin isolation and should not be used for hosting web apps"; subdomain gateways (`{CID}.ipfs.{gateway}`) give origin isolation per CID. PRIMARY-SRC https://raw.githubusercontent.com/ipfs/ipfs-docs/main/docs/concepts/ipfs-gateway.md
- Header limitation: no public gateway documents per-CID header configuration (CSP, frame-ancestors, COOP/CORP). Ship a strict **meta CSP** inside `index.html` and treat IPFS as a header-degraded mirror, same as GitHub Pages. eth.limo says custom headers (e.g. for SharedArrayBuffer) are a **support-ticket request**, not self-service: https://raw.githubusercontent.com/ethlimo/documentation/master/introduction/what-is-eth.limo/gateway-basics/README.md (PRIMARY-SRC). It also states "security headers and per-site origin isolation" are applied by default; actual header values not documented there.
- Pinning: data persists only while pinned; "If that one sponsor stops paying for that pinning, the content may be lost entirely." Providers named by IPFS docs: 4EVERLAND, Filebase, Pinata, with a warning that "There is no guarantee that these third party companies will continue to maintain their pinning service." PRIMARY-SRC https://raw.githubusercontent.com/ipfs/ipfs-docs/main/docs/concepts/persistence.md . Pinata: Free ~1 GB, Picnic ~$20/mo (SECONDARY, aggregator, https://www.trustradius.com/products/pinata-cloud/pricing ). web3.storage successor (Storacha) and Fleek: **UNVERIFIED** (no usable result). Self-hosted Kubo node on the relayer VPS is the cheapest independent pin; pin on >= 2 independent providers.
- ENS contenthash: set via the ENS manager as one on-chain transaction by the name's manager; propagation to the gateway needed before it resolves. Gas cost not documented; **UNVERIFIED** (estimate at signing time). Registration fee for a given name: UNVERIFIED. ENS record is mutable by the name owner, so it is a *discovery pointer*, not an integrity guarantee; users must verify CID against the signed release hash (matches DEVELOPER_SPECIFICATION line 418 flow). Sources: https://raw.githubusercontent.com/ethlimo/documentation/master/beginner/configuring-your-ens-name/updating-your-ens-content-records.md ; https://support.ens.domains/en/articles/12275979-add-a-decentralised-website-to-your-ens-name (SECONDARY, search result).
- Reproducibility fit: best of all options (CID is a content hash of the exact build) provided `ipfs add` uses fixed chunker/CID version settings (UNVERIFIED determinism across Kubo versions; record the Kubo version and flags in the release manifest).

## 5. Tor onion mirror

- Setup is `HiddenServiceDir` + `HiddenServicePort` in torrc pointing at a local web server; v3 address in `hostname`; keep the directory private (key leak = impersonation); prefer Unix sockets; optional client authorization. SECONDARY (search summary of) https://community.torproject.org/onion-services/setup/ (not opened).
- Practicalities (UNVERIFIED, from general knowledge, confirm before use): onion sites are plain HTTP unless you obtain a certificate; `Onion-Location` response header advertising the onion from the clearnet site requires header control, so it can only come from the primary host (not GitHub Pages); you operate the mirror (uptime, key backup, updates); the onion mirror serves the same pinned bundle and its hash must be checked against the release manifest; run it on a host separate from the relayer.

## 6. Domain / DNS / DNSSEC / CAA recommendations

1. Use a dedicated registrable domain with a registrar that supports DNSSEC, 2FA/hardware keys and registrar lock. DNSSEC: enable DS at registrar; GitHub Pages compatibility with DNSSEC is **UNVERIFIED** (no doc found) so test on a staging subdomain before switching the production name.
2. Use **subdomains**, not apex: `app.<domain>` (primary host), `mirror.<domain>` (GitHub Pages, CNAME to `<owner>.github.io`), `relay.<domain>` (A/AAAA to relayer). `www` is the most stable for Pages (PRIMARY-SRC above). Avoid wildcard DNS (GitHub warns; takeover risk).
3. Verify the domain in GitHub account/org settings (TXT) before attaching it to Pages, to prevent subdomain takeover after repo deletion/plan downgrade (PRIMARY-SRC verifying-your-custom-domain doc).
4. CAA: `0 issue "letsencrypt.org"` is mandatory for the Pages subdomain if any CAA exists (PRIMARY-SRC); add the CA(s) your primary host uses (Cloudflare Pages issuing CAs: UNVERIFIED, check docs). Optionally restrict with `accounturi` / `validationmethods` per Let's Encrypt docs (SECONDARY, https://letsencrypt.org/docs/caa/). Add `0 iodef "mailto:..."`. Let's Encrypt checks CAA before each issuance, even if none is set (same source).
5. Short TTL (300 s) during cutover, long afterwards. Remove dangling CNAMEs promptly.
6. Cert Transparency monitoring (e.g. crt.sh alerts) on the domain: standard practice, no source needed.

## 7. Comparison table

| Option | Header control | Est. cost/mo (date) | ToS risk (quote + URL) | Privacy / logging | Reproducibility fit |
|---|---|---|---|---|---|
| GitHub Pages | **None** (meta CSP only; no frame-ancestors/report-only) | $0 (public repo) or Pro/Team plan for private-repo source; site is public anyway (2026-10-21) | MEDIUM: "not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions" - https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md | Visitor IP "logged and stored for security purposes"; GitHub sees IP+URL path, not fragment | Good: deploy exact release artifact; no byte-level control of tar |
| Cloudflare Pages / Workers static | `_headers` (100 rules, 2,000 chars/line) | $0 Free; $5 if Workers Paid used (2026-10-21) | LOW-MED, quotes UNVERIFIED (see 2); no crypto clause found | Cloudflare sees IPs; retention UNVERIFIED | Good with direct upload of the verified artifact |
| Netlify | `_headers` | Free tier credit-based (SECONDARY) | UNVERIFIED | Netlify sees IPs; retention UNVERIFIED | Good (CLI deploy of built dir) |
| Vercel | `vercel.json` | Hobby $0 but non-commercial only; Pro required | HIGH on Hobby: "taking payments from visitors" counted as commercial (SECONDARY) | UNVERIFIED | Good |
| IPFS (pinned CID) + gateway/ENS | Gateway-dependent; none self-service (eth.limo: ticket) | Pin $0-20 (SECONDARY); ENS gas UNVERIFIED | Gateway abuse policies only; pinning ToS UNVERIFIED | Gateway sees IPs; no page-level server logs under your control | **Best**: CID = content hash |
| Tor onion | Your own server: full | VPS EUR ~5 (SECONDARY) | Host ToS only | No clearnet IPs; operator sees circuit-level metadata only | Good (same bundle) |
| Fly.io relayer | Node app | $2.19 + $2 IPv4 + $3.60 egress IP ~ **$8/mo** (PRIMARY, 2026-10-21) | Not reviewed (Fly ToS crypto clause UNVERIFIED) | Secrets vault; stdout logs 7-day Grafana search | n/a (Docker image digest pin) |
| Hetzner VPS relayer | Node app | ~EUR 5-8 (SECONDARY, conflicting) | UNVERIFIED | You control logging (turn off access logs, volatile journald) | n/a (image digest) |

## 8. RECOMMENDED topology

1. **Primary web host: Cloudflare Pages (or Workers static assets) with `_headers`** at `app.<domain>`. Deploy by direct upload of the release tarball after `sha256sum -c SHA256SUMS`, not by letting the host rebuild. Headers: strict CSP including `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy` deny-all, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: public, max-age=31536000, immutable` for hashed assets and `no-cache` for `index.html`, `Onion-Location`. Keep CSP < 2,000 chars/line. Fallback if Cloudflare ToS reading is unfavourable: Netlify `_headers` (paid) or a self-run Caddy on the VPS (full header control, zero third party).
2. **GitHub Pages = degraded, unlisted-by-default mirror** at `mirror.<domain>`. It must be built from the *same* release artifact (hash-verified) and must **disable / not do**:
   - Embed/iframe widget mode (S1 already specified "popup-only, no iframe mode": Pages cannot send `frame-ancestors`; mirror must refuse to run framed - see checklist item on frame-busting being a best-effort only).
   - Any claim of clickjacking protection, CSP reporting, COOP/CORP isolation, Permissions-Policy enforcement, or "headers hardened".
   - Any claim that the mirror is anonymous or that the host cannot see users (IP is logged by GitHub; stated above).
   - Auto-upgrading relayer/RPC settings; relayer URL fixed to the build-time allowlist.
   - Analytics, third-party scripts, service worker beyond same-origin (none by spec).
   - Language that GhostPay is a business/e-commerce/payment service on the Pages site itself (ToS quote above); describe it as an open-source client.
3. **IPFS + ENS**: pin the identical bundle on self-hosted Kubo + one third-party pin; ENS contenthash updated only via a protected, hardware-wallet-signed release action. Declared as discovery, with CID verification instructions.
4. **Tor onion mirror** on a separate small VPS, same bundle, published by a protected release action; advertise via `Onion-Location` from primary only.
5. **Relayer**: Fly.io (docs-verified secrets vault, static egress IP $3.60, region pin, one machine + one volume for nonce state, app does not log request IPs/URLs) with Hetzner VPS as the alternative when you want to control all logging; hot key funded with a small float, rotate on suspicion, alert on balance. Fly proxy request logging/retention is UNVERIFIED, so assume Fly can see relayer clients' IPs; same for Hetzner network. Relayer must be a separate origin (`relay.<domain>`) in the web CSP `connect-src`.
6. DNS/CAA per section 6.

## 9. Checklist: turning on GitHub Pages SAFELY for this repo (nothing below has been done)

Pre-conditions
- [ ] Decide repo visibility. Free plan Pages needs a **public** repo. A private repo needs Pro/Team/Enterprise and the site is still public (PRIMARY-SRC section 1). Confirm no secret or private doc is in the repo history.
- [ ] Review GitHub ToS "online business / e-commerce / commercial transactions" text with the owner; record the accepted risk and the mitigation (mirror is a non-custodial open-source client; no credentials or card data handled). If not accepted, stop and keep Pages off.
- [ ] Verify custom domain at account/org level (TXT) *before* adding it to Pages.
- [ ] Add DNS: `mirror` CNAME to `<owner>.github.io`; ensure CAA includes `letsencrypt.org`; no wildcard records.

Workflow requirements (new file, e.g. `.github/workflows/pages-mirror.yml`; do not add `pages` permissions to `release.yml` top level)
- [ ] Trigger: manual `workflow_dispatch` with a release tag input, or on `release: published`. Not on every push, not on `pull_request` (PR runs must never deploy).
- [ ] Build job (`contents: read`, `persist-credentials: false`): download the **already-published release tarball + SHA256SUMS + release-manifest.json** from the draft/published release; verify `sha256sum -c`; verify the attestation (`gh attestation verify`); refuse if the tag is not the signed annotated tag already required by `release.yml`. Do **not** rebuild.
- [ ] Mirror-only transformations are minimal and listed in the manifest: inject the meta CSP (the same policy minus `frame-ancestors`/`report-uri`/`sandbox`), `<meta name="referrer" content="no-referrer">`, and a visible degraded-mirror banner; no other byte changes. Record the resulting file hashes in the job summary. (This breaks byte-identity with the primary; document it, or ship the meta tags in every build so the artifact is identical.) Recommended: ship the meta tags in every build.
- [ ] Artifact: `actions/upload-pages-artifact` (pin by commit SHA like the other actions in this repo); no symlinks/hardlinks; `include-hidden-files: false`; directory contains only the verified bundle.
- [ ] `actions/configure-pages` (only to read metadata; do not let it rewrite the bundle) and `actions/deploy-pages` in a **separate deploy job** with `permissions: { pages: write, id-token: write }`, `environment: github-pages`.
- [ ] Protect the `github-pages` environment: required reviewers = maintainer, deployment branches/tags restricted to the release tags; no environment secrets.
- [ ] `concurrency` group to avoid parallel deploys; `timeout-minutes` < 10 (Pages deployment times out at 10 min).
- [ ] Post-deploy job: fetch the live URL, hash every file, compare to `SHA256SUMS`; fail loudly on mismatch. Check headers manually and record that CSP is meta-only.
- [ ] Enable "Enforce HTTPS" in Pages settings after the certificate is issued.

What stays disabled on the mirror
- [ ] Embed/iframe mode and `postMessage` widget (Feature 2 stays popup-only on the mirror; add a runtime guard `if (window.top !== window.self)` that refuses to render payment UI - best-effort only, not a security boundary).
- [ ] Service worker caching of HTML, push, background sync.
- [ ] Any telemetry, error reporting or CSP report endpoint.
- [ ] Any admin/relayer-config page that accepts relayer URLs outside the build-time allowlist.

Claims the mirror page and docs must NOT make
- "Clickjacking-proof", "framing blocked", "CSP-enforced reporting", "COOP/CORP isolated", "Permissions-Policy enforced".
- "Anonymous", "untraceable", "GitHub cannot see you" (GitHub logs visitor IPs).
- "Official/primary site" (mirror is degraded and unlisted; primary is `app.<domain>`).
- "Audited" / "verified reproducible" unless the verification evidence exists and is linked.
- Any statement that the host is a payment processor or business storefront (ToS).

Rollback
- [ ] Disable Pages (Settings > Pages > Unpublish) and remove the `mirror` CNAME (avoid dangling DNS); keep domain verified.

## 10. Open items to verify before enabling anything

1. Live read of GitHub Terms + Pages limits page (this research used the docs repo source).
2. Cloudflare Self-Serve Subscription Agreement and Developer Platform supplemental terms (quotes), Cloudflare log retention, issuing CAs for CAA.
3. Netlify and Vercel ToS wording; Netlify `_headers` and current free limits.
4. Fly.io terms on crypto/financial services; Fly proxy request-log retention; Hetzner current price list and ToS.
5. GitHub Pages: Cache-Control values, DNSSEC compatibility, whether meta referrer is honoured as expected (test).
6. COOP/CORP behaviour via `_headers` on the chosen primary (test in browser).
7. ENS gas and registration cost; Storacha/Fleek status; Pinata live plan limits and gateway header options.
8. Tor Project current setup guide, onion HTTPS options.
