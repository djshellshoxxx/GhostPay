# GhostPay: session handoff

Written 2026-10-22 at commit `3519171` on branch `claude/laughing-bardeen-4t20ys` (draft PR
[djshellshoxxx/GhostPay#17](https://github.com/djshellshoxxx/GhostPay/pull/17) into `main`).
Session: https://claude.ai/code/session_018PjGZop7wp5vw9oDAZEwYA

This file is for whoever (human or agent) picks the project up next. Read sections 1-4 first. Everything here is
from real runs unless marked **unverified**. It is not an audit and nothing here is a security guarantee.

---------------------------------------------------------------------------------------------------------------

## 1. What GhostPay is

Open-source, client-side invoice creation and stealth-address payments. A seller publishes one stealth
meta-address; each payment goes to a fresh one-time address only the seller can find and spend from.
It reduces address reuse and routine invoice exposure. It does **not** claim anonymity: amounts, payer addresses,
timing and the router are public on-chain. See `docs/user/privacy-limits.md`.

Chains in the code: EVM (EIP-5564 scheme 1 stealth addresses, ERC-4337 sponsor work, policy accounts),
Bitcoin (BIP-352 Silent Payments, PayJoin), Solana (ed25519 dual-key stealth, SOL + SPL), Tron (proof of concept).
Fee: 25 bps taken **on-chain** by the immutable router contract (see section 10).

State in one line: roughly **80% of the engineering build, ~50% of a launch-ready product**. Nothing is deployed to
any public chain, nothing has been tested with a real wallet, and there is no independent audit.

---------------------------------------------------------------------------------------------------------------

## 2. Repo, branch, PR, how to resume

- Repo: `djshellshoxxx/GhostPay`. Work branch: `claude/laughing-bardeen-4t20ys`. `main` is docs-only (4 spec files)
  and is far behind; PR #17 brings the whole implementation onto it (about 1,600 files). Keep the PR a draft.
- History: this branch was fast-forwarded to `origin/claude/remote-extensions-10` (the earlier sessions' work),
  then extended. Older branches (`claude/remote-extensions-1..10`, `claude/inspiring-fermat-*`, `claude/docs-snapshot-*`,
  `claude/pages-site-1`, `docs/readme-and-wiki`, `gh-pages`) are earlier states; `gh-pages` holds the published
  prototype site (payments disabled there: no deployment manifest).
- A session stop hook forces a commit+push every turn whenever files change. Commits titled `wip: ... checkpoint N`
  are that hook, not meaningful milestones. Squash them when merging.
- Commit trailer used: `Co-Authored-By` + `Claude-Session` lines (see any recent commit).

### Sandbox setup (a fresh container needs this)
```bash
cd /home/user/GhostPay
npm ci --ignore-scripts
npm run build:libs            # REQUIRED before typecheck/test/build: workspaces resolve each other via dist/
# Foundry 1.8.5 (github.com release works; some other hosts are blocked by the proxy):
curl -sSL https://github.com/foundry-rs/foundry/releases/download/v1.8.5/foundry_v1.8.5_linux_amd64.tar.gz | tar -xz -C /root/.foundry/bin
# solc 0.8.28: binaries.soliditylang.org is BLOCKED; get it from GitHub:
curl -sSL https://github.com/ethereum/solidity/releases/download/v0.8.28/solc-static-linux -o /home/user/tools/solc && chmod +x /home/user/tools/solc
export PATH=$PATH:/root/.foundry/bin ANVIL_BIN=/root/.foundry/bin/anvil
```
`packages/contracts/foundry.toml` pins `solc = "/home/user/tools/solc"` (sandbox-only; CI rewrites it with `sed`).
Sandbox limits: no Docker daemon, no `bitcoind`, no `solana-test-validator` installed locally, GitHub REST API is
403 for sub-agents (the GitHub MCP tools work for the orchestrator). Real Docker/Bitcoin/Solana runs happen only on
GitHub Actions.

### Everyday commands
```bash
npm run typecheck && npm run lint && npm test                 # all workspaces (confidential-contracts needs GHOSTPAY_SOLC_PATH=/home/user/tools/solc)
npm run build -w @ghostpay/web                                # includes scripts/scan-bundle.mjs
npm run test:e2e -w @ghostpay/web                             # Playwright, chromium
(cd packages/contracts && forge test && forge fmt --check && forge snapshot --check)
bash scripts/scan-secrets.sh && bash scripts/check-actions-pinned.sh
bash scripts/integration/run-all.sh                           # Docker stack (CI/Codespace only)
```

---------------------------------------------------------------------------------------------------------------

## 3. Verified status (what was actually green)

On commit `735dd41` (before the later in-flight work) GitHub Actions showed **all green with every job really run**:
- CI run 142 (about 6 minutes): typecheck, lint, web build + bundle scan, `npm audit --omit=dev`, all unit-test
  groups, relayer anvil e2e, Playwright e2e, `forge test`/fmt/snapshot, forge coverage, NatSpec, Slither.
- Integration run 10 (Docker): **EVM, Bitcoin regtest and Solana suites pass** inside containers.
Local numbers from the integrator (`docs/remote/STATUS-swarm.md`): 24 vitest workspaces, ~2,768 tests passed, 81
skipped; forge 400 passed in `packages/contracts`, 84 in `pool-contracts`.

Since then three workflows have been editing the tree (section 5), so **current head is mid-change and CI on recent
`wip:` commits is red or cancelled by design**. Do not treat red on those as new regressions until the integrator
stages finish and a clean run completes.

---------------------------------------------------------------------------------------------------------------

## 4. Hard-won CI and tooling lessons (read before touching CI)

1. **Gate jobs lie when upstream is cancelled.** `typescript` and `contracts` fail if any needed job is
   `cancelled`. Constant pushes cancel in-progress CI runs, so the gate alerts are noise. Always list the real jobs
   (`list_workflow_jobs`) before diagnosing. A genuine verdict needs a quiet period with no pushes.
2. **The docs-only filter bug (fixed in `9417d83`).** `ci.yml` piped the PR file list into `grep -q` under
   `pipefail`; on large PRs `grep` exits early, the pipe breaks, and code changes were classified docs-only, so
   every real job was skipped and the run reported success. Fixed with a here-string. Same fix applied in
   `scripts/verify-release.sh`. Treat any CI "success" that took seconds as suspect.
3. **`build:libs` must build everything the web app imports.** It previously omitted `address-safety` and
   `tx-review`, and the lib cache listed only 8 packages, so a clean checkout failed web `tsc` while the sandbox
   passed (workers had hand-built them). Fixed in `f96f7d0`: `build:libs` includes both; cache is `packages/*/dist`
   keyed on all package inputs. New workspace packages the web app imports **must be added to `build:libs`** in
   dependency order (root `package.json`). The new `qr-exchange`, `payment-uri`, `invoice-schema` changes are not
   wired yet.
4. **The bundle scan forbids any shipped deployment manifest.** `scripts/devnet/up.sh` writes
   `apps/web/public/deployments/31337.json`; it is git-ignored. If it exists locally, `npm run build -w @ghostpay/web`
   fails with "a manifest is shipped". Delete it. (Open design question: how real testnet manifests will be served;
   see section 9.)
5. **Docker hardening gotchas** (`infra/integration/docker-compose.yml`):
   `solana-test-validator` (Agave v3) asserts `io_uring_supported()`; Docker's default seccomp blocks it, so that one
   container runs `seccomp=unconfined` + unlimited memlock (documented compromise; follow-up: a custom profile that
   allows only `io_uring_*`). `bitcoind` runs via `entrypoint: ["bitcoind"]` as uid 101 with a tmpfs datadir and
   `-txindex=1` (the image entrypoint's chown/chmod fails under `cap_drop: ALL`). The `bitcoin/bitcoin` Docker Hub
   image is **unofficial** (digest-pinned, documented). anvil and the runner are fine.
6. **`integration.yml` uses `cancel-in-progress: false`** so runs finish; `ci.yml` still cancels (intended).
7. **Auto-mode classifier blocked an unattended workflow that cloned third-party repos and copied code in.** The
   research-only variant was allowed. The copy step needs per-module scoping and pinned, license-verified sources
   (section 8).
8. **Flaky/slow:** `core-crypto` `differential.test.ts` takes ~50 s against a 60 s limit under load.

---------------------------------------------------------------------------------------------------------------

## 5. Workflows still running when this was written (unfinished work)

Orchestration used the `Workflow` tool (scripts live under
`/root/.claude/projects/-home-user-GhostPay/40d4ad39-bcc4-5bb2-a5b1-61225ae84949/workflows/scripts/`).
These were **running**; check `git status`, `git log` and the `docs/audits/05-*` files before assuming either way.

| Workflow | Run id / task id | What it does | Owns |
|---|---|---|---|
| Audit P0 fixes | `wf_bed33fba-9a4` / `whf9yxqu3` | 7 fixers (regression test first), then an integrator (clean rebuild + whole-repo tests), then an adversarial reviewer. Writes `docs/audits/05-p0-fixes.md` and `05-p0-fix-review.md` (neither existed yet). | payjoin, payer-sponsor/payer-hiding-contracts, pool-relayer/pool-contracts, solana-stealth/tron-adapter, web Pay/Sweep/Create/manifest, chain-adapters scan + web Scan/settings, ci.yml/relayer/ops-monitor/scripts/testnet |
| Passphrase + QR libs | `wf_d29f65fd-f1d` / `w0kr1h611` | Passphrase-protected invoice envelope in `packages/invoice-schema` (new `A256GCM-PW` mode, ADR-0020), new `packages/qr-exchange` (multipart QR + camera scan, ADR-0021), new `packages/payment-uri` (EIP-681/BIP-21/Solana Pay parsers, ADR-0022), then an opus review. | those three packages |
| UX foundation (phase A) | `wf_4db8a41b-156` / `wxz1dy2h2` | `QrFrame` colour-coded QR component, i18n infrastructure (`apps/web/src/i18n`, `apps/web/locales`, `scripts/i18n`), responsive/a11y base layer (`index.html`, styles), cross-browser + lynx test matrix. Review in `docs/audits/05-ux-foundation-review.md`. | QrFrame/QrView/qr libs, i18n, base styles + index.html, playwright config + a11y/responsive specs + `crossbrowser.yml` |

Resume a crashed workflow: `Workflow({scriptPath: "<script>", resumeFromRunId: "<run id>"})` (cached agents replay).
If they all finished: read each integrator report, run the clean-state check (`rm -rf packages/*/dist apps/web/dist &&
npm run build:libs && npm run typecheck && npm run lint && npm test`, plus forge, web build, Playwright), fix
anything still red at the root cause, then confirm with a **real, uncancelled** CI run.

Earlier completed workflows (results are in the repo): build swarm `wf_22eab396-019` (+ integrator report
`docs/remote/STATUS-swarm.md`), reuse research `wf_6a3f10b3-12b`, full audit `wf_0ff75698-e37`.

---------------------------------------------------------------------------------------------------------------

## 6. Security audit (AI-assisted, not independent)

`docs/audits/05-full-audit.md` (744 lines) + per-area files in `docs/audits/05/`. Frozen snapshot commit
`88de001`; 12 area auditors, skeptic verification of every critical/high/medium, 57 agents total. 125 findings
after merging: 0 critical, 2 high (1 confirmed, 1 disputed), 16 medium, 86 low, 21 info; none of the 38 verified
findings was refuted. Section 9 of the report is the prioritised plan; section 8 lists what was NOT reviewed.
Top items (all in the P0 fix workflow): `BITCOIN-01` PayJoin receiver trusts sender-claimed amounts (high, confirmed);
`SOLANA-TRON-01` duplicate memos multiply a detected payment (high, disputed); `CONTRACTS-POOLS-01` paymaster
signature portable + attacker-chosen gas fields (medium after review); scan checkpoint/lying-RPC issues
(`CHAIN-ADAPTERS-01..03`, `WEB-APP-04`); duplicate send after error (`WEB-APP-02`); manifest not verified in every
flow (`WEB-APP-01`, `CHAIN-ADAPTERS-05`). Already fixed after the snapshot: `WALLET-SAFETY-02` (browser `node:crypto`).
The `docs-claims` auditor did not write its own file; its findings are only in the main report.
Earlier audits: `docs/audits/00-04`, `docs/remote/round-audits/*`. Security research (Rainbow Books, failures and
prevention, best practices, papers): `docs/research/security/` including `GHOSTPAY-CONTROLS.md` (prioritised controls).

---------------------------------------------------------------------------------------------------------------

## 7. Repository map (where things are)

```
apps/web            React 19 + Vite static app (pay, scan, sweep, seller keys, registry, BTC feature, settings)
apps/relayer        Node gas-sponsorship relay for sweeps
packages/contracts  Foundry: GhostPayRouter, GhostPaySweepRelayer, PolicyAccount(+Factory), GhostPayPolicyRouter, devnet/testnet scripts
packages/core-crypto, invoice-schema, secret-box, address-safety, tx-review, relayer-guard, ops-monitor, chain-adapters, policy-scheme
packages/btc-silent-payments, btc-payjoin, solana-stealth, tron-adapter
packages/pool-*, external-pools*, payer-sponsor, payer-hiding-contracts, confidential-*   (shielded-pool / ERC-4337 work; NOT assessed beyond the audit)
packages/qr-exchange, payment-uri                (new, in progress)
scripts/            devnet (anvil e2e), testnet (deploy dry-run, manifest), integration (Docker suites), regtest, release/repro/SBOM, checks
infra/              devnet, integration (docker-compose), proxy, publish, web
.devcontainer/      Codespace config for the integration stack (untested)
deployments/        manifest schema only; no real manifests
docs/               specs, ADRs (adr/), audits/, chains/, operators/ (runbooks), user/ (guides), research/, design/, remote/ (earlier status)
```
Index: `docs/INDEX.md`. Per-package README + `DEVIATIONS.md` list where code differs from spec. Where docs and code
disagree, the code wins and the doc is a bug (the audit found several; see `DOCS-CLAIMS-*`).

---------------------------------------------------------------------------------------------------------------

## 8. Decisions already made / approved scope

- **Reuse of GitHub code (research in `docs/research/reuse/*.md`, 16 reports).** The user chose "both" (fix audit first,
  then the reuse copy step). Verdicts: adapt `permissionless.js` (MIT) for the ERC-4337 bundler/paymaster client;
  Uniswap Permit2 interface (MIT) + Circle EIP-3009 (Apache) reference; CC0 ERC-7730 clear-signing registry with a new TS
  renderer in `tx-review`; depend on `mipd` (MIT); thin in-house Ledger signer interface; Pyth interfaces (Apache);
  OpenZeppelin primitives for milestone escrow; depend on `@adraffy/ens-normalize` + adapt the `offchain-resolver`
  CCIP-read gateway; `bitcoinjs/bip21` + `solana-pay`; chain/token data from `ethereum-lists/chains` + token lists
  (proposals only); solhint/gitleaks configs; LiteSVM for Solana tests; BIP-352 vectors + regtest Dockerfile; `tronweb`
  + `@scure/base`. **Reference only (do not copy):** eth-infinitism EntryPoint (GPL), safe-modules (LGPL), Uniswap
  OracleLibrary (GPL), Sablier (BUSL), RedStone (BUSL), the light-indexer and merchant-api candidates. **Caveats:** the
  haiku researchers had no GitHub API access, so several SHAs, star counts and a few licence checks are marked
  unverified. Before copying anything: re-read the upstream `LICENSE` file at a pinned commit, review the code, keep
  headers, add a row to `THIRD_PARTY.md`. Project licence is undecided, so permissive-only keeps options open.
- **QR colour taxonomy** (single source of truth in `apps/web/src/lib/qrKinds.ts` once built): secret=RED (thick
  solid, lock, hidden until reveal, auto-hide 60 s); shareable=GREEN (public invoice link, meta-address, payment
  request); bearer=ORANGE dashed (link that contains its own decryption key); my-devices=BLUE double border;
  proof=PURPLE dotted (receipts, fingerprints); caution=YELLOW striped (testnet/unsigned). Colour is never the only
  cue (label + icon + border style). **Open question for the user:** invoices were requested as green; encrypted
  links with the key inside are orange by default. Confirm or change.
- **Passphrase protection:** passphrase-derived key (scrypt, bounded params) for invoice links so the link alone is
  useless; the existing seller-key backup already uses scrypt N=2^17 + AES-GCM. A transaction itself cannot be
  encrypted (on-chain data is public); a passphrase can gate signing/sweeps and protect invoices, receipts and backups.
- **UX plan:** phase A (foundation, running) then phase B: wire QR into every data-exchange screen, "scan with camera"
  buttons, passphrase options, convert strings to translation keys, translate into 24 languages (machine-drafted,
  flagged "needs native review"), per-screen responsive fixes. Targets: Android/iOS/iPadOS/Windows tablets, Safari,
  Firefox, Chrome, Opera, WCAG 2.2 AA. **Text browsers (lynx/w3m):** the app cannot run there (keys, signing and
  scanning need JS + Web Crypto and never leave the browser); they get a `<noscript>` explanation and the static
  help pages. Real devices, screen readers (VoiceOver/TalkBack/NVDA) and AR glasses have **not** been tested.
- **Fee obfuscation request (declined as advised, no code changed).** The 25 bps fee is enforced by the immutable
  router on-chain, so front-end obfuscation protects nothing and would hide a charge from payers and undermine
  reproducible builds. Offered instead: tamper-evidence (SRI + signed-manifest check), release-key pinning, licensing.
  The user has not answered.
- **Invoices/receipts (answered, nothing built):** invoice = signed canonical JSON in a URL fragment
  (`#gpi=v1.<base64url>`), 16 KiB max, optional AES-256-GCM (key inside the link), random nonce, no sequential
  number, no seller name/email unless typed. Receipts, bills, printing and invoice-to-payment matching do not exist.

---------------------------------------------------------------------------------------------------------------

## 9. Open items, ordered

The full plan (what, how, gates, strategy, risks) is in [`docs/COMPLETION_PLAN.md`](./COMPLETION_PLAN.md). Summary:

**Immediate (finish what is running)**
1. Let the three workflows finish; read their reports; run the clean-state check (section 5); fix remaining red.
2. Get one **uncancelled** green CI run + Integration run on the final commit. Confirm jobs were not skipped.
3. Add `qr-exchange`/`payment-uri` (and any other web-imported lib) to `build:libs`; verify from clean `dist`.

**Next**
4. UX phase B (QR wiring on every screen, camera scan, passphrase UI, i18n conversion + 24 translations, per-view
   responsive fixes, print layout). Then receipts/bills/invoice-payment matching.
5. Reuse copy step (section 8), module by module, with provenance.
6. Audit P1 items (`docs/audits/05-full-audit.md` section 9): privacy (Esplora/RPC leaks, BTC consolidation, reuse
   warning), relayer hardening, BTC scanner mapping, wallet-safety, release chain (`git verify-tag`, gate `pages.yml`,
   digest-pin Docker images, pin `RELEASE_KEY`), hosting origin isolation, TRON strictness.
7. Not yet wired: Pay/Sweep on-chain manifest read-back (being fixed), second-RPC setting (being fixed), release key
   (empty, so manifests show "UNSIGNED DEV MANIFEST" and mainnet is refused).
8. Mainnet/testnet data: verify token addresses and Chainlink feeds from official sources (the Circle addresses came
   from search snippets; USDT/DAI/PYUSD/WETH/WBTC and all mainnet entries are unverified and disabled). `FEEDS` is
   empty and fiat pricing is hard-disabled in the UI.
9. Decide how real manifests ship given the bundle scan forbids bundling them (runtime fetch from a separate origin,
   or an explicit reviewed-manifest allowlist). Tighten the Solana container's seccomp profile.

**Needs the owner / a human (cannot be done in the sandbox)**
- Fund a testnet key and run `docs/operators/testnet-runbook.md` (deploy dry-run is rehearsed; nothing broadcast).
- Test with real wallets, real phones/tablets, screen readers, AR headsets.
- Generate and pin the offline release signing key; choose the real `FEE_RECIPIENT` (immutable once deployed).
- Choose a licence; terms/sanctions/compliance position; legal review; hosting; bug-bounty scope.
- Commission an independent professional audit; run Echidna/Mythril/mutation nightly on CI.
- Try the Codespace config (`.devcontainer/`); it has never been opened.

---------------------------------------------------------------------------------------------------------------

## 10. Facts worth not re-deriving

- Fee: `FEE_BPS = 25` (floor), `FEE_RECIPIENT`/announcer immutable, no owner/pause/upgrade. Router checks stealth !=
  zero/this/feeRecipient, metadata layout (57 bytes), deadline, `minNet`. Current recipient is a throwaway test value.
- On-chain metadata per payment: payer, token, gross/net, fee, router, ephemeral pubkey, 1-byte view tag, timing.
  Invoice id and line items are not on-chain. Two invoices from one seller share meta-address/signer key.
- Stealth keys: spend/view keys never go in links. Invoice-signing key is separate. Scan runs in a Web Worker under CSP.
- CSP is `script-src 'self'; style-src 'self'` with no inline styles/scripts; the bundle scan enforces no `eval`,
  `new Function`, `innerHTML`, third-party origins, source maps or shipped manifests.
- Every sub-agent comms convention used: caveman terse; report as `TASK|RESULT|EVIDENCE|BLOCKERS`. Haiku for research
  and mechanical work, sonnet default for implementation, opus for crypto/contract design and adversarial review.
- User preferences (from their settings): senior-engineer tone, token-efficient, finish work end to end, verify before
  claiming, no fabricated APIs/versions, one-paste runnable blocks when they must run something manually, back up
  before overwrite, honest reporting (state what was and was not run).

## 11. How to report honestly

Say exactly what ran. Known unverified: real-device and screen-reader behaviour; anything on a public chain; the
unofficial `bitcoin/bitcoin` image's provenance beyond its digest; reuse-research SHAs/licences gathered without the
GitHub API; translations (machine-drafted); the PayJoin, pool/ZK and confidential-amounts packages (not deeply
reviewed). Never say "audited", "anonymous" or "production ready".
