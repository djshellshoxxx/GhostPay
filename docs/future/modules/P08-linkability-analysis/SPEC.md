# P08 — Local payment linkability analysis

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P08` / `linkability-analysis` |
| Branch | `future/p08-linkability-analysis` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | None |
| Optional integrations | [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Explain observable linkage in a proposed payment, sweep or routing plan using only locally available facts. Detect address reuse, consolidation, common gas funding and timing/amount relationships without silently querying a block explorer. Give actionable choices while distinguishing evidence, heuristic suspicion and unavailable information.

Sources: [issue #284 P08](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5e](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5e.md). [Issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287) separately mandates v1.1 address-reuse detection: reuse qualified work from that scope, and do not make this larger provider a v1.0/v1.1 blocker.

## 2. Existing implementation and residual delta

- [Hygiene exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hygiene/src/index.ts) exposes `DestLedger`, `assertNoConsolidation`, `sameBlockGate`, `fundingGuard`, and destination/buffer helpers. Existing research/testnet restrictions remain.
- [Destination ledger](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/hygiene/src/ledger.ts) is the existing local reuse model to compare, not proof the shipped UI already warns every flow.
- [Payer helpers](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/payer-sponsor/src/index.ts) exports `lintFunding` and `planFunding`; retain their explicit disclosure that gas sponsorship does not hide payer addresses.
- [Reconciliation ledger](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/reconciliationLedger.ts) supplies local evidence context; imported records must remain unverified historical hints.
- [Sweep/gas guidance](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/user/sweep-and-gas-privacy.md) defines current user-facing limitations.

The delta is a pure, deterministic review interface spanning these evidence types, provenance-aware findings and scoped acknowledgement. It is not a global chain surveillance tool, anonymity score or guarantee of unlinkability.

## 3. Scope and ownership

Own rule definitions, normalized local facts and explanatory findings. Existing transaction review owns authorization; P08 cannot modify destinations, amounts or calldata. T01/T02 and F14/F17 may consume it through injection. Optional P05 persists encrypted local history; no persistence is required for a one-shot review.

No network function, key handle or raw signature is accepted by the analyzer. Consumers supply only minimal public-plan facts and selected local history. New external evidence acquisition belongs to P02 and requires independent consent. Rule installation is versioned and reviewed, never downloaded dynamically.

## 4. Proposed data and API

```ts
interface LinkFactsV1 {
  version: 1; chainId: string; planDigest: string;
  destinations: readonly PublicDestination[];
  localHistory: readonly ScopedPublicObservation[];
  evidenceAsOf?: { blockNumber: string; blockHash: string };
}
interface LinkFindingV1 {
  version: 1; ruleId: string; ruleVersion: string;
  confidence: 'observed' | 'heuristic' | 'unknown';
  severity: 'notice' | 'review-required';
  evidenceRefs: readonly string[];
  explanationCode: string; mitigationCodes: readonly string[];
}
interface LinkabilityProvider {
  analyze(facts: LinkFactsV1, ctx: OperationContext):
    Promise<ModuleResult<readonly LinkFindingV1[]>>;
  capability(): CapabilityDescriptorV1;
}
```

Public observations are chain-qualified and profile-scoped. Findings contain references, not private contact aliases. Acknowledgement binds exact plan digest and rule-set version; it does not authorize a transaction. Changing any reviewed field invalidates the acknowledgement.

## 5. Rules and lifecycle

1. Normalize chain-specific addresses and asset units; reject malformed identity fields.
2. Check fresh-destination vs intentional repeat-use context, same-destination consolidation and known common funders.
3. Compare only relevant local amounts/times, marking heuristic relationships clearly.
4. Explain public intermediary hops, public withdrawals and fee-recipient fingerprints without promising privacy gains.
5. Present findings and available alternatives; do not rewrite plans or select new destinations automatically.
6. Recompute when destination, amount, chain, timing, fee route or evidence revision changes.
7. Lock/cancellation removes history-derived findings from sensitive UI and rejects late results.

Unknown history produces unknown coverage, never a clean-anonymity badge. Reorg invalidates affected observed facts and acknowledgements. Imported history may support a caution but cannot establish current funds or settlement. Clock changes invalidate timing assumptions; no waiting/scheduling action is executed by P08.

## 6. Proposed bounds and performance

Limit one review to 1,000 planned legs, 10,000 history observations, 100 findings and 4 MiB decoded input. Rules operate on indexed normalized facts with bounded comparisons; prohibit unrestricted all-pairs graph expansion. A result exceeding the finding cap reports summarized categories plus explicit incomplete detail.

Target 250 ms for typical 100-leg/1,000-history desktop review and two seconds on supported mobile hardware; these are proposed acceptance budgets, not measurements. Yield between bounded chunks and honor operation deadlines. Rule IDs/explanations are finite catalogs; untrusted text is rendered as text only.

## 7. Privacy and trust matrix

| Observer / failure | Exposure or risk | Required treatment |
|---|---|---|
| Public chain observer | Addresses, amounts, times, graph/hops | Explicit explanation; no anonymity guarantee |
| Local user/history store | Cross-persona relationships | Profile-scoped facts; encrypted optional persistence |
| Imported history | Fabricated/stale associations | Provenance/confidence labels; no settlement authority |
| Rule provider | Potential telemetry via remote evaluation | All analysis local; no remote rule loading |
| Missing data | False confidence | Unknown coverage and explicit blind spots |
| Shared destination | Legitimate repeat use vs risky consolidation | Contextual wording, no blanket accusation |

## 8. Pricing policy

Local linkage analysis, reuse notices and safety explanations remain free. A paid optional route cannot suppress findings or buy a stronger privacy label. P08 has no fee-engine dependency and changes no fee schedule. Consumers may show independently quoted route costs alongside findings but cannot describe public hops or timing fees as proven anonymity purchases.

## 9. Acceptance cases

- **P08-A01:** Repeat EVM destinations normalize consistently while chain namespaces remain distinct.
- **P08-A02:** Legitimate repeated business use receives accurate contextual disclosure, not a false fresh-address claim.
- **P08-A03:** Same-wallet funding/consolidation fixtures produce stable evidence-linked findings.
- **P08-A04:** Missing history reports unknown coverage rather than no-risk.
- **P08-A05:** Public intermediary hops and shielded exit boundaries retain truthful residual-linkage explanations.
- **P08-A06:** Plan/evidence/rule-set changes invalidate acknowledgement before consumer signing.
- **P08-A07:** Reorged/imported observations cannot establish live settlement or immutable linkage facts.
- **P08-A08:** Network instrumentation observes zero requests; aliases/keys never appear in outputs.
- **P08-A09:** Worst-case bounded inputs remain responsive; over-limit inputs refuse without partial safe status.
- **P08-A10:** Lock/cancel/profile switch prevents late findings from revealing previous-profile history.

## 10. Implementation slices and future checks

Slice 1 maps reusable hygiene/payer rules and v1.1 reuse behavior. Slice 2 introduces the pure evidence-normalization contract and bounded engine. Slice 3 integrates exact-plan acknowledgement in one consumer. Slice 4 independently measures false positives, missing-data behavior, accessibility and leakage.

Confirmed commands for later implementation; **not run here**:

```bash
npm run test -w @ghostpay/hygiene
npm run typecheck -w @ghostpay/hygiene
npm run lint -w @ghostpay/hygiene
npm run test -w @ghostpay/payer-sponsor
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
```

Do not remove current testnet guards merely to exercise fixtures. Real chain-analysis benefit requires separately documented comparative experiments with synthetic/test assets.

## 11. Migration, rollback and decisions

Version rule catalogs and local fact schemas. Existing histories remain intact; importing optional history requires scope preview. Rollback keeps prior facts and invalidates acknowledgements generated by unsupported rules. Decide reviewed rule severities, acknowledgement behavior and measurable benefit claims before integration. No numerical anonymity score, automatic consolidation or secret graph collection is authorized.
