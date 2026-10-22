# Additional EVM chains (config-only port, research)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-evm-extra` (does not exist yet).
**Network access during research:** only `raw.githubusercontent.com` and `registry.npmjs.org` were reachable. All JSON-RPC endpoints, block explorers, docs sites (docs.linea.build, docs.zksync.io, docs.mantle.xyz, docs.blast.io, docs.soniclabs.com, docs.celo.org, ...) were blocked. Whether the canonical announcer exists on a given chain is therefore **unverified, verifier script to run later** (design in section 5). Chain ids, names, native currencies and explorers come from `ethereum-lists/chains` raw JSON only.

## 1. Verdict

**Feasible, size S per chain for config-only chains, M for zkSync Era.** `docs/MULTICHAIN_SPEC.md` section 2 already defines the gate: canonical announcer verified (or deployed with the ERC salt), router and sweep relayer deployed from the same bytecode with a manifest, token allowlist, permit matrix, Chainlink feeds, getLogs profile. Scheme, adapter fit and fee capability are identical to Tier 1: scheme 1 via `packages/core-crypto` unchanged, `createEvmAdapter` in `packages/chain-adapters/src/adapter.ts` unchanged, `FeeCapability` = checkout `enforced` (25 bps), gas sponsorship `enforced` for ERC-2612 tokens, flat security `enforced` once the factory is deployed. **Exceptions:** zkSync Era (address derivation and bytecode model differ, section 3, treat as non-config) and chains where the project-wide EVM target `cancun` (`docs/CONTRACTS_SPEC.md`) is not supported (section 4).

Recommended order (lowest risk first, all unverified for the announcer): Linea, Scroll, Mantle, Celo, Sonic, Blast, then Taiko/Mode/Unichain/Berachain/Zora. zkSync Era last.

## 2. Verified chain table (from ethereum-lists/chains, retrieved 2026-10-21)

| Chain | chainId | Native | Explorer (from list) | List `status` |
|---|---|---|---|---|
| Linea | 59144 | ETH | lineascan.build | active |
| Scroll | 534352 | ETH | scrollscan.com | active |
| zkSync Era | 324 | ETH | explorer.zksync.io | not set |
| Mantle | 5000 | MNT | mantlescan.xyz | not set |
| Blast | 81457 | ETH | blastscan.io | active |
| Sonic | 146 | S | sonicscan.org | not set |
| Celo | 42220 | CELO | celoscan.io | not set |
| Taiko | 167000 | ETH | taikoscan.io | active |
| Mode | 34443 | ETH | explorer.mode.network | not set |
| Zora | 7777777 | ETH | explorer.zora.energy | not set |
| Unichain | 130 | ETH | uniscan.xyz | not set |
| Berachain | 80094 | BERA | berascan.com | not set |

Testnets (same source):

| Testnet | chainId | Native | Faucet/RPC | Note |
|---|---|---|---|---|
| Linea Sepolia | 59141 | ETH | not checked | active |
| Scroll Sepolia | 534351 | ETH | not checked | active |
| zkSync Sepolia | 300 | ETH | not checked | |
| Mantle Sepolia | 5003 | MNT | not checked | |
| Blast Sepolia | 168587773 | ETH | not checked | |
| Sonic Testnet | 14601 | S | not checked | list name "Sonic Testnet" |
| Sonic Blaze Testnet | 57054 | S | not checked | older Sonic test network, may be superseded: **check before use** |
| Celo Sepolia | 11142220 | CELO | not checked | list marks it L2 type; Alfajores (44787) is `deprecated` in the list, do not use |
| Taiko Hoodi | 167013 | ETH | not checked | active; Taiko Hekla (167009) is `deprecated`, do not use |
| Mode Testnet | 919 | ETH | not checked | |
| Zora Sepolia | 999999999 | ETH | not checked | |
| Unichain Sepolia | 1301 | ETH | not checked | |
| Berachain Bepolia | 80069 | BERA | not checked | |

Native decimals are 18 on all of them per the list, matching `ChainConfig.nativeDecimals: 18`. Existing `CHAINS` in `packages/chain-adapters/src/config/chains.ts` has no entry for any of these.

Not included (cannot verify more than chain id, left out on purpose): Polygon zkEVM, Metis, Fantom (superseded by Sonic id 146), opBNB, Manta, Cronos.

## 3. zkSync Era: not config-only (verified from matter-labs/era-contracts, `main`)

