# ADR-0029 GitHub Pages static EVM beta

Status: **Accepted (2026-11-28, djshellshoxxx) for one payments-disabled demonstration release** containing the [updated homepage in PR #776](https://github.com/djshellshoxxx/GhostPay/pull/776) at [the existing Pages URL](https://djshellshoxxx.github.io/GhostPay/). Further publications require a separate owner decision.

For this release, verify that the approved origin is `https://djshellshoxxx.github.io`, `sharedOrigin` is `true`, and `paymentsEnabledChainIds` is empty. Use the lean demo, its shared-origin warning and the existing Pages release gates. Record the deployed commit and successful live smoke check. Payment-enabled hosting remains subject to the open gates below.

## Context

The owner's GitHub Pages release directive (2026-11-12) makes one static, client-side EVM testnet beta on GitHub Pages the only release target: no GhostPay backend, relayer, database or scheduled job. ADR-0015 says no public instance is operated "until all of [five gates] exist", and that enabling publication needs a new ADR. This is that ADR.

## Hosting design

1. Publish only the **lean** EVM profile (`GHOSTPAY_LOCAL_BUILD_PROFILE=lean`), built by `scripts/pages/build-pages.sh` and independently verified by `scripts/pages/verify-pages-site.mjs`, through `.github/workflows/pages.yml` (manual dispatch on `main`, `github-pages` environment).
2. The default site is a **demonstration**: no deployment manifest, so payments are disabled on every chain. A Pages build refuses mainnet manifests outright; enabling a mainnet needs a different host and a new ADR.
3. Every Pages instance shows a mirror banner that states the payment state and the missing header protections (ADR-0015 item 5).
4. Testnet payments are enabled only by committing a release-signed testnet manifest and setting the public verification keys (`GHOSTPAY_RELEASE_PUBKEYS` repository variable), and only on a dedicated origin unless the owner explicitly accepts the shared `github.io` origin for test assets.

## ADR-0015 gates against this decision

| ADR-0015 gate | State | Evidence or owner action |
|---|---|---|
| 1. Manifests authenticated: compiled into the hashed bundle and read back on chain | Met in code | `apps/web/vite.config.ts` (bundled manifests, release-key verification), `apps/web/src/lib/manifest.ts`; the default service never fetches manifests at runtime |
| 2. Signed releases, reproducible build verified on a second machine, key fingerprint published | **Open** | Owner: signing key, fingerprint publication. `pages-evidence.json` and `SHA256SUMS` are produced per run but not signed |
| 3. Deployed and smoke-tested testnet deployment with a manifest | **Open** | Owner: authorized testnet deployment; see `docs/pages/README.md`, "External testnet qualification" |
| 4. Owner decisions: fee recipient, licence, terms, privacy notice, sanctions, legal advice | **Open** | Owner |
| 5. Header-capable primary host; GitHub Pages only as a labelled degraded mirror | Partly met | Banner implemented and verified; no header-capable primary host exists, so the Pages instance is currently the only one. Owner decides whether that is acceptable for a demonstration |
| (new) Origin isolation, GP-PAGES-01 | **Open** | `https://djshellshoxxx.github.io` is shared with more than fifteen other Pages sites of the account, which can script a same-origin GhostPay page and read its storage. `build-pages.sh` records the origin, warns in the banner and refuses testnet manifests on a shared origin unless `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet`. Owner: custom domain or dedicated account |

## Consequences

- Accepting this ADR allows `DEMO_DEPLOYED` (payments disabled). `TESTNET_BETA_QUALIFIED` additionally needs gates 2 and 3. Real funds stay out of scope.
- Clickjacking protection, `nosniff`, Permissions-Policy and cache control are unavailable on Pages. Mitigation: no one-click fund movement (every payment and sweep needs an explicit review and confirmation step), and the banner says so.
- Anyone who can change `main` or the Actions configuration controls the served code. Branch protection and the `github-pages` environment rules are part of the security boundary.
