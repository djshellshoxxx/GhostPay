# Cross-package integration QA (anvil)

Branch claude/remote-extensions-1, run 2026-10-21. Only what was run or read in code is stated.

## Environment constraints
- `solc` is unavailable: foundry.toml pins `/home/user/tools/solc` (absent) and the `/usr/local/bin/solc` solc-select shim tries to download (proxy 403). `forge build` therefore could not run (`Error: solc "/home/user/tools/solc" does not exist`).
- All anvil runs used pre-built artifacts from `packages/contracts/out-stress` (newer than all `src/*.sol`; contains ERC5564Announcer, GhostPayRouter, GhostPaySweepRelayer, PermitToken, PolicyAccount*, MockERC20). Artifacts were not rebuilt from current source by me (unverified freshness beyond mtime).
- Default `packages/contracts/out` lacks `MockERC20`, `ERC5564Announcer`, `PermitToken`, `PolicyAccountFactory`, so the default-path anvil tests cannot run in this checkout.
- anvil: `/root/.local/bin/anvil`. No bitcoind, so no regtest.
- Scratch tests were temporary copies inside package `src/` (removed after each run; `git status` clean for those dirs); sources in the session scratchpad.

## 1. policy-scheme <-> contracts (REQUIRE_ANVIL)
- `REQUIRE_ANVIL=1 npx vitest run src/anvil.test.ts` (default artifacts): FAIL, 1 failed / 7 skipped. This is the intended fail-closed guard (anvil.test.ts:59-63), fired because `contracts/out` lacks artifacts. Not a product bug; environment.
- `REQUIRE_ANVIL=1 POLICY_SCHEME_ARTIFACTS=<abs>/packages/contracts/out-stress`: PASS 7/7 (typehashes+factory constants, predictAddress/policyHashOf and deploy, package-signed withdraw/cancel and wrong-signer rejection, vector propose/cancel signatures, GhostPayPolicyRouter pay -> scan -> deploy -> withdraw). Real contracts, real anvil, not mocked.
- Note: `POLICY_SCHEME_ARTIFACTS` is resolved relative to `src/` (anvil.test.ts:`resolve(import.meta.dirname, env ?? '../../contracts/out')`); relative values are easy to get wrong, use absolute.

## 2. chain-adapters <-> router/sweep (real contracts, anvil --chain-id 11155111)
chain chosen because 31337 is not an enabled chain in `config/chains.ts` (buildPaymentTx fails CHAIN_DISABLED). No existing chain-adapters test uses anvil: router/sweep/adapter/rpc tests are pure unit or mock-RPC (`rpc.testutil.ts`, source-text regex parity in sweep.test.ts:19-40).
Scratch test deployed Announcer, GhostPayRouter, GhostPaySweepRelayer, PermitToken (code copied onto the allowlisted Sepolia USDC address via `anvil_setCode`), then through the real `createClient` (localhost opt-in), `createEvmAdapter`:
- `buildPaymentRequest(...).build()` -> `assertPreviewMatchesCalldata` ok; sent as tx -> router `payERC20` success; stealth balance == `netAmount` (10_000_000), fee recipient balance == `feeAmount` (25_062): PASS (fee math matches contract).
- `adapter.scan` over real logs: 1 hit, `viaRouter=true`, stealth address and metadata token match: PASS.
- `deriveStealthSecret` -> `addressOfSecret` == stealth address: PASS.
- `buildPermitTypedData` (with on-chain `DOMAIN_SEPARATOR` cross-check) + `signPermit` + `buildSweepTypedData` + `signSweep` -> `sweepWithPermit` on the real relayer: success, destination delta == amount - fee (9_999_000): PASS. Replay of same nonce reverts: PASS.
- Gap: only payERC20 + sweepWithPermit exercised; payNative, payERC20WithPermit, payERC20WithBuffer, plain `sweep` with allowance, policy manifest branch were not run on anvil.

