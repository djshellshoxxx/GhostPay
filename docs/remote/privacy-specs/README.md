# Privacy method specs: index, build order, swarm plan

Status: index of specs only. Nothing in this directory is built. Date 2026-10-21. Branch `claude/remote-extensions-1`.
Scope: **testnet-only proof of concept** (anvil `31337`, Ethereum Sepolia `11155111`, Base Sepolia `84532`; Bitcoin `testnet`/`signet`/`regtest`). Every method below is a **user-selectable option**, default off unless its spec says otherwise. No method makes GhostPay anonymous; each spec's "does NOT protect" list is normative UI copy.

Legal: deferred by the owner (ADR-0006; `../anonymization-research.md` section 12). Noted once here and once in each spec. Does not block the PoC. Every spec keeps: testnet-only guard in code, no GhostPay fee on any anonymization step, no "anonymous/untraceable/mix" wording.

Evidence: [R] = read in repo this run. Effort, trust and dependency columns are copied from each spec's own sections (cited); they are not re-derived. Baseline rules that every method must keep passing: [`../security-specs/privacy-ops.md`](../security-specs/privacy-ops.md) (PO-*, AT-PO-*).

## 1. Index

| # | Spec | Method (option ids) | Protects (partially) | Does NOT protect (short; full list in spec) | Effort | Trust added | Dependencies | Build owner dir (new) |
|---|---|---|---|---|---|---|---|---|
| 1 | [hygiene.md](hygiene.md) | Own-leak hygiene: fresh self-derived destination `HY-DST`, no consolidation `HY-CON`, address-free verification `HY-VER`, buffer rounding `HY-BUF`, self-funding guard `HY-FUND`; optional `GhostPaySweepRelayerV2` (Option B) | L4 destination reuse, L5 consolidation, L7 RPC learns owned address, L9 buffer fingerprint, known-wallet funding | payer and public still follow `S1 -> D`; relayer sees owner/destination/amount/IP; spending `D` later re-clusters; timing; `Transfer` log keeps the link | M (S-M; contract S, not recommended) | none new (reduces RPC exposure) | `core-crypto`, `chain-adapters` (types), `@noble/hashes 2.4.0` | `packages/hygiene/`; optional new files `packages/contracts/src/GhostPaySweepRelayerV2.sol` + tests |
| 2 | [amount-blurring.md](amount-blurring.md) | `AB-ROUND`, `AB-SPLIT`, `AB-DENOM`, `AB-DELAY`, honesty meter `AB-HON` | L11 amount uniqueness, L10 timing (friction only) | no anonymity; fan-out is a fingerprint; no crowd = near-zero gain; tab must stay open; no hidden amounts | M | none | `chain-adapters` (fee maths) | `packages/amount-blur/` |
| 3 | [hops.md](hops.md) | Delayed multi-hop forwarding `HOP-0` / `HOP-N` (labelled **Weak**, ack required) | delays arrival at `D`; defeats single-edge `Transfer(S1->D)` lookup only | payer and any analyst follow every hop (negative PoC proves it); amounts linkable; relayer sees each hop; adds nothing before a pool | M (S-M) | sweep relayer(s) per hop | `core-crypto`, `chain-adapters`, `secret-box`, `viem`; `HopAddressSource` wired to `hygiene`; mock pool from `external-pools` for handoff tests | `packages/hops/` |
| 4 | [payer-hiding.md](payer-hiding.md) | `payerMode`: `PH-0 direct`, `PH-1 fresh-wallet`, `PH-2 permit-relay`, `PH-3 eip7702-sponsored`, `PH-4 erc4337-paymaster` | payer's long-lived wallet as sender (PH-1); native-gas funding link (PH-2..4); seller's casual view (PH-2) | **payer address always public**; token-funding link remains; sponsor sees payer/stealth/amount/IP; contracts and delegate are fingerprints | L | sponsor (relay operator / 7702 submitter / bundler + paymaster); own unaudited contracts | `viem 2.57.7`, `relayer-guard` (sponsor), EIP-7702 and EntryPoint availability on testnets **[U]** (spec Q1/Q2) | `packages/payer-hiding/`, `packages/payer-hiding-contracts/`, `apps/payer-sponsor/` |
| 5 | [shielded-pool.md](shielded-pool.md) | Own Privacy-Pools-style pool: `SP-EXIT`, `SP-PAY`, `SP-RQ` | `S1 -> W` link after exit (T1); payer address on `SP-PAY` (T2); exit gas (T3); ASP dissociation (T4) | **testnet crowd = no anonymity**; deposit public; amount/timing match; relayer sees recipient/IP; insecure dev ceremony and circuit bugs can drain pool | L | own circuits + dev trusted setup, pool relayer, ASP publisher (optional) | `amount-blur`, `hygiene`, `secret-box`, `relayer-guard`; circom 2.2.3, snarkjs (GPL-3.0 isolated) | `packages/shielded-pool-circuits/`, `packages/shielded-pool-contracts/`, `packages/shielded-pool/`, `packages/shielded-pool-prover/`, `apps/pool-relayer/`, `test-vectors/shielded-pool.json` |
| 6 | [external-pools.md](external-pools.md) | `exitRoute`: `EP-0 none`, `EP-1 privacy-pools`, `EP-2 railgun`, `EP-M mock-pool`; `EP-3 tornado-fixed` stub/ADR, `EP-4 aztec` watch | `S1 -> W` link up to the pool's crowd | deposit public; crowd is the pool's; `S1` gas funding; relayer/broadcaster sees `D`/IP; ASP/PPOI decide inclusion, ragequit re-links; third-party code unaudited by us | L | 0xbow (upgradeable entrypoint, ASP, relayer) / Railgun (PPOI, broadcasters) | `secret-box`, `core-crypto`, `viem`; `@0xbow/privacy-pools-core-sdk@1.5.0`, `@railgun-community/wallet@10.9.0`; testnet liveness **[U]** (spec Q1/Q2) | `packages/external-pools/`, `packages/external-pools-privacypools/`, `packages/external-pools-railgun/` |
| 7 | [confidential-tokens.md](confidential-tokens.md) | Amount visibility: `CT-0` public, `CT-1` Zama fhEVM + ERC-7984 (build), `CT-M` cleartext mock, `CT-2` Fhenix / `CT-3` Inco (spike-gated), `CT-4..6` watch | L1 amount part, L11 metadata `net`, relayer amount field | edges, token, time public; wrap/unwrap amounts public; decryptors and FHE/TEE operator trust; decrypt relayer links addresses; silent zero transfers | L | Zama KMS + coprocessors + decrypt relayer (CT-1); Fhenix (CT-2); Inco TEE (CT-3) | Hardhat + `@fhevm/*`, `@openzeppelin/confidential-contracts 0.5.3`, `@zama-fhe/sdk 3.7.0`; **Sepolia only for CT-1**; spikes S-1..S-4 | `packages/confidential-contracts/`, `packages/confidential-amounts/`, `packages/confidential-amounts-fhenix/`, `packages/confidential-amounts-inco/` |
| 8 | [network-privacy.md](network-privacy.md) | Transport profiles `direct`, `tor-browser`, `tor-socks`, `onion`, `i2p-outproxy`, `nym-mixfetch`, `nym-socks5`, `ohttp`; `rpcMode` `single/quorum/own-node/light-client`; `scanMode` `range/indexer-tor/pir2/light-client` | client IP from RPC/relayer (N1-N3), local DNS (N4), shared-circuit correlation (N5), scan window (N6), page access (N7 PIR), RPC lying (N8 integrity), public mempool (N9) | on-chain data; request content; timing; Tor exit/outproxy sees host; Nym groups requests; PIR needs non-collusion; wallet extension RPC outside app | L | Tor / I2P outproxy / Nym mixnet / OHTTP relay+gateway / two PIR servers / indexer | `chain-adapters` (`RpcTransport`), `@noble/hashes 2.4.0`, HPKE lib (spec Q4), optional `@nymproject/mix-fetch` | `packages/net-transport/`, `packages/scan-source/`, `packages/pir-two-server/`, `packages/net-harness/`, `deploy/network-privacy/` |
| 9 | [metadata-hardening.md](metadata-hardening.md) | Menu `MH-FEE-*`, `MH-ANN-*`, `MH-TAG-*`, `MH-AMT-*`, `MH-WAL-*`, `MH-REL-*`, `MH-NET-*`, `MH-SCAN-*`, `MH-INV-*`, `MH-WEB-*`, `MH-ID-*`, `MH-BTC-1..6` | one named leak each (M1-M9, L1-L14) | no anonymity; payer, amount, token, time, router use stay public | S-M per item; L in total | mostly none; `MH-REL-1` private submission endpoint | per item; mostly edits | **Edits to existing dirs** (`apps/web`, `apps/relayer`, `packages/chain-adapters`, `core-crypto`, `invoice-schema`, `btc-silent-payments`); `MH-FEE-2` new router files in `packages/contracts`; `MH-SCAN-3` = `pir-two-server` (row 8) |
| 10 | [btc-payjoin.md](btc-payjoin.md) | `btcMode`: `plain`, `silent-payment`, `payjoin-v2` (BIP-77), `payjoin-v1` (BIP-78) | common-input-ownership and amount heuristics on the payment tx; v2: sender/receiver IPs from each other | **no silent-payment property in a PayJoin tx**; not a mixer; receiver UTXO probing; directory/relay metadata; fallback broadcast is fully linked | L (PoC M0-M3 = M; own v2 crypto M4 = L stretch) | payjoin directory + OHTTP relay (v2); receiver endpoint (v1) | `@scure/btc-signer`, `@noble/*`, `btc-silent-payments`; optional `payjoin` (payjoin-ffi, Alpha, Node only) | `packages/btc-payjoin/` |
| 11 | [profiles.md](profiles.md) | Catalogue, presets `standard` / `enhanced` / `maximum` / `confidential-amount`, per-option toggles, conflict rules | none by itself (selection and honesty) | n/a; it only exposes what rows 1-10 do and do not protect | S-M | none | none at runtime (pure TS) | `packages/privacy-profiles/` |

