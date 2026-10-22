# Wiring: `@ghostpay/pool-sdk`, `@ghostpay/pool-prover`, `@ghostpay/pool-relayer` (swarm 10 -> swarm 4)

Status: built 2026-10-21 on `claude/remote-extensions-10`, **not wired anywhere**. Testnet PoC (31337, 11155111, 84532).
Nothing here has run against a public chain, a real wallet, a browser or a hosted relayer. The circuits use an **insecure dev
ceremony** (anyone can forge proofs); see `wiring/pool-circuits.md`.

Contracts of record: `packages/pool-contracts` (pool ABI = spec 6.1), circuits of record: `packages/pool-circuits/INTERFACE.md`.

## 1. Package roles and dependency rules

| Package | Licence status | Imports | Must not be imported by |
|---|---|---|---|
| `packages/pool-sdk` | UNLICENSED, no GPL code | `core-crypto`, `secret-box`, `viem`, `poseidon-lite`, `@zk-kit/lean-imt`, `@noble/hashes` | nothing restricted |
| `packages/pool-prover` | **GPL-3.0 (snarkjs)**, isolated | `snarkjs` (dynamic `import()`), `@noble/hashes` | any non-pool chunk of `apps/web`; `pool-sdk` |
| `packages/pool-relayer` | pulls GPL through `pool-prover` | `pool-sdk`, `pool-prover`, `relayer-guard`, `viem` | `apps/web` |

`pool-sdk` never imports the prover. The web app loads the prover only when the user picks a pool option (dynamic `import()` plus a Worker).

## 2. Exact edits in existing code (for swarm 4; none made here)

| File | Edit |
|---|---|
| root `package.json` | none. `packages/*` is already a workspace glob. `build:libs` should add `-w @ghostpay/secret-box -w @ghostpay/relayer-guard -w @ghostpay/pool-sdk -w @ghostpay/pool-prover` before `pool-relayer` typechecks (packages resolve each other through `dist/`; vitest in these packages aliases to `src/` so tests need no build, `tsc` does). |
| `.github/workflows/ci.yml` | `ts-test` `rest` entry already covers `packages/*`; the three new packages pass without circom or anvil (e2e and circuit tests skip with a printed reason). Add a job `pool-e2e`: `forge build` in `packages/pool-contracts`, `npm run build:circuits -w @ghostpay/pool-circuits`, then `npm test -w @ghostpay/pool-relayer` with `ANVIL_BIN` set and `REQUIRE_POOL_E2E=1` (`e2e.anvil.test.ts` throws instead of skipping when `REQUIRE_POOL_E2E=1` and a prerequisite is missing). |
| `packages/chain-adapters/src/config/deployments.ts`, `deployments/schema.json` | Optional `shieldedPools: [{ chainId, asset, pool, withdrawVerifier, ragequitVerifier, registry, announcer, deploymentBlock, codeHash }]`. The SDK takes `pool` and `deploymentBlock` from there (`syncPool(rpc, pool, deploymentBlock)`). Read back `eth_getCode` hash of the pool and verifiers like the router (S3-01) before showing any pool option (SP-UI-1). |
| `apps/web/src/lib/scanClient.ts` line ~125 | `viaRouter: announcement.caller === router` is false for SP-PAY announcements (caller is the pool). Add `|| manifest.shieldedPools.some(p => p.pool === caller)` so pool-originated announcements are treated as contract-validated (the pool checks the 57-byte metadata and that `net == withdrawnValue - fee`). Spec Q6 answer: the scanner does not filter by caller, it only labels amounts. |
| `apps/web/src/lib/settings.ts` | Add to `Settings`: `pool: { enabled: boolean; relayerUrl: string; aspMode: 'none' \| { publisher, setUri }; submit: 'relayer' \| 'self'; delayHours: [min, max]; minCrowd: number }`. Validate `pool.relayerUrl` with the same rules as `checkRelayerUrl` (the SDK client additionally refuses non-loopback `http`). Defaults: `enabled: false`, `aspMode: none`, `submit: relayer`, 24-72 h, `minCrowd: 50`. |
| `apps/web/src/views/Settings.tsx` | Group "Shielded pool (testnet PoC)", hidden unless the manifest has a pool for the active chain. Render `LIMIT_COPY` N1-N9 and `TEST_POOL_LINE` from `@ghostpay/pool-sdk` verbatim. |
| `apps/web/src/views/Sweep.tsx` | Option `SP-EXIT`: (1) deposit step: `planDeposit(withSeed, chainId, pool, nextIndex, value)` from the spending-secret `secret-box` scope (`(f) => box.use(f)`), send `data` to the pool from the stealth key; (2) after the user delay: `syncPool` + `assertRootMatches` + `recoverNotes`, `RelayerClient.quote`, `prepareWithdrawal({ option: 'SP-EXIT', forbiddenRecipients: [S1 list, used destinations] ... })` with a fresh hygiene destination, show crowd (`prepared.crowd`) and require a second confirmation if `CROWD_TOO_SMALL` was raised, prove in the Worker (`new Worker(new URL('@ghostpay/pool-prover/dist/worker.js', import.meta.url))`), `assertSignals`, `PoolRelayerClient.relay`. Self-submit: `encodeWithdrawCall` and send from a funded address with the SP-UI-4 warning. |
| `apps/web/src/views/Pay.tsx` | Option `SP-PAY`: `buildSpPayAnnounce(sellerMeta, undefined, token, withdrawnValue - fee)`, then as above with `option: 'SP-PAY'`. |
| `apps/web/src/lib/keystore.ts` | Store the encrypted note index (`sealNotes`) next to the keystore blob; for payers without GhostPay keys store `exportSeedEncrypted` output instead (the seed is a bearer secret for every note). Notes are always re-derivable (`recoverNotes`), so losing the index is not losing funds. |
| `apps/web/vite.config.ts` and `scripts/scan-bundle.mjs` | Put `@ghostpay/pool-prover` and `snarkjs` in a separate async chunk; the bundle scan must fail if `snarkjs` appears in the entry chunk. Serve `withdraw32.wasm` and `withdraw32_final.zkey` (about tens of MB) as static files with the SHA-256 values from `packages/pool-circuits/SHA256SUMS`, labelled `INSECURE-LOCAL`. |
| `apps/web` CSP (`index.html`, `_headers`) | `connect-src` needs the relayer origin and the artifact origin; `script-src` `'wasm-unsafe-eval'` for snarkjs WASM; `worker-src 'self' blob:`. |
| `THIRD_PARTY.md` | Rows from `docs/remote/third-party-additions.md` (poseidon-lite, @zk-kit/lean-imt, @noble/hashes use, snarkjs runtime). |
| `docs/user/privacy-limits.md` | Add the N1-N9 summary (`LIMIT_COPY` is the source text). |

