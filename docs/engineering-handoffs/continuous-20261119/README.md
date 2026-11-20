# Continuous engineering handoff — 2026-11-19

Repository: https://github.com/djshellshoxxx/GhostPay. Canonical review entry: [draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278), branch `release/ghostpay-beta-qualification-20261119`. The coordinator's isolated branch is `integration/ghostpay-continuous-20261119`.

**Additional isolated continuation:** [cycle 20261120T003500Z](cycle-20261120T003500Z/README.md)
qualifies the retained #289/#285 fixes and publishes the independently reviewed
QR runtime-key follow-up as draft #290. Distinct tests from concurrent #291 are
retained without duplicating its runtime. Source head `ec546311` remains subject
to hosted checks and qualification against the owner's updated #278 at `417f7c71`.
The generation-5 lock is released; any shared update requires a new acquisition.
This link and the parallel-cycle ledger entry are an isolated evidence proposal;
historical results below retain their original source and scope.

**Release status: BLOCKED.** Seven demonstrated runtime defects are repaired and independently reviewed. Final combined typecheck, lint, library/full web/Pages builds passed; original full web coverage and hosted qualification remain in progress. This is an engineering checkpoint, not release, deployment, external-audit or whole-repository completion approval.

## Source identity and current state

- Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Selected existing candidate baseline: `c993bb2340942c85dbf10303b61f69a91c4944e0`.
- Frozen combined implementation and reviewed test source: `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`, tree `7a7b189be05b802d3545e8823230076125d7bbf6`.
- Connector reconstruction of that checkpoint: `db6956dbcc635694ffa103a2a70f82da1baacf4c`; identical tree and ordered mapped parents. Publication metadata differs; exact local author and commit provenance are retained as commit trailers and in `PUBLICATION_MAP.json`.
- The shared branch still requires a fresh lease/head assertion before its advance. Read the live PR and current handoff before resuming; a staged Git object is not proof of a branch update.
- Root checkout: `/workspace/scratch/0a7bc3583588/GhostPay`. No unresolved source conflict. Additive ownership-claim conflicts were resolved by preserving both sides.

## Verified unique work and repairs

| Task | Original problem and necessary change | Source / integration | Evidence and review |
| --- | --- | --- | --- |
| PR #280 | Unknown runtime build-profile values could select the wrong profile; explicitly supported full/absent values retain their behavior, otherwise lean is selected | Original `c6d16c25`, local `50b790d5` | Original baseline regression; archaeology blob comparison and independent security review |
| PR #281 | A shorter-than-30-day scan could display privacy counts without their partial qualifier | Original `be74b36e`, local `ae303a91` | Baseline RED and full affected scanSpam selection GREEN |
| PR #282 | Stored merchant signer-pin JSON accepted duplicate member names | Original `4c4b221e`, local `82d7f89c` | Existing strict parser reused; meaningful short duplicate-v baseline failure; independent source review |
| PR #285 | Unknown or inherited QR payload/frame classification was not rejected consistently | Original `613f1d90`, local `b9e7940d` | Original malformed-kind regressions RED/GREEN; fail-closed review |
| PR #289 | Public base64url API accepted non-string runtime values into its decoder path | Original `401b2e77`, local `17467d9a` | 4/1 baseline to5/0 fixed; later test-only unused parameter removal `b2711401` independently reviewed |
| Export expiry | A raw-key download could pass the final UI handoff after the session deadline but before the delayed lock notification | `84f39e41`, integrated `fcb25666`; independent additional tests integrated `bd24d2a3` | Genuine export pipeline3 RED/1 control→4 GREEN; generation 2 independent replay and silent-clear/reentrant/throwing-observer probes |
| Manifest freshness | Same-chain invoice reentry or service replacement temporarily exposed a previous loaded manifest and started a third preflight | `95f28a04`, integrated `415f6c70` |3 RED/1 retained cancellation guard→4 GREEN independently repeated; lifecycle probes and existing Pay tests pass |
| Browser fixtures | Three hosted scenarios had stale/invalid fixtures: short ABI balance words, obsolete refusal text, and scan authority assumed after suspension | `95f28a04` + `45a5dcf7`, integrated `415f6c70` | ABI-correct balance data, authority-boundary assertions and explicit backup reimport/fresh scan; request counts, no-download checks and timeouts preserved; hosted confirmation remains required |
| Lint fixtures | Original JSON array-delete lint errors, then an incoming base64url unused parameter | `a080c2db` + `b2711401` | Sparse-array semantics/assertions preserved with Reflect.deleteProperty; focused lint/tests pass; full workspace lint subsequently passed |
| PR #261 extraction | Cooperative integration-lease CLI/tests were genuinely absent | `05c441b5`, only the two exact source files |10 original real-Git tests pass; independent security review and generation 4 rerun; metadata control branch remains separate |

