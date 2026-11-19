# Deployment documentation parity — 2026-11-19

Requirements: historical F-DEP-04 and F-DEP-05. Base:
`5128da10b7916e090922a6fe68469d5f0dddd072`.

## Source comparison and correction

| Historical documentation | Current source and correction |
| --- | --- |
| `FEEDS` is empty; only two USDC entries are configured | The registry has four feeds and nine token entries. The refreshed checklist points to the saved issuer/feed records and separates them from outstanding live acceptance. |
| Only Sepolia and Base Sepolia are client-enabled | Seven client testnets are enabled. The driver and `DeployBase.s.sol` retain their six built-in networks, including Hoodi; BNB Testnet/Fuji need explicit contract-script allowlisting. |
| Foundry pins a local compiler path | Current `foundry.toml` pins compiler version 0.8.28. |
| Devnet/public deployment automatically copies an unsigned manifest to web public assets | The source builder no longer copies to the web application and refuses `--copy-web`. The operator reviews/signs offline and explicitly places a validated signed manifest in the bundled deployment directory. |
| Deleting a repository manifest immediately disables a served web app | A served bundle changes only after an authorized rebuild/publication. The runbook now distinguishes repository changes from the running relayer and already served bundle. |

The shell driver already mirrors the contract script's built-in allowlist. No
network alias or contract allowlist was broadened, and no network was promoted to
qualified. The custom-announcer script option is also distinguished from the
client's canonical-announcer acceptance gate.

## Validation and limits

- Existing chain-matrix schema/configuration check passes: **14 chains, 9 tokens,
  4 feeds**. The configuration source is unchanged by this documentation commit.
- All **14 relative Markdown links** in the three edited documents resolve.
- `git diff --check` passes.
- The existing strict `--release` matrix check still exits **1**; its original
  missing evidence is preserved in `evidence/deployment-doc-parity-20261119/`.
- This is a documentation change, so no new implementation-mirroring tests were
  added. No public RPC, deployment, signing, contract change, package metadata
  change, or fresh issuer/feed retrieval was performed.

Independent source/document review is requested from the coordinator before
integration. Historical saved evidence and current configuration do not prove
public-chain, real-wallet or production acceptance.
