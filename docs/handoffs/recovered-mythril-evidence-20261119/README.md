# Recovered strict Mythril evidence backport

## Result

The scoped analyzer evidence backport is reconstructed from the preserved original PR #255 source and freshly qualified on **`bd05411b2a4c5b1b1793065bce1c10e0553cf952`**. All **54 dependency-free regression tests passed**, with **zero failures, skips or cancellations**, in 107.85 seconds. Nine syntax/diff checks also passed. This result covers the analyzer runner, its completeness observer, passive evidence capture and workflow evidence handling. It does not establish a native Mythril or Echidna pass.

## Source and recovery boundary

The isolated branch is `repair/ghostpay-analyzer-recovered-20261119`, based on published PR #278 `7b4c1554382b05ac3fab48527aadf596d6b1ff7b`. Upstream is PR #255 `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`. All eight recovered implementation/test files match the upstream Git blobs exactly; [source.json](evidence/source.json) gives every mapping. The current contract-analysis workflow changes by exactly five added lines: two test path triggers and a three-line conditional evidence-directory export. Newer workflow settings and all existing approval/release gates remain intact.

The prior executor lost its unpushed objects and artifacts. Historical identifiers `31f1f4ec` and `0bb11058` are provenance references only. No missing old files or old test logs are presented as recovered. This handoff contains newly executed qualification from the restored source.

## Security behavior retained

The runner continues analyzing the same five contracts with Solidity 0.8.28, the original optimizer/Cancun configuration, depth 3 and default 900-second budget. Nonempty findings, abnormal exits, malformed or duplicate-key reports, missing/invalid completeness evidence, hidden report exceptions and observed internal timeouts fail the strict gate. The wrapper observes the pinned analyzer interfaces without substituting successful results. Passive capture preserves report bytes, actual invocations and outcomes; campaign completeness is not a finding-clearance or analyzer-success verdict. Failed evidence remains failed, including in release metadata.

This backport excludes PR #255's policy/deployment/factory-acknowledgment and disposition-helper changes. No contract runtime, fee policy, browser application, dependency, analysis budget, security threshold, owner decision or release exception changes.

## Fresh regression evidence

Tests were committed first at `003c2bc7f57df4a243ec87f7ca112c6a3d2e8a5c`. The valid selected baseline run produced **9 failing regressions and 2 passing controls**. It demonstrates that the old gate can accept duplicate JSON keys or clean-looking output whose sidecar records missing completeness, internal timeout, hidden exception, logged error or no serialized report. The 11-case selection is not full-suite qualification.

The first diagnostic used a new mock against an old runner that does not set `MYTHRIL_COMPLETENESS_FILE`; the mock therefore failed before producing a valid control. That diagnostic is retained separately and is not defect evidence. For the valid baseline run, an unused temporary output path was supplied so the unchanged mock could emit its sidecar. The old runner never reads that file. No source, assertion or gate was changed to obtain the reproduction. Full GREEN uses the restored runner's own per-target telemetry handling.

Exact commands, source identity, return codes and tool versions are in [red.json](evidence/red.json), [green.json](evidence/green.json) and [syntax.json](evidence/syntax.json). Raw logs are losslessly stored as deterministic gzip files. [receipt.json](receipt.json) records compressed and decoded SHA-256 hashes.

## Reproduce the complete scoped suite

Use Node 22 (this execution: v22.23.5), Python 3.12.14 and jq 1.7. This suite uses offline executable analyzer fixtures; it needs no npm dependency installation and performs no native symbolic-analysis campaign.

```sh
node --max-old-space-size=128 --test --test-concurrency=1 \
  scripts/tests/mythril-runner.test.mjs \
  scripts/tests/mythril-completeness.test.mjs \
  scripts/tests/mythril-evidence.test.mjs \
  scripts/tests/contract-analysis-workflow.test.mjs
```

To independently reconstruct the source, restore only the eight paths listed in `source.json` from the exact upstream commit and apply the five workflow lines shown by the diff against the base. Do not merge the entire historical PR.

## Remaining qualification

The coordinator owns independent review, preservation/publication, semantic integration and fresh checks on the resulting candidate. Native Mythril/Echidna, full CI, browser acceptance, external review and all hosting/signing/owner gates remain separate. The GhostPay demonstration and testnet beta are **BLOCKED** until their actual mandatory requirements pass. No deployment, tag, release or promotion to main is claimed.

## Hosted CI observation for the earlier published candidate

The read-only snapshot at **2026-11-19 12:51:09 UTC** concerns PR #278 head **`7b4c1554382b05ac3fab48527aadf596d6b1ff7b`**, not this recovered analyzer implementation or later integrations. Main remained `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Nine Actions runs were queued/pending; sixteen jobs had no runner or executed steps and the Pages release-gates job was skipped by its deployment-only condition. No Actions success/failure was recorded. The successful legacy combined status reflected only the external Snyk status and does not establish complete CI qualification. The cause of the queue is unknown from this observation.

The preserved [live CI receipt](evidence/live-ci-7b4c1554.json) includes exact run/job URLs, source heads, dispositions and the limited critical-PR refresh. Its SHA-256 is `cb0acfb0ec5bd3bb4ac4fd6f5b82377f1189dcb19b53bb20583187b97cae652d` and is indexed in the main qualification receipt. No newer source qualification is inferred.