Watch / not built in any spec: Tornado-style own deployment (EP-3, ADR only), Aztec (EP-4, CT-4), Oasis Sapphire (CT-6), Monero/Zcash hops, CoinJoin coordinator, bridges (`../anonymization-research.md` sections 6.4, 7.1, 8, 14 "Rejected").

## 2. Shared invariants (all builds)

1. New packages only; each `private`, `UNLICENSED`, ESM, scripts/devDeps/tsconfig/vitest copied from `packages/relayer-guard` [R] (coverage thresholds 95/90/95/95) unless the spec states otherwise (`btc-payjoin`: 95/90/95/95; circuits: own runner).
2. Chain guard `{31337, 11155111, 84532}` (BTC: `testnet|signet|regtest`) at every exported entry point and every contract constructor that the spec marks.
3. No new `@noble/*` major (S3-24); exact pins; `THIRD_PARTY.md` rows go through the single docs owner (lane E7 below), not each builder.
4. No method package imports another method package's internals; cross-method use is through the interfaces named in the specs (`HopAddressSource`, `ExternalPoolAdapter`, `PublicLogSource`, `ConfidentialBackend`, `PayjoinTransport`, amount-blur `planSplit`). `privacy-profiles` imports none of them and none import it; `apps/web` wires both.
5. Builders do not `git commit` unless the orchestrator says so, and write only inside their owner dir.

