# Bundled deployment manifests

`<chainId>.json` files in this directory are compiled into the hashed JavaScript bundle at build time (`vite.config.ts` reads
them, `scripts/validate-deployments.mjs` validates every file with `@ghostpay/chain-adapters`, and the raw text becomes a
constant in the bundle). **There is no runtime fetch of a manifest and no mutable `/deployments/` path on the host.**
Changing a manifest changes the bundle hash, so a mirror comparison (`sha256sum` of the served files) covers it.

**No manifest is shipped yet.** Until the owner deploys the contracts and a reviewed manifest is committed here, the app
shows "payments disabled on this chain" and never builds a payment transaction.

## What a bundled manifest does and does not prove

1. **Validation** at build time and again at load time (schema, `feeBps == 25`, distinct roles, checksummed addresses).
2. **On-chain read-back before use** (`verifyDeployment` in `@ghostpay/chain-adapters`), through the user's RPC and, when
   configured, a second independent provider that must return identical results: `eth_getCode` of router, sweep relayer and
   (when the manifest has a policy section) the policy factory must hash to `bytecodeHashes`; the router's `FEE_BPS()` must
   be 25, `FEE_RECIPIENT()` must equal `feeRecipient`, and `ANNOUNCER()` must equal both the manifest and the canonical
   announcer constant. Pay, Scan and Sweep are disabled until this passes, and the router and fee recipient the UI shows are
   the values **read from the chain**.
3. **Release authenticity.** `signature` is a detached secp256k1 ECDSA signature (64-byte compact `r || s`, low-s)
   over `keccak256(canonical manifest JSON)`; see `canonicalManifestJson` / `manifestDigest` in `@ghostpay/chain-adapters`.
   Release public keys are a **build-time constant array** (`GHOSTPAY_RELEASE_PUBKEYS=<66-hex>,<66-hex>`). If no key is
   configured, any manifest file makes the build fail; the default app also refuses to load a manifest. With keys, a
   manifest without a valid signature fails the build and is refused again at runtime. The keys travel in the same bundle
   as the code, so they add assurance only if the bundle itself was checked out of band.

None of this protects against a compromised host that serves a different bundle (D7); that needs the signed release process
in the root README.

## Procedure

1. Deploy (`packages/contracts`, `forge script script/Deploy.s.sol ...`), verify sources, read back `FEE_RECIPIENT`,
   `FEE_BPS`, `ANNOUNCER` and the runtime code hashes.
2. Write `apps/web/deployments/<chainId>.json` (shape: root `deployments/README.md` and `deployments/schema.json`); the
   `announcer` MUST be the canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564`.
3. `npm run validate:deployments -w @ghostpay/web`, then commit in a reviewed pull request.

`e2e/fixtures/84532.json` is an obviously fake manifest used only by the Playwright build
(`GHOSTPAY_DEPLOYMENTS_DIR=e2e/fixtures`); never copy it here.
