# Beta acceptance log artifact capture — 2026-11-18

## Change and source

The existing beta-acceptance artifact upload now sets `include-hidden-files: true` for its unchanged
`scripts/beta/.state/*.log` path. This makes the retained logs eligible for upload despite their hidden
parent directory. No script or application behavior changes.

- Branch: `chatgpt/ghostpay-beta-log-artifact-20261118`.
- Base: main `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Workflow source commit: `05a3b45bda60d18a6922c0897d48bd8984bad377`.
- Worktree: `/workspace/scratch/fb6d03ffb806/beta-log-artifact`.
- Changed workflow: `.github/workflows/beta-acceptance.yml`.
- Remaining changed paths: this handoff and the worker's `docs/ai/ACTIVE_WORK.md` claim.

## Confirmed cause

[Beta acceptance run 44279444368, job 134715943959](https://github.com/djshellshoxxx/GhostPay/actions/runs/44279444368/job/134715943959)
checked out `644a43ee6366298f418a0aca5a40ecf974871748`, the merge of #222 head
`2bc2098298d90928eb1acafad969f28316bb05fc` into `5467c158069c5bab264b6a653ac56e89e13f3e13`.
The acceptance script printed its retained `scripts/beta/.state/acceptance-20261118T130426Z.log` path.
The upload action then reported `include-hidden-files: false` and found no files at
`scripts/beta/.state/*.log`. The step warned and succeeded without uploading an artifact.

The pinned action is `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2).
Its exact sources confirm the filter:

- [action.yml](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml)
  defaults `include-hidden-files` to `false`.
- [src/upload/input-helper.ts](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/src/upload/input-helper.ts)
  reads the boolean input.
- [src/shared/search.ts](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/src/shared/search.ts)
  passes `excludeHiddenFiles: !includeHiddenFiles` to its glob search.
- [README, Uploading Hidden Files](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/README.md#uploading-hidden-files)
  defines files within dot-prefixed directories as hidden, even when the filenames themselves are not.

The workflow and the inspected acceptance/devnet cleanup scripts are identical between main and #222.
`scripts/beta/acceptance.sh` writes `acceptance-<UTC>.log` and `build-<UTC>.log` under its own `.state`
directory. Its exit trap removes the temporary manifest backup and calls devnet cleanup; it does not remove
those logs. `scripts/devnet/lib.sh` gives devnet cleanup a separate `scripts/devnet/.state` directory, and
`down.sh` removes its PID/state JSON, generated manifests and deployment broadcasts. Therefore the missing
artifact is caused by hidden-file filtering, not deletion of the beta logs.

## Scope preserved

The workflow diff adds exactly one input line to the existing upload step. The path remains the exact
`scripts/beta/.state/*.log` pattern; devnet/state JSON, manifest backups, private fixture outputs and
broader hidden paths are outside that log glob. Artifact name `beta-acceptance-log`, seven-day retention,
`if: always()`, `if-no-files-found: warn`, pinned actions, read-only permissions, triggers, concurrency,
acceptance commands and all existing gates remain unchanged. No dependency, cache, infrastructure,
release or deployment setting is changed.

## Verification and limits

At workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377`:

| Command / check | Actual outcome |
| --- | --- |
| `node --test scripts/tests/workflow-files.test.mjs scripts/tests/workflows.test.mjs` | Exit 0; 6 tests passed, none failed or skipped. |
| `npm run ci:check-actions` | Exit 0; all 111 action references are pinned to full SHAs with version comments. |
| `git diff --check` | Exit 0. |
| Source comparison with main | One workflow input line changed; log writers and cleanup scripts untouched. |
| Pinned upstream source review | Confirms default exclusion and the exact option that enables the existing hidden-directory path. |

No bespoke test was added for this low-impact setting. No application build, dependency installation,
acceptance rerun, artifact upload, browser execution or new infrastructure was performed. Local checks and
source review cannot prove a hosted upload completed; the next normally triggered exact-head workflow must
confirm that `beta-acceptance-log` exists and contains the expected logs. Failures before any log is created
can still produce the existing missing-file warning.

The original run remains **failed** because of its separate receipt fixture assertion. This artifact repair
does not change that result or qualify the pending #233 fixture repair. The source-pinned raw job log and
triage snapshot are available under the session scratch root as
`pr222-beta-acceptance-134715943959.log` and `pr222-beta-acceptance-review.json`.

The coordinator independently reviewed exact workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377`
and found no blocking issue; the sole input change and preserved upload scope/gates were confirmed.
The privacy reviewer independently fetched the same pinned upstream action sources and inspected the
writers, cleanup and unchanged glob at that exact workflow source; no blocking finding. These are source
reviews, without additional test execution or a hosted-upload claim.

Recheck current main and overlapping
workflow changes, preserve this one-line scope, and require fresh exact-head CI. No remote mutation,
deployment or workflow rerun was performed by this worker.
