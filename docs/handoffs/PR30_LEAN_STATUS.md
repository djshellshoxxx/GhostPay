# PR #30 lean-core status (session 01LUsecE)

Updated 2026-10-25 18:05 UTC. All six v29 lean findings fixed and merged; CI pending on the new head. Branch `claude/cool-albattani-xopr89`, draft PR #30 -> `main`.

## Verified heads

- PR #30 head `c0b0ba6`: GitHub CI run 40178968128 **success** and Integration run 40178968082 **success** (first uncancelled
  run on this branch; earlier red `typescript`/`contracts` gates were cancelled-job aggregates from rapid pushes).
- `main` `edb0051`: Nightly run 40176717292 **failure**, pre-existing (also failed on `dbee678`): `reproducibility`
  (`npm sbom` ESBOMPROBLEMS: `abitype@1.0.8` wants `zod@^3`, tree has `zod@4.6.7`) and `mythril` (pip metadata build error).
  Not caused by PR #30; not yet fixed.

## Local full web run (all six fixes merged, head ce588bc)

`cd apps/web && npx vitest run --coverage --maxWorkers=2`: exit 0, 100 files passed / 1 skipped, 1257 tests passed / 4 skipped;
coverage 91.04 statements / 86.39 branches / 92.61 functions / 94.96 lines (thresholds 90/85/90/90 unchanged).
Seller-vault native Chromium script `apps/web/scripts/test-seller-vault-idb.mjs` passed. Web build + bundle scan passed.

## Nightly

- `mythril`: root cause is the ubuntu-26.04 runner's default Python 3.14, for which `coincurve` (Mythril dependency) has no
  wheel; its sdist build fails (`Expected exactly one LICENSE file in cffi distribution`). Fix on this branch: pin Python 3.12
  with `actions/setup-python` v6.2.0 (`a309ff8b…`, SHA-pinned; `scripts/check-actions-pinned.sh` passes). Verified only by
  YAML/pin checks; Nightly is scheduled on `main`, so it takes effect after merge.
- `reproducibility` (`npm sbom` ESBOMPROBLEMS): `@0xbow/privacy-pools-core-sdk` pins `viem@2.22.14` -> `abitype@1.0.8`, whose
  optional peer `zod ^3` is satisfied by the hoisted `zod@4.6.7`. An `abitype@1.0.8 -> 1.2.3` override makes `npm ls` clean
  but `npm sbom` still rejects the overridden exact pin; a scoped nested `zod@3` override was not placed by npm. Reverted;
  **still open**. Options for a reviewed follow-up: bump the SDK when a release uses a newer viem, or isolate the optional
  privacy-pools package from the release SBOM scope. Gate not weakened.

## Scope

Owner-approved lean release scope: `docs/handoffs/LEAN_RELEASE_SCOPE.md` (one EVM invoice -> pay -> detect/receipt -> sweep
-> backup/restore path). Optional work already merged on this branch (embed, private scanning, policy accounts, BTC hardening,
Solana/Tron views, tag archive, chain data, relayer permit fallback, invoice bufferPolicy v2, QR/printable bill, catalog keys)
is preserved as `later-preserved`; it is not expanded further and not deleted.

## Review-queue v29 findings (private packet, not committed) reconciled against current source

| Finding | Source pin of packet | Status on this branch |
|---|---|---|
| Bundle-origin scan failure on PR #30 | 356fe5e | **Fixed** in `baf8114` (feed source URLs moved out of runtime strings); web build + scan pass; CI green on `c0b0ba6` |
| P1 invoice/fiat expiry not rechecked at final payment guard | a6a2a1c | **Fixed** `3adfd76` (merged): final guard, post-permit, buildFinal and pre-approval checks; permit/router share one deadline capped at invoice/quote expiry. 4 payExec + 1 Pay tests failed before |
| P2 prepared buffer quote outlives 60 s TTL at send | a6a2a1c | **Fixed** `3496cab` (merged): `assertPreparedBufferFresh` in send guard and before approval. 4 payExec + 1 Pay tests failed before; expiresAt-1 passes |
| Vault save commits after session revocation | a6a2a1c | **Fixed** `a8bc764` (merged): guard checked inside the IndexedDB transaction; post-commit change reported, not rolled back. keyVault.test:174 and SellerKeys.test:288 failed before |
| Stale delete confirmation removes replacement vault | a6a2a1c | **Fixed** `fa3bcff` (merged): compare-and-delete in one readwrite transaction; stale confirmation shows "vault changed". Chromium two-tab script `apps/web/scripts/test-seller-vault-idb.mjs` passes (not wired into package.json) |
| Scan replay-tail anchor from primary only | a6a2a1c | **Fixed** `ba0fd59` (merged): two-provider mode reads the anchor from both providers plus a second primary read, checks chain/height; any failure raises a discrepancy, withholds the checkpoint and stops; Cancel writes nothing. Oracle failed before (fabricated anchor saved, resumed run invalidated a canonical vault record); 5/6 matrix tests failed before |
| Direct sweep loses expected hash / re-arms signing after uncertain broadcast | edb0051 | **Fixed** `504018c` (merged): failed or wrong-hash broadcast returns an `unknown` outcome carrying the expected hash and nonce; signing for that address stays blocked across navigation until a read-only status check resolves it. 5 tests failed before (old code kept no outcome, showed a generic RPC_FAILURE). Limit: a page reload clears the guard (no durable persistence) |

## Adversarial review (read-only Opus reviewer, head 94791be)

No Critical or High findings; every new guard sits on the path to the wallet/RPC/storage write it protects (141/141 focused
tests). Low findings and disposition:
- Deadline equal to invoice/quote expiry left a 1 s window (router/permit accept the deadline second): **fixed** `dc7d306`,
  deadline capped at expiry - 1; the test that encoded the off-by-one now fails on the old code.
- Relayed sweep neither checked nor set the unresolved-attempt lock: **fixed** `58c3c4a`; new test failed before.
- Policy-account send (`features/policy/send.ts`) has no session guard or approve-tx check before the wallet call: **open**,
  outside lean scope (feature is experimental and off unless `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1`).
- Sweep lock is in memory only (lost on reload, not shared across tabs): **open**, recorded limit.

## PR #31 reuse

`claude/adoring-wozniak-850ue6` `a2217ea` differs from main only in `scripts/devnet/e2e.mjs` (receipt verification of every
scanned payment). Merged here as `c0b0ba6` after checking the `verifyClaimedPayment` contract; Integration passed on it.
Backup branches `backup/pr30-before-consolidation-20261025`, `backup/pr31-before-consolidation-20261025` and
`work/ghostpay-consolidation-review-20261025` were not touched.

## Not done / blockers

- Worker branches are not pushed under separate names: this session may push only `claude/cool-albattani-xopr89`.
  Worker commits are merged into it and pushed.
- Usage limits paused workers three times; resumed each time without loss.
- Nightly failures above need a dependency/tooling fix that does not weaken the SBOM or Mythril gates.

## Next steps

1. Wait for an uncancelled CI + Integration run on the head carrying all six fixes.
2. Nightly reproducibility/mythril fixes without weakening the SBOM or Mythril gates.
3. Adversarial review of all fund-safety deltas on the frozen head.
4. Durable (reload-surviving) sweep attempt record needs its own reviewed contract.
5. Localize new safety strings (currently English only).
