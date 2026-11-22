# GP-BUG — Schedule text validator accepts ill-formed UTF-16

Date: 2026-11-22 UTC (cycle R4). Repository: `djshellshoxxx/GhostPay`.
Base live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (reconfirmed before file changes).
Task branch: `automation/20261122-r4/bug/ux-schedule-invalid-utf16`.
Owned production source: `packages/ux-schedule/src/validate.ts`.
New dedicated regression: `packages/ux-schedule/src/validate.unicode.test.ts`.

## Reproduced existing correctness failure

The existing `validText` validation iterates Unicode code points and rejects control/bidi code points, but does not reject a standalone UTF-16 high or low surrogate (U+D800..U+DFFF). These are not well-formed Unicode scalar values. Names and memos reach this validator through the existing `createTemplate`, `parseTemplates`, and scheduled-payment `validateSnapshot` paths. Accepted malformed names/memos can change to U+FFFD after UTF-8 encoding, rather than round-tripping as submitted. No actual payment, encoding over network, secret, or funds were exercised.

Evidence: exact main `validate.ts` Git blob `cb9b63207586651282ad8bf46237e58431cfdd98`, independently reproduced by `git hash-object` on the locally executed source copy; Node v22.16.0 with `--experimental-strip-types` and a minimal `err/ok` import shim. On baseline `validText('\uD800','memo',0,140)` returned `{ok:true,...}`; `TextEncoder` encoded that malformed unit to `efbfbd`, and decode differed. Four malformed text variants were also accepted. The local regression assertion deliberately failed (exit 1; actual true / expected false) against the unmodified source blob. This is not a repository Vitest execution.

## Test-first repair and source hashes

- Initial scope/ownership claim commit: `c50a8c2514bd99085a2a5767100ee9d8f1397c62` (additive `docs/ai/ACTIVE_WORK.md` only).
- **Regression committed before repair:** `9cbadb24ba69e0524a66375c1d367662346ddc89`, new test blob `7af991a2a8ba1ed23baa841f91ca6c90ade365b1`. Six lone-surrogate variants, downstream template/import/snapshot entrypoint checks and normal Unicode/control/length neighbors are covered.
- Minimal source fix: `9b422467746789ffc33e865f1fe1dfac5b1b8a62`, repaired source blob `4524f052280fdaf7961379c1e44b8517b334af52`. The only production change adds `c >= 0xd800 && c <= 0xdfff` to the existing forbidden-text check, leaving valid surrogate pairs untouched by the code-point iteration.
- Exact repaired source copied to local runner and independently `git hash-object`-matched to `4524f052280fdaf7961379c1e44b8517b334af52`. Node runner 11/11 focused assertions passed. Separate adjacent probe succeeded 4,107 checks (2,048 individual invalid surrogate units, 2,048 valid paired cases, 11 existing Unicode/control/length neighbors).

**Not run locally:** repository Vitest (dependencies/repository checkout unavailable; local `github.com` DNS resolution fails), package/workspace typecheck/lint, static build, native browser/E2E and full CI. A source-level Node repro with shim is not equivalent to those gates. Test-first GitHub run may be superseded; do not claim failed hosted test CI unless observed.

## Current ownership and integration gates

The three open-PR pages showed **204 open PRs** through #445; their changed-filename inventories were each inspected. Zero own `packages/ux-schedule/src/validate.ts` or `packages/ux-schedule/src/validate.unicode.test.ts`. Related but nonoverlapping work: #420 edits recurrence code/tests; #238/#262/#264/#278/#372 and #224 edit `template.test.ts`. This worker does not touch those paths, or another worker's branch.

The durable lock `refs/heads/automation/ghostpay-integration-lock` (commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`) reports status **held**, generation **11**, owner `994a0d214fb9-root-r3`, and contains a restoration warning against unsupported expiry-only takeover. Expired timestamps do not confer ownership. No lock update, protected-target merge, deployment or release is authorized.

Rechecked PR #390 at `b655bc273a6704c9c140287b8adcdf4085b91882`: CI, Hosting kit, Pages, Beta acceptance and CLI qualification workflows each concluded success on exact head; no independent reviews were recorded. Its GitHub draft flag currently reports `false`, despite its body declaring itself draft/unqualified; it remains open/unmerged with shared-lock and independent-review gates. This worker made **no edits** to #390 or owner-controlled files.

**Before promotion:** verify newly created PR's final exact-head hosted required workflows GREEN and actual package tests, inspect CI logs for source-specific failures, obtain genuine independent review, check ownership/overlap and applicable native browser qualification, then only merge with legitimate released/transferred integration lease. Until all gates hold, leave draft. No dependencies, schema, UI redesign, feature changes, actual wallet/contract/funds interactions, real traffic or publication.
