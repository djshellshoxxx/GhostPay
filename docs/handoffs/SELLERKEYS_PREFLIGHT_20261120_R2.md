# SellerKeys preflight ownership continuation — 2026-11-20

**Completed bounded recovery: independent source approval and local RED/GREEN,
compatibility, original typecheck/lint and lean build gates are recorded. Required
published-head checks and actual browser acceptance remain open.**

## Source and provenance

Branch: `fix/ghostpay-backup-preflight-20261120-r2`.
Local final-idle base: `7417881ac7f243b50f7b5c1682c66a4e3f87c736`.
Published equivalent base: PR #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`.
Both have tree `9cf5006b14404c3d96ea0d040a42b5feab8d87ca`; their commit identities
remain distinct. The recovered idle runtime is
`1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`.

Tests-first checkpoint: `1a69f706223f8bb976ec62f86d317aca8103290b`.
Reviewed/qualified runtime: `fde65b79e1cb97b06f627819f70ca7c88ecafed5`, tree
`bb94ccbebf3b672dbb3a726174fd1529aae510c4`, SellerKeys blob
`eaa2b33de93edfab885ec2bbc98df6f2c8a23c19`.

Refreshed donor PR #314: `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`;
runtime commit `49535f3bdbdda6f133e397097e56a8dde8413d94`.
Its 17 component cases are retained exactly in the additional ownership test file;
the original five operation regressions stay unchanged. Its two browser journeys
are retained exactly. Full blobs and ancestry checkpoints are in the
[evidence index](../consolidation/backup-preflight-r2-20261120/EVIDENCE.json).

## Changes

The unlock controller now owns recoverability preflight and decryption as one
cancellable operation. Obsolete reads cannot begin unlock or show a stale
confirmation; terminal false/error paths release only their own state. Export
rechecks operation/session ownership after authorization and before encryption.
A synchronous durable-write token prevents colliding save/delete/unlock work and
is released only when its initiating write settles.

The patch preserves separate `unlockBusy` / `vaultWriteBusy`, idle suspension UI,
current own-installation and generation guards, verified-backup gating, and all
current PR #325/#307 safeguards. Runtime scope is one file (57 insertions,
24 deletions); the final evidence commit changes documentation only.

## Validation

| Gate | Result |
|---|---|
| Tests-only controlled RED | 22 cases: 19 pass, 3 expected failures, 0 skips |
| Same complete two-file GREEN | 22/22 pass, 0 skips |
| Complete compatibility gate | 246/246 pass across 12 files, 0 skips |
| Original web typecheck and lint | Both exit 0 |
| Original lean build and postbuild scan | Exit 0; 17 files / 2,496,711 bytes |
| Full/lean static browser collection | Two cases collected per profile; zero browser bodies executed |
| Independent source review | Approved frozen runtime; no blocking findings |

The 22-case and 246-case results overlap and must not be added. The local build
uses `GP_COMMIT=fde65b79e1cb97b06f627819f70ca7c88ecafed5`, not a future published
commit or the final docs commit. No full original web coverage/no-coverage result
is claimed for this backup runtime.

See the [qualification report](../consolidation/backup-preflight-r2-20261120/REPORT.md),
[independent review](../consolidation/backup-preflight-r2-20261120/INDEPENDENT_REVIEW.md),
and [lossless artifact instructions](../consolidation/backup-preflight-r2-20261120/ARTIFACTS.md).
Original RED/GREEN/compatibility outputs, commands, dependency identity, original
web gates, build output hashes and static collection logs are archived without
altering their bytes. Source review and execution retain separate attribution.

## Remaining boundary

Original e6 donor browser bodies did not run because Chromium failed to launch.
The same local restriction remains; this continuation performed collection only.
Actual hosted full/lean browser acceptance, the required exact published-head web
suite/security/Pages checks, and root-owned integration remain open. Parent
publishes the candidate stacked on PR #331. No main merge, deployment, release,
contract/fee/relayer change, dependency change or real transaction is claimed.
