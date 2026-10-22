# Deployment manifests

One JSON file per chain, named `<chainId>.json` (for example `84532.json`), validated against
[`schema.json`](./schema.json). **This directory contains no real deployments yet.** A manifest is
written only after a real, verified deployment and is the single source of truth the UI, relayer and
scanner read for contract addresses and the fee recipient. The fee recipient is never hard-coded in
source (see `docs/FEE_SCHEDULE.md`).

## Fields

| Field | Type | Meaning |
|---|---|---|
| `chainId` | integer | EIP-155 chain id; must equal the file name and `block.chainid` at deployment. |
| `announcer` | address | ERC-5564 announcer the router announces through (canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564` unless the chain uses a documented alternative). |
| `router` | address | `GhostPayRouter`. |
| `sweepRelayer` | address | `GhostPaySweepRelayer`. |
| `feeRecipient` | address | Router `FEE_RECIPIENT` (immutable). Must be a hardware wallet or multisig. |
| `feeBps` | integer | Router `FEE_BPS` (25 in v1). Cross-checked against the on-chain constant. |
| `deployTx` | object | `{ "router": <tx hash>, "sweepRelayer": <tx hash> }` deployment transaction hashes. |
| `solcVersion` | string | Exact compiler, e.g. `0.8.28+commit.7893614a`. |
| `commit` | string | 40-hex git commit the contracts were built from. |
| `bytecodeHashes` | object | `{ "router": <bytes32>, "sweepRelayer": <bytes32> }`: `keccak256` of the **deployed (runtime) bytecode** read from the chain (`cast codehash`). |
| `policyImplementation`, `policyFactory`, `policyFeeToken`, `policyFlatFee`, `policyFeeRecipient` | address / decimal string, optional | Policy-guarded account (scheme `0x47500002`, `docs/CONTRACTS_SPEC.md` section 4), written by `forge script script/DeployPolicy.s.sol`. All five are required together once `policyFactory` is present. `policyFlatFee` is a decimal string in `policyFeeToken` base units (F-SECURE; may exceed 2^53). `deployTx` and `bytecodeHashes` may carry matching optional `policyImplementation` / `policyFactory` entries. Manifests without these fields stay valid. |
| `date` | string | RFC 3339 UTC deployment timestamp. |
| `signature` | string, optional in the shared schema | Compact low-s secp256k1 `r || s` signature (`0x` + 128 hex digits) over `manifestDigest(validatedManifest)`, i.e. `keccak256(canonicalManifestJson(manifest))`. Required for any web deployment file because builds fail closed without configured release keys and a valid signature. |

## Procedure

1. Run `packages/contracts/scripts/pre-deploy-check.sh router|policy` with the intended environment (prints the effective
   configuration, never broadcasts). Then run `forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast --account <keystore|--ledger>` with
   `FEE_RECIPIENT` set (and `ALLOWED_CHAIN_IDS` for any non-testnet chain). The canonical announcer is mandatory unless
   `ALLOW_CUSTOM_ANNOUNCER=1`; `DeployPolicy.s.sol` additionally needs `FEE_TOKEN`, `FLAT_FEE` and `MAX_FLAT_FEE`. Chain id 31337 needs `ALLOW_LOCAL=1`.
2. The scripts already read back every immutable; additionally verify the sources on the block explorer and read back `FEE_RECIPIENT`, `FEE_BPS`, `ANNOUNCER` and the
   runtime code hashes from the chain.
3. Write `deployments/<chainId>.json`, sign the exact `manifestDigest` bytes with the approved offline release key, and put
   the compact signature in `signature`. No in-repository signing command exists; do not substitute the legacy
   `manifestSigningBytes` raw-text scheme used by the relayer compatibility verifier. Validate the schema and run the web
   project validator with the matching public key before committing in a reviewed pull request.

## Example (shape only, placeholder values)

```json
{
  "chainId": 84532,
  "announcer": "0x55649E01B5Df198D18D95b5cc5051630cfD45564",
  "router": "0x0000000000000000000000000000000000000001",
  "sweepRelayer": "0x0000000000000000000000000000000000000002",
  "feeRecipient": "0x0000000000000000000000000000000000000003",
  "feeBps": 25,
  "deployTx": {
    "router": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "sweepRelayer": "0x0000000000000000000000000000000000000000000000000000000000000002"
  },
  "solcVersion": "0.8.28+commit.7893614a",
  "commit": "0000000000000000000000000000000000000000",
  "bytecodeHashes": {
    "router": "0x0000000000000000000000000000000000000000000000000000000000000003",
    "sweepRelayer": "0x0000000000000000000000000000000000000000000000000000000000000004"
  },
  "date": "2026-01-01T00:00:00Z"
}
```

The example is documentation, not a deployment; never copy these values.
