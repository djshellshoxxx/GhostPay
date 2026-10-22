# Deployment manifest

A deployment manifest is the per-chain record of which GhostPay contracts exist, who receives the fees, and how to recognise the deployed code. The web app, the relayer and the scanner read contract addresses and the fee recipient **only** from it (FEE_SCHEDULE principle 4, ADR-0007). Without a manifest for a chain, the web app disables payment and the relayer refuses the chain.

The web app compiles reviewed deployment manifests into the hashed bundle, verifies a configured release signature, and reads the deployed code and immutables back before enabling payment flows. The relayer and ops monitor now use the same structured signature check before trusting a deployment manifest. No production deployment or release key is configured.

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
| `policyImplementation`, `policyFactory`, `policyFeeToken`, `policyFlatFee`, `policyFeeRecipient` | optional, all-or-none | Policy account (experimental, ADR-0014). `policyFlatFee` is a decimal string. When present, `deployTx` and `bytecodeHashes` must carry `policyImplementation` and `policyFactory` too. |
| `signature` | optional in shared schema | Web, relayer, and ops monitor require a compact low-s secp256k1 `r || s` signature (`0x` + 128 hex digits) over `manifestDigest(validatedManifest)`, which is `keccak256(canonicalManifestJson(manifest))`. Missing keys, unsigned manifests, and invalid signatures fail closed. |

Validation order in `loadDeployment`: size cap, JSON parse rejecting `__proto__`-style keys, strict key allowlist, and field checks above. Vite reads `apps/web/deployments/<chainId>.json`, validates filename/chain/schema/signature at build and postbuild, then compiles the raw text and public keys into the bundle. Default services call `loadBundledManifest`; the explicit fetch-based `loadManifest` helper remains for controlled tests and is not used by default runtime flows. Pay, Scan, and Sweep then call the chain adapter's on-chain readback gate. The relayer loads files from `DEPLOYMENTS_DIR`.

Two things the format does **not** give you today:

- `bytecodeHashes` are not comparable across chains. `GhostPayRouter` stores `ANNOUNCER` and `FEE_RECIPIENT` as immutables, and `GhostPaySweepRelayer` (OpenZeppelin `EIP712`) caches its address and domain separator as immutables, so runtime code differs per deployment even from identical source. Comparing a hash therefore needs either the exact constructor arguments and deployment address, or an immutable-aware comparison. No tool in this repository does that yet.
- A compromised host can still replace the whole web bundle; compare the release hash out of band and use the signed release process.

## 2. Current trust status (honest)

| Property | State |
|---|---|
| Manifest signature verified | **Yes when configured.** Web build/runtime, relayer startup, and ops monitor use `verifyObjectManifestSignature` over `manifestDigest`; with no release key, deployment manifests are refused. |
| Manifest compared with chain | **Yes.** The web flow verifies runtime code hashes and router `FEE_RECIPIENT()`, `FEE_BPS()`, and `ANNOUNCER()` through the configured RPC; an optional second RPC must agree when supplied. |
| Manifest part of hashed release bundle | **Yes.** Vite compiles validated raw manifest text and release public keys into the JS bundle. |
| `preview == calldata` checks | Compare against a manifest that has passed release-signature validation and on-chain readback before payment is enabled. |
| Real manifests | None exist. |

No real manifests or release keys exist yet. The release authenticity gate is implemented, but deployment and hosting remain gated ([ADR-0015](adr/ADR-LOG.md)).

## 3. Web trust design

### 3.1 Manifests compiled into the hashed bundle

- Reviewed manifests live in `apps/web/deployments/<chainId>.json` and are imported at build time into the JavaScript bundle. The bundle hash published in `SHA256SUMS` therefore covers router and fee-recipient addresses.
- The default app path does not fetch manifests at runtime. The manual/test fetch helper is separate and cannot supply the default service's deployment data.
- A manifest change is a code change: pull request, review, new release hash.

### 3.2 On-chain read-back before payment is enabled

Before enabling payment on a chain, using the user's RPC (ideally two independent providers through the existing `requestWithFallbackCheck`), the app checks and fails closed on any mismatch:

1. `eth_getCode(router)` and `eth_getCode(sweepRelayer)` hash to the expected manifest code hashes.
2. `router.FEE_RECIPIENT()` equals `feeRecipient`; `router.FEE_BPS()` equals 25; `router.ANNOUNCER()` equals `announcer`.
3. The fee recipient and contract addresses used in transaction review are taken from the verified deployment result.

### 3.3 Detached signature over the manifest

