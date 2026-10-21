# Developer and integrator growth features

Date: 2026-10-21. Branch `claude/remote-extensions-1`. Lens: developers and integrators. Proposal only; no source changed. Companion to `features.md` (31 consumer/merchant items; NOT repeated here) and `growth-consumers.md`. Score = Impact (1-5) / effort weight (S=1, M=2, L=4), same as `features.md`.

## 0. Ground rules (every item must satisfy)

- No third-party call by default. Every network path is injected by the caller (RPC URL, relayer URL, webhook target) and the default is "none". No telemetry, no package postinstall network, no CDN script (SECURITY.md "No analytics, telemetry"; `apps/web/scripts/scan-bundle.mjs` stays green).
- Keys stay local. SDK/CLI/daemon take key material only through `SecretBox` (`packages/secret-box`), never via argv, never in logs, never over HTTP. Viewing key never leaves the operator's host.
- No custody, no hosted GhostPay service. "REST alternative" means a daemon the integrator runs; GhostPay operates nothing.
- No anonymity claim (README line 5). SDK docs repeat the limits page.
- New code in new packages; `apps/web` and `apps/relayer` stay thin consumers. Owner dir per feature below.
- Supply chain: pinned deps (exact versions, as `packages/core-crypto/package.json`), pinned Actions (`scripts/check-actions-pinned.sh`), reproducible build (`scripts/release-build.sh`).

## 1. Exists today (verified)

| Area | Evidence | Gap for integrators |
|---|---|---|
| Typed libs, ESM, strict TS | `packages/core-crypto`, `invoice-schema`, `chain-adapters` (`main`/`types`/`exports` to `dist`); invoice API `packages/invoice-schema/src/envelope.ts:165` `encodeFragment`, `:229` `parseFragment`, `schema.ts:331` `createInvoice` | Every package has `"private": true`, `"license": "UNLICENSED"` (`packages/invoice-schema/package.json:4-5`); not installable by anyone. No facade: integrator must wire three packages. |
| Relayer HTTP API | `apps/relayer/src/server.ts:24-29` routes `/healthz`, `/v1/info`, `/v1/quote`, `/v1/sweep`; typed client only inside web app `apps/web/src/lib/relayerClient.ts:72,104` | No OpenAPI/JSON Schema; client not reusable from Node. |
| Structured logs | `apps/relayer/src/log.ts:33,65-67` JSON lines, fixed route/event/error-class vocab, sanitised fields | No metrics, no documented event schema. |
| Container | `apps/relayer/Dockerfile:15,27-28` distroless nonroot, port 8787; `apps/relayer/deploy/ghostpay-relayer.service` | No compose file; no web image; no onion profile; web static bundle only via `release-build.sh`. |
| Test doubles | `apps/web/src/test/mockWallet.ts:26` `MockWallet implements Eip1193Provider`, `mockRpc.ts:5`, `mockChain.ts` `chainWithLogs`, `invoiceFixtures.ts` | Live inside the app tree, not exported. Anvil e2e exists only in relayer test (`apps/relayer/src/e2e.anvil.test.ts`, skips if `anvil` missing; README line 14). |
| Vectors | `test-vectors/{scheme1,policy-scheme}.json`, `generate.mjs`, `README.md` | JS-only consumers; no cross-language harness. |
| Embed | `apps/web/public/ghostpay-embed-v1.js:1-20` popup only, no callback | Covered by `features.md` embed-snippet / embed-return; here only as dependency. |
| Release verification | `scripts/verify-release.sh`, `.github/workflows/release.yml` (attest-build-provenance v4.2.2, draft release) | Manual; no reusable Action for mirrors/merchants. |
| Manifest schema | `deployments/schema.json`, `docs/DEPLOYMENT_MANIFEST.md`, loader `packages/chain-adapters/src/deployments.ts` | No linter CLI against a live RPC. |
| i18n / mode badge / status | `features.md` i18n, mode-guard, net-status | Contributor workflow for translations missing (item 14). |
| Contributor docs | grep: no CONTRIBUTING, no bounty text; `SECURITY.md` exists | Missing. |

## 2. Competitor research (retrieved 2026-10-21; GitHub raw only)

