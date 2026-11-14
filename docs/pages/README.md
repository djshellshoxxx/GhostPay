# GhostPay on GitHub Pages

GhostPay's EVM web app as a static site on GitHub Pages: React/Vite files only, running entirely in your browser. There is no GhostPay server, database, relayer or scheduled job behind it.

```
GitHub Pages (static files) -> your browser (keys, invoices, scanning, signing) -> your wallet / your RPC -> EVM testnet
```

**Status: pre-audit testnet beta. Not for real funds.** No external audit has been performed. A Pages build never enables a mainnet: the build refuses any mainnet deployment manifest.

## Release states

| State | Meaning | Current |
|---|---|---|
| `STATIC_BUILD_READY` | `scripts/pages/build-pages.sh` builds, verifies and hashes the static site | See the pull request that introduced this page for the exact commit |
| `DEMO_DEPLOYED` | The site is published with payments disabled (no manifest) | Needs the owner steps in [Owner checklist](#owner-checklist) A and B |
| `TESTNET_BETA_QUALIFIED` | A signed testnet manifest is bundled, and payment and sweep pass on the real testnet through the published site | Needs [Owner checklist](#owner-checklist) C |
| `PRODUCTION_READY` | Real funds | Out of scope. Needs a separate owner decision, independent audit and the ADR-0015 gates |

## For users

### What the site contains

The lean EVM profile only: Seller keys, Create invoice, Pay, Scan and receive, Sweep, Public registry (ERC-6538, testnet), Settings and About. Bitcoin, Solana, TRON, the experimental policy account (scheme 2), the tag archive and merchant embedding are not part of this build.

A yellow banner at the top says that you are on the GitHub Pages mirror and whether payments are enabled:

- **Demonstration build.** No deployment manifest is bundled, so every chain says "payments disabled". You can create keys, back them up, and create and open invoices, but you cannot pay, scan or sweep.
- **Testnet beta.** Payments work only on the testnets the banner names, with test assets.

### What stays in your browser

- Seller spending, viewing and signing keys are generated in the page and stored encrypted (passphrase-derived key, AEAD) in this browser's storage. They are never sent to GitHub, an RPC provider or a wallet.
- Scanning downloads public ERC-5564 announcements from your RPC and matches them locally, in a Web Worker, with your viewing key. The viewing key is not sent anywhere.
- A direct sweep signs a plain transfer with the one-time address's derived key inside the page and sends only the signed transaction to your RPC.
- Invoices travel in the link fragment (`#gpi=...`). Browsers do not send the fragment to GitHub Pages.

### What others can see

- **GitHub Pages** sees your IP address, browser and which files you load. It does not see the invoice fragment.
- **Your RPC provider** sees your IP address, the block ranges you scan, the transactions you send and their timing. While scanning, verifying a router payment asks for the one-time address's transfer logs or receipt, which can reveal which announcements matched your keys. If you turn on **Keep checking for new payments while this page is open**, the provider also sees the timing of those repeated requests (about every 60 to 90 seconds while the tab is visible). Plain HTTPS RPC traffic is not anonymous. Use your own node, or an RPC you trust, if this matters. No Tor transport is claimed for this site.
- **The blockchain** shows the payer, the amount, the token, the time and the router call. A sweep from a one-time address to a wallet you already use links the two on-chain.

Details: [privacy limits](../user/privacy-limits.md), [receive and scan](../user/receive-and-scan.md), [sweep and gas privacy](../user/sweep-and-gas-privacy.md).

### Settings you must make yourself

- **RPC URL per chain.** No provider is built in and no provider is substituted silently. Only `https://` and `wss://` URLs without a username, password or fragment are accepted. The app checks `eth_chainId` before use. A configured second RPC is used as a cross-check; if it cannot be opened the scan stops instead of continuing with one provider.
- **Your own node.** Give it an HTTPS or WSS endpoint, or choose the local-proxy scan path in Settings, which accepts `http://127.0.0.1`, `http://localhost` or `http://[::1]` for scanning.
- **Scan privacy.** A "private path required" setting (Tor Browser or a local proxy) blocks the scan when that path is not available instead of falling back to a direct connection.
- **Idle lock.** After the configured idle time the app locks local tags and records, and clears seller keys from memory when they can be loaded again (encrypted storage, imported keys, or a downloaded backup that you verified). Keys that exist only in the tab, or whose only copy is a downloaded file you have not verified yet, are kept loaded and the app tells you to back them up or verify the backup. The deadline is a wall-clock check: a device that slept past it locks as soon as the page is visible or used again.

### Typical flow (testnet beta)

1. **Seller keys:** create keys, set a passphrase, then **back up** (encrypted file), **verify the backup** (pick the downloaded file and type its passphrase; the app decrypts it locally, compares it with the loaded keys and loads nothing) and keep the file somewhere else. Keys without a backup are lost if the tab closes; a download alone shows as "not verified".
2. **Create invoice:** choose the testnet, token, amount and expiry. Copy the link or show the QR code.
3. **Buyer (Pay):** open the link, review chain, token, amount and destination, connect a browser wallet on the right network, confirm. The wallet sends the transaction directly; no relayer is involved. Reloading during a pending payment keeps its hash and blocks a duplicate.
4. **Seller (Scan and receive):** set the RPC, start a scan. The checkpoint survives closing and reopening the browser; the next scan resumes from it.
5. **Sweep:** choose **Directly**. The one-time address pays its own gas:
   - **Native coin payments** can always be swept directly: the fee is deducted from the amount.
   - **ERC-20 payments** need native coin at the one-time address to pay its own gas. This build has no payer gas buffer: buffer-policy invoices (v2, ADR-0024) are made only by the full profile and refused by this one. To sweep an ERC-20 payment directly, first send a small amount of native coin to the one-time address yourself. That transfer links your funding wallet to the one-time address on-chain. The Sweep view says so when the gas is missing. A browser wallet cannot sign for a one-time address and is never asked to.
   - So the direct sweep supported end to end by this release is **native coin**. ERC-20 direct sweeps work with self-funded gas but are not covered by the local-chain acceptance run (the devnet tokens are not on the app's allowlist).
   - The optional relayed sweep needs a relayer URL that you configure yourself. None is provided or required.
6. **Receipt:** sign a receipt for a finalized payment. A receipt is a seller statement; the on-chain transaction is the settlement evidence.

### Verify the files you were served

The release hash on Home is computed by the page itself and proves nothing about a compromised host. Check from a separate machine:

```bash
base=https://djshellshoxxx.github.io/GhostPay
curl -fsS "$base/build-info.json"
```

Compare the commit with the release you expect, then download the `pages-site-<commit>` artifact of that workflow run (it contains `evidence/SHA256SUMS`) and compare each served file, for example:

```bash
curl -fsS "$base/index.html" | sha256sum
```

## For developers

### Build locally

Needs Node 22, `npm ci --ignore-scripts` and `npm run build:libs`.

```bash
GHOSTPAY_PAGES_DEV=1 bash scripts/pages/build-pages.sh "$PWD/../ghostpay-pages"
```

The output directory must not exist and must be outside `apps/web`. Without `GHOSTPAY_PAGES_DEV=1` the script makes a release build: it refuses a modified tree under `apps/web`, `packages` or `scripts`, and `GP_COMMIT` must equal `HEAD`. Build the workspace libraries from source first (`rm -rf packages/*/dist && npm run build:libs`); the script uses them as they are.

| Variable | Meaning |
|---|---|
| `GHOSTPAY_PAGES_ORIGIN` | The serving origin, `https://host[:port]` with no path. Recorded in the evidence and the banner. Required when manifests are bundled. A `*.github.io` origin is treated as shared. |
| `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` | Accept a shared `*.github.io` origin for a build with testnet manifests. Without it such a build is refused (GP-PAGES-01). |
| `GHOSTPAY_PAGES_DEPLOYMENTS_DIR`, `GHOSTPAY_RELEASE_PUBKEYS` | Release-signed testnet manifests and their public keys. |
| `GHOSTPAY_PAGES_DEV=1` | Test build: a modified tree and a plain-http loopback origin are accepted; the banner and evidence say it is not a release. |

It produces:

- `site/`: exactly what is published. Relative asset references (`./assets/...`), so it works under `/GhostPay/` or any other path. Includes `.nojekyll` and the mirror banner. `_headers` and the public `deployments/` README are removed, because GitHub Pages ignores headers and manifests are compiled into the bundle.
- `evidence/`: `SHA256SUMS` of every published file, the lean module report, `pages-evidence.json` (commit, release or development build, serving origin and whether it is shared, enabled testnet chain ids, manifest digest, lockfile digest) and the build log.

What the build enforces (it stops on any failure):

| Check | Where |
|---|---|
| Lean profile; BTC, Solana, TRON, policy, pools, relayer service and Node built-ins are not rendered | `apps/web/scripts/localBuildProfile.mjs` during the build, re-checked from the module report by `scripts/pages/verify-pages-site.mjs` |
| TypeScript check | `build-pages.sh` |
| No dynamic code, inline script or style, unexpected origins or source maps in the bundle | `apps/web/scripts/scan-bundle.mjs` |
| Deployment manifests: schema, chain id, release signature; testnet chain ids only | `apps/web/scripts/validate-deployments.mjs`, `verify-pages-site.mjs` |
| Meta CSP on every HTML file (`script-src 'self'` or `'none'`), no inline handlers, only relative resource references, `rel=noopener` on new-tab links | `verify-pages-site.mjs` |
| No secret-shaped strings (tokens, PEM keys, RPC URLs with project keys) and no public anvil development keys | `verify-pages-site.mjs` |
| Only allowlisted file extensions (correct MIME types on Pages); no symlinks | `verify-pages-site.mjs` |
| Mirror banner present | `verify-pages-site.mjs` |
| Caller `VITE_*` switches are not inherited (no experimental policy view, no iframe embed mode) | `build-pages.sh` builds with `env -i` |

Serve it like GitHub Pages (no security headers, sub-path) and smoke-test it:

```bash
node scripts/pages/serve-pages.mjs "$PWD/../ghostpay-pages/site" --port 4180 --base /GhostPay/
```

```bash
node scripts/pages/smoke.mjs http://127.0.0.1:4180/GhostPay/ --commit "$(git rev-parse HEAD)" --timeout-s 0
```

### Real-chain browser acceptance of the Pages artifact

```bash
BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh
```

Starts anvil, deploys the contracts, switches the chain to the Base Sepolia id (84532), signs an 84532 manifest with the public Playwright test key, builds the site with `build-pages.sh`, serves it under `/GhostPay/` without headers and runs `apps/web/e2e/pages-devnet.spec.ts` in Chromium. Public anvil keys only. Without `BROWSER_DEVNET_MODE` the script runs the existing full-profile journey unchanged.

### Workflow (`.github/workflows/pages.yml`)

| Trigger | Jobs |
|---|---|
| Pull request touching the app, packages or Pages tooling | `site` (Pages tooling tests, dependency tree, libraries built from source, `build-pages.sh`, source secret scan, artifact with SHA256SUMS) and `acceptance` (the real-chain Pages journey). Typecheck, lint, unit and mocked browser tests run in `ci.yml` for the same PR. |
| `workflow_dispatch` on `main` with `deploy: true` | Additionally `release-gates` (typecheck, lint, web unit tests with anvil, mocked lean browser suite), then `deploy` and the post-deployment `smoke` test. |

Nothing deploys automatically. Publishing jobs are never cancelled by a newer run. Permissions are `contents: read` except the deploy job (`pages: write`, `id-token: write`).

### Serving origin (read before publishing)

A GitHub project site is served at `https://<owner>.github.io/<repo>/`. Browsers isolate storage and scripts per **origin**, not per path, and this account publishes more than fifteen other project sites on `https://djshellshoxxx.github.io` (2026-11-12). Any of them, now or later, can open the GhostPay page in a same-origin window or frame, script it and read its local storage, including the encrypted vault and settings (GP-PAGES-01). Use one of these instead:

- a custom domain for this repository's Pages site (Settings > Pages > Custom domain, plus `GHOSTPAY_PAGES_ORIGIN=https://<domain>`), or
- a dedicated GitHub account or organization that publishes no other Pages site and has no `<owner>.github.io` user site.

The workflow defaults `GHOSTPAY_PAGES_ORIGIN` to the account's `github.io` origin. On that origin the demonstration build carries a warning in its banner, and a build with testnet manifests is refused unless the repository variable `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN` is `testnet`.

### Owner checklist

Only the repository owner can do these. Each step names where it is done and what proves it worked.

**A. Decide hosting (once)**

1. Read and accept or reject [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md). To accept: change its `Status:` line to `Accepted (<date>, <name>)` in a reviewed pull request. Until then ADR-0015 forbids publishing.
2. Choose a serving origin that no other site shares ([Serving origin](#serving-origin-read-before-publishing)):
   - **Custom domain (recommended):**
     - Settings > Pages > Custom domain: enter e.g. `pay.example.org` and save.
     - At your DNS provider, add `CNAME pay.example.org -> djshellshoxxx.github.io` (no path).
     - Once the certificate is issued, tick **Enforce HTTPS**.
     - Then verify the domain (profile Settings > Pages > Add a domain, TXT record), so nobody else can claim it for their Pages site.
   - **Or a dedicated organization:** create a GitHub organization with no other Pages site and no `<org>.github.io` repository, and transfer or fork this repository there.
3. Settings > Secrets and variables > Actions > **Variables**: set `GHOSTPAY_PAGES_ORIGIN` to the chosen origin, e.g. `https://pay.example.org` (no trailing slash, no path). Leave `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN` unset.

**B. Publish the demonstration build (`DEMO_DEPLOYED`)**

4. Settings > Pages > Build and deployment > Source: **GitHub Actions**. The prototype's `gh-pages` branch is then unused; keep or delete it.
5. Settings > Environments > `github-pages`:
   - Deployment branches and tags: **Selected branches**, add `main` only.
   - Optional: Required reviewers, for a second approval before each deployment.
6. Get the release onto `main`, because the deploy job runs only from `main`. Pull request #137 is stacked: #137 → #135 (`nodata/jolly-rubin-u4zd45`) → #98 (`integration/ghostpay-beta-consolidated-20261109`) → `main`. Either merge the stack in that order after review, or open one pull request from `claude/ghostpay-github-pages-up6cj6` to `main` (it contains the whole stack). Wait for CI to pass on the merge commit.
7. Actions > **Pages** > Run workflow > Branch `main`, tick **deploy**, Run. The run builds and verifies the site and runs the real-chain acceptance plus the release gates (typecheck, lint, unit tests, mocked browser suite). Then it deploys, and the `smoke` job checks the live site.
8. In the run summary, check:
   - `pages-evidence.json`: `release: true`, your origin, `sharedOrigin: false`, and status `DEMO: payments disabled …`;
   - the `SHA256SUMS` list;
   - that the `smoke` job passed.

   From another machine, compare what is served (see [Verify the files you were served](#verify-the-files-you-were-served)).

**C. Enable testnet payments (`TESTNET_BETA_QUALIFIED`)**

9. Deploy the contracts to one testnet, Base Sepolia (84532) or Ethereum Sepolia (11155111), with an authorized deployer key, following [`deployments/README.md`](../../deployments/README.md) "Procedure":
   - `packages/contracts/scripts/pre-deploy-check.sh router`;
   - `forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast --account <keystore>` with `FEE_RECIPIENT` set;
   - verify the sources on the explorer and read back the immutables.
10. Make the manifest:
    - `node scripts/testnet/make-manifest.mjs --rpc <rpc> --broadcast packages/contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` writes an unsigned `deployments/<chainId>.json`.
    - Sign its `manifestDigest` with the approved **offline** release key (no in-repository signing command exists) and add the compact signature.
    - Copy the signed file to `apps/web/deployments/<chainId>.json` and commit both in a reviewed pull request.
11. Variables: set `GHOSTPAY_RELEASE_PUBKEYS` to the release public key(s): 33-byte compressed secp256k1 keys (66 hex digits starting with `02` or `03`), comma separated, at most 8, public keys only. A manifest without a matching key fails the build.
12. Merge, then dispatch **Pages** with **deploy** again. `pages-evidence.json` must now list your chain id under `paymentsEnabledChainIds`, and the banner must say "Testnet beta".
13. Run the [external testnet qualification](#external-testnet-qualification) below and commit its record.

**D. Before calling the release done**

14. SonarCloud: the project's new-code security rating was D, and its issue list was not reachable from the build sandbox. In SonarCloud > Issues, filter Type = Vulnerability and Security Hotspot, New code. Export or copy the list into pull request #137 so each item can be fixed or dispositioned. Do not mark items as "won't fix" to reach a rating.
15. Arrange an independent security review of the exact release commit (the review in `RELEASE_MATRIX.md` was AI-assisted, not an audit).

### External testnet qualification

`TESTNET_BETA_QUALIFIED` needs these, on the published site and the real testnet:
- chain id, contract addresses, manifest SHA-256;
- wallet type and version, and the RPC provider;
- the payment, announcement and sweep transaction hashes;
- scan and receipt results;
- at least one failure-and-recovery case (rejected wallet request, RPC outage during scan).

Record them in a dated file under `docs/handoffs/`. Local anvil results do not count as external testnet acceptance.

### Limits of a GitHub Pages host

- Only the `<meta>` CSP applies. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`, COOP/CORP and `Cache-Control` cannot be set, so the site can be framed (clickjacking) and the iframe embed mode is unavailable.
- `connect-src 'self' https: wss:` is broad on purpose, because users choose their own RPCs.
- GitHub (and anyone who controls the repository or its Actions) controls the code you run. Compare served files with `SHA256SUMS` from the workflow run.
- ADR-0015 (hosting gating) and [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md) record which hosting gates are met and which still need the owner.
