# Hosted Mythril finding review — 2026-11-18

**The hosted main Mythril job failed on 11 reported findings (3 Medium, 8 Low). This was not an installation failure or an outer workflow timeout. Ten finding locations match the historical disposition tables; one Low SWC-113 at Factory initialization is new. The strict gate remains failed.**

This review only reads existing logs, artifacts and source. No analyzer, compiler, trace replay, test, workflow rerun, source edit or suppression was performed for this review.

## Provenance and execution result

| Item | Evidence |
|---|---|
| Main source actually checked out | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Hosted job | [run 44297673763 / job 134778851902](https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/job/134778851902) |
| Failed step | “Execute the unchanged full analyzer runner” |
| Runner interval | 2026-11-18 13:57:35–14:46:25 UTC |
| Runner outcome | Exit 1; three target issue markers, for SweepRelayer, PolicyAccount and PolicyAccountFactory |
| Tools recorded in hosted setup | Foundry 1.8.5; CPython 3.12.16; Mythril 0.24.8; solc 0.8.28 |
| Artifact | [14437897350](https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/artifacts/14437897350), available when retrieved; recorded expiry 2026-12-02T14:46:26Z |
| ZIP | 17,233 bytes; SHA-256 `e998907946a170b95509e51f94013daf34377b6b02195c21c763605f2f4a3130` |
| Full report | 283,205 bytes, untruncated; SHA-256 `40e9faf6e54b4e5f1e683cb07d6522eea55f5bff50fcf46eeb5395d615c932f7` |
| Retained metadata | Requested commit equals checkout commit; analysisOutcome=failure; runnerExitCode=1 |

The hosted step invoked `bash "scripts/run-${ANALYZER}.sh"`, with ANALYZER=mythril, from packages/contracts. The unchanged runner invokes this per target, in the table's order:

```sh
myth analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout 900 -t 3 -o json
```

Its temporary compiler JSON sets OpenZeppelin's local remapping, optimizer enabled with 200 runs, and EVM version cancun. This is recorded command evidence, not a command executed during this review.

| Target | Report success | Report error | Findings |
|---|---|---|---:|
| GhostPayRouter | true | null | 0 |
| GhostPaySweepRelayer | true | null | 1 |
| GhostPayPolicyRouter | true | null | 0 |
| PolicyAccount | true | null | 2 |
| PolicyAccountFactory | true | null | 8 |

The raw report has no crash traceback or download failure; it contains five pkg_resources deprecation warnings and the three expected strict-runner error markers. Mythril's JSON omits internal report.exceptions, and each target has the original 900-second execution budget. Therefore success=true/error=null confirms report production, not exhaustive symbolic exploration. Zero findings in the two routers is a bounded result.

## Exact current finding table

H1–H11 are **current report order**, not historical finding IDs. Factory findings all name `deploy(address,address,uint256,bytes32)`, except H4, whose reported contract is the synthetic clone address and whose function is fallback. Vendored paths below are relative to packages/contracts/lib/openzeppelin-contracts/contracts.

