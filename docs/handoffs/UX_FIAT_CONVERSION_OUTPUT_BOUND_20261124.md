# UX-fiat forward conversion output magnitude — 2026-11-24 UTC

## Scope and evidence
- Base main: `f76904301cff0b24d65ea4e31cbf37d470db4d95`; isolated branch `automation/20261124T0524Z/bug/ux-fiat-conversion-output-bound`.
- `packages/ux-fiat/src/convert.ts` calls checkAmount on input but returns an unchecked computed minor-unit result. The package defines a 78-digit magnitude ceiling; the reverse converter and formatter already reject larger results. At synthetic rate 2 and zero decimals, input 10^78 / 2 is accepted yet output 10^78 is returned as ok and immediately rejected by reverse conversion. The same happens with negative input. No actual financial transaction, user loss, or browser regression is asserted.
- Minimal fix: return the existing checkAmount(divRound(...)) instead of ok(divRound(...)); remove unused ok import. No rounding, valid arithmetic, rate policy, contracts, funds, network, dependencies or other packages changed. The display view already withholds unformattable values.

## Source and commits
- Ownership claim: `3f6b771d06cc62a21f84fb642bf8850e74416483`.
- Regression-first commit: `3f332b87f1cc1b44d9f8d65e57fd0d379253e187`, adds convert.overflow.test.ts before production fix.
- Production fix: `770b884f799a6a2b0705b1b118dd49f10ad91e40`.
- Original source Git blob: `eb038a6ffd4afc390477a2da7ffe43b0b4128f68`; repaired source Git blob: `7670b0aaf3dd9d12b9781025395731e9a94bf116`.
- Real runtime dependencies: decimal.ts `6476b0ff8f2676ed75aea5c972f7d546b4c136bd`, types.ts `248520244534c1c908f6eef802655be10556f2fd`. All four source versions locally hash-matched; repaired production blob also verified on published branch.

## Executed qualification
Local checkout attempt: git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD failed DNS resolution (could not resolve host github.com). No full repository Vitest, lint, build, native browser or repository typecheck claimed.
Isolated exact-source TypeScript 5.8.3 compilation: tsc --target es2022 --module commonjs --strict --outDir before *.ts (and equivalent candidate compilation to after). Both succeeded. Node 22.16.0 assertion harness executed actual production module and two dependencies, no doubles.
- Baseline: 10/13 assertions passed; positive exact boundary, negative exact boundary, and larger output overflow all failed because ok=true.
- Candidate: 13/13 passed. Preserved signed boundary values below ceiling, zero, ordinary forward conversion, signed ceil/floor rounding, input overflow, reverse normal/overflow. Candidate blob equals actual committed source. Harness is equivalent to focused Vitest assertions, not an actual Vitest run.
- Recheck exact head hosted CI, package tests, applicable browser evidence and independent review before merge.

## Ownership and integration
All 317 open PRs in six date partitions through #567 had their changed filenames inspected. No source/new-test overlap. #278/#372/#238/#262/#264 own fiat.test.ts; #504 owns decimal/format/rate and related tests; #511 owns view.ts; untouched. Main ACTIVE_WORK.md contained no relevant claim before isolated addition. Main and latest PR partition rechecked after fix with no observed changes. Claims elsewhere can still change; recheck immediately before any integration.
Integration lock generation 15 released at `4d130107dc2d92b73c6ec73d902ed5a925dc37a6`; not acquired. PR #390 remains open/nonmergeable (GitHub reports non-draft), head `b655bc273a6704c9c140287b8adcdf4085b91882`: five successful workflow groups, Snyk success, zero submitted reviews. Its owner branch untouched.
PR #565 at `68a4e9596062b2144ca5d9da3ff817b73644e2e1`: three successful workflow groups, CI queued, Pages running, Snyk success, zero reviews. PR #557 at `5f280cab9c252cf57a68e2c2d156c07b36d2b018`: four successful workflow groups, CI queued, Snyk success, zero reviews.
No genuine separate verifier available in this execution; self-check is not independent review. Leave draft and unmerged pending exact-head qualification, ownership recheck and legitimate integration authority. No release/deployment.
