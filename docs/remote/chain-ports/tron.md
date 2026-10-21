# Tron port (research, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-tron` (does not exist yet).
**Network access during research:** only `raw.githubusercontent.com` and `registry.npmjs.org` were reachable. TronGrid, tronscan, developers.tron.network, Shasta/Nile faucets and all RPCs were blocked. Anything that needs them is marked **unverified**.

## 1. Verdict

**Feasible, medium effort (M, about 4-6 engineer-weeks incl. contract audit), but only as "Tier 1.5": own adapter family, own contracts, no reuse of the EVM adapter.** Stealth maths reuse core-crypto unchanged. Everything touching addresses, transactions, fees, events and contract deployment differs. This reverses the "Tron: no stealth standard verified, not planned" line in `docs/MULTICHAIN_SPEC.md` section 5 only for a PoC; production needs an owner decision and an ADR because there is no ratified Tron stealth standard (ERC-5564 is an Ethereum ERC; a Tron announcer would be GhostPay-defined, scheme id 1 reused).

## 2. Scheme: secp256k1 reuse

- Tron accounts use secp256k1, same as Ethereum. Scheme 1 (ERC-5564 secp256k1 with view tags) in `packages/core-crypto/src/stealth.ts` (`deriveStealthPayment`, `checkAnnouncement`, `deriveStealthSecret`) works unmodified: meta-address `(K_spend, K_view)`, ephemeral key R (33-byte compressed), view tag `keccak256(S)[0]`, stealth public key `K_spend + keccak(S)*G`.
- Only the last step differs: core-crypto returns an EIP-55 `0x` address (`keccak256(uncompressed_pubkey[1:])[12:]`). Tron's raw address is `0x41 || that same 20 bytes` (21 bytes), displayed as base58check: `base58(addr21 || sha256(sha256(addr21))[0:4])`, which yields the `T...` form. Prefix byte confirmed in java-tron `Constant.ADD_PRE_FIX_BYTE_MAINNET = (byte) 0x41` and `DecodeUtil.ADDRESS_SIZE = 42` hex chars (raw.githubusercontent.com). So the existing 20-byte address is reusable; `packages/chain-tron` adds `evmToTronBase58(address)` / `tronBase58ToEvm(string)` only. No new curve code, no new crypto dependency beyond a base58check implementation (`@scure/base`, already noble-family; version to pin at build time).
- Meta-address string: reuse the ERC-5564 `st:` style encoding with a Tron chain tag, or reuse as-is and add chain binding in the invoice. Chain binding must be enforced in the adapter (an invoice for Tron must never be payable via the EVM adapter; MULTICHAIN_SPEC section 6).
- Key-compat hazard: the same stealth private key controls the same 20 bytes on every EVM chain and on Tron. Funds sent to the Tron form of an address are also "owned" by the EVM form. Users must be told a swept Tron key is the same key as on EVM; do not reuse seller seeds across chains without that disclosure.

## 3. Tokens, transfers and fees

- **TRC-20** is TIP-20 (status Final), interface-identical to ERC-20 (`transfer(address,uint256)` selector `0xa9059cbb`, `transferFrom`, `approve`, `balanceOf`), per `tronprotocol/tips/tip-20.md`. TIP-2612 (permit) exists as a TIP (header seen on raw GitHub); **which production tokens (USDT-TRC20) implement it is unverified**. Do not assume permit; sweeps with permit are off for Tron unless a token matrix is verified.
- ABI addresses in calldata are 20-byte (EVM style, the `41` prefix dropped, left padded to 32 bytes). `triggersmartcontract` (TronGrid `/wallet/triggersmartcontract`, `/wallet/triggerconstantcontract`): request body uses the 21-byte hex or base58 `owner_address`/`contract_address`, `function_selector`, `parameter` (ABI-encoded hex), `fee_limit` (SUN), `call_value`. The response carries an unsigned transaction to sign (secp256k1 over sha256 of `raw_data`, **not** keccak and not RLP; this is a different signing path from viem). The endpoints are documented on developers.tron.network which was blocked: **unverified, confirm field names before coding.**
- **Known token quirk (from general knowledge, unverified here):** USDT-TRC20 is not strictly ERC-20 return-compatible in all paths; use a `SafeERC20`-style low-level call and balance-delta checks, which the router spec already mandates (`CONTRACTS_SPEC.md` section 1).
- **Fees: energy and bandwidth.** Bandwidth pays for transaction bytes (free daily allowance, then burns TRX or uses staked bandwidth); energy pays for TVM execution (staking TRX for energy, or burning TRX at the energy price, bounded by `fee_limit`). Exact numbers, prices and free allowances are chain parameters that change by committee proposal: **unverified, query `getchainparameters` on a node later**. Design consequences:
  - A freshly derived stealth address holds no TRX, so a token sweep needs energy+bandwidth. This is the Tron analogue of the gas-buffer problem. Options: (a) payer-funded TRX buffer sent in the same router call (like `payERC20WithBuffer`), (b) delegated resources (an account that staked TRX delegates energy/bandwidth to the stealth address; delegation mechanics unverified), (c) sweep contract with a signed authorization (needs permit or prior allowance, not available to a fresh address for plain TRC-20).
  - Activating an account: an address that never received anything does not exist on chain. Sending TRX or a TRC-20 to it creates it; account creation costs a fee (amount unverified). TIP-54 (auto-activate on contract transfer, Final) is listed in tronprotocol/tips; behaviour for TRC-20 transfers is unverified. The router's balance-delta checks must be tested against this.
  - Cost realism: a TRC-20 transfer that also writes a log is not free for the payer. Present a quote with energy price from the node, not a constant.

