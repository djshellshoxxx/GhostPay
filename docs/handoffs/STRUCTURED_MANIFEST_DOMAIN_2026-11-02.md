# Structured deployment-manifest signature domain — 2026-11-02

Implementation base: published `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`, tree
`86214bc44259326379239a99bfd2c3bd8572997a`. This slice does not recover the
unavailable consolidation or select a production release key or deployment.

## Signing contract

The structured API's `manifestDigest` is Keccak-256 over the UTF-8 bytes of
`GhostPay/structured-deployment-manifest/v1\n` followed immediately by the existing
`canonicalManifestJson(manifest)`. The newline is one byte, U+000A. Export the
literal as `STRUCTURED_MANIFEST_SIGNING_DOMAIN` for offline signer integrations.
Canonical JSON, manifest schema and compact low-s secp256k1 signature format are
unchanged; only the structured signature preimage gains this versioned domain.

New structured signatures verify through `verifyObjectManifestSignature` and its
existing production consumers. A signature over unprefixed canonical JSON, an
alternate domain or the separate legacy text format must fail closed. There is
no legacy-acceptance fallback and no relabeling of old signatures. Existing
structured manifests must be signed again with the updated signer before use.

The legacy `manifestSigningBytes` / `verifyTextManifestSignature` API remains
unchanged, including its own `GhostPay-deployment-manifest-v1\n` prefix and
ed25519/secp256k1 behavior. Receipt signature domains are also unchanged.

## Consumers and fixtures

The web build validator and bundled/default loader, relayer configuration and
ops-monitor use the structured verifier. Their positive fixture signers already
call `manifestDigest`; adding the shared domain updates their signed bytes
without independent cryptographic implementations. Add refusal controls at
those real composition boundaries as well as direct digest/verifier tests.

The devnet signer also calls `manifestDigest`. The checked-in Playwright manifest
has an older fixed signature and stays unchanged as historical fixture data.
`e2e/prepare-manifest.mjs` validates its authored fake facts, signs a copy using
existing Noble and `manifestDigest` with public deterministic test material, and
writes only a new private temporary directory. It returns that directory and
the test public key; root integration supplies them only to Playwright's build
environment. Production trust roots remain unset; no real key is generated,
persisted or selected by this slice.

## Verification limits

Contract and regression sources precede the runtime change. Local dependency and
process execution restrictions are already established; do not retry or bypass
them. Test sources are prepared for the existing authorized hosted CI, not
reported as executed red/green evidence. Preserve prior refusal, tamper, key,
low-s, canonicalization and on-chain read-back controls and all existing gates.
This is not professional security review, native compatibility or release
qualification. Root integration must qualify the exact combined candidate.
