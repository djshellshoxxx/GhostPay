# Bug backlog

## UI-IMPORT-001 — pending import survives document hiding

- Priority/severity: P2 lifecycle reliability and privacy consistency; high confidence after regression reproduction.
- Baseline: `e454de6abfefda70d82784fafc1d8949b277c334`.
- Affected code: `apps/web/src/components/CameraImporter.tsx`; image decode, pasted input and asynchronous callback lifetime.
- Evidence: hiding the tab while image decode or input delivery is pending does not revoke the shared callback lifetime.
  The visibility handler originally stopped only an active camera, while `visible()` did not check document visibility.
- Worker: `ghostpay_completeness_review` (implementation); `ghostpay_security_review` (independent verification).
- Branch: `automation/20261119T073600Z/bug/camera-visibility`.
- Repair: revoke active import work on hiding and reject stale/hidden delivery, while retaining idle pasted drafts.
- Required regression coverage: hidden-before-start, hide during decode/onText, hide then show before late completion,
  callback-induced hiding, existing camera/partial-transfer cleanup and caller behavior.
- Evidence: 9/9 new cases failed on unchanged baseline; 77 distinct importer tests passed with the fix. Independent reviewer reran the nine new cases successfully. Scoped TypeScript and unchanged-rule typed ESLint passed. Normal full-web lint exited 137 and an initial combined test run was interrupted (130); neither is a pass. Published tree `47c9db00bb073b07f11e2334a767defdb1ee3d5f` matches the reviewed local integration; runtime/test blobs match local `d6e9dd38`. Full commands and source hashes are in the branch handoff.
- Status: implemented and independently verified; published draft [#258](https://github.com/djshellshoxxx/GhostPay/pull/258) at `84398a79e18673f3e371a405931bc464e1cca99a`; hosted qualification pending. Not merged or deployed.

All known recovery, network, scan and session bugs with active owners remain with their existing branches.
Do not create duplicate public issues for the same finding.
