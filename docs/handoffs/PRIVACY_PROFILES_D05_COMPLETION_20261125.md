# Privacy profiles: D05 local completion

Date: November 25, 2026 Pacific / November 26 UTC.

Status: the selected D05 standalone-package follow-up is implemented, locally
verified and committed. Publication, combined-head CI and integration belong to
the unfinished-branch coordinator. This handoff grants no application activation,
provider, transaction, fee, deployment or release approval.

## Source pins and preservation

| Source | Commit |
| --- | --- |
| Published integration candidate used as the base | `04b1a5acf6b48313178af85a3217512e57453dd5` |
| #644 standalone-library donor | `94ab256e5285f4009f915be18415bf0146a1242f` |
| #651 selected configuration decision record | `be04d1167aeb24025f5a4970833ebb2dbb98af70` |
| Verified D05 implementation | `a13da7ba8c47097b46d9712ecfa7e722f6e2f4b4` |

Local branch: `finish/privacy-profiles-d05-20261125`.
Isolated worktree: `/workspace/scratch/8812b4211518/GhostPay-d05`.

The ownership claim was committed first at `b3859d83`. Normal merges `b542cba3`
and `ca679684` preserve both donor heads as ancestors. Each merge conflicted only
in `docs/ai/ACTIVE_WORK.md`; the complete base log remains a byte-identical prefix,
followed by the new claim and the donors' additive claims. The decision document
is unchanged from #651. Relative to #644, only the six directly affected package
files differ: presets, Shielded tests, preset snapshots, README, DEVIATIONS and
COMPLETION. No dependency, lockfile, workflow, application or other package was
edited. This worker made no remote mutations.

## Implemented behavior

[D05](PR644_CONFIGURATION_DECISIONS_20261124.md) already selected `buffer` as
Shielded's sole automatic `sweep.exitGas` preference. That is the only production
behavior change. The resolver omits the explicit value because it is the catalogue
default; its effective value is `buffer`.

Maximum retains `eip7702` → `permit-sponsored` → `buffer`. Shielded's exit, source,
amount planning and delay preferences are preserved. Explicit advanced gas edits
still become `custom` and retain their capability, asset, conflict, warning,
acknowledgement and party-consent requirements. Buffer funding does not remove
the pool submitter's relayer consent or establish stronger privacy. Stored v1/v2
advanced values survive migration and round-trip; snapshots may truthfully label
them `custom` when they differ from the revised Shielded proposal. Descriptions
remain `unqualified` and `verified: false`.

## Fresh verification

Environment: Node `24.22.3`, Vitest `5.0.5`. Installed selected workspace
dependencies with `npm ci --ignore-scripts --workspace @ghostpay/privacy-profiles
--include-workspace-root=false --no-audit --no-fund`; no dependency files changed.

| Check | Actual result |
| --- | --- |
| Focused Shielded regression | Original 10 tests passed. Expanded tests first failed 3/19 against the old preset, then passed 19/19 after D05. |
| Package typecheck, lint and build | All passed via `npm run <check> --workspace @ghostpay/privacy-profiles`. |
| Full package test/coverage | `npm run test --workspace @ghostpay/privacy-profiles -- --maxWorkers=1`: 15 files, 556 passed, zero failed or skipped; 98.54 seconds. |
| Coverage | Statements 97.07%, branches 93.12%, functions 98.52%, lines 98.81%; unchanged 95/90/95/95 thresholds passed. |
| Snapshot preservation | Only four Shielded entries changed; each removes the old advanced gas value or gas downgrade. All 16 other entries are byte-identical. |
| Ancestry, scope and whitespace | Base and both donor heads remain ancestors; changed paths are bounded; `git diff --check` passed. |
| Secret scan | `bash scripts/scan-secrets.sh` passed. |
| Read-only review | Independent reviewer found no functional, scope or assertion blocker in the D05 diff; the requested fresh results section was then added. |

The new tests also preserve the shared pool-track assertions, Maximum's exact gas
order, advanced-edit rejection without capability or a supported asset, Privacy
Pools' R-34 conflict, the EIP-7702 delegate warning, pool-relayer consent, missing
acknowledgement rejection, empty preset acknowledgements and saved values. No
existing assertion or coverage threshold was relaxed to make the suite pass.

The original #644 benchmarks, mutation campaign and test counts remain clearly
marked as historical in COMPLETION.md. No new whole-repository suite, live
provider/transaction test, remote CI run, audit, deployment or activation is
claimed. The coordinator must recheck current ownership/heads and qualify the
eventual combined commit under the existing integration protocol.