Focused root upstream evidence is in [GENERATION_1_EVIDENCE.json](GENERATION_1_EVIDENCE.json). It records web baseline50 passed/5 failed, fixed expanded selection73 passed; base64url baseline4 passed/1 failed then5 passed; JSON fixtures24 passed. These selections overlap later suites and must not be summed into an inflated total.

## Discovery, preservation and remaining classification

The complete mechanical census covers **299 branches and 282 pull requests**:177 branch heads already ancestors of main,32 additional ancestors of candidate,89 other related heads, and one unrelated `gh-pages` history. PR snapshot:73 open,67 merged,142 closed without merge. No tags were found. [Archaeology report](archaeology/REPORT.md), [branch summary](archaeology/branch-summary.json), full compressed inventory and [PR inventory](archaeology/pull-request-complete-inventory.json) preserve exact sampled identities.

This is not 299 fresh semantic audits or current CI certification for every historical branch. Null semantic fields explicitly remain UNKNOWN. Prior dated dispositions are evidence to recheck, not blanket approval. The full inventory retains changed/test paths and patch/ancestry evidence.

Already represented: #269/#270/#274/#279 ancestry, #267 hosting fix, and current beta behavior in the prioritized #218/#211/#260 branches. #262 has two best merge bases; a naive triple-dot diff overcounts already retained source. #264 wholesale integration would regress current payment-export method/address binding and monotonic authority. #249's old scanner is superseded by the current AST scanner. #251's direct-fallback expectations are obsolete. #250/#271 are represented with stronger RPC privacy controls.

Preserve source branches and open PRs. No source branch was deleted or PR closed. #209 release/nightly tooling remains a separately scoped optional candidate; do not activate new schedules merely to clear its diff. Non-EVM, policy, relayer, gas sponsorship and paid privacy work remain future/optional. Dependency/action updater branches require their own current compatibility review. No fee, custody, signing identity, deployment, workflow, dependency or release-policy change is part of this cycle.

## Verification checkpoint

| Scope | Observed result and limits |
| --- | --- |
| Toolchain/dependencies | Node22.23.4, npm10.9.11; clean npm ci with ignore-scripts and unchanged lockfile. All65 workspace libraries freshly rebuilt after final product integration, exit0 |
| Invoice schema original coverage |14 files /804 tests passed; statements98.07%, branches97.60%, functions100%, lines99.29%; original thresholds unchanged. Runtime source remained stable; a behavior-preserving unused test parameter was removed while the run was in progress, then its5 cases and lint reran successfully. Do not describe this run as an immutable final whole-tree CI receipt |
| Root final web coverage/nocov | Running/pending on frozen combined product source; no pass inferred |
| Workspace typecheck/lint | Final full workspace typecheck and lint passed, exit0 each. Earlier full lint found the now-corrected unused test parameter; that failure is retained |
| QA focused support |122/122 in 7 files;138/138 in 5 files, overlap 4 new regression cases. Web typecheck/scoped lint pass. Playwright discovery is not browser execution |
| Independent security | Generation2 replay and 62 focused tests passed; original upstream source independently checked. Counts overlap root/worker checks |
| Feature completeness | Generation 3 mapped nine maintained feature families to reachable lean implementation and tests;48/48 focused tests, no additional confirmed core feature gap. Actual end-to-end release acceptance still separate |
| Final integration reviewer | All23 changed non-documentation blobs match their reviewed inputs;15 control scopes unchanged. Pages tooling112/112 and lease10/10 passed; includes native local HTTP tests, not browser scenarios |
| Local Chromium | Startup blocked before assertions by socket() permission denial. No local browser scenario pass claimed; use configured hosted jobs |
| Native contracts | Generation 4 completed64 original disposition tests with exact pinned Forge1.8.5/solc0.8.28 and unchanged10,000 fuzz-run setting. Six further exact-artifact/residual probes passed; [finding-level report](generation-4-contract-review/ASSESSMENT.md) and reproducible harness are integrated |

## Hosted baseline and security status

[HOSTED_BASELINE.json](HOSTED_BASELINE.json) records retrieved jobs and workflow conclusions for PR head `c993bb23`. CI executed synthetic merge `5c1ff468974b20d7160b2cf12776b3b82a69b537`; both commits have tree `dc2e653671506663df8e077153b06787929d37af`. This establishes baseline source equivalence, not final-source qualification.

