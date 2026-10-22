# Deviations and open points (@ghostpay/payer-sponsor)

Spec: [`payer-hiding.md`](../../docs/remote/privacy-specs/payer-hiding.md). Evidence tags: **[RAN]** run here, **[U]** unverified.

## Deviations

1. **One package instead of two.** The spec planned `packages/payer-hiding` (library) and `apps/payer-sponsor` (service). This build (brief: lane `packages/payer-sponsor`) keeps both in `packages/payer-sponsor`; the service core is transport-agnostic and a thin `node:http` server is included, but there is **no `main.ts`, no environment-variable configuration and no process entry point**. Operators must construct `SponsorService` themselves.
2. **`lintFunding` and `planFunding` take extra inputs** the spec signatures did not list: `planFunding` needs `funder` (and optional `tokenSource`) to refuse known funders; `lintFunding` takes an options object (`payer`, `requiredGasWei`, `paymentAtMs`, `priorPayers`, `usedPayers`, `minDelayMs`) because `EXACT_AMOUNT`, `NO_DELAY` and `PAYER_REUSE` cannot be computed from the transfer list alone.
3. **`derivePayerKey` returns a `SecretBox`** (`@ghostpay/secret-box`) instead of `SecretBytes`; that is the type the repository ships. The transient hex string used to compute the address cannot be wiped (best-effort hygiene).
4. **`buildDelegatePayIntent` takes the payer's current account nonce from the caller** and a validated manifest; it does not read the chain.
5. **PH-4 is limited to the first operation of a fresh account** (`nonce == 0`, `initCode` = our factory for the stated owner and salt). The sponsor cannot verify the owner of an already deployed account without extra chain reads; one fresh payer per payment is the intended use anyway.
6. **PH-4 sponsor flow has two calls** (`/v1/sponsor-userop` then `/v1/submit` with `mode: "erc4337-paymaster"`), because the paymaster signature binds the operation and the owner signature binds the paymaster data. One paymaster authorisation per quote.
7. **ERC-7677 (`pm_getPaymasterData`) adapter is not implemented** (status Review; the spec says optional). The own JSON endpoints are used.
8. **Quotes are held in process memory** (random 128-bit id, TTL, global and per-client caps). A restart or a second instance forgets them; clients simply ask again.
9. **Mined-revert classification is coarse.** Any mined revert or any succeeded transaction without the sponsor-fee `Transfer` log is charged to the loss budget and treated as neutral for the breaker (S3-06); no re-simulation at the inclusion block is done.
10. **No privacy-regression "observer table" test over all modes in unit tests;** the e2e test asserts the table facts (tx sender, transfer sender into the stealth address, payer still visible in logs, payer native balance stays zero) for PH-2, PH-3, PH-4 on anvil.
11. **`SponsorService` signs paymaster hashes through an injected `PaymasterSigner`;** `paymasterSignerFromBox` builds one from a `SecretBox`. The transaction-sending hot key lives in the viem wallet client supplied by the operator and is outside this package (SP-REQ-3 "config rejects a key funded on a mainnet chain id" is provided as `assertKeyNotFundedOnMainnet`, which the operator must call; it is not automatic).

## Unverified

- Everything on public testnets (Sepolia, Base Sepolia): EIP-7702 activation was read from client chain specs, no type-4 transaction was sent. **[U]**
- Public RPC support for `eth_estimateGas` / `eth_call` with `authorizationList` (the simulation step of PH-3). Local anvil 1.8.5 supports it **[RAN]**.
- A real public ERC-4337 bundler (PH-4-REQ-5): not run; the local e2e submits `handleOps` from an EOA. **[U]**
- Real ERC-2612 tokens with non-default EIP-712 versions: the permit helpers take name and version as arguments; only the repository `PermitToken` mock was exercised.
- Behaviour behind a real TLS proxy and `X-Forwarded-For` chains beyond the unit tests of `@ghostpay/relayer-guard`. **[U]**
- Price source, gas-unit constants (`DEFAULT_GAS_UNITS`) and `safetyBps` are placeholders; the owner decides pricing (spec Q4). Fee amounts in tests are not market values.
- Legal analysis of operating a sponsor and a token-denominated fee: handled by the owner elsewhere, not analysed here (spec Q7).