| Product | Observed feature | Source | Lesson |
|---|---|---|---|
| Stripe CLI | "Securely test webhooks without relying on 3rd party software", "Trigger webhook events or resend events", `listen` / `trigger` commands | https://raw.githubusercontent.com/stripe/stripe-cli/master/README.md lines 10-11, 304-305 | `listen`/`trigger`/`resend` loop is the dev on-ramp; GhostPay can offer it fully local. |
| ScopeLift stealth-address-sdk | Generate stealth address, compute key, check announcements, look up registry meta-address, fetch/watch announcements, prepare announce/register payloads | https://raw.githubusercontent.com/ScopeLift/stealth-address-sdk/main/README.md "Features" | Closest peer: library only, no CLI, no invoice, no daemon, no sandbox. GhostPay differentiator = invoice + checkout + sweep in one typed facade. |
| BTCPay Server (docker) | One deployment bundle: server, PostgreSQL, NBXplorer, node, Nginx HTTPS, Tor hidden services | https://raw.githubusercontent.com/btcpayserver/btcpayserver-docker/master/README.md "standard Bitcoin deployment" | Self-host merchants expect compose + onion as profiles. |
| BTCPay Greenfield API | Published OpenAPI document (`openapi`, `servers`, `components`, `security`), title "BTCPay Greenfield API" | https://raw.githubusercontent.com/btcpayserver/btcpayserver/master/BTCPayServer/wwwroot/swagger/v1/swagger.template.json | Self-hosted REST + OpenAPI is the integrator norm; generated clients follow. |
| Foundry anvil | Local node with `--fork-url` | https://raw.githubusercontent.com/foundry-rs/foundry/master/README.md lines 30, 64 | Sandbox should wrap anvil, not invent a chain. |
| OpenAPI Generator | Generates clients from a spec | https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/README.md | Ship the spec; others generate Go/Python/PHP clients. |

Caveat: README-level reading only; no product was run. Items marked "unverified" were not checked beyond the cited text.

## 3. Features (new; none duplicates `features.md`)

Format: problem / why people choose and keep it / design / privacy-security / deps / effort / impact / owner.

### D1. `@ghostpay/sdk`: one typed facade (browser, Node, workers)
- Problem: three packages, no entry point, `private: true`; copy-paste from `apps/web/src/lib`.
- Pull: `npm i`, 10-line "create invoice, get link, verify, scan" quickstart; the reason a dev picks GhostPay over raw ERC-5564 libs.
- Design: re-exports and composes `createInvoice`/`encodeFragment`/`parseFragment`, `buildPaymentTx`, log scan, `buildSweep`, relayer client (moved out of web). Dual ESM + type declarations, `sideEffects:false`, subpath exports (`/invoice`, `/scan`, `/sweep`, `/relayer`, `/testing`). Stable `GhostPayError` with `code`, `docsPath`, `retryable`. Injected `fetch`, `RpcClient`, `now`, `rng`; no globals. Semver + `API.md` generated by api-extractor.
- Privacy/security: no default endpoints; key args are `SecretBox`; lint rule bans `fetch` outside injected deps; bundle scan runs on the package.
- Deps: license decision (see section 6); `secret-box`. Effort M. Impact 5. Owner `packages/sdk`.

### D2. `ghostpay` CLI
- Problem: no scriptable path; ops, QA and merchants' cron jobs cannot create invoices or sweep.
- Pull: `ghostpay invoice new --fiat 25 --token USDC --chain 84532 > link.txt`, `invoice verify <link>`, `scan --from-block`, `sweep --to 0x..`, `manifest lint`, `doctor`.
- Design: Node >=22 (repo engine), subcommands over D1. Secrets via `--key-file` (0600 check), passphrase prompt on TTY, or `GHOSTPAY_KEY_FD` file descriptor; never argv/env echo. `--json` stable output with schema version, exit codes documented. Dry-run default for anything that signs a tx; `--yes` required to broadcast. `doctor` checks Node version, manifest signature/bytecode (when S3-01 lands), RPC chain id, clock skew.
- Privacy/security: no network unless `--rpc`/`--relayer` given; refuses mainnet while chain `enabled:false` (`packages/chain-adapters/src/config/chains.ts`); redacting logger shared with relayer (`log.ts` vocab).
- Deps: D1. Effort M. Impact 5. Owner `packages/cli`.

### D3. `@ghostpay/devnet`: sandbox with faucet, mock tokens, one-command chain
- Problem: README says nothing was ever run against a real chain; integrators cannot try a payment end to end. Anvil path is test-only and skipped by default.
- Pull: `npx ghostpay devnet up` gives a funded local chain with deployed Router, SweepRelayer, mock ERC-20 (with ERC-2612), a manifest file, a local relayer, and printed test accounts in under 10 s. Same as Stripe test mode, but local.
- Design: spawns `anvil` (path via `ANVIL_BIN`, as e2e test does), runs the forge-built artifacts from `packages/contracts/out`, writes `./.ghostpay-devnet/manifest.json` valid against `deployments/schema.json`, exposes `faucet(address, token, amount)` and `mine(n)`/`setTime(t)` (for expiry/delay tests), a snapshot/revert helper, optional `--fork-url` (opt-in, says which RPC sees what). Manifest has a loud `devnet:true` flag and chain id 31337; the web app and CLI refuse it when a non-local RPC is configured.
- Privacy/security: binds 127.0.0.1 only; throwaway keys printed with "never reuse"; refuses to run with a mainnet RPC; devnet manifest cannot satisfy mainnet gating.
- Deps: foundry installed by user; D1 optional. Effort M. Impact 5. Owner `packages/devnet`.