## 4. Announcer and TVM feasibility

- TVM is an EVM-derived VM implemented in java-tron. Opcode support is gated by committee proposals: java-tron `OperationRegistry` has `appendShangHaiOperations` (PUSH0), `appendCancunOperations` (TLOAD, MCOPY) and `appendOsakaOperations`, each switched by `VMConfig.allowTvmShanghai/Cancun/Osaka`. **Whether each proposal is active on mainnet, Shasta and Nile today is unverified** (needs node access). Therefore compile Tron contracts with `evmVersion` conservative (`paris` or `shanghai` only after verification), not the project-wide `cancun`. This is a separate Foundry/Hardhat profile; tooling for Tron (TronBox, tron-solc) is **unverified**.
- **Solidity version/compiler:** the stock solc output usually runs on TVM, but Tron-specific differences exist: `address` size is 21 bytes at VM level (`address(this)` conversions), `block.timestamp`, `msg.value` semantic is in SUN, native token is TRX (6 decimals, `nativeDecimals: 18` in `ChainConfig` is wrong for it; Tron needs its own config type), `.transfer`/`.send` energy stipend differs. Treat each as test requirements, not facts.
- **CREATE2:** java-tron `Program.java` implements CREATE2 (`generateContractAddress2(senderAddress, salt, programCode)` at line 1651). The address uses the Tron prefix `0x41` in place of Ethereum's `0xff` (**stated from knowledge, not seen in the code I fetched: verify in `WalletUtil`/`Hash`**). Consequence: the Arachnid deployer `0x4e59...56C` does not exist on Tron and its presto-signed deployment transaction cannot be replayed; the ERC-5564 address `0x5564...5564` cannot be reproduced. **No canonical announcer address on Tron; GhostPay deploys its own and the manifest records it.** Choice: deploy once with a plain `CreateSmartContract`, record txid, and publish the address in the signed manifest (no vanity needed).
- **Events:** TVM logs exist and are indexed by solidity events. They are read through TronGrid HTTP (`/v1/contracts/{address}/events` with `min_block_timestamp`, `max_block_timestamp`, `event_name`, `only_confirmed`, `fingerprint` pagination, and `/wallet/gettransactioninfobyblocknum`/`getblock` for raw logs). Query shape is timestamp based, **not** `eth_getLogs` with block ranges. Parameter names, page limits and rate limits are **unverified** (docs blocked). The java-tron node also exposes an Ethereum-compatible JSON-RPC subset on `/jsonrpc` including `eth_getLogs` (from general knowledge; existence, availability and range caps **unverified**). The scanner for Tron must implement a `TronEventSource` interface with two implementations (TronGrid events, node `/jsonrpc` getLogs), plus a bounded confirmation depth (Tron solidity node `walletsolidity` gives confirmed state; finality ~19 blocks / ~1 min is general knowledge, **unverified**).
- **Announcer design:** `TronAnnouncer` is ERC-5564 `announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata)` emitting `Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata)` with `schemeId` and `stealthAddress`, `caller` indexed (per the ERC text on raw ethereum/ERCs). Because the topic0 is `keccak256("Announcement(uint256,address,address,bytes,bytes)")`, keeping the identical event signature lets core-crypto's metadata parser and the existing `logs.ts` decoding be reused. The `address` indexed arguments are 20-byte values in logs (prefix stripped); the adapter converts to base58 for display. The metadata layout stays `viewTag(1) || selector(4) || token(20) || amount(32)` (`CONTRACTS_SPEC.md` section 1) with token as the 20-byte form.
- **No registry:** ERC-6538 registry equivalents are out of scope for the PoC. Meta-addresses are shared out of band or in the invoice.

## 5. Fee-split contract design

`GhostPayRouterTron`, a port of `GhostPayRouter` with identical rules except where noted:

