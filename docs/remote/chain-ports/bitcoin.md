# Bitcoin chain port: gap analysis and PoC plan

**Status:** Spec only. No existing package is changed by this document. Research date: 2026-10-21.
**Scope:** Bitcoin (BIP-352 Silent Payments) behind the GhostPay `ChainAdapter`. Companion: `btc-family.md` (Litecoin, Dogecoin, Bitcoin Cash).

Claim tags used below: **[V]** verified against a primary source listed in Sources (retrieved 2026-10-21); **[R]** read directly from this repository; **[I]** inference or proposal by the author, not stated by any source; **[U]** unverified.

## 1. Gap table: `@ghostpay/btc-silent-payments` vs the real `ChainAdapter`

Real interface: `packages/chain-adapters/src/adapter.ts` [R]. Bitcoin implementation: `packages/btc-silent-payments/src/{adapter.ts,adapter-types.ts}` [R]. The Bitcoin package cannot structurally satisfy the real interface today. It copies the member names of `ChainAdapter` and pins them with a drift test (`adapter-types.test.ts`), and defines its own Bitcoin-shaped request, invoice and detection types.

| # | Area | Real `chain-adapters` (EVM-shaped) | `btc-silent-payments` today | Consequence |
|---|---|---|---|---|
| 1 | `PaymentRequest` | Requires `router: Address`, `feeRecipient: Address`, `build(opts): BuiltPayment` (`BuildOptions` has `deadline`, `permitSignature`, `buffer`, `rng`) | `BitcoinPaymentRequest` has `address` (canonical `sp1...`) and `uri` (`bitcoin:?sp=...&amount=...`); no `router`, `feeRecipient` or `build` | A Bitcoin request is not assignable to `PaymentRequest`. There is no `build`, because the payer's wallet derives the output script from its own input keys (BIP-352 sender role, MULTICHAIN_SPEC section 3) |
| 2 | `DetectedPayment` | `stealthAddress: Address`, `announcement: ScannedAnnouncement`, `metadata: ParsedMetadata \| undefined`, `viaRouter: boolean` | `DetectedBitcoinPayment`: `blockHeight`, `blockHash`, `txid?`, `vout?`, `amountSats?`, `xOnlyPublicKey`, `k`, `label`, `spendTweak` | `scan()` return types differ. Bitcoin has no announcement, router or metadata concept |
| 3 | Invoice | `ValidatedInvoice = Invoice` from `@ghostpay/invoice-schema`: `chainId: number` (safe integer >= 1), `metaAddress` (ERC-5564 regex, two valid points), `token` (`'native'` or 0x address), `amountPolicy` (`fiat_quote` or `fixed_token` with a decimal string up to 2^256-1), `feePolicy` | `BitcoinInvoice`: `chainId: string` (`btc-mainnet`, `btc-testnet`), `address` (`sp1`/`tsp1`), `amountSats?: bigint`, `label?`, `message?` | An SP address fails the `metaAddress` regex; a string chain id fails the numeric `chainId` check; there is no sats amount policy. `feePolicy` (`payer_pays`/`seller_pays`) has no meaning without a fee |
| 4 | Invoice envelope | `invoice-schema/src/envelope.ts` builds AAD as `"GPI1" \|\| chainId (u64 BE) \|\| signer (33 bytes)` and rejects non-numeric `chainId` on decrypt [R] | n/a | **Open decision.** Encrypted or signed invoice envelopes cannot carry `btc-*` ids. Either Bitcoin invoices stay unsigned URIs in v1, or `invoice-schema` gets a versioned envelope with a string chain reference (needs its own ADR) |
| 5 | Brands | `SecretScalar`, `CompressedPoint` from `@ghostpay/core-crypto`: `Uint8Array & { [secretBrand]: 'SecretScalar' }` with module-private `unique symbol` brands | Same names, separate module-private `unique symbol` brands in `btc-silent-payments/src/secret.ts` | The types are not mutually assignable. `RecipientAddress` and `ViewCapability` carry branded keys, so an adapter from one package is not accepted where the other's type is expected. A boundary conversion (re-wrap bytes) is needed, or one package must import the other's brand |
| 6 | Family union | `ChainFamily = 'evm' \| 'bitcoin' \| 'solana'` | Identical | **No gap.** `'bitcoin'` is already in the union. What is missing is narrowing: `PaymentRequest.family`, `DetectedPayment` and `ValidatedInvoice` are not discriminated on `family` |
| 7 | `ViewCapability` | `{ viewingSecret, spendingPublicKey }` | Adds optional `labels?: readonly number[]` | Compatible as a superset; the real interface lacks the field |
| 8 | Chain ids / networks | `chainId` is `String(numericEvmId)`; `requireEnabledChain` and `ChainConfig` are EVM config | `btc-mainnet`, `btc-testnet` only; `testnet` means `tb`/`tsp`. No testnet4, signet or regtest. `buildSpendTransaction` has no `bcrt` support because `@scure/btc-signer` ships mainnet and testnet params only (DEVIATIONS) | See section 2 for what must be added |
| 9 | Fees | `FeeCapability { checkout, checkoutBps?, gasSponsorship, flatSecurity }` with `FeeStatus = 'enforced' \| 'not_enforceable' \| 'not_deployed'` | Same shape. `BITCOIN_FEES` = `not_enforceable` on all three lines | **No gap** (see section 3) |
| 10 | `RequestOptions` | `quotedTokenAmount?: bigint` ("token amount for fiat_quote") | Same member, interpreted as satoshis | Same name, different unit. Doc comment should say "base units of `asset`" |
| 11 | `ScanRange` | `fromBlock: bigint`, `toBlock?: bigint` | Same; heights must fit in uint32 | **No gap** |
| 12 | Registration | `createEvmAdapter(deps)` only; `index.ts` exports no registry | `createBitcoinAdapter({ network, source? })` | No place to register or look up an adapter by `family`/`chainId`. The "chain-mismatch rejection" test in MULTICHAIN_SPEC section 6 has no cross-family dispatcher to run against |
| 13 | Scan source | `RpcClient` (EVM logs) | `TweakSource`; the only network implementation is `BlindBitClient` (HTTP, never run against a real oracle, per DEVIATIONS) | PoC must exercise a real source (section 5) |

