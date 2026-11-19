# Echidna completion and diagnostic addendum — 2026-11-18

**The already-running repository campaign completed with exit 0, with material diagnostics retained.** All three full call budgets and the complete property/canary inventory finished. Auxiliary Slither analysis failed for every harness, and the runtime emitted ten diagnostics while falling back to empty accounts. This result does not establish a fully enriched or remote-state-backed analyzer run.

The historical `NATIVE_QUALIFICATION_20261118.md` remains unchanged. This separate addendum records the eventual result of existing exec session **48839**; no new campaign was launched during read-only result collection. The session's completed exit 0 was collected at **2026-11-18 15:09:10 UTC**.

## Source and completed result

Inputs remained unchanged from **`ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`**, contracts tree **`a84815152b8f07c854197c84b5613b02f7939882`**. A post-completion comparison of `packages/contracts` and `scripts/recovery` against that revision succeeded. Later vault/documentation changes are outside this native scope.

| Harness | Completed calls | Safety properties reported passing | Required reachability canaries falsified | Auxiliary Slither failures | Empty-account diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: |
| EchidnaRouter | 300,000 | 4 | 4 | 1 | 5 |
| EchidnaSweep | 300,005 | 4 | 2 | 1 | 1 |
| EchidnaPolicy | 300,020 | 5 | 5 | 1 | 4 |
| **Total** | **900,025** | **13** | **11** | **3** | **10** |

The canaries are intentionally required to falsify, proving the intended paths are reachable. The runner accepted the ordinary properties' `passing` spelling only after checking the completed call budget and inventory. There were no runner-generated `::error::` markers. That narrower observation does not mean the analyzer output contained no warnings or errors.

Raw completed log: `combined-echidna-227.log`, **128,135 bytes**, SHA-256 **`f3b4192d3295747cc0973adaa6df6e70f349e33cd90387c3875c2e0aefb16be7`**. The JSON companion retains each property result, all ten diagnostic lines, source object identities, exact environment and wrapper checksum.

## Exact existing invocation and retained budgets

Working directory: `/workspace/scratch/4fa14be12559/GhostPay/packages/contracts`.

```sh
env PATH="/workspace/scratch/4fa14be12559/toolchain-probe/echidna-single-thread/bin:/workspace/scratch/4fa14be12559/toolchain-probe/bin:/workspace/scratch/4fa14be12559/toolchain-probe/slither/bin:$PATH" \
  FOUNDRY_SOLC=/workspace/scratch/4fa14be12559/toolchain-probe/bin/solc \
  FOUNDRY_PROFILE=default \
  FOUNDRY_OUT=/workspace/scratch/4fa14be12559/toolchain-probe/echidna-out \
  FOUNDRY_CACHE_PATH=/workspace/scratch/4fa14be12559/toolchain-probe/echidna-cache \
  GHCRTS=-N1 RAYON_NUM_THREADS=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  timeout --signal=TERM --kill-after=15s 100m \
  bash scripts/run-echidna.sh
```

The isolated wrapper executes the verified Echidna binary with `--workers 1` and forwards the original arguments. Echidna **2.2.7**, Foundry **1.8.5**, solc **0.8.28**, crytic-compile **0.4.2**, and installed Slither **0.11.6** were used. The unchanged configuration retains property mode, **300,000 calls per harness**, sequence length **20**, shrink limit **2,000**, and seed **20261021**. Only worker/runtime concurrency was reduced. The outer **100-minute** timeout matches the workflow window and did not fire.

## Auxiliary Slither failure: material limitation

Each harness reported **“Running slither failed”** and warned that fuzzing could be less effective. In pinned Echidna 2.2.7, `runSlither` invokes `slither --ignore-compile --print echidna --json -`; a failing subprocess yields empty Slither guidance and the campaign continues. That guidance normally includes constants, function relationships, payable/constant-function information and related metadata. The campaign therefore lacks that enrichment. [Pinned Slither integration source](https://github.com/crytic/echidna/blob/e871c88b08a906b513f820c93a77610a56ae00bb/lib/Echidna/SourceAnalysis/Slither.hs).

**Strong source-based explanation, not a reproduced traceback:** the isolated compiler output protected the coordinator's root artifacts. However, installed crytic-compile 0.4.2 does not load Foundry configuration on its `--ignore-compile` path and defaults to the root `out/build-info` directory unless given a directory override. The existing root file contains only `id`, `source_id_to_path` and `language`; it lacks the full compiler `input`, `output` and version data required by the parser. The isolated `echidna-out/build-info` contains those complete fields. The retained Echidna log does not disclose the exact subprocess exception, so the cause is an inference from source and artifact inspection. No scanner was rerun to test this explanation, and no running command, artifact layout or gate was changed.

The independently completed **standalone Slither gate**—34 contracts, 64 detectors, zero retained results under the unchanged CI filters—remains a separate result. It does not restore the missing guidance to this Echidna campaign.

## Unconfigured RPC diagnostics: offline empty-account fallback

Pinned Echidna `Exec.hs` distinguishes an available RPC URL from an absent URL. For these absent-URL contract queries it logs the diagnostic, caches the absence and resumes execution with `emptyAccount`. `Types.hs` defines that account using empty runtime code. The missing-URL branch does not perform a configured network request. [Pinned execution source](https://github.com/crytic/echidna/blob/e871c88b08a906b513f820c93a77610a56ae00bb/lib/Echidna/Exec.hs); [empty-account definition](https://github.com/crytic/echidna/blob/e871c88b08a906b513f820c93a77610a56ae00bb/lib/Echidna/Types.hs).

Router's five addresses match its synthetic `0xA0000`–`0xA0003` recipients and `0xFEE0000` fee recipient. Policy's three recipient addresses match its `0xD0001`–`0xD0003` constants. Both signature-using harnesses also emitted a query for `0x1`; a call stack identifying the precise origin is not retained. The shared `echidna.yaml` configures no RPC URL. These observations explain the offline fallback model and preserve its limits: they are not evidence of an external provider failure, nor do they validate interactions with unknown real deployed contracts.

## Gate interpretation and remaining scope

The unchanged repository runner validates process code, complete call budgets, property inventory and required canary outcomes. It does not reject these auxiliary-analysis warnings or empty-account diagnostics. **Record the completed runner result together with those limitations; do not relabel it as a diagnostic-free analyzer pass.** No source change, warning suppression, shortened budget, relaxed assertion or new analyzer campaign was performed during collection.

**Mythril's full five-target campaign was never started.** Its installation/version probe is the only local Mythril execution evidence. The coordinator reported an automatic possible-cybersecurity-risk interruption and narrowed this worker to existing-output observation. Visible retained tool logs do not identify the exact interrupted action or a more specific denial reason. This is neither a Mythril campaign result nor a pending launch by this worker.
