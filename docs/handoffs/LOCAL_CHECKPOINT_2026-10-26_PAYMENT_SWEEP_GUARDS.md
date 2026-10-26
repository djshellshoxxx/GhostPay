# Local checkpoint: payment expiry and sweep attempt races

Updated 2026-10-26 08:55 UTC. This is an unpublished local work branch; no merge, push, PR update, release, or deployment was performed.

## Source identity

- Repository: `djshellshoxxx/GhostPay`.
- Upstream source: draft PR #30 head `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` (tree `cd387bb06d825c2c773193d11e1bffda18760cef`), one docs-only commit after code head `643d1ed98bbcaaef599c3da7f893827512d6bf39`.
- Base branch at intake: `main` `edb0051eb89bd135c73733d9db14569aa000662d`.
- Local branch: `work/ghostpay-payment-sweep-guards-2026-10-26`.
- Source commit: `f0fc594ea3d58db39814809da37cda51d6ec4daf`, parent `7373172db4cf40ce5622e5a92a55b2b086e5e7cb`, tree `797b1b1bfb7cac3793ac19f583da3d9c7bbde3d3`.
- Exact-source validation checkout: `/workspace/GhostPay-pr30-validation`.
- `git status` was clean immediately after the source commit. The handoff document itself is the next local commit; resolve its exact current HEAD with `git rev-parse HEAD`.

## Completed in this tranche

1. **Sweep broadcast remount lock:** `directSweep` synchronously exposes the public attempt descriptor immediately before `eth_sendRawTransaction`. The UI records it in the existing same-tab in-memory attempt map before awaiting the RPC. A route unmount/remount while the RPC is unresolved therefore keeps direct signing disabled; resolved/unknown outcomes update only that exact attempt snapshot.
2. **Stale status response guard:** status reconciliation captures the observed attempt and commits only if its hash and status remain current. A delayed result for A can no longer overwrite a newer unresolved attempt B.
3. **Late wallet approval at invoice expiry:** if the wallet approval returns after expiry, the confirmed approval hash and status are retained and shown honestly, while the separate payment is blocked by the final guard. The UI no longer says “Nothing was sent” when approval was in fact sent. An in-flight wallet request is not claimed to be cancellable.

Changed source files: `apps/web/src/lib/sweep.ts`, `apps/web/src/state.tsx`, `apps/web/src/views/Sweep.tsx`, `apps/web/src/views/Sweep.test.tsx`, `apps/web/src/views/Pay.tsx`, `apps/web/src/views/Pay.test.tsx`.

The new tests are fake-wallet/mock-RPC fixtures. No live wallet, chain, funds, deployment, or external target was used. The separate page-reload/cross-tab attempt journal contract remains owner-gated and unchanged; the current lock is in-memory and tab-scoped as before.

## Validation on this exact source

