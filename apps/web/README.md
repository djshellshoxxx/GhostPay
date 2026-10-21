# @ghostpay/web

Static React app (no GhostPay server). Everything runs in the browser; see `DEVIATIONS.md` for what differs from the specs
and what was never verified against a real wallet, chain or host.

```
npm run build:libs            # from the repo root: the app resolves @ghostpay/* through their built dist/
npm run typecheck -w @ghostpay/web && npm run lint -w @ghostpay/web && npm test -w @ghostpay/web
npm run build -w @ghostpay/web      # typecheck, vite build, embed SRI, bundle scan
npm run test:e2e -w @ghostpay/web   # Playwright against the built bundle (needs the preinstalled Chromium)
```

## Build-time configuration (all optional)

| Variable | Effect |
|---|---|
| `GHOSTPAY_RELEASE_PUBKEYS` | Comma separated 33-byte compressed secp256k1 release keys (66 hex digits) compiled into the bundle. Empty by default, which makes the UI say "unsigned manifest". With keys, manifests must carry a valid signature. |
| `GHOSTPAY_CONNECT_ORIGINS` | Comma separated bare `https://` / `wss://` origins. Replaces `connect-src 'self' https: wss:` with exactly these origins in the meta CSP and in `dist/_headers`. |
| `GHOSTPAY_DEPLOYMENTS_DIR` | Directory of `<chainId>.json` manifests to compile in instead of `deployments/` (used by the e2e suite). |

## Deployment manifests

Compiled into the hashed bundle and read back from the chain before any payment; see `deployments/README.md`.

## Content-Security-Policy: what is and is not enforced

`public/_headers` (Cloudflare Pages / Netlify syntax) carries the full policy, HSTS and the other headers. The built
`index.html` carries a `<meta>` CSP as a fallback. A meta tag **cannot** enforce `frame-ancestors` (the app can then be
framed), cannot protect the scanner worker's own script response, and cannot set `X-Frame-Options`, HSTS or
`Permissions-Policy`. On meta-only hosting (for example GitHub Pages) the "worker has no network access" property rests on
the code review and `scripts/scan-bundle.mjs`, not on the browser. Treat header-capable hosting as mandatory for
production; GitHub Pages is a demo mirror.

`connect-src` defaults to `'self' https: wss:` because RPC and relayer origins are user data. To tighten it, build with
`GHOSTPAY_CONNECT_ORIGINS`. The browser then blocks every other origin, including RPC URLs a user adds later in Settings:
to allow such an origin, edit the `connect-src` line of the deployed `_headers` (and the meta tag in `index.html` if the host
ignores headers) and redeploy. Even the tightened policy cannot stop script that is already running from posting to an
allowed RPC origin. Trusted Types (`require-trusted-types-for 'script'`) is not enabled.

## Embed SDK: pin the versioned file

The build publishes `ghostpay-embed-v1.<sha256 prefix>.js` (immutable, one-year cache) next to the moving alias
`ghostpay-embed-v1.js` (one hour cache) and writes `dist/embed-sri.json` and the build log line with the SHA-384 SRI value:

```html
<script src="https://APP/ghostpay-embed-v1.<hash>.js" integrity="sha384-<value from embed-sri.json>" crossorigin="anonymous"></script>
```

Publish the `integrity` value in the release notes of each tag. Merchants should pin the versioned file; the alias exists
only for quick trials.

## Release verification (honest limits)

The SHA-256 on the Home page is **informational only**: it is computed by the page you are running from files fetched from
the same host, so a compromised host or mirror can show any hash. Verify a release from another machine: download the served
files, run `sha256sum`, and compare with the signed `SHA256SUMS` published for the tag through a second channel. A release
workflow, SBOM and signed tags are still open work (audit S3-04/S3-17); until they exist nothing here proves a host is honest.

## Invoice links and browser history

An invoice link carries its decryption key and contents in the URL fragment. Opening it by clicking or by scanning a QR code
navigates the browser to it; browsers may keep the full address in their history database (reproduced for Chromium, audit
S3-03) even though this app removes it from the address bar with `history.replaceState`. Recommended flow: copy the link and
paste it on the Pay page, or open it in a private window. The Pay page, About and the privacy table say so.

## Local storage, settings and tags

- Settings (RPC URLs, relayer URL, pinned signer keys) are plain-text `localStorage`. Anything that can write to the site's
  storage can silently add a hostile RPC or a pinned key; the Settings page says so (S3-25). Use a second independent RPC.
- Local client tags are AES-GCM encrypted with a key derived from the viewing key; the record id and lookup token are bound
  into the AAD so ciphertext cannot be moved between records (S3-16). **Metadata is in the clear**: number of tags, chain id,
  record ids, lookup tokens, IVs and created/updated times are readable by anything that can read the browser profile.
- Keystore files: scrypt N=2^17 r=8 p=1 on export; import accepts at most N=2^18, r=8, p=2. Minimum passphrase 14
  characters with a rough strength estimate; password managers are asked not to fill the fields (`autocomplete="off"`).
