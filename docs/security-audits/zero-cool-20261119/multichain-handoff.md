# Multichain review handoff

Status: complete. Assigned source: 63 unique path/blob versions, 59 paths, 472 path/ref appearances across the eight pinned commits. All entries in `multichain-coverage.json` are reviewed; no assigned production source remains unread.

Written files are limited to `multichain-review.md`, `multichain-coverage.json`, and this handoff under `docs/security-audits/zero-cool-20261119/`. No source fixes, tests, transactions, probes, commits or remote writes were performed by this worker.

## Findings for root consolidation

- **MC-01, Low supporting API:** `SoftwareSilentPaymentSigner.signSpend` derives keys before awaiting the documented asynchronous confirmation callback; after the await it checks neither abort nor disposal and can still sign with the retained derived buffers. All eight refs share spend.ts blob `60697bc4a3b2c8518f822786027049ee6d770e53`. The actual Pages `signSweep` uses a synchronous confirmation callback and owns/disposes its signer locally; do not claim the long-pending approval prerequisite exists there. Relevant package lines: entry 636–645, await/sign 710–718, dispose 588–590. No reproduction was run.
- **MC-02, Low baseline release gap:** TRON `getBlockRange` tolerates missing/short/non-contiguous ranges; the scanner advances by requested page size. Main and main-based erc20-simulation affected. The other six refs contain known correction `259c2760` / `SOLANA-TRON-08`, updated rpc.ts blob `d0a921bb15848c23db3338fa1c96e18146cbda88`.
- **MC-03, Low unresolved privacy, all eight refs:** current TRON scan still queries receipts for matching TRC-20 candidates. Package `scan.ts` line 157 checks the local viewing-key match; line 158 calls `confirmTrc20`, whose line 125 requests `/wallet/gettransactioninfobyid` for that match. Current browser `features/tron/scan.ts` calls this iterator and only discards token results after the request. An absent trusted-token list does not prevent it. This narrows/corrects WV-06's claim that updated TRON scanning removed all per-match RPC. Native balance/memo disclosure is fixed; token receipt disclosure remains. Deduplicate by either splitting WV-06's asset-specific status or counting MC-03 as its residual token case.
- **WV-05 independently confirmed:** TRON network check rejects only mainnet genesis and never compares the selected Nile/Shasta value; the UI supplies no expected-network argument. All eight refs; Low testnet identity issue, not a mainnet bypass. Count once under the views primary ID.

Known BTC scan-state fixes were read in full: local-spend forwarding, continuous coverage, older evidence reconciliation, canonical spend preservation, duplicate/parser consistency checks (`9617e857`, `e5b25efe`, `78e50547`). Baseline browser still independently re-derives and checks current outspends before spending, so do not turn these supporting limitations into unsupported metadata-to-fund-loss claims.

Standalone BlindBit HTTP timeout/body compatibility and residual secret-buffer cleanup are supporting hardening observations. Current browser's bounded oracle bridge compensates for the former; no independent memory disclosure was established for the latter. The report explains both.

## Source accounting

All baseline files were read in full. The four differing package files were additionally reviewed via complete main-to-release diffs: BTC `scan/headersync.ts`, `scan/scanner.ts`, `scan/state.ts`, and TRON `rpc.ts`. Updated refs are byte-identical for those files as recorded in the inventory. All other files have a single blob across all eight snapshots. Generated protobuf source was included. Supporting tests were inspected only as source evidence, never claimed executed.

## Publication restriction

The parent received an automatic approval-review rejection on publishing these security notes to the public remote. Do not push, create a PR, use an API write, or delegate publication as a workaround. Root will present the completed local notes and seek explicit publication approval.
