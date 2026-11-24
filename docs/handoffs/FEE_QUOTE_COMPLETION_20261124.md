# Fee quote branch completion — 2026-11-24

## Source and disposition

Branch `finish/fee-quote-completion-20261124` completes the focused fee work from
PRs [#421](https://github.com/djshellshoxxx/GhostPay/pull/421),
[#423](https://github.com/djshellshoxxx/GhostPay/pull/423),
[#425](https://github.com/djshellshoxxx/GhostPay/pull/425), and
[#462](https://github.com/djshellshoxxx/GhostPay/pull/462), retaining their ancestry.
It targets main `f76904301cff0b24d65ea4e31cbf37d470db4d95`.

Qualified application/test source: `3ff40d8fd020aa68aa965f6481a966a8eba1a064`;
tree `af7c10dfa8c7dc628a365812aa880c7a9a3bc2b4`. This documentation-only successor
does not change that source.

| Input | Exact head | Treatment |
| --- | --- | --- |
| Timing stack leaf #425 | `ec3c7d9bf304fd9e837eaf7da9bbc0cf3fdb3ce3` | Preserve #421 urgency validation, #423 funding/jitter validation, and #425 corrected waiting-privacy expectations |
| Asset symbol collision #462 | `a3ac91c8f38b99c25749ba1a87ba308c9f1f5a2e` | Preserve original source/history and regression; finish uncovered fee-free routes |
| Current main | `f76904301cff0b24d65ea4e31cbf37d470db4d95` | Preserve current scanner/receipt work and #514 nonnegative near-tie savings |

Main already contains the receipt verifier #449/#450/#452 stack. No receipt
reimplementation is needed. Fee donors also occur within broad C1 #504 and its
responsive descendants; this focused branch supplies the fee changes without
importing that broader UI work. Original donor branches are unchanged.

Only six main-relative product/test paths change, all in `packages/ux-fees/src/`:
`preview.ts`, `timing.ts`, `preview.asset-symbol-collision.test.ts`,
`preview.payment-asset-identity.test.ts`, `timing.privacy-validation.test.ts`, and
`timing.urgency-validation.test.ts`. The larger diff consists of original donor
ownership/census/handoff documents. Both registry merge conflicts were resolved
by preserving every nonblank line from both parents, including multiplicity.

## Defect found while finishing #462

The original #462 guard compares fee-line assets with the final payer totals.
When no checkout fee applies, there is no `F-PAY` line containing the payment
asset. A same-ID network/security fee with a different symbol or precision can
replace the payment's displayed identity while `canProceed` remains true.

Native Vitest reproduced six failures on the combined donor source: direct
network symbol, direct network precision, direct security-fee symbol,
unenforceable-router network symbol, zero-fee-router network symbol, and multiple
internally consistent fee identities that disagree with the payment. Four valid
controls passed. Regression-first commit:
`f0650014eabcc0916c40a6bbcf13b67dde94a102`. Test message-shape correction before
the source fix: `d71ad4d6dd3fa2d30aded1668d11a72800901f1f`.

The minimal fix includes `input.asset` in the existing identity comparison loop.
It retains the existing blocking warning and leaves fee schedules, amount
calculations, tie ranking, savings, and valid-input results unchanged. No RPC,
wallet request, signer, contract, custody, storage or deployment behavior changes.
The ten new tests pass after the correction. Original donor tests are unchanged.

## Native verification

Environment: Node `v24.22.3`, npm `11.19.1`, repo-pinned Vitest `5.0.5`, TypeScript
`5.9.3`. Fresh `npm ci --ignore-scripts --no-audit --no-fund` succeeded without
changing the lockfile. Package lock Git blob:
`8ce2a5bb315cd84f45d3351131de0914337224ae`.

| Command/check | Result |
| --- | --- |
| `npm exec -w @ghostpay/ux-fees -- vitest run src/preview.payment-asset-identity.test.ts --maxWorkers=1` before fix | 6 failed, 4 passed; each failure was `canProceed` incorrectly true |
| Same targeted command after fix | 10 passed |
| `npm test -w @ghostpay/ux-fees -- --maxWorkers=1` | 95 tests passed across 8 files, no failures/skips |
| Original V8 coverage gate | 98.58% statements, 98.23% branches, 98.11% functions, 99.76% lines; thresholds unchanged |
| `npm run typecheck -w @ghostpay/ux-fees` | Passed |
| `npm run lint -w @ghostpay/ux-fees` | Passed |
| `npm run build -w @ghostpay/ux-fees` | Passed |
| `npm run ci:scan-secrets` | Passed |
| `git diff --check origin/main` | Passed |

A parent-relative merge check reported one preexisting trailing-space line in
main's scan handoff. The proposed main-relative diff is clean. No unrelated
documentation was rewritten to hide that baseline.

Exact preservation checks passed for:

| File | Git blob |
| --- | --- |
| #425 timing source | `a2d4e56edd046547ff5791bf19c243a45f82c5e3` |
| #425 privacy-option tests | `068ec2817a439b186dc8d94d2e52ff3824596c82` |
| #421 urgency tests | `1d288dabd6ab7f952122957ffdba928f1bbd5f40` |
| #462 symbol-collision tests | `60c59ee424457fb29f61d6231f638b39051e491f` |
| Main `cheapest.ts` | `4cbb678712fdc85605394510c498d29db5a879b3` |
| Main near-tie regression | `e1d49430e7c30300bbd02cf492398b399f55d1bd` |
| Completed preview source | `d07b84cdf4f07d2afa406d6916ceddc80a901fa8` |
| New payment-identity regression | `338c39e03c3301bc9177e19a80a3d1215ea80fb1` |

## Independent review and remaining integration work

The parent coordinator independently reviewed the source changes and all four
new/donor regression files and found no blocking issue. The review confirmed
that including `input.asset` covers the missing no-`F-PAY` paths and that fee
arithmetic and ranking remain unchanged. This is separate-agent review, not an
external security audit.

At discovery, #425 and #462 each had successful CI, Pages, Beta acceptance,
Hosting kit and CLI operator workflows at their original heads. Those results
do not qualify this new composition. The coordinator must publish the candidate,
inspect its exact-head CI, recheck donor/main heads and integration ownership,
and merge only after applicable gates pass. This worker did not push, merge a
shared branch, deploy, release, or use live funds. No browser or whole-repository
test result is claimed from this package-only run.
