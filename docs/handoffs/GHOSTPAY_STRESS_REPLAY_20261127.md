# GhostPay November 27 stress replay and runner repair

Date: 2026-11-28 UTC (November 27 Pacific)

Base/source: `b890a76603b924829fdbe2b4fb2c5626f0cf4e36`

Task branch: `fix/stress-runner-volume-crash`

## Scope and source

The source was current `main`, verified before editing. The reproduction inputs came from `GhostPay_Stress_Test_Evidence_2026-11-27.zip` (SHA-256 `45086b502ed44d09eecaaa45e9f1508fe411ad42b87bcdf2033024cf8c6edd60`). The repository's stop-work directive allows separately scoped payment/recovery maintenance; this task changes no stopped product, payment behavior, backup format, E2E assertions, keystore cost, or dependency.

The six journeys are the two backup ownership cases (`backup-ownership.spec.ts:121,158`), native payment/verified receipt/sweep/restore (`core-journey.spec.ts:493`), reorg invalidation (`core-journey.spec.ts:698`), independent keystore restore (`independent-keystore-recovery.spec.ts:101`), and duplicate request-file prevention (`payment-request-file-attempt.spec.ts:62`). The native six-tab journal harness is retained at `scripts/stress/journal-tabs.mjs`.

## Finding 1 — intermittent Chromium crashes

The provided original mixed run completed 50 cases successfully and recorded 4 Chromium page/target crashes among 54 scheduled cases. The four were the export-cancel-retry case, native payment/recovery, reorg invalidation, and duplicate request-file case. Each stopped before final assertions. Firefox and WebKit passed 18/18 each. Later Chromium comparisons passed 54/54 across one-worker, two-worker, and overlapping two-worker configurations. These later passes do not explain or clear the original failures.

The initial crash capture did not retain browser stderr, the last completed Playwright step, a renderer dump, or per-process resource samples. The provided browser record identifies Playwright `1.64.1`, Chromium `143.0.7499.0` (older than that Playwright installation's pinned build), Firefox `157.0`, and WebKit `27.2`. It does not identify the Chromium executable path or pinned revision.

This work adds a runner that records the configured executable path and `--version` output, Playwright version, sanitized browser stderr, and Linux process-tree RSS/virtual-memory samples every two seconds. Its per-case JSONL record includes the last completed Playwright step/API action and classifies page-crash or browser-disconnect failures without copying raw exception messages. Diagnostics redact wallet-like hex strings and common secret fields. The runner forces `--retries=0` even if a caller supplies a retry override. The configured executable paths allow comparing the old and pinned Chromium builds against the same `apps/web/dist` artifact.

**Cause remains unresolved.** This environment cannot execute the browser replay with the repository's pinned tools: `apps/web/package.json` requires Playwright `1.64.1`, while the only runtime-resolvable Playwright package is `1.62.1`; the runner records the mismatch and refuses to proceed. `/usr/bin/chromium` is a Debian wrapper whose `/usr/lib/chromium/chromium` target is absent. The runtime's pinned Chromium, Firefox and WebKit paths are absent too. The workspace had 948 MiB free after the diagnostic probe. Therefore no before/after browser run, browser version comparison, app build, or payment/recovery acceptance run is claimed here. The browser matrix requested for this task remains incomplete: 72 journey executions (54 engine-matrix runs plus 18 Chromium overlap-repeat runs) were not started in this environment.

For the next equipped host, keep retries at zero and use one built artifact for the executable comparison:

```sh
suite='a request file cannot re-pay|keystore from a closed browser profile|backup verification owns|export owns the controls|core journey: keys|payment block is replaced'

# First executable builds the lean fixture once; later invocations reuse the same dist.
GHOSTPAY_RESULTS_DIR=/fast/ghostpay-stress/old-chromium \
GHOSTPAY_CHROMIUM=/path/to/chromium-143 \
node scripts/stress/run-browser.mjs --project=chromium --workers=1 --repeat-each=3 --grep "$suite"

GHOSTPAY_REPLAY_BUILT=1 \
GHOSTPAY_RESULTS_DIR=/fast/ghostpay-stress/pinned-chromium \
GHOSTPAY_CHROMIUM=/path/to/playwright-pinned-chromium \
node scripts/stress/run-browser.mjs --project=chromium --workers=1 --repeat-each=3 --grep "$suite"
```

Then run all engines and the overlapping journal workload, retaining the same build, mock wallet, local RPC, synthetic profiles, keystore cost, two workers, and retries disabled:

```sh
GHOSTPAY_REPLAY_BUILT=1 GHOSTPAY_RESULTS_DIR=/fast/ghostpay-stress/matrix \
node scripts/stress/run-browser.mjs --workers=2 --repeat-each=3 --grep "$suite"

GHOSTPAY_REPLAY_BUILT=1 GHOSTPAY_RESULTS_DIR=/fast/ghostpay-stress/chromium-overlap \
node scripts/stress/run-browser.mjs --project=chromium --workers=2 --repeat-each=3 --grep "$suite" &
browser_pid=$!
node scripts/stress/journal-tabs.mjs .
wait "$browser_pid"
```

Each run's `cases.jsonl`, `browser-metadata.jsonl`, `browser-stderr.log`, and `process-resources.jsonl` are scoped under `GHOSTPAY_RESULTS_DIR`. Use separate result directories on a volume with known free space for the browser-build comparison.

## Finding 2 — full results volume

The original preliminary one-worker comparison stopped with `ENOSPC while creating test artifact directory`; 7 passes and 2 failures were visible, with 9 of 18 scheduled executions unrun. The evidence notes that results were not preserved incrementally.

The new reporter writes and fsyncs one sanitized JSONL record after each completed test. `GHOSTPAY_RESULTS_DIR` selects the output directory. A write error is retained as a runner failure; the reporter stops writing to the full volume, continues counting completed cases, writes progress/summary to stderr, and returns a failed run status. The summary separates total, completed, passed, failed, skipped, and unrun counts.

Regression evidence from the committed reporter test injects `ENOSPC` on the fourth case write: the first three JSONL records remain readable, four test callbacks are counted as completed (three passed and one failed), two tests remain unrun, stderr reports `completed=4, failed=1, unrun=2`, and the reporter returns `status: failed`. The normal-path test writes all three cases and reports one pass, one failure, one skip, and zero unrun. Secret-field test values are absent from JSONL output.

## Validation and outstanding gates

- Passed: `node --check` for `redact.mjs`, `reporter.mjs`, `run-browser.mjs`, and `journal-tabs.mjs`.
- Passed: `node --test scripts/tests/stress-replay-runner.test.mjs` (4 passed, 0 failed, 0 skipped).
- Passed: `git diff --check`.
- Not run: npm install/CI, TypeScript config loading, application build, Chromium/Firefox/WebKit, local RPC/Anvil, and six-tab overlap. Native browser validation is blocked by the missing binaries/dependencies and available storage described above.
- Open PR inventory at discovery: 147 open PRs. #753 edits the shared Playwright config, which this change leaves untouched; #309 is historical stress/QA documentation; #373 is native-browser qualification. No existing active-work entry claims the new `scripts/stress/**` paths. Refresh changed-file ownership before PR updates.
- Integration lock was released at generation 77. This PR is scoped to test tooling and evidence; no lock or merge is requested while the browser qualification is incomplete.