Run 2026-10-26 UTC, Node v24.19.0 / npm 11.9.0:

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --cache /workspace/.npm-cache --no-audit --no-fund` | Pass, 754 packages; install scripts and audit were intentionally omitted per repository CI form. |
| `npm run build:libs` | Pass. |
| `npm run typecheck -w @ghostpay/web` | Pass. |
| `npm run lint` | Pass for the workspace. |
| `npm exec -- vitest run src/views/Sweep.test.tsx src/views/Pay.test.tsx --maxWorkers=1` (from `apps/web`) | Pass: 2 files, 60/60 tests. The held-RPC-remount and stale-A regressions were observed failing on untouched PR30 source before the fixes. |
| `npm test` | **Exit 1, environment blocker:** `@ghostpay/confidential-contracts` Hardhat startup attempted `mkdir /home/agent/.config/hardhat-nodejs` and received `EROFS` (read-only filesystem). No HOME/config redirection workaround was used. Remaining workspace suites continued. `apps/web` coverage suite passed: 100 files, 1261 passed / 4 skipped; coverage 91.12% statements, 86.46% branches, 92.73% functions, 95.07% lines. The separate web no-coverage pass was 1/1. Coverage thresholds were unchanged. |
| `npm run build` | Pass for workspaces and web production build; post-build bundle scan passed (13 files). Vite reports `node:http` externalized for browser compatibility from `packages/pir-two-server/dist/http.js`; build completes. |
| `npm run ci:scan-secrets` | Pass: no committed env files or key material found. |
| `npm run ci:check-actions` | Pass: all 61 `uses:` references pinned to full SHAs. |
| `npm run test:e2e --workspace @ghostpay/web` | First invocation could not launch because the project-default Playwright browser path was absent. Using the already installed Chromium through the project's supported variable, `GHOSTPAY_CHROMIUM=/usr/bin/chromium npm run test:e2e --workspace @ghostpay/web`, passed all 20 browser tests. No browser was downloaded. |
| `git diff --check` | Pass before source commit. |

### Follow-up: full workspace test with supported process-scoped XDG paths (2026-10-26 09:24–09:28 UTC)

The installed Hardhat 2.29.1 uses `env-paths`, whose Linux implementation honors `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, and `XDG_STATE_HOME`. I reran the same root `npm test` with those four variables pointed at a temporary project-local directory. `HOME`, global configuration, dependencies, and test thresholds were unchanged. Hardhat passed the prior `EROFS` config-directory creation point and then failed with `HH502` while trying to download the Solidity 0.8.28 compiler version list; the configured HTTP proxy returned 403 while tunneling. The exact root test therefore still exits 1 for this external compiler-download blocker. No alternate downloader or compiler installation was attempted.

The remaining workspace tests completed. `apps/web` coverage passed 100 test files (1 skipped), 1,261 tests passed (4 skipped), at 91.12% statements, 86.46% branches, 92.73% functions, and 95.07% lines; coverage thresholds were unchanged. The separate web no-coverage invocation passed 1/1. Other than the Hardhat compiler-list error, no additional failing test was reported. The temporary `.hardhat-test-xdg` directory was created only for this invocation and is removed after recording this result.

### Follow-up: direct-sweep pre-handoff registration race (2026-10-26 09:57–10:00 UTC)

#### Source identity

- Local branch: `work/ghostpay-payment-sweep-guards-2026-10-26`.
- Source commit: `6fc425442b68c191ca9327d5e096f9ba9fbb9c63`, parent `3589c580c5123c301ef5a83b8648ef6cc305fc39`, tree `6db2372f0e336dfdec09b9a15fa1520d69ccce77`.
- This is a local-only commit. No remote write, merge, PR update, release, or deployment was performed.

#### Reproduction and fix

- A new held-`eth_estimateGas` fixture first reproduced the predicted bug on the unmodified source: attempt A paused before handoff; after navigation/remount, B with a different destination submitted; resuming A produced a second distinct signed hash and replaced B in the app-session attempt map.
- `tryRecordSweepAttempt` now synchronously checks the current same-chain/owner descriptor and only replaces it when absent or terminal. Direct sweeps call it in `onHandoff`, immediately before `eth_sendRawTransaction`; a refusal throws the existing pending-sweep message before the raw RPC call. The preflight `assertNoUnresolvedAttempt` remains for normal UI feedback, but is no longer the only race guard.
- The derived signing secret is still zeroized immediately before `onHandoff` and again in `directSweep`'s `finally`; refusal does not bypass either wipe.
- New regressions cover both completion orders for two overlapping preparations, distinct destinations/hashes, no second raw send, preservation of the first unresolved descriptor, and a pre-handoff gas-estimation failure followed by a successful explicit retry. Existing tests in the same file still cover a held raw-send reply across route remount, a confirmed included receipt permitting a later explicit attempt, and stale receipt A not replacing B.
- Scope is the reproduced direct raw-transaction path. Relayer response bookkeeping, cross-tab/reload persistence, and new retention policies were not changed.

