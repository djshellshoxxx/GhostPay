# GhostPay feature completion and consolidation — results

## Current outcome

The implementation is consolidated and published in [PR #262](https://github.com/djshellshoxxx/GhostPay/pull/262).
It remains a qualification candidate. The two qualified historical-document PRs #216 and #208 were merged normally
into main by this task. A concurrent coordinator subsequently merged runtime PR #257, bringing its pool-input,
AST-scanner and SOCKS safeguards to main. The broader integration remains in PR #262; no release or mainnet
qualification is inferred from these merges.

| Reference | Exact value |
|---|---|
| Starting main | `ffd982a7aea2856c186b40ef236a39720a1b81f5` |
| Main after #216 | `a36f48da526b818a5940a7a0ed2ae7303ef17056` |
| Main after #208 | `14ded337a10c140d7a9f9a9238ec038587d925bb` |
| Main tree after #208 | `11cf80f37b1c5840d8bed3aad0b3b78cf60382db` |
| Observed main after concurrent #257 merge | `8f56376427c96881f49590920ff0bf8543ec81b4` |
| Observed main tree after #257 | `21ae3aa7b070aa8921d4360debb15add03d5c194` |
| Runtime implementation checkpoint | `e76451ad56ba1634eed9d03468961900433fd130` |
| Published runtime checkpoint | `66d0e38f432ed9fd7b750d046d8b8ce9a2cef178` |
| Shared runtime checkpoint tree | `63484889edf158f322a2d14474de2e58512beb1f` |
| Local test reconciliation checkpoint | `74e3111f994481e7c9201ddb0494cf4a8405eadd` |
| Published test reconciliation checkpoint | `320ace50e1b6ad51a1fb34dea72168d4c2282e9e` |
| Shared test reconciliation tree | `2720f19049e5c0c4e8a717cba708709267f7729e` |
| Combined hosting/camera source checkpoint | `e74ddd26b75912d770e05d51f0b9229756adc649` |
| Published combined source checkpoint | `c40b7581b9b996f33612186bc91960c65273cb64` |
| Shared combined source tree | `41a1aaca7c9b48bdda4d9cbad7dcda7084045e5f` |
| Canonical-array source checkpoint | `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33` |
| Published canonical-array checkpoint | `cb7cfc9ec4f6c051e99805a25132c9458beb7af0` |
| Shared canonical-array tree | `c58843c86dae5164eab259d3440aba01406bd593` |
| Final merchant-clock source checkpoint | `9b8e502498388405d5f03da170e7c51574bc06a6` |
| Published final source checkpoint | `155d009160a6e5b2c24a91705c72fc8cca6ce815` |
| Shared final source tree | `e585d1dec43844bd18167f213c246994ea6c4397` |
| Local ancestry-only reconciliation with updated main | `3ce8cad3b0f793733a98b73007d2afdea97b9aa6` |
| Published ancestry-only reconciliation | `c7e09bc7cdb52e9172fa80fc2db83251fad6cd1a` |
| Focused hosting PR | [#267](https://github.com/djshellshoxxx/GhostPay/pull/267) |
| Focused hosting published checkpoint | `c3a693e87053fbe91219f8edfe159a5ec0a37a34` |
| Focused hosting shared tree | `7cfbb2835be8a3c58ccd5dd549fbb2ecabcccfac` |
| Candidate branch | `codex/ghostpay-feature-consolidation-20261119` |

The published branch was fetched back. Its tree exactly matched the local checkpoint, and current main was an
ancestor. Git Data publication retained the ordered source parents and exact trees; metadata changes account for
different local/published commit IDs. `publication-map.json` records the ordered local/published source mappings.
Later reporting commits do not themselves constitute a new runtime test execution.

The canonical checkpoint pair `cb7cfc9e` / `3ab1c3f7` retains main `14ded337`, original camera PR #258 head
`84398a79e18673f3e371a405931bc464e1cca99a`, and original canonical-array PR #265 head
`c591b54078febcf24cba01b29bc173b2fac1f9cb` as ancestors. The final pair `155d0091` / `9b8e5024` also retains
original merchant-clock PR #268 head `ddfc8cfafa44b09103ced821f160c1d37fdfe552`. Independent read-only Git checks
verified all four ancestors in both final commits and their identical tree. [QUALIFICATION.json](QUALIFICATION.json)
is the authoritative command-outcome record; the fresh final consumer/build passes below are distinct executions,
not transfers of earlier source-identical focused passes.

After the concurrent #257 promotion, a normal local merge retained parents `9b8e5024` and updated main `8f563764`
as `3ce8cad3`. Independent Git comparison confirms **zero changed paths and the exact same entire tree `e585d1de`**.
This changes ancestry only. Every executed final check remains pinned to `9b8e5024` / `155d0091`; no new test
execution is claimed for the reconciliation commit. Published reconciliation `c7e09bc7` was fetched back with
the same tree and updated main ancestry verified; [main-257-promotion-review.json](main-257-promotion-review.json)
records the exact main merge, checks and concurrent attribution.

## Feature state after implementation

The ranked **before** matrix is in `FEATURE_MATRIX.md`; the table below records the resulting source state. Source
completion, focused test execution, whole-candidate qualification, and promotion to main are distinct states.

| Feature | Completed source and residual defect repair | Evidence and remaining acceptance |
|---|---|---|
| Network isolation and profiles / TM1–TM15 | Reused the master integration of #251/#249/#222. Production authorization now uses the same strict profile parser as Settings and RPC creation. Cross-tab updates preserve an unsaved Settings draft and its original revision, then reject a stale save. | Five truncated-profile baseline failures plus one control; a separate stale-draft failure reproduced. Privacy worker recorded 323 focused passes across the related suites. Whole-head browser/security qualification remains open. Settings uses an optimistic revision comparison, not an atomic cross-tab localStorage transaction. |
| Recovery, exports, and idle authority / Spec 18 | Reused #239 atomic replacement, selected #240 exact-byte verification, and #256 idle protections already present in master. Recovered payment/master capabilities now preserve their original session revision, check synchronous expiry at secret loans/install, and dispose stale asynchronous decrypt results. | Five baseline failures plus one passing control; 39 related Node 24 tests, six new Node 22 expiry cases, and permission-enforced independent recovery on both runtimes passed. Fresh empty-session recovery remains usable. |
| Private EVM scan / specs 05 and 10 | Reused authenticated encrypted journal, scope binding, CAS, and resume behavior from #248. Added the final app-lock pause/performance tail and included the network profile in synchronous checkpoint consistency checks. | The delayed journal write failed its new baseline regression when a profile changed before its storage event. All 20 private-checkpoint UI cases passed after repair. The synthetic performance fixture passed without a wall-clock acceptance threshold. |
| Bitcoin scan and spentness / specs 11 and 12 | Merged #254 with original ancestry while preserving selected network capabilities, bounded transport, cancellation, and HTTP classifications. Kept explicit provider checking and no automatic signing-time outpoint query. Retained distinct #244 header-ownership cases. A shorter reloaded header prefix now invalidates local negative-spend evidence; both UI guards require the exact checked tip. | Shorter-header baseline reproduced `local` where `unknown` was required. BTC build/typecheck and 69 changed-library tests passed. Corrected UI/cancellation/header files passed 93 tests; disclosure/Esplora/local-spend files passed 46. These selections overlap the initial run and must not be summed into a full-suite total. Browser/regtest/whole-head qualification remains open. |
| AST scanner, pool inputs, SOCKS transport | Reused #257 while preserving master own-origin, all-HTML and CSP guards. Reconciled the final #249 configured-origin scanner tail. | Current artifact/build-script selection passed 84 tests; pool helpers passed 19; SOCKS harness passed 28. The scanner migration exposed a manifest test's removed helper import; local TypeScript comment removal preserves every original trust assertion, and all 14 manifest tests pass. |
| Pages release hash | Fixed a real #251 hosted-browser failure: Home passed a relative module attribute to an absolute-endpoint authority. Home now resolves the entry once against `document.baseURI` and binds the same absolute URL to both authorization and hashing. | Three baseline failures plus a foreign-origin refusal control; 30 focused Home/release tests passed. Independent review verified unchanged strict authority and release helper blobs. Fresh hosted browser replay remains required. |
| Integration and dependency boundaries | Recovered selected #246 repairs, preserved reviewed-versus-pending dependency status, fixed the duplicate list introduced by the master merge, retained the exact final #256 test-typing tail, and updated the BTC network inventory to actual consent and light-mode behavior. | Package map is current; 12 package-tooling checks and 10 inventory/reachability checks passed. Earlier `74e3111f` typecheck and fresh final `9b8e5024` typecheck both passed in distinct runs with their own input evidence. Earlier exit-137 attempts remain separately recorded. |
| Integration regression fixtures | Reconciled the Settings export disclosure with its stronger existing warning; restored the existing `scan-aborted` assertion patch; supplied complete TRON fixture block ranges; retained archive field-wiping assertions and added actual backup-only idle suspension checks. | All four test-only repairs received independent review. Their author runs passed 11 Settings, 5 cancellation, 69 TRON/shared-outcome, and 1 focused archive case. They address 31 of 33 failures in the complete diagnostic run; no whole-suite pass is inferred from this mapping. |
| Hidden-page QR imports | Retained original PR #258 ancestry and its exact runtime/test blobs. Hidden-page transitions now revoke pending pasted/image imports; dispatch and delivery check current visibility, including before the event arrives and after synchronous caller invalidation. | Fresh original-config baseline **9/9 failed**; all six importer files then passed **77/77**, with no skips. Independent review verified controller identity, draft/retry/multipart preservation and exact source. Full browser and combined-source qualification remain separate. |
| Static-hosting HTTP validator parity | Reproduced the one-second timestamp mismatch in #260. Export now carries raw `mtimeMs` into numeric-string `utimes` arguments, retaining submillisecond precision, epoch zero and pre-epoch values. Existing no-follow, exclusive creation, cleanup, atomic rename and atime behavior remain. | Focused **9 passed / 2 failed → 11 passed**; full kit **285 passed / 0 failed / 14 skipped**; original kit typecheck/lint passed. Four native nginx cases were skipped locally. Independently reviewed source also exists in focused PR #267 against main, without the broad feature ancestry. |
| Canonical invoice JSON arrays / #265 | Retained original PR ancestry and executable guard. Sparse arrays and arrays with extra enumerable, nonenumerable or symbol own keys now reject; an added count-balanced hole-plus-extra-key regression exercises ordered index validation. Empty, nested and frozen dense arrays retain their bytes. | Author original-config selection passed **4 files / 200 tests**, with package typecheck, typed lint and production build **exit 0**; upstream regression reproduced **10 passed / 1 failed**. Independent review and final blob/ancestry checks passed. Scope is inert arrays: proxies, accessors, custom inherited methods, cycles and unbounded input size remain outside this repair. Full package coverage was not run. |
| Merchant-profile verification clocks / #268 | Retained original PR ancestry and exact runtime/test blobs. Nonfinite, negative and runtime nonnumber `nowSec` inputs return the existing `format` result before parsing or signature work; finite nonnegative/fractional values and the `exp <= nowSec` boundary retain prior behavior. | Author original-config baseline **7 passed / 1 failed**, then **5 files / 208 passed**, package typecheck/lint/build **exit 0**. The 208 includes the earlier canonical 200 selection and must not be added to it. Independent review found no introduced source blocker. This validates clock values, not their accuracy or trust; no remote clock control, production exploit or signing bypass was established. Full package coverage remains unrun. |
| Contract/tooling evidence / #255 | Independently reviewed tooling and downloaded exact artifact **14509646188** from run **44476066945**, head `ea47fa75`. All **241** recorded source hashes and report/configuration/target evidence hashes match. The candidate retains identical **10 project Solidity files, 226 vendored Solidity files and Foundry configuration**; #255's separate workflow/tooling branch was not imported. | **11 findings remain open at the strict gate: 8 Low, 3 Medium; runner exit 1.** Prior authored/independently reviewed disposition notes exist but activate no exception. Artifact review does not qualify candidate tooling or dismiss findings. Full details and source bindings are in [security-artifact-review/REVIEW.md](security-artifact-review/REVIEW.md). |

The #250 tail was checked against its live head `22af2074a086d9957a18e310ef8572b28d1facd0`: its retry safeguard is
already present. Five touched files are byte-identical; the two RPC files differ only because this candidate retains
additional credential/referrer/cache protections and their test. Replacing them wholesale would lose existing behavior.
For #256, runtime/checkpoint behavior and all four idle messages were retained; the only missing final tail was the
eight-line test-typing repair, now integrated without removing the additional raw/payment export regression.

## Executed qualification

These are recorded command outcomes and explicitly pending final checks, with scopes and overlaps retained. A
previous source's focused pass is not a claim that every package or the final hosted matrix passed. Raw outputs are
under this directory's `evidence/` and the source-pinned worker receipts linked below.

| Check | Result and scope |
|---|---|
| Web TypeScript at the test checkpoint | **Passed** at local test checkpoint `74e3111f`; Node 22.23.4, 1536 MiB heap, original project configuration and reconciled compiled inputs: `evidence/final-serial-web-typecheck.txt`. The earlier runtime-checkpoint pass, subsequent concurrent exit 137, heap exhaustion and resolved source/declaration diagnostics retain their actual outcomes. This historical pass is separate from final-source execution. |
| Final web TypeScript | **Passed** at `9b8e5024`, direct **Node 22.23.4**, original `tsconfig.json --noEmit`, 1536 MiB heap, **109.097 s** wrapper time. Receipt and log: `evidence/final-source-checks-9b8e5024/web-typecheck.{json,txt}`; post-source validation succeeded. |
| Final full production web build | **Passed** at `9b8e5024`: matching successful TypeScript prerequisite, Vite production bundling, original CSP application and original AST/artifact scan all exited **0**. Manifest covers **19 files**. Evidence: `evidence/final-source-checks-9b8e5024/`. The default broad-connect policy and build warnings remain visible; this is not production endpoint-policy approval. Earlier `e76451ad` build evidence is preserved separately. |
| Final lean production web build | **Passed** at `9b8e5024`: Vite, original CSP application and artifact scan all exited **0**, with **17 files** in the manifest. `checkLeanReport` found **zero problems in six chunks and one worker**. Same final-source evidence directory; exact artifact hashes and module report are retained. Earlier `e76451ad` build evidence is preserved separately. |
| Original-config scanner/build scripts | **84 passed**; this includes the 21-case build-script selection that previously lacked a compiled `scan-source` prerequisite. |
| PIR | **62 passed**, original coverage thresholds satisfied: statements 99.15%, branches 93.33%, functions 98.76%, lines 99.74%. |
| Initial privacy/CSP/native artifact selection | **82 passed** on the earlier combined source; later configured-origin behavior is covered by the worker's 79-case selection and independent 49-case replay. |
| Cancellation fixture | **6 passed**, scoped typed ESLint passed. |
| Pool and SOCKS focused suites | **19** pool-helper tests and **28** SOCKS-harness tests passed on the combined source. This is not a circuit-witness/native-contract qualification claim. |
| Package tooling | **12 passed**; generated package map current. |
| Final inventory and reachability | **10 passed** with unchanged exact-closure and disjointness assertions; BTC semantics independently reviewed and corrected. |
| Recovery | **39** related Node 24 tests; **6** focused Node 22 expiry tests; independent offline recovery passed on both runtimes. Independent privacy-worker replay added **6/6** with unchanged source hashes. |
| Privacy implementation | **323** focused passes across authority, service, Settings, checkpoint, performance, CSP and scanner selections; exact breakdown and source-alias limits are in its receipt. |
| BTC implementation | **69**, **93**, and **46** passing selections as described above. Initial complete selection was 266 passed / 4 failed / 1 optional live-bitcoind skip; every failed file was repaired and rerun. No aggregate final full-BTC pass is invented. |
| Home repair | **30 passed** in the implementer's focused run, following 3 failures / 1 control; independent exact-source review completed. |
| Manifest trust test | **14 passed** using the original configuration after reproducing 13 passed / 1 failed. All original assertions remain. |
| Production dependency audit | **Zero reported vulnerabilities**; `npm audit --omit=dev --json` exited 0 against the unchanged candidate lockfile. |
| Full dependency audit | **17 low-severity affected package entries**, zero moderate/high/critical, originating in the `cookie` and `elliptic` advisories within the development-tooling graph. The suggested top-level remediation is a major Hardhat/plugin migration; `@fhevm/hardhat-plugin` reports no available fix. Recorded separately in `audit-all.json`; no dependency exception or unqualified major upgrade was introduced. |
| Repository secret check | **Passed at final `9b8e5024`**, exit 0; the existing repository check reported no committed env files or matching key material. Evidence: `evidence/final-source-secret-scan.txt`. |
| Action pin check | **Passed at final `9b8e5024`**, exit 0; **113 action `uses` entries** checked with original pin/version-comment rules. Evidence: `evidence/final-source-actions-pins.txt`. |
| `tx.origin` check | **Passed at final `9b8e5024`**, exit 0, across **40** Solidity source files. Evidence: `evidence/final-source-tx-origin.txt`. |
| Full typed web lint, monolithic | **Blocked**: the original-config 1536 MiB attempt at `74e3111f` was killed with exit **137** even after competing heavy jobs stopped. Earlier bounded attempts exhausted their heaps. Evidence: `evidence/final-serial-web-lint.txt`. No lint rule, type configuration or file scope was relaxed. |
| Typed web lint, partition trial | **Terminated before results** at `3ab1c3f7`: partition 3 requested 24 of the exact **497** selected files; child **−9 / SIGKILL**, shell **137**, driver **2**, wall **185.333 s**, peak RSS **404,932 KiB**. No `eslint.json` was produced: **zero verifiable files**, error/warning totals **unknown**, **20 partitions unexecuted**. Cause of SIGKILL is unknown. No further partition or retry was run. The final `9b8e5024` file/config discovery matches the prior selection and is metadata only. All historical evidence remains in `evidence/web-lint-partitions-3ab/`. |
| Initial full web coverage attempt | **Blocked**: the original-configuration attempt terminated with exit 137 before an aggregate report. Its outcome remains separate from the later SIGKILL replay below. No coverage pass or threshold exemption is claimed. |
| Complete web unit diagnostic, coverage disabled | **Failed** at immutable runtime checkpoint `e76451ad`: 245 files passed, 10 failed, 2 skipped; 3,584 tests passed, 33 failed, 13 skipped; 930.13 seconds. It examined the full ordinary unit selection and exposed the four test-reconciliation groups above. The BTC initial-scan wait and million-log fuzz timeout remain distinct timing diagnoses; they are not implementation fixes. |
| Corrected-source replay of all ten failed files | **96 passed / 1 failed**, 9 files passed / 1 failed, 300.61 seconds, at test checkpoint `74e3111f`. Every repaired file and the unchanged BTC persistence file passed. The million-log test exceeded its 180-second limit at 191.874 seconds with 512 MiB old-space and 8 MiB semi-space. The separate unchanged-test resource replay below passed; the failed command remains a failed command. |
| Million-log fuzz resource replay | **1 passed**, at unchanged test checkpoint `74e3111f`, original configuration, corpus, seed, assertions and 180-second limit. Node 22 with 768 MiB old-space and 32 MiB semi-space completed the test in **155.316 seconds**, total 156.18 seconds; peak child RSS 226,080 KiB. Evidence: `evidence/final-fuzz-resource-replay.txt`. This validates the resource-adjusted execution, not a proved garbage-collection root cause or a new aggregate coverage result. |
| Combined-source full coverage replay | **Terminated before aggregate output** at immutable `e74ddd26`: wrapper child **−9 / SIGKILL**, exec **247**; wall **2,058.443 s**, user CPU **2,001.675482 s**, system CPU **65.466295 s**, peak child RSS **570,916 KiB**. The log contains **882 passing-case lines and 1 failing-case line**, not final test totals. The unchanged million-log case exceeded its 180-second limit at **192.246 seconds** under coverage. No final coverage metrics or threshold result exist; the kill's cause is not established. Original 90/85/90/90 thresholds and assertions remain. Evidence: `evidence/complete-web-coverage-replay.txt.gz`; the earlier directory-lock startup failure is separate. |
| Camera visibility integration | **77/77 passed** in six files after **9/9 baseline failures**, original configuration, 18.04 seconds, exact original #258 source. Author execution and independent source review are distinguished in the receipt. |
| Hosting timestamp integration | **11/11 focused**, **285 passed / 14 skipped / zero failures** for the complete kit, original kit typecheck and lint **exit 0**. Source and evidence reused for focused-main PR #267 with exact tree/lock comparison, not relabeled as a newly executed main-lock run. |
| Canonical array package selection | **200/200 passed across four files** at reviewed worker source `0f8dca27`, original configuration, 3.53 seconds; package source/test typecheck, typed lint and production build **exit 0**. Final local/published JSON blobs match that reviewed product. Author execution is distinct from independent source review. Full 14-file package coverage and its unchanged **95/90/95/95** thresholds were not run or qualified by this selection. |
| Merchant-clock package selection | **208/208 passed across five files** at reviewed worker source `c4a6e5ea`, original configuration, 9.74 seconds; package typecheck, typed lint and production build **exit 0**. Baseline was **7 passed / 1 failed**, not five independently failed Vitest cases. These passes overlap the canonical 200; full package coverage was not run. |
| Final invoice production rebuild | **Passed** at `9b8e5024` using direct, version-verified **Node 22.23.4**, original `tsconfig.build.json`: `evidence/final-merchant-invoice-node22-build.txt`. The earlier successful direct Node 22 build at `3ab1c3f7` remains separate. Its preceding command had fallen back to **Node 24.22.3** after the old Node 22 cache path disappeared; that actual runtime is retained in its historical receipt. |
| Final compiled runtime-input comparison | **18 workspaces / 254 of 254 JavaScript outputs match** at `9b8e5024`, with no mismatches, missing or extra JS paths, emit diagnostics or changed inputs during comparison. `final-build-input-review.json` records a fresh in-memory transpilation/output comparison, including equality without per-line whitespace normalization. This is not runtime execution, typechecking, declaration comparison or source-map verification. |
| Final separate web no-coverage selection | **4 files / 4 tests passed** at `9b8e5024`, original `vitest.nocov.config.ts`, direct Node 22.23.4, one worker, 768/32 MiB settings. Vitest **88.69 s**, wrapper **89.689 s**. `evidence/final-source-checks-9b8e5024/web-nocov.{json,txt}` records the fresh run; the earlier four-case pass remains historical and is not added to this total. |
| Final hosting-kit replay | **299 total / 286 passed / 0 failed / 13 skipped**, at `9b8e5024`, **10.072 s** test time / **10.333 s** wrapper time, with the actual full web dist present. The original kit command and assertions remain; native/opt-in skips are retained, including the four nginx cases. This fresh root replay is distinct from the author's earlier **285 passed / 14 skipped** run. |
| Focused PR #267 hosted hosting workflow | **Passed**, run **44497615337**, synthetic checkout `d97980dd` whose entire tree equals focused head `c3a693e8`. Kit job **135468723862** recorded **302 tests / 296 passed / 0 failed / 6 skipped**, with native nginx configuration, root/subpath differential and normative checks, Docker request/hardening checks and all six timestamp regressions actually passing. Kit lint/typecheck and demo verification passed. Separate job **135468724333** passed web typecheck/build, a **19-file** scan/package/verification and **1/1 Chromium CSP smoke**. Source-bound receipt: [hosted-hosting-review/receipt.json](hosted-hosting-review/receipt.json). This is focused-source evidence, not broad `9b8e5024` app/browser acceptance or whole-PR CI success. |
| Final serial orchestration | All **10 commands** in the type/no-coverage and build phases exited **0** at `9b8e5024`, with successful post-source validation and matching published tree. The exact harness, command logs, receipts and artifact manifests are retained in `evidence/final-source-checks-9b8e5024/`; the independent harness review is separate. These commands do not include full web coverage or typed web lint, which remain unqualified. |
| Mythril artifact review | **11 open findings**, **8 Low / 3 Medium**, strict exit **1**. Artifact **14509646188** is source/configuration bound to #255 head `ea47fa75`; all contract/compiler-configuration inputs match the candidate. No native analyzer ran during this independent review and no finding disposition was activated. |
| PR #264 CodeQL high alert | **Unresolved; candidate applicability unknown.** Run **44487024101** checked out exact `bf510471` in all three successful analysis jobs and uploaded SARIF. Its separate aggregate check **135456052088** reports one High alert. No artifact was returned, and the permitted connector rejects the annotations endpoint. Available logs expose no confirmed rule/location/dataflow; they cannot establish whether the alert is fixed or novel in this candidate. |
| Local browser | **Blocked** before test execution: Chromium's singleton socket returned `Operation not permitted`. The separate cloud inspection fallback timed out. No local browser pass is claimed. |
| Hosted checks | **Pending qualification**. Exact-head check snapshots and linked jobs are retained; old green predecessors do not qualify this candidate. The skipped Pages release gate runs only for an explicit deployment dispatch on main, not because this PR is a draft. |

A fresh `npm ci` and the earlier broad library build exited 137. Focused work used an isolated dependency-cache copy
whose external package versions match the candidate lockfile and whose workspace links resolve inside this checkout.
All six missing web prerequisites, the changed BTC package, and the current invoice package were subsequently built
successfully. This recovers web build/typecheck capability; it does not retroactively make the initial installation or
all-workspace build a success. Typecheck also exposed stale declarations and the manifest import, both resolved before
the successful run at `e76451ad`.

An independent compile-to-emitted-JavaScript comparison then found three stale cache artifacts: two files in
`chain-adapters` and one in `ux-vault`. The source contained the strict deployment date/retry validation and portable
passphrase-byte cleanup; the cached emitted files did not. Both affected workspaces were rebuilt. The final comparison
matched **254 of 254 emitted JavaScript files across 18 runtime workspaces**, with no extra or missing files or compiler
diagnostics. `build-input-review.json` preserves the initial mismatches and the successful reconciliation. This checks
JavaScript, not declaration files or source maps. Both production builds were repeated afterward; their retained final
artifact manifests refer to those replays. The later four integration repairs change only tests and evidence.
The subsequent `e74ddd26` checkpoint also changes the camera component and static exporter, `3ab1c3f7` adds the
canonical-array guard, and final `9b8e5024` adds merchant-clock validation. A fresh comparator at `9b8e5024` again
matched all **254 JavaScript outputs across 18 workspaces**; its receipt is `final-build-input-review.json`, separate
from the historical `build-input-review.json`. Final typecheck, no-coverage and full/lean build outcomes above are
fresh executions after that comparison. The environment outage removed the previous Node 22 cache path. The exact Node **22.23.4**
runtime was restored at `/workspace/scratch/13855ecc035c/runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node`.
The lint driver received only that executable-path substitution; independent reversal of the substitution reproduced
its previously reviewed byte hash. Its subsequent representative trial failed before JSON results, as recorded above.
Runtime discovery and driver validation are not lint execution. The environment recovered with all raw evidence packets
intact in this report's evidence and worker directories; the retained records identify each interrupted attempt separately.

The #251/#256 browser expiry failure was traced to a one-hour fixture clock jump also triggering the independent idle
lock. Existing master fixes mount the invoice near expiry and advance only 90 seconds. That correction is retained;
no idle timeout or product expiry rule was changed to make the browser fixture pass.

## Independent review and evidence

- `INDEPENDENT_REVIEWS.md`: recovery/strict-profile/CSP reviews, dependency-inventory repair, canonical-array source
  identity, and the completed source-bound Mythril/CodeQL evidence review.
- `../btc-20261119/QUALIFICATION.md` and `EVIDENCE.json`: original #254 ancestry, recovered #244 edge cases, integration
  repairs, source hashes, red/green outcomes, and explicitly incomplete lint.
- `../manifest-test-20261119/QUALIFICATION.md`: unchanged trust assertions, baseline failure, green replay and BTC
  inventory review.
- `../../handoffs/recovered-key-authority-20261119/REVIEW.md`: expiry capabilities and permission-enforced independent
  recovery, exact implementation `bdf6589f0dd07d9ab1935489c72160e1d99f2c82`.
- `../../handoffs/privacy-master-followup-20261119/REVIEW.md`: strict profile, stale draft, pre-event checkpoint,
  app-lock and CSP repairs, implementation through `1aaa29322933469dc02776a639d58c526077f0e7`.
- `../../handoffs/home-release-hash-20261119/REVIEW.md`: hosted failure diagnosis, caller repair, three red cases,
  thirty green cases, and independent review of `9bc9f1a19abedfc667db7931c9892d6cee1190d0`.
- `../../handoffs/settings-exchange-20261119/REVIEW.md`, `../../handoffs/scan-cancellation-20261119/REVIEW.md`,
  `../../handoffs/tag-archive-idle-20261119/REVIEW.md`, and `../tron-integration-20261119/QUALIFICATION.md`:
  original-config red/green evidence, exact test-only repairs and independent reviews for the complete-run failures.
- `initial-pr-matrix.json`: immutable first 49-result comparison. `final-pr-status.json`: bounded final inspection of
  30 priority/initially-green PRs, including exact check identifiers, main compatibility, and dispositions.
- `codeql-initial-annotations.json`: the two retrieved #238 high findings. Existing source repairs are retained;
  fresh combined CodeQL is still required, and no alert was dismissed.
- `test-reconciliation-review.json`: independent exact-blob reconciliation for all four new worker contributions;
  five test/fixture files changed, 175 runtime web files, 288 configuration/manifests, all 18 package trees and
  254 verified JavaScript outputs unchanged. All 87 prior ownership headings and original registry bytes remain.
- `hosted-ci-review.json`: later exact-head queue/run inspection. Queued jobs had no assigned runner or executed
  steps, and inspected runs had no pending deployment approvals. No draft restriction, approval blocker or global
  runner outage was established. It also preserves the #255 IR-minimum compiler failure and source-equivalent
  hosting-kit timestamp mismatch, with job IDs and source blobs.
- `final-source-review.json`: combined hosting/camera integration identity, original source ancestry, unchanged
  surrounding code/configuration and complete retention of the earlier ownership registry.
- `final-canonical-source-review.json` and `../canonical-array-20261119/QUALIFICATION.md`: original #265 ancestry,
  exact final source/test blobs, the bounded inert-array guard, author 200-case/static/build results, unchanged
  configurations and explicit unrun package coverage.
- `final-merchant-source-review.json` and `../merchant-clock-20261119/QUALIFICATION.md`: original #268 ancestry,
  exact merged source/test blobs, clock-value boundary, author 208-case/static/build results, unchanged application,
  contract and deployment trees, and explicitly unrun full package coverage.
- `main-257-promotion-review.json`: concurrent main promotion of #257, exact check/parent identities and
  the zero-file-diff reconciliation, published as `c7e09bc7` with tests still pinned to `9b8e5024` / `155d0091`.
- `final-main-reconciliation-review.json`: independent verification that local `3ce8cad3` and published `c7e09bc7`
  retain updated main ancestry and exactly the tested `e585d1de` entire tree, with no changed paths or new test claim.
- `final-build-input-review.json`: fresh source/configuration/emitted-JS comparison at `9b8e5024`, **18/254** matches;
  the historical comparator remains unchanged and separately identified.
- `evidence/final-source-checks-harness-review.json` and `evidence/final-source-checks-9b8e5024/`: independent
  read-only review of orchestration and its three literal pin changes, then coordinator-executed final commands,
  exact logs/receipts and full/lean artifact manifests. Independent receipt review did not rerun the commands.
- `hosted-hosting-review/receipt.json` and its two lossless raw job logs: focused #267 native nginx/Docker/timestamp
  acceptance, kit static checks, separate web package/Chromium smoke, exact synthetic-merge tree binding and six
  retained kit skips. The sibling library-build step was cache-skipped; no fresh broad library build is inferred.
- `security-artifact-review/REVIEW.md` and `security-artifact-review/receipt.json`: original Mythril ZIP, 241 verified input bindings,
  all 11 open findings, prior non-activated disposition records, CodeQL job logs and concrete annotation-access limit.
- `final-coverage-behavior-review.json`: unchanged coverage behavior and why a failed/incomplete run supplies no
  final coverage threshold result; the killed replay remains recorded separately in `QUALIFICATION.json`.
- `../../handoffs/camera-visibility-integration-20261119/REVIEW.md` and
  `../hosting-timestamp-20261119/QUALIFICATION.md`: newly reproduced visibility/timestamp defects and their
  independent reviews. Focused-main provenance is committed on PR #267 under
  `docs/consolidation/hosting-timestamp-main-20261119/`.
- `evidence/web-lint-manifest.json` and its script/plan: exact installed-ESLint discovery of all **497** selected
  source/e2e files at final `9b8e5024`, unchanged file/configuration identity, and the retained 21-partition plan.
  `evidence/web-lint-partitions-3ab/` preserves the failed representative trial and independent review; discovery
  itself supplies no lint results, and no further partition or retry was executed.

## Main promotion and branch disposition

PR #216 was solely a dated historical handoff, with eight successful checks and twelve intentional doc-only skips.
The normal expected-head merge retained both parents and changed only that document. PR #208 likewise added only its
explicitly dated 234-line execution prompt; eight checks and Snyk passed, twelve runtime jobs intentionally skipped.
Its normal expected-head merge retained parent main `a36f48da` and source `ef610872`. It is archived historical data,
not a replacement for the current user's authorization or a fresh repository status claim.

At **10:52:59 UTC**, a concurrent coordinator normally merged PR #257, original head
`4f14d6f167c788f5ae2d019bc8482027495f3c6c`, into main `8f563764`. The root coordinator verified **36 successful
checks, three skips and Snyk success** at that head. Git inspection retained parents main `14ded337` and original
`4f14d6f1`. That code was already present in the tested candidate, so its subsequent ancestry-only reconciliation
changes no file. This report credits the external main merge separately from this task's documentation merges;
the broader recovery/privacy/BTC/camera/canonical/merchant integration remains in PR #262.

At the initial sweep, no priority runtime PR qualified for immediate main promotion. Some exact heads were queued;
#251/#256 had the diagnosed browser failures; #255 failed Mythril. Initially green predecessors had conflicts,
stacked targets, superseding unmerged implementations, stale current-state text, or incomplete current-source review.
PR #215's stale current-main assertions were not promoted merely because old checks were green. #258's independent
camera-visibility fix was subsequently reproduced, reviewed and retained in #262 with its original ancestry; its
original head now also requires conflict reconciliation: after main advanced, GitHub reported #258 as dirty, with 31 successful checks, two queued aggregates and three skips at the bounded observation. The camera implementation is already retained in the clean, main-reconciled #262 candidate; no original-head normal merge is claimed. The
independent canonical-array PR #265 and merchant-clock PR #268 were likewise retained with original ancestry and
focused evidence after their regressions were reproduced. These integrations are not main promotions or
whole-candidate qualification claims.

PR #267 isolates the hosting timestamp fix from main `14ded337` so it can qualify independently. Its three changed
code/test files and entire 80-file kit tree match reviewed product `38fe7fda`. Eight historical evidence files are
byte-identical. The main and feature root lockfiles differ in 109 entries; the scoped TypeScript/Node-types/ESLint
dependency comparison matches 82/82 declared/optional records, with optional peers explicitly excluded. Playwright
differs and the historical browser test was skipped. The subsequently completed focused Hosting kit workflow
now supplies real nginx/Docker/timestamp and Chromium CSP evidence at `c3a693e8` with main base `14ded337`.
Its synthetic checkout `d97980dd98aa4ba0cb21dccdccf58f5949c63371` and PR head share entire tree
`7cfbb2835be8a3c58ccd5dd549fbb2ecabcccfac`; the exact kit subtree `3295a703` also matches the broad candidate.
The application trees differ, so focused Chromium acceptance does not transfer to the broad application. At the
10:50:56 UTC snapshot, #267 still had **eight successful and twenty queued checks**. The later main advance
requires current-base/remaining-check review before promotion; a successful hosting workflow is not whole-PR success.

PR #245 and #247 were already closed and marked merged at 10:53:01 UTC after #257 reached main. Their current heads ca61cc889c6a5ca6f264cf787e2d2e698f594ea8 and 6c11242abca5a3f20d933266c723d71b2e75d39b are complete ancestors of main8f563764; all seven changed package/web files match main byte-for-byte. No retirement mutation was needed. See [superseded-security-pr-review.json](superseded-security-pr-review.json).

No source branch was deleted by this execution, and no superseded PR was closed on the strength of an unmerged integration. In
particular, #224's 33 non-documentation paths match master, but its retirement requires the retained functionality to
reach qualified main. No force push, branch-protection change, scanner exception, production deployment, or release
was performed. Administrative protection reads returned 403; public metadata showed no protection/rulesets. That
absence was not treated as permission to skip qualification.

## Remaining concrete gates

1. Obtain a completed combined coverage result at the unchanged thresholds. The first attempt exited 137 and the
   later `e74ddd26` replay ended in SIGKILL before aggregate output, with one confirmed fuzz timeout. Complete-unit
   diagnosis, corrected-file replay and the passing no-coverage resource-adjusted million-log execution retain
   their separate outcomes. The original fuzz corpus and timing limit remain intact.
2. Obtain full typed web lint and applicable all-workspace installation/build/test qualification on adequate resources.
   Final `9b8e5024` typecheck, the separate no-coverage selection and full/lean builds have passed, but neither the killed
   monolithic lint nor the killed representative partition produced a complete lint result. Preserve exact source,
   runtime and input identities; the 497-file discovery manifest alone is not a lint pass.
3. Complete full/lean browser, Pages-on-Anvil and required native/regtest acceptance. The Home and expiry fixes need
   a fresh broad-candidate hosted replay; #258 and focused hosting #267 remain independent qualification/promotion
   lanes. The successful focused #267 nginx/Chromium run is retained without relabeling it as broad-app acceptance.
4. Obtain the actual PR #264 high-alert rule/location and evaluate it against the candidate; its applicability is
   currently unknown. The source-bound #255 artifact retains **11 open findings (8 Low, 3 Medium)**; stricter
   evidence handling and previous disposition proposals do not close them or activate an exception. Track the 17 low-severity development
   dependency entries through the existing major-toolchain upgrade lane and its compatibility/native qualification.
5. Once all applicable gates and independent review qualify the same source, merge through the normal expected-head
   PR operation. Only afterward close demonstrably superseded PRs and update the branch retirement record.

The implemented work is durable and reviewable in PR #262. Application promotion remains gated by concrete missing
qualification, rather than a request to invent owner approval or weaken the repository's checks.
