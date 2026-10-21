# Spec: External private pools (Privacy Pools, Railgun, others) as user-selectable exits

Status: **spec, not built**. Date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: **testnet-only proof of concept** (Ethereum Sepolia `11155111`, Base Sepolia `84532`, local anvil). Legal questions are deferred by the owner (noted once in section 14; nothing here blocks on them). Nothing here has run against a real wallet, RPC, relayer, broadcaster or chain.

Evidence tags: **[R]** repo file read this run, **[P]** primary source fetched 2026-10-21, **[S2]** reputable secondary source (search result, not fetched), **[U]** unverified: from memory/inference/single weak source; verify before relying on it.

Read for this spec: `README.md`, `docs/CONTRACTS_SPEC.md`, `docs/remote/anonymization-research.md` (sections 5.1-5.4, 10, 12), `docs/remote/onion-i2p-research.md` (skimmed by grep), `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md` (headings), `docs/remote/privacy-specs/payer-hiding.md` (format), `packages/chain-adapters/src/{index,sweep}.ts`, root and package `package.json` files.

## 1. Goal

Do **not** build a pool. Let a seller who has received funds at a stealth address `S1` (scheme 1) choose, per sweep, to **enter an existing third-party private pool from `S1`** and **exit later to a fresh address**, through a single GhostPay-owned adapter interface so that more pools can be added and so that a pool dying (Aztec Connect lesson, section 3.4) never strands funds.

User-selectable `exitRoute` values (UI/CLI), all behind one interface `ExternalPoolAdapter` (section 6):

| id | Route | PoC status |
|---|---|---|
| `EP-0` | `none` | Baseline: plain sweep (existing `GhostPaySweepRelayer` / direct transfer). Not in this package; the planner returns it as the default so tests have a control. |
| `EP-1` | `privacy-pools` | 0xbow Privacy Pools (`@0xbow/privacy-pools-core-sdk`). Build. |
| `EP-2` | `railgun` | Railgun (`@railgun-community/wallet`). Build. |
| `EP-3` | `tornado-fixed` | Fixed-denomination Tornado-style mixer, upstream code deployed by us on testnet only. **Stub + decision record, not built** (section 3.5). |
| `EP-4` | `aztec` | Aztec network. **Watch only**; adapter interface documented so it can be added; not built. |
| `EP-M` | `mock-pool` | In-repo deterministic fake pool (no ZK) so the whole flow, vault, recovery and UI are testable offline. Build (it is the CI target). |

The comparison table in the UI is rendered from `EXIT_ROUTE_INFO` (section 5), not hand-written.

## 2. Threat addressed and what it does NOT protect

**Addressed (partially):** L3/L4/L5 post-sweep linkability from `anonymization-research.md` 5.1/5.2: after the payer sends to `S1`, an observer who follows `S1` to the seller's wallet `W` learns the seller's balance and later spends. With a pool exit the observer sees `S1 -> pool` and `pool -> D` (fresh destination) and cannot tell which deposit funded `D`, up to the pool's anonymity set.