| Current | Historical location match | SWC / severity | PC | Report function and location | Bounded assessment |
|---|---|---|---:|---|---|
| H1 | EXP-1 | 116 / Low | 785 | GhostPaySweepRelayer.`sweep((address,address,address,address,uint256,uint256,uint256,uint256),bytes)`; src/GhostPaySweepRelayer.sol:83; `if (block.timestamp > s.deadline) revert Expired()` | Intended signed-order expiry check; producer-clock trust remains. |
| H2 | EXP-2 | 116 / Low | 1876 | PolicyAccount.`requestWithdraw((address,uint256,uint256,uint256,bytes32),(uint256,uint64,bytes32[]),bytes)`; src/PolicyAccount.sol:161; `if (block.timestamp > w.deadline) revert Expired()` | Intended submission expiry; signed parameters, nonce and later withdrawal timelock remain enforced. |
| H3 | EXP-3 | 116 / Low | 5077 | PolicyAccount.`proposeDestination(address,uint256,uint256,bytes)`; src/PolicyAccount.sol:262; `if (block.timestamp > deadline) revert Expired()` | Intended proposal expiry; signed parameters, nonce and later 2×delay remain enforced. |
| H4 | R4 | 110 / Low | 30 | Report contract `0x72c68108a82e82617b93d1be0d7975d762035015`, fallback; no filename/line resolved; sourceMap `1864:8148:26:-:0` | Infeasible retained constructor; historical clone/model counterevidence applies to this location. No reachable assertion violation demonstrated. |
| H5 | **NEW** | **113 / Low** | **999** | PolicyAccountFactory.deploy; src/PolicyAccountFactory.sol:117, initialize call; sourceMap `6237:81:26::1` | Explicitly reviewed below: true sequential-call pattern with intended atomic initialization; constructor witness infeasible; fee-token availability residual remains. |
| H6 | R5 | 107 / Medium | 999 | PolicyAccountFactory.deploy; src/PolicyAccountFactory.sol:117, initialize call; same sourceMap as H5 | Fee call precedes clone/initialization under nonReentrant; fixed trusted implementation's initializer has no external calls. No reentrant state-corruption behavior demonstrated. |
| H7 | R6 | 107 / Low | 1170 | PolicyAccountFactory.deploy; utils/ReentrancyGuard.sol:99; sourceMap `3972:62` | Optimizer maps guard-release SSTORE to ENTERED source line. Historical bytecode review and existing guard regressions identify the mitigation itself. |
| H8 | R7 | 113 / Low | 1668 | PolicyAccountFactory.deploy; src/PolicyAccountFactory.sol:131; recipient balanceOf; sourceMap `7118:30:26` | Real fail-closed dependency on fee-token views. Atomic rollback protects state; permanent fee-token failure can block counterfactual deployment. |
| H9 | R9 | 107 / Medium | 2887 | PolicyAccountFactory.deploy; proxy/Clones.sol:104; CREATE2; sourceMap `5629:32` | Same guarded fee-first sequence; salt binds owner and policy; failed creation rolls back fee. No demonstrated parameter hijack. |
| H10 | R10 | 107 / Low | 2978 | PolicyAccountFactory.deploy; token/ERC20/utils/SafeERC20.sol:227; token CALL; sourceMap `10660:45` | Target is immutable FEE_TOKEN, not a deploy-call parameter. Correct deployment/token selection remains a trust assumption. |
| H11 | R11 | 104 / Medium | 2978 | PolicyAccountFactory.deploy; token/ERC20/utils/SafeERC20.sol:227; same sourceMap as H10 | Return is consumed in SafeERC20 and the factory branches on its result. Failure can intentionally waive the fee under strict unchanged-balance/allowance and funding conditions. Fee-revenue residual remains. |

The historical R8 tuple, Low SWC-113 / PC1781 / allowance / src/PolicyAccountFactory.sol:132, is **absent**. Its absence is not evidence of a fix. H5 is a different detector tuple from historical R5 even though both use PC999. No verdict was transferred by count or PC alone.

The historical references are:
- `docs/audits/mythril-14290880802-factory-dispositions.md`
- `docs/audits/mythril-14290880802-expiry-dispositions.md`
- `docs/audits/mythril-reevaluation-20261118.md`

They document earlier artifacts and earlier tests. They are evidence for comparison, not a finding-specific gate approval or proof that the current solver witnesses are byte-identical to the old ones. The separate independent comparison is retained in `analysis-branches/HOSTED_MYTHRIL_DISPOSITION_COMPARISON_20261118.md`.

## Direct checks of the current Factory witnesses

The offline parser `inspect-retained-mythril.py` decodes each JSON report directly from report.log, verifies equality with parsed-reports.json, validates metadata hashes/lengths, and inspects the existing artifact bytes. It executes no EVM input.

For each of the eight Factory findings, transaction zero's input ends in its separately supplied calldata. The input is 8,126 bytes, the supplied calldata is 4,319 bytes, and the creation prefix is 3,807 bytes. The constructor has four static ABI parameters; its **first** 32-byte calldata word, immediately after that creation prefix, encodes implementation_ = 0x0000000000000000000000000000000000000001. It is not obtained by taking the final four words of the solver's much longer calldata.