### D4. `@ghostpay/testkit`: in-process mocks for integrator tests
- Problem: `MockWallet`, `mockRpc`, `chainWithLogs`, fixtures are useful but buried in `apps/web/src/test`.
- Pull: Vitest/Jest/Playwright users test their checkout without any chain: `createMockWallet()`, `mockChain({logs})`, `fixtureInvoice()`, deterministic RNG, fake timers helpers, Playwright fixture that injects EIP-6963 provider.
- Design: move and generalise, keep web tests importing from the package. `mockChain` can replay a recorded announcement set. Typed assertion helpers (`expectPaymentTo(stealthAddr)`).
- Privacy/security: test-only package, `devDependencies` convention, marker export `__TESTKIT__` that the bundle scan rejects in production bundles.
- Deps: none. Effort S. Impact 4. Owner `packages/testkit`.

### D5. `ghostpay-watch`: self-hosted payment watcher with signed webhooks (the REST/webhook alternative)
- Problem: a merchant backend needs "invoice X paid" without trusting a hosted processor. Only the scan UI exists (`Scan.tsx`, `scanner.worker.ts`).
- Pull: BTCPay-style event hook, with no server of ours. Runs next to the merchant's shop, watches announcements with the view key, emits events.
- Design: long-running Node process (or `ghostpay watch`). Inputs: view key via SecretBox/file, RPC URL(s), manifest. Outputs (all opt-in): JSONL on stdout, POST webhooks to operator-chosen URLs with HMAC-SHA256 signature header + timestamp + event id (replay window 5 min, retries with backoff, `resend` command like Stripe), local SSE/HTTP read API bound to 127.0.0.1 or unix socket with bearer token. Events: `payment.detected`, `payment.confirmed(depth n)`, `payment.reorged`, `invoice.expired`, `sweep.sent`. Reorg-safe via existing block-hash checks (`mockChain.ts` already models parent hashes). Order correlation modes, stated honestly: (a) manual, (b) payer-returned proof (embed-return), (c) unique-amount suffix chosen at invoice time. No on-chain order id exists (57-byte metadata is fixed), so no mode is exact without payer cooperation.
- Privacy/security: only the host's RPC sees scan ranges (document Tor/own-node, `docs/operators/local-scanner-and-rpc.md`); webhook bodies carry stealth address, tx hash, amount, never keys; no spend key in the process (watch-only: view key + spend pubkey); SSRF guard on webhook URLs (no link-local/metadata ranges unless allowlisted).
- Deps: D1; confirmation-depth policy from chain-adapters. Effort L. Impact 5. Owner `packages/watch`.

### D6. `@ghostpay/verify`: offline invoice and payment verification API
- Problem: "did this link come from the seller I trust" and "does this tx pay this invoice" logic is spread across `Pay.tsx` and `payExec.ts`; backends cannot call it.
- Pull: a merchant's backend or a support tool verifies a customer-supplied link or receipt in one call: `verifyInvoice(link, {trustedSigners, now})` returns `{ok, signer, expired, amountPolicy, reasons[]}`; `verifyPayment(invoice, txReceipt, announcement)` returns match/mismatch with reasons.
- Design: pure functions, no I/O (receipt/log passed in). Reuses `isTrustedSeller`, `checkExpiry`, `assertPreviewMatchesCalldata`, fee maths. Output is a stable JSON schema (D8). CLI wrapper `ghostpay invoice verify`.
- Privacy/security: private part (line items) decrypted only when key supplied; fails closed on unknown version; constant-size reasons, no oracle on key material.
- Deps: D1 (can start inside it). Effort S. Impact 4. Owner `packages/verify` (or `packages/sdk/verify`).

