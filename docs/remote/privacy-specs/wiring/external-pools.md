# Wiring: `@ghostpay/external-pools`, `-privacypools`, `-railgun` (swarm 10 -> swarm 4)

Status: built 2026-10-21 on `claude/remote-extensions-10`, **not wired anywhere**. Testnet PoC (31337, 11155111, 84532).
Verified on a local anvil only (section 7). **No Privacy Pools or Railgun testnet interaction has happened**; both shipped
manifest entries are `unverified`, so in a built app the pool routes report lifecycle `unknown` and refuse entry until an
operator pins addresses and code hashes (section 4). The Railgun SDK glue does not exist yet (section 6).

## 1. Package roles and dependency rules

| Package | Licence status | Imports | Must not be imported by |
|---|---|---|---|
| `packages/external-pools` | UNLICENSED, no third-party SDK | `secret-box`, `viem` 2.57.7, `@noble/hashes` 2.4.0 | nothing restricted |
| `packages/external-pools-privacypools` | UNLICENSED; **its dependency closure contains GPL-3.0 `snarkjs`** (OWNER DECISION) | `external-pools`, `viem`, `@noble/hashes`, `@0xbow/privacy-pools-core-sdk` 1.5.0 (dynamic `import()` in `sdk-crypto.ts` only), `@scure/bip39`, `@zk-kit/poseidon-cipher` | any chunk of `apps/web` except the lazily loaded pool-route chunk |
| `packages/external-pools-railgun` | UNLICENSED, no Railgun SDK dependency | `external-pools`, `viem`, `@noble/hashes` | nothing restricted |

`external-pools` never imports an adapter package. The default route (`EP-0`, direct sweep) must not pull any of the three into the entry chunk.

## 2. Exact edits in existing code (for swarm 4; none made here)

