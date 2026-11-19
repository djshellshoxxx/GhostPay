# Documentation consolidation and historical recovery

Recorded on 18 November 2026 Pacific / 19 November UTC.

## Result and source identity

This documentation candidate preserves the PR #215 and #216 source histories,
reconciles their obsolete status guidance with the inspected main, and recovers
historical material that the later documentation branches did not contain. The
release target remains the static Pages client. No runtime, dependency, contract,
workflow or branch-protection file changes in this candidate.

- Main base: [`ffd982a7aea2856c186b40ef236a39720a1b81f5`](https://github.com/djshellshoxxx/GhostPay/commit/ffd982a7aea2856c186b40ef236a39720a1b81f5), after PR #214.
- Worker branch: `integration/ghostpay-docs-recovery-20261119`.
- Claim commit: `c0e1ba9a20065522357a038a8a01cb65468912aa`.
- PR #215 source: `362dfa999a96dc615a1d146b4f37f8325268a595`; normal merge commit `b729e66676574602fd61bf418af1ba213bbaf1bc`.
- PR #216 source: `bb193849a5688bb604e3e32dc83e1647e37fe447`; normal merge commit `562c219123de64a8089c95af1393ce955b0d4ff2`.
- Archive comparison: that exact `562c2191` tree, before adding the new snapshot and historical archive.

Both merged source heads are ancestors of the candidate. The source-owner branches
were not rewritten or updated. The coordinator owns publication, independent review,
applicable CI and any later merge to main.

## Live documentation changes

The [repository status snapshot](../../wiki/Current-Status.md) records the inspected
main, merged #241/#237/#242/#214 sequence and pending qualification boundaries.
Wiki pages and the two continuation ledgers now point to it before their dated
historical status. Old snapshots retain their source identities; an earlier CI pass
is not relabelled as a pass of a later head.

Useful #215 content remains: invoice-link passphrase handling, seller-key trust,
invoice and price expiry, and receipt-versus-settlement boundaries. Current-source
localization guidance from #140 is restored in the
[Developer Guide](../../wiki/Developer-Guide.md). The exact corrected QR precedence
paragraph from #140 is restored in [QR design](../../design/qr-colors.md): current
`qrKinds.ts` already preserves both SECRET and PRIVATE LINK warnings regardless of
testnet/unsigned/unverified flags. Only the outdated design paragraph changes. One relative link inherited from #215
was corrected from `docs/wiki/...` to `../wiki/...` in its maintenance ledger.

## Older branch disposition

#139, #140 and #153 are not wholly superseded by the later ledgers. They retain
source-pinned observations and qualification history from intervening rotations.
The archive preserves all level-two Markdown sections, including the preamble,
from their branch-owned documentation paths whose text is absent or differs in the
comparison tree. Existing identical text is not duplicated.

| Source PR | Exact source head | Documentation paths compared | Sections archived | Preserved material |
| --- | --- | --- | --- | --- |
| [#139](https://github.com/djshellshoxxx/GhostPay/pull/139) | `364b01f847391cd02b3aecb74e18ddd047096c97` | 1 | 42 | [Historical evidence](archive/pr139-historical-evidence.md) |
| [#140](https://github.com/djshellshoxxx/GhostPay/pull/140) | `c5efadab9d9af6a0053f489ebe6c0c06e760d025` | 8 | 75 | [Historical evidence](archive/pr140-historical-evidence.md) |
| [#153](https://github.com/djshellshoxxx/GhostPay/pull/153) | `83fe9b022d2b5a4068137fd7987467f1803803dc` | 1 | 41 | [Historical evidence](archive/pr153-historical-evidence.md) |

The 158 retained sections are historical evidence, not renewed production directions,
current ownership claims or current release qualification. Relative inline Markdown
links in the archive resolve to the original commit and original path, so moving the
evidence does not redirect a historical source reference to newer code. Original
section SHA-256 values, source line boundaries, source Git blob IDs, complete source
SHA-256 values, comparison hashes and final archive hashes are in
[provenance.json](provenance.json).

The #140 file set is `README.md`, `docs/design/qr-colors.md`, its documentation
maintenance ledger and five Wiki pages. The #139 audit ledger and #153 continuation
ledger each contribute one path. Their older branches are not merged wholesale:
current guidance uses the newer main, selected current-source guidance is restored,
and the original dated evidence stays in this archive. This accounts for the
reviewed documentation differences without importing stale release or ownership
instructions. Branch deletion remains the coordinator's separate decision after
its repository-wide inventory and verification.

## Verification

The worker performs static documentation checks only: exact source ancestry,
provenance and extraction hashes, relative Markdown targets, unchanged runtime and
workflow paths, and `git diff --check`. The final command results are recorded in
[verification.json](verification.json). No unit, browser, contract, Mythril,
production-build or external-wallet execution is claimed by this documentation lane.
Original #215/#216 scoped CI results remain attached to their original heads; the
combined candidate needs its own applicable CI.

## Continuation

Inspect current remote main and source PR heads before promotion. Review the new
status snapshot and archive mapping, publish the isolated candidate through the
normal PR workflow, and retain required checks and approvals. No deployment or live
GitHub Wiki publication is part of this work.

## Remote publication provenance

The GitHub connector preserves each verified Git tree and source-parent relationship while creating new commit identities.
[publication.json](publication.json) maps the four original local commits to their remote counterparts. In particular,
local comparison commit `562c219123de64a8089c95af1393ce955b0d4ff2` maps to remote
`b0617e272096c2145acd90fb00a5f8a4bac2f9cc`, with the identical tree
`73d949403fc79ffa5b8d6bfc28b754ea4ca9ceee`. Local content commit `c7bf99ad` maps to
remote `62d9554d1cb4f77259a8f8463c4472c1824d1cc1`, with the identical verified tree
`8c8550e5863b24152b449588a07a261a17a3d568`. This publication note and mapping are a
subsequent documentation-only commit; the original archive and provenance hashes remain unchanged.
