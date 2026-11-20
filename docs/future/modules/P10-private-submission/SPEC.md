# P10 — Explicit private transaction submission

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P10` / `private-submission` |
| Branch | `future/p10-private-submission` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md) |
| Optional integrations | [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Submit an already reviewed, user-authorized transaction through an explicitly selected private submission service where compatible, with truthful endpoint visibility and uncertain-outcome handling. Private mempool access can reduce public pre-inclusion exposure; it does not make the included transaction anonymous or guarantee non-forwarding by its operator.

Sources: [issue #284 P10](https://github.com/djshellshoxxx/GhostPay/issues/284) and [architecture 5h](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5h.md) / [5i](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5i.md). P02 controls destination/purpose consent. Optional P09 supplies sponsored-intent submissions through an injected port; neither module imports the other implementation.

## 2. Existing implementation and residual delta

- [Outcome model](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/transactionOutcome.ts) defines `TransactionPhase`, `TransactionOutcome`, `TransactionOutcomeError`, and `referencedBroadcastOutcome`; reuse honest pending/unknown states.
- [Attempt journal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/duplicateAttemptJournal.ts) exports `beginAttempt`, `finishAttempt`, `readAttempts` and `clearAttempt`; extend only after checking current tab-local semantics.
- [Wallet execution](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/wallet.ts) is existing provider/account/chain review infrastructure; wallet-owned RPC traffic cannot be forced through P10 by a webpage.
- [Exact transaction review](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/txGuard.ts) supplies `guardTx`, `guardTypedData` and review policy.
- [Browser transport](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/net-transport/src/browser.ts) supplies bounded browser-safe transport primitives; P02 remains the required wrapper.

The delta is a versioned private-submission capability contract, exact payload/endpoint consent, evidence-bound attempts and no-silent-public-fallback behavior. There is no current claim that a named external relay supports the proposed API.

## 3. Scope and ownership

Own submission adapters, provider acknowledgements and attempt-state translation. Exclude signing, key custody, nonce selection, transaction construction, gas sponsorship and privacy-preserving settlement. Consumers sign only after their own exact review, then hand over an immutable authorized payload reference.

Browser-wallet transactions whose wallet submits internally cannot claim P10 routing. Such a wallet must expose an independently qualified compatible pathway or the mode remains unavailable. No fake private toggle may wrap an ordinary `eth_sendTransaction` call that chooses an uncontrolled route.

## 4. Proposed data and API

```ts
interface PrivateSubmissionPolicyV1 {
  version: 1; serviceId: string; endpointPolicyRevision: string;
  chainId: string; adapterVersion: string;
  requiredMode: 'private-only';
  expiryBlock?: string; expiryTime?: string;
}
interface SubmissionAttemptV1 {
  version: 1; attemptId: string; intentDigest: string;
  payloadHash: string; serviceId: string; chainId: string;
  phase: 'prepared' | 'attempted' | 'acknowledged'
    | 'unknown' | 'included' | 'final' | 'reorged';
  transactionHash?: string;
}
interface PrivateSubmissionProvider {
  inspect(payload: AuthorizedPayload, policy: PrivateSubmissionPolicyV1):
    ModuleResult<SubmissionDisclosure>;
  submit(payload: AuthorizedPayload, policy: PrivateSubmissionPolicyV1,
    ctx: OperationContext): Promise<ModuleResult<SubmissionAttemptV1>>;
  reconcile(attempt: SubmissionAttemptV1, ctx: OperationContext):
    Promise<ModuleResult<SubmissionAttemptV1>>;
  capability(): CapabilityDescriptorV1;
}
```

The authorized payload binds exact signed bytes, expected hash, chain and prior user consent. It is not a raw key or a new signing request. Store only minimal public attempt metadata; never persist raw signed payloads by default. Adapter acknowledgement is not receipt or settlement evidence.

## 5. Lifecycle and failure rules

1. Check capability and selected endpoint without probing unconsented providers.
2. Explain service-visible signed transaction, route metadata, inclusion policy, cost and post-inclusion public fields.
3. Capture exact payload/policy digest and operation epoch; persist attempt metadata before dispatch using a consumer-supplied atomic port.
4. Dispatch once, validate acknowledgement against the locally computed expected transaction hash and intent.
5. Timeout after dispatch is unknown; do not treat an absent acknowledgement as proof of non-broadcast.
6. Reconcile through the consented evidence source; canonical receipt/finality and reorg handling govern status.
7. Public submission, replacement or another private service requires an explicit new user decision with duplicate/nonce risk shown.

Lock/cancel before dispatch blocks transmission. After dispatch it cannot revoke a signed transaction or guarantee relay deletion. Service-specific cancellation acknowledgements remain claims until chain evidence resolves the outcome. Expiry does not erase a valid signed transaction; never promise automatic invalidation unless the reviewed protocol enforces it.

## 6. Proposed limits and resource policy

One transaction per operation and one active submission per chain/account/nonce lane. Payload cap: 128 KiB; acknowledgement cap: 64 KiB; provider descriptor: 32 KiB. Request deadline: 20 seconds or the earlier operation deadline, with no automatic submission retry.

Reconciliation is explicit, bounded to five reads per invocation and a 30-second total budget. Later user-requested checks may repeat reads, never submissions. Reject redirection to another host, malformed hashes, unsupported adapter versions and endpoint policy changes. Provider APIs and expiry semantics require current primary-document verification during implementation.

## 7. Privacy and trust matrix

| Observer / failure | Information or uncertainty | Required treatment |
|---|---|---|
| Private service | Signed payload, account, route, timing | Explicit pre-send disclosure |
| Public chain | Included payer, amount, destination, fees | State that privacy ends at transparent settlement |
| Wallet extension | Its own submission channel | Require proven compatible pathway or unavailable mode |
| Malicious service | Forwarding, censorship, false acknowledgement | No anonymity promise; independent receipt checks |
| Timeout/cancel | Transaction may still be submitted | Unknown state, no automatic retry/fallback |
| Local logs/storage | Correlatable submission references | Minimal metadata and explicit retention |

## 8. Pricing policy

Local inspection and cancellation UI have no GhostPay charge. Optional service charges must arrive as an already reviewed itemized authorization from the consumer or P09; unknown fees refuse paid execution. P10 neither invents a recipient nor changes existing protocol fees. Failed/uncertain outcomes follow the approved quote's accounting rules, never automatic duplicate charging.

## 9. Acceptance cases

- **P10-A01:** Private-only selection never emits a public fallback request on any error.
- **P10-A02:** Wallet-internal submission cannot be displayed as P10-protected without compatible evidence.
- **P10-A03:** Payload/hash/chain/policy changes invalidate prior consent before dispatch.
- **P10-A04:** Acknowledgement with wrong hash or oversized response fails safely.
- **P10-A05:** Timeout after write remains unknown and emits no automatic second submission.
- **P10-A06:** Cancellation after dispatch preserves uncertainty and does not claim signature revocation.
- **P10-A07:** Reorg invalidates inclusion/finality without causing auto-rebroadcast.
- **P10-A08:** Duplicate nonce attempts are blocked until an explicit reviewed replacement decision.
- **P10-A09:** Traces show only the chosen endpoint; logs/storage contain no signed payload or invoice plaintext.
- **P10-A10:** Service outage preserves independent user recovery and explicit alternative choices.

## 10. Slices and future verification

Slice 1 inventories existing wallet and journal semantics and selects one compatible provider protocol. Slice 2 implements bounded descriptor/acknowledgement parsing with no-network fixtures. Slice 3 connects P02 consent and outcome journal. Slice 4 independently qualifies local-chain uncertainty/reorg cases and actual service/wallet interoperability.

Existing commands for future implementation; **not executed here**:

```bash
npm run test -w @ghostpay/net-transport
npm run test -w @ghostpay/tx-review
npm run test -w @ghostpay/chain-adapters
npm run test -w @ghostpay/web
npm run typecheck -w @ghostpay/web
npm run build -w @ghostpay/web
```

New adapter-specific tests and external acceptance must record exact versions; these scripts alone cannot certify an external service's forwarding behavior.

## 11. Migration, rollback and decisions

Leave existing direct submission explicit and unchanged. Import legacy attempts as historical/unknown without fabricating endpoint provenance. Rollback disables new private attempts but keeps reconciliation and independent recovery. Resolve protocol versions, endpoint trust, cancellation semantics, service pricing and compatible wallet paths before implementation. No production service, automatic relay or new contract authority is authorized here.
