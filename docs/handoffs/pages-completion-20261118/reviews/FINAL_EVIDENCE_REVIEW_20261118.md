# Independent final evidence/artifact review — 2026-11-18

Reviewer: `branch_archaeology`, independent of the final test/build execution lanes.
Reviewed root documentation state: `1656558a78f52a2251a3e84b1ce980741a6d46fc`. Runtime/test source: local `e8c77e7e8699dd16b86b7a1ff90b834594d07105`, published `9bad95e5cc0ee73f5adb8d2c587161074b21e080`, common full runtime tree `81341de7972041b5f7ce53da76027846356fab90`.

**No inconsistency found in the completed npm, static-build, artifact-hash or same-environment reproducibility evidence. Release qualification remains incomplete. A newly retrieved hosted Mythril report has one finding identity not covered by the historical disposition table; that mismatch is recorded below.** This review ran no product tests, browser, builds, analyzer campaigns or archive extraction, changed no repository file, and made no remote mutation. Checks consisted of source-object comparisons, bounded source inspection, independent log arithmetic, metadata/path checks and hashing existing files.

## 1. Runtime source preserved through documentation integration

At `e033855b02736f28d6ac583582b984f1d973d4be`, the merge added/changed 98 documentation paths only. Git objects for `apps`, `packages` (including test code), `scripts`, `.github`, root package manifest and lockfile match local e8 and published9bad exactly. `deploy` differs only in `TOR.md`. The later root state `1656558a78f52a2251a3e84b1ce980741a6d46fc` still has no non-documentation delta from e8 and was clean when inspected. Full root tree equality is not asserted after adding documentation; runtime/test/config/workflow identity is.

The final Pages README explicitly scopes the second provider to Scan and states that Pay/Sweep use the primary RPC. Its own-node paragraph matches `defaultServices.ts`, `scanPrivacy.ts` and `csp.mjs`: dispatch checks recur for cached clients/retries; the validator can accept loopback HTTP, while the shipped cross-origin connection policy and allowlist parser block plain HTTP. The text distinguishes URL acceptance from browser reachability and retains real Tor/own-node UNVERIFIED status. No protection was weakened. The exact reviewed document hash is retained in the JSON companion.

## 2. Completed npm evidence independently reconciled

`qualification/package-tests-result.json` records `npm test`, source e8, Node22.23.5/npm11.21.2, aggregate exit0 and 2204.93 seconds. The completed raw log is 260,844 bytes, SHA-256 `df758e1fd7d1a95be14c27d74370a5e8af406707db41d8eb95d6dc89f7660e17`.

Independent arithmetic over 68 Vitest summary lines and the Mocha46 summary yields **12,402 passed, 0 failed and 79 skipped**. Independently enumerating test scripts from exact source package manifests gives the same **68/68 workspaces**, with no missing or extra invocation. Web contains 2,959 passes/1 skip in the coverage phase plus three separate no-coverage passes. Its 93.30/89.52/95.04/97.04 coverage row applies to that coverage phase. No skipped test is relabeled passed; minimal output does not preserve every skipped case's identity/reason. Counts represent executions in this invocation, not unique behaviors, independent properties, browser acceptance or optional-chain production qualification.

## 3. Web/Pages artifacts and HTTP results

On published9bad, the clean-install retry after the root suite completed, dependency-ordered library build, full web and lean web builds all exited0. The original two SIGKILL installation attempts remain recorded; their cause is unproven. Full and lean retained artifacts contain19 and17 files, respectively, with the correct embedded commit. Vite size/dynamic-import warnings and the broad connection-policy note remain visible.

Both default Pages builds exited0 with payments disabled and no deployment manifests. Independently hashed all16 files per site and checked exact file membership, source commit, lock digest, origin/shared flag, empty-manifest digest, lack of source maps/`_headers`, and the lean report. SHA256SUMS digests are:

| Artifact | Declared origin / local path | SHA-256 of SHA256SUMS |
|---|---|---|
| Project | `https://djshellshoxxx.github.io` / `/GhostPay/` | `e9d03e75ec6232af625cf1193a0978777a6f56f69927e1169b95493e95b5118f` |
| Dedicated configuration | `https://ghostpay.example` / `/` | `ddcca5eda8cb44ea3f781df0e8483da28e50c9738cd91d472e81fe60ed75ec17` |

