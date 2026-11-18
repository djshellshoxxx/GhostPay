# BlindBit gRPC-Web adapter implementation handoff — 2026-11-16

This read-only compatibility check does not configure an endpoint or enable funds. Preserve the existing HTTP
compatibility path and implement an optional transport beside it. Live acceptance is a separate external gate;
mocked protocol parsing and fail-closed adapter behavior can be implemented now.

## Exact upstream sources and reuse

| Source | Revision | Verified evidence |
|---|---|---|
| [BlindBit Oracle](https://github.com/setavenger/blindbit-oracle/tree/f9ab7fd8bc35467c492324f743ba1b69049a2bb6) | `f9ab7fd8bc35467c492324f743ba1b69049a2bb6` | [go.mod](https://github.com/setavenger/blindbit-oracle/blob/f9ab7fd8bc35467c492324f743ba1b69049a2bb6/go.mod) pins Go blindbit-lib pseudo-version `v0.0.2-0.20251019163107-1a34ab63339d`. Oracle itself has an MIT license. |
| [Go schema source](https://github.com/setavenger/blindbit-lib/tree/1a34ab63339d69c3b4c1b5855b509f3f8b24cba4/proto) | `1a34ab63339d69c3b4c1b5855b509f3f8b24cba4` | No LICENSE/COPYING file in its fetched recursive tree; do not infer its permission from another repository. |
| [Rust schema copy](https://github.com/setavenger/blindbit-rs/tree/929419b0a348f2826fa9128e0f1db1a00d6af060/blindbit-lib/proto) | `929419b0a348f2826fa9128e0f1db1a00d6af060` | [MIT LICENSE](https://github.com/setavenger/blindbit-rs/blob/929419b0a348f2826fa9128e0f1db1a00d6af060/LICENSE), copyright 2026 Setor. Both protobuf blobs exactly match the pinned Go source. Reuse this licensed copy with its notice. |

Verified Git blob IDs: `oracle_service.proto` = `2e7711052202e62984a7cd7791e717619cd1085a`;
`indexing_server.proto` = `671ad59e68d8db3936a8de2736563e3095bf4ee3`. No upstream source has been copied yet.

## Transport boundary

The [pinned Oracle server](https://github.com/setavenger/blindbit-oracle/blob/f9ab7fd8bc35467c492324f743ba1b69049a2bb6/internal/server/v2/server.go)
constructs `grpc.NewServer()` and serves a TCP listener. It has no gRPC-Web wrapper. The official
[gRPC-Web README](https://github.com/grpc/grpc-web/blob/master/README.md), retrieved 2026-11-16, requires a proxy
between browser clients and ordinary gRPC and supports server streaming through `grpcwebtext`; unary calls also
support binary `grpcweb`. Therefore the existing static browser cannot call this raw upstream listener directly.
An operator-provided HTTPS endpoint with gRPC-Web and correct CORS is an external prerequisite. Do not add a default
host, hosted server, automatic discovery request or scan-key upload. A same-origin proxy is not implicitly private;
it learns client requests and block ranges.

## Implementable adapter

Add an optional source beside `packages/btc-silent-payments/src/scan/blindbit.ts`, using existing `TweakSource` and
injected bounded transport seams. Vendor only the two verified MIT protobuf definitions and notice, or generate
and pin equivalent types with provenance. Prefer an established compatible protobuf runtime if already present;
do not hand-roll a permissive decoder. Preserve `uint64` as bigint until explicit bounded height conversion.

The [pinned API documentation](https://github.com/setavenger/blindbit-oracle/blob/f9ab7fd8bc35467c492324f743ba1b69049a2bb6/internal/server/GRPC.md)
and schema expose `blindbit.oracle.v1.OracleService`:

- `GetInfo` supplies network, height and storage-mode flags. Enforce the requested wallet network.
- `GetBlockHashByHeight` and `GetFullBlock` provide canonical identity and complete output amounts/pubkeys.
- `StreamComputeIndex` and `StreamBlockScanDataShort` supply shortened output candidates. They are not sufficient
  by themselves to create a payment amount or full spendable output.
- The documented hash/txid byte order is little-endian; prove conversion with fixed known-block fixtures rather
  than inheriting the HTTP client's previously unverified convention. Tweaks are 33 bytes, full output keys 32 bytes,
  shortened keys 8 bytes, input outpoints 36 bytes, and amounts uint64 satoshis. `dustlimit`/`cut_through` are reserved
  in this server revision; do not treat these fields as an enforced filter.

Cap frame bytes, messages, total bytes, range size, outputs, tweaks and in-flight work before materializing arrays.
Reject nonzero/missing gRPC trailers, truncated/malformed frames, duplicate or out-of-order heights, wrong block
identity, invalid curve points, bad flat-array lengths, integer overflow and ambiguous output identity. Abort and
release the response on cancellation, timeout or cap breach. Treat short spent-key collisions as candidates only.
Never send wallet keys or per-wallet outpoints to the oracle. Keep current header/SPV checks and local match logic.

## Acceptance

A focused fake gRPC-Web receiver should exercise unary success, byte-at-a-time frames, exact bounds, forged status,
missing trailer, malformed protobuf, stalled transport/cancel, hash/txid order, full-output amount fidelity,
network mismatch and output/tweak substitution. Confirm scan-key bytes never enter requests. Keep the adapter
opt-in and unqualified for real funds until a configured proxy/oracle passes regtest scanning, restart and reorg
acceptance with source identity. No such proxy endpoint or real oracle was tested in this review.
