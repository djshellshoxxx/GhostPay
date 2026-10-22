# Deviations from, and findings about, the specs

The contracts' real code wins over spec text. Each item should be confirmed or rejected by the lead.

1. **`assertPreviewMatchesCalldata(preview, tx, expectedChainId)` takes the whole transaction and a chain id.**
   The brief said `(preview, calldata)`. Router address and `msg.value` are checked, so the target and value are
   needed; the chain id is not derivable from calldata, so the wallet's chain is passed explicitly (found by a
   failing mutation test where a wrong `chainId` was not detected).
   `decodePaymentCalldata(tx, chainId)` likewise takes `{ to, data, value }`.
2. **Fee recipient is not verified from calldata** (it is a router immutable). It is verified on-chain instead: `verifyDeployment` (verify.ts) reads
   `eth_getCode` of router, sweep relayer and policy factory (keccak256 against the manifest `bytecodeHashes`) and the router's `FEE_BPS()`, `FEE_RECIPIENT()`,
   `ANNOUNCER()` (must equal 25, the manifest, and the canonical announcer constant), through one RPC or two independent ones that must agree. The UI must show the
   returned values, not the manifest text. Closes audit A-07 / G-05 for the read-back half; manifest authenticity still depends on the optional signature
   (`verifyManifestSignature`, 64-byte compact secp256k1 ECDSA over `keccak256(canonicalManifestJson)`, release keys supplied by the build, none by default).
3. **Invoice amount semantics (spec silent).** `fixed_token.tokenAmount` = what the seller should receive when
   `feePolicy = payer_pays` (gross = `grossForNet`, may exceed the target by at most 1 base unit because the fee is
   floor-rounded) and the gross spent when `seller_pays`. `fiat_quote` requires a caller-supplied
   `quotedTokenAmount` (from `quote.ts`); the adapter does not fetch prices itself.
4. **Router `net > 0` check:** `routerNet(0)` throws (contract: `ZeroAmount`); `routerFee(0)` returns 0 (pure math).
   `gross > floor(max_uint256 / 25)` is rejected like the contract's checked-arithmetic panic.
5. **Sweep builder rejects `destination == owner`, `feeTo == owner`, `feeTo == destination`** because the
   contract's balance-delta checks revert on them (contracts DEVIATIONS item 9). The spec does not mention this.
6. **`flatSecurity` fee capability follows the manifest**: `not_deployed` without a `policy` section, `available` with one (new `FeeStatus` value; the spec says
   `enforced`, which would be wrong because this client has no policy-account flow yet, audit A-17 / G-13). The earlier note here (hard-coded because the manifest had no
   factory field) was stale (audit 01 section 5 row 9).
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
13. **Fee parity is now an execution test (audit A-04).** `router.anvil.test.ts` deploys the compiled `GhostPayRouter` (forge artifacts in
    `packages/contracts/out`) with a mock token on a throw-away `anvil` and asserts that `routerFee`/`routerNet`/`grossForNet` equal the on-chain result for boundary
    values (1, 399/400/401, ..., `MAX_ROUTER_GROSS`), random amounts across bit lengths, native payments, and that the router rejects what the client rejects. It skips
    when `anvil` is not on PATH; `REQUIRE_ANVIL=1` makes a missing anvil a failure. Build first: `(cd packages/contracts && PATH=/home/user/tools/foundry:$PATH forge build)`.
14. **Deep scan** (`deepscan.ts`) is a thin wrapper over `checkAnnouncement(..., { ignoreViewTag: true })` from `core-crypto` (no duplicated derivation). It is a separate package entry
    (`@ghostpay/chain-adapters/deepscan`) so the scanner worker does not import the network-capable parts of this package.
15. **Scanner claims are never trusted** (`payments.ts`): `verifyClaimedPayment` and `verifyPaymentByTxHash` establish what the chain supports; `dedupeClaims` collapses
    replays by (one-time address, ephemeral key). All of it is only as honest as the RPC; use `createReconciledClient` (two providers, identical results) for a stronger statement.
16. **RPC adapter (S3-14):** `eth_chainId` is re-verified every 60 s (`chainRecheckMs`) and after any transport failure; `createReconciledClient` routes security-relevant
    reads through two providers. Not done: rejecting private/link-local RPC hosts, cross-checking every log's block hash inside `fetchAnnouncements` (the scanner checks the
    block hash of matched announcements instead).
17. **ERC-6538 (G-07):** registry address, ABI (`scripts/abi-src/IERC6538Registry.sol`, generated by `gen-abi.sh`), calldata builder and decoder, lookup. `verifyRegistry` is a
    behavioural probe (code exists and `ERC6538REGISTRY_ENTRY_TYPE_HASH()` matches); no runtime code hash of the canonical registry or announcer is pinned (not verifiable here).