| File | Edit |
|---|---|
| root `package.json` | `build:libs` add `-w @ghostpay/secret-box -w @ghostpay/external-pools` (the `external-pools` build script already builds `secret-box`). Adapter packages build from their own scripts (`npm run build -w ...`). `npm ci --ignore-scripts` is unchanged and sufficient. |
| `.github/workflows/ci.yml` | The `rest` test matrix already covers `packages/*`; the three packages pass without anvil, circuits or contract builds (those tests skip with a printed reason). Add an optional job `ext-pools-anvil`: install Foundry, `git clone` `0xbow-io/privacy-pools-core` at `d494b63e79f33bb2b0c8ece6cdacdca465c3b884` and `Railgun-Privacy/contract` at `36bcf5ed7cf94bfafb6e1a303e1832c769c16780` into a temp dir, `npm pack` the Solidity dependencies listed in the package READMEs, `forge build` with `solc 0.8.28`, download the six circuit artifacts and check their SHA-256 against `TESTNET_MANIFEST`, then run the three packages with `PP_CONTRACTS_OUT`, `PP_ARTIFACT_DIR`, `RG_CONTRACTS_OUT`, `REQUIRE_ANVIL=1`. About 2 minutes, 20 MB download. GPL verifier sources are compiled in the temp dir and never committed. |
| `apps/web/src/lib/settings.ts` | Add `exitRoute: 'none' \| 'privacy-pools' \| 'railgun' \| 'mock-pool'` (default `'none'`, never auto-changed: EP-GEN-7). `mock-pool` only in dev builds (`import.meta.env.DEV`). Keep `exitRoute` per chain. |
| `apps/web/src/views/Settings.tsx` | Radio group "Sweep exit" fed by `EXIT_ROUTE_INFO` (names, `maturity`, `independentExit`, `needsLiveThirdParty`, `auditStatus`, `whatItDoesNotHide`). Entries with `available: false` render disabled with `unavailableReason`. Show the manifest-derived `lifecycle` from `adapter.health(chainId)`. Never show a numeric anonymity figure (EP-UX-3); the only number is `adviseExit(...).text`. |
| `apps/web/src/lib/sweep.ts` | Where the direct sweep is built (after `checkDestination`), branch on `exitRoute`. For a pool route: (1) `planRoute(registry, request, route, { acknowledged, vault })` with `request.stealth.signer` backed by `deriveVerifiedSweepKey` (sign with `signDigest`/`serializeTransaction`; `signMessage` is needed for Railgun); (2) show `plan.warnings` and require the acknowledgement checkbox; (3) send `plan.steps[*].tx` from S1 in order (S1 needs native gas: this is N3, show it unless a sponsor from `payer-sponsor.md` funds it); (4) after the receipt (counted confirmations) `adapter.recordEntry(request, plan.quote, receipt)`, then `vault.putNote(note)` and `vault.registerSigner(S1, '<derivation ref>')`. Do not call the relayer-sponsored sweep for pool routes: Privacy Pools needs `msg.sender == S1` for `ragequit`. |
| `apps/web/src/views/Sweep.tsx` (new section "Pool notes") | List `vault.listNotes()`; per note: state, `adviseExit` text, `lintExit` warnings before Exit (EP-UX-4), "Exit" (`quoteExit` -> show fee and `destinationSeen` -> `executeExit`) and an always-visible "Emergency exit" (`prepareEmergencyExit`, then send from S1). After an exit call `vault.setState(noteId, result.newState)`. Destination: fresh address from the hygiene module or user supplied; never reuse (`lintExit` flags reuse). |
| `apps/web/src/lib/keystore.ts` (or a new `poolVault.ts`) | Create the vault with `Vault.create(new IdbVaultStorage(), passphrase)` (implement `VaultStorage` over `idbStore.ts`; values are already ciphertext). Separate passphrase from the keystore's is recommended. `vault.lock()` on session end. Never put the root seed in `localStorage`. |
| hygiene "rotate and forget" code (`hygiene.md` HY-*) | Call `vault.purgeSigner(S1)` instead of deleting the stealth key; it throws `KEY_REQUIRED_FOR_NOTE` while a note is live (EP-VAULT-3, R5). |
| `apps/web/vite.config.ts`, `scripts/scan-bundle.mjs` | Load the adapter packages and the Privacy Pools SDK only through `import()` behind the route selection; fail the bundle scan if `@0xbow/privacy-pools-core-sdk`, `snarkjs`, `maci-crypto` or `poseidon-cipher` appear in the entry chunk (EP-SUP-2; not tested here because `apps/web` is outside this lane). Circuit artifacts are served as separate files; the app reads their bytes and passes them to `createSdkCrypto`. |
| `apps/web` CSP (`index.html`, `_headers`) | `connect-src`: only the relayer origins listed in the manifest entry plus the user's RPC. `script-src 'wasm-unsafe-eval'` for snarkjs. `worker-src 'self' blob:` if proving runs in a Worker (recommended: proving blocks the main thread for seconds). |
| `docs/user/privacy-limits.md` | Add the six limits from `LIMIT_TEXT` (N1-N6) verbatim as the pool-exit section. |
| `THIRD_PARTY.md` | Rows from `docs/remote/third-party-additions.md` (SDK, GPL `snarkjs` family flagged OWNER DECISION, `maci-crypto` licence field missing, `@zk-kit/poseidon-cipher`, `@scure/bip39`). |
| `packages/chain-adapters/src/config/chains.ts` | Optional: nothing needed. Pool addresses stay in the external-pools manifest (EP-GEN-3), not in chain config. |

## 3. UI option -> API map

| UI action | Calls |
|---|---|
| open Settings | `registry.get(route, chainId)` (throws `ROUTE_NOT_AVAILABLE` without a manifest entry), `adapter.info()`, `adapter.health(chainId)` |
| plan | `planRoute(registry, request, route, { acknowledged, vault })` |
| Enter | sign and send `plan.steps[i].tx`; `adapter.recordEntry`; `vault.putNote` |
| wait | `adviseExit(observedDepositsSince, elapsedSec)` (counts only) |
| Exit | `lintExit(...)`, `adapter.quoteExit(note, { destination, maxFeeBps, rootSeed })`, `adapter.executeExit(note, quote, transport)` |
| Emergency exit | `adapter.prepareEmergencyExit(note, rootSeed)` (Privacy Pools ignores the seed; Railgun needs it) |
| self-broadcast (N3 ticked) | Privacy Pools `prepareSelfRelayExit(note, quote, from)`; Railgun `prepareSelfUnshield(note, quote, from)`; both need `quoteExit(..., { selfBroadcast: true, ackN3: true })` first |
| restore on a new device | `Vault.importBundle` or `recoverNotes(adapters, rootSeed, scan, vault)`; if it reports errors the scope is incomplete and `planRoute` (with `vault`) refuses new deposits |
| ERC-20 allowance cleanup | Privacy Pools `adapter.prepareAllowanceCleanup(chainId, token, S1)` |

