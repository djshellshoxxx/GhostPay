# Original-gate resource investigation

This record explains execution changes without weakening acceptance. Runtime is Node 24.22.3 with locked Vitest and `@vitest/coverage-v8` 5.1.0. No dependency, test configuration, pool, isolation, assertion, coverage include/exclude set or threshold was changed.

## Observed failures

- Exact standalone-v1 source `573901ee1c66624e57143526571a3fd76f52f264`: original complete coverage selection with one worker and a 768-MiB Node heap was terminated by SIGKILL after 267.36 seconds. It emitted no aggregate test summary; no test count is inferred from it.
- A materially different full retry explicitly selected the default progress reporter and limited coverage processing to one operation. It was terminated after 96.20 seconds, after six complete file summaries totaling 386 tests. That partial observation is not a passing full-suite result.
- Original complete typing and typed lint have also been terminated at several heap budgets. A bounded 1024-MiB typing attempt emitted an actual V8 heap-exhaustion report. SIGKILL alone does not prove which process or aggregate memory limit was responsible for every other termination.

The coordinator runs heavy commands serially. Node heap budgets are recorded per invocation; they are execution limits, not changed TypeScript or ESLint rules. Repeating a killed command unchanged is not additional qualification.

## Installed runner findings

Independent read-only investigation by `/root/coverage_execution_research` inspected the installed implementation and official [Vitest sharding documentation](https://main.vitest.dev/guide/features#sharding) and [performance guide](https://main.vitest.dev/guide/improving-performance#sharding).

`--maxWorkers=1` limits test workers, but coverage processing has a separate default that evaluated to nine on this host. `--coverage.processingConcurrency=1` limits raw coverage reads and source-remapping batches. It does not change the selected tests or the original thresholds: statements 90%, branches 85%, functions 90%, lines 90%.

Native sharding divides complete files. At the pinned v1 source the original selection contains 286 covered-test files and a separate four-file `.nocov` pass. Blob reports can preserve recorded test outcomes and coverage maps for the native final merge. The merge checks Vitest version consistency, but source identity and complete shard accounting remain the coordinator's responsibility.

### Why blob-only output is not a shortcut

In the installed 5.1.0 execution path, each initial shard generates coverage with `allTestsRun=true`, including untouched source files from the unchanged coverage include set. It then supplies the map to reporters, writes the blob, generates configured coverage reports and evaluates the original thresholds. A blob file can therefore exist before reporting finishes. Blob existence alone is not a completed shard or a passing gate.

Every partial shard may exit 1 for failing the full thresholds. That raw exit must be retained. Tests, worker errors, completeness and final reporting must be inspected separately; a killed or failed shard cannot be treated as an expected threshold failure.

### Feasibility checkpoint and complete-suite strategy

One native 32-way shard completed 77/77 cases in nine files, then exited 1 solely for the unchanged partial-coverage thresholds. Its total duration was 21.54 seconds; the raw log and receipt are retained. This establishes that a smaller complete batch can run, not that the full coverage gate passed.

The coordinator then selected eight serial shards for the complete original suite. Fewer blobs reduce native merge memory, while each batch still resets the main test process. The run freezes source/tree and configuration/lockfile hashes, retains raw exits/logs, validates recorded task states and nonempty coverage, and accounts for every original file exactly once before attempting the native merge. Results, including any early stop, are recorded separately in `README.md` and `evidence.json`.

## Exact native command shape

All commands run from `apps/web` on the frozen source. Each shard has a unique blob filename and coverage-report directory outside the repository. The blob directory contains only intended blobs; logs and receipts remain outside it because native merging reads every directory entry. Original coverage cleanup cannot delete the blobs.

```bash
NODE_OPTIONS=--max-old-space-size=768 DEBUG=vitest:coverage \
../../node_modules/.bin/vitest run --config vite.config.ts \
  --maxWorkers=1 --shard=INDEX/8 \
  --coverage.enabled --coverage.processingConcurrency=1 \
  --reporter=default --reporter=blob \
  --outputFile.blob=FRESH_RUN/blobs/shard-INDEX.json \
  --coverage.reportsDirectory=FRESH_RUN/coverage/shard-INDEX
```

Only after all eight source-matched shards finish and the recorded file union equals the 286-file frozen manifest may the native merge run:

```bash
NODE_OPTIONS=--max-old-space-size=768 \
../../node_modules/.bin/vitest run --config vite.config.ts \
  --merge-reports=FRESH_RUN/blobs \
  --coverage.enabled --coverage.processingConcurrency=1 \
  --coverage.reportsDirectory=FRESH_RUN/coverage/merged \
  --reporter=default --reporter=json \
  --outputFile.json=FRESH_RUN/merged-tests.json
```

The final merge must exit zero, contain the complete original test inventory without failures or unhandled errors, and satisfy all four original thresholds. Recorded skips require explicit accounting against original source. The original `.nocov` command remains an independent required pass; merge reporting does not execute tests again.

Native merging loads all blob maps/graphs in parallel and can itself exceed available memory. It rejects the blob reporter, so no native hierarchical merge-to-blob shortcut is claimed. No threshold override, blanket exit suppression, added exclusion, changed pool or disabled isolation is used here.

## Installed implementation references

| Installed file | Functions inspected |
| --- | --- |
| `node_modules/vitest/dist/chunks/index.Di8au7q4.js` | `BaseSequencer.shard`, `calculateShardRange`: root-relative file hashing and disjoint full-file ranges. |
| `node_modules/vitest/dist/chunks/cli-api.COfZo8lK.js` | `runFiles`, `generateCoverage`, `reportCoverage`: generation before run-end reporting, followed by report/threshold evaluation. |
| Same file | `BlobReporter.onCoverage/onTestRunEnd`: version, task results, errors, coverage and module graphs. |
| Same file | `readBlobs`, `Vitest.mergeReports`, `BaseCoverageProvider.mergeReports`, `reportThresholdViolations`: complete-directory loading, result replay, map merging and original threshold exits. |
| `node_modules/@vitest/coverage-v8/dist/provider.js` | `generateCoverage`, `generateReports`: untouched included files, configured reports and threshold checks. |
| `node_modules/vitest/dist/chunks/defaults.B1FCaFfh.js` | Independent coverage-processing concurrency default. |

This research is an execution-method assessment, not an executed passing coverage result. The coordinator's exact-source receipts are authoritative for actual outcomes.