- The web release key signs the exact 32-byte `manifestDigest(validatedManifest)` output. That is `keccak256(UTF-8 canonicalManifestJson(manifest))`; `canonicalManifestJson` sorts object keys, uses compact JSON, and omits `signature`. The signature is 64-byte compact low-s secp256k1 `r || s` encoded as `0x` + 128 hex digits.
- `verifyTextManifestSignature` remains an explicitly named legacy raw-text API for compatibility tests and downstream callers. Production web, relayer, and ops monitor paths do not accept that format; existing manifests signed with it must be re-signed using `manifestDigest` before deployment. There is no maintained signer command yet; an offline signing recipe follows below. Do not dual-accept formats.
- The verifying public key is obtained **out of band** (published fingerprint, signed tag) and compiled into the bundle, so a host cannot substitute both manifest and key.
- No key is currently configured. Builds with no manifest remain valid, but any deployment JSON requires a configured public key and valid signature.

### 3.4 Release linkage

`release-manifest.json` (produced by `scripts/gen-release-manifest.mjs`, see [release and verify](operators/release-and-verify.md)) lists the web bundle hashes together with the compiled-in chain ids and addresses, so a user comparing hashes from a separate machine is also comparing the router and recipient.

## 4. Producing a manifest

Step by step in the [deployment runbook](operators/deployment-runbook.md). Summary of the manual flow that exists today:

1. Deploy with `forge script script/Deploy.s.sol --broadcast` (hardware wallet or keystore, never a raw key on a shared machine).
2. Read back `FEE_RECIPIENT`, `FEE_BPS`, `ANNOUNCER` and the runtime code hash (`cast codehash`) from the chain; verify sources on the explorer.
3. Write `deployments/<chainId>.json` by hand from the script output (no script writes the manifest yet, audit C-29).
4. Sign the validated manifest offline. The following Node function recipe expects the private key in a mode-0600 hex file and prints only the signed manifest. Do not pass the key in arguments or copy it to a connected build machine:

   ```js
   import { readFileSync, writeFileSync, statSync } from 'node:fs';
   import { loadDeployment, manifestDigest } from '@ghostpay/chain-adapters';
   import { secp256k1 } from '@noble/curves/secp256k1.js';

   const [inputPath, keyPath, outputPath] = process.argv.slice(2);
   if (!inputPath || !keyPath || !outputPath) throw new Error('usage: node sign.mjs manifest.json key.hex signed.json');
   if ((statSync(keyPath).mode & 0o077) !== 0) throw new Error('private key file must have mode 0600');
   const raw = readFileSync(inputPath, 'utf8');
   const wire = JSON.parse(raw);
   const manifest = loadDeployment(raw, wire.chainId);
   const keyHex = readFileSync(keyPath, 'utf8').trim().replace(/^0x/, '');
   if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('private key file must contain 32-byte hex');
   const privateKey = Uint8Array.from(keyHex.match(/../g), (byte) => Number.parseInt(byte, 16));
   const digest = Uint8Array.from(manifestDigest(manifest).slice(2).match(/../g), (byte) => Number.parseInt(byte, 16));
   const signature = `0x${Array.from(secp256k1.sign(digest, privateKey, { prehash: false, lowS: true }), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
   writeFileSync(outputPath, `${JSON.stringify({ ...wire, signature }, null, 2)}\n`, { mode: 0o600 });
   ```

   Keep the signer offline, verify its public key against the separately approved release key, and transfer only the signed manifest.
5. Validate with `GHOSTPAY_RELEASE_PUBKEYS=<compressed-hex-key> npm run validate:deployments -w @ghostpay/web`; configure the same comma-separated compressed secp256k1 public-key allowlist for relayer and ops monitor. Vite build and postbuild repeat validation and fail closed. Review in a pull request by someone other than the deployer; compare every address with the explorer.

## 5. Migrating to a new router

Routers are immutable; a defect, a blacklisted recipient or a recipient that cannot receive ETH means deploying a replacement. Procedure in the runbook; manifest-wise:

- Publish a new manifest for the same chain with the new `router` (and `feeRecipient`); keep the old one in git history.
- A "deprecated router" marker so clients can warn on old links is **not built** (suggested by contracts review M-01). Invoice links contain no router address, so old invoices follow the manifest the app ships with.
- Release a new signed build; users on an old build keep paying the old router until they update.

## 6. Open items

- Generate and publish the release key fingerprint out of band; keep its private key offline.
- Add a reviewed, maintained manifest signer tool/ceremony; the documentation recipe is not a managed signing tool.
- Immutable-aware bytecode comparison tool.
- A manifest-writing script and a CI job that validates `deployments/*.json` on every pull request.
