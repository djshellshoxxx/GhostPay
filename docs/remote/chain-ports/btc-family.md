# Bitcoin-family chain ports: Litecoin, Dogecoin, Bitcoin Cash

**Status:** Research and spec only. Research date: 2026-10-21. Nothing here is implemented; no existing package is changed.
**Scope:** Whether BIP-352 Silent Payments, as implemented in `@ghostpay/btc-silent-payments`, can be reused for Litecoin (LTC), Dogecoin (DOGE) and Bitcoin Cash (BCH), and what a `packages/btc-family` package would have to be. Companion: `bitcoin.md`, whose `ChainAdapter` change proposal this document builds on. `docs/MULTICHAIN_SPEC.md` section 5 currently says: "Litecoin, Dogecoin, Bitcoin Cash: no BIP-352 deployment in mainstream wallets verified. Not planned." This research does not contradict that.

Claim tags: **[V]** verified against a primary source listed in Sources (retrieved 2026-10-21); **[R]** read from this repository; **[I]** inference or proposal by the author; **[U]** unverified or not found.

## 1. Summary and verdicts

| Chain | BIP-352 math reusable? | Output type available | Verdict | Effort (estimate) [I] |
|---|---|---|---|---|
| Litecoin | Yes, if Taproot is active on the target network. The secp256k1 math, labels, scanning and spend-key derivation are chain-independent [I]; only network parameters and transaction handling change | P2TR only if activated (**[U]** activation not confirmed; see 3.1) | **Conditional go for a testnet PoC; not planned for production.** First candidate of the three | M |
| Dogecoin | Partly. Key derivation, ECDH and labels are reusable; the output type and input rules are not BIP-352 | P2PKH only (no Segwit, no Taproot) | **No-go for GhostPay v1.** Needs a new, non-BIP-352 scheme with no wallet ecosystem | L |
| Bitcoin Cash | Partly, same as Dogecoin | P2PKH only (no Segwit, no Taproot in the node source read) | **No-go for GhostPay v1.** Same new scheme; cashaddr cannot carry the address | L |

Overall: none of the three has a silent-payments implementation that was found (section 6). The payer needs a sender wallet that can derive the output from its own input keys; for these chains no such wallet was found, so a GhostPay payer could not pay from an ordinary wallet. This is the blocking issue, ahead of any engineering effort. Verdict aligns with MULTICHAIN_SPEC section 5: **keep "Not planned"**, with LTC as the only chain worth a testnet spike if the product wants one.

## 2. What is chain-independent and what is not

BIP-352 v0 [V: BIP-352 text and `reference.py`]:

- Reusable math: sum of eligible input public keys `A`, `input_hash`, ECDH with `B_scan`, tagged hashes, `P_k = B_m + t_k * G`, label tweaks `B_m = B_spend + hash(b_scan || m) * G`, BIP-32 style key paths `m/352'/coin_type'/account'/{1',0'}/0`.
- Chain-specific rules:
  1. **Eligible input list**: P2TR, P2WPKH, P2SH-P2WPKH, P2PKH only; only compressed or x-only keys [V].
  2. **Output type**: "Receiver addresses are always BIP341 taproot outputs"; a scannable transaction must contain at least one taproot output [V].
  3. **Taproot parity**: private keys of taproot inputs are negated if the public key has odd y [V].
  4. **Skip rule**: transactions spending SegWit v2+ outputs must not be scanned [V].
  5. **Sighash**: `SIGHASH_ANYONECANPAY` is unsafe; recommended `SIGHASH_ALL` (`SIGHASH_DEFAULT` for taproot) [V].
  6. **Address string**: bech32m with HRP `sp` / `tsp`, 116 or 117 characters for v0 [V].

In this repository, `packages/btc-silent-payments` hard-codes: `SilentPaymentNetwork = 'mainnet' | 'testnet'`, HRP `sp`/`tsp`, `MAX_MONEY_SATS = 21,000,000 BTC`, `@scure/btc-signer` Bitcoin network objects, and P2TR-only spending [R]. A family package must parameterize all of these.

