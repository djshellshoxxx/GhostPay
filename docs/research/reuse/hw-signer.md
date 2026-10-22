# Reuse research: hw-signer (hardware-wallet signer behind a Signer interface)

Research date: 2026-10-21. Read-only research. No clone, no install, no code copied into the repo.
Verification legend: **V** = verified this session from a raw file, npm registry JSON, or GitHub page. **U** = unverified (search snippet or not fetched).

## Existing GhostPay context (checked first)

- `packages/` and `apps/` contain no signer package and no Ledger/Trezor code. `apps/web` has no hardware path (V, grep).
- Spec already exists: `docs/remote/usability/specs/hw-signer.md` (V). It names new package `packages/signer-abstraction` (`@ghostpay/signer-abstraction`), interface `Signer { address; signTransaction(tx): Promise<Hex>; signTypedData(json): Promise<Hex> }`, `InMemorySigner`, `describeSigningRisk`. Requirements HWSIG-1..4, tests T-1 (byte-identical sweep) and T-2 (reject -> cancel message). Phase 2 (offline signing) is gated by security review.
- `viem` is already pinned at `2.57.7` in `packages/core-crypto`, `packages/tx-review`, `packages/chain-adapters`, and others (V). npm `latest` is `2.57.8` (V).
- `packages/external-pools/src/adapters/mock/ledger.ts` is a mock ledger of deposits, not a Ledger device binding (V). Name collision risk only.

## Candidate repos

