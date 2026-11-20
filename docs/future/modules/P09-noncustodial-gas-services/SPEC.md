# P09 — Optional non-custodial gas service adapters

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P09` / `noncustodial-gas-services` |
| Branch | `future/p09-noncustodial-gas-services` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [FEE01](https://github.com/djshellshoxxx/GhostPay/blob/future/fee01-modular-fee-policy/docs/future/modules/FEE01-modular-fee-policy/SPEC.md) |
| Optional integrations | [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md), [P17](https://github.com/djshellshoxxx/GhostPay/blob/future/p17-private-fee-outputs/docs/future/modules/P17-private-fee-outputs/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Let users explicitly choose a non-custodial relayer, bundler or paymaster for a narrowly reviewed transaction, without requiring GhostPay to maintain an ETH balance or custody keys. A service quote must bind the exact intent, fees, chain and expiry; outages must preserve independent user spending/recovery.

Sources: [issue #284 P09 and pricing](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5h](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5h.md). P02 supplies consented endpoints; P06 supplies scoped signing; FEE01 supplies itemized policy/consent. P10 and P17 are optional injected capabilities, with no reciprocal static import.

## 2. Existing implementation and residual delta

- [Sponsor exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payer-sponsor/src/index.ts) includes `buildRelayIntent`, `relayDigest`, `buildPermitTypedData`, `buildDelegatePayIntent`, `buildUserOperation`, `getUserOpHashV07`, and paymaster encoders.
- That package also exports server functions; do not import its entire Node-capable surface into web bundles. A future browser-safe entry requires explicit packaging review.
- [Chain guard](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payer-sponsor/src/chainGuard.ts) restricts the retained proof of concept to testnets. Existing EIP-7702/4337 helpers are not production eligibility.
- [Current relayer client](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/relayerClient.ts) exports `requestQuote`, `submitSweep`, and bounded pre-broadcast refusal classification.
- [Transaction guard](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/txGuard.ts) reviews exact transactions/typed data; [outcome model](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/transactionOutcome.ts) preserves uncertain submission states.

The delta is a capability-negotiated browser adapter, versioned fee/intent binding and cross-service outcome handling. No hosted service, contract deployment, production chain enablement or broad delegate authority is created by this specification.

## 3. Scope and authority boundary

Own adapters around compatible existing intent builders, quote validation and operation state. Service operators fund their own gas and receive only explicitly authorized reimbursement. The publisher cannot withdraw, seize, redirect or recover user assets. Smart-account/contract authority must be documented separately from EOA custody.

EIP-712 domain/schema, ERC-4337 EntryPoint/version and any EIP-7702 delegation are selected in a future accepted ADR. Reject unknown versions. No arbitrary call batches, unlimited allowances, persistent owner delegation or blanket signatures are allowed. Preserve base protocol fee policy; a new recipient is unresolved and must not be invented.

## 4. Proposed data and API

```ts
interface GasServiceQuoteV1 {
  version: 1; serviceId: string; chainId: string;
  intentDigest: string; protocolVersion: string;
  quoteId: string; nonce: string; expiresAt: string;
  maximumGasCostAtomic: string; feeQuoteDigest: string;
  recipientCommitment: string;
  supportedSubmission: 'direct-service' | 'private-port';
}
interface GasServiceProvider {
  quote(intent: ReviewedIntent, ctx: OperationContext):
    Promise<ModuleResult<GasServiceQuoteV1>>;
  authorize(quote: GasServiceQuoteV1, signing: SecretHandle,
    feeConsent: FeeConsentHandle, ctx: OperationContext):
      Promise<ModuleResult<AuthorizedGasIntent>>;
  submit(intent: AuthorizedGasIntent, ctx: OperationContext):
    Promise<ModuleResult<SubmissionOutcome>>;
  capability(): CapabilityDescriptorV1;
}
```

Bind scheme, chain, verifying contract, account, exact calls, asset, amount, nonce, deadlines, service fee recipient and maximum liability in the reviewed authorization. No JSON number for atomic amounts. Quote signatures authenticate the service's statement; they do not prove deployment correctness or chain inclusion.

## 5. Lifecycle and uncertain outcomes

1. Select an optional service and review exposure before requesting a quote.
2. Validate service capability, chain/deployment evidence and exact FEE01 itemization.
3. Simulate supported intent through the selected policy; distinguish unavailable simulation from known failure according to the reviewed flow.
4. Recheck account, chain, key epoch, quote expiry and total authorization immediately before signing.
5. Record an attempt before dispatch; submit once through the chosen port.
6. A timeout after possible broadcast becomes uncertain, not safe-to-retry. Reconcile through approved evidence before replacements.
7. Final inclusion remains subject to canonical block/finality/reorg checks.

Lock/cancel before signing prevents signature. After signing/broadcast, cancellation cannot revoke remote possession or undo chain execution; show exact state. Quote expiry during wallet delay requires new review. No automatic paid fallback, sponsor switch, public mempool submission or nonce replacement. P10/P17 absence leaves the respective mode unavailable.

## 6. Proposed limits

Quotes: 64 KiB decoded; signed call data: 128 KiB; at most eight explicitly enumerated calls per intent; one active submission per account/chain nonce lane. Quote lifetime is bounded to 10–300 seconds and never exceeds user consent. Method-specific maximum fee and gas bounds are selected from reviewed policy, not fabricated global prices.

Requests use 20-second deadlines and bounded streaming; quote fetch may be manually retried before authorization, but submission is never automatically retried. Unsupported asset, contract, EntryPoint, nonce representation or signature scheme refuses before signing. Keep bounded public attempt metadata; never log signatures or raw signed payloads.

## 7. Privacy and trust matrix

| Observer / failure | Exposure or authority | Treatment |
|---|---|---|
| Relayer/bundler/paymaster | Intent, payer/account, timing, route | Explicit disclosure; minimize private invoice data |
| Public chain | Account, amounts, gas sponsor, fees | No payer-anonymity claim from sponsorship |
| Malicious quote | Excess fees or recipient substitution | Exact FEE01 binding and bounded signature |
| Service outage | Stalled/unknown submission | Independent spending path and honest uncertainty |
| Contract/account bugs | Execution or recovery authority | Version/deployment pins and independent review |
| Private fee adapter | Different observable outputs | P17 capability evidence; no silent public fallback |

## 8. Pricing policy

Itemize base protocol fee, optional module fee, operator surcharge and network gas independently. Exact prices, fee recipient and collection design remain owner decisions. Fail closed when a required fee policy is absent or unauthenticated. The user approves exact maximum liability, refunds/failure handling and any additive/bundled fees. No charge merely for selecting the feature or requesting an unpriced local preview.

## 9. Acceptance cases

- **P09-A01:** Wrong chain/domain/EntryPoint/version refuses before signing.
- **P09-A02:** Altered calldata, recipient, fee cap or quote digest invalidates authorization.
- **P09-A03:** Expiry/account change during wallet approval forces renewed review.
- **P09-A04:** Replayed or cross-service/cross-chain nonces cannot authorize another operation.
- **P09-A05:** Timeout after dispatch remains uncertain and emits no automatic replacement.
- **P09-A06:** Sponsor outage leaves independent spending/recovery available without publisher funds.
- **P09-A07:** Lock/key epoch change suppresses late signatures; post-broadcast cancellation is accurately described.
- **P09-A08:** Unknown prices/recipients or absent fee consent prevent paid execution.
- **P09-A09:** Reorg invalidates inclusion/finality and does not double-charge or duplicate submission.
- **P09-A10:** Browser bundle excludes server entrypoints and secret traffic/logs remain absent.

## 10. Implementation slices and future checks

Slice 1 selects reviewed protocol/version and authority limits. Slice 2 adds quote/intent fixtures and browser-safe packaging. Slice 3 integrates fee consent and existing review guards. Slice 4 checks local-chain outcome/replay/failure scenarios and independent external wallet/service evidence.

Existing scripts, for future implementation and **not run here**:

```bash
npm run test -w @ghostpay/payer-sponsor
npm run typecheck -w @ghostpay/payer-sponsor
npm run lint -w @ghostpay/payer-sponsor
npm run test -w @ghostpay/tx-review
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Keep current relay/sweep formats supported explicitly; do not reinterpret existing signatures under new domains. Rollback disables new quotes while preserving submitted-attempt reconciliation and independent recovery. Resolve fees, recipient, EntryPoint/version, delegate authority and supported services before implementation. No production contract or real-funds activation follows from these branches.
