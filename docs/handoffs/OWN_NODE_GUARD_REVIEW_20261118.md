# Own-node request guard review — 2026-11-18

## Source and scope

Base: PR #222, `2bc2098298d90928eb1acafad969f28316bb05fc`.
Branch: `chatgpt/ghostpay-own-node-guard-20261118`.
Test-only RED commit: `3877ce481854e9c8dd09742dcd3dfeb3e5b0ed23`.
Product change: `apps/web/src/lib/defaultServices.ts` only.

## Finding GP-TM14-CACHED-RPC

The TM14 own-node rule was checked only when constructing a client. `AppShell`
caches clients under `chainId|URL`, while saving a new network profile updates
localStorage without clearing that cache. A previously created remote client
therefore kept contacting its provider after own-node mode was acknowledged.
The same problem affected reconnect traffic after a retryable failure.

The selected-client factory now injects a transport that checks the current
effective network selection immediately before every outgoing JSON-RPC dispatch.
An own-node refusal uses fixed `RPC_URL_REJECTED` error text and is not retried.
The same guard covers the chain-id handshake, generic requests, typed client
methods and retry/reconnect requests. Existing fetch transport flags and URL
validation are preserved. A loopback client remains usable under own-node mode.

This is a metadata-consent defect: requests to a previously configured provider
can disclose queries and addresses contrary to the newly selected mode. No
private-key disclosure or remote code execution was demonstrated.

## Verification actually executed

Environment: Linux, Node `v24.22.1`, Vitest `5.0.5`; synthetic local transport
responses only. No real RPC, Tor endpoint or public-chain transaction was used.

- Built #222's changed `chain-adapters`, `net-transport` and `scan-source`
  workspaces, including their declared build dependencies: exit 0.
- Before repair:
  `../../node_modules/.bin/vitest run src/lib/defaultServices.networkGuard.test.ts --coverage.enabled=false --maxWorkers=1`
  from `apps/web`: **5 failed, 1 passed**. The four cached-client operations and
  reconnect retry resolved and contacted the provider when they should refuse.
- After repair:
  `../../node_modules/.bin/vitest run src/lib/defaultServices.networkGuard.test.ts src/lib/defaultServices.test.ts --coverage.enabled=false --maxWorkers=1`:
  **2 files, 13 tests passed**. Tests verify `RPC_URL_REJECTED` and no additional
  transport call after the policy changes.
- `./node_modules/.bin/eslint --config eslint.config.js apps/web/src/lib/defaultServices.ts apps/web/src/lib/defaultServices.test.ts apps/web/src/lib/defaultServices.networkGuard.test.ts`:
  exit 0.
- `git diff --check`: exit 0.
- Whole-web TypeScript check remains **unverified**. The first attempt identified
  copied pre-#222 `scan-source` build output without its new `padRange` export.
  Rebuilding that workspace corrected the artifact mismatch. The next command,
  `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web`, was
  terminated with exit **137**, before a TypeScript diagnostic. This is not a pass.

## Limits and integration requirements

Already-sent requests cannot be recalled; the guard prevents subsequent sends.
The inherited policy still treats unavailable/invalid stored profile data as the
default direct profile. This patch does not change that policy, provide a Tor
transport, prove endpoint ownership or qualify any network profile.

This repair does not qualify PR #222 for merging. Separate source-review blockers:

1. `recordSweepDestination` writes source/destination/chain linkage to plaintext
   localStorage by default, contrary to `DestLedger`'s encrypted-storage requirement.
2. #222 and #211 independently introduce different v3 checkpoint derivations under
   the same prefix. #211 additionally binds the key lender to the loaded identity
   and sweeps legacy public-key-derived slots. Integration needs one explicit policy.
3. #222's Bitcoin scan falls back to per-output provider queries and rechecks at
   signing. #219 implements explicit provider-query opt-in and propagated local
   spend tracking. Taking #222's files wholesale would discard that consent model.

Required next steps: independent review, successful whole-web typecheck and exact
integration-head CI; reconcile the remaining privacy changes before any main merge.
The worktree and remote base were kept separate; no other worker's branch was changed.
