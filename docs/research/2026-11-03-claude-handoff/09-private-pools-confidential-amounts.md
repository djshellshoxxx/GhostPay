# Private-pool and confidential-amount integrations: source-led follow-up

Research date: **2026-11-03 America/Vancouver / 2026-11-04 UTC**. GhostPay baseline: integrated PR #47 `f8193502e602c99bb24ff956f142671750b744a0`. This note supplements the existing package READMEs and deviations rather than treating their old open questions as freshly reproduced failures.

## Recommendation

**Finish qualification around the existing interfaces before adding another privacy protocol.** The most useful next work is a reproducible, optional integration harness for existing adapters; a source-and-artifact provenance record for the SDKs and circuits they already use; and explicit browser/transport capability decisions for the Zama path. Keep these features outside the supported lean application until their separate acceptance criteria are met.

Five upstream sources below provide concrete value: Privacy Pools' existing SDK and relayer fixtures; RAILGUN's published wallet artifact and declarations; Zama's actual browser-runtime configuration; OpenZeppelin's ERC-7984 wrapper and tests; and snarkjs' existing engine/template provenance. This pass did not create an alternative pool, prover, cryptographic scheme, wallet derivation or FHE backend.

**Evidence boundary:** local source, upstream source, licence text, npm metadata, and one npm artifact were inspected. The RAILGUN artifact's bytes were checked against its published SHA-512 integrity value and its text files read without execution. No upstream package was installed; no application, proof, contract, browser, relayer or testnet test was run; no transaction, deployment, profile enablement or mainnet qualification occurred. Historical test counts in the existing deviations are historical author reports, not results of this research.

## 1. Existing code and the actual remaining work

| Area | Present in the inspected frontier | Remaining integration/qualification work |
|---|---|---|
| Shared external-pool machinery | `packages/external-pools/src` has adapter interfaces, planning, code-hash checks, manifests, accounting, timing, encrypted note-vault and recovery machinery. | The production application does not import these packages in the inspected `apps/web` source. Decide the optional feature boundary and qualify an exact protocol/deployment before app wiring. |
| Privacy Pools | `external-pools-privacypools` already depends on SDK **1.5.0**, contains SDK crypto glue, ASP/state ports, relayer parsing, ABI checks and optional real-circuit/Anvil tests. | Public deployment/ASP/relayer qualification, ERC-20 integration coverage, artifact/source alignment and explicit handling of skipped integration tests. Its shipped manifest still has an unverified entry with no contract addresses/code hashes. |
| RAILGUN | Adapter, derivation seam, calldata checks and fixtures exist. `RailgunWalletPort` declares the expected wallet, proving, broadcaster, rescan and artifact-digest services. | The real SDK port implementation is absent. No RAILGUN npm dependency is currently declared by the adapter. Existing tests cannot stand in for SDK bootstrap, encrypted storage, broadcaster availability, proof generation or recovery. |
| Native GhostPay pool | `pool-sdk`, `pool-relayer`, `pool-contracts`, `pool-circuits` and `pool-prover` already exist. The prover verifies supplied artifact digests, uses the checked in-memory bytes, checks chain/kind/signal counts, and exposes a Worker request handler. | Browser proving measurements and integration; authenticated artifact-set identity; production ceremony and review prerequisites. The repository explicitly labels its current ceremony **INSECURE-LOCAL** and restricts deployments. Preserve these restrictions. |
| Confidential amounts | `confidential-amounts` supplies a neutral backend interface, a cleartext test double, `ZamaBackend`, dynamic SDK glue, metadata encoding, a decrypt scheduler and manifest validation. `confidential-contracts` supplies the router/token and mock-backed tests. | Actual SDK/browser/relayer qualification; router/token deployment inputs; code hashes; linkage between the cleartext model and contract behavior; verified transport isolation. Existing manifest hashes are null. |
| Fhenix/Inco | Registry cases exist for future backend identities. | Actual adapters are absent and return `BACKEND_UNAVAILABLE`. No evidence here justifies starting them ahead of the existing Zama acceptance work. |

Source anchors: [external-pool manifest][G1], [RAILGUN port][G2], [Privacy Pools deviations][G3], [Zama SDK glue][G4], [confidential manifest][G5], [confidential registry][G6], [prover][G7], [circuit README][G8], [confidential deviations][G9]. The existing [lean scope][G10] remains the scope authority; a package's presence or dynamic imports do not establish acceptance in that artifact.

