# Deployment runbook (contracts and manifests)

Audience: the person deploying `GhostPayRouter` and `GhostPaySweepRelayer` (and, if ever, the policy contracts) and publishing a manifest. **Nothing has been deployed by the project.** Do this on a testnet with a throw-away fee recipient first (audit G-01). Mainnet is blocked until an independent audit and the [chain-enablement checklist](chain-enablement-checklist.md).

> The deploy scripts were being hardened in the working tree while this was written (extra read-back checks, announcer code-hash check, refusal when the broadcaster is the fee recipient). Environment names below are from the current scripts (`packages/contracts/script/Deploy.s.sol`, `DeployBase.s.sol`, `DeployPolicy.s.sol`). Re-read the script header comments before a real run; they win over this page.

## 1. Before you start

- Contracts are **immutable**. There is no owner, pause, rescue or fee setter. A mistake in `FEE_RECIPIENT` or `ANNOUNCER` means deploying again and publishing a new manifest.
- Use Foundry 1.8.5 and solc 0.8.28 from a clean checkout of the exact commit that will be recorded in the manifest. `foundry.toml` contains a sandbox-only `solc = ".../solc"` line; on a normal machine replace it locally with `solc_version = "0.8.28"` (as CI does) and do not commit that edit. Run `forge build`, `forge test`, `forge fmt --check` first.
- Sign with `--account <keystore>`, `--ledger` or `--trezor`. Never pass a raw private key on a shared machine or in shell history.

## 2. Fee recipient requirements

The fee recipient is an immutable constructor argument of the router, recorded in the manifest and shown to payers. Decide it deliberately; the owner has not decided it yet (SPEC_REVIEW section D).

| Requirement | Why |
|---|---|
| **Must be able to accept plain ETH.** | `payNative` sends the fee with a checked `call`; if the recipient reverts on receive (for example a paused Safe module or a contract with no payable fallback), **every native payment of 400 base units or more reverts**. The script prints a warning if the recipient is a contract; it cannot prove it accepts ETH. Test it with a real small transfer before deployment. |
| **Hardware wallet or multisig, not a hot key.** | Compromise of the recipient key loses the revenue stream (not user funds), and a hot key on a server is the usual way that happens. |
| **Not the deployer / broadcaster key.** | The scripts refuse this (a signer key must not collect fees). |
| **Unlikely to be blacklisted by token issuers (audit D5, contracts M-01).** | If USDC/USDT (or any allowlisted token) blacklists the recipient, every router payment of that token above dust reverts, with **no on-chain remedy**. Use an address with a clean history and no exposure to sanctioned counterparties; do not use an exchange deposit address or a contract that forwards to one. |
| Distinct from the router and relayer addresses. | The manifest validator rejects collisions. |
| Same on every chain? Not required. | A different recipient per chain is allowed and recorded per manifest. Same-address-on-all-chains is not guaranteed for contract wallets. |
| Recoverable under your own key-loss plan. | Losing the recipient key loses fees; there is no way to change it in the contract. |
| Public by design. | The address and all fee flows are visible on-chain and in the app. |

Operational mitigations (none of them prevent the failure; they shorten it): monitor token blacklist/pause events for the recipient; simulate with `eth_call` before presenting a payment (client-side check not built); keep this runbook's migration procedure (section 8) rehearsed; watch the revert rate of router calls.

## 3. Deploy the core contracts

Environment (names only; set values in your shell, never commit them):

