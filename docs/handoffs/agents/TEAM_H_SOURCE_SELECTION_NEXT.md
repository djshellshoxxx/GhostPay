# Team H follow-on: source selection and proof-policy inventory

Inspected source: worker implementation `7bdfa683cfbec5635ebd1717e730e2a2af09dfde`, plus the existing persistence and BlindBit gRPC adapter milestones. This is an implementation inventory, not a claim that spec 12 is complete.

## Existing behavior and reusable APIs

| Capability | Existing source | What it actually provides |
| --- | --- | --- |
| Own or external Esplora | `apps/web/src/features/btc/esplora.ts`, `BtcView.tsx`, `verification.ts` | User selects an Esplora URL. Using an instance the user runs already supplies the own-server mode A route. The view discloses block/header ranges and outspend queries. |
| Full-block proof checks | `EsploraTweakSource` in `esplora.ts`; package `header.ts`, `rawtx.ts`, `headerchain.ts` | Raw transaction IDs are recomputed and checked against the header Merkle root. Witness data is checked against the BIP-141 coinbase commitment. Header linkage, PoW, difficulty, timestamps and most-work selection are checked from pinned genesis. These checks exist today; do not describe them as absent. They are not full script/consensus validation and cannot defeat withholding/eclipsing of a heavier chain. |
| Abstract sources | `packages/btc-silent-payments/src/scan/types.ts` | `TweakSource.getTipHeight/getTweaks/getOutputs`, optional `getSpends`. Inputs are public heights/signals, never wallet keys, labels or addresses. |
| BlindBit HTTP | `packages/btc-silent-payments/src/scan/blindbit.ts` | `BlindBitClient`, injected transport, bounded responses/deadlines and info/network metadata. The Bitcoin UI does not instantiate it. |
| BlindBit gRPC-Web | `packages/btc-silent-payments/src/scan/blindbitGrpc.ts`, `grpcWebUnary.ts` | `BlindBitGrpcClient` with selected HTTPS proxy, exact expected network, bounded protobuf decoding and response lifecycle. It requires a compatible gRPC-Web proxy; the UI does not instantiate it. |
| Secondary-source check | `packages/btc-silent-payments/src/scan/scanner.ts`, `state.ts` | `scanBlocks` and `resumeScan` accept `crossCheck` and `crossCheckSample`. Matching blocks must agree; configurable sampling can check nonmatching blocks. The web runner currently does not supply these options. |
| Output verification seam | Same `scanner.ts`; `adapter.ts` | `OutputVerifier`, `verifier` and `verifyOutput` hooks. These are extension seams, not a concrete lightweight oracle-proof retriever or SPV implementation. |
| Canonical anchoring | `scan/headersync.ts` and web `headers.ts` | `HeaderAnchoredTweakSource`, `syncHeaderChainFromSources`, locally revalidated `HeaderChain`. The UI currently syncs the selected Esplora source. |

No concrete `OwnNodeTweakSource` class or direct bitcoind JSON-RPC adapter exists in the inspected source. Spec 12 names that desired class, but own-node Esplora already supplies the core own-server privacy and full-block checking route. Assess whether the named direct-RPC backend is required, or whether documenting the existing backend choice satisfies the intended mode A requirement. Do not invent a second transport solely to rename an already-supported route.

## Actionable implementation work

1. Add explicit source selection and exact network/capability checks in `BtcView.tsx`, with disclosures in `verification.ts` and locale/security catalogs. Keep hosted scan-key mode C absent unless its separate ADR is approved.
2. Generalize `scan.ts` away from its hardcoded `EsploraTweakSource` constructor without weakening current full-block verification, canonical anchoring, current unspent checks, bigint amounts or fresh rederivation of persisted matches. Oracle-reported output metadata alone must not become sweep authority.
3. Add typed source commands to `scanWorkerMessages.ts` / `scanWorkerSource.ts` and the corresponding worker-side source construction. The current bridge intentionally permits only Esplora public GET paths. Keep workers network-free, use fixed explicitly chosen endpoint configuration, and introduce bounded read-only RPC/protobuf commands rather than an arbitrary URL/method/body bridge. No key material belongs in a network command.
4. Wire secondary-source agreement and any optional sampling policy through both new-block scans and historical revalidation. Explain that querying only matching heights tells the secondary source which blocks interest the wallet; checking every block changes bandwidth/privacy. Reject source/header disagreement and stale policy/session results.
5. For lightweight oracle-output verification, implement an actual proof retrieval/validation policy using the existing verifier seam, or use an independent full-block Esplora check. Preserve the existing stronger full-block txid/Merkle/witness checks when that route is selected; avoid relabeling a header-only or oracle-only response as verified.

The CAS checkpoint format remains wallet/network scoped. Loading historical records does not authorize spending under any source policy. Revalidate every offered output under the current selected sources and headers; preserve page limits, per-block checkpoint acknowledgments, worker termination, and lock/unmount guards.

## Acceptance that remains distinct

Implementable local evidence includes forged/omitted oracle data, network mismatch, source disagreement, header reorg, canceled/stale source requests, invalid Merkle/witness proofs, response caps, no secrets in network commands and restored-history revalidation. These code tests can be completed without an operator's production endpoint.

External evidence includes running the selected own-node/oracle route against actual regtest bitcoind and a pinned compatible oracle/gRPC-Web proxy, checking authenticated endpoint/CORS deployment behavior, and measuring real-device bandwidth/performance. Those results must not be fabricated from protocol fixtures. Hosted browser execution of the worker acceptance test is separate from protocol integration tests and remains pending in the local socket-restricted environment.