The worker's captured real loopback checks exited0, fetching15 MIME-servable files per site and comparing response bodies to hashes; `.nojekyll` is hash-only. The project redirect/outside-prefix cases were also checked. The dedicated origin is a placeholder. These results do not exercise hosted HTTPS, rendering, workers, CSP/origin enforcement, wallets, real Tor or browser RPC silence. The final report keeps those limits explicit.

The artifact helper's initial `./` checksum-prefix mismatch was identified in independent review and corrected by its author before execution. Release-helper duplicate-manifest/tar-name and outer-file ambiguity checks were likewise strengthened before first execution. Resource wrapping only supplied the pinned Node old-space cap; it did not change repository checks.

## 4. Browser outcomes remain unsuccessful

The first full attempt incorrectly stamped the fixture build as production with GP_COMMIT; the shipped public-test-key rejection correctly stopped preflight. That setup error is retained separately. Normal full invocation reached launch but the pinned Playwright Chromium1255 executable was missing. Supported system Chromium156 full and lean attempts actually launched processes, which aborted on socket EPERM/SIGABRT before application assertions. Full selected85 cases: one launch failure/84 not run; lean selected75: one launch failure/74 not run. No browser application assertion pass is established. This is not a successful browser suite with skipped optional cases.

## 5. Development release and clean-clone reproducibility

The real `release:build` exited0 in102.182 seconds, and `release:repro -- --head` exited0 in206.123 seconds. The shipped repro script creates two `git clone --no-hardlinks` checkouts at different path basenames/depths, checks out the same exact HEAD and invokes the normal release build in each. Both retained clones were independently confirmed at9bad/tree81341de7, with no source changes excluding generated `release-out` and normal ignored build outputs.

Independently compared archive, SBOM, release manifest and SHA256SUMS across standalone output and both clones: **all four files are byte-identical across all three locations**. The archive has19 files, canonical unique paths beneath `ghostpay-web`, no links/special files/maps, normalized uid/gid0 and source epoch1795012894. Source metadata, lock digest, artifact sizes and per-file checksums match. No archive content was extracted or executed by this reviewer.

| Artifact | SHA-256 |
|---|---|
| Tarball | `3ad9d94c09e5dfedecf2fe5be5b5748b83e3d0df5cd9b396230f603d41eb4cc1` |
| CycloneDX SBOM | `e2165196882b5150466731805c38c7fb93d088d1344aebba11d880831bee107d` |
| Release manifest | `5a8c345a094e048542b00c1adb0cbb9aae15c4194fb32af6e9162245fbab4213` |

All manifests remain `development`, tag null, clean source true, not-published and with no deployment manifests. The139 SBOM component count and schema/project metadata are checked; independent dependency completeness is not claimed. Reproducibility covers this pinned environment and two clean paths, not other platforms or release authorization. Documentation appended later changes commit/build metadata, so these remain the exact9bad build results.

All77 entries in `analysis-build/evidence-index.json` match recorded hashes/sizes; all19 command-record/log pairs match their recorded hashes. Index SHA-256: `0098780040faf3aa0151686113c019d3e4d6e8e7751cd619acbc4afa9620ffb2`. The reviewed build report hash is `2d4a073a4773a74dc65015bf2f4dc4fa6a71922f4277ee5f67bb8c6f038ba2b7`.

## 6. Analyzer evidence and remaining gates

Completed Echidna raw output independently reconciles Router300000/Sweep300005/Policy300020 calls,13 ordinary properties passing,11 required canaries falsified,3 auxiliary-Slither failure warnings and10 unconfigured-RPC diagnostics. Hash `f3b4192d3295747cc0973adaa6df6e70f349e33cd90387c3875c2e0aefb16be7` matches the addendum. The existing runner exited0; the result must retain its incomplete auxiliary guidance/empty-account model. The proposed auxiliary-Slither root cause stays an inference without a reproducing traceback or rerun. Standalone Slither passing separately does not repair that campaign limitation. The local Mythril campaign was never started.

