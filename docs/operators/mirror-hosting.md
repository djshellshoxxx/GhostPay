# Mirror hosting

> **Hosting is intentionally not configured** ([ADR-0015](../adr/ADR-LOG.md)). This page records requirements so that when the owner decides, the result is safe. Do not publish a public instance before the gates in ADR-0015 are met: authenticated manifests, signed releases, legal review.

## 1. What a host must do

GhostPay is a static single-page app (`apps/web/dist`). The host must serve exactly the released files, with these properties:

| Requirement | Why |
|---|---|
| HTTPS only; HSTS | Anything else lets a network attacker swap the bundle. |
| The security headers in `apps/web/public/_headers` | CSP (`default-src 'self'; script-src 'self'; ... frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy` on assets and manifests. |
| `/index.html` `no-cache`, `/assets/*` immutable long cache | Assets are content-hashed. |
| `/deployments/*` `no-store` (while manifests are fetched at runtime) | A stale manifest is a stale router address. Once manifests are compiled into the bundle (target design) this path goes away. |
| No analytics, tag managers, CDNs for scripts/fonts, or edge scripts that rewrite HTML | The CSP forbids third-party scripts; an edge worker that injects code defeats it. |
| No access logs of full URLs where avoidable | The fragment is not sent to the server, but the host still sees IP, user agent, timing and which files are fetched. |
| Exact-file integrity | Serve the files from the signed release, byte for byte. Compare their SHA-256 with `SHA256SUMS` from a separate machine ([release and verify](release-and-verify.md)). |

The in-app "release hash" widget fetches the entry script from the same origin and hashes it. It cannot detect a compromised host (audit S3-04). Verification must happen outside the page.

`connect-src 'self' https: wss:` is deliberately broad because users choose their own RPC and relayer origins. The RPC adapter validates every URL (https/wss only, no credentials) and checks `eth_chainId`. This is a known trade-off (S3-11).

## 2. Per host

### Cloudflare Pages (primary candidate; supports headers)

- Upload the contents of the released `dist/` (not a build performed by the platform) so the hash you published is the hash served. If you use Git-connected builds, the platform's build environment becomes part of your trust base.
- `public/_headers` ships inside `dist` and is applied by Cloudflare Pages (and Netlify). Verify with `curl -sI https://<host>/` and compare to the file; test `frame-ancestors` by trying to frame the page.
- Upload `dist/` itself, not the hosting kit's `profiles/<name>/static/www`: that copy omits `_headers` (it is the document root for the kit's nginx and container profiles, which send the headers), so the host would serve it without CSP, X-Frame-Options, nosniff, COOP or Permissions-Policy.
- Disable Cloudflare features that modify content: Auto Minify, Rocket Loader, Email Obfuscation, Web Analytics beacon, Zaraz. Any injected script is blocked by the CSP and breaks the page, or worse, hides the problem.
- Restrict who can deploy (separate account, hardware-key 2FA, deploy tokens scoped to the project). Compromise of the Cloudflare account is compromise of the frontend (audit D7).
- Cloudflare terminates TLS and sees all client IPs and requests; disclose it in the privacy notice.

### Netlify and similar

Same `_headers` file works. Same cautions on build and account security.

### GitHub Pages (degraded mirror only)

- **Cannot set response headers.** Only the `<meta http-equiv="Content-Security-Policy">` in `index.html` applies, which omits `frame-ancestors` (browsers ignore it in a meta tag), and `Referrer-Policy` can only be set by meta. `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, COOP and CORP cannot be set.
- Consequences: clickjacking protection is missing, the embed iframe mode cannot be offered (the shipped embed SDK is popup-only for this reason), and `Cache-Control` for manifests cannot be set to `no-store`. Project pages are served under a path (`/<repo>/`). The build uses a relative base (`base: './'` in `vite.config.ts`), so a sub-path should work, but it has **not been tested** on GitHub Pages.
- Do not label a GitHub Pages instance as the primary site. Users should see which mirror they are on.

### IPFS

- Pin the exact release directory; record the CID in the release manifest and publish it through the same independent channels as the hashes. A CID is a content hash, which is stronger than a host-served hash if the user's gateway/client verifies it (a local node or a verifying gateway; a public gateway is just another host).
- No response headers: same limitations as GitHub Pages apart from integrity. Avoid gateways that inject banners or scripts.
- Relative paths only; the bundle uses relative base `./`. Test that `./deployments/<id>.json` (if still runtime-fetched) and the worker script load from a gateway sub-path and from a subdomain gateway.
- An ENS name (`ghostpay.eth` is mentioned in the specs; nothing is registered) pointing at a CID needs its own key custody and a documented compromise-recovery procedure. Not built.

### Tor onion service

- Serve the same static files from a hidden service. Headers can be set by your web server (nginx/Caddy); use the `_headers` content. Publish the onion address through the same independent channels, with the release hash.
- Browsers over Tor cannot use `wss:`/`https:` RPCs without leaking nothing extra, but your RPC provider still sees the exit node, not you. Run your own RPC reachable over Tor if possible ([local scanner and RPC](local-scanner-and-rpc.md)).
- Do not enable any server logging beyond what you need. Not built or tested by the project (audit B-07).

## 3. Mirror-specific rules

1. Every mirror serves the same release. A mirror that is "a bit different" is an attack until proven otherwise.
2. Cross-mirror hash comparison (the `SHA256SUMS` over served files) is the check; cross-mirror comparison job is **not built**.
3. Never accept pull-request-driven deployments to a production host. Deploy from a signed tag only.
4. Document the host, account owners, and compromise-response contact next to the published fingerprint.

## 4. Checklist before any public mirror

- [ ] Signed release exists and its fingerprint is published out of band ([release and verify](release-and-verify.md)).
- [ ] Manifests authenticated and compiled into the bundle ([DEPLOYMENT_MANIFEST.md](../DEPLOYMENT_MANIFEST.md)).
- [ ] Headers verified with `curl -I` against `_headers`; a framing test fails as expected.
- [ ] Terms, privacy notice and sanctions position published (owner and counsel).
- [ ] Host account hardened (hardware 2FA, scoped tokens, access list).
- [ ] A takedown/rotation procedure is written down.
