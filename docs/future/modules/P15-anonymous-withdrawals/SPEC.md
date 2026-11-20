# P15 — User-controlled shielded exit research

| Field | Value |
|---|---|
| Module | P15 / anonymous-withdrawals |
| Feature branch | future/p15-anonymous-withdrawals |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md) |
| Optional integrations | [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md) |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Purpose and terminology

Provide a user-secret-authorized exit from a qualified shielded protocol to an explicitly reviewed destination, with independent recovery and correct reconciliation. “Anonymous withdrawals” is the original P15 roadmap label, not an anonymity guarantee. The product must describe the actual protocol property and public exit leakage.

A user selects an eligible note, reviews destination/network/amount/fees, verifies recovery material, authorizes one exit and follows pending/final/reorg states. A second journey handles protocol or relay outage through a documented emergency route whose different privacy properties are shown before use.

## Sources and existing implementation

Sources: [P15](https://github.com/djshellshoxxx/GhostPay/issues/284), [Track D](https://github.com/djshellshoxxx/GhostPay/issues/283), architecture 5j.

| Baseline source | Reusable behavior | Future work |
|---|---|---|
| [pool-sdk flows](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-sdk/src/flows.ts) | prepareWithdrawal, prepareRagequit and exact calldata construction | Reconcile with selected qualified protocol, new quote/consent and recovery contract |
| [pool-sdk index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-sdk/src/index.ts) | contextOf, expected signals, sync/recovery and wire parsers | Preserve exact context and signal checks; no duplicated note derivation |
| [external-pools index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/index.ts) | lintExit, adviseExit, accounting and recovery | Honest availability and measured leakage, not heuristic anonymity claims |
| [pool-relayer README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-relayer/README.md) | Existing testnet exit service boundary | Optional transport only; not independent production qualification |

Current pool artifacts are testnet research and retain their existing trust/ceremony restrictions.

## Scope and ownership

P14 owns note state, membership, nullifiers and reservations. P15 owns exit-route capability, destination review, exit intent/evidence and emergency-path comparison. It requests a narrow reservation/proof operation from P14; it never copies note secrets into UI or maintains a second spent-note database. Optional P09/P10 ports provide chosen gas/submission methods.

No default relayer, compulsory publisher approval, hidden destination substitution or server recovery key. A protocol that requires an association/permission service must disclose it and specify whether the user has an independent exit; incompatible owner requirements block its selection.

## Proposed API and state record

~~~ts
interface ExitIntentV1 {
  readonly schema: 'ghostpay.shielded-exit/v1';
  readonly protocolInstance: Digest;
  readonly noteRefs: readonly RecordRef[];
  readonly asset: AssetRefV1;
  readonly destination: string;
  readonly amountUnits: DecimalUnits;
  readonly quoteDigest: Digest;
  readonly expiresAtMs: number;
}
interface ExitPlanV1 {
  readonly intentDigest: Digest;
  readonly reservationRef: RecordRef;
  readonly route: 'standard' | 'emergency';
  readonly publicEffects: readonly string[];
  readonly recoveryRef: RecordRef;
}
interface ShieldedExitProvider {
  prepare(intent: ExitIntentV1, ctx: OperationContext): Promise<ModuleResult<ExitPlanV1>>;
  authorize(plan: ExitPlanV1, ctx: OperationContext): Promise<ModuleResult<RecordRef>>;
  reconcile(intentDigest: Digest, ctx: OperationContext):
    Promise<ModuleResult<{ state: 'pending' | 'unknown' | 'confirmed' | 'reorged' | 'reverted' }>>;
}
~~~

The exact signed/proven context binds network, protocol instance, destination, asset, amount, fee recipients/caps, nonce/nullifier policy and deadline according to the selected protocol. A relayer cannot modify these fields. The provider returns a scoped submission reference rather than raw reusable authorization to arbitrary consumers.

## Lifecycle, failure and recovery

Eligible → reserved → reviewed → authorized → submission-pending/unknown → confirmed or reverted. Changing destination, fee, provider or deadline invalidates prior review. Lock/cancel pauses unsent work and disposes secret scopes; a possibly transmitted proof is reconciled before releasing its reservation.

Reorg returns observations to pending. Expiry invalidates unsubmitted authority but does not erase an already observed spend. A lost response cannot be treated as failure and resubmitted through another operator. Emergency route selection creates a new reviewed plan only after the original intent is resolved.

Recovery includes encrypted note/seed backup, protocol/version/network locator, required public state source and independently executable exit instructions. Never promise recovery from an immutable contract defect that the chosen protocol cannot survive. If a fallback exposes original deposit linkage or only refunds the depositor, show that limitation explicitly.

## Bounds and validation

Initial proposed plan supports at most 8 notes and one destination; preserve lower circuit limits. Cap intent at 32 KiB, proof/envelope at 1 MiB, simultaneous active exit at one per reserved note set and bounded reconciliation retries with backoff. Validate destination encoding/network, ownership consent, range, fee caps, artifact hashes, deadlines and current state roots.

Never enforce an artificial mandatory delay in place of available recovery. Timing advice may be informational only; no claimed crowd size without a documented measurement and no numeric anonymity score. Validate imported recovery bundles before any network request.

## Threat and leakage matrix

| Boundary | Control | Residual limitation |
|---|---|---|
| Relay or submitter | Exact authorized destination/fees/context | Operator observes request metadata and public exit |
| Public chain | Truthful exit/deposit/timing analysis | Destination, amount and gas often become public |
| Recovery fallback | Independently available, explicit route | Emergency path may reveal original deposit linkage |
| Concurrent devices | P14 note reservation plus nullifier evidence | Local leases alone cannot prevent remote contention |
| Proof artifact | Approved protocol/verifier/state binding | Trust/setup assumptions remain |
| Hostile UI state | Recheck account/chain/session before effects | Compromised origin/device remains outside confidentiality guarantee |

## Fees

Use the approved FEE01 quote through the composition root; P15 does not own prices. If P14's selected capability cannot enforce the existing policy and selected exit fee, mark the route incompatible. Distinguish protocol add-on, relay reimbursement, gas and actual net output. No automatic fee increase or private-to-public fee fallback. Failed gas spend is not represented as refundable unless an actual policy supports it.

## Acceptance matrix

| ID | Scenario | Acceptance |
|---|---|---|
| P15-A01 | Destination/chain substitution | Rejected before proof/submission |
| P15-A02 | Nullifier replay | No second successful exit or released pending reservation |
| P15-A03 | Unknown broadcast | Reconcile before any retry/operator switch |
| P15-A04 | Expired quote/authority | No new submission; already pending state preserved |
| P15-A05 | Reorg after observation | Status and spendability roll back consistently |
| P15-A06 | Relay unavailable | Approved independent route remains available without publisher key |
| P15-A07 | Emergency route selection | Distinct leakage/recipient/economic review required |
| P15-A08 | Fresh-device recovery | Valid independent material reconstructs supported exit capability |
| P15-A09 | Locked session completion | No stale proof or destination shown in another session |
| P15-A10 | Fee cap/net-output mismatch | Reject, re-quote and require fresh consent |
| P15-A11 | Public evidence labeling | Never label ordinary transparent exit untraceable or anonymous |

## Implementation and verification plan

1. Document exit semantics for each candidate protocol and compare existing prepareWithdrawal/prepareRagequit behavior.
2. Define read-only capability and reservation interfaces with P14; implement strict intent parser and context vectors.
3. Build a one-exit journal and ambiguity/reorg tests with synthetic chain fixtures.
4. Implement independent recovery rehearsal and approved relay adapters without changing direct access.
5. Qualify combined provider/consumer flows and independent privacy review before any enablement.

Existing commands, not executed here:

~~~bash
npm run test -w @ghostpay/pool-sdk
npm run test -w @ghostpay/external-pools
npm run typecheck -w @ghostpay/pool-sdk
npm run test -w @ghostpay/pool-relayer
forge test --root packages/pool-contracts
~~~

## Rollback and decisions

A disabled module blocks new optional exits only where an independent recovery alternative remains visible; never hide the sole available path to user funds. Keep old intent parsers and recovery instructions. Decisions: protocol, emergency route, accepted trust/custody constraints, fee enforcement, external operator compatibility and actual supported browser/wallet evidence.

