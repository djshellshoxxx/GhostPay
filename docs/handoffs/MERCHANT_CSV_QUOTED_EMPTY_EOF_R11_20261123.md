# GP-BUG R11 — Merchant CSV quoted-empty final record dropped

Date: 2026-11-23 UTC. Scope: existing `@ghostpay/merchant-billing` CSV parsing only, no behavior changes for valid CSV, financial transactions, contracts, deployment or release.

## Immutable provenance
- Live main at selection: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Isolated branch: `automation/20261123-r11/bug/merchant-csv-empty-quoted-eof`.
- Ownership claim commit: `daf6682a623f9d1ecb253465a743525c4e32773a`.
- **Failing regression committed first:** `38e62d94a814b51f31ef8ab86c487bd050fbcf29`. New file: `packages/merchant-billing/src/csv.quoted-empty-eof.test.ts`.
- **Minimal production fix:** `2996b0478598f8a8ed3f9451a93f476a5ce13548`. Only change to `packages/merchant-billing/src/csv.ts`: track whether a quoted field began, reset at field termination, and include an explicitly quoted empty field in EOF row finalization.
- Baseline production source Git blob: `3c9b5c50c69881188d2aadd386a68f77a3cbce37`; repaired production Git blob: `a031a5388d2b682fcf594d9838dbc399e601baf8`.
- This note is additive; no edits to owned `csv.test.ts` or another worker's task branch.

## Actual observed failure and root cause
Using Node.js 22.16.0 and TypeScript `tsc`, an **exact SHA-matched standalone copy** of `csv.ts` was compiled with a minimal local `BillingError` interface double. The file bytes were verified by `git hash-object`, matching the GitHub baseline blob above. No package checkout was available (github.com DNS failure). Exact reproductions:
- `parseCsv('name\\n""')` **returns `[['name']]`**: the explicit final quoted empty row is silently dropped.
- `parseCsv('name\\r\\n""')` behaves the same.
- `parseCsv('""')` reports `CSV empty file` instead of the parser's documented `CSV blank line`.
- With a trailing newline, `parseCsv('name\\n""\\n')` correctly rejects a blank row. This inconsistency isolated the EOF-only defect.

Root cause: after reading a quoted empty field, `field === ''` and `row.length === 0`. The final `if (field !== '' || row.length > 0) endRow()` therefore fails to finalize an explicit record. Correctly recognizing the row restores existing blank-line rejection while preserving legitimate two-column empty quoted values.

## Verification performed
- Exact Git-blob-hash-matched Node 22 source probe: baseline **9/12 passed**; failures were the three explicit empty quoted EOF vectors. Repaired same 12 checks: **12/12 passed**.
- Neighbor cases retained: LF/CRLF with explicit empty row followed by newline; empty quoted second field in two-column CSV at EOF and before CRLF; quoted nonempty field; unquoted field; single terminal LF; unterminated quote; text after closing quote.
- Locally compiled the exact two sources with installed `tsc`, plus a minimal `BillingError` stub. This **was not repository Vitest, lint, full typecheck, build or native browser execution**, which require GitHub-hosted exact-head checks.
- Dedicated Vitest regression file was committed *before* production source correction. GitHub CI confirmation is outstanding until the PR's final head checks finish.

## Ownership, CI and integration gates
- Source and docs discovery: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md` read at current main.
- 273 open PRs visible across three GitHub REST pages; targeted changed-file checks of broad #278/#264/#262/#238/#372/#224, live coordination #504, merchant #324/#371/#397, CSV-related #393/#444/#467/#490, and several other PRs found no direct ownership of `csv.ts` or new regression path. This **does not assert an exhaustive 273-PR changed-file census**; recheck before integration.
- PR #390 at `b655bc273a6704c9c140287b8adcdf4085b91882`: 36/39 checks succeeded, three skipped, five workflow groups successful; independent reviews `[]`, `mergeable=false`. Its owner branch remained untouched and was not repaired because no actual exact-head CI or code failure was verified.
- Integration-lock branch `automation/ghostpay-integration-lock` at `082e754f44944ebb4be283f89176b966bf8f7b4f`: generation 12 `released`; no ownership was acquired and no main merge attempted.
- New PR must remain **draft** pending all required exact-head CI green, applicable native browser verification, genuinely independent review, full ownership/conflict clearance, and legitimate held integration lease ownership. No need to change an already-owned branch.
- Next: recheck final PR SHA/CI and owner collisions; repair only evidenced CI defects on this branch; do not deploy, release or merge without all gates.
