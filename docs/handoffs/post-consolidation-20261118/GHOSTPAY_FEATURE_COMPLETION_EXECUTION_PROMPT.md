# GHOSTPAY — FEATURE COMPLETION ENGINEERING EXECUTION PROMPT

Prepared 2026-11-18 by the post-consolidation audit session. Package:
`docs/handoffs/post-consolidation-20261118/` on branch `nodata/zealous-hopper-lr0nxe`, draft PR
[djshellshoxxx/GhostPay#205](https://github.com/djshellshoxxx/GhostPay/pull/205). Audited product source:
`7a620ff19ecf4e43ec568896c34188f5b2dcd3fc`.

## 0. How to use this prompt
Paste this whole file as the first message of a fresh Claude Code session on `djshellshoxxx/GhostPay`.
It is self-contained. The audit package it came from is on branch `nodata/zealous-hopper-lr0nxe` under
`docs/handoffs/post-consolidation-20261118/` (fetch it: `git fetch origin nodata/zealous-hopper-lr0nxe` then
`git show FETCH_HEAD:docs/handoffs/post-consolidation-20261118/<file>`). Where this prompt and a package file differ,
re-verify against the repository; the repository wins over both.

## 1. Role and configuration
You are the integration coordinator and principal engineer for GhostPay: a noncustodial, client-side, privacy-first
stealth-payment application. Model: Claude Opus 5.5, effort Extra High (`xhigh`). Invoke the `caveman:caveman`
skill at the start and use Caveman-compressed style for all agent briefs and agent reports (compress prose, never
technical meaning: keep exact SHAs, paths, commands, errors, interfaces and security requirements). If the skill is
unavailable, say so once and use the fallback brief format `TASK | SCOPE | CONSTRAINTS | RESULT | EVIDENCE | BLOCKERS`.
Unlike the audit session that produced this prompt, THIS session performs real engineering: implement, test,
review, integrate and hand off.

## 2. Mission (engineering session)
Implement **every technically unblocked unfinished feature** listed in section 7. Reuse existing code first: the
candidate already contains almost all historical work, so reuse means the in-tree primitives named per item
(section 7 strategy column, `completion_strategy.json`) plus the few recoverable branch items in section 8.
Independently verify every milestone, integrate qualified changes into your integration branch, and **continue
through the subsequent waves without stopping after one milestone**. Implement the decision-independent parts of
owner-gated items behind fail-closed defaults (section 10). Experimental and future rows are not promoted (section
7.4). You are done only when section 17 holds.

## 3. Authorization boundary
AUTHORIZED without further approval:
- Create local worktrees and local task branches; implement code, tests, docs and CI changes inside the scope below.
- Commit to, and push, ONLY the session's designated development branch (the one named in this session's system
  instructions); use it as the integration branch. Open ONE draft PR for it (see section 14), keep it updated,
  subscribe to its activity, fix CI failures on it (section 14).
- Run any local build, test, analyzer, fuzzing or devnet (anvil, regtest) using synthetic keys only.
- Spawn sub-agents and worktrees per section 12.
NOT AUTHORIZED (stop and record in the handoff as an owner action):
- Merging into `main` or any protected/shared branch; marking PRs ready-for-review on behalf of the owner is allowed
  only when every gate in section 13 passes, and merging is never allowed.
- Public deployment (GitHub Pages deploy, Wiki publication, onion publication), releases, tags, signing with real
  keys, broadcasting to any public network (testnet or mainnet) with real or owner keys.
- Deleting, force-pushing or rewriting any branch other than your own designated branch; closing other PRs.
- Adding custody, admin withdrawal, hosted signing, server key management, mandatory backends, telemetry or
  analytics; weakening, skipping or deleting any test or security gate; suppressing analyzer findings.
- Deciding any item in section 10 (owner decisions/actions) — implement only the decision-independent parts and the listed default.

## 4. Verified baseline (2026-11-18) and drift checks