### 1.1 Minimal `chain-adapters` change proposal (documentation only)

Nothing below is implemented by this task. It is the smallest change the author believes makes the Bitcoin adapter structurally valid [I]. The change belongs to the owner of `packages/chain-adapters` and must keep every existing EVM export and behaviour.

1. **Split the family-specific types and make the public ones unions.**
   ```ts
   interface PaymentRequestBase {      // today's chain-neutral fields
     readonly family: ChainFamily; readonly chainId: string; readonly asset: string;
     readonly grossAmount: bigint; readonly netAmount: bigint; readonly feeAmount: bigint;
   }
   export interface EvmPaymentRequest extends PaymentRequestBase {   // today's PaymentRequest, renamed
     readonly family: 'evm'; readonly router: Address; readonly feeRecipient: Address;
     build(opts: BuildOptions): BuiltPayment;
   }
   export interface BitcoinPaymentRequest extends PaymentRequestBase {
     readonly family: 'bitcoin'; readonly asset: 'native';
     readonly address: string; readonly uri: string;
   }
   export type PaymentRequest = EvmPaymentRequest | BitcoinPaymentRequest;
   ```
   Same pattern for `DetectedPayment` (`EvmDetectedPayment | BitcoinDetectedPayment`) and `ValidatedInvoice` (`Invoice | BitcoinInvoice`, the latter defined here, unsigned).
2. **Make `ChainAdapter` generic over the family with a default**, so existing callers keep compiling:
   ```ts
   interface FamilyTypes { evm: {...Invoice/EvmPaymentRequest/EvmDetectedPayment}; bitcoin: {...}; solana: never }
   export interface ChainAdapter<F extends ChainFamily = ChainFamily> { readonly family: F; ...methods typed from FamilyTypes[F] }
   ```
   `createEvmAdapter` returns `ChainAdapter<'evm'>`. The Bitcoin package then drops `ChainAdapterShape` and its drift test, and implements `ChainAdapter<'bitcoin'>` directly.
