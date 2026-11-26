# Security remediation, red-team audit and Mythril re-evaluation (2026-11-18)

Status: AI-assisted review and remediation. **This is not an external or professional audit** and does not qualify
GhostPay for production, mainnet or real-funds use. Nothing here deploys, releases, signs or publishes anything.

| Item | Value |
|---|---|
| Starting `main` | `5467c158069c5bab264b6a653ac56e89e13f3e13` (merge of PR #203) |
| Integration branch | `security/mythril-full-remediation-20261118` |
| Overlapping open work reviewed | #212 (Mythril/Echidna re-evaluation, unwired disposition checker), #213 (spec 18 stealth export, WIP), #217 (N1 fee-token freeze guard), #206/#209/#211 (integration/completion), #214-#216 (docs), #207/#210 (Dependabot). None of their files are modified here except as listed in section 7. |
| Toolchain (local, = CI pins) | Foundry 1.8.5, solc 0.8.28 (sha256 `9a0fb7e0…636f25`, official), Mythril 0.24.8 + `mythril-compat.py` on Python 3.12, Slither 0.11.6, Echidna 2.2.7, Node workspace `node_modules` from `npm ci` |

## 1. Scope and threat model

Scope: `packages/contracts` (five production contracts), `packages/confidential-contracts`, `packages/pool-contracts`,
`packages/payer-hiding-contracts`; crypto and key custody (`core-crypto`, `secret-box`, `ux-vault`, `sdk`, `ux-export`,
`scan-source`, web keystore); the GitHub Pages client (`apps/web`, lean profile) and the packages it imports; the payment
lifecycle from seller key generation to sweep; network egress and metadata; CI/CD and supply chain.

Assets (highest harm first): seller spending keys; payer funds in flight; viewing key and payment history; integrity of
the addresses a payer is told to pay; invoice contents; fee revenue. Adversaries: a malicious payee contract, token or
fee token; a front-runner or block producer with bounded timestamp latitude; anyone who can call the ERC-5564 announcer;
a malicious invoice/QR/URL author; an RPC provider; a fork-PR author reaching CI automation; a holder of one leaked key
file. Trust assumptions are those of [THREAT_MODEL.md](../threat-model/THREAT_MODEL.md) (uncompromised browser/OS/wallet,
authentic dependencies, canonical announcer).

## 2. Mythril remediation matrix (11 historical records)

Local reproduction on the starting `main` with the runner's exact per-contract command (`myth analyze src/<C>.sol --solv
0.8.28 --solc-json <runner config> --execution-timeout 900 -t 3 -o json`, through `scripts/mythril-compat.py`). Contract
sources are byte-identical to the analysed baseline `beb525dd` (sha256 in the earlier records) and are **not modified on
this branch**, so the records and their evidence tests remain valid for the final head.

| Id | SWC / sev | Contract : function : line (PC) | Exploitability | Root cause | Corrective commit | Regression / evidence tests | Scanner verification (this run) | Final disposition | Reviewer evidence |
|---|---|---|---|---|---|---|---|---|---|
| EXP-1 (R1) | 116 / Low | GhostPaySweepRelayer : sweep : 83 (785) | None beyond producer timestamp latitude on an owner-signed order | Inclusive submission deadline (spec) | none (not a defect) | `MythrilExpiryDispositions.t.sol` EXP-1 set (10) | Reproduced: line 83, PC 785 | Intended behaviour | expiry record review; #212 E1; this run |
| EXP-2 (R2) | 116 / Low | PolicyAccount : requestWithdraw : 161 (1876, `8390:50`) | As EXP-1; delay starts at acceptance | Inclusive deadline | none | EXP-2 set (10) + scope test | Reproduced: line 161, PC 1876, `8390:50` | Intended behaviour | as above |
| EXP-3 (R3) | 116 / Low | PolicyAccount : proposeDestination : 262 (5077, `12988:48`) | As EXP-2 with `2 × delay` | Inclusive deadline | none | EXP-3 set (10) | Reproduced: line 262, PC 5077, `12988:48` | Intended behaviour | as above |
| R4 | 110 / Low | modelled clone : fallback (30) | None: real clone PC 30 is `GAS` | Mythril symbolic implementation byte | none | `MythrilFactoryDispositions.t.sol` R4 set | see section 2.1 | False positive (model artifact) | factory record review; #212 |
| R5 | 107 / Med | PolicyAccountFactory : deploy : 117 (999) | None: `nonReentrant`, `initialize` makes no external call | Fee pull precedes clone by design | none | R5 set incl. `test_R5_initializeIssuesNoExternalCallBelowTheClone` | see 2.1 | Intended behaviour | as above |
| R6 | 107 / Low | deploy : ReentrancyGuard.sol:99 (1170) | None: the flagged write is the guard release | Optimizer source location | none | R6 set | see 2.1 | False positive | as above |
| R7 | 113 / Low | deploy : 131 (1668) | Fail-closed; residual DoS if the fee token's views break | Multiple calls by design | none | R7 set | see 2.1 | Intended; residual N1 owned by #217 | as above |
| R8 | 113 / Low | deploy : 132 (1781) | As R7 | As R7 | none | R8 set | see 2.1 (CI-only, 3-step, not always reproduced) | Intended; residual N1 | as above |
| R9 | 107 / Med | deploy : Clones.sol:104 (2887) | None: front-run deploys the victim's own policy, victim pays nothing | CREATE2 after fee pull | none | R9 set | see 2.1 | Intended behaviour | as above |
| R10 | 107 / Low | deploy : SafeERC20.sol:227 (2978) | None: target is immutable `FEE_TOKEN` | Symbolic constructor arg | none | `testFuzz_R10_*` (10k runs) | see 2.1 | False positive | as above |
| R11 | 104 / Med | deploy : SafeERC20.sol:227 (2978) | None for standard tokens; waiver only for pathological fee tokens | Documented fee waiver branch | none | R11 set incl. gas-starvation residual | see 2.1 | False positive as "unchecked" | as above |

Totals: 11 investigated; 0 confirmed vulnerabilities; 0 fixed (none needed); 11 justified (3 intended behaviour of the
SWC-116 pattern, 5 intended behaviour / fail-closed, 3 analyser-model false positives); 0 unresolved defects. The
**Mythril gate stays red** by design: Mythril 0.24.8 has no per-finding suppression and the repository policy
(`scripts/run-mythril.sh`) forbids weakening the runner. Turning these dispositions into a gate exception requires an
owner-approved, finding-specific mechanism; PR #212 contains an unwired candidate checker. No suppression was added here.

### 2.1 Local Mythril run (this branch's contract sources = `main`)

Run 2026-11-18 07:57–08:24 UTC, three then two contracts in parallel on a 4-core host, Python 3.12, outputs archived in
[`data/mythril-local-20261118/`](data/mythril-local-20261118/) (raw JSON, `src.sha256` of the analysed sources, timings).

| Contract | Result | Records | JSON sha256 |
|---|---|---|---|
| GhostPayRouter | `success:true`, 0 issues, rc 0 | — | `8e0e1368…87b6be8a` |
| GhostPaySweepRelayer | `success:true`, rc 1 | SWC-116 Low `sweep` line 83, PC 785 = **EXP-1** | `775e9bb2…4449f5ef` |
| GhostPayPolicyRouter | `success:true`, 0 issues, rc 0 | — | `8e0e1368…87b6be8a` |
| PolicyAccount | `success:true`, rc 1 | SWC-116 Low line 161 PC 1876 `8390:50` = **EXP-2**; line 262 PC 5077 `12988:48` = **EXP-3** | `a7c386e0…6e626d33e3` |
| PolicyAccountFactory | `success:true`, rc 1 | SWC-110 Low clone fallback PC 30 = **R4**; SWC-107 Med :117 PC 999 = **R5**; SWC-107 Low ReentrancyGuard:99 PC 1170 = **R6**; SWC-113 Low :131 PC 1668 = **R7**; SWC-107 Med Clones:104 PC 2887 = **R9**; SWC-107 Low SafeERC20:227 PC 2978 = **R10**; SWC-104 Med SafeERC20:227 PC 2978 = **R11** | `ca3e43a9…29a7f2a22` |

10 of 11 records reproduce with identical SWC, severity, PC and line; no new record appeared. R8 (3-step sequence,
PC 1781) was not reproduced, as in the earlier local rerun: symbolic search under a timeout is not deterministic. Its
absence is not evidence either way; its disposition rests on source review and the R8 tests. The router absence carries
the caveat of the expiry record (same timestamp pattern exists there).

## 3. Additional red-team findings

Severity: C critical, H high, M medium, L low, I informational. "Fixed" means a regression test failed before the fix
and passes after it, on this branch.

| Id | Sev | Area / location | Finding | Status | Evidence |
|---|---|---|---|---|---|
| F-1 | M | `.github/workflows/ghostpay-codex-cloud.yml` agent path policy (3 copies) | An agent PR could edit build/bundle-gate/analyzer configuration and trust roots that judge the shipped artifact (`vite.config.ts` CSP/SRI/deployment plugins, `index.html`, `_headers`, `scripts/pages/*`, web e2e/scripts, `echidna.yaml`, `hardhat.config.*`, `.npmrc`; after review G also infix `vitest.*config`/`playwright.*config`, `postcss` config, `remappings.txt`, `scripts/i18n/*`, `scripts/lib/*`, `packages/contracts/scripts/*` (Mythril/Echidna runners), vendored `packages/*/lib/*`, pool-circuit `SHA256SUMS`/`vkeys`) | **Fixed** `18b0302` + follow-up | hardening test fails on old policy, passes after; review G's full-tree verdict list was the input for the follow-up. Still a path allowlist: the human approval at the exact head remains the real gate |
| F-2 | M | `ghostpay-parallel-review.yml` preflight; codex-cloud and research prompts | Fork-PR titles and branch names (attacker free text) were written into a file the agent was told to read: indirect prompt injection | **Fixed** `18b0302` + follow-up (untrusted-data clause in the research prompt) | new test in `ghostpay-parallel-review-workflow.test.mjs`. Residual: prompt clauses are mitigations, not guarantees |
| F-3 | L | `.github/actions/setup-forge/action.yml` | Restored `~/.svm` solc not integrity-checked; analyzer evidence for release could use a tampered compiler | **Fixed** `18b0302` | step passes on official binary, fails closed on a tampered one (local run) |
| F-4 | I | all workflows | Floating `ubuntu-latest` runner image | **Fixed** `18b0302` + follow-up (all `runs-on: ubuntu-latest` → `ubuntu-24.04`) | every workflow YAML parses; 185/185 workflow tests pass |
| C-1 | I/L | `packages/chain-adapters/src/rpc.ts` `fetchTransport` | RPC fetch lacked `credentials:'omit'`, `referrerPolicy:'no-referrer'`, `cache:'no-store'` used by every other egress point | **Fixed** `fbda6b1`; equivalent fix also on `main` (merge kept `main`'s test) | `rpc.test.ts` new case failed, now passes |
| D-1 | M (latent) | `packages/ux-flow/src/reconcile.ts` `confirm` | Unsigned payer proof `{nonce, chainId, txHash}`: anyone can claim another payer's public observed tx for their own invoice and lock out the real payer (`DUPLICATE_TX`) | **Open** (design). An ambiguity check (`87d1b31`) was reverted after review G showed it bypassable with partial/over amounts and that a second same-amount invoice blocked every honest confirmation (liveness DoS). `confirm()` now carries an explicit `@security OPEN` warning | review G PoC; no importer in `apps/web` or any shipped bundle. Fix needs payer binding (sender signature or nonce in calldata/metadata): owner/spec decision |
| B-1 | M | docs (user guide, threat model, spec 06); spec-18 WIP in #213 | Docs said the viewing key cannot spend. In scheme 1, viewing key + the private key of **any one** one-time address recovers the master spending key (BTC silent payments: scan key + one output key → spend key) | **Fixed on main docs** `e800d14`; **open for #213** (export UI text and spec 18 §4/§6 must say this) | `core-crypto/src/viewing-key-boundary.test.ts` recovers the key and spends a second payment |
| A-3 | I | `GhostPayConfidentialRouter.payConfidential` | ETH buffer forward copied unbounded return data (return-data bomb; 02 L-01 pattern missed here) | **Fixed** `cd54452` | ReturnBombStealth test: +116k gas before, < 20k after; 47/47 hardhat tests |
| A-1 | L/I | `PolicyAccount` `Withdraw` typehash | An **unsubmitted** Withdraw signature carries no destination and pays a destination that completed a change after signing; NatSpec overstates the protection | **Documented** (`DEVIATIONS.md` P3); contract fix is breaking (typehash) | PoC by auditor (scratch); no new power beyond the owner key |
| A-2 | I | `PolicyAccount.executeWithdraw` | Rotating A→B→A revives blocked accepted requests | **Documented** with A-1 (client must cancel on rotation) | PoC by auditor (scratch) |
| A-4 | I | `GhostPayShieldedPool` `SCHEME_ID = 1` | Withdrawal to a scheme-2 account would be announced under scheme 1 | Latent, no scheme-2 pool path exists; residual | source review |
| C-2 | I | `apps/web/src/lib/settings.ts` | `wss:` RPC accepted by Settings but rejected by the only (HTTP) transport: fails at first use | Residual (availability only) | source review |
| D-2 | L | `packages/merchant-ledger/src/reconcile.ts` (CLI only) | Zero-amount invoice reports `paid`: kept (nothing is owed). Review G found the real defect next to it: with a tolerance ≥ the amount due, an invoice with **no payments** reported `paid` | **Fixed** (status `paid` now needs a counted payment unless nothing is due) | new `ledger.test.ts` case failed, passes after (28/28); CLI 570/570 |
| D-3 | L | `apps/web/src/lib/pay.ts` fiat quotes | Oracle answer may be as old as the quote TTL (≤ 24 h); `maxSlippageBps` displayed as if enforced, but not enforced; no L2 sequencer feed | Residual (testnet only); the slippage wording must change or be enforced before mainnet | source review |
| D-4 | L | `apps/web/src/lib/receipts.ts` | Receipt expiry checked against wall clock, not block time; one tx can be receipted for several same-amount invoices (same class as D-1, in the shipped app) | Residual (the seller initiates it; no theft); needs block-time plumbing and a "tx already receipted" warning | source review; review G concurs |
| D-5 | I | `packages/sdk/src/verify.ts` | `quote-expired` is a warning only (web app blocks it) | Residual (library) | source review |

No critical or high finding was identified. Areas reviewed with no new finding (details in the agents' notes): contract
reentrancy, initialization, clone/factory, nonces and replay domains, fee math, token quirks, MEV, unexpected ETH,
pool verifier/nullifiers; EIP-5564 derivation and point/scalar validation, entropy, EIP-6538 domain, KDF and AEAD
parameters, key storage/logging/URLs, recovery substitution; DOM injection, prototype pollution, fragment handling, CSP,
wallet-provider handling, idle lock, clipboard, error text; announcement-spoofing defences, finality and reorg handling,
sweep destination checks; expression injection, action pinning, fork-PR secrets, artifact and cache handling, lockfile
integrity (`npm audit --omit=dev`: 0 vulnerabilities).

## 4. Residual risks and owner decisions

1. **Mythril gate policy** (owner): approve a finding-specific disposition mechanism (e.g. #212's checker) or keep the
   release gate red.
2. **B-1 for spec 18 / #213** (owner + #213 author): exported one-time keys plus the viewing key give full spend
   authority; the raw-key text "controls only the address below" is inaccurate in that case.
3. **A-1/A-2** (owner): binding `destination` in `Withdraw` needs a new PolicyAccount implementation and factory
   (breaking; existing and counterfactual accounts keep the old behaviour). Until then, client rules in DEVIATIONS P3.
4. **N1 / R7-R8 fee-token freeze** (owner, PR #217) before any production scheme-2 deployment.
5. **D-1** (owner/spec): payer-bound proofs before `ux-flow` `confirm()` is used anywhere.
6. **D-3, D-4, C-2, A-4, D-5**: design follow-ups, none exploitable for theft on the Pages beta.
7. Producer-timestamp latitude on L2s against the 1 h / 2 h policy timelocks (expiry record, open documentation item).
8. `main` has no branch protection or required reviews (repository setting, owner).

## 5. Regression test inventory (added on this branch)

| Test | Protects |
|---|---|
| `scripts/tests/ghostpay-automation-hardening.test.mjs` (REJECT list additions) | F-1: agents cannot edit gate/build config |
| `scripts/tests/ghostpay-parallel-review-workflow.test.mjs` "PR ownership preflight passes no fork-controlled free text" | F-2: no fork PR title/ref/body reaches the agent |
| `packages/chain-adapters/src/rpc.test.ts` "sends no cookies, no referrer and bypasses the HTTP cache" | C-1 privacy invariant on RPC egress |
| `packages/merchant-ledger/src/ledger.test.ts` "a tolerance at least the amount due never turns zero payments into paid" | D-2: reconciliation integrity |
| `packages/core-crypto/src/viewing-key-boundary.test.ts` | B-1: documented key-isolation boundary |
| `packages/confidential-contracts/test/router.test.ts` "does not copy the stealth address's return data" + `contracts/mocks/ReturnBombStealth.sol` | A-3: gas-griefing via return data |

## 6. Verification on the final head

Refresh 2026-11-26: the branch was merged with `main` `e7e98109` (1482 commits after the starting SHA). `main` had
meanwhile landed equivalent fixes for **C-1** (same RPC fetch options and test) and **D-2** (ledger), and equivalent
**B-1** user-guide wording; the conflicts were resolved to `main`'s versions, so those rows are fixed on `main` and this
PR no longer carries them. `packages/contracts/src`, `lib` and `foundry.toml` are unchanged on `main` since `5467c158`,
so the Mythril evidence in section 2.1 still applies.

| Check | Result on the refreshed head (local) | Hosted CI |
|---|---|---|
| Foundry contracts (build, 490 tests incl. 64 Mythril-disposition tests) | 490/490 pass (pre-refresh; contract tree unchanged) | `contracts-test`, `contracts-coverage`, `contracts-static` green on `16c48521` |
| Slither 0.11.6 (CI flags) | 0 results | `contracts-slither` green |
| Echidna 2.2.7 | 13/13 properties pass; 11 canaries falsified as designed; runner rc 0 | `echidna` green |
| Mythril 0.24.8 | 10/11 records reproduced, no new record (section 2.1) | `mythril` red: exit 1 on the dispositioned records, as on `main` and on every PR's contract-analysis run through 2026-11-26 (base-wide release gate, owner decision) |
| Confidential contracts (hardhat) | 47/47 | `ts-test (confidential-contracts)` green |
| Workflow/script tests (`node --test scripts/tests`) | 246/246 | `ts-check` green |
| Focused vitest: ux-flow 101, core-crypto 76, chain-adapters 571 (+4 skipped), merchant-ledger 36 | pass | ts-test shards green |
| Workspace typecheck / lint (after `build-workspaces`) | rc 0 / rc 0 (1 pre-existing warning) | `ts-typecheck`, `ts-lint` green |
| Action pinning, secret scan | 116 `uses:` pinned; no key material | `secrets-and-egress` green |
| Browser E2E full + lean, Pages build/verify, Pages artifact on anvil, beta acceptance, integration, CodeQL (actions, JS/TS, Python), CLI ubuntu/macos/windows | not run locally | all green on `16c48521`; rerun on the refreshed head is required before merge |

Not run here: mutation testing, differential testing beyond the existing suites, a live browser session, confidential
Echidna harness, Mythril on the confidential/pool contracts (not in the runner's scope).

## 7. Files changed

Relative to `main` `e7e98109`: agent path policy and runner pins (`.github/workflows/*`, `.github/actions/setup-forge/action.yml`),
two workflow test files, `packages/confidential-contracts/contracts/GhostPayConfidentialRouter.sol` +
`contracts/mocks/ReturnBombStealth.sol` + `test/router.test.ts`, `packages/core-crypto/src/viewing-key-boundary.test.ts`,
`packages/ux-flow/src/reconcile.ts` (doc comment only), `packages/contracts/DEVIATIONS.md`, `docs/threat-model/THREAT_MODEL.md`,
`docs/specs/ideas/06-watch-only-airgapped-signer.md`, `docs/ai/ACTIVE_WORK.md`, this report and `docs/audits/data/mythril-local-20261118/`.

## 8. Merge report

| Item | Value |
|---|---|
| Starting `main` | `5467c158069c5bab264b6a653ac56e89e13f3e13`; refreshed onto `e7e981095b07a05c7727bf9fafb0a0fec7e4fc36` |
| Integration branch | `security/mythril-full-remediation-20261118` |
| PR | djshellshoxxx/GhostPay#220 |
| Final commit / merge commit | recorded in the PR once hosted CI on the refreshed head completes |
| Corrected here | F-1, F-2, F-3, F-4, A-3, B-1 (docs/test); C-1, D-2 and B-1 user-guide wording are on `main` independently |
| Remaining | D-1 (open design), A-1/A-2, A-4, C-2, D-3, D-4, D-5; Mythril gate policy; `classifyAmount` exact-path tolerance validation (Info, reported on #220 by the owner account, not in this PR) |
| Merge status | pending hosted CI on the refreshed head; no deployment, release or real-funds authorization in any case |
