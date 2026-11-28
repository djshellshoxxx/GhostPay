# Echidna harness and fee-token freeze review (2026-11-18)

> **Dated snapshot.** Written 2026-11-18; it predates `docs/audits/security-remediation-20261118.md` (last updated 2026-11-26), which is the current consolidated record. Contract sources analysed here are unchanged on `main` `70458ebe`. The deploy-path guard recommended for SEC-E2-01 / N1 is PR #217 (open at the time of this note); the N1 contract decision itself remains the owner's.

Status: AI-assisted review by an agent. **This is not an external audit** and does not replace one. Claims below
are marked as checked against source at the commits named here, as CI evidence (a hosted step outcome or log), or
as reported by an earlier document and not re-verified (for example the 44242366379 call counts in A4, the
`FEE_BPS` mutants in A3, which were reasoned and not run, and on-chain absence in B1, which cannot be proven here). Prior handoff and audit documents were used only
as pointers.

## Provenance

| Item | Value |
|---|---|
| Reviewed tree | `c487f0fe649e24a1e89f1f8fd0d82e90a3441c62` (candidate head `71abc7e55c25d45b206ac47e5ddd24e072805710` + #204 merge) |
| Contract identity | `git diff --quiet 71abc7e5 HEAD -- packages/contracts`: identical. `git diff --stat 7a620ff1 71abc7e5 -- packages/contracts`: empty. `src/`, `script/`, `echidna.yaml` and `scripts/run-echidna.sh` are identical to `beb525dddcca103de9eda447b55cddf7ee2f428c` |
| Harness hashes (sha256) | `EchidnaRouter.sol` `dc3b7fbd…497c`, `EchidnaSweep.sol` `c8cfeb17…1788`, `EchidnaPolicy.sol` `4bef9da6…4431`, `EchidnaPolicyReachability.t.sol` `b3ce1d4c…3dc7`, `echidna.yaml` `beed790d…4c44`, `run-echidna.sh` `688520d9…a12d`, `PolicyAccountFactory.sol` `7dfc3259…b94e` |
| Toolchain | forge 1.8.5. `binaries.soliditylang.org` is blocked by this sandbox's network policy (`forge build`: "tunnel error: unsuccessful"). Forge ran with `FOUNDRY_SOLC` pointed at a scratch shim around solcjs `0.8.28+commit.7893614a` (the same compiler release built to wasm, from registry.npmjs.org). The shim splits forge's standard-JSON input when the wasm build hits its memory limit and merges the outputs. Bytecode is per contract and unaffected. Only trace and coverage source maps could differ. Echidna is not installed locally; Echidna evidence comes from CI. |

## Part A: Echidna harnesses

### A1. Inventory

Three Echidna harnesses (`packages/contracts/test/echidna/`) run under `scripts/run-echidna.sh` with
`testLimit 300000`, `seqLen 20`, `workers 4` and `seed 20261021`. The judge is the inline Python in
`run-echidna.sh`, and `scripts/tests/echidna-runner.test.mjs` tests it. The judge requires all of the following:

- The Echidna exit code is exactly 1.
- Every declared `echidna_canary_*` reports `failed!`. "failed with no transactions made" is rejected.
- Every other declared property reports `passed!` or `passing`.
- For every harness, whatever the property spelling, the report has exactly one `Total calls:` line and it is
  ≥ `testLimit` (`run-echidna.sh:44-51`, unconditional; property and canary regexes at `:68`).
- No result is missing, duplicated or undeclared.

| Harness | Safety properties | Canaries (expected to fail) |
|---|---|---|
| `EchidnaRouter` | `router_never_holds_tokens`, `fee_plus_net_eq_gross`, `native_fee_plus_net_eq_gross`, `fee_recipient_only_gets_bps` | `erc20_success` (≥5), `native_success` (≥5), `buffer_success` (≥5), `nonzero_fee` (≥5) |
| `EchidnaSweep` | `sweep_nonce_single_use`, `used_nonces_marked`, `relayer_never_holds_tokens`, `token_conservation` | `sweep_success` (≥5), `replay_blocked` (≥3) |
| `EchidnaPolicy` | `funds_only_to_destination`, `destination_only_changes_via_timelock`, `timelocks_never_shortened`, `policy_immutable`, `rolling_window_cap` | `request_ok` (≥3), `exec_token` (≥3), `exec_native` (≥3), `dest_change` (≥2), `cancel` (≥2) |

That gives 13 safety properties and 11 canaries. The judge's own tests pass:
`node --test scripts/tests/echidna-runner.test.mjs` returned 22/22.

The other packages' Echidna configs (`confidential-contracts`, `pool-contracts`, `payer-hiding-contracts`) are
outside `run-echidna.sh` and the contract-analysis workflow. This review did not cover them.

### A2. Weakening check since `beb525dd`

Command: `git log beb525dd..HEAD` and `git diff beb525dd HEAD` over `test/echidna`, `echidna.yaml`,
`run-echidna.sh`, `echidna-runner.test.mjs` and the workflows.

- One harness change: `292b15b3` (integrated in `81aa5e68`). It **adds** the harness-only actions
  `requestNative`/`requestToken` (owner-signed, always within the limit, same nonce pool) and `executePending`
  (picks only requests still open). It also factors `execute` into a shared `_execute`. No property, canary
  threshold, post-condition, `echidna.yaml` value or runner line changed. `request`, `execute` and `reExecute`
  are unchanged and still cover over-limit amounts, closed requests and double execution. The account still
  enforces every rule. This raises the hit rate. It does not narrow what is checked.
- Workflow changes since `beb525dd` add `release.yml` to the trigger paths and stop cancelling in-progress
  caller runs (`cancel-in-progress` only for `pull_request`). They also add `scripts/agent/*.test.mjs` to CI, and
  `release.yml` (+40 lines, `git diff --stat beb525dd c827d22f -- .github`) gains a `contract-analysis` job on the
  tagged commit plus an evidence gate in `build` that requires both analyzers' `metadata.json` to show success for
  exactly that commit. That strengthens the gate. No
  analyzer step became conditional, `continue-on-error` or unconditionally passing.
- Nit (Info): the `test_replaysEchidnaFalsifyingSequence` comment says the harness sha256 `6a6e6921…` is "same
  as this tree". That is the `beb525dd` harness. The current harness is `4bef9da6…`. The PolicyAccount hash
  `c860fcf7…` does match. The replay only calls actions that exist unchanged in both versions, and it passes.

**Verdict: no property or canary was weakened.**

### A3. Are the properties meaningful? Mutation check

Method: a scratch Foundry test drives only the unmodified harness actions from Echidna's start environment and
asserts the harness's own `echidna_*` properties. It runs once on unmodified source, where all nine tests pass,
and then against nine single-purpose source mutants. A failing driver test means that property catches the
mutant. For the three mutants no property caught, a second scratch test confirmed that the driven sequence
really exercised the mutated behaviour: it fails on clean source and passes on the mutant. The committed unit
suites were then run against those three mutants.

| Mutant | Source change | Caught by Echidna property? | Committed unit tests |
|---|---|---|---|
| M1 | `PolicyAccount.executeWithdraw`: timelock check removed | **Yes**: `timelocks_never_shortened` | n/a |
| M2 | `PolicyAccount._consume`: window-limit revert removed | **Yes**: `rolling_window_cap` | n/a |
| M3 | Destination change effective after `1×delay` instead of `2×delay` | **Yes**: `destination_only_changes_via_timelock` | n/a |
| M4 | `executeWithdraw` does not set `Status.Executed` | **Yes**: `timelocks_never_shortened` (`doubleExecuted`) | n/a |
| M5 | Sweep relayer never writes the nonce bitmap | **Yes**: `sweep_nonce_single_use`, `used_nonces_marked` | n/a |
| M6 | Sweep: net to `feeTo`, fee to `destination`, delta check removed | **No**: conservation sums all sinks | Caught (`GhostPaySweepRelayerTest`: `testFuzz_feeSplitAndConservation` and 8+ others) |
| M7 | Router ERC-20 fee sent to stealth, delta check removed | **Yes**: `fee_plus_net_eq_gross` (per-call recipient delta) | n/a |
| M8 | Router native fee sent to stealth instead of `FEE_RECIPIENT` | **No**: native property sums all sinks; `fee_recipient_only_gets_bps` is ERC-20 only | Caught (`test_payNative_splitsFeeAndNet`, `test_payNative_revertsWhenFeeRecipientRejectsEth`) |
| M9 | Router exact balance-delta check removed (fee-on-transfer accepted) | **No**: `payFotToken` has no post-condition; the burn goes to `address(0)`, so the router holds nothing | Caught (`test_feeOnTransferToken_rejected`, `test_payERC20_revertsWhenPayerIsStealth`) |

Conclusions:

- The PolicyAccount properties and the sweep nonce properties are strong. Every timelock, window,
  destination-delay, double-execution and replay mutant fails a property.
- Gap (Low, test quality): the Echidna properties do not detect **misrouting between sinks** (M6, M8) or
  **fee-on-transfer acceptance** (M9). The committed Foundry unit and fuzz suites catch all three, so the
  overall gate is not blind. The fix stays in the harness only:
  1. Per-call deltas for the destination and `feeTo` in `EchidnaSweep.sweep`.
  2. A per-call `FEE_RECIPIENT` delta check in `EchidnaRouter.payNative`.
  3. A flag in `payFotToken` that a successful call sets, read by a new property.
  The harness owner should decide whether to add them. This review changes no harness.
- Router fee-rate mutants (`FEE_BPS` changes) make every harness payment fail metadata validation, because the
  harness builds the net from 25 bps. The success canaries would then stay unfalsified and fail the gate. This
  is reasoned from source and was not run.

### A4. Canary reachability evidence

- **Latest run on the candidate head**: Contract analysis run **44248573915**, `pull_request`, requested and
  checked-out commit `71abc7e55c25d45b206ac47e5ddd24e072805710` (job log: `HEAD is now at 71abc7e`). The
  **echidna** job (134613402183) succeeded: started 06:07:38Z, completed 06:20:40Z, and the
  `analysis` step outcome was `success`.
  - Artifact `contract-analysis-echidna-71abc7e5…` (id 14403996094, 12,396 bytes, upload digest
    `7ce7ecb2097c07268718c2b0e4a5f29b0b2dbf5424d0b62b1fb3ca984f7e40d3`) **could not be downloaded**. Both
    `gh run download` and `gh api …/artifacts/14403996094/zip` were redirected to
    `productionresultssa16.blob.core.windows.net`, which this sandbox's proxy refuses ("403 to CONNECT").
  - The same refusal applies to run 44242366379's artifact 14400678451 (`productionresultssa31…`).
  - The job log does not contain the report, because the runner writes it to `report.log`.
  - **Per-harness call counts for 44248573915 are therefore not cited here.**
- Reachability is still proven by the gate's logic. `run-echidna.sh` exits 0 only if all 11 canaries report
  `failed!` with at least one transaction, all 13 properties pass, and each harness reports
  `Total calls ≥ 300000`. The step outcome `success` on a commit with byte-identical contracts, harness, config
  and runner implies exactly that.
- The promotion packet cites counts for run 44242366379 on `7a620ff1`: Router 300,062, Sweep 300,034, Policy
  300,046 calls, all canaries reached, and report sha256 `a0db0d06…975e`. This review could not re-download that
  artifact, so those figures are **as reported, not re-verified here**.
- Deterministic reachability: `EchidnaPolicyReachabilityTest` passes 7/7 locally. It covers three native and
  three token executions through harness actions, early executions not counting, and a replay of the
  2026-11-16 Echidna falsifying sequence.
- Residual: Echidna with 4 workers is not bit-reproducible. Canary reachability is probabilistic per campaign,
  as the R-12 history shows. A future red run on a canary is a budget/probability event first, not evidence of
  a code change. The Foundry reachability test is the deterministic backstop for the Policy execution canaries
  only.

## Part B: Fee-token freeze

### B1. Exact scenario (from source)

Scheme 2 ("GP"+2, `0x47500002`) pays funds to the **counterfactual** account
`PolicyAccountFactory.predictAddress(owner, policyHash)`. `GhostPayPolicyRouter._checkPolicyAccount`
(`src/GhostPayPolicyRouter.sol:236-242`, NatSpec `:232-235`) accepts deployed or undeployed accounts. Nothing stops plain
transfers to the same address. Withdrawing requires code at that address, and only
`PolicyAccountFactory.deploy` can put it there.

`deploy` (`src/PolicyAccountFactory.sol:101-123`) charges `FLAT_FEE` before creating the clone, through
`_collectFee` (`:128-164`):

1. Read `balanceOf(msg.sender)`, `balanceOf(FEE_RECIPIENT)` and `allowance(msg.sender, factory)` (`:130-132`).
   A revert or a non-decodable result **reverts `deploy`**.
2. `trySafeTransferFrom(msg.sender, FEE_RECIPIENT, fee)`. If it succeeds, the payer must fall by exactly
   `fee` and the recipient must rise by exactly `fee`. Otherwise `deploy` **reverts `UnexpectedFeeDelta`**
   (`:135-146`).
3. If the transfer fails (pause, blacklist, `false`), the fee is **waived** only when no balance or allowance
   moved and the caller's balance and allowance cover the fee (`:150-163`).

The waiver covers transfer refusal only. Two token behaviours outside it **revert every fee-charging `deploy`
for every caller**:

- (a) `balanceOf` or `allowance` reverting permanently, for example a broken proxy upgrade.
- (b) A transfer that succeeds with a different delta, for example an issuer switching on a transfer fee
  (USDT-style `basisPointsRate`) or a lossy or rebasing upgrade.

No other path deploys the account:

- The factory is immutable, with no admin, rescue or pause.
- The CREATE2 deployer is the factory itself, so another factory, even a zero-fee one with the same
  implementation, or a direct `Clones` call yields a different address.
- Paying as `FEE_RECIPIENT` also fails: the payer delta is 0, not `-fee`.

**Funds at every undeployed account of that factory, in every asset including native ETH, stay frozen until
the token issuer reverses the change.** Deployed accounts are unaffected: they never call the factory again.

Probe (scratch, not committed), `forge test --match-contract E2FeeFreezeProbeTest`, 4/4 pass:

- `test_feeSwitchFreezesCounterfactualFunds_noAlternativeDeployer`: 1,000e6 USD and 5 ETH sit at the
  counterfactual address. A 0.1% fee switch makes `deploy` revert `UnexpectedFeeDelta` for the payer, a third
  party, `FEE_RECIPIENT` and the owner. A zero-fee factory and a direct clone predict other addresses. Deploy
  succeeds only after the issuer sets the fee back to 0.
- `test_brokenFeeTokenViewsFreezeCounterfactualFunds`: a reverting `balanceOf` reverts `deploy`.
- `test_zeroFeeFactoryImmuneToBothSwitches`: with `FLAT_FEE = 0`, deploy succeeds with the fee switch on and
  the views broken. No token call is made.
- `test_transferRefusalIsWaived_contrastCase`: a paused `transferFrom` is waived, as documented.

**Can it lock user funds?** Yes, conditionally. The trigger is an issuer action or a bug in the fee token, not
an attacker. It hits only factories with `FLAT_FEE != 0`, and only for accounts not yet deployed when the token
changes. The loss is a freeze, not a theft. Recovery depends on the issuer alone.

**Which deployments it affects.** Any `PolicyAccountFactory` with `FLAT_FEE != 0` whose `FEE_TOKEN` is
upgradeable or has an owner-controlled fee, rebase or view-gating switch. The documented default is exactly
this case: `docs/FEE_SCHEDULE.md:18` sets F-SECURE to a flat fee "in the chain's stablecoin, default USD 3.00",
and `packages/contracts/README.md:162` shows `FEE_TOKEN=<stablecoin> FLAT_FEE=3000000`. Common chain
stablecoins are upgradeable proxies, and Ethereum USDT also carries a transfer-fee parameter. Today:

- No scheme-2 factory is recorded anywhere. `deployments/` holds only `31337.json` (scheme 1, no `policy*`
  fields), and `apps/web/deployments/` holds only a README.
- Scheme 2 is not deployed on any public chain, per `REVIEW_FINDINGS.md` R-11 and the factory dispositions.
  This review found no contrary evidence in the repo but cannot prove it on-chain.

### B2. Are scheme-2 deployment paths blocked?

| Path | Blocked by code? | Evidence |
|---|---|---|
| `packages/contracts/script/DeployPolicy.s.sol` (factory deploy) | **No** | Requires `FEE_TOKEN` with code, `FLAT_FEE ≤ MAX_FLAT_FEE`, and a chain allowed by `DeployBase._chainAllowed`. That means the six built-in testnets **with no flag**, plus any chain in `ALLOWED_CHAIN_IDS` (mainnets included). Nothing rejects or flags `FLAT_FEE != 0` with an upgradeable or fee-switch token. The README's example command is the affected configuration. |
| `packages/contracts/scripts/pre-deploy-check.sh policy` | No (advisory only, same checks) | `:73-82`, `:113-123` |
| `scripts/testnet/deploy.sh` | Not a scheme-2 path | Runs `Deploy.s.sol` (router + sweep) only |
| `scripts/testnet/make-manifest.mjs --policy-broadcast` | No | Copies any `FEE_TOKEN` and `FLAT_FEE` into the manifest (`:114-134`) |
| CI / release workflows | Yes (no deploy step) | `grep 'forge script\|--broadcast\|DeployPolicy' .github/workflows/` finds nothing |
| Web client (`apps/web/src/features/policy/chain.ts`) | **Yes** | `verifyPolicyDeployment` throws for `!chain.testnet` (`:78`). `PINNED_POLICY_DEPLOYMENTS` is empty (`:34`), so every network throws `policy.deployment.untrusted` (`:84`). The feature is also behind `VITE_GHOSTPAY_EXPERIMENTAL_POLICY`. |
| Web client deploy step (`withdraw.ts:149`) | Yes, at deploy time only | `deployCall` refuses `flatFee != 0`. The receive/create views do not check the fee first (Low, UX). |
| Bundled manifests (`apps/web/deployments`) | Yes | The build fails on any manifest unless `GHOSTPAY_RELEASE_PUBKEYS` is set (`scripts/pages/build-pages.sh:94`, `apps/web/scripts/validate-deployments.mjs:47`); it was empty in Pages CI run 44248573838 (site job env). That repository variable is the manifest trust root; `.github/release-signers/allowed_signers` (tag signing, 0 key lines) plays no part in manifest validation (they are separate trust roots). The web code also does not consume manifest `policy*` fields. |

**Result:** GhostPay's own client cannot pay or receive through any scheme-2 factory today. That is enforced in
code by the testnet-only check and the empty pinned profile list. **The factory deployment path itself is not
blocked by code.** An operator can deploy a fee-charging factory on a testnet with no flag, or on a mainnet by
setting `ALLOWED_CHAIN_IDS`, using an upgradeable or fee-switch stablecoin. Pinning that factory later would
enable the freeze. Per this task's rule, this is recorded as **High (SEC-E2-01)**, with the current exposure
noted as none.

### B3. Forge results (this tree, solcjs shim)

```
PATH=~/.foundry/bin:$PATH; cd packages/contracts
FOUNDRY_SOLC=<shim> FOUNDRY_OUT=<scratch> FOUNDRY_CACHE_PATH=<scratch> forge test --match-contract \
  '^(PolicyAccountFactoryTest|DeployPolicyTest|PolicyAuditTest|Review24FactoryAuditTest|EchidnaPolicyReachabilityTest|MythrilFactoryDispositionsTest)$'
```

Result: 6 suites, **95 passed, 0 failed**:

| Suite | Passed |
|---|---|
| `PolicyAccountFactoryTest` | 32 |
| `MythrilFactoryDispositionsTest` | 33 |
| `PolicyAuditTest` | 21 |
| `EchidnaPolicyReachabilityTest` | 7 |
| `DeployPolicyTest` | 1 |
| `Review24FactoryAuditTest` | 1 |

The scratch probe `E2FeeFreezeProbeTest` passed 4/4. The scratch mutation driver passed 9/9 on clean source,
with mutant results as in A3.

The committed suites prove fail-closed behaviour: `UnexpectedFeeDelta` and view-revert rollbacks. **No committed
test pins the freeze end to end** (funds at the counterfactual address, then a token change, then no deployer).
The earlier `test_probe_feeSwitchFreezesCounterfactualFunds` was a scratch probe that was never committed.

### B4. Owner decision options

| | A. Zero-fee factory for upgradeable / fee-switch tokens | B. Specified fail-open `_collectFee` |
|---|---|---|
| Change | Configuration only, with a qualifier: deploy with `FLAT_FEE = 0`. The constructor allows a zero `FEE_TOKEN` when the fee is zero (`PolicyAccountFactory.sol:84-87`), but the committed deploy path does not: `DeployPolicy.s.sol` reverts `FeeTokenNotSet` for an empty or zero `FEE_TOKEN` (`:48`, `:50`) and `FeeTokenHasNoCode` for a codeless one (`:61`), and requires `MAX_FLAT_FEE`; `packages/contracts/scripts/pre-deploy-check.sh:73` rejects a zero `FEE_TOKEN` too. So pass a real token address that has code (never called when the fee is zero); a zero `FEE_TOKEN` needs a script change, which is reviewable code, not configuration. Charge F-SECURE elsewhere, or not at all. | Contract change. Wrap the three views in bounded `staticcall`s; on view failure **or** wrong delta, emit `FeeWaived` and deploy instead of reverting. Spec, `DEVIATIONS` P7 and NatSpec must change. |
| Freeze removed? | **Yes, fully.** `deploy` makes no token call (`_collectFee` skipped at `:114`); proven by `test_zeroFeeFactoryImmuneToBothSwitches` and `test_R6_feeFreeDeployMakesNoTokenCallAndReleasesGuard`. | Yes for (a) and (b), if implemented correctly. |
| New risk | None on-chain. Revenue must be collected another way (client, router-side or off-chain); a cheaper policy-account creation may change the abuse model. | A wider fee-evasion surface: forcing a view out of gas (63/64 rule) or a token hook making views fail then forces a waiver. An **explicit gas floor** and a re-derived R11 bound are needed. AUD24-02 gets broader. On a wrong delta, the partial transfer has already happened: the payer may be over-debited or the recipient under-paid, and that is accepted, not reverted. |
| Verification cost | None for the contracts. The bytecode is unchanged, the Mythril R4-R11 dispositions stay valid, and `DeployPolicy` already accepts an explicit `FLAT_FEE=0` with a real `FEE_TOKEN` that has code (never called). | New bytecode: re-run Slither, Echidna and Mythril, re-do the R4-R11 dispositions (PCs change), add new tests and a mutant set, and get an external audit before any mainnet use. |
| Mythril gate | Unchanged (it analyses symbolic constructor args, so it stays red with the existing dispositions). | Changes, and needs new dispositions. |
| Fits "experimental, testnet-only" (ADR-0027) | Yes | Adds contract scope ahead of the open ADR-0027 revision |

Complementary in both cases: the client should deploy the account before publishing a scheme-2 meta-address
wherever the counterfactual UX is not essential. This removes the window entirely. The receive/create views
should refuse a fee-charging factory up front, not only at `deployCall`.

**Recommended default: Option A.** Make it mechanical:

- `DeployPolicy` refuses `FLAT_FEE != 0` unless an explicit, named acknowledgement variable is set **and** the
  fee token is recorded as non-upgradeable with no fee switch.
- Any pinned scheme-2 profile carries `flatFee: 0` unless the owner has signed off on such a token.

Revisit Option B only if on-chain F-SECURE collection is a hard requirement. It then needs a written spec of the
fail-open conditions, a gas floor, and a full re-analysis and external audit.

## Findings

| ID | Severity | Title | Status |
|---|---|---|---|
| SEC-E2-01 | High (task rule: not blocked by code) / exposure none today | Scheme-2 factory deploy path does not block a fee-charging factory with an upgradeable or fee-switch token; such a factory freezes counterfactual funds on a token change | Open: owner decision B4 plus a `DeployPolicy` guard |
| SEC-E2-02 | Medium, conditional (= R-11 / N1) | `_collectFee` reverts all fee-charging deploys on fee-token view failure or wrong delta; no alternative deployer | Open (owner, before any scheme-2 deployment) |
| SEC-E2-03 | Low (test quality) | Echidna properties miss sink misrouting (M6, M8) and fee-on-transfer acceptance (M9); unit tests catch them | Open (harness owner) |
| SEC-E2-04 | Low (UX) | Policy receive/create views do not refuse a non-zero `flatFee` before funds arrive; only `deployCall` does | Open; not reachable while `PINNED_POLICY_DEPLOYMENTS` is empty |
| SEC-E2-05 | Info | `EchidnaPolicyReachability.t.sol` comment calls harness `6a6e6921…` "same as this tree"; current harness is `4bef9da6…` | Open (doc nit) |

## Commands run

| Command | Result |
|---|---|
| `git log/diff beb525dd..HEAD -- packages/contracts/test/echidna packages/contracts/echidna.yaml packages/contracts/scripts/run-echidna.sh scripts/tests/echidna-runner.test.mjs .github/workflows` | Only `292b15b3` (additive harness actions) plus the workflow edits in A2 |
| `node --test scripts/tests/echidna-runner.test.mjs` | 22/22 pass |
| `gh api repos/djshellshoxxx/GhostPay/actions/runs/44248573915{,/jobs}` | echidna job success; mythril job failure at 06:54:55Z (the run concluded `failure`) |
| `gh api repos/djshellshoxxx/GhostPay/actions/runs/44248573915/artifacts` | First call (before the Mythril upload at 06:54:52-54Z): 1 echidna artifact. Re-read in the critic pass: 2 artifacts, mythril 14404534228 (17069 B) and echidna 14403996094 (12396 B) |
| `gh api …/actions/jobs/134613402183/logs` | Fetched; checkout `71abc7e5`; `ANALYSIS_OUTCOME: success` |
| `gh run download 44248573915 …` and `gh api …/artifacts/14403996094/zip` | Blocked: proxy 403 to `productionresultssa16.blob.core.windows.net` |
| `gh run download 44242366379 …` | Blocked: proxy 403 to `productionresultssa31.blob.core.windows.net` |
| `forge build` (default solc) | Blocked: `binaries.soliditylang.org` tunnel error |
| Targeted `forge test` (B3) | 95/95 pass |
| Scratch `E2FeeFreezeProbeTest` | 4/4 pass |
| Scratch mutation driver: clean source + M1-M9, plus effect tests and unit suites on M6/M8/M9 | As in A3 |

Scratch files from this session were not committed: the shim, probe, driver, mutant diffs and logs. Reruns need
network access to the solc binary host, or the shim described in Provenance. The freeze probe is short enough to
recreate from B1. If the owner wants a permanent regression test, add one to `PolicyAccountFactory.t.sol` that
pins the freeze end to end.

## Owner actions

1. Choose B4 Option A (recommended) or B before any scheme-2 deployment on any public chain, testnets included,
   if the factory will be pinned.
2. Approve a code guard in `DeployPolicy.s.sol` refusing `FLAT_FEE != 0` without an explicit acknowledgement
   (SEC-E2-01).
3. Decide whether to strengthen the Echidna harness per A3 (SEC-E2-03). Any change must stay harness-only and
   must not alter thresholds or budgets.
4. Re-fetch the Echidna artifact of run 44248573915 from a network that can reach GitHub artifact storage, and
   record its report sha256 and per-harness `Total calls`.
5. An external audit remains required. This AI review is not one.

## Open

- Per-harness call counts and the report hash for run 44248573915 (artifact download blocked here).
- Mythril job of run 44248573915 completed with conclusion `failure` at 06:54:55Z, so the run concluded `failure`.
  Mythril is out of scope here; its records are dispositioned in the Mythril re-evaluation documents.
- Echidna harnesses outside `packages/contracts` were not reviewed.
- On-chain absence of scheme-2 factories is asserted from repo records only.