## 3. Option -> API map

| UI option | Calls |
|---|---|
| `SP-EXIT` deposit | `planDeposit` -> sign/send `data` to pool (ERC-20: approve first; no permit helper yet) |
| `SP-EXIT` withdraw | `syncPool`, `assertRootMatches`, `recoverNotes`, `quote`, `prepareWithdrawal`, `prove`, `assertSignals`, `relay` |
| `SP-PAY` | as above plus `buildSpPayAnnounce` |
| `SP-RQ` | `prepareRagequit`, `prove({ kind: 'commitment' })`, `encodeRagequitCall`, send from the original depositor address |
| association set | fetch `set.json`, `verifyAspSet(json, registry.latest(publisher).root)`, pass `labels` in `asp: { kind: 'publisher', ... }` |

## 4. Operating the relayer (testnet)

`node packages/pool-relayer/dist/main.js` with `POOL_RELAYER_KEY` (testnet-only hot key), `POOL_RELAYER_FEE_TO`,
`POOL_RELAYER_POOLS` (JSON with rpcUrl and fee-asset rate), `POOL_RELAYER_VKEY` (`packages/pool-circuits/vkeys/withdraw32.vkey.json`),
optional host/port/origins/proxies (full list in `src/main.ts`). Binds `127.0.0.1:8788` by default. No hosting is configured or
suggested here (README "Hosting" stays true). `PRIVACY.md` in the package is the operator disclosure.

## 5. Not done / open

- No browser run: Worker entry, CSP and artifact sizes untested; proving time in a browser not measured.
- No `depositWithPermit` client builder (spec `permit-sponsored` deposit gas option), no `asp-cli`, no `set.json` publisher.
- Hot-key balance floor exists (`checkHotKeys`, probed every 30 s from `main.ts`) but was only unit-tested; no nonce persistence.
- The Hermez ptau and a multi-party phase 2 are out of scope; keys are forgeable (see circuits wiring doc).
- Licence: snarkjs (GPL-3.0) inside `pool-prover` under an `UNLICENSED` repo is an OWNER DECISION, flagged not resolved.
