# PIR and reconciliation harness compatibility — 2026-11-24

## Exact source and accepted scope

Branch `integration/pir-idb-compatibility-20261124`, isolated from
`20d12d860bed893d1c29215ea4f4131bdc75a5d7` (tree
`d74b4fe326564b347d8b4738ab872e39a6a3906c`). Claim before edits:
`a0e4892888f7c408f337df26e6ce7a5ab0620511`. Tested source is
`01983844a343f5dc8226cc4df2e7fa942cd10e45`, tree
`da2691b692fd19f5850ed6f2e0c39a429560ca33`. A later commit adds only this
handoff. Root owns independent review, final composition and hosted gates.

| Recovery | Local commit | Selected donor scope |
|---|---|---|
| PIR terminal-separator normalization | `dd809454e6f4167b7db77744bce1e4a1301d7c73` | Only `client.ts` and the ordinary URL/path/endpoint compatibility case from `d37b0ab37d0e9968bda21c57bd18d78c2897487d` |
| Reconciliation IndexedDB harness API | `01983844a343f5dc8226cc4df2e7fa942cd10e45` | Only the invalidation-call/assertion block from `6e48ce51ac6b550c998d0331fc7692621dcf174d` |

## Preservation evidence

PIR now scans only the terminal slash run and slices at its start. Everything
before and after that normalization block in `client.ts` is byte-identical to
the base, including scheme/host and three-chain validation, same-operator
checks, transport options, fixed errors, GET/POST endpoints, padding, protocol
and server behavior. The resulting production blob `3f465628e6a5d08d746d187ab9e26bae737d77e0`
exactly matches the donor. The recovered ordinary test checks no suffix, one
slash and several slashes while preserving an interior double slash and both
endpoint paths. **The donor timing/stress case and unrelated Settings fixture
were not imported or run.** No server API, dependency or feature activation.

The current portable API requires
`invalidateFrom(block, observed, canonicalHash)`; its implementation maps the
observations and reads canonical hashes for stored valid observation heights
at or above the requested block. The old harness supplied only the block. The
recovered call supplies an empty observation list and a canonical-hash callback
for the existing height-120 record; it asserts exactly `['120']` was requested.
The other tab must still observe `invalidated-after-reorg`.

Everything outside this one API/assertion block in the native script is
byte-identical to the base. All original exact-ciphertext CAS, two-tab race,
stale-session, stored-ciphertext, notification and local-only-egress checks
remain. Browser selection is unchanged:
`GHOSTPAY_CHROMIUM` or `/usr/bin/chromium`. The donor executable-discovery hunk
and `existsSync` import were excluded because the API repair does not require
them. No assertions, workflows or qualification gates were weakened.

## Completed local qualification

All six package/unit/syntax gate commands passed on the exact source above.
Node `v24.22.3`, npm `11.19.1`; unit suites used one worker. Installed external
dependencies were reused with checkout-local workspace links and base-equal
dependency outputs. PIR was rebuilt in this checkout.

| Check | Actual result |
|---|---|
| Complete PIR suite with original coverage thresholds | **61 tests / 4 files passed**, no skips |
| Existing reconciliation suites | **88 tests / 5 files passed**, no skips |
| PIR build | Passed |
| PIR full typecheck | Passed |
| PIR full lint | Passed |
| Native script JavaScript syntax | Passed |

Total: **149 unit tests across 9 files**. PIR coverage is **99.15% statements,
93.33% branches, 98.76% functions, 99.74% lines**, above unchanged
95/90/95/95 thresholds. `git diff --check` passed.

Commands from the task root:

```sh
npm run build -w @ghostpay/pir-two-server
npm run test -w @ghostpay/pir-two-server -- --maxWorkers=1
npm run typecheck -w @ghostpay/pir-two-server
npm run lint -w @ghostpay/pir-two-server
node --check apps/web/scripts/test-reconciliation-idb.mjs
```

Existing web tests, from `apps/web`:

```sh
../../node_modules/.bin/vitest run src/lib/reconciliationVault.test.ts src/lib/reconciliationVault.idb.test.ts src/lib/reconciliationVault.invoices.test.ts src/lib/reconciliationLedger.test.ts src/lib/reconciliationMatch.test.ts --maxWorkers=1
```

## Native qualification remains blocked; direct CI invocation absent

One unmodified native attempt ran `node scripts/test-reconciliation-idb.mjs`
from `apps/web`. It exited **1** after about 1.5 seconds, before the test
assertions: Chromium startup reported
`socket() failed: Operation not permitted (1)` and a related ptrace permission
error. The selected `/usr/bin/chromium` exists and is executable. This is a
blocked native launch, **not a native pass or evidence that the repaired
assertions executed**. No browser workaround or fallback retry was attempted.

At this source, no tracked workflow directly invokes this standalone harness.
`apps/web/package.json` runs Vitest for unit tests and `playwright test` for
E2E; `apps/web/playwright.config.ts` collects `./e2e`, not this script. The
standard jobs in `.github/workflows/ci.yml` and `.github/workflows/pages.yml`
invoke those package commands; their success cannot be reported as a pass of
this standalone check. A permitted native worker still needs to run the
unchanged harness successfully to qualify its two-tab IndexedDB assertions.
No workflow changes were made.

The coordinator's scratch `pir-idb-qualification/results.json` and per-gate
logs retain commands, pins, exit codes and the blocked native result. No remote
ref, donor branch or root working-tree mutation occurred.
