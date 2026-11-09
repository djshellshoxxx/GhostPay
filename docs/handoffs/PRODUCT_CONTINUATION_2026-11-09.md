# GhostPay product continuation — 2026-11-09

Draft delivery: [PR #89](https://github.com/djshellshoxxx/GhostPay/pull/89), branch
`codex/ghostpay-product-20261109`, stacked on **#84 → #88 → #89**. No merge, release,
contract deployment, real-wallet transaction, source-branch deletion or API-funded workflow was performed.

## Source and scope

Verified starting refs: main `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`, #84
`48b6bc20108079bb7fbf89997249734bf9f41646`, #88
`0a68a57b77a70d3bcf4635ccbc5190d735e71f40`.
The old completion list overstated missing code. Public pairing, Settings/Registry exchange, encrypted
reconciliation, proposal confirmation and receipt archival were already present. Work therefore targeted
reproducible acceptance defects, W5 residuals and the evidence-backed policy design gap.

The [source ledger](PRODUCT_CONSOLIDATION_2026-11-09.md) proves #60/#61/#64/#65/#66–74 are already
ancestors of #88. #75's sixteen added research files are identical to the existing content port. None needed
another wholesale merge. #83 stays a separate historical docs-only planning audit. #79/#82/#51/#52 remain
owner-only automation decisions. The broader #84 Sonar gate remains open; see the
[actual annotation triage](../audits/SONAR_TRIAGE_2026-11-09.md).

## Worker delivery and published commits

| Lane | Completed behavior | Published commits |
| --- | --- | --- |
| Coordinator | Correct privacy-window estimates when provider heads fall; integrate isolated workers; current completion gates and validation | `b1a622b3a8971b4b15985192505cd806d2f0b00d`, `dec0c3c48b49b964ce088b4fde0190a20ec29afd` |
| Source/CI audit | Full-history containment, open-review disposition, exact-head check records and twelve recovered Sonar annotations | `0761ccb9ebbe4fbe9afe1cdf3b6d5c05c91298fc` |
| Public QR/device exchange | Reject unknown/disabled pairing chains; repeat file imports; clear/cancel pending work; invalidate changed Settings/Registry scope; camera status follows language | `99b28a46259c2430ebbf61371956b5051df55d81`, `6c510f9532c920e9240cdd4de07b1fbf9a16f116`, `7ea6287b6ed2da3ec97aee633f220e26223e5fae` |
| Reconciliation/archive | Transaction-time scan guards, unsaved competing observations, expiry ambiguity, recipient consistency, accurate archive disclosure and data-lifecycle guide | `7817ce96a2d14fce15bde5d3af2e34d8fbadeb1a` |
| Policy scheme 2 | Invalidate deployment/session-bound actions before wallet submission; keep asset fixed during reads; complete current-state design and adversarial acceptance matrix | `2771bc5fd934e012a1ea55ceacc1410dff9298eb`, `038768315c40a8b46b5c687c9f225b92c486cec2` |
| Localization | Receipt/error/history and Solana/TRON message wiring; 192 catalog keys, 187 security keys held in English; pure source translator usable by Node tooling | `33366f6efa6901b6cdd3abc7c41afbc89c6ff820`, `ee890b7afd7f675d62d5315cb98493017296b300` |
| Independent review | Read-only final diff and integration-blob review; 135 independently executed focused tests plus 24 on the Node import correction; reproduced baseline failures | No overlapping source edits |

Local workers used separate worktrees/branches. Published commits were created through the GitHub connection
because local Git had no push credential. Every uploaded blob and commit tree was compared with its Git object
SHA; the fetched remote tree equals the local tree byte-for-byte. No force-push or shared-history rewrite was used.

Qualification snapshot: published `247a7b7593a14526df131ea19e3bb9217bf4d278`, local
`da23faebf9920a5cdf5671d535f60d467c1fd477`, shared tree
`959634ef7e8a1bb77739eabf95788ad57ba0309f`. Subsequent changes in this handoff are documentation only.

## Validation

Environment: Node 24.22.1 (repository requires >=22; hosted CI uses 22), npm 11.9.0, Foundry/Anvil 1.8.5,
Solc 0.8.28, system Chromium 156.0.8078.79. No dependency versions or check thresholds changed.

### Isolated feature checks

- QR lane: 85 tests / 10 files; web typecheck and targeted ESLint passed. Both camera-race regressions fail
  the parent source. Independent test-only baseline overlay reproduced six QR regressions.
- Reconciliation lane: 134 tests / 10 files; web typecheck and targeted ESLint passed. Independent baseline
  overlay reproduced eight failures, including stale CAS, expiry, wrong recipient and unsaved competitors.
- Policy lane: 104 web tests / 7 files and 95 policy-package tests / 6 files with `REQUIRE_ANVIL=1` passed.
  All eight new scope regressions fail the original #88 source. Package coverage: 97.11/94.70/100/99.74%.
- W5 lane: 174 tests / 18 files passed. The Node-import correction additionally passed 97 focused tests /
  13 files and collected 59 Playwright tests. These counts overlap; do not add them as distinct tests.
- Coordinator scanner: both new falling-head regressions failed before the fix; `npx vitest run
  src/lib/scanClient.test.ts src/lib/scanSpam.test.ts` passed 82/82 afterward.

### Integrated commands and evidence

| Command | Tested source | Result |
| --- | --- | --- |
| `npm ci --ignore-scripts`; `npm run build:libs` | Qualification `247a7b7` | Both exit 0 |
| `npm run typecheck`; `npm run lint` | Integrated `dec0c3c` | Both exit 0; after the Node-import correction, `npm run typecheck -w @ghostpay/web` and `npm run lint -w @ghostpay/web` also exit 0 on `247a7b7` |
| `npm test`, with `REQUIRE_ANVIL=1 VITEST_MAX_WORKERS=2` and the Anvil/Solc paths below | Integrated `dec0c3c` | Exit 1: 9,688 Vitest passes, 2 failed tests, 72 skipped tests, plus a payer-sponsor collection failure; 46 Hardhat tests passed. All three failing workspaces concern missing fixtures; see reruns below. This single command was not green |
| `npm test --workspace @ghostpay/web`, with the same environment | Qualification `247a7b7` | Exit 0: 2,043 coverage tests plus 1 separate fuzz test passed; 1 live-bitcoind test skipped. Coverage: statements 93.33%, branches 88.91%, functions 95.15%, lines 96.85% |
| `npm test -w @ghostpay/external-pools-privacypools -w @ghostpay/external-pools-railgun -w @ghostpay/payer-sponsor`, with Anvil available and without globally forcing `REQUIRE_ANVIL` | Integrated `dec0c3c`; these package sources are unchanged at `247a7b7` | Exit 0: 225 passed, 5 optional external-fixture tests skipped; includes all 4 payer-sponsor Anvil tests after building its pinned fixture |
| `npm run build --workspace @ghostpay/web`; `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web` | Qualification `247a7b7` | Both exit 0; automatic bundle scans passed, 13 full / 12 lean emitted files |
| `forge build`; `forge fmt --check`; `forge test -j 2`, in `packages/contracts` | Original #88 `0a68a57`; contract source/configuration unchanged at `247a7b7` | All exit 0; 411 tests passed, 0 failed, 0 skipped |
| `node scripts/i18n/check.mjs`; `node scripts/i18n/extract.mjs`, in `apps/web` | Qualification `247a7b7` | 0 catalog errors, 779 warnings; 1,308 used keys, 0 missing, 65 unused |
| `npm run ci:scan-secrets`; `npm run ci:check-actions` | Qualification `247a7b7` | Both exit 0; all 89 Actions references pinned |
| `git diff --check` | Final documentation successor | Exit 0 |

The local broad run used tree `61cf73ae7e57aa9c2b5beabe05b4a6c87772d7fa` (local commit `7838ace10d3e94acd2da9000504c56be62e3fb62`, published `dec0c3c48b49b964ce088b4fde0190a20ec29afd`). Its source remained fixed while tests ran. Only web source and documentation changed afterward; the complete web suite was rerun on the qualification tree. Counts from overlapping runs must not be added together.

Anvil test commands used `PATH=/workspace/scratch/0eeb5e74bd49/tooling:$PATH`,
`ANVIL_BIN=/workspace/scratch/0eeb5e74bd49/tooling/anvil`,
`SOLC_BIN=/home/agent/.local/share/svm/0.8.28/solc-0.8.28` and `VITEST_MAX_WORKERS=2`.
Only the broad run and final web run additionally used `REQUIRE_ANVIL=1`.

### Hosted qualification

For exact head `247a7b7593a14526df131ea19e3bb9217bf4d278`, all **26 check runs passed**:
[CI run 42588599016](https://github.com/djshellshoxxx/GhostPay/actions/runs/42588599016)
and [Hosting kit run 42588599025](https://github.com/djshellshoxxx/GhostPay/actions/runs/42588599025)
both completed successfully. This includes full and lean browser execution, all TypeScript shards,
contract tests/coverage/Slither/static checks, lean reproducibility and hosting qualification.
These checks validate the corrected runtime code. The final handoff/index commit changes documentation only;
its newly triggered checks must be inspected separately and are not represented as completed here.

Parent #84 at `48b6bc2` still had the SonarCloud D-rating failure (31 successful checks and a draft-review
skip); #88 at `0a68a57` had 26 successful checks. No Sonar check was returned for this narrow child at
`247a7b7`; child CI success does not clear the broader parent's Sonar gate.

### Browser execution boundary

The first integrated E2E attempt on `dec0c3c` failed during collection because the new receipt error helpers
imported React/Vite's catalog loader into Node. This was a code regression, fixed in `ee890b7`; pure source
catalog/translator modules retain the same English catalog and security fallback without browser-only imports.

On qualification snapshot `247a7b7`, all 59 tests collect. The full command
`GHOSTPAY_CHROMIUM=/usr/bin/chromium npm run test:e2e --workspace @ghostpay/web` then returned exit 1:
58 browser launch failures, 1 profile-dependent skip. Chromium fails before page execution with
`process_singleton_posix.cc:297: socket() failed: Operation not permitted`. No browser behavior passed locally.
Lean browser execution was not repeated because it uses the same blocked launcher. Full and lean production
builds and bundle scans pass. The hosted **full and lean browser jobs passed on this exact corrected head**
in CI run 42588599016; #84/#88's older browser passes are not substituted. No sandbox or CI gate was weakened.

### Optional research fixtures

The broad workspace run mistakenly applied `REQUIRE_ANVIL=1` globally. CI sets it only for selected packages.
This made absent optional fixtures fail instead of skip. Exact initial failures remain recorded; reruns use the
repository's intended environment and explicitly list skipped coverage.

- Privacy Pools needs `PP_CONTRACTS_OUT` from upstream `d494b63e79f33bb2b0c8ece6cdacdca465c3b884`
  plus six pinned commitment/withdraw WASM, proving-key and verification-key files in `PP_ARTIFACT_DIR`.
  Those external files are absent. Intended-environment rerun: 73 passed, 4 skipped.
- Railgun needs `RG_CONTRACTS_OUT` from upstream `36bcf5ed7cf94bfafb6e1a303e1832c769c16780`, including
  its test token and matching dependencies. Those external files are absent. Rerun: 20 passed, 1 skipped.
- Payer sponsor initially lacked local compiled fixtures. `bash scripts/fetch-entrypoint.sh` fetched the
  repository-pinned test-only EntryPoint 0.7.0 into ignored `.vendor`; `forge build` in
  `packages/payer-hiding-contracts` passed, then its 132 tests passed with no skips. No vendored files were committed.
- Internal pool witnesses/end-to-end fixtures remain unavailable. Building them also regenerates ceremony/
  verifier artifacts and is outside this change; `REQUIRE_POOL_E2E` was not enabled. This is skipped coverage,
  not proof that pool integrations work.

## Remaining gates and next steps

1. **Policy end-to-end remains blocked.** [ADR-0027](../adr/ADR-0027-policy-end-to-end-gates.md) specifies
   authenticated deployment/code identity, independent scheme-2 payment verification, durable withdrawal
   recovery and implemented lost-key recovery. ADR-0023's inactivity design cannot bound recovery delay while
   a compromised owner keeps acting. Resolve that design before implementing/enabling the full route.
2. **Localization is not complete application coverage.** [W5 record](W5_RESIDUALS_2026-11-09.md) lists
   residual unowned literal copy and source-default callers. Spanish/Japanese/Arabic remain machine drafts;
   security translations need human review. 779 catalog warnings include intentional English security placeholders.
3. **Broader Sonar review remains required.** The corrected runtime head passed all 26 hosted checks;
   inspect any later head separately. Do not lower or suppress the parent gate. Visible Sonar annotations do
   not establish which issue causes #84's D rating.
4. **Owner decisions remain separate:** automation and branch protection; licence; release-signing identity;
   manifests/deployments/custody; professional audit; real wallet/device and funded-chain qualification.
5. Review in order **#84, #88, #89**. Preserve source PRs/branches. This draft does not grant merge or release authority.

User guides: [public device exchange](../user/public-device-exchange.md) and
[reconciliation/receipt storage](../user/reconciliation-and-receipts.md). Public QR configuration is never a
secret backup. A receipt signature establishes key control and consistency of signed fields, not identity or
independent proof of payment.
