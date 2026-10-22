# GhostPay Multi-Chain Specification

**Status:** Plan plus constraints. Research checked 2026-10-21. Re-verify library and wallet claims before building each tier.

## 1. Chain adapter interface

All chains plug in behind `ChainAdapter` (package `@ghostpay/chain-adapters`):

```ts
interface ChainAdapter {
  readonly family: "evm" | "bitcoin" | "solana";
  readonly chainId: string;                       // EVM numeric as string; "btc-mainnet"; "sol-mainnet"
  parseRecipient(input: string): RecipientAddress;   // meta-address / sp1... / ...
  buildPaymentRequest(inv: ValidatedInvoice): PaymentRequest;   // what a payer must do
  scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<DetectedPayment>;
  fees: FeeCapability;                              // what fee is enforceable on this chain
}
```

`FeeCapability` is explicit per chain so the UI never advertises a fee that cannot be collected (see section 4).

## 2. Tier 1: EVM-compatible chains (same code, config only)

Candidates: Ethereum, Base, Optimism, Arbitrum One, Polygon PoS, BNB Smart Chain, Avalanche C-Chain, Gnosis. Requirements per chain before enabling: canonical ERC-5564 announcer at `0x5564...5564` verified (or deployed with the ERC's CREATE2 salt), `GhostPayRouter` and `GhostPaySweepRelayer` deployed from the same bytecode with a recorded manifest, token allowlist (USDC, USDT, DAI, WETH, native), ERC-2612 support matrix (sweeps), Chainlink feed addresses for quotes, and a `getLogs` range cap profile for the scanner. Fee enforcement: full (router). Gas sponsorship: supported for permit tokens. Gas token differs per chain (BNB, POL, AVAX), the buffer math is per-chain.

## 3. Tier 2: Bitcoin via BIP-352 Silent Payments

Facts that shape the design (verified against BIP-352 status page and ecosystem articles; see Sources):
- BIP-352 is status Complete. The **sender's wallet derives the output script from the sum of its input private keys** and the recipient's `sp1...` address. A web app cannot compute the payment output for a payer using an ordinary wallet; the payer needs a silent-payments-capable wallet (support exists in several wallets but is uneven).
- Receivers must scan eligible transactions. Light-client options (Frigate, BlindBit oracle) disclose scan keys or query patterns to a server, or require running your own node/indexer. This mirrors Feature 5.
- Collaborative (coinjoin) transactions are not recommended for BIP-352.

Resulting scope:
1. **Seller side (built):** generate BIP-352 keys (`B_scan`, `B_spend`) locally from a fresh seed using `@scure/bip32`-class vetted primitives and noble curves; encode `sp1...` addresses; invoices with `chain: bitcoin-mainnet`, `address: sp1...`, amount in sats/fiat with quote; payer instructions to open the invoice in an SP-capable wallet; a BIP-21 style `bitcoin:` URI with `sp=` parameter per BIP-352/BIP-321 conventions.
2. **Receive/scan (built as adapter):** reference scanner implemented against a self-hosted or user-chosen BlindBit oracle HTTP API (tweak data per block) and optional own-node. Local derivation of the output-matching with noble secp256k1 and BIP-352 test vectors (published in the BIP). The scan key never leaves the client in the default mode; sending it to an indexer (Frigate-style) is a separate, loudly labelled option.
3. **Spend (built minimal):** sweeping detected outputs with `@scure/btc-signer` PSBT, user signs. Spending is unsupported for hardware wallets in v1 and the UI says so.
4. **Library reuse:** `Bitshala-Incubator/silent-pay` (JS/TS BIP-352) is experimental and not recommended for mainnet by its authors: used as a differential-test reference only, not shipped. Primary implementation uses noble curves and the BIP's official test vectors.
5. **Fee:** not enforceable (see section 4).

## 4. Fee capability matrix (what can honestly be charged)

| Chain family | Checkout fee | Gas sponsorship fee | Flat security-feature fee |
|---|---|---|---|
| EVM Tier 1 | Enforced by `GhostPayRouter` on routed payments | Enforced by `GhostPaySweepRelayer` signature | Enforced by `PolicyAccountFactory` |
| Bitcoin | **None enforceable.** The payer's wallet builds the transaction. Optional voluntary "tip" output only if the wallet supports it. | n/a (no gas concept; fee bumping/CPFP service is a possible later paid feature) | Optional paid **hosted scanning/indexing service** (monthly flat fee) is the realistic revenue line; it requires the privacy trade-offs of Feature 5 and its own terms. |
| Solana (Tier 3, research) | Possible via an on-program fee split (Anchor program, separate audit) | Fee payer / relayer model is native | Not planned |

## 5. Tier 3 and out of scope

- **Solana / ed25519 chains:** no ratified standard; community dual-key designs exist (Wraith SDK, onyx-sdk, Monero-style ed25519). Requires an ADR choosing a scheme, an audited on-chain program for fee splitting, and a separate announcement mechanism. Research only until Tier 1 and 2 ship.
- **Litecoin, Dogecoin, Bitcoin Cash:** no BIP-352 deployment in mainstream wallets verified. Not planned.
- **Monero, Zcash:** native privacy chains; GhostPay adds nothing. Not planned.
- **Tron:** non-EVM address format, no stealth standard verified. Not planned.

## 6. Test requirements

BIP-352 official vectors for send and receive; round-trip across the adapter interface; chain-mismatch rejection (an invoice for one chain must never be payable via another adapter); amount unit tests (sats vs wei vs token decimals) with property tests; scanner reorg handling on both families.

## Sources
- BIP 352 status and text: https://bips.dev/352/
- Bitshala silent-pay (experimental JS/TS): https://github.com/Bitshala-Incubator/silent-pay
- Ecosystem overviews (secondary, verify before relying): https://d-central.tech/silent-payments-wallet-support/ , https://www.spark.money/tools/bitcoin-silent-payment-wallet-comparison