### D7. Self-host kit: compose, static image, onion profile
- Problem: relayer has a Dockerfile only; web is a tarball; no one-command path. Operators will not hand-write nginx and Tor config.
- Pull: `docker compose --profile web --profile relayer --profile onion up`. Same convenience BTCPay gets from its docker repo.
- Design: `deploy/compose/` with (1) `web`: unprivileged static server (read-only rootfs, security headers incl. CSP and COOP/COEP matching `apps/web/public/_headers`) serving the verified release tarball, hash pinned in `.env`; (2) `relayer`: existing image, secrets via Docker secrets / file (never env, `secrets.ts` already supports sources); (3) `onion`: Tor container publishing a v3 hidden service for web (relay optional), key volume documented; (4) `watch` profile for D5. Images pinned by digest. `make verify` runs `scripts/verify-release.sh` against the mounted tarball before start and the container refuses to start on mismatch.
- Privacy/security: no analytics, no auto-update, no container phoning home; compose declares `internal` network for relayer<->RPC. Onion service keys are operator-owned; publish the `.onion` only by operator choice. Align with `docs/remote/onion-i2p-research.md` (not re-researched here).
- Deps: release artifacts. Effort M. Impact 5. Owner `deploy/` + `packages/selfhost-kit` (scripts, healthcheck).

### D8. Machine-readable contracts: OpenAPI 3.1 + JSON Schemas, generated and drift-checked
- Problem: relayer API, invoice object, manifest, webhook events, CLI `--json`, log events are documented only in prose/TS.
- Pull: any language gets a client/validator (OpenAPI Generator consumes the spec, per https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/README.md); docs site gets API reference; fuzzers get inputs.
- Design: `docs/api/relayer.openapi.json` (routes at `server.ts:24-29`, error codes from `errors.ts`), `schemas/*.schema.json` (invoice v1, manifest (exists: `deployments/schema.json`), webhook event, log event, CLI output). Generated from source types (zod-free: hand schema + `ajv`-style test that every example validates and every TS type has a schema). CI job `schemas-drift` fails when the generated file differs.
- Privacy/security: spec contains no real hosts; examples use `.invalid` and testnet.
- Deps: none. Effort M. Impact 4. Owner `packages/api-spec`.

### D9. `@ghostpay/react`: headless hooks and checkout component
- Problem: most storefronts are React/Next; `ghostpay-embed-v1.js` is vanilla popup only.
- Pull: `<GhostPayButton invoice={link} onComplete={...}>`, `useInvoice`, `usePaymentStatus` (polls injected RPC), `useGhostPay()` context with the injected deps.
- Design: peer dep React 18/19, headless + minimal unstyled default (CSS vars, a11y per `features.md` a11y-pass), SSR-safe (no window at import), popup opener reuses the embed's validation rules (same-origin https, fragment prefix, 22000 cap, `ghostpay-embed-v1.js:validLink`). `onComplete` only fires from D5/embed-return proof; never from the popup `window` (noopener has no channel, header comment line 8).
- Privacy/security: link stays in fragment, never in a query string, never logged; component never touches keys.
- Deps: D1, `features.md` embed-return. Effort M. Impact 4. Owner `packages/react`.

### D10. Plugin API for privacy options (build-time, capability-declared)
- Problem: users want different jitter policies, RPC transports (Tor, own node, Helios-style light client), price sources, scan backends (see Roadmap Feature 5), but every option is a fork.
- Pull: third parties ship options without touching core; GhostPay becomes the privacy-options platform.
- Design: typed extension points `TransportPlugin`, `ScanSourcePlugin`, `JitterPolicy` (current `jitter.ts:9` `randomDelayMs` as default impl), `PriceSourcePlugin`, `ExportPlugin`. Each plugin ships a manifest `{id, version, points[], capabilities: {network: [hosts], storage, none}, hash}`. Loaded only at build/bundle time (static import list, hash-pinned, listed in the release manifest and in the About page); no runtime remote code, no eval (CSP forbids). Capability gate: plugin declaring `network` requires explicit user opt-in, per-host disclosure text shown ("this observer learns X"). Contract tests ship in `/testing` so a plugin author runs `ghostpay plugin check`.
- Privacy/security: biggest attack surface of this list; hence build-time only, no default plugins with network, reproducible-build includes plugin hashes, `scan-bundle` extended to reject undeclared hosts.
- Deps: D1, `features.md` mode-guard (disclosure UI). Effort L. Impact 4. Owner `packages/plugin-api`.

