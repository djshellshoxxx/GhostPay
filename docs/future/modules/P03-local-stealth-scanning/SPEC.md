# P03 — Local stealth discovery and private retrieval

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P03` / `local-stealth-scanning` |
| Branch | `future/p03-local-stealth-scanning` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Find stealth payments by matching public announcements locally while minimizing unnecessary address-specific disclosure. Keep retrieval integrity, query privacy and settlement evidence distinct. Users can stop scanning, resume verified progress and understand provider exposure.

Sources: [issue #284 P03](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5c](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5c.md) / [5d](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5d.md). P02 supplies consented transport; P06 supplies scoped viewing-key access. No product-workflow imports.

## 2. Existing implementation and residual delta

- [Source contracts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/scan-source/src/types.ts) defines `PublicLogSource.fetch`, `FetchRequest`, `FetchResult`, `Integrity`, `HeadSource` and bounded `HttpTransport`.
- [Source factory](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/scan-source/src/create.ts) exports `createScanSource`; retained range, indexer, PIR and light-client adapters require their own qualification.
- [Scan client](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanClient.ts) exports `runScan` and `localCheckpointStore`; [scanner core](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scannerCore.ts) provides matching.
- [Checkpoint scoping](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanCursorSlot.ts) exports `checkpointSlot`, `checkpointSlotNamer` and `sessionViewingKey`; retain opaque slot naming.
- [Crypto](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/src/index.ts) exports `checkAnnouncement`; [scan policy](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts) provides `planScan`, `createWindowedScanClient` and `openScanClients`.

The delta is a coherent capability/result contract, query-shape budgets, evidence-aware resume across policy changes, and measurable retrieval privacy. Reuse proven algorithms and sources; do not invent another PIR protocol or infer deployed privacy from package presence.

## 3. Scope and ownership

Own orchestration adapters, normalized public logs and opaque resume records. Existing payment verification owns receipt/transfer proof. Return discovery claims and evidence references with distinct labels. Viewing secrets enter scoped matching only; spend/signing keys never enter workers or requests.

Research modes stay unavailable until integrity and non-collusion assumptions have evidence. Light-client integrity does not automatically hide queries or prove logs. Quorum adds observers. Any post-match address-specific request uses P02 with disclosure; no second hidden provider path.

## 4. Proposed data and API

```ts
interface ScanPlanV1 {
  version: 1; chainId: string; policyRevision: string;
  sourceId: string; sourceKind: 'range' | 'indexer' | 'pir2' | 'light';
  fromBlock: string; toBlock: string; windowBlocks: number;
  requestedIntegrity: 'unverified' | 'quorum' | 'proof';
}
interface ScanCheckpointV1 {
  version: 1; opaqueScope: string; sourcePolicyDigest: string;
  blockNumber: string; blockHash: string; schemaVersion: 1;
}
interface LocalScanProvider {
  plan(input: unknown, ctx: OperationContext): ModuleResult<ScanPlanV1>;
  run(plan: ScanPlanV1, viewing: SecretHandle, ctx: OperationContext):
    AsyncIterable<ModuleResult<ScanProgress>>;
  capability(): CapabilityDescriptorV1;
}
```

`ScanProgress` contains bounded counts, checkpoint candidates and scoped match references, never keys or decrypted invoices. Adapt existing `PublicLogSource` without changing network semantics. Validate quantities before conversion, normalize announcement fields and derive record identity locally from chain position.

## 5. Lifecycle and failure states

1. Plan a consented range; show padding, provider observers and volume.
2. Capture key/session epoch and policy revision; acquire viewing handle and bounded worker.
3. Fetch public windows; validate byte size, coverage, order, duplicate positions and hashes before matching.
4. Match locally; obtain explicitly requested payment evidence through P02.
5. Publish checkpoints only after coverage/integrity checks succeed; never checkpoint past discrepancies.
6. Reorg rolls back to verified common ancestry and invalidates evidence. Missing ancestry requires an explicit restart choice.
7. Lock, cancel, source changes or key replacement abort reads, dispose worker copies and reject late matches/writes.

Repeated windows are idempotent and cannot duplicate counted payments. Omission can remain undetectable without completeness evidence; report that uncertainty. Sleep/wake checks freshness and cancellation before continuing. Imported checkpoints never prove ownership or settlement.

## 6. Proposed limits

Retain stricter current limits. Initial ceilings: 100,000 announcements, 10,000 matches per explicit run, two concurrent windows, 2,000 blocks per initial window and 8 MiB per response. Oversized single blocks produce incomplete coverage, never silent truncation.

Worker batches contain at most 1,000 announcements and yield progress within 250 ms under benchmark load. Budget 64 MiB buffered data, 30 seconds per network window and 8 KiB checkpoint JSON. These proposed limits require mobile measurements; smaller batches cannot weaken validation.

Stable errors distinguish unsupported scheme, stale scope, incomplete coverage, provider discrepancy, invalid checkpoint and cancellation. Diagnostics contain public counters, not match addresses or secret values unless explicitly selected for a reviewed report.

## 7. Privacy and trust matrix

| Observer / failure | Exposure or uncertainty | Treatment |
|---|---|---|
| Log provider | Route, ranges and cadence | Fixed windows and explicit transport |
| Receipt RPC | Matched transaction/address interest | Separate preview; no hidden direct lookup |
| PIR servers | Non-collusion/protocol assumptions | Research disabled until independently qualified |
| Lying indexer | Omitted/fabricated announcements | Validate positions; disclose completeness limits |
| Worker compromise | Temporary viewing capability | No spend key; narrow lifetime and lock cleanup |
| Shared-origin scripts | Process/storage exposure | Dedicated origin; no claim against compromised host |

## 8. Pricing policy

Local matching, cancellation and own-node retrieval incur no automatic GhostPay add-on. Paid retrieval services need separately approved quotes; selecting a source does not authorize payment. P03 has no fee-engine dependency and cannot deduct funds. Existing protocol fees remain unchanged; recovering funds cannot require a paid scanning account.

## 9. Acceptance cases

- **P03-A01:** Known scheme-1 vectors match without keys, view tags or private fields in requests.
- **P03-A02:** Wrong chain/scheme, conflicting positions and invalid points fail within budgets.
- **P03-A03:** Cancelled workers publish no usable late result; stale checkpoint writes fail.
- **P03-A04:** Source-policy changes require checkpoint revalidation.
- **P03-A05:** Reorg invalidates affected status without double-counting repeated windows.
- **P03-A06:** Disagreement stops before disputed progress is committed.
- **P03-A07:** Oversized logs report incomplete coverage, not zero balance/success.
- **P03-A08:** Announcements remain claims until exact payment evidence exists.
- **P03-A09:** Traces measure range and post-match disclosures separately; labels match evidence.
- **P03-A10:** Browser-process restart restores only validated source-scoped progress.

## 10. Implementation slices and future checks

Slice 1 adapts existing contracts and identity fixtures. Slice 2 adds epoch-safe orchestration/resume. Slice 3 maps query disclosures and payment evidence. Slice 4 independently qualifies reorgs, lifecycle and optional live sources.

Existing commands for future implementation; **not run here**:

```bash
npm run test -w @ghostpay/core-crypto
npm run test -w @ghostpay/scan-source
npm run typecheck -w @ghostpay/scan-source
npm run lint -w @ghostpay/scan-source
npm run test -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Version/preview checkpoint migration; legacy progress is untrusted until revalidated. Rollback retains encrypted records and allows fresh bounded scans without deleting keys. Decide source combinations, leakage budgets and completeness proof before activation. Hosted scan keys, new chain algorithms and production support require separate decisions. Record actual browser/device/source versions and unavailable gates.
