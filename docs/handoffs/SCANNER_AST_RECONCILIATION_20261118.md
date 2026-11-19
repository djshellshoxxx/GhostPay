# Source-sink scanner reconciliation — 2026-11-18

## Scope and provenance

The postbuild source scan could erase real executable sinks when a nested
template, regular expression, or JSX text contained comment-like text. The
handwritten comment stripper also missed compound/string-keyed assignments and
parenthesised dynamic evaluation, and treated inert examples as executable code.
These are defects in a build-time defense-in-depth check; they do not establish
that the application currently executes an unsafe sink.

- Base main: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
- Historical source: `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6` on
  `claude/lucid-meitner-apalzc`.
- Reconciled implementation/test commit: `aea09fc8c57c00bcfe6cef9c85cd4414962c2a2f`.
- Implementation tree: `a683060fe8daba46ce48259e9c4afb39443d9f0b`.
- Repair branch: `repair/ghostpay-history-scanner-20261118-local`.

Only the historical source-sink AST function and declaration were extracted.
Regression cases were expanded into individually executed cases. The historical
commit's unrelated pool-relayer and contract-scanner changes were not imported.
Open PRs #209 (`b5e2ea3e5030b56c79063eb1f91c8a634ee5d740`) and #238
(`198aa5baff22272453733a0f3dcfcac0e0994eec`) still contained the broken stripper
when inspected. Their original branches were left untouched.

## Resulting behavior

The existing TypeScript 5.9.3 development dependency parses each eligible source
file as TS or TSX. The scanner walks syntax nodes and reports the existing
dangerous HTML and dynamic-evaluation categories, including compound and literal
computed HTML assignments and parenthesised/indirect eval calls. A parse error
is itself a finding. Comments and inert text cannot erase later syntax nodes.

The function checks syntax rather than aliases or data flow. It retains the
existing source-file selection and test exclusions. The built-artifact, HTML,
CSP, deployment, origin, worker-network and lean-boundary checks are unchanged.
No runtime import, manifest/lockfile update, new dependency, workflow edit,
security suppression or release activation is included.

## Executed validation

| Check | Outcome |
| --- | --- |
| Added regressions against original source | **10 failed / 44 passed**, proving all ten new cases before implementation |
| Scanner plus privacy-invariant suites, Node 22.23.5 / Vitest 5.0.5 | **88 passed / 0 failed / 0 skipped** |
| Same focused selection, Node 24.22.3 | **88 passed / 0 failed / 0 skipped** |
| AST scan of the current eligible production source tree, Node 22.23.5 | **173 files, zero findings or parse errors** |
| Type-aware ESLint of `src/scanBundle.test.ts` | Passed |
| `node --check apps/web/scripts/scan-bundle.mjs` | Passed |
| Secret scan | Passed |
| Action pin check | **111 references passed** |
| `git diff --check` | Passed |

The focused test command, from `apps/web` with the recorded Node runtime, was:

```sh
node ../../node_modules/vitest/vitest.mjs run src/scanBundle.test.ts src/privacyInvariants.test.ts --coverage=false
```

Existing dependencies were reused from a complete installation with an identical
lockfile. Local workspace links pointed into the repair worktree; caches were
local. The chain-adapter workspace and its dependencies were built from this
worktree for the unchanged Vite configuration. This is not a fresh-install or
whole-workspace build qualification. Initial missing-install/configuration
startup failures were resolved before recording the test results above.

## Independent review and integration

Independent reviewer `ci_inventory` found **no blocking findings** at implementation
commit `aea09fc8c57c00bcfe6cef9c85cd4414962c2a2f` and its recorded tree. The reviewer
independently passed 28 additional probes: 20 forbidden-syntax cases and eight
benign string/regex/JSX/comment cases. The review also verified that every
non-source-scan guard is byte-identical to main. A separate reviewer-run focused
suite under Node 22.23.5 / Vitest 5.0.5 passed **88/88, zero skipped**, in 12.46s.
This is independent AI-assisted engineering review, not an external security audit.

Status: **REPAIRED — VALIDATION PENDING**. The lead coordinator owns the final
combined-tree review, hosted CI, refreshed merge simulation and any publication.
No remote branch, PR, main merge, deployment or analyzer disposition was changed
by this workstream. Existing Mythril/security gates remain enforced.
