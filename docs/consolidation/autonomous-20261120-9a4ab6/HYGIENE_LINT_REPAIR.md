# Minimal lint repair for the existing hygiene evidence tests

## Result and ownership

The isolated correction at `5c0b698a16a9b3303357a90b4e80d674b8da3c0b` removes the
seven existing typed-ESLint findings in one test file. The original package lint,
all 149 existing coverage tests and package typecheck pass on that corrected
source. Existing [PR #339](https://github.com/djshellshoxxx/GhostPay/pull/339)
remains the authoritative feature implementation; this branch is a small stacked
test maintenance contribution, not a second implementation.

- Branch: `test/ghostpay-hygiene-lint-20261120-9a4ab6`.
- Exact baseline: `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4`.
- Ownership claim: `8ce674be` before editing the test.
- Worker: `/root/hygiene_lint_repair`, delegated by `9a4ab6c3d117-root`.
- Only changed product path: `packages/hygiene/src/verify.evidence-boundary.test.ts`.
- All production source, dependencies, configuration and existing test assertions
  remain unchanged. No tests were added, skipped, suppressed or removed.

The separate source-preserving qualification of the baseline found six
`@typescript-eslint/no-unnecessary-type-assertion` errors and one
`@typescript-eslint/require-await` error. Its 256 MiB lint process exhausted its
heap; the permitted 512 MiB retry completed and reported these seven errors.
That earlier failure is retained by the coordinator in the original qualification
packet. This worker started the same lint command at the already established
512 MiB setting and needed no retry.

## Exact correction and fixture semantics

The seven replacements remove one redundant `VerifyRpc` assertion and five
redundant address assertions, and replace the RPC fixture's `async () => rows`
with `() => Promise.resolve(rows)`. The declared `VerifyRpc` return type still
checks the object structurally. Contextual argument typing accepts the original
literal address types without assertions; package typecheck verifies that result.

The rest-argument value `rows` is the same ordinary array captured by the helper
in both versions. Each request still returns a promise fulfilled with that exact
array, and each existing caller still awaits it. Neither version performs I/O,
mutates the array, or adds a timer. This change retains the fixture's asynchronous
promise contract and does not alter any response data or expected result.

`HYGIENE_LINT_SOURCE_PROOF.json` records an exhaustive comparison against the
baseline: the complete new file equals the old file with only those seven
replacements; all test names, input values and assertions are preserved; and the
other 24 tracked hygiene files are byte-identical. The runtime and build inputs
are unchanged. No baseline vulnerability reproduction was performed or needed.

## Executed qualification

Commands ran from this isolated worktree on exact source
`5c0b698a16a9b3303357a90b4e80d674b8da3c0b`, with no uncommitted tracked source
changes. Node was `v24.22.3`, npm `11.19.1`, Vitest/coverage-v8 `5.0.5`,
TypeScript `5.9.3` and ESLint `10.15.0`.

| Original command | Resource setting | Actual result |
| --- | --- | --- |
| `npm run lint -w @ghostpay/hygiene` | 512 MiB heap | Exit 0; no lint findings. |
| `npm test -w @ghostpay/hygiene -- --maxWorkers=1` | 256 MiB heap | Exit 0; 6/6 files, 149/149 tests, no skipped tests; all original coverage thresholds pass. |
| `npm run typecheck -w @ghostpay/hygiene` | 256 MiB heap | Exit 0, including the changed test's inferred types. |

The original 60-second timeout, fork pool, coverage include/exclude patterns,
assertions and thresholds remain unchanged. Limiting worker concurrency is the
only test CLI override. No gate was weakened.

| Coverage | Actual | Original minimum |
| --- | ---: | ---: |
| Statements | 99.52% (419/421) | 95% |
| Branches | 99.1% (333/336) | 90% |
| Functions | 100% (74/74) | 95% |
| Lines | 100% (334/334) | 95% |

The original package build passed on baseline `d03600ca` in the independent
qualification worktree. Its command and complete output are preserved in
`HYGIENE_LINT_BUILD_REUSE.json`. This correction changes only a test explicitly
excluded by `tsconfig.build.json`; all other package files and build inputs match.
The source-pinned build evidence is reused on that basis. A new build execution
on this correction branch is not claimed. Full-monorepo, hosted CI, browser,
Node 22 parity and release qualification remain separate gates.

## Dependency and evidence provenance

`HYGIENE_LINT_DEPENDENCIES.json` contains the complete preceding qualification's
matching-dependency proof and this worktree's additional checks. Twenty relevant
configuration/manifests match; the full lockfile and all 678 external records
match. The 117 tracked dependency TypeScript/JSON inputs and 150 compiled output
hashes match before those outputs are reused. External dependency files are
hardlinked into separate directories, caches are excluded, and all workspace
links resolve inside this worktree. Compiled dependency outputs were copied
independently. This is a matching cached installation, not a fresh `npm ci` run.

An initial completeness check found seven missing locked paths in two unrelated
nested workspaces before any test execution. Both matching dependency trees were
copied from the coordinator's complete cache; the final check finds no missing
nonoptional locked path. No manifest or dependency version changed.

`HYGIENE_LINT_LINT_RESULT.json`, `HYGIENE_LINT_COVERAGE_RESULT.json` and
`HYGIENE_LINT_TYPECHECK_RESULT.json` preserve exact commands, source SHA,
environment overrides, UTC times, exit status and complete output with SHA-256
hashes, both readable and losslessly base64 encoded. `HYGIENE_LINT_LCOV.json`
preserves the complete coverage result. Terminal blank lines remain inside the
encoded data instead of becoming whitespace defects in newly committed raw logs.

## Integration boundary

This worker did not push, open a PR, modify #339's shared branch, acquire the
integration lease or merge any contribution. The coordinator independently reviewed exact correction
`5c0b698a16a9b3303357a90b4e80d674b8da3c0b` and approved the source change: the
six assertions are redundant, the promise fixture preserves the captured array
and asynchronous contract, and assertions, production behavior and gates remain
unchanged. This source review is distinct from the tests executed by this worker.
Publication remains coordinator-owned as a stacked change into the existing #339
branch; hosted checks must qualify the actual composed head before integration.

The hygiene package still evaluates provider evidence. This test lint correction
does not establish independent chain finality or live-provider compatibility.
Package qualification also does not install the separate privacy stack's browser
callers into recovered-fixes/#307. No browser, wallet, live RPC, transaction,
deployment or release action was executed here.
