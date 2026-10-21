# Deployment manifest

A deployment manifest is the per-chain record of which GhostPay contracts exist, who receives the fees, and how to recognise the deployed code. The web app, the relayer and the scanner read contract addresses and the fee recipient **only** from it (FEE_SCHEDULE principle 4, ADR-0007). Without a manifest for a chain, the web app disables payment and the relayer refuses the chain.

This document separates what exists today from the intended final design. Where code is not there yet it is marked **being implemented** or **not built**. Authority: audit 03 finding S3-01 (the manifest is today an unauthenticated root of trust) and audit 01 gaps G-01, G-05.

Related: [`deployments/README.md`](../deployments/README.md) (field table, original procedure), [`deployments/schema.json`](../deployments/schema.json), [deployment runbook](operators/deployment-runbook.md), [release and verify](operators/release-and-verify.md), [ADR-0007](adr/ADR-LOG.md), [ADR-0015](adr/ADR-LOG.md).

## 1. Format (implemented)

One JSON file per chain, named `<chainId>.json`, at most 16 KiB (`MAX_MANIFEST_BYTES`). Fields, as accepted by `validateManifest` in `packages/chain-adapters/src/deployments.ts` and described by `deployments/schema.json`:

| Field | Required | Notes |
|---|---|---|
| `chainId` | yes | Must equal the file name and the chain the caller is about to use (`CHAIN_MISMATCH` otherwise). |
| `announcer` | yes | ERC-5564 announcer. Canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564` unless a documented alternative is used. |
| `router`, `sweepRelayer` | yes | `GhostPayRouter`, `GhostPaySweepRelayer`. `announcer`, `router`, `sweepRelayer` must be pairwise distinct. |
| `feeRecipient` | yes | Router `FEE_RECIPIENT`. Must differ from `router` and `sweepRelayer`. See the recipient requirements in the [deployment runbook](operators/deployment-runbook.md). |
| `feeBps` | yes | Must equal 25 in v1 (the validator rejects anything else). |
| `deployTx.router`, `deployTx.sweepRelayer` | yes | Deployment transaction hashes (bytes32). Format-checked only. |
| `solcVersion` | yes | For example `0.8.28+commit.7893614a`. |
| `commit` | yes | 40-hex git commit the contracts were built from. |
| `bytecodeHashes.router`, `.sweepRelayer` | yes | `keccak256` of the **runtime** bytecode read from the chain. Format-checked only today. |
| `date` | yes | RFC 3339 UTC, must be a real date. |
| `donationRecipient` | optional address | Developer-donation recipient. When absent the app shows no donation UI and sends no donation. Must differ from `announcer`, `router`, `sweepRelayer`. |
| `policyImplementation`, `policyFactory`, `policyFeeToken`, `policyFlatFee`, `policyFeeRecipient` | optional, all-or-none | Policy account (experimental, ADR-0014). `policyFlatFee` is a decimal string. When present, `deployTx` and `bytecodeHashes` must carry `policyImplementation` and `policyFactory` too. |
| `signature` | optional | `0x` + hex. Format-checked only; **never verified** today. |

Validation order in the loader (`loadDeployment`): size cap, JSON parse rejecting `__proto__`-style keys, strict key allowlist, field checks above. The web loader (`apps/web/src/lib/manifest.ts`) fetches `deployments/<chainId>.json` from the app's own origin with `cache: 'no-store'`, `redirect: 'error'`, and treats a missing file or an HTML fallback page as `absent` (payments stay disabled) and a validation failure as `invalid` (also disabled). The relayer loads files from `DEPLOYMENTS_DIR`.

Two things the format does **not** give you today:

- `bytecodeHashes` are not comparable across chains. `GhostPayRouter` stores `ANNOUNCER` and `FEE_RECIPIENT` as immutables, and `GhostPaySweepRelayer` (OpenZeppelin `EIP712`) caches its address and domain separator as immutables, so runtime code differs per deployment even from identical source. Comparing a hash therefore needs either the exact constructor arguments and deployment address, or an immutable-aware comparison. No tool in this repository does that yet.
- Nothing stops a manifest from being swapped on the host (S3-01).

## 2. Current trust status (honest)

| Property | State |
|---|---|
| Manifest signature verified by the app | **No.** The Disclosure component says so on screen. |
| Manifest compared with the chain (`FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()`, `eth_getCode` hash) | **No** (A-07). `grep` for `eth_getCode`/`bytecodeHash` in `apps/web/src` and `chain-adapters/src` finds nothing outside types, per audit 03. |
| Manifest part of the hashed release bundle | **No.** It is served from `deployments/` with `Cache-Control: no-store`, outside the hash that release tooling covers. |
| `preview == calldata` checks | Compare against the manifest's own router, so they are circular with respect to a poisoned manifest. |
| Real manifests | None exist. |

Consequence: a one-file change at the host redirects payments while the in-app checks still pass. This is why hosting is gated ([ADR-0015](adr/ADR-LOG.md)).

## 3. Intended final design (being implemented)

The web fix work for S3-01 is in progress at the time of writing. This section describes the target so reviewers can check the finished code against it; confirm against `apps/web` and `packages/chain-adapters` once that work has merged, and correct this file if the implementation differs.

### 3.1 Manifests compiled into the hashed bundle

- Reviewed manifests live in the repository (`deployments/<chainId>.json`) and are **imported at build time** into the JavaScript bundle (for example as a generated module). The bundle hash published in `SHA256SUMS` therefore covers router and fee-recipient addresses.
- The app no longer fetches `deployments/*.json` at runtime for trust decisions. A runtime-fetched file, if kept for convenience, may only be used to display "a newer manifest exists" and never to change addresses.
- A manifest change is a code change: pull request, review, new release hash.

### 3.2 On-chain read-back before payment is enabled

Before enabling payment on a chain, using the user's RPC (ideally two independent providers through the existing `requestWithFallbackCheck`), the app checks and fails closed on any mismatch:

1. `eth_getCode(router)` hashes to the expected `bytecodeHashes.router` (immutable-aware, see section 1).
2. `router.FEE_RECIPIENT()` equals `feeRecipient`; `router.FEE_BPS()` equals 25; `router.ANNOUNCER()` equals `announcer`.
3. The same for `sweepRelayer` (`DOMAIN_SEPARATOR()` consistent with chain id and address).
4. The addresses and the fee recipient shown to the user are the values **read from the chain**, not from JSON.

### 3.3 Detached signature over the manifest

- The release key signs the canonical manifest (UTF-8 JSON, keys sorted, no insignificant whitespace, `signature` field removed). The scheme and key format are part of the signing decision recorded in [ADR-0015](adr/ADR-LOG.md); the schema's `signature` field (`0x` hex) is the carrier.
- The verifying public key is obtained **out of band** (published fingerprint, signed tag) and compiled into the bundle, so a host cannot substitute both manifest and key.
- Until a release key exists, the signature field stays optional and the UI keeps saying it does not verify it.

### 3.4 Release linkage

`release-manifest.json` (produced by `scripts/gen-release-manifest.mjs`, see [release and verify](operators/release-and-verify.md)) lists the web bundle hashes together with the compiled-in chain ids and addresses, so a user comparing hashes from a separate machine is also comparing the router and recipient.

## 4. Producing a manifest

Step by step in the [deployment runbook](operators/deployment-runbook.md). Summary of the manual flow that exists today:

1. Deploy with `forge script script/Deploy.s.sol --broadcast` (hardware wallet or keystore, never a raw key on a shared machine).
2. Read back `FEE_RECIPIENT`, `FEE_BPS`, `ANNOUNCER` and the runtime code hash (`cast codehash`) from the chain; verify sources on the explorer.
3. Write `deployments/<chainId>.json` by hand from the script output (no script writes the manifest yet, audit C-29).
4. Validate with the project validator, not only the JSON schema: `node -e` against `loadDeployment` after `npm run build:libs`, or `npx ajv-cli validate -s deployments/schema.json -d deployments/<chainId>.json` for the schema part. The hand-written validator is stricter than the schema (distinct addresses, `feeBps == 25`, real dates).
5. Review in a pull request by someone other than the deployer; compare every address with the explorer.

## 5. Migrating to a new router

Routers are immutable; a defect, a blacklisted recipient or a recipient that cannot receive ETH means deploying a replacement. Procedure in the runbook; manifest-wise:

- Publish a new manifest for the same chain with the new `router` (and `feeRecipient`); keep the old one in git history.
- A "deprecated router" marker so clients can warn on old links is **not built** (suggested by contracts review M-01). Invoice links contain no router address, so old invoices follow the manifest the app ships with.
- Release a new signed build; users on an old build keep paying the old router until they update.

## 6. Open items

- Everything in section 3 (implementation in progress; unverified).
- Signing scheme, key custody and fingerprint publication (owner decision).
- Immutable-aware bytecode comparison tool.
- A manifest-writing script and a CI job that validates `deployments/*.json` on every pull request.
