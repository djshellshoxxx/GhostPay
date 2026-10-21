# Deviations from, and findings about, the specs

The contracts' real code wins over spec text. Each item should be confirmed or rejected by the lead.

1. **`assertPreviewMatchesCalldata(preview, tx, expectedChainId)` takes the whole transaction and a chain id.**
   The brief said `(preview, calldata)`. Router address and `msg.value` are checked, so the target and value are
   needed; the chain id is not derivable from calldata, so the wallet's chain is passed explicitly (found by a
   failing mutation test where a wrong `chainId` was not detected).
   `decodePaymentCalldata(tx, chainId)` likewise takes `{ to, data, value }`.
2. **Fee recipient is not verified from calldata** (it is a router immutable). It must be displayed from the
   verified manifest. UPDATE 2026-10-21: `readback.ts` (`verifyManifest`) now reads `FEE_RECIPIENT()` / `ANNOUNCER()` /
   `FEE_BPS()` and `eth_getCode` hashes back and fails closed; see item 14. Apps still have to CALL it (and pass the
   result to `createEvmAdapter({ readback })`); nothing in this package forces them to.
3. **Invoice amount semantics (spec silent).** `fixed_token.tokenAmount` = what the seller should receive when
   `feePolicy = payer_pays` (gross = `grossForNet`, may exceed the target by at most 1 base unit because the fee is
   floor-rounded) and the gross spent when `seller_pays`. `fiat_quote` requires a caller-supplied
   `quotedTokenAmount` (from `quote.ts`); the adapter does not fetch prices itself.
4. **Router `net > 0` check:** `routerNet(0)` throws (contract: `ZeroAmount`); `routerFee(0)` returns 0 (pure math).
   `gross > floor(max_uint256 / 25)` is rejected like the contract's checked-arithmetic panic.
5. **Sweep builder rejects `destination == owner`, `feeTo == owner`, `feeTo == destination`** because the
   contract's balance-delta checks revert on them (contracts DEVIATIONS item 9). The spec does not mention this.
6. **`flatSecurity` fee capability** now derives from `manifest.policy` (2026-10-21): `not_deployed` without it,
   `enforced` with `flatFee > 0`, `not_enforceable` with `flatFee == 0`. It does not prove the policy contracts are
   live; `verifyManifest` checks their code hashes.
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
14. **Manifest read-back (`readback.ts`).** Checks: chain id, `FEE_RECIPIENT`, `ANNOUNCER`, `FEE_BPS == 25`, runtime
    codehash of router / relayer (and policy implementation / factory), announcer has real code (optionally a pinned
    codehash). `bytecodeHashes` is compared as the hash of the deployed runtime code, i.e. POST-immutable, as
    DEPLOYMENT_MANIFEST.md defines it; the spec-01 idea of a second build-time hash with `immutableRanges` zeroed is NOT
    implemented. Empty code and EIP-7702 designators (`0xef0100`) are refused. With two clients every read must agree
    (`requestWithFallbackCheck`). NOT implemented: manifest signature verification (needs the release key), the
    sweep-relayer `DOMAIN_SEPARATOR()` check, result caching per (chain, block) and the 10 min re-check. The unit tests
    use a mock RPC; the anvil test against the compiled router (spec 01 section 4) is NOT written.
15. **Non-router announcement amounts (`verify.ts`).** Amounts are `verified` only for router announcements
    (`caller == manifest.router`; the router enforces metadata == transfer, so this inherits the readback trust) or
    when allowlisted-token ERC-20 `Transfer(_, stealth)` logs exist in the announcement's block (and transaction when
    the provider gives its hash). Native-coin direct payments and non-allowlisted tokens stay `claimed`. `balanceOf` is
    not used (needs archive state or races with sweeps). A direct payer who transferred in an earlier block than the
    announcement is reported `claimed` (conservative). Verification calls use the primary client only.
16. **Scan corroboration and finality (TS-03, audit gap 7).** `fetchAnnouncements` takes `minConfirmations` and
    `secondary` (second provider: each `eth_getLogs` window is compared through `requestWithFallbackCheck` on a
    normalised projection, and the closing block hash on both). It returns `head`/`scanHead` and sets `confirmations`
    on each announcement; the adapter adds `confirmations`/`final` to `DetectedPayment` and calls `deps.onReorg`.
    The generator cannot retract earlier yields: consumers must drop matches with `blockNumber >= rolledBackTo`.
    The spec-02 expected-payment fallback for wrong view tags is NOT implemented (needs invoice records).
17. **ERC-6538 (`registry.ts`, `abi/erc6538.ts`).** The ABI is HAND-WRITTEN from the EIP text (no reference source is
    vendored, so it is not generated or compiled). Selectors follow the EIP signatures but have not been executed
    against the reference contract (no anvil here). `REGISTRY_CODEHASHES` is EMPTY: no codehash could be verified, so
    `assertRegistryAvailable` fails closed unless the caller pins one. EIP-712 typed data for `registerKeysOnBehalf`
    is not provided (domain constants unverified). Only scheme 1 is supported.
18. **Quote hardening (TS-07, TS-13).** `readPrice` accepts `heartbeatSeconds` (caps the accepted age at heartbeat +
    300 s regardless of the invoice-supplied `maxAgeSeconds`; callers should now always pass it) and
    `sequencerUptime` (`assertSequencerUp`, answer 0 = up, grace 3600 s). `withinSlippage` implements the
    `quote.maxSlippageBps` comparison; the app still has to take the second read. `FEEDS` stays empty, so no
    heartbeat or sequencer feed is configured here. `-32000` range errors are still not halved.
