# Deviations from, and findings about, the specs

The contracts' real code wins over spec text. Each item should be confirmed or rejected by the lead.

1. **`assertPreviewMatchesCalldata(preview, tx, expectedChainId)` takes the whole transaction and a chain id.**
   The brief said `(preview, calldata)`. Router address and `msg.value` are checked, so the target and value are
   needed; the chain id is not derivable from calldata, so the wallet's chain is passed explicitly (found by a
   failing mutation test where a wrong `chainId` was not detected).
   `decodePaymentCalldata(tx, chainId)` likewise takes `{ to, data, value }`.
2. **Fee recipient is not verified from calldata** (it is a router immutable). It must be displayed from the
   verified manifest; a manifest-vs-chain check (`FEE_RECIPIENT()` / `ANNOUNCER()` / `FEE_BPS()` reads, code hash)
   is not implemented here and is a required release gate.
3. **Invoice amount semantics (spec silent).** `fixed_token.tokenAmount` = what the seller should receive when
   `feePolicy = payer_pays` (gross = `grossForNet`, may exceed the target by at most 1 base unit because the fee is
   floor-rounded) and the gross spent when `seller_pays`. `fiat_quote` requires a caller-supplied
   `quotedTokenAmount` (from `quote.ts`); the adapter does not fetch prices itself.
4. **Router `net > 0` check:** `routerNet(0)` throws (contract: `ZeroAmount`); `routerFee(0)` returns 0 (pure math).
   `gross > floor(max_uint256 / 25)` is rejected like the contract's checked-arithmetic panic.
5. **Sweep builder rejects `destination == owner`, `feeTo == owner`, `feeTo == destination`** because the
   contract's balance-delta checks revert on them (contracts DEVIATIONS item 9). The spec does not mention this.
6. **`flatSecurity` fee capability is `not_deployed`**, not `enforced` (MULTICHAIN_SPEC section 4): the manifest
   schema has no `PolicyAccountFactory` field yet.
7. **Log validation splits faults in two.** Provider faults (wrong emitter, wrong topic0/scheme, removed flag, block
   outside the requested range) throw `INVALID_LOG`. Attacker-controlled content (anyone may call the announcer:
   wrong topic count, undecodable or non-canonical data, ephemeral key not a 33-byte on-curve compressed point,
   empty metadata) is skipped and counted in `skipped`, so one hostile announcement cannot halt a scan.
8. **Hand-written manifest validator** (zero deps) instead of ajv. Stricter than `schema.json`: rejects all-zero
   tx/bytecode hashes, role collisions (router/relayer/announcer distinct; fee recipient not a contract),
   invalid calendar dates, and wrongly checksummed mixed-case addresses. A test keeps its key set in sync with
   `deployments/schema.json`.
9. **Coverage of `scripts/gen-abi.sh` is by construction, not by test:** run it with `forge` and `solc` on PATH
   (`SOLC=/home/user/tools/solc` in this sandbox). The Chainlink ABI is produced from a minimal local interface
   (`scripts/abi-src`), not from Chainlink's repository.
10. **`typecheck`/`test` resolve `@ghostpay/core-crypto` and `@ghostpay/invoice-schema` to their `src` via tsconfig
    `paths` / vitest `alias`** (their `main` points at an unbuilt `dist`). `npm run build` builds those two first.
11. **Jitter randomness** uses Web Crypto (Math.random is banned by the repo lint rule), injectable for tests.
12. **RPC retry classification:** retries only transport failures, HTTP 429/5xx and JSON-RPC -32005/-32097;
    `eth_getLogs` windows are halved (not retried as-is) on -32005/-32602.
13. **Spec text mismatch noted, no code impact:** FEE_SCHEDULE section 4 says the client preview "equals the contract
    result (differential test against the compiled router)"; no EVM exists in node here, so parity is evidenced by
    shared boundary vectors (399/400 etc. from `GhostPayRouter.t.sol`), a regex check of `FEE_BPS`/`BPS` in the
    Solidity source, and the contracts' own Foundry tests. It is NOT a differential execution test.
