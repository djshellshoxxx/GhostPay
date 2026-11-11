# Payment verification and scan review

Review date: 2026-10-22. Read-only review of the in-progress payment-evidence and deep-scan changes in `packages/chain-adapters/src/payments.ts`, `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scannerCore.ts`, and the related tests/UI. Findings below were sent to the source author and root agent. No production source was edited in this review.

## Findings and dispositions

### Closed: provider disagreement can be checkpointed past

The initial review found that `runScan` withheld matches/evidence and the checkpoint for a discrepant page, but advanced its in-memory cursor and continued; a later agreeing page could persist a checkpoint beyond it. The author now stops at the first discrepant page, leaves the cursor at the prior safe position, and added a regression proving a later page is not queried or checkpointed past the gap. Package-scoped web scan tests pass (39 tests).

### Closed: transaction-hash verifier did not validate receipt identity before consuming its logs

`verifyPaymentByTxHash` now requires the receipt transaction hash to equal the request, validates the receipt block hash against the canonical block, requires each announcement log to carry the same transaction and block hashes, and passes the original log to validation without injecting a transaction hash. Added regressions cover mismatched receipt hash, noncanonical block hash, and mismatched log transaction hash. Package-scoped payment tests pass (24 tests).

### Closed: cumulative opt-in deep-scan work now has a hard cap

The author added a cumulative 100,000-announcement per-run cap (including deep scans) and a 10,000-match cap. The scanner checks the next page's announcement count before posting it to the worker, does not advance or persist past that unprocessed page, and surfaces the resume block in the UI. The new test overrides the cap with a small value and verifies no worker processing or cursor advance across the next page. The previous theoretical 100-million-check exposure is closed; deep scanning remains intentionally more expensive and explicitly opt-in.

## Protections observed

- ERC-20 evidence is tied to the known token, router sender, one-time recipient, exact amount, canonical block hash/number, announcement transaction hash, and bounded log index.
- Native evidence requires a successful receipt and transaction tied to the announcement and router, and current balance is not treated as payment proof.
- A successful evidence ID is consumed once per scan; same-address/same-ephemeral replay announcements are deduplicated, with a genuine router record allowed to replace an earlier direct replay in the UI.
- Matches and evidence from a page are committed only after secondary-provider evidence agrees; cancellation before commit avoids partially consuming a page.
- Deep scan is explicit opt-in, limited to router announcements, reports incorrect tags, and runs in the isolated worker.

## Verification boundary

The first combined root invocation ran 62 tests with one apparent failure: a scan test observed a balance read. Root identified that the combined root Vitest invocation resolved the web package's `@ghostpay/chain-adapters` import through stale `dist`. After rebuilding `@ghostpay/chain-adapters`, package-scoped tests passed: `packages/chain-adapters` `src/payments.test.ts` (24 passed), and `apps/web` `src/lib/scanClient.test.ts` plus `src/lib/scannerCore.test.ts` (39 passed), including the checkpoint-disagreement and per-run limit regressions. Do not count the initial cross-workspace failure as a source regression. Static review also inspected UI receipt eligibility and disclosure; receipts are limited to finalized matches with the same active seller signer key and are clearly described as seller attestations, not independent payment proof.

## Addendum: F1 front-run dedupe (2026-11-11)

This addendum supersedes the dedupe rule in "Protections observed" above; the original text is left as written on 2026-10-22.

**Finding (MEDIUM).** `GhostPayRouter` is stateless, so anyone who sees a pending payment can announce through the router first with the copied one-time address `S` and ephemeral key `E` plus a 1-unit allowlisted transfer. Four places kept only the earliest router record per `S|E` and dropped the genuine one before or without verifying it: `dedupeClaims` in `packages/chain-adapters/src/payments.ts` (its test encoded "earliest router wins"), the `claimLedger` rebuild after a reorg and the `claimLedger` upsert in `apps/web/src/lib/scanClient.ts` (a later equal-trust record was skipped), and the `onMatch` upsert by `S|E` in `apps/web/src/views/Scan.tsx`. `packages/cli/src/commands/scan.ts` uses `dedupeClaims` and inherits the fix.

**Rule now.** Group by `S|E`. Every router record is its own item (identity: the announcement id `blockHash:logIndex`) and is verified on its own. Non-router records are dropped once the group has a router record; a group without one keeps its earliest `(block, logIndex)` non-router record. `duplicates` counts what was dropped, and the order of first appearance is kept: the first router record takes the place of an earlier non-router record, later router records are appended, never skipped. `runScan` applies the same rule to its result and rebuilds its ledger the same way after a reorg; the Scan view uses the same rule (`apps/web/src/lib/scanMatches.ts`, `placeScanMatch`) and warns when two or more router records name one one-time address (`scan.matches.sharedAddress`, `scan.match.sharedAddress`; English-only in the machine-drafted catalogs, like other new security copy).

**Unchanged.** Per-scan evidence consumption (`consumedTransfers` / `evidenceLedger`) still stops one transfer from being credited to two announcements; a new regression covers two router announcements for the same `S|E` in one transaction with a single Transfer. No on-chain uniqueness check was added: a revert on a repeated `S|E` would let a front-runner make the genuine payment fail (denial of service).

**Sweep.** A sweep reads the live balance of the record's token at `S` and derives the key from `E`, so two router records for one `S` on different tokens are each sweepable (the per-address attempt journal serialises them while one is unresolved). For the same token, the first sweep empties the address and the second record then shows a live balance of 0 with signing disabled; nothing reports a second credit.

**Tests.** `packages/chain-adapters/src/payments.test.ts` (dedupe and same-transaction evidence), `apps/web/src/lib/scanClient.test.ts` (front-run 1-unit router record plus genuine router payment: both listed and verified with distinct evidence), `apps/web/src/lib/scanMatches.test.ts`, and `apps/web/src/views/Scan.test.tsx` (both cards and the warning shown).
