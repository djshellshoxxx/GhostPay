# Wiring: @ghostpay/hygiene

For the `apps/web` / `apps/relayer` / `chain-adapters` owners (waves E1, E5, E6, E7). Package is built and tested; nothing below is applied. Testnet-only. All copy must say "address hygiene, not anonymity".

## Not built
- Option B `packages/contracts/src/GhostPaySweepRelayerV2.sol` (+ tests HY-CTR-1..3). Off-limits to this lane; spec recommends no contract change for the PoC. If wanted, lane E8 builds it from spec 4.6.

## packages/chain-adapters (E1)
- Add `batch(calls: {method; params}[]): Promise<unknown[]>` to `RpcClient` (one JSON-RPC batch, results in call order). `batchedRead` (HY-VER-4) fails closed without it.
- Optional: `fetchTransferLogs(client, token, from, to)` topic0-only helper with the `fetchAnnouncements` range/size caps. `verify.ts` already does the read via `rpc.request('eth_getLogs')` with the same params, so this is a refactor, not a blocker.

## apps/web/src/lib/settings.ts, views/Settings.tsx (E6)
- Add `hygiene: HygieneSettings` (or fold into the `privacy` field of `privacy-profiles`). Use `sanitizeHygieneSettings(raw)` in `sanitizeSettings`; defaults `DEFAULT_HYGIENE_SETTINGS`.
- Section "Sweep hygiene" with five controls; render `HYGIENE_LABELS` strings verbatim (direct mode label is persistent, HY-VER-5); show `HYGIENE_NOT_PROTECTED` under the section.

## apps/web/src/lib/keystore.ts, idbStore.ts
- Persist `DestLedger.toJSON()` in the encrypted keystore export; load with `DestLedger.from(parsed, protocolAddresses)` (router, relayer, token addresses as `protocolAddresses`). Parse failure: refuse to sweep to `external-*`, tell the user.

## apps/web/src/views/Sweep.tsx, lib/sweep.ts
- Default destination: `idx = ledger.nextIndex()`; `deriveFreshDestination(ownMeta, withSeed, idx)` where `withSeed` is a `requireSession()` scoped accessor giving a COPY of the spending-secret bytes (package zeroizes it). Show "Fresh address #idx (derived from your keys)" + full address. Never prefill a used address (HY-DST-1).
- Before signing: `assertNoConsolidation(ledger, chainId, dest, source)`; after relayer accepts: `ledger.record(chainId, dest, source, idx)` then persist. `external-reuse`: typed confirmation, list `ledger.linkedSources(...)`, then `recordAcknowledgedReuse`.
- One `(source, token)` per action; "sweep all" sequential with jitter from `lib/jitter.ts`, new index each; `sameBlockGate(lastBlock, head)` using `rpc.blockNumber()` (no address) then wait `minBlock` + jitter.
- Replace `readBalance` (line ~38) when `verification === 'address-free'`: `spentCheck` (token) and show "may be incomplete" if `mayBeIncomplete`. Native: use `bufferDust(paid, gasUsed, effectiveGasPrice)` and `dustWorthSweeping`; if true offer a native sweep to the SAME destination.
- `directSweep` nonce read (line ~171): `batchedRead(rpc, {method:'eth_getTransactionCount', address}, pickDecoys(announcedAddrs, ownedAddrs, 7))`. `ownedAddrs` = every address the user controls.
- Post-sweep confirmation: `sweepConfirmed(rpc, {token, from, to, net, head})`, poll; do not call `eth_getTransactionReceipt(txHash)` in address-free mode. `direct` mode shows the persistent label.
- Recovery without ledger: derive indices 0..200 and check each address-free (log read), not per-address balance.
- Modal block when `canUse` returns `DEST_HAS_OTHER_SOURCE`.

## apps/web/src/views/Scan.tsx
- After a match: `addressFreeReceipt(rpc, {token, block, txHash, stealth, net})`; `mismatch` = warn, do not mark received.

## apps/web/src/lib/pay.ts, views/Pay.tsx
- `const p = planBuffer(raw, settings.bufferRounding)`; show raw, rounded, extra (HY-BUF-5); pass `p.maxBufferWei` as `maxBufferWei` and `p.rounded` as the buffer (HY-BUF-4).

## Funding guard (Sweep/Scan views)
- Never render "send ETH to this address". For a pasted funder tx use `fundingGuard(from, {wallets: connectedWallets, destinations: ledgerDestinations})`; show `message` when `allow` is false.

## apps/relayer (E5), tests only
- AT-HY-7: add an e2e/log test that two sweeps from two owners produce two txs and that logs and `/metrics` contain no owner/destination (HY-CON-5, PO-LOG). No source change.

## Hops (lane M)
- `createHopAddressSource({ownMeta, withSeed, withKeys, ledger})` implements `HopAddressSource`; hops must `ledger.record(chainId, hopAddr, previousSource, index)` before the next `next()` after a restart. `hops` keeps its own local copy of the interface.

## Docs (E7)
- `docs/user/privacy-limits.md`: add `HYGIENE_NOT_PROTECTED` list. Add `@ghostpay/hygiene` to `build:libs` order after core-crypto and chain-adapters.

## Egress tests
- AT-HY-9 Playwright recorder: in `address-free` mode no request body contains the matched stealth address or D. `assertAddressFree` already enforces this inside the package.