## 3. Per-chain analysis

### 3.1 Litecoin

**Parameters** (from `litecoin-project/litecoin` `src/chainparams.cpp`, SLIP-44, SLIP-173):

| Item | Mainnet | Testnet | Regtest |
|---|---|---|---|
| SLIP-44 `coin_type` | `2` [V] | `1` ("Testnet (all coins)") [V] | `1` [I] |
| Segwit bech32 HRP | `ltc` [V] | `tltc` [V] | `rltc` [V] |
| MWEB HRP (extension block addresses) | `ltcmweb` [V] | `tmweb` [V] | `tmweb` [V] |
| Base58 P2PKH / P2SH / WIF | 48 / 5 / 176 [V] | 111 / 196 / 239 [V] | not read |
| P2P port | 9333 [V] | 19335 [V] | not read |
| Segwit activation height | 1201536 [V] | 6048 [V] | 0 (always on) [V] |

- **Silent-payment HRP:** BIP-352 names only `sp` and `tsp` and defines them for Bitcoin [V]. No Litecoin-specific SP HRP is registered in SLIP-173 (the table has `ltc`/`tltc`/`rltc` and no `sp` entries) [V]. Because an SP string is a payment code and never an on-chain address, the HRP is only a label. Proposal [I]: a GhostPay-local HRP pair that cannot be confused with `ltc1...` segwit addresses, for example `ltcsp` / `tltcsp`, documented as unregistered. **Do not reuse `sp`/`tsp`**: a Litecoin SP string with a Bitcoin HRP would be accepted by a Bitcoin SP wallet and lead to a Bitcoin-network payment of the wrong asset.
- **Segwit:** active (height above) [V]. P2WPKH, P2SH-P2WPKH, P2PKH input extraction therefore follows the same script templates as Bitcoin [I; not tested].
- **Taproot:** `chainparams.cpp` defines a BIP-9 `DEPLOYMENT_TAPROOT` (bit 2, start height 2161152, timeout height 2370816 on mainnet) [V]. A deployment definition is **not** proof of activation. Whether it locked in and activated on mainnet and testnet **[U]**; confirm against a Litecoin node (`getdeploymentinfo`-style RPC) before any work. If Taproot is not active, Litecoin falls into the Dogecoin/BCH row (scheme B below).
- **MWEB:** Litecoin has an extension block (MWEB deployment, `mweb_hrp`) [V]. How MWEB peg-in/peg-out transactions interact with the BIP-352 eligibility and skip rules is **[U]** and a risk (3.1 risks below).
- **Tweak data source:** BlindBit-Oracle and Frigate are built for Bitcoin; Frigate connects to Bitcoin Core and indexes from Bitcoin's Taproot activation height (709,632) [V: Frigate README]. Neither is documented for Litecoin **[U]**. A Litecoin indexer is new work.

**Scheme:** "scheme A": BIP-352 v0 unchanged (P2TR outputs, same input list), with a Litecoin network table (HRP label, segwit HRP `ltc`/`tltc`/`rltc`, `coin_type` `2'`/`1'`) and Litecoin transaction serialization. BIP-352 official vectors still validate the math; Litecoin needs its own vectors only for the address string and network wiring.

**Adapter fit:** see section 4. **Fee cap:** all `not_enforceable` (section 5). **Effort:** M [I].