3. **Brands:** pick one owner. Proposal: `btc-silent-payments` imports `SecretScalar` and `CompressedPoint` types from `@ghostpay/core-crypto` and keeps its redaction behaviour by wrapping with `wrapSecret`/`secretScalarFromBytes`. Whether core-crypto's constructors satisfy the Bitcoin package's needs (e.g. redaction on `JSON.stringify`, `zeroize`) is **[U]**; check before committing to this.
4. **Dependency direction:** `btc-silent-payments` depends on `chain-adapters` (types only); `chain-adapters` does not import the Bitcoin package. Registration happens in the app layer (`Map<chainId, ChainAdapter>`), which also hosts the cross-family chain-mismatch test.
5. **Invoice envelope:** out of scope for this proposal (row 4 above). Document the decision as an ADR before any signed Bitcoin invoice exists.
6. **Doc comments:** update `chainId`, `RequestOptions.quotedTokenAmount` and `ScanRange` comments to say "base units" and "height or block number".

## 2. Network parameters

BIP-352 fixes the silent-payment HRP only as "sp" for mainnet and "tsp" for testnets, with signet and testnet given as examples [V: BIP-352 "Address encoding"]. BIP-352 does not name regtest. Bitcoin Core's segwit HRPs per network are read from `chainparams.cpp`. BIP-352 does not fix a BIP-32 `coin_type` [V: it gives the path `m / purpose' / coin_type' / account' / {1',0'} / 0` with `purpose = 352` and refers to BIP-44 for the rest]; `coin_type` values below come from SLIP-44.

| Network | SP HRP | Segwit bech32 HRP | `coin_type` | Genesis hash (Bitcoin Core `chainparams.cpp`) | P2P port | Notes |
|---|---|---|---|---|---|---|
| mainnet | `sp` [V] | `bc` [V] | `0'` [V: SLIP-44] | `000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f` | 8333 | v0 address is 116 characters [V: BIP-352 footnote] |
| testnet (3) | `tsp` [V] | `tb` [V] | `1'` [V: SLIP-44 "Testnet (all coins)"] | `000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943` | 18333 | v0 address is 117 characters [V] |
| testnet4 (BIP-94) | `tsp` [V: "testnets"] | `tb` [V] | `1'` | `00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043` | 48333 [V: BIP-94 and chainparams] | Genesis message `03/May/2024 000000000000000000001ebd58c244970b3aa9d783bb001011fbe8ea8e98e00e` [V: BIP-94]. All mainnet soft forks enforced from genesis [V: BIP-94], so taproot works |
| signet (default) | `tsp` [V] | `tb` [V] | `1'` | `00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6` | 38333 | Extra block-signing challenge (BIP-325, referenced by `chainparams.cpp`). Custom signets differ by challenge; the genesis assert shown is for the default signet [I] |
| regtest | `tsp` [U: BIP-352 names only "testnets"; the `btc-silent-payments` package uses `tsp` for everything that is not mainnet] | `bcrt` [V] | `1'` | `0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206` | 18444 | `@scure/btc-signer` has no `bcrt` params (DEVIATIONS); a custom network object is needed (does `btc-signer` accept one? **[U]**) |

Consequences:

- **HRPs do not identify the network.** testnet3, testnet4 and signet all use `tb` and `tsp` [V]. A string `tsp1...` cannot be told apart from the address alone. The GhostPay `chainId` must therefore be explicit and must not be derived from the HRP. Proposed ids [I]: `btc-mainnet`, `btc-testnet`, `btc-testnet4`, `btc-signet`, `btc-regtest`. Also verify the node's genesis hash before scanning, using the hashes above (the existing `getInfo` does not enforce that the oracle's `network` matches; its network strings are undocumented, per DEVIATIONS).
- **Adapter work:** `SilentPaymentNetwork` must grow from `'mainnet' | 'testnet'` to the five networks, mapping HRP (`sp`/`tsp`), segwit HRP (`bc`/`tb`/`bcrt`), `coin_type` (`0'`/`1'`) and the `@scure/btc-signer` network object. Decoding must stay strict: a `tsp1` string is valid on four networks, so the expected network always comes from configuration, never from the string.
- **Base58 prefixes** (legacy fallback addresses) in `chainparams.cpp`: mainnet P2PKH 0 / P2SH 5; all test networks including regtest P2PKH 111 / P2SH 196 [V].
- **Mainnet is out of PoC scope** (section 5).

## 3. Fee capability, stated honestly

`BITCOIN_FEES` in `packages/btc-silent-payments/src/adapter.ts` [R]:

| Line | Value | Meaning |
|---|---|---|
| `checkout` | `not_enforceable` | The payer's wallet builds and signs the transaction. GhostPay has no contract, relayer or script that can take a cut. `checkoutBps` must stay `undefined` |
| `gasSponsorship` | `not_enforceable` | Bitcoin has no gas. No sponsorship fee exists |
| `flatSecurity` | `not_enforceable` | No policy-account factory on Bitcoin |

Rules for every UI and API surface:

1. `buildPaymentRequest` returns `feeAmount = 0n` and `grossAmount = netAmount` (already true in code) [R].
2. The network miner fee is paid by the payer's wallet and is **not** a GhostPay fee. The UI must not present it as one and must not estimate it as part of the invoice total.
3. **No tip output.** MULTICHAIN_SPEC section 4 allows a voluntary tip "only if the wallet supports it"; a silent-payments URI carries no tip parameter and nothing in the adapter implements one [R]. Do not show a tip option in the PoC.
4. The only revenue line named in MULTICHAIN_SPEC section 4 for Bitcoin is an optional paid hosted scanning service. It is not built, would need the Feature 5 privacy trade-offs and its own terms, and must not be advertised until it exists. Sending the scan key to a server (Frigate-style) is a separate, loudly labelled option and is not implemented (DEVIATIONS).
5. Tests: a property test that for every amount `feeAmount === 0n && grossAmount === netAmount`, and a test that every `FeeStatus` on a Bitcoin adapter is `not_enforceable`.

## 4. PayJoin hook (BIP-78 / BIP-77)

### 4.1 What the specs say

- **BIP-78** "A Simple Payjoin Proposal": status Deployed [V]. The sender builds a finalized, broadcastable "original" PSBT and POSTs it to the receiver's `pj=` endpoint. The receiver returns a proposal that **MUST use all inputs and all non-receiver outputs of the original**, may add its own inputs, may add or replace receiver-owned outputs unless output substitution is disabled (`pjos=0`), and **MUST NOT decrease the absolute fee** [V]. Only the receiver's added inputs are finalized by the receiver; the sender re-signs its own inputs [V].
- **BIP-77** "Async Payjoin": status Draft [V]. Replaces the live HTTP server with an untrusted directory, Oblivious HTTP and HPKE. A Payjoin URI is a Bitcoin URI with a `pj` parameter [V].
- **BIP-321** lists `sp` as a payment-instruction parameter (BIP-352 addresses) and allows the address body to be empty if there is at least one payment instruction [V]. It states reusable non-address-reusing instructions such as Silent Payments MAY be reused [V]. BIP-321 does not mention `pj` or Payjoin [V: searched]; its examples show `sp=` alone, with `lno=`, or with an on-chain fallback address.
- **Neither BIP-77 nor BIP-78 mentions silent payments at all** [V: searched both texts for "silent"; no match]. Compatibility is therefore not specified anywhere; everything in 4.2 is analysis [I].

### 4.2 Analysis: incompatible by default, narrowly compatible in one case [I]

BIP-352 derives each silent-payment output from the **sum of the public keys of all eligible inputs** (P2TR, P2WPKH, P2SH-P2WPKH, P2PKH) [V], and the receiver scans using that same sum [V]. BIP-352 says all input keys of a transaction should belong to the same entity because there is no formal proof of security in a collaborative setting [V]; it describes Blind Diffie-Hellman as the way coinjoin participants would have to cooperate [V, footnote].

1. **Receiver adds an eligible input:** the true input-key sum becomes `A_sender + A_receiver`. The sender computed the output from `A_sender` alone and cannot recompute without the receiver's private key. The receiver's scan would use the full sum and not find the output. **Incompatible.**
2. **Receiver adds only ineligible inputs** (for example P2WSH or bare multisig, which BIP-352 excludes from shared-secret derivation [V]; note BIP-352 also forbids scanning transactions that spend SegWit v2+ outputs [V]): the sum is unchanged, so the sender's derived output remains valid. **Technically possible** but: (a) BIP-78 SHOULD-NOT guidance on mixed input types makes this a fingerprint [V: BIP-78 lists "Include mixed input types" under SHOULD NOT]; (b) the receiver must hold such ineligible UTXOs; (c) it has not been tested by anyone to the author's knowledge **[U]**. Low value for the cost.
3. **Output substitution** must be disabled (`pjos=0`): an SP output is derived by the sender and cannot be replaced by the receiver [I].
4. **Sender re-signing:** BIP-352 requires the inputs not to change after outputs are derived and warns against `SIGHASH_ANYONECANPAY` [V]. Payjoin changes the input set, so the sender must re-derive outputs after any change that alters the eligible-key sum (the package README already says to re-derive after any input change).