**Does NOT protect (copy this into UI text and tests):**
- N1: The `S1 -> pool` deposit is public. Anyone (including the payer, who knows `S1`) sees "this payment went into pool X" (research 5.1 "Leaks that remain" [R]).
- N2: **Anonymity set is the pool's, not GhostPay's.** Illustrative, unmeasured: small crowd, exact-amount withdraw soon after deposit, or a unique token is linkable by timing/amount (research section 10, Wang et al. WWW '23 [S2 per research doc]). GhostPay MUST NOT display a numeric "anonymity" score for pools without a measured basis (EP-UX-3).
- N3: Gas funding of `S1` links `S1` to its funder unless sponsored (ERC-5564 security considerations, quoted in `payer-hiding.md` section 2 [R]). This spec uses the sweep/7702 sponsor from other specs where available; otherwise the UI states the link.
- N4: Pool relayer/broadcaster sees destination `D`, amount, IP (Privacy Pools relayer API takes `recipient` in `/relayer/quote` and the full withdrawal in `/relayer/request` [P]). Network privacy is the job of `network-privacy.md`.
- N5: ASP/PPOI list providers see deposits and decide inclusion. A depositor excluded from the approved set can only `ragequit` back to the **original depositor address `S1`** (Privacy Pools: "Can only be executed by the original depositor" [P]), a public exit that re-links.
- N6: Third-party contracts, circuits and trusted-setup are **not audited by GhostPay** (modules-needed: no independent audit exists even for GhostPay itself [R]).
- N7: Mainnet out of scope; chain allowlist enforced in code (EP-GEN-1).

## 3. Primary-source facts and trust assessment

### 3.1 Privacy Pools (0xbow) — repo `0xbow-io/privacy-pools-core`

- Licence **Apache-2.0** (repo LICENSE and SDK `package.json` `license` [P: https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/LICENSE, .../packages/sdk/package.json, retrieved 2026-10-21]).
- Monorepo: `circuits`, `contracts`, `relayer`, `sdk` [P: .../main/README.md]. GitHub UI page showed no tagged releases and no auditor/report names (WebFetch summary of https://github.com/0xbow-io/privacy-pools-core, 2026-10-21; the `audit/` directory contents were NOT readable from the sandbox: **[U] audit status**).
- SDK: npm `@0xbow/privacy-pools-core-sdk` version `1.5.0` at `main` (`packages/sdk/package.json` [P]); deps `snarkjs 0.7.5`, `viem 2.22.14` (**GhostPay root pins `viem 2.57.7` [R]; an SDK-internal older viem copy is a supply-chain/duplicate-dependency risk, see EP-SUP-2**), `@zk-kit/lean-imt`, `maci-crypto`. Exports `PrivacyPoolSDK`, `Circuits`, `generateMasterKeys`, `generateDepositSecrets`, `generateWithdrawalSecrets`, `AccountService`, `DataService`, `proveCommitment`, `proveWithdrawal`, `verifyWithdrawal`, `createContractInstance(rpcUrl, chain, entrypointAddress, privateKey)` [P: sdk README]. Keys derive from a **BIP-39 mnemonic**; README states the SDK has no `generateMnemonic` and forbids reuse across apps [P].
- Circuit artifacts (wasm/vkey/zkey) are SHA-256 verified at load by the SDK; digests are listed in the SDK README (e.g. `withdraw.zkey 2a893b42...6de677`) [P]. GhostPay MUST pin these digests independently (EP-PP-6), not trust the SDK constant alone.
- Contracts: `Entrypoint` (registry, ASP root, relay, fees), one `PrivacyPool` per asset (`PrivacyPoolSimple` native, `PrivacyPoolComplex` ERC-20) [P: contracts README]. Mainnet addresses in README: Entrypoint proxy `0x6818809EefCe719E480a7526D76bD3e561526b46`, ETH pool `0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB` [P: README; note the README lists the same address for proxy and implementation, so treat the "implementation" line as a doc error **[U]**]. **No Sepolia/Base Sepolia addresses were found in the fetched READMEs**; the deploy scripts `deploy:protocol:sepolia` and `deploy:protocol:chiado` exist [P], so a testnet deployment exists in tooling but its public addresses and liveness are **[U]** (Open question Q1). Only Ethereum mainnet (since 2025-03-31) and Gnosis are reported publicly [S2 The Block, 2025]; BNB Chain pool planned Q1 2026 [S2 search result]; Base Sepolia: **[U], assume absent**.
- ABI facts used (from `IEntrypoint.sol`, `IPrivacyPool.sol` [P]): `Entrypoint.deposit(uint256 _precommitment) payable returns (uint256)`; `Entrypoint.deposit(IERC20 _asset, uint256 _value, uint256 _precommitment) returns (uint256)`; `Entrypoint.relay(IPrivacyPool.Withdrawal _withdrawal, ProofLib.WithdrawProof _proof, uint256 _scope)`; `PrivacyPool.withdraw(Withdrawal, WithdrawProof)`; `PrivacyPool.ragequit(ProofLib.RagequitProof)`; `struct Withdrawal { address processooor; bytes data; }`; for relayed withdrawals `data = abi.encode(RelayData{recipient, feeRecipient, relayFeeBPS})` (`RelayData` struct in `IEntrypoint.sol` [P]; the encoding of `data` is **[U]** until read in `Entrypoint.sol`, verify in build spike). Events: `Entrypoint.Deposited(address indexed _depositor, IPrivacyPool indexed _pool, uint256 _commitment, uint256 _amount)`; `PrivacyPool.Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)`; `Withdrawn`, `Ragequit` [P]. Errors include `MinimumDepositAmount`, `PrecommitmentAlreadyUsed`, `PoolIsDead`, `RelayFeeGreaterThanMax` [P].
- Deposits go **only through the Entrypoint** (README "Deposit processing (through Entrypoint only)" [P]); `msg.sender` at the Entrypoint is the depositor and the only address allowed to `ragequit` that label (README [P]). **Therefore the deposit must be sent by `S1` itself, and `S1`'s key must be retained until the note is exited or ragequit** (EP-VAULT-3).
- Pools have a `windDown()` and the owner can remove a pool / update the ASP root [P]: admin trust exists (upgradeable Entrypoint proxy, roles Owner and Postman [P]). Mitigation is ragequit, which does not need the ASP.
- Relayer reference implementation (Express+SQLite): `POST /relayer/quote {chainId, amount, asset, recipient}` returns `{baseFeeBPS, feeBPS, feeCommitment{expiration, withdrawalData, signedRelayerCommitment}}` valid ~20 s; `POST /relayer/request {chainId, scope, withdrawal{processooor,data}, proof{pi_a,pi_b,pi_c}, publicSignals, feeCommitment?}` returns `{success, txHash, timestamp, requestId}`; `GET /relayer/details?chainId&assetAddress` returns `{feeBPS, minWithdrawAmount, feeReceiverAddress, maxGasPrice}` [P: relayer README]. **API stability: unversioned, no semver release found [P/U]; the adapter MUST pin a schema and fail closed on unknown fields (EP-PP-8).**
- Reported fees/assets (vetting fee 0.5% on ETH/USDC, relayer fee max 10%, ETH/wBTC/USDC/USDT/DAI) come from one aggregator in the existing research doc [R: anonymization-research.md 5.1]; they are **[U]** and the adapter reads the real values from `Entrypoint.assetConfig(asset)` and `/relayer/details` instead.

### 3.2 Railgun — `Railgun-Community/wallet` and `engine`

- Licence **MIT** for `wallet` (repo LICENSE; `package.json` `"license": "MIT"`) and `engine` (`@railgun-community/engine` `9.6.0`, MIT) [P: raw.githubusercontent.com/Railgun-Community/{wallet,engine}/main/..., retrieved 2026-10-21].
- SDK `@railgun-community/wallet` `10.9.0`; README: "shield ERC-20 tokens and NFTs, manage shielded balances, transfer tokens privately, interact with any smart contract privately"; "Ethereum, Polygon and BNB Chain" (README text; `package.json` and `shared-models` also list Arbitrum) [P]. Deps: `ethers 6.14.3` (pinned via `resolutions`), `snarkjs`, `@railgun-community/engine`, `@railgun-community/shared-models` `^8.0.1`, GraphQL Mesh clients for quick-sync [P]. `postinstall` runs `node postinstall.js` [P]: **lifecycle script in a dependency; GhostPay installs it with `--ignore-scripts` and runs the script's effect explicitly (EP-SUP-3)**. Needs TypeScript `^4.9` in devDeps (irrelevant at runtime).
- Contract addresses from `Railgun-Community/shared-models` `network-config.ts` [P: raw.githubusercontent.com/Railgun-Community/shared-models/main/src/models/network-config.ts]: `NetworkName.EthereumSepolia = 'Ethereum_Sepolia'`; `RailgunProxyContract[EthereumSepolia] = 0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea`; `RelayAdaptContract[EthereumSepolia] = 0x7e3d929EbD5bDC84d02Bd3205c777578f33A214D`; Sepolia deployment block `5784866`; Sepolia WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`; Polygon Amoy also present; testnet flag `isTestnet` exists in config type [P]. **Base Sepolia: not listed in the fetched snippet (only the lines viewed; full file not audited) => [U], assume unsupported.** Whether PPOI (proof-of-innocence) nodes serve Sepolia and whether any testnet broadcaster is live: **[U]** (Q2).
- Mechanism and fees: shield into UTXO commitment tree, zk-SNARK transfers/unshields; 0.25% on-chain shield and 0.25% unshield fee, broadcaster fees extra, PPOI proofs required by some relayers/wallets [S2: search results quoting L2BEAT/guide, 2026-10-21; **[U]**, read on-chain `shieldFee`/`unshieldFee` from the proxy instead (EP-RG-4)]. Private Proofs of Innocence list providers publish indicators and users prove non-membership [S2; also research 5.2 [R]].
- Broadcasters: Waku p2p fee-market relayers (`waku-broadcaster-client-*` packages, **[U] names/versions**). An alternative **self-broadcast** unshield from a fresh funded address exists in the SDK but re-links gas funding (N3).
- 1-hour "unshield only to origin" delay after shield: single third-party source (xgram) **[U]**; the adapter treats any such delay as data from the SDK, not a constant.

### 3.3 Compare for GhostPay

| | Privacy Pools | Railgun |
|---|---|---|
| Entry from `S1` | `Entrypoint.deposit` (public tx) | `shield` into Railgun proxy (public tx, ERC-20 approve to proxy) |
| Exit | ZK withdraw to any `D` via relayer, **or** `ragequit` to `S1` | unshield to any `D` via broadcaster or self-broadcast |
| Amount hiding inside | partial withdrawals supported (new commitment remains) | full (notes) incl. private transfers |
| Compliance mechanism | ASP association set; ragequit escape | PPOI; fees on-chain |
| Escape if operator misbehaves | `ragequit` (depositor only, no ASP) [P] | funds remain spendable by viewing/spending keys (contracts permissionless to spend); PPOI may block UX, not custody **[U]** |
| Weight | snarkjs wasm circuits, small SDK | large engine, LevelDB/IndexedDB, quick-sync, GraphQL |
| Licence | Apache-2.0 | MIT |
| Testnet readiness (found) | scripts only, addresses **[U]** | Sepolia addresses in shared-models [P] |
| Stability signal | unversioned monorepo, SDK 1.5.0 | multi-year versions (wallet 10.9.0) |

### 3.4 Aztec Connect-era lessons (design inputs, not an integration)

- Aztec announced the wind-down of Aztec Connect on 2023-03-13; deposits disabled a week later; fee-free withdrawals for one year; sequencer stopped around 2024-03-21 to 2024-03-31 (sources disagree); afterwards withdrawals depend on community sequencers with a higher technical bar [S2: forum.aztec.network/t/aztec-connect-sunset/173 and news mirrors, search 2026-10-21; **exact dates [U]**]. The `AztecProtocol/aztec-connect` repo is marked deprecated [P: repo README, retrieved 2026-10-21]. A post-shutdown exploit report (~$2.1M) was in one undated Portuguese-language source **[U]**, not used.
- Lessons encoded as requirements: (a) a pool may be sunset by its operator, so each adapter declares `lifecycle: 'active' | 'deprecated' | 'sunset' | 'unknown'` and the planner refuses entry for non-`active` pools (EP-GEN-5); (b) every note MUST carry an **independent exit path not requiring the operator** (ragequit or self-proving withdraw) and the PoC MUST test it (EP-GEN-6); (c) the vault MUST store enough to rebuild the proof inputs offline (tree leaves cached/export) because indexers and sequencers can vanish (EP-VAULT-5); (d) GhostPay MUST warn the user at entry when the pool's only exit needs a live relayer or broadcaster; (e) never auto-migrate between pools.
- Aztec (new network, "Alpha", unaudited per its docs, per the research doc [R: 5.3]): different chain and wallet model; **EP-4 watch only**.

### 3.5 Others considered ("valid in 2026", status only)

- **Tornado-style fixed-denomination mixers (EP-3).** Immutable, no ASP, no relayer dependency beyond gas. Sanctions history: OFAC delisting 2025-03-21 and Fifth Circuit holding on immutable contracts, retrial of Roman Storm moved to 2027-04-26 [R: research section 12, S2]. No fresh primary check made. Upstream licence **[U]**. Deployment: a testnet instance operated by us would make GhostPay the pool *operator*, which the research doc rejects ("do not build an own pool", 5.4). Decision: **interface slot and ADR only; no code in PoC.** If the owner overrides, effort M.
- **Kohaku** (EF-led wallet SDK incl. Railgun, per research 5.x [R: S2 Cointelegraph/QuickNode]): track; adopting its SDK might replace the Railgun adapter's wiring. **[U]** maturity.
- **Other privacy pools/shielded apps** (e.g. Hinkal, Panther, zkBob, Umbra for stealth only): not verified in this run; **[U]**, listed only as candidates for the `PoolCandidate` evaluation checklist in section 12.4. Never add a pool without that checklist.
- **Non-EVM (Zcash, Monero, Liquid):** out of scope for this spec (research sections 6-8).

## 4. Fit with existing GhostPay code

- `S1` secret key derivation is in `packages/core-crypto` (`stealth.ts`, `keys.ts`, `SecretBytes` [R]); `packages/chain-adapters` provides `rpc.ts`, `sweep.ts` (EIP-712 sweep orders for `GhostPaySweepRelayer`), `config/chains.ts` (Sepolia and Base Sepolia enabled; mainnets `enabled: false` [R: README]), `erc20Abi`, `erc2612PermitAbi` [R]. Pools are used **instead of** the final sweep transfer; `GhostPayRouter` and contracts are **not changed** (the deposit is a plain call from `S1`).
- Because the pool's depositor must equal `S1`, the sweep relayer path (relayer calls on behalf of `S1`) cannot be used for Privacy Pools deposits unless `S1` signs the transaction itself. Gas for `S1` therefore needs: (a) user tops up `S1` with a small native amount (links funder, N3), (b) EIP-7702 sponsored batch from another spec (`payer-hiding.md` PH-3 delegate; open: it makes the *delegate* the caller in some designs, which would break `ragequit`-depositor identity: only valid if the delegate executes as `S1` itself, i.e. `msg.sender == S1` inside the batch, which EIP-7702 delegation provides [U: confirm in spike]). PoC ships (a) and the interface slot for (b).
- Chain config for pools lives in a **new pinned manifest** in the new package, never inferred from RPC or the SDK defaults (EP-GEN-3).
- Repo toolchain: Node `>=22`, ESM, `tsc` per package, `vitest`, `viem 2.57.7`, `@noble/*` `2.4.0` [R]. Both third-party SDKs bring their own `viem`/`ethers`/older `@noble` copies; adapters isolate them in separate packages loaded by dynamic `import()` (EP-SUP-2).

## 5. User-visible option

Setting `Sweep exit` with the radio: `Direct (no privacy)` / `Privacy Pools` / `Railgun` / `Mock pool (test)`; `Tornado-style` and `Aztec` shown disabled with "not available". For each route the UI renders, from `EXIT_ROUTE_INFO[id]`:

```ts
interface ExitRouteInfo {
  id: ExitRouteId;
  name: string;
  chains: readonly number[];              // from the pinned manifest only
  assets: readonly Address[];             // from adapter.supports()
  lifecycle: PoolLifecycle;
  maturity: 'production' | 'young' | 'alpha' | 'testnet-only' | 'test-double';
  feeDisclosure: FeeBreakdown | 'unknown'; // read on-chain/relayer; never hard-coded
  whatItHides: readonly string[];
  whatItDoesNotHide: readonly string[];    // must include N1..N6 keys applicable
  independentExit: 'ragequit' | 'self-broadcast' | 'none';
  needsLiveThirdParty: readonly ('relayer'|'broadcaster'|'indexer'|'asp'|'ppoi')[];
  auditStatus: 'none-found' | 'unknown' | { reportUrl: string; retrieved: string };
}
```

Flow (both pools): (1) select route, token, amount; (2) show plan with disclosure and N1-N6 acknowledgements (single checkbox, text varies by route); (3) **Enter** (sign deposit/shield from `S1`); (4) vault records note; (5) user waits, UI shows `earliestExit` heuristic **as advice only** (EP-UX-2); (6) **Exit** to destination `D` (fresh address derived by `core-crypto` or user supplied) with relayer/broadcaster selection; (7) **Emergency exit** button always visible for each note (EP-GEN-6).

Defaults: none selected; never auto-chosen; entry button disabled until acknowledgements are ticked and chain is on the allowlist.

## 6. Architecture, ownership, interfaces

### 6.1 New packages (the whole build; each `private`, `UNLICENSED`, ESM, same scripts as `packages/relayer-guard`)

| Dir | npm name | Owner of | Third-party deps |
|---|---|---|---|
| `packages/external-pools/` | `@ghostpay/external-pools` | interfaces, registry, pinned manifest loader, route planner, note vault (encrypted via `@ghostpay/secret-box`), recovery driver, exit-timing advisor, leakage linter, `mock-pool` adapter, shared test kit | `viem` only (peer, `2.57.7`); `@ghostpay/secret-box`, `@ghostpay/core-crypto` workspace |
| `packages/external-pools-privacypools/` | `@ghostpay/external-pools-privacypools` | `EP-1` adapter, ABI subset, relayer HTTP client with schema pin, ASP-set fetcher, circuit-hash pin | `@0xbow/privacy-pools-core-sdk@1.5.0` (exact), nothing else new |
| `packages/external-pools-railgun/` | `@ghostpay/external-pools-railgun` | `EP-2` adapter, engine bootstrap (storage, artifacts, quick-sync), shield/unshield wrappers, broadcaster client wrapper | `@railgun-community/wallet@10.9.0`, `@railgun-community/shared-models` (exact; versions to be re-verified at build time) |
| `packages/external-pools-tornado/` | (not created) | placeholder: only `docs/remote/adr/` text in section 12.3 | none |

Reason for three packages: both SDKs are heavy, carry their own `viem`/`ethers`/`snarkjs` copies and licences, and must be loaded lazily (EP-SUP-2). `packages/external-pools` has no third-party SDK import, so it can run in CI without network.

Directory layout (core): `src/{types.ts,registry.ts,manifest.ts,planner.ts,vault.ts,recovery.ts,timing.ts,linter.ts,errors.ts,index.ts}`, `src/adapters/mock/`, `src/testkit/`, `manifest/pools.testnet.json`, `README.md`, `DEVIATIONS.md`, `*.test.ts` colocated.

### 6.2 Core interfaces (`@ghostpay/external-pools`)

```ts
export type ExitRouteId = 'privacy-pools' | 'railgun' | 'tornado-fixed' | 'aztec' | 'mock-pool';
export type PoolLifecycle = 'active' | 'deprecated' | 'sunset' | 'unknown';

export interface RouteRequest {
  chainId: number; asset: Address | 'native'; amount: bigint;
  stealth: { address: Address; signer: StealthSigner };   // S1; secret never leaves signer
  destination: Address | 'derive-fresh';
  rootSeed: SecretBytes;                                   // vault/note key derivation input
}

export interface PoolNote {                // persisted ONLY encrypted in the vault
  readonly noteId: string;                 // hash(routeId, chainId, depositTxHash, logIndex)
  readonly routeId: ExitRouteId; readonly chainId: number;
  readonly asset: Address | 'native'; readonly depositedAmount: bigint;
  readonly depositor: Address;             // S1; MUST equal signer address
  readonly depositTx: Hex; readonly depositBlock: bigint;
  readonly state: 'pending' | 'confirmed' | 'exiting' | 'exited' | 'ragequit' | 'lost-sync';
  readonly adapterData: Uint8Array;        // opaque, versioned CBOR/JSON; includes tree leaves cache
  readonly createdAt: number;              // unix s, coarse (rounded to hour) to limit metadata
}

export interface PreparedTx { to: Address; data: Hex; value: bigint; chainId: number; description: string; }

export interface ExternalPoolAdapter {
  readonly id: ExitRouteId;
  readonly schema: number;                                      // adapter data version
  info(): ExitRouteInfo;
  health(): Promise<{ lifecycle: PoolLifecycle; reason?: string }>;
  supports(q: { chainId: number; asset: Address | 'native' }): Promise<SupportResult>;
  quoteEntry(r: RouteRequest): Promise<EntryQuote>;             // read-only; includes fee breakdown
  prepareEntry(r: RouteRequest, q: EntryQuote): Promise<PreparedTx[]>;  // unsigned; signed by S1 signer
  recordEntry(r: RouteRequest, receipt: TxReceiptLike): Promise<PoolNote>;
  quoteExit(n: PoolNote, o: ExitOptions): Promise<ExitQuote>;   // includes relayer/broadcaster fee, `destinationSeen`
  executeExit(n: PoolNote, q: ExitQuote, t: ExitTransport): Promise<ExitResult>;
  prepareEmergencyExit(n: PoolNote): Promise<PreparedTx[]>;     // ragequit / self-broadcast; operator-free
  recover(seed: SecretBytes, scan: ScanContext): AsyncIterable<PoolNote>;
}

export interface ExitTransport {     // injected, so tests never touch network
  fetch: typeof fetch;               // for relayer HTTP
  proxy?: { socks5?: string };       // network-privacy.md hook; adapters MUST use only this fetch
  now(): number;
}
```

Planner (`planner.ts`): `plan(req, route): RoutePlan` returns ordered steps (`approve?`, `deposit|shield`, `wait`, `exit`) + `warnings: Warning[]` from the linter (section 7 EP-LINT). `registry.ts`: `registerAdapter(a)`, `getAdapter(id)`; adapters are registered only if the manifest has an entry for the active chain.

Manifest schema (`manifest/pools.testnet.json`), validated by a zod-free hand validator (repo style [R: `deployments.ts` format checks]):
```json
{ "schema": 1, "retrieved": "2026-10-21", "pools": [
  { "route": "railgun", "chainId": 11155111, "contracts": { "proxy": "0xeCFC...3fea", "relayAdapt": "0x7e3d...214D" },
    "source": "https://raw.githubusercontent.com/Railgun-Community/shared-models/main/src/models/network-config.ts",
    "codeHash": "<keccak of runtime code, filled by build spike>", "deploymentBlock": 5784866 },
  { "route": "privacy-pools", "chainId": 11155111, "contracts": {"entrypoint": "<Q1>", "pools": {}},
    "codeHash": "<Q1>", "circuitSha256": {"withdraw.zkey": "2a893b42...6de677", "...": "..."} } ] }
```
Entries marked `<Q1>` stay empty until verified; an adapter with an empty entry is `lifecycle: 'unknown'` and the planner refuses to build entry txs.

### 6.3 Privacy Pools adapter specifics

- **Key material:** `ppMnemonic` = BIP-39 mnemonic derived from `rootSeed` by HKDF-SHA256 (info `"ghostpay/ext-pools/privacy-pools/v1"`, `@noble/hashes` 2.4.0 [R]) -> 128-bit entropy -> BIP-39 via `@scure/bip39` **[U: not in repo deps; add, or reuse noble]**. Separate from any wallet mnemonic (SDK README: do not reuse [P]). The mnemonic lives only in `SecretBytes`/vault memory.
- **Entry:** native: `Entrypoint.deposit(precommitment)` with `value`; ERC-20: `approve(Entrypoint, value)` (exact amount, never unlimited, EP-PP-3) then `deposit(asset, value, precommitment)`. `precommitment = Poseidon(nullifier, secret)` from `generateDepositSecrets(keys, scope, index)`; `scope` read from `Entrypoint.assetConfig(asset)` / pool `SCOPE()` **[U: getter name]** and compared with the manifest.
- **Min deposit / vetting fee:** read `assetConfig` (`minimumDepositAmount`, `vettingFeeBPS`, `maxRelayFeeBPS` [P: `registerPool` params]); the amount credited is `value - fee` and `recordEntry` MUST take the committed `_value` from the pool `Deposited` event, not from the request (EP-PP-4).
- **Exit:** wait for the label to appear in the ASP set (fetch ASP Merkle data from the ASP service **[U: endpoint/format; see Q3]**), build the withdraw proof with `sdk.proveWithdrawal`, verify it locally with `sdk.verifyWithdrawal`, call `GET /relayer/details`, `POST /relayer/quote {recipient}`, then `POST /relayer/request`. Self-relay option: `Entrypoint.relay` / `PrivacyPool.withdraw` from a fresh gas-funded address (links funding, N3).
- **Emergency exit:** `ragequit` from `S1` (public; destination is `S1`) — requires the retained `S1` key and the original label (EP-PP-7).
- **Partial exits:** supported by protocol (remaining commitment) [P]; PoC exits the full note only (non-goal G1) to avoid tracking change notes beyond what `AccountService` does.

### 6.4 Railgun adapter specifics

- **Engine bootstrap:** `startRailgunEngine(...)` with in-memory/IndexedDB store (browser) or LevelDB (Node), artifact getter that verifies SHA-256 of downloaded zkeys against the pinned manifest (EP-RG-3), `NetworkName.EthereumSepolia`, `isTestnet`. Exact function names are in the Railgun developer guide (https://railgun-privacy.gitbook.io/developer-guide/wallet) which was **not fetched**: names are **[U]**; the build spike's first task is to pin them from the installed package typings.
- **Entry (shield):** wallet derives a Railgun address from a mnemonic derived from `rootSeed` (separate HKDF info `"…/railgun/v1"`); `populateShield(...)` produces the tx **sent by `S1`** with ERC-20 `approve(RailgunProxy, amount)` first. Shield private key randomness MUST come from the CSPRNG in `core-crypto/rng.ts` or SDK default, never `Math.random`.
- **Exit (unshield):** `populateProvedUnshield` (**[U] name**) with broadcaster fee from the broadcaster client; PPOI proof required where the network enforces it (Sepolia **[U]**). Self-broadcast fallback documented and disabled unless user ticks N3 acknowledgement.
- **Emergency exit:** self-broadcast unshield to a chosen address from any gas-funded address (operator-free) (EP-RG-6). Test with the mock broadcaster absent.

### 6.5 Mock pool (`EP-M`)

In-repo `MockPoolAdapter` implementing the full interface over a deterministic in-memory ledger: commitment = `keccak(nullifier,secret,amount)`, "approval set" toggle (to simulate ASP exclusion), "relayer" that can be switched off (to simulate operator disappearance), "sunset" lifecycle switch. It performs no cryptographic privacy and the UI labels it `test-double`. It is the CI target for every non-network requirement.

## 7. Requirements

Numbering: `EP-<area>-<n>`. MUST/SHOULD are testable as stated.

### General
- **EP-GEN-1 (MUST)** Every adapter entry point rejects any `chainId` not in `{11155111, 84532, 31337}` with `ExternalPoolError('CHAIN_NOT_ALLOWED')` before any network call. Test: parametrised over all adapters and a mainnet id (`1`, `8453`, `100`).
- **EP-GEN-2 (MUST)** Adapters are constructed with an injected `ExitTransport`; no module in the three packages references global `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` or `process.env`-based URLs. Test: lint rule (`no-restricted-globals`) plus a runtime test that stubs globals to throw.
- **EP-GEN-3 (MUST)** Contract addresses, circuit hashes and relayer base URLs come only from the validated manifest; SDK defaults for addresses are overridden or asserted equal. Test: tamper manifest addresses => `MANIFEST_MISMATCH`; SDK default differs => throw.
- **EP-GEN-4 (MUST)** Before building entry transactions the adapter reads `eth_getCode` for each manifest contract and compares `keccak256(code)` with `codeHash` (empty or mismatch => refuse). Test with anvil: deploy mock bytecode, assert refusal on wrong hash.
- **EP-GEN-5 (MUST)** `planner.plan` refuses entry when `health().lifecycle !== 'active'`, with the reason text surfaced to the UI. Test with mock `sunset`.
- **EP-GEN-6 (MUST)** Every `PoolNote` has a working `prepareEmergencyExit` that needs no third-party operator (relayer/broadcaster/ASP). Test: with relayer offline, ASP set missing the label and indexer returning 500, the emergency exit still returns txs, and executing them on the mock/anvil returns funds (Privacy Pools: to `S1`; Railgun: to chosen address).
- **EP-GEN-7 (MUST)** No route is selected by default and none is ever auto-selected or switched; `plan` requires an explicit `routeId`. Test: planner called without route throws.
- **EP-GEN-8 (MUST)** Amounts are `bigint` end-to-end; any adapter result where `exitedAmount + fees != noteAmount` (within pool-defined rounding stated by the adapter) fails with `ACCOUNTING_MISMATCH`. Property test (fast-check) on mock.
- **EP-GEN-9 (SHOULD)** Adapters expose `info().auditStatus`; value `'unknown'` or `'none-found'` MUST render a visible warning (EP-UX-1).

### Vault and recovery
- **EP-VAULT-1 (MUST)** Notes and their secrets (nullifier/secret pairs, mnemonics, Railgun spending key) are stored only through `@ghostpay/secret-box` encryption (scrypt+AES-GCM per `keystore` precedent [R]) and are never written to logs, `localStorage` plaintext, error messages or URLs. Test: canary-secret scan over log sinks and serialised errors.
- **EP-VAULT-2 (MUST)** `recover(rootSeed)` rebuilds all notes from chain data only (no GhostPay server) in a test where the vault is deleted: mock pool, Privacy Pools (anvil deployment), Railgun (engine rescan on anvil/Hardhat network if feasible; else documented `lost-sync` fallback). Expected: same `noteId`s.
- **EP-VAULT-3 (MUST)** For routes whose emergency exit is bound to the depositor address (Privacy Pools), the vault MUST persist the `S1` signer reference (or derivation index) and refuse to delete or rotate it while any note on that depositor is not `exited`/`ragequit`. Test: attempt to purge `S1` with live note => `KEY_REQUIRED_FOR_NOTE`.
- **EP-VAULT-4 (MUST)** Indexer scope: if any pool scan reports an error the scope is `incomplete` (SDK README semantics for `AccountService` [P]); deposits are blocked for that scope until resolved. Test: inject one failing pool => new deposit refused (prevents index reuse bug described in the SDK README).
- **EP-VAULT-5 (SHOULD)** Notes cache the Merkle leaves/ASP set needed to rebuild a proof offline, with export/import (JSON, encrypted). Test: block indexer, still produce a withdrawal proof on mock/Privacy Pools anvil.
- **EP-VAULT-6 (MUST)** `createdAt` is rounded to hour; no precise timestamps persisted besides chain-derived block numbers.

### Privacy Pools adapter
- **EP-PP-1 (MUST)** `prepareEntry` sets the transaction `from`/signer to the stealth address `S1` and asserts `note.depositor == S1`; deposits from any other signer rejected. Test.
- **EP-PP-2 (MUST)** `precommitment` uniqueness: if `Entrypoint.usedPrecommitments(p)` (view in `IEntrypoint` [P]) returns true, increment index and retry up to 3, then fail. Test with anvil fork/mock.
- **EP-PP-3 (MUST)** ERC-20 approval is exactly `value` to the Entrypoint, reset to 0 after deposit if allowance remains. Test on anvil with USDC-like token.
- **EP-PP-4 (MUST)** `recordEntry` takes amounts from the `Deposited` log (pool) and `label` for the note; reorg-safe (waits 2 confirmations on testnets; configurable). Test.
- **EP-PP-5 (MUST)** Withdraw proofs are verified locally via `sdk.verifyWithdrawal` before any network submission. Test: corrupt proof => no HTTP call.
- **EP-PP-6 (MUST)** Circuit artifacts used equal the pinned SHA-256 list in the manifest (independently of the SDK's own list). Test: modify one byte => `ARTIFACT_HASH_MISMATCH`.
- **EP-PP-7 (MUST)** `prepareEmergencyExit` builds `PrivacyPool.ragequit(RagequitProof)` for the note's pool; test on anvil with ASP set excluding the label: ragequit succeeds, withdraw is impossible.
- **EP-PP-8 (MUST)** Relayer client validates request/response shapes with a hand-written strict parser (unknown top-level fields => `RELAYER_SCHEMA_DRIFT`); verifies the quote `feeBPS <= maxRelayFeeBPS` from `assetConfig`, `expiration` not past, and that `withdrawalData` decodes to `recipient == D`, `feeRecipient` as quoted (the relayer must not be able to substitute the recipient). Test with a malicious relayer stub.
- **EP-PP-9 (SHOULD)** Selection among multiple relayers in manifest by lowest fee, but only from the manifest list; custom URL requires explicit developer flag `allowCustomRelayer` (default false).
- **EP-PP-10 (MUST)** `ppMnemonic` is derived with HKDF per section 6.3 and zeroised after use; never equals/derives from wallet seed directly. Test vectors: fixed `rootSeed` => fixed first `precommitment`; different info string => different.

### Railgun adapter
- **EP-RG-1 (MUST)** Engine runs in a worker/isolated module; storage is encrypted at rest by the vault key or in-memory only. Test: no plaintext spending key in storage mock.
- **EP-RG-2 (MUST)** Shield tx `to == manifest.proxy` and token `approve` spender equals the same address, exact amount. Test.
- **EP-RG-3 (MUST)** zkey/vkey artifacts fetched by the SDK are SHA-256 verified against manifest values before use (artifact getter wrapper). Test: tamper.
- **EP-RG-4 (MUST)** Shield/unshield fee is read from the proxy (`shieldFee()`/`unshieldFee()` **[U names]**) and displayed; plan rejects if fee > `maxFeeBps` option (default 100 bps). Test with mock contract.
- **EP-RG-5 (MUST)** Unshield through a broadcaster requires that the broadcaster-supplied fee token and amount are within user `maxBroadcasterFeeBps` (default 100) and that the destination in the signed tx equals `D`. Test with hostile broadcaster stub.
- **EP-RG-6 (MUST)** Self-broadcast unshield path exists, is gated behind the N3 acknowledgement, and is exercised in test on a local chain (Hardhat network config `31337` exists in shared-models [P]).
- **EP-RG-7 (SHOULD)** PPOI handling: if the network has PPOI enabled the adapter surfaces `ppoiStatus: 'pending'|'valid'|'blocked'` and does not hide `blocked` (user sees why exit is delayed). Test with stub POI node.

### Supply chain and licence
- **EP-SUP-1 (MUST)** `THIRD_PARTY.md` generator covers new packages with exact versions and licences (Apache-2.0 for Privacy Pools SDK, MIT for Railgun; transitive licences captured); fail CI on GPL/AGPL in the transitive closure. [R: existing `THIRD_PARTY.md`.]
- **EP-SUP-2 (MUST)** Third-party SDK imports happen only via dynamic `import()` inside the adapter packages; `apps/web` bundle for default route (`EP-0`) MUST NOT include them (bundle test checks size/identifiers). A second `viem`/`ethers`/`@noble` copy is allowed only inside these packages and recorded in `DEVIATIONS.md` (cf. S3-24 two-noble-majors finding [R: modules-needed #10]).
- **EP-SUP-3 (MUST)** Install with `--ignore-scripts` for these packages in CI; `@railgun-community/wallet` `postinstall.js` is read and its effect replicated explicitly or documented. Test: CI step.
- **EP-SUP-4 (MUST)** Exact versions (no ranges) for the two SDKs; lockfile review required to bump. Test: script asserts exact-pin.
- **EP-SUP-5 (SHOULD)** Run `npm audit signatures` / provenance check on both SDK tarballs if provenance is published **[U]**.

### UI/UX (spec for the later app edit)
- **EP-UX-1 (MUST)** Route selector shows `whatItDoesNotHide` and `auditStatus` and requires an acknowledgement before enabling Enter.
- **EP-UX-2 (SHOULD)** Exit timing advisor `timing.ts` suggests waiting until at least `N` other same-asset deposits have occurred in the pool since the note's deposit and a minimum elapsed time (defaults: 20 deposits, 24 h, configurable); presented as advice, not a guarantee, and never blocking emergency exit.
- **EP-UX-3 (MUST)** No numeric anonymity score is shown unless a measured number from a public-data script exists (research gap D-13 [R]); PoC shows only "observed same-asset deposits since yours: N".
- **EP-UX-4 (MUST)** Amount-linkage warning (EP-LINT-1) displays before Exit.

### Linter
- **EP-LINT-1 (MUST)** `linter.ts` flags: exit amount equals deposit amount within 1%; elapsed < `minDelay`; destination previously interacted with `S1` or `W` (supplied history); destination address equals any known GhostPay address; reuse of one `D` for multiple notes. Outputs `Warning{code,severity}`. Test: table-driven.

### Integration with sweep
- **EP-INT-1 (MUST)** `RoutePlan` for `EP-0` equals today's behaviour (control) and is unchanged by installing the packages. Test: planner snapshot.
- **EP-INT-2 (SHOULD)** Provide `toSweepOrder` adapter: after Exit lands at `D`, subsequent policy/sweep flows treat `D` as a normal address; no GhostPay on-chain contract references the pool. (Documentation only.)

## 8. Trust and verifiability summary (per route)

| Question | Privacy Pools | Railgun |
|---|---|---|
| What GhostPay verifies itself | code hash of manifest contracts (EP-GEN-4); circuit hashes (EP-PP-6); local proof verify (EP-PP-5); relayer recipient (EP-PP-8); amounts from logs | code hash; zkey hashes (EP-RG-3); fee bounds (EP-RG-4/5); destination in tx |
| What it cannot verify | ASP honesty; circuit soundness/trusted setup; upgrade-proxy admin; relayer logging | PPOI list provider behaviour; circuit soundness; broadcaster logging; contract admin |
| Operator disappears | ragequit to `S1` (needs `S1` key) | self-broadcast unshield |
| Operator turns hostile | admin could remove pool/ASP root: ragequit; proxy upgrade risk is real **[U audit]** | contracts upgradeable by Railgun governance **[U]** |
| API stability | relayer API unversioned: strict parser, fail closed | SDK major versions frequent; exact pin, adapter tests per bump |
| Licence | Apache-2.0 (patent grant, NOTICE retention) | MIT |

## 9. Test plan

1. **Unit (CI, offline):** all EP-GEN, EP-VAULT, EP-LINT, EP-INT on `MockPoolAdapter`; fast-check for accounting and vault round-trip; hostile relayer/broadcaster stubs.
2. **Contract-level (anvil, CI-optional):** deploy upstream Privacy Pools contracts from a pinned commit into anvil (needs Foundry + pinned `forge` build in a throwaway dir outside the repo; `forge`-built artifacts not committed). Cover EP-PP-1..4, 7, deposit/withdraw/ragequit with the real SDK and real circuits (slow; nightly). Commit hash pin = Q1.
3. **Railgun (Sepolia or Hardhat-network):** nightly manual job against Sepolia manifest entry once Q2 resolved; otherwise `skipped` with logged reason. No mocks claimed as proof of integration.
4. **Bundle/supply-chain:** EP-SUP-1..4 in CI script.
5. **Network-egress test:** with transport spy, assert only manifest relayer/broadcaster hosts are contacted (EP-GEN-2/3).
6. **Leakage measurement script (not CI):** `scripts/measure-pool-crowd.ts` counts same-asset deposits per day from public logs of the chosen pool on the chosen testnet; output Markdown table; satisfies the research doc's "measure before claiming" (D-13).
7. **Manual PoC runbook:** `docs/remote/privacy-specs/external-pools-runbook.md` (written by the build agent) with screenshots of the three steps and the emergency exit.

## 10. PoC acceptance criteria

- A1: with `MockPoolAdapter`, a stealth payment on anvil can be entered, aged, exited to a fresh `D`, and recovered after deleting the vault; emergency exit works with relayer offline. (Required.)
- A2: Privacy Pools: on anvil (and Sepolia iff Q1 resolves) deposit from `S1`, withdraw to `D` via the reference relayer (run locally from the upstream package), and `ragequit` for a non-approved deposit. Real proofs verified. (Required on anvil.)
- A3: Railgun: shield from `S1` and unshield to `D` on the Sepolia network from the pinned manifest, or documented blocked status with evidence of what was missing. (Required: attempt; success if infrastructure exists.)
- A4: UI/CLI shows the table from `EXIT_ROUTE_INFO` with N1-N6 text; default route is `EP-0`.
- A5: All MUST requirements above pass; every `[U]` item touched by the build is converted to `[P]` or recorded in `DEVIATIONS.md`.
- A6: No route usable on a non-allowlisted chain (EP-GEN-1).

## 11. Edits to existing code (separate; NOT part of the PoC package build)

1. `apps/web`: route selector UI, vault wiring, acknowledgement text (`apps/web/src/lib/sweep.ts` is the integration point [R: modules-needed #4]). Another contributor owns web edits.
2. `packages/chain-adapters/src/config/chains.ts`: optionally add a typed `externalPools` capability flag per chain (no address data; data stays in the manifest).
3. Root `package.json` workspaces already glob `packages/*` [R]; no change needed. Root `THIRD_PARTY.md` generator may need the exceptions in EP-SUP-1.
4. `docs/user/privacy-limits.md`: add pool-exit section copied from section 2.
5. CI: add `--ignore-scripts` install job and the exact-pin check script (`scripts/`).

## 12. Effort, risks, open questions

### 12.1 Effort
- `external-pools` core + mock + vault + linter: **M**.
- Privacy Pools adapter incl. anvil deployment harness: **M** (L if testnet infra unavailable and ASP service must be mocked).
- Railgun adapter: **M-L** (engine bootstrap, storage, broadcaster, artifacts; API names unverified).
- Tornado/Aztec: **S** (docs only). Total PoC: **L**.

### 12.2 Risks
- R1: Privacy Pools has no known public Sepolia deployment/ASP service (Q1). Mitigation: self-deployed anvil stack; ASP root posted by a local test script (we then play ASP in tests, which is acceptable only locally).
- R2: Railgun testnet infra (POI, broadcasters) may be dead; contracts exist in shared-models [P] but liveness [U].
- R3: Unversioned/changing third-party APIs (Privacy Pools relayer, Railgun SDK majors). Mitigation: exact pins, strict parsers, drift tests.
- R4: Bundle weight and dependency duplication (EP-SUP-2).
- R5: Stealth key retention (EP-VAULT-3) conflicts with any "rotate and forget" hygiene (`hygiene.md`): resolve in vault policy.
- R6: Users misread the pool as strong anonymity (N2); mitigated by EP-UX-3.
- R7: Third-party contract/circuit bugs or admin actions. Not mitigable by GhostPay except ragequit/self-broadcast.
- R8: Aztec-Connect-style sunset (section 3.4).
- R9: Linking through the gas-funding of `S1` (N3) undermines the whole exit if ignored.

### 12.3 ADR text for EP-3 (Tornado-style), to be filed at `docs/adr/` by the owner
"Not built. Would make GhostPay the operator of a pool (own deployment) or depend on a sanctions-sensitive deployment. Revisit only after the owner's legal review; keep `ExternalPoolAdapter` generic enough to add it."

### 12.4 Candidate-pool checklist (for any new adapter)
Licence compatible; source verified; audit report URL + date; contract admin/upgrade model; independent exit path without operator; live testnet deployment with addresses in primary docs; API versioning; maintained release in last 12 months; bundle size; transitive licence scan; written N1-N6 equivalents.

### 12.5 Open questions
- **Q1** Are Privacy Pools Entrypoint/pool contracts deployed on Sepolia (or Base Sepolia) and where is the ASP root service and relayer? Which commit hash is the audited/deployed one and where are the audit reports (`audit/` directory not readable here)? Pin before build.
- **Q2** Does Railgun Sepolia have working PPOI nodes and Waku broadcasters? What are the exact SDK function names for engine start, `populateShield`, unshield? (Developer guide not fetched.)
- **Q3** Exact ASP data endpoint and format used by the official frontend for association-set membership; where `Withdrawal.data` encoding is defined (`Entrypoint.sol` not read).
- **Q4** Does EIP-7702 sponsored deposit preserve `msg.sender == S1` at the Entrypoint (needed for ragequit)? Resolve in the payer-hiding spike (Q1/Q2 there).
- **Q5** Do pools pay out to a destination contract/EOA with any restrictions (e.g. sanctions oracles, blocklists) on testnet? **[U]**
- **Q6** Owner decision on `EP-3` and on adding more pools (section 12.4).

## 13. Non-goals
G1 Partial withdrawals / private in-pool transfers beyond what the SDK gives for free. G2 Cross-pool migration. G3 Any GhostPay-operated relayer/broadcaster/ASP/pool, any fee on these steps (research rec. [R: anonymization-research.md summary item 3]). G4 Mainnet.

## 14. Legal (deferred by owner, noted once)
Pool use, relayers and mixing-adjacent features carry jurisdiction-dependent legal risk (research section 12 [R]). Per owner instruction this does not block the testnet PoC; revisit before any non-testnet release.

## 15. Sources (all retrieved 2026-10-21)

[P]
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/README.md
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/LICENSE
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/sdk/README.md
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/sdk/package.json
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/relayer/README.md
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/contracts/README.md
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/contracts/src/interfaces/IEntrypoint.sol
- https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/contracts/src/interfaces/IPrivacyPool.sol
- https://raw.githubusercontent.com/Railgun-Community/wallet/main/{README.md,package.json,LICENSE}
- https://raw.githubusercontent.com/Railgun-Community/engine/main/{package.json,LICENSE}
- https://raw.githubusercontent.com/Railgun-Community/shared-models/main/src/models/network-config.ts
- https://raw.githubusercontent.com/AztecProtocol/aztec-connect/master/README.md

[S2] (search results, not fetched)
- https://forum.aztec.network/t/aztec-connect-sunset/173
- https://tokeninsight.com/en/news/aztec-network-announces-sunset-of-aztec-connect
- https://www.theblock.co/post/348959 ; https://www.theblock.co/post/359715 ; https://www.theblock.co/amp/post/379395
- https://l2beat.com/privacy/projects/railgun ; https://ethereum.org/developers/tools/railgun-wallet-sdk/
- Not reachable from sandbox: https://docs.privacypools.com/ (DNS), GitHub REST API (proxy 403), `audit/` directory contents.

Internal: `docs/remote/anonymization-research.md` (5.1-5.4, 10, 12), `docs/remote/modules-needed.md`, `docs/remote/privacy-specs/payer-hiding.md`.
