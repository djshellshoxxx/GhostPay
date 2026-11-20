# P11 — Metadata minimization and bounded timing policy

| Field | Value |
|---|---|
| Module | P11 / metadata-timing-policy |
| Feature branch | future/p11-metadata-timing-policy |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | Existing core only |
| Optional integrations | None |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Objective and observable behavior

Provide a pure policy engine that explains which invoice, announcement, wallet and transport fields are required, which are optional, and which may be omitted without invalidating payment verification. It also validates explicitly requested batching/delay plans. The output is a deterministic plan and disclosure report; this provider never starts a timer, signs, submits or changes an amount.

A seller previews a minimal invoice and sees the exact removed fields before a newly signed envelope is created. A payer can request bounded timing options and inspect expiry, cost and observable-chain limitations. T01, not P11, owns execution. Existing issue #287 minimal-invoice acceptance remains separately scheduled.

## Source evidence and reusable implementation

| Existing source at the baseline | Observed responsibility | Required future delta |
|---|---|---|
| [metadata-hardening index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/metadata-hardening/src/index.ts) | Exports metadata, invoice, release, scan and catalog helpers | Qualify compatible options behind one policy contract; preserve testnet guards |
| [metadata-hardening README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/metadata-hardening/README.md) | Documents planRelease, padding, coarse timestamps and unresolved schema wiring | Reconcile strict invoice/announcement formats before enabling transformations |
| [amount-blur index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/amount-blur/src/index.ts) | planSchedule and bounded split helpers | Reuse timing validation only; no duplicate amount shaping or scheduler |
| [invoice-schema index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/index.ts) | Canonical invoice/signature boundary | P04 remains format/crypto owner |

Requirements originate in Privacy Suite P11, architecture 5f, and issue #287. Historical direct-payment metadata options do not authorize bypassing current router fees.

## Scope and module ownership

Own a field-classification registry, deterministic minimization policy, compatibility checks and timing-plan validators. P04 owns envelope creation and authentication; F03 owns exchange; T01 owns schedules, per-leg consent and execution. Policy does not mutate an already signed object, change payable values, silently round funds, remove required verification fields or select random timings without a user-reviewed request.

Policy revisions are explicit, immutable within an operation and bound to its plan digest. Provider-owned field classifications must be centrally reused rather than copied into every product.

## Proposed data and interface

~~~ts
interface MetadataPolicyV1 {
  readonly schema: 'ghostpay.metadata-policy/v1';
  readonly revision: string;
  readonly formatId: string;
  readonly mode: 'compatible' | 'minimal';
  readonly optionalFieldIds: readonly string[];
}
interface TimingConstraintsV1 {
  readonly maxLegs: number;
  readonly earliestMs: number;
  readonly latestMs: number;
  readonly expiresAtMs: number;
  readonly maxJitterMs: number;
}
interface PolicyPlanV1 {
  readonly digest: Digest;
  readonly removedFieldIds: readonly string[];
  readonly requiredFieldIds: readonly string[];
  readonly reveals: readonly string[];
  readonly warnings: readonly string[];
}
interface MetadataTimingPolicy {
  analyze(input: RecordRef, policy: MetadataPolicyV1): ModuleResult<PolicyPlanV1>;
  validateTiming(offsetsMs: readonly number[], rules: TimingConstraintsV1):
    ModuleResult<PolicyPlanV1>;
}
~~~

Input references resolve through scoped local providers. Diagnostics contain field IDs, never removed private values. Canonical policy bytes and exact input revision bind a plan; caller changes force a new analysis. The signature/encryption provider creates new authenticated output from the approved projection.

## State, failure and recovery

Analysis moves draft → analyzed → reviewed; a policy/format/input revision change returns to draft. Unknown required fields, unsupported versions or unavailable policy metadata produce typed rejection, not best-effort stripping. Existing signatures are reverified before a transform and regenerated only by P04 under explicit authority.

