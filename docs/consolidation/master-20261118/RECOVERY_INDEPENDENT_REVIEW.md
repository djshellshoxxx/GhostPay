# Recovery reconciliation: independent source review

Reviewed implementation commit: `b0fba2723e846ecd0e61a110f3d29a3b7b28d117`.
Branch handoff head reported by coordinator: `349b51e99f7fdae0ee61343d66bc95ba18de6f26` (documentation follow-up).
Reviewer: independent CI/release reviewer, separate from the recovery author.
Review date: 2026-11-19.

## Result and scope

No blocking source finding was found in the three authored runtime edits and their associated unit regressions. This is bounded AI-assisted source review, not an external audit or a claim that the combined browser/coverage qualification has passed. The coordinator remains responsible for full integration tests and exact-head CI.

| Runtime path | Reviewed Git blob |
|---|---|
| apps/web/src/AppShell.tsx | e813f712cc6e13e8a3f39fdbcf24e80fd27e4a03 |
| apps/web/src/components/StealthExportRecovery.tsx | fda705e782c147702ebcbac125ddb30ffee94910 |
| apps/web/src/components/StealthExportVerification.tsx | 9c01f02e5fe7a0a6f1ff5c9839ca36d0176f20d8 |

## Findings

The unload handler checks the live session and independently verified external-copy state at the event. A cached local-vault verification is insufficient for this synchronous exit decision because another tab may delete that vault before the current tab learns about it. Retaining a registered handler while keys remain loaded also allows live external-copy verification to suppress the warning without relying on a change to an already-verified public summary. Tests exercise both live external verification and stale local-vault custody.

Recovery rejects file-byte lengths that disagree with decoded ASCII text length after the operation-current check. The portable codec's existing ASCII requirement rejects remaining non-ASCII content. This prevents File.text() from stripping a UTF-8 BOM and making a byte-invalid saved file appear valid to the UI. The verification component additionally requires the byte length and decoded text to match the exact generated export; a different backup cannot certify the current download. The associated tests create actual BOM-prefixed File byte sequences and assert failure without success announcements or custody upgrades.

The inspection also traced inherited session installation staging and export verification disposal. New key boxes are prepared before the old session is cleared, partially created boxes are disposed on failure, and verification-only decoded secrets are disposed in finally paths. This supports the bounded review but does not substitute for a full audit of all recovery history.

## Validation boundary

The reviewer inspected source and regression assertions but did not rerun recovery tests in this review. Workspace dist dependencies were being rebuilt by the coordinator after an interrupted installation; missing dist/type artifacts are setup blockers, not newly established runtime defects. No source, test, gate, dependency, scanner or deployment file was modified as part of this independent review.
