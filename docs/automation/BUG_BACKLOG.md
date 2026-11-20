# Bug backlog

## Current cycle — 20261120T0035Z

| Item | Source and concrete evidence | Owner/disposition |
|---|---|---|
| BASE64URL-LINT-289 | #289 856b2d60, job 135940701265, unused _index at base64url.test.ts:36 | Existing #278 repair 1c1369c1 verified by package lint; no duplicate |
| GP-QR-RUNTIME-COERCION | #285 89942105, qrKinds.ts:180 and :235, independent exact-source reproductions | #290 guards; redundant #291 closed; final distinct #295 regressions pass 54/54 |
| QR-DOC-BEARER | Original #285 design text omitted bearer-warning preservation | Already corrected in #278/#290; no duplicate guide edit |
| PREFLIGHT-OBSERVATION-278 | Old #278 d74af79e lean/full browser expected nine requests, observed fifteen | Separate owner published repairs in 417f7c71; new hosted qualification pending |
| LOCAL-KDF-COVERAGE-TIMEOUT | Original #289 first full run 728 pass/1 timeout; old #278 802 pass/2 timeouts | #289 one serialized retry passes 729/729 unchanged gates; #278 two isolated cases pass, not full coverage clearance |
| QR-STACK-CONFLICT | #290 target #278 advanced to 417f7c71; GitHub reports nonmergeable | Existing #290 owner must reconcile and requalify; final #295 remains a dependent draft |

The QR finding is defensive correctness with no established untrusted production caller. Raw failed
runs remain in verification-20261120T0035Z; no timeout, security or coverage requirement was weakened.

## Historical issues

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
