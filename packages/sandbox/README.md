# Mock chain simulator

`@ghostpay/sandbox` is a deterministic, in-memory test fixture. It is separate from Anvil, `ux-sandbox`, real contracts and public-chain adapters. The reserved chain IDs and test invoice branding are conventions that callers must also enforce.

`getTx`, `getBlock`, `getEvents`, `mine` and `mineBlocks` return detached snapshots. Changing a returned snapshot cannot change chain state, and old transaction snapshots do not update when the chain mines. Submitted nested announcements are copied. Requery when current state is needed.

Fault counts/delays must be non-negative safe integers. A delay that exceeds the safe clock range is rejected before submission. Injected clock values must be non-negative safe integers; block timestamps remain monotonic when a custom clock moves backward. `ManualClock` rejects backward movement and arithmetic overflow. Invalid controls fail before consuming a transaction identity or changing balances/blocks.

A `failNext` fault attaches to its submitted transaction, including replay after a reorg. Dropped transactions stay unmined. Reorgs restore balances/events and replay or drop transfers; faucet mints in removed blocks are dropped. Faucet cooldowns are an operator rate limit and deliberately survive reorgs. All money is bigint base units; announcements are simulator fixture strings, not cryptographic validation.

```sh
npm ci --ignore-scripts
npm run build -w @ghostpay/sandbox
npm run typecheck -w @ghostpay/sandbox
npm run lint -w @ghostpay/sandbox
npm test -w @ghostpay/sandbox
```

Passing these scenarios establishes simulator behavior, not payment finality, contract safety or public-chain compatibility.
