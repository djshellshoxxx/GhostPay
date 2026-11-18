# GhostPay beta candidate — latest handoff

Single source-pinned handoff for the consolidated beta candidate. Update this file in place at each milestone;
older per-agent logs (`CHATGPT_ZERO_CODEX_LATEST.md`, `AUTONOMOUS_RUN_*`) remain history.

## Checkpoint 1 — 2026-11-12 UTC

- **Branch:** `nodata/jolly-rubin-u4zd45` → draft [PR #135](https://github.com/djshellshoxxx/GhostPay/pull/135),
  base `integration/ghostpay-beta-consolidated-20261109` (#98 head `364b1f18`).
- **Started from:** combined beta head #121 `ca358acfa8f48d4deff9b770214bcba797b6b1f0` (no source branch edited,
  no force-push; every source merged with `--no-ff` and its SHA in the message).
- **State:** `CODE_COMPLETE` is **not** claimed. Not `BETA_QUALIFIED`, not `DEPLOYED`.

### Integration matrix

| PR | Head SHA | Base | Unique changes | Overlap | CI on own head | Action |
|---|---|---|---|---|---|---|
| #121 | `ca358acf` | #98 | combined #119/#118/#117/#114 | — | RED: ts-lint, e2e lean/full (3 camera tests) | base; both failures FIXED here |
| #119, #117 (+#113), #114, #116 | in #121 | — | — | — | — | ALREADY_INCLUDED (ancestors of #121) |
| #118 | `97b919c9` | #98 | 3 commits after #121: stress test, grief-reserve docs | relayer README/runbook (auto-merged) | green 24/24 | INTEGRATE (merged tail) |
| #129–#134 | `3fd18ef4` `eb21d57c` `bbc7dda4` `c3173f84` `f3a9b238` `8277879e` | #121 | ports of #125 #123 #124 #126 #127 #122 | none | not established | INTEGRATE; fix diff identical to originals |
| #122–#127 | `72dde82d` `7cdc6b32` `afaf7ce6` `a6e74591` `d7795690` `cf3a8b23` | #98 | — | same files as ports | mixed | SUPERSEDED by #129–#134 (identical code change) |
| six-fixes-combined branch | `36dfa8d2` | #121 | 4 of 6 ports | byte-identical to ports | — | SUPERSEDED |
| #128 | `1a5e815d` | #121 | integration-matrix doc | — | — | INTEGRATE |
| #115 | `c6ce2259` | main | release integrity, hosting, crypto/EIP-712 differential tests, audits 26/27, Solana/TRON fixes, privacy threat model | 13 files | RED only at `forge snapshot --check` | INTEGRATE + FIX (snapshot entries added) |
| #102, #103, #104, #112, #120 | `a2f4205f` `621ee0af` `fa375dbc` `0476cb11` `747239db` | #98 / main | docs | wiki pages (#112) | — | INTEGRATE (docs) |
| #39, #40, #44 | `1d28f24d` `63994db6` `fd710eb3` | old stacks | D3/AR2/B2R, fd-bound secrets, report mode | — | — | ALREADY_INCLUDED (reimplemented; verified by code reading) |
| #85, #86, #87, #49 | dependabot | main | dependency bumps | lockfile | — | DEFER (separate dependency review) |
| #51, #52, #81, #82, #100 | automation | main / #98 | API-funded agent workflows | — | — | DEFER (paid APIs not authorized; #100 is a separate workflow-security decision) |
| #42, #43, #54–#58, #75, #76, #83, #101 | docs/research | main | historical research/handoffs | — | — | DEFER (no beta code) |
| #59–#74, #78, #84, #88–#96, #98 | older stacks | — | ancestors of #121 | — | — | ALREADY_INCLUDED |

### Fixes made on this branch

1. `packages/chain-adapters/src/payments.test.ts`: lint `no-unnecessary-type-assertion` vs `tsc` conflict, resolved
   with a `Hex`-annotated constant (#121 ts-lint RED).
2. `apps/web/e2e/camera-browser.ts` + both `qr-camera*.spec.ts`: Playwright's default `chrome-headless-shell` has no
   usable `getUserMedia`, so the app (correctly) reported "Camera scanning is unavailable here". Specs now run full
   Chromium (`channel: 'chromium'` when no local executable is configured). Reproduced RED with the headless shell
   locally (3 failed), GREEN with full Chromium (4 passed).
3. `packages/contracts/.gas-snapshot`: 4 entries for the audit-26 PoC tests (#115 RED); no existing entry changed.
4. #115 merge: `verify-release.sh` keeps the audit L7-M2 explicit-manifest contract on top of #115's strict
   verifier; L7-M2 regressions ported to `scripts/tests/release-verify.test.mjs`; self-host selftest fixtures use a
   real release-channel manifest. Details in merge commit `8755b7d`.

### Open items

- **P1 — AUD24-01 (Medium, privacy):** `GhostPayPolicyRouter` takes `PolicyRef{owner, policyHash}`, so the seller-
  constant `policyHash` is in calldata (regression of round-3 N-01). Fix = restore the salt-only ABI (`50881e4`) in
  lockstep with `packages/policy-scheme` and `payer-hiding-contracts/RouterCall.sol`. Public ABI change: owner
  decision. Policy accounts are `later-preserved` (outside beta scope, `LEAN_RELEASE_SCOPE.md`); keep undeployed.
- **P1 — AUD24-02 / CORE-01 / CORE-02 (Low):** documented PoCs in `test/audit/Review24.audit.t.sol`.
- **Release gate — SonarCloud D (#84):** sonarcloud.io is unreachable from the agent sandbox and the check output has
  no issue list. Needs an exact-head SonarCloud run (owner/CI) and triage of the listed issues.
- **Release gate — independent review, signed release key** (`.github/release-signers/allowed_signers` is empty),
  public testnet manifests, physical devices/wallets: owner actions.
- **Deferred:** dependabot #85–#87/#49 need their own compatibility review.

### Tests executed

Hosted CI on PR #135 is authoritative for an exact SHA; local runs used node 22.23.4, Foundry 1.8.5, native solc 0.8.28.

| Check | Where / SHA | Result |
|---|---|---|
| Application CI (lint, typecheck, build, unit shards, contracts test/static/coverage/slither/extra, relayer, e2e lean+full, lean-candidate) | CI run 43298468905 @ `d725469c` | 33/34 jobs green; `ts-test (rest-2)` RED: `invoice-schema/src/independent.test.ts` A256GCM-PW mutation test timed out at 60 s (~28 scrypt N=2^15 derivations at ~2 s each on hosted runners). Fixed with an explicit 180 s budget in the next commit; awaiting CI |
| Beta acceptance workflow (lib + cli + browser on anvil) | run 43298468900 @ `d725469c` | PASS |
| Integration (anvil + bitcoind regtest + solana-test-validator) | run 43298468907 @ `d725469c` | PASS |
| CLI operator (ubuntu, macOS, Windows) | run 43298468916 @ `d725469c` | PASS 3/3 |
| Hosting kit + qualify-ghostpay-web | run 43298468922 @ `d725469c` | PASS |
| `bash scripts/beta/acceptance.sh` (local) | `d725469c` | ACCEPTANCE OK: lib 14 steps / 14 real anvil transactions (ETH, USDC, USDT, DAI pay; fee parity; scan 4/4; receipt with inflated claim refused; direct + relayer sweeps; relayer replay refused `409 nonce_used`; backup/restore rescan); CLI 124/124; browser 3/3 real-chain journeys |
| `npm test` (local, all workspaces) | `f36878c1` | web 2523 pass / 3 fail: 2 `privacyInvariants` (fixed in `d725469c`), 1 `ReconciliationLedger` load timeout (83 ms isolated, green in hosted CI). Other workspaces pass; `confidential-contracts` not runnable locally (Hardhat cannot download solc here; green in hosted CI) |
| `node --test scripts/{testnet,regtest,tests}/*.test.mjs` | `f36878c1` | 104 pass, 1 skip |
| `forge snapshot --check`, `forge fmt --check`, natspec | `65bdda2f` | PASS |
| `deploy/selftest.sh`, `infra/proxy/check-headers.sh`, `check-actions-pinned` | `426192f4`+ | PASS |

Not executed: SonarCloud (unreachable from the sandbox), physical devices/wallets, public testnet, Echidna/Mythril
(nightly only). The planned multi-agent P0 review (9 lanes) did not run: every agent failed on the account's weekly
usage limit (resets 2026-11-18 01:00 UTC).

### Next highest-priority action

Confirm PR #135 CI is 34/34 green on the head carrying the invoice-schema budget fix, then (after 2026-11-18, or by
a human) run the independent P0 lane review that could not run here, an exact-head SonarCloud analysis, and
the owner decisions listed under Open items.

### Other open items found during integration

- `.github/workflows/openai-agents.yml` on `main` is not a valid workflow (a bare step list, no `on:`/`jobs:`), so
  every push records a failed run; it also targets a paid API. Owner decision: fix or remove.
- `apps/web/src/lib/embedHost.ts` `fetchMerchantProfile` has no production caller (merchant embedding is
  `later-preserved`); it now requires an injected fetch.
