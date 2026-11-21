# PR #340: current-main TRON qualification

Date: 2026-11-20 Pacific / 2026-11-21 UTC. Worker: `/root/tron_refresh`.
Coordinator: `5ceb6203640a-root`; shared integration lease generation 12.
Status: local integration and applicable local checks completed; independent review of this
composition and new exact-head hosted checks remain required. No remote mutation occurred.

## Source and ownership

- Existing PR #340 starting head: `b86a3e6affe8b71c6f13d16783accad446271ba4`, after #342 merged.
- Dedicated local branch: `repair/ghostpay-tron-main-20261121-5ceb`.
- Ownership recorded before source edits: `bd0aeeddfbdcb68491e4d8eed1d9b32d37ef993d`.
- Main input: `aec179910c39081d820396409ff3139ff2264132`.
- Qualified application/test source: `ae7498b43065e0030e47ba23d473073f5d862b3d`.
- Source tree: `f1bb9aefdbe6cf6e59ea81e31040ed1f2337b81d`.
- Normal merge parents: ownership commit `bd0aeeddfbdcb68491e4d8eed1d9b32d37ef993d`
  and main `aec179910c39081d820396409ff3139ff2264132`. All original source parents remain reachable.

## Resolution

Main's adapter now rejects an omitted genesis block as a strict incomplete range before
the view's later first-block check. The earlier #342 test still expected the later error.
The resolved `chain.hardening.test.ts` retains main's `{ code: 'INVALID_RESPONSE' }`
expectation and supplies #340's required explicit `'local'` selection. Main's three
incomplete-page regressions, selected Nile/Shasta tuple loop, mainnet refusal and all
original assertions remain present. Both additive `ACTIVE_WORK.md` sections were retained.

The runtime files `TronView.tsx` and `rpc.ts` are byte-identical to the already reviewed
#340/#342 source. No dependency, workflow, contract, network policy or mainnet flag changed.
Current main's TRON adapter completeness and cancellation code is preserved exactly.

## Executed checks

All commands ran in the isolated worktree with Node `v24.22.3` and exited zero.
Original repository configurations, assertions and coverage thresholds were retained.

| Command | Actual result |
| --- | --- |
| `npm exec -w @ghostpay/web -- vitest run src/features/tron --maxWorkers=1 --no-file-parallelism` | 5 files, 66 tests passed, zero skipped |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web` | Passed, no diagnostics |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run lint -w @ghostpay/web` | Passed, no lint errors or warnings |
| `NODE_OPTIONS=--max-old-space-size=1536 GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web` | Full production build and unchanged postbuild scan passed; 19 files scanned |
| `npm test -w @ghostpay/tron-adapter -- --maxWorkers=1 --no-file-parallelism` | 10 files, 107 tests passed, zero skipped; original coverage thresholds passed |
| `npm run ci:scan-secrets` | Passed; no committed environment files or key material found |
| `git diff --check aec179910c39081d820396409ff3139ff2264132..HEAD` | Passed for the qualified source |

Adapter coverage: statements 97.04%, branches 93.36%, functions 98.93%, lines 99.11%.
The full build reports existing nonfatal chunk-size and ineffective dynamic-import notices.
No warning thresholds were changed. No new RED test execution is claimed for this merge;
the existing selected-genesis and current-main completeness regressions were run together.

Dependencies and compiled libraries came from the coordinator's fresh current-main setup.
Before reuse, Git proved `package.json`, `package-lock.json`, all `packages/`,
`tsconfig.base.json` and `scripts/build-workspaces.mjs` identical to the main input.
Both source trees have package tree `75c9c5997fe21b775ec1262928d37724c182e6e3`.
Local symlinks refer to those exact existing dependency/artifact locations; no package version
or source was modified. This worker did not perform a separate installation.

The companion [machine-readable receipt](TRON_CURRENT_MAIN_20261121.json) records exact
commands, exit codes, log SHA-256 values, changed paths, source-file digests and output artifact
digests. Raw logs remain in the coordinator's `tron-refresh-evidence` directory.

## Remaining gates and next actions

1. Independently review the source-pinned merge and both conflict resolutions.
2. Recheck live #340 ownership/head, then publish this descendant to the existing #340 branch
   without force. Do not open a duplicate feature PR.
3. Run the applicable hosted checks against the exact published combined source and current
   main before mainline integration. Earlier child CI does not qualify this composition.

No local Chromium, Firefox or WebKit E2E run, new hosted run, live RPC test, real-funds operation,
release, deployment or independent review of this final composition is claimed here.
The selected-genesis guard prevents accidental chain mislabeling; an untrusted RPC can still
fabricate data. TRON remains an optional full-profile testnet component.
