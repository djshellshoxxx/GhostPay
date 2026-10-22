# @ghostpay/hygiene

Own-leak hygiene for the GhostPay client (testnet PoC). Spec: [`docs/remote/privacy-specs/hygiene.md`](../../docs/remote/privacy-specs/hygiene.md). Wiring: [`docs/remote/privacy-specs/wiring/hygiene.md`](../../docs/remote/privacy-specs/wiring/hygiene.md). Self-review: [`docs/remote/privacy-specs/audit-hygiene.md`](../../docs/remote/privacy-specs/audit-hygiene.md).

This is **address hygiene, not anonymity**. Pure logic: no network calls, no storage; the app injects RPC clients, key access and persistence. Testnet-only guard (chain ids 31337, 11155111, 84532) on every chain-bearing entry point.

## What it does

| Id | Module | Function |
|---|---|---|
| HY-DST | `destination` | `deriveFreshDestination`, `recoverDestinationKey`, `hkdfRng`: each sweep goes to a new self-derived scheme-1 stealth address; no announcement, no stored key, rederivable from keys and index |
| HY-CON | `ledger`, `consolidation` | `DestLedger` (one source per destination, strict parse), `assertNoConsolidation`, `sameBlockGate` |
| HY-VER | `verify` | `addressFreeReceipt`, `sweepConfirmed`, `spentCheck` (topic0-only Transfer log reads, matched locally), `pickDecoys`, `batchedRead` (k=7 decoys), `parseTransferLogs` |
| HY-BUF | `buffer` | `roundBuffer` (`grid125`, `sig2`, `off`), `planBuffer`, `bufferDust`, `dustWorthSweeping` |
| HY-FUND | `guard` | `fundingGuard` with the ERC-5564 text |
| options | `options` | `HygieneSettings`, spec defaults, `sanitizeHygieneSettings`, honest labels, NOT-protected list |
| hops | `hop-source` | `HopAddressSource` interface and `createHopAddressSource` (shares the ledger index space) |

## Options and defaults

| Option | Values | Default |
|---|---|---|
| destination | `self-derived`, `external-fresh`, `external-reuse` | `self-derived` |
| verification | `address-free`, `direct` ("tells your RPC which address is yours") | `address-free` |
| bufferRounding | `grid125`, `sig2`, `off` ("fingerprints this client") | `grid125` |
| sweepDust | on/off | on |
| knownWalletGuard | on/off | on |

## Does NOT protect

- The payer still knows S1 and sees the sweep. A fresh destination does not hide the S1 -> D link from the payer or any chain observer.
- The relayer sees owner, destination, amount, timing and IP; a quote and its sweep share the same tuple.
- Spending D together with other funds clusters D with them.
- Timing is not addressed.
- Decoy-batched or block-scoped reads hide the address only from the RPC operator, not from a global observer or an RPC that sees your IP across sessions.
- The token's own `Transfer` log keeps the S1 -> D link on chain.
- The payer chooses the gas buffer; a payer client that ignores the grid still leaks.
- Funding guard is only as good as the list of known wallets; an unknown funder is not "private", just unknown.

## UNVERIFIED

- Nothing here has run against a real RPC or chain. Log shapes and `eth_getLogs` behaviour are mocked.
- k=7 decoys, the 20 000-block cap, 2 000-block chunk, the 3-block post-sweep window: unmeasured guesses (spec Q2).
- `batchedRead` needs a JSON-RPC batch method that `@ghostpay/chain-adapters` `RpcClient` does not have yet (see wiring). Without it the call fails closed.
- Native balance has no log; no address-free native check exists.
- Option B contract `GhostPaySweepRelayerV2` is **not built** (`packages/contracts` off-limits to this lane; spec recommends against it for the PoC).
- Own-derivation vectors are self-generated (determinism, recovery); no external reference implementation exists for the HKDF stream.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```