### Preserve the distinction between hashes, deployment identity and evidence

A code hash can confirm agreement with selected bytes; it does not alone establish the intended chain, deployment provenance, proxy implementation, configuration, audit scope or liveness. A circuit hash can confirm an artifact matches an expected digest; it does not establish who authenticated that digest or that a test ceremony is suitable for a production deployment. Bind these facts together in a reviewed manifest and receipt, using the release-policy work in [03-hosting-release-provenance.md](03-hosting-release-provenance.md). Do not change an entry to `verified` simply because an RPC returned a code hash.

## 2. Reuse candidates

### POOL-01 — Privacy Pools: existing dependency, stronger provenance and conformance

The [npm record for `@0xbow/privacy-pools-core-sdk@1.5.0`][P0] reports Apache-2.0 and `gitHead` **`076341c40c0c526936773ce5ec5e439759339a03`**. That source is accessible; its [root licence][P1] is Apache-2.0. This establishes a registry-to-source reference, not an independently reproduced package build.

Inspected source with direct reuse value:

- [`packages/sdk/src/circuits/artifactHashes.ts`][P2] contains a frozen artifact hash map and `verifyArtifactIntegrity`, which refuses a missing digest and checks the received bytes.
- [`packages/sdk/src/core/withdrawal.service.ts`][P3] provides the current `WithdrawalService` proof-input and verification interface. Use it to check GhostPay's mapping; do not duplicate its proof engine.
- [`packages/relayer/src/schemes/relayer/quote.scheme.ts`][P4] and [`packages/relayer/test/unit/handlers.relayer.request.spec.ts`][P5] provide wire-schema and handler-fixture references. The handler tests use mocks and do not establish real relayer or chain acceptance.

The six commitment/withdrawal artifact digest values in this inspected hash map match the six values already present in GhostPay's `manifest-data.ts`. **The new work is recording immutable provenance and qualification, not refreshing those digests without cause.** GhostPay's source links currently point at moving `main` documentation. Replace that provenance with the exact reviewed source and adopted package artifact when this manifest is next maintained. [G1], [P2]

There is also a version-alignment task: GhostPay's optional Anvil fixture documents a separately pinned upstream contracts revision, while the installed SDK has the registry reference above. That is not evidence of incompatibility. Record the SDK, contracts, circuit artifacts, public-signal schema and ABI as one compatibility set and exercise that set together. [Anvil fixture][G11]

**Adoption mode:** retain the existing exact dependency; adapt a small number of conformance fixtures with attribution after confirming their licence scope. Do not fork the SDK or relayer merely to avoid writing an adapter test.

**Acceptance evidence:** matching public signals and intended contract call for the supported native/ERC-20 flows, explicit artifact identities, bounded relayer responses, ASP-root agreement and recovery/reorg behavior. The existing real-artifact and Anvil suites skip when their external prerequisites are absent; a qualification job must require those prerequisites and report a missing prerequisite as incomplete qualification. Do not reinterpret a unit-only green run as end-to-end coverage. [G3, G11, real-artifact tests][G12]

### POOL-02 — RAILGUN: verify the published artifact before implementing the port

The [npm record for `@railgun-community/wallet@11.2.0`][R0] identifies an [exact package tarball][R1]. This pass downloaded that tarball, matched its bytes to the registry's SHA-512 integrity string, and read `package/LICENSE`: **MIT**, copyright RAILGUN Project Contributors. The downloaded tarball's SHA-256 is:

`9fe0f45ba0a88a8983a5e5e7fb391cd1068c8ff36438f92dbc3b2028efaa29a9`

The registry's `gitHead`, `c22cc69986c96e5a40a683623decfada926a694b`, did **not** resolve through the public repository tree API in this pass (HTTP 422). The repository's then-current HEAD resolved separately to `5c9d04c844879b8377d91775052e88c836b48730`. Do not claim either HEAD reproduces the 11.2.0 artifact. The checked tarball is the precise object inspected here; publisher/source-build equivalence remains unresolved.

Useful inspected artifact paths:

- `package/dist/services/transactions/tx-shield.d.ts`: `getShieldPrivateKeySignatureMessage`, `populateShield` and the transaction population types.
- `package/dist/services/transactions/tx-proof-unshield.d.ts`: `generateUnshieldProof`, including the encryption-key, fee and progress-callback parameters.
- `package/dist/services/transactions/tx-unshield.d.ts`: `populateProvedUnshield` and related request shapes.
- `package/dist/services/artifacts/artifact-store.d.ts`: `ArtifactStore`'s injected get/store/exists operations.
- `package/dist/services/railgun/core/engine.d.ts`: engine ownership accessors.