Fresh hosted-main Mythril evidence is different: artifact14437897350 from run44297673763/job134778851902 contains five usable reports and11 findings (3 medium/8 low); gate metadata records failure/exit1. Ten documented location tuples match the retained historical dispositions. **New Low SWC-113 at Factory PC999/initialize line117 replaces the absent historical R8 Low SWC-113 at PC1781/allowance line132.** It must not inherit R5's different Medium SWC-107 disposition merely because the PC matches. See `HOSTED_MYTHRIL_DISPOSITION_COMPARISON_20261118.md` and JSON for exact records, hashes and limits. No fresh exploitability verdict, suppression or gate change was made.

The final isolated required `npm run lint` retry at root `1656558a78f52a2251a3e84b1ce980741a6d46fc` exited **137** in `@ghostpay/web` after **185.58 seconds**, with Node 22.23.5/npm 11.21.2 and `--max-old-space-size=2048`. The retained 19,833-byte log ends in `Killed` without a source diagnostic; SHA-256 `5b6bea4d44373e3c21e0044e822e52c4ec198fd82abb124f4a6451aaf7cf2db6`. Metadata and raw output were inspected. The lint gate remains blocked; no further retry was performed by this reviewer.

Full typed web lint, actual candidate browser acceptance, complete final hosted gates/security dispositions, external wallet/testnet/Tor/device/accessibility/native-language acceptance and owner release conditions remain distinct outstanding requirements. Full dependency audit high findings remain unresolved. Neither successful unit/build/repro evidence nor historical disposition reasoning authorizes a main merge or release by itself. No main merge, PR closure, deployment or release was performed in this review.

## 7. Independent addendum: current Mythril trace counterevidence

The CI worker's fresh byte and constructor-input comparison was independently recomputed from the retained report. Cached reports were checked against their exact JSON objects in raw `report.log`; no analyzer, compiler, EVM trace replay or test was started. The detailed independent data is in `INDEPENDENT_MYTHRIL_TRACE_COUNTEREVIDENCE_20261118.json`, alongside `analysis-ci/HOSTED_MYTHRIL_REVIEW_20261118.json`.

All **eight Factory-analysis records** encode `implementation_ = 0x0000000000000000000000000000000000000001` in the first constructor ABI word. The artifact ABI independently confirms the parameter order. On the ordinary EVM precompile model, that address has no deployed runtime code; the real constructor rejects it with `ImplementationHasNoCode` at `PolicyAccountFactory.sol:88`. This is counterevidence to replayability of these supplied model traces. It does not prove that all executions with a valid implementation are safe.

Each record's 3,807-byte creation segment contains the exact existing **3,296-byte metadata-free runtime template** at byte offset 457. Runtime SHA-256 is `3f3d30fefbb3b607c579c355570273a86997ed3a60d197f6a78c369320ed1ac0`. The local Foundry artifact explicitly disables CBOR and retains unresolved immutable references. Full creation code differs; no whole-initcode or immutable-resolved deployed-instance equality is claimed.

For the **new Low SWC-113 / PC999** record, both raw `deploy(address,address,uint256,bytes32)` inputs are exactly the same 132 bytes, SHA-256 `e36f9f5077bb06cdb7aa9d8c6f4cbf3fa4f66e821b1014bafa24d3ae6f907d3b`. Independent ABI decoding agrees with both supplied resolved-input arrays. The target and value match; the callers differ. Source derives the salt from owner and policy parameters, not caller, and checks `AlreadyDeployed` before fee collection or initialization. **After a successful first deployment**, the repeated inputs therefore select the same clone address and the second call is rejected. Identical input alone does not establish that the first call succeeded; if it reverted, no successful clone deployment persists.

These observations support a fresh, trace-specific modeling explanation for the new record without silently inheriting historical R5's different SWC classification. The current gate remains **failure / exit 1 with eleven findings**. No suppression, gate modification or release approval follows. The real **N1 conditional availability risk** remains: a fixed fee token whose view calls permanently fail, or whose successful transfer produces unexpected balance deltas, can block fee-bearing deployment of the counterfactual account. Those deployment and fee-token acceptance decisions are separate from the invalid-constructor trace evidence.