| # | Repo / path | Licence (verified how) | Commit SHA (date) | Stars | Maintained? | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|
| 1 | https://github.com/LedgerHQ/ledger-live, package `libs/ledgerjs/packages/hw-app-eth` (npm `@ledgerhq/hw-app-eth` 7.11.0) | **Apache-2.0**. V: `package.json` `"license": "Apache-2.0"` at raw `.../develop/libs/ledgerjs/packages/hw-app-eth/package.json`; npm registry `license: Apache-2.0`. Repo-root `LICENSE` and `LICENSE.md` both 404 at develop (U on root file, package-level label verified). | Repo develop HEAD `cc184a681ef7716368e8df7bab1a05abb9cb576d` (2026-10-21T17:50:42Z, V, repo-level, not per-directory). Dir SHA U. | not verified this session | **Package README says `Status: DEPRECATED`, replaced by Device Management Kit, migrate to `@ledgerhq/device-signer-kit-ethereum`** (V). Repo active today. | Ideas only: call shapes for `getAddress`, `signTransaction`, `signPersonalMessage`, `signEIP712HashedMessage`, `signEIP712Message` (V from README). `signEIP712Message` not compatible with Nano S (V). Avoid `clearSignTransaction` and token/plugin methods for MVP. | `@ethersproject/abi`, `@ethersproject/rlp`, `@ethersproject/transactions` ^5.7.0; `@ledgerhq/hw-transport`, `@ledgerhq/hw-transport-mocker` (useful for tests), `@ledgerhq/domain-service`, `@ledgerhq/evm-tools`, `@ledgerhq/logs`, `axios` (network surface, flag), `bignumber.js`, `semver` (V). |
| 2 | https://github.com/LedgerHQ/ledger-live, package `libs/ledgerjs/packages/hw-transport-webhid` (npm `@ledgerhq/hw-transport-webhid` 6.36.0) | **Apache-2.0** per npm registry `license` (V). Snyk Advisor says MIT (third-party, conflicts; npm wins). Source file path fetch 404 (U on file layout). | npm `gitHead` `dd0dea64b58e5a9125c8a422dcffd29e5ef6abec` (V, registry). | not verified | **Ledger developer docs say "LedgerJS: No longer maintained"** (search snippet, U, docs page fetch failed DNS). Treat as stale. | Transport only (WebHID connect). Reuse pattern for `isSupported`/`create`, not code. | `@ledgerhq/logs` ^6.17.0, `@ledgerhq/errors` ^6.37.0, `@ledgerhq/devices` 8.16.0, `@ledgerhq/hw-transport` 6.35.5 (V, registry). |
| 3 | https://github.com/LedgerHQ/device-sdk-ts, package `packages/signer/signer-eth` (npm `@ledgerhq/device-signer-kit-ethereum` 1.18.2) | **Apache-2.0**. V: npm registry `license: Apache-2.0` and raw `package.json` at develop. Repo `LICENSE` raw fetch 404 (U). | Repo develop HEAD `d588b87f2ece4493dddce2ec6f6c526f14d38554` (2026-10-21T15:06:45Z, V). npm has no `gitHead` (U for package SHA). | not verified this session | Yes, active (V). Official successor named by Ledger for hw-app-eth (V). | Reference for context/metadata design, transaction parsing, and the official migration path. Not copyable as a standalone module: it is wired to the DMK transport and xstate/inversify. | `@ledgerhq/device-contacts-kit`, `@ledgerhq/signer-utils`, `ethers` (catalog), `inversify`, `purify-ts`, `reflect-metadata`, `semver`, `xstate` (V). Heavy. |
| 4 | https://github.com/trezor/trezor-suite, package `packages/connect` (npm `@trezor/connect` 10.0.1). Also archived https://github.com/trezor/connect. | **NOT permissive.** `packages/connect/package.json` `"license": "SEE LICENSE IN LICENSE.md"` (V). trezor-suite `LICENSE.md` title is **"TREZOR REFERENCE SOURCE LICENSE (T-RSL)"** (V, raw). Old `trezor/connect` repo: archived 2023-11-23, read-only (V, page). | trezor-suite develop HEAD `169272a542720064ad9a498d8ef635e7fa378e64` (2026-10-21T16:05:26Z, V). npm `gitHead` `2ee7bd0636889196bab33e6069e2736393a58f3c` (V). | trezor/connect 348 (V, archived page). trezor-suite not verified. | Active for v10 (V README "Version 10 is the current major version", npm 10.0.1). Old `trezor/connect` v8 in maintenance, archived (V). | Nothing copyable under T-RSL. Reference only: it is a browser popup/bridge client, not a headless signer. | `@trezor/connect-common`, `@trezor/connect-core`, `@trezor/transport`, `@trezor/transport-common`, `@trezor/transport-web` (workspace, V). |
| 5 | https://github.com/wevm/viem (custom account API, `toAccount` / `Account.from`) | **MIT**. V: npm registry `license: MIT`; repo page shows "MIT License" (V). Raw `LICENSE` fetch 404 (U on file, label verified). | npm latest 2.57.8 (V). Repo HEAD SHA U. | 3.6k (V, repo page) | Yes (npm 2.57.8 published, V). | Not code to copy. Use as the API target: wrap a hardware Signer with viem `toAccount({address, signMessage, signTransaction, signTypedData})` so `createWalletClient` accepts it. Docs: https://rc.viem.sh/docs/accounts/custom.html (U, search only). | Already a GhostPay dependency. |

Not verified / not usable:
- `@ledgerhq/hw-app-eth` newer than 7.11.0 (dir README showed CDN refs to 7.8.x-7.8.19 in search; registry `latest` = 7.11.0, V).
- Any community viem + Ledger custom-account repo: none found (search only, U). Closest analogue: `@l8d/viem-account-yubikey` README (search, U, not fetched, licence U). Do not rely on it.
- `jellywallet/ledger-live`, `rmn-boiko/connect`: forks, not official. Not used.

## Recommendation

**Decision: adapt.**