### D11. Example apps and project templates
- Problem: no "hello world".
- Pull: `npm create ghostpay@latest`-style (offline copy from the package, no registry fetch at scaffold time) templates: (1) static HTML shop with embed button, (2) Express + `ghostpay-watch` webhook receiver verifying the HMAC, (3) Next.js/React with D9, (4) CLI cron invoicing script, (5) Playwright e2e against D3.
- Design: `examples/*` each with `README`, devnet script, test; CI builds and tests them against D3 so they cannot rot. Webhook receiver example shows constant-time HMAC compare and replay window.
- Privacy/security: examples set strict CSP, no third-party scripts, `.env.example` only, secret-scan clean (`scripts/scan-secrets.sh`).
- Deps: D1, D3, D5, D9. Effort M. Impact 4. Owner `examples/`.

### D12. Observability hooks (opt-in, local)
- Problem: relayer operators have JSON logs (`log.ts`) but no metrics; SDK users cannot see why a scan is slow.
- Pull: operators run Prometheus/Grafana of their own; SDK users attach `onEvent`.
- Design: relayer: optional `/metrics` (Prometheus text) on a separate listener bound to localhost/unix socket, off by default; counters/histograms keyed only by the existing fixed vocab (route, error class, breaker state from `relayer-guard` `health()`), no per-address or per-IP labels (cardinality and privacy). SDK: `onEvent(e)` with typed `{kind, durationMs, chainId, redacted:true}`, payloads pass through `assertNoSecretBox` (`packages/secret-box`). Event catalogue lives in D8.
- Privacy/security: no label may carry address, tx hash, IP; test enumerates labels. No push exporters by default (pull only).
- Deps: D8 for catalogue. Effort S. Impact 3. Owner `packages/telemetry-local` (name avoids implying remote telemetry; alt `packages/obs-hooks`) + `apps/relayer` wiring (separate session).

### D13. `ghostpay/verify-release` GitHub Action + mirror CI template
- Problem: `verify-release.sh` is manual; mirrors (`docs/operators/mirror-hosting.md`) and merchants self-hosting the bundle need continuous proof they serve the signed build.
- Pull: one `uses:` line in their repo; scheduled job compares the live site's file hashes to `release-manifest.json` and fails loudly on drift (tamper alarm).
- Design: composite Action (pinned by SHA like all others) that downloads tarball + `SHA256SUMS` + manifest, runs `verify-release.sh`, runs `gh attestation verify`, then optionally fetches a deployed URL's `index.html` and asset list and compares hashes. Reusable workflow for forks to publish their own reproducible build. Fetches only from URLs given as inputs.
- Privacy/security: the live-check makes a request to the operator's own site only; Action has `permissions: contents: read`; refuses unsigned tags.
- Deps: release pipeline. Effort S. Impact 4. Owner `.github/actions/verify-release` (new dir) + docs.

### D14. L10n contribution framework
- Problem: `features.md` i18n spec builds the runtime; nothing lets outsiders add a language safely.
- Pull: translators can contribute with one file and a checker; localisation widens reach.
- Design: `locales/<tag>.json` catalogs, `ghostpay l10n check` (missing keys, placeholder parity, ICU-lite syntax, length budget, pseudo-locale), per-locale `reviewed` flag for security-critical keys (from i18n spec), glossary file of fixed terms ("stealth address", "irreversible"), `TRANSLATING.md`. CI blocks merge on placeholder mismatch. No translation SaaS (no string upload to a third party).
- Privacy/security: catalogs are data, bundled, no remote fetch; locale choice stays local.
- Deps: `features.md` i18n, ux-glossary. Effort S (on top of i18n). Impact 3. Owner `packages/l10n-kit`.

### D15. Cross-language conformance suite
- Problem: wallets and backends in Go/Python/Rust/Swift will reimplement scheme 1 and the invoice envelope; divergence causes lost funds.
- Pull: "GhostPay-compatible" badge; vectors + a runner, so ports are cheap. ScopeLift's SDK is TS-only (README "Installation"), so this is open ground.
- Design: extend `test-vectors/` with invoice envelope (encode/parse/sign/encrypt), fee maths, calldata and metadata vectors; a JSON "runner protocol" (stdin cases, stdout results) and reference harness; `CONFORMANCE.md` listing levels (L1 derive, L2 scan, L3 invoice). Negative vectors for every strict-parse rule.
- Privacy/security: vectors are throwaway keys only; checked by secret scan.
- Deps: none. Effort M. Impact 3. Owner `test-vectors/` + `packages/conformance`.

