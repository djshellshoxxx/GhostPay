# GhostPay final hosted-gate snapshot R2

**No reviewed candidate is ready for promotion. PR #326 now has two failed browser jobs; every candidate also retains pending hosted work.** The earlier snapshot remains unchanged.

The latest-check reads below span **2026-11-20T19:32:20.269Z to 2026-11-20T19:32:21.107Z**. Source/base guards were re-read through **2026-11-20T19:35:47.585Z**. Failure-log and baseline follow-up reads are recorded separately in [hosted-gate-final-r2.json](hosted-gate-final-r2.json). This is a dated snapshot, not an ongoing monitor.

## Checks attached to the exact source heads

| PR | Head | Passed | Queued | Running | Failed | Conditional skips | Returned checks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) | `2876b7db` | 21 | 15 | 0 | 0 | 3 | 39 |
| [#321](https://github.com/djshellshoxxx/GhostPay/pull/321) | `87c3bf5a` | 14 | 19 | 1 | 0 | 3 | 37 |
| [#325](https://github.com/djshellshoxxx/GhostPay/pull/325) | `1788f1e0` | 11 | 20 | 0 | 0 | 3 | 34 |
| [#326](https://github.com/djshellshoxxx/GhostPay/pull/326) | `a34ce43e` | 8 | 20 | 0 | 2 | 4 | 34 |
| [#327](https://github.com/djshellshoxxx/GhostPay/pull/327) | `9608ec99` | 2 | 4 | 1 | 0 | 1 | 8 |
| [#328](https://github.com/djshellshoxxx/GhostPay/pull/328) | `81598d93` | 0 | 10 | 3 | 0 | 1 | 14 |
| [#329](https://github.com/djshellshoxxx/GhostPay/pull/329) | `cff631b5` | 0 | 7 | 3 | 0 | 1 | 11 |
| [#331](https://github.com/djshellshoxxx/GhostPay/pull/331) | `f5e04a30` | 0 | 11 | 0 | 0 | 1 | 12 |
| [#333](https://github.com/djshellshoxxx/GhostPay/pull/333) | `3172a93c` | 0 | 8 | 0 | 0 | 1 | 9 |
| [#334](https://github.com/djshellshoxxx/GhostPay/pull/334) | `9dcd2d88` | 0 | 13 | 0 | 0 | 1 | 14 |
| [#335](https://github.com/djshellshoxxx/GhostPay/pull/335) | `e31a0905` | 0 | 8 | 0 | 0 | 1 | 9 |

Snyk classic status succeeded on all eleven heads. That result covers the returned classic status context and does not summarize GitHub Actions. No other failed, canceled, timed-out, action-required or stale check conclusion was returned. Check, workflow and classic-status collections each fit one complete 100-item page for every head, with returned totals verified.

## Workflow-level results

| PR | Successful workflows | Queued workflows | Running workflows | Failed workflows |
| --- | ---: | ---: | ---: | ---: |
| #307 | 7 | 1 | 0 | 0 |
| #321 | 5 | 1 | 0 | 0 |
| #325 | 5 | 1 | 0 | 0 |
| #326 | 2 | 1 | 0 | 2 |
| #327 | 0 | 3 | 1 | 0 |
| #328 | 0 | 6 | 0 | 0 |
| #329 | 0 | 5 | 0 | 0 |
| #331 | 0 | 6 | 0 | 0 |
| #333 | 0 | 5 | 0 | 0 |
| #334 | 0 | 6 | 0 | 0 |
| #335 | 0 | 5 | 0 | 0 |

Run-level status and individual job status are retained as returned; the APIs are non-atomic. **The final `typescript` and `contracts` aggregates are absent from every current check list.** Those jobs depend on the remaining CI groups, so observed check totals are not final expected gate totals. No candidate can be qualified from a partially instantiated list.

Since the earlier snapshot, #307 completed `e2e (lean)`, `ts-test (btc-silent-payments)`, `contracts-coverage`, `contracts-slither`, and the payer-hiding contracts extra job successfully. Its full browser job and other CI work remained queued in this snapshot. #325 now has successful Pages, Beta acceptance, Hosting, CLI and Tor workflows, while its general CI remains pending. These actual successes remain distinct from missing aggregate results.

## PR #326: executed browser failures

The failed jobs are associated with PR source **`a34ce43e296e302e3e65ed077ea8ac892c5189a1`**. Both checkout logs identify the actual tested GitHub synthetic merge **`adbcec37c3f589e9b1a0cc6ee419193ce90d355e`**, merging that source into required-v1.1 **`8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`**.

### Pages artifact journey

[Job 136457928140](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154719/job/136457928140) passed setup, workspace-library build, Foundry build and Chromium installation. Its **Pages artifact journey on anvil** step then failed with **6 tests passed, 5 failed and 5 did not run**. All five failures timed out at `apps/web/e2e/devnet/ui.ts:48` waiting for:

```text
getByRole('button', { name: 'Prepare payment' })
TimeoutError: locator.click: Timeout 30000ms exceeded.
```

The preceding driver lines click Continue and Connect. The failing cases cover the main buyer flow, same-nonce cancellation, unavailable RPC, wallet rejection and expiry. The five unexecuted cases are recorded as “did not run,” not successful or newly waived tests.

### Beta acceptance

[Job 136457926770](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154517/job/136457926770) also completed setup, compilation and Chromium installation. Its acceptance summary records **PASS lib (5s)** and **PASS cli (55s)**, followed by **FAIL browser exit=1 (109s)**. All three browser cases failed. Two hit the same Prepare payment timeout; the third failed at `devnet-journey.spec.ts:303` because the expected wrong-chain message was not visible:

```text
Your wallet is on chain 31337 but this invoice requires chain 84532.
```

These are actual browser assertion failures. They are not an installation failure or a completed browser pass. Root has assigned a separate corrective successor; that work and its hosted qualification must retain their own source pins. The original #326 jobs remain failed.

### Baseline attribution and preserved logs

A complete read of the exact required-v1.1 base at 19:33:50 UTC returned **zero check runs and zero workflow runs**. Consequently no same-base execution is available to establish that the failure also executed on that base. Shared source inspection and root-cause remediation are handled by the separate source-review worker.

Both complete decoded job logs are embedded losslessly in the JSON report as gzip/base64, with original UTF-8 byte counts and SHA-256 hashes. Decode base64, decompress gzip, then verify length and hash. Their round trips were checked. Job steps, outcomes, timestamps, source head and actual merge checkout are retained alongside them.

## Conditional skips, source identities and coordination

The common Pages workflow runs PR validation without publishing. The release gate requires manual dispatch on main with deploy enabled; deploy requires `publish=true`, and smoke depends on deploy. Their observed skips are intentional. The v1.1 workflow used by #326/#327 adds a publishing-only checksum-attestation job; #326 therefore correctly has four conditional skips. None substitutes for the failed browser steps or pending CI. Exact workflow blobs and conditions are retained in JSON.

All eleven heads and bases remained stable across the initial and final metadata reads. Ten matched earlier coordinator pins. #334 had no earlier pin in this reviewer input; root subsequently confirmed source `9dcd2d88` unchanged, and its initial/final reads match. All PRs remain open drafts; GitHub reported no merge conflict, which is not qualification.

Main remained **`aa3df1cb37274fae73af0ca957183c15c51b62d3`**. The control ref remained **`849b20733e6fd396a1ed354b284335019500946b`**, recording **released generation 8**, released at **`2026-11-20T17:42:33.000Z`**. The state was read from the matching immutable object after the remote ref was verified. Lease identifiers were redacted in memory and were never printed or written. No lease operation occurred.

Required-check protection was not enumerated: the earlier 403 remains unresolved, and empty rulesets do not prove absence of protection. No queue reason is inferred from pending status. Promotion requires a fresh, complete check of applicable gates and source/base identity, followed by the existing coordination procedure.

This reviewer performed read-only GitHub/source inspection and wrote evidence only. No source/ref/PR mutation, CI rerun or cancellation, dependency installation, runtime test, build, browser execution or deployment was performed. The original snapshot files were hash-checked and preserved.