## 3. relayer e2e (apps/relayer/src/e2e.anvil.test.ts)
- `npx vitest run src/e2e.anvil.test.ts` as shipped: 1 SKIPPED (silent). Cause: `ANVIL` defaults to `/home/user/tools/foundry/anvil` (line 12) and `OUT` is hardcoded to `contracts/out` (line 13) with no override env.
- With a temp copy pointed at `out-stress` and `ANVIL_BIN=/root/.local/bin/anvil`: PASS 1/1 (quote -> permit sweep -> token movement -> replay 409 `nonce_used`). Real relayer runtime, real contract.

## 4. relayer <-> web wire contract
### DEFECT W-1 (HIGH, confirmed): web `/v1/sweep` request omits `chainId`; the relayer rejects every web sweep
- Evidence: `apps/relayer/src/validate.ts:76` `parseSweepRequest` requires `chainId` at top level; `apps/web/src/lib/relayerClient.ts` `SweepSubmission` has no `chainId` and `apps/web/src/lib/sweep.ts:133-141` (`relayedSweep`) sends `{sweep, sweepSig, permit, quoteToken}` only (has `i.target.chainId` in scope, unused in the body).
- Repro: temp test importing web `submitSweep` with a capturing fetch and relayer `parseSweepRequest`: body keys = `sweep,sweepSig,permit,quoteToken`; `parseSweepRequest(body)` -> `RelayerError invalid_request` (400, codec.ts:27); with `{chainId: 84532, ...body}` -> OK. So against a real relayer the web relayed-sweep path always 400s. `/v1/quote` body matches exactly (chainId, token, owner, destination, amount as decimal string).
- Why undetected: web tests (`relayerClient.test.ts`, `Sweep.test.tsx`) mock fetch and never feed relayer validation; the relayer e2e builds its own request including `chainId` (e2e.anvil.test.ts:155). No web<->relayer test exists; Playwright specs (`apps/web/e2e`) do not reference the relayer.
- Suggested fix: add `chainId` to `SweepSubmission` and the `relayedSweep` call; add a contract test asserting the web body parses with `parseSweepRequest`.

### DEFECT W-2 (LOW, confirmed): error class from relayer is dropped by the web client
- Relayer errors are `{error:{code}}` (server.ts:190), web `post()` only reads string `error` (`relayerClient.ts` ~line 49), so users see `HTTP 409.` instead of `(nonce_used)`. Output of repro: `The relayer refused the request: HTTP 409.`
- Fix: also accept `error.code`.

Other wire fields verified compatible by repro: quote response (`fee` string, `feeTo`, `expiresAt` number, `quoteToken` charset) is accepted by the web parser; web `quoteToken` charset accepts the relayer `v1.<exp>.<fee>.<mac>` pattern (by code reading; the real server response was exercised only in the relayer-only e2e, not through the web parser; unverified end to end).

## 5. BTC silent-payment spend verify
- `spend.test.ts` + `spend-vectors.test.ts`: PASS 12/12.
- Independent check (temp test): 3 detected SP outputs swept via `buildSpendTransaction`; hand-rolled BIP-341 SIGHASH_DEFAULT sighash (own serialization with sha256/tagged hash, no scure sighash) equals `tx.preimageWitnessV1` for every input and `schnorr.verify(sig, handrolledSighash, outputKey)` is true for every input; fee 642 sat at vsize 214 = exactly 3.000 sat/vB. PASS.
- Gap/mocked: no bitcoind/regtest, so consensus acceptance (script verification, standardness, mempool) was NOT verified; funding transactions are synthetic (`fakeTxid`). `regtest` addresses unsupported by design (spend.ts doc).

## Summary of gaps
- Contracts cannot be rebuilt in this sandbox (no solc); results depend on `out-stress` artifacts.
- CI comment (ci.yml:~124) says REQUIRE_ANVIL is honored by relayer e2e "once e2e.anvil.test.ts reads it"; it does not (grep: only policy-scheme/src/anvil.test.ts references it), so a missing anvil/artifact silently skips the only relayer-to-contract test (`describe.skipIf`). Severity MEDIUM (assurance gap). Fix: read REQUIRE_ANVIL, fail when unavailable; allow ANVIL_BIN/artifact dir overrides and a sandbox-agnostic default.
- Not exercised: relayer against the policy router, web Playwright against a live relayer/anvil, btc against bitcoind.