These are declarations, not proof that a real engine can satisfy GhostPay's lifecycle and privacy requirements. The package also contains compiled artifact-manager code and tests; those paths were inventoried, but this pass did not execute or audit that manager.

**Adoption mode:** implement a separately reviewed adapter behind the existing `RailgunWalletPort`, only after selecting and tracing the actual dependency set. Keep SDK/engine storage, circuit loading and broadcaster transport out of core imports. Reuse the existing port, manifest and note-recovery tests instead of adding a parallel wallet abstraction. [G2, RAILGUN deviations][G13]

**Acceptance evidence:** SDK startup/termination and Worker behavior, storage encryption and reopening, expected artifact-digest inventory, supported transaction modes, restore/rescan completeness, cancellation during proving, and distinct states for pending proof-of-innocence/broadcaster unavailability. Establish the shield-key derivation convention from the adopted SDK's source/documentation rather than guessing it from the TypeScript `Hex` shape. The adapter's own deviations still mark this convention unverified. No funded test or broadcaster action was performed here.

### CT-01 — Zama SDK: reuse its browser configuration hooks

The [npm metadata for `@zama-fhe/sdk@3.7.0`][Z0] identifies `zama-ai/sdk` commit **`e0647fd3dfbcd19d2d422e72ea184b0bddd6010c`**. Both root and [`packages/sdk/LICENSE`][Z1] were read: **BSD-3-Clause-Clear**. It permits source/binary redistribution under its stated conditions and expressly grants no patent rights. Record this exact licence; do not relabel it MIT or infer the terms for every FHE dependency or hosted service. A distribution/patent decision remains separate from source inspection.

Fresh source inspection found useful options that GhostPay's current zero-argument `m.web()` construction does not expose:

- [`packages/sdk/src/config/web.ts`][Z2] supports a caller-selected `offloadWorker` URL/factory and `offloadEncrypt: true` to require Worker execution. Default `"auto"` permits a fallback to the main thread. It also supports Worker lifecycle timeouts.
- [`packages/sdk/src/relayer/types.ts`][Z3] exposes a pre-fetched public `fheEncryptionKey` and `moduleVersions` for TFHE/KMS module selection. The documented default resolves versions from the chain protocol. Reusing a verified public encryption key could reduce repeat initialization cost, but its protocol/version binding and invalidation must be defined before caching it.
- [`packages/sdk/src/config/__tests__/web.test.ts`][Z4] and [`packages/sdk/src/__tests__/telemetry.test.ts`][Z5] provide configuration/header test references. They are not browser network-isolation tests.

**Suggested seam:** extend `ZamaSdkPortOptions` and the `ZamaSdkModules.relayer.make` boundary in `packages/confidential-amounts/src/backends/zama-sdk.ts` to carry a reviewed browser-runtime configuration in the optional experiment. An owned same-origin Worker asset could fit GhostPay's CSP and artifact manifest. Retain `MemoryStorage`, explicit telemetry configuration, and deterministic session shutdown. Confirm the actual browser build contains the selected Worker and dependent assets; a lazy import is not proof of bundle exclusion. [G4], [Z2]

**Transport limit:** the inspected `RelayerOptions` has no application-supplied fetch/transport implementation. GhostPay's scheduler isolation callback does not automatically isolate the SDK's own requests. Creating a new process or SDK instance also does not establish a separate Tor circuit by itself. Before claiming isolation, specify the actual transport/proxy boundary and observe the complete traffic of initialization, encryption-key/module loading, decryption, retries and cancellation. The SDK's Worker offload is an execution/performance facility, not a network-anonymity facility. This is a proposed acceptance requirement; no network behavior was measured. [G9], [Z3]

**Priority:** a bounded local browser/configuration experiment ahead of a new Fhenix/Inco backend. Keep public relayer, key, RPC and live-chain qualification as explicit later prerequisites.

### CT-02 — OpenZeppelin confidential contracts: compare the model with the real wrapper

