# Focused source integration — 2026-11-18

This group consolidates four independently reviewed fixes on main `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`,
which already contains reviewed browser transport PR #241. It is a source-integration candidate; combined hosted
qualification must pass before promotion. It does not claim a production release or completion of the broader
privacy and recovery candidate #238.

| Source PR | Exact source head | Preserved behavior |
| --- | --- | --- |
| #237 | `7109290b7e4f029c36d9743bde9fd664d1da5474` | Capture only the existing beta acceptance log glob inside its hidden state directory. |
| #227 | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | Dual-clock idle expiry, rollback detection, lifecycle checks and existing sole-copy safeguards. |
| #234 | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | Opt-in pinned invoice signer enforcement, signature-before-trust ordering, and unchanged default review semantics. |
| #235 | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | Private v4 seller checkpoint slots, session-bound access and explicit refusal of incompatible legacy formats. |

All four source heads are retained as merge parents. Their application, workflow and test blobs are unchanged.
The only merge conflicts were independent appended worker claims in `docs/ai/ACTIVE_WORK.md`; both sides were
retained each time. No security-sensitive source conflict was resolved automatically.

## Review and qualification

Independent application/crypto and CI/security reviewers inspected the source deltas. The CI reviewer found no
blocking source issue in any of the four changes. The crypto reviewer separately confirmed #234's fail-closed
policy ordering and the transport reviewer cleared #241. The coordinator read the actual combined diff.

The four source PRs had successful applicable hosted checks against earlier main `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Those historical results are not relabeled as execution of this combined tree. The integration PR must execute
the unchanged workflow matrix, including TypeScript, unit/coverage, browser profiles, Pages artifact acceptance,
CLI/integration, CodeQL, secret/egress and dependency checks as selected by their existing triggers.

Main's strict Mythril analysis has eleven unresolved findings. None is suppressed by this group; contract production
sources and the analyzer/release workflows are unchanged. The existing release gate remains required and failed.
Deployments, release publication, branch deletion, branch-protection changes and force pushes are excluded.

## Provenance and next step

The master audit starts from 246 remote branches and 239 PRs (44 open, 53 merged, 142 closed unmerged).
These counts precede the authorized merge of #241 and creation of this integration PR. Historical/deleted PR heads
are being examined independently using fetched Git objects. The complete census and final post-merge disposition
will be recorded separately; this document makes no claim that every branch is already reconciled.

After combined checks pass and the current main/head identities are rechecked, promote with a merge commit,
verify the resulting main tree and source ancestry, and update the master disposition ledger. Preserve all source branches.
