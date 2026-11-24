# GhostPay — GitHub Pages continuation prompt (2026-11-12)

Paste everything below the line into a new session. It is self-contained.

---

## GHOSTPAY — FINISH THE GITHUB PAGES RELEASE (continuation)

**Repository:** https://github.com/djshellshoxxx/GhostPay
**Work branch:** `claude/ghostpay-github-pages-up6cj6` (draft PR #137, stacked on PR #135's branch `nodata/jolly-rubin-u4zd45`). If your session assigns a different branch, merge `origin/claude/ghostpay-github-pages-up6cj6` into it first.
**Scope:** only what is hosted on GitHub: the static `apps/web` lean EVM site published by GitHub Pages, its GitHub Actions workflows, and repository documentation. Nothing else.

### Hard limits

- Work only on the GitHub Pages static client and its GitHub-hosted build, test and deploy path. Do not touch, extend or start:
  - the relayer service, gas sponsorship, ERC-4337, policy accounts or scheme 2 (no ABI change);
  - Bitcoin, Solana, TRON or any new chain;
  - merchant billing, any backend, database, server job or notification;
  - other hosting, desktop or mobile apps, or new feature specs.
- No mainnet. No real funds. Do not deploy contracts. Do not publish the site and do not dispatch `.github/workflows/pages.yml` with `deploy: true` unless the owner authorizes it in this session.
- Do not relax any guard to get green: `scripts/tests/workflows.test.mjs` (no Actions cache in `pages.yml`), coverage thresholds, `scripts/scan-secrets.sh`, the bundle scan, `scripts/pages/verify-pages-site.mjs`. Find and fix root causes.
- Do not merge PR #137 or any other PR. Do not rewrite history on shared branches.
- Do not apply the rejected GP-PAGES-05 or GP-PAGES-06 changes (see "Decided" below).

### Read first (do not redo this work)

`docs/pages/README.md`, `docs/pages/RELEASE_MATRIX.md`, `docs/handoffs/GITHUB_PAGES_RELEASE_2026-11-12.md`, `docs/adr/ADR-0029-github-pages-static-beta.md`, `.github/workflows/pages.yml`, `scripts/pages/*`, `apps/web/e2e/pages-devnet.spec.ts`, `apps/web/e2e/devnet/pages.ts`, `apps/web/playwright.pages-devnet.config.ts`.

### Already done and verified (head `72f0517`, local sandbox)

- **Pages build and checks:** `scripts/pages/build-pages.sh` builds the lean profile with relative assets and a mirror banner, then writes SHA256SUMS and evidence.
  - It refuses mainnet manifests.
  - It records the serving origin and refuses testnet manifests on a shared `*.github.io` origin unless `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` is set.
  - Release mode refuses a modified tree; `GHOSTPAY_PAGES_DEV=1` marks test builds.
  - `verify-pages-site.mjs`, `serve-pages.mjs` and `smoke.mjs` are in place. Pages tooling tests: 64/64.
- **Real-chain acceptance of the actual artifact under `/GhostPay/`:** `BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh` → 14/14.
  - Covers: keys, backup, signed invoice, wallet payment, scan, receipt, direct native sweep, reopen, restore in a new profile.
  - Refusals covered: tampered invoice, invalid RPC, RPC outage, wallet rejection, expired invoice, damaged or wrong-passphrase backup.
  - No request left `/GhostPay/`.
- **App changes:**
  - Opt-in automatic re-scan while the page is open (`Scan.tsx`, `Scan.autoRescan.test.tsx`).
  - Home release check now resolves against `document.baseURI` (`release.ts`).
- **Web unit tests:** 2535 passed, 1 skipped; coverage 93.64 / 89.88 / 95.3 / 96.92. Typecheck, lint and i18n pass (0 errors). `scripts/{testnet,regtest,tests}`: 104/104.
- **Workflow (`pages.yml`):**
  - On PRs: `site` (build, verify) and `acceptance` (real-chain).
  - `release-gates`, `deploy` and `smoke` run only on a manual dispatch from `main` with `deploy: true`.
  - No Actions cache anywhere.

### Decided (do not reopen)

- GP-PAGES-01 (the shared `djshellshoxxx.github.io` origin) is confirmed. The build already gates it. The remaining fix is an owner decision: a custom domain for this repository's Pages site, or a dedicated GitHub account or organization with no other Pages site.
- GP-PAGES-03 was refuted for the publishing path; the hardening is already in.
- GP-PAGES-05 was refuted: audit L1-02 deliberately specifies fail-closed sweep step-up. Do not change it.
- GP-PAGES-06 was refuted: the neighbouring disclosure rows already hedge. Do not change it.
- The lean build has no payer gas buffer (ADR-0024). Direct sweep is qualified for native coin only. ERC-20 direct sweep needs self-funded gas, which links wallets on-chain, and is documented as not qualified.

### Tasks, in order

**T1. Finish GP-PAGES-02 and GP-PAGES-04** (confirmed, low). First check `git log` on the work branch for a commit implementing "verify backup" and `appLock.watchIdle`. If it exists, review it against the requirements below and fix any gap. Otherwise implement it.

GP-PAGES-02: a keystore download counted as a verified backup, so the idle lock could wipe keys whose only copy never reached the disk.
- A download records an *unverified* copy. The BackupGate may still lift, but the banner and checklist must say "not verified".
- Add a "Verify backup" step in Seller keys:
  - the user picks the downloaded keystore file and types its passphrase;
  - decrypt with the existing bounded `decryptKeystore`, without loading or replacing keys;
  - compare meta-address, signer, spending and viewing public keys with the loaded session;
  - wipe secrets on every path; be safe against abort and session changes.
- Only an exact match makes the copy external and recoverable.
- No path may treat an unverified download as recoverable:
  - `loadedKeysRecoverable` must return false when the summary is unverified. This also covers a same-identity vault record found by `readEncryptedVault` whose passphrase was never proven.
  - "Wipe keys from memory" without confirmation, and unlock-replace, must not either.
- Keep `signerOnly` as `!saved && paymentKeysExternal`. An unverified download must not make the idle lock less strict for hex keys imported without their signing key (C-R10).
- Fix the busy state shared between Verify backup and vault unlock in `SellerKeys.tsx`, so no buttons stay disabled after an aborted verify or a failed unlock.
- Update `settings.lock.keysHint`, `sellerKeys.memory.body`, `backup.intro`, the download message and every other affected text in en/es/ja/ar, classified in `src/i18n/securityKeys.ts`.

GP-PAGES-04: device sleep delayed the idle lock.
- Record `lastActivity`.
- Lock at once when `Date.now() - lastActivity >= timeout` on:
  - `visibilitychange` to visible, `pageshow`, `focus`;
  - a 15–30 s interval;
  - the first `pointerdown` or `keydown` after a sleep past the deadline (check before re-arming).
- Lock once per idle period, with full cleanup on unmount and on a timeout change.

Tests and verification:
- Unit tests for every rule above, including negative cases.
- Update the specs that encode the old download behaviour: `e2e/core-journey.spec.ts`, `e2e/recovery.spec.ts`, `e2e/backup-panel.spec.ts`, and `e2e/pages-devnet.spec.ts` / `e2e/devnet/pages.ts`.
- Exercise "Verify backup" with the real downloaded file in at least one browser spec.
- Then get an independent read-only review of the diff and fix every required item before committing.

**T2. Hosted CI green on PR #137.** Every workflow on the head must pass:
- `ci.yml` (all shards, e2e lean and full, lean-candidate);
- `pages.yml` (`site` and `acceptance`);
- `beta-acceptance.yml`, `integration.yml`, `hosting-kit.yml`, `cli-operator.yml`, `secrets-and-egress`.

Read the first error in each failing job and fix the root cause. A job gets at most one re-run. A failure that also occurs on the base branch is not this PR's: record it once on the PR. Each superseded run cancels its dependents; ignore those aggregate failures.

**T3. Full local verification on the final head.** Record the exact results:
- `npm run typecheck -w @ghostpay/web`, `npm run lint -w @ghostpay/web`, `node scripts/i18n/check.mjs`
- `ANVIL_BIN=… SOLC_BIN=… REQUIRE_ANVIL=1 npm test -w apps/web` (coverage thresholds must hold)
- `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs`
- `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web`
- `BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh` and `bash scripts/beta/browser-devnet.sh`
- A release-mode `bash scripts/pages/build-pages.sh <abs new dir>` on a clean tree with `GHOSTPAY_PAGES_ORIGIN` set. Then `node scripts/pages/smoke.mjs` against it, served by `scripts/pages/serve-pages.mjs` under `/GhostPay/`.

Local setup when needed:
- Foundry v1.8.5 from its GitHub release into `~/.foundry/bin`.
- solc 0.8.28 `solc-static-linux` from the Solidity GitHub release into `~/.svm/0.8.28/solc-0.8.28`; use `forge build --offline`.
- Chromium is pre-installed; never run `playwright install` locally.

**T4. Sync the documents with the final state.** Update:
- `docs/pages/RELEASE_MATRIX.md`: the statuses of 02 and 04, final test counts, hosted run links;
- `docs/pages/README.md`, if the backup or idle-lock UX changed;
- `docs/handoffs/GITHUB_PAGES_RELEASE_2026-11-12.md`: the remaining-work list;
- the PR #137 description (states, owner actions).

Keep the release states distinct: `STATIC_BUILD_READY`, `DEMO_DEPLOYED`, `TESTNET_BETA_QUALIFIED`, `PRODUCTION_READY`.

**T5. Owner package.** Prepare these; the owner performs them. Write them as numbered, copy-ready steps in `docs/pages/README.md` (they exist; complete and verify them):
1. Accept or reject ADR-0029.
2. Choose the serving origin. Either:
   - a Pages custom domain (Settings > Pages > Custom domain, DNS CNAME to `djshellshoxxx.github.io`, Enforce HTTPS; then set repository variable `GHOSTPAY_PAGES_ORIGIN=https://<domain>`); or
   - a dedicated GitHub organization with this repository as its only Pages site.
3. Settings > Pages > Source "GitHub Actions". Environment `github-pages` restricted to `main`, with required reviewers if wanted.
4. Get the release onto `main`, since the deploy runs only from `main`. The stack is #137 → #135 (`nodata/jolly-rubin-u4zd45`) → #98 (`integration/ghostpay-beta-consolidated-20261109`) → `main`. The owner either merges the stack in that order, or opens one PR from the work branch to `main` (it contains the whole stack). Then Actions > Pages > Run workflow on `main` with deploy. Check the run summary (SHA256SUMS, `pages-evidence.json`) and the smoke job → `DEMO_DEPLOYED`.
5. For testnet:
   - an authorized Base Sepolia (84532) or Sepolia deployment from `packages/contracts`;
   - a release-signed manifest committed to `apps/web/deployments/<chainId>.json`;
   - repository variable `GHOSTPAY_RELEASE_PUBKEYS` (public keys only);
   - a dedicated origin, or explicit `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet`;
   - redeploy, then the external testnet run.

   Record in `docs/handoffs/` the chain ID, addresses, manifest SHA-256, wallet, RPC provider, payment, announcement and sweep transaction hashes, scan, receipt, and one failure-and-recovery case → `TESTNET_BETA_QUALIFIED`.
6. Export the SonarCloud issue list (Vulnerabilities and Security Hotspots, new code); `sonarcloud.io` is not reachable from the sandbox. Attach it to PR #137 so each item can be dispositioned. Do not suppress any issue.

**T6. Only with owner authorization given in this session:** dispatch the deploy, run `smoke.mjs` against the live URL, and record it. Otherwise stop at T5.

### Completion

Done when:
- T1–T5 are complete;
- hosted CI on the #137 head is green, or each remaining red job is shown to fail on the base too;
- the documents match the code.

Final report: `TASK | COMMIT | TESTS | STATUS | BLOCKER` per task, then:
- release state reached;
- exact SHA;
- hosted run URLs;
- what remains owner-only.
