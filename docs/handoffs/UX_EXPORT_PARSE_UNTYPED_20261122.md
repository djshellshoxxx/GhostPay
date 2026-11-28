# GhostPay BUG-ONLY r10 — runtime type coercion in CSV amount parser

Date: 2026-11-22 UTC. Worker: ChatGPT sequential bug repair; no separate human or independent CI verifier.

## Source and ownership
- Repository/main: `djshellshoxxx/GhostPay`, live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da` (rechecked before creating the task branch).
- Branch: `automation/20261122/bug/ux-export-parse-nonstring-r10`.
- Owned scope: `packages/ux-export/src/amount.ts`, new `packages/ux-export/src/amount.runtime-types.test.ts`, this new handoff, additive `docs/ai/ACTIVE_WORK.md` claim. No other production, dependency, workflow, Pages app, or release paths changed.
- Pre-repair source Git blob: `4b10f141d29651eacfceee7af80b539c6e8c0c75`. Shared error source blob: `6d10133c45cc817fb7c95952f58b2a7b5a6f33cb`. Exact upstream source bytes and these blob SHAs were reproduced by `git hash-object` in an isolated local TypeScript compilation.
- Open PRs: inspected live titles/bodies, R39's 224-PR paginated head overlay, related changed filenames including #220/#238/#243/#246/#251/#260/#262/#264/#265/#270/#278/#289/#310/#312/#324/#372/#390/#391/#396/#398/#407/#444/#465/#466, and searches for this path/name. No direct claimed collision was observed in these inspected subsets. **Exhaustive per-file checking across every open PR remains a merge gate.** Broad/consolidation work is not owned here.

## Observed failure / root cause
- Public `parseUnits(text: string, decimals)` documents strictly parsing *untrusted decimal strings* and producing `ExportError('INVALID_AMOUNT')` for rejected amounts.
- Its `text.length` bound and `UNSIGNED.exec(text)` did not check the runtime type. JavaScript RegExp.exec implicitly calls ToString, so numeric `7` was **accepted as `700n`** at 2 decimals; `1n` and `['1']` were also accepted as `100n`; a boxed string and custom ToString object also passed. `null`, `undefined` and `Symbol` produced native TypeError rather than the declared typed error.
- This can silently accept malformed imported/caller-supplied runtime values; no actual fund interaction was performed or claimed.

## Test-first sequence
1. Ownership claim commit `1ea8441edc8944e5a82956224e0a616683b358fc`.
2. New focused Vitest regression committed **before source correction** at `09023cc4bb14a28a15f6360915527cdc88ad9f16`. It asserts `ExportError` and `INVALID_AMOUNT` for nine non-string cases, plus canonical/noncanonical neighboring strings.
3. Isolated exact-source TypeScript 5.9-independent compilation using installed `tsc` and Node v22.16.0, no third-party npm dependencies: `tsc --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --outDir dist source/errors.ts source/amount.ts`. Pre-fix Node assert harness: **8 failing of 19** runtime/neighbor assertions. These are source-identical compiled module checks, **not** the repository Vitest run.
4. Smallest source fix: an early `typeof text !== 'string'` guard using existing `ExportError('INVALID_AMOUNT', 'amount is not a plain decimal number')`, committed `d3759047614f3f7e814fcd041cf92c04a0e6b581`.
5. Exact corrected source Git blob `6b9b7e3761e2b837b139dd0579dc3c90d1c8ae59`, GitHub published blob matched to the local recompiled and tested file. Same isolated Node harness: **19/19 pass** (nine nonstrings, four valid canonical amounts, six invalid canonical forms). This local run does not prove full build/lint or native Playwright behavior.

## Cross-PR review and lock
- PR #390 (`b655bc273a6704c9c140287b8adcdf4085b91882`), rendered invoice text limit: five exact-head hosted workflow runs (CI, Hosting kit, Pages, Beta acceptance, CLI qualification) concluded `success`; Snyk commit status `success`. `list_pull_request_reviews` returned no submitted reviews; its branch was left unchanged, as no proven defect required an edit. At inspection #390 was **open, not draft**.
- Dedicated integration metadata branch `automation/ghostpay-integration-lock` still contained `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`; `generation: 11`, `status: held`, owned externally. Its recorded expiry is in the past but is **not authorization to take or break the lock**. Do not merge.

## Pending qualification before merge
- Verify exact final PR head GitHub CI, Pages, Hosting kit, Beta acceptance and CLI workflow results; inspect actual job failures rather than assuming success. Obtain independent review from a genuinely separate verifier; check relevant native browser verification where applicable, and record it explicitly if not run. Refresh full per-file PR ownership and main/PR heads and obtain legitimate coordinator-owned/released integration lock.
- No local repository dependency installation, Vitest, package lint, full workspace typecheck/build or native browser run was performed here. No production traffic, real funds, deployment or release were involved.
