# JSON sparse-fixture syntax correction — 2026-11-24

## Source and scope

- Base: `a107d993c1aed73827d853924ea36036f083400f`.
- Isolated branch: `fix/json-fixture-syntax-20261124`.
- Ownership claim: `dea5771a`, committed before fixture edits.
- Tested source commit: `4b6651c0e4c95f6ba6af62588377b5b8b9b5749d`.
- Tested `packages/invoice-schema/src/json.test.ts` blob: `2ffdfe70a8814762b14721ac640fc82cab0b9e54`.

Replaced the two existing `delete value[1]` statements with `Reflect.deleteProperty(value, '1')`. In both concrete fixtures, index 1 is an ordinary configurable own property. Both operations remove that index without shortening the array. The first fixture still requires its accessor never to run; the second still checks that a later array element was captured before the earlier object is serialized.

Exact-delta review confirmed that the test file equals the base file with only those two substitutions. Every existing assertion and all production code remain unchanged. No new cases, suppressions, dependencies, configurations, or runtime behavior were introduced.

## Qualification

Node `v24.22.3`; all 68 workspace links resolve into this worktree. External dependencies were reused and 66 existing build-output directories were copied locally. No dependencies were installed.

| Command | Result |
|---|---|
| `npm run lint --workspace @ghostpay/invoice-schema` | Passed, exit 0 |
| `npm run typecheck --workspace @ghostpay/invoice-schema` | Passed, exit 0 |
| `npm exec --offline --workspace @ghostpay/invoice-schema -- vitest run src/json.test.ts --maxWorkers=1` | Passed: 24 tests, one file, exit 0 |
| `git diff --check a107d993c1aed73827d853924ea36036f083400f` | Passed |

Raw command output is retained in the task scratch artifact `json-fixture-syntax-logs/qualification.json`. The broader invoice suite was not repeated; the coordinator had already reported 744 tests passing before this fixture-only correction. No coverage thresholds were changed.

This handoff adds documentation only after the tested source commit. Root owns independent integration review and final combined qualification. No root checkout, existing donor branch, or remote ref was changed.
