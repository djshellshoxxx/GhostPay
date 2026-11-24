# Team H BlindBit gRPC-Web completion handoff — 2026-11-16

Repository: `djshellshoxxx/GhostPay`. Branch: `codex/unified-blindbit-grpc`.
Base: `492cc20d` (unified integration, including transport research handoff).
Implementation: `2fc1d217df42374ad9381df7b4c1b17b3c9b5b6b`.

## Implemented

- Optional `BlindBitGrpcClient` implements the existing block-level `TweakSource` API with unary binary
  `GetInfo`, `GetBlockHashByHeight` and `GetFullBlock`. The original HTTP adapter remains intact.
- Explicit HTTPS endpoint and expected network; immutable captured options; no default host, automatic discovery,
  wallet key/address/outpoint parameters, credentials, redirects, cache or referrer. At most two RPCs in flight.
- Strict unary data/trailer frame order, required successful terminal status, byte/frame/trailer/entry/input bounds,
  absolute abort deadline, cancellation without awaiting hostile cancel hooks, and late-response cleanup.
- Generated protobuf decoding using pinned `@bufbuild/protobuf` 2.17.0, preceded by strict bounded wire preflight.
  Unknown/duplicate singular fields, malformed wire types and impossible integer values fail closed before arrays
  are materialized. Heights are bounded uint32 and satoshis remain bigint.
- Network/storage-mode and block-height/hash consistency checks, little-endian wire hash/txid conversion, curve-point
  validation, flat input shape and duplicate transaction/output identity rejection. Short keys are never used as
  payment amounts, and the adapter does not claim `getSpends` from only eligible transactions.
- Pinned upstream MIT schemas and notice under `packages/btc-silent-payments/proto/blindbit/`, generated descriptor,
  public export, package manifest/lock dependency and package inclusion of the license/provenance directory.

## Evidence

All product evidence below applies to `2fc1d217df42374ad9381df7b4c1b17b3c9b5b6b`:

| Command/scope | Outcome |
|---|---|
| Initial `vitest run src/scan/blindbitGrpc.test.ts --maxWorkers=1` before adapter existed | RED: missing implementation module; no test pass claimed |
| `vitest run src/scan/blindbitGrpc.test.ts src/scan/blindbit.test.ts --maxWorkers=1` | 66 passed / 0 failed in two files (32 new, 34 legacy HTTP) |
| New two-module coverage run with original thresholds | 32 passed; statements 99.58%, branches 98.83%, functions 100%, lines 100% |
| `tsc -p tsconfig.json --noEmit` | Passed |
| `tsc -p tsconfig.build.json` | Passed |
| Focused ESLint over both new product modules and test file | Passed |
| `git diff --check` | Passed |
| Independent Team J rerun | 32/32 passed; no scoped source blocker found |

The new suite includes byte-at-a-time framing, exact cap boundaries, network/storage refusal, malformed status,
truncated/extra/compressed frames, malformed protobuf, oversized fields/counts, cancellation/timeout and late
responses, immutable configuration, bounded concurrency, hash/height substitution, exact maximum satoshi amount,
invalid curve/flat-input data, duplicate outputs and a synthetic BIP-352 scanner payment. Requests in that scanner
fixture contain only empty metadata or block heights, never scan/spend keys or wallet outpoints.

Initial development corrections included a synthetic test expecting grouped outputs from `scanBlocks` (which yields
individual outputs) and explicit optional TypeScript fixture fields. These were fixed and all final checks above reran.

## Independent review and remaining gates

Team J independently inspected the final product changes at `2fc1d217df42374ad9381df7b4c1b17b3c9b5b6b` and reran
32 tests, finding no blocker in the scoped transport/protobuf/output boundary. Fresh final reviewer also inspected
the transport and is recording its final pinned verdict separately. Neither is an external security audit.

This is an optional library API. Browser UI activation, a real HTTPS/CORS gRPC-Web proxy, actual Oracle/regtest
compatibility, real wallet/device acceptance and release qualification remain pending. No gateway was deployed.
Same-oracle network and block-hash agreement are consistency checks, not independent chain verification. Existing
local header/own-node/output verification remains necessary. FullBlock omits ineligible transactions, so its inputs
cannot honestly establish all block spends. Streaming shortened-index optimizations remain separate work.

## Integration

Merge/cherry-pick the implementation plus this handoff. Reconcile only the worker claim in `docs/ai/ACTIVE_WORK.md`
and any concurrent package index/documentation additions. The only new runtime dependency is
`@bufbuild/protobuf` **2.17.0**; lock delta adds its integrity-pinned package and one workspace dependency. No shared
central node_modules installation was changed. The coordinator must install from the integrated lock, rebuild the
BTC package and run combined package/web/build/coverage gates. Never inherit a final-head whole-project pass from
these scoped results.
