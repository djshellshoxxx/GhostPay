# GhostPay BUG-ONLY R13: duplicate Accept-Language qweights

Date: 2026-11-23. Branch: `automation/20261123T1035Z/bug/i18n-duplicate-language-q-r13`.

## Source pins and observed defect

- Live main baseline before changes: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Source: `packages/i18n/src/negotiate.ts`, original Git blob `f62b45a6e91273b773170b7a6b761e503f898384`.
- Failing regression-first commit: `6fdef5efc7cc0544655a7c5d2bbc14625efa07ec`, new `packages/i18n/src/negotiate.duplicate-q.test.ts`.
- Minimal code fix commit: `c5afdcffcd010eb10a099be8ff3e5e428ebbb37b`, amended `negotiate.ts` Git blob `b77fd7f3611f5a39cdabbacad6eb17434d9386ae`.
- A single language range could contain multiple valid qweights; the parser applied the final one. Example: `en;q=0;q=1, fr;q=0.5` returned `['en','fr']`, even though a duplicated q parameter is malformed, permitting an explicitly excluded range to reappear. Root cause: the parameter loop overwrote `q` with each valid matching field and never rejected a second qweight.
- Fix: reject a range with more than one parameter. The parser already accepts only `q` as the sole permitted parameter, so this preserves all valid single-q forms, q=0 exclusion and stable ordering. No other function or API changes.

## Execution evidence and limits

Node.js v22.16.0 isolated source-body-equivalent logic with minimal fixed `isValidLocale`/`parseLocale` stubs (`en`, `fr`, `de` only). Two of five directed assertions failed before the fix; all five passed with the one-line correction. Includes q=0 resurrection, reversed duplicated q, two positive q values, stable order and valid q=0 behavior. The probe is not a complete compile of the Git blob or repository Vitest test: native clone fails to resolve `github.com` from this runtime; source was inspected via authenticated GitHub. The committed Vitest regression, package build/lint/typecheck, and browser workflows must be qualified via GitHub Actions on the final exact head. No independent human/model verifier was present; author review is not counted as independent approval.

## Ownership and integration

Reviewed AGENTS.md, docs/ai/WORKFLOW.md, docs/ai/HANDOFF.md and ACTIVE_WORK.md on main; consulted actual open PR inventory and inspected changed paths of major/broad PRs #278, #262, #264, #307, #372, #504 and selected i18n/security PRs #368, #249, #211, #218, #219, #222, #224, #310, plus related #246, #238, #251 and #87. No direct change to `packages/i18n/src/negotiate.ts` or the newly isolated test was detected in that reviewed subset; full exhaustive review of all 260 open PR changed-file inventories is **not** claimed. Avoid overwriting broad or currently owned files, and perform complete file-ownership recheck before integration.

PR #390 remained at `b655bc273a6704c9c140287b8adcdf4085b91882`, all five exact-head Actions groups successful, Snyk successful; zero submitted reviews; GitHub API reports `mergeable_state=dirty` against updated main and `draft=false`; the owner branch was left untouched. PR #390 cannot merge based on old green checks alone. Integration ref `automation/ghostpay-integration-lock`, `integration-lock.json`: generation 12, `released`, owner `claude-keen-volta-8ctx9x`, as read; no current lease or merger entitlement acquired.

## Gates

- Final exact PR head GitHub Actions required workflows and security statuses must complete GREEN, including applicable native-browser coverage.
- Independently review the code and test assumptions; verify that only malformed repeated qweights are rejected and that actual `isValidLocale` behavior matches the isolated probe.
- Confirm no active owner/file overlap (all current open PRs), resolve any branch conflicts without changing another writer's branch.
- No merge without legitimate held integration lease, explicit ownership and the above gates. Leave draft otherwise.
- No new features, dependencies, interface redesign, unrelated refactor, contract/fund interactions, external traffic tests, deployment, or release.