### D16. Contributor onboarding and bounty scaffolding
- Problem: no CONTRIBUTING, no good-first-issue pipeline, no bounty text; many parallel agents/humans already edit.
- Pull: outside devs can land a PR in an hour; researchers know scope and safe harbour. Trust signal for an unaudited project.
- Design: `CONTRIBUTING.md` (clone, `npm ci --ignore-scripts`, `npm run build:libs`, test, devnet), `.devcontainer` with pinned Node 22 + foundry, `npm run doctor`, issue/PR templates (security checklist: touches keys? network? new dep?), labels (`good-first-issue`, `spec-ready`), CODEOWNERS for crypto paths, `docs/BOUNTY.md` draft: testnet-only scope, severity table keyed to the audit finding IDs, safe harbour, no payout promised until funded (do not imply a program that does not exist). Dependabot already present.
- Privacy/security: contributors never need real keys; templates warn against pasting seeds; `scan-secrets.sh` in pre-commit.
- Deps: none. Effort S. Impact 3. Owner repo root + `docs/contributing/`.

## 4. Ranked table

| Rank | ID | Feature | Impact | Effort | Score | Depends on | Owner dir |
|---|---|---|---|---|---|---|---|
| 1 | D4 | testkit (exported mocks) | 4 | S | 4.0 | - | `packages/testkit` |
| 2 | D6 | verify (offline invoice/payment verification) | 4 | S | 4.0 | D1 start | `packages/verify` |
| 3 | D13 | verify-release Action | 4 | S | 4.0 | release pipeline | `.github/actions/verify-release` |
| 4 | D12 | obs hooks + relayer metrics | 3 | S | 3.0 | D8 | `packages/obs-hooks` |
| 5 | D14 | l10n contribution framework | 3 | S | 3.0 | i18n | `packages/l10n-kit` |
| 6 | D16 | contributor onboarding + bounty scaffold | 3 | S | 3.0 | - | repo root, `docs/contributing/` |
| 7 | D1 | `@ghostpay/sdk` facade | 5 | M | 2.5 | license decision | `packages/sdk` |
| 8 | D2 | `ghostpay` CLI | 5 | M | 2.5 | D1 | `packages/cli` |
| 9 | D3 | devnet sandbox + faucet | 5 | M | 2.5 | foundry | `packages/devnet` |
| 10 | D7 | self-host kit (compose/static/onion) | 5 | M | 2.5 | releases | `deploy/`, `packages/selfhost-kit` |
| 11 | D8 | OpenAPI + JSON Schemas | 4 | M | 2.0 | - | `packages/api-spec` |
| 12 | D9 | React bindings | 4 | M | 2.0 | D1, embed-return | `packages/react` |
| 13 | D11 | examples/templates | 4 | M | 2.0 | D1,D3,D5,D9 | `examples/` |
| 14 | D15 | conformance suite | 3 | M | 1.5 | - | `packages/conformance` |
| 15 | D5 | ghostpay-watch daemon + webhooks | 5 | L | 1.25 | D1 | `packages/watch` |
| 16 | D10 | plugin API | 4 | L | 1.0 | D1, mode-guard | `packages/plugin-api` |

Build order (dependency-aware, not score-only): license decision -> D4/D6 -> D1 -> D3 -> D2 -> D8 -> D7 -> D5 -> D13/D16 first-wave in parallel with all.

Cross-cutting prerequisite, not a feature: choose a licence and drop `private`/`UNLICENSED` (`packages/*/package.json`) for the packages to be published. Human decision; flagged, not assumed.

## 5. Top 10 buildable specs

Common acceptance rule for all: `npm run typecheck`, `lint`, `test` green; `ci:scan-secrets` and `ci:check-actions` green; bundle scan finds no network call or host literal in default paths.

### S1. D1 `@ghostpay/sdk`
MUST
- Export `createInvoiceLink`, `parseInvoiceLink`, `buildPayment`, `scanAnnouncements`, `buildSweep`, `relayerClient`, `GhostPayError` over existing packages; no re-implementation of crypto.
- Accept all I/O through injected `{fetch, rpc, now, rng}`; importing the package performs no I/O and reads no globals.
- Accept key material only as `SecretBox`; a plain `Uint8Array`/hex string key argument is a type error.
- Every thrown error is `GhostPayError` with `code` (stable enum), `retryable`, `docsPath`; no message contains key bytes or full invoice link.
- Ship ESM + `.d.ts`, `sideEffects:false`, subpath exports; work in Node >=22 and in a browser bundle.
SHOULD: api-extractor report committed; CHANGELOG with semver policy; `/testing` subpath re-exports D4.
Acceptance
1. Quickstart (create link, parse, verify) runs in Node and in a jsdom/Vitest browser env with identical output for a fixed rng.
2. Test passes `fetch` that throws; every offline function still works; network functions call only the injected one.
3. Passing a hex-string key fails `tsc` (type test) and throws at runtime.
4. Grep of built `dist` finds no `http://`/`https://` literals other than doc comments (scripted).
5. `GhostPayError` snapshot test lists every code; adding a code without docs fails.

