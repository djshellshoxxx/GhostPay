# BTC integration: source and qualification receipt

## Source disposition

Product head: `e741aa8e8228a2099ee5abe3fd73aa14ffb011b8`.
Branch: `codex/ghostpay-btc-consolidation-20261119`.
Base: `66e707d0676caa26e074c7e5e9f5db0285f6ca62`.
PR #254 `8c1d87a2587281c32a5f1326a4f36cfada4384bc` is retained through merge
`7ffb97af3a5b28cedc65dd6ed36204cf3e7e4352`, including original #219 ancestry.
PR #244 `2364284a2717a22b895fcb7badeb2e7ae6bb0e48` remains a separate branch;
its distinct short-header and delayed-wallet-load cases were selectively recovered.
No remote branch, PR, mainnet transaction, deployment or release was changed by this worker.

### Resolutions

- Use #254's existing block-input scanner, per-match continuous spending evidence,
  bounded historical recovery and worker request/result consent contracts. Retire the
  older parallel `watchOutput`/`spendStatus` path inside these overlapping web files.
- Keep master action-bound RPC/indexer grants, authority revocation subscription,
  cancellation signals and bounded response handling. Preserve HTTP status-only error
  classification without exposing response bodies. Broadcast cancellation and valid
  deadline checks are retained by the follow-up `894ffc81`.
- Full scans do not silently query found outputs. Optional provider checks require the
  explicit scan setting; light mode discloses and requires its provider/proof path.
  Signing itself does not add an undisclosed outpoint request. Broadcasting remains
  separately authorized. Update inherited tests and current user disclosures accordingly.
- Shorter reloaded headers exposed a #254 gap already covered by sibling #244:
  a payment below the shortened tip could retain local negative-spend authority despite
  an unchecked later suffix. The recovered regression failed with `local` instead of
  `unknown`. Header invalidation and both UI selection/retained-handler guards now require
  an exact checked-tip match for local evidence. Canonical discoveries remain visible.
- Retain independent old-wallet/new-wallet delayed-header coverage from #244.
  Keep original complete-block, forged-coinbase, same-block and multi-input spend cases;
  replace obsolete private-source API assertions with equivalent current scanner and
  explicit-provider behavior. No test timeout, coverage threshold or security gate changed.
- Update the exported verification text to match the approved catalog; the inherited
  source/catalog mismatch was caught by the existing exact-parity test. Refresh the
  existing Bitcoin overview and link the new detailed spent-status guide.

## Executed evidence

Node 22.23.4, TypeScript 5.9.3, Vitest 5.1.0. Tests use one worker and no file parallelism.
The external dependency tree was copied from the coordinator-verified exact-version cache.
Thirteen other package dist trees were reused only after their non-test source,
package manifest and TypeScript configuration matched this checkout byte for byte.
BTC plus four unmatched dependencies (PIR, policy scheme, scan source, TRON adapter)
were rebuilt. `evidence/btc-build-cache-check.json` records the selection.

| Command / scope | Actual result | Attribution |
| --- | --- | --- |
| TypeScript build, BTC and four required dependencies | Exit 0 | Current source; no broad workspace rebuild |
| `tsc -p packages/btc-silent-payments/tsconfig.json --noEmit` | Exit 0 | BTC source/tests remain unchanged through product head |
| Recovered short-header regression before correction | 1 failed, 31 filtered skips | Expected `unknown`, received `local`; real baseline failure preserved |
| Library `state`, `scanner`, `headersync` suites | 69 passed, 3 files | These library source/test files remain byte-identical at product head |
| Initial complete BTC web selection | 266 passed, 4 failed, 1 skipped; 25 files | Exposed two old sign-query assertions, broadcast signal loss, and inherited source/catalog mismatch |
| Corrected BtcView, isolation, headers and header-ownership selection | 93 passed, 5 files | Started at `894ffc81`; selected code/tests unchanged by the later disclosure-only adjustment |
| Exact disclosure parity, Esplora and local-spend selection | 46 passed, 3 files | Product head `e741aa8e` |
| Typed ESLint, 512 MiB heap | Exit 134, V8 heap exhausted | Incomplete; no pass claimed |
| Same typed ESLint, 1024 MiB heap | Exit 137, process killed | Incomplete; no rule or configuration relaxed |
| `git diff --check` | Exit 0 | Clean committed source |

All four failures from the initial web selection were corrected and their affected
files rerun successfully. The initial full selection was not rerun wholesale after
those corrections; the overlapping counts above are not added into an invented
single-pass total. Its one skip is the existing live-bitcoind test requiring explicit
URL/seed/destination environment inputs. None were provided or bypassed.

Exact commands use the existing configs. From `packages/btc-silent-payments`:

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' node ../../node_modules/vitest/vitest.mjs run src/scan/state.test.ts src/scan/scanner.test.ts src/scan/headersync.test.ts --maxWorkers=1 --no-file-parallelism
```

From repository root, the successful final web selections were:

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' node node_modules/vitest/vitest.mjs run --root apps/web src/features/btc/BtcView.test.tsx src/features/btc/esplora.isolation.test.ts src/features/btc/headers.test.ts src/features/btc/BtcView.headers.test.tsx src/features/btc/BtcView.headerOwnership.test.tsx --maxWorkers=1 --no-file-parallelism
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' node node_modules/vitest/vitest.mjs run --root apps/web src/features/btc/verification.i18n.test.ts src/features/btc/esplora.test.ts src/features/btc/scan.localSpends.test.ts --maxWorkers=1 --no-file-parallelism
```

The `node` executable for these commands was
`/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node`.
`EVIDENCE.json` pins source files and retained logs by SHA-256.

## Remaining qualification

Coordinator source review covered the key merge resolutions at `7ffb97af`; the
follow-up API cancellation and disclosure corrections are supplied with their actual
regression results for final review. The repository-wide combined tree still requires
its normal typecheck, typed lint, coverage, full/lean Chromium, Pages artifact and
security/analyzer gates. This worker did not run a new full web build or browser
acceptance: existing Playwright setup starts the complete web build, and additional
broad builds were stopped during resource contention. No browser, live-node,
physical-device, release or main-merge qualification is claimed here.

Shared network-egress inventory updates are owned by the coordinator and must reflect
explicit optional output queries and the absence of an automatic sign-time query.