| Variable | Required | Meaning |
|---|---|---|
| `FEE_RECIPIENT` | yes | See section 2. Reverts when unset, zero or equal to the broadcaster. |
| `ANNOUNCER` | no | Defaults to the canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564`. Any other address is rejected unless `ALLOW_CUSTOM_ANNOUNCER=1`. |
| `ALLOW_CUSTOM_ANNOUNCER` | no | `1` allows a non-canonical announcer (testnets with a locally deployed one). |
| `EXPECTED_ANNOUNCER_CODEHASH` | no | If set, the announcer's `codehash` must equal it. Use it to prove the canonical announcer on that chain is the CC0 reference code. |
| `ALLOWED_CHAIN_IDS` | mainnets | Comma-separated chain ids allowed besides built-in testnets (Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, Hoodi). Required for any non-testnet. |
| `ALLOW_LOCAL` | no | `1` additionally allows chain id 31337 (anvil). |

```bash
cd packages/contracts
FEE_RECIPIENT=<address> forge script script/Deploy.s.sol \
  --rpc-url "$RPC" --broadcast --account <keystore-name>      # or --ledger
```

The script requires code at the announcer address, checks the optional code hash, deploys the router and sweep relayer, reads every immutable back (`FEE_RECIPIENT`, `ANNOUNCER`, `FEE_BPS == 25`, non-empty code, non-zero `DOMAIN_SEPARATOR`) and prints the addresses and runtime code hashes. Save the full output and the `broadcast/` transaction files (git-ignored) with your records.

Where a chain has no ERC-5564 announcer, deploying the CC0 reference through the deterministic deployer with the ERC's salt, and comparing code hashes, is specified but **not scripted** (audit C-21, G-22). Do not enable such a chain until that exists.

### Policy contracts (experimental; skip unless ADR-0014 changes)

`script/DeployPolicy.s.sol` needs `FEE_RECIPIENT`, `FEE_TOKEN`, `FLAT_FEE` (in token base units), `MAX_FLAT_FEE` (hard upper bound that guards decimals typos) and the same chain variables. Do not deploy it for real use: there is no client support and no recovery path.

## 4. Verify what you deployed

1. Verify source on the block explorer for each contract (compiler 0.8.28, optimizer 200 runs, EVM `cancun`, constructor arguments).
2. Read back from the chain with your own RPC, not the one the script used:

```bash
cast call <router> "FEE_RECIPIENT()(address)" --rpc-url "$RPC"
cast call <router> "FEE_BPS()(uint256)"       --rpc-url "$RPC"   # 25
cast call <router> "ANNOUNCER()(address)"     --rpc-url "$RPC"
cast codehash <router> --rpc-url "$RPC"
cast codehash <relayer> --rpc-url "$RPC"
```

3. Check the deployment transactions on the explorer: the `from` is the intended deployer, the chain id is right.
4. Run a testnet smoke test (audit G-01, G-02): a script that pays a native and an ERC-20 invoice through the router, scans, and sweeps both ways, with transaction hashes recorded in a dated log. `SmokeSepolia.s.sol` was proposed but does **not exist** yet.

## 5. Compute the bytecode hashes for the manifest

`bytecodeHashes.<contract>` is `keccak256` of the **runtime** bytecode on chain: `cast codehash <address>` (equivalently `cast keccak $(cast code <address>)`).

Caveats you must understand before treating the hash as proof of anything:

- `foundry.toml` sets `bytecode_hash = "none"` and `cbor_metadata = false`, so there is no metadata hash in the code and the same source/compiler/settings yield the same bytes.
- The router's runtime code embeds `ANNOUNCER` and `FEE_RECIPIENT` (immutables); the sweep relayer's embeds its own address and EIP-712 domain separator (OpenZeppelin `EIP712`). Hashes therefore differ between deployments from identical source. To check a hash independently, rebuild at the manifest `commit` with the same compiler settings, deploy on a local anvil with the same constructor arguments (and, for the relayer, a matching chain id and address), and compare `cast codehash`, or compare code after masking immutables. **No script in this repository does this yet.**
- A matching hash proves the bytes, not that the source is safe.

## 6. Create the manifest

Write `deployments/<chainId>.json` from the script output: addresses, the two `deployTx` hashes, `solcVersion` (full string with commit), the 40-hex `commit`, `bytecodeHashes`, an RFC 3339 `date`. Format and validation rules: [DEPLOYMENT_MANIFEST.md](../DEPLOYMENT_MANIFEST.md). No script writes the file yet; a typo here is a security bug, so have a second person compare every field against the explorer.

Validate: JSON schema (`npx ajv-cli validate -s deployments/schema.json -d deployments/<chainId>.json`) **and** the project validator (it also enforces distinct addresses, `feeBps == 25` and real dates), for example after `npm run build:libs`:

```bash
node --input-type=module -e "import {loadDeployment} from './packages/chain-adapters/dist/index.js'; import {readFileSync} from 'node:fs'; loadDeployment(readFileSync('deployments/84532.json','utf8'), 84532); console.log('ok')"
```

(Run from the repository root; the example id is a placeholder.)

## 7. Sign and publish

Status: **signing and compile-in are being designed/implemented; none of this is wired in yet** (S3-01, audit G-05, [DEPLOYMENT_MANIFEST.md](../DEPLOYMENT_MANIFEST.md) section 3). The target procedure:

1. Merge the reviewed manifest by pull request; the manifest is compiled into the web bundle at build time, so publishing a manifest means cutting a release.
2. The release key signs the canonical manifest (detached signature stored in `signature`).
3. Cut a signed tag; the release workflow produces `SHA256SUMS`, the SBOM and `release-manifest.json` ([release and verify](release-and-verify.md)).
4. Publish the signing-key fingerprint through channels independent of the download page. It does not exist yet.
5. Point the relayer at the same manifest files (`DEPLOYMENTS_DIR`) and compare `GET /v1/info` with them.
6. Copy into `apps/web/public/deployments/` only while the app still fetches manifests at runtime (current behaviour); remove that path once manifests are compiled in.

Do not enable a chain (`enabled: true` in `chains.ts`, relayer `ALLOW_MAINNET`) before the [chain-enablement checklist](chain-enablement-checklist.md) is complete.

## 8. Migration procedure for a replaced router

Triggers: a defect in the router; the fee recipient is blacklisted or cannot receive ETH (audit D5); a decision to change the recipient or rate; a compromised recipient key (revenue only, not user funds).

1. **Stop advertising the old router.** Stop issuing new invoice links that depend on it only if the client would still use it (invoice links contain no router address; the router comes from the manifest of the client version). If the old router is faulty, disable payment on that chain in the next release (`absent` manifest makes the app refuse).
2. **Deploy the new router** from a reviewed commit (sections 3-5). New immutables mean a new address.
3. **Write a new manifest** for the same chain id with the new `router` (and `sweepRelayer` if redeployed; the sweep relayer is independent, so it can usually stay). Keep the previous manifest in git history. A "deprecated router" field is not part of the schema yet.
4. **Release a new signed build**; announce it through the channels users already trust. Users on old builds keep using the old router until they update; there is no way to push a change to them.
5. **Relayer:** update `DEPLOYMENTS_DIR` and restart; check `/v1/info`.
6. **Tokens left in the old router?** The router holds nothing between transactions; accidental transfers to it are unrecoverable by design.
7. **Scanners:** announcements from the old router stay valid and discoverable; seller scanning does not depend on the router address except to label `viaRouter`. Make sure the scanner knows both addresses for history.
8. **Write down** what happened, the dates and both manifests' commits.

## 9. Checklist

- [ ] Fee recipient decided by the owner, tested to receive ETH, hardware wallet or multisig, not the broadcaster.
- [ ] Deployed from a clean checkout at a recorded commit; full script output saved.
- [ ] Sources verified on the explorer; immutables read back with a different RPC.
- [ ] Bytecode hashes recorded with the immutable caveat understood.
- [ ] Manifest validated twice and reviewed by a second person.
- [ ] Testnet smoke test recorded with transaction hashes.
- [ ] Migration procedure rehearsed on a testnet.
