# Source-pinned handoff — strict canonical JSON arrays (2026-11-19)

## Scope and ownership

Repository: `djshellshoxxx/GhostPay`; static Pages client and its shared invoice-schema dependency only. Worker: one ChatGPT development phase, with no concurrent independent reviewer. Branch `automation/20261119T083600Z/bug/json-canonical-array`, based on observed main `14ded337a10c140d7a9f9a9238ec038587d925bb`. Own files: `packages/invoice-schema/src/json.ts`, `json.test.ts`; task claim appended to `docs/ai/ACTIVE_WORK.md`. The lock ref `automation/ghostpay-integration-lock` was observed released at `3ae60de55add2763aa7d7a44033d11b96df13adb`, but was not acquired. No integration or main merge is authorized without later fresh lock acquisition, full required checks, independent verification and deployment-trigger check.

## Reproducible defect and fix

`canonicalize` is a public canonical serializer. Its baseline array case `value.map(...).join(',')` skips missing own indices. E.g. `new Array(1)` was serialized as `[]` instead of being rejected; `[1, , 3]` emitted invalid JSON `[1,,3]`. Arrays with extra own keys were silently serialized without those keys. This is a correctness/canonical representation gap, not a demonstrated key compromise or fund-loss flaw. The invoice and receipt signers currently validate their schema inputs first, which limits demonstrated exploitability; do not call it a signature bypass.

The regression test was committed **before** the production change. Tests now assert stable `JsonParseError` for holes, non-index enumerable or nonenumerable properties and symbol properties while accepting standard dense nested arrays. The minimal runtime fix checks `Reflect.ownKeys` for precisely the `0..length-1` own indices and the built-in `length` key before existing recursion, preserving ordinary dense-array output.

## Source and executed evidence

- Exact base: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
- Ownership-claim commit: `e8d69f2be1d77b485d73e58843429d7c21a45001`.
- Regression-first commit: `a6c38cb8bccad88d6900b71dafbb9c53eb67c34e`.
- Fix commit: `ec3c548cf47b6706923ab501334ce2145da96ced`.
- Baseline behavior reproduced with Node 22 using the repository's original array `map/join` expression: a hole-only array became `[]`; a three-element array with a middle hole emitted `[1,,3]` and was rejected by `JSON.parse`.
- Seven standalone behavior assertions passed using a faithful JavaScript transcription of the changed `canonicalize` function (five prohibited array shapes, one dense nested array, one dense/empty control group). **This is not execution of the checked-in Vitest suite or TypeScript build.**
- No `npm ci`, package Vitest, TypeScript, lint, full CI, browser checks or hosted qualification was executed locally; the container has no network access to the GitHub repository. Exact-head hosted checks and fresh independent review are pending.

## Collaboration and next actions

The latest directly checked #262 and #264 patch inventories did **not** include `packages/invoice-schema/src/json.ts` or `json.test.ts`, although both modify adjacent `receipts.ts` and cover broad integration. These owners remain active and must be rechecked. PR #258's targeted Hosting kit retry and full CI were still queued, and #261's hosted CI pending when checked. Do not retry already-retried CI blindly. Inspect current main, active claims, checks and deployment triggers before any merge. Run package `vitest`/typecheck/lint and complete independent review of the exact PR head. The new test is expected to be red on baseline, but that Vitest execution has not occurred here and must not be reported as a completed red/green test.

No deployments, releases, real funds, production config changes, other-agent branch edits, Codex or paid APIs were performed.

## Follow-up before cycle closeout

- Test-only fixture lint repair after the original fix: `0ceaf7a73efa9fba241e50bd5ed27212b1c3417b`. Sparse arrays are now constructed by changing array length and setting specific indices, not by an ESLint-disallowed elision literal or `new Array(n)`. The assertions are unchanged; no product source changed in this follow-up.
- Draft [PR #265](https://github.com/djshellshoxxx/GhostPay/pull/265) was opened. Initial head `7f99afac07cae1afe9a63f5399f252e8cd08bcd7` had hosted CI, Pages, beta, hosting and CLI jobs **queued**, not passed. The later fixture edit requires fresh exact-head qualification.
- A distinct sequential read-only security-audit phase selected `packages/invoice-schema/src/merchantProfile.ts` (FNV-1a32 `275333962`) and recorded conditional invalid-clock expiry finding `GP-AUD-208-01` in isolated [draft PR #266](https://github.com/djshellshoxxx/GhostPay/pull/266), commit `75dc9d3b29e3449b56e13889496c3771ec7c2f93`. Arithmetic reproduction only, not an executed signed-profile test or exploited vulnerability.
- Distinct sequential documentation/wiki review checked source-pinned Home, Sidebar, User Guide and Developer Guide: both top-level navigation links exist. Historical recovery draft #259 already owns substantial docs; no conflicting Wiki or README edits were made. No third concurrent worker was available, no live Wiki publication occurred.
- Full repository and #258/#261 CI remain pending at last check; #258's targeted Hosting kit retry was queued, not retried again. #255 retained the documented strict Mythril 11-finding failure. Broad consolidation PRs #262/#264 remain active and require independent integration qualification.
