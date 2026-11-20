# Combined AST scanner reconciliation

Status: source reconciled and focused tests passed; full combined build, coverage,
lint and exact published-head hosted CI remain qualification gates.

## Source and scope

- Base master: `435c6e6bca463f83b6c55a2063f8c18c546c3c22`.
- Reconciled source/test commit: `3a76ca27406a875a6cab00987624c31b4c79cb92`.
- Concurrent PR247: `20207a930336da95e78ad1d6f4987b3c74fc535a`.
- Source implementation: `81614e56150af1787c79eb70026e778758918f23`.
- Historical detector: `016fa2521f7cd7c1cfbe763aaf658e32f6e27be6`.

The concurrent branch supplies a coherent AST detector and ten regressions, but
its base predates master enhancements. Only the TypeScript import, source-sink
function, source-file loop, exported declaration and new regression block were
selected. Whole-file replacement would lose the all-HTML scan, exact own-origin
option, legacy-manifest checks and shared lean-module report checks.

Mechanical comparisons prove the remainder of the script and every existing
scanner test are byte-identical to the pinned master. The fourth `scanBundle`
options parameter and its TypeScript declaration remain intact. The selected AST
function and regressions exactly match PR247. No dependency, lockfile, workflow,
contract, activation or analyzer-disposition change was made.

## Executed checks

| Check | Result |
| --- | --- |
| New tests against unchanged master scanner | 10 failed / 87 passed, reproducing the defects |
| Combined scanner and privacy suites | 97 passed / 0 failed / 0 skipped across two files |
| Eligible production TS/TSX source AST scan | 184 files, zero findings or parse errors |
| `node --check apps/web/scripts/scan-bundle.mjs` | Passed |
| `git diff --check` | Passed |
| Protected master code and existing tests | Exact byte equality outside selected edits |

Node24.22.3, Vitest5.1.0, Vite8.3.8 and TypeScript5.9.3 were used. Dependencies
were borrowed from the master's existing `node_modules`, matching the pinned
combined lock versions; no fresh installation is claimed. The focused tests use
a separate Node-environment configuration, one concurrent worker and a 768MB
Node heap bound, with coverage off. They directly load the reconciled scanner
and source privacy checks; they import no compiled GhostPay workspace package.
The separate configuration avoids the unrelated unfinished workspace build.
These results do not qualify the complete application or replace its gates.

Command, from `apps/web` (configuration and logs retained in the coordinator audit
workspace):

```sh
NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run --config /workspace/scratch/9b4050d15a9b/audit-data/history-scanner.vitest.config.mts --coverage=false
```

Detailed identities, comparison assertions and results are in
`SCANNER_AST_VALIDATION.json`. The control and passing logs are respectively
`audit-data/history-scanner-red.log` and `audit-data/history-scanner-green.log`.

## Review and promotion boundary

History reviewer directly inspected PR247's exact source, historical detector,
master overlap and regression cases; no blocking source finding remains in this
selected reconciliation. This is AI-assisted engineering review, not an external
audit or general JavaScript dataflow proof. Detection remains syntactic.

PR247 was observed as draft and mergeable against its main base; its hosted CI
was queued/partially complete, so no complete hosted green claim is made. This
work did not modify a remote branch, close a PR or delete historical source.
The coordinator owns combined-source promotion, current-head rechecks and any
published qualification. PR245 pool guards are reviewed separately and were not
duplicated in this worktree.