## 3. Recommended build order

Order rule (from `../anonymization-research.md` section 14 [R]): fix GhostPay's own leaks first, then cheap client friction, then network, then third-party/own pools and new contracts; spike-gated items start as spikes in parallel so their go/no-go is known before their build wave.

1. `privacy-profiles` and `hygiene` (catalogue + rank-1 leak fixes; everything else references them).
2. `amount-blur`, `net-harness`, `net-transport`, `pir-two-server`, `external-pools` core + `mock-pool`, `payer-hiding` (PH-1 first), `btc-payjoin` M1 core.
3. `hops`, `scan-source`, `shielded-pool-*`, external-pool adapters, `payer-hiding-contracts` + `apps/payer-sponsor`, `confidential-*`.
4. Edits to existing code (one owner per existing dir), then docs.

## 4. Parallelisation plan (swarm lanes, disjoint ownership)

Each lane = one agent = one or more dirs that no other lane writes. "Needs" = must exist (built `dist/` or a published interface) before the lane's tests can pass; lanes may start earlier against the spec interface with a local stub inside their own dir.

### Wave 0: spikes (all parallel, S each; output = notes in the lane's own `DEVIATIONS.md`/`README.md`, no product code)

| Lane | Dir (owned) | Spike | Gate it decides |
|---|---|---|---|
| S0-CT | `packages/confidential-contracts/` | CT S-1 version set; S-2 Sepolia decrypt with fresh EOA | CT-1 build go/no-go |
| S0-CT2 | `packages/confidential-amounts-fhenix/`, `packages/confidential-amounts-inco/` | CT S-3, S-4 | CT-2/CT-3 adapters |
| S0-PH | `packages/payer-hiding-contracts/` | PH Q1/Q2: 7702 on testnets, Foundry/solc Prague support | PH-3, PH-4 scope |
| S0-SP | `packages/shielded-pool-circuits/` | circom 2.2.3 pinned install, ptau source (SP Q5), constraint count | SP build; Groth16 vs PLONK (SP Q4) |
| S0-EP | `packages/external-pools-privacypools/`, `packages/external-pools-railgun/` | EP Q1/Q2: testnet addresses, ASP/relayer/PPOI/broadcaster liveness; SDK install with `--ignore-scripts` | anvil-only vs public testnet |
| S0-BPJ | `packages/btc-payjoin/` | BPJ-SPIKE-1: payjoin-ffi on Linux CI, BIP-77 normative strings, ElligatorSwift in noble | v2 transport A vs C |
| S0-NP | `packages/net-transport/` | NP Q3/Q4: own SOCKS5h vs `socks-proxy-agent`; HPKE library | OHTTP build |