#### Fresh checks on `6fc425442b68c191ca9327d5e096f9ba9fbb9c63`

| Command | Result |
|---|---|
| Initial pre-fix reproduction: `npm exec -- vitest run src/views/Sweep.test.tsx -t 'reproduces two sweeps reaching handoff when the older preparation resumes last' --maxWorkers=1` (from `apps/web`) | Pass as a reproduction: it observed two raw sends and different hashes, with the late A hash replacing B. The diagnostic expectation was then replaced with the regression assertions. |
| `npm exec -- vitest run src/views/Sweep.test.tsx -t 'atomically refuses|keeps the first handoff|pre-handoff preparation failure' --maxWorkers=1` (from `apps/web`) | Pass: 3/3 new race/failure tests. |
| `npm exec -- vitest run src/views/Sweep.test.tsx src/views/Pay.test.tsx --maxWorkers=1` (from `apps/web`) | Pass: 2 files, 63/63 tests. |
| `npm run typecheck -w @ghostpay/web` | Pass on final source. An earlier attempt exposed a missing `reject` member in the test helper's declared return type; the helper type was corrected and typecheck rerun. |
| `npm run lint -w @ghostpay/web` | Pass on final source. |
| `npm run build -w @ghostpay/web` | Pass on final source; Vite built the app and the post-build bundle scan passed (13 files). Existing `node:http` browser-externalization notice remains. |
| `git diff --check` | Pass before commit. |

The previously recorded root `npm test` remains exit 1 because Hardhat cannot fetch Solidity 0.8.28 compiler metadata through the configured proxy (`HH502` / HTTP 403); that command was not retried during this tranche. No coverage thresholds or test cases were weakened. No P2P files were edited.

#### Read-only P2P coverage delta

`git diff --name-status 14a32e6289154e0c31b0fecb3dc26bc5e075f566..825f9fd6234f3c319514a92e41a0650727b44d5f` returned:

```text
M docs/handoffs/SESSION_STATUS.md
M packages/domain/src/trade-terms.ts
M packages/domain/test/trade-terms.test.mjs
M packages/wallet/src/evm-adapter.ts
M packages/wallet/src/evm-terms.ts
M packages/wallet/test/evm-adapter.test.mjs
M packages/wallet/test/evm-terms.test.mjs
```

This was read-only intake; no P2P source or tests were run or changed in this bounded tranche.

### Follow-up: invoice expiry during post-sign permit preflight (2026-10-26 10:04–10:05 UTC)

#### Source identity

- Local branch: `work/ghostpay-payment-sweep-guards-2026-10-26`.
- Test-only commit: `3572a4abb7ddf02f43241e6221e368a0b6b19346`, parent `09e9a20463cce57135a5e4779cf71304d871e048`, tree `f269c5e1c4d8371051a803a45a216dd96f9a4ce0`.
- No production code was changed. This is a local-only commit; no remote write, merge, PR update, release, or deployment was performed.

#### Deterministic held-preflight evidence and disposition

- The test holds the static `permit(...)` RPC inside the existing post-sign `classifyPermit` preflight, after one permit signature has been produced. The clock starts at `expiresAt - 60`, advances to `expiresAt` while that RPC is held, then the preflight reply is released.
- As expected, `preparePayment` can return a permit payment object using its captured pre-expiry timestamp. Its deadline remains bounded below invoice expiry. The test then calls the exact `sendPayment` final gate with the now-expired invoice.
- `sendPayment` rejects with the invoice-expired message before another RPC read and before any `eth_sendTransaction` wallet request. No payment hash is returned and the wallet has no sent transaction. The stale prepared object therefore cannot be submitted through the application path.
- Disposition: **safe for funds; no production fix made.** Preparation can transiently produce a stale preview, but the final submit guard rereads the clock and blocks it. The existing periodic review refresh may also remove the prepared context; the focused test targets the final submit gate directly. Existing tests still cover expiry after the permit signature, expiry during the final wallet `net_version` recheck, and honest handling of a late approval hash without starting the separate payment.

