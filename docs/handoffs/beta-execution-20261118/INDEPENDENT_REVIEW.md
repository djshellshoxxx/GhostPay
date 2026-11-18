# Independent review and final verification

The parallel reviews below are AI-assisted source/evidence reviews, not an external human security audit. The coordinator owns publication and integration.

## Original batch record — through #233

This section preserves the original review scope, source pins and historical snapshot. Its seven/eight-tree counts and queued-check observations describe that earlier batch, not the continuation snapshot below.

- Privacy review verified all seven local tree identities and checked main versus unmerged behavior, RPC defaults, own-node protocol scope, retry limits, memory history, idle sole-copy protection and privacy actor observations.
- Recovery review verified all seven published tree/parent identities against fetched Git objects and checked the recovery and Sweep command/count/source distinctions.
- Security review independently recomputed the Mythril ZIP/report hashes, all eleven saved finding records, superseded dependency-entry hash, audit scopes, #206 ancestry/check evidence and initial PR accounting.

Accepted corrections before publication:

1. The optional relayer is reachable from core EVM Sweep in lean Pages; it is not a full-profile-only capability. It is unconfigured by default and no infrastructure was deployed.
2. #231 governs preliminary balance-display refresh. Signing/status queries and already-dispatched transport retries keep their existing behavior.
3. Invoice creation evidence is a web-app unit test, not a browser run.
4. Restore/storage milestone language does not credit unexecuted cross-browser or process-crash acceptance.
5. Main's empty default endpoint maps and corrupt/inaccessible privacy-setting fallback are distinct from valid required-proxy blocking and the new cached EVM-client guard.
6. The idle policy deliberately retains an unverified sole EVM key copy in memory.
7. Recovery typecheck/build/final-disclosure pins remain distinct. Local Foundry1.5.1 evidence does not qualify pinned1.8.5.
8. Literal pipes in the picomatch requirement table are escaped.

The updated snapshot contains 40 records:32 pre-existing PRs plus eight repair PRs. There are 35 open PRs excluding this report:27 pre-existing plus eight repairs. All eight repair heads have queued checks. No product source head moved during the PR/CI refresh at 2026-11-18 12:28:52 UTC (04:28:52 America/Los_Angeles). Main remains dfc75ef2087fa6463ae59e0818abec01796c578d.

