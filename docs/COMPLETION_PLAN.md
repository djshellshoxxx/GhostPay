# GhostPay completion plan

Written 2026-10-22 against commit `3519171`. Companion to `docs/HANDOFF.md` (state, lessons, resume steps).
Sizes: S = a few agent-hours, M = a day of swarm work, L = several days or needs a human gate. Percentages are the
author's estimate, not tracked by the repo. "H" marks work that only a human (owner) can do.

Overall: ~80% of the engineering build, ~50% of a launch-ready product. The remaining 50% is mostly
verification, integration, the user-facing layer (QR, mobile, accessibility, translations, receipts) and gates that
need real money, real devices, outside reviewers and legal decisions.

---------------------------------------------------------------------------------------------------------------

## Phase 0: stabilise what is in flight (S)

**What remains:** three workflows still editing the tree (audit P0 fixes, passphrase/QR libraries, UX foundation).
CI on recent `wip:` commits is red or cancelled by design.

**How:**
1. Let each workflow finish its integrator/review stage; read `docs/audits/05-p0-fixes.md`,
   `05-p0-fix-review.md`, `05-passphrase-qr-review.md`, `05-ux-foundation-review.md`.
2. Run the clean-state check yourself: `rm -rf packages/*/dist apps/web/dist && npm ci --ignore-scripts &&
   npm run build:libs && npm run typecheck && npm run lint && npm test`, plus `forge test/fmt/snapshot` in each
   contracts package, web build (delete a stray `apps/web/public/deployments/31337.json` first) and Playwright.
3. Add every web-imported new package (`qr-exchange`, `payment-uri`, ...) to `build:libs` in dependency order.
4. Fix remaining red at the root cause. Never weaken or skip a test.
5. Obtain one **uncancelled** green CI run and Integration run. Stop pushing for about 8 minutes to get it, and check
   the real jobs (not only the `typescript`/`contracts` gates) so a skipped-jobs false green cannot slip through.

**Done when:** CI + Integration green on one commit, all jobs actually executed, reviews show no "broken" items.

---------------------------------------------------------------------------------------------------------------

## Phase 1: finish the security work (M, then L for the human gate)

**What remains (from `docs/audits/05-full-audit.md` section 9):**
- P0 verification: confirm each fix closes its exploit (the delta reviewer does this; repeat for anything "partial").
  Items: PayJoin sender-amount trust, paymaster signature/gas fields, pool-relayer gas cap, Solana duplicate memo and
  fail-open `trustedToken`, duplicate-send after error, scan window/checkpoint/pending-payment bugs, manifest
  verification in every flow, CI coverage of fund-holding contracts, `eval` in `verify-sources.sh`.
- P1 (before mainnet): privacy (BTC scan leaks outputs to Esplora; EVM scan leaks which announcements are yours;
  BTC sweep consolidates by default; missing destination-reuse warning), BTC scanner per-outpoint mapping, relayer
  hardening (budget draining, lane exhaustion, fee re-validation, breaker on stalls, monitor liveness), wallet
  safety (lookalike check against owned addresses, token allowlist in `verifyReceipt`), release chain (real
  `git verify-tag`, gate `pages.yml`, digest-pin Docker images, pin `RELEASE_KEY`, include the manifest in the
  hashed release), origin isolation for hosting, strict TRON protobuf, manifest freshness.
- P2 hygiene and the docs that overclaim (`DOCS-CLAIMS-*`).
- Tools not yet run: Echidna, Mythril, mutation testing in CI nightly, default-profile fuzz, circomspect, real
  trusted-setup ceremony (pool verifiers must never hold value with dev keys).

**How:** same pattern that worked: one fixer per package with ownership boundaries, regression test that fails
first, integrator, opus adversarial reviewer, then a **re-audit of the delta only** (not a full audit) with skeptic
verification. Repeat per tranche (P1a privacy, P1b relayer/BTC, P1c release chain/hosting).

**Human gate (L):** an independent professional audit of contracts + crypto + web, before any real funds.
The AI audits are inputs to that, not substitutes.

**Done when:** no open High/Critical; all Medium fixed or accepted with written reasons; external audit report
received and its findings closed.

---------------------------------------------------------------------------------------------------------------

## Phase 2: user-facing product features (L)

### 2a. Passphrase protection
- Library (running): `A256GCM-PW` invoice envelope with bounded scrypt. **Remaining:** UI on invoice creation and
  payment (prompt, strength hint, "share the passphrase separately" guidance), error states, and a re-prompt before
  sweeps ("spending gate"): keep seller keys encrypted at rest in IndexedDB under the keystore passphrase, unlock on
  demand, auto-lock after idle, require passphrase step-up for each sweep.
- How: wire `parseFragment`'s `needsPassphrase` result into Pay; add a vault/unlock component and session changes;
  tests for wrong passphrase, lockout/backoff (client-side only; say plainly it is not rate-limited server-side).

