# @ghostpay/payer-sponsor

TypeScript side of the payer-address modes PH-1 to PH-4 and the testnet sponsor service core. Spec: [`payer-hiding.md`](../../docs/remote/privacy-specs/payer-hiding.md). Contracts: [`../payer-hiding-contracts`](../payer-hiding-contracts). **Testnet only** (31337, 11155111, 84532; mainnet ids fail with `MAINNET_FORBIDDEN` at every entry point). Not wired into `apps/web` or `apps/relayer`; nothing here has run against Sepolia, Base Sepolia, a public RPC or a public bundler.

**What it does and does not do.** PH-2/3/4 let a sponsor pay gas, which removes the native-gas funding link of a payer wallet. The payer address is still public, the payer wallet still needs its payment tokens from somewhere (that link remains), and the sponsor sees payer, stealth address, token, amount, network address bucket and timing. PH-1 only helps you avoid obvious links when funding a one-time wallet.

| Module | Mode | Content |
|---|---|---|
| `modes`, `PAYER_MODE_INFO`, `modeNotices`, `modeAvailability` | all | comparison table, mandatory notices (PH-GEN-3/5), availability with reasons (`NO_7702`, ...) |
| `freshWallet/{derive,fundingPlan,lint,hygiene}` | PH-1 | HKDF payer-key derivation (key in a `SecretBox`), funding planner (round up to 2 significant figures, random delay), linter (`SAME_SENDER_RECEIVER`, `SHARED_FUNDER`, `EXACT_AMOUNT`, `NO_DELAY`, `LEFTOVER_RETURN`, `PAYER_REUSE`, always `TOKEN_FUNDING_LINK`). Pure, no I/O; `fetchFundingHistory` is the one helper that sends an address to a history source |
| `relay/intent` | PH-2 | EIP-712 order for `GhostPayPayRelay`, ERC-2612 permit typed data, `encodeRelayPay` |
| `eip7702/intent` | PH-3 | delegate order, authorization request (chain id never 0, delegate must be in the manifest), clearing authorization, `isDelegatedTo` |
| `erc4337/{userop,paymaster,account}` | PH-4 | v0.7 `PackedUserOperation`, `getUserOpHashV07`, `executeBatch`, paymaster data and signed hash, `initCode`, counterfactual address, `verifyEntryPoint` (code-hash check) |
| `routerTargets` | all | `payERC20` encoding for both routers, review step `decodeAndCheckPayload` |
| `manifest` | all | strict validation of the per-chain deployment manifest |
| `sponsor/service` | PH-2/3/4 | `SponsorService`: quote (fee >= gas cost x (1 + safetyBps), rounded up), submit/sponsor flows, simulation before send, post-mining check that the fee was actually paid, token bucket + breaker + loss budget from `@ghostpay/relayer-guard`, allowlisted logging |
| `sponsor/{http,wire,viemChain,keys,log}` | | HTTP-agnostic handler + `node:http` server (`POST /v1/quote`, `/v1/submit`, `/v1/sponsor-userop`, `GET /v1/health`), strict JSON parsers (bigint as decimal strings), viem adapter, hot-key handling through `SecretBox`, field-allowlist logger |

```bash
npm run typecheck && npm run lint && npm test      # from this directory; build contracts first for the anvil e2e (see below)
```

The anvil end-to-end test (`src/e2e.anvil.test.ts`) runs the real contracts (GhostPayRouter, relay, delegate with a type-4 transaction, EntryPoint v0.7, factory, paymaster) through `SponsorService`. It needs `anvil` (`ANVIL_BIN` or `/home/user/tools/anvil`) and the Foundry artifacts: `cd ../payer-hiding-contracts && ./scripts/fetch-entrypoint.sh && FOUNDRY_SOLC=... forge build`. It skips when they are missing; `REQUIRE_ANVIL=1` makes it fail instead.

`test-vectors/ph-vectors.json` holds the golden vectors shared with the Foundry test `GoldenVectors.t.sol` (`GEN_VECTORS=1 npx vitest run src/vectors.test.ts` rewrites it from this package; the Foundry side then must still pass).

Deviations from the spec and unverified items: [`DEVIATIONS.md`](./DEVIATIONS.md). Review: [`audit-payer-sponsor.md`](../../docs/remote/privacy-specs/audit-payer-sponsor.md). Wiring: [`wiring/payer-sponsor.md`](../../docs/remote/privacy-specs/wiring/payer-sponsor.md).
