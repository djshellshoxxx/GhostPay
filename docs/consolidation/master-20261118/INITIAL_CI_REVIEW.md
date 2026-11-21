# Independent CI and focused-source review — 2026-11-18

## Source identity and limits

This review inspected main at `dfc75ef2087fa6463ae59e0818abec01796c578d`, integration PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec`, and focused PRs #241, #237, #234, #227 and #235. During the review the coordinator merged #241, advancing main to `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`. The prior isolated checks are not represented as checks of any later combined candidate.

AGENTS.md, CLAUDE.md, docs/ai/WORKFLOW.md, docs/ai/HANDOFF.md, the package map, security-invariant references, completion gates and the actual workflows were read. This is an AI-assisted source and hosted-CI evidence review; it is not an external audit. No remote mutation or workflow dispatch was performed by this reviewer. No local full test matrix was run.

## Merge and publication policy

The readable main branch endpoint reports `protected:false`, required-status enforcement off and no required contexts. The rulesets collection is empty. The administration protection endpoint returns 403 to the connector, so its contents are not independently inspectable. An unprotected branch does not justify merging a failed candidate or weakening checks.

The actual workflows do not deploy or publish on ordinary main merges:

- `.github/workflows/pages.yml` triggers PR validation or manual dispatch. Publication requires all of `workflow_dispatch`, `refs/heads/main`, and `inputs.deploy=true`. Deploy depends on acceptance and release gates; PR #238 also adds an attestation dependency.
- `.github/workflows/release.yml` triggers `v*` tag pushes and creates a draft release behind the release environment; it does not trigger on main pushes.
- `.github/workflows/ci.yml` runs full CI on main pushes.
- Hosting-kit jobs explicitly use a read-only token and do not deploy.
- Existing API-funded automation schedules are separate; this task neither changes nor dispatches them.

Strict Mythril and Echidna are path-selected PR checks for contract/analysis-related changes, nightly jobs and required tagged-release checks. The focused noncontract PRs do not match those unchanged path selectors. Their absent Mythril check is not a pass, and does not close the existing release blocker. A full consolidation candidate touching those inputs must run them.

Sources: [Pages workflow](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/.github/workflows/pages.yml), [analysis workflow](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/.github/workflows/contract-analysis.yml), [release workflow](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/.github/workflows/release.yml), [release documentation](https://github.com/djshellshoxxx/GhostPay/blob/dfc75ef2087fa6463ae59e0818abec01796c578d/docs/operators/release-and-verify.md).

## Focused qualified-source candidates

| PR | Source head | Check conclusions | CI run | Review outcome |
|---|---|---|---|---|
| #241 | e8857bfa1ec93fafa9ff83f63f7430ef26a362c2 | 37 success, 3 intentional skips | 44424428438 | CI/source identity clear; product review delegated to another reviewer; subsequently merged by coordinator |
| #237 | 7109290b7e4f029c36d9743bde9fd664d1da5474 | 29 success | 44314160745 | No blocker in narrow retained-log workflow delta |
| #234 | 5e9e7be70399a9818579cf87bd494e013e25d4f9 | 36 success, 3 intentional skips | 44308556561 | No blocker in opt-in pinned-signer validation delta |
| #227 | 613667be4eeb132c7d21ccd06c627f9a7144d85b | 33 success, 3 intentional skips | 44294628411 | No blocker in dual-clock idle-lock delta |
| #235 | a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1 | 36 success, 3 intentional skips | 44310334152 | No blocker in v4 private checkpoint-slot delta |

Every focused head also had a successful Snyk status, no pending or failed check, and zero submitted GitHub reviews. All were drafts when inspected. Documented independent AI reviews are not misrepresented as formal GitHub approval. The readable repository policy contains no required review rule.

The three intentional skips are Pages deployment, post-deployment smoke and the manual-publication-only duplicate release gate. They must remain skipped for this task.

The GitHub synthetic merge commit for each focused PR has parents [baseline main, reviewed PR head] and the exact same tree as its head:

| PR | Tested merge | Tree |
|---|---|---|
| #241 | 70daf0854dfe19d78de1b5d99c4e7b92c87f6884 | 837fa8d51c3bf632cb5b56cba654e1a420213651 |
| #237 | fa6ac0393a7edfa167fcbabd43ee81ca1ab001e2 | 4050112cd1cc24e2307b8fd1f97009a8277a8e18 |
| #234 | 04764f52025103559ac07f8c92c73e1425a900a0 | c9c773efd95e0799cf2219bd2f8cab9d44c9648d |
| #227 | 192682fc8e72dad89ca85006cd9580d0f39ea3dd | 35560821a127947b8e5915d4596d11995375c671 |
| #235 | 49b24b60ee303a10f390035ceb2bf5bd4647248b | cd44faa8d2110061de95f3bd28a558c54672fd42 |

The #241 build log explicitly checks out 70daf085; #237 acceptance explicitly checks out fa6ac039. Tree identities were independently matched with local Git.

### Source-review reasoning

**#237:** The only workflow behavior change adds `include-hidden-files:true` beneath the existing `scripts/beta/.state/*.log` artifact glob. It does not widen the path to all state, JSON, backups or other hidden files; privileges, retention, warnings and acceptance commands remain unchanged. The runner uses local devnet fixtures and no production signing or provider secrets. Unlike the older PR body, current hosted evidence now proves successful upload: [acceptance job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44314161092/job/134835772525), artifact 14436054417, 5430 bytes, SHA-256 `8079e29052fb13ff5f87554adf45a0976fc31c480dcdd6f35fc4111ce470c1b7`.

**#227:** Both clocks are checked before activity can reset the deadline. Lifecycle checks preserve the existing one-idle-period lock guard, session-version check around asynchronous recoverability, and protection against destroying the only recoverable key copy. New regressions cover wall rollback, monotonic expiry, sleep with paused monotonic clock, lifecycle events and first input. The code does not claim actual OS/Tor sleep qualification.

**#234:** The shared finish path verifies signatures, then enforces required pin membership. Plaintext, encrypted and decrypted passphrase envelopes all use that path. Default review behavior is unchanged; a passphrase prompt remains explicitly unauthenticated. Errors have fixed messages and exported types; invalid signatures remain distinct from valid but unpinned signers. No browser caller silently opts into new policy and no crypto primitive or invoice format changes.

**#235:** HKDF-SHA256 binds v4 slot names to a private viewing key, chain and seller key ID. The default lender verifies the loaded seller identity, lends a copy and wipes it in finally. Cached names check the public session-snapshot identity on every use; silent wipe and same-key reinstall invalidate the cache. Legacy v1/v2 and incompatible v3 formats are never read; best-effort purge cannot migrate an attacker-selected public cursor. Runtime edits remain in checkpoint persistence and the new helper. Cursor values remain plaintext/unauthenticated and this does not add transactional or cross-tab isolation.

A single combined batch of #237/#227/#234/#235 has disjoint runtime paths (shared ACTIVE_WORK documentation requires a normal recorded resolution). Requalify that combined tree against the current main, including full hosted matrix selected by its changed paths, before promotion. Do not simply reuse isolated green labels after main changes.

## Blocked integration PR #238

The head had **46 checks: 32 successful, 8 failed, 6 skipped**. It is not mergeable under the task's qualification standard despite GitHub reporting no branch protection.

| Failing check | Observed failure and precise next action |
|---|---|
| TypeScript aggregate | Dependent aggregate failure; repair its failed children rather than weakening aggregation |
| ts-lint | `packages/chain-adapters/src/payments.bulkCancellation.test.ts:21`: async getLogs has no await; preserve cancellation regression and return the intended Promise without redundant async |
| ts-test (web) | `paymentKeyExport.test.ts:114` waits for captured key during sealing but times out; an unhandled session-changed rejection appears from session.ts:357. Investigate test/session scheduling and cancellation, retain wipe assertions |
| ts-test (rest-0) | Generated PACKAGE_MAP stale; web closure unexpectedly includes hygiene and metadata-hardening, relayer includes metadata-hardening. Reconcile architecture/ownership instead of broadening allowlists without evidence |
| e2e full and lean | Same hostile-text case, `e2e/app.spec.ts:115`, fails at `helpers.ts:56` navigating to about:blank with ERR_ABORTED. Determine navigation-race cause; retain inert-text assertion |
| CodeQL | Two high alerts: cleartext sensitive storage in Settings.test.tsx:47 fixture, polynomial trailing-slash regex on uncontrolled input in pir-two-server/src/client.ts:79. Preserve scanner and semantic tests while resolving |
| Mythril | Strict unchanged runner exits 1 because of 11 findings (3 medium, 8 low); all five analyzer JSON results have success=true and error=null. Exact report retrieved and verified; retain findings and qualification block |

CI: [44342340615](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615). CodeQL: [check 135014939758](https://github.com/djshellshoxxx/GhostPay/runs/135014939758). Analysis: [44342340082](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082).

The full failed-job logs are saved beside this report as `pr238-{lint,web,rest0,e2e_full,e2e_lean,mythril}.log`. Public check annotations are in `pr238-codeql-annotations.json`. Connector annotation URLs were unsupported; the normal public API GET succeeded.

Mythril artifact: ID 14462654594; name `contract-analysis-mythril-198aa5baff22272453733a0f3dcfcac0e0994eec`; ZIP 17033 bytes; SHA-256 `5db3cf9ffd6feaf74b1e7c50ca96f97591d0731a9ba975614ffcaa7b7474dff3`. Echidna artifact ID 14453268404 corresponds to the successful same-head campaign. Detailed machine evidence is in ci-evidence.json.

The Mythril ZIP was downloaded through the artifact API on November 19 and its SHA-256 matched the uploaded digest. Metadata pins both requested and checkout commit to `198aa5baff22272453733a0f3dcfcac0e0994eec`; the 283,168-byte report was retained without truncation and has SHA-256 `ce72f158a9d7d3bff3f6a2dafa2fde390cafcb5cf79364d4980f0c7cb3a6de00`. Raw report and compact findings are saved as `pr238-mythril-report.log` and `pr238-mythril-findings.json`.

| Source | Exact analyzer findings |
|---|---|
| GhostPaySweepRelayer.sol:83 | One low SWC-116 report on the timestamp deadline |
| PolicyAccount.sol:161,262 | Two low SWC-116 reports on timestamp deadlines |
| PolicyAccountFactory campaign | Eight reports: medium SWC-107 at Factory:117 initialization and Clones.sol:104 CREATE2; medium SWC-104 at SafeERC20.sol:227; low compiler-generated assertion, ReentrancyGuard.sol:99 state access, Factory:131/132 multiple calls, and SafeERC20.sol:227 user-supplied target |

These are analyzer reports, not a confirmed exploit classification. The report is a completed analysis with findings, rather than evidence of an installation failure or timeout. No finding was dismissed and no scanner rule was altered; contract-focused triage and unchanged strict release qualification remain necessary.

## Baseline findings retained

Baseline main had 59 check records: 56 success, one skip and two failures. One was the existing strict nightly Mythril failure in run 44297673763. The other was the separate API-funded automation's develop job, failing specifically at Run API-funded Codex; it is not evidence of a product test failure and was not retried. Release qualification remains blocked; source consolidation is not a release.

## November 19 observation after the initial snapshot

The initial tables above are historical source-head receipts. A fresh independent API read confirmed main advanced to `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, with parents `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` and #237 `7109290b7e4f029c36d9743bde9fd664d1da5474`. Thus #241 is retained and #237 merged at 06:12:13 UTC. The coordinator reports #237 was merged by a concurrent writer; this reviewer performed no remote mutation. Main's public protection fields still show protected=false and enforcement off.

Focused PR #242 is draft and mergeable at head `ab4e0da2cfe2a18adac0424896fba0b40fac81a8` against that main. [CI run 44471454978](https://github.com/djshellshoxxx/GhostPay/actions/runs/44471454978) is in progress; current source-head checks must complete before a merge decision. `ci-addendum-20261119.json` saves that observation. No prior green source receipt is asserted to qualify this combined head.