### Wave 1: foundation (all parallel; no lane needs another wave-1 lane)

| Lane | Dir (owned) | Needs |
|---|---|---|
| A | `packages/privacy-profiles/` | nothing |
| B | `packages/hygiene/` | existing `core-crypto`, `chain-adapters` |
| C | `packages/amount-blur/` | existing `chain-adapters` |
| D | `packages/net-harness/`, `packages/net-transport/` | existing `chain-adapters` types |
| E | `packages/pir-two-server/` | nothing |
| F | `packages/external-pools/` (core, vault, mock) | existing `secret-box`, `core-crypto` |
| G | `packages/payer-hiding/` (PH-1, then PH-2..4 builders against spec ABIs) | existing `viem` pin |
| H | `packages/btc-payjoin/` M1 (core, v1, memory transport, regtest e2e) | existing `btc-silent-payments` (read-only) |
| I | `packages/shielded-pool-circuits/` (after S0-SP) | nothing |
| J | `packages/payer-hiding-contracts/` (after S0-PH) | `packages/contracts/lib` read-only |
| K | `packages/confidential-contracts/` (after S0-CT) | nothing in repo |
| L | `deploy/network-privacy/` templates | nothing |

### Wave 2

| Lane | Dir (owned) | Needs |
|---|---|---|
| M | `packages/hops/` | B (for real `HopAddressSource`; stub until then), F mock pool (handoff tests), `secret-box` |
| N | `packages/scan-source/` | E, D |
| O | `packages/shielded-pool-contracts/` | I (generated verifiers) |
| P | `packages/shielded-pool/` (SDK, `asp-cli`, `test-vectors/shielded-pool.json`) | I (vectors), C, B |
| Q | `packages/external-pools-privacypools/` | F |
| R | `packages/external-pools-railgun/` | F |
| S | `apps/payer-sponsor/` | J, G, existing `relayer-guard` |
| T | `packages/confidential-amounts/` | K (ABI JSON) |
| U | `packages/btc-payjoin/` M2 (`ffi/`) | H (same lane owner as H; sequential) |

