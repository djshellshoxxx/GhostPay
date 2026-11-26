# FC-05a: Bitcoin spent-output detection and private-scan consent

Full profile only (the lean Pages build excludes BTC). Testnet and proof-of-concept scope. Nothing here is deployed or audited.

## Provenance
- Donor: PR #244, branch `chatgpt/btc-spent-private-scan-20261118`, exact head `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`. It contains #219 (`claude/vibrant-cori-scu18b`, `9617e8572f9bc414410bd937b0e7718d0c5bd55c`, local spent-output detection). Donor common base `58d89b39`.
- Integration base: `origin/main` `60824005b89611aea2b16d3355378eebf072eedb`.
- Branch `claude/fc05a-btc-spentness-20261125`; donor merged with `--no-ff` (merge commit `dc435811`).
- PR #254 (`2b4b1e91`) is a divergent parallel continuation of #219 and is deliberately NOT merged (FC-05b).

## Reconciliation
- Only conflict: `docs/ai/ACTIVE_WORK.md` (both sides add a block at the top). Resolved by union: nothing dropped; the FC-05a claim is first, then main's GP-PAGES-02 block, then the donor's Bitcoin block (separated by a blank line), then the rest.
- Non-BTC path check (`git diff --name-only origin/main HEAD -- . ':(exclude)docs'`): 39 paths, all of them one of: `apps/web/src/features/btc/**` (BtcView, esplora, headers, oracleSource, scan, scanWorker*, verification and their tests/fixtures), `packages/btc-silent-payments/src/scan/**` (headersync, scanner, state and tests), `apps/web/e2e/btc-spent-consent.spec.ts`, `apps/web/e2e/btc-worker.spec.ts`, `apps/web/locales/{ar,en,es,ja}.json`, `apps/web/src/i18n/securityKeys.ts`, `apps/web/DEVIATIONS.md`. No workflow, net-transport, scripts/agent, Solana/TRON, release.ts or other non-BTC path differs from main, so no exceptions are claimed.
- Main commits that must survive, verified as ancestors of HEAD with `git merge-base --is-ancestor`: `0860e8fb` (validate silent-payment destination network during sweep preview), `3a4870e6` (no-IndexedDB BTC header case), `498a72ed` (test). `packages/btc-silent-payments/src/spend.preview.network.test.ts` exists after the merge (existence only; it was NOT run).
- `git diff --check origin/main...HEAD`: clean.

## Spec 12 reading notes (read, not executed)
These come from reading the merged diff and source. No test exercised them in this work.
- Unknown never becomes sweepable: `apps/web/src/features/btc/BtcView.tsx` computes `sweepable` only when the scan's `spentStatus` is not `unknown`; a `local` status whose `toHeight` differs from the checked tip is downgraded to `unknown`.
- Incomplete or historical coverage stays unknown: `packages/btc-silent-payments/src/scan/state.ts` records `spendsFromHeight` only when a block's entire input set was checked (`spendsChecked`); legacy checkpoints and sources without `getSpends` leave it absent, so an earlier match without a spent mark is unknown, not unspent. `scan.ts` sets `spentStatus` to `unknown` when the source has no spends or the scan stopped below the known tip.
- Canonical, header-covered evidence: `HeaderAnchoredTweakSource.getSpends` (headersync.ts) requires the block hash to be in the validated chain and equal to the inner source's hash; `CrossCheckedTweakSource.getSpends` (oracleSource.ts) requires the spends list to match the cross-checked block hash. `recordScannedBlock` keeps the first spend evidence and only marks confirmed matches.
- Chain change invalidates evidence: `reconcileScanState` drops spend marks above the common ancestor; `invalidateReorged` (headers.ts) sets retained results to `unknown` with `spentCount: 0` after a cut and downgrades a `local` result that no longer reaches the tip.
- Consent at worker boundaries: `scanWorkerClient.ts` refuses light-oracle scanning unless `providerSpentCheck` is explicitly true, before creating a worker; `scanWorkerProtocol.ts` rejects `/outspend/` paths without provider consent and `/tx/<id>/hex|merkle-proof` paths without light-mode consent; `validateResult` rejects a result whose `spentStatus` disagrees with the consent used.
- Restart persistence: `parseScanState` validates `spendsFromHeight`, rejects spent marks on non-confirmed matches and mismatched block hashes. Encryption at rest is owned by the caller/vault and was not reviewed here.

## Local validation NOT run
`npm run build:libs` crashed twice in `tsc` (exit 3221225477, an access violation) under host memory pressure: first on `btc-payjoin` (25 of 69 library `dist` folders built), then on `privacy-profiles` (44 of 69). The host has about 0.1 GB free physical memory, so no further local build was attempted. Consequently NO package test, coverage run, typecheck, lint or vitest ran on this branch. Hosted CI is the qualifying gate. A validation job started after the second build attempt was killed or never completed; no results from it are claimed.

Only `git diff --check` and path inspection were run locally.

## Limitations
- Full profile only; testnet; proof of concept.
- #254 deferred to FC-05b.
- Everything above under "Spec 12 reading notes" is unverified by execution.
- Encrypted restart persistence at rest was not reviewed.
