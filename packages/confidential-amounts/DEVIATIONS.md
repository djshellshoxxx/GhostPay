# Deviations and open points (@ghostpay/confidential-amounts)

Tags: [R] read, [E] executed here, [U] unverified.

1. **CT-M is an in-memory ledger, not a hardhat chain.** Spec test T5 says "against hardhat node". `CleartextLedger` re-implements router and wrapper semantics (fee `t/400`, silent zero transfer, operator expiry, per-handle ACL, fee epoch from `epochStart`) and executes the same calldata the real backend emits (decoded with viem). The calldata ABI is cross-checked against the compiled Hardhat artifacts in `calldata.test.ts` (skipped if `../confidential-contracts/abi` is missing), but **the TypeScript is not run against the real contracts**; the two implementations can drift. [E] for the ledger, [U] for equivalence beyond the cross-checked ABI and the shared test vectors (fee split, zero transfer).
2. **No manifest code hashes.** CT-PAY-4 asks for on-chain code-hash comparison. `verifyManifestOnChain` exists and is tested, but no RPC was reachable, so `codeHashes` are all `null` and the default `requirePinned: true` refuses every real chain until someone pins them (the first Sepolia smoke run should). `requirePinned: false` reports `unpinned` roles instead. GhostPay router and token addresses are `null` (nothing deployed).
3. **Manifest values** are from `@fhevm/solidity` 0.11.1 `ZamaConfig.sol` and `@zama-fhe/sdk` 3.7.0 `chains` presets; both agree and a test asserts it [E]. The spec's table lists `@fhevm/solidity 0.13.4` as current; the contracts package uses 0.11.1 because OpenZeppelin Confidential Contracts 0.5.3 pins it (see contracts `DEVIATIONS.md`). Local (31337) values are the mock's.
4. **SDK glue is unverified at runtime [U].** `createZamaSdkPort` is typed against the real 3.7.0 `.d.ts` (it compiles, which verified `createConfig`, `ZamaSDK.encrypt`, `decryption.decryptValues`, `decryptPublicValues`, `terminate`, `MemoryStorage`, `telemetry`, and the viem adapter shapes) and the real loader imports all pinned entry points (`node`, `web`, `cleartext`). Not verified: WASM/key download (~50 MB per the SDK docs), browser bundling, permit signing with a stealth key, relayer acceptance of a fresh EOA (spike S-2), `finalizeUnwrap` proof acceptance. The SDK's viem config requires a wallet, so sessions without a stealth key get a throw-away generated key.
5. **Transport isolation (CT-DEC-2) is only half done.** `DecryptScheduler` creates a per-job transport through `isolate()`, but `@zama-fhe/sdk` 3.7.0 `RelayerOptions` has no `fetch`/transport hook [R], so the Zama glue cannot use it; isolation must happen at process level (separate Tor circuit per job). The scheduler's random gaps and one-owner-per-job rule do work.
6. **No persistence.** The glue passes `MemoryStorage`: the SDK default (IndexedDB) would store permits and transport keys keyed by the stealth address. Consequence: each decrypt re-signs a permit (no caching).
7. **`StealthSigner` is an interface** (`withKey(fn)`), not an import of `@ghostpay/secret-box`, to keep packages independent (privacy-specs README invariant 4). The wiring doc shows the adapter. CT-DEC-4 (zeroize after signing) is the adapter's job; the backend only guarantees the key is passed to one SDK session and that session is closed.
8. **`buildSetOperator` takes `nowSec`** (not in the spec signature) so CT-PAY-2 (`until <= now + 900 s`) is enforced without a hidden clock.
9. **Chain lists.** CT-1: `[11155111, 31337]` (31337 = local mock/cleartext executor, the SDK `hardhat` preset). Base Sepolia (84532) is refused for CT-1 because Zama's `ZamaConfig` does not support it [R]. Mainnet ids refused everywhere: 1, 10, 56, 137, 8453, 42161.
10. **Copy** (`CT_COPY`) is English only and has no i18n keys beyond the spec's names; wording avoids "private", "anonymous", "untraceable", "unlinkable", "mix*" (a test enforces it). The NOT-protected texts are my wording of spec section 2.
11. `createZamaSdkPort` and `loadZamaSdk` are exported from the index; the `@zama-fhe/*` imports inside are dynamic only, so a bundler can tree-shake the optional dependency away if they are unused. The bundle scan itself (`apps/web/scripts/scan-bundle.mjs`, test T8) was not run: nothing is wired.
12. **Not built:** CT-2 Fhenix and CT-3 Inco adapters (spikes S-3, S-4 not done: no network to the vendors' docs here). `packages/confidential-amounts-fhenix` and `-inco` do not exist.
13. `npm audit --omit=dev --audit-level=high` reports nothing for this package's tree; the high findings in the workspace come from other packages (`@0xbow/privacy-pools-core-sdk`, `ws`, `underscore`) [E].

## P13 client core (`src/future/p13/`, 2026-11-25)

Spec: `docs/future/modules/P13-confidential-amounts/SPEC.md`; record: `.../IMPLEMENTATION.md`.

- **P13-1 Internal only.** Not exported from `src/index.ts` or the `exports` map (a test enforces it); dist contains the
  files but no consumer can import them. The spec's `AmountSettlementProvider` is realised as functions
  (`p13Capabilities`, `prepareConfidentialPlan`, `interpretEvidence`); a chain-reading `verifyEvidence` adapter is not built.
- **P13-2 `ConfidentialAssetV1` extended** with `underlying` and `rate` (exact ERC-7984 wrapper units); `confidentiality`
  adds `'none'` so the cleartext fixture can never be described as `'fhe'`.
- **P13-3 COMMON types are local** (`ModuleResult`, `AssetRefV1`, capability descriptor): no shared owner package exists on main.
- **P13-4 New local envelope `GPC1`** (AES-256-GCM via WebCrypto, AAD = header + namespace). Same primitive and
  parameters as ADR-0005 and `@ghostpay/ux-vault`, but its own layout; key derivation, wrapping and vault-backup
  inclusion belong to the vault owner (P05) and are not done.
- **P13-5 Zero payment amounts are refused** (`EUINT64_DOMAIN.min = 1`): 0 is the silent-failure value of ERC-7984.
  Fees may be 0 (gross < 400).
- **P13-6 CT-1 preparation is unavailable** in every configuration (unpinned code hashes CT-08, mock-only evidence
  CT-10); only `ctm-cleartext` on 31337 can be prepared/reviewed. Settlement operations are always refused.
- **P13-7 Rollback detection is per session.** A storage writer can restore an older valid envelope across sessions;
  closing that needs an external monotonic counter (owner decision D6).
- **P13-8 Browser evidence is Chromium only** (`npm run test:browser`, not wired into CI); Firefox, WebKit and mobile
  are not qualified.
- **P13-9 No invoice-schema change.** The `amountVisibility` field proposed in `confidential-tokens.md` 5.2 is not added;
  P13 maps unchanged `fixed_token` invoices only (fiat-quoted, native ETH, other token/network refused).