### Wave 3

| Lane | Dir (owned) | Needs |
|---|---|---|
| V | `packages/shielded-pool-prover/` | I |
| W | `apps/pool-relayer/` | O, P, existing `relayer-guard` |
| X | `packages/confidential-amounts-fhenix/`, `-inco/` | T, S0-CT2 pass |

### Wave 4: edits to existing code (serial per dir; one owner each; after the packages they consume exist)

These are the only writes outside new dirs. Several specs edit the same files, so each existing dir gets **one** owner who applies all specs' edit lists for that dir in one change.

| Lane | Existing dir (one owner) | Edit lists merged from |
|---|---|---|
| E1 | `packages/chain-adapters/` | hygiene (`fetchTransferLogs`), network-privacy (`allowOnionHttp`), payer-hiding (`supports7702`, `entryPoint`), shielded-pool / external-pools / confidential (manifest fields), metadata-hardening (FEE-1, ANN-3, AMT-1, NET-1, NET-3, SCAN-2) |
| E2 | `packages/core-crypto/` | confidential (`0x5bebed7e` metadata), metadata-hardening (ANN-2, ANN-3, TAG-2, ID-1, ID-2) |
| E3 | `packages/invoice-schema/` | confidential (`amountVisibility`), metadata-hardening (INV-1, INV-3, ID-1) |
| E4 | `packages/btc-silent-payments/` | btc-payjoin 7.2 (single-input signer export), metadata-hardening MH-BTC-1..6 |
| E5 | `apps/relayer/` | network-privacy 5.1 (transport, `bucketBy`, unix socket, OHTTP gateway), metadata-hardening (WAL-2, REL-1/2/3/5), tests only for hygiene AT-HY-7 and hops AT-HOP-RLY |
| E6 | `apps/web/` | every spec's UI list; settings gets **one** new field `privacy` typed by `@ghostpay/privacy-profiles` (`PrivacySelection`) instead of per-spec fields |
| E7 | `docs/user/`, `THIRD_PARTY.md`, root `package.json` (`build:libs` order), `docs/adr/` (EP-3 ADR text, PH ADR-0009 note) | every spec's docs list |
| E8 | `packages/contracts/` (new files only) | hygiene Option B `GhostPaySweepRelayerV2`, metadata-hardening MH-FEE-2 accrual router |

Order inside wave 4: E1 -> E2 -> E3 (shared types) in sequence; E4, E5, E8 parallel to them (disjoint); E6 last (consumes all); E7 last.

### Critical path

`S0-SP -> I -> O -> W` (own pool) and `S0-CT -> K -> T` are the longest. `A`, `B` gate the web integration. Everything else fits inside these.

## 5. Not covered by any spec yet

- A combined end-to-end testnet run mixing methods (e.g. PH-3 pay -> HY-DST sweep -> EP-1 exit over `tor-socks`). Proposed acceptance for the umbrella PoC: one scripted anvil scenario per preset in [profiles.md](profiles.md) section 10, after wave 4.
- Measured anonymity sets on any testnet (all specs refuse numeric anonymity scores without measurement).