### 2b. QR everywhere + camera scanning
- Foundation (running): colour-coded `QrFrame`, `qr-exchange` (multipart + scanner), `payment-uri`.
- **Remaining wiring, per screen:** Create (invoice link + PW link), Pay (payment request QR per chain + scan an
  invoice), SellerKeys (meta-address, encrypted backup as secret multipart QR), Sweep (destination scan, confirm),
  Settings (my-devices QR for RPC list and pinned signers), Registry, BTC/Solana/Tron views, proof/receipt QR.
- How: one wiring agent per screen group; shared `kindForPayload` helper; every QR gets a text alternative and a
  copy button; camera is opt-in per click, stops on completion, nothing is logged.
- Testable here: unit tests, Playwright with a virtual camera/canned frames, fixtures from the spec vectors.
  **H:** real phone scanning (iOS Safari/Android Chrome camera permission flows differ) and glare/size tests.

### 2c. Receipts, bills, printing, matching
- Not built. Design needed (ADR): a receipt = invoice digest + chain + tx hash + amount + time, signed by the seller's
  invoice-signing key; a payer-side "proof of payment"; bill = invoice with a printable layout.
- Invoice-to-payment matching (audit gap G-04): on-chain data has no invoice id. Options to decide: put a short
  invoice reference into announcement metadata (leaks linkability across invoices) or match locally by nonce+amount+
  window (private, less exact). Recommend local matching first.
- Printing: print stylesheet (groundwork in Phase A), QR for short invoices, warn that a printed bearer link is
  readable by anyone who sees it; prefer passphrase-protected links for paper.
- How: ADR, library (`receipt` module in invoice-schema or new package), UI, print CSS, tests, docs.

**Done when:** each feature has tests, a user guide, and honest limits documented.

---------------------------------------------------------------------------------------------------------------

## Phase 3: mobile, accessibility, translations (L)

**What remains:** phase A builds tools; nothing is applied to the views yet.
1. Apply the responsive base to every screen; fix overflow/targets found by the Playwright matrix
   (chromium/firefox/webkit x Pixel, Galaxy small, iPhone SE/15 Pro Max, iPad Mini/Pro, Windows tablet, 400% zoom).
2. Accessibility pass to WCAG 2.2 AA: axe on every route, keyboard traversal, labels/errors/live regions,
   focus management on route and dialog changes, forced-colors and reduced-motion, large-text reflow.
3. i18n conversion: replace hard-coded strings with keys view by view; extract; run `scripts/i18n/check`;
   machine-translate to the 24 registered languages (haiku agents, one per language, with a glossary for terms like
   "stealth address", "meta-address", "sweep", "bearer link" so they stay consistent); verify placeholders/plurals/RTL;
   pseudo-locale overflow tests; locale picker with the "needs native review" flag.
4. Lynx/w3m: noscript explanation + static help pages (the app itself cannot run without JS and Web Crypto).
5. AR/other viewers: large targets, no hover-only UI, voice-friendly accessible names, no fixed-pixel layouts.

**How:** per-screen agents plus a rotating reviewer; CI job `crossbrowser.yml` as the gate.
**H:** native-speaker review per language (start with the 5 most used), real-device and screen-reader testing
(VoiceOver, TalkBack, NVDA), usability sessions, AR headset trial if that audience matters.

**Done when:** automated matrix green; manual test plan executed and recorded; translations reviewed at least for the
launch languages.

---------------------------------------------------------------------------------------------------------------

## Phase 4: multi-chain completion (M-L)

- **Tokens and feeds:** verify addresses/decimals from issuers (USDC, USDT, DAI, EURC, PYUSD, FDUSD, WETH, WBTC) per
  chain and Chainlink feeds with heartbeats; populate `FEEDS`; re-enable fiat pricing only with feeds. Use the
  `ethereum-lists/chains` and token-list generators as proposals, each entry with source URL + date.
  Mainnets stay `enabled:false` until the per-chain checklist (`docs/chains/CHECKLIST.md`) is complete.
- **Solana:** an announcer/memo program spec or deployment (currently memo-only), a real fee-payer sponsor
  (Octane/Kora pattern, new `solana-relayer` package), test harness upgrade (LiteSVM).
- **Tron:** ADR-0019 and funding design (stealth TRC-20 sweeps need energy/TRX which links addresses), strict protobuf.
- **Bitcoin:** fix PayJoin trust, per-outpoint scanner, second-source/header validation, hardware-signer interface.
- **ERC-4337 / gasless:** adopt `permissionless.js`, add EIP-3009/Permit2 pulls, bundler + paymaster adapter with the
  audit's caps.