The real constructor checks implementation_.code.length before storing immutable fields (Factory line88). On the conventional EVM environment represented by this project, address1 is a precompile without deployed EVM runtime code; the existing constructor regression verifies that this value reverts ImplementationHasNoCode. Thus these exact retained creation witnesses cannot establish real successfully deployed factories. This observation alone does **not** make every detector pattern safe: the actual source paths and residual dependencies are reviewed separately.

All eight creation prefixes have SHA-256 `5a6bfffabbad4f62ed3fd56737e65f43535766f8699cc02cc61460758ded3727`. Each contains, exactly once at offset457, all 3,296 bytes of the existing pinned Foundry artifact's metadata-free deployed-bytecode **template**:

- Existing artifact: packages/contracts/out/PolicyAccountFactory.sol/PolicyAccountFactory.json, deployedBytecode.object.
- Runtime-template SHA-256: `3f3d30fefbb3b607c579c355570273a86997ed3a60d197f6a78c369320ed1ac0`.
- This establishes instruction/template identity, including immutable placeholders. It does not establish equality to a particular initialized on-chain instance.
- Full creation bytecode is **not equal**: the existing Foundry artifact is 3,753 bytes, and the first differing byte is23. Metadata inclusion changes creation size constants as well as appended data. The report does not claim full creation equality.

### Separate assessment of NEW H5: SWC-113 at initialization

H5 reports that initialize follows other calls and can be prevented by a prior permanent failure. That call-order fact is correct. Factory.deploy computes the policy-bound salt, rejects an already deployed address, collects/waives the fee, creates a clone of the immutable implementation, and initializes it in one nonReentrant transaction. Initialization on the actual PolicyAccount implementation checks one-time initialization and the CREATE2-derived caller/address relationship, writes owner/destination/delay/root, and makes no external calls. If fee collection, clone creation or initialization reverts, the transaction rolls back all preceding fee and deployment effects.

This is intended atomic behavior. Splitting clone creation from initialization merely to reduce the number of calls would require a separate security design and is not justified by this diagnostic. Correct selection of the implementation and fee token remains a deployment assumption.

The fresh H5 witness also has two byte-identical deploy inputs, both with SHA-256 `e36f9f5077bb06cdb7aa9d8c6f4cbf3fa4f66e821b1014bafa24d3ae6f907d3b`. The origins differ, while target/value and policy parameters are the same; the source's salt excludes origin. **Conditionally on the first deploy succeeding**, a repeated call hits AlreadyDeployed before fee or initialization. If the first call reverted, its clone creation would roll back and that observation would not apply. The retained input sequence alone does not prove that the first call succeeded, so duplicate inputs are supporting conditional counterevidence, not an independent infeasibility proof.

H5 therefore adds no demonstrated initialization/reentrancy exploit in this review. Its general availability concern is material in the same fee-token conditions as H8/N1 below. It remains an explicitly assessed, still-failing scanner record; no allowlist or approval is created here.

## Real residuals retained

**N1 — fee-token availability and counterfactual funds.** A nonzero-fee factory relies on balanceOf and allowance calls. Permanently reverting views block deployment. A transfer that reports success but produces unexpected payer/recipient balance deltas also reverts. Because the factory and its fee configuration are immutable and its address participates in CREATE2, prefunded undeployed accounts can remain inaccessible while that token behavior persists. A different factory or unrelated clone does not recover the same address. The fee waiver handles a restricted class of refused transfers; it does not cover every token failure.

This is a real conditional design risk already documented historically, not a newly established attacker-controlled reentrancy or unchecked-call exploit. The smallest way to remove that token dependency for a **future** factory configuration is a zero fee; changing fee-bearing failure semantics would require a specified behavior change and focused regressions in _collectFee. Neither action was performed or authorized by this read-only review. The historical assertion that no public deployment existed was not independently refreshed here and is not adopted as current exposure evidence.

**Fee-waiver economics.** A fixed token that refuses transfers while reporting sufficient unchanged balances and allowance may intentionally yield fee-free deployments. Sender hooks or exceptionally expensive token behavior may make refusal controllable. Existing checks protect account policy and rollback partial balance changes; they do not guarantee fee revenue. Historical gas measurements are not presented as newly measured numbers or a universal token guarantee.

