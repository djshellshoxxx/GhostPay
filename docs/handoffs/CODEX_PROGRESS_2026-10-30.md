# GhostPay development checkpoint — 2026-10-30

Base: PR #37 at `dfd5cbdd94d982985c73551355906723ac70a97e`. This session used an isolated checkout of that branch. The original Codex cloud environment was not reached: the browser was signed out. No original Claude container state was accessed.

## Implemented slices

| Commit | Behavior |
|---|---|
| `46d78b1` | A sweep whose deadline expires in the queue or during an order-state RPC read is refused as `deadline_too_soon`, without attributing an expired permit to the owner. Existing final pre-send checks remain. |
| `286d320` | Explicit keystore cancellation resets the file picker; retrying the same file works. Import/unlock completion recognizes its own installed session while cancellation, edits, unmount and replacement sessions invalidate it. Failed vault saves refresh actual-store controls. |
| `ef9c870` | Operator-fee fallback requires a positively identified plain revert. Out-of-gas, invalid opcode/instruction and unknown execution failures no longer become a zero operator fee. RPC text remains sanitized and existing dry-run execution-failure handling remains intact. |
| `8ddc1dd` | Confirmed token approvals retain their transaction hash and allowance when the subsequent payment is refused. Unknown payment outcomes remain ambiguous across retries, including retries after expiry. |

These are selective ports and new regression fixes, not a merge of the recovered tree. Current custody/step-up/CAS, scan, sweep-journal and dependency guards remain in place. No trust configuration, contract address, chain enablement, relayer policy default, deployment or release was changed.

## Regression and review evidence

- Seller recovery: 71 focused tests; behavioral failures observed before fixes for same-file retry, own import/unlock completion and actual-store refresh after save conflict.
- Payment: 107 focused tests; failures observed before fixes for post-approval invoice/buffer expiry, stale-invoice approval hash retention, lost wallet response and expiry on a later retry.
- Fee handling: chain-adapters 415 passed / 18 skipped; sweep + txGuard 98 passed. Real transport-to-sweep regressions demonstrated five baseline broadcasts after execution failures that should prevent signing.
- Relayer: 287 passed / 2 skipped with coverage. Queued-expiry and slow-order-read regressions failed before their fixes.
- A separate AI reviewer examined the recovery, relayer, fee and payment changes. It found a false definitive “no payment was sent” claim for unknown wallet outcomes and a retry variant; both were corrected and covered. This is AI review, not an independent professional audit.

## Combined validation

Runtime source: `8ddc1dd` plus a test-file EOF whitespace cleanup. Local Node is 24.22.1; the repository requires >=22 and GitHub CI uses Node 22.

- `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build:libs`: passed.
- Full workspace typechecks: passed.
- All 14 package suites in `scripts/dev/local-ci.sh`: 2,565 passed / 29 skipped.
- Local secret scan, proxy-header check, deployment self-test, available script tests and portable-hosting-kit suite: passed. Script tests explicitly omit Foundry testnet checks when `cast` is absent; hosting-kit browser/Docker opt-in checks were not enabled locally.
- Full workspace lint and web production build: passed. Production bundle scan passed (13 files); Vite reported its existing large-chunk warning.
- Full web coverage suite: 1,612 passed / 4 skipped (114 test files passed / 1 skipped). Coverage: statements 92.37%, branches 88.04%, functions 93.97%, lines 96.07%, exceeding the unchanged 90/85/90/90 thresholds. Completed in 476 seconds.
- Separate web no-coverage suite: 1 passed.
- PHP plugin tests could not run: PHP is absent, and system package installation failed on `setgroups`/UID permissions.
- Real Chromium E2E could not run locally: no browser binary was installed and the official Playwright download produced a truncated archive. Do not count jsdom tests as real-browser evidence.
- A fresh `npm audit` was blocked by automatic approval review because it would send dependency metadata to npm. No bypass or retry was attempted. Previously observed GitHub CI on the base reported zero production dependency vulnerabilities; that is earlier CI evidence, not a fresh local result.

## Remaining work

1. Qualify the published combined head with GitHub CI, including the browser and contract checks unavailable locally.
2. Investigate Sonar's latest reported D Security / D Reliability quality gate. The Sonar bot comment was accessible, but issue details and its exact analyzed revision were not established. No Sonar issue is claimed fixed by these changes.
3. Finish P1a acceptance work: source-retained fresh-profile recovery and the extended real Worker → verified ERC20 → consented signed-receipt browser chain; compare current behavior before porting any recovered runtime.
4. Continue the remaining P1/P2 items in `HANDOFF_FOR_NEXT_AGENT_2026-10-29.md`, preserving current guards and human review of translated security copy.
5. Keep PR #37 draft until owner merge/release decisions and the existing independent exact-build/security/configuration gates are satisfied.

No credit balance was available. This checkpoint does not create a persistent credit-controlled worker or schedule further runs.
