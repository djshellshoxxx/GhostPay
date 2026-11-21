# SellerKeys preflight ownership qualification — 2026-11-20

**The bounded recovery is implemented, independently reviewed, and locally
qualified. Required exact published-head checks and actual browser acceptance
remain open.**

## Source and scope

Tests-only `1a69f706223f8bb976ec62f86d317aca8103290b` precedes the reviewed runtime
`fde65b79e1cb97b06f627819f70ca7c88ecafed5`, tree
`bb94ccbebf3b672dbb3a726174fd1529aae510c4`. Only `SellerKeys.tsx` changes at runtime
(57 insertions, 24 deletions; blob `eaa2b33de93edfab885ec2bbc98df6f2c8a23c19`).
The final handoff/evidence commit changes documentation only.

The local base is final idle `7417881ac7f243b50f7b5c1682c66a4e3f87c736`.
Public PR #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3` has the identical tree
`9cf5006b14404c3d96ea0d040a42b5feab8d87ca`. These are distinct commit identities.
The local build explicitly uses `GP_COMMIT=fde65b79e1cb97b06f627819f70ca7c88ecafed5`;
its artifact metadata is not relabeled with a future published head.

Refreshed PR #314 `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`, runtime
`49535f3bdbdda6f133e397097e56a8dde8413d94`, provides the missing behavior and test
provenance. Its 17-case operation test is copied exactly into the additional
`SellerKeys.ownership.test.tsx` (blob `05c846289be5827c2e9028c28661b1c2f242c9b0`).
The original five-case operation file remains unchanged (blob
`29fd9ccaf8226c501e7c1d6e075822960507017c`). The two browser journeys are the exact
refreshed donor blob `78bc60dcd7e871166d632dd3b92302cc643eac8e`.

## Resulting behavior

- The recoverability read owns the unlock controller before it waits. Cancellation,
  input edits, supersession, session changes and unmount retire that continuation.
  A successful check passes the same controller into decrypt; false/error/stale
  checks release only their own preflight state.
- Export rechecks controller and session ownership after authorization and before
  encryption. Existing post-encryption download/verification guards remain.
- A synchronous token gives save/delete one durable-write owner. Duplicate or
  colliding submissions and unlock during a write are refused; only the matching
  write settlement releases its busy state.

Current separate unlock/write busy flags, idle suspension UI, cancellation/session
hooks, own-import/unlock completion, verified-backup gating, and every existing
operation test remain. There are no dependency, configuration, threshold, storage
format, cryptographic format, fee, contract or relayer changes.

## Executed gates

| Gate | Source | Actual result |
|---|---|---|
| Controlled RED: two complete ownership/operation files | `1a69f706` | 22 cases: 19 pass, 3 expected behavioral failures, 0 skips; 11.619 s |
| Same two complete files GREEN | `fde65b79` | 22/22 pass, 0 skips; 10.665 s |
| Compatibility: all eight SellerKeys files, session/session-idle and Sweep/quote-lifecycle files | `fde65b79` | 246/246 pass across 12 complete files, 0 skips; 86.773 s |
| Original `npm run typecheck --workspace @ghostpay/web` | `fde65b79` | Exit 0; 20.065 s |
| Original `npm run lint --workspace @ghostpay/web` | `fde65b79` | Exit 0; 40.798 s |
| Original lean `npm run build --workspace @ghostpay/web`, including TypeScript, Vite and postbuild scanner | `fde65b79` | Exit 0; 21.366 s; 17 files / 2,496,711 bytes |
| `test:e2e ... backup-ownership.spec.ts --list`, full profile | `fde65b79` | Two cases collected in one file; exit 0; 1.269 s |
| Same static collection, lean profile | `fde65b79` | Two cases collected in one file; exit 0; 1.507 s |

The 22-case and 246-case runs overlap; their totals are not cumulative. Tests ran
with one worker and a 512 MiB Node heap limit; original web gates used 1536 MiB.
The existing original configuration and thresholds were retained. Dependency
identity/reuse proof is archived; no install or dependency copy was introduced.

RED demonstrates stale authorization invoking encryption, a second save starting
on forced resubmit, and unlock preflight failing to hold vault controls. The last
RED case stops at its initial busy-state assertion; it does not claim the later
delete/unlock assertions executed in that failing run. The GREEN run completes
all assertions. All five original operation controls passed in both runs.

## Independent evidence and remaining gates

The [independent source review](INDEPENDENT_REVIEW.md) approved the exact frozen
runtime with no blockers. Its [machine-readable review](INDEPENDENT_REVIEW.json)
records preserved blobs and explicitly separates source review from execution.
The earlier [recovery plan](PLAN_REVIEW.md) maps all 17 donor cases and the browser
source. The [evidence index](EVIDENCE.json) pins commands, sources, hashes and all
original outputs; [artifact instructions](ARTIFACTS.md) explain lossless recovery.
The [task handoff](../../handoffs/SELLERKEYS_PREFLIGHT_20261120_R2.md) identifies
ownership and publication boundaries.

The original refreshed donor browser attempt failed before a browser body ran.
This continuation also executes no browser body: the two full/lean `--list` calls
are collection only. Required full/lean hosted browser acceptance remains open.
No complete original web coverage/no-coverage suite is claimed for this backup
runtime; required checks must qualify the exact published candidate. The broader
idle candidate's suite is separate source evidence and is not relabeled here.
Root owns publication stacked on PR #331 and subsequent integration. No main
merge, release, deployment or real transaction is claimed by this handoff.