### 4.3 What a hook would look like (not implemented)

Default: **PayJoin off for silent-payment invoices.** If ever built, the smallest hook is [I]:

```ts
// in the Bitcoin payment request (chain-adapters union member)
interface BitcoinPaymentRequest {
  // ...
  readonly payjoin?: undefined;   // PoC and v1: always absent for sp invoices
}
// separate, only for non-SP "address" invoices (not in PoC):
interface PayjoinOffer { readonly kind: 'bip78' | 'bip77'; readonly pj: string; readonly pjos?: 0 }
// guard usable by any sender-side code:
function assertPayjoinKeepsSilentPaymentValid(
  original: PsbtSummary, proposal: PsbtSummary, spRecipients: readonly string[],
): void  // throws if proposal adds any input of a BIP-352-eligible type
```

- If a merchant wants PayJoin, offer it on a **separate regular-address invoice mode** (`bitcoin:ADDR?pj=...`), not on an `sp` invoice, so the payer's wallet is not asked to satisfy two incompatible flows. Whether an SP-capable wallet that also supports PayJoin picks `sp=` or `pj=` when both appear in one URI is unspecified **[U]**; do not emit both in one URI in v1.
- The guard above is cheap and gives a hard failure instead of silent fund-loss if someone later wires PayJoin to an SP invoice.

## 5. PoC acceptance criteria

**Networks:** testnet4 and signet for live runs; regtest in CI. **No mainnet funds, no mainnet keys, no mainnet endpoints** in the PoC.

| # | Criterion | Evidence |
|---|---|---|
| 1 | Network table (section 2) implemented: `SilentPaymentNetwork` covers 5 networks; `sp`/`tsp` and `bc`/`tb`/`bcrt` and `coin_type` tested per network; a `tsp1` string decodes only under the configured network | Unit tests; the 28 official BIP-352 vectors still pass |
| 2 | Adapter implements the proposed `ChainAdapter<'bitcoin'>` from the `chain-adapters` change (section 1.1) without a copied interface; drift test removed | `npm run typecheck`; app-layer registry test with chain-mismatch rejection across `evm` and `bitcoin` |
| 3 | Fees: all three `not_enforceable`, `feeAmount === 0n`, no tip, no checkout copy in UI | Property test (section 3) |
| 4 | **Live receive on signet and testnet4**: a payment sent from an SP-capable sender wallet to an `tsp1` address generated by the adapter is detected by `scan()` through a real `TweakSource` (BlindBit oracle and/or Frigate; Frigate accepts `-n testnet\|testnet4\|signet\|regtest` [V]) | Recorded txid, block height, and scanner output; this closes the "never run against a real oracle" gap in DEVIATIONS |
| 5 | **Live spend**: `buildSpendTransaction` sweeps the detected output; the transaction is accepted by a node (`testmempoolaccept`) and confirms | Txid on each network. Closes the "no acceptance by Bitcoin Core" gap in DEVIATIONS |
| 6 | **Regtest CI**: bitcoind regtest + a local tweak source; send, scan, spend, and a reorg case (the current scanner has only a per-block height/hash consistency check) | CI job; uses the `bcrt` network object (criterion 1) |
| 7 | Scan key never leaves the process: existing tests that sources and `fetch` only see heights stay green against the real source | `blindbit.test.ts`, `scanner.test.ts`, `adapter.test.ts` |
| 8 | Sender-side honesty: payer UI states an SP-capable wallet is required, shows the BIP-321 URI (`bitcoin:?sp=...`), and lists no unverified wallet names | UI copy review |
| 9 | PayJoin: SP invoices expose no `pj` parameter; guard from 4.3 exists if any PayJoin code is added | Test |
| 10 | Hardware wallet spend remains explicitly unsupported in the UI (v1) | UI copy review |

