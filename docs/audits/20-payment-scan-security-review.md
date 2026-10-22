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