#### Fresh checks on `3572a4abb7ddf02f43241e6221e368a0b6b19346`

| Command | Result |
|---|---|
| `npm exec -- vitest run src/lib/payExec.test.ts -t 'blocks final submission when invoice expiry passes during the post-sign permit preflight' --maxWorkers=1` (from `apps/web`) | Pass: 1/1 deterministic held-preflight test. |
| `npm exec -- vitest run src/lib/payExec.test.ts src/views/Pay.test.tsx --maxWorkers=1` (from `apps/web`) | Pass: 2 files, 89/89 tests. |
| `npm run typecheck -w @ghostpay/web` | Pass. |
| `npm run lint -w @ghostpay/web` | Pass. |
| `npm run build -w @ghostpay/web` | Pass; bundle scan passed on 13 files. Existing `node:http` browser-externalization notice remains. |
| `git diff --check` | Pass before commit. |

Full root coverage and browser E2E were not rerun on this test-only source checkpoint; earlier counts remain evidence only for their earlier pinned source, not this commit. The root Hardhat compiler-metadata blocker (`HH502`, proxy HTTP 403) remains from the earlier full-suite attempt and was not retried.

#### Next frozen-plan gate

The lean plan's next ordered gate is owner review of draft PR #30, which this local-only lane cannot merge or publish. Before additional detailed core acceptance reproductions, `docs/handoffs/LEAN_RELEASE_SCOPE.md` requires the owner-supplied private review packet; the detailed assigned cases beyond this expiry check are not present in this checkout. The older `PR30_LEAN_STATUS.md` also keeps the main-branch `npm sbom` / Mythril nightly failures open without weakening their gates. Policy-account sends and reload-surviving sweep persistence remain outside lean scope or owner-contract-gated. No P2P work was performed.

## Other known test limitations retained

Neither full workspace attempt executed the Hardhat contract suite: the initial attempt stopped at config-path creation with `EROFS`; the follow-up using supported process-scoped XDG paths passed that point but could not fetch compiler metadata (`HH502`, proxy HTTP 403). The pre-existing `docs/handoffs/SESSION_STATUS.md` records two distinct stress-test limitations; neither was changed or represented as passing here: (a) the 150-case archive fuzz test exceeded its 120 s deadline under V8 coverage but passed without coverage in 13.9 s; the separately configured coverage-off pass and prior CI result remain historical evidence, not this run; (b) the 1M-wire-log scanner fuzz test exceeded its 180 s deadline in this container even without coverage (190.6 s), attributed there to slower CPU. Cases, deadlines, KDF costs, and coverage gates were not reduced.

The private final plan ZIP could not be materialized in this environment. The one corrected supported Library materialization attempt failed with `library download request failed: hosted apps tools/list request failed: network`; no plan bytes were downloaded. Do not retry through another route. This handoff records only work scoped by the explicit parent instructions and in-repository `docs/handoffs/PR30_LEAN_STATUS.md` / `docs/handoffs/LEAN_RELEASE_SCOPE.md`.

## Next steps and boundaries

1. Parent integration owner should review `f0fc594ea3d58db39814809da37cda51d6ec4daf` and decide whether/how to integrate it. This branch has not been merged or pushed by this task.
2. Continue the frozen GhostPay plan in order. The immediate reported payment expiry/60-second buffer boundary had existing fixes on PR30; this tranche adds the late-approval outcome regression. Then continue exact-source sweep/race review without inventing page-reload or cross-tab retention policy.
3. Revisit the Hardhat contract test only when Solidity 0.8.28 compiler metadata is available through an already authorized environment/toolchain. The documented, process-scoped XDG configuration path solved the original local `EROFS` point; this environment now blocks compiler metadata access with proxy HTTP 403. Do not try another downloader or install route.
4. Keep deep audit, device/browser matrix, stress, external independent review, live wallet/chain qualification, deployment, production funds, and release acceptance explicitly open. The passing local browser fixtures are not device qualification or an independent security audit.
5. No P2P files were changed in this tranche. Its PR stack and ownership remain separate; do not merge PR4/PR5 blindly or use the denied Foundry downloader.

