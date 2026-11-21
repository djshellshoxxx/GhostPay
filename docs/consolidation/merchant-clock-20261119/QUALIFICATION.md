# Merchant verification-clock qualification

## Result and source

Local product `c4a6e5eab6f2ae4ae644433e557676cfb223c5a8` preserves original PR #268 `ddfc8cfafa44b09103ced821f160c1d37fdfe552` ancestry and its exact two product blobs. Base is `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33`; claim `35658b7ff7ffe509c1a7b0a20b1e670cb43b14f3` was committed before edits. The guard rejects nonfinite, negative or runtime nonnumber verification clocks using the existing `format` result before parsing or signature verification. Finite nonnegative/fractional clocks and the exact expiry boundary retain their prior behavior.

Only `merchantProfile.ts` and its test change outside documentation. The sole merge conflict was the claims registry: the exact 971-byte upstream claim prefix was added while retaining every one of the candidate registry's 127,304 bytes. No configuration, dependency, signing format or adjacent feature source changes.

## Executed checks

All commands ran serially with Node 22.23.4 and a 384 MiB heap. Tests used the unchanged invoice-schema Vitest configuration. Exact commands, source pins, log hashes and byte sizes are in `receipt.json`.

| Check | Actual result |
| --- | --- |
| Exact upstream regression on unchanged production baseline | 8 tests: 7 passed, 1 expected failure; 1.28 s Vitest duration, exit 1 |
| Merchant profile, JSON, schema, signing and receipts tests on product | 5 files, 208 tests passed, 0 failed, 0 skipped; 9.74 s, exit 0 |
| Entire invoice-schema package TypeScript no-emit check | Exit 0, 9.460 s |
| Entire invoice-schema src typed ESLint, unchanged rules | Exit 0, 19.538 s |
| Original invoice-schema package TypeScript build | Exit 0, 2.871 s |
| Product staged diff whitespace check | Exit0 |

The RED loop is one failing Vitest case, not five independent failures. It failed because `NaN` returned an accepted valid signed profile. The identical regression passes after the guard. Existing signed-profile mutation/signature/expiry checks and the other four files pass unchanged.

## Independent review

`privacy_completion` independently pinned `c4a6e5eab6f2ae4ae644433e557676cfb223c5a8`, checked original upstream ancestry, exact blobs and SHA256 values, the unchanged configuration, preserved claims, and raw RED/GREEN logs. No introduced source blocker was found. Review did not rerun tests; execution belongs to `branch_recon`.

## Limits and next step

This is a conditional public-API clock-validation defect, with no established production exploit, remote clock control or signing bypass. The full package coverage script, full workspace, web/browser and release gates were not executed here. Coverage thresholds remain 95/90/95/95; they were neither changed nor claimed satisfied. Root owns final merge, invoice-schema rebuild, compiled-input verification and consumer/hosted qualification.

The two gzip logs decompress exactly to the raw original logs; compression preserves trailing whitespace. Empty compiler logs are normal successful no-diagnostic output; command exit status and timing are recorded separately. The environment interruption happened before the claim and repair, and is not a passing test or build attempt.