- **CREATE2 address derivation is different.** `ContractDeployer.getNewAddressCreate2` computes `keccak256(CREATE2_PREFIX || bytes32(sender) || salt || bytecodeHash || keccak256(constructorInput))` and takes the low 20 bytes, with `CREATE2_PREFIX = 0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494` (= `keccak256("zksyncCreate2")`). The input is the zkSync **bytecode hash** (EraVM bytecode, not the EVM initcode hash) and the constructor input. The EVM formula `keccak256(0xff || deployer || salt || keccak256(initcode))` does not apply. Source comment states no collision with Ethereum CREATE2 since the prefix differs.
- **The Arachnid deployer `0x4e59...956C` is not available by the standard replay.** Its pre-signed legacy transaction targets the EVM; whether it can run on zkSync Era is **unverified** (and likely not). Consequence: `0x55649E01B5Df198D18D95b5cc5051630cfD45564` cannot be assumed or reproduced by the ERC salt on zkSync Era. A zkSync-specific announcer address would be a different address and must be recorded as non-canonical in the manifest.
- **A native CREATE2 factory exists** at `L2_CREATE2_FACTORY = USER_CONTRACTS_OFFSET` (`MAX_SYSTEM_CONTRACT_ADDRESS + 1`) per `Constants.sol`; ABI `create2(bytes32 salt, bytes32 bytecodeHash, bytes input)` (`ICreate2Factory.sol`). The numeric value of the offset was not resolved here (**unverified**, read it at implementation time).
- **EVM bytecode mode:** `ContractDeployer` also has `create2EVM`/`createEVM` with the EVM formula (prefix `0xff`, constant `CREATE2_EVM_PREFIX`) but these are gated by `allowedBytecodeTypesToDeploy == EraVmAndEVM` (source reads `EVMEmulationNotSupported` otherwise). Whether the gate is open on the mainnet chain 324 is **unverified**; do not rely on it.
- **Bytecode:** Solidity must be compiled with zksolc, producing different bytecode and different hashes. `bytecodeHashes` in the deployment manifest would mean the zksolc hash, not `keccak256(runtime)`. The existing manifest validator and the "immutable-aware comparison" open item (`docs/DEPLOYMENT_MANIFEST.md` section 1) do not cover this.
- **Other differences (from memory, unverified):** native account abstraction, fee-token paymasters, `selfdestruct` unsupported, EraVM opcode/precompile gaps. Any contract in `packages/contracts` that uses assembly or `CREATE2` (Policy account clone factory, EIP-1167) needs separate review.
- **Verdict for zkSync Era:** deferred; do not list as config-only. Needs an ADR, a zksolc build profile, and a separate audit scope. Effort L.

## 4. Per-chain caveats