- **Other items on the roadmap:** milestone escrow (Feature 3), light indexer/PIR (Feature 5), ENS resolver,
  WalletConnect/EIP-6963 adapter, price oracle sources. Each is a package with its own spec in
  `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`; do them only after the launch path is solid.

**How:** one agent per chain with a checklist and an anvil/regtest/validator integration test in the Docker stack;
CI gate per chain; never enable a mainnet entry without verified data and a manifest.

---------------------------------------------------------------------------------------------------------------

## Phase 5: adopt reusable open-source code (M)

Research is done (`docs/research/reuse/`). **How:** per module, an agent that (1) re-clones the upstream at a pinned
SHA into an isolated directory, (2) re-reads the actual `LICENSE`, (3) reviews every file it will copy (no
obfuscation, `eval`, hidden network calls, postinstall scripts), (4) copies with headers or adds an exact-pinned
npm dependency after checking provenance and publish date, (5) writes provenance into `THIRD_PARTY.md` and
`docs/third-party/<module>.md`, (6) adds tests. Permissive licences only; GPL/LGPL/BUSL stay reference-only. Run as
a supervised, per-module step (an unattended clone-and-copy workflow was blocked by the permission classifier, which
is a sensible control). Order by value: ERC-4337 client, clear-signing registry, Permit2, `mipd`, ENS, payment URIs,
chain data, secure-CI configs.

---------------------------------------------------------------------------------------------------------------

## Phase 6: testnet readiness (H, M)

Everything up to "needs a funded key" is built and rehearsed (`docs/operators/testnet-runbook.md`).
1. **H:** create a throwaway funded testnet deployer key (never reuse), set `FEE_RECIPIENT` (a test address first).
2. Run `scripts/testnet/deploy.sh` in simulate, rehearse, then broadcast on Sepolia and Base Sepolia; generate and
   validate `deployments/<chainId>.json`; verify sources.
3. Resolve how manifests ship (separate origin or reviewed allowlist) and sign them with the release key; wire the
   key into the build; keep the "UNSIGNED DEV MANIFEST" banner until then.
4. **H:** end-to-end with real wallets (MetaMask, Rabby, mobile wallets), real phones, real faucet funds: create
   invoice, pay, scan, direct sweep, relayer sweep; record tx hashes in a dated log; measure what each observer sees.
5. Run the relayer against a real provider with budgets and alerts; exercise `docs/operators/incident-response.md`.
6. Dry-run a release: reproducible build, SBOM, signing, verify script, IPFS/Pages publish procedure.

---------------------------------------------------------------------------------------------------------------

## Phase 7: launch gates (H, L)

Mainnet only after all of: independent audit closed; release key ceremony done; hosting decided (dedicated origin,
not a shared GitHub Pages path); licence chosen and `LICENSE` added; terms/sanctions/compliance position and legal
review; fee recipient chosen (immutable); bug-bounty and disclosure process live; monitoring (`ops-monitor`) running;
incident runbook rehearsed; first mainnet launch capped (low limits, one chain, allowlisted tokens).

---------------------------------------------------------------------------------------------------------------

## Execution strategy (how to run this efficiently)

- **Order:** Phase 0 -> 1 (P0 verify) -> 2 and 3 in parallel by file ownership -> 1 (P1) -> 4 -> 5 -> 6 -> 7.
  Phases 2/3/4 can overlap if each worker owns disjoint paths; the three screens most contended are Pay, Sweep,
  Create and Scan, so serialise work on those.
- **Avoid CI churn:** the session hook commits and pushes every turn, which cancels CI runs. Either let workers run
  in worktrees (`isolation: worktree`) and merge once, or pause pushes for a few minutes when a verdict is needed.
- **Every change:** a test that fails first, scoped package checks, then integrator (clean rebuild), then an adversarial
  reviewer, then CI. Never claim a result that was not run; state what ran where.
- **Models:** haiku for research, translation drafts, doc and config edits; sonnet for implementation; opus for
  cryptography, contracts, protocol parsers and adversarial review. Compress agent comms (caveman style).
- **Cost control:** reuse the frozen-snapshot trick for audits, audit deltas instead of the whole tree, avoid reading
  full CI logs (filter noise at the source; the integration job already drops validator metrics).

## Risks to watch

1. Mid-edit false alarms (cancelled runs, gate noise) hiding a real failure. Mitigation: read the real jobs.
2. Silent skips (CI filter, tests that skip without anvil). Mitigation: `REQUIRE_ANVIL=1`, check job durations.
3. Translations that are fluent but wrong. Mitigation: glossary, native review, flag in UI.
4. Scope creep into post-launch features. Mitigation: finish the launch path first.
5. Supply chain in copied code and in the unofficial `bitcoin/bitcoin` image. Mitigation: pins, review, replace with a
   self-built image when a verified tarball hash is available.
6. Over-claiming. Mitigation: docs never say audited, anonymous, or production ready until the gates are met.
