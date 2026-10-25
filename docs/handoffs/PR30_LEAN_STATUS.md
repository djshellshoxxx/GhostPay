# PR #30 lean-core status (session 01LUsecE)

Updated 2026-10-25 17:25 UTC. Branch `claude/cool-albattani-xopr89`, draft PR #30 -> `main`.

## Verified heads

- PR #30 head `c0b0ba6`: GitHub CI run 40178968128 **success** and Integration run 40178968082 **success** (first uncancelled
  run on this branch; earlier red `typescript`/`contracts` gates were cancelled-job aggregates from rapid pushes).
- `main` `edb0051`: Nightly run 40176717292 **failure**, pre-existing (also failed on `dbee678`): `reproducibility`
  (`npm sbom` ESBOMPROBLEMS: `abitype@1.0.8` wants `zod@^3`, tree has `zod@4.6.7`) and `mythril` (pip metadata build error).
  Not caused by PR #30; not yet fixed.

## Scope

Owner-approved lean release scope: `docs/handoffs/LEAN_RELEASE_SCOPE.md` (one EVM invoice -> pay -> detect/receipt -> sweep
-> backup/restore path). Optional work already merged on this branch (embed, private scanning, policy accounts, BTC hardening,
Solana/Tron views, tag archive, chain data, relayer permit fallback, invoice bufferPolicy v2, QR/printable bill, catalog keys)
is preserved as `later-preserved`; it is not expanded further and not deleted.

## Review-queue v29 findings (private packet, not committed) reconciled against current source

| Finding | Source pin of packet | Status on this branch |
|---|---|---|
| Bundle-origin scan failure on PR #30 | 356fe5e | **Fixed** in `baf8114` (feed source URLs moved out of runtime strings); web build + scan pass; CI green on `c0b0ba6` |
| P1 invoice/fiat expiry not rechecked at final payment guard | a6a2a1c | Open, re-confirmed in source; worker `lean-expiry` reproducing first |
| P2 prepared buffer quote outlives 60 s TTL at send | a6a2a1c | Open, re-confirmed (TTL only in `buildFinal`); worker `lean-expiry` |
| Vault save commits after session revocation | a6a2a1c | Open, re-confirmed; worker `lean-vault` (failing-before tests written) |
| Stale delete confirmation removes replacement vault | a6a2a1c | Open, re-confirmed; worker `lean-vault` |
| Scan replay-tail anchor from primary only | a6a2a1c | Open, re-confirmed (`persistable` reads primary only); queued after the above |
| Direct sweep loses expected hash / re-arms signing after uncertain broadcast | edb0051 | Open, re-confirmed; queued after scan anchor |

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

1. Merge `lean-expiry` and `lean-vault` with their failing-before evidence; run scoped tests, web typecheck/build; push; wait
   for uncancelled CI.
2. Scan replay-tail anchor corroboration (reproduce-first).
3. Direct-sweep unknown-after-handoff descriptor (reproduce-first).
4. Nightly reproducibility/mythril fixes.
5. Adversarial review of all fund-safety deltas on the frozen head.
