# P19 — Optional self-hosted fee enforcement gateway

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P19` / `optional-fee-gateway` |
| Branch | `future/p19-optional-fee-gateway` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md), [P18](https://github.com/djshellshoxxx/GhostPay/blob/future/p18-telemetry-release-integrity/docs/future/modules/P18-telemetry-release-integrity/SPEC.md) |
| Optional integrations | [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P17](https://github.com/djshellshoxxx/GhostPay/blob/future/p17-private-fee-outputs/docs/future/modules/P17-private-fee-outputs/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective, modes and provenance

Specify an optional operator-owned service that verifies approved fee evidence and gates **its own** quote/relay/entitlement services. A gateway cannot enforce payment for copied static client code, free local functions or direct public-contract access. Client-only GhostPay remains fully usable without it, including independent spending, withdrawal and recovery.

Normative source: [owner's P19 addendum to issue #284](https://github.com/djshellshoxxx/GhostPay/issues/284#issuecomment-7020857691), alongside [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283). Three explicit modes are client-only, optional self-hosted gateway, and hybrid on-chain enforcement plus optional services. None authorizes an actual deployment.

## 2. Existing implementation and residual gap

- [Relayer HTTP server](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/relayer/src/server.ts) exports `RelayerHttpServer` and a 16 KiB body limit; [configuration](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/relayer/src/config.ts) exports `parseConfig` and signed-manifest loading conventions.
- [Shared guards](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/relayer-guard/src/index.ts) exports `GuardedBreaker`, `TokenBucketLimiter`, `LossBudget`, `TrustedProxies`, `resolveClientIp` and bounded replay-store primitives. Existing challenge friction is not payment proof.
- [Pool service](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-relayer/src/index.ts) exports `PoolRelayerService`, `parseQuoteRequest`, `parseRelayRequest` and redacted logging helpers.
- [Sponsor service](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payer-sponsor/src/index.ts) exposes retained testnet service/HTTP and gas-budget logic; its presence does not qualify a gateway or production contract.
- [Existing container](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/relayer/Dockerfile) and [operator service](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/relayer/deploy/ghostpay-relayer.service) provide packaging practices to compare.

The delta is recipient-bound modular fee verification, scoped service entitlements, durable replay/idempotency semantics and an optional containerized operator profile. Reuse narrow libraries after source review; do not duplicate relayer signers or connect a gateway to customer key storage.

## 3. Ownership, dependencies and authority

FEE01 owns price composition, signed policy, recipients and consent. P18 supplies minimized diagnostics and reproducible image/artifact evidence. Optional P09 provides a compatible gas-service port; optional P17 provides confidential fee evidence. The composition root injects these ports; FEE01's optional reference back to P19 is not a static import cycle.

Own service adapters, request/entitlement schemas, durable bounded operation state and operator packaging. No plaintext invoice, spending/viewing key, seed, private witness or remote proving endpoint is accepted. Server signing keys authenticate service quotes/tokens only; operator gas keys, if separately approved, fund operator transactions and never control customer assets.

## 4. Proposed wire/API contract

```ts
interface GatewayRequestV1 {
  version: 1; serviceId: string; moduleId: string;
  operationDigest: string; feePolicyDigest: string;
  clientCapabilityKey: string; requestNonce: string;
}
interface EntitlementV1 {
  version: 1; gatewayId: string; serviceId: string;
  operationDigest: string; policyDigest: string;
  recipientCommitment: string; feeEvidenceDigest: string;
  clientCapabilityKey: string; nonce: string;
  expiresAt: string; maxUses: 1; signature: string;
}
interface FeeGatewayPort {
  quote(request: GatewayRequestV1, ctx: OperationContext):
    Promise<ModuleResult<GatewayQuote>>;
  authorize(request: GatewayRequestV1, evidence: FeeEvidence,
    ctx: OperationContext): Promise<ModuleResult<EntitlementV1>>;
  invoke(grant: EntitlementV1, proofOfPossession: string,
    ctx: OperationContext): Promise<ModuleResult<ServiceOutcome>>;
}
```

Future HTTP routes may map to versioned capabilities/quote/authorize/invoke endpoints. Exact paths remain part of the accepted interface ADR. Tokens bind gateway, service, operation, policy, recipient, client capability and expiry; a bearer token alone must not authorize transfer to another client/service. Signature domains and client proof-of-possession use reviewed primitives.

EntitlementV1.expiresAt is a canonical unsigned decimal string of UTC milliseconds since the Unix epoch, decoded with an explicit integer range and no locale parsing. Signature canonicalization includes those exact bytes. Check expiry before reservation and immediately before service effects; a second-based upstream protocol uses an explicit checked conversion rather than guessed units.

## 5. Fee verification and service lifecycle

1. User explicitly selects an operator and reviews endpoint visibility, service price and trust limitations.
2. Gateway validates an integrity-checked approved fee schedule; operators cannot substitute their own recipient or silently change caps.
3. Browser reviews exact FEE01 quote and authorizes any payment through the appropriate existing transaction path.
4. Gateway independently validates final chain/asset/recipient/amount evidence or a qualified P17 proof, without asking for hidden invoice details.
5. Atomically reserve evidence/entitlement nonce before performing the gated service. Concurrent requests for the same operation share one idempotent outcome.
6. Timeout after effects remains unknown; resume/reconcile rather than charging or relaying again.
7. Reorg invalidates affected evidence, stops unstarted service and follows explicit already-performed-service/refund accounting.

A gateway assertion is never on-chain fee proof. Client-only mode uses approved contract enforcement where applicable. Purely local services cannot be universally paywalled; define an actual optional remote service or voluntary/license arrangement. Gateway outage must not lock funds or make user withdrawal depend on operator approval.

## 6. Cancellation, durability and limits

Client lock/cancel stops new requests/signatures but cannot revoke a service already dispatched. Rotate service authorization keys with short overlapping validity and explicit key IDs; revocation never grants customer authority. Durable replay records survive restarts and multiple replicas; shared atomic storage is required before scaling beyond one instance.

Proposed bounds: 16 KiB ordinary request, 256 KiB separately enabled proof route, eight in-flight requests per configured client bucket and 128 globally. Apply 10-second header/body timeouts, 30-second verification/service deadlines and bounded proof-verifier workers. Expensive validation occurs only after cheap structural/rate checks.

Use at most 100,000 live replay/idempotency records and 10,000 rate-limit buckets. Reject new work when capacity is exhausted; never evict unexpired replay protection. Entitlements expire within 60 seconds; fee-proof acceptance windows and replay retention must be configured together and cover finality/clock allowances. Unknown retention configuration refuses startup. No unbounded IP/account history.

## 7. Proposed Docker/Compose operator profile

Specify a reproducible pinned image, nonroot user, read-only filesystem, dedicated writable state volume, dropped capabilities and resource limits. Secrets enter through protected mounted files, never images, compose literals or logs. Bind locally by default behind an explicitly configured HTTPS/onion ingress; no default public RPC or service account.

Provide separate liveness/readiness checks that disclose no sensitive configuration. Readiness requires policy/signing configuration, durable state and selected provider capability; degraded upstream service cannot erase pending outcomes. Metrics use bounded labels/counters without addresses, invoice IDs, IPs or payloads. Document backups, schema migration, graceful drain and restoration of replay state. This document creates no Dockerfile or running service.

## 8. Privacy and trust matrix

| Observer / failure | Exposure or authority | Required treatment |
|---|---|---|
| Gateway operator | IP/route, service requests, quote/proof metadata | Explicit selection, minimized logs, optional Tor |
| Payment verifier | Public receipt or proof fields | Validate exact fee evidence; no unnecessary invoice data |
| Operator configuration | Potential recipient/price substitution | Approved policy commitment; fail mismatches |
| Compromised service token | Service use within narrow scope | Client proof, nonce, expiry and atomic consumption |
| Durable state loss | Replay/duplicate service or charge | Fail closed; recovery before accepting new work |
| Optional sponsor | Gas liquidity and submission knowledge | Separate P09 scope; no customer custody |

Confidential fee proof does not hide IP, service timing or operator observations automatically. Hashing a low-entropy invoice detail is not permission to collect it.

## 9. Pricing and accounting policy

Separate GhostPay protocol revenue, independent operator fees, gas reimbursement and blockchain gas. Use only FEE01's accepted schedule/recipient authorization. Exact prices and recipient remain unresolved. Charge only for an explicitly selected service; no fee for local encryption, privacy toggles or recovery. Document failed/reorged service refunds and already-spent gas. Gateway restrictions cannot pretend to enforce fees against public contracts.

## 10. Acceptance cases

- **P19-A01:** Full client-only operation/recovery works with no gateway configured or reachable.
- **P19-A02:** Operator recipient/policy substitution is refused by both client and gateway verification.
- **P19-A03:** Underpayment, wrong asset/chain, expired or unfinalized evidence cannot issue a valid entitlement.
- **P19-A04:** Cross-service/client/gateway replay and concurrent nonce consumption permit at most one service effect.
- **P19-A05:** Restart/replica concurrency retains replay protection and idempotent unknown outcomes.
- **P19-A06:** Capacity exhaustion refuses new work without dropping live protection or unbounded allocation.
- **P19-A07:** No key, witness or plaintext invoice appears in requests, logs, metrics or crashes.
- **P19-A08:** Reorg/failure accounting prevents duplicate charge and preserves independent user spending.
- **P19-A09:** Container/configuration review verifies nonroot, secrets, bounded state and safe health endpoints.
- **P19-A10:** Optional P17/P09 absence leaves unrelated functions available without silent substitution.

## 11. Slices and future verification

Slice 1 reconciles existing services and freezes policy/entitlement authority. Slice 2 implements pure validation/idempotency fixtures. Slice 3 adds optional HTTP/storage adapters and container specification. Slice 4 requires independent gateway/contract review, outage/reorg/restart drills and exact-image reproducibility evidence before deployment.

Existing checks for future implementation; **not run here**:

```bash
npm run test -w @ghostpay/relayer-guard
npm run typecheck -w @ghostpay/relayer-guard
npm run test -w @ghostpay/relayer
npm run lint -w @ghostpay/relayer
npm run test -w @ghostpay/pool-relayer
npm run test -w @ghostpay/payer-sponsor
```

## 12. Migration, rollback and decisions

Version service state independently of payment protocol formats. Migrate durable replay records before accepting traffic; rollback drains new work and retains pending reconciliation/evidence. Disabling the gateway must not change direct spending or withdrawals. Resolve optional service scope, proof system, policy trust, fees, state retention and operational responsibilities before implementation. Any deployment and operator legal/service review remain separate decisions.
