# GhostPay development checkpoint — 2026-10-30

Base: PR #37 at `dfd5cbdd94d982985c73551355906723ac70a97e`. This session used an isolated checkout of that branch. The original Codex cloud environment was not reached: the browser was signed out. No original Claude container state was accessed.

## Implemented slices

| Commit | Behavior |
|---|---|
| `de3ea97` | A sweep whose deadline expires in the queue or during an order-state RPC read is refused as `deadline_too_soon`, without attributing an expired permit to the owner. Existing final pre-send checks remain. |
| `13c77b5` | Explicit keystore cancellation resets the file picker; retrying the same file works. Import/unlock completion recognizes its own installed session while cancellation, edits, unmount and replacement sessions invalidate it. Failed vault saves refresh actual-store controls. |
| `9cd80cf` | Operator-fee fallback requires a positively identified plain revert. Out-of-gas, invalid opcode/instruction and unknown execution failures no longer become a zero operator fee. RPC text remains sanitized and existing dry-run execution-failure handling remains intact. |
| `1280854` | Confirmed token approvals retain their transaction hash and allowance when the subsequent payment is refused. Unknown payment outcomes remain ambiguous across retries, including retries after expiry. |

These are selective ports and new regression fixes, not a merge of the recovered tree. Current custody/step-up/CAS, scan, sweep-journal and dependency guards remain in place. No trust configuration, contract address, chain enablement, relayer policy default, deployment or release was changed.

## Regression and review evidence

- Seller recovery: 71 focused tests; behavioral failures observed before fixes for same-file retry, own import/unlock completion and actual-store refresh after save conflict.
- Payment: 107 focused tests; failures observed before fixes for post-approval invoice/buffer expiry, stale-invoice approval hash retention, lost wallet response and expiry on a later retry.
- Fee handling: chain-adapters 415 passed / 18 skipped; sweep + txGuard 98 passed. Real transport-to-sweep regressions demonstrated five baseline broadcasts after execution failures that should prevent signing.
- Relayer: 287 passed / 2 skipped with coverage. Queued-expiry and slow-order-read regressions failed before their fixes.
- A separate AI reviewer examined the recovery, relayer, fee and payment changes. It found a false definitive “no payment was sent” claim for unknown wallet outcomes and a retry variant; both were corrected and covered. This is AI review, not an independent professional audit.

## Combined validation

Runtime source: published `1280854` (tree-identical to locally tested `8ddc1dd`) plus a test-file EOF whitespace cleanup. Local Node is 24.22.1; the repository requires >=22 and GitHub CI uses Node 22.

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

## Publication verification

The git CLI had no write credential. The connected GitHub app created equivalent commits on the same parent chain; every returned tree SHA matched the corresponding local commit before any branch ref moved. Commit metadata changes the commit SHA, but the tested file bytes remain identical.

| Local commit | GitHub equivalent |
|---|---|
| `46d78b12aafd43011069be8ab9748561044b2e84` | `de3ea97eba38681cfb5adfbeafaf23102dbc4d72` |
| `286d3208d86c9527fb6e0dc00904c66ae68418e4` | `13c77b561686aec6c1220c54176af6c941134212` |
| `ef9c870d4d64a4e478ace4cefdf3e03df3f8a21c` | `9cd80cf0f755d7bfac47dff02e0fadb9b849318e` |
| `8ddc1dd96122ea6b7759a63a6a62d148fdd70bb0` | `1280854089221335d63dcc2e8a0500a5372abefd` |
| `e0db32a28b600940d092c72537c78f6c9bbe317c` | `623114b1b37afe20331e9f69798fbd995d56d492` |

The final publication-map change affects only these handoff documents. GitHub checks on the final published head remain the authority for the browser, contract and other hosted gates.

## Remaining work

1. Qualify the published combined head with GitHub CI, including the browser and contract checks unavailable locally.
2. Investigate Sonar's latest reported D Security / D Reliability quality gate. The Sonar bot comment was accessible, but issue details and its exact analyzed revision were not established. No Sonar issue is claimed fixed by these changes.
3. Finish P1a acceptance work: source-retained fresh-profile recovery and the extended real Worker → verified ERC20 → consented signed-receipt browser chain; compare current behavior before porting any recovered runtime.
4. Continue the remaining P1/P2 items in `HANDOFF_FOR_NEXT_AGENT_2026-10-29.md`, preserving current guards and human review of translated security copy.
5. Keep PR #37 draft until owner merge/release decisions and the existing independent exact-build/security/configuration gates are satisfied.

No credit balance was available. This checkpoint does not create a persistent credit-controlled worker or schedule further runs.