Columns: announcer = canonical ERC-5564 announcer present at `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (ERC text on raw ethereum/ERCs confirms the address and the deployment method: CREATE2 via `0x4e59b44847b379578588920cA78FbF26c0B4956C` with salt `0xd0103a290d760f027c9ca72675f5121d725397fb2f618f05b6c44958b25b4447`). Deployer = Arachnid deterministic deployer at the address above. Both are **unverified, verifier script to run later** on every chain unless stated.

| Chain | Announcer | Arachnid deployer | EVM version / opcode caveat | getLogs cap |
|---|---|---|---|---|
| Linea (59144) | unverified | unverified | Linea has lagged mainnet forks historically; the fork supported today (PUSH0 / Cancun) is **unverified** (docs blocked). Compile at `paris` for the first deploy unless the verifier proves otherwise. | unverified, provider specific |
| Scroll (534352) | unverified | unverified | **Verified from scroll-documentation:** sequencer adopted "most features from London, Shanghai, and Cancun"; `BLOBHASH`/`BLOBBASEFEE` and EIP-4788 not available; `SELFDESTRUCT` disabled (reverts); RIPEMD-160, blake2f, point evaluation precompiles unsupported; modexp and ecPairing restricted; `COINBASE` returns the fee vault. GhostPay contracts do not use these, but `cancun` as a compile target needs a test (TSTORE/MCOPY presence not stated in the page: **unverified**). Policy: avoid blob/4788/selfdestruct. | unverified |
| zkSync Era (324) | cannot be canonical (section 3) | cannot be assumed (section 3) | non-EVM bytecode model (section 3) | unverified |
| Mantle (5000) | unverified | unverified | PUSH0/Cancun support unverified. Native token is MNT (not ETH): gas buffer math must use MNT and a MNT/token price feed. | unverified |
| Blast (81457) | unverified | unverified | OP-stack-derived (list marks L2); fork level unverified. **Rebasing native ETH/USDB/WETH** on Blast are yield-bearing: the router's exact balance-delta check (`CONTRACTS_SPEC.md` section 1) would reject rebasing tokens, which is intended; do not allowlist USDB/WETH without a test. Native yield and gas-yield features are not used by GhostPay. | unverified |
| Sonic (146) | unverified | unverified | Native token S. EVM fork level unverified. Very fast finality is advertised by the chain but the real finality depth for the scanner is unverified; use conservative `finalityDepth`. | unverified |
| Celo (42220) | unverified | unverified | Celo is an L2 per the ethereum-lists entry for the Celo Sepolia testnet (`parent.type` L2); the mainnet entry (L2 type) also exists. Native CELO is also an ERC-20-like token at an address (duality: **unverified**); fee payment in whitelisted ERC-20s (fee abstraction) is a Celo feature that may change gas math; gas token for the buffer should be the native CELO only. | unverified |
| Taiko (167000) | unverified | unverified | Based rollup; block times and finality (proof/prove window) are unverified. Use a long reorg/finality depth. | unverified |
| Mode (34443) | unverified | unverified | OP-stack family (unverified). | unverified |
| Zora (7777777) | unverified | unverified | OP-stack family (unverified); network may be winding down or changed: **status unverified**, confirm before any work. | unverified |
| Unichain (130) | unverified | unverified | OP-stack family (unverified). | unverified |
| Berachain (80094) | unverified | unverified | Native BERA; proof-of-liquidity chain; EVM version unverified. | unverified |

General notes valid for all rows:
- If the announcer is missing, deploy the CC0 reference `ERC5564Announcer` through the Arachnid deployer with the ERC salt and verify the resulting address equals `0x5564...5564` before use (`docs/CONTRACTS_SPEC.md`). That only works if (a) the Arachnid deployer exists on that chain and (b) the **same initcode and compiler settings** as the ERC are used. The ERC text does not give the initcode hash; take the creation bytecode from the chain where it is already deployed (Ethereum mainnet) at implementation time. If the deployer is missing, the pre-signed deployment transaction (non-EIP-155) may be rejected by chains that enforce replay protection: do not fund-and-hope; mark the chain `announcer: "non-canonical"` and use a chain-specific address with a signed note in the manifest.
- `getLogsMaxRange` in `ChainConfig` is a conservative default (1000) and is not provider-verified anywhere in the repo. For each chain, the verifier measures the real cap (binary search on a known-event range) and records it (section 5), per provider.
- `eth_getLogs` against the announcer is the scanner's only chain read, so the range cap and provider retention window (some free RPCs prune old logs) determine rescan feasibility. Record `earliestLogBlock`.
- The Cancun target in `CONTRACTS_SPEC.md` (`evm cancun`) means a separate build with `evm_version = "paris"` for any chain that fails the verifier's opcode probe (section 5). That is a build profile, not a contract change, but the resulting bytecode differs from Cancun builds, so the deployment manifest must include `evmVersion` and `bytecodeHashes` for the actual compile settings. **The manifest schema has no `evmVersion` field today.**
- Gas token: ETH on Linea, Scroll, Blast, Taiko, Mode, Zora, Unichain; MNT on Mantle; S on Sonic; CELO on Celo; BERA on Berachain. The gas buffer (`payERC20WithBuffer`) and the quote engine must price the native token per chain (Chainlink feed availability on each chain: **unverified**).

## 5. Typed manifest and verifier script design (`packages/chain-evm-extra`)

### 5.1 Chain entry (source of truth: `src/chains.ts`, mirrors `ChainConfig`)

```ts
export interface ExtraChainEntry {
  readonly chainId: number;                  // from ethereum-lists, checked at build against the raw JSON (hash recorded)
  readonly slug: string;                     // ethereum-lists shortName
  readonly name: string;
  readonly testnet: boolean;
  readonly nativeSymbol: string;             // 'ETH' | 'MNT' | 'S' | 'CELO' | 'BERA'
  readonly nativeDecimals: 18;
  readonly enabled: false;                   // typed literal false in this package; enabling happens only via a reviewed manifest
  readonly listSource: {                     // provenance
    readonly url: string;                    // raw ethereum-lists URL
    readonly retrieved: string;              // RFC 3339 date
    readonly sha256: string;                 // of the fetched JSON
    readonly status?: 'active' | 'deprecated' | 'incubating';
  };
  readonly finalityDepth: number;
  readonly getLogsMaxRange: number;          // measured value, falls back to conservative default 1000
  readonly blockTimeMs: number;
  readonly evmTarget: 'cancun' | 'shanghai' | 'paris' | 'unknown';  // from the opcode probe
  readonly bytecodeModel: 'evm' | 'eravm';   // 'eravm' => excluded from CHAINS automatically
}
```

### 5.2 Verification record (output of the verifier; one JSON per chain, `verification/<chainId>.json`, max 16 KiB like deployments)

```ts
export interface VerificationRecord {
  readonly chainId: number;
  readonly checkedAt: string;                // RFC 3339
  readonly rpcProviders: readonly { name: string; urlHost: string }[];  // host only; no API keys stored
  readonly announcer: {
    readonly address: '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
    readonly present: boolean;
    readonly runtimeCodeHash: string | null; // keccak256 of eth_getCode
    readonly matchesReference: boolean | null;  // vs reference hash taken from Ethereum mainnet at run time
  };
  readonly create2Deployer: {
    readonly address: '0x4e59b44847b379578588920cA78FbF26c0B4956C';
    readonly present: boolean;
    readonly runtimeCodeHash: string | null;
    readonly matchesReference: boolean | null;
  };
  readonly evmProbe: {                       // runtime opcode probe via eth_call with state override or a throwaway probe contract call
    readonly push0: boolean;
    readonly mcopy: boolean;
    readonly tstore: boolean;
    readonly selected: 'cancun' | 'shanghai' | 'paris' | 'unknown';
  };
  readonly getLogs: {
    readonly measuredMaxRange: number | null;
    readonly provider: string;
    readonly earliestLogBlock: string | null;  // decimal string
  };
  readonly finalityBlocks: number | null;
  readonly result: 'ok' | 'announcer_missing' | 'deployer_missing' | 'mismatch' | 'rpc_error' | 'unverified';
  readonly notes: readonly string[];
}
```

### 5.3 Script

`packages/chain-evm-extra/scripts/verify-chain.mjs --chain <id> --rpc <url> [--rpc <url> ...] --out verification/<id>.json`

Rules:
1. Read-only. Uses only `eth_chainId`, `eth_getCode`, `eth_getLogs`, `eth_blockNumber`, `eth_getBlockByNumber` and `eth_call`. Never sends a transaction. No private key accepted by any flag.
2. `eth_chainId` must equal `--chain`; mismatch aborts with `CHAIN_MISMATCH`.
3. Needs at least two independent RPC hosts to set `result: 'ok'` (mirrors `requestWithFallbackCheck`). One host yields `result: 'unverified'`.
4. Reference code: fetch `eth_getCode` for the announcer and the Arachnid deployer from Ethereum mainnet on a provider named explicitly with `--reference-rpc`; compare hash. No hard-coded hash is claimed by this document.
5. EVM probe: a pre-built, tiny runtime contract supplied through `eth_call` state override (if the provider supports overrides; otherwise `unverified`) executing PUSH0, MCOPY, TSTORE in separate calls; success maps to `evmProbe`.
6. getLogs: pick the announcer on the reference chain's known event range only as a sanity case; on the target chain, query `[latest-N, latest]` with N doubling until the node returns an error or a cap, then binary search for the largest accepted range; handle provider-specific error messages by checking error codes, not text.
7. Output is deterministic and written atomically; the script refuses to overwrite an existing `ok` record without `--force`.
8. A CI job `npm run verify:records` validates every `verification/*.json` against a JSON schema and fails if a chain in `ExtraChainEntry` with `enabled: true` has no `ok` record. Enabling a chain remains a separate reviewed code change plus a signed deployment manifest (`docs/DEPLOYMENT_MANIFEST.md`).
9. Not run during this research (network blocked): no record exists, all `announcer` and `deployer` statuses above stay unverified.

### 5.4 Manifest additions (proposal for `deployments/schema.json`, additive, optional)

`evmVersion` (`"cancun" | "shanghai" | "paris"`), `announcerCanonical` (boolean, false when a non-canonical announcer is used), `verificationRecordSha256`, `bytecodeModel` (`"evm"`; `"eravm"` rejected until zkSync is designed). Existing required fields (`chainId`, `announcer`, `router`, `sweepRelayer`, `feeRecipient`, `feeBps == 25`, ...) stay unchanged.

## 6. Fee capability and adapter fit

All rows except zkSync Era: `{ checkout: 'enforced', checkoutBps: 25, gasSponsorship: 'enforced' (permit tokens only), flatSecurity: 'not_deployed' until the factory is deployed }`. zkSync Era: `not_deployed` for all lines until its separate design exists. `createEvmAdapter` needs only a `ChainConfig` entry per chain (family `evm`); no adapter code changes.

## 7. Effort

| Item | Size |
|---|---|
| `packages/chain-evm-extra` config + provenance check against ethereum-lists | S |
| Verifier script + schema + CI check | S-M |
| Per chain: announcer verification/deployment, router + relayer deployment, manifest, token allowlist, price feed mapping, getLogs profile | S each (M where deployer missing) |
| Paris-compatible build profile (only if the probe requires it) | S |
| zkSync Era | L |

## 8. Risks

1. Announcer absent or non-canonical on a chain: scanning across ecosystems requires per-chain announcer addresses; the canonical address assumption in `chain-adapters` must stay a manifest field, not a constant.
2. Wrong EVM target: contract compiled for Cancun deployed where TSTORE/MCOPY is missing bricks deployment or fails at runtime. Probe before deploy.
3. Fast-moving L2 sunsets or rebrands (Zora, Mode and similar): chain list status can change; record `listSource.retrieved`.
4. getLogs caps and log pruning limit rescan; unverified for every provider.
5. Native-token pricing (MNT, S, CELO, BERA) needs per-chain feeds; if no Chainlink feed, the buffer feature is disabled for that chain.
6. Rebasing/yield-bearing assets (Blast) conflict with exact balance-delta guards.
7. zkSync Era: wrong address assumption would send people to an address nobody controls. The adapter must refuse chain 324 (`bytecodeModel: 'eravm'`).
8. List data is community maintained; chain ids were verified against it, but a second source should be added (chainlist, chain's own docs) when network access exists.

## 9. PoC acceptance (testnet only)

- [ ] Pick two testnets (suggested: Scroll Sepolia 534351 and Linea Sepolia 59141) plus Mantle Sepolia 5003 for the non-ETH native case.
- [ ] Verifier run produces `ok` records with two independent RPC hosts; records committed.
- [ ] Router and sweep relayer deployed from the same source/commit; manifest validated by `loadDeployment`; payment through `GhostPayRouter` with a mock token and native; fee exactly 25 bps; scanner detects the announcement; stealth key sweeps.
- [ ] Announcer missing case: on a testnet where it is absent, the reference announcer deployed through the Arachnid deployer lands on `0x5564...5564` (acceptance only if the address matches exactly; otherwise document non-canonical).
- [ ] Negative tests: wrong `chainId` manifest rejected (`CHAIN_MISMATCH`); chain 324 rejected by the adapter; `enabled: false` chain refuses payment.
- [ ] No mainnet keys or mainnet transactions; mainnet entries stay `enabled: false`.

## 10. Package ownership

New package `packages/chain-evm-extra` (`@ghostpay/chain-evm-extra`), owner: the chain-port work stream. Contents: `src/chains.ts` (typed `ExtraChainEntry[]`, exported into `@ghostpay/chain-adapters` `CHAINS` only for entries with `bytecodeModel: 'evm'`), `src/verification.ts` (types + schema), `scripts/verify-chain.mjs`, `verification/` (records), `test/` (schema, provenance hash, no-enabled-without-record invariant). Depends on `@ghostpay/chain-adapters` types only. Touches outside the package: additive manifest fields (`deployments/schema.json`, `validateManifest`), and `docs/MULTICHAIN_SPEC.md` section 2 candidate list.

## Sources (retrieved 2026-10-21)
- ethereum-lists/chains raw JSON, one file per id: `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-<id>.json` for ids 59144, 59141, 534352, 534351, 324, 300, 5000, 5003, 81457, 168587773, 146, 14601, 57054, 42220, 44787, 11142220, 167000, 167013, 167009, 34443, 919, 7777777, 999999999, 130, 1301, 80094, 80069.
- ERC-5564 (announcer address, CREATE2 deployer, salt): https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md
- zkSync Era `ContractDeployer.sol`: https://raw.githubusercontent.com/matter-labs/era-contracts/main/system-contracts/contracts/ContractDeployer.sol
- zkSync Era `Constants.sol`: https://raw.githubusercontent.com/matter-labs/era-contracts/main/system-contracts/contracts/Constants.sol
- zkSync Era `ICreate2Factory.sol`: https://raw.githubusercontent.com/matter-labs/era-contracts/main/system-contracts/contracts/interfaces/ICreate2Factory.sol
- Scroll EVM differences: https://raw.githubusercontent.com/scroll-tech/scroll-documentation/main/src/content/docs/en/technology/chain/differences.mdx
- Repo: `docs/MULTICHAIN_SPEC.md` (section 2), `docs/CONTRACTS_SPEC.md`, `docs/DEPLOYMENT_MANIFEST.md`, `packages/chain-adapters/src/adapter.ts`, `packages/chain-adapters/src/config/chains.ts`
- Blocked (not reachable): all RPC endpoints, explorers and each chain's own docs site. Statements depending on them are marked unverified.
