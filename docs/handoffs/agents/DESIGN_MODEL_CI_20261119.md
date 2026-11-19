# Experimental design-support model CI coverage — 2026-11-19

Base: `fe7a598d589057c139ef0f823fa02b7c0cc38e04`.
Worker: `backlog_ci`; independent source reviewer: coordinator.

## Existing gap and change

The existing `rest-0` Node invocation runs five script-test globs. Neither
existing experimental model test file matches those globs. This change appends
exactly these two files to that invocation:

- `scripts/experimental/milestone-escrow/model.test.mjs`
- `scripts/experimental/policy-recovery/model.test.mjs`

All five previous globs, the shard condition, test commands, workflow triggers,
permissions, timeouts and other steps remain unchanged. No model, assertion,
product source, dependency or release gate changed.

These are design-support models with explicit assumptions and candidate
authority choices. Running their tests in CI does not implement fund control,
approve either model for product use, activate recovery, close specification 17
or a future authority decision, or establish contract/deployment acceptance.

## Actual qualification

Before editing CI, the two existing suites ran on Node 22.23.4 with a 512 MiB
heap: **38 passed, 0 failed, 0 skipped**. The test files and their model sources
remain byte-identical to the base. The recorded source hashes therefore identify
the same models now selected by CI.

YAML and shell syntax checks pass. Structural comparison confirms that the only
workflow change is the one existing invocation plus its explanatory comment;
its arguments retain every prior pattern and add only the two exact paths.
All **114** action references remain pinned. The repository secret scan and
`git diff --check` pass. The coordinator independently reviewed the exact CI
SHA256 `29332ecaa8fa160df5d6dd1ff771c35c12f4e6989ec74ae8705522e0aa117a26`
and reported **PASS**.

Commands, complete model output, source hashes and structural-check results are
in `evidence/design-model-ci-20261119/`. The full `rest-0` aggregate was not rerun
locally for this selection-only change; exact combined hosted qualification
remains required. No remote publication, deployment or release was performed by
this worker.
