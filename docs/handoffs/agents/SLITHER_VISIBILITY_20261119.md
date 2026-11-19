# Full-severity Slither visibility — 2026-11-19

Requirement: SEC-17 reporting visibility; selectively recovered from the
historical PR #209 source `08c26b12`. Base:
`f3c38f3f3208637eb5673ed9ace2e6975d1a2719`.

## Change

The existing nightly Slither job now preserves a second report containing Low,
Informational and ignored findings. JSON and Markdown artifacts are retained for
30 days, and a severity-count summary is written to the job summary. The report
runs after a failed gate unless the workflow was cancelled, so a gate failure
does not hide its supporting findings.

The original required command remains unchanged:

```sh
slither . --filter-paths "lib|test|script" --fail-medium --exclude-informational --exclude-low
```

The reporting invocation uses `--fail-none` only to collect its findings. It does
not replace or change the gate above, and neither step is marked
`continue-on-error`. Installation, analysis or artifact errors still fail the
job. No workflow trigger, schedule, job permission, timeout, unrelated job,
finding suppression, release policy or deployment behavior changes.

## Actual qualification and remaining acceptance

- YAML parsing and `bash -n` for every Slither shell block pass. Structural
  comparison with the base confirms the original gate and all workflow content
  outside the existing Slither steps are unchanged.
- All 114 action references are pinned to full commit hashes.
- The official PyPI wheel for the already-pinned `slither-analyzer==0.11.6`
  was downloaded and its published SHA256 verified. Its source defines
  `--fail-none`, `--show-ignored-findings`, `--checklist` and `--fail-medium`.
  This was archive inspection, without package installation or execution.
- A complete Slither campaign was not executed locally. Hosted execution must
  still establish that this source compiles, the unchanged gate passes, and both
  report files are produced and uploaded successfully.

This change closes a source-wiring gap. It does not approve any findings, count
an incomplete analyzer campaign as successful, or close the broader SEC-17
analyzer/disposition requirement. Mythril, Echidna and finding disposition remain
with the contract-security owner. Exact workflow hashes and pinned-package
provenance are in `evidence/slither-visibility-20261119/`.