**Effort (author estimate, not from sources) [I]:** M overall. Network params and type changes S; `chain-adapters` union refactor with EVM regression tests M; real BlindBit/Frigate integration, reorg handling and live runs on two networks M; gRPC BlindBit (the HTTP block routes are marked deprecated per DEVIATIONS) is extra and outside this PoC.

**Risks:**

1. BlindBit-Oracle HTTP block-data routes are deprecated in favour of gRPC (DEVIATIONS); the PoC source may break or need a gRPC client.
2. Receivers' scan cost and light-client privacy: the oracle operator sees scanned heights and client IP.
3. The sender must use an SP-capable wallet; wallet support is uneven (MULTICHAIN_SPEC section 3). No specific wallet is named here because no wallet claim was verified from a primary source in this task.
4. HRP ambiguity across test networks (section 2) can send a payment to the wrong test network if `chainId` is not enforced.
5. Invoice-envelope gap (row 4): decisions delayed here block signed Bitcoin invoices.
6. Package brand mismatch (row 5) can silently force copies of secret material across the package boundary.
7. `@scure/btc-signer` lacks `bcrt` params; a custom network may be required **[U]**.
8. Zeroization is best-effort and arithmetic is not constant-time in JavaScript (package README); signing-grade work on trusted devices only.

**Owner of new code (proposed) [I]:**

| Work | Owner package |
|---|---|
| Network params, 5-network support, regtest, `TweakSource` implementations, spend/scan fixes | `packages/btc-silent-payments` |
| Union types, generic `ChainAdapter`, registry contract | `packages/chain-adapters` (its owner; EVM regression suite must stay green) |
| Brand unification | `packages/core-crypto` owner decides; `btc-silent-payments` consumes |
| Signed Bitcoin invoice envelope (if wanted) | `packages/invoice-schema` owner, behind an ADR |
| PayJoin offer mode (non-SP, optional) | New package only if scheduled, not part of the PoC |

## Sources

Network access in this task was limited to `raw.githubusercontent.com` and `registry.npmjs.org`. Other sites (including bips.dev, which MULTICHAIN_SPEC cites) were not reachable, so BIP text was read from the raw `bitcoin/bips` repository.

- BIP-352: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki (retrieved 2026-10-21)
- BIP-350: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0350.mediawiki (retrieved 2026-10-21)
- BIP-94 (testnet4): https://raw.githubusercontent.com/bitcoin/bips/master/bip-0094.mediawiki (retrieved 2026-10-21)
- BIP-78: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki (retrieved 2026-10-21)
- BIP-77: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0077.md (retrieved 2026-10-21)
- BIP-21: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0021.mediawiki (retrieved 2026-10-21)
- BIP-321: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0321.mediawiki (retrieved 2026-10-21)
- Bitcoin Core chain parameters: https://raw.githubusercontent.com/bitcoin/bitcoin/master/src/kernel/chainparams.cpp (retrieved 2026-10-21)
- SLIP-44 coin types: https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0044.md (retrieved 2026-10-21)
- Frigate README: https://raw.githubusercontent.com/sparrowwallet/frigate/master/README.md (retrieved 2026-10-21)
- BlindBit-Oracle README (cited via DEVIATIONS): https://raw.githubusercontent.com/setavenger/BlindBit-Oracle/master/README.md (retrieved 2026-10-21)
- Repository files read: `docs/MULTICHAIN_SPEC.md`, `packages/chain-adapters/src/adapter.ts`, `packages/invoice-schema/src/{schema,envelope}.ts`, `packages/core-crypto/src/secret.ts`, `packages/btc-silent-payments/{README.md,DEVIATIONS.md,src/adapter.ts,src/adapter-types.ts,src/spend.ts,src/index.ts,src/address.ts}`

## Unverified items (summary)

- Regtest silent-payment HRP (`tsp` assumed; BIP-352 says only "testnets").
- Whether `@scure/btc-signer` accepts a custom `bcrt` network object.
- Whether core-crypto's `SecretScalar` constructors meet the Bitcoin package's redaction and zeroization needs.
- Behaviour of SP-capable wallets when a URI carries both `sp=` and `pj=`.
- Any real-world PayJoin plus silent-payments deployment (none found; the BIPs are silent on it).
- Effort estimates and all proposed names (`btc-testnet4`, `btc-signet`, `btc-regtest`, hook types).