**Verified source:** tag `v0.5.3` resolves to **`4a4f6c71f58b75e391899b57e42e3b73d288dfe3`** in `OpenZeppelin/openzeppelin-confidential-contracts`. The [licence][O1] is MIT; [package.json][O2] reports version 0.5.3 and the fhEVM 0.11.1 development dependency used by this codebase. This pass did not authenticate the release-tag signature or reproduce the npm build.

The exact [`ERC7984.sol`][O3], [`ERC7984ERC20Wrapper.sol`][O4] and [wrapper test file][O5] were read. The wrapper contains conversion-rate/rounding behavior and a separate unwrap/finalization lifecycle. Its tests cover multiple underlying decimal configurations, wrap amounts relative to the conversion rate, operator behavior and finalization. This is a useful source of normal-operation and boundary fixtures for GhostPay's `CleartextLedger` and `confidential-contracts` harness.

**Adoption mode:** preserve the existing dependency and adapt conformance cases. Do not replace the GhostPay router with an upstream example or assume the plaintext ledger establishes contract equivalence. The existing GhostPay deviations explicitly say the TypeScript ledger does not run against the real contracts; matching ABI selectors only covers interface encoding. [G9], [O4], [O5]

**Acceptance evidence:** execute the same deterministic normal-flow vectors against the cleartext model and local contract mock runtime, compare state/rounding/fee accounting and intermediate unwrap state, and record which checks still need real ciphertexts and hosted cryptographic services. Local mock agreement remains a model-compatibility result, not live FHE qualification. Reuse the pinned version's tests rather than importing unrelated current-main behavior.

### PROOF-01 — snarkjs: preserve the engine, improve artifact-set identity

The [npm record for `snarkjs@0.7.6`][S0] reports commit **`9a8f1c0083d18b9b5e18f526cfd729e7259423be`**. Its [COPYING][S1] is GPLv3; the inspected [`src/groth16_fullprove.js`][S2] and [`templates/verifier_groth16.sol.ejs`][S3] give the engine/template provenance relevant to GhostPay's existing prover and generated Solidity verifiers.

GhostPay already passes the verified WASM/zkey bytes to snarkjs in memory. Preserve this behavior. A useful next artifact is a versioned record binding circuit sources/compiler/options, WASM, proving key, verification key, public-signal schema, generated Solidity verifier and ceremony identity to one qualification set. Link that set to the authenticated release record instead of relying on a caller-supplied ceremony string as evidence of the ceremony itself. [G7, G8, circuit notices][G14]

**Adoption mode:** existing engine dependency and template provenance; no handwritten proof verifier or cryptographic port. Reuse known-valid upstream fixtures only after adapting them to GhostPay's actual circuit/schema and preserving applicable notices. The existing circuit-derived material has an explicit unresolved distribution-licence decision. Isolation into a package does not itself settle that decision. No proof-system audit, ceremony verification, adversarial proof experiment or generated-verifier equivalence run was performed for this note.

## 3. Suggested Claude work slices

| ID | Deliverable | Priority and prerequisite | Evidence to retain |
|---|---|---|---|
| POOL-A | Immutable SDK/contracts/circuit compatibility record for the existing Privacy Pools adapter; turn optional integration prerequisites into explicit qualification status. | First useful pool follow-up after core release work; coordinate existing package owner. | Exact source/artifact digests, ABI and signal schema, native/ERC-20/recovery results, and each unrun prerequisite. |
| POOL-B | Design and implement a small RAILGUN SDK port in a separate optional integration package. | After source/artifact traceability and lifecycle/transport design. No automatic core import. | Dependency closure, Worker/storage teardown, proving progress/cancellation, restore/rescan and artifact checks. |
| CT-A | Browser-runtime configuration ADR and local experiment for the current Zama port. | Before additional confidential-token backends. | Explicit Worker policy, same-origin artifact inventory, protocol/key/module version binding, endpoint inventory and observed request behavior. |
| CT-B | Shared deterministic model/contract vectors for cleartext ledger versus pinned confidential wrapper/router. | Useful without any live deployment or funded key. | Intermediate/final states, conversion rounding, fee conservation and unwrap lifecycle; mock versus live evidence clearly separated. |
| PROOF-A | Artifact-set provenance schema and browser proving acceptance plan around the existing prover. | Before any stronger deployment or ceremony claims. | Source/compiler/engine/verifier linkage, valid-fixture compatibility, Worker shutdown, measurements on identified devices, and owner-selected ceremony/distribution requirements. |