Timing policy returns valid, incompatible, expired or insufficient-horizon. Suspension, clock rollback, chain change and quote expiry require revalidation at execution. P11 stores no timers or secret state, so cancellation discards its plan; T01 preserves any already-submitted leg separately. Reload restores only authenticated policy preferences and re-runs analysis.

## Validation and resource budgets

Initial proposed limits: 64 classified field IDs, 128 options, a 1 MiB input reference's resolved envelope subject to stricter existing parser limits, 32 KiB policy metadata and at most 8 timing legs until a measured extension is approved. Reject NaN, Infinity, fractional milliseconds, overflow, negative durations, unknown fields and end times beyond expiry. Jitter samples are supplied by an approved randomness port in the executor; validation checks every sampled result without redrawing it.

Target deterministic evaluation under 50 ms for supported policy inputs on the agreed baseline device; benchmark rather than assume. Format changes require compatibility vectors for current invoice and announcement readers.

## Threat and leakage analysis

| Boundary | Requirement | Remaining exposure |
|---|---|---|
| Link recipient | Show exact fields retained/removed | Recipient still learns necessary payment instructions |
| Public chain | Do not describe omission, delay or padding as amount secrecy | Addresses, values, contracts, gas and timestamps remain visible |
| Application logs | Emit field IDs and coarse error categories only | Compromised origin can observe active plaintext |
| Timing options | Require explicit plan; no claim that delays add anonymity | Distinct timing/batch patterns can fingerprint activity |
| Schema downgrade | Unknown/required fields cannot be silently removed | Legacy readers may reject new formats until migrated |

## Fees and consent

Policy evaluation and local minimization are free local operations. P11 never charges for a toggle. T01's separately approved add-on fee comes only from FEE01. Any new rounding, batching or padding that changes cost must produce a changed quote and explicit review; required base fees cannot be removed as metadata.

## Acceptance matrix

| ID | Scenario | Observable acceptance |
|---|---|---|
| P11-A01 | Minimal projection | Optional merchant memo disappears; required amount/network/signature fields remain verifiable |
| P11-A02 | Signed-object transform | Original bytes remain untouched; new envelope requires re-signing through P04 |
| P11-A03 | Unknown required field | Typed incompatibility; no projected output exported |
| P11-A04 | Expiry and jitter edge | Every proposed leg remains inside the reviewed validity horizon |
| P11-A05 | Invalid numeric input | Negative/overflow/fractional/NaN timing values rejected before execution |
| P11-A06 | Policy or input revision change | Old digest cannot authorize the revised plan |
| P11-A07 | Privacy trace | Zero network calls and no private values in diagnostics |
| P11-A08 | Stable replay | Same inputs produce identical normalized plan/digest |
| P11-A09 | Existing parser vectors | No widened limits or broken legacy invoice/announcement parsing |
| P11-A10 | Cost-bearing option | Changed economics invalidate old consent and return new FEE01 review |

## Implementation slices and verification

1. Inventory existing catalog entries and build a field/format matrix; own planned metadata-hardening policy adapter and fixtures.
2. Add strict, pure policy DTO/validator and deterministic projection tests; keep P04 envelope changes in its lane.
3. Integrate compatibility and timing validation through provider ports; test synthetic boundary values.
4. Wire F03/T01 preview consumers only after contract tests; run accessible diff and expiry journeys.
5. Record benchmark/source evidence and migrations before enabling any future policy.

Existing package commands, verified in package.json, are planned checks and **not executed by this specification task**:

~~~bash
npm run test -w @ghostpay/metadata-hardening
npm run typecheck -w @ghostpay/metadata-hardening
npm run lint -w @ghostpay/metadata-hardening
npm run test -w @ghostpay/amount-blur
npm run test -w @ghostpay/invoice-schema
~~~

## Migration, rollback and owner decisions

Keep old preferences readable, but require review when policy meaning changes. Rollback restores the earlier policy resolver while leaving original signed invoices and journals available. Existing baseline privacy protections stay enabled; new optional transformations remain off.

Decisions: which optional fields may be omitted for each supported format; exact timing budgets; whether any future compatible format extension is justified. There is no authorization here for new transaction fees, silent amount alteration or deployment.

