# Deviations and open points (@ghostpay/hygiene)

1. `deriveFreshDestination` `withSeed` yields the **input key material** (spending-secret bytes) as a copy; the function derives the per-index HKDF seed itself. The copy, the derived seed and the RNG's retained seed are zeroized on return and on throw.
2. RPC parameter types are `Pick<RpcClient,'request'|'chainId'>` (spec: `'request'` only) so the testnet guard can run. `batchedRead` also takes an optional `batch()` (not in chain-adapters yet) and fails closed with `BATCH_UNSUPPORTED` unless `allowUnbatched` is set.
3. `LedgerRow.firstUsedBlock` (spec 4.2 prose, absent from the 6 interface) not built. Added: `DestLedger.recordAcknowledgedReuse`, `linkedSources`, constructor `protocolAddresses`, `HygieneError` codes, `spentCheck`, `assertAddressFree`, `planBuffer`, `dustWorthSweeping`, `options.ts`, `hop-source.ts`.
4. Pure derivation and arithmetic functions (`deriveFreshDestination`, `roundBuffer`, `fundingGuard`, ...) carry no chain context so have no chain guard; every function with a chain id or RPC client has one.
5. `pickDecoys` takes `readonly string[]` and returns checksummed addresses. Addresses with a wrong mixed-case checksum are rejected everywhere.
6. `grid125` never exceeds 2.5x, so the 3x cap is unreachable for it; the check is kept and tested via `assertWithinCap`.
7. Not built: Option B contract; UI; IndexedDB/keystore persistence; `fetchTransferLogs` in chain-adapters (a local topic0-only helper path is used through `rpc.request`); jitter.
8. Tests import `@noble/curves` (hoisted, via core-crypto) in `fixtures.testutil.ts` only.
