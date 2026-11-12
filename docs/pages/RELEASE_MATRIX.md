# GitHub Pages release: implementation matrix

Source-pinned to the branch `claude/ghostpay-github-pages-up6cj6` (base: PR #136 at `c11f905`, which contains PR #135 at `d725469`, plus PR #135's later `f88aaf2`). Paths are relative to the repository root; `web/` means `apps/web/`. "Local" results ran in the session sandbox (Node 22.23.4, Foundry 1.8.5, solc 0.8.28, pre-installed Chromium), not in hosted CI.

Status values: **done** (code and tests exist and pass), **done (this branch)** (added or fixed here), **gap** (missing), **owner** (needs an owner action), **excluded** (not in this release).

## Release features

| Feature | Existing code | Gap closed or remaining | Test | Status |
|---|---|---|---|---|
| Client-side stealth key generation, import, validation | `web/src/lib/session.ts`, `web/src/lib/keystore.ts`, `packages/core-crypto` | none | `session.test.ts`, `keystore.test.ts`, `SellerKeys*.test.tsx` | done |
| Encrypted local key storage, passphrase unlock | `web/src/lib/keyVault.ts`, `packages/ux-vault` (scrypt N=2^17, AES-GCM, AAD-bound metadata), `packages/secret-box` | none | `keyVault.test.ts`, `passphrase-vault.spec.ts`, ux-vault `portable-parity.test.ts` | done |
| Session lock, idle lock | `web/src/AppShell.tsx`, `web/src/lib/appLock.ts` | Idle lock did not account for device sleep (GP-PAGES-04) | `appLock.test.ts`, AppShell tests | see [Security](#security-findings) |
| Explicit backup, encrypted export, restore | `web/src/views/SellerKeys.tsx`, `web/src/components/SecretBackup.tsx` | A download counted as a verified backup (GP-PAGES-02); no recovery verification step | `recovery.spec.ts`, `SecretBackup*.test.tsx`, Pages devnet journey (download, damaged and wrong-passphrase files refused, restore in a new profile) | see [Security](#security-findings) |
| Protection against accidental key replacement | `SellerKeys.tsx` BackupGate, unlock-replaces warnings, typed waiver | none | `SellerKeys*.test.tsx` | done |
| Invoice creation, chain/token/amount, expiry, signing | `web/src/views/CreateInvoice.tsx`, `web/src/lib/invoiceCreate.ts`, `packages/invoice-schema` | none | `CreateInvoice*.test.tsx`, `invoiceCreate.test.ts`, invoice-schema suites | done |
| Invoice links, QR, import (paste), history (registered invoices) | `web/src/lib/fragment.ts`, `PaymentRequestQr.tsx`, `Pay.tsx` paste, `ReconciliationLedger.tsx` | Links must work under `/GhostPay/` | `fragment.test.ts`, `Pay.invoiceQr.test.tsx`, Pages devnet journey | done (sub-path: this branch) |
| Invalid, tampered, expired invoice handling | `packages/invoice-schema` verify, `web/src/lib/pay.ts` | none | invoice-schema suites, `pay.test.ts`, Pages devnet journey | done |
| Buyer: wallet connection, network check, token check, review, explicit confirm, direct submit | `web/src/lib/wallet.ts`, `pay.ts`, `payExec.ts`, `Pay.tsx` | none (no relayer involved) | `pay*.test.ts`, `payExec*.test.ts`, `devnet-journey.spec.ts` | done |
| Pending/confirmed/failed, rejection, duplicate-payment protection, reload recovery | `transactionOutcome.ts`, `duplicateAttemptJournal.ts`, `WalletAttempts.tsx` | Journal is tab-scoped (documented limit) | `transactionOutcome.test.ts`, `duplicateAttemptJournal.test.ts`, `devnet-journey.spec.ts` | done |
| ERC-5564 discovery, local matching in a Worker, bounded ranges, checkpoints, reorgs, duplicates, RPC timeouts | `scannerCore.ts`, `scanner.worker.ts`, `scanClient.ts`, `scanPrivacy.ts`, `reconciliation*.ts` | none | `scannerCore*.test.ts`, `scanClient.test.ts`, `scanPrivacy*.test.ts`, `reconciliation*.test.ts`, `Scan.test.tsx` | done |
| Automatic scanning while the app is open | none (manual only) | Added: opt-in re-check from the checkpoint every 60 to 90 s while the tab is visible; merges results; stops on error, cancel, lock or scope change; discloses RPC timing | `Scan.autoRescan.test.tsx` | done (this branch) |
| Scanning survives closing and reopening the browser | checkpoints in `localStorage`, encrypted reconciliation vault in IndexedDB | none | `Scan.test.tsx`, Pages devnet journey (reopen) | done |
| Direct sweep without relayer | `web/src/lib/sweep.ts` `directSweep` (derived key signs in the page, stealth address pays gas, exact-bytes review, dry run, journal, nonce lock) | Supported end to end: **native coin**. ERC-20: the lean build has no payer gas buffer (v2 invoices are full-profile only, ADR-0024), so the seller must send native gas to the one-time address, which links wallets on-chain. Not covered by the devnet run: the devnet tokens are not on the allowlist. | `sweep.test.ts`, `state.sweep.test.ts`, `sweepAttemptJournal.test.ts`, `sweep.spec.ts`, `devnet-journey.spec.ts`, Pages devnet journey (native) | done (native); ERC-20 not qualified |
| Receipts, receipt verification, export | `ReceiptPanel.tsx`, `receipts.ts`, reconciliation archive | none; receipts never substitute for chain evidence | `receipts.test.ts`, `ReceiptPanel*.test.tsx`, `receipt-lean.spec.ts` | done |
| QR: invoice, payment request import, receipt, encrypted backup | `QrFrame.tsx`, `CameraImporter.tsx`, `qr*.ts`, `packages/qr-exchange` | none | `qr*.test.ts`, `CameraImporter*.test.tsx`, `qr-camera*.spec.ts` | done |
| User-configurable RPC, strict URL validation, no embedded keys, no silent substitution or fallback, fail-closed privacy modes, disclosures | `settings.ts`, `packages/chain-adapters/src/rpc.ts`, `scanPrivacy.ts` | Tor/proxy disclosure overstated (GP-PAGES-06) | `settings.test.ts`, chain-adapters `rpc.test.ts`, `scanPrivacy*.test.ts` | see [Security](#security-findings) |

## Static hosting and delivery

| Item | Code | Test | Status |
|---|---|---|---|
| Lean profile only (no BTC, Solana, TRON, policy, pools, relayer service) | `web/scripts/localBuildProfile.mjs`, `web/src/AppLean.tsx` | `localBuildProfile.test.mjs`, `scripts/pages/verify-pages-site.test.mjs` | done |
| Pages build: relative base, `.nojekyll`, no `_headers`, mirror banner, SHA256SUMS, evidence | `scripts/pages/build-pages.sh` | local build, `verify-pages-site.test.mjs` | done (this branch) |
| Independent site verification (CSP, relative refs, MIME allowlist, secrets, anvil keys, excluded modules, testnet-only manifests) | `scripts/pages/verify-pages-site.mjs` | `verify-pages-site.test.mjs` | done (this branch) |
| GitHub Pages-like server for tests (sub-path, no headers) | `scripts/pages/serve-pages.mjs` | `serve-pages.test.mjs` | done (this branch) |
| Real-chain acceptance of the Pages artifact under `/GhostPay/` | `web/e2e/pages-devnet.spec.ts`, `web/playwright.pages-devnet.config.ts`, `BROWSER_DEVNET_MODE=pages` in `scripts/beta/browser-devnet.sh` | local run | done (this branch) |
| Post-deployment smoke test | `scripts/pages/smoke.mjs` | local run against the built site served under `/GhostPay/` | done (this branch) |
| Workflow: PR validation, manual main-only deploy, release gates, smoke | `.github/workflows/pages.yml` | YAML parse, `check-actions-pinned.sh`; hosted run pending | done (this branch); hosted run pending |
| Publishing | Settings > Pages source, `github-pages` environment | | owner |
| Testnet manifest, release keys, testnet deployment | `apps/web/deployments/`, `vars.GHOSTPAY_RELEASE_PUBKEYS` | | owner |

## Excluded from this release (code kept, not built into the Pages site)

Relayer service and gas sponsorship (`apps/relayer`; the web client keeps an optional user-configured relayer field), ERC-4337, policy accounts and scheme 2 (AUD24-01 stays open, ABI unchanged), Bitcoin Silent Payments, Solana, TRON, other networks, merchant billing and server-side jobs, federation and analytics, desktop and mobile apps.

## Security findings

An independent, read-only AI-assisted review of the lean static client and the Pages tooling ran on this branch. It was not a professional audit. Each finding then went to a separate adversarial verifier that tried to refute it.

| ID | Finding | Verifier | Status |
|---|---|---|---|
| GP-PAGES-01 | The `djshellshoxxx.github.io` origin is shared by every Pages site of the account (more than fifteen published). Any of them can script a same-origin GhostPay window or frame and read its storage. | Confirmed (medium) | Mitigated in the build: the origin is recorded, the banner warns, and testnet manifests are refused on a shared origin without explicit acceptance. **Open for the owner:** custom domain or dedicated account. |
| GP-PAGES-02 | A keystore download counted as a verified backup, so the idle lock could wipe keys whose only copy never reached the disk. | Confirmed (low) | Fix lane in progress: an unverified download no longer allows the wipe, plus a "verify backup" step |
| GP-PAGES-03 | `build-pages.sh` had no clean-tree check | Refuted: the publishing path builds from a clean CI checkout with libraries rebuilt from source | Hardened anyway: release mode refuses a modified tree; test builds must say `GHOSTPAY_PAGES_DEV=1` |
| GP-PAGES-04 | The idle lock relied on one `setTimeout`, so device sleep delayed it | Confirmed (low) | Fix lane in progress: wall-clock check on visibility, focus and an interval |
| GP-PAGES-05 | Sweep is blocked when the saved vault holds other keys | Refuted: audit L1-02 specified this fail-closed behaviour | No change |
| GP-PAGES-06 | The Tor/proxy "hides your IP" row is unqualified | Refuted: the rows above it already carry the hedge | No change |

Found by the real-chain acceptance run:

| Defect | Fix | Test |
|---|---|---|
| The Home release check resolved `./assets/index-*.js` against the origin root, so under `/GhostPay/` it fetched another site's path | `web/src/lib/release.ts` resolves against `document.baseURI` | `release.test.ts` (sub-path case); `pages-devnet.spec.ts` (strict: nothing leaves `/GhostPay/`) |
| `build-pages.sh` version probe failed under `FORCE_COLOR=1` | `NO_COLOR=1 FORCE_COLOR=0 node -p` | Pages acceptance run |

Accepted limitations, documented and not changed here: no response headers on Pages (no `frame-ancestors`, `nosniff`, COOP or Permissions-Policy); a broad `connect-src` for user-chosen RPCs; plain-text RPC URLs and settings in `localStorage`; tab-scoped duplicate-payment and sweep journals; the in-page release hash is self-attested.