**Clock and operator assumptions.** H1–H3 are intended timestamp-dependent acceptance windows, not randomness. Signatures bind order fields and nonces. Policy requests/proposals receive a later delay and cancellation path. Block-producer clock latitude/censorship and supported-chain operational bounds remain assumptions. The current report's missing timestamp findings elsewhere do not qualify the unreported paths.

## Already-completed regression evidence, without double counting

The retained combined Forge execution at source ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929 passed **490/490 tests**, zero skipped. Contracts and relevant tests are unchanged at main dfc and tested candidate e8. Within that 490 are:

- 33/33 MythrilFactoryDispositionsTest tests, including constructor address1 rejection, guard/call ordering, fee callback and initialization rollback, static-view failure, checked transfer outcomes and repeat-deploy behavior.
- 21/21 policy expiry tests and 10/10 sweep expiry tests.
- The fixed-target Factory fuzz test retained its 10,000 runs.

These **64 tests are a subset of 490**, not additional passes. They use the repository's existing historical fixtures and source-behavior regressions. This review did not replay the newly downloaded artifact, execute a new test, repeat a mutation experiment or run Mythril.

## Source identity and applicability to the candidate

Published PR238 head `9bad95e5cc0ee73f5adb8d2c587161074b21e080` and local tested `e8c77e7e8699dd16b86b7a1ff90b834594d07105` have the previously verified full tree `81341de7972041b5f7ce53da76027846356fab90`. The following object IDs are equal at hosted main dfc, tested local e8, and local documentation descendant 1656558a78f52a2251a3e84b1ce980741a6d46fc:

| Input | Equal Git object |
|---|---|
| packages/contracts/src tree | dabfd36a98424a4184ee7e267e12815763d1157f |
| packages/contracts/lib tree | b10191d543360a5c102e269cca72883b4303d8c7 |
| PolicyAccountFactory.sol | d456eec25c744e1e992ca786b2f21eefdbdf81a7 |
| PolicyAccount.sol | 1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4 |
| GhostPaySweepRelayer.sol | 3095160e30f5bcc109e7786ec410ab81741dadd4 |
| run-mythril.sh | 7ad37efb96f6b5e1f54ffbdfc8a644ef3b03ab4e |
| mythril-compat.py | bd78f6b0cecc1f9b43c2a933a44981d38e403521 |
| foundry.toml | 59bf7337ea5fe8526869f22e9595e022027b4712 |
| remappings.txt | 779c67d0d1432ad99b1a0828a98d390a04a3e1fa |
| contract-analysis.yml | ab4b881de3f586869d1efbaec32799d9082193fd |
| MythrilFactoryDispositions.t.sol | be677e1b934bfb4275abf66771d98c75e45516c5 |
| MythrilExpiryDispositions.t.sol | b1ab1a4823f7c562f6d07e9b51bbfbeb4ca3dbb8 |

The JSON additionally records DeployPolicy.s.sol identity. This makes the findings/source reasoning applicable to those candidate inputs. It does **not** turn the main-hosted job into an execution on candidate9bad or qualify the candidate's unrelated code.

## Gate disposition and retained files

The strict runner fails on any finding and explicitly warns that Mythril JSON does not prove complete exploration. It remains unchanged. Existing disposition documents and the standalone helper are not an approved wired exception mechanism. **The gate is still failed, and no production-readiness clearance is inferred.**

Retained companions:
- HOSTED_MYTHRIL_REVIEW_20261118.json — exact issue metadata, trace comparisons, hashes and source object table.
- inspect-retained-mythril.py — offline reproducible parser.
- main-mythril-dfc75ef2-14437897350.zip — downloaded hosted artifact.
- main-mythril-dfc75ef2-14437897350/{metadata.json,report.log,parsed-reports.json}.
- main-mythril-dfc75ef2-134778851902-job.log — decoded hosted job log.
- combined-forge-contracts-185.log — already-completed execution evidence.

The separate independent reviewer recomputed the constructor boundary, first arguments, runtime-template equality and duplicate-input equality from these existing artifacts; their note retains the successful-first-deploy condition and the N1 residual.

