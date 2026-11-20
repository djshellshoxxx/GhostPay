# Corrected combined source — final local artifact qualification

## Result and source

The corrected source **`2149ad2814d9ae031b23322f87f74842af5dde78`** passed the original development Pages build, including full web TypeScript, bundling, the original CSP/secret/lean checks, and the original staged-artifact integrity gate. A separate verification of the promoted output also passed: **all 16 site files match the build's checksum inventory and exact source commit**.

Complete local qualification remains open. The one approved larger-heap full-lint attempt was terminated with exit 137. The preceding full-coverage attempt at source `53f4253b` was incomplete and cannot establish the corrected source's coverage gate. Root will obtain exact-head hosted original lint, full-coverage and browser results before treating those gates as complete.

Independent worker: `/root/integration_qa_gen3`. Review branch: `review/ghostpay-final-artifact-qa-gen3-20261120`. This is a continuation by the same worker, not another fresh reviewer. The separate baseline checkpoint is `758970ceab84ebc468783d136a68b31fc3882fec`; retain it alongside this final evidence so no earlier failure is lost.

## What changed since the baseline

The only non-documentation delta from `53f4253bd9afc33bea43a7bdfe95ae287e035bf7` is the addition of `transactionHash` to the shared policy `walletMirror` receipt fixture. The primitive hash matches the existing transaction lookup and `MockWallet` broadcast. The final helper blob is **`6db098624324846c7a6f577a90bd35b01c80f200`**, identical to the independently reviewed fixture repair `898d3361af4320dccca7743d960b32a94fb66922`.

This worker independently verified that all original **15 selected input blobs** and **eight baseline control scopes** remain unchanged, and that every production file, existing test assertion, timeout, coverage threshold and configuration outside that helper is preserved. [The corrected source receipt](corrected-source-manifest.json) records the exact comparison.

Fresh fixture worker `/root/policy_fixture_gen7` executed all seven existing helper-consumer files at its repair source: **87 tests passed, seven files passed**. That is attributed predecessor evidence; it is not represented as another execution by this worker. Its source, command, raw output and unchanged-consumer identities are preserved in the integrated `completion-20261120/policy-receipt-fixture/` evidence. The complete non-documentation tree of the corrected candidate matches that tested repair.

## Executed checks at the corrected source

| Check | Actual result | Scope and limits |
|---|---|---|
| Full original typed web ESLint, one approved 1536 MiB retry | **Incomplete: exit 137**, 46.898 seconds | Log reports `Killed`; no lint diagnosis was emitted before termination. No further retry was attempted. |
| Original development Pages build, 1024 MiB heap | **Pass: exit 0**, 38.278 seconds | Includes full web `tsc --noEmit`, lean bundling, existing CSP and content scanning, staged site checks and pre-promotion integrity verification. |
| Original artifact verifier against promoted files | **Pass: exit 0**, 0.081 seconds | All **16** site files match `SHA256SUMS`; recorded commit equals `2149ad28…`. |

The larger-heap lint attempt was specifically authorized after the baseline's explicit 1024 MiB JavaScript heap exhaustion. Its exit 137 outcome is retained separately; the precise cause beyond the reported process termination was not established. Neither lint attempt is relabeled as a clean run.

The [command receipts](corrected-checks.json) preserve source, exact command arguments, working directory, timestamps, duration, exit code, external cap, resource bounds and lossless-log hashes. The new logs are under `logs/corrected-*`. No external cap was reached in these three commands.

The original build script creates a clean child environment that preserves `PATH` and drops `NODE_OPTIONS`. A [heap-only Node wrapper](pages-node-resource-wrapper.json) retained the approved 1024 MiB bound through that environment; it only executes the existing Node binary with the heap flag. No script, compiler option, test assertion, CSP setting, scan rule or integrity gate was edited. The build set the documented development flag, exact `GP_COMMIT`, and empty deployment/key inputs. Inherited CSP-related variables were unset, so the original development defaults applied unchanged.

Dependency provenance remains the initial worker's private matching-lock dependency copy, 64 unchanged library declaration outputs whose package inputs were compared, and locally rebuilt QR output. The fixture correction changes no dependency or package input. This is not a new clean dependency installation or a complete rebuild of every library.

## Preserved complete development artifact

The complete artifact is [pages-2149ad28.tar.gz](pages-2149ad28.tar.gz). It contains **21 original files**: the **16-file site** and **five build-evidence files**. Every archived member's bytes were rehashed against the generated files after packaging. [The artifact inventory](pages-artifact.json) records every member's path, length and SHA-256.

- Archive SHA-256: `28e006e0e2c32c82be8d66bbc3a7f74de057779c4941a82e4899333980faeabd`.
- Archive size: **790,173 bytes**.
- Original output directory: `/workspace/scratch/e5b5e498b785/verification/pages-2149ad28-qa-gen3`.
- Exact build source: `2149ad2814d9ae031b23322f87f74842af5dde78`.

The separately readable [build identity](pages-build-info.json), [Pages evidence](pages-evidence.json), and [site checksum inventory](pages-SHA256SUMS) are byte-for-byte copies from the original output. The evidence explicitly records **`release: false`**, **`paymentsEnabledChainIds: []`**, no deployment manifests, a lean profile and a relative base. No deployment was performed.

These checks establish integrity against this local build's inventory and exact source association. They do not authenticate an arbitrary externally supplied manifest, establish hosted browser behavior, or constitute release approval.

## Outstanding gates and handoff

The baseline at `53f4253b` reported **1,467 passing test lines and 19 actual policy-fixture failures** before the recorded 900-second overall cap. It emitted no completed suite or aggregate coverage result. The corrected fixture's focused pass resolves the observed helper mismatch; it does not establish the entire full-coverage gate. The original four-test no-coverage pass and initial 87-case web QR run passed at the preceding source, with their exact evidence retained in checkpoint `758970ce`.

Root requested no automatic repetition of the same incomplete local coverage command. Complete lint, full coverage and browser gates must be assessed at the published exact head. A later local full-coverage attempt requires an adequate justified overall budget and runnable conditions while preserving the original per-test timeout and thresholds.

The heavy execution window was released after the promoted artifact verification. Root can now run the separate quick-hide feature's full TypeScript check. Its source and privacy dependency remain separate; none of this combined-candidate evidence is transferred to that feature. [The final successor handoff](CORRECTED-HANDOFF.md) gives the remaining review scope.