- `payTRC20(token, stealth, gross, minNet, deadline, ephemeralPubKey, metadata)`, `FEE_BPS = 25`, `fee = gross*25/10000`, `net = gross-fee`, two `safeTransferFrom` calls (payer to fee recipient, payer to stealth), balance-delta checks, `ANNOUNCER.announce(1, stealth, ephemeralPubKey, metadata)`. The payer must first `approve(router, gross)` on the token (two transactions, each costing energy), because permit support is unverified.
- `payTRX(...)` payable: native amount in SUN. Same split via low-level `call{value:}`; check that TVM `call` value transfer to a not-yet-activated address works (TIP-54 related; **unverified**, PoC test).
- `payTRC20WithBuffer`: sends a TRX buffer to `stealth` so the stealth key can pay bandwidth and energy for its first sweep. Buffer sizing needs live chain parameters (energy price, bandwidth price); the formula in `CONTRACTS_SPEC.md` section 3 is in EVM gas and must be reimplemented in SUN.
- Immutables: `ANNOUNCER`, `FEE_RECIPIENT` (as 20-byte `address` in Solidity; stored base58 in the manifest and read back as hex). No owner, no proxy, same errors as the EVM router. `energyConsumeUserResourcePercent` / `origin_energy_limit` at deployment: use the deployer's default and keep the contract non-upgradable; TVM contract-level settings that let the deployer change parameters later (e.g. `updateSetting`, `updateEnergyLimit` actions) **exist in the Tron protocol per general knowledge and must be checked for conflict with the "no owner" invariant; unverified**. This is a design risk that does not exist on EVM.
- Fee token: TRX or USDT-TRC20 collection; `FeeCapability.checkout = 'enforced'`, `checkoutBps = 25`. Gas sponsorship: `not_enforceable` for the PoC (no permit assumption). Flat security: `not_deployed`.
- Audit: separate scope; do not reuse the EVM audit report as sufficient.

## 6. Adapter fit (`packages/chain-adapters/src/adapter.ts`)

Current constraints seen in code:
- `ChainFamily` is `"evm" | "bitcoin" | "solana"`: add `"tron"` (breaking union; consumers with exhaustive switches fail to compile, which is desired).
- `PaymentRequest.router` / `feeRecipient` are typed as `Address` (0x EVM form). A Tron request needs the base58 form for display and the 0x/21-byte form for the node API. Either widen to a branded string or give Tron its own request subtype; recommend a discriminated union on `family`.
- `ChainAdapter.scan` takes `ScanRange {fromBlock: bigint; toBlock?}`. TronGrid events are timestamp-paged; the Tron adapter should hide that behind block numbers (map block number to timestamp via `getblockbynum`) or the interface gains an opaque cursor. Reorg depth and confirmed-only reading go in the Tron config.
- `ChainConfig.nativeDecimals: 18` literal type cannot describe TRX (6 decimals). Tron gets its own `TronChainConfig`, not an entry in `CHAINS`.
- `ChainAdapter.chainId: string` fits: use `"tron-mainnet"`, `"tron-shasta"`, `"tron-nile"`. Do not use a Tron numeric chain id in this field (the TVM chain id value is unverified).
- Signing: viem is not usable for Tron transactions; the Tron adapter must sign `raw_data_hex` with sha256+secp256k1 (recoverable signature, 65 bytes) using noble. Never build a tx from a server-supplied unsigned blob without re-deriving the calldata locally (same "preview == calldata" rule as for EVM). TronGrid-returned `raw_data` must be decoded and compared to the locally built call.

## 7. Testnets

- **Shasta** (faucet-funded, short-lived resets) and **Nile** (more stable, faucet) are the two public Tron testnets known to me. Endpoints, faucet URLs and current uptime: **unverified (network blocked)**. Nile is preferred for the PoC because Shasta has history of resets; confirm before deciding.

## 8. Effort

| Work | Size |
|---|---|
| Address codec, tx signing, `triggersmartcontract` client, local calldata decode | S |
| `TronAnnouncer` + `GhostPayRouterTron` + tests (Foundry profile or TronBox) | M |
| Scanner with TronGrid events + jsonrpc fallback, finality handling | M |
| Adapter widening (`family`, request union) + fee capability | S |
| Audit (new contracts and new signing path) | M-L |
| **Total** | **M** (L with audit and mainnet manifest) |

## 9. Risks

