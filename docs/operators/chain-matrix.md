# Chain, token, feed and deployment evidence matrix

`packages/chain-adapters/config/matrix.json` inventories all 14 configured EVM chains, nine allowlisted tokens and
four configured Chainlink feeds. The older specification's count of nine chains is obsolete. This file records
claims and missing evidence; it does not fetch chain state or authenticate an evidence publisher.

Run after `npm run build:libs`:

```sh
node scripts/check-chain-matrix.mjs
node scripts/check-chain-matrix.mjs --release
```

The first command validates the schema, evidence fields and exact parity with the built `CHAINS`, `TOKENS` and
`FEEDS` configuration. CI runs it after a clean build. Missing/duplicate/extra chain, token or feed rows fail. A row
cannot hide an enabled runtime chain by marking its matrix row disabled. Both contract addresses must match the
configured canonical candidates.

The second command additionally requires **every required cell on every enabled chain** to be `verified`.
`unverified` and `n/a` do not satisfy a required release cell. A `verified` cell requires a non-null well-shaped
value, HTTPS source and real calendar retrieval date. Verified contract cells require a nonzero runtime code hash;
verified deployment cells name the exact checked-in `deployments/<chainId>.json`, SHA-256 checksum and independent
readback evidence URL. The checker compares the actual file checksum, validates the manifest and requires a
signature to be present. It does not replace cryptographic signature verification against the approved release key,
RPC readback, independent operator review or release signing.

`release-build.sh` runs the strict gate when `GP_REQUIRE_RELEASE=1`, before the web build. A locally tagged build
that would otherwise receive the `release` channel runs the same gate before checksums are emitted. Ordinary
application builds and development artifacts remain available. No mainnet is enabled by this inventory.

## Evidence states

| State | Meaning |
| --- | --- |
| `verified` | The specific value has recorded source evidence. It does not imply that other cells, a deployment or the product are qualified. |
| `unverified` | Missing verification or acceptance. A concrete reason is required. Known configured candidate values may remain recorded. |
| `n/a` | No value applies; a reason is required. It cannot bypass release requirements. |

Existing issuer-source token address/decimal evidence is carried forward from
`docs/chains/SOURCES-2026-10-25.md`, with its original retrieval date. Feed proxy address, decimals and heartbeat
metadata come from the saved primary documents and checksums recorded in the superseding section of
`docs/chains/SOURCES-2026-11-04.md`. Those files were not re-fetched in this change. Neither saved source metadata nor
its retrieval date proves that a proxy currently runs the intended implementation or that a feed is currently fresh.

The runtime permits current testnet development separately from production release qualification. Engineering
finality/range defaults, canonical contract runtime hashes, deployment manifests, per-deployment permit/blacklist/
EIP-3009 acceptance and live feed acceptance remain explicitly unverified. Therefore the strict release command
**currently exits 1**. This is the expected unresolved release gate, not successful release qualification.

## Completing a row

1. Capture primary-source evidence and its retrieval date for the specific chain/value. Review the evidence independently.
2. Read announcer/registry runtime code with independent providers on that chain, pin the agreed Keccak-256 runtime
   hashes and retain source/block/provider provenance. Address equality alone is insufficient.
3. Verify configured finality/range policy for the target provider and chain. Record the approved operational evidence.
4. Run per-token proxy, decimals, permit, blacklist and EIP-3009 acceptance; do not promote a contract-family capability
   to a deployment claim without that evidence.
5. Supply the approved signed deployment manifest, retain its independent readback report, and calculate the checksum
   of the exact committed bytes. Do not place private release keys in this file.
6. Exercise configured feeds against their real deployments, including round freshness, stale/missing data, decimal
   agreement and applicable L2 sequencer behavior. The matrix's feed `acceptance` cell links that report.
7. Update only supported cells and run both commands. Existing runtime payment and signature gates still apply.

Nightly RPC hash refresh, public-testnet acceptance, signed deployment data and publisher review remain outstanding.
A schema-valid URL/date or passing inventory check cannot supply those external facts.
