# Deviations and open points (@ghostpay/external-pools-railgun)

Spec: `external-pools.md` sections 3.2, 6.4. Date 2026-10-21.

## Unverified ([UNVERIFIED] in code comments and docs)

1. **The SDK glue is not built.** `RailgunWalletPort` is the boundary. No `@railgun-community/*` package is a dependency (a test asserts it). Reason: the SDK tree is large, installs a `postinstall` (no-op outside React Native, read), needs an engine, storage and network services, and the build sandbox has no route to Railgun services or testnet RPC. Effort to finish: M (engine bootstrap with artifact digest check, `populateShield`/`generateUnshieldProof`/`populateProvedUnshield` wrappers, Waku broadcaster client, `scanShields` from wallet history).
2. **Nothing ran against a Railgun testnet**: Sepolia proxy liveness, whether the deployed proxy has the master-branch ABI, PPOI node and broadcaster availability, quick-sync. The Sepolia manifest entry is `unverified` (no code hashes could be read), so `health()` returns `unknown` and entry is refused until an operator pins `codeHashes` from a trusted RPC.
3. **Shield private key derivation.** The SDK takes `shieldPrivateKey` as a hex string; the convention (keccak256 of the wallet signature over `getShieldPrivateKeySignatureMessage()`) was not verified in this run, so it sits behind `RailgunWalletPort.shieldKeyFromSignature`.
4. **Spec section 3.2 versions are outdated**: `@railgun-community/wallet` is 11.2.0 (spec 10.9.0). Exact pins are the glue author's task; the SDK is not pinned here.
5. Unshield calldata is only decoded in tests from fixtures built with the verified ABI; no zero-knowledge proof was produced or verified (the unshield path on the real contract needs verification keys and circuits).
6. Spec's 0.25 % shield/unshield fee and the "1 hour unshield-to-origin delay" are third-party claims; the adapter reads fees on chain and treats any delay as SDK data.
7. Token blocklist (`TokenBlocklist`) on the proxy is not queried; a blocklisted token fails at the contract.

## Differences from the spec

8. Native coin: spec 6.4 uses `populateShield` for ERC-20 only as well; wrapping ETH is not implemented (`supports()` says so).
9. Notes hold no secrets (`RgNoteData`: proxy, token, tree number, position, fee); wallet keys are re-derived from the root seed through the port. The vault still stores them encrypted like every other note.
10. EP-RG-1 (engine in a worker, storage encrypted) belongs to the glue; the adapter only guarantees that the seed is lent through `SecretBox.use()` and never kept.
11. EP-VAULT-2 for Railgun depends on `scanShields` from an engine rescan (glue); if it throws, `recoverNotes` marks the scope incomplete (tested). The spec's `lost-sync` fallback is the vault's scope status, not a note state written by this adapter.
12. `ExitQuote.expiresAt` for broadcaster quotes is a 60 s clock window set by the adapter (the real broadcaster fee commitment lifetime is unknown).

## Coverage

No file is excluded; thresholds unchanged. The glue that would need the real SDK does not exist, so there is nothing to exclude.
