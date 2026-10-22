# Deviations and open points (@ghostpay/external-pools)

Spec: `docs/remote/privacy-specs/external-pools.md`. Date 2026-10-21.

## Interface changes against spec 6.2 (all additive or forced by implementation)

1. `recordEntry(r, q, receipt)` takes the entry quote as well as the request: the quote carries the derivation index and the pinned contract addresses that the receipt is checked against.
2. `PreparedTx` has `from` (S1, so the planner can enforce EP-PP-1 for every route) and an optional `kind`.
3. `health(chainId?)`: multi-chain adapters report per-chain state; the planner passes the chain it plans for.
4. `rootSeed` is a `@ghostpay/secret-box` `SecretBox` (spec said `SecretBytes`, which does not exist in `core-crypto`).
5. `ExitOptions.rootSeed?` and `prepareEmergencyExit(n, seed?)`: Railgun must re-derive its wallet to exit. Routes that do not need it ignore both.
6. `ExitRouteInfo.available` / `unavailableReason`: EP-3 and EP-4 are listed but disabled, as the spec's UI section requires.
7. New error codes: `STATE_UNAVAILABLE`, `SDK_OUTPUT_REJECTED`.

## Packaging

8. The pinned manifest is TypeScript (`manifest-data.ts`, parsed at import) instead of `manifest/pools.testnet.json`; the schema is the spec's, with `status: 'verified' | 'unverified'` added. An `unverified` entry makes adapters report lifecycle `unknown`, so entry is refused. **Both shipped entries are `unverified`**: no Privacy Pools Sepolia address was found in primary sources, and Railgun's Sepolia code hashes could not be read (no RPC egress in the build sandbox).
9. Manifest addresses are validated as EIP-55 and normalised to checksum form. The two Railgun Sepolia addresses copied from `shared-models` pass that check (a transcription check, not a liveness check).
10. No dependency on `@ghostpay/core-crypto`: `destination: 'derive-fresh'` is accepted by the type but deriving a fresh address is the caller's job (core-crypto belongs to the web wiring). `@ghostpay/secret-box` is used for the vault key and the root seed.
11. EP-GEN-2 is enforced by a source-scan test (`reader.test.ts`: no `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `process.env` in non-test source) instead of an eslint `no-restricted-globals` rule, because the root `eslint.config.js` is not editable from this lane.
12. The vault implements scrypt + AES-GCM itself (same parameters as `apps/web/src/lib/keystore.ts`); `@ghostpay/secret-box` has no encryption, it only holds the derived key. Records are bound to the vault id and logical key through AAD; storage key names are hashes.
13. `asHex(s)` exists because typed eslint (`no-unnecessary-type-assertion`) and `tsc` disagree about `` `0x${...}` as Hex ``: removing the cast (what `--fix` does) breaks `tsc`.

## Spec items not delivered here

- EP-SUP-1 `THIRD_PARTY.md` generator and GPL fail-closed check; EP-SUP-2 bundle test on `apps/web` (not our directory); EP-SUP-3 CI step; EP-SUP-5 provenance check.
- Test plan item 6 (`scripts/measure-pool-crowd.ts`) and item 7 (runbook with screenshots).
- EP-INT-2 `toSweepOrder`: documentation only, as the spec says.
- EP-3 and EP-4: slots in `EXIT_ROUTE_INFO` only.
- No Solidity is authored in these packages, so `forge fmt`, Slither and Echidna do not apply to them. Contracts used in tests are upstream code compiled outside the repo.

## Open points

- Vault records are only as safe as the passphrase (minimum 10 characters, scrypt 2^17 by default; tests use 2^14).
- `Vault.putNote` refuses to move a note to an earlier state, so a stale writer cannot undo `exited` or `ragequit`; two concurrent writers are not serialised (single-page assumption).
- `lintExit` and `adviseExit` are heuristics. Empty linter output is not a privacy statement.
- Coverage: no file is excluded; see `vitest.config.ts` (unchanged, thresholds 95/90/95/95).