- [Baseline CI44539518256](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518256): unit groups, full typecheck/build, reproducible lean candidate, contract/static/coverage and secrets jobs passed. Lint failed on the two corrected array deletes. Lean browser112 passed/4 failed/5 skipped; full125 passed/4 failed/2 skipped. The four failing scenarios are the QA repair targets.
- [Pages44539518286](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518286), [beta acceptance44539518215](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518215), [CLI44539518311](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518311), [hosting44539518228](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518228) and [integration44539518360](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518360) passed. Pages publication/release-only gates were skipped; this was not deployment.
- [Contract analysis44539518235](https://github.com/djshellshoxxx/GhostPay/actions/runs/44539518235): configured Echidna passed. Fresh strict Mythril completed all 5 instrumented targets but failed with **10 findings:3 Medium and 7 Low**. The artifact's241 source hashes match unchanged candidate contracts. This supersedes the older11-record checkpoint for this source; it does not clear the findings.
- Generation 4 mapped all exact traces, guards, rejection controls and residual design limits. All seven factory constructor tuples reject implementation address0x1; all three expiry payloads reject. A failing immutable fee-token view can prevent deployment at a prefunded counterfactual address, and intentional fee-waiver/timestamp dependencies remain policy constraints. Internal reproduction cannot substitute for the required external review. No strict analyzer configuration, failure gate, fee model or contract was changed.

## Worker generations and durable evidence

Generation1 archaeology, QA/bug and security repairs are complete and integrated. Generation2 independently verified the security fix. Generation 3 independently reviewed QA and feature completeness. Generation 4 final source/tooling review and contract finding-level assessment are complete and integrated. Root owns combined qualification, source-preserving publication and final ledger updates. Agent completion does not imply a continuously running background agent.

- [Security generation1](../generation1-security/README.md) and source-pinned Mythril artifact/receipts.
- [Generation2 review](generation-2-review/) for independent expiry probes and upstream verification.
- [QA implementation](qa-gen1/README.md), [generation3 independent QA](generation-3-qa-review/README.md) and [generation3 completeness](generation-3-completeness/ASSESSMENT.md).
- `TASK_LEDGER.json` records ownership, review, integration and unfinished scope. `PUBLICATION_MAP.json` records metadata-preserving tree/parent reconstruction.

## Remaining beta blockers and next authorized work

1. Advance the existing draft PR through the fresh integration lease after rechecking live head; do not create a redundant broad PR. Obtain final exact-source hosted results, inspect the four repaired browser scenarios and repair any new demonstrated failures.
2. Finish original local coverage/nocov/type/lint/static builds, retaining all failures/skips and source identities. Record the final source tested by Actions separately from its associated PR head.
3. Complete finding-level security disposition and required external review. The strict Mythril gate remains failed until the repository's actual clearance requirements are satisfied; do not suppress or broadly waive findings.
4. Owner-controlled deployment decisions remain: ADR decision, dedicated origin and verified DNS/HTTPS, Pages environment/exact approval, authorized testnet contracts and manifest signing identity, real wallet/testnet payment/recovery/sweep acceptance, then approved release assets/tag. No real-fund transaction is authorized by these QA steps.
5. Revisit UNKNOWN historical candidates only when their behavior is potentially relevant and missing; prove uniqueness before any extraction. Preserve future scopes. No engineering fixed point is claimed.

## Exact continuation commands

Refresh live refs first; do not overwrite another worker's worktree. Use the pinned Node/npm versions and unchanged lockfile. In a clean checkout of the actual published candidate:

```sh
git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/pr/*' --tags
git switch --detach origin/release/ghostpay-beta-qualification-20261119
git rev-parse HEAD 'HEAD^{tree}'
node scripts/automation/integration-lock.mjs status
npm ci --ignore-scripts --no-audit --no-fund
npm run build:libs
npm run typecheck
npm run lint
npm run test --workspace @ghostpay/invoice-schema -- --maxWorkers=1
(cd apps/web && node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1)
(cd apps/web && node ../../node_modules/vitest/vitest.mjs run --config vitest.nocov.config.ts --maxWorkers=1)
node --test scripts/pages/*.test.mjs scripts/tests/integration-lock.test.mjs
npm run build --workspace @ghostpay/web
npm run ci:scan-secrets
npm run ci:check-actions
```

Use the original hosted full/lean Playwright, beta acceptance, Pages artifact and contract workflows for their configured environments. For a local payments-disabled static check, `bash scripts/pages/build-pages.sh /absolute/new/output/path` creates an artifact without publishing. It must not be described as authenticated testnet acceptance. Exact successful commands/logs are retained in the accompanying receipts.

Before ending a future cycle, update this index, central ledger, exact sources, CI links, worker ownership and immediately executable next steps. Update the existing two-hour continuation automation's checkpoint only after remote publication is verified; preserve its cadence and all prior scope limits.
