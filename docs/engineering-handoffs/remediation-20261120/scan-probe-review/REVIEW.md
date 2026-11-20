# Independent review of private scan crypto continuation probes

## Decision

**Acceptable for future integration.** A reviewer separate from `/root/scan_privacy_review` independently inspected the three newly authored probes and executed all 50 selected cases. No blocking defect was found in the probes or in the actual continuation behavior they exercise. This accepts a bounded test addition; it does not certify the complete scanning subsystem or release.

The published PR #292 head remains frozen. This review made no product, test, configuration, dependency, workflow or remote changes. The coordinator should preserve this source and evidence separately, then include the probes in a future candidate with its required exact-head checks.

## Source and independence

- Reviewer: `/root/scan_probe_independent`.
- Isolated branch: `review/ghostpay-scan-probes-independent-20261120`.
- Tested test-source commit: `ed776fcb171b41c79e085c05327fa2ca1cd43a36`.
- Product source: PR #292 `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`.
- Author's completed branch: `1b38cf835f3acd21d0ba01f42139a671bbed6d7d`; its probe file is unchanged from the tested commit.
- Local dependency-source checkout: `a0b082520302ea10337396c64d09b61b14db5185`; comparison against PR #292 found no differences under `apps`, `packages`, `scripts`, `.github`, `package.json` or `package-lock.json`.
- The complete difference from the product commit to the test commit contains only the new 117-line test and an additive ownership claim. No existing assertions, timeouts, coverage thresholds, CI definitions or security gates were removed or modified.
- `SOURCE_PINS.json` records SHA-256 values for the test, its two existing companion suites, reviewed runtime modules, Vite configuration and lockfile. `DEPENDENCY_DIST_SHA256.json` records reused compiled library identities.

## Independent source assessment

The test imports the actual session, private scan lifecycle and private scan store implementations. It does not replace `importSession`, `captureSessionGuard`, `openCurrentPrivateScanVault`, `invalidatePrivateScanHistory` or `PrivateScanVault` with mocks. Vite uses the repository's existing configuration and Node test environment.

Both WebCrypto wrappers bind the original `crypto.subtle` method before installing the spy. They await the original AES-GCM operation, signal the test only after it completes, and delay delivery of that actual result. HKDF import/derivation remains actual WebCrypto. The encryption input view aliases the actual plaintext passed to encryption, and the decryption view aliases the actual returned ArrayBuffer; zeroization assertions therefore observe the buffers consumed by the runtime rather than detached copies. The tests first check those buffers contain nonzero bytes, preventing vacuous wipe assertions.

| New case | Revocation boundary | Independently inspected assertions |
| --- | --- | --- |
| Same-key replacement during encryption | Actual encryption completed; result awaits delivery | Save rejects with `stale`; no additional CAS write; reserved tombstone row remains unchanged; plaintext becomes zero; current authority subsequently opens, saves and reloads the same journal |
| Private-history invalidation during encryption | Actual encryption completed; result awaits delivery | Same stale rejection, no-write, journal-preservation and wipe assertions; the positive current-authority control succeeds |
| Private-history invalidation during decryption | Actual decryption completed; result awaits delivery | Load rejects with `stale` and cannot return state; decrypted buffer becomes zero; no write or stored-row change |

The behavior matches actual runtime guards: `privateScanLifecycle.ts` captures the session revision and history generation; `privateScanStore.ts` rechecks authority after each crypto await, guards transactional writes and wipes temporary plaintext in `finally`. Same key bytes do not preserve the previous session holder/revision. Each probe restores spies and clears session state with `afterEach`; gates are released in `finally` after the revocation step. The two encryption cases additionally prove that a current authorized operation still succeeds, avoiding a false pass caused by indiscriminate failure.

## Independently executed verification

Runtime: Node **22.23.4**, npm **10.9.11**, Vitest **5.1.0**, Linux x64. The reviewer reused the coordinator's installed dependencies and existing compiled libraries via 66 temporary worktree-local symlinks. No clean install or library rebuild is claimed by this review. The symlinks were removed after verification without changing their targets.

All commands below ran from `apps/web` with `/workspace/scratch/a7189299ede1/toolchain/bin` first in `PATH`.

```sh
node ../../node_modules/vitest/vitest.mjs run src/lib/privateScanLifecycle.cryptoBoundaryReview.test.ts src/lib/privateScanLifecycle.test.ts src/lib/privateScanStore.test.ts --coverage.enabled=false --maxWorkers=1
node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src/lib/privateScanLifecycle.cryptoBoundaryReview.test.ts
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

| Check | Actual result | Evidence |
| --- | --- | --- |
| New probes and existing lifecycle/store tests | Exit 0; 3 files, **50 passed, 0 failed, 0 skipped**; **3 new + 47 existing**; 3.93 seconds | `targeted-vitest.log` |
| New probe type-aware ESLint | Exit 0; no lint diagnostics | `probe-eslint.log` |
| Full web TypeScript check | Exit 0; no diagnostics | `web-typecheck.log` |
| Source/config comparison | Only new test and ownership claim; runtime and existing gates unchanged | `SOURCE_PINS.json` and Git comparison described above |
| Final `git diff --check` | Exit 0 | `RECEIPT.json` |

The toolchain emitted an experimental proxy-agent warning during Node invocations. It emitted no test, lint or type failure. The focused Vitest invocation disables coverage collection only for this local selection; repository thresholds remain unchanged, and no coverage qualification is claimed.

## Limitations and handoff

The in-memory `Map` store implements guarded compare-and-swap, while invalidation's supplied persistence callback is a no-op. These isolate the real local history-generation and session-authority boundaries. They do not test browser IndexedDB transaction behavior, persistent cross-tab deletion, actual BroadcastChannel delivery, browser restart/suspension, cross-browser compatibility, live RPC, a development chain, a testnet or production deployment. The new decryption case covers history invalidation; it does not independently add a decryption/session-replacement case. Existing tests are counted as existing coverage, not newly authored review work.

There is no demonstrated new vulnerability in these three boundaries. This conclusion does not dismiss unrelated findings or substitute for required external review, the complete final-source matrix, owner decisions, or published-artifact verification. Merge and release authority remain with the coordinator and repository's required workflow.