### S2. D2 `ghostpay` CLI
MUST
- Commands: `invoice new|verify`, `scan`, `sweep`, `manifest lint`, `doctor`; `--json` output with `schemaVersion`.
- Secrets from `--key-file` (reject mode wider than 0600), TTY prompt, or fd; reject keys in argv and warn on env use.
- Any signing/broadcast command is dry-run unless `--yes`; refuses chains with `enabled:false`.
- Exit codes: 0 ok, 1 verification failed, 2 usage, 3 network, 4 refused-by-policy.
SHOULD: shell completions; `--rpc` repeatable with fallback order; progress on stderr only.
Acceptance
1. `invoice new` then `invoice verify` round-trips against devnet (S3).
2. Key file with mode 0644 exits 4 with no read of the file content.
3. `sweep` without `--yes` prints the planned tx and sends zero RPC writes (mock asserts no `eth_sendRawTransaction`).
4. `--chain 1` exits 4 while mainnet is disabled.
5. stdout of every command validates against its D8 schema.

### S3. D3 `@ghostpay/devnet`
MUST
- `up` starts anvil on 127.0.0.1, deploys Router + SweepRelayer + a 2612 mock token from `packages/contracts/out`, writes a schema-valid manifest with `devnet:true`, chain id 31337.
- `faucet(addr, token, amount)`, `setTime`, `mine`, `snapshot/revert`.
- Refuse non-loopback bind and any `--fork-url` unless `--fork-url` is explicit (print which host sees traffic).
- Clean shutdown kills anvil; exits non-zero with clear message if `anvil`/artifacts missing (no silent skip).
SHOULD: start in under 10 s on CI; deterministic accounts via fixed mnemonic labelled throwaway.
Acceptance
1. `up` then pay a 25 bps invoice then sweep via local relayer: balances match `fees.ts` maths exactly.
2. Manifest validates with `packages/chain-adapters/src/deployments.ts` loader and is rejected when a non-local RPC is configured in the app/CLI.
3. `setTime(+expiry)` makes `checkExpiry` return expired in the SDK.
4. Port scan shows only loopback listeners.
5. Missing anvil returns exit 1 with the install hint, not a skipped test.

### S4. D5 `ghostpay-watch`
MUST
- Watch-only: needs view key + spend public key; refuses to start if given a spend private key.
- Emit `payment.detected/confirmed/reorged`, `invoice.expired`; confirmation depth configurable per chain; reorg emits `reorged` and de-confirms.
- Webhooks: HMAC-SHA256 over `timestamp.id.body`, headers `X-GhostPay-Signature/Timestamp/Event-Id`, retry with exponential backoff, at-least-once with stable event id, `resend <id>` command.
- Webhook target must pass SSRF guard (https, no private/link-local/metadata ranges unless allowlisted).
- State (cursor, delivered ids) stored locally, atomic writes, resumes without duplicate or missed events after kill -9.
- Read API/SSE binds 127.0.0.1 or unix socket and requires bearer token.
SHOULD: unique-amount correlation helper; `--once` mode for cron.
Acceptance
1. Devnet payment produces exactly one `detected` and one `confirmed` after N blocks; killing the process mid-way and restarting produces no duplicates.
2. Simulated 2-block reorg emits `reorged` and then a fresh `detected`.
3. Receiver with wrong secret rejects; timestamp older than 5 min rejects; same event id twice is idempotent.
4. Webhook URL `http://169.254.169.254/` is refused at config load.
5. Logs and webhook bodies contain no key bytes (assertNoSecretBox + grep of fixtures).

### S5. D6 `@ghostpay/verify`
MUST
- `verifyInvoice(link, {trustedSigners, now, key?})` and `verifyPayment(invoice, receipt, announcement)` are pure, synchronous or Promise, no I/O.
- Result `{ok, reasons: Code[]}`; unknown version, bad signature, expired, amount-policy violation, chain mismatch, fee/net mismatch each a distinct code.
- Fail closed: any parse error yields `ok:false`, never throws for untrusted input.
SHOULD: `explain(reasons)` returning user-safe text keyed to `ux-errors`.
Acceptance
1. Table test of every negative vector in `invoice-schema` tests yields the expected reason code.
2. Fuzz 10k mutated fragments: no throw, no `ok:true` for any mutated signed payload.
3. `verifyPayment` rejects a payment whose net differs by 1 wei from `routerFee/Net`.
4. Timing: ok/not-ok paths for signature check use library constant-time compare (reviewed, test asserts same function used).