GhostPay remains a client-side static application with client-held keys/data. This change introduces no app-owned server or new backend dependency. README already labels it experimental software artwork while retaining functional disclosures and risks.

### Follow-up: offline compiler verification and Library intake correction (2026-10-26 18:07 UTC)

#### Source and toolchain identity

- Current local source: branch `work/ghostpay-payment-sweep-guards-2026-10-26`, HEAD `585ce5b5e3fe1ec8c1d502b62bc241cf70468037`; working tree was clean before this handoff update.
- Solidity compiler required by `packages/confidential-contracts/hardhat.config.ts` and `packages/contracts/foundry.toml`: native solc `0.8.28+commit.7893614a`.
- Existing `/workspace/ghostpay-tools/solc` is ELF x86-64. Its SHA-256 `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25` exactly matches the retained `solc-list.json` manifest entry for `solc-linux-amd64-v0.8.28+commit.7893614a`. Manifest SHA-256: `b44c1d0e598ed0bcbf4ee49c86c5ae85b63718c1591689b02d12d7a11d45a2ac`. The prior handoff records this manifest as the official solc-bin manifest. No compiler or Foundry binary was downloaded during this follow-up.
- The repository-supported Hardhat route is `GHOSTPAY_SOLC_PATH=/workspace/ghostpay-tools/solc`; process-scoped XDG config/cache/data/state directories under `/workspace/.ghostpay-xdg` avoid the read-only default `/home/agent/.config` without changing global settings.

#### Fresh verification on this source

| Command | Result |
|---|---|
| `GHOSTPAY_SOLC_PATH=... XDG_CONFIG_HOME=... XDG_CACHE_HOME=... XDG_DATA_HOME=... XDG_STATE_HOME=... npm test --workspace @ghostpay/confidential-contracts` | **Exit 0.** Hardhat compiled 36 Solidity files for Cancun; 37 passing, 9 pending. The pending chain-guard group requires Anvil; `ANVIL_BIN` was unset, and the existing Foundry/Anvil binary was not executed because its release digest remains unmatched to metadata. |
| Same process-local compiler/XDG variables with root `npm test` | All workspace output reached the final web no-coverage run (1/1). Web coverage reported 1,265 passed / 4 skipped; statements 91.12%, branches 86.47%, functions 92.74%, lines 95.08%, above unchanged thresholds. The executor restarted before the root shell exit code was captured; the log has no npm/test failure marker, but the aggregate exit status is **unverified**, not recorded as pass. Full output: `/workspace/ghostpay-root-test-local-solc.log`, SHA-256 `83d0e218112f1553bf6a4f4ea06df95a4a7fc6e03565d8674b1416aa95238c29`. |
| `npm run typecheck` | Exit 0 across workspaces. |
| `npm run lint` | Exit 0 across workspaces. |
| `npm run build` | Exit 0; production web bundle built and 13-file bundle scan passed. Existing Vite `node:http` browser-externalization notice remains. |
| `npm run ci:scan-secrets` | Exit 0; no committed env files or key material found. |
| `npm run ci:check-actions` | Exit 0; all 61 action references pinned to full SHAs. |

Full typecheck, lint, build, secret-scan, and actions logs plus exit files remain in `/workspace/ghostpay-*.log` and `/workspace/ghostpay-*.exit`; they are local verification artifacts, not pushed. No production source files changed in these checks.

#### Library 403 diagnosis correction