The reported 32 pre-existing PRs are accounted for as 27 open, two marked merged (#206 direct; #204 automatic through ancestry), and three closed as superseded (#127,#42,#49). Corrected branch census: 239 actual remote branch heads = 164 heads contained in main and 75 not contained, captured before the report branch update. The symbolic origin/HEAD alias is excluded from branch totals. The snapshot includes the previously published report head; its own later documentation update cannot be self-referentially embedded. Non-contained does not by itself mean missing or safe-to-merge work.

No additional tests were run solely for this documentation review. Source repairs, relevant tests, meaningful static-build reproducibility, audit failures and unexecuted checks are recorded in EXECUTION_REPORT.md and the source handoffs.

## Late browser-fixture review

A final refresh identified the original #222 Pages failure. #233 was then authored and independently reviewed. The privacy reviewer ran 3 helper tests at fixture source 6dc3ae7c and found no blocker; coordinator reviewed the exact helper and E2E diff, including receipt rebinding. Author 49 focused tests, typecheck and lint passed; discovery collected 14 tests and executed none. Final cf13b9be adds documentation only. Runtime/privacy defaults, existing security assertions, package files and gates were preserved. Old hosted 11 pass/2 fail/3 unrun is retained as failed evidence, not relabeled as a pass. All eight local-to-remote published tree identities were checked at publication. The final security reviewer independently checked the late delta, including PR arithmetic, source-tree equality and test boundaries; this review caught and removed the symbolic-ref alias from the branch census.

## Continuation review — #234 through #237

The [13:30:27 UTC snapshot](PR_SNAPSHOT.json) records 44 PR records: 32 pre-existing PRs and 12 repair/completion PRs. There are 39 open PRs excluding this report, or 40 including it. **All twelve repairs remain unmerged, and GhostPay is not beta-qualified.** Main remains `dfc75ef2087fa6463ae59e0818abec01796c578d`. Local verification and published-tree equality do not replace required hosted checks or combined-candidate acceptance.

The coordinator verified all twelve final local-to-published tree identities. During this continuation documentation review, the privacy reviewer independently rechecked the following four pairs against the fetched Git objects. Different local and published commit IDs have the same complete tree; the source pins used by each review remain separate below.

| PR | Final local commit | Published head | Common tree |
|---|---|---|---|
| [#234](https://github.com/djshellshoxxx/GhostPay/pull/234) | `83736dbd32d5b6b34c21bbc4b2a6af824ad88088` | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | `c9c773efd95e0799cf2219bd2f8cab9d44c9648d` |
| [#235](https://github.com/djshellshoxxx/GhostPay/pull/235) | `4e04041302d3783dc3b66a5b2a6bfbefd54886b4` | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | `cd44faa8d2110061de95f3bd28a558c54672fd42` |
| [#236](https://github.com/djshellshoxxx/GhostPay/pull/236) | `16e03955b26450ac1c7cfed2e030cde99eb727e6` | `defdaa308a2d05ab407af7e42f8dc457cf52d103` | `dcdc3e7f3df8dcf4f0a5ee57d79a939264e78d02` |
| [#237](https://github.com/djshellshoxxx/GhostPay/pull/237) | `066e3b4774e84db06962424c00cebd696d84120f` | `7109290b7e4f029c36d9743bde9fd664d1da5474` | `4050112cd1cc24e2307b8fd1f97009a8277a8e18` |

#234, #235 and #237 target main. #236 is a repair stacked on the complete #210 dependency candidate, base `4d19655a2e5d93ad9378803cd4163245168aca24`; its root dependency changes must not be transplanted alone onto main's older workspace pins. The full source mapping and remaining integration requirements are recorded in [SOURCE_MAP.md](SOURCE_MAP.md).

### #234 — opt-in pinned-signer API

The privacy reviewer inspected product/test source `079222115f494d966f1f25be31ffca4d66346461` and independently ran 13 signer-policy tests and 15 error-catalog tests, all passing. The guard runs after schema/decryption and signature verification, distinguishes `INVALID_SIGNATURE` from `UNTRUSTED_SIGNER`, checks invalid signatures first, and preserves earlier parsing errors and the unauthenticated `needsPassphrase` result. No blocking source finding was identified. The later local/published commits add documentation without changing that reviewed behavior.

The policy is explicitly opt-in. Existing lean-browser Pay callers pass `pinnedSigners` without `requirePinnedSigner`; they retain the distinction between an invalid signature, a valid unpinned signature and a pinned seller. The shared API restoration does not newly enforce browser pinning. Receipt binding independently re-verifies the invoice signature and binds the loaded seller's signer, recipient and payment facts; those stronger checks remain. The package error catalog additions do not imply new distinct localized browser messages: the existing browser error mapper has its general rejected-invoice fallback.

Author package coverage/type/lint/build and existing Pay/Receipt tests are recorded separately in the source handoff. This independent 28-test selection is overlapping evidence, not an additional browser acceptance run.

### #235 — main-targeted v4 checkpoints

The privacy worker authored this repair; independent main-source review was performed by the recovery reviewer at `7c37de5154ac18e06725ecde6d194185b2e820f2`. The reviewer independently passed 20 privacy/helper tests and three pending-corroboration lifecycle cases, with 87 other scanner cases deliberately unselected in the latter command. HEAD and all six source/test blobs were checked before and after execution. No blocking finding was identified.

The main RED commit `1d8e61776b2e28a4a4d2e082399eefe58148ea7c` reproduced five failures and two controls against unchanged main. Author verification on the repaired source passed the full 110-case scanner/privacy/helper selection, the million-announcement resume test, whole-web TypeScript and scoped lint. The reviewer also verified that main's scanner prefix is byte-identical after removing one helper import, that the reviewed v4 persistence/helper are preserved, and that `Scan.tsx`, `session.ts` and `defaultServices.ts` remain unchanged. No #222 bulk-evidence feature was imported.

Current main still uses public-derived v2 checkpoint names. The unmerged #235 candidate uses a private-viewing-key HKDF v4 namespace, matching loaded seller identity, session-token cache checks and temporary-key wiping. It never reads or migrates v1/v2 or either incompatible v3 format; old progress deliberately requires a rescan and cleanup is best effort. After an absent or different session, the store itself refuses old-identity access. For an identical-key restore during an awaiting scan, cancellation still depends on the existing `Scan.tsx` session subscription and `AbortSignal`; the store adds no transaction or cross-tab lock guarantee. Cursor values remain plaintext and unauthenticated public block data, encrypted-history naming retains its separate public-key linkage, and the idle sole-copy retention policy is unchanged.

The original #222 repair lane is preserved at product source `1dd0fa6152f67010dd38db35d46d102130b583f3` and final handoff `f90499d2925a965b73533da2650c60ca9ea119ed`. Its 120-case author selection and independent security review/20-test rerun belong to that lane. #235 publishes the narrow main extraction only; neither lane claims a Pages/browser pass or acceptance of the rest of #222.

### #236 — viem alignment and coverage-provider placement

The privacy reviewer independently inspected both dependency deltas at `8b98e68effa2da42dd612c7db456b63dbdf990a2`. The first commit, `0597852aeede368b0b8819be0c4cd68c9b1a6081`, aligns the existing 0xbow viem override with #210's workspace version. Of 132 removed duplicate records, 127 have byte-identical retained equivalents; five differ only by the former development-placement flag. The separate coverage commit pins the already-used coverage-v8 5.1.0 at the root, removes 201 exact duplicate records and adds three identical root records. All 30 optional platform records remain unchanged. No new unique package/version/tarball/integrity tuple is introduced; no client cast, major migration, application change or coverage-gate weakening is retained.

Independent installed-resolution checks confirmed that confidential-amounts, Zama and the 0xbow SDK resolve the same root viem 2.57.19. The narrow SDK/glue suite passed 17/17 at that exact source. Those tests overlap the author's complete affected-package suites: 161 passes with four pre-existing artifact-dependent skips, plus five dependency-tooling tests. The author also recorded scoped type/lint checks and a successful full web build with its postbuild scan; this is not a lean Pages or browser execution claim.

The original #210 type error was reproduced after a successful clean original-head install. The separate executed coverage startup RED occurred on `0597852a`; the inherited placement diagnosis is supported by the original lock, while two later original-head reinstall attempts killed with exit 137 produced no baseline coverage-test result. These evidence boundaries remain explicit. Independent final-source audits returned production zero/exit 0 and all dependencies 30 entries—14 high and 16 low—exit 1. The picomatch advisory remains unresolved; the 14 high entries are propagated audit records, not 14 separate advisories.

The documentation-only final commit preserves manifest blob `12156705352eb7ddfaaab7b3190e60feefbb9f92` and lock blob `875e90c613d4bdc1ca53c564944b1a734b3ffd31`. Independent review found no blocking source/lock issue; it does not clear original hosted failures or qualify a combined main candidate.

### #237 — retained beta-log capture

The privacy reviewer inspected workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377`, blob `8b343c410018decc4a46ad142e46bcb58dc7f3a7`, and independently fetched the pinned `actions/upload-artifact` sources at `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. Their input default and glob implementation confirm that files inside the `.state` directory are excluded until the existing upload step sets `include-hidden-files: true`.

The acceptance script writes acceptance/build logs directly under `scripts/beta/.state` and its cleanup preserves them. The unchanged `scripts/beta/.state/*.log` pattern does not match the actual state JSON, manifest backup or private CLI/browser fixture paths. The one-line change preserves retention, permissions, triggers, stage commands, `if: always()`, missing-file handling and acceptance gates. No blocking source finding was identified. The author ran six existing workflow tests and the 111-reference action-pin check; the independent review added no tests.

This fixes eligibility of retained logs for upload. Failures before log creation can still produce no artifact. No hosted upload success is claimed, and the artifact change does not turn the original failed receipt-fixture run into a pass.

## Late hosted-CI interpretation

These are source/log classifications, not fresh analyzer or browser executions. The privacy reviewer checked the saved records and relevant pinned source during this documentation update; the original retrieval/review owners are identified below.

### Synthetic CodeQL fixture and actual RPC URL retention

The security review in [LATE_SECURITY_CI_EVIDENCE.json](LATE_SECURITY_CI_EVIDENCE.json) and the saved [annotation](CODEQL_222_ANNOTATION.json) concern #222 head `2bc2098298d90928eb1acafad969f28316bb05fc`. Findings check `134777382565` remains failed with one high-severity annotation at `apps/web/src/views/Settings.test.tsx:47`, blob `f73eee0286e0b0e490674ab5578240dcf796579c`.

The flagged value is a hardcoded `rpc.example` fixture with a synthetic token. The test deliberately seeds jsdom storage to exercise the existing-URL warning; the default service helper rejects network/RPC operations. Source review therefore classifies this single reported flow as a synthetic-fixture false positive. All three CodeQL analysis jobs succeeded in run `44279435442`, but successful analysis execution does not override its failed findings gate. The test was not renamed, excluded or suppressed, and no alert was automatically dismissed; disposition remains subject to the normal security-review process.

This classification does **not** establish that real provider credentials are protected. At the same source, `settings.ts` blob `549e3e8d9ff1dbc9d5e44002c27a83cf5c87d2f3` persists sanitized primary and secondary RPC URLs in plaintext unless the exact chain/URL is marked session-only. `Settings.tsx` blob `501f42cb998965986458171c2929ddf0c4020936` warns about key-like URLs and offers that unchecked-by-default option. Provider keys embedded in accepted URL paths or queries are distinct from prohibited username/password URL syntax. The warning is heuristic, and existing plaintext retention also predates #222. The fixture triage must not be represented as a correction or acceptance of that production retention policy.

### External AI-review quota failure

For #225 head `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57`, run `44293784707`, job `134765434776`, setup succeeded but the dynamic AI-review request failed with HTTP 402, quota status and a monthly-limit message. The security review identified an external service quota failure; that log establishes no repository source or Mythril-checker defect. The AI review did not complete, and the failed gate remains. No quota/billing change, permission expansion, suppression, bypass or rerun was performed by this work. A successful review after the owner resolves the service constraint is still required; other checks are unaffected by this classification.

### Late Beta-acceptance receipt assertion

The recovery/coordinator review in [LATE_BETA_ACCEPTANCE_REVIEW.json](LATE_BETA_ACCEPTANCE_REVIEW.json) concerns run `44279444368`, job `134715943959`, checked-out merge `644a43ee6366298f418a0aca5a40ecf974871748` from #222 head `2bc20982` and main `5467c158`. It is a different job from the earlier Pages 11-pass/2-fail/3-unrun result.

Here the library stage passed 14 steps and the CLI stage passed 124 checks, including its expected unsupported-chain assertions. The browser stage had two passing tests and one failure. Receipt signature verification succeeded immediately before `devnet-journey.spec.ts` asserted a `stealthAddress` that the minimized default correctly omitted. Payer receipt binding, direct sweep and second-sweep refusal later in that first journey were not reached; the other two passing cases do not establish those missing assertions.

#233's already-reviewed fixture source explicitly opts into address inclusion before signing and retains the original signature/address assertions and subsequent sweep-consent setup. The source change addresses the sole observed failing assertion; no successful hosted rerun is established. This late log provides no new product defect or reason to weaken receipt minimization. The original job remains failed. Its separate missing-log artifact symptom motivated #237, whose source correction does not qualify the browser fixture repair.

## Review boundary at this checkpoint

The final twelve repaired trees are verified publication inputs, all unmerged. Required checks that are queued, failed or otherwise incomplete stay open; no aggregate beta percentage or cross-browser/deployment milestone is increased merely because a local fix or tree identity was verified. No additional tests, product/workflow edits, analyzer reruns, alert changes or remote writes were performed for this documentation update. Only this independent-review record was changed.

## Final inventory and evidence consistency review

The security reviewer independently recomputed all 44 PR records (32 original plus 12 repairs), 39 open excluding this report, two merged and three superseded closures. All twelve published/local final trees, declared parents/base ancestry and 13 pinned handoff paths were checked against fetched Git objects. The census matches 243 actual remote heads, with 164 contained in main and 79 not; the symbolic alias is excluded. Check counts and exact-head pins were recomputed, and main's test-source delta was confirmed to be the ownership claim only. The two stale queued-check descriptions for #205/#221 were corrected to their actual eight successful/twelve skipped snapshot results before publication.

The same review checked dependency source stages, full/prod audit artifacts, complete eleven-record Mythril hashes, synthetic CodeQL versus real credential retention, external AI quota, and the two distinct old-source browser failures. No remaining blocking inconsistency was found in that reviewed package. No product tests or network operations were added for this review. The recovery reviewer authored ACCEPTANCE_COVERAGE.md from existing assertions and evidence, and the privacy reviewer spot-checked its checkpoint/idle/backup boundaries. The privacy reviewer separately supplied the exact-source fifteen-recommendation comparison transcribed by the coordinator into TM1_TM15_STATUS.md; that later transcription is outside the security review's initial clearance scope. These documentation reviews do not replace independent review of a future integrated candidate.
