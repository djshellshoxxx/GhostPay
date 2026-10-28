# Recovered local lean checkpoint and PR #37 reconciliation — 2026-10-28

This branch preserves a tested recovered-source checkpoint. It is not a merge of PR #37, a supported network configuration, a release, or deployment approval.

## Source and ownership

- Qualified local application: `405c1680fcd058cd8141e2fbd4c8d28313693d75`; tree `dea77f979c9053bcee117e45db824bc1ea9b8b5b`.
- Local lean cut starts at `a734e77142a633f715a39e0ce5f6082cf974839c` and changes eight paths. Subsequent checkpoint documentation does not change that qualified application source.
- The original checkout at `edb0051eb89bd135c73733d9db14569aa000662d` remains preserved. Private target `0f85ee9bd316546b3814bf327fa45ad3d76c7851` was reconstructed as source with tree `3c0aee8d7716c4495cf363d52931681b2d3e5316`, then checkpointed locally. Its original commit history was not reconstructed.
- Latest fetched [PR #37](https://github.com/djshellshoxxx/GhostPay/pull/37) head: `6a3e85c084661532619d72475641732e21b7f740`. CI, Hosting kit and Integration workflow conclusions were independently read as success at that exact head.
- PR #37 reports security-fix writers still active. This checkpoint does not write that branch or replace their work. The coordinator owns this separate checkpoint; read-only workers verified local results and scoped source correspondence.

## Implemented local lean boundary

`AppShell.tsx` preserves the original core effects, state, service context and callback/RPC cache behavior. The full `App.tsx` supplies the preserved optional views; `AppLean.tsx` supplies only the existing core navigation. A build-only Vite hook selects the lean entry when `GHOSTPAY_LOCAL_BUILD_PROFILE=lean` is explicitly set. Default remains the full build; other profile values fail.

The lean production artifact excludes four optional view modules (Bitcoin, Solana, TRON and policy) and the two embed SDK public assets. All optional source remains present. Shared tags, backup/storage, fiat/buffer validation, embed notification and other core dependencies remain; this is not a claim that every optional byte or shared capability is absent. Dev-server lean behavior was not qualified.

The local build helper rejects public-directory symlinks/special files, invalid rendered-length evidence and module reports within the shipped output. The optional report is created exclusively at an absolute external path. A real failing `..local` containment case led to the separator-aware fix.

Claude Sonnet produced the implementation/correction proposals; the local integrator inspected and applied them, corrected two existing-label test literals and the demonstrated path guard defect. A bounded Claude Fable lifecycle review found no blocking issue in supplied bytes. It did not have executor access or provide a global security audit.

## Actual local evidence

| Check | Exact source and result |
| --- | --- |
| Existing App baseline | a734: 6 passed |
| New local helper | 61c3083: 10 passed, plus four external boundary regressions passed |
| Focused full/lean App tests | 405c168: 13 passed |
| Typecheck and lint | 61c3083: both exit 0; 405 changes only two test selector literals |
| Full and lean Vite production builds | 61c3083: both exit 0; byte-identical to prior 342ed85 build artifacts |
| Artifact proof / Chromium | 342ed85 artifacts: four optional module IDs absent only from lean; only two SDK assets omitted; eight core navigation clicks per full/lean artifact, no external origins or browser errors |
| Final artifact correspondence | Same complete dist/module-report bytes at 342ed85 and 61c3083; later 405 only changes test literals |
| Existing bundle scans | Both final full and lean artifacts passed |
| Original full web coverage run | 405c168: 1286 passed, one failed, four skipped; million-log scanner took 185.237 s against the unchanged 180 s gate |
| Controlled grouped coverage run | 405c168: 1287 passed, zero failed, four skipped; 106 files included exactly once, same V8 coverage and thresholds |
| Controlled timing assertion | Same seed `0x47504d31`, one million generated logs: 137.114 s / 180 s; zero overlapping positive-duration test files |
| Coverage | 91.25 statements / 86.58 branches / 92.65 functions / 95.19 lines; required 90 / 85 / 90 / 90 unchanged |
| Separate coverage-off archive fuzz | 405c168: one passed |
| Source/process integrity | Grouped run before/after source fingerprints identical and clean; no remaining owned process-group PIDs |

The controlled run uses Vitest's existing project `sequence.groupOrder`: scanner first, remaining 105 files afterward with the original two-worker limit. The earlier timing failure remains a failure. Overlap in its original run is evidence of contention, not proof that contention was its sole cause. No automatic retry or weaker time/coverage threshold was used.

Four skipped assertions remain explicit: one optional live-bitcoind case and three anvil registry cases. A zero-duration skipped-file report is not execution overlap. No ordinary unit count is presented as completed chain qualification or coverage-guided fuzzing.

## Reconciliation required before integration

The two histories share public base `edb0051` but diverge: PR #37 has 139 commits and this qualified private-source branch has 17 commits after that common base. Many changed files are byte-identical. A local automatic merge rehearsal found 13 conflicted paths; it was aborted without manual runtime edits, and both histories remain intact.

PR #37 already contains transaction-aware vault guards, compare-and-delete, final payment validity checks and newer direct/relayed sweep journal safeguards. Reuse those implementations. Missing private additions include seller completion/cancellation ownership, same-file retry and actual-store refresh; confirmed-approval reporting after payment refusal; focused recovery/payment acceptance and browser Worker/receipt coverage. `session.ts`, `keystore.ts`, `pay.ts` and `payExec.ts` match across the scoped checkpoints.

Do not overwrite PR #37's newer `state.tsx`, Sweep view/library, relayer error contract or SDK-scoped Viem override with the older private versions. The local vendored dependency metadata repair predates that accepted remote override; it is historical provenance, not the selected future dependency solution. Resolve exact test and locale unions, retain each safety guard, and validate the combined source with its exact final lockfile. Passing checks on either parent do not qualify a future merge.

## Remaining gates

- Reconcile current external security-fix file ownership, integrate the missing private changes once, and run checks on that exact combined source. Do not duplicate already active security audits.
- Native solc 0.8.28 acquisition remains stopped after the recorded HTTP 403. Signature-data download remains separately stopped with incomplete endpoint diagnostics. Neither was retried or routed elsewhere during this resume.
- Exact supported chain/assets/contracts/signing-root configuration, contract-backed EVM qualification, independent exact-build review and mandatory deeper audit gates remain. Intercepted fixtures are not deployment approval.
- Further optional UI seams are preparation candidates only. Preserve source and compatibility behavior; navigation hiding alone cannot prove exclusion.
- No PR approval, shared-branch merge, deployment or real-funds enablement was performed.