- The original signed-URL GET occurred around 10:08–10:09 UTC; its returned expiry was 11:08:55 UTC. Therefore that original request preceded expiry, and the earlier “already expired” explanation was incorrect.
- The saved `prepare_materialize` transfer specified method `GET` and an empty headers object. The saved raw curl command followed the URL with GET and added no headers, so the evidence does **not** show a missing required header. However, raw curl was not the supported materialization flow: current `materialization.md` requires passing the complete transfer object to the bundled helper, which handles the supplied headers, xattrs, identity metadata, and atomic install.
- A single correctly wired helper transfer for the same Library item (version 57, 4,715,651 bytes) returned `library file transfer failed: download failed`. It provided no HTTP status, body, or safe headers. No further Library requests or raw URL attempts were made. The review queue bytes and named packet contents remain unavailable; assigned expiry, recovery/session-lifecycle, and scan-consistency cases remain unclosed by packet intake.
- Two local helper-bridge setup errors occurred before the final helper invocation and before any download: first stdin was closed before the transfer object arrived; then the bridge passed the operation name as its destination. The final invocation passed the complete transfer object to the correct helper operation and produced the generic download failure above.

The earlier separate saved `CONNECT 403` for another Library materialization still supports a possible proxy issue but does not identify the cause of this exact helper failure. Do not retry or switch transport without newly verified supported correction.

#### Current boundaries

- This follow-up made no GhostPay source changes, no P2P changes, no GitHub writes, and no deployment or wallet actions.
- The explicit pending items remain: root aggregate test exit code, Anvil-dependent chain guards, independent security/device/release qualification, and the inaccessible private review queue. The new local compiler route resolves the prior Hardhat metadata dependency for this package; it does not resolve the Foundry provenance gate or authorize executing its binary.


### Follow-up: terminal aggregate result recovered by fresh run (2026-10-26 18:48 UTC)

- Tested clean source `88386d20e63bb33235f16f8383566f9c401a62e4`, tree `c8eaa8bcdd3911b268286798a533c5c22e0a2176`. No surviving npm/Vitest/Hardhat test process existed before launch. This was a fresh verification run, with no application bugfix or threshold changes.
- Exact root command: `npm test`, with `GHOSTPAY_SOLC_PATH=/workspace/ghostpay-tools/solc` and `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` under `/workspace/.ghostpay-xdg/{config,cache,data,state}`. Compiler bytes again matched retained solc 0.8.28 manifest SHA-256 `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`. `ANVIL_BIN` was unset and Anvil absent from PATH; no unmatched binary was executed.
- **Root command exited 0.** Started `2026-10-26T18:33:54.107550+00:00`, finished `2026-10-26T18:48:54.039461+00:00`. The supervisor flushed the log and atomically installed the terminal status (temporary file plus rename), so model/session disconnection does not remove the recorded outcome. A full executor/OS kill could still leave a running record; inspect state and processes before any rerun.
- Hardhat confidential-contracts retained **37 passing / 9 pending**, with the Anvil chain-guard limitation unchanged. Web coverage retained **1,265 passed / 4 skipped**, statements 91.12%, branches 86.47%, functions 92.74%, lines 95.08%; separate no-coverage pass **1/1**. Other workspace skips remain as reported by their unchanged scripts. This is not evidence that disabled, Foundry, live-wallet, device or audit gates passed.
- Full log: `/workspace/checkpoints/2026-10-26-ghostpay-root-exit/npm-test.log`, SHA-256 `456e3e81dee7c08b2e71f1467fb0972dc9b4ef8611fcd610ebfacb34e9024751`. Atomic status and executed supervisor are alongside it. Durable source/command/workspace summaries: `docs/evidence/ROOT_TEST_20261026.json` and `docs/evidence/ROOT_TEST_SUPERVISOR_20261026.py`.
- The earlier interrupted run's missing exit remains historical and was not inferred as success. This new explicit exit closes the aggregate evidence gap for the tested source. Type/lint/build/security results above were not rerun in this tranche; no application code changed. No CI, GitHub write, merge, release, deployment, paid infrastructure, credentials/network/security change, or Library input retry occurred.
