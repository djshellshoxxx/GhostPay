# Tag archive idle regression reconciliation — 2026-11-19

## Outcome and exact source

The C-R11 failure was an obsolete visible-form expectation, not a demonstrated runtime wiping defect.
The test assumed the archive remained available after idle expiry retained unsaved seller keys. The completed
idle-session implementation instead suspends ordinary authority and hides the archive, retaining keys only
for the established encrypted backup and verification path.

- Base: `e76451ad56ba1634eed9d03468961900433fd130`.
- Test repair: `7eb078e817fe76c1f22e84cbb1bb75be71090ccc`.
- Branch: `codex/ghostpay-tag-archive-idle-20261119`.
- Changed test: `apps/web/src/components/TagArchive.test.tsx`.
- Test SHA-256: `27100043ccb339081537381a3b5dd8fbb083b2d704317127a2177d65666c122e`.

Only that test and the additive work claim change in the repair commit. `TagArchive.tsx`, `SellerKeys.tsx`,
`AppShell.tsx`, `session.ts`, `appLock.ts` and the original Vite configuration remain byte-identical to the base.

## Failure and repaired assertion sequence

The original test successfully filled all three archive passphrase fields, advanced the real application's
fake clock by 61 seconds, and confirmed that keys remained loaded. It then failed at the old line 136 because
the archive field no longer existed. The captured DOM explicitly showed the suspended backup-only notice.
This was not an ambiguous label or an early clock rollback failure.

The repaired test distinguishes the two contracts without changing production behavior:

1. While the archive remains mounted, the public app-lock notification exercises its actual subscriber. Every
   original assertion remains: the typed export passphrase is replaced by a generated suggestion, its value
   attribute matches the new value, its type is text, and both repeat/import fields have empty values and
   empty value attributes.
2. The test refills the three fields and advances the original application timer by 61 seconds. It verifies
   that the same seller is retained, the session is suspended, raw viewing-key access is refused, archive
   fields and export/import actions are absent, and neither typed passphrase remains in the document markup.

`AppShell.tsx` removes `sellerArchive` when suspended, and `SellerKeys.tsx` independently gates its archive
prop on `!suspended`. Restoring the old visible-form expectation would undo this intended authority boundary.
The mounted-subscriber assertions continue to catch broken passphrase clearing instead of replacing those
assertions with a weaker visibility-only check.

## Reproduction and validation

Both runs used Node `v24.22.3`, Vitest `5.1.0`, the original `apps/web/vite.config.ts`, one worker and a bounded
heap. No additional source alias configuration was used. Before copying the coordinator's existing compiled
package outputs, 1,561 tracked package/root input files were compared and matched between the two checkouts.
Available output directories for 41 packages were copied. This worker did not claim a fresh package rebuild.

Command, from `apps/web`:

```sh
NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=8' \
  node ../../node_modules/vitest/vitest.mjs run --config vite.config.ts \
  --coverage.enabled=false --maxWorkers=1 src/components/TagArchive.test.tsx -t C-R11
```

| Source | Exit | Actual result |
|---|---|---|
| Original test at `e76451ad` | 1 | One failed; eight unrelated cases deselected by the name filter; 11.76 seconds. |
| Repaired test at `7eb078e8` | 0 | One passed; eight unrelated cases deselected by the name filter; 6.58 seconds. |

`git diff --check` passed. Coverage was disabled only for this focused diagnostic; no configured threshold
was changed. The other eight tests, whole-file result, full web coverage, compiler and typed lint are not
qualified by these filtered runs. The coordinator will include the full nine-case file in the corrected-source
targeted replay. No further heavy tests were run by this worker.

Complete raw outputs are preserved without modification inside
[`evidence/tag-archive-idle-red.log.gz`](evidence/tag-archive-idle-red.log.gz) and
[`evidence/tag-archive-idle-green.log.gz`](evidence/tag-archive-idle-green.log.gz).
Source hashes, raw-output hashes and compressed-file hashes are in
[`SOURCE_AND_EVIDENCE.json`](SOURCE_AND_EVIDENCE.json).

## Independent review

The `privacy_completion` worker independently reviewed exact repair commit
`7eb078e817fe76c1f22e84cbb1bb75be71090ccc`, verified its test hash and unchanged runtime scope, and read both
raw execution logs. The reviewer found no introduced blocker. The review specifically confirmed preservation
of every original mounted-input assertion, followed by actual timer-driven suspension and retained-copy
restrictions. This was an independent source/evidence review, not another runtime execution.

The result is a scoped test reconciliation. It neither clears unrelated combined-head failures nor grants
production, deployment, mainnet or release approval.
