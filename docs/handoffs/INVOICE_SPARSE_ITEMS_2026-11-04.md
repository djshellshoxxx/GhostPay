# Sparse invoice line items — bounded local regression

Base: `0014bc5b26c7487ea1f9fb230194c36673193236` (checkout `main` and
local `origin/main` agree). No remote freshness claim: public GitHub PR lookup
failed with `curl: (6) Could not resolve host: api.github.com`.
PR #47 remains the integrated core owner. This slice changes only the shared
line-item validator and its tests; no UI, payment, scanner, receipt, sweep,
recovery lifecycle or consolidation implementation was replayed. Live PR
non-overlap must still be checked before integration.

## Reproduction and fix

`validateLineItems` used `Array#map`, which skips missing array slots. A
one-slot sparse list passed validation and canonicalized to `[]`, allowing the
empty-list signature to be checked against this invalid in-memory invoice.
JSON links cannot encode sparse arrays; this is an in-memory API validation
defect, not evidence of a remotely exploitable payment bypass.

Changed `packages/invoice-schema/src/schema.ts` to use `Array.from` with the
existing item validator, visiting missing slots as `undefined` and rejecting
them with `SchemaError`. Tests in `sign.test.ts` cover verification/signing
refusal; `schema.test.ts` covers holes at the beginning, middle and end of the
private-part list. Valid empty lists remain supported by existing tests.

## Exact local evidence

- `npm run build:libs`: exit 0 before TypeScript tests.
- Before the fix: `npx vitest run packages/invoice-schema/src/sign.test.ts packages/invoice-schema/src/schema.test.ts`
  exited 1: **2 failed, 112 passed**. Both new regressions reported
  “expected function to throw an error, but it didn't”. The GitHub reporter also
  reported a read-only runner summary path; this was separate from test failures.
- After the fix: same focused command with `--reporter=default`: exit 0,
  **114 passed**, including after the test fixture was adjusted for lint.
- `npm run test -w @ghostpay/invoice-schema -- --reporter=default`: exit 0,
  **9 files / 628 tests passed**, duration 206.12s. Coverage: statements
  **99.33%**, branches **99.11%**, functions **100%**, lines **99.6%**;
  existing thresholds passed without changes. This run preceded the lint-only
  fixture adjustment; the final fixture passed the focused rerun above.
- `npm run typecheck -w @ghostpay/invoice-schema`,
  `npm run lint -w @ghostpay/invoice-schema`, and
  `npm run build -w @ghostpay/invoice-schema`: exit 0. Initial lint rejected
  array `delete` in the new fixture; the fixture now constructs holes directly.
- `git diff --check`: exit 0.

## Remaining gates and next task

No full repository/browser/contract matrix, real wallet, chain, external audit,
deployment or release validation is claimed. Existing lean acceptance and
configuration gates remain open. Live ownership verification is blocked by DNS.

Next candidate independent task: test sparse-array handling in the exported
generic canonical JSON serializer (which still uses `Array#map`). Its behavior
was not changed here. Confirm that task is unowned against public PR files,
especially #47, before implementation; current ownership cannot be certified
offline.
