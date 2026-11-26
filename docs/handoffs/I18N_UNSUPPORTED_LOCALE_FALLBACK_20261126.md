# Unsupported formatter locale fallback — bug-only repair

- Base main: `a9d2a033c1055c59765b388a02512c6285764dae` (PR #694 merged).
- Branch: `automation/20261126/bug/i18n-unsupported-locale-fallback`.
- Ownership claim: `b6ff9129e816cf1aa1e278ead93a58770fce9770`.
- Regression-first commit: `df77ab4f2a4c69f8868d0d0add76d0b130ea6e0b`.
- Minimal production fix: `583ce9187eb92ea55c33b3e8f851c8a63995d16e`.
- Regression blob: `2e46d7f634909bdee1c151ed71b0d08036690719`; fixed formatter blob: `5ee08e4b9f02fe928d60906a9132ab25dd1fe065`.

## Observed failure and root cause

The number/date formatter documents English fallback for invalid or unsupported locales. A syntactically valid unsupported tag such as zz silently falls back to the host locale in native Intl; no RangeError is thrown. With LANG=de_DE.UTF-8, number 1234.5 renders as 1.234,5 instead of 1,234.5, and epoch 0 renders as 01.01.1970 instead of Jan 1, 1970. The injected-Intl regression simulates that host behavior without relying on the CI machine locale. This is a package display-correctness defect; direct Pages runtime impact is not established.

The smallest repair selects English when the relevant formatter's supportedLocalesOf returns no matches. Preserve supported and malformed locale handling, existing RangeError fallback, UTC default and option validation. No amount arithmetic or parsing changes.

## Actual verification

Exact source files copied into an isolated local directory, Git blob hashes verified against current main:
- format.ts b360261799723236f71af98648e04abff1f0e993
- intl.ts 9b6ccb06828bd0313f6f230412381af6a70c1a18
- locale.ts f9a80f040a505ed2017d2708f388b97990c46cc8
- errors.ts 6bd1791dfe0b0ec26baddd17f3e7987e9dc61160

Node v22.16.0, TypeScript 5.8.3. Compile: tsc --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2022 --module commonjs --outDir out *.ts (four source files only). Baseline LANG=de_DE.UTF-8 node probe.cjs: 8/12 passed, four failures (native and injected number/date). Repaired: 12/12 under de-DE and 12/12 under en-US. Checks include supported/invalid locales, RangeError fallback and bad options. Strict isolated source compilation passed. Published formatter blob matches locally tested repair. The committed Vitest file was not run locally; full repository checkout cannot resolve github.com. No local full Vitest, lint, build or browser pass claimed.

## Coordination and gates

Read current AGENTS.md, STOP_WORK_20261125.md, WORKFLOW.md, HANDOFF.md and ACTIVE_WORK.md. 223 open PR file inventories from nontruncated date-partitioned searches, plus #697–699, checked with no path under packages/i18n/src/ux; no direct main ACTIVE_WORK claim for format.ts. Recheck current heads and claims before integration. Integration lease generation 40 observed released at 2e458b88bc13b4ce559b8b9742ed7413ded3b2b4; not acquired. PR #390 already merged; its exact head b655bc273a6704c9c140287b8adcdf4085b91882 had 5 successful workflows, 32 successful jobs, 3 skipped, Snyk success, no submitted review. No change to its branch.

Draft only pending exact-head hosted CI, applicable native browser qualification, genuine independent review, refreshed ownership and legitimate integration lock. No dependencies, features, archived products, payment/fund/contract interactions, deployment or release changes. All ten stop-work exclusions remain binding.
