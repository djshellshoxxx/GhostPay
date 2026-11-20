> Historical handoff, subsequently completed. Use ../source-coverage.json for final state.

# Fresh worker handoff: BTC views remaining

The outgoing worker's context compacted. The user explicitly requested fresh workers at this boundary. Continue with a new worker and these precise instructions.

## Pins and boundaries

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`, checkout `/workspace/scratch/72c433175c66/GhostPay-bugcheck`.
- Integration: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, checkout `/workspace/scratch/72c433175c66/GhostPay-latest`.
- Parent: `/root`; incoming fresh worker owns remaining BTC view coverage only.
- Read repository `AGENTS.md` boundaries. Source audit only, benign local checks when useful, no product edits, live-network transactions, funds, or exploit operations. Avoid broad optional suites.
- Full-profile optional features are excluded from Pages lean. Qualify findings accordingly.

## Completed

All production policy, Solana and TRON view/adapter files and registry reference Solidity were fully read on integration and compared against main. All unchanged BTC source blobs were fully read; changed integration BTC files were read in full except BtcView.tsx. See the exact ref/path/blob ledger at `/workspace/scratch/72c433175c66/multichain-views-audit.json`.

Confirmed findings and validation evidence: `/workspace/scratch/72c433175c66/multichain-views-findings.md`. MV-01 record dedupe and MV-02 stale form payment are new; MV-03 is the existing open TRON-4. Do not repeat the local proof tests unnecessarily.

Ledger count at handoff: 83 reviewed, one partial, ten pending, 94 total variant records. Treat coverage as incomplete until the following is finished.

## Remaining source to read

1. Integration `apps/web/src/features/btc/BtcView.tsx` **lines 520 through 966**. Lines 1-519 were fully read. A tool request for 520-760 was truncated by the context boundary and does not count as review.
2. Read the complete main-to-integration diffs for these ten paths and enough surrounding source to establish the main behavior. All are under `apps/web/src/features/btc/`:
   - `BtcView.tsx`
   - `esplora.ts`
   - `headers.ts`
   - `oracleSource.ts`
   - `scan.ts`
   - `scanWorkerClient.ts`
   - `scanWorkerMessages.ts`
   - `scanWorkerProtocol.ts`
   - `scanWorkerSource.ts`
   - `verification.ts`

All other BTC files (`network.ts`, `wallet.ts`, `inclusion.ts`, `oracleBridge.ts`, `scan.worker.ts`, `scanStore.ts`, `sweep.ts`) have identical reviewed main/integration blobs. Changed integration files other than the partial BtcView are fully reviewed.

Update the ledger only after actually reading the pending source; preserve exact blob IDs. Append confirmed BTC view findings to the findings file. Report final coverage and findings to parent.

## Pending cross-worker qualification

`/root/btc_packages_continuation` sent this candidate at the outgoing worker's context boundary:

> Package scan/scanner.ts checks abort before each found result, then awaits verifyOutput and/or verifier and yields without a post-await signal check. Both pins unchanged there. A benign deferred verifier resolving true after abort can yield one verified result after cancellation. Also seenKeys is updated while collecting candidates before verifier/crossCheck, so false verifier/aborted checks can flag never-returned keys as duplicates next call. Please qualify actual browser wrapper cancellation/current-generation handling; I will verify package API locally if needed.

Coordinate directly with that worker (or parent if replaced). The outgoing view reviewer has not yet completed the lifecycle qualification and told the package worker so. Do not duplicate their package reproduction.

## Unconfirmed observation, not a finding

Integration BtcView around line 222 builds the payment URI amount as `BigInt(Math.round(Number(amount) * 1e8))`; invalid values fall back to a URI without amount. This may be deliberate input handling. The remaining UI labels/constraints must be read before deciding whether rounding or fallback is an actual issue. Do not promote this to a finding without concrete impact.

No other open BTC view defect was confirmed by the outgoing worker. The header cap is an intentional experimental bound, not by itself an issue. No broad optional suites are needed simply to claim coverage.
