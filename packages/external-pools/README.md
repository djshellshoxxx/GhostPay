# @ghostpay/external-pools

Interface and shared machinery for letting a seller send funds from a stealth address `S1` through an **existing third-party private pool** and exit to a fresh address. It does not contain a pool, a relayer or a broadcaster. Spec: [`docs/remote/privacy-specs/external-pools.md`](../../docs/remote/privacy-specs/external-pools.md). Wiring and self review: [`wiring/external-pools.md`](../../docs/remote/privacy-specs/wiring/external-pools.md), [`audit-external-pools.md`](../../docs/remote/privacy-specs/audit-external-pools.md).

Status: **testnet-only proof of concept, not wired into any app.** Nothing here has run against Sepolia, Base Sepolia, a wallet, a relayer or a broadcaster. Chains are limited to `31337`, `11155111`, `84532` in code (`assertChainAllowed`). `private`, `UNLICENSED`, ESM.

## What is in it

| Module | What it does | Spec ids |
|---|---|---|
| `types.ts`, `info.ts` | `ExternalPoolAdapter`, `RouteRequest`, `PoolNote`, `ExitRouteInfo`, `EXIT_ROUTE_INFO`, the N1-N6 limit texts (no anonymity claims) | EP-GEN-9, EP-UX-1/3 |
| `guard.ts` | testnet allowlist guard | EP-GEN-1 |
| `manifest.ts`, `manifest-data.ts`, `codehash.ts` | strict hand validator, EIP-55 checksum normalisation, pinned testnet manifest, `eth_getCode` hash check, artifact digest check | EP-GEN-3/4, EP-PP-6, EP-RG-3 |
| `registry.ts`, `planner.ts` | instance registry gated by manifest entry; `planRoute` (explicit route only, `none` = direct sweep control, refuses non-`active` pools, checks every prepared tx is from S1) | EP-GEN-5/7, EP-INT-1 |
| `vault.ts`, `recovery.ts` | encrypted note vault (scrypt + AES-256-GCM, key held in a `SecretBox`), signer-reference lock, scan scopes, proof cache, export/import; recovery driver | EP-VAULT-1..6 |
| `linter.ts`, `timing.ts` | exit linter (amount within 1 %, too soon, linked/GhostPay/reused destination), timing advice (observed counts only) | EP-LINT-1, EP-UX-2/3 |
| `accounting.ts` | `exited + fees == credited` | EP-GEN-8 |
| `adapters/mock/` | `MockPoolAdapter` + `MockPoolLedger`: deterministic fake pool with switches for relayer, indexer, approval list, sunset | EP-M |
| `viem-reader.ts` | `createViemChainReader(clientFor)` (read-only, guarded) | EP-GEN-2 |
| `testkit.ts` | helpers shared with the adapter packages | |

The mock pool provides **no privacy at all** and is labelled `test-double`.

## Use (sketch)

```ts
const registry = new AdapterRegistry(TESTNET_MANIFEST);
registry.register(new MockPoolAdapter(new MockPoolLedger()));
const plan = await planRoute(registry, request, 'mock-pool', { acknowledged: false, vault }); // entryEnabled === false until acknowledged
```

`routeId` has no default: `planRoute(..., undefined)` throws `ROUTE_REQUIRED`.

## Tests (run 2026-10-21, Node 22)

`npm test` in this directory: 94 tests, coverage 99.12 / 96.66 / 99.30 / 100 (statements / branches / functions / lines), thresholds 95/90/95/95 unchanged. One test starts a local `anvil` (`ANVIL_BIN`, default `/home/user/tools/anvil`) and checks EP-GEN-4 against real runtime code set with `anvil_setCode`; it skips with a reason when anvil is missing unless `REQUIRE_ANVIL=1`.

## Not done here

See [DEVIATIONS.md](DEVIATIONS.md): bundle-size test (needs `apps/web`), THIRD_PARTY generator (EP-SUP-1), crowd-measurement script, runbook screenshots, EP-3/EP-4 (documented slots only).