1. Tron has no ratified stealth standard and no known wallet that understands GhostPay announcements; payers must use a GhostPay-aware flow (Tron wallets sign TronLink-style transactions; web app wallet integration **unverified**).
2. Fee/resource model: payer cost is volatile; a fresh stealth address cannot move tokens without a TRX or delegated-resource buffer.
3. VM drift: opcode proposals (PUSH0/TLOAD/MCOPY) gate compiler output; deploy on a wrong evmVersion and the contract fails at runtime.
4. Contract-level mutable settings in the Tron protocol may violate "immutable, no owner" claims (see section 5). Must be verified before marketing anything as ownerless.
5. Event access depends on TronGrid (third party, rate limits, privacy exposure of viewing queries); self-hosting a java-tron full node is heavy.
6. USDT-TRC20 behaviour: freeze/blacklist and non-standard return values; same token-allowlist work as EVM, plus a token-specific audit.
7. Same-key reuse across EVM and Tron (section 2).
8. Legal/compliance profile of Tron privacy tooling is a business risk; out of scope here but must be reviewed before launch.

## 10. PoC acceptance (testnet only, Nile or Shasta)

- [ ] `evmToTronBase58` / `tronBase58ToEvm` round trip; test vectors computed from at least three independent implementations (not a single library); the address derived from a known secp256k1 key matches TronLink-generated address for the same key (manual check, no mainnet funds).
- [ ] Scheme-1 payment: derive stealth key with `deriveStealthPayment`, pay a TRC-20 through `GhostPayRouterTron` on testnet, scanner detects via TronGrid events and via node jsonrpc `eth_getLogs` (if enabled), `deriveStealthSecret` yields a key that signs a sweep.
- [ ] Fee exactness: recipient receives exactly `gross*25/10000`, stealth receives exact `net`; balance-delta guard rejects a fee-on-transfer mock.
- [ ] Energy and bandwidth cost of a pay and a sweep recorded for two energy prices; buffer formula validated.
- [ ] Account-activation test: payment to a never-seen stealth address succeeds and the announcement is emitted.
- [ ] Unsigned-tx tamper test: a modified `raw_data` returned by a fake TronGrid is rejected by the local decoder.
- [ ] `evmVersion` matrix test: contract deployed with the chosen version executes; one deliberately-wrong version fails (to prove the check works).
- [ ] No mainnet key, no mainnet transaction anywhere in the PoC; CI uses mock node recordings.

## 11. Package ownership

New package `packages/chain-tron` (`@ghostpay/chain-tron`), owner: the chain-port work stream. Contents: `src/address.ts` (codec), `src/signing.ts`, `src/node-client.ts` (TronGrid/full-node HTTP, injected fetch), `src/events.ts` (`TronEventSource`), `src/adapter.ts` (implements `ChainAdapter` with family `"tron"`), `src/config.ts` (`TronChainConfig`), `contracts/` (Tron router and announcer, separate from `packages/contracts` EVM profile), `test/`. Depends on `@ghostpay/core-crypto`, `@ghostpay/chain-adapters` (types only). Changes outside the package are limited to: `ChainFamily` union and `PaymentRequest` typing in `packages/chain-adapters/src/adapter.ts`, and a Tron section in `docs/MULTICHAIN_SPEC.md`. Manifest format needs a Tron variant (`deployments/tron-<network>.json`, base58 addresses, txids as 64-hex without `0x`); the existing `validateManifest` is EVM-only (`<chainId>.json`, 0x addresses) and must not be stretched.

## Sources (retrieved 2026-10-21)
- java-tron `Constant.java` (0x41 prefix): https://raw.githubusercontent.com/tronprotocol/java-tron/develop/common/src/main/java/org/tron/core/Constant.java
- java-tron `DecodeUtil.java`: https://raw.githubusercontent.com/tronprotocol/java-tron/develop/common/src/main/java/org/tron/common/utils/DecodeUtil.java
- java-tron `Program.java` (CREATE2 path): https://raw.githubusercontent.com/tronprotocol/java-tron/develop/actuator/src/main/java/org/tron/core/vm/program/Program.java
- java-tron `OperationRegistry.java` (Shanghai/Cancun/Osaka gating): https://raw.githubusercontent.com/tronprotocol/java-tron/develop/actuator/src/main/java/org/tron/core/vm/OperationRegistry.java
- TIPs index: https://raw.githubusercontent.com/tronprotocol/tips/master/README.md
- TIP-20 TRC-20: https://raw.githubusercontent.com/tronprotocol/tips/master/tip-20.md
- TIP-2612 permit: https://raw.githubusercontent.com/tronprotocol/tips/master/tip-2612.md
- ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/CONTRACTS_SPEC.md`, `docs/DEPLOYMENT_MANIFEST.md`, `packages/chain-adapters/src/adapter.ts`, `packages/core-crypto/src/stealth.ts`
- Blocked (not reachable): developers.tron.network, trongrid.io, tronscan.org, nile/shasta endpoints and faucets. All claims that depend on them are marked unverified above.