### S6. D7 Self-host kit
MUST
- Compose profiles `web`, `relayer`, `onion`, `watch`; images pinned by digest; read-only rootfs, non-root, no published ports except the operator-chosen one.
- Start gate: `verify-release.sh` against the mounted tarball and expected commit; mismatch means container exits 1.
- Secrets by file/Docker secret; compose file has no secret in `environment:`.
- Web container serves headers equal to `apps/web/public/_headers`.
- No outbound traffic from `web`; `relayer` egress limited to configured RPC (network internal + documented proxy).
SHOULD: `healthcheck` per service; documented backup of Tor key volume.
Acceptance
1. `docker compose config` lint script finds no `latest` tags, no secrets in env, no `privileged`.
2. Tampering one byte of the tarball makes `web` refuse to start.
3. Header diff test: served headers equal `_headers` for `/` and `/assets/*`.
4. With network disabled, `web` still serves the app (no runtime fetch to outside).
5. `.onion` profile starts and serves `/healthz`-equivalent static file in CI using Tor on an isolated network (best effort; mark as nightly).

### S7. D4 `@ghostpay/testkit`
MUST
- Export `MockWallet` (EIP-1193 + EIP-6963 announce), `mockRpc`, `chainWithLogs`, `fixtureInvoice`, deterministic `rng`, Playwright fixture.
- `apps/web` tests import from it (no copies); zero production imports.
- Production bundle containing the package marker fails `scan-bundle`.
SHOULD: record/replay of announcement sets.
Acceptance
1. Existing 320 web tests still pass unchanged after the move.
2. Adding the import to `src/main.tsx` fails the bundle scan.
3. Playwright example test pays a fixture invoice with no network.

### S8. D8 OpenAPI + JSON Schemas
MUST
- `relayer.openapi.json` (3.1) covering four routes, error envelope and codes, security headers; schemas for invoice v1, manifest, webhook event, CLI output, log event.
- Generated or validated from source; CI job fails on drift; every example validates.
- Contains no real hostnames.
SHOULD: Spectral lint rules; generated-client smoke test (Python or Go) in nightly.
Acceptance
1. Real relayer integration test responses validate against the spec (reuse `api.test.ts` calls).
2. Remove a field from `server.ts` response type and CI fails.
3. `deployments/schema.json` stays the single manifest schema (referenced, not forked).
4. Spec lints clean; a generated client calls `/healthz` against the test server.

### S9. D13 verify-release Action
MUST
- Composite Action pinned by SHA (passes `check-actions-pinned.sh`), `permissions: contents: read`.
- Verifies `SHA256SUMS`, commit, `release-manifest.json`, and `gh attestation verify`; fails on unsigned/lightweight tags.
- Optional live-site check compares served file hashes to the manifest; only contacts the given URL.
SHOULD: scheduled-workflow template; job summary table.
Acceptance
1. Passing fixture release succeeds; one flipped byte fails with the file named.
2. Lightweight tag fails.
3. With `site-url` unset, network access is limited to GitHub release download (assert via recorded step log).
4. Self-test workflow runs the Action against the repo's last draft release in dry mode.

### S10. D1+D16 pair: licence-ready packaging and contributor path (S, unblocks all)
MUST
- Publish-readiness check script: every package to be published has licence, `files`, `exports`, `engines`, provenance flag; fails if `private:true` for a package listed in `PUBLISH.md`.
- `CONTRIBUTING.md`, PR template with security checklist, `CODEOWNERS` for `packages/core-crypto`, `invoice-schema`, `contracts`, `docs/BOUNTY.md` (testnet scope, severity table, safe harbour, explicit "no funded program yet" line if true).
- `npm run doctor` verifies Node >=22, installed foundry (optional), clean build of libs.
SHOULD: `.devcontainer` pinned versions.
Acceptance
1. Fresh clone: documented 5 commands reach green tests (verified in CI from a clean checkout).
2. Publish check fails on a package with `UNLICENSED`.
3. PR template renders and contains keys/network/new-dep questions.
4. `BOUNTY.md` contains no payout amount unless a funding source is named (lint for digits next to currency symbols).

## 6. Risks and open questions

- Licence choice gates publishing (human decision).
- Plugin API (D10) is the largest trust-boundary expansion; ship after SDK stabilises.
- Watcher correlation cannot be exact without payer cooperation (D5 states modes); do not market as "order tracking".
- Everything here is unrun; competitor notes are README-level (retrieved 2026-10-21).
- Dependency on S3-01 (manifest authentication, audit 03): CLI `doctor` and devnet manifest handling must adopt the signature check when it lands.