**Risks:**
1. Taproot activation unconfirmed (**[U]**); the whole row depends on it.
2. No sender wallet found (section 6); GhostPay would have to ship or recommend one.
3. MWEB interaction unknown; scanner could mis-skip or mis-include transactions.
4. `@scure/btc-signer` has no Litecoin network object; whether it accepts a custom one with Litecoin's prefixes is **[U]**.
5. The 21M cap constant in `units.ts` is wrong for Litecoin; units and caps must be per chain (Litecoin's cap not read from a primary source here **[U]**).
6. HRP confusion with Bitcoin strings (above).

### 3.2 Bitcoin Cash

**Parameters** (from `bitcoin-cash-node/bitcoin-cash-node` `src/chainparams.cpp`, SLIP-44, cashaddr spec):

| Item | Mainnet | Testnet(s) | Regtest |
|---|---|---|---|
| SLIP-44 `coin_type` | `145` [V] | `1` [V] | `1` [I] |
| CashAddr prefix | `bitcoincash` [V] | `bchtest` (testnet3, testnet4, scalenet and chipnet params all use it) [V] | `bchreg` [V: cashaddr spec and `chainparams.cpp`] |
| Base58 P2PKH / P2SH / WIF | 0 / 5 / 128 [V] | 111 / 196 / 239 [V] | not read |
| P2P port | 8333 [V] | 18333 (testnet3), 28333 (testnet4), 38333 (scalenet), 48333 (chipnet) [V] | not read |

- **No Segwit, no Taproot:** BCH Node `chainparams.cpp` has no Segwit or Taproot deployment, and `script/standard.h` lists only P2PK, P2PKH, P2SH (and P2SH32), bare multisig, null data and "p2s" script types, with no witness types [V]. By contrast, Dogecoin's `standard.h` lists witness script types (`TX_WITNESS_V0_*`) and its `chainparams.cpp` defines a Segwit deployment, and Litecoin's `chainparams.cpp` defines Segwit and Taproot deployments. Consequence: BIP-352's eligible input list reduces to **P2PKH only**, and its requirement for a taproot output **cannot be met**.
- **Legacy base58 prefixes are identical to Bitcoin's** (0 / 5 / 128 and testnet 111 / 196 / 239) and the default port is the same as Bitcoin mainnet [V]. A legacy BCH address is therefore also a syntactically valid Bitcoin address; cross-chain mis-sends are a real risk. Use cashaddr for display and keep `coin_type` separate (`145'` vs `0'`).
- **CashAddr cannot carry an SP address:** the payload size field allows at most 512 bits (64 bytes) [V]; a BIP-352 v0 payload is two 33-byte keys = 66 bytes [V: 116-character address derivation]. A bech32m label with a GhostPay-local HRP (for example `bchsp` / `tbchsp`) is the only option [I]; unregistered.
- **Scheme B (new, non-BIP-352) [I]:** reuse the BIP-352 key schedule but replace the output type: `P_k = B_m + t_k*G` as a full point, output script = P2PKH of `hash160(ser_P(P_k))`; no taproot parity negation (the output is a full compressed key); receiver compares `hash160` of candidate keys with the transaction's P2PKH hashes, so label lookup costs O(labels) per `k` (already the approach in DEVIATIONS item 4); spend key `d = b_spend + t_k (+ label tweak)` without even-y normalization; the sender must have at least one P2PKH input with a compressed key. This is **not** BIP-352; it has no official test vectors and no formal security argument (**[U]** security analysis; note hash160 gives a weaker collision bound than a 32-byte x-only key). It would need its own ADR, vectors and independent review.
- **Signing:** spending a P2PKH output on BCH uses BCH's own sighash rules; those were not read from a primary source here (**[U]**).
- **Effort:** L [I]. **Risks:** new cryptographic scheme without review; no sender wallet; indexer must be written (no tweak server exists for it); cashaddr/base58 cross-chain confusion; replay and key-reuse hygiene given the shared history with Bitcoin (**[U]** not analysed).

### 3.3 Dogecoin

**Parameters** (from `dogecoin/dogecoin` `src/chainparams.cpp`, SLIP-44):

| Item | Mainnet | Testnet | Regtest |
|---|---|---|---|
| SLIP-44 `coin_type` | `3` [V] | `1` [V] | `1` [I] |
| Segwit bech32 HRP | none (no `bech32_hrp` in the file) [V] | none | none |
| Base58 P2PKH / P2SH / WIF | 30 / 22 / 158 [V] | 113 / 196 / 241 [V] | 111 / 196 / 239 [V] |
| P2P port | 22556 [V] | 44556 [V] | 18444 [V] |

- **Base58 only, no registered HRP:** Dogecoin addresses have no bech32 form, and SLIP-173 has no Dogecoin row and no `sp` family entries [V]. A silent-payment string needs a GhostPay-local bech32m HRP, for example `dogesp` / `tdogesp` [I], unregistered. A base58check variant (66-byte payload plus a version byte) is also possible but not recommended: BIP-352 itself uses bech32m, and no length-checked base58 convention exists for payloads of this size **[U]**.
- **No Segwit:** `chainparams.cpp` defines `DEPLOYMENT_SEGWIT` with `nTimeout = 0` and the source comment "Disabled" on mainnet and testnet [V]; I read this as never active [I]. No Taproot deployment appears [V]. Inputs: **P2PKH only**; output: **P2PKH only** (scheme B above).
- **Units, limits and fee/dust rules** differ from Bitcoin and were not read from a primary source here (**[U]**). `MAX_MONEY_SATS` must not be reused.
- **Effort:** L [I]. **Risks:** as BCH (new scheme, no wallet, no indexer, no review); plus no existing library in this repository handles Dogecoin transactions (npm has `bitcore-lib-doge`, listed in 6, whose suitability was not evaluated **[U]**).

## 4. Adapter fit

Builds on the `ChainAdapter` change proposed in `bitcoin.md` section 1.1 (family unions, generic adapter, shared brands).

- **Family value.** `ChainFamily` is `'evm' | 'bitcoin' | 'solana'` [R]. Proposal [I]: add a fourth member `'utxo'` for Bitcoin forks, with a shared `UtxoPaymentRequest` (`address`, `uri`, `amountSats`) of which `BitcoinPaymentRequest` is the `bitcoin` instance, and distinct `chainId`s: `ltc-mainnet`, `ltc-testnet`, `ltc-regtest`, `bch-mainnet`, `bch-testnet`, `bch-regtest`, `doge-mainnet`, `doge-testnet`, `doge-regtest`. Alternative: reuse `'bitcoin'` with new ids; rejected because `family: 'bitcoin'` implies BIP-352 rules (taproot outputs), which scheme B violates. The decision belongs to the owner of `packages/chain-adapters`.
- **Mapping:**

  | `ChainAdapter` member | Litecoin (scheme A) | BCH / Dogecoin (scheme B) |
  |---|---|---|
  | `parseRecipient` | decode bech32m with the chain's SP HRP, return `B_scan`, `B_m` | same, scheme tag in the canonical string or HRP |
  | `buildPaymentRequest` | `address` + payment URI | same. `bitcoin:?sp=` is defined by BIP-321 for Bitcoin only [V]; the `litecoin:`, `dogecoin:` and `bitcoincash:` schemes have no `sp` parameter that was verified **[U]**, so URIs would be GhostPay-local |
  | `scan` | tweak source for Litecoin blocks (new) | indexer for P2PKH-only tweaks (new) |
  | `fees` | all `not_enforceable` | all `not_enforceable` |

- A chain-mismatch rule is mandatory: a Litecoin SP string must never be accepted by the Bitcoin adapter and vice versa (distinct HRPs, expected network always from configuration).

## 5. Fee capability cap

For all three chains the payer's wallet builds the transaction; GhostPay has no contract, relayer or script to take a cut. Same as Bitcoin (`bitcoin.md` section 3) [R/I]:

- `fees = { checkout: 'not_enforceable', gasSponsorship: 'not_enforceable', flatSecurity: 'not_enforceable' }`; no `checkoutBps`.
- `feeAmount = 0n`, `grossAmount = netAmount`; the network fee belongs to the payer's wallet and is not a GhostPay fee.
- No tip output. No hosted-scanning fee line until a hosted scanner exists.

## 6. Real wallet and protocol status: what was searched and found

Network access in this task was limited to `raw.githubusercontent.com` and `registry.npmjs.org`. GitHub search, GitHub web pages, wallet websites and documentation sites were not reachable. **Absence below is therefore weak evidence.**

| Search | Result |
|---|---|
| npm registry search: "silent payments litecoin", "silent payments dogecoin", "silent payments bitcoin cash", "bip352 litecoin", "bip-352", "silent-payments", "bch stealth address", "litecoin stealth address", "dogecoin stealth address" | **None found** for Litecoin, Dogecoin or Bitcoin Cash. Silent-payment packages that did appear are Bitcoin-labelled: `@silent-pay/core` (description: "A library for bitcoin silent payments"), `@shakesco/silent` ("Bitcoin Silent Payments"), `silent-payments` ("SilentPayments (BIP-352) — install from GitHub instead"). Chain libraries exist (`bitcore-lib-ltc`, `bitcore-lib-cash`, `bitcore-lib-doge`) but their descriptions mention no silent payments |
| `README.md` of `litecoin-project/litecoin`, `dogecoin/dogecoin`, `bitcoin-cash-node/bitcoin-cash-node` (master) | No mention of "silent" in any of the three |
| Frigate README, BlindBit-Oracle README | Bitcoin Core only; networks are `testnet`, `testnet4`, `signet`, `regtest` (Frigate) and a `signet` example (BlindBit). No Litecoin, Dogecoin or Bitcoin Cash mention |
| `Bitshala-Incubator/silent-pay` README | Bitcoin library; "experimental", "Mainnet use is strictly NOT recommended"; works on regtest and testnet |
| `litecoin-project/lips` README | Not retrievable at that path (404); no LIP for silent payments could be checked **[U]** |
| Wallet announcements, exchange support, Electron Cash or Litecoin wallet release notes | **Not searchable here [U].** No claim is made either way |

Conclusion: **no silent-payments implementation for Litecoin, Dogecoin or Bitcoin Cash was found** with the sources available. Secondary articles cited in MULTICHAIN_SPEC (d-central.tech, spark.money) were not reachable and are not used.

## 7. PoC acceptance criteria (if a spike is ever approved)

Order of work: Litecoin first, only after Gate 0. Testnet and regtest only; no mainnet funds, keys or endpoints.

| Gate / # | Criterion | Evidence |
|---|---|---|
| Gate 0 | Confirm on a Litecoin node that Taproot is active on Litecoin testnet (and later mainnet) | Node RPC output attached to the ADR. If not active, stop: Litecoin joins scheme B and the whole family is deferred |
| Gate 0 | ADR chooses family value (`utxo` vs `bitcoin`), HRPs and chain ids (section 4), and records that scheme B is a new non-BIP-352 scheme | Merged ADR |
| 1 | `packages/btc-family` exposes per-chain network tables (HRP, `coin_type`, base58, units, max money) with strict decoding; BIP-352 official vectors still pass in `btc-silent-payments` (unchanged) | Unit tests |
| 2 | Litecoin scheme A: an SP string generated on `tltc`/regtest is paid by a sender implementation (GhostPay test harness, since no wallet was found), detected by `scan()` and swept; transaction accepted by a Litecoin node | Txids, scanner output |
| 3 | Cross-chain rejection tests: Litecoin SP string refused by the Bitcoin adapter and the reverse; BCH legacy address vs Bitcoin address confusion covered | Tests |
| 4 | Fees: all `not_enforceable`, `feeAmount === 0n` for every chain | Property test |
| 5 | For BCH/DOGE, only after an ADR: scheme B spec with generated test vectors, cross-checked by a second, independent implementation (for example a port of the Python `reference.py` shipped with BIP-352 [V: exists in `bitcoin/bips/bip-0352/`]) and an external cryptographic review before any live run | Vectors file, review sign-off |
| 6 | Indexer/tweak source for the chosen chain runs against the chain's testnet; scan key never leaves the process | Tests as in `bitcoin.md` criterion 7 |
| 7 | UI copy states the payer needs a silent-payments-capable sender for that chain and names no wallet that was not verified | Copy review |

**Package ownership (proposed) [I]:** all new Litecoin, Dogecoin and Bitcoin Cash code lives in a new `packages/btc-family`, depending on `@ghostpay/btc-silent-payments` for shared math and on `@ghostpay/chain-adapters` for types. The `btc-silent-payments` owner extracts a network-parameterization seam (HRP, network object, max money) rather than forking the code. `packages/chain-adapters` changes (family union, `utxo`) belong to its owner. Nothing in `btc-family` may be enabled in `chains` config until the gates pass.

**Effort summary (estimate, not from sources) [I]:** LTC M (conditional on Gate 0); BCH L; DOGE L (each needs a reviewed new scheme and an indexer).

## Sources

Network access in this task was limited to `raw.githubusercontent.com` and `registry.npmjs.org`. All other sites were blocked.

- BIP-352: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki (retrieved 2026-10-21)
- BIP-352 reference implementation and vectors: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352/reference.py and https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352/send_and_receive_test_vectors.json (retrieved 2026-10-21)
- BIP-321: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0321.mediawiki (retrieved 2026-10-21)
- SLIP-44: https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0044.md (retrieved 2026-10-21)
- SLIP-173: https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0173.md (retrieved 2026-10-21)
- Litecoin chain parameters: https://raw.githubusercontent.com/litecoin-project/litecoin/master/src/chainparams.cpp (retrieved 2026-10-21)
- Dogecoin chain parameters and script types: https://raw.githubusercontent.com/dogecoin/dogecoin/master/src/chainparams.cpp and .../src/script/standard.h (retrieved 2026-10-21)
- Bitcoin Cash Node chain parameters and script types: https://raw.githubusercontent.com/bitcoin-cash-node/bitcoin-cash-node/master/src/chainparams.cpp and .../src/script/standard.h (retrieved 2026-10-21)
- CashAddr specification: https://raw.githubusercontent.com/bitcoincashorg/bitcoincash.org/master/spec/cashaddr.md (retrieved 2026-10-21)
- READMEs: https://raw.githubusercontent.com/litecoin-project/litecoin/master/README.md , https://raw.githubusercontent.com/dogecoin/dogecoin/master/README.md , https://raw.githubusercontent.com/bitcoin-cash-node/bitcoin-cash-node/master/README.md , https://raw.githubusercontent.com/Bitshala-Incubator/silent-pay/main/README.md , https://raw.githubusercontent.com/sparrowwallet/frigate/master/README.md , https://raw.githubusercontent.com/setavenger/BlindBit-Oracle/master/README.md (retrieved 2026-10-21)
- npm registry search API and package metadata: https://registry.npmjs.org/-/v1/search , https://registry.npmjs.org/@silent-pay%2fcore/latest , https://registry.npmjs.org/@shakesco%2fsilent/latest , https://registry.npmjs.org/silent-payments/latest (retrieved 2026-10-21)
- Repository files read: `docs/MULTICHAIN_SPEC.md`, `packages/chain-adapters/src/adapter.ts`, `packages/btc-silent-payments/{README.md,DEVIATIONS.md,src/adapter.ts,src/adapter-types.ts,src/spend.ts,src/index.ts,src/address.ts,src/units.ts}`

## Unverified items (summary)

- Litecoin Taproot activation status on mainnet and testnet (deployment parameters exist; activation not confirmed).
- MWEB interaction with BIP-352 eligibility and skip rules.
- Litecoin, Dogecoin and BCH unit decimals, maximum supply and dust/fee rules.
- BCH P2PKH sighash rules; replay and key-reuse analysis.
- Security of scheme B (non-BIP-352 P2PKH variant); hash160 collision bound.
- Whether `@scure/btc-signer` accepts custom Litecoin/Dogecoin/BCH network objects; suitability of `bitcore-lib-*` packages.
- Payment URI parameter conventions for `litecoin:`, `dogecoin:`, `bitcoincash:`.
- Real wallet, exchange or LIP status for silent payments on these chains (searched only npm and three README files; "none found" is not proof of absence).
- Regtest `coin_type` and regtest SP HRPs (inferred as `1'`).
- All effort sizes, proposed HRPs, chain ids and the `utxo` family name.
