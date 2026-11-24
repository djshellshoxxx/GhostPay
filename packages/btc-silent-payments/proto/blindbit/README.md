# BlindBit protobuf provenance

The two definitions are copied byte-for-byte from the MIT-licensed
[blindbit-rs revision 929419b0a348f2826fa9128e0f1db1a00d6af060](https://github.com/setavenger/blindbit-rs/tree/929419b0a348f2826fa9128e0f1db1a00d6af060/blindbit-lib/proto).
The adjacent LICENSE retains the upstream copyright and terms and is included in package files.

- `oracle_service.proto` Git blob: `2e7711052202e62984a7cd7791e717619cd1085a`.
- `indexing_server.proto` Git blob: `671ad59e68d8db3936a8de2736563e3095bf4ee3`.

The schema blobs match the Go library revision `1a34ab63339d69c3b4c1b5855b509f3f8b24cba4`
pinned by Oracle `f9ab7fd8bc35467c492324f743ba1b69049a2bb6`. The copied Rust source supplies the explicit MIT license.

`src/scan/proto/indexing_server_pb.ts` is generated with protoc-gen-es 2.17.0 and uses
`@bufbuild/protobuf` 2.17.0 (Apache-2.0 AND BSD-3-Clause) for schema-based decoding. Buf CLI 1.75.0 produced the descriptor;
the generated file is checked in, so ordinary builds require no network/code generation.

From the repository root, equivalent regeneration uses the pinned tools:

```sh
npm exec --package=@bufbuild/buf@1.75.0 --package=@bufbuild/protoc-gen-es@2.17.0 -- \
  buf generate packages/btc-silent-payments/proto/blindbit \
  --path packages/btc-silent-payments/proto/blindbit/indexing_server.proto \
  --template '{"version":"v2","plugins":[{"local":"protoc-gen-es","out":"packages/btc-silent-payments/src/scan/proto","opt":["target=ts"]}]}'
```

The adapter uses only binary unary `GetInfo`, `GetBlockHashByHeight` and `GetFullBlock`.
It validates generated messages after bounding and preflighting their wire representation. It never treats short
pubkeys as outputs or returns partial eligible-transaction inputs as all block spends. The server's documented
little-endian hash/txid bytes are converted into conventional wallet display order.

No endpoint is bundled. An operator must provide an HTTPS gRPC-Web proxy with CORS in front of the ordinary gRPC
Oracle listener. The adapter is an optional library API and is not enabled in the browser UI. The proxy learns IP
and requested heights. Wallet keys and per-wallet outpoints never enter the adapter. Local protocol fixtures and
synthetic scanner tests do not replace real proxy/oracle/regtest, independent header and wallet acceptance.
