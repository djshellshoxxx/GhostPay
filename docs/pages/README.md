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
| `DEMO_DEPLOYED` | The site is published with payments disabled (no manifest) | Needs the owner steps in [Publishing](#publishing-owner) |
| `TESTNET_BETA_QUALIFIED` | A signed testnet manifest is bundled, and payment and sweep pass on the real testnet through the published site | Needs an authorized testnet deployment ([External testnet qualification](#external-testnet-qualification)) |
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
- **Idle lock.** After the configured idle time the app locks local tags and records, and clears seller keys from memory when they can be loaded again (encrypted storage or a backup). Keys that exist only in the tab are kept loaded and the app tells you to back them up.

### Typical flow (testnet beta)

1. **Seller keys:** create keys, set a passphrase, then **back up** (encrypted file) and keep it somewhere else. Keys without a backup are lost if the tab closes.
2. **Create invoice:** choose the testnet, token, amount and expiry. Copy the link or show the QR code.
3. **Buyer (Pay):** open the link, review chain, token, amount and destination, connect a browser wallet on the right network, confirm. The wallet sends the transaction directly; no relayer is involved. Reloading during a pending payment keeps its hash and blocks a duplicate.
4. **Seller (Scan and receive):** set the RPC, start a scan. The checkpoint survives closing and reopening the browser; the next scan resumes from it.
5. **Sweep:** choose **Directly**. The one-time address pays its own gas:
   - **Native coin payments** can always be swept directly: the fee is deducted from the amount.
   - **ERC-20 payments** need native coin at the one-time address. Ask the payer for a **gas buffer** when you create the invoice (Create invoice, "Gas buffer policy"), or send a small amount of native coin to the one-time address yourself, knowing that this links your funding wallet to it on-chain. A browser wallet cannot sign for a one-time address and is never asked to.
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
bash scripts/pages/build-pages.sh "$PWD/../ghostpay-pages"
```

The output directory must not exist and must be outside `apps/web`. It produces:

- `site/`: exactly what is published. Relative asset references (`./assets/...`), so it works under `/GhostPay/` or any other path. Includes `.nojekyll` and the mirror banner. `_headers` and the public `deployments/` README are removed, because GitHub Pages ignores headers and manifests are compiled into the bundle.
- `evidence/`: `SHA256SUMS` of every published file, the lean module report, `pages-evidence.json` (commit, enabled testnet chain ids, manifest digest, lockfile digest) and the build log.

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

### Publishing (owner)

1. Settings > Pages > Build and deployment > Source: **GitHub Actions**. (The old `gh-pages` branch from the prototype is then unused; keep it or delete it.)
2. Settings > Environments > `github-pages`: deployment branches **main only**; add required reviewers if you want a second approval.
3. Merge the release pull request to `main`.
4. Actions > Pages > Run workflow on `main` with **deploy** checked.
5. Check the run summary: `pages-evidence.json` status and the `SHA256SUMS`. Then run the smoke command above against the live URL from another machine.

Until a testnet manifest is added, this publishes the **demonstration** build (`DEMO_DEPLOYED`).

### Enabling testnet payments (owner)

1. Deploy the contracts to the chosen testnet with an authorized deployer (`packages/contracts`, `deployments/README.md`) and record the transaction hashes.
2. Write and sign the manifest (`deployments/schema.json`, `docs/operators/release-and-verify.md`). Commit `apps/web/deployments/<chainId>.json`. Only the testnet chain ids in `scripts/pages/verify-pages-site.mjs` are accepted.
3. Set the repository variable `GHOSTPAY_RELEASE_PUBKEYS` (public keys only, comma separated). A manifest without a verifying key fails the build.
4. Publish as above. At runtime the app also reads the contract code and immutable values through the user's RPC before enabling a flow.

### External testnet qualification

`TESTNET_BETA_QUALIFIED` needs, on the published site and a real testnet: chain id, contract addresses, manifest SHA-256, wallet type and version, RPC provider, the payment, announcement and sweep transaction hashes, scan and receipt results, and at least one failure-and-recovery case (rejected wallet request, RPC outage during scan). Record them in a dated file under `docs/handoffs/`. Local anvil results do not count as external testnet acceptance.

### Limits of a GitHub Pages host

- Only the `<meta>` CSP applies. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`, COOP/CORP and `Cache-Control` cannot be set, so the site can be framed (clickjacking) and the iframe embed mode is unavailable.
- `connect-src 'self' https: wss:` is broad on purpose, because users choose their own RPCs.
- GitHub (and anyone who controls the repository or its Actions) controls the code you run. Compare served files with `SHA256SUMS` from the workflow run.
- ADR-0015 (hosting gating) and [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md) record which hosting gates are met and which still need the owner.