| Item | Value (verify at start) |
|---|---|
| Repository | `djshellshoxxx/GhostPay` (default branch `main`) |
| `main` | `cfaebeeae22f292cb0bb3074619b2603cb738367` (merge #189, 2026-11-16); **unprotected** per prior session (API 404 "Branch not protected") |
| Consolidated candidate | PR [#203](https://github.com/djshellshoxxx/GhostPay/pull/203), branch `nodata/wizardly-allen-qwol6u`; product source **`7a620ff19ecf4e43ec568896c34188f5b2dcd3fc`** (tree `594c9f6a`), 1,484 commits ahead of `main` (fast-forwardable); PR head `71abc7e55c25d45b206ac47e5ddd24e072805710` adds documentation only |
| CI on `7a620ff1` | CI 44242366118 **24/24 success** (web 2,749 passed / 1 skipped; e2e full 78 passed / 1 skipped; lean 66 / 3 skipped); Pages, Beta acceptance, Integration, Hosting kit, CLI operator, CodeQL success; Contract analysis 44242366379: Echidna success (13 properties, 11 canaries), **Mythril red by design** (11 dispositioned records) |
| Local audit re-run on `7a620ff1` | typecheck/lint exit 0; `npm test` 0 failures (~12k passed, 78 skipped); lean/full builds OK; Playwright mocked e2e lean 66/3, full 78/1; `forge test` contracts 490/0, pool 86/0, payer-hiding 109/0; npm audit prod 0; 111 actions pinned; release tarball + SBOM reproducible |
| Other open work | PR [#204](https://github.com/djshellshoxxx/GhostPay/pull/204) `nodata/eager-babbage-0w6sf6` @ `2693b08e` (agent tooling; conflicts with #203 only in `.github/workflows/ci.yml` (1 line) and `CLAUDE.md` (add/add)); ChatGPT `chatgpt/zero-codex/*` rotation keeps pushing docs-only commits (#139 `7af4b5ff`, #140 `400e20f1`, #153 `30f1604d` at audit time) |
| Branches / PRs | 217 remote heads at audit time (+ `nodata/zealous-hopper-lr0nxe` for this package); 169 contained in `7a620ff1`, 48 not; 202 PRs (145 open) + #205 |
| Unified foundation | PR [#187](https://github.com/djshellshoxxx/GhostPay/pull/187) `beb525dddcca103de9eda447b55cddf7ee2f428c` (tree `36177d29`); contracts `src/lib/script` unchanged since |

Drift checks: (1) `git merge-base --is-ancestor 7a620ff19ecf4e43ec568896c34188f5b2dcd3fc <START_SHA>`; (2)
`git diff --stat 7a620ff1 <START_SHA> -- . ':!docs'` empty, or review every non-doc change before relying on section 7;
(3) CI conclusions on START_SHA match the row above; (4) re-run
`python3 -I docs/handoffs/post-consolidation-20261118/evidence/scripts/branch_census.py` (needs the package files
from `nodata/zealous-hopper-lr0nxe`) if you will act on any branch row. The clone must not be shallow
(`git rev-parse --is-shallow-repository` → `false`; else `git fetch --unshallow`): a shallow clone misreported ancestry in this audit.

## 5. Start procedure (mandatory, before any edit)
1. `git fetch --all --prune` and `git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'`.
2. Record: `main` SHA, PR #203 state and head SHA, PR #204 state, your designated branch, open PRs updated since
   2026-11-18, CI state of PR #203 head. Compare with section 4. Any drift: list it, then re-run the drift checks in
   section 4 before trusting downstream sections.
3. Choose START_SHA:
   - If PR #203 is merged into `main`: START_SHA = current `main` HEAD (verify `git merge-base --is-ancestor
     7a620ff19ecf4e43ec568896c34188f5b2dcd3fc main`).
   - Else: START_SHA = PR #203 head if it still descends from `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` and its
     new commits are docs-only or reviewed; otherwise `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc`.
   Reset your designated branch to START_SHA (`git checkout -B <designated-branch> <START_SHA>`) — it is yours and
   new, so this destroys nothing; confirm it has no unpushed commits first.
4. Install exactly like CI: `npm ci --ignore-scripts && npm run build:libs`. Install pinned Foundry (see the
   `setup-forge` action in `.github/actions/`) if the network allows; if not, record the blocker and keep working:
   only contract and devnet gates are blocked, not unrelated work.
5. Run the baseline: `npm run typecheck`, `npm run lint`, `npm test`, lean + full web builds, `npm run
   ci:scan-secrets`, `npm run ci:check-actions`. Record pass/fail counts. Pre-existing failures become WS-00 items (section 12).
6. Write `docs/ai/ACTIVE_WORK.md` on your branch: coordinator, branch, START_SHA, workstreams, owned paths,
   acceptance criteria (format already used in that file). Commit before spawning workers.

## 6. Architectural constraints (non-negotiable; check every change against them)
1. **Strict noncustodial.** Users alone control keys and funds. No hosted signing, admin withdrawal authority,
   server-controlled key management or custodial recovery. Contracts today have no admin, upgrade, pause or rescue
   power — keep it that way.
2. **Fully client-side static app.** The primary application stays a static browser app for GitHub Pages, HTTPS
   hosting and Tor-compatible delivery. No mandatory backend, hosted accounts, application database or server-side
   signing. Relayers, PIR servers, pool relayers, payjoin receivers stay optional, opt-in and out of the lean build.
3. **Privacy-first.** Local cryptography; minimal metadata; explicit user-selected RPC with **no automatic
   fallback**; no analytics or telemetry of any kind; no unnecessary third-party requests; no secret-bearing logs,
   URLs, storage or crash reports; **no automatic clipboard writes** of secrets; privacy-preserving defaults;
   fail closed when a guarantee cannot be met. Document unavoidable public-chain leakage (payer↔stealth address,
   amounts, timing, gas payer linkage on sweep, RPC sees queried addresses/IP). Never describe stealth addresses as
   anonymity or Monero-like privacy.
4. **Key ownership and portability (spec 18 / requirement 3q, canonical `docs/specs/18-stealth-keypair-export.md`).**
   Per-stealth-address public/private keypair export, encrypted private-key backups, explicitly controlled raw-key
   export (single key, re-auth + second confirmation, never bulk raw), independent recovery/import without GhostPay
   infrastructure. Out-of-scope key models (BIP-352 BTC, ERC-4337/AA, EIP-7702, policy/contract accounts) are
   refused fail-closed.
5. **Preserve existing work.** Keep experimental/optional code, separated from release-qualified functionality;
   the lean (Pages) bundle must not import relayer/operator/CLI runtimes, scheme 2, BTC/SOL/TRON or 7702/4337 paths
   (guarded by `localBuildProfile.test.mjs` and `scan-bundle.mjs`).

## 7. What remains (feature register)
Source: `FEATURE_COMPLETION_MATRIX.md` + `feature_completion_matrix.json` (requirement-weighted, recomputed by
script; external acceptance excluded) and `completion_strategy.json` (six-way strategy comparison per feature).

### 7.1 Current state
- 192 distinct features: **37 VERIFIED_COMPLETE, 30 IMPLEMENTED_UNVERIFIED, 27 PARTIAL, 46 SPEC_ONLY, 45
  EXPERIMENTAL, 7 BLOCKED** (155 unfinished). Beta-core (43): 18 complete, 11 implemented-unverified, 5 partial,
  3 blocked, 6 spec-only (spec 18 K01–K06). Five rows (F-KEY-01, F-KEY-02, F-WEB-07, F-WEB-11, F-WEB-12) meet their
  requirements but are held by open SEC-03/SEC-05/SEC-10 (security-hold rule).
- Requirement-weighted implementation / verification: beta scope **87.9 % / 84.0 %**; all tiers excluding the future
  roadmap 79.9 % / 75.0 %; all tiers 73.9 % / 69.3 %. These measure specified behaviour, not release readiness:
  **nothing is release-ready** (no deployment of record, empty release keys, Mythril gate red by design, `main`
  unprotected, shared Pages origin).
- Largest gap: spec 18 key portability has **zero code** (F-KEY-07..F-KEY-12), which also leaves no
  GhostPay-independent recovery path (SEC-04) — the main violation of constraint 4.

### 7.2 Unfinished beta-core, beta-supporting and full-profile rows (68)
"Owner gates" lists canonical IDs from section 10; Wave and WS (items) per sections 11–12; full six-way comparison per row in `completion_strategy.json`.

**beta-core: 25 unfinished**

| ID | Feature | Impl / Verif % | Status | Strategy | Wave | WS (items) | Owner gates |
|---|---|---|---|---|---|---|---|
| F-CLI-03 | CLI encrypted backup, restore, rekey, offline recovery | 100 / 85 | IMPLEMENTED_UNVERIFIED | implement | 4 | WS-11 (WS-11.4) | — |
| F-CTR-07 | Contract qualification gates (Foundry unit/fuzz/invariant, cov | 90 / 80 | BLOCKED | refactor | 9 | WS-06 (WS-06.1, WS-06.2, WS-06.3) | OA-01, OA-02, OA-03, OD-03 |
| F-DEP-01 | Deployment manifests: schema, strict loader, structured releas | 85 / 80 | PARTIAL | repair | 2 | WS-05 (WS-05.1) | OA-03, OD-07 |
| F-DEP-02 | On-chain manifest read-back verifyDeployment (spec 01) | 85 / 80 | PARTIAL | refactor | 6 | WS-24 (WS-24.2) | OA-04 |
| F-DEP-03 | Chain/token/feed deployment matrix + release gate (spec 09) | 75 / 70 | PARTIAL | implement | 6 | WS-05 (WS-05.3) | OA-04 |
| F-DEP-04 | Testnet deployment tooling + Sepolia-first deployment of recor | 75 / 55 | BLOCKED | implement | 6 | WS-05 (WS-05.2) | OA-04, OD-08, OD-14 |
| F-DOC-04 | In-app contextual help + static help/privacy pages | 65 / 65 | PARTIAL | defer | 8 | WS-12 (WS-12.7) | OD-16, OD-20 |
| F-I18N-01 | Web i18n framework: catalogs, translator, plurals/ICU-lite, RT | 90 / 90 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-12 (WS-12.4) | — |
| F-KEY-01 | Seller key generation, hex import and in-memory session | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold) | repair | 1 | WS-07 (WS-07.1) | OD-01 |
| F-KEY-02 | Encrypted browser key vault (IndexedDB), unlock, step-up, dele | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold) | repair | 1 | WS-18 (WS-18.1) | OD-09 |
| F-KEY-03 | Keystore v1 backup/restore and verified-backup gate (GP-PAGES- | 100 / 100 | IMPLEMENTED_UNVERIFIED | recover | 5 | WS-02 (WS-02.7) | — |
| F-KEY-07 | Spec 18 K01: public/keypair/master schemas + verified derivati | 0 / 0 | SPEC_ONLY | implement | 3 | WS-03 (WS-03.1, WS-19.2) | OD-10 |
| F-KEY-08 | Spec 18 K02: encrypted single-keypair envelope + atomic import | 0 / 0 | SPEC_ONLY | implement | 3 | WS-03 (WS-03.2, WS-19.2) | OD-09, OD-10 |
| F-KEY-09 | Spec 18 K03: seller payment-row export UI (public + encrypted) | 0 / 0 | SPEC_ONLY | implement | 7 | WS-08 (WS-08.1) | OD-01, OD-02, OD-10 |
| F-KEY-10 | Spec 18 K04: raw single-key export + independent recovery proo | 0 / 0 | SPEC_ONLY | implement | 7 | WS-08 (WS-08.2, WS-19.5) | OD-01, OD-02, OD-10 |
| F-KEY-11 | Spec 18 K05: encrypted bounded bulk archive of validated one-t | 0 / 0 | SPEC_ONLY | implement | 7 | WS-25 (WS-08.3, WS-19.3, WS-25.1…) | OD-10 |
| F-KEY-12 | Spec 18 K06: separate encrypted master spend/view backup (+ KC | 0 / 0 | SPEC_ONLY | implement | 7 | WS-09 (WS-09.1, WS-19.4) | OD-01, OD-09, OD-10 |
| F-KEY-13 | secret-box (closure-held secret bytes, scopes, wipe) | 90 / 90 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-03 (WS-03.3) | — |
| F-WEB-04 | Payment submission journal and honest uncertain outcomes | 90 / 90 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-10 (WS-10.6) | — |
| F-WEB-06 | Seller scan & discovery UI (worker, checkpoints, reorg, dedupe | 95 / 95 | IMPLEMENTED_UNVERIFIED | defer | 4 | WS-02 (WS-02.6) | — |
| F-WEB-09 | Payment history & reconciliation ledger (encrypted IndexedDB,  | 100 / 95 | IMPLEMENTED_UNVERIFIED | repair | 2 | WS-02 (WS-02.4) | — |
| F-WEB-11 | Direct sweep (self-paid gas, in-page derived key) | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold) | repair | 1 | WS-07 (WS-07.1) | OD-01 |
| F-WEB-17 | Bundled signed manifests + on-chain readback in UI | 80 / 80 | PARTIAL | repair | 6 | WS-24 (WS-24.3) | OA-03, OA-04, OD-06, OD-07 |
| F-WEB-21 | Lean static Pages build profile (product surface) | 80 / 80 | BLOCKED | defer | 9 | WS-04 (WS-04.6) | OA-01, OA-02, OA-03, OA-05, OA-06, OD-06, OD-07, OD-08 |
| F-WEB-26 | address-safety (strict addresses, lookalikes, display-text san | 90 / 80 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-10 (WS-10.3) | — |

**beta-supporting: 25 unfinished**

| ID | Feature | Impl / Verif % | Status | Strategy | Wave | WS (items) | Owner gates |
|---|---|---|---|---|---|---|---|
| F-A11Y-01 | Automated accessibility: axe-core audit in Playwright (all rou | 90 / 85 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-12 (WS-12.2) | — |
| F-A11Y-02 | Mobile/responsive: Chromium device-emulation projects (Pixel 7 | 50 / 50 | PARTIAL | defer | 9 | WS-17 (WS-17.2) | — |
| F-A11Y-03 | Screen-reader / assistive-tech qualification | 40 / 20 | PARTIAL | implement | 4 | WS-12 (WS-12.5) | — |
| F-BTC-01 | BIP-352 silent payments: keys, addresses, sender derive, recei | 100 / 80 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-14 (WS-14.4) | OD-02, OD-20 |
| F-CLI-01 | CLI core: registry, strict arg parsing, --json, exit codes, do | 100 / 85 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-11 (WS-11.3) | — |
| F-CLI-05 | CLI read-only chain/payment/scan/registry commands | 100 / 80 | IMPLEMENTED_UNVERIFIED | defer | 9 | WS-17 (WS-17.1) | OA-04 |
| F-CLI-06 | CLI merchant commands: refunds, installments, subscriptions, w | 80 / 80 | PARTIAL | defer | 8 | WS-15 (WS-15.1) | — |
| F-CTR-04 | ERC-6538 registry integration (canonical singleton used as dep | 90 / 85 | IMPLEMENTED_UNVERIFIED | repair | 6 | WS-24 (WS-24.4) | OA-04 |
| F-CTR-06 | Gas buffer v2 (spec 13) + invoice v2 seller bufferPolicy (ADR- | 95 / 80 | IMPLEMENTED_UNVERIFIED | implement | 4 | WS-10 (WS-10.5) | — |
| F-DEP-05 | EVM multichain config + ChainAdapter interface (MULTICHAIN_SPE | 80 / 75 | PARTIAL | repair | 2 | WS-02 (WS-02.5) | — |
| F-DOC-01 | User docs (docs/user, 20 pages) + guides (docs/guides, 11 page | 90 / 90 | IMPLEMENTED_UNVERIFIED | defer | 1 | WS-02 (WS-02.2) | OD-16, OD-20 |
| F-DOC-02 | Developer wiki (docs/wiki, 9 pages) | 60 / 50 | PARTIAL | repair | 5 | WS-02 (WS-02.8) | OD-20 |
| F-HOST-03 | Portable hosting kit: package/verify/preview + nginx/container | 80 / 80 | PARTIAL | defer | 8 | WS-13 (WS-13.4) | OD-06, OD-07, OD-22 |
| F-HOST-04 | infra/: devnet, integration, proxy, publish (IPFS/Tor), static | 100 / 40 | IMPLEMENTED_UNVERIFIED | repair | 8 | WS-13 (WS-13.3) | OD-22 |
| F-I18N-02 | Locale catalogs: translation completeness and native review | 60 / 55 | PARTIAL | repair | 4 | WS-12 (WS-12.3) | OD-16, OD-20 |
| F-I18N-03 | packages/i18n localisation framework (CLI/library) + CLI i18n  | 60 / 60 | PARTIAL | consolidate | 8 | WS-12 (WS-12.6) | OD-16, OD-20 |
| F-MER-01 | Merchant billing: subscriptions, schedules, installments, refu | 85 / 85 | PARTIAL | defer | 8 | WS-15 (WS-15.5) | OD-20 |
| F-MER-02 | Merchant ledger: reconciliation + accounting/tax exports | 80 / 65 | PARTIAL | consolidate | 8 | WS-15 (WS-15.2) | OD-20 |
| F-NET-01 | Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP frami | 100 / 80 | IMPLEMENTED_UNVERIFIED | repair | 1 | WS-01 (WS-01.2) | — |
| F-OPS-03 | sandbox / test mode: deterministic mock chain, faucet, clock,  | 70 / 70 | PARTIAL | defer | 8 | WS-16 (WS-16.3) | — |
| F-PROTO-05 | Announcer spam & anonymity-set bounds (spec 05) | 90 / 80 | IMPLEMENTED_UNVERIFIED | implement | 4 | WS-10 (WS-10.2) | — |
| F-WEB-05 | Gas buffer UI: v1 payer buffer (lean+full) and v2 seller polic | 90 / 75 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-10 (WS-10.1) | — |
| F-WEB-07 | Scan privacy modes (spec 10 UI: transport, private-required, w | 100 / 100 | IMPLEMENTED_UNVERIFIED (security hold) | repair | 1 | WS-01 (WS-01.1) | — |
| F-WEB-12 | Relayer-assisted sweep and permit refusal messages | 100 / 95 | IMPLEMENTED_UNVERIFIED (security hold) | repair | 1 | WS-07 (WS-07.1) | OD-01 |
| F-WEB-23 | Home / About / help pages / contextual help (lost-click fix) | 100 / 85 | IMPLEMENTED_UNVERIFIED | repair | 1 | WS-02 (WS-02.1) | — |

**full-profile: 18 unfinished**

| ID | Feature | Impl / Verif % | Status | Strategy | Wave | WS (items) | Owner gates |
|---|---|---|---|---|---|---|---|
| F-BTC-03 | BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node  | 90 / 80 | IMPLEMENTED_UNVERIFIED | defer | 8 | WS-14 (WS-14.5) | OD-20, OD-21 |
| F-DOC-03 | Operator docs (docs/operators, 17 pages): runbooks, relayer, m | 50 / 50 | PARTIAL | defer | 9 | WS-13 (WS-13.5) | OA-04 |
| F-HOST-01 | Self-host recipe: docker-compose + nginx + relayer image + sel | 70 / 45 | PARTIAL | repair | 8 | WS-13 (WS-13.1) | — |
| F-HOST-02 | Tor onion service for the static bundle | 60 / 45 | PARTIAL | repair | 8 | WS-13 (WS-13.2) | OD-22 |
| F-INT-01 | WooCommerce gateway plugin (payment-link redirect flow) | 85 / 75 | PARTIAL | defer | 8 | WS-15 (WS-15.3) | OD-20 |
| F-INT-02 | PrestaShop module | 60 / 60 | PARTIAL | defer | 8 | WS-15 (WS-15.4) | OD-20 |
| F-KEY-05 | Tag archive backup/restore + combined BackupPanel (spec 08) | 90 / 90 | IMPLEMENTED_UNVERIFIED | repair | 3 | WS-07 (WS-07.2) | OD-01 |
| F-MER-04 | Merchant m-of-n multisig approvals | 60 / 60 | PARTIAL | defer | 8 | WS-15 (WS-15.6) | OD-20 |
| F-OPS-01 | ops-monitor: read-only chain anomaly probes + bounded release- | 80 / 75 | PARTIAL | defer | 9 | WS-13 (WS-13.6) | OA-04 |
| F-POOL-04 | Pool withdrawal relayer service (node:http) | 100 / 60 | EXPERIMENTAL | defer | 8 | WS-16 (WS-16.5) | OD-21 |
| F-PROTO-11 | Scan-source abstraction (range / indexer-tor / pir2 / light-cl | 70 / 70 | EXPERIMENTAL | defer | 8 | WS-16 (WS-16.4) | OD-21 |
| F-PROTO-12 | SDK programmatic API (@ghostpay/sdk) | 45 / 45 | PARTIAL | defer | 8 | WS-15 (WS-15.7) | OD-20 |
| F-RLY-01 | Optional relayer: quote/sweep API, fee policy, permit failure  | 95 / 80 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-11 (WS-11.2) | — |
| F-RLY-04 | relayer-guard: breaker, trusted-proxy IP, /64 buckets, limiter | 60 / 60 | PARTIAL | defer | 8 | WS-16 (WS-16.2) | — |
| F-SOL-01 | Solana dual-key ed25519 stealth (solana-stealth) wired to web  | 60 / 50 | EXPERIMENTAL | consolidate | 8 | WS-14 (WS-14.1) | OD-02, OD-20 |
| F-TRX-01 | Tron stealth adapter (tron-adapter) wired to web full profile | 70 / 60 | EXPERIMENTAL | consolidate | 8 | WS-14 (WS-14.2) | OD-02, OD-20 |
| F-WEB-02 | Fiat-quote invoices and price-feed UI (spec 03) | 90 / 80 | IMPLEMENTED_UNVERIFIED | repair | 4 | WS-10 (WS-10.4) | — |
| F-WEB-18 | Embed SDK checkout (popup default, opt-in iframe postMessage h | 95 / 95 | IMPLEMENTED_UNVERIFIED | defer | 9 | WS-01 (WS-01.3) | OD-07 |

### 7.3 Do not regress (37 VERIFIED_COMPLETE rows and every currently green suite)
- **VERIFIED_COMPLETE** (37): F-BTC-02, F-CLI-02, F-CLI-04, F-CTR-01, F-CTR-02, F-CTR-03, F-CTR-05, F-KEY-04, F-KEY-06, F-MER-03, F-MER-05, F-MER-06, F-NET-02, F-NET-04, F-PROTO-01, F-PROTO-02, F-PROTO-03, F-PROTO-04, F-PROTO-06, F-PROTO-07, F-PROTO-08, F-PROTO-09, F-PROTO-10, F-RLY-02, F-RLY-03, F-WEB-01, F-WEB-03, F-WEB-08, F-WEB-10, F-WEB-13, F-WEB-14, F-WEB-16, F-WEB-19, F-WEB-20, F-WEB-22, F-WEB-24, F-WEB-25

### 7.4 Experimental and future rows (not promoted in this phase; OD-20/OD-21)
- **experimental** (44 unfinished): F-AA-01, F-AA-02, F-AA-03, F-AA-04, F-AA-05, F-BTC-04, F-BTC-05, F-EVMX-01, F-INT-04, F-MER-07, F-NET-03, F-OPS-02, F-POOL-01, F-POOL-02, F-POOL-03, F-POOL-05, F-POOL-06, F-POOL-07, F-POOL-08, F-POOL-09, F-PRIV-01, F-PRIV-02, F-PRIV-03, F-PRIV-04, F-PRIV-05, F-RLY-05, F-SOL-02, F-TRX-02, F-UX-01, F-UX-02, F-UX-03, F-UX-04, F-UX-05, F-UX-06, F-UX-07, F-UX-08, F-UX-09, F-UX-10, F-UX-11, F-UX-12, F-UX-13, F-UX-14, F-UX-15, F-WEB-15
- **future** (43 unfinished): F-AA-06, F-FUT-01, F-FUT-02, F-FUT-03, F-FUT-04, F-FUT-05, F-FUT-06, F-FUT-07, F-FUT-08, F-FUT-09, F-FUT-10, F-FUT-11, F-FUT-12, F-FUT-13, F-FUT-14, F-FUT-15, F-FUT-16, F-FUT-17, F-FUT-18, F-FUT-19, F-FUT-20, F-FUT-21, F-FUT-22, F-FUT-23, F-FUT-24, F-FUT-25, F-FUT-26, F-FUT-27, F-FUT-28, F-FUT-29, F-FUT-30, F-FUT-31, F-FUT-32, F-FUT-33, F-FUT-34, F-FUT-35, F-FUT-36, F-FUT-37, F-FUT-38, F-FUT-39, F-FUT-41, F-INT-03, F-KEY-14
Rule: keep them building and their tests green; fix confirmed defects only (e.g. TB-08 Solana/Tron meta-address
format split, SEC-13 seed reveal re-auth, SEC-16 pool-sdk backup policy) without moving them into the lean bundle.
F-PROTO-13 and F-FUT-40 duplicate spec 18 and are tracked under F-KEY-07..F-KEY-12.

## 8. Recoverable branch work (from `BRANCH_RECOVERY_MATRIX.md`, 234 refs: A 1, B 6, C 205, D 14, E 7, F 1)
The candidate already contains nearly all historical work. Recover only:
1. **#204 agent tooling** (class A, `nodata/eager-babbage-0w6sf6` @ `2693b08e`): new files apply cleanly; regenerate
   `PACKAGE_MAP.md` (its one failing test), merge `CLAUDE.md` (add/add), re-apply the one `ci.yml` line (append
   `scripts/agent/*.test.mjs` to the shard-0 `node --test` line). Coordinator-owned (shared files); separate commit.
2. **Seller-vault R1–R3 Chromium harness** (class B): commit `57dcf7e8` on `ghostpay-cloud-recovery-2026-10-26`, file
   `apps/web/scripts/test-seller-vault-idb.mjs` — verified passing against `7a620ff1`, adds real-browser coverage the
   candidate lacks; selective file recovery + wire into `package.json`/CI.
3. **Dependency refresh** (class B, Dependabot #85/#87/#176): regenerate minor/patch updates on top of START_SHA (viem
   2.57.19, vitest/coverage 5.1.0, vite 8.3.8, prettier 3.10.1, playwright 1.65, create-pull-request 8); majors
   (`@scure/*` 2.x, TypeScript 7, hardhat 3) only per OD-18.
4. **`docs/design/qr-colors.md` hunk** from `chatgpt/zero-codex/docs-pages-scope-20261112` (doc contradicts the
   enforced bearer precedence).
5. Optional: audit-trail copy of `CHATGPT_RANDOM_AUDIT_LEDGER.md` rotations 141–183 (not security assurance).
Do **not** resurrect: `fix/remediation-f95457fd-22ecf9` (deliberately reverted in `051c1c12`); re-adding
`.github/workflows/openai-agents.yml` (#82; re-enables disabled automation); pre-history-rewrite snapshot lineages
(class D); blind merges of docs rotation chains (233 of 275 unique commits conflict). Never bulk-merge.

## 9. Security and privacy requirements
Full analysis: `SECURITY_AND_PRIVACY_GAP_ANALYSIS.md` (49 findings: 0 Critical, 2 High, 8 Medium, 20 Low, 19 Info;
AI-assisted, not an audit). Engineering must close every finding below that is not owner-gated, each with a
regression test:
| SEC | Sev | Status | Sources | Finding (short) | Blocks |
|---|---|---|---|---|---|
| SEC-01 | High | CONFIRMED | E-01 | Shared djshellshoxxx.github.io origin: 35 sibling Pages sites can read/rewrite all GhostPay sto | pages-deploy, sepolia-beta, mainnet |
| SEC-02 | High | UNVERIFIED | E-04, R-07 | Deploy trust boundary not demonstrated: main reportedly unprotected; Pages artifact unsigned/un | pages-deploy, sepolia-beta, release-tag, mainnet |
| SEC-03 | Medium | CONFIRMED | D-01, R-15 | Vault-less seller sessions have no re-authentication for sweeping or for master-key keystore ex | beta-exit, mainnet |
| SEC-04 | Medium | CONFIRMED | D-02 | No GhostPay-independent recovery path is shipped: spec 18 formats (K01-K06) are unimplemented a | beta-exit, mainnet |
| SEC-05 | Medium | CONFIRMED | D-03 | Master-key keystore/vault passphrase policy accepts name+year style passphrases (score>=2 heuri | mainnet |
| SEC-06 | Medium | CONFIRMED | D-04 | AUD24-01 re-verified: GhostPayPolicyRouter takes PolicyRef{owner, policyHash}, so every scheme- | scheme2-deploy |
| SEC-07 | Medium | CONFIRMED | D-05, R-11 | N1 re-verified: failing fee-token views or an unexpected fee delta revert every fee-charging de | scheme2-deploy |
| SEC-08 | Medium | SUSPECTED | E-02 | Stale prototype (gh-pages cc8d0794, 2026-10-21) probably live on /GhostPay/: runtime unsigned m | pages-deploy, sepolia-beta |
| SEC-09 | Medium | CONFIRMED | E-03 | Shared-origin gate trusts the declared GHOSTPAY_PAGES_ORIGIN (*.github.io suffix only); deploye | pages-deploy, sepolia-beta |
| SEC-10 | Medium | CONFIRMED | E-05 | 'Local proxy' scan transport is unusable: Settings accepts http loopback endpoints but CSP conn | sepolia-beta |
| SEC-11 | Low | CONFIRMED | D-06 | Scheme-2 payers cannot tell which assets the seller policy can withdraw: meta-address carries o | scheme2-deploy |
| SEC-12 | Low | CONFIRMED | D-07, R-09 | Factory MIN_DELAY = 1 h is below L2 censorship/forced-inclusion bounds; a colluding or stalled  | scheme2-deploy |
| SEC-13 | Low | CONFIRMED | D-08 | BTC/Solana/TRON views reveal raw master seeds/keys and allow (warned, two-click) clipboard copy | promotion:BTC/SOL/TRON beyond experimental |
| SEC-14 | Low | CONFIRMED | D-09 | Legacy text-manifest scheme (sha256/ed25519, domain GhostPay-deployment-manifest-v1) with runti |  |
| SEC-15 | Low | CONFIRMED | D-10 | Keystore v1 format documentation drifts from code (bounds, passphrase rule, writer location), w | K06 docs |
| SEC-16 | Low | CONFIRMED | D-11 | pool-sdk seed backup is weaker than the keystore policy: passphrase >=8 chars, no estimator, no | promotion:pool features beyond experimental |
| SEC-17 | Low | MISSING-COVERAGE | D-12 | Analyzer scope gaps: Slither CI excludes Low/Informational (doc claims "no detector exclusions" | mainnet |
| SEC-18 | Low | CONFIRMED | D-13, E-11 | No anti-framing protection on GitHub Pages: frame-ancestors only in _headers (ignored by Pages; |  |
| SEC-19 | Low | CONFIRMED | E-06 | wss:// RPC URLs are accepted and allowed by CSP but no transport supports them (always fail clo |  |
| SEC-20 | Low | CONFIRMED | E-07 | Default chain-adapters fetchTransport omits credentials:'omit', cache:'no-store', referrerPolic |  |
| SEC-21 | Low | INTENDED | E-08 | Invoice bearer fragment persists in browser history/session/UKM DBs after address-bar clearing; |  |
| SEC-22 | Low | CONFIRMED | E-09 | Plaintext linkable identifiers: checkpoint slots keyed by sha256(spend/view pub), vault meta-ad |  |
| SEC-23 | Low | CONFIRMED | E-10 | No in-app 'erase all GhostPay data'; clearing site data on github.io wipes all 36 sites |  |
| SEC-24 | Low | CONFIRMED | E-13 | scan-bundle checks inline scripts/CSP only in index.html; lean exclusion lists differ between g |  |
| SEC-25 | Low | CONFIRMED | E-14 | npm audit: 30 dev-tree advisories (14 high picomatch<=4.0.7 ReDoS via vite/vitest/typescript-es |  |
| SEC-26 | Low | CONFIRMED | E-15 | Self-host images pinned by tag only; dependabot lacks docker ecosystem; nginx sends no HSTS (re |  |
| SEC-27 | Low | CONFIRMED | E-16 | PRIVACY_THREAT_MODEL says net-transport/scan-source are not imported by apps/web; they ship in  |  |
| SEC-28 | Low | CONFIRMED | E-17 | Overclaims/imprecise copy: unqualified 'hides which seller owns the one-time address', 'stay un |  |
| SEC-29 | Low | UNVERIFIED | R-03 | ContextHelp hover-leave still collapses an open explanation, shifting layout (residual of R-02/ |  |
| SEC-30 | Low | INTENDED | R-04 | #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only dee |  |

Security gates (exact definitions in the analysis §9): **(a)** before any public Pages deploy: SEC-01, SEC-02,
SEC-08, SEC-09, copy fixes SEC-10/19/28; **(b)** Sepolia beta: (a) + release key and signed manifest (SEC-32), exact
-SHA CI + analyzers (SEC-33), attested Pages checksums, local-proxy fixed or removed (SEC-10), live egress smoke
(SEC-46), Firefox/Tor Browser run (SEC-41), ADR-0029 accepted; **(c)** beta exit: spec 18 K01–K06 + independent
recovery proof (SEC-04), re-auth model built (SEC-03), keystore doc drift fixed (SEC-15), no-secret-egress browser
tests; **(d)** scheme-2 deployment: SEC-06, 07, 11, 12, 31, 35, 17; **(e)** mainnet/release tag: everything above
plus an external professional audit, Mythril policy (OD-03), passphrase floor (SEC-05), branch protection and tag
ruleset (SEC-02), release rehearsal (SEC-47), security inventories (SEC-48), all 73 chain-matrix cells verified.

Per-change security checklist (reviewer must tick every line): no new network request without explicit user
selection; no secret in storage/URL/log/clipboard/error text; fail-closed on malformed input with bounded sizes;
domain-separated, versioned formats with AAD binding; constant-time comparison where secrets are compared;
CSPRNG only (`crypto.getRandomValues`/`node:crypto`), never `Math.random` for secrets; zeroize buffers best-effort;
lean bundle boundary intact; no weakening of an existing gate; independent reviewer ≠ author.

## 10. Owner decisions, owner actions and fail-closed defaults
Full table with options and evidence: `BLOCKERS_AND_DECISIONS.md`. Never decide these yourself; build the default.

| ID | Pending decision / action | Default you implement now |
|---|---|---|
| OD-01 | Re-auth for vault-less seller sessions | Secret export refuses unless an encrypted vault exists (re-auth = vault passphrase); sweep warns |
| OD-02 | Clipboard for raw keys; BTC/SOL/TRON seed reveal | No clipboard path for any new secret export; file download + held reveal only |
| OD-03 | Mythril release-gate policy | Build the keyed, source-matched disposition mechanism behind a disabled flag; releases stay blocked |
| OD-04 / OD-05 / OD-11 / OD-13 / OD-14 | Scheme-2 fee-token freeze, policy-hash linkability, L2 delays, 7702 clearing, FEE_RECIPIENT type | Scheme 2 / AA stay undeployed and experimental; no contract changes without a spec + review |
| OD-06 / OD-08 / OD-22 | Hosting origin, ADR-0029, extra distribution channels | Build refuses manifests on a shared origin (keep); harden the origin gate (SEC-09); no publication |
| OD-07 | Release trust roots | Payments disabled in default build; release fails closed; document the key ceremony |
| OD-09 | Passphrase floor for master/raw exports | New spec 18 exports enforce the stricter floor (generated diceware default, ≈80-bit estimate) |
| OD-10 | Spec 18 wording | Apply: user-selected RPC with no fallback, no telemetry, lean boundary enforced, deep-scan match exportable only after full derivation check; public record carries the announced viewTag; record in spec 18 for sign-off |
| OD-12 | Guardian recovery (ADR-0028) | No guardian code paths |
| OD-15 | #204 scope / merge order | Port #204 as a separate reviewable commit (section 8.1) |
| OD-16 / OD-17 / OD-20 | Locales, Shopify, scope beyond the EVM beta | Keep today's behaviour (unshipped languages already labelled, `LanguagePicker.tsx:19-23`); es/ar/ja stay marked as drafts; nothing promoted |
| OD-18 | Major dependency upgrades | Minor/patch only |
| OD-19 | Branch retirement | Delete/close nothing |
| OD-21 | Operator-run optional services | Stay optional/experimental, out of lean |
| OA-01..OA-07 | Branch protection/rulesets, merge #203, release keys, Sepolia broadcast, Pages source + gh-pages retirement, Pages deploy dispatch, security-inventory access | Prepare scripts/docs/checklists; never perform |
| EX-01..EX-07 | Real wallets, Firefox/WebKit/Tor/mobile, screen readers, native review, external audit, chain-matrix provider evidence, live nodes | Mark the matching verification gate "external pending"; continue other work |

## 11. Dependency order, waves and critical paths
Detail: `IMPLEMENTATION_SEQUENCE.md`, `FEATURE_DEPENDENCY_GRAPH.md`, `ws_registry.json` (106 items `WS-xx.n`; the
item-level dependency graph is acyclic — WS-level "Deps" in section 12 are roll-ups of item dependencies, so schedule
by item, never by whole workstream). Priority order is fixed: (1) security/correctness defects, (2) consolidation
regressions and drift, (3) shared foundations, (4) nearly complete features, (5) recoverable historical work, (6)
browser payment workflow prep short of owner broadcast, (7) key portability/recovery/privacy, (8) optional advanced,
(9) owner-gated qualification. Independent items run concurrently.

Waves (ESTIMATES, engineer-days, item counts):
- Wave 0 — Start / rebaseline  (Σ 0.7–1.5 d, 4 items)
- Wave 1 — Critical security + correctness defects  (Σ 8.75–17.55 d, 13 items)
- Wave 2 — Consolidation regressions + doc/code drift  (Σ 5.2–10.2 d, 7 items)
- Wave 3 — Shared foundations (spec 18 formats, step-up API, independent tool, CI)  (Σ 15.7–26.5 d, 6 items)
- Wave 4 — Nearly-complete features  (Σ 12.6–23.6 d, 14 items)
- Wave 5 — Recoverable historical work (#204, 57dcf7e8 harness, qr-colors hunk, dependency refresh)  (Σ 3.05–6.7 d, 4 items)
- Wave 6 — Core browser payment workflow prep, short of owner broadcast  (Σ 14.25–24.75 d, 9 items)
- Wave 7 — Key portability / recovery / privacy: K03-K06 + KC + independent recovery proofs  (Σ 24.75–39.5 d, 11 items)
- Wave 8 — Optional advanced (full-profile, operator, merchant; never blocks beta)  (Σ 50.95–102.1 d, 26 items)
- Wave 9 — Owner-gated release qualification (beta start, beta exit, release tag)  (Σ 6.4–14 d, 12 items)

Checkpoint timing with ≤ 6 workers (simulation, ESTIMATE; owner latency excluded):

| Milestone | lo | hi | Note |
|---|---|---|---|
| CP-0 | 0.75 | 1.6 | rebaseline |
| CP-1 | 4.24 | 8.35 | wave 1-2 closed |
| CP-2 | 11.6 | 18.7 | spec 18 format freeze + step-up API |
| CP-3 | 12.98 | 27.42 | nearly-complete features |
| CP-4 | 12 | 21.29 | beta engineering-ready |
| CP-7 | 16.13 | 28.36 | Sepolia static beta START — engineering only; + owner latency (OD-06/07/08, OA-01..06) |
| CP-5 | 24.98 | 40.98 | KC spec 18 |
| CP-8 | 26.03 | 43.08 | beta EXIT — + owner/external latency (B06, EX-01..03) |
| CP-9 | 17.95 | 35.58 | release-tag qualification — + OD-03, keys |
| CP-6 | 42.26 | 74.42 | all optional wave 8 merged (if OD-20/21 approve) |

Critical path to beta exit: WS-00 → WS-03.1 (K01) → WS-03.2 (K02) → WS-19.2 (independent decode) → CP-2 freeze →
WS-08.1 (K03) → WS-08.2 (K04) → WS-19.5 (independent K04 recovery proof on anvil) → CP-5 (KC) → B06 records (CP-8).
Critical path to Sepolia beta start (engineering side): WS-05.1 signing helper → WS-05.2 anvil rehearsal → WS-05.3
matrix revalidation → WS-24.4 → CP-4 → owner chain (OD-06 → OD-07 → OA-03 → OD-08 → OA-01 → OA-02 → OA-05 → OA-04 →
OA-06) → WS-05.4 evidence → WS-04.6 live smoke → CP-7.

Effort (ESTIMATE):

| Scope | Items | Σ est d (no review) | Σ incl. review | 
|---|---|---|---|
| Beta START path (CP-0, CP-1, CP-4, CP-7 + CP-2 SEC-14) | 39 | 32.9–62.25 | 37.14–70.11 |
| Spec 18 / beta EXIT (CP-2 rest, CP-5, CP-8) | 20 | 42.55–70.5 | 48.42–80.02 |
| Nearly-complete + recovered (CP-3) | 16 | 14.15–26.8 | 15.92–30.12 |
| Release-tag qualification (CP-9) | 5 | 1.8–4.75 | 2.03–5.39 |
| Optional wave 8, unblocked | 15 | 25.1–48.1 | 28.71–55.05 |
| Optional wave 8, scope-gated (OD-20/OD-21/OD-22/EX) | 11 | 25.85–54 | 29.07–60.81 |
| **All** | 106 | 142.35–266.4 | 161.3–301.51 |

- **Without parallelism** (one engineer, sequential, incl. review overhead + CP merges 5–10 d): all = 166.3–311.51 d; excluding scope-gated wave 8 = 137.22–250.7 d; beta start + exit scopes only = 90.56–160.14 d.
- **With parallelism** (≤6 workers + coordinator): beta start engineering-ready (CP-7 minus owner latency) 16.13–28.36 d; KC 24.98–40.98 d; beta exit 26.03–43.08 d; everything incl. scope-gated wave 8 42.26–74.42 d. Worker-days 154.6–287.41; coordinator-lane days 6.7–14.1 (+ CP merges).

### 11.1 Browser-beta readiness (separate from completion %)
Start gate (CP-7):

| ID | Item | State @7a620ff1 | Closed by |
|---|---|---|---|
| BR-01 | Shared-origin posture decided (SEC-01); payments refused on shared origin | OWNER — build already refuses manifests on a shared origin (build-pages.sh:60-69 VERIFIED by S) | OD-06 (dedicated origin rec.) ; ADR-0029 via OD-08 |
| BR-02 | Pages source = Actions; stale gh-pages `cc8d0794` retired (SEC-08) | OWNER / SUSPECTED live | OA-05 |
| BR-03 | Deployed-origin assertion in build/smoke/pages.yml (SEC-09, TB-03) | OPEN (declared origin trusted) | WS-04.1 + pages.yml via WS-20.1 (C-08) |
| BR-04 | main protection, v* tag ruleset, github-pages env reviewers (SEC-02) | UNVERIFIED (API 403) | OA-01 |
| BR-05 | False copy fixed: local proxy, wss, "hides/unlinkable" (SEC-10/19/28, E-17) | OPEN | WS-01.1, WS-02.1, WS-04.4 |
| BR-06 | Local-proxy path works under real CSP or removed; e2e under real meta CSP (SEC-10, TB-02) | OPEN (CSP blocks loopback; probe VERIFIED by E) | WS-01.1 |
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1 (default: refuse secret export, warn sweep) |
| BR-08 | Keystore v1 independent-decode vector in CI (SEC-15) | OPEN | WS-03.2 vector + WS-19.1 decoder + WS-20.2 job |
| BR-09 | Strict on-chain verifier for Pay/Scan/Sweep, CLI, relayer (G-NOTE-01) + dual-provider readback (F-WEB-17) | OPEN (single provider; no canonical-announcer / 25 bps check in browser path) | WS-24.2, WS-24.3 |
| BR-10 | No unsigned/legacy manifest path in any build (SEC-14) | OPEN (dead in default app, present in bundle) | WS-24.1 |
| BR-11 | Lean keeps scheme 2, relayer, BTC/SOL/TRON, 7702/4337 out | DONE (VERIFIED by D: CORE_ORDER, VITE flag) | keep localBuildProfile.test.mjs + AppLean tests green every CP |
| BR-12 | Lean payer buffer behaviour == docs (TB-07) | OPEN (docs say no buffer; lean offers it) | WS-04.4 docs + WS-10.1 lean test (default keep buffer) |
| BR-13 | Release key ceremony; signed Sepolia manifest passes validate-deployments + runtime read-back (SEC-32, SEC-44) | OWNER (0 keys; RELEASE_PUBLIC_KEYS empty) | OD-07 → OA-03; WS-05.1 helper + denylist; WS-05.4 |
| BR-14 | Authentic Sepolia deployment from exact reviewed source; codehash read-back; canonical announcer; FEE_RECIPIENT accepts ETH (SEC-36) | OPEN (rehearsal tooling exists) | WS-05.2 rehearsal → OA-04 broadcast → WS-05.4 (+ CLI 2nd impl WS-17.1); OD-14 |
| BR-15 | Sepolia matrix cells evidenced; strict all-enabled gate unchanged (B04) | OPEN | WS-05.3 revalidation + WS-05.4 ingestion |
| BR-16 | Exact-SHA CI 24/24, Echidna, Slither, Foundry green; Mythril shows no record beyond the 11 (SEC-33) | PARTIAL: 7a620ff1 CI 44242366118 24/24, Echidna green, Mythril 11 dispositioned (packet) | CP-7 re-run on beta SHA; WS-06.1 report-only keyed comparison |
| BR-17 | Pages SHA256SUMS attested + signed checksums out of band (SEC-02/43) | OPEN | WS-20.5 + OA-03 |
| BR-18 | Extended egress smoke: every lean view + fixture invoice, no off-site request (SEC-46) | OPEN (smoke idles home 3 s) | WS-04.5 local, WS-04.6 live |
| BR-19 | Firefox + Tor Browser Standard/Safer manual run, KDF time recorded (SEC-41) | OPEN / UNVERIFIED | EX-02; WS-18.2 KDF progress text; WS-17.2 records |
| BR-20 | ADR-0029 Accepted | OWNER ("Proposed") | OD-08 (after OD-06, OD-07) |
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | OWNER | OA-01 then OA-02 |
| BR-22 | Pages dispatch (main-only, deploy=true) + live smoke on the real origin (B05) | OWNER | OA-06; WS-04.6 |
| BR-23 | B06 start subset on Sepolia: invoice → pay native + ERC-20 → scan → receipt → sweep → backup/restore | OPEN | WS-17.3 records; EX-01 wallets, EX-02 browsers |

Exit gate (CP-8) = start gate +:

| ID | Item | State @7a620ff1 | Closed by |
|---|---|---|---|
| BX-01 | Spec 18 K01–K06 implemented + KC on one exact SHA (SEC-04, req 3q) | NOT STARTED (VERIFIED: no K-module in tree) | WS-03, WS-08, WS-25, WS-09 → CP-5 |
| BX-02 | Independent GhostPay-free recovery: decode + anvil spend proof (SEC-04, TB-05) | OPEN (CLI scans, cannot derive/sweep) | WS-19.1–19.5 |
| BX-03 | Re-auth model decided and built for vault-less sellers (SEC-03, TB-04) | OPEN | OD-01; default (a) built in WS-07.1/07.2 |
| BX-04 | Passphrase high tier for new exports; owner floor for existing flows (SEC-05) | OPEN (score ≥ 2, 14 chars) | WS-18.1 default; OD-09 for existing flows |
| BX-05 | Single-keypair envelope shares keystore primitive, new AAD domain, bytes-built plaintext (SEC-37) | OPEN | WS-03.2 |
| BX-06 | Keystore doc drift fixed (SEC-15) | OPEN (byte-layouts.md:195-198) | WS-03.2 |
| BX-07 | Browser tests: no secret in fetch/URL/log/storage/clipboard for every export flow | OPEN | WS-08/WS-25/WS-09 e2e + privacyInvariants (WS-01.2) |
| BX-08 | Firefox/WebKit Playwright where supported (C-06) + mobile download/import recorded | OPEN | coordinator at CP-5 (playwright.config.ts) + EX-02 |
| BX-09 | B06 full: incl. 3q export + independent recovery on Sepolia; screen reader row | OPEN | WS-17.3; EX-01/02/03 |

Count: 23 start + 9 exit items; 24 engineering-open/partial, 6 owner-only, 1 done (BR-11), BR-04 UNVERIFIED.

## 12. Workstreams, agents and ownership
Detail: `PARALLEL_AGENT_EXECUTION_PLAN.md` (one card per workstream with objectives, items, owned paths, tests,
handoff additions) and `ws_registry.json`. **Naming:** wherever the plan says `ws/WS-00-integration`, it means your
designated development branch (the integration branch; the only branch you push). Workers use local branches
`ws/<WS-ID>-<slug>` in worktrees `../wt/<WS-ID>`; commits `<WS-ID>.<n>: <imperative summary>` with the session's
attribution trailers. One coordinator (strongest tier) owns integration, coordinator-owned paths, checkpoints and the
evidence ledger `docs/handoffs/next-phase-20261118/` (BASELINE.md, WS_STATUS.md, CP-n.md); it executes only WS-00,
WS-20 and WS-22 and never implements product features or reviews its own work.

| WS | Name | Exec | Impl/Review tier | Deps (WS) | CPs | Est d | Unblocked | Owner gate |
|---|---|---|---|---|---|---|---|---|
| WS-00 | Rebaseline + integration start (coordinator) | coordinator | strongest/strongest | - | CP-0 | 0.75–1.6 | all | - |
| WS-01 | Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI | worker | mid/strongest | WS-00 | CP-1,CP-9 | 3.15–6.25 | partial | OD-07 |
| WS-02 | Honest copy + doc drift (TB-10, E-17, E-08) + regression scripts (TB-06) + recovered harness/doc hunk | worker | mid/mid | WS-00 | CP-1,CP-3 | 4.15–8.8 | all | OD-20,OD-16,OA-04 |
| WS-03 | Spec 18 core formats: K01 schemas + verified derivation, K02 single-keypair envelope (+F-KEY-13 later) | worker | strongest/strongest | WS-00,WS-18 | CP-2,CP-6 | 9.6–14.75 | all | OD-10,OD-09 |
| WS-04 | Pages origin gate (TB-03) + bundle/egress checks + static-beta deploy prep (F-WEB-21) | worker | mid/strongest | WS-00,WS-01,WS-05,WS-20,WS-24 | CP-1,CP-4,CP-7 | 3.6–7.25 | partial | OA-02,OD-08,OD-06,OD-07,OA-01,OA-05,OA-06 |
| WS-05 | Deployment of record: manifest signing helper, anvil rehearsal, matrix revalidation, B02-B04 evidence | worker | strongest/strongest | WS-00 | CP-1,CP-4,CP-7 | 6.75–12.5 | partial | OD-07,OD-14,OA-04,OD-08,OA-03 |
| WS-06 | Mythril keyed disposition mechanism (OD-03 option a prototype) + analyzer extensions (D-12) | worker | strongest/strongest | WS-00 | CP-4,CP-6,CP-9 | 4.75–9 | partial | OD-03,OA-01 |
| WS-07 | Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05) | worker | strongest/strongest | WS-00 | CP-1,CP-2 | 2.95–6 | all | OD-01 |
| WS-08 | Spec 18 K03-K04: Payment details export UI (public + encrypted keypair), raw single-key export | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-18,WS-19,WS-25 | CP-5 | 10.25–16.5 | all | OD-01,OD-02 |
| WS-09 | Spec 18 K06: encrypted master spend/view backup; legacy keystore v1 unchanged and distinct | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-18,WS-19 | CP-5 | 6.75–9.75 | all | OD-09,OD-01 |
| WS-10 | Payer UX + v2 buffer journey + fiat guards (TB-07 lean test) | worker | mid/strongest | WS-00,WS-02,WS-04 | CP-3,CP-6 | 6.9–12.2 | all | - |
| WS-11 | Scanner reorg cross-check + CLI/relayer evidence + CLI backup independent decode | worker | mid/strongest | WS-00,WS-19 | CP-3 | 2.2–4.45 | all | - |
| WS-12 | Accessibility + i18n enforcement + #201/#202 browser-regression recheck | worker | mid/mid | WS-00 | CP-1,CP-3,CP-6 | 7.6–14.25 | partial | OD-20,OD-16 |
| WS-13 | Hosting/ops verification: digest pins, HSTS at terminator, Tor image, compose/header checks | worker | mid/strongest | WS-00,WS-01,WS-05 | CP-6,CP-9 | 4–9.5 | partial | OD-07,OD-22,OD-06,OA-04 |
| WS-14 | Full-profile chains: TB-08 SOL/TRON meta-address format consolidation, seed-reveal parity, BTC regtest | worker | strongest/strongest | WS-00,WS-07 | CP-6 | 13.25–25.5 | partial | OD-20,OD-02 |
| WS-15 | Merchant/integration/SDK (scope-gated, OD-20/OD-17) | worker | mid/mid | WS-00,WS-23 | CP-6 | 14.75–28.6 | partial | OD-20 |
| WS-16 | Optional operator services (OD-21) + pool-sdk backup KDF parity (SEC-16) | worker | mid/strongest | WS-00,WS-18 | CP-6 | 12.75–27.5 | partial | OD-21 |
| WS-17 | Device/browser evidence records + CLI post-B02 cross-check + B06 run records | worker | cheap/mid | WS-00,WS-04,WS-05,WS-08,WS-09,WS-19,WS-25 | CP-7,CP-8 | 1.5–3 | none | OA-04 |
| WS-18 | Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05) | worker | strongest/strongest | WS-00 | CP-1 | 2–4 | all | OD-09 |
| WS-19 | Independent GhostPay-free recovery tool (spec 18 / req 3q; SEC-04, TB-05) | worker | strongest/strongest | WS-00,WS-03,WS-08,WS-09,WS-25 | CP-2,CP-5 | 5–9.5 | all | - |
| WS-20 | CI/release pipeline: release verify anvil policy (TB-01), test-gap wiring (TB-09/TB-06), CI speed, attestation | coordinator | strongest/strongest | WS-00,WS-02,WS-19,WS-22 | CP-1,CP-2,CP-7,CP-9 | 4.45–9 | partial | OA-07,OD-07,OA-03,OA-01 |
| WS-21 | Lean shell hardening: anti-framing guard, opener nulling, sanitized root error handlers | worker | mid/strongest | WS-00 | CP-4 | 0.75–1.5 | all | - |
| WS-22 | Repo tooling + dependency refresh: #204 port (OD-15 default), minor/patch refresh (OD-18 default) | coordinator | strongest/mid | WS-00 | CP-1 | 1.5–3.5 | all | OD-15,OD-18 |
| WS-23 | Local data privacy: confirmed erase-all + linkable storage identifiers pseudonymized (SEC-23, SEC-22) | worker | strongest/strongest | WS-00,WS-01,WS-07,WS-10 | CP-5 | 3–6 | all | - |
| WS-24 | Strict on-chain verifier for web/CLI/relayer + dual-provider readback + registry pin; legacy manifest path removed | worker | strongest/strongest | WS-00,WS-05 | CP-2,CP-4 | 6.75–11.25 | all | OD-07,OA-04 |
| WS-25 | Spec 18 K05: encrypted bounded bulk archive of validated one-time keys (format, import, panel) | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-08,WS-18,WS-19 | CP-5 | 3.25–4.25 | all | - |
| WS-90 | Experimental (45) + future (43): keep separate / defer | none | cheap/mid | - | - | 0–0 | all | OD-04,OD-05,OD-11,OD-12,OD-13,OD-20,OD-21,OD-22,OD-17 |

Coordinator-owned paths (workers request changes via one `coord-request(<WS>)` commit):
`package-lock.json`, `package.json`, `tsconfig.base.json`, `.github/workflows/**`, `.github/dependabot.yml`, `.github/actions/**`, `CLAUDE.md`, `AGENTS.md`, `docs/ai/**`, `apps/web/src/App.tsx`, `apps/web/src/AppLean.tsx`, `apps/web/src/AppShell.tsx`, `apps/web/locales/**`, `apps/web/playwright.config.ts`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/vitest.nocov.config.ts`, `eslint.config.js`, `docs/handoffs/**`, `.claude/skills/**`, `scripts/agent/**`, `docs/adr/README.md`, `packages/ux-vault/src/portable.ts`, `packages/ux-vault/src/index.ts`

- coord-request: ONE separate commit `coord-request(<WS>): <why>` in the worker branch: append-only hunks (new i18n keys at the end of the relevant object in `apps/web/locales/en.json` + same keys in es/ar/ja marked draft, route-table line, barrel export line, workspace script line). Never reformat, never dependencies/lockfile (dependency changes: recovery §9.6). Coordinator re-applies or merges it and owns conflicts.
- A path no active WS owns in a window is coordinator-merged the same way.

Exclusive ownership:
- `owned_paths` are exclusive while the WS is active; transfer only by `handover_in` at a CP (registry). Validator `check_ownership()`: 0 overlaps among WS active in the same window, 0 worker overlaps with coordinator paths (VERIFIED by run; negative test with injected overlaps detected 80 conflicts).
- Frozen, nobody owns: `packages/contracts/src/**`, `packages/core-crypto/src/**`, `test-vectors/scheme1.json`.
- Reading any file is free. Needing to edit a non-owned path = STOP + handover request (recovery §9.2).

Concurrency (≤ 6 workers + coordinator lane), planned windows:

| Window → CP | Workers (≤6) | Coordinator | Gate to close |
|---|---|---|---|
| start → CP-0 | — (none) | WS-00.1–00.5 | G-FULL baseline recorded |
| CP-0 → CP-1 | WS-01, WS-02, WS-04, WS-07, WS-18, WS-03 (K01, merges CP-2); as slots free: WS-05.1, WS-12.1, WS-24.1, WS-19.1 | WS-22.1 #204 port, WS-20.1 TB-01, WS-22.2 deps refresh (quiet branch, before CP-1 gate) | all wave-1 items merged; wave-2 items that are ready |
| CP-1 → CP-2 | WS-03 (K02), WS-19 (19.1, 19.2), WS-07 (07.2), WS-05 (05.2…), WS-24 (24.1, 24.2…), WS-10 or WS-11 (fill) | WS-20.2 wiring, WS-20.3 CI speed | FREEZE: K01/K02 + step-up API + independent decode of v1/K01/K02 vectors; second strongest reviewer sign-off |
| CP-2 → CP-3 / CP-4 | WS-08 (K03), WS-09 (K06), WS-25 (K05 format), WS-24 (verifier, readback, pin), WS-05 (rehearsal, revalidation), one of WS-10/11/12/04.5/21/06.1/02.7 | — | CP-3: wave-4 merged; CP-4: beta engineering-ready (gate=start items) |
| CP-4 → CP-5 | WS-08 (K04, mount), WS-09, WS-25.2, WS-19 (19.3→19.5), WS-23, WS-12 (allowlist → 0) | Firefox/WebKit projects (C-06) in playwright.config.ts | KC on one exact SHA (CP-5 gate) |
| CP-4 + owner → CP-7 | WS-05.4, WS-04.6, WS-17.1 (when OA-04 / OA-06 happen) | WS-20.5 attest, WS-20.4 alert inventories (OA-07) | Sepolia static beta START |
| CP-5 → CP-6 | WS-03.3, WS-06.2, WS-10.6, WS-12.6/12.7, WS-13, WS-14, WS-15, WS-16 (≤6, priority: confirmed defects first: WS-14.1/14.2 TB-08, WS-16.1 SEC-16, WS-14.3 SEC-13) | WS-20 nightly upkeep | optional; never blocks CP-7/CP-8 |
| CP-5 + CP-7 → CP-8 | WS-17.2, WS-17.3 (records) | evidence ledger | beta EXIT |
| CP-7 → CP-9 | WS-01.3, WS-06.3, WS-13.5, WS-13.6 | WS-20.6 rehearsal runbook (owner executes) | release-tag qualification |

Ready-queue order:
1. Wave-1 items and critical-path items (WS-03.1/03.2, WS-18, WS-08.1/08.2, WS-24.2/24.3, WS-19.2/19.5). 2. Wave-2 items and any `gate=start|exit` item. 3. Remaining waves 3–7, 9 by wave. 4. Wave 8, confirmed-defect fixes first. Tie-break: longer downstream chain first. Never start an item whose owned paths are held by another active WS or whose deps have not rolling-merged.

Independent reviewer rules:
- Reviewer ≠ author agent, ≠ same agent instance, ≠ coordinator for coordinator WS. One review per item before merge.
- Tier: strongest for crypto / security / integration (RV-CRYPTO: WS-03, 07, 08, 09, 14, 16.1, 18, 19, 23, 25; RV-SEC: WS-01, 04, 06, 21; RV-REL: WS-05, 20, 24; RV-WEB: WS-10, 11, 24); mid for docs/tests/ops (WS-02, 12, 13, 15, 17, 22).
- Clean-room: WS-19 author and reviewer must not have authored WS-03/08/09/25 code; reviewer checks inputs = spec 18 text + vectors only.
- Two-key points: CP-2 format freeze and CP-5 KC need a second, separate strongest reviewer (independent secret-flow review, NEXT_PHASE_QUEUE KC).
- Inputs: diff vs base, owned-paths check output, handoff block, test transcripts. Reviewer re-runs at least the WS card test commands for touched areas.
- Output: APPROVE | CHANGES (blocking findings, `path:line`, severity) | ESCALATE (security finding → coordinator, private). Reviewer never commits to the author branch.
- Blocking always: secret in logs/URL/storage/clipboard/telemetry; new network egress or fallback request; weakened gate/verifier/CSP; frozen-path diff; lean bundle importing relayer/operator/CLI runtime; unbounded parser; partial-state import; test deleted/skipped without coordinator approval.

Handoff block (every item; coordinator appends to `docs/handoffs/next-phase-20261118/ws/<WS-ID>.md`):
```text
HANDOFF <WS-ID> items=<ids> agent=<tier> date=<utc>
branch=ws/<WS-ID>-<slug> head=<sha> base=<integration sha>
done=<item ids + one line each>   not-done=<ids + reason + fail-closed default applied>
files=<git diff --name-only base..head>   within-owned=<yes|no>   coord-request=<sha|none>
tests=<exact command> -> <exit> <passed/failed/skipped>   (one line per command)
security=<invariants checked; secrets/egress/clipboard/logs; reviewer tier required>
evidence=<VERIFIED/INFERRED/UNVERIFIED lines>   risks=<...>   next=<...>
ws-specific=<see WS card "Handoff +">
```

Checkpoint gate G-FULL (run on the exact SHA being qualified; record exit codes and counts):
```bash
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
npm run typecheck
npm run lint
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
ANVIL_BIN=$(command -v anvil) SOLC_BIN=$SOLC_0828 REQUIRE_ANVIL=1 npm test -w apps/web -w packages/chain-adapters -w packages/policy-scheme
ANVIL_BIN=$(command -v anvil) REQUIRE_ANVIL=1 npm test -w apps/relayer
ANVIL_BIN=$(command -v anvil) npm test -w packages/confidential-contracts   # hardhat; needs binaries.soliditylang.org (blocked here: HH502)
npm test $(npm query .workspace | jq -r '.[].location' | grep -vxE 'apps/web|apps/relayer|packages/chain-adapters|packages/policy-scheme|packages/confidential-contracts' | sed 's/^/-w /') --if-present
node --test scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs scripts/pages/*.test.mjs apps/web/scripts/localBuildProfile.test.mjs
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web           # postbuild = scan-bundle
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test)     # baseline 66 passed / 3 skipped
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=full npx playwright test)     # baseline 78 passed / 1 skipped
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
npm run ci:scan-secrets
npm run ci:check-actions
git diff --exit-code "$START" -- packages/contracts/src packages/core-crypto/src test-vectors/scheme1.json   # frozen paths
```
Never set `REQUIRE_ANVIL=1` globally (TB-01). Install Foundry 1.8.5 and solc 0.8.28 from their GitHub release
tarballs if `foundry.paradigm.xyz` / `binaries.soliditylang.org` are blocked (verified workable in the audit).
`packages/confidential-contracts` (hardhat) may stay CI-only.

| CP | Meaning | Gate = G-FULL + |
|---|---|---|
| CP-0 | Rebaseline: start commit fixed, toolchain, baseline gates recorded | baseline only (record, no pass/fail judgement beyond reproducing CI 44242366118 counts) |
| CP-1 | Wave 1-2 closed: critical security/correctness defects + consolidation regressions + doc drift; #204 tooling ported; minor/patch deps refreshed | `node --test scripts/agent/workspaces.test.mjs` (#204 port); `npm audit --omit=dev --audit-level=high` + lean bundle diff (deps refresh); `node --test scripts/tests/privacy-claims.test.mjs`; `GHOSTPAY_CHROMIUM=<chromium> node apps/web/scripts/test-reconciliation-idb.mjs`; origin-gate negative tests (WS-04); wss grep empty (WS-01); TB-01 release verify local repro (WS-20.1) |
| CP-2 | Spec 18 format freeze (K01/K02) + step-up API (WS-07.2) + shared foundations (independent tool, CI wiring/speed) | `node --test tools/independent-recovery/test` (v1 golden, K01, K02 vectors decoded without GhostPay code); `(cd packages/ux-vault && npx vitest run src/portable-parity)` byte-identical v1; refusal matrix tests (WS-07); second strongest reviewer sign-off; new nightly job definitions pass `node --test scripts/tests/workflows.test.mjs` |
| CP-3 | Wave 4 nearly-complete features + wave 5 recovered harness/doc hunk | `npm run build:cli && npm run test:compiled -w @ghostpay/cli`; relayer `REQUIRE_ANVIL=1`; a11y specs lean+full 0 serious/critical; seller-vault harness |
| CP-4 | Browser beta engineering-ready (waves 5-6): strict verifier, dual readback, rehearsal, smoke, shell hardening | `bash scripts/qualify-lean.sh <abs new dir>` (two clean builds identical); local Pages artifact build + `serve-pages.mjs` + `smoke.mjs --commit` extended walk; `bash scripts/testnet/deploy.sh sepolia rehearse`; `node scripts/check-chain-matrix.mjs`; Mythril report-only comparison (WS-06.1) = 11 matched, 0 new (CI run id, else UNVERIFIED) |
| CP-5 | KC: spec 18 K01-K06 acceptance on one exact integrated SHA (+ independent recovery proof) | all spec 18 suites + e2e lean/full; Firefox/WebKit where supported; `node --test tools/independent-recovery/test` incl. anvil K04 spend + K06 omitted-announcement recovery; literal allowlist = 0; independent secret-flow review signed; frozen-path diff empty |
| CP-6 | Wave 8 optional advanced merged (never blocks CP-7/CP-8) | per optional WS card tests; integration.yml regtest/docker parity where run; lean guard tests green (nothing optional leaks into lean) |
| CP-7 | Sepolia static beta START qualification (owner-gated: OD-06/07/08, OA-01..06) | exact-SHA CI 24/24 + Pages/Beta/Integration/Hosting/CLI-operator/CodeQL green (run ids from the pushed integration branch's draft PR); `GHOSTPAY_RELEASE_PUBKEYS=<owner key> node apps/web/scripts/validate-deployments.mjs`; Pages build with signed manifests; live `node scripts/pages/smoke.mjs <url> --commit <sha>` incl. origin assertion; attestation present; BR-01..BR-23 closed or owner-accepted in writing |
| CP-8 | Beta EXIT qualification: CP-5 + B06 acceptance incl. 3q export + independent recovery on Sepolia | beta SHA == KC SHA or KC re-run on beta SHA; B06 records complete (WS-17.3); BX-01..BX-09 closed |
| CP-9 | Release-tag qualification (owner-gated: OD-03, OD-07/OA-03 keys, OA-01 tag ruleset); mainnet out of scope | owner: signed pre-release tag rehearsal in sandbox (WS-20.6 runbook), OD-03 recorded, keyed gate enabled (WS-06.3), allowed_signers populated; agents never create tags |

## 13. Acceptance criteria and CI gates
Per-feature measurable criteria: `FEATURE_ACCEPTANCE_CRITERIA.md` (every unfinished ID). Global rules:
- **Implementation complete** = all weighted requirements of the row implemented on the intended surface (lean vs
  full profile as specified), unit/integration tests added and passing, independent review passed, docs updated.
- **Release qualified** (not achievable in this session) = implementation complete + exact-SHA CI green + analyzers
  + external acceptance rows + owner gates for the scope.
- Spec 18 K01–K06 + KC must reuse the primitives listed in
  `docs/handoffs/consolidation-20261118/NEXT_PHASE_QUEUE.md` (stealth.ts `deriveStealthSecret` / `checkAnnouncement`,
  chain-adapters `addressOfSecret`, ux-vault `keystore-portable.ts` scrypt/AES-GCM bounds and AAD pattern with a NEW
  format id and AAD domain, keyVault step-up, session guards, `downloadText`/`downloadBlob`, secret-box `wipe`); K04
  requires an independent recovery proof with a pinned external tool (Foundry `cast`/`anvil` 1.8.5) on synthetic keys;
  K06 requires offline recovery of a historic announcement omitted from the payment archive; legacy keystore v1 stays
  byte-compatible.
- Checkpoint gate (every CP and before each push): `npm run typecheck`; `npm run lint`; `npm test`; lean + full web
  builds; Playwright lean + full; `forge test` in `packages/contracts` when contracts or tooling changed;
  `npm run ci:scan-secrets`; `npm run ci:check-actions`; `node --test` script suites touched; then the PR's GitHub CI
  green on the pushed head. Contract changes additionally need Slither/Echidna CI green and a Mythril record diff
  showing no new record.

## 14. Integration procedure (coordinator only)
1. Workers commit only on their local task branch `ws/<WS-ID>-<slug>` in their own worktree, only inside owned paths.
   Shared files (package-lock.json, root package.json, tsconfig.base.json, .github/workflows/*, CLAUDE.md, AGENTS.md,
   docs/ai/ACTIVE_WORK.md, i18n catalogs, apps/web/src/App*.tsx route tables) are coordinator-owned: workers send a
   patch request in their handoff instead of editing.
2. A milestone is "qualified" only when: its acceptance criteria (section 13) pass at the worker head, an
   independent reviewer agent (never the author) has reviewed the diff with the security checklist, and the
   coordinator re-runs the affected tests after merging into the integration branch.
3. Merge worker branches into the integration branch with `git merge --no-ff` (never squash shared history), one
   workstream at a time; re-run affected package tests + typecheck after each; full suite at each checkpoint.
4. Push the integration branch at every checkpoint. Draft PR base: `main` if PR #203 merged; otherwise stack on
   `nodata/wizardly-allen-qwol6u` and say so in the PR body. Mirror the repository PR template if one exists.
5. Never merge red. If CI fails, diagnose the first error, fix forward on the integration branch, re-run.
6. Re-census the open PRs/branches each checkpoint: new commits from external writers (the ChatGPT `chatgpt/zero-codex/*`
   rotation is an active writer) are evaluated for recovery, never blindly merged.

## 15. Durable handoffs
After every qualified milestone and before any context-heavy step, update `docs/ai/HANDOFF.md` and the workstream
section of `docs/ai/ACTIVE_WORK.md` on the integration branch and push. Each handoff records: integration branch +
HEAD SHA + tree; START_SHA; workstreams done/in-progress/blocked with their head SHAs; exact commands run and
pass/fail counts; CI run ids; remaining defects with severity; owner decisions pending; the next 3 concrete actions.
Workers end with a handoff block in Caveman format: TASK | SCOPE | CONSTRAINTS | RESULT | EVIDENCE | BLOCKERS plus
their branch head SHA.

## 16. Recovery procedures
Detail (failing tests, conflicts, blocked features, context exhaustion, CI unavailable, dependency changes, vulnerabilities, estimate overrun, bad merge): `PARALLEL_AGENT_EXECUTION_PLAN.md` §9.
- Failing test: reproduce locally, read the first error, form one hypothesis, minimal fix + regression test. Never
  skip/weaken the test. Two failed attempts on one hypothesis: escalate to a fresh stronger-model agent with the
  evidence.
- Merge conflict: integration-owner resolves; prefer the newer verified behaviour; re-run both sides' tests;
  document the resolution in the merge commit body.
- Blocked feature (owner decision, missing external dependency): implement the decision-independent parts behind a
  disabled flag or as library code with tests; mark BLOCKED with the exact unblock action; continue to the next item.
- Context exhaustion: write the handoff (section 15) first, then continue; after compaction re-read ACTIVE_WORK.md
  and HANDOFF.md before acting.
- CI unavailable: run the equivalent local commands, record "local only", keep the gate open until CI confirms.
- Dependency change: only the coordinator edits lockfiles; justify each new dependency (maintained, pinned exact
  version, licence recorded in THIRD_PARTY.md); prefer existing dependencies.
- Discovered vulnerability: stop the affected workstream, record severity/evidence, fix with a regression test
  before resuming; Critical/High blocks every dependent milestone; never disclose secrets in logs or PR text.

## 17. Final completion criteria and report
Stop only when every technically unblocked item in sections 7–10 is implemented, independently reviewed, integrated
and green on the integration branch, and every remaining item is BLOCKED with an exact owner/external action.
Do not declare success while any required test or security gate is red or unrun. Final report: START_SHA,
integration HEAD, PR link, items completed with evidence, items blocked with unblock action, gates status table,
remaining risks, owner decisions, and the next prompt if work remains.
