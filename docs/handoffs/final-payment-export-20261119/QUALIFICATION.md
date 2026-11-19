# Final Pages payment export and network authority qualification

## Result

PR #269's payment-key export and private-scan changes are reconciled with the final Pages candidate. The original PR ancestry is retained. Fresh regression execution reproduces the three interrupted/expired-scan export failures and verifies the corrected paths. A newly reproduced clock-validity defect is repaired. This receipt records component qualification; it does not claim a full release, coverage, real-browser or real-testnet pass.

## Source and integration

- Baseline: `7f44cf742f25df25105a5a21d223b6d0d1efb62d`, based on PR #270 `73545f63112910d46002718354ab5e99f8652e1f` and PR #262.
- Incoming PR #269: `683f8587b8de45448f14aab0539cb07a5f21bce3`.
- Normal two-parent merge: `b456f8637934c3774d0400a1eed13d33c8d08709`. Only `docs/ai/ACTIVE_WORK.md` conflicted; both additive claim blocks were preserved. All 12 incoming app files and the network-egress inventory initially matched the incoming PR exactly. `evidence/integration-blobs.json` records their hashes.
- The current merchant-profile and canonical JSON runtime/tests remained unchanged throughout this reconciliation.
- Clock tests were committed first at `0afaa357` and `0e19e230`. Clock implementation: `676093a3`.
- Final tested fixture/lint correction: `ecc30132`; preserves the store receiver with `read: (key) => s.saved.store.read(key)`. No assertion changed.
- Full file blob and SHA-256 identities are in `SOURCE.json`.

## Behavior preserved and completed

An explicit secret payment-key export obtains fresh, exact-address authority after re-authentication. It uses the original verified scan endpoint and chain. It does not reuse or revive a cancelled or expired scan grant, choose another provider, or permit unrelated RPC methods. Its own abort signal reaches both RPC initialization and the account-code read. Session, policy, settings and selected-scope guards are rechecked after awaited work, and the grant is disposed on every exit. Public-record export remains offline.

The existing scan cancellation/error-normalization fixes and private-checkpoint row selection are retained. The network-egress inventory preserves all 37 original surface IDs and catalogs the distinct export code-check disclosure.

## Reproduced finding: network authority clock validity

Severity: low defensive hardening; observed rollback also affects real clock changes. The invalid-number cases require an invalid injected clock provider or an altered runtime clock; no public exploit is claimed.

The prior grant code compared clock samples arithmetically without checking finite/nonnegative values. NaN bypassed comparisons; repeated infinite or negative startup samples could issue authority. A rollback from a later observed timestamp that remained above the last dispatch timestamp was also accepted. A throwing startup clock exposed its raw error.

The repair validates every per-grant sample, records the latest observation, sanitizes clock exceptions, and permanently cancels the grant on invalid or decreasing samples. A later valid clock cannot revive that grant. Merely checking authority does not renew its idle deadline. Header and body continuations use the same checked clock.

## Executed checks

| Check | Source | Actual result |
| --- | --- | --- |
| Clock regressions before implementation | `0e19e230`, original clock runtime | 9 failed, 4 passed; 93 unrelated cases deselected. Invalid clock/rollback defects reproduced. |
| Full network authority file | `676093a3` | 106 passed, zero skipped, exit 0; 2.62 seconds. |
| Export regression before reconciliation | Overlay at `676093a3` replacing only `Scan.tsx` with its `7f44cf74` version | All 3 selected export cases failed because no key file was downloaded; 3 unrelated controls deselected. 16.68 seconds. Overlay was then restored to the exact committed source. |
| Combined affected original-config suites | `676093a3` | 8 files, 300 passed, zero skipped, exit 0; 62.13 seconds. |
| Type-aware ESLint, all 12 changed app files | `676093a3` | One existing unbound store-method error in the checkpoint fixture; no other diagnostics. |
| Same type-aware ESLint selection | `ecc30132` | Passed, exit 0, no diagnostics after the receiver-preserving fixture correction. |
| Complete checkpoint file after receiver correction | `ecc30132` | 20 passed, zero skipped, exit 0; 17.79 seconds. |
| Network-egress inventory | Final production source | 6 passed, zero skipped; all 37 surfaces and AST reference counts validated. |
| Diff whitespace | Final source | Passed. |

The 300-case run covers `paymentExportRpc`, `networkAuthorization`, `paymentKeyExport`, `scanClient`, `privateScanLifecycle`, `Scan.privateCheckpoint`, `Scan.stealthExport.authorization`, and existing `Scan.stealthExport`. This includes wrong credentials, offline public exports, exact endpoint/chain/method binding, cancellation/late replies, saved-profile changes before storage events, private scan persistence, encrypted exports and independent codec recovery. It is not browser end-to-end or full-project coverage qualification.

Commands use the original `apps/web/vite.config.ts`, one worker, no file parallelism, and `--coverage.enabled=false` for focused regression runs. No timeout, assertion, lint rule, coverage threshold or configuration was weakened. Exact commands and return codes are recorded in `RESULTS.json`; raw output is retained under `evidence/`.

## Environment and evidence limits

Node 24.22.3, Vitest 5.1.0. Third-party dependencies were copied from the coordinator's exact-lock cached installation. Workspace symlinks target this isolated worktree, and compiled workspace outputs were copied only after the coordinator completed the current-source library build. This is not a successful clean dependency installation: the coordinator's clean offline attempt was blocked by a missing cached package. The first local clock run also stopped during module collection because the initial copied `scan-source` output was incomplete; it executed zero tests and is preserved separately as `evidence/clock-red.log`. Subsequent runs used the completed output set and original test configuration.

The independent `security_review` worker inspected the merged export grant source and clock correction. It reported no introduced source blocker. Its clock review confirmed safe cancellation before registration, validation of every sample, permanent invalidation, and unchanged idle-renewal semantics. That source review is separate from these executed tests and is not an external security audit.

The coordinator owns exact combined-candidate typecheck, full coverage, browser tests, Pages builds, hosted CI, integration-lock acquisition and any later merge or release. No remote branch, shared lease, deployment, published tag or main branch was changed by this worker.