- Write `packages/signer-abstraction` in-house (per existing spec). Own the `Signer` interface and a `toViemAccount(signer)` adapter built on viem `toAccount`. Implement `InMemorySigner` first, which needs no third-party code.
- Ledger adapter: a thin file that calls the same operations as `hw-app-eth` (`getAddress`, `signTransaction`, `signPersonalMessage`, `signEIP712HashedMessage`) over an injected transport. Apache-2.0 allows copying small code if the file keeps the license header and a NOTICE entry in `THIRD_PARTY.md`. Prefer rewriting from the README API list rather than copying source, because `hw-app-eth` is deprecated and pulls `axios` and `@ethersproject/*`.
- Do NOT depend on `@ledgerhq/hw-app-eth` for new code (deprecated). If a Ledger dependency is wanted, the official successor is `@ledgerhq/device-signer-kit-ethereum` (Apache-2.0, 1.18.2), but it is heavy and needs DMK transport. Needs a human decision.
- Trezor: **reference only.** T-RSL is not an open-source licence. Do not copy, and do not add `@trezor/connect` without legal review. Its model (popup/bridge) also conflicts with a headless signer.

## Integration plan (GhostPay)

- Target path: `packages/signer-abstraction/` (`@ghostpay/signer-abstraction`, ESM, no DOM except noted, `README.md`, `DEVIATIONS.md`, vitest, coverage 90/85/90/90 like `apps/web`). Dependency on `viem` 2.57.7 (match the repo pin).
- API (`src/index.ts`):
  - `interface Signer { readonly address: Address; signTransaction(tx: TransactionSerializable): Promise<Hex>; signTypedData(td: TypedDataDefinition): Promise<Hex> }` (spec says `signTransaction(tx)`, `signTypedData(json)`; tighten to viem types).
  - `InMemorySigner(secret: Hex)` (wraps `privateKeyToAccount`).
  - `toViemAccount(signer: Signer): Account` (viem `toAccount`).
  - `describeSigningRisk(kind): string`.
  - `ledger/` subpath (Phase 1b, optional): `LedgerSigner(transport, path)`, transport injected, no WebHID import in core.
- Tests:
  - T-1: sweep with `InMemorySigner` byte-identical to `privateKeyToAccount` output on fixtures.
  - Parity: `toViemAccount(InMemorySigner)` signs same as viem native account for tx, personal message, and EIP-712.
  - Ledger: mock transport (`@ledgerhq/hw-transport-mocker`, or own fake) returns fixed v/r/s; assert address derivation path and typed-data summary shown before signing (HWSIG-4).
  - T-2: rejected signature maps to cancel message.
  - HWSIG-2 by construction: no method returns or accepts a private key.
- Bundle: scan `apps/web/scripts/scan-bundle.mjs` must stay clean. No new network host (ledger `axios`-based packages must not be pulled in).

## Risks

- **Deprecation / abandonment:** `hw-app-eth` marked DEPRECATED by Ledger (V). `hw-transport-webhid`: Ledger docs say no longer maintained (U, search snippet). Pinning either risks silent drift.
- **Licence traps:** Trezor T-RSL (not permissive, V). Snyk Advisor shows MIT for `hw-transport-webhid` while npm says Apache-2.0 (V registry; conflict unresolved against the source tree). Per-file SPDX headers not checked this session (U).
- **Supply chain:** Ledger's npm ecosystem had a public compromise in Dec 2023 (`@ledgerhq/connect-kit`), from memory, U, not re-verified this session. Pin exact versions, check `npm audit signatures`, lock in `THIRD_PARTY.md`.
- **Network surface:** `hw-app-eth` depends on `axios` and `@ledgerhq/domain-service` (V). Violates the spec's "no new network host" rule unless excluded.
- **Blind signing and clear-signing gap:** `signEIP712Message` not Nano S compatible (V). Without clear-signing (see `docs/research/reuse/clear-signing.md`), device display may be opaque; keep the typed-data summary check.
- **Device access:** WebHID needs HTTPS and a user gesture; no headless test path. Test with the mock transport only.

## Verification gaps (honest)

- GitHub REST API blocked for these repos this session (403 "not enabled"). Repo SHAs come from `.atom` feeds (repo-level HEAD), per-directory SHAs and stars for ledger-live and device-sdk-ts are U.
- `LICENSE` raw files for ledger-live, device-sdk-ts, and viem returned 404 at the paths tried; licences were taken from package metadata (npm registry and raw `package.json`).
- Ledger developer docs page not reachable (DNS).
