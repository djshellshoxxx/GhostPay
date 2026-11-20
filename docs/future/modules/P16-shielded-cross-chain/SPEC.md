# P16 — Shielded cross-chain transfer research

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P16` / `shielded-cross-chain` |
| Branch | `future/p16-shielded-cross-chain` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md), [P15](https://github.com/djshellshoxxx/GhostPay/blob/future/p15-anonymous-withdrawals/docs/future/modules/P15-anonymous-withdrawals/SPEC.md) |
| Optional integrations | [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Research objective and provenance

Determine whether a specifically selected protocol can transfer a supported shielded asset across two networks with bounded, user-understood custody, finality and recovery assumptions. A route may remain unsupported. No currently qualified GhostPay bridge or confidential cross-chain implementation is claimed.

Sources: [issue #283 Track D](https://github.com/djshellshoxxx/GhostPay/issues/283), [issue #284 P16](https://github.com/djshellshoxxx/GhostPay/issues/284), and [architecture 5j](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5j.md). P14 provides compatible settlement/note handling; P15 provides recovery/exit analysis. These hard dependencies **do not require a public exit** during normal routing. F14 owns comparison UI and consumes a descriptor; P16 does not import F14.

## 2. Existing implementation and residual gap

- [Pipeline exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/index.ts) includes `validate`, `checkJoin`, `createExecutor`, `createRun`, `reduceStep`, `reducePipeline` and serialization helpers.
- [Pipeline ports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/privacy-pipeline/src/ports.ts) defines `StepDriver`, `HoldingRef`, `PipelineStore`, and explicit emergency-exit descriptions. Its testnet model is reusable orchestration research, not an accepted bridge.
- [External pool exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/index.ts) includes `AdapterRegistry`, `planRoute`, `verifyCodeHashes`, `assertAccounting` and `recoverNotes`.
- [External pool contract](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/types.ts) separates lifecycle, audit status, third parties and independent-exit availability.
- [Pool SDK](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-sdk/src/index.ts) includes note commitments/nullifiers, encrypted note storage and source-chain synchronization; none establishes cross-chain finality.

The gap is protocol selection, authenticated cross-chain message/asset semantics, independent source/destination finality, and proven partial-execution recovery. Reuse adapter conventions after review; do not assemble existing prototypes and label the composition atomic or private.

## 3. Scope and ownership

Own research descriptors, local plan validation, evidence/state models and future protocol adapters. Exclude bridge deployment, new cryptography, liquidity operations, automatic swaps, hosted signing and production asset enablement. P09 is an optional gas-service port; loss of sponsorship cannot change route authority.

Every route documents who holds assets at each stage: user-controlled EOA/note, lock contract, liquidity operator or wrapped-asset issuer. User key ownership does not eliminate contract custody, upgrade/admin powers or bridge committee trust. No mandatory GhostPay-operated backend is allowed.

## 4. Proposed data and API

```ts
interface CrossChainPlanV1 {
  version: 1; routeId: string; protocolVersion: string;
  source: AssetRefV1; destination: AssetRefV1;
  amountIn: string; minimumOut: string;
  intentDigest: string; assetMappingDigest: string;
  sourceFinalityPolicy: string; destinationFinalityPolicy: string;
  timeoutPolicyDigest: string; recoveryDescriptorDigest: string;
}
interface CrossChainStateV1 {
  version: 1; intentDigest: string;
  sourcePhase: 'unsubmitted' | 'pending' | 'final' | 'reorged';
  destinationPhase: 'absent' | 'pending' | 'final' | 'reorged';
  resolution: 'open' | 'unknown' | 'completed' | 'refunded' | 'blocked';
}
interface CrossChainResearchProvider {
  assess(plan: CrossChainPlanV1, ctx: OperationContext):
    Promise<ModuleResult<RouteAssessment>>;
  reconcile(state: CrossChainStateV1, ctx: OperationContext):
    Promise<ModuleResult<CrossChainStateV1>>;
  capability(): CapabilityDescriptorV1;
}
```

Source and destination identify chain/genesis and canonical asset identifiers; symbols are insufficient. Mapping specifies native/wrapped semantics, decimals, conversion/rounding, fees, minimum output and issuer risk. A route identifier is local; avoid unnecessary common on-chain identifiers that correlate hidden stages.

## 5. Lifecycle, partial completion and refund races

1. Compare candidate protocols and document trust/leakage before choosing an adapter ADR.
2. Validate each chain's manifests, assets, finality and recovery prerequisites independently.
3. Back up all user-controlled recovery material before source commitment.
4. Authorize each irreversible stage separately; capture exact plan, fee limits and recipient scope.
5. Source inclusion is not source finality, and source finality is not destination success.
6. Destination evidence must bind the accepted source event/message, mapped asset and authorized output.
7. On delays or discrepancies, retain unknown/blocked state; never issue a second source transfer automatically.
8. Refund/claim paths must enforce mutually exclusive outcomes under the protocol's assumptions, including reorg and message replay.

Wall-clock timers alone cannot authorize refunds. Analyze challenge windows, message inclusion, competing refund/destination execution, finality rollback and operator censorship. If no independently usable recovery path exists, the route is ineligible rather than silently upgraded to a custodial promise.

Lock/browser closure stops new signing, preserving encrypted recovery and public state references. P15 may offer an explicitly chosen public emergency exit with leakage disclosure, but a normal private route must not secretly unshield. Already committed stages cannot be cancelled by UI alone.

## 6. Proposed bounds

Initial research plan: two networks, one asset mapping, at most four irreversible stages, one active attempt per intent and a 64 KiB public descriptor. Reject nested bridges or unbounded route discovery. Proof/message envelopes have protocol-specific documented caps; no allocation before schema/length validation.

Each evidence-read invocation is limited to 20 requests, two in flight and 60 seconds. Expiring a polling budget yields pending/unknown, not failure/refund authority. Proving time/memory and cross-chain settlement deadlines require candidate-specific benchmarks; no universal throughput or completion promise is accepted.

## 7. Privacy, custody and liveness matrix

| Observer / failure | Exposure or authority | Required evidence |
|---|---|---|
| Both public chains | Deposit/exit amount, timing, contracts and messages | Analyze correlation across both domains |
| Bridge committee/operator | Message contents, censorship and possible asset control | Document thresholds, upgrades and compromise assumptions |
| Liquidity/wrapped issuer | Inventory, pricing and redemption authority | Exact asset mapping and insolvency/paused-market behavior |
| RPC/indexers | Queries for source/destination intent | Selected transport, minimal queries and disclosure |
| Recovery path | Possible public exit or refund link | Explicit choice; no automatic privacy downgrade |
| Reorg/message race | Duplicate claim or stranded partial state | Separate finality, anti-replay and terminal-state model |

## 8. Pricing policy

Consume the accepted consumer/P14 quote and optional P09 gas quote; P16 does not own fee arithmetic or recipient selection. Separate source gas, destination gas, bridge/liquidity spread and feature fee. Requote drift requires consent. Refunds distinguish recoverable principal, authorized service charges and already-spent gas; unknown execution cannot trigger duplicate charging. Exact commercial terms remain unresolved.

## 9. Acceptance cases

- **P16-A01:** Unsupported protocol/asset mapping refuses; matching symbols alone never establish equivalence.
- **P16-A02:** Source finality and destination finality advance independently.
- **P16-A03:** Source/destination reorgs invalidate affected evidence without auto-resubmission.
- **P16-A04:** Replayed cross-domain messages cannot mint/claim/refund twice.
- **P16-A05:** Refund-versus-destination race satisfies the selected protocol's exclusive terminal invariant.
- **P16-A06:** Partial success identifies exact holdings and independently usable recovery paths.
- **P16-A07:** Operator outage leaves recoverability truthful; unavailable routes remain blocked.
- **P16-A08:** Normal private routes do not require or silently trigger public exits.
- **P16-A09:** Lock/reload preserves recovery while preventing unattended signatures.
- **P16-A10:** Comparative traces measure cross-chain timing/amount/message leakage and publish negative results.

## 10. Slices and future verification

Slice 1 compares candidates and rejects unsuitable custody/recovery assumptions. Slice 2 models transitions and asset accounting with synthetic fixtures. Slice 3 implements one isolated local/testnet adapter after an accepted ADR. Slice 4 requires independent protocol review, cross-chain failure drills and actual external evidence before any capability is promoted.

Existing checks for later work, **not run here**:

```bash
npm run test -w @ghostpay/privacy-pipeline
npm run typecheck -w @ghostpay/privacy-pipeline
npm run lint -w @ghostpay/privacy-pipeline
npm run test -w @ghostpay/external-pools
npm run test -w @ghostpay/pool-sdk
```

## 11. Migration, rollback and decisions

Version research records by protocol and both chain identities. Rollback disables new starts while preserving reconciliation, independent recovery and encrypted backups of existing partial routes. Unknown legacy adapter data is never interpreted optimistically. Protocol, custody/admin model, asset mapping, timeout/refund authority and external audit remain open decisions. This branch authorizes no bridge, token, service or production deployment.
