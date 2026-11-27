# Bug repair: preserve checksum diagnostics across duplicate shared requests — 2026-11-27 UTC

## Scope and ownership
- Base main: `1b07cd7b0614a342cc2d1b2ea0238a952957eadb` (#748 merged). Prior parser owner released explicitly in [#748 integration handoff](https://github.com/djshellshoxxx/GhostPay/pull/748#issuecomment-7213490605).
- All 156 open PR file inventories checked immediately before #748 integration; post-merge date partitions 76 + 43 + 23 + 13 = 155, same inventory minus #748. No competing parser or new regression path. Preserve all other owners. Claim `692c17d0f12b849437ecb1aa7e37082ca8b17c1c`.
- Regression-first commit `6e7986dec9ea94defdd6498af9d7c8a06f49053a`; production fix `378c81c4e2a634a81fc07e588ce502b227c54413`. No archived product, dependency, contract, network, signing, funds, deployment or release change.

## Observed defect and fix
The share-target parser keys equivalent inputs by safe display, invoice fragment and payment label. Its unconditional map overwrite can erase an earlier mixed-case EVM input's `checksumUnverified` diagnostic when a later duplicate uses lowercase or uppercase. Canonical destination does not change. This was independently reproduced on complete native modules by [review 7210306424](https://github.com/djshellshoxxx/GhostPay/pull/748#issuecomment-7210306424) (4 of 8 retained), tracked separately in [7210544377](https://github.com/djshellshoxxx/GhostPay/pull/748#issuecomment-7210544377). That native review was of the preceding label repair, not this fix.

Preserve the previously flagged parsed record only when the later equivalent address-bearing record has no checksum warning. Do not change the identity key, safe display, fragment, label, amount, or canonical destination. The warning means a checksum was not verified, never that it was invalid or verified.

## Actual bounded verification
- Recomputed complete Git SHA-1 blob hashes from current main content: parser `0fed56340d3a759bdaad68399784d62b6027a596`, address module `a26dce85aa5a87b83a388e8fde09912dff88e551`; both matched remote blobs.
- Executed exact extracted map loop (two TypeScript annotations erased) and EVM address branch in isolated JavaScript with synthetic parsed records supplied to the classifier; no real addresses, network or wallet calls. Baseline **13/19**, proposed fix **19/19**. Six failures are mixed→lower, mixed→upper and unflagged→mixed→unflagged for both raw and payment URI records. Controls: reversed ordering, flagged/flagged, unflagged/unflagged, distinct labels/amounts/addresses, raw vs URI and duplicate invoice identity.
- Proposed source hash `30cd209628805ea78436beb2fca1d5e49297bcc8` matches published production blob exactly. The committed Vitest regression exercises actual full parser with these 19 cases, including canonical address, warning, label-safe display and invoice fragment warning; it has not been executed in native repository runner.
- `git ls-remote` failed with DNS resolution error for GitHub. Node 22.16.0 and TypeScript 5.8.3 available locally; no new native package test, repository build, typecheck or browser pass is claimed. The bounded map test is not a full-parser or UI execution.

## Integration gates
Draft pending hosted exact-head CI (including native package tests and applicable browser tests), independent review of the new repair, current-main/ownership refresh and valid integration lease. Prior generation 68 explicitly released; none acquired for this draft. No merge until gates pass. All ten owner exclusions remain binding.
