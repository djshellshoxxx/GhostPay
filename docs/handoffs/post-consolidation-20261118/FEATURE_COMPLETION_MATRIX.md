# GhostPay feature completion matrix (post-consolidation, 2026-11-18)

**Audited source:** consolidated candidate PR [djshellshoxxx/GhostPay#203](https://github.com/djshellshoxxx/GhostPay/pull/203), product source `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (the previous session's CI-qualified head; PR head `71abc7e5` adds documentation only). Default branch `main` = `cfaebeeae22f292cb0bb3074619b2603cb738367` at audit time (an ancestor); after the snapshot PR #203 was merged (2026-11-18T06:56:49Z, `main` = `5467c158`, tree == `71abc7e5`).

**Machine-readable twin:** [`feature_completion_matrix.json`](feature_completion_matrix.json) (same rows, full requirement lists and evidence).

## How the numbers are produced (read before using any percentage)

- **Inventory.** Four independent teams inventoried every package/app directory: B1a (protocol, crypto core, contracts, account abstraction, deployments), B1b (browser application, keys, backup, storage, wallet, RPC), B2 (merchant, CLI, relayer, operations, UX packages, integrations, i18n, accessibility, hosting, docs) and B3 (multichain, privacy extensions, transport, experimental PoCs, future roadmap). All 71 package/app directories are mapped (B2 `package_coverage.md`).
- **Requirement-weighted scoring.** Each feature lists its requirements from specifications, ADRs, tests and code, weighted core = 3, important = 2, minor = 1. Each requirement is marked implemented yes / half / no (half = code exists but is not reachable from the intended surface) and verified yes / half / no (yes = an automated test exercising the behaviour passed, run locally by the team at `7a620ff1` or green in CI run 44231986652/44242366118; half = a test exists but was not shown passing). Verification is capped at implementation per requirement.
- **Recomputed, not self-reported.** Implementation % and verification % are recomputed by `score_features.py` from the requirement lists (rounded to 5) and the status is normalized to the rubric: VERIFIED_COMPLETE = implementation 100, verification ≥ 90 and no open Medium-or-higher defect (Low/Info and fixed items do not block, as in the rubric); IMPLEMENTED_UNVERIFIED = implementation ≥ 90; PARTIAL; SPEC_ONLY (< 10 % with a spec); NOT_STARTED; EXPERIMENTAL and BLOCKED are kept as reported. Where a team's headline number differed, the recomputed one is shown; every adjustment is listed in `evidence/features/scoring_issues.md` (99 entries).
- **Coordinator overrides** (`evidence/scripts/overrides.json`, applied by the scorer): one requirement correction verified in code (F-PROTO-03: per-log block-hash cross-check exists at `packages/chain-adapters/src/logs.ts:438-460`, tests 70/70), and a **security hold**: a row whose own code is the root cause of an open, confirmed Medium-or-higher finding cannot be VERIFIED_COMPLETE and is held at IMPLEMENTED_UNVERIFIED — F-KEY-01, F-WEB-11, F-WEB-12 (SEC-03), F-KEY-02 (SEC-05), F-WEB-07 (SEC-10). Findings that only concern the hosting context (SEC-01 shared origin) or another row (SEC-04 → spec 18 rows) do not hold a row.
- **External acceptance is excluded** from verification % (real wallets, devices, Firefox/WebKit/Tor Browser, public-testnet deployments, independent audits). No feature has external acceptance today; it is tracked per row.
- **Duplicates.** F-PROTO-13 and F-FUT-40 restate spec 18 (requirement 3q), which is scored once under F-KEY-07..F-KEY-12; both are excluded from aggregates and effort sums.
- **Aggregates** are requirement-weight-weighted means over the rows in scope. They measure how much of the *specified* behaviour exists and is tested, not release readiness: nothing in GhostPay is release-ready (no deployment of record, empty release keys, Mythril gate red by design, unprotected `main`).
- **Effort figures are estimates** (engineer-days, before parallelism), not measurements.

## Summary

Distinct features: **192** (194 rows; duplicates excluded from all counts and aggregates: F-FUT-40, F-PROTO-13). Status counts: BLOCKED 7, EXPERIMENTAL 45, IMPLEMENTED_UNVERIFIED 28, PARTIAL 28, SPEC_ONLY 46, VERIFIED_COMPLETE 38.

| Tier | Features | Requirement weight | Implementation % (weighted) | Verification % (weighted) | Status mix |
|---|---:|---:|---:|---:|---|
| beta-core | 42 | 634 | 85.1 | 83.2 | BLOCKED 3, IMPLEMENTED_UNVERIFIED 10, PARTIAL 5, SPEC_ONLY 6, VERIFIED_COMPLETE 18 |
| beta-supporting | 37 | 445 | 90.1 | 84.0 | IMPLEMENTED_UNVERIFIED 12, PARTIAL 12, VERIFIED_COMPLETE 13 |
| full-profile | 25 | 291 | 81.4 | 75.0 | EXPERIMENTAL 4, IMPLEMENTED_UNVERIFIED 6, PARTIAL 9, VERIFIED_COMPLETE 6 |
| experimental | 45 | 346 | 54.9 | 47.4 | BLOCKED 3, EXPERIMENTAL 41, VERIFIED_COMPLETE 1 |
| future | 43 | 149 | 5.4 | 3.4 | BLOCKED 1, PARTIAL 2, SPEC_ONLY 40 |
| **Beta scope (beta-core + beta-supporting)** | 79 | 1079 | **87.2** | **83.5** | |
| **All tiers excluding future roadmap** | 149 | 1716 | **79.7** | **74.8** | |
| **All tiers including future roadmap** | 192 | 1865 | **73.8** | **69.1** | |

Estimated remaining engineering effort for all non-complete rows (ESTIMATE, sum of per-row ranges, before parallelism): **309–920 engineer-days**.

## Tier: beta-core

| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |
|---|---|---:|---:|---|---|---|---|
| F-CLI-03 | CLI encrypted backup, restore, rekey, offline recovery | 100 | 85 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-CTR-01 | GhostPayRouter scheme-1 checkout router (native, ERC-20, ERC-2612 permit, buffer) + client builder | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-CTR-05 | Fee schedule F-PAY / F-SPONSOR (math, immutables, disclosure, manifest-sourced recipient) | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-CTR-07 | Contract qualification gates (Foundry unit/fuzz/invariant, coverage, Slither, Echidna, Mythril, NatSpec) | 90 | 80 | BLOCKED | M (2–4d) | implement | B1 |
| F-DEP-01 | Deployment manifests: schema, strict loader, structured release signature, build-time bundling | 85 | 80 | PARTIAL | S (0.5–1d) | repair | B1 |
| F-DEP-02 | On-chain manifest read-back verifyDeployment (spec 01) | 85 | 80 | PARTIAL | S (1–2d) | repair | B1 |
| F-DEP-03 | Chain/token/feed deployment matrix + release gate (spec 09) | 75 | 70 | PARTIAL | M (2–4d) | implement | B1 |
| F-DEP-04 | Testnet deployment tooling + Sepolia-first deployment of record | 75 | 55 | BLOCKED | M (1–3d) | implement | B1 |
| F-DOC-04 | In-app contextual help + static help/privacy pages | 65 | 65 | PARTIAL | S (0–1d) | none | B2 |
| F-I18N-01 | Web i18n framework: catalogs, translator, plurals/ICU-lite, RTL, language picker, pseudo-locales | 90 | 90 | IMPLEMENTED_UNVERIFIED | M (1–3d) | repair | B2 |
| F-KEY-01 | Seller key generation, hex import and in-memory session | 100 | 100 | IMPLEMENTED_UNVERIFIED | S (0–0d) | none | B1 |
| F-KEY-02 | Encrypted browser key vault (IndexedDB), unlock, step-up, delete | 100 | 100 | IMPLEMENTED_UNVERIFIED | S (0–0d) | none | B1 |
| F-KEY-03 | Keystore v1 backup/restore and verified-backup gate (GP-PAGES-02) | 100 | 100 | IMPLEMENTED_UNVERIFIED | S (0–0d) | none | B1 |
| F-KEY-04 | Idle lock and app lock (sleep-aware, GP-PAGES-04) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-KEY-07 | Spec 18 K01: public/keypair/master schemas + verified derivation adapter | 0 | 0 | SPEC_ONLY | M (2–3d) | implement | B1 |
| F-KEY-08 | Spec 18 K02: encrypted single-keypair envelope + atomic import | 0 | 0 | SPEC_ONLY | M (2–4d) | implement | B1 |
| F-KEY-09 | Spec 18 K03: seller payment-row export UI (public + encrypted) | 0 | 0 | SPEC_ONLY | L (3–6d) | implement | B1 |
| F-KEY-10 | Spec 18 K04: raw single-key export + independent recovery proof | 0 | 0 | SPEC_ONLY | M (2–4d) | implement | B1 |
| F-KEY-11 | Spec 18 K05: encrypted bounded bulk archive of validated one-time keys | 0 | 0 | SPEC_ONLY | M (2–3d) | implement | B1 |
| F-KEY-12 | Spec 18 K06: separate encrypted master spend/view backup (+ KC checkpoint) | 0 | 0 | SPEC_ONLY | M (3–6d) | implement | B1 |
| F-KEY-13 | secret-box (closure-held secret bytes, scopes, wipe) | 90 | 90 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | defer | B1 |
| F-PROTO-01 | EIP-5564 scheme-1 stealth derivation, view tags, announcement check, stealth key | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-02 | Stealth meta-address encoding (st:eth:0x) + key generation | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-03 | Announcement discovery primitives: verified RPC client + reorg-safe announcement fetch/validation | 100 | 100 | VERIFIED_COMPLETE | S (0.5–1d) | repair | B1 |
| F-PROTO-04 | Payment claim verification library (spec 02 library side) | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-06 | Invoice schema v1/v2 + canonical JSON + signing/verification | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-07 | Invoice link envelope #gpi=v1. (none / A256GCM / A256GCM-PW passphrase) | 100 | 90 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-08 | Invoice-bound signed seller receipts | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-13 | Spec 18 stealth keypair export formats + crypto adapter (protocol side of 3q) | 10 | 10 | PARTIAL | L (5–9d) | implement | B1 |
| F-WEB-01 | Create signed invoice (link, QR, items, fiat labels) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-03 | Pay flow: review, EIP-6963 wallet connect, consent, native/ERC-20 send | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-04 | Payment submission journal and honest uncertain outcomes | 90 | 90 | IMPLEMENTED_UNVERIFIED | S (1–2d) | defer | B1 |
| F-WEB-06 | Seller scan & discovery UI (worker, checkpoints, reorg, dedupe, deep scan, auto-rescan) | 95 | 95 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | defer | B1 |
| F-WEB-08 | RPC provider configuration (explicit, validated, chainId-checked, no fallback) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-09 | Payment history & reconciliation ledger (encrypted IndexedDB, invoice registry) | 100 | 95 | VERIFIED_COMPLETE | S (0.5–1d) | repair | B1 |
| F-WEB-10 | Receipts (invoice-bound signed receipt, QR, archive, payer verification) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-11 | Direct sweep (self-paid gas, in-page derived key) | 100 | 100 | IMPLEMENTED_UNVERIFIED | S (0–0d) | none | B1 |
| F-WEB-16 | Invoice URL fragment privacy (autoclear, history state, anchors, focus) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-17 | Bundled signed manifests + on-chain readback in UI | 80 | 80 | PARTIAL | S (0.5–1.5d) | repair | B1 |
| F-WEB-21 | Lean static Pages build profile (product surface) | 80 | 80 | BLOCKED | S (0.5–1d) | defer | B1 |
| F-WEB-22 | Client hardening: no telemetry, egress allowlist, bundle scan, inert untrusted text | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-25 | tx-review pre-sign decoder/reviewer (package, wired via txGuard) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-26 | address-safety (strict addresses, lookalikes, display-text sanitizing) | 90 | 80 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | refactor | B1 |

## Tier: beta-supporting

| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |
|---|---|---:|---:|---|---|---|---|
| F-A11Y-01 | Automated accessibility: axe-core audit in Playwright (all routes, keyboard, 320px reflow, forced-colors, reduced-motion) | 90 | 85 | IMPLEMENTED_UNVERIFIED | M (1–3d) | repair | B2 |
| F-A11Y-02 | Mobile/responsive: Chromium device-emulation projects (Pixel 7, iPhone SE, iPad Mini descriptors) | 50 | 50 | PARTIAL | S (0–1d) | defer | B2 |
| F-A11Y-03 | Screen-reader / assistive-tech qualification | 40 | 20 | PARTIAL | M (1–3d) | implement | B2 |
| F-CLI-01 | CLI core: registry, strict arg parsing, --json, exit codes, doctor, build-info | 100 | 85 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-CLI-02 | CLI invoice, receipt, QR, seller-pairing commands | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-CLI-04 | CLI reconcile, history, encrypted receipt archive | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-CLI-05 | CLI read-only chain/payment/scan/registry commands | 100 | 80 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-CLI-06 | CLI merchant commands: refunds, installments, subscriptions, webhooks, split, batch | 80 | 80 | PARTIAL | S (0–1d) | defer | B2 |
| F-CTR-02 | Permit griefing fallback & error surfacing (spec 04) | 100 | 90 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-CTR-03 | GhostPaySweepRelayer + relayer-authorized sweep (EIP-712 signed terms incl. deadline, nonce bitmap) | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-CTR-04 | ERC-6538 registry integration (canonical singleton used as deployed) + delegated-registration builders (#181) + ENS | 90 | 85 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | repair | B1 |
| F-CTR-06 | Gas buffer v2 (spec 13) + invoice v2 seller bufferPolicy (ADR-0024) | 95 | 80 | IMPLEMENTED_UNVERIFIED | M (1–3d) | implement | B1 |
| F-DEP-05 | EVM multichain config + ChainAdapter interface (MULTICHAIN_SPEC tier 1, ADR-0016) | 80 | 75 | PARTIAL | S (1–2d) | repair | B1 |
| F-DOC-01 | User docs (docs/user, 20 pages) + guides (docs/guides, 11 pages) | 90 | 90 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-DOC-02 | Developer wiki (docs/wiki, 9 pages) | 60 | 50 | PARTIAL | S (0–1d) | consolidate | B2 |
| F-HOST-03 | Portable hosting kit: package/verify/preview + nginx/container/Tor/I2P profiles | 80 | 80 | PARTIAL | S (0–1d) | none | B2 |
| F-HOST-04 | infra/: devnet, integration, proxy, publish (IPFS/Tor), static web Caddy | 100 | 40 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-I18N-02 | Locale catalogs: translation completeness and native review | 60 | 55 | PARTIAL | L (3–10d) | recover | B2 |
| F-I18N-03 | packages/i18n localisation framework (CLI/library) + CLI i18n check | 60 | 60 | PARTIAL | M (2–3d) | consolidate | B2 |
| F-MER-01 | Merchant billing: subscriptions, schedules, installments, refunds, payouts, CSV | 85 | 85 | PARTIAL | S (0–1d) | defer | B2 |
| F-MER-02 | Merchant ledger: reconciliation + accounting/tax exports | 80 | 65 | PARTIAL | M (1–3d) | consolidate | B2 |
| F-MER-03 | Merchant hooks: signed webhooks, payment button/link, POS/NFC payload builders | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-MER-06 | Merchant examples: checkout, POS terminal, subscription cron, webhook receiver, operations, plugin conformance | 100 | 90 | VERIFIED_COMPLETE | S (1–2d) | repair | B2 |
| F-NET-01 | Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP framing + browser fetch transport | 80 | 65 | PARTIAL | M (2–5d) | consolidate | B3 |
| F-NET-02 | Onion URL canonicalization / v3 checksum, reject escaped authorities (PR #122/#134) | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B3 |
| F-OPS-03 | sandbox / test mode: deterministic mock chain, faucet, clock, fault injection | 70 | 70 | PARTIAL | S (0–1d) | none | B2 |
| F-PROTO-05 | Announcer spam & anonymity-set bounds (spec 05) | 90 | 80 | IMPLEMENTED_UNVERIFIED | S (1–2d) | implement | B1 |
| F-PROTO-09 | Strict payment URI builders/parsers (EIP-681, ERC-3770, BIP-21/321+sp, Solana Pay, tron:, invoice link) | 100 | 100 | VERIFIED_COMPLETE | S (0–0.5d) | none | B1 |
| F-PROTO-10 | QR exchange: GPQ1 multipart, assembler, camera/readers, generation, seller/settings payloads | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B1 |
| F-WEB-05 | Gas buffer UI: v1 payer buffer (lean+full) and v2 seller policy (full) | 90 | 75 | IMPLEMENTED_UNVERIFIED | S (0.5–1.5d) | repair | B1 |
| F-WEB-07 | Scan privacy modes (spec 10 UI: transport, private-required, windows, indexer, disclosures) | 90 | 90 | IMPLEMENTED_UNVERIFIED | S (0.5–2d) | repair | B1 |
| F-WEB-12 | Relayer-assisted sweep and permit refusal messages | 100 | 95 | IMPLEMENTED_UNVERIFIED | S (1–2d) | none | B1 |
| F-WEB-13 | Seller device pairing (public config QR export/preview) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-14 | ERC-6538 registry view (publish/clear/lookup/ENS/export) | 100 | 95 | VERIFIED_COMPLETE | S (0.5–1d) | none | B1 |
| F-WEB-20 | Settings: preferences, device-settings exchange (opt-in sections), pinned signers | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-WEB-23 | Home / About / help pages / contextual help (lost-click fix) | 100 | 85 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | defer | B1 |
| F-WEB-24 | QR display and camera import UI (kinds, warnings, multipart) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |

## Tier: full-profile

| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |
|---|---|---:|---:|---|---|---|---|
| F-BTC-01 | BIP-352 silent payments: keys, addresses, sender derive, receive scan, spend (full-profile web) | 100 | 80 | IMPLEMENTED_UNVERIFIED | M (2–4d) | consolidate | B3 |
| F-BTC-02 | BTC header-chain validation, persistence, scan anchoring (A4 PR #74) | 100 | 100 | VERIFIED_COMPLETE | S (1–3d) | none | B3 |
| F-BTC-03 | BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node Esplora, 2-oracle cross-check, worker | 90 | 80 | IMPLEMENTED_UNVERIFIED | M (1–3d) | consolidate | B3 |
| F-DOC-03 | Operator docs (docs/operators, 17 pages): runbooks, relayer, monitoring, release, rollback | 50 | 50 | PARTIAL | S (0–1d) | none | B2 |
| F-HOST-01 | Self-host recipe: docker-compose + nginx + relayer image + selfhost.sh | 70 | 45 | PARTIAL | S (1–2d) | repair | B2 |
| F-HOST-02 | Tor onion service for the static bundle | 60 | 45 | PARTIAL | S (1–2d) | repair | B2 |
| F-INT-01 | WooCommerce gateway plugin (payment-link redirect flow) | 85 | 75 | PARTIAL | S (0–1d) | defer | B2 |
| F-INT-02 | PrestaShop module | 60 | 60 | PARTIAL | S (0–1d) | defer | B2 |
| F-KEY-05 | Tag archive backup/restore + combined BackupPanel (spec 08) | 90 | 90 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | repair | B1 |
| F-KEY-06 | Archive key rotation (spec 08 rotateKeys) | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |
| F-MER-04 | Merchant m-of-n multisig approvals | 60 | 60 | PARTIAL | S (0–1d) | defer | B2 |
| F-MER-05 | Web merchant profile, templates, printable bill, reconciliation UI (cross-ref B1b) | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-OPS-01 | ops-monitor: read-only chain anomaly probes + bounded release-asset streaming | 80 | 75 | PARTIAL | S (1–2d) | repair | B2 |
| F-POOL-04 | Pool withdrawal relayer service (node:http) | 100 | 60 | EXPERIMENTAL | L (5–10d) | defer | B3 |
| F-PROTO-11 | Scan-source abstraction (range / indexer-tor / pir2 / light-client / quorum) | 70 | 70 | EXPERIMENTAL | L (3–10d) | defer | B1 |
| F-PROTO-12 | SDK programmatic API (@ghostpay/sdk) | 45 | 45 | PARTIAL | M (1–3d) | defer | B1 |
| F-RLY-01 | Optional relayer: quote/sweep API, fee policy, permit failure classes | 95 | 80 | IMPLEMENTED_UNVERIFIED | S (0–1d) | none | B2 |
| F-RLY-02 | Relayer restart-safe daily budget + nonce journal (state lock) | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-RLY-03 | Relayer private metrics listener (PR #185) and signed alerts | 100 | 95 | VERIFIED_COMPLETE | S (0–1d) | none | B2 |
| F-RLY-04 | relayer-guard: breaker, trusted-proxy IP, /64 buckets, limiter, loss budget, challenge | 60 | 60 | PARTIAL | S (0–1d) | none | B2 |
| F-SOL-01 | Solana dual-key ed25519 stealth (solana-stealth) wired to web full profile | 60 | 50 | EXPERIMENTAL | L (4–8d) | consolidate | B3 |
| F-TRX-01 | Tron stealth adapter (tron-adapter) wired to web full profile | 70 | 60 | EXPERIMENTAL | L (4–8d) | consolidate | B3 |
| F-WEB-02 | Fiat-quote invoices and price-feed UI (spec 03) | 90 | 80 | IMPLEMENTED_UNVERIFIED | M (2–4d) | implement | B1 |
| F-WEB-18 | Embed SDK checkout (popup default, opt-in iframe postMessage handshake) | 95 | 95 | IMPLEMENTED_UNVERIFIED | S (0.5–1d) | implement | B1 |
| F-WEB-19 | Merchant profile display, identity pinning and template issuance | 100 | 100 | VERIFIED_COMPLETE | S (0–0d) | none | B1 |

## Tier: experimental

| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |
|---|---|---:|---:|---|---|---|---|
| F-AA-01 | Scheme-2 policy-guarded account contracts (PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter) | 85 | 85 | EXPERIMENTAL | M (2–4d) | defer | B1 |
| F-AA-02 | Policy-scheme client (scheme-2 derivation, gp2 meta-address, limits tree, EIP-712, calldata, record restore) + flagged web path | 80 | 80 | EXPERIMENTAL | L (5–10d) | defer | B1 |
| F-AA-03 | F-SECURE factory flat fee + fee-token handling (N1 freeze residual) | 55 | 55 | BLOCKED | M (1–3d) | defer | B1 |
| F-AA-04 | EIP-7702 / ERC-4337 / ERC-7579 account-abstraction path (spec 15) | 15 | 0 | BLOCKED | XL (15–30d) | defer | B1 |
| F-AA-05 | Policy-account recovery / guardian (spec 16, ADR-0023, ADR-0028) | 30 | 15 | BLOCKED | XL (15–30d) | defer | B1 |
| F-BTC-04 | BTC family engine (LTC/DOGE etc. SP w/ ChainParams) — standalone | 40 | 40 | EXPERIMENTAL | M (3–6d) | defer | B3 |
| F-BTC-05 | BTC PayJoin BIP-78 policy core + v1 HTTP transport (+ optional BIP-77 ffi, unverified) | 60 | 45 | EXPERIMENTAL | L (4–8d) | defer | B3 |
| F-EVMX-01 | Extra EVM chain manifests + fail-closed verifier (Linea, Scroll, zkSync ... 12 chains) | 55 | 55 | EXPERIMENTAL | M (3–5d) | defer | B3 |
| F-INT-04 | Plugin/extension API (privacy options) + conformance example | 55 | 55 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-MER-07 | Optional itemised developer donation | 40 | 40 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-NET-03 | PIR two-server XOR private scan (pir2 scan mode, default OFF) | 40 | 40 | EXPERIMENTAL | L (5–10d) | defer | B3 |
| F-NET-04 | Network test harness (fake SOCKS5/CONNECT proxies; test-only) | 100 | 100 | VERIFIED_COMPLETE | S (0–1d) | none | B3 |
| F-OPS-02 | hygiene: own-leak hygiene options (HY-DST/CON/VER/BUF/FUND) | 45 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-POOL-01 | Shielded pool circuits (circom Groth16, withdraw/commitment) — INSECURE dev ceremony | 35 | 15 | EXPERIMENTAL | XL (15–30d) | defer | B3 |
| F-POOL-02 | Shielded pool contracts (GhostPayShieldedPool ERC20/Native, ASP registry) | 35 | 15 | EXPERIMENTAL | XL (10–25d) | defer | B3 |
| F-POOL-03 | Pool prover + pool SDK (client side proving, Poseidon, note mgmt) | 50 | 50 | EXPERIMENTAL | L (5–10d) | defer | B3 |
| F-POOL-05 | External pools adapter interface (Privacy Pools, Railgun) — shared machinery | 40 | 40 | EXPERIMENTAL | L (4–8d) | defer | B3 |
| F-POOL-06 | Privacy Pools (0xbow) adapter | 100 | 60 | EXPERIMENTAL | L (4–8d) | defer | B3 |
| F-POOL-07 | Railgun adapter | 50 | 50 | EXPERIMENTAL | L (4–8d) | defer | B3 |
| F-POOL-08 | Payer-hiding contracts PH-2 PayRelay / PH-3 7702 delegate / PH-4 4337 account+paymaster | 50 | 25 | EXPERIMENTAL | XL (8–15d) | defer | B3 |
| F-POOL-09 | Confidential amounts client (ERC-7984 / Zama fhEVM backend) + confidential contracts | 60 | 45 | EXPERIMENTAL | XL (8–15d) | defer | B3 |
| F-PRIV-01 | Privacy pipeline (chain steps, cost/leak preview, run) | 50 | 50 | EXPERIMENTAL | L (4–8d) | defer | B3 |
| F-PRIV-02 | Privacy profiles catalogue/presets/conflict rules | 60 | 60 | EXPERIMENTAL | M (2–4d) | consolidate | B3 |
| F-PRIV-03 | Metadata hardening MH-* helpers | 60 | 60 | EXPERIMENTAL | M (2–4d) | consolidate | B3 |
| F-PRIV-04 | Amount blur (split/round/jitter, Off by default) | 60 | 60 | EXPERIMENTAL | S (1–3d) | defer | B3 |
| F-PRIV-05 | Delayed multi-hop forwarding (Weak) | 80 | 60 | EXPERIMENTAL | M (2–4d) | defer | B3 |
| F-RLY-05 | payer-sponsor: payer-address hiding modes + testnet sponsor core | 60 | 40 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-SOL-02 | chain-solana alt stealth PoC (CLI only) | 40 | 40 | EXPERIMENTAL | M (2–4d) | consolidate | B3 |
| F-TRX-02 | chain-tron alt PoC (CLI only) | 40 | 40 | EXPERIMENTAL | S (1–3d) | consolidate | B3 |
| F-UX-01 | ux-connect: wallet connect compat, WalletConnect session grammar, hardware-signer status | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-02 | ux-core: netstate, theme, palette, store (pure UX core) | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-03 | ux-export: structured export encoder/parser/import with formula neutralisation | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-04 | ux-fees: fee preview, cheapest route, timing | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-05 | ux-fiat: BigInt fiat display + rate validation/state machine | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-06 | ux-flow: return URLs, embed, proof, reconcile, undo | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-07 | ux-guide: onboarding checklist, profiles, questionnaire validation (PR #127/#133) | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-08 | ux-intake: address/deeplink/NL amount/QR payload intake | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-09 | ux-links: payment links, handles, address book, tip, URI | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-10 | ux-notify: notification manifest, redaction, URL safety, reminder bridge | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-11 | ux-presets: pay-again presets, sealed store | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-12 | ux-privacy: privacy score + policy | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-13 | ux-receipts: receipt parse/render/verify/disclose | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-14 | ux-schedule: recurrence, schedule templates, advancing-clock expiry guard (PR #126/#132) | 55 | 45 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-UX-15 | ux-i18n and ux-sandbox: deprecated thin re-export shims | 50 | 50 | EXPERIMENTAL | S (0–1d) | defer | B2 |
| F-WEB-15 | Policy-account UI (scheme 2 / EIP-7702, experimental) | 60 | 60 | EXPERIMENTAL | XL (10–20d) | defer | B1 |

## Tier: future

| ID | Feature | Impl % | Verif % | Status | Effort | Strategy | Source team |
|---|---|---:|---:|---|---|---|---|
| F-AA-06 | GhostMilestones escrow (spec 17) | 15 | 15 | BLOCKED | XL (20–40d) | defer | B1 |
| F-FUT-01 | 5a: No accounts / identifying telemetry | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-02 | 5b: Local encryption and key management | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-03 | 5c: Fresh EVM stealth destinations + local discovery | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-04 | 5d: Privacy-preserving RPC and scanning | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-05 | 5e: Sweep privacy + linkability analysis | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-06 | 5f: Encrypted invoice + metadata minimization | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-07 | 5g: HTTPS and Tor hosting w/ verifiable boundaries | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-08 | 5h: Optional broadcast + gas sponsorship without custody | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-09 | 5i: Buyer-side privacy adapters + identity separation | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-10 | 5j: Confidential amount + settlement integrations | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-11 | 5l: Reproducible builds + release integrity | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-12 | privacy-first 01: GhostTips donations | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-13 | privacy-first 02: GhostStore static storefronts | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-14 | privacy-first 03: Private payment links/QR | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-15 | privacy-first 04: Local merchant dashboard | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-16 | privacy-first 05: GhostProof selective disclosure | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-17 | privacy-first 06: Encrypted backups + full recovery | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-18 | privacy-first 07: Private multi-recipient payouts | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-19 | privacy-first 08: Portable merchant identities | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-20 | privacy-first 09: In-person QR checkout | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-21 | privacy-first 10: Private recurring invoices | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-22 | privacy-first 11: Encrypted collaboration | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-23 | privacy-first 12: P2P offramp handoff | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-24 | privacy-first 13: Privacy-aware fiat conversion | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-25 | privacy-first 14: Privacy-aware multichain routing | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-26 | privacy-first 15: Private scanning/RPC/broadcast | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-27 | privacy-first 16: Per-client identities | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-28 | privacy-first 17: Private sweeping/offline funds | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-29 | privacy-first 18: Selectable privacy modes | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-30 | idea 01: Sweep + link hygiene | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-31 | idea 02: Claim-by-tx-hash + spam filter | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-32 | idea 03: Per-client meta-addresses | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-33 | idea 04: Encrypted backup/restore | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-34 | idea 05: Tor/onion/proxy RPC + padded queries | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-35 | idea 06: Watch-only + airgapped signer | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-36 | idea 07: Selective-disclosure receipts | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-37 | idea 08: Multi-relayer + self-submit | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-38 | idea 09: 'What is public' explainer | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-39 | idea 10: Client-side hosting constraints | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-40 | Spec 18 / req 3q stealth keypair export (reference only; owned by B1b) | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-FUT-41 | Hosted BTC scan service (mode C / Frigate-style) | 0 | 0 | SPEC_ONLY | M (2–10d) | defer | B3 |
| F-INT-03 | Shopify integration | 50 | 0 | PARTIAL | L (3–10d) | defer | B2 |
| F-KEY-14 | ux-vault encrypted address book / multi-profile vault (library; web-unwired) | 30 | 30 | PARTIAL | L (4–8d) | defer | B1 |

## Per-feature detail

### F-CLI-03 — CLI encrypted backup, restore, rekey, offline recovery

- Tier/area: beta-core / cli. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 85% (requirement weight 11.0).
- Spec: 
- Implementation: packages/cli/src/commands/backup.ts; packages/cli/src/backup-data.ts
- Tests: packages/cli/src/backup-command.test.ts; packages/cli/src/recovery-auth-negative.test.ts; packages/cli/src/b0-receipt-recovery.test.ts
- Verified working: cli backup/recovery tests pass
- Missing requirements: CLI per-keypair export command (spec 18) not present in registry
- Confirmed defects: 
- Missing tests: 
- Security/privacy: fail-closed on auth failure; no secret in logs (not independently audited)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/108@ #108 receipt create+archive+offline recovery; ancestor; pr/109@ #109 unauth recovery; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: per-stealth-address keypair export is not a CLI command (spec 18 lives in web/ux-vault; B1b)

### F-CTR-01 — GhostPayRouter scheme-1 checkout router (native, ERC-20, ERC-2612 permit, buffer) + client builder

- Tier/area: beta-core / contracts+chain-adapters. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 24.0).
- Spec: docs/CONTRACTS_SPEC.md s1,s5; contracts DEVIATIONS 1-12; chain-adapters DEVIATIONS 1,3,4,13
- Implementation: packages/contracts/src/GhostPayRouter.sol; packages/contracts/src/interfaces/IGhostPayRouter.sol; packages/chain-adapters/src/router.ts; packages/chain-adapters/src/fees.ts; packages/chain-adapters/src/adapter.ts; packages/chain-adapters/src/abi/router.ts
- Tests: packages/contracts/test/GhostPayRouter.t.sol; packages/contracts/test/GhostPayRouter.fuzz.t.sol; packages/contracts/test/GhostPayRouter.invariant.t.sol; packages/contracts/test/TokenEdgeCases.t.sol; packages/contracts/test/audit/Router.audit.t.sol; packages/chain-adapters/src/router.test.ts; packages/chain-adapters/src/router.anvil.test.ts; packages/contracts/test/echidna/EchidnaRouter.sol
- Verified working: coverage GhostPayRouter.sol 98.59% lines / 98.86% stmts / 100% funcs; beta acceptance pays ETH/USDC/USDT/DAI on anvil
- Missing requirements: 
- Confirmed defects: 
- Missing tests: Permit2 (Uniswap) path: not specified in CONTRACTS_SPEC, absent (not counted)
- Security/privacy: FeeCollected has no payer/stealth/invoice fields; view tag + ephemeral key unverifiable on-chain (documented); direct transfers bypass fee (disclosed); stray funds to router unrecoverable (documented)
- Dependencies: F-DEP-04 deployment of record; F-CTR-07 release gate. Blockers: Mythril policy decision gates any release (F-CTR-07)
- External acceptance: No Sepolia deployment; no external audit; no real-wallet checkout acceptance.
- Related branches/PRs: pr/2@c1c4ac9b #2 origin; ancestor; pr/114@1bf25be7 #114 real-chain lifecycle; ancestor
- Strategy: **none** — Complete pending deployment/audit.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: forge not run locally (not installed); relies on CI logs downloaded to ci_logs_proto/

### F-CTR-05 — Fee schedule F-PAY / F-SPONSOR (math, immutables, disclosure, manifest-sourced recipient)

- Tier/area: beta-core / contracts+chain-adapters+web. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 12.0).
- Spec: docs/FEE_SCHEDULE.md s1-s5; MULTICHAIN_SPEC s4
- Implementation: packages/chain-adapters/src/fees.ts; packages/contracts/src/GhostPayRouter.sol; packages/chain-adapters/src/adapter.ts; apps/web/locales/en.json
- Tests: packages/chain-adapters/src/fees.test.ts; packages/chain-adapters/src/router.anvil.test.ts; packages/contracts/test/GhostPayRouter.t.sol
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: fee recipient public on-chain; forks can remove client fees (documented)
- Dependencies: . Blockers: [OWNER] fee recipient (HW/multisig), sponsor rates, legal/sanctions review before mainnet
- External acceptance: Legal review absent (FEE_SCHEDULE s6).
- Related branches/PRs: 
- Strategy: **none** — Code complete; owner decisions only.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-CTR-07 — Contract qualification gates (Foundry unit/fuzz/invariant, coverage, Slither, Echidna, Mythril, NatSpec)

- Tier/area: beta-core / contracts. Status: **BLOCKED**. Implementation 90% · Verification 80% (requirement weight 16.0).
- Spec: CONTRACTS_SPEC s5; REVIEW_FINDINGS R-06,R-08,R-10,R-12; audits mythril-14290880802-*
- Implementation: packages/contracts/test/**; packages/contracts/echidna.yaml; packages/contracts/scripts/run-echidna.sh; packages/contracts/scripts/run-mythril.sh; .github/workflows/ci.yml; .github/workflows/contract-analysis.yml; .github/workflows/release.yml
- Tests: packages/contracts/test/MythrilExpiryDispositions.t.sol; packages/contracts/test/MythrilFactoryDispositions.t.sol; packages/contracts/test/echidna/*
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: AI review != external audit
- Dependencies: . Blockers: Owner: Mythril disposition mechanism or keep releases blocked (PROMOTION_PACKET blocker 2); main unprotected (blocker 1)
- External acceptance: No independent external audit.
- Related branches/PRs: pr/3@df150cbd #3 Mythril triage + gambit; ancestor; pr/180@ffd957e2 #180 fail closed on Mythril exits; ancestor; pr/4@39cce466 #4 Echidna + PolicyRouter; ancestor
- Strategy: **implement** — After owner decision: source-matched (contract,function,SWC,PC,hash) disposition file failing on code change.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: Echidna/Mythril report contents (sha256 in PROMOTION_PACKET) not downloaded/read here

### F-DEP-01 — Deployment manifests: schema, strict loader, structured release signature, build-time bundling

- Tier/area: beta-core / chain-adapters+web+deployments. Status: **PARTIAL**. Implementation 85% · Verification 80% (requirement weight 15.0).
- Spec: docs/DEPLOYMENT_MANIFEST.md; deployments/README.md; apps/web/deployments/README.md; ADR-0015; spec 01 signature half
- Implementation: deployments/schema.json; packages/chain-adapters/src/deployments.ts; packages/chain-adapters/src/verify.ts; packages/chain-adapters/src/deploymentsSignature.ts; apps/web/scripts/validate-deployments.mjs; apps/web/vite.config.ts; apps/web/src/lib/releaseKeys.ts; apps/web/src/lib/manifest.ts
- Tests: packages/chain-adapters/src/deployments.test.ts; packages/chain-adapters/src/verify.test.ts; apps/web/src/lib/manifest.test.ts; apps/web/scripts/localBuildProfile.test.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: Low CONFIRMED doc/script drift: apps/web/deployments/README.md references missing npm script validate:deployments (grep apps/web/package.json) @7a620ff1
- Missing tests: 
- Security/privacy: keys travel in same bundle (help only if bundle verified out of band, D7); two trust roots: git tag signing vs secp256k1 manifest key
- Dependencies: Overlap B1b F-WEB-17 (bundled manifests UI). Blockers: release signer key absent (allowed_signers comments only; RELEASE_PUBLIC_KEYS [] default); no manifest of record (deployments/ has only unsigned 31337.json)
- External acceptance: No signed manifest for any public chain.
- Related branches/PRs: pr/137@ac08062e #137 Pages static beta verifier; ancestor; pr/195@12e18931 #195 signed bundled manifest + fail-closed tests; ancestor
- Strategy: **repair** — Add validate:deployments script (or fix README); document offline signing helper; then owner signs.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-DEP-02 — On-chain manifest read-back verifyDeployment (spec 01)

- Tier/area: beta-core / chain-adapters. Status: **PARTIAL**. Implementation 85% · Verification 80% (requirement weight 21.0).
- Spec: docs/specs/01-manifest-readback.md; chain-adapters DEVIATIONS 2; audits S3-01/A-07/G-05
- Implementation: packages/chain-adapters/src/verify.ts; packages/chain-adapters/src/deploymentsVerify.ts; apps/web/src/lib/deployment.ts; packages/cli/src/payment-context.ts; apps/relayer/src/runtime.ts
- Tests: packages/chain-adapters/src/verify.test.ts; packages/chain-adapters/src/deploymentsVerify.test.ts; apps/web/src/lib/deployment.test.ts; scripts/beta/cli-devnet.e2e.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: Low CONFIRMED: two divergent read-back verifiers - verifyDeployment (web/CLI, verify.ts:184-235) skips policy implementation hash; verifyManifestOnChain (relayer, deploymentsVerify.ts:44-70) does not require canonical announcer or a second provider
- Missing tests: 
- Security/privacy: reads via user-selected RPC only; lying RPC caught only with second provider
- Dependencies: F-DEP-01; F-DEP-03 announcer codehash data; Overlap B1b F-WEB-17 (readback in UI). Blockers: announcer codehash per chain unverified (external)
- External acceptance: No public-provider read-back of a real deployment.
- Related branches/PRs: 
- Strategy: **repair** — Unify verifiers; pin announcer hash once verified; add 0xef0100 test.
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-DEP-03 — Chain/token/feed deployment matrix + release gate (spec 09)

- Tier/area: beta-core / chain-adapters+scripts. Status: **PARTIAL**. Implementation 75% · Verification 70% (requirement weight 17.0).
- Spec: docs/specs/09-chain-token-deployment-matrix-and-pins.md; docs/operators/chain-matrix.md; ADR-0011
- Implementation: packages/chain-adapters/config/matrix.json; scripts/lib/chain-matrix.mjs; scripts/check-chain-matrix.mjs; scripts/release-build.sh
- Tests: scripts/tests/chain-matrix.test.mjs; scripts/tests/chain-matrix-cli.test.mjs; scripts/tests/release-manifest.test.mjs
- Verified working: node scripts/check-chain-matrix.mjs exit 0; --release exit 1 with exactly 73 unverified cells (42 chain, 27 token, 4 feed) on 7 enabled testnets (VERIFIED local); node --test chain-matrix + cli + release-manifest: 17/17 local
- Missing requirements: DOC-19 pin record; nightly revalidation
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no fabricated verification flags; two-person token address check
- Dependencies: . Blockers: 73 unverified release cells need authenticated deployments + primary sources (Sepolia first)
- External acceptance: 73 cells UNVERIFIED by design; no provider evidence.
- Related branches/PRs: pr/115@c6ce2259 #115 multi-chain qualification; ancestor
- Strategy: **implement** — Add nightly read-only revalidation + policy pin record; fill Sepolia cells from real evidence only.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-DEP-04 — Testnet deployment tooling + Sepolia-first deployment of record

- Tier/area: beta-core / contracts/script+scripts/testnet. Status: **BLOCKED**. Implementation 75% · Verification 55% (requirement weight 16.0).
- Spec: docs/operators/testnet-runbook.md; docs/operators/deployment-runbook.md; NEXT_PHASE_QUEUE B02-B04; ADR-0029 (Proposed)
- Implementation: packages/contracts/script/Deploy.s.sol; packages/contracts/script/DeployBase.s.sol; packages/contracts/script/DeployAnnouncer.s.sol; packages/contracts/script/DeployPolicy.s.sol; packages/contracts/script/DeployPolicyRouter.s.sol; packages/contracts/script/SmokeSepolia.s.sol; packages/contracts/scripts/pre-deploy-check.sh; scripts/testnet/deploy.sh (+2 more)
- Tests: packages/contracts/test/Deploy*.t.sol; scripts/testnet/make-manifest.test.mjs; scripts/testnet/verify-sources.test.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: Info CONFIRMED: deploy.sh network list != enabled testnets (no BNB testnet/Fuji path; hoodi unsupported in config)
- Missing tests: deploy.sh rehearse in CI; pre-deploy-check.sh
- Security/privacy: fee recipient HW/multisig; no key/RPC stored by scripts; PRIVATE_KEY visible in ps (prefer keystore)
- Dependencies: . Blockers: Owner: ADR-0029 acceptance, release key, fee recipient, broadcast (B01/B02)
- External acceptance: No public testnet deployment exists.
- Related branches/PRs: 
- Strategy: **implement** — Owner broadcasts Sepolia; engineering: CI rehearsal job, network-list alignment, evidence capture for matrix.
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-DOC-04 — In-app contextual help + static help/privacy pages

- Tier/area: beta-core / docs. Status: **PARTIAL**. Implementation 65% · Verification 65% (requirement weight 3.0).
- Spec: 
- Implementation: apps/web/help.html; apps/web/src/components/ContextHelp.tsx
- Tests: apps/web/e2e/contextual-help.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: not rerun

### F-I18N-01 — Web i18n framework: catalogs, translator, plurals/ICU-lite, RTL, language picker, pseudo-locales

- Tier/area: beta-core / i18n. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 90% (requirement weight 12.0).
- Spec: 
- Implementation: apps/web/src/i18n/; scripts/i18n/check.mjs
- Tests: apps/web/src/i18n/*.test.ts*; apps/web/src/AppShell.i18n.test.tsx
- Verified working: 80 i18n unit tests pass; i18n:check 0 errors
- Missing requirements: hard-coded string audit (an automated 'no literal JSX text' lint) not found
- Confirmed defects: 
- Missing tests: extraction coverage test for untranslated JSX literals
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/66@e02d04c7 #66 Pay view; ancestor; pr/67@7f4702fd #67 Scan view; ancestor; pr/68@4fe95fc0 #68 Create invoice; ancestor; pr/88@0a68a57b #88 notice labels; ancestor; pr/183@2de9b0c5 #183 merchant identity disclosures; merged
- Strategy: **repair** — 
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-KEY-01 — Seller key generation, hex import and in-memory session

- Tier/area: beta-core / keys \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** — security hold: SEC-03: vault-less in-memory session has no step-up before secret export/sweep. Implementation 100% · Verification 100% (requirement weight 14.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 2; docs/pages/RELEASE_MATRIX.md
- Implementation: apps/web/src/views/SellerKeys.tsx; apps/web/src/lib/session.ts; packages/secret-box/src/secretBox.ts; packages/core-crypto
- Tests: apps/web/src/lib/session.test.ts; apps/web/src/views/SellerKeys.test.tsx; apps/web/src/views/SellerKeys.completion.test.tsx; apps/web/e2e/app.spec.ts; apps/web/e2e/core-journey.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: keys never sent to host/RPC/wallet; best-effort wipe (guardrail, not boundary)
- Dependencies: . Blockers: 
- External acceptance: Real device/browser key lifecycle pending
- Related branches/PRs: 
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-KEY-02 — Encrypted browser key vault (IndexedDB), unlock, step-up, delete

- Tier/area: beta-core / keys \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** — security hold: SEC-05: vault/keystore passphrase floor accepts name+year passphrases. Implementation 100% · Verification 100% (requirement weight 18.0).
- Spec: docs/pages/RELEASE_MATRIX.md 'Encrypted local key storage'; audit L1-01/L1-02, C-R12
- Implementation: apps/web/src/lib/keyVault.ts; apps/web/src/views/SellerKeys.tsx; apps/web/src/lib/session.ts; packages/ux-vault/src/keystore-portable.ts
- Tests: apps/web/src/lib/keyVault.test.ts; apps/web/src/lib/keyVault.idb.test.ts; apps/web/src/views/SellerKeys.storage.test.tsx; apps/web/e2e/passphrase-vault.spec.ts; apps/web/e2e/pages-devnet.spec.ts; apps/web/scripts/test-seller-vault-idb.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: passphrase never stored; browser save disabled (autocomplete off); shared origin can read IDB (GP-PAGES-01)
- Dependencies: . Blockers: 
- External acceptance: Mobile/Safari storage eviction behaviour unqualified
- Related branches/PRs: pr/145@c8d4c42b #145 IDB failed/blocked open recovery; ancestor; pr/177@17f68191 #177 IDB close recovery; ancestor
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-KEY-03 — Keystore v1 backup/restore and verified-backup gate (GP-PAGES-02)

- Tier/area: beta-core / keys \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** — security hold: SEC-05, SEC-03: keystore export passphrase floor (SellerKeys.tsx:207) and vault-less export without step-up (SellerKeys.tsx:221-224). Implementation 100% · Verification 100% (requirement weight 19.0).
- Spec: docs/pages/RELEASE_MATRIX.md GP-PAGES-02; docs/specs/18-stealth-keypair-export.md (legacy keystore compatibility)
- Implementation: apps/web/src/views/SellerKeys.tsx; apps/web/src/lib/session.ts; apps/web/src/lib/keystore.ts; apps/web/src/components/Common.tsx; packages/ux-vault/src/keystore-portable.ts
- Tests: apps/web/src/views/SellerKeys.test.tsx; apps/web/src/views/SellerKeys.recovery.test.tsx; apps/web/src/lib/session.test.ts; apps/web/src/lib/keystore.test.ts; packages/ux-vault/src/portable-parity.test.ts; apps/web/e2e/recovery.spec.ts; apps/web/e2e/core-journey.spec.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: Info: flaky SellerKeys blocked-download test failed CI 44239860965 @ceea9fdd; fixed test-only in 7a620ff1 (PROMOTION_PACKET 'later commits docs-only' is inaccurate for 7a620ff1)
- Missing tests: 
- Security/privacy: no plaintext keys on disk; file may be OS-indexed (warned)
- Dependencies: . Blockers: 
- External acceptance: Mobile download/import and real-device restore pending
- Related branches/PRs: pr/171@433307b8 #171 verified-backup gate; ancestor; pr/178@cf5ad81c #178 blob cleanup; ancestor; origin/claude/vigilant-johnson-yjgq94@4403d370 #150 idle-lock hint wording test; superseded (ledger)
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-KEY-04 — Idle lock and app lock (sleep-aware, GP-PAGES-04)

- Tier/area: beta-core / keys \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 12.0).
- Spec: docs/pages/RELEASE_MATRIX.md GP-PAGES-04; audit L1-01, G2-02, G2-05
- Implementation: apps/web/src/AppShell.tsx; apps/web/src/lib/appLock.ts; apps/web/src/views/SellerKeys.tsx; apps/web/src/components/SecretBackup.tsx
- Tests: apps/web/src/App.test.tsx; apps/web/src/lib/appLock.test.ts; apps/web/src/views/SellerKeys.lock.test.tsx; apps/web/src/views/Settings.test.tsx
- Verified working: 
- Missing requirements: Unspecified: no manual 'Lock now' for seller keys; AppLockReason 'manual' declared (appLock.ts:7) but never emitted (Info)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: unbacked keys deliberately kept loaded to avoid fund loss (documented trade-off)
- Dependencies: . Blockers: 
- External acceptance: Real mobile sleep/background tab behaviour unqualified
- Related branches/PRs: pr/165@9b3a3070 #165 idle-lock + verified backup states; ancestor
- Strategy: **none** — Complete; optional manual lock-now.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-KEY-07 — Spec 18 K01: public/keypair/master schemas + verified derivation adapter

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 11.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: Typed ghostpay-stealth-public-v1/-keypair-v1/-master-v1 schemas + strict parsers; Verified derivation: scheme 1, chainId, announcement; derived == announced == recomputed (EIP-55); Decide deep-scan (tagMatches=false) eligibility and viewTag carried; Public payload proven secret-free; errors carry no secret
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: spec 18 frozen (integrated); packages/core-crypto stealth.ts; test-vectors/scheme1.json. Blockers: 
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — New narrow module (crypto boundary separate from UI) reusing deriveStealthSecret/addressOfSecret; vectors first.
- Effort (estimate): M [2, 3] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-08 — Spec 18 K02: encrypted single-keypair envelope + atomic import

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 11.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: New format id + AAD domain (not GhostPay.keystore.v1); header bound as AAD; Fresh salt/IV; KDF bounds from keystore policy (N=2^17 export, import ceilings); Wrong passphrase/tamper/truncation/oversize/wrong chain-scheme fail closed, no partial state; Round-trip across fresh browser sessions; legacy keystore tests unchanged
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: F-KEY-07. Blockers: 
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — Reuse ux-vault keystore-portable primitives; add vectors.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-09 — Spec 18 K03: seller payment-row export UI (public + encrypted)

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 14.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: Scan > Payment details > Export (no such view exists yet; Scan.tsx:546-550 row has ReceiptPanel/Sweep only); Deliberate gesture + re-auth; decision for in-memory seller without vault (authorizeKeyExport returns undefined); Explicit chain/EOA/scope display; ownership label separate from receipt status; Locked/stale/changed-keys/wrong-chain refuse; KDF-time lock/switch never publishes a secret; Browser test: no secret in fetch/URL/log/storage/clipboard; no auto-download at scan
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: F-KEY-08; stable lock/reimport behavior (F-KEY-04). Blockers: owner decision: re-auth path when no vault; manual copy affordance (spec 18 wording item)
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — Follow SellerKeys onExport lifecycle (SellerKeys.tsx:205-247): op token, version guard, step-up, downloadText, state.
- Effort (estimate): L [3, 6] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-10 — Spec 18 K04: raw single-key export + independent recovery proof

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 10.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 0x+64-hex labelled private key (not seed) after re-auth + second confirmation; single key only; Refuse BTC BIP-352 / AA / 7702 / policy-account requests (fail closed); Spent-address export allowed with 'controls future deposits' label; Independent EVM tool proof on local chain (pinned Foundry cast/anvil 1.8.5, synthetic keys)
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: F-KEY-09; pinned Foundry toolchain. Blockers: owner decision on any manual clipboard copy for raw keys (precedent: SecretBackup.tsx clipboard copy with auto-clear in BTC/SOL/TRON views)
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — Implement after K03 controls; prove interop with cast on anvil in CI.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-11 — Spec 18 K05: encrypted bounded bulk archive of validated one-time keys

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 8.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: Encrypted only (no plaintext mode, no master keys); count/chain/scope header; Deterministic ordering; duplicate/conflict rejection via paymentKeyOf; Size/count bounds; malformed record -> atomic reject
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: F-KEY-08; F-KEY-09. Blockers: 
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — Reuse K02 envelope; bounds mirror tag-archive caps.
- Effort (estimate): M [2, 3] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-12 — Spec 18 K06: separate encrypted master spend/view backup (+ KC checkpoint)

- Tier/area: beta-core / keys/portability \| profile: not built (must stay within lean bundle rules). Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 11.0).
- Spec: docs/specs/18-stealth-keypair-export.md; docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md (K); docs/future/privacy-architecture/5k.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: ghostpay-stealth-master-v1: spend+view secrets, derivation scheme/version, recovery instructions; never signing key; Offline recovery of a historic announcement omitted from payment archive; fresh-install restore; Legacy keystore v1 still exports/imports unchanged (regression test); KC: spec 18 acceptance on one exact SHA; lean/full guards; Chromium+Firefox/WebKit; independent secret-flow review; reference recovery docs + vectors
- Confirmed defects: 
- Missing tests: all spec 18 acceptance tests (initially unrun by spec)
- Security/privacy: no plaintext export at scan time; no secret in fetch/URL/log/storage/clipboard/telemetry; selected RPC only, no fallback, for announcement verification; lean bundle import boundary (no relayer/CLI runtime)
- Dependencies: F-KEY-07; F-KEY-08; F-KEY-03 legacy keystore. Blockers: 
- External acceptance: Chromium + Firefox/WebKit, mobile download/import, independent wallet tool: all pending
- Related branches/PRs: origin/docs/ghostpay-3q-stealth-keypair-export-20261116@16bc61fa #190 spec docs only; ancestor of candidate
- Strategy: **implement** — Can run parallel to K03-K05 after format freeze; KC checkpoint adds ~1-3 days (ESTIMATE).
- Effort (estimate): M [3, 6] engineer-days
- Unverified: effort figures are ESTIMATES

### F-KEY-13 — secret-box (closure-held secret bytes, scopes, wipe)

- Tier/area: beta-core / packages/secret-box \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** (reported PARTIAL, normalized by rubric). Implementation 90% · Verification 90% (requirement weight 11.0).
- Spec: docs/remote/specs/secret-box.md; audit 03 S3-08; packages/secret-box/DEVIATIONS.md
- Implementation: packages/secret-box/src/secretBox.ts; packages/secret-box/src/scope.ts; apps/web/src/lib/session.ts
- Tests: packages/secret-box/src/secretBox.test.ts; packages/secret-box/src/scope.test.ts; packages/secret-box/src/secret-box.killers.test.ts; apps/web/src/lib/session.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: guardrail not boundary: same-realm code, strings/bigints, engine copies (documented)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Optional ADR for SecretScalar re-base; current wiring sufficient for beta.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-PROTO-01 — EIP-5564 scheme-1 stealth derivation, view tags, announcement check, stealth key

- Tier/area: beta-core / core-crypto. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 20.0).
- Spec: EIP-5564 scheme 1; ADR-0001 (ADR-LOG); CONTRACTS_SPEC preamble SCHEME_ID=1; spec 02 r1; docs/audits/27
- Implementation: packages/core-crypto/src/stealth.ts; packages/core-crypto/src/metadata.ts; packages/core-crypto/src/secret.ts; packages/core-crypto/src/rng.ts; packages/chain-adapters/src/deepscan.ts
- Tests: packages/core-crypto/src/vectors.test.ts; packages/core-crypto/src/differential.test.ts; packages/core-crypto/src/independent.test.ts; packages/core-crypto/src/negative.test.ts; packages/core-crypto/src/hash-edge.test.ts; packages/core-crypto/src/properties.test.ts; packages/core-crypto/src/metadata.test.ts; test-vectors/scheme1.json
- Verified working: scheme-1 maths byte-equal to ScopeLift SDK 1.0.0-beta.5 + curve-independent bigint reference; malformed announcements -> matches:false; coverage 98.5/98.16/100/98.21 (CI core-crypto shard)
- Missing requirements: 
- Confirmed defects: 
- Missing tests: No official EIP-5564 test vectors in repo (audit 27: none known/reachable)
- Security/privacy: ephemeral scalar never returned/logged; view tag leaks 1 byte of shared-secret hash by design; stealth != anonymity: payer/amount/time/graph public; uncompressed 65-byte R rejected (I-2, interop limit)
- Dependencies: @noble/curves 2.x, @noble/hashes, viem getAddress. Blockers: 
- External acceptance: No independent external crypto audit (audit 27 is single-pass AI review); no real-wallet interop run.
- Related branches/PRs: pr/2@c1c4ac9b #2 v0.1 crypto; ancestor of candidate; pr/115@c6ce2259 #115 crypto review (audit 27); ancestor; origin/dependabot/npm_and_yarn/npm-major-1ddf9439d6@8ce1bb04 #87 package.json bump only; maintenance backlog
- Strategy: **none** — Complete in-repo. Keep vectors pinned; add official vectors if EIP publishes any.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: EIP text not re-read here (network); spec of record = ADR-0001 + SDK

### F-PROTO-02 — Stealth meta-address encoding (st:eth:0x) + key generation

- Tier/area: beta-core / core-crypto. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 14.0).
- Spec: EIP-5564 meta-address; ADR-0010 decoder rules (ADR-LOG); spec 06 encoding
- Implementation: packages/core-crypto/src/keys.ts; packages/core-crypto/src/rng.ts; packages/chain-adapters/src/registry.ts
- Tests: packages/core-crypto/src/negative.test.ts; packages/core-crypto/src/properties.test.ts; packages/core-crypto/src/vectors.test.ts; packages/chain-adapters/src/registry.test.ts
- Verified working: round trips + negatives pass locally and in CI
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: public data only; errors never echo input; scheme-2 gp2 format separate (F-AA-02), never registered
- Dependencies: . Blockers: 
- External acceptance: Not checked against third-party wallets (Umbra/Fluidkey) beyond SDK differential.
- Related branches/PRs: pr/2@c1c4ac9b #2 origin; ancestor
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-03 — Announcement discovery primitives: verified RPC client + reorg-safe announcement fetch/validation

- Tier/area: beta-core / chain-adapters. Status: **VERIFIED_COMPLETE** (reported PARTIAL, normalized by rubric). Implementation 100% · Verification 100% (requirement weight 19.0).
- Spec: spec 02 r1,r4,r5,r7; spec 05 2A fetch limits; chain-adapters DEVIATIONS 7,12,16,18; audit S3-14
- Implementation: packages/chain-adapters/src/logs.ts; packages/chain-adapters/src/rpc.ts; packages/chain-adapters/src/scanVerify.ts
- Tests: packages/chain-adapters/src/logs.test.ts; packages/chain-adapters/src/scanHardening.test.ts; packages/chain-adapters/src/rpc.test.ts; packages/chain-adapters/src/scanVerify.test.ts; apps/web/src/lib/scannerCore.fuzz.test.ts
- Verified working: chain-adapters 551 pass/22 anvil-skips local; 573/573 CI with REQUIRE_ANVIL=1
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: user-selected RPC only, no fallback hosts; provider error text dropped (rpc.ts keeps JSON-RPC code only); a lying RPC can hide logs: second provider optional; private/link-local RPC hosts not rejected (DEVIATIONS 16; own node allowed)
- Dependencies: F-DEP-02 verified announcer/router addresses. Blockers: 
- External acceptance: No real public RPC provider limits measured (getLogsMaxRange=1000 engineering default).
- Related branches/PRs: pr/39@1d28f24d #39 NOT ancestor; rpc.ts/errors.ts B2R plain-revert; semantically superseded (ledger: rpc.ts:364-369); pr/40@63994db6 #40 NOT ancestor; same 3 unique commits; semantically superseded; pr/27@a4ab45fa #27 second-RPC fail-closed; ancestor; pr/41@70d8bf6e #41 scanner regrowth; ancestor
- Strategy: **repair** — Optional: add per-log block-hash cross-check or record acceptance of matched-log-only check.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-PROTO-04 — Payment claim verification library (spec 02 library side)

- Tier/area: beta-core / chain-adapters. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 16.0).
- Spec: spec 02 r3,r4,r6(partial),r7; audit S3-02/G-04; chain-adapters DEVIATIONS 15
- Implementation: packages/chain-adapters/src/payments.ts; packages/chain-adapters/src/scanVerify.ts; packages/chain-adapters/src/deepscan.ts
- Tests: packages/chain-adapters/src/payments.test.ts; packages/chain-adapters/src/payments.anvil.test.ts; packages/chain-adapters/src/scanVerify.test.ts
- Verified working: beta acceptance CI: native payment traced as received, inflated claim refused
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: metadata is a claim, never shown as received; balance read reveals match to RPC: opt-in; lying RPC defeats single-provider mode
- Dependencies: spec 02 r6 under/over/double-pay reporting lives in packages/ux-vault/src/reconciliation-amounts.ts (B1b scope); expected-payment wrong-tag fallback = opt-in deep scan (F-PROTO-01 r5) + web scanner (B1b). Blockers: 
- External acceptance: Only anvil; no public-testnet provider disagreement acceptance.
- Related branches/PRs: pr/182@0c4c3c8d #182 linked invoice reporting baseline; ancestor; pr/114@1bf25be7 #114 F1/F2 scan+reconciliation fixes; ancestor
- Strategy: **none** — Library complete; app-side qualification is B1b.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-06 — Invoice schema v1/v2 + canonical JSON + signing/verification

- Tier/area: beta-core / invoice-schema. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 15.0).
- Spec: ADR-0002 signing; ADR-0005 fragment; ADR-0024 v2; DEVELOPER_SPECIFICATION Module C; docs/audits/27 I-1
- Implementation: packages/invoice-schema/src/schema.ts; packages/invoice-schema/src/json.ts; packages/invoice-schema/src/sign.ts; packages/invoice-schema/src/expiry.ts
- Tests: packages/invoice-schema/src/schema.test.ts; packages/invoice-schema/src/json.test.ts; packages/invoice-schema/src/sign.test.ts; packages/invoice-schema/src/independent.test.ts; packages/invoice-schema/src/fuzz.test.ts; packages/invoice-schema/src/text-hygiene.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: not EIP-712 (no verifyingContract), by design (I-1); signature = key control, not merchant identity
- Dependencies: . Blockers: 
- External acceptance: No external audit.
- Related branches/PRs: origin/codex/ghostpay-recovered-lean-checkpoint-20261028@371d235c NOT ancestor; schema.ts variant; ledger: archive as evidence; origin/ghostpay-cloud-recovery-2026-10-26@2ec98b23 NOT ancestor; same lineage; archive; origin/ghostpay-local-lean-boundary-20261027@020ba327 NOT ancestor; archive; origin/ghostpay-offline-deps-2026-10-27@3697f539 NOT ancestor; archive; origin/ghostpay-sbom-repro-2026-10-27@b5b04b99 NOT ancestor; archive
- Strategy: **none** — Complete. Recovery-snapshot branches hold no missing behaviour (ledger).
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-07 — Invoice link envelope #gpi=v1. (none / A256GCM / A256GCM-PW passphrase)

- Tier/area: beta-core / invoice-schema. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 90% (requirement weight 13.0).
- Spec: ADR-0005; ADR-0020 (Proposed)
- Implementation: packages/invoice-schema/src/envelope.ts; packages/invoice-schema/src/passphrase.ts; packages/invoice-schema/src/base64url.ts
- Tests: packages/invoice-schema/src/envelope.test.ts; packages/invoice-schema/src/passphrase.test.ts; packages/invoice-schema/src/independent.test.ts; apps/web/src/views/Pay.test.tsx; apps/web/src/views/CreateInvoice.test.tsx
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: A256GCM link = bearer secret; clear: chainId, signer, KDF cost, size; offline guessing bound by passphrase entropy
- Dependencies: . Blockers: 
- External acceptance: No external audit; ADR-0020 still Proposed.
- Related branches/PRs: 
- Strategy: **none** — Complete; owner should accept ADR-0020.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-08 — Invoice-bound signed seller receipts

- Tier/area: beta-core / invoice-schema. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 14.0).
- Spec: ADR-0025/0026 receipts; docs/handoffs/INVOICE_BOUND_RECEIPTS_2026-11-02.md
- Implementation: packages/invoice-schema/src/receipts.ts
- Tests: packages/invoice-schema/src/receipts.test.ts; packages/cli/src (receipt commands); apps/web/src/views/Pay.test.tsx
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: receipt reveals invoice digest/tx/stealth to holder; signer trust only out of band
- Dependencies: Overlap B1b F-WEB-10 (receipt UI); this row = library. Blockers: 
- External acceptance: 
- Related branches/PRs: pr/24@bb011134 #24 signed receipt QR exchange; merged, ancestor; pr/64@2bcfd11f #64 require invoice-bound receipts in lean; ancestor; pr/105..109@- #105 CLI receipt qualification; ancestors
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-13 — Spec 18 stealth keypair export formats + crypto adapter (protocol side of 3q)

- Tier/area: beta-core / core-crypto/ux-vault. Status: **PARTIAL** (reported SPEC_ONLY, normalized by rubric) — DUPLICATE of F-KEY-07, F-KEY-08 (spec 18 formats/envelope counted under F-KEY-07..12), excluded from counts. Implementation 10% · Verification 10% (requirement weight 17.0).
- Spec: docs/specs/18-stealth-keypair-export.md; NEXT_PHASE_QUEUE K01,K02,K05,K06; future/privacy-architecture/5k (xref)
- Implementation: (none) reuse: packages/core-crypto/src/stealth.ts:212; packages/chain-adapters/src/sweep.ts:175 addressOfSecret; packages/ux-vault/src/keystore-portable.ts (legacy v1, B1b scope)
- Tests: packages/core-crypto/src/vectors.test.ts (derivation vector only)
- Verified working: 
- Missing requirements: K01 schemas+adapter; K02 envelope; K04 raw export; K05 bulk; K06 master; vectors/docs
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no secret in URL/storage/logs/clipboard/telemetry; no auto plaintext export; legacy keystore v1 unchanged; flow-1 on-chain check via user-selected RPC, no fallback; export modules inside lean bundle rules
- Dependencies: UI/vault parts K03 and browser acceptance = B1b; spec 18 wording decisions (R-15) before K03; Same scope as B1b F-KEY-07/-08/-11/-12 (spec 18 K01/K02/K05/K06): count effort once. Blockers: R-15 spec wording (clipboard/telemetry/in-memory step-up) for K03 only
- External acceptance: Independent EVM tool recovery (cast/anvil) and mobile download/import pending (K04/KC).
- Related branches/PRs: pr/190@16bc61fa #190 spec 18 approval (docs); ancestor
- Strategy: **implement** — Implement K01/K02/K05/K06 crypto modules reusing keystore-portable primitives; vectors first.
- Effort (estimate): L [5, 9] engineer-days
- Unverified: 

### F-WEB-01 — Create signed invoice (link, QR, items, fiat labels)

- Tier/area: beta-core / web/invoice \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 20.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 3; docs/handoffs/LEAN_RELEASE_SCOPE.md; docs/handoffs/SUPPORTED_INVOICE_BOUNDARY_2026-11-02.md; docs/handoffs/INVOICE_SPARSE_ITEMS_2026-11-04.md; ADR-0020
- Implementation: apps/web/src/views/CreateInvoice.tsx; apps/web/src/lib/invoiceCreate.ts; apps/web/src/lib/fragment.ts; apps/web/src/components/QrFrame.tsx; packages/invoice-schema/src/schema.ts
- Tests: apps/web/src/views/CreateInvoice.test.tsx; apps/web/src/views/CreateInvoice.supported.test.tsx; apps/web/src/views/CreateInvoice.ordering.test.tsx; apps/web/src/views/CreateInvoice.register.test.tsx; apps/web/src/lib/invoiceCreate.test.ts; apps/web/e2e/app.spec.ts; apps/web/e2e/passphrase-vault.spec.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: seller creates signed native invoice under /GhostPay/ and payer opens it (Pages b/c); tampered amount refused (Pages g)
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: invoice private part only in fragment; bearer-link warning when key in link; signing key never leaves session (withSessionSecrets)
- Dependencies: packages/invoice-schema (B1a); F-KEY-03 backup gate; F-WEB-16 fragment handling. Blockers: 
- External acceptance: Real Sepolia invoice->pay pending (B06); no signed manifest bundled
- Related branches/PRs: pr/172@dffe0725 #172 out-of-order invoice callbacks; ancestor of candidate; origin/chatgpt/ghostpay-historical-consolidation-20261115@7dc7eccc selective #172 copies; superseded (ledger)
- Strategy: **none** — Complete; only external acceptance remains.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: mobile share/print flows on real devices

### F-WEB-03 — Pay flow: review, EIP-6963 wallet connect, consent, native/ERC-20 send

- Tier/area: beta-core / web/pay \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 26.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 4; docs/specs/04-permit-griefing-fallback.md; docs/handoffs/LEAN_RELEASE_SCOPE.md
- Implementation: apps/web/src/views/Pay.tsx; apps/web/src/lib/pay.ts; apps/web/src/lib/payExec.ts; apps/web/src/lib/txGuard.ts; apps/web/src/lib/wallet.ts; apps/web/src/lib/jitter.ts; apps/web/src/components/PrintableBill.tsx; apps/web/src/components/PaymentRequestQr.tsx
- Tests: apps/web/src/views/Pay.test.tsx; apps/web/src/views/Pay.invoiceQr.test.tsx; apps/web/src/views/Pay.supported.test.tsx; apps/web/src/lib/pay.test.ts; apps/web/src/lib/payExec.test.ts; apps/web/src/lib/payExec.acceptance.test.ts; apps/web/src/lib/txGuard.test.ts; apps/web/src/lib/wallet.test.ts (+5 more)
- Verified working: native ETH payment pending->included on real devnet via lean artifact (Pages c); wallet rejection leaves invoice unpaid (Pages g)
- Missing requirements: Not specified but notable: no WalletConnect/mobile-wallet transport in web (packages/ux-connect/src/wcsession.ts unwired); injected/EIP-6963 only
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no RPC/wallet effect before consent; egress limited to site + user RPC (Pages journey assertion); preview==calldata invariant
- Dependencies: F-WEB-17 manifests; F-WEB-25 tx-review; packages/chain-adapters router/permit. Blockers: no signed testnet manifest bundled: default build has payments disabled (owner B02/B03)
- External acceptance: Real wallet extensions, mobile wallets, Safari/Firefox, ERC-20 on real chain pending
- Related branches/PRs: pr/151@2527d6b9 #151 A3-2 expiry-at-send superseded by assertInvoiceStillPayable/boundedDeadline (pay.ts:385,400); pr/194@c15833bc #194 Pay rich-tag renderer guard; ancestor
- Strategy: **none** — Complete for lean scope; ERC-20 real-chain run belongs to B04/B06.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: ERC-20 approve/permit in a real browser on a real chain (devnet tokens not allowlisted)

### F-WEB-04 — Payment submission journal and honest uncertain outcomes

- Tier/area: beta-core / web/pay \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** (reported PARTIAL, normalized by rubric). Implementation 90% · Verification 90% (requirement weight 11.0).
- Spec: docs/beta/CORE_BETA_COMPLETION_TRACKER.md step 4; docs/pages/RELEASE_MATRIX.md
- Implementation: apps/web/src/lib/duplicateAttemptJournal.ts; apps/web/src/lib/transactionOutcome.ts; apps/web/src/components/WalletAttempts.tsx; apps/web/src/lib/wallet.ts
- Tests: apps/web/src/lib/duplicateAttemptJournal.test.ts; apps/web/src/lib/transactionOutcome.test.ts; apps/web/src/lib/walletJournal.test.ts; apps/web/src/components/WalletAttempts.test.tsx; apps/web/e2e/flows.spec.ts; apps/web/e2e/core-journey.spec.ts; apps/web/e2e/devnet-journey.spec.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: 
- Missing requirements: multi-tab duplicate payment not prevented (documented, owner-accepted limitation)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: journal holds tx hash + invoice digest scope only (sessionStorage), no secrets
- Dependencies: . Blockers: 
- External acceptance: Real wallet replacement/speed-up behaviour unqualified
- Related branches/PRs: 
- Strategy: **defer** — Keep documented limit for beta; optional Web Locks/IndexedDB cross-tab journal later.
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-WEB-06 — Seller scan & discovery UI (worker, checkpoints, reorg, dedupe, deep scan, auto-rescan)

- Tier/area: beta-core / web/scan \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** (reported PARTIAL, normalized by rubric). Implementation 95% · Verification 95% (requirement weight 23.0).
- Spec: docs/specs/02-scanner-robustness-and-payment-verification.md; docs/specs/05-announcer-spam-anonymity-set.md; docs/APP_AND_RELAYER_SPEC.md S1 view 5
- Implementation: apps/web/src/views/Scan.tsx; apps/web/src/lib/scanClient.ts; apps/web/src/lib/scannerCore.ts; apps/web/src/lib/scanner.worker.ts; apps/web/src/lib/scanMatches.ts; apps/web/src/lib/scanSpam.ts
- Tests: apps/web/src/views/Scan.test.tsx; apps/web/src/views/Scan.autoRescan.test.tsx; apps/web/src/lib/scanClient.test.ts; apps/web/src/lib/scannerCore.test.ts; apps/web/src/lib/scannerCore.fuzz.test.ts; apps/web/src/lib/scanSpam.test.ts; apps/web/src/lib/scannerCore.spam.nocov.test.ts; apps/web/e2e/flows.spec.ts (+2 more)
- Verified working: 
- Missing requirements: spec 02 rule 2 disposition: invoice-driven fallback infeasible (payer picks ephemeral key); deep scan router-only
- Confirmed defects: 
- Missing tests: 
- Security/privacy: RPC learns scanned ranges/timing (disclosed); viewing-key copy wiped after scan; secondary RPC never silently dropped
- Dependencies: F-WEB-07 privacy plan; F-WEB-08 RPC; F-WEB-17 manifest readback; packages/core-crypto, chain-adapters logs. Blockers: 
- External acceptance: Public-provider behaviour (log caps, rate limits) on Sepolia unqualified
- Related branches/PRs: origin/chatgpt/ghostpay-rpc-filter-guard-20261114@dfed84c1 scanSpam off-filter guard; only comment wording differs from candidate (git diff) -> superseded; pr/159@7b6c4983 #159 patch-equivalent in candidate
- Strategy: **defer** — Record spec 02 rule-2 disposition (deep scan = equivalent for router payments); implement direct-payer wrong-tag fallback only if owner wants it.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-08 — RPC provider configuration (explicit, validated, chainId-checked, no fallback)

- Tier/area: beta-core / web/settings \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 16.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 7; docs/pages/README.md 'Settings you must make yourself'
- Implementation: apps/web/src/lib/settings.ts; apps/web/src/views/Settings.tsx; apps/web/src/AppShell.tsx; apps/web/src/lib/defaultServices.ts
- Tests: apps/web/src/lib/settings.test.ts; apps/web/src/views/Settings.test.tsx; apps/web/src/views/Settings.race.test.tsx; apps/web/src/lib/defaultServices.test.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: explicit provider selection; provider privacy disclosed (audit 17)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-09 — Payment history & reconciliation ledger (encrypted IndexedDB, invoice registry)

- Tier/area: beta-core / web/reconciliation \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 95% (requirement weight 18.0).
- Spec: ADR-0026; docs/specs/02-scanner-robustness-and-payment-verification.md (2026-11-16 continuation)
- Implementation: apps/web/src/components/ReconciliationLedger.tsx; apps/web/src/components/InvoicePaymentSummary.tsx; apps/web/src/lib/reconciliationVault.ts; apps/web/src/lib/reconciliationLedger.ts; apps/web/src/lib/reconciliationMatch.ts; packages/ux-vault/src/reconciliation-portable.ts; packages/ux-vault/src/reconciliation-amounts.ts
- Tests: apps/web/src/components/ReconciliationLedger.test.tsx; apps/web/src/components/ReconciliationLedger.invoices.test.tsx; apps/web/src/lib/reconciliationVault.test.ts; apps/web/src/lib/reconciliationVault.invoices.test.ts; apps/web/src/lib/reconciliationVault.idb.test.ts; apps/web/src/lib/reconciliationMatch.test.ts; apps/web/src/lib/reconciliationLedger.test.ts; apps/web/e2e/reconciliation.spec.ts (+1 more)
- Verified working: 
- Missing requirements: 
- Confirmed defects: Low: apps/web/scripts/test-reconciliation-idb.mjs:71 calls invalidateFrom(100n) but API is invalidateFrom(block, observed, canonicalHash) (reconciliation-portable.ts:154,961; changed 5ee84c91 2026-11-09); script exits 1 TypeError; not wired into CI/npm scripts
- Missing tests: real-Chromium reconciliation IDB script repaired + wired into CI
- Security/privacy: ledger ciphertext only at rest; amount summary is never a paid/settled badge
- Dependencies: F-WEB-06 scan; packages/ux-vault portable (in scope, 284/284 local). Blockers: 
- External acceptance: none beyond browser/device matrix
- Related branches/PRs: pr/186@27852ba8 #186 canonical block timestamps; ancestor; pr/173@97cf5a0c #173 imported vs live; ancestor; pr/175@57acf1b0 #175 live provenance before verified; ancestor; pr/177@17f68191 #177 IDB close recovery; ancestor
- Strategy: **repair** — Update stale real-browser IDB script to current invalidateFrom signature and run it in CI.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-10 — Receipts (invoice-bound signed receipt, QR, archive, payer verification)

- Tier/area: beta-core / web/receipts \| profile: lean+full (lean requires bound invoice). Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 15.0).
- Spec: ADR-0026; docs/handoffs/INVOICE_BOUND_RECEIPTS_2026-11-02.md
- Implementation: apps/web/src/components/ReceiptPanel.tsx; apps/web/src/lib/receipts.ts; apps/web/src/views/Pay.tsx
- Tests: apps/web/src/components/ReceiptPanel.test.tsx; apps/web/src/components/ReceiptPanel.invoice.test.tsx; apps/web/src/components/ReceiptPanel.archive.test.tsx; apps/web/src/components/ReceiptPanel.profile.test.tsx; apps/web/src/lib/receipts.test.ts; apps/web/e2e/receipt-lean.spec.ts; apps/web/e2e/core-journey.spec.ts; apps/web/e2e/flows.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: signing key used inside withSessionSecrets only
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-11 — Direct sweep (self-paid gas, in-page derived key)

- Tier/area: beta-core / web/sweep \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** — security hold: SEC-03: direct sweep signs without step-up in vault-less sessions. Implementation 100% · Verification 100% (requirement weight 23.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 6; docs/pages/RELEASE_MATRIX.md 'Direct sweep'
- Implementation: apps/web/src/views/Sweep.tsx; apps/web/src/lib/sweep.ts; apps/web/src/lib/sweepAttemptJournal.ts; apps/web/src/lib/opStackFee.ts; apps/web/src/state.tsx
- Tests: apps/web/src/views/Sweep.test.tsx; apps/web/src/lib/sweep.test.ts; apps/web/src/lib/sweepAttemptJournal.test.ts; apps/web/src/state.sweep.test.ts; apps/web/e2e/sweep.spec.ts; apps/web/e2e/core-journey.spec.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no browser-wallet signing for one-time address; signed tx only to user RPC; sweep to known wallet links on-chain (disclosed)
- Dependencies: . Blockers: 
- External acceptance: ERC-20 direct sweep and real OP-stack L1 fee on public testnet pending (B04/B06)
- Related branches/PRs: pr/202@30cc4560 #202 keystore reimport control without pending sweep; ancestor; root cause = ContextHelp lost click (84b4e605); pr/39 / pr/40@1d28f24d #39 D3/B2R superseded (ledger)
- Strategy: **none** — Complete in code; ERC-20 qualification is a B06 external run.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: ERC-20 direct sweep on real chain

### F-WEB-16 — Invoice URL fragment privacy (autoclear, history state, anchors, focus)

- Tier/area: beta-core / web/shell \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 14.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 security controls; PRs #196-#201
- Implementation: apps/web/src/lib/fragment.ts; apps/web/src/AppShell.tsx; apps/web/src/views/Settings.tsx
- Tests: apps/web/src/lib/fragment.test.ts; apps/web/src/AppLean.fragment.test.tsx; apps/web/src/App.test.tsx; apps/web/e2e/app.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: residual: the fragment URL may persist in browser global history/session restore before clearing (UNVERIFIED disclosure; Team D/E)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/196..pr/201@120dcd7f #201 all ancestors of candidate
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: browser global-history retention of the original fragment URL

### F-WEB-17 — Bundled signed manifests + on-chain readback in UI

- Tier/area: beta-core / web/trust \| profile: lean+full. Status: **PARTIAL**. Implementation 80% · Verification 80% (requirement weight 16.0).
- Spec: docs/specs/01-manifest-readback.md; docs/DEPLOYMENT_MANIFEST.md; ADR-0029 gate 1; NEXT_PHASE_QUEUE B03
- Implementation: apps/web/src/lib/manifest.ts; apps/web/src/lib/bundledManifests.ts; apps/web/src/lib/releaseKeys.ts; apps/web/src/lib/deployment.ts; apps/web/vite.config.ts; apps/web/scripts/validate-deployments.mjs; apps/web/src/components/ManifestBanner.tsx
- Tests: apps/web/src/lib/manifest.test.ts; apps/web/src/lib/deployment.test.ts; apps/web/src/buildScripts.test.ts; apps/web/src/lib/defaultServices.test.ts; apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/app.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: Low: deployments/README.md:37 references missing npm script validate:deployments [CONFIRMED]; Low: manifest readback single-provider; secondary-capable checkDeployment unused (L2-I4 open) [CONFIRMED by grep]
- Missing tests: 
- Security/privacy: fail closed on mismatch/RPC failure; release hash on Home is self-attested (labelled)
- Dependencies: . Blockers: no authentic Sepolia deployment or release-signed manifest (owner B01-B03); release-signing trust root undecided
- External acceptance: Runtime readback via public Sepolia RPC with real signed manifest pending
- Related branches/PRs: pr/195@12e18931 #195 signed bundled manifest + fail-closed tests; ancestor
- Strategy: **repair** — Wire secondary readback (verifyDeployment/checkDeployment) when a second RPC is set; add missing script or fix README; then owner B02/B03.
- Effort (estimate): S [0.5, 1.5] engineer-days
- Unverified: 

### F-WEB-21 — Lean static Pages build profile (product surface)

- Tier/area: beta-core / web/build \| profile: lean (Pages) vs full. Status: **BLOCKED**. Implementation 80% · Verification 80% (requirement weight 22.0).
- Spec: ADR-0029 (Proposed); ADR-0015; docs/handoffs/LEAN_RELEASE_SCOPE.md; docs/pages/README.md; docs/pages/RELEASE_MATRIX.md
- Implementation: apps/web/src/AppLean.tsx; apps/web/src/App.tsx; apps/web/src/AppShell.tsx; apps/web/src/lib/buildProfile.ts; apps/web/scripts/localBuildProfile.mjs; apps/web/scripts/scan-bundle.mjs; apps/web/scripts/csp.mjs; apps/web/vite.config.ts (+3 more)
- Tests: apps/web/src/AppLean.test.tsx; apps/web/src/lib/buildProfile.test.ts; apps/web/scripts/localBuildProfile.test.mjs; apps/web/src/scanBundle.test.ts; apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/backup-panel.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no backend/relayer/DB in Pages; no mainnet manifest on Pages; every request stays inside /GhostPay/ or user RPC (Pages journey)
- Dependencies: . Blockers: ADR-0029 not accepted (B01); GP-PAGES-01 origin decision; release trust root/signing (blocker 4); branch protection on main (blocker 1)
- External acceptance: DEMO_DEPLOYED / TESTNET_BETA_QUALIFIED states not reached; no real-origin smoke
- Related branches/PRs: pr/137@ac08062e #137 Pages static beta; ancestor
- Strategy: **defer** — Engineering complete; await owner decisions B01, origin (GP-PAGES-01), release key; then B05 dispatch + real-origin smoke.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-22 — Client hardening: no telemetry, egress allowlist, bundle scan, inert untrusted text

- Tier/area: beta-core / web/security \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 14.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 security controls; COMMON constraint 3
- Implementation: apps/web/scripts/scan-bundle.mjs; apps/web/src/lib/displayText.ts; apps/web/src/components/RichText.tsx; apps/web/src/components/Common.tsx; apps/web/src/components/ErrorBoundary.tsx; apps/web/src/lib/sanitize.ts; apps/web/index.html
- Tests: apps/web/src/privacyInvariants.test.ts; apps/web/src/scanBundle.test.ts; apps/web/src/lib/hardening.test.ts; apps/web/src/lib/displayText.test.ts; apps/web/src/components/ErrorBoundary.test.tsx; apps/web/e2e/app.spec.ts; apps/web/e2e/pages-devnet.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: connect-src https: wss: broad by design (runtime allowlist in adapter) - documented trade-off
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/192@dd4a7eb4 #192 RichText own-property guard; ancestor
- Strategy: **none** — Complete; deep review = Teams D/E.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-25 — tx-review pre-sign decoder/reviewer (package, wired via txGuard)

- Tier/area: beta-core / packages/tx-review \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: docs/remote/specs/tx-review.md; packages/tx-review/DEVIATIONS.md
- Implementation: packages/tx-review/src/decode.ts; packages/tx-review/src/review.ts; apps/web/src/lib/txGuard.ts
- Tests: packages/tx-review/src/decode.test.ts; packages/tx-review/src/golden.test.ts; packages/tx-review/src/property.test.ts; packages/tx-review/src/exotic.test.ts; packages/tx-review/src/review.test.ts; apps/web/src/lib/txGuard.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: payERC20WithBuffer deliberately not decodable (L-04): 'skipped-buffer' path keeps only preview==calldata [INTENDED; reachable in lean via v1 payer buffer, see F-WEB-05]
- Dependencies: . Blockers: 
- External acceptance: Not checked against real wallets/chains
- Related branches/PRs: 
- Strategy: **none** — Complete; Team D to review L-04 exclusion given lean exposure.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-26 — address-safety (strict addresses, lookalikes, display-text sanitizing)

- Tier/area: beta-core / packages/address-safety \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 80% (requirement weight 10.0).
- Spec: docs/remote/specs/address-safety.md
- Implementation: packages/address-safety/src/address.ts; packages/address-safety/src/text.ts; packages/address-safety/src/meta.ts; apps/web/src/lib/sweep.ts; apps/web/src/lib/displayText.ts
- Tests: packages/address-safety/src/address.test.ts; packages/address-safety/src/text.test.ts; packages/address-safety/src/meta.test.ts; packages/address-safety/src/token.test.ts; apps/web/src/lib/displayText.test.ts
- Verified working: 
- Missing requirements: payeeTrust unwired (may be redundant with Pay pinned signers)
- Confirmed defects: 
- Missing tests: cross-engine (Firefox/WebKit) Unicode/confusable rendering
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **refactor** — Wire payeeTrust into Pay signer status or record non-use; add cross-engine check when browsers available.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-A11Y-01 — Automated accessibility: axe-core audit in Playwright (all routes, keyboard, 320px reflow, forced-colors, reduced-motion)

- Tier/area: beta-supporting / a11y. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 85% (requirement weight 12.0).
- Spec: 
- Implementation: apps/web/e2e/accessibility-audit.ts; apps/web/e2e/accessibility.spec.ts
- Tests: apps/web/e2e/accessibility.spec.ts
- Verified working: CI d91ae16a e2e: 200 recorded axe states/profile, zero violations (PRODUCT_COMPLETION_HANDOFF; CI-qualified)
- Missing requirements: 
- Confirmed defects: 
- Missing tests: modals, deferred routes, theme combos
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: screen-reader / native AT / real device testing not done (handoff states emulation is not AT proof)
- Related branches/PRs: pr/59@ #59 axe page-global cast typecheck fix; ancestor?; pr/73@92af349a #73 C5 device projects a11y; ancestor
- Strategy: **repair** — add remaining modals/routes; manual screen-reader pass (NVDA/VoiceOver) as external acceptance
- Effort (estimate): M [1, 3] engineer-days
- Unverified: axe results not rerun by B2

### F-A11Y-02 — Mobile/responsive: Chromium device-emulation projects (Pixel 7, iPhone SE, iPad Mini descriptors)

- Tier/area: beta-supporting / a11y. Status: **PARTIAL**. Implementation 50% · Verification 50% (requirement weight 12.0).
- Spec: 
- Implementation: apps/web/playwright.config.ts; apps/web/e2e/devices.spec.ts
- Tests: apps/web/e2e/devices.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: real device + Safari acceptance outstanding
- Related branches/PRs: pr/73@92af349a #73 ancestor
- Strategy: **defer** — external acceptance only; emulation labelled honestly
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-A11Y-03 — Screen-reader / assistive-tech qualification

- Tier/area: beta-supporting / a11y. Status: **PARTIAL** (reported NOT_STARTED, normalized by rubric). Implementation 40% · Verification 20% (requirement weight 5.0).
- Spec: 
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: human AT testing
- Related branches/PRs: 
- Strategy: **implement** — manual NVDA/VoiceOver/TalkBack pass on 9 core routes; record in docs/operators
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-CLI-01 — CLI core: registry, strict arg parsing, --json, exit codes, doctor, build-info

- Tier/area: beta-supporting / cli. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 85% (requirement weight 13.0).
- Spec: docs/handoffs/CLI_COMPLETION_HANDOFF.md; packages/cli/README.md
- Implementation: packages/cli/src/args.ts; packages/cli/src/bin.ts; packages/cli/src/commands/registry.ts; packages/cli/src/commands/doctor.ts; packages/cli/src/build-info.ts
- Tests: packages/cli/src/args.test.ts; packages/cli/src/cli.test.ts; packages/cli/test/compiled.test.mjs
- Verified working: packages/cli vitest: 37 files / 570 tests pass (local, no coverage)
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no CLI command signs/broadcasts funds-moving tx (README claim; execute=unsupported)
- Dependencies: . Blockers: 
- External acceptance: none required
- Related branches/PRs: origin/gpt/ghostpay-cli-completion-20261109@None #92 ancestor of cand; pr/129@ #129 end-of-options port; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: handoff claims 68 command paths / 100% acceptance; counted ~69 path literals incl. dynamic; not independently recounted; compiled .mjs tests not run (would need dist build)

### F-CLI-02 — CLI invoice, receipt, QR, seller-pairing commands

- Tier/area: beta-supporting / cli. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: 
- Implementation: packages/cli/src/commands/invoice.ts; packages/cli/src/commands/receipt.ts; packages/cli/src/commands/qr.ts; packages/cli/src/commands/seller.ts
- Tests: packages/cli/src/invoice-parity.test.ts; packages/cli/src/receipt-parity.test.ts; packages/cli/src/qr-parity.test.ts
- Verified working: 570 cli tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/105@ #105 invoice-bound receipt negatives; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-CLI-04 — CLI reconcile, history, encrypted receipt archive

- Tier/area: beta-supporting / cli. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 10.0).
- Spec: 
- Implementation: packages/cli/src/commands/reconcile.ts; packages/cli/src/commands/history.ts; packages/cli/src/reconcile-session.ts
- Tests: packages/cli/src/reconcile-command.test.ts; packages/cli/src/history-command.test.ts
- Verified working: pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/111@ #111 shared RPC byte budgets; ancestor; pr/107@ #107 live RPC evidence; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-CLI-05 — CLI read-only chain/payment/scan/registry commands

- Tier/area: beta-supporting / cli. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 80% (requirement weight 10.0).
- Spec: 
- Implementation: packages/cli/src/commands/chain.ts; packages/cli/src/commands/payment.ts; packages/cli/src/commands/scan.ts; packages/cli/src/commands/registry.ts
- Tests: packages/cli/src/chain-commands.test.ts; packages/cli/src/payment-commands.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Public-testnet CLI verification not performed here (handoff: pending)
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: no live RPC used; fixtures only

### F-CLI-06 — CLI merchant commands: refunds, installments, subscriptions, webhooks, split, batch

- Tier/area: beta-supporting / cli. Status: **PARTIAL**. Implementation 80% · Verification 80% (requirement weight 9.0).
- Spec: 
- Implementation: packages/cli/src/commands/merchant.ts; packages/cli/src/commands/merchant-refund.ts; packages/cli/src/commands/sub.ts; packages/cli/src/commands/webhook.ts; packages/cli/src/commands/split.ts; packages/cli/src/commands/batch.ts
- Tests: packages/cli/src/merchant.test.ts; packages/cli/src/merchant-refund.test.ts; packages/cli/src/merchant-subscription.test.ts
- Verified working: 
- Missing requirements: refund execute is deliberately unsupported (noncustodial / no hosted signing)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: F-MER-01; F-MER-03; F-MER-04. Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — keep execute unsupported; matches constraint 1
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-CTR-02 — Permit griefing fallback & error surfacing (spec 04)

- Tier/area: beta-supporting / chain-adapters+contracts+relayer. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 90% (requirement weight 20.0).
- Spec: docs/specs/04-permit-griefing-fallback.md; CONTRACTS_SPEC s2
- Implementation: packages/chain-adapters/src/permit.ts; packages/chain-adapters/src/sweep.ts; apps/web/src/lib/payExec.ts; apps/web/src/lib/sweep.ts; apps/relayer/src/service.ts; packages/contracts/src/GhostPaySweepRelayer.sol; packages/contracts/src/GhostPayRouter.sol
- Tests: packages/chain-adapters/src/permit.test.ts; apps/relayer/src/e2e.anvil.test.ts; packages/contracts/test/GhostPaySweepRelayer.t.sol
- Verified working: 
- Missing requirements: Option C PermitSkipped event: deferred optional, needs CONTRACTS_SPEC change (not counted)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no tx.origin; PermitSig.deadline outside sweep signature; permit.value>=amount only coupling (documented)
- Dependencies: . Blockers: 
- External acceptance: No real-token (USDC v2.2, DAI-style) testnet acceptance.
- Related branches/PRs: pr/27@a4ab45fa #27 permit pre-flight; merged ancestor; pr/69@9d100956 #69 sweep permit messages; ancestor; pr/118@97b919c9 #118 relayer permit failure classes; ancestor; pr/113@0641d41a #113 spec 04 CI gate; ancestor
- Strategy: **none** — Complete off-chain; tune griefReserveBps from measured testnet loss.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-CTR-03 — GhostPaySweepRelayer + relayer-authorized sweep (EIP-712 signed terms incl. deadline, nonce bitmap)

- Tier/area: beta-supporting / contracts+chain-adapters. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 23.0).
- Spec: CONTRACTS_SPEC s2; FEE_SCHEDULE F-SPONSOR; ADR-0009 (no 4337); audits mythril-14290880802-expiry-dispositions
- Implementation: packages/contracts/src/GhostPaySweepRelayer.sol; packages/contracts/src/interfaces/IGhostPaySweepRelayer.sol; packages/chain-adapters/src/sweep.ts; packages/chain-adapters/src/fees.ts; packages/chain-adapters/src/abi/sweepRelayer.ts
- Tests: packages/contracts/test/GhostPaySweepRelayer.t.sol; packages/contracts/test/GhostPaySweepRelayer.invariant.t.sol; packages/contracts/test/audit/Sweep.audit.t.sol; packages/contracts/test/MythrilExpiryDispositions.t.sol; packages/chain-adapters/src/sweep.test.ts; packages/chain-adapters/src/eip712.independent.test.ts; apps/relayer/src/e2e.anvil.test.ts; packages/contracts/test/echidna/EchidnaSweep.sol
- Verified working: coverage GhostPaySweepRelayer.sol 100%; Echidna Sweep campaign green (run 44231986631)
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: sponsor sees stealth address + destination (linkage); stealth key signs exact fee/feeTo; EIP-3009 future, not built
- Dependencies: relayer service (apps/relayer) operator; F-DEP-04; Overlap B1b F-WEB-12 (relayer sweep UI); this row = contract + client signing. Blockers: F-SPONSOR rate is [OWNER] decision before mainnet
- External acceptance: No hosted relayer (ADR-0015); no testnet relayed sweep.
- Related branches/PRs: 
- Strategy: **none** — Complete; relayer hosting is a separate owner decision.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-CTR-04 — ERC-6538 registry integration (canonical singleton used as deployed) + delegated-registration builders (#181) + ENS

- Tier/area: beta-supporting / chain-adapters. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 85% (requirement weight 20.0).
- Spec: docs/specs/06-erc6538-registry.md (+2026-11-16 continuation); ADR-0018 (Proposed; stale); CONTRACTS_SPEC preamble
- Implementation: packages/chain-adapters/src/registry.ts; packages/chain-adapters/src/registryDelegation.ts; packages/chain-adapters/src/registryEns.ts; packages/chain-adapters/src/abi/erc6538Registry.ts; apps/web/src/lib/registry.ts; apps/web/src/features/registry/RegistryView.tsx
- Tests: packages/chain-adapters/src/registry.test.ts; packages/chain-adapters/src/registry.compat.test.ts; packages/chain-adapters/src/registryDelegation.test.ts; packages/chain-adapters/src/registryEns.test.ts; apps/web/src/features/registry/registry.anvil.test.ts; apps/web/src/features/registry/RegistryView.test.tsx
- Verified working: 
- Missing requirements: per-chain registry codehash pin (needs verified data); on-behalf UI excluded from v1 by design
- Confirmed defects: Info: ADR-0018 stale vs code (registerKeysOnBehalf builders + ENS now exist)
- Missing tests: 
- Security/privacy: publishing permanently links wallet to meta-address; only trust registrant == expected; ENS = RPC-supplied naming data, not identity
- Dependencies: F-DEP-03 registry cells; Overlap B1b F-WEB-14 (registry view); this row = library + anvil reference tests. Blockers: registry presence + codehash per testnet unverified (external)
- External acceptance: No real ENS/registry acceptance on public testnets.
- Related branches/PRs: pr/181@98f77953 #181 nonce + delegated builders; ancestor; pr/60@78be1730 #60 registry meta-address QR export; ancestor
- Strategy: **repair** — Pin codehash once read from canonical deployments; refresh ADR-0018.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-CTR-06 — Gas buffer v2 (spec 13) + invoice v2 seller bufferPolicy (ADR-0024)

- Tier/area: beta-supporting / contracts+invoice-schema+web. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 95% · Verification 80% (requirement weight 18.0).
- Spec: docs/specs/13-gas-buffer-v2.md; ADR-0024 (Proposed); CONTRACTS_SPEC s1,s3
- Implementation: packages/contracts/src/GhostPayRouter.sol; packages/chain-adapters/src/fees.ts; packages/invoice-schema/src/schema.ts; apps/web/src/lib/pay.ts; apps/web/src/views/Pay.tsx; apps/web/src/views/CreateInvoice.tsx
- Tests: packages/contracts/test/GhostPayRouter.t.sol; packages/invoice-schema/src/schema.test.ts; apps/web/src/lib/pay.test.ts; apps/web/src/lib/payExec.test.ts
- Verified working: 
- Missing requirements: fiat buffer estimate; permit+buffer single-call (deferred; CONTRACTS_SPEC + audit first; not counted)
- Confirmed defects: 
- Missing tests: anvil e2e buffered sweep
- Security/privacy: buffer publicly links payer funding to one-time address; no silent refunds
- Dependencies: Overlap B1b F-WEB-05 (gas buffer UI); count effort once. Blockers: 
- External acceptance: No real-chain buffer acceptance.
- Related branches/PRs: pr/27@a4ab45fa #27 gas buffer v2; merged ancestor; pr/68@4fe95fc0 #68 seller buffer policy control; ancestor; origin/ghostpay-*-2026-10-2x (5 recovery snapshots)@- NOT ancestors; ADR-0024/quote.ts/permit.ts variants; archive as evidence
- Strategy: **implement** — Add anvil e2e buffered sweep; fiat estimate once feed verified.
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-DEP-05 — EVM multichain config + ChainAdapter interface (MULTICHAIN_SPEC tier 1, ADR-0016)

- Tier/area: beta-supporting / chain-adapters. Status: **PARTIAL**. Implementation 80% · Verification 75% (requirement weight 14.0).
- Spec: docs/MULTICHAIN_SPEC.md s1,s2,s4; ADR-0016; chain-adapters TODO-VERIFY
- Implementation: packages/chain-adapters/src/adapter.ts; packages/chain-adapters/src/config/chains.ts; packages/chain-adapters/src/config/tokens.ts; packages/chain-adapters/src/quote.ts
- Tests: packages/chain-adapters/src/adapter.test.ts; packages/chain-adapters/src/adapter.deep.test.ts; packages/chain-adapters/src/config.test.ts; packages/chain-adapters/src/quote.test.ts; packages/chain-adapters/src/quote.guards.test.ts; packages/chain-adapters/src/quote.anvil.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: Info CONFIRMED stale docs: chain-adapters README/TODO-VERIFY say FEEDS empty; quote.ts:52 lists 4 testnet feeds
- Missing tests: 
- Security/privacy: no unverified financial data ships; fiat price disabled when feed absent
- Dependencies: . Blockers: chain params + token permit/blacklist cells need provider evidence
- External acceptance: No fork/real-chain token acceptance.
- Related branches/PRs: 
- Strategy: **repair** — Measure chain params on chosen providers; refresh README/TODO-VERIFY.
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-DOC-01 — User docs (docs/user, 20 pages) + guides (docs/guides, 11 pages)

- Tier/area: beta-supporting / docs. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 90% (requirement weight 8.0).
- Spec: 
- Implementation: docs/user/; docs/guides/
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/104@ #104 source-pinned user/dev guides; ancestor?
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-DOC-02 — Developer wiki (docs/wiki, 9 pages)

- Tier/area: beta-supporting / docs. Status: **PARTIAL**. Implementation 60% · Verification 50% (requirement weight 6.0).
- Spec: 
- Implementation: docs/wiki/
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/140@58a47006 #140 open; not ancestor; wiki Home/User/Developer/Codebase-Map differ
- Strategy: **consolidate** — diff #140 wiki files vs cand, merge newer text
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-HOST-03 — Portable hosting kit: package/verify/preview + nginx/container/Tor/I2P profiles

- Tier/area: beta-supporting / hosting. Status: **PARTIAL**. Implementation 80% · Verification 80% (requirement weight 10.0).
- Spec: 
- Implementation: tools/portable-hosting-kit/
- Tests: tools/portable-hosting-kit/test/
- Verified working: 280 pass / 0 fail / 13 skipped
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: ADR-0015 signed releases + legal review
- Related branches/PRs: pr/36@cb917c67 #36 Portable hosting kit; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 13 skipped tests not analysed

### F-HOST-04 — infra/: devnet, integration, proxy, publish (IPFS/Tor), static web Caddy

- Tier/area: beta-supporting / hosting. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 40% (requirement weight 6.0).
- Spec: 
- Implementation: infra/
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: not run locally (docker/anvil/bitcoind absent or shared)

### F-I18N-02 — Locale catalogs: translation completeness and native review

- Tier/area: beta-supporting / i18n. Status: **PARTIAL**. Implementation 60% · Verification 55% (requirement weight 12.0).
- Spec: 
- Implementation: apps/web/locales/{en,es,ar,ja}.json
- Tests: scripts/i18n/check.mjs; apps/web/src/i18n/catalog.test.ts
- Verified working: es/ar/ja structurally complete: 2253/2253 keys
- Missing requirements: 20 of 24 listed languages unshipped; native review for es/ar/ja
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: native-speaker review per locale (human)
- Related branches/PRs: pr/147@c6a90334 #147 closed unmerged 'translate ~860 keys' but ancestor of cand -> content present (now 2253 keys, was ~860 untranslated)
- Strategy: **recover** — trim LANGUAGES to shipped locales or ship catalogs; get native review before removing 'needs review' banner
- Effort (estimate): L [3, 10] engineer-days
- Unverified: quality of machine translations not assessed (cannot read all 3 languages reliably)

### F-I18N-03 — packages/i18n localisation framework (CLI/library) + CLI i18n check

- Tier/area: beta-supporting / i18n. Status: **PARTIAL**. Implementation 60% · Verification 60% (requirement weight 8.0).
- Spec: 
- Implementation: packages/i18n/src/
- Tests: packages/i18n/src/*.test.ts
- Verified working: 
- Missing requirements: web does not consume
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **consolidate** — two parallel i18n stacks (packages/i18n vs apps/web/src/i18n); pick one, retire ux-i18n shim
- Effort (estimate): M [2, 3] engineer-days
- Unverified: 

### F-MER-01 — Merchant billing: subscriptions, schedules, installments, refunds, payouts, CSV

- Tier/area: beta-supporting / merchant. Status: **PARTIAL**. Implementation 85% · Verification 85% (requirement weight 15.0).
- Spec: 
- Implementation: packages/merchant-billing/src/
- Tests: packages/merchant-billing/src/*.test.ts
- Verified working: 275 tests / 10 files pass
- Missing requirements: no web UI; merchant side is CLI/examples/library only
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/130@ #130 horizon regression; ancestor; pr/131@ #131 CSV formula; ancestor
- Strategy: **defer** — optional full-profile; keep as library+CLI, no web UI needed for Sepolia beta
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-MER-02 — Merchant ledger: reconciliation + accounting/tax exports

- Tier/area: beta-supporting / merchant. Status: **PARTIAL**. Implementation 80% · Verification 65% (requirement weight 9.0).
- Spec: 
- Implementation: packages/merchant-ledger/src/
- Tests: packages/merchant-ledger/src/ledger.test.ts
- Verified working: 
- Missing requirements: duplicate logic with apps/web reconciliation (two implementations)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/148@ #148 closed unmerged; fix present in cand? ledger.test passes NaN case - INFERRED
- Strategy: **consolidate** — decide single reconciliation source; web version is the shipped one
- Effort (estimate): M [1, 3] engineer-days
- Unverified: PR #148 closed-unmerged: not verified its NaN fix is byte-identical in cand

### F-MER-03 — Merchant hooks: signed webhooks, payment button/link, POS/NFC payload builders

- Tier/area: beta-supporting / merchant. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: 
- Implementation: packages/merchant-hooks/src/
- Tests: packages/merchant-hooks/src/hooks.test.ts; packages/merchant-hooks/src/webhook-vectors.test.ts
- Verified working: 35 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: raw-byte HMAC before parse; replay window 300s
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/189@ #189 historical CLI/merchant recovery; ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-MER-06 — Merchant examples: checkout, POS terminal, subscription cron, webhook receiver, operations, plugin conformance

- Tier/area: beta-supporting / merchant. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 90% (requirement weight 11.0).
- Spec: 
- Implementation: examples/
- Tests: examples/*/*.test.mjs
- Verified working: node --test of 6 example test sets: 52 pass / 0 fail
- Missing requirements: POS page browser test
- Confirmed defects: 
- Missing tests: webhook-receiver/subscription-cron/merchant-operations/plugin-conformance not in CI (only cli-operator path trigger for subscription-cron)
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **repair** — add example tests to CI; browser smoke for POS
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-NET-01 — Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP framing + browser fetch transport

- Tier/area: beta-supporting / net. Status: **PARTIAL**. Implementation 80% · Verification 65% (requirement weight 11.0).
- Spec: docs/specs/10-feature5-stage1-private-scanning.md; docs/remote/privacy-specs/network-privacy.md
- Implementation: packages/net-transport/src/*; apps/web/src/lib/scanPrivacy.ts
- Tests: packages/net-transport/src/*.test.ts (4); apps/web/src/lib/scanPrivacy.i18n.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Real Tor/onion route not exercised.
- Related branches/PRs: 
- Strategy: **consolidate** — net-transport: browser subpath wired into web scanPrivacy (user-selected; default direct, never automatic). Node SOCKS5h agent + OHTTP are node/PoC only (browser can't open SOCKS). OHTTP needs gateway/relay operators.
- Effort (estimate): M [2, 5] engineer-days
- Unverified: 

### F-NET-02 — Onion URL canonicalization / v3 checksum, reject escaped authorities (PR #122/#134)

- Tier/area: beta-supporting / net. Status: **VERIFIED_COMPLETE** (reported IMPLEMENTED_UNVERIFIED, normalized by rubric). Implementation 100% · Verification 100% (requirement weight 6.0).
- Spec: 
- Implementation: packages/net-transport/src/{onion,url,proxyUrl}.ts
- Tests: packages/net-transport/src/core.test.ts; packages/net-transport/src/browser.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: origin/chatgpt/zero-codex/onion-canonical-host-20261111@72dde82d #122 NOT an ancestor of 7a620ff1: 0 unique / 2 patch-equivalent commits (git cherry), class C; origin/chatgpt/ghostpay-onion-canonical-port-20261112@8277879e #134 port of #122; ancestor of 7a620ff1
- Strategy: **none** — onion.ts v3 checksum + url.ts. #122 (72dde82d) is patch-equivalent to the candidate; its port #134 (8277879e) is an ancestor => landed. net-transport 149/149 pass.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-OPS-03 — sandbox / test mode: deterministic mock chain, faucet, clock, fault injection

- Tier/area: beta-supporting / ops. Status: **PARTIAL**. Implementation 70% · Verification 70% (requirement weight 7.0).
- Spec: 
- Implementation: packages/sandbox/src/
- Tests: packages/sandbox/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no network, in-memory
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-PROTO-05 — Announcer spam & anonymity-set bounds (spec 05)

- Tier/area: beta-supporting / chain-adapters+web scanner. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 80% (requirement weight 17.0).
- Spec: spec 05 sections 2A-2E, 5, 6, 7
- Implementation: packages/chain-adapters/src/logs.ts; apps/web/src/lib/scanSpam.ts; apps/web/src/lib/scanClient.ts; apps/web/src/lib/scannerCore.ts; apps/web/src/views/Settings.tsx; docs/user/seller-privacy.md
- Tests: packages/chain-adapters/src/scanHardening.test.ts; apps/web/src/lib/scanSpam.test.ts; apps/web/src/lib/scanClient.test.ts; apps/web/src/lib/scannerCore.spam.nocov.test.ts; apps/web/src/lib/scannerCore.bench.nocov.test.ts; apps/web/src/views/Settings.test.tsx
- Verified working: 
- Missing requirements: Pay amount-hygiene hint; verified public endpoint list (docs)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: telemetry computed locally, never sent; anonymity level is a coarse heuristic: no measured anonymity claim; same-token estimate is an extra opt-in RPC request (disclosed)
- Dependencies: web scanner (B1b) owns UI; library part here; Overlap B1b F-WEB-06 (scan UI): web lanes counted here for spec 05; count once. Blockers: 
- External acceptance: Thresholds (20/200, 25 %, 2,000 blocks) UNVERIFIED against real chain volume.
- Related branches/PRs: pr/70@d9fe8b4e #70 A5 lanes/budget + 4 cursor fixes; ancestor; pr/113@0641d41a #113 spec 05 acceptance; ancestor
- Strategy: **implement** — Add Pay amount hint; keep endpoint list absent until verified.
- Effort (estimate): S [1, 2] engineer-days
- Unverified: reference-laptop CPU numbers (dev container only)

### F-PROTO-09 — Strict payment URI builders/parsers (EIP-681, ERC-3770, BIP-21/321+sp, Solana Pay, tron:, invoice link)

- Tier/area: beta-supporting / payment-uri. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 17.0).
- Spec: ADR-0022 (Proposed)
- Implementation: packages/payment-uri/src/query.ts; packages/payment-uri/src/decimal.ts; packages/payment-uri/src/addresses.ts; packages/payment-uri/src/eip681.ts; packages/payment-uri/src/eip3770.ts; packages/payment-uri/src/bitcoin.ts; packages/payment-uri/src/solana.ts; packages/payment-uri/src/tron.ts (+3 more)
- Tests: packages/payment-uri/src/vectors.test.ts; packages/payment-uri/src/negative.test.ts; packages/payment-uri/src/fuzz.test.ts; apps/web/src/components/PaymentRequestQr.test.tsx; apps/web/src/lib/qrClassify.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: attacker-controlled URIs; strictness uniform; tron: form GhostPay-only nonstandard
- Dependencies: . Blockers: 
- External acceptance: Not tested against real wallet URI handlers; ADR-0022 Proposed; not audited.
- Related branches/PRs: 
- Strategy: **none** — Complete for beta; wallet interop external.
- Effort (estimate): S [0, 0.5] engineer-days
- Unverified: 

### F-PROTO-10 — QR exchange: GPQ1 multipart, assembler, camera/readers, generation, seller/settings payloads

- Tier/area: beta-supporting / qr-exchange. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 18.0).
- Spec: ADR-0021 (proposed); qr-exchange DEVIATIONS
- Implementation: packages/qr-exchange/src/multipart.ts; packages/qr-exchange/src/assembler.ts; packages/qr-exchange/src/camera.ts; packages/qr-exchange/src/readers.ts; packages/qr-exchange/src/generate.ts; packages/qr-exchange/src/seller.ts; packages/qr-exchange/src/settings-exchange.ts
- Tests: packages/qr-exchange/src/*.test.ts (7 files); apps/web/src/components/CameraImporter.*.test.tsx; apps/web/e2e/qr-camera.spec.ts; apps/web/e2e/qr-camera-multipart.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: CRC/SHA prefix = integrity, not authenticity: payload must carry own signature/encryption; session id leaks 64 bits of SHA-256(payload)
- Dependencies: Overlap B1b F-WEB-24 (QR UI); this row = package. Blockers: 
- External acceptance: Physical cameras, glare, iOS Safari/Android/Firefox permissions untested (DEVIATIONS 2).
- Related branches/PRs: pr/117@1e4d19f1 #117 QR completion; ancestor; pr/60@78be1730 #60 seller pairing + registry QR export; ancestor; pr/95@- #95 shared QR codec; ancestor
- Strategy: **none** — Code complete; device acceptance external. jsQR unmaintained (replaceable).
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-WEB-05 — Gas buffer UI: v1 payer buffer (lean+full) and v2 seller policy (full)

- Tier/area: beta-supporting / web/pay \| profile: v1 payer buffer lean+full; v2 policy full only. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 75% (requirement weight 12.0).
- Spec: docs/specs/13-gas-buffer-v2.md; ADR-0024 (code comments Pay.tsx:475,739 cite ADR-0023, which ADR-LOG.md:96 assigns to policy recovery: numbering drift); docs/handoffs/SUPPORTED_INVOICE_BOUNDARY_2026-11-02.md
- Implementation: apps/web/src/views/Pay.tsx; apps/web/src/views/CreateInvoice.tsx; apps/web/src/lib/pay.ts; apps/web/src/lib/payExec.ts; apps/web/src/lib/opStackFee.ts; apps/web/src/lib/txGuard.ts
- Tests: apps/web/src/views/Pay.test.tsx; apps/web/src/views/CreateInvoice.buffer.test.tsx; apps/web/src/lib/pay.test.ts; apps/web/src/lib/payExec.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: Low: docs claim lean has no payer gas buffer; lean Pay offers v1 'Add a gas buffer for the seller's sweep' (Pay.tsx:1190 no supportedOnly gate). CONFIRMED by B1b probe test (private worktree, 2/2 pass lean+full)
- Missing tests: lean Pay payer-buffer test (unit) and real-chain ERC-20 buffer journey
- Security/privacy: buffer publicly links payment, one-time address and buffer: disclosed; payERC20WithBuffer skips independent tx-review decode (txGuard.ts:175-181 'skipped-buffer', INTENDED per haiku L-04); preview==calldata check remains
- Dependencies: F-WEB-25 tx-review (excluded method); verified native/USD feeds for display (spec 13). Blockers: 
- External acceptance: Real OP-stack L1 fee and ERC-20 buffer sweep unqualified
- Related branches/PRs: 
- Strategy: **repair** — Fix Pages docs (or gate v1 buffer in lean by decision); add lean payer-buffer test; qualify with allowlisted ERC-20 on Sepolia.
- Effort (estimate): S [0.5, 1.5] engineer-days
- Unverified: 

### F-WEB-07 — Scan privacy modes (spec 10 UI: transport, private-required, windows, indexer, disclosures)

- Tier/area: beta-supporting / web/scan \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED** (reported VERIFIED_COMPLETE, normalized by rubric). Implementation 90% · Verification 90% (requirement weight 17.0).
- Spec: docs/specs/10-feature5-stage1-private-scanning.md
- Implementation: apps/web/src/lib/scanPrivacy.ts; apps/web/src/views/Settings.tsx; apps/web/src/views/Scan.tsx; apps/web/src/views/Sweep.tsx; apps/web/src/lib/jitter.ts
- Tests: apps/web/src/lib/scanPrivacy.test.ts; apps/web/src/lib/scanPrivacy.clients.test.ts; apps/web/src/lib/scanPrivacy.transport.test.ts; apps/web/src/views/Scan.privacy.test.tsx; apps/web/src/views/Settings.scanPrivacy.test.tsx; apps/web/src/views/Sweep.privacy.test.tsx; apps/web/src/privacyInvariants.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no silent downgrade from private path; never claims anonymity; Tor not attestable from page
- Dependencies: F-WEB-08 RPC config. Blockers: 
- External acceptance: Real Tor Browser / local SOCKS-forwarder route and onion RPC unqualified
- Related branches/PRs: 
- Strategy: **repair** — Fix TB-02: allow http loopback in connect-src for the full/self-host profile (or remove local-proxy from lean UI/docs) and add an e2e under the real CSP. Effort is an H1 ESTIMATE.
- Effort (estimate): S [0.5, 2] engineer-days
- Unverified: private-required covers scan/sweep only; Pay/Create/Registry/Home manifest checks use Settings RPC directly (disclosed rows; Team D/E to confirm wording)

### F-WEB-12 — Relayer-assisted sweep and permit refusal messages

- Tier/area: beta-supporting / web/sweep \| profile: lean+full (optional, user relayer URL). Status: **IMPLEMENTED_UNVERIFIED** — security hold: SEC-03: relayer-assisted sweep signs without step-up in vault-less sessions. Implementation 100% · Verification 95% (requirement weight 17.0).
- Spec: docs/specs/04-permit-griefing-fallback.md; docs/APP_AND_RELAYER_SPEC.md S1 view 6, S3
- Implementation: apps/web/src/lib/sweep.ts; apps/web/src/lib/relayerClient.ts; apps/web/src/views/Sweep.tsx
- Tests: apps/web/src/lib/sweep.test.ts; apps/web/src/lib/relayerClient.test.ts; apps/web/src/lib/relayerContract.test.ts; apps/web/src/views/Sweep.test.tsx
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: relayer sees destination/amount (disclosed); no cookies/referrer/redirects (privacyInvariants)
- Dependencies: apps/relayer (B1a/other); permit-capable allowlisted token. Blockers: 
- External acceptance: No relayer operated for Pages; real relayer + browser untested
- Related branches/PRs: pr/158@9a84764e #158 bounded relayer replies; ancestor
- Strategy: **none** — Optional: add browser e2e against anvil relayer.
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-WEB-13 — Seller device pairing (public config QR export/preview)

- Tier/area: beta-supporting / web/seller \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 10.0).
- Spec: ADR-0021
- Implementation: apps/web/src/views/SellerPairing.tsx; apps/web/src/lib/sellerPairing.ts; packages/qr-exchange (B1a)
- Tests: apps/web/src/views/SellerPairing.test.tsx; apps/web/src/lib/sellerPairing.test.ts; apps/web/e2e/sellerpairing.spec.ts; apps/web/e2e/qr-camera.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: public data only; device QR kind labelled
- Dependencies: . Blockers: 
- External acceptance: Real phone cameras unqualified
- Related branches/PRs: 
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-14 — ERC-6538 registry view (publish/clear/lookup/ENS/export)

- Tier/area: beta-supporting / web/registry \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 95% (requirement weight 15.0).
- Spec: docs/specs/06-erc6538-registry.md; ADR-0018
- Implementation: apps/web/src/features/registry/RegistryView.tsx; apps/web/src/lib/registry.ts; packages/chain-adapters/src/registry*.ts
- Tests: apps/web/src/features/registry/RegistryView.test.tsx; apps/web/src/features/registry/RegistryView.export.test.tsx; apps/web/src/views/RegistryView.route.test.tsx; apps/web/src/lib/registry.test.ts; apps/web/src/features/registry/registry.anvil.test.ts
- Verified working: 
- Missing requirements: on-behalf (delegated) registration UI intentionally excluded from v1
- Confirmed defects: 
- Missing tests: Playwright publish/clear confirmation and egress
- Security/privacy: publishing permanently links wallet to meta-address (warned)
- Dependencies: . Blockers: 
- External acceptance: Real wallet/ENS and per-chain registry deployment pins unverified
- Related branches/PRs: pr/181@98f77953 #181 delegation helpers (library only); ancestor
- Strategy: **none** — Optional Playwright confirmation/egress test.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-20 — Settings: preferences, device-settings exchange (opt-in sections), pinned signers

- Tier/area: beta-supporting / web/settings \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 10.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 view 7; ADR-0021 (device settings v2)
- Implementation: apps/web/src/views/Settings.tsx; apps/web/src/lib/settings.ts; apps/web/src/lib/settingsExchange.ts; packages/qr-exchange (B1a)
- Tests: apps/web/src/views/Settings.test.tsx; apps/web/src/views/Settings.exchange.test.tsx; apps/web/src/views/Settings.race.test.tsx; apps/web/src/lib/settings.test.ts; apps/web/src/lib/settingsExchange.test.ts
- Verified working: 
- Missing requirements: No exchange-rate / fiat-display opt-in exists (brief lead): 'exchange' = device settings transfer; fiat only via signed fiat_quote at pay time (F-WEB-02)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: settings are non-secret, plain text; endpoints disclosed when exported
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-WEB-23 — Home / About / help pages / contextual help (lost-click fix)

- Tier/area: beta-supporting / web/info \| profile: lean+full. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 85% (requirement weight 10.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md S1 views 1, 8
- Implementation: apps/web/src/views/Home.tsx; apps/web/src/views/About.tsx; apps/web/src/components/ContextHelp.tsx; apps/web/src/lib/release.ts; apps/web/help.html; apps/web/privacy.html; apps/web/public/help.css
- Tests: apps/web/src/views/About.test.tsx; apps/web/src/components/ContextHelp.test.tsx; apps/web/src/lib/release.test.ts; apps/web/e2e/contextual-help.spec.ts; apps/web/e2e/static-help.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: release hash labelled self-attested (audit S3-04)
- Dependencies: . Blockers: 
- External acceptance: Human copy/translation review (B2)
- Related branches/PRs: candidate commits af32d7f7/86b6e9e5/4a3d47d8@4a3d47d8 #203 ContextHelp outside-dismiss on click; root cause of #202 reimport e2e timeout
- Strategy: **defer** — Human copy/claims review only (B2 owns a11y/i18n).
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-24 — QR display and camera import UI (kinds, warnings, multipart)

- Tier/area: beta-supporting / web/qr \| profile: lean+full. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: ADR-0021; docs/qr/*
- Implementation: apps/web/src/components/QrFrame.tsx; apps/web/src/components/QrView.tsx; apps/web/src/components/CameraImporter.tsx; apps/web/src/lib/qr.ts; apps/web/src/lib/qrKinds.ts; apps/web/src/lib/qrClassify.ts; apps/web/src/lib/qrMultipart.ts; apps/web/src/lib/qrPayload.ts (+1 more)
- Tests: apps/web/src/components/QrFrame.test.tsx; apps/web/src/components/QrFrame.security.test.tsx; apps/web/src/components/QrFrame.largeWarning.test.tsx; apps/web/src/components/CameraImporter.lifecycle.test.tsx; apps/web/src/components/CameraImporter.multipart.test.tsx; apps/web/src/lib/qrClassify.fuzz.test.ts; apps/web/src/lib/qrKinds.test.ts; apps/web/e2e/qr-camera.spec.ts (+1 more)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: packages/qr-exchange (B1a). Blockers: 
- External acceptance: Physical cameras / phones unqualified (virtual camera only)
- Related branches/PRs: pr/162@26f83ccd #162 bearer QR test; only comment wording differs -> superseded by #156 81fd4c03
- Strategy: **none** — Complete.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-BTC-01 — BIP-352 silent payments: keys, addresses, sender derive, receive scan, spend (full-profile web)

- Tier/area: full-profile / btc. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 100% · Verification 80% (requirement weight 13.0).
- Spec: docs/specs/11-bip352-wallet-hardening.md; docs/specs/12-bip352-light-client-scanning.md; docs/MULTICHAIN_SPEC.md s3
- Implementation: packages/btc-silent-payments/src/{address,keys,sender,receiver,spend,tx,labels,uri,inputs,policy}.ts; apps/web/src/features/btc/{BtcView.tsx,scan.ts,sweep.ts,wallet.ts}
- Tests: packages/btc-silent-payments/src/vectors.test.ts; packages/btc-silent-payments/src/spend-vectors.test.ts; packages/btc-silent-payments/src/spend-regtest.test.ts; apps/web/src/features/btc/BtcView.test.tsx; apps/web/src/features/btc/regtest.e2e.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: scan key never in requests (modes A/B); mode C hosted scan absent unless ADR; never claim anonymity
- Dependencies: . Blockers: 
- External acceptance: Real bitcoind/regtest/signet + physical device acceptance unperformed (spec 12 banner).
- Related branches/PRs: PR #113 hard-lane closure: BTC local spend tracking + wallet policy (open)@ #113 spec 11; not independently diffed (UNVERIFIED if in candidate); PR #30 remaining waves: embed, private scanning, policy, BTC (open)@ #30
- Strategy: **consolidate** — Real, wired in full profile (App.tsx 'btc' view; absent from AppLean). Package has BIP-352 official vectors (vectors.test.ts) + regtest-mocked spend. Needs real-node/regtest acceptance + PR #113 local spend tracking verdict.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: whether PR #113 content is fully in candidate; regtest e2e is mocked, not real bitcoind (no bitcoind installed)

### F-BTC-02 — BTC header-chain validation, persistence, scan anchoring (A4 PR #74)

- Tier/area: full-profile / btc. Status: **VERIFIED_COMPLETE** (reported IMPLEMENTED_UNVERIFIED, normalized by rubric). Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: docs/specs/12-bip352-light-client-scanning.md
- Implementation: packages/btc-silent-payments/src/{header,headerchain,merkleProof,witness}.ts; packages/btc-silent-payments/src/scan/headersync.ts; apps/web/src/features/btc/{headers.ts,inclusion.ts}
- Tests: packages/btc-silent-payments/src/header.test.ts; packages/btc-silent-payments/src/headerchain.test.ts; packages/btc-silent-payments/src/headerchain.memory.test.ts; packages/btc-silent-payments/src/merkleProof.test.ts; apps/web/src/features/btc/headers.test.ts; apps/web/src/features/btc/BtcView.headers.test.tsx
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Real Esplora/mainnet header sync unperformed.
- Related branches/PRs: PR #74 A4 header chain (open)@ #74 candidate contains header code (VERIFIED files exist); PR head not diffed
- Strategy: **none** — Complete by rubric (4/4 requirements implemented and tested). Real Esplora/mainnet sync stays external acceptance; PR #74 delta stays under unverified.
- Effort (estimate): S [1, 3] engineer-days
- Unverified: PR #74 vs candidate delta

### F-BTC-03 — BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node Esplora, 2-oracle cross-check, worker

- Tier/area: full-profile / btc. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 80% (requirement weight 11.0).
- Spec: docs/specs/12; docs/handoffs/agents/BLINDBIT_GRPC_HANDOFF.md; TEAM_H_*_UNIFIED.md
- Implementation: packages/btc-silent-payments/src/scan/*; apps/web/src/features/btc/{oracleSource,oracleBridge,scanWorker*,scanStore}.ts
- Tests: packages/btc-silent-payments/src/scan/blindbitGrpc.test.ts; apps/web/src/features/btc/oracleWorker.test.ts; apps/web/src/features/btc/scan.resume.test.ts; apps/web/src/features/btc/BtcView.oracle.test.tsx
- Verified working: 
- Missing requirements: mode C (intended absent)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: oracle sees IP + block range (disclosed); oracle collusion may omit payments
- Dependencies: . Blockers: 
- External acceptance: Real BlindBit/proxy deployment + device acceptance unperformed.
- Related branches/PRs: 
- Strategy: **consolidate** — scan/{blindbit,blindbitGrpc,grpcWebUnary,scanner,state}.ts + web oracleSource/scanWorker. Handoffs TEAM_H_*. Needs deployed BlindBit server compat (fixtures only); optional external oracle = operator dependency, default Esplora-only/no oracle URL.
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-DOC-03 — Operator docs (docs/operators, 17 pages): runbooks, relayer, monitoring, release, rollback

- Tier/area: full-profile / docs. Status: **PARTIAL**. Implementation 50% · Verification 50% (requirement weight 6.0).
- Spec: 
- Implementation: docs/operators/
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: operator dry-run
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-HOST-01 — Self-host recipe: docker-compose + nginx + relayer image + selfhost.sh

- Tier/area: full-profile / hosting. Status: **PARTIAL**. Implementation 70% · Verification 45% (requirement weight 13.0).
- Spec: 
- Implementation: deploy/; apps/relayer/Dockerfile
- Tests: deploy/selftest.sh
- Verified working: selftest.sh ok
- Missing requirements: 
- Confirmed defects: 
- Missing tests: compose config validation in CI (docker compose config); header conformance test (infra/proxy/check-headers.sh exists)
- Security/privacy: no secrets in repo; API not published; connect-src https: wss: required for user-chosen RPC; document leakage
- Dependencies: . Blockers: 
- External acceptance: real host deploy by operator
- Related branches/PRs: 
- Strategy: **repair** — pin digests; add `docker compose config` + header check to CI
- Effort (estimate): S [1, 2] engineer-days
- Unverified: image builds, container permissions

### F-HOST-02 — Tor onion service for the static bundle

- Tier/area: full-profile / hosting. Status: **PARTIAL**. Implementation 60% · Verification 45% (requirement weight 8.0).
- Spec: 
- Implementation: deploy/tor/; deploy/TOR.md; tools/portable-hosting-kit (tor profile)
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **repair** — onion smoke in hosting-kit CI
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-INT-01 — WooCommerce gateway plugin (payment-link redirect flow)

- Tier/area: full-profile / integrations. Status: **PARTIAL**. Implementation 85% · Verification 75% (requirement weight 12.0).
- Spec: 
- Implementation: integrations/woocommerce/ghostpay-for-woocommerce/
- Tests: integrations/woocommerce/tests/run.php
- Verified working: php -l all files clean; 177 assertions pass
- Missing requirements: Blocks checkout; refunds
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: live shop + real invoice service + browser checkout not qualified
- Related branches/PRs: 
- Strategy: **defer** — REAL code, not stub; keep as optional merchant integration
- Effort (estimate): S [0, 1] engineer-days
- Unverified: platform 28-check harness (docs/companion-merchant/shop-acceptance-20261109.md) not rerun

### F-INT-02 — PrestaShop module

- Tier/area: full-profile / integrations. Status: **PARTIAL**. Implementation 60% · Verification 60% (requirement weight 10.0).
- Spec: 
- Implementation: integrations/prestashop/ghostpay/
- Tests: integrations/prestashop/tests/run.php
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: real PrestaShop install/validator/browser not done
- Related branches/PRs: 
- Strategy: **defer** — real module, shim-qualified only
- Effort (estimate): S [0, 1] engineer-days
- Unverified: behaviour vs real PrestaShop 8.1.7 is read from source only

### F-KEY-05 — Tag archive backup/restore + combined BackupPanel (spec 08)

- Tier/area: full-profile / keys/archive \| profile: local tags lean+full; archive/rotation/BackupPanel full only (lean excluded with build proof). Status: **IMPLEMENTED_UNVERIFIED** (reported PARTIAL, normalized by rubric). Implementation 90% · Verification 90% (requirement weight 21.0).
- Spec: docs/specs/08-feature4-archive-key-rotation.md; docs/handoffs/LEAN_RELEASE_SCOPE.md (later-preserved)
- Implementation: apps/web/src/components/TagArchive.tsx; apps/web/src/components/BackupPanel.tsx; apps/web/src/lib/tags.ts; apps/web/src/lib/tagArchive.ts; apps/web/src/lib/idbStore.ts; packages/ux-vault/src/tag-archive-portable.ts
- Tests: apps/web/src/components/TagArchive.test.tsx; apps/web/src/components/TagArchive.atomicity.test.tsx; apps/web/src/components/TagArchive.retry.test.tsx; apps/web/src/lib/tagArchive.test.ts; apps/web/src/lib/tagArchive.vectors.test.ts; apps/web/src/lib/tagArchive.fuzz.nocov.test.ts; apps/web/src/lib/tags.test.ts; apps/web/src/lib/tagsConcurrency.test.ts (+4 more)
- Verified working: 
- Missing requirements: step-up/re-auth before tag archive export (spec 08)
- Confirmed defects: Low: tag archive export lacks re-auth step-up required by spec 08 S2 [INFERRED from code read; full-profile only]
- Missing tests: 
- Security/privacy: archive excludes viewing key; lookup tokens regenerated on import; rotation does not protect past exposure (warned)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/193@8aed22ad #193 closed; blocked-download test superseded by b3e4051e + TagArchive.test.tsx:56
- Strategy: **repair** — Add authorizeKeyExport-style step-up to archive export or record owner waiver in spec 08.
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-KEY-06 — Archive key rotation (spec 08 rotateKeys)

- Tier/area: full-profile / keys/archive \| profile: full only. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 12.0).
- Spec: docs/specs/08-feature4-archive-key-rotation.md
- Implementation: apps/web/src/lib/tags.ts; apps/web/src/components/TagArchive.tsx
- Tests: apps/web/src/lib/tagArchive.test.ts; apps/web/src/lib/tagsConcurrency.test.ts; apps/web/src/components/TagArchive.test.tsx; apps/web/scripts/test-tags-concurrency.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: rotation zeroizes supplied viewing key copy (tagsConcurrency.test.ts:64)
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — Complete (design deviation documented).
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-MER-04 — Merchant m-of-n multisig approvals

- Tier/area: full-profile / merchant. Status: **PARTIAL**. Implementation 60% · Verification 60% (requirement weight 12.0).
- Spec: 
- Implementation: packages/merchant-multisig/src/
- Tests: packages/merchant-multisig/src/*.test.ts
- Verified working: 92 tests pass
- Missing requirements: no execution path; no UI
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — approval logic only; keep as optional library
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-MER-05 — Web merchant profile, templates, printable bill, reconciliation UI (cross-ref B1b)

- Tier/area: full-profile / merchant. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: docs/specs/14-embed-merchant-profile.md
- Implementation: apps/web/src/components/MerchantProfilePanel.tsx; apps/web/src/lib/merchantIdentity.ts; apps/web/src/lib/reconciliationLedger.ts
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: spec 14 acceptance: ADR-0002/0015 signer pinning+hosting gates
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: owned by B1b; B2 did not rerun web e2e (shared dist/build)

### F-OPS-01 — ops-monitor: read-only chain anomaly probes + bounded release-asset streaming

- Tier/area: full-profile / ops. Status: **PARTIAL**. Implementation 80% · Verification 75% (requirement weight 11.0).
- Spec: 
- Implementation: packages/ops-monitor/src/
- Tests: packages/ops-monitor/src/*.test.ts
- Verified working: 113 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: read-only; no keys
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/184@73371b57 #184 open; ancestor (content in cand); pr/106@5280569b #106 open; ancestor; pr/188@d2e8689b #188 merged
- Strategy: **repair** — add live-RPC smoke on Sepolia; not wired to any app
- Effort (estimate): S [1, 2] engineer-days
- Unverified: 

### F-POOL-04 — Pool withdrawal relayer service (node:http)

- Tier/area: full-profile / pool. Status: **EXPERIMENTAL**. Implementation 100% · Verification 60% (requirement weight 5.0).
- Spec: 
- Implementation: packages/pool-relayer/src/*
- Tests: packages/pool-relayer/src/*.test.ts (7)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: hot key mode-600 file; no custody of user funds
- Dependencies: . Blockers: requires operator-run server + hot gas key (constraint 2: optional operator only)
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Server process w/ hot key (relayer-hiding of gas payer). Optional operator component, never beta-core; user can self-submit instead. Anvil e2e needs anvil (not installed -> skipped).
- Effort (estimate): L [5, 10] engineer-days
- Unverified: 

### F-PROTO-11 — Scan-source abstraction (range / indexer-tor / pir2 / light-client / quorum)

- Tier/area: full-profile / scan-source. Status: **EXPERIMENTAL**. Implementation 70% · Verification 70% (requirement weight 17.0).
- Spec: docs/remote/privacy-specs/network-privacy.md Selector C; spec 10; metadata-hardening MH-SCAN-1..3
- Implementation: packages/scan-source/src/range.ts; packages/scan-source/src/indexer.ts; packages/scan-source/src/pir2.ts; packages/scan-source/src/light.ts; packages/scan-source/src/quorum.ts; packages/scan-source/src/create.ts; packages/scan-source/src/claims.ts; packages/scan-source/src/guard.ts
- Tests: packages/scan-source/src/*.test.ts (6 files)
- Verified working: 
- Missing requirements: real indexer server / PIR operators / Helios backends absent (README Unverified)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: range mode leaks IP/range/timing; indexer sees padded range, can omit records; pir2 needs non-colluding operators
- Dependencies: . Blockers: testnet-only PoC by design; real backends need operators
- External acceptance: Everything runs against in-memory fakes; no Tor/indexer/PIR/Helios used.
- Related branches/PRs: pr/30@7373172d #30 private scanning wave; ancestor
- Strategy: **defer** — Full-profile only; keep indexer path, defer others until a backend exists.
- Effort (estimate): L [3, 10] engineer-days
- Unverified: 

### F-PROTO-12 — SDK programmatic API (@ghostpay/sdk)

- Tier/area: full-profile / sdk. Status: **PARTIAL**. Implementation 45% · Verification 45% (requirement weight 16.0).
- Spec: docs/remote/usability/specs/typed-sdk.md R1-R6; docs/remote/usability/wiring/sdk.md; docs/remote/usability/openapi/ghostpay-merchant-api.yaml
- Implementation: packages/sdk/src/client.ts; packages/sdk/src/builder.ts; packages/sdk/src/verify.ts; packages/sdk/src/merchant.ts; packages/sdk/src/react.ts; packages/sdk/src/schemas.ts; packages/sdk/schema/*.json
- Tests: packages/sdk/src/*.test.ts (8 files)
- Verified working: 
- Missing requirements: publish/licence/README; merchant API server (optional self-host) absent; web pay page not using verifyFragment (wiring plan item 1)
- Confirmed defects: Info: no README/API doc for @ghostpay/sdk (ls packages/sdk)
- Missing tests: 
- Security/privacy: fragment never sent to merchant API; no fetch on build/sign/verify (tested)
- Dependencies: F-PROTO-06/07. Blockers: owner decision on public SDK + licence
- External acceptance: No external consumer.
- Related branches/PRs: 
- Strategy: **defer** — Not needed for static beta; keep tested library; package/docs when an integrator exists.
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-RLY-01 — Optional relayer: quote/sweep API, fee policy, permit failure classes

- Tier/area: full-profile / relayer. Status: **IMPLEMENTED_UNVERIFIED**. Implementation 95% · Verification 80% (requirement weight 14.0).
- Spec: docs/APP_AND_RELAYER_SPEC.md; docs/FEE_SCHEDULE.md; docs/specs/04-permit-griefing-fallback.md
- Implementation: apps/relayer/src/service.ts; apps/relayer/src/server.ts; apps/relayer/src/quoteToken.ts; apps/relayer/src/pricing.ts
- Tests: apps/relayer/src/api.test.ts; apps/relayer/src/e2e.anvil.test.ts; apps/relayer/src/stress.test.ts
- Verified working: apps/relayer vitest: 17 files pass, 470 pass / 5 skipped (anvil e2e)
- Missing requirements: fee bump / cancel stuck tx (DEVIATIONS 7); oracle-based pricing; manifest-verified fee feeds for mainnet
- Confirmed defects: 
- Missing tests: anvil e2e not run locally
- Security/privacy: contract guarantees destination/amount/fee; relayer cannot redirect (noncustodial); hot key must be funded conservatively; unknown keys rejected, 16KiB body cap
- Dependencies: . Blockers: 
- External acceptance: real testnet deployment + funded hot-key run not done
- Related branches/PRs: pr/118@97b919c9 #118 restart-safe budget+nonce journal, permit classes; ancestor; pr/40@63994db6 #40 secret fd-bind; superseded: packages/relayer-guard/src/secrets.ts uses openSync+O_NOFOLLOW+fstat; pr/17@e96cee1a #17 claude/laughing-bardeen 104 commits, old line; 64 files differ - review before deleting; pr/39@1d28f24d #39 D3 deadline fix present in cand service.ts:762
- Strategy: **none** — complete for testnet self-host; mainnet gated
- Effort (estimate): S [0, 1] engineer-days
- Unverified: anvil e2e (5 tests) not run locally: forge/anvil absent

### F-RLY-02 — Relayer restart-safe daily budget + nonce journal (state lock)

- Tier/area: full-profile / relayer. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 9.0).
- Spec: 
- Implementation: apps/relayer/src/stateStore.ts; apps/relayer/src/budget.ts; apps/relayer/src/lane.ts
- Tests: apps/relayer/src/stateStore.test.ts; apps/relayer/src/restart.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/118@97b919c9 #118 ancestor
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: multi-host/network filesystem locking not verified

### F-RLY-03 — Relayer private metrics listener (PR #185) and signed alerts

- Tier/area: full-profile / relayer. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 95% (requirement weight 9.0).
- Spec: docs/specs/07-relayer-metrics-observability.md; docs/operators/relayer-monitoring.md
- Implementation: apps/relayer/src/metricsServer.ts; apps/relayer/src/metrics.ts; apps/relayer/src/alerts.ts; apps/relayer/src/rejectSpike.ts; apps/relayer/src/revertRate.ts
- Tests: apps/relayer/src/metrics.observability.test.ts; apps/relayer/src/alerts.lifecycle.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: metrics bound to loopback by default; SSRF guard on alert URL
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/185@c738f96e #185 open draft PR; head is ANCESTOR of cand -> content in candidate; PR can be closed once #203 lands
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-RLY-04 — relayer-guard: breaker, trusted-proxy IP, /64 buckets, limiter, loss budget, challenge

- Tier/area: full-profile / relayer. Status: **PARTIAL**. Implementation 60% · Verification 60% (requirement weight 8.0).
- Spec: 
- Implementation: packages/relayer-guard/src/
- Tests: packages/relayer-guard/src/*.test.ts
- Verified working: 
- Missing requirements: challenge-bank/challenge unused (bot-cost only, not a security boundary)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: abuse controls only; no custody
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: real proxy topology

### F-SOL-01 — Solana dual-key ed25519 stealth (solana-stealth) wired to web full profile

- Tier/area: full-profile / solana. Status: **EXPERIMENTAL**. Implementation 60% · Verification 50% (requirement weight 12.0).
- Spec: docs/adr/ADR-0017-solana-stealth.md
- Implementation: packages/solana-stealth/src/*; apps/web/src/features/solana/*
- Tests: packages/solana-stealth/src/*.test.ts; apps/web/src/features/solana/SolanaView.test.tsx; apps/web/src/features/solana/chain.hardening.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Devnet RPC e2e + audit unperformed.
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor)
- Strategy: **consolidate** — ADR-0017. Wired: web SolanaView, devnet/testnet scoped. Unaudited. Fixture test-vectors/solana-stealth.json. Not interoperable with chain-solana (different formats).
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-TRX-01 — Tron stealth adapter (tron-adapter) wired to web full profile

- Tier/area: full-profile / tron. Status: **EXPERIMENTAL**. Implementation 70% · Verification 60% (requirement weight 10.0).
- Spec: docs/adr/ADR-0019*
- Implementation: packages/tron-adapter/src/*; apps/web/src/features/tron/*
- Tests: packages/tron-adapter/src/*.test.ts (8); apps/web/src/features/tron/TronView.test.tsx
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Nile/Shasta e2e + audit unperformed.
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor)
- Strategy: **consolidate** — ADR-0019. Wired in web TronView; testnet-scoped; unaudited; secp256k1 stealth, TRC-20 txs, protobuf. Meta tag st:trx:0x.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-WEB-02 — Fiat-quote invoices and price-feed UI (spec 03)

- Tier/area: full-profile / web/invoice \| profile: full only (lean refuses). Status: **IMPLEMENTED_UNVERIFIED**. Implementation 90% · Verification 80% (requirement weight 18.0).
- Spec: docs/specs/03-fiat-price-feeds.md; ADR-0012
- Implementation: apps/web/src/views/CreateInvoice.tsx; apps/web/src/lib/pay.ts; packages/chain-adapters/src/quote.ts
- Tests: apps/web/src/views/CreateInvoice.test.tsx; apps/web/src/lib/pay.test.ts; apps/web/src/views/Pay.supported.test.tsx; apps/web/src/views/CreateInvoice.supported.test.tsx
- Verified working: 
- Missing requirements: L2 sequencer uptime + grace (spec 03 S2) not passed to readPrice; second-source deviation check not configured; real-feed fork tests
- Confirmed defects: Low: fiat quote on Base Sepolia (OP-stack) skips sequencer-uptime guard (pay.ts:192-196) [CONFIRMED by code read; full-profile, testnet feeds only]
- Missing tests: readPrice with sequencer down / grace window through pay.ts; fork test per FEEDS entry
- Security/privacy: price read only via user-selected RPC; no third-party price API; fail closed on stale/missing feed
- Dependencies: packages/chain-adapters quote.ts (B1a); verified feed provenance (owner/operator). Blockers: 
- External acceptance: Real Chainlink feed acceptance on Sepolia/Base Sepolia pending
- Related branches/PRs: 
- Strategy: **implement** — Wire sequencerFeed/reference/enforceUsdPeg config for L2 feeds; add fork tests; keep lean exclusion.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: live feed freshness on testnets

### F-WEB-18 — Embed SDK checkout (popup default, opt-in iframe postMessage handshake)

- Tier/area: full-profile / web/embed \| profile: full only (lean drops SDK files + embedProtocol). Status: **IMPLEMENTED_UNVERIFIED** (reported PARTIAL, normalized by rubric). Implementation 95% · Verification 95% (requirement weight 15.0).
- Spec: docs/specs/14-embed-merchant-profile.md
- Implementation: apps/web/public/ghostpay-embed-v1.js; apps/web/public/ghostpay-embed-v2.js; apps/web/src/lib/embedHost.ts; apps/web/src/lib/embedProtocol.ts; apps/web/scripts/embed-sri.mjs; deploy/nginx/security-headers-embed.conf
- Tests: apps/web/src/embed.test.ts; apps/web/src/embedV2.test.ts; apps/web/src/embedHeaders.test.ts; apps/web/src/lib/embedHost.test.ts; apps/web/src/lib/embedProtocol.test.ts; apps/web/e2e/embed-iframe.spec.ts; apps/web/e2e/flows.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: Info: embedHost.ts:8 comment names deploy/nginx/embed-frame.conf, which does not exist (actual deploy/nginx/security-headers-embed.conf, tested by embedHeaders.test.ts:17)
- Missing tests: 
- Security/privacy: no secrets reachable by merchant DOM; postMessage never to '*'
- Dependencies: . Blockers: 
- External acceptance: Real merchant sites / browsers; header-capable host
- Related branches/PRs: 
- Strategy: **implement** — Publish SDK hash/SRI in release process (owner release trust root).
- Effort (estimate): S [0.5, 1] engineer-days
- Unverified: 

### F-WEB-19 — Merchant profile display, identity pinning and template issuance

- Tier/area: full-profile / web/embed \| profile: full only. Status: **VERIFIED_COMPLETE**. Implementation 100% · Verification 100% (requirement weight 11.0).
- Spec: docs/specs/14-embed-merchant-profile.md (2026-11-16 continuation); docs/user/merchant-profiles.md
- Implementation: apps/web/src/components/MerchantProfilePanel.tsx; apps/web/src/components/MerchantProfileNotice.tsx; apps/web/src/components/MerchantTemplateIssuer.tsx; apps/web/src/lib/merchantIdentity.ts; apps/web/src/lib/merchantTemplate.ts
- Tests: apps/web/src/components/MerchantProfilePanel.test.tsx; apps/web/src/components/MerchantTemplateIssuer.test.tsx; apps/web/src/lib/merchantIdentity.test.ts; apps/web/src/lib/merchantTemplate.test.ts; apps/web/e2e/merchant-profile.spec.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: profile/pin is not a payment credential; no invoice modification
- Dependencies: . Blockers: D06: profile-only automatic checkout needs signed destination/fee/pricing schema decision
- External acceptance: Native-language and real merchant acceptance pending
- Related branches/PRs: 
- Strategy: **none** — Complete for current scope; D06 is a separate decision.
- Effort (estimate): S [0, 0] engineer-days
- Unverified: 

### F-AA-01 — Scheme-2 policy-guarded account contracts (PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter)

- Tier/area: experimental / contracts. Status: **EXPERIMENTAL**. Implementation 85% · Verification 85% (requirement weight 19.0).
- Spec: CONTRACTS_SPEC s4, s4.1; ADR-0014; ADR-0027; contracts DEVIATIONS P1-P19, A1-A6, R1-R6
- Implementation: packages/contracts/src/PolicyAccount.sol; packages/contracts/src/PolicyAccountFactory.sol; packages/contracts/src/GhostPayPolicyRouter.sol; packages/contracts/src/interfaces/IPolicyAccount.sol; packages/contracts/src/interfaces/IGhostPayPolicyRouter.sol; packages/contracts/script/DeployPolicy.s.sol; packages/contracts/script/DeployPolicyRouter.s.sol
- Tests: packages/contracts/test/PolicyAccount*.t.sol; packages/contracts/test/PolicyAccountFactory.t.sol; packages/contracts/test/GhostPayPolicyRouter*.t.sol; packages/contracts/test/audit/Policy.audit.t.sol; packages/contracts/test/audit/Review24.audit.t.sol; packages/contracts/test/echidna/EchidnaPolicy.sol
- Verified working: 
- Missing requirements: 
- Confirmed defects: Medium (privacy) AUD24-01 OPEN: PolicyRef{owner,policyHash} in router calldata links scheme-2 payments to one seller (IGhostPayPolicyRouter.sol:18, GhostPayPolicyRouter.sol:236-241); Medium conditional N1 OPEN: see F-AA-03
- Missing tests: 
- Security/privacy: key theft delayed not prevented; destination linked after first withdrawal (D1); no lost-key recovery
- Dependencies: F-AA-03 fee residual; F-AA-05 recovery decision. Blockers: ADR-0014: stays out of releases; owner ABI decision AUD24-01
- External acceptance: Undeployed; no audit.
- Related branches/PRs: pr/4@39cce466 #4 PolicyRouter + policy-scheme; ancestor; pr/90@5628bc00 #90 authenticate policy payments; ancestor
- Strategy: **defer** — Keep disabled; when scheduled restore salt-only ABI (50881e4) in lockstep with policy-scheme + payer-hiding RouterCall.sol.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-AA-02 — Policy-scheme client (scheme-2 derivation, gp2 meta-address, limits tree, EIP-712, calldata, record restore) + flagged web path

- Tier/area: experimental / policy-scheme. Status: **EXPERIMENTAL**. Implementation 80% · Verification 80% (requirement weight 23.0).
- Spec: CONTRACTS_SPEC s4; ADR-0014; ADR-0023; ADR-0027 gates 1-6; policy-scheme DEVIATIONS S1-S8
- Implementation: packages/policy-scheme/src/derive.ts; packages/policy-scheme/src/meta.ts; packages/policy-scheme/src/limits.ts; packages/policy-scheme/src/eip712.ts; packages/policy-scheme/src/calldata.ts; packages/policy-scheme/src/router.ts; packages/policy-scheme/src/window.ts; packages/policy-scheme/src/record.ts (+1 more)
- Tests: packages/policy-scheme/src/vectors.test.ts; packages/policy-scheme/src/anvil.test.ts; packages/policy-scheme/src/client.test.ts; packages/policy-scheme/src/properties.test.ts; packages/policy-scheme/src/negative.test.ts; apps/web/src/features/policy/*.test.ts(x); test-vectors/policy-scheme.json; packages/policy-scheme/vectors/client-v1.json
- Verified working: 
- Missing requirements: public testnet pins; scheme-2 invoice; gate-4 status integration; browser lifecycle (ADR-0027)
- Confirmed defects: 
- Missing tests: 
- Security/privacy: policy record links destination + meta-address (no secrets); windowHeadroom is planning bound, not reservation
- Dependencies: F-AA-01; Overlap B1b F-WEB-15 (policy UI); flagged web path requirement counted here. Blockers: ADR-0014/0027 gates; AUD24-01 ABI decision
- External acceptance: No public network, no wallet eth_signTypedData_v4 UI run.
- Related branches/PRs: pr/65@f7b8ee9d #65 policy send guards; ancestor; pr/89@cfc7b0f3 #89 policy scopes; ancestor; pr/90@5628bc00 #90 policy payments; ancestor
- Strategy: **defer** — Keep isolated; complete ADR-0027 gates only after owner schedules scheme 2.
- Effort (estimate): L [5, 10] engineer-days
- Unverified: 

### F-AA-03 — F-SECURE factory flat fee + fee-token handling (N1 freeze residual)

- Tier/area: experimental / contracts. Status: **BLOCKED**. Implementation 55% · Verification 55% (requirement weight 9.0).
- Spec: CONTRACTS_SPEC s4 factory fee rule; FEE_SCHEDULE F-SECURE; spec 16 s2 (fix M-03); REVIEW_FINDINGS R-11; audits mythril-14290880802-factory-dispositions
- Implementation: packages/contracts/src/PolicyAccountFactory.sol
- Tests: packages/contracts/test/PolicyAccountFactory.t.sol; packages/contracts/test/MythrilFactoryDispositions.t.sol
- Verified working: 
- Missing requirements: 
- Confirmed defects: Medium conditional (not exposed; scheme 2 undeployed) N1/R-11 OPEN: PolicyAccountFactory._collectFee (sol:128-166) can freeze counterfactual funds
- Missing tests: 
- Security/privacy: factory event omits owner/policy (P12)
- Dependencies: . Blockers: Owner: zero-fee factory for upgradeable/fee-switch tokens or specified fail-open change (PROMOTION_PACKET blocker 3)
- External acceptance: None.
- Related branches/PRs: 
- Strategy: **defer** — Decision first; then spec edit, code, tests, audit.
- Effort (estimate): M [1, 3] engineer-days
- Unverified: 

### F-AA-04 — EIP-7702 / ERC-4337 / ERC-7579 account-abstraction path (spec 15)

- Tier/area: experimental / contracts design. Status: **BLOCKED**. Implementation 15% · Verification 0% (requirement weight 12.0).
- Spec: docs/specs/15-eip7702-aa-policy-account-path.md; ADR-LOG ADR-0009, ADR-0014, ADR-0023
- Implementation: (none) related out-of-scope: packages/payer-sponsor/src/eip7702/*, packages/ux-connect/src/compat.ts (0xef0100), packages/tx-review/src/decode.ts:90
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: key thief can re-delegate 7702 (policy bypass); sponsor/bundler sees stealth address; chain-id-0 replay
- Dependencies: F-AA-05 (spec 16) first; external audit. Blockers: spec 15: no build before 16 + audit; owner ABI/privacy decision (D03)
- External acceptance: None.
- Related branches/PRs: 
- Strategy: **defer** — Record ADRs only; no build.
- Effort (estimate): XL [15, 30] engineer-days
- Unverified: 

### F-AA-05 — Policy-account recovery / guardian (spec 16, ADR-0023, ADR-0028)

- Tier/area: experimental / contracts design. Status: **BLOCKED**. Implementation 30% · Verification 15% (requirement weight 13.0).
- Spec: docs/specs/16-policy-account-recovery.md; ADR-0028 (Unaccepted); ADR-0023 (Proposed); ADR-0027
- Implementation: scripts/experimental/policy-recovery/model.mjs
- Tests: scripts/experimental/policy-recovery/model.test.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: Info: experimental model tests not wired into any CI workflow (grep policy-recovery .github: none)
- Missing tests: CI wiring for scripts/experimental/*/model.test.mjs
- Security/privacy: no default guardians, no custodial recovery; candidate B gives destination stronger authority (documented)
- Dependencies: F-AA-01; F-AA-03 (fix M-03 same revision). Blockers: Owner authority decision (D04)
- External acceptance: None.
- Related branches/PRs: pr/89@cfc7b0f3 #89 ADR-0028 source; ancestor
- Strategy: **defer** — Decision packet first; no fund-control path.
- Effort (estimate): XL [15, 30] engineer-days
- Unverified: 

### F-BTC-04 — BTC family engine (LTC/DOGE etc. SP w/ ChainParams) — standalone

- Tier/area: experimental / btc. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 5.0).
- Spec: docs/remote/chain-ports/
- Implementation: packages/btc-family/src/*
- Tests: packages/btc-family/src/*.test.ts (9 files)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: none
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor)
- Strategy: **defer** — README: research/testnet only, not imported by web/cli, duplicate of btc-silent-payments code. Keep, label experimental; decide merge-or-freeze later.
- Effort (estimate): M [3, 6] engineer-days
- Unverified: 

### F-BTC-05 — BTC PayJoin BIP-78 policy core + v1 HTTP transport (+ optional BIP-77 ffi, unverified)

- Tier/area: experimental / btc. Status: **EXPERIMENTAL**. Implementation 60% · Verification 45% (requirement weight 9.0).
- Spec: docs/remote/privacy-specs/btc-payjoin.md
- Implementation: packages/btc-payjoin/src/*
- Tests: packages/btc-payjoin/src/*.test.ts (11)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: testnet only
- Dependencies: . Blockers: requires receiver HTTP endpoint (server) -> not beta-core
- External acceptance: No real wallet interop.
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Testnet-only; mainnet refused by design. Not wired to apps. v1 receiver needs a payjoin server (operator) -> optional only. BIP-77 adapter unverified.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-EVMX-01 — Extra EVM chain manifests + fail-closed verifier (Linea, Scroll, zkSync ... 12 chains)

- Tier/area: experimental / evmx. Status: **EXPERIMENTAL**. Implementation 55% · Verification 55% (requirement weight 7.0).
- Spec: docs/specs/09-chain-token-deployment-matrix-and-pins.md
- Implementation: packages/chain-evm-extra/src/*
- Tests: packages/chain-evm-extra/src/*.test.ts (5)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor); PR #110 test(chain-evm-extra) open@ #110
- Strategy: **defer** — Config-only, all enabled:false, many fields 'unverified'. No deployments. Not imported by web/cli. Beta is EVM core (Sepolia). zkSync needs non-standard CREATE2 (rejected).
- Effort (estimate): M [3, 5] engineer-days
- Unverified: 

### F-INT-04 — Plugin/extension API (privacy options) + conformance example

- Tier/area: experimental / integrations. Status: **EXPERIMENTAL**. Implementation 55% · Verification 55% (requirement weight 7.0).
- Spec: 
- Implementation: packages/plugin-api/src/
- Tests: packages/plugin-api/src/*.test.ts; examples/plugin-conformance/conformance.test.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: deny-by-default capability sandbox
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — keep isolated; constraint 5
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-MER-07 — Optional itemised developer donation

- Tier/area: experimental / merchant. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 8.0).
- Spec: 
- Implementation: packages/donation/src/
- Tests: packages/donation/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: must be opt-in, itemised in review UI
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/12@ #12 closed; feat(remote) relayer-guard,donation; ancestor of cand
- Strategy: **defer** — keep; separated; constraint 3/5: needs explicit opt-in design before wiring
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-NET-03 — PIR two-server XOR private scan (pir2 scan mode, default OFF)

- Tier/area: experimental / net. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 8.0).
- Spec: docs/remote/privacy-specs/network-privacy.md s4.8; docs/specs/10
- Implementation: packages/pir-two-server/src/*; packages/scan-source/src/pir2.ts
- Tests: packages/pir-two-server/src/*.test.ts (4); packages/scan-source/src/pir2.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: requires 2 operator servers
- External acceptance: No real deployment.
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Needs TWO non-colluding operator-run servers (violates constraint 2 for core) -> optional operator/experimental only. createPir2Source in scan-source; web imports scan-source but pir2 UI not wired (INFERRED; no pir2 ref in web non-test src).
- Effort (estimate): L [5, 10] engineer-days
- Unverified: 

### F-NET-04 — Network test harness (fake SOCKS5/CONNECT proxies; test-only)

- Tier/area: experimental / net. Status: **VERIFIED_COMPLETE** (reported IMPLEMENTED_UNVERIFIED, normalized by rubric). Implementation 100% · Verification 100% (requirement weight 3.0).
- Spec: 
- Implementation: packages/net-harness/src/*
- Tests: packages/net-harness/src/*.test.ts (1)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **none** — Test-only loopback fakes; only 1 test file. Used by net-transport tests; never bundled.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-OPS-02 — hygiene: own-leak hygiene options (HY-DST/CON/VER/BUF/FUND)

- Tier/area: experimental / ops. Status: **EXPERIMENTAL**. Implementation 45% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/hygiene/src/
- Tests: packages/hygiene/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — 
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-POOL-01 — Shielded pool circuits (circom Groth16, withdraw/commitment) — INSECURE dev ceremony

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 35% · Verification 15% (requirement weight 9.0).
- Spec: docs/remote/privacy-specs/shielded-pool.md; test-vectors/shielded-pool.json
- Implementation: packages/pool-circuits/{circuits,src,verifiers,vkeys}
- Tests: packages/pool-circuits/test/*.test.ts (6)
- Verified working: 
- Missing requirements: 
- Confirmed defects: INSECURE dev ceremony (documented, intended for testnet)
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Ceremony + audit unperformed.
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Deterministic public-beacon dev ceremony: anyone can forge proofs. Forked from 0xbow. Needs real multi-party ceremony + circuit audit. TS helpers testable; circom toolchain not run here.
- Effort (estimate): XL [15, 30] engineer-days
- Unverified: 

### F-POOL-02 — Shielded pool contracts (GhostPayShieldedPool ERC20/Native, ASP registry)

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 35% · Verification 15% (requirement weight 9.0).
- Spec: docs/remote/privacy-specs/shielded-pool.md
- Implementation: packages/pool-contracts/src/*
- Tests: packages/pool-contracts/test/*.t.sol (13)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: Deployment + audit unperformed.
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Foundry; testnet chain guard; forge tests run in CI (pool-contracts matrix, ci.yml ~L473), NOT run here (no forge). Verifiers insecure dev ceremony. Never deployed.
- Effort (estimate): XL [10, 25] engineer-days
- Unverified: forge test pass count

### F-POOL-03 — Pool prover + pool SDK (client side proving, Poseidon, note mgmt)

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 50% · Verification 50% (requirement weight 9.0).
- Spec: test-vectors/shielded-pool.json
- Implementation: packages/pool-prover/src/*; packages/pool-sdk/src/*
- Tests: packages/pool-prover/src/*.test.ts; packages/pool-sdk/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Client SDK testnet-only; browser proving not wired to apps. Large proof artifacts (zkey) would bloat static app.
- Effort (estimate): L [5, 10] engineer-days
- Unverified: 

### F-POOL-05 — External pools adapter interface (Privacy Pools, Railgun) — shared machinery

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 5.0).
- Spec: 
- Implementation: packages/external-pools/src/*
- Tests: packages/external-pools/src/*.test.ts (5)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — S1->third-party pool->fresh addr. Not wired. Chains 31337/Sepolia/Base Sepolia. Nothing run against real pools.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-POOL-06 — Privacy Pools (0xbow) adapter

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 100% · Verification 60% (requirement weight 5.0).
- Spec: 
- Implementation: packages/external-pools-privacypools/src/*
- Tests: packages/external-pools-privacypools/src/*.test.ts (8)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — SDK crypto tests, anvil integration test (needs anvil), relayer client. Third-party relayer = remote service dependency.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-POOL-07 — Railgun adapter

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 50% · Verification 50% (requirement weight 6.0).
- Spec: 
- Implementation: packages/external-pools-railgun/src/*
- Tests: packages/external-pools-railgun/src/*.test.ts (4)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Small adapter; third-party infra (Waku/broadcasters) not self-hostable client-side.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-POOL-08 — Payer-hiding contracts PH-2 PayRelay / PH-3 7702 delegate / PH-4 4337 account+paymaster

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 50% · Verification 25% (requirement weight 6.0).
- Spec: docs/remote/privacy-specs/payer-hiding.md; docs/specs/15-eip7702-aa-policy-account-path.md
- Implementation: packages/payer-hiding-contracts/src/*
- Tests: packages/payer-hiding-contracts/test/*.t.sol (8)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no payer anonymity claim
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate
- Strategy: **defer** — Foundry; CI matrix payer-hiding-contracts (ci.yml:473). Paymaster has SPONSOR_ADMIN privileged role (sponsor deposit only, not user funds). Sponsor sees everything; does not hide payer. forge not run here.
- Effort (estimate): XL [8, 15] engineer-days
- Unverified: forge pass count

### F-POOL-09 — Confidential amounts client (ERC-7984 / Zama fhEVM backend) + confidential contracts

- Tier/area: experimental / pool. Status: **EXPERIMENTAL**. Implementation 60% · Verification 45% (requirement weight 8.0).
- Spec: docs/remote/privacy-specs/confidential-tokens.md; docs/future/privacy-architecture/5j.md
- Implementation: packages/confidential-amounts/src/*; packages/confidential-contracts/contracts/*
- Tests: packages/confidential-amounts/src/*.test.ts (7); packages/confidential-contracts/test/* (3)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: Zama fhEVM relayer/KMS (third-party service). Blockers: 
- External acceptance: 
- Related branches/PRs: PR #16 closed-unmerged@ #16 privacy PoCs swarm 10; pkgs present in candidate; PR #22 update Solana Kit + preserve fhEVM stack (merged)@ #22
- Strategy: **defer** — CT-1 PoC on Zama fhEVM; hardhat tests (confidential-contracts) not run here (fhevm plugin heavy); client pkg vitest. Mainnets refused; Base Sepolia refused for CT-1. Not wired.
- Effort (estimate): XL [8, 15] engineer-days
- Unverified: hardhat test result

### F-PRIV-01 — Privacy pipeline (chain steps, cost/leak preview, run)

- Tier/area: experimental / priv. Status: **EXPERIMENTAL**. Implementation 50% · Verification 50% (requirement weight 6.0).
- Spec: docs/remote/privacy-specs/chaining.md
- Implementation: packages/privacy-pipeline/src/*
- Tests: packages/privacy-pipeline/src/*.test.ts (13)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #15 closed-unmerged@ #15 client-side privacy option packages
- Strategy: **defer** — Pure logic orchestrator over method pkgs; not wired to web; testnet only.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

### F-PRIV-02 — Privacy profiles catalogue/presets/conflict rules

- Tier/area: experimental / priv. Status: **EXPERIMENTAL**. Implementation 60% · Verification 60% (requirement weight 5.0).
- Spec: docs/future/privacy-first/18-privacy-modes.md
- Implementation: packages/privacy-profiles/src/*
- Tests: packages/privacy-profiles/src/*.test.ts (6)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #15 closed-unmerged@ #15 client-side privacy option packages
- Strategy: **consolidate** — No-I/O catalogue of 10 method specs + honest label keys; natural source for spec-18-style 'privacy modes' UI; not wired.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-PRIV-03 — Metadata hardening MH-* helpers

- Tier/area: experimental / priv. Status: **EXPERIMENTAL**. Implementation 60% · Verification 60% (requirement weight 5.0).
- Spec: docs/remote/privacy-specs/metadata-hardening.md
- Implementation: packages/metadata-hardening/src/*
- Tests: packages/metadata-hardening/src/*.test.ts (10)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #15 closed-unmerged@ #15 client-side privacy option packages
- Strategy: **consolidate** — Pure helpers; docs: each reduces one named leak; not wired; some map to web privacy hardening (separately implemented in apps/web/src/lib).
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-PRIV-04 — Amount blur (split/round/jitter, Off by default)

- Tier/area: experimental / priv. Status: **EXPERIMENTAL**. Implementation 60% · Verification 60% (requirement weight 5.0).
- Spec: docs/remote/privacy-specs/amount-blurring.md
- Implementation: packages/amount-blur/src/*
- Tests: packages/amount-blur/src/*.test.ts (8)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: PR #15 closed-unmerged@ #15 client-side privacy option packages
- Strategy: **defer** — Friction not anonymity; pure logic, not wired.
- Effort (estimate): S [1, 3] engineer-days
- Unverified: 

### F-PRIV-05 — Delayed multi-hop forwarding (Weak)

- Tier/area: experimental / priv. Status: **EXPERIMENTAL**. Implementation 80% · Verification 60% (requirement weight 5.0).
- Spec: docs/remote/privacy-specs/hops.md
- Implementation: packages/hops/src/*
- Tests: packages/hops/src/*.test.ts (8)
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: delayed legs need an always-on client/relayer -> conflicts static-client model unless user keeps tab open
- External acceptance: 
- Related branches/PRs: PR #15 closed-unmerged@ #15 client-side privacy option packages
- Strategy: **defer** — Labelled Weak; used as type source by hygiene (hop-source.ts) only. Requires relayer/timer => long-lived client or operator.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-RLY-05 — payer-sponsor: payer-address hiding modes + testnet sponsor core

- Tier/area: experimental / relayer. Status: **EXPERIMENTAL**. Implementation 60% · Verification 40% (requirement weight 8.0).
- Spec: 
- Implementation: packages/payer-sponsor/src/
- Tests: packages/payer-sponsor/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: packages/payer-hiding-contracts (B3). Blockers: 
- External acceptance: 
- Related branches/PRs: pr/16@698404ca #16 remote-extensions-10: 17 unique commits, 10 files differ vs cand (payer-sponsor); triage before retire
- Strategy: **defer** — keep isolated; doc claim limits already honest (constraint 3)
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-SOL-02 — chain-solana alt stealth PoC (CLI only)

- Tier/area: experimental / solana. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 5.0).
- Spec: 
- Implementation: packages/chain-solana/src/*
- Tests: packages/chain-solana/src/*.test.ts (10)
- Verified working: 
- Missing requirements: 
- Confirmed defects: format split with solana-stealth (README + DEVIATIONS)
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor)
- Strategy: **consolidate** — Duplicate Solana format (gpsol:/gpst1 base64url) used by CLI chain commands only; incompatible with solana-stealth. Pick one format before any beta claim.
- Effort (estimate): M [2, 4] engineer-days
- Unverified: 

### F-TRX-02 — chain-tron alt PoC (CLI only)

- Tier/area: experimental / tron. Status: **EXPERIMENTAL**. Implementation 40% · Verification 40% (requirement weight 5.0).
- Spec: 
- Implementation: packages/chain-tron/src/*
- Tests: packages/chain-tron/src/*.test.ts (4)
- Verified working: 
- Missing requirements: 
- Confirmed defects: meta-address tag mismatch vs tron-adapter
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: origin/chains-ports (PR #14 closed-unmerged)@ #14 chain ports; content in candidate via #17/#187 lineage (INFERRED: pkgs present, branch ancestor)
- Strategy: **consolidate** — Uses st:eth:0x tag; NOT interoperable with tron-adapter (README). No network/signing. Merge into or retire for tron-adapter.
- Effort (estimate): S [1, 3] engineer-days
- Unverified: 

### F-UX-01 — ux-connect: wallet connect compat, WalletConnect session grammar, hardware-signer status

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-connect/src/
- Tests: packages/ux-connect/src/*.test.ts
- Verified working: 129 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: README: UNVERIFIED no real wallet/device; grammar from memory

### F-UX-02 — ux-core: netstate, theme, palette, store (pure UX core)

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-core/src/
- Tests: packages/ux-core/src/*.test.ts
- Verified working: 118 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-03 — ux-export: structured export encoder/parser/import with formula neutralisation

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-export/src/
- Tests: packages/ux-export/src/*.test.ts
- Verified working: 134 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-04 — ux-fees: fee preview, cheapest route, timing

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-fees/src/
- Tests: packages/ux-fees/src/*.test.ts
- Verified working: 50 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-05 — ux-fiat: BigInt fiat display + rate validation/state machine

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-fiat/src/
- Tests: packages/ux-fiat/src/*.test.ts
- Verified working: 48 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 1 test file; rates injected; web does fiat via MerchantTemplateIssuer/PrintableBill own code

### F-UX-06 — ux-flow: return URLs, embed, proof, reconcile, undo

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-flow/src/
- Tests: packages/ux-flow/src/*.test.ts
- Verified working: 91 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-07 — ux-guide: onboarding checklist, profiles, questionnaire validation (PR #127/#133)

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-guide/src/
- Tests: packages/ux-guide/src/*.test.ts
- Verified working: 62 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-08 — ux-intake: address/deeplink/NL amount/QR payload intake

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-intake/src/
- Tests: packages/ux-intake/src/*.test.ts
- Verified working: 77 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-09 — ux-links: payment links, handles, address book, tip, URI

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-links/src/
- Tests: packages/ux-links/src/*.test.ts
- Verified working: 49 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-10 — ux-notify: notification manifest, redaction, URL safety, reminder bridge

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-notify/src/
- Tests: packages/ux-notify/src/*.test.ts
- Verified working: 79 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-11 — ux-presets: pay-again presets, sealed store

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-presets/src/
- Tests: packages/ux-presets/src/*.test.ts
- Verified working: 57 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-12 — ux-privacy: privacy score + policy

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-privacy/src/
- Tests: packages/ux-privacy/src/*.test.ts
- Verified working: 33 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-13 — ux-receipts: receipt parse/render/verify/disclose

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-receipts/src/
- Tests: packages/ux-receipts/src/*.test.ts
- Verified working: 117 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: web has its own lib/receipts.ts; 2 test files

### F-UX-14 — ux-schedule: recurrence, schedule templates, advancing-clock expiry guard (PR #126/#132)

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 55% · Verification 45% (requirement weight 7.0).
- Spec: 
- Implementation: packages/ux-schedule/src/
- Tests: packages/ux-schedule/src/*.test.ts
- Verified working: 133 tests pass
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: pr/8@e2ac361b #8 closed; ux-* swarm 7; ancestor of cand
- Strategy: **defer** — support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need.
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-UX-15 — ux-i18n and ux-sandbox: deprecated thin re-export shims

- Tier/area: experimental / ux. Status: **EXPERIMENTAL**. Implementation 50% · Verification 50% (requirement weight 4.0).
- Spec: 
- Implementation: packages/ux-i18n/src/index.ts; packages/ux-sandbox/src/index.ts
- Tests: packages/ux-i18n/src/*.test.ts; packages/ux-sandbox/src/*.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — deprecated; candidates for retirement in phase 2 after confirming zero consumers
- Effort (estimate): S [0, 1] engineer-days
- Unverified: 

### F-WEB-15 — Policy-account UI (scheme 2 / EIP-7702, experimental)

- Tier/area: experimental / web/policy \| profile: full only behind VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1. Status: **EXPERIMENTAL**. Implementation 60% · Verification 60% (requirement weight 13.0).
- Spec: docs/specs/15-eip7702-aa-policy-account-path.md; docs/specs/16-policy-account-recovery.md; ADR-0027; ADR-0028
- Implementation: apps/web/src/features/policy/PolicyView.tsx; apps/web/src/features/policy/flag.ts; apps/web/src/features/policy/send.ts; apps/web/src/features/policy/withdraw.ts; apps/web/src/features/policy/paymentEvidence.ts
- Tests: apps/web/src/features/policy/PolicyView.test.tsx; apps/web/src/features/policy/PolicyView.guard.test.tsx; apps/web/src/features/policy/paymentEvidence.test.ts; apps/web/src/features/policy/paymentEvidence.anvil.test.ts; apps/web/src/features/policy/send.test.ts; apps/web/src/features/policy/withdrawalState.test.ts
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no delegate authority by default; never on lean/Pages
- Dependencies: . Blockers: D03 AUD24-01 decision; D04 ADR-0028; Mythril policy (PROMOTION_PACKET blocker 2); fee-token freeze residual
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Keep separated behind flag; decision-gated (D03/D04).
- Effort (estimate): XL [10, 20] engineer-days
- Unverified: 

### F-AA-06 — GhostMilestones escrow (spec 17)

- Tier/area: future / contracts design. Status: **BLOCKED**. Implementation 15% · Verification 15% (requirement weight 12.0).
- Spec: docs/specs/17-milestone-escrow.md
- Implementation: scripts/experimental/milestone-escrow/model.mjs
- Tests: scripts/experimental/milestone-escrow/model.test.mjs
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: no shared project id/salt on-chain; fixed arbiter compromise documented by model
- Dependencies: . Blockers: custody/dispute decision; spec 17 "do not start before 01-09 done"
- External acceptance: Separate audit + legal review required.
- Related branches/PRs: 
- Strategy: **defer** — Separate product scope.
- Effort (estimate): XL [20, 40] engineer-days
- Unverified: 

### F-FUT-01 — 5a: No accounts / identifying telemetry

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5a.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: apps/web/src/privacyInvariants.test.ts, ci:scan-secrets (partial guard exists).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-02 — 5b: Local encryption and key management

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5b.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: secret-box, ux-vault, ux-export.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-03 — 5c: Fresh EVM stealth destinations + local discovery

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5c.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: core-crypto scheme-1, hygiene, scan-source.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-04 — 5d: Privacy-preserving RPC and scanning

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5d.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: net-transport, scan-source, apps/web/src/lib/scanPrivacy.ts, pir-two-server (spec 10 stage-1 partial).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-05 — 5e: Sweep privacy + linkability analysis

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5e.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: hygiene, hops, ux-flow.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-06 — 5f: Encrypted invoice + metadata minimization

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5f.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: invoice-schema, metadata-hardening, payment-uri.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-07 — 5g: HTTPS and Tor hosting w/ verifiable boundaries

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5g.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: net-transport/onion.ts, docs/research/hosting.md, CI pages.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-08 — 5h: Optional broadcast + gas sponsorship without custody

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5h.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: payer-sponsor, relayer-guard, payer-hiding-contracts.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-09 — 5i: Buyer-side privacy adapters + identity separation

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5i.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: external-pools*, pool-sdk, privacy-pipeline, payer-hiding-contracts.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-10 — 5j: Confidential amount + settlement integrations

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5j.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: confidential-amounts, confidential-contracts (CT-1 PoC).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-11 — 5l: Reproducible builds + release integrity

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-architecture/5l.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: scripts/build-workspaces.mjs, ops-monitor, CI (owned B-release; ref only).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-12 — privacy-first 01: GhostTips donations

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/01-ghosttips.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: donation, payment-uri.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-13 — privacy-first 02: GhostStore static storefronts

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/02-ghoststore.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: merchant-*, invoice-schema.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-14 — privacy-first 03: Private payment links/QR

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/03-private-payment-links.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: payment-uri, qr-exchange, ux-links.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-15 — privacy-first 04: Local merchant dashboard

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/04-merchant-dashboard.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: merchant-ledger, ux-receipts.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-16 — privacy-first 05: GhostProof selective disclosure

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/05-ghostproof.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-receipts, specs/ideas/07.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-17 — privacy-first 06: Encrypted backups + full recovery

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/06-encrypted-backups.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-vault, ux-export, spec 18 (B1b).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-18 — privacy-first 07: Private multi-recipient payouts

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/07-ghostpayouts.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: merchant-multisig, privacy-pipeline.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-19 — privacy-first 08: Portable merchant identities

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/08-ghostid.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: policy-scheme, merchant-hooks.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-20 — privacy-first 09: In-person QR checkout

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/09-ghostpos.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: qr-exchange, ux-flow.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-21 — privacy-first 10: Private recurring invoices

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/10-private-recurring.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-schedule.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-22 — privacy-first 11: Encrypted collaboration

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/11-ghostteams.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: merchant-multisig, secret-box.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-23 — privacy-first 12: P2P offramp handoff

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/12-ghostbridge.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: (none).
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-24 — privacy-first 13: Privacy-aware fiat conversion

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/13-fiat-conversion.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-fiat.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-25 — privacy-first 14: Privacy-aware multichain routing

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/14-multichain-routing.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: chain-adapters, btc-*, solana-stealth, tron-adapter, chain-evm-extra.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-26 — privacy-first 15: Private scanning/RPC/broadcast

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/15-private-rpc.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: net-transport, scan-source, pir-two-server.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-27 — privacy-first 16: Per-client identities

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/16-per-client-identities.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ideas/03, core-crypto.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-28 — privacy-first 17: Private sweeping/offline funds

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/17-private-funds.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: hygiene, ux-vault.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-29 — privacy-first 18: Selectable privacy modes

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/future/privacy-first/18-privacy-modes.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: privacy-profiles, ux-privacy.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-30 — idea 01: Sweep + link hygiene

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/01-sweep-and-link-hygiene.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: hygiene pkg (exists; see B-owners). Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-31 — idea 02: Claim-by-tx-hash + spam filter

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/02-claim-by-hash-and-spam-filter.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: scan-source, apps scan. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-32 — idea 03: Per-client meta-addresses

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/03-per-client-meta-addresses.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: core-crypto. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-33 — idea 04: Encrypted backup/restore

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/04-encrypted-backup-restore.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-vault, ux-export. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-34 — idea 05: Tor/onion/proxy RPC + padded queries

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/05-private-rpc-padded-queries.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: net-transport, web scanPrivacy (largely implemented stage 1). Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-35 — idea 06: Watch-only + airgapped signer

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/06-watch-only-airgapped-signer.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: qr-exchange, tx-review. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-36 — idea 07: Selective-disclosure receipts

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/07-selective-disclosure-receipts.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-receipts. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-37 — idea 08: Multi-relayer + self-submit

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/08-multi-relayer-self-submit.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: relayer-guard, apps/relayer. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-38 — idea 09: 'What is public' explainer

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/09-what-is-public-explainer.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-guide, ux-sandbox, sandbox. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-39 — idea 10: Client-side hosting constraints

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/ideas/10-client-side-hosting-constraints.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: cross-cutting. Idea spec; some pieces may exist in other teams' scope.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-40 — Spec 18 / req 3q stealth keypair export (reference only; owned by B1b)

- Tier/area: future / future. Status: **SPEC_ONLY** — DUPLICATE of F-KEY-07..F-KEY-12 (spec 18 / req 3q counted once, under F-KEY rows), excluded from counts. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/18-stealth-keypair-export.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: ux-export, secret-box, core-crypto. Referenced, not duplicated; spec says approved, not yet implemented. Counterpart 5k.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-FUT-41 — Hosted BTC scan service (mode C / Frigate-style)

- Tier/area: future / future. Status: **SPEC_ONLY**. Implementation 0% · Verification 0% (requirement weight 3.0).
- Spec: docs/specs/12-bip352-light-client-scanning.md
- Implementation: 
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Spec only. Maps to: btc-silent-payments/scan. ADR-gated; sends scan key to server; violates constraint 3 by default - keep absent.
- Effort (estimate): M [2, 10] engineer-days
- Unverified: 

### F-INT-03 — Shopify integration

- Tier/area: future / integrations. Status: **PARTIAL** (reported SPEC_ONLY, normalized by rubric). Implementation 50% · Verification 0% (requirement weight 6.0).
- Spec: 
- Implementation: integrations/shopify/
- Tests: 
- Verified working: 
- Missing requirements: 
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — STUB: snippet+docs only; Shopify gateway needs Payments Partner program
- Effort (estimate): L [3, 10] engineer-days
- Unverified: 

### F-KEY-14 — ux-vault encrypted address book / multi-profile vault (library; web-unwired)

- Tier/area: future / packages/ux-vault \| profile: not in web (CLI backup uses ux-vault root). Status: **PARTIAL**. Implementation 30% · Verification 30% (requirement weight 11.0).
- Spec: docs/remote/usability/specs/vault.md; docs/remote/usability/wiring/ux-vault.md
- Implementation: packages/ux-vault/src/vault.ts; packages/ux-vault/src/contacts.ts; packages/ux-vault/src/envelope.ts; packages/ux-vault/src/backup.ts; packages/ux-vault/src/confusables.ts
- Tests: packages/ux-vault/src/vault.test.ts; packages/ux-vault/src/contacts.test.ts; packages/ux-vault/src/envelope.test.ts; packages/ux-vault/src/confusables.test.ts; packages/ux-vault/src/schema.test.ts
- Verified working: 
- Missing requirements: web wiring per docs/remote/usability/wiring/ux-vault.md
- Confirmed defects: 
- Missing tests: 
- Security/privacy: 
- Dependencies: . Blockers: 
- External acceptance: 
- Related branches/PRs: 
- Strategy: **defer** — Not in beta scope; keep library + CLI use; revisit as optional full-profile feature.
- Effort (estimate): L [4, 8] engineer-days
- Unverified: 