`ExitTransport.fetch` must be the same function `network-privacy.md` supplies; the adapters call nothing else (EP-GEN-2, checked by a source scan). Relayers: only hosts listed in the manifest entry (`allowCustomRelayer` is a developer flag, default false).

## 4. Promoting a manifest entry from `unverified` to `verified` (operator procedure)

1. Privacy Pools: obtain the `Entrypoint` proxy and pool addresses from a source you trust (the project's own docs or a deployment you made), then read `eth_getCode` from a node you trust and compute `keccak256`. The pool must report `ENTRYPOINT()` = the proxy and `ASSET()` as expected; `Entrypoint.assetConfig(asset).pool` must equal the pool.
2. Railgun: the Sepolia proxy and relay-adapt addresses are already in `manifest-data.ts` (copied from `shared-models`); read the runtime code hashes of `proxy` and `relayAdapt` from a trusted node. Also confirm that the deployed proxy exposes the v2 ABI in `abi-reference.json` (`shieldFee()` returns, `shield` selector `0x044a40c3`).
3. Add `codeHashes` for **every** listed contract, change `status` to `verified`, list relayer base URLs (https, or `http://127.0.0.1` for local), commit with the source URLs.
4. Run the anvil tests for the adapter you changed. A mismatch of any code hash at run time makes the adapter refuse entry (`CODE_HASH_MISMATCH`).

## 5. Privacy Pools specifics the app must supply

- `AspSource` (association set fetcher): the official endpoint is not documented in the sources read (spec Q3, [UNVERIFIED]). The adapter checks the result against `Entrypoint.latestRoot()`.
- Circuit artifact bytes (six files, SHA-256 pinned in the manifest) through `createSdkCrypto(provider)`.
- `startIndex` = number of notes already held, so entry probes do not scan used indexes (`maxProbes` default 3).
- Cache: after a successful scan call `vault.putCache(noteId, encodeProofCache({ stateLeaves, aspLeaves }))` and pass `cache: (id) => vault.getCache(id)` to the adapter; the proof can then be built offline (EP-VAULT-5).
- The Privacy Pools relayer sees recipient, amount and the client's address (N4). The adapter asks **every** manifest relayer for `/relayer/details` to pick the cheapest, so with several relayers all of them learn the client address and asset. Prefer one relayer per profile in the manifest.

## 6. Railgun: what is missing

`RailgunWalletPort` has no real implementation. Needed (effort M): engine bootstrap (`startRailgunEngine`, artifact store with SHA-256 check against the manifest, LevelDB/IndexedDB, quick-sync), `createRailgunWallet` from the 16 HKDF bytes (mnemonic inside the glue, encryption key from the vault key), `populateShield`, `generateUnshieldProof` + `populateProvedUnshield` (broadcaster and `sendWithPublicWallet` variants), a Waku broadcaster client, a POI status lookup, `ownsShield` and `scanShields` from the wallet's own history. The adapter already re-checks the SDK's shield and unshield transactions; the glue must still run the engine in a Worker (EP-RG-1).

## 7. What was run

See `audit-external-pools.md` section 1. Short form: unit, property and mock-pool tests for all three packages (thresholds met); the real upstream Privacy Pools contracts (commit `d494b63`) with real circuits and a real Groth16 verifier on anvil (deposit, relayed withdrawal, ragequit, self-relay, recovery); the real Railgun v2 contract (master `36bcf5e`) on anvil for entry only.

## 8. Not done

Bundle test on `apps/web`; THIRD_PARTY generator; the Railgun glue; any run against Sepolia; the in-app UI; the `scripts/measure-pool-crowd.ts` crowd measurement; a runbook with screenshots.
