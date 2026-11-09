# GhostPay policy/localization continuation — 2026-11-09

Delivery: [draft PR #90](https://github.com/djshellshoxxx/GhostPay/pull/90),
`codex/ghostpay-policy-localization-20261109`, stacked on **#84 → #88 → #89 → #90**.
This is reviewable development work. Nothing was merged into main, released, deployed on a public
chain/site, paid with funded keys, or used to enable API-funded automation. Existing production
contracts, fee policy, deployment manifests, trust roots, dependencies and CI gate definitions are unchanged.

## Starting and qualified source

| Ref | Verified starting head |
| --- | --- |
| main | `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d` |
| #84 | `48b6bc20108079bb7fbf89997249734bf9f41646` |
| #88 | `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` |
| #89, this change's base | `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` |

The existing local checkouts, including another session's dirty completion-gates file, were preserved.
The new checkout has full ancestry; the live PR heads/reviews and source-owner ledger were checked before
selecting the descendant of #89. No already-contained feature stack was replayed.

Whole-workspace qualification snapshot: remote `ad095af3c7522583a72c4c3d0249644cd2fb8382`, local
`fb8a35e6a7a657ec6262cea3383db5141ec67c18`, shared tree
`9388fdcbd700134d9185475809e5fd173a858e88`.
Final application qualification snapshot: remote `80944a1d13a55b85ca36fc18be903dd56cc4a56f`, local
`f59e004a7217398807792c0935f47d3a5dcebc7e`, shared tree
`51a016e2e0067be0626d76712aeae750ad42d360`.
The final browser-test correction is remote `42ae712f5804724b4213bed4e2e0cb129f855abf`, local
`1fa72f83a9eedbf399d58d48c06c2c18d6320146`, shared tree
`9a88798c65a619ad9149c0924a495f7d33764364`; it changes only the reload assertions in
`apps/web/e2e/reconciliation.spec.ts`. Subsequent coordinator handoff/index changes are documentation only.

Shell push authentication was unavailable. Publication used the GitHub connection with expected-head
checks and fast-forward ref updates. Every uploaded blob and commit tree was compared to the local Git
object, and fetched remote trees were checked for equality. Remote commit IDs differ from local
cherry-picks because the connection creates the commit objects; their source trees are identical.

## Workers and integrated behavior

All six lanes had separate branches/worktrees and explicit file ownership. One worker owned catalogs
and security classifications; the policy workers agreed on the authenticated deployment interface.

| Lane | Worker source / integrated published commits | Result |
| --- | --- | --- |
| Localization | `bdb99008`, `171a2593`; published `5ad4279a`, `72da3d56`, catalog prerequisites `b775a943`/`fe400678` | Ledger and static errors, current-language error rendering, passphrase/sweep guards, navigation and QR copy; 430 catalog keys (16 neutral drafts, 414 security-English) |
| Deployment/payment evidence | `18142e68`, `911bf6de`; published `789a74c7`, `4bbf0b4e` | Canonical-block code identity and linked contract/fee/asset checks; isolated direct native/ERC-20 payment verification with receipt/event/amount binding and reorg invalidation |
| Withdrawal persistence | `5044c885`; published `ad095af3` | Fresh canonical account/request state before signing/execution, durable scoped attempt hashes/unknown outcomes, cross-tab Web Locks, explicit outcome-review clearing, no optimistic execution timestamps |
| Recovery model | `179fd941` + clarification `c83e0303`; published `15fad220`/`85928025` | Unaccepted destination-priority authority model, finite adversarial exploration and conditional timing argument; no Solidity/runtime recovery implementation |
| Integration fixtures/browser journeys | `49e6367d`, `49416577`, `0b790e00`, `74d65047`; published `0acf7315`, `5971754f`, `1a37c0cf`, `42ae712f` | Pinned/checksummed PP/Railgun preparation; real local integrations; reconciliation and public import retry/reload/locale journeys |
| Independent source/security review | audit `3e535a59`, published `7e8298fa`; read-only implementation review | Source containment, actual unresolved Sonar status, independent focused verification and defect review |
| Coordinator | published `7d78559a`, `14f1c26d`, integration commits above | Live Bitcoin Core regtest, disposable runner, bounded process-group cancellation, overlap resolution, whole-source validation and publication |

The wallet overlap retains both descriptor-based errors and the durable logical action key/storage
options. A later comment conflict kept both extraction hint sets. No runtime change was discarded.

## Acceptance matrix

| Boundary | State | Evidence / remaining limitation |
| --- | --- | --- |
| Deployment identity | Implemented and locally validated | Explicit trusted profiles authenticate router/factory/implementation/announcer and supported asset code hashes, chain, fees and relationships at one canonical block. Getter-compatible arbitrary code, unpinned addresses, drift and stale canonical results fail. Production profile registry remains empty: authorized public deployment evidence is external. |
| Independent payment evidence | Implemented and locally validated for a bounded subset | Direct successful `payNative`/`payERC20`, exact tx/receipt/announcement and owner/policy/account/token/net binding, canonical transfer evidence, finality and deduplication. Permit/buffer/indirect or unsupported asset execution stays unverified. No ordinary paid, receipt or reconciliation status consumes this module. |
| Withdrawal discovery and submission | Implemented and locally validated | Canonical receipt-backed bounded history, exact clone/policy/owner/destination, token/proof/balance/headroom/nonce/deadline checks, reorg reconstruction and durable submission locks. RPC completeness remains a provider trust assumption; capped/contradictory/incomplete observed history refuses. Browser localStorage/Web Locks are required and never silently downgraded. |
| Lost-key recovery | Design-blocked | ADR-0028 models a fixed challenge plus one bounded objection. Post-admission bound is conditional on canonical inclusion/liveness. Destination-priority authority expands compromise and freezing consequences; owner acceptance and a separately reviewed contract revision are still required. Current contracts cannot recover lost keys. |
| Localization | Selected static/ledger/auxiliary scope implemented and validated | Live locale changes preserve signed bytes, identifiers, amounts, stored ciphertext and pending meaning; LTR sensitive inputs; arbitrary errors are not displayed. Dynamic post-broadcast/permit outcomes still need a structured model. Native review remains external; no locale was promoted. |
| PP/Railgun/sponsor fixtures | Locally validated | Exact upstream revisions, package integrity pins and six PP circuit checksums; real Anvil, zero skips in the three selected packages. No generated proving keys/vendor binaries committed and no trusted setup regenerated. |
| Bitcoin regtest | Locally validated | Verified Core 31.1 download, real scan→review→sign→broadcast→rescan→mined amount check; temporary credentials/datadir and descendants cleaned. Docker/public Bitcoin networks not qualified. |
| Browser journeys | Hosted full/lean validated | Corrected full/lean source tested by hosted checks; local Chromium cannot launch because its Unix socket operation is denied. Collection alone is never an E2E pass. |
| Sonar/security parent gate | Externally blocked | #84's D Security Rating persists; the authorized issue inventory endpoint returns CloudFront 403. No causal rule ID can be inferred from twelve annotations. No suppression or gate change. |

The complete scheme-2 product remains experimental, testnet-only and disabled. Scheme-1 invoices are
not reinterpreted. Public configuration QR is not a secret backup; signed receipts prove signed-field
consistency/key control, not identity or independent payment. Seller confirmation remains mandatory for
reconciliation proposals based on eligible verified observations.

## Validation

Toolchain: Node 24.22.1, npm 11.9.0, Vitest 5.0.5, Foundry/Anvil 1.8.5, Solc 0.8.28;
hosted Node22 follows the existing workflow. Bitcoin Core 31.1 tarball SHA-256
`b80d9c3e04da78fb6f0569685673418cf686fadba9042d926d13fb87ff503f9e` matched official
SHA256SUMS; eleven signatures verified against builder keys from guix.sigs
`f432c43b5fbd6b8355daf36127acb7a73d0308b7`. This states the downloaded-key basis,
not independent personal authentication of each signer. See the regtest README.

| Command / scope | Source and result |
| --- | --- |
| `npm ci --ignore-scripts`, `npm run build:libs` | Passed locally on both broad and final application snapshots; existing hosted setup also passed |
| `npm run typecheck`, `npm run lint` | Whole workspace passed locally at `fb8a35e6`; final web checks passed at `f59e004a`; whole-workspace hosted checks passed on `42ae712f` |
| `npm test` / existing hosted shards | Local broad command and final local web command were interrupted by a tool-session reset; neither is claimed green. All existing hosted test shards, including the complete web suite, passed on the `42ae712f` source tree |
| `npm test -w @ghostpay/web` | Hosted: 2,187 coverage-suite passes + 1 separate no-coverage pass; 1 live-Bitcoin skip. This is 2,188 passes, not a claim of zero skipped coverage |
| Full/lean web build and bundle scan | Passed inside exact-tree hosted Playwright jobs; whole-workspace build and deterministic lean candidate also passed |
| Full/lean Playwright | Hosted full: 60 passed, 1 profile-specific skip; lean: 52 passed, 1 profile-specific skip. Each skips the other profile's backup-panel case; lean also excludes full-only embed suites by existing configuration |
| Core `forge build`, `forge fmt --check`, `forge test` | Local unchanged source and final hosted build/static/test jobs passed; 411 tests, 0 failures/skips |
| PP / Railgun / payer sponsor with real fixtures | 77 + 21 + 132 = 230 tests passed, 0 skipped in the three selected packages; these source packages are unchanged by later application-only work |
| `node --test scripts/experimental/policy-recovery/model.test.mjs` | 19 passed, 812 transitions / 120 terminal states and four mutation checks; repeated on `f59e004a` |
| `node --test scripts/integration/prepare-external-fixtures.test.mjs` | 3 passed; repeated on `f59e004a` |
| `node --test scripts/regtest/run-local.test.mjs` | 2 passed; both reproduce failures against the original runner; repeated on `f59e004a` |
| `BITCOIND_BIN=… node scripts/regtest/run-local.mjs` | Real Core 31.1 live web journey passed; repeated on `f59e004a`, mined destination 49,999,802 sats with 198-sat fee |
| `node scripts/i18n/check.mjs` / `extract.mjs` | 4 catalogs, 0 errors, 2,013 warnings; 1,721 used, 0 missing, 82 unused (including dynamic hints); no review registry/check relaxation |
| `npm run ci:scan-secrets`, `npm run ci:check-actions`, `git diff --check` | Passed; repeated on `f59e004a`, with final documentation diff checked before publication |

Workspace tests used Anvil and the compiled core/EntryPoint fixtures, plus `PP_CONTRACTS_OUT`,
`PP_ARTIFACT_DIR` and `RG_CONTRACTS_OUT` from the reproducible fixture preparation.
`REQUIRE_ANVIL=1` was not set globally. It was required for the final web and focused policy checks.
The final application successor changes only web source and documentation relative to the broad
workspace snapshot; the complete web suite finished in hosted CI. Local long-running commands lost
their tool sessions before completion, so completed individual package results are retained without
calling either interrupted aggregate command successful. Hosted checks supply final integrated evidence. Counts from those runs and worker/reviewer
checks overlap and must not be added as unique tests.

### Hosted exact-tree results

At qualification, all three PR-triggered workflows on head
`42ae712f5804724b4213bed4e2e0cb129f855abf` completed successfully:

- [CI 42603538802](https://github.com/djshellshoxxx/GhostPay/actions/runs/42603538802): 24 successful jobs, including all TypeScript shards, web, relayer, contracts, Slither, full/lean browsers and deterministic lean candidate.
- [Hosting kit 42603538894](https://github.com/djshellshoxxx/GhostPay/actions/runs/42603538894): success.
- [Integration 42603538807](https://github.com/djshellshoxxx/GhostPay/actions/runs/42603538807): success.

The full and lean browser-build records both identify the PR head above, Actions merge checkout
`f64f760a59ebb455df958d4f68e49c01f6ab30f1`, and tree
`9a88798c65a619ad9149c0924a495f7d33764364`, equal to the published head and local shipping snapshot.
Browser evidence uses authored fake deployment fixtures and Chromium device emulation; it does not
qualify production addresses, Safari/WebKit or physical devices. Later handoff/index commits are
documentation-only; their newly triggered status belongs in the PR, not retroactively in these results.
Earlier superseded/cancelled CI runs are not used as passing evidence.

### Failures, skips and regression evidence

- An early partial integration ran 119 policy tests successfully and failed 14 old UI fixtures because
  they did not inject a trusted deployment. Updated authenticated fixtures are included in the final
  passing policy/web runs; production verification still refuses unpinned contracts.
- The first Docker-free regtest runner attempt misplaced `connect=0` outside the regtest config section.
  That setup error was corrected and the real journey passed. Independent review then reproduced
  orphaned descendants and a cancellation hang; two regressions fail the original runner and pass the
  bounded process-group cleanup. Temp result files now live under the cleaned datadir.
- A browser-test assertion incorrectly expected the ledger after a memory-only seller-key reload.
  Review corrected it to the real no-keys view, absent chain selector/ledger/import preview; runtime
  state behavior was unchanged.
- Baseline overlays reproduced unpinned deployment acceptance, premature withdrawal Execute after
  an unmined broadcast, three ledger locale/redaction failures and five auxiliary locale failures.
  Worker handoffs record the exact scopes and tests; independent review repeated selected proofs.
- The hosted broad shards retain optional-fixture skips: Privacy Pools 4, Railgun 1,
  external-pools reader 1, payer sponsor 4, pool-relayer 9 and pool-circuits 59; web skips 1 live-Bitcoin test.
  Local selected package runs close the PP/Railgun/sponsor skips (230 passes), the completed local
  external-pools package reports 94 passes, and the separate live-Core journey closes the Bitcoin skip.
  Internal pool witness/ceremony-dependent tests remain unqualified; no setup was regenerated.
- Local Chromium launch was blocked (`socket() failed: Operation not permitted`),
  before page behavior. Hosted execution is recorded separately. No sandbox or gate was weakened.

Independent review passed 280 policy/wallet/error tests on the broad snapshot, 24 standalone
model/fixture/process-cleanup tests, and 96 final-localization tests. It found no unresolved
implementation blocker in that scope after the corrections. These overlap other runs and are not
an independent professional security audit.

## Consolidation and next work

The refreshed [source ledger](SOURCE_FOLLOWUP_2026-11-09.md) retains #60/#61/#64–74 as unchanged
ancestors and #75's sixteen research files as identical content already present. #83 remains separate
historical audit context. #79/#82/#51/#52 remain owner-only automation decisions. Source PRs and branches
remain intact; no automatic merge was enabled.

1. Review #84→#88→#89→#90 in order, including the wider parent's unresolved Sonar gate. Obtain the actual
   PR84 Sonar issue/hotspot inventory with rule/severity/type/new-code/location metadata; reproduce the
   causal issue before choosing a fix.
2. Resolve the recovery authority decision in [ADR-0028](../adr/ADR-0028-policy-recovery-authority-model.md):
   destination-priority recovery has a bounded post-admission window but grants destination compromise
   takeover/freezing power; guardian recovery adds parties/format/setup and collusion analysis; retaining
   owner-only authority preserves the current inability to recover lost keys. Do not deploy the model.
3. Complete supported scheme-2 request identity, accepted versioned deployment-bound records, remaining
   execution variants and full browser create→backup→pay→verify→withdraw→restore qualification before
   enabling the flow. Obtain authorized deployment/asset pins rather than promoting local fixtures.
4. Finish the structured dynamic payment/permit outcome messages without falsely saying nothing was
   sent after a broadcast. Human locale review remains separate from code wiring; the 430 added catalog
   keys do not establish translation quality. See [W5 follow-up](W5_FOLLOWUP_2026-11-09.md).
5. Internal pool end-to-end witnesses/ceremony-dependent fixtures remain a separate evidence gap. Reuse
   approved artifacts; do not generate trusted setup or change verifiers to manufacture a green result.
6. Public deployment/custody, release-signing identity, real device/funded-chain qualification,
   professional audit and launch decisions remain owner/external gates.

Detailed lanes: [policy evidence](POLICY_EVIDENCE_2026-11-09.md),
[withdrawal](POLICY_WITHDRAWAL_2026-11-09.md), [fixture preparation](../operators/external-integration-fixtures.md),
[Sonar follow-up](../audits/SONAR_FOLLOWUP_2026-11-09.md), and [recovery model](../adr/ADR-0028-policy-recovery-authority-model.md).