These slices improve the implemented feature boundaries. They do not authorize a public relayer, pool deployment, mainnet connection, automatic source copying, new crypto scheme or broader profile enablement. All operational and production-proof-system review remains unrun.

## Sources

[G1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools/src/manifest-data.ts
[G2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools-railgun/src/types.ts
[G3]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools-privacypools/DEVIATIONS.md
[G4]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/confidential-amounts/src/backends/zama-sdk.ts
[G5]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/confidential-amounts/manifest/confidential.testnet.json
[G6]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/confidential-amounts/src/registry.ts
[G7]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/pool-prover/src/prover.ts
[G8]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/pool-circuits/README.md
[G9]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/confidential-amounts/DEVIATIONS.md
[G10]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/handoffs/LEAN_RELEASE_SCOPE.md
[G11]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools-privacypools/src/anvil.integration.test.ts
[G12]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools-privacypools/src/sdk-crypto.test.ts
[G13]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/external-pools-railgun/DEVIATIONS.md
[G14]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/pool-circuits/NOTICE
[P0]: https://registry.npmjs.org/@0xbow/privacy-pools-core-sdk/1.5.0
[P1]: https://github.com/0xbow-io/privacy-pools-core/blob/076341c40c0c526936773ce5ec5e439759339a03/LICENSE
[P2]: https://github.com/0xbow-io/privacy-pools-core/blob/076341c40c0c526936773ce5ec5e439759339a03/packages/sdk/src/circuits/artifactHashes.ts
[P3]: https://github.com/0xbow-io/privacy-pools-core/blob/076341c40c0c526936773ce5ec5e439759339a03/packages/sdk/src/core/withdrawal.service.ts
[P4]: https://github.com/0xbow-io/privacy-pools-core/blob/076341c40c0c526936773ce5ec5e439759339a03/packages/relayer/src/schemes/relayer/quote.scheme.ts
[P5]: https://github.com/0xbow-io/privacy-pools-core/blob/076341c40c0c526936773ce5ec5e439759339a03/packages/relayer/test/unit/handlers.relayer.request.spec.ts
[R0]: https://registry.npmjs.org/@railgun-community/wallet/11.2.0
[R1]: https://registry.npmjs.org/@railgun-community/wallet/-/wallet-11.2.0.tgz
[Z0]: https://registry.npmjs.org/@zama-fhe/sdk/3.7.0
[Z1]: https://github.com/zama-ai/sdk/blob/e0647fd3dfbcd19d2d422e72ea184b0bddd6010c/packages/sdk/LICENSE
[Z2]: https://github.com/zama-ai/sdk/blob/e0647fd3dfbcd19d2d422e72ea184b0bddd6010c/packages/sdk/src/config/web.ts
[Z3]: https://github.com/zama-ai/sdk/blob/e0647fd3dfbcd19d2d422e72ea184b0bddd6010c/packages/sdk/src/relayer/types.ts
[Z4]: https://github.com/zama-ai/sdk/blob/e0647fd3dfbcd19d2d422e72ea184b0bddd6010c/packages/sdk/src/config/__tests__/web.test.ts
[Z5]: https://github.com/zama-ai/sdk/blob/e0647fd3dfbcd19d2d422e72ea184b0bddd6010c/packages/sdk/src/__tests__/telemetry.test.ts
[O1]: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/4a4f6c71f58b75e391899b57e42e3b73d288dfe3/LICENSE
[O2]: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/4a4f6c71f58b75e391899b57e42e3b73d288dfe3/package.json
[O3]: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/4a4f6c71f58b75e391899b57e42e3b73d288dfe3/contracts/token/ERC7984/ERC7984.sol
[O4]: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/4a4f6c71f58b75e391899b57e42e3b73d288dfe3/contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol
[O5]: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/4a4f6c71f58b75e391899b57e42e3b73d288dfe3/test/token/ERC7984/extensions/ERC7984ERC20Wrapper.test.ts
[S0]: https://registry.npmjs.org/snarkjs/0.7.6
[S1]: https://github.com/iden3/snarkjs/blob/9a8f1c0083d18b9b5e18f526cfd729e7259423be/COPYING
[S2]: https://github.com/iden3/snarkjs/blob/9a8f1c0083d18b9b5e18f526cfd729e7259423be/src/groth16_fullprove.js
[S3]: https://github.com/iden3/snarkjs/blob/9a8f1c0083d18b9b5e18f526cfd729e7259423be/templates/verifier_groth16.sol.ejs
