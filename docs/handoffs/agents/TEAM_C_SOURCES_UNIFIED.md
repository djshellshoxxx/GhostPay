# Team C/D configured relayer source checks

Date: 2026-11-16. Worker: `relayer_sources`. Branch: `codex/unified-relayer-sources`.
Base: `ccd7721a797ae8b1d73adfd8568c7227d5a356c9`.
Claim: `6cecd557`. Initial implementation: `833f5fb707ebc0e22239aa74d34686651f5c7da6`.
Final source and independent review pin: `87f3dd504de5de8a2fe27d0215429ccaa7520da3`.
Later handoff and browser-response clarification edits are documentation only.

## Completed behavior

- Optional `secondaryRpcUrl` or `secondaryRpcUrlEnv` supplies a second actual provider. The validated normalized
  URLs must differ. Both sources use existing chain-adapter clients with startup and periodic chain-id checks,
  10-second request deadlines, 64 KiB streamed response caps and no transport retries. No endpoint is selected by default.
- Quote admission and sweep execution compare both providers at the same common finalized height. Block number,
  hash, parent hash and timestamp must agree. A mismatch yields `rpc_disagree`; unavailable/missing headers,
  insufficient finality and tip lag greater than configured finality depth yield `rpc_unavailable`. The latter are
  not evidence of a fork. Checks coalesce concurrent calls per configured chain but do not cache completed results.
- Optional `nativeUsdFeed: { "maxAgeSeconds": 300 }` replaces the existing explicit `nativeUsdPrice` mode.
  Configuration accepts exactly one mode, selects only an existing native-symbol/USD registry entry with pinned
  decimals, and refuses missing entries. There is no arbitrary-address override or inferred mainnet feed.
- Feed pricing uses `createAggregatorReader` and `readPrice`: positive/complete rounds, actual source timestamps,
  configured decimals, no future timestamp tolerance, explicit maximum age and exact bigint ceil conversion.
  Configured feed failure never falls back to a fixed constant. Completed prices are not cached.
- The existing HMAC-authenticated quote expiry is capped at the actual feed-validity deadline. Execution rereads
  pricing and retains the final conversion's deadline through nonce acquisition and signing. The synchronous
  pre-broadcast hook refuses expired evidence, releases reservations and preserves neutral breaker/owner accounting.
  No signed quote schema, signing authority, transaction authority or contract ABI changed.
- `rpc_disagree` and `price_stale` alerts now derive from those real inputs. The price-age gauge ages the last
  observed configured-feed timestamp and has no fixed-price/unread-feed sample. Fixed-label counters record
  comparisons, mismatches and stale evidence. Alerts expose configured chain IDs, not provider URLs, headers,
  addresses, transactions or amounts. Existing webhook bounds/dedupe apply.

## Verification

All listed final checks ran on the final source pin, using the dependency worker's npm-10 installation with local
workspace package links. No package manifest or lockfile changed. The initial direct build failed because shared
workspace links had no built exports; local workspace links and the normal dependency-first build resolved it.

| Check | Result |
| --- | --- |
| New source-check and feed-source modules before implementation | Each failed at module loading because its implementation did not yet exist; this is scaffolding red evidence, not a behavioral failure. |
| Source API tests with baseline `service.ts`, then restored final source | Baseline: 4 failed / 2 passed. Failures proved missing feed-bounded expiry, quote/sweep provider checks and valid comparison calls. |
| Reviewer timing regression on `833f5fb7` | Both nonce-delay and signing-delay cases wrongly returned 200; 2 failed / 6 filtered. |
| Corrected source API suite | 8/8 passed; proves no signed/broadcast transaction, zero reserved budget, closed breaker, fixed stale alert and successful fresh-feed retry with the same nonce. |
| Independent reviewer focused rerun | `sourceChecks`, `feedPricing`, `sources.api`: 29/29 passed at `87f3dd50`. No remaining scoped blocker. |
| Final full relayer coverage, `REQUIRE_ANVIL=1` | 18 files, 475 tests passed; zero skips. Statements 97.04% (2296/2366), branches 92.56% (1494/1614), functions 98.03% (399/407), lines 98.86% (1910/1932). Original thresholds unchanged. |
| Relayer TypeScript check | Passed. |
| Full relayer ESLint | Passed with 2 GiB V8 heap cap. |
| Normal `npm run build -w @ghostpay/relayer` | Passed, including core-crypto, invoice-schema, chain-adapters and relayer-guard dependency builds. |
| `git diff --check` | Passed. |

Final coverage command from the isolated worktree:

```sh
NODE_OPTIONS=--max-old-space-size=1536 \
ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil REQUIRE_ANVIL=1 \
node_modules/.bin/vitest run \
  --config /workspace/scratch/a9f2ae0b1bda/ghostpay-relayer-sources/apps/relayer/vitest.config.ts \
  --root apps/relayer --coverage --maxWorkers=1 --no-file-parallelism
```

Logs in this execution environment: `/tmp/ghostpay-relayer-service-red.log`,
`/tmp/ghostpay-relayer-expiry-red.log`, `/tmp/ghostpay-relayer-expiry-green.log`,
`/tmp/ghostpay-relayer-sources-final-coverage.log`, `/tmp/ghostpay-relayer-sources-final-lint.log`,
`/tmp/ghostpay-relayer-sources-final-build.log`.
The native harness uses the coordinator's existing contract artifacts; both worktrees have contract source tree
`5b738494f0b144337ab50d3c66e589e984649cdd`. Artifact/dependency links and generated build outputs are not committed.
Native coverage qualifies the existing local send/replay/permit/recovery paths, not a live external feed or provider pair.

## Boundaries and remaining gates

- Distinct provider URLs do not prove different infrastructure. Header agreement does not prove agreement about
  arbitrary contract state, feed state or later reorganization. External provider/fork and live feed acceptance remain pending.
- Registry native/USD entries currently cover supported testnets. No mainnet feed provenance, deployment matrix
  cell, heartbeat recommendation or network enablement was fabricated. Existing explicit fixed pricing is preserved;
  neither mode establishes mainnet release qualification.
- `readPrice`'s optional sequencer/reference/peg guards are available in chain-adapters but are not silently activated
  here. Production source pins, appropriate maximum ages and the relayer configuration for those protections remain gates.
- The proposed signed `priceRoundId` requires a precise protocol decision: define the round/source commitment,
  its HMAC serialization/versioning and compatibility/verification rules in the relayer quote payload and all consumers.
  This change instead authenticates the existing fee and bounded expiry and obtains fresh execution evidence.
- Supported fee tokens still use the existing nominal USD-parity assumption. No token depeg authority or new price quorum is claimed.
- Public 503 errors remain conservatively uncertain in the browser. Server-side refusal does not authenticate an
  arbitrary intermediary response, so this work grants no automatic client retry authority.
- Parent coordinator owns combined-head CI and master spec-status reconciliation. The historical missing-input
  bullets in `TEAM_C_UNIFIED.md` describe its older source pin; this handoff supersedes those two local source gaps.
  No deployment, remote push, mainnet transaction or external monitoring receiver qualification occurred.
