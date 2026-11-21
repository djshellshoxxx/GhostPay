# Retention first milestone

Source: `989e72687a9b7cefc369107cc6f09e38d270d0ce`; spec base `bbcf71b7`; branch `privacy/v11-retention-20261120`.

Implemented an explicit bounded registry of disposable generated invoice screen previews, default-off 5/15/60-minute expiry preference, count-only cleanup preview, current-revision single-use confirmation, React lifecycle cleanup, accessible controls in Settings and generated invoice results, and critical translation classification. The registry never receives record contents, a database handle, vault, pending transaction, backup or arbitrary storage deletion adapter. A UI callback clears only the generated result state, preserving editable draft, seller session and durable records. Preferences store only a numeric delay.

This is M1, not full #287 completion. It covers current in-memory invoice presentation; it does not claim persistence retention, terminal-transaction display integration or cross-browser qualification. Shared invoice links are not revoked. Timers run only while the generated invoice view remains mounted. Unknown/protected record stores have no cleanup adapter.

## Executed verification

- Locked `npm ci --ignore-scripts --no-audit --no-fund`: exit 0, 721 packages. Original `npm run build:libs`: exit 0, 65 source-aligned workspace outputs. No dependency changes.
- Regression source before module implementation: Vitest startup rejected the absent new module. This proves missing implementation, not a behavioral regression run.
- First integrated attempt: 11 passed, one failed. The new fixture omitted a required line-item price. Corrected the fixture with a valid price; no production validation was relaxed.
- Original-config focused final selection: **16 passed in four files**, exit 0: metadataRetention, MetadataRetentionControls, real CreateInvoice retention, and existing Settings clipboard tests.
- Original critical-language classification suite: **12 passed**, exit 0 after retention messages were added to the explicit reviewed-key boundary. Spanish/Japanese/Arabic entries are English draft fallbacks, not reviewed translations.
- `git diff --check`: passed. Full web typecheck/lint/coverage/browser/hosted CI remains unrun on this feature source.

Focused commands ran from apps/web using `../../node_modules/.bin/vitest run <listed files> --coverage=false --maxWorkers=1`. Full retained outputs and SHA-256 values are adjacent. One initial wrong-working-directory command exited127 before tests and is not a failed product check; the corrected original command ran normally.

## Fresh successor task

Independently review classification, stale/replayed previews, reentrancy, timer/clock/storage-denial behavior, current generated-object binding and protected-data preservation. Run scoped typing/lint and add only tests needed for a concrete remaining risk. Any persistent retention adapter needs positive record-level proof of nonessentialness and current-state transactional confirmation; do not add generic clear or infer settlement from current pending journals. Preserve version separation, exact evidence and original release gates.
