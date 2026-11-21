# GhostPay payment safety and recovery: source assessment

Date: 20 November 2026 (Pacific). Worker: `/root/payment_safety`.

## Scope and conclusion

The inspected static EVM client has substantial send-time validation, uncertain-outcome
handling, tab-scoped duplicate-attempt records, and seller reconciliation. It does
**not** implement automatic refunds when an invoice expires, nor a universal guarantee
that a payment can be recovered after a browser restart, loss of local state, loss of
keys, or an uncertain transaction. Existing safeguards should be retained while these
limitations remain explicit.

The immutable application source for this assessment is PR #307 at
`5a745d4b5fba69b66a9779f88aefc63c253a4f27`. The worker branch began at
`95a1e93c62bbc378e02716a23c05a1993d0f79db`, which adds only coordination documentation.
Main was separately observed at `aec179910c39081d820396409ff3139ff2264132`.
Those are different source states: new main changes and unmerged feature stacks are
not silently included in the conclusions below.

This is a documentation-only assessment after the coordinator narrowed this worker's
task. **No payment service was contacted and no runtime, browser, live-chain, restart,
restore, hardware-wallet, or external-wallet acceptance was executed by this report.**
“Implemented in source” means that the specified source path was inspected. It does
not imply that the complete release candidate or an end-to-end recovery claim passed.

The active lean Pages profile imports the supported EVM routes. Bitcoin and TRON are
additional full-profile source paths examined for boundaries; they are not thereby
qualified or enabled in the lean product. Their inspected network lists explicitly
disable mainnet. Optional relayed-sweep source is discussed only to describe existing
behavior, not to introduce a backend or claim a deployed relayer. [S1, S10–S13]

## Mechanisms and control of funds

| Mechanism | Source-level control and safeguards | Recovery boundary |
| --- | --- | --- |
| EVM invoice payment | The payer authorizes a transaction through the selected external wallet. The client compares the transaction with the reviewed destination, calldata, value and chain when a configured RPC is available. | The page cannot cancel a request already handed to the wallet. A returned hash is evidence of a submission reference, not complete settlement proof. [S2, S3] |
| EVM seller direct Sweep | The client derives the seller-controlled one-time spending key, checks that it matches the expected address, and signs only through the reviewed Sweep flow. | Recovery requires the correct seller material and usable chain evidence. This source review does not establish recovery with an independent external tool or every asset. [S4] |
| Optional EVM relayed Sweep | The seller signs a context-bound order and permit. The browser records the order before submitting it and later checks order state through chain reads. | An uncertain response is not a refund or cancellation. Service availability and supported contract/token behavior are additional dependencies, outside this static-client qualification. [S4, S5] |
| Bitcoin full-profile proof of concept | An in-memory seed-derived software wallet controls spending. The Sweep signer checks selected outputs and the reviewed destination, fees and size. | The seed must be preserved independently. Encrypted scan history does not replace spending keys or persist the component's outgoing broadcast state. Mainnet remains disabled. [S10, S11] |
| TRON full-profile proof of concept | An in-memory spending/viewing key pair controls derivation and signing. The Sweep path rechecks balance, verifies reviewed transaction fields and releases its temporary key copy. | Exported key material and compatible tools remain necessary for independent recovery. Component broadcast state is not a durable outgoing transaction journal. Mainnet remains disabled. [S12, S13] |

No publisher-controlled refund key, custodial balance, unattended refund signer or
publisher recovery authority was found in the inspected Pages payment paths. A
seller-controlled transfer back to a payer would require a separately reviewed and
authorized outgoing transaction; an invoice timer does not provide that authority.
This observation must not be expanded into a claim about every experimental contract
or non-Pages branch in the repository. [S2–S5]

## Expiry, timeout and failure behavior

| Situation | Observed implementation | Status and practical limit |
| --- | --- | --- |
| Invoice expires before authorization | `assertInvoiceStillPayable` rejects expired invoices; fiat-priced invoices also respect quote expiry. `boundedDeadline` limits the transaction deadline to the last payable second. `sendPayment` repeats guards after asynchronous preflight. | **IMPLEMENTED IN SOURCE.** This prevents the inspected flow from starting a newly expired payment. It does not refund a previous payment. [S2, S6] |
| A delayed payment reaches its scheduled time | The Pay view revalidates the invoice and prepared context before proceeding. | **IMPLEMENTED IN SOURCE.** Delay completion is not independent payment authorization. Runtime clock/suspension acceptance remains unverified here. [S7] |
| Invoice expires while approval/payment work is already in flight | The view distinguishes an existing wallet handoff from a new action. Confirmed allowance and known transaction references are retained through subsequent failures. | **PARTIAL.** Expiry cannot establish that a handed-off transaction was cancelled or never broadcast. [S2, S7] |
| Wallet or network response becomes unavailable after handoff | The wallet path writes an attempt before invoking the provider. Unknown outcomes remain recorded; a hash returned before a persistence or verification failure is retained in typed outcome handling. | **IMPLEMENTED IN SOURCE WITH TAB-LIFETIME LIMITS.** No automatic timeout-based eviction is used, but a separate browser session is outside this journal's guarantee. [S2, S3, S8] |
| RPC has no receipt yet | Payment polling can return an unconfirmed result. A missing direct-Sweep receipt does not by itself release the Sweep lock. | **IMPLEMENTED IN SOURCE.** Absence of a receipt is not evidence of nonpayment. [S2–S4] |
| RPC returns a reverted payment | Payment results and exported local receipts distinguish reverted, included and unconfirmed states. | **IMPLEMENTED IN SOURCE.** A reverted outcome is not an automatic-refund event, and this assessment does not claim reimbursement of network fees. [S2, S3] |
| Sweep broadcast becomes uncertain | Direct Sweep keeps the expected transaction reference and nonce; the view retains a lock. Relayed orders remain unresolved unless their documented refusal or chain-state conditions apply. | **IMPLEMENTED IN SOURCE.** The lock's persistence is tab-scoped. [S4, S5, S9] |
| Direct Sweep needs replacement/recovery | The client can retain bounded same-nonce transaction references. A status check considers recorded references; finalized nonce consumption is used for the “replaced” path. | **PARTIAL.** This is a specific direct-Sweep mechanism, not automatic replacement discovery for every payer-wallet transaction. [S4, S5, S9] |
| Relayed order passes its deadline | Expiry resolution requires the finalized-block deadline margin and an unused order nonce at the canonical block. | **IMPLEMENTED IN SOURCE.** Order expiry releases a signing lock under those conditions; it does not refund an invoice payment. [S4] |
| A known transaction is included but later chain evidence changes | Seller reconciliation supports reorg invalidation. The normal payment receipt result and normal Sweep included status are not themselves comprehensive finality engines. | **PARTIAL.** Included-at-observation and final settlement must remain distinct. [S2–S4, S14] |

## Automatic refund lifecycle

The following findings concern the inspected invoice/payment product, not an approved
future refund design. A failed or expired invoice with no transfer does not require a
return transfer. A payment that already reached a seller-controlled address requires
new authority to move it back; the frontend's local expiry event cannot supply that
authority. [S2, S4, S6]

| Refund stage | Observed state |
| --- | --- |
| Eligibility rules | **NOT IMPLEMENTED** as a dedicated refund policy for expired, partial, excess or disputed invoice payments. Amount comparisons in reconciliation are not eligibility decisions. |
| Initiation | **NOT IMPLEMENTED** as an automatic expiry/timeout-triggered refund workflow in the inspected paths. |
| Authorization | **NOT IMPLEMENTED** as a dedicated payer-return authorization flow. Existing seller-controlled signing does not authorize an arbitrary refund recipient automatically. |
| Execution | **NOT IMPLEMENTED** as an automatic invoice refund executor. No refund transfer is scheduled by the inspected expiry handlers. |
| Confirmation | **NOT IMPLEMENTED** as a refund-specific transaction state machine. Existing ordinary payment/Sweep confirmation helpers do not constitute this feature. |
| Duplicate-refund prevention | **NOT TECHNICALLY APPLICABLE** to a nonexistent automatic-refund executor; **NOT IMPLEMENTED** as a dedicated record binding a future refund obligation to one authorized transfer. |
| Interruption recovery | **NOT IMPLEMENTED** as a refund-specific recovery mechanism. The existing transaction journals should not be represented as proof of one. |

Source basis: the expiry/send control paths [S2, S6, S7], seller transfer paths [S4,
S5], and reconciliation amount aggregation [S15]. A bounded source search of the
inspected browser/adapter/reconciliation paths found gas-buffer policy references,
not a dedicated automatic refund executor. This is source evidence, not a claim that
all historical repository branches were exhaustively audited by this worker.

The gas-buffer policy is more explicit: the invoice schema fixes `refund` to `none`
and rejects other values. Current invoice creation writes that policy. Returning an
unused gas buffer automatically is therefore **NOT IMPLEMENTED and contrary to the
current accepted schema**, not a feature that can be inferred from a successful
Sweep. [S16]

## Reconciliation and amount correctness

Seller reconciliation exists independently of a refund engine. The encrypted vault
stores seller/network-scoped observations, invoice annotations and archived receipts.
It preserves provenance, distinguishes imported history, checks current matching
conditions, and maintains reorg invalidation information. Importing history does not
turn it into newly verified chain evidence. [S14]

`createInvoicePaymentSummarizer` aggregates only qualifying live-scan observations
that have explicit invoice links. It uses integer amounts, deduplicates transaction-log
identities, refuses conflicting copies, and distinguishes no linked observations,
below, equal and above the expected net amount. It does not infer invoice attribution,
query current receipts, execute a transfer, or perform a new finality check. [S15]

Accordingly:

- **Partial/underpayment and overpayment reporting: IMPLEMENTED IN SOURCE** for the
  eligible, explicitly linked records supported by this summarizer.
- **Automatic collection of the difference or refund of excess: NOT IMPLEMENTED**
  by that mechanism.
- **Duplicate observation detection: IMPLEMENTED IN SOURCE** in the summarizer's
  transaction-log identity handling.
- **Universal duplicate-payment prevention: PARTIAL.** Distinct real transactions
  remain distinct observations; a local amount comparison is not a global invoice
  payment lock.
- **End-to-end current settlement guarantee: UNVERIFIED.** The source deliberately
  describes evidence as verified at scan time, with separate invalidation handling.

## Restart and loss-of-state boundaries

The ordinary wallet-attempt journal and EVM Sweep journal use `sessionStorage`.
They are designed to survive a reload of the same tab and fail closed when their
stored records cannot be read. Their source does not provide shared coordination
between independent tabs or a durable application-wide journal that is guaranteed
to survive closing the browsing session. The Pay journal also does not automatically
classify arbitrary replacement transactions from an external wallet. [S8, S9]

The encrypted reconciliation vault is separate IndexedDB-backed state. Recovering
historical observations is not equivalent to recovering an unresolved outgoing
wallet request. A valid key backup is also not equivalent to a complete journal,
invoice history, chain scan or external spending-tool acceptance. [S8, S9, S14]

The Bitcoin and TRON views retain outgoing broadcast outcomes in React component
state. They preserve an attempted public reference during certain in-page changes,
but this is not a persistent outgoing transaction recovery record. Their key wallets
are explicitly in memory, and their backup/export boundaries must be qualified
separately. [S10–S13]

**Independent recovery without GhostPay availability remains UNVERIFIED by this
assessment.** It needs separately recorded evidence that the complete intended
backup restores the expected keys and that a compatible external tool can use the
required chain, asset and payment-discovery information. A key-export function or
unit-level round trip cannot by itself prove that result.

## Prioritized engineering work

Priorities below describe the consequence of a missing capability or qualification;
they are not claims of an observed exploit, actual lost funds or a proven production
incident. Existing active owners and donor branches must be reconciled before edits.

| Priority | Gap or remaining gate | Recommended bounded outcome |
| --- | --- | --- |
| P0 | Unresolved attempts do not have an application-wide, restart-qualified recovery guarantee. | Define the supported persistence/retention boundary and an explicit user-controlled recovery record. Preserve uncertainty and prevent silent cleanup of unresolved financial evidence. Review privacy and existing retention ownership before implementation. |
| P0 | Key material, discovery information and transaction evidence are separate recovery requirements. | Document a completeness contract per supported mechanism; record independent restoration and external-tool acceptance before claiming recoverability. Preserve sole-copy recovery material. |
| P0 | Refund expectations are not represented by an implemented refund lifecycle. | State the current no-automatic-refund behavior in release acceptance and user-facing recovery guidance. Any future return-payment flow requires explicit recipient/asset/network/amount authority and an obligation identity; do not add custody or unattended signing. |
| P1 | Included and settled/final states have different meanings. | Keep those states explicit and define chain-specific finality/reconciliation acceptance for the supported release profile. Treat missing or contradictory evidence as uncertain. |
| P1 | Payer-wallet replacements and the direct-Sweep recovery mechanism differ. | Specify payer-side replacement discovery and manual reconciliation separately; do not transfer the direct-Sweep guarantees to external-wallet payments. |
| P1 | Journal malformed-state validation requires consistent fail-closed handling. | Coordinator owns the separately scoped parser review and qualification. Preserve valid journal shape, existing persistence policy and every unrelated signing safeguard. This report adds no payloads or reproduction procedure. |
| P1 | BTC/TRON optional paths have separate network and outgoing-state gaps. | Reuse existing #338 and #340/#342 work after exact-source qualification; keep optional/full-profile and lean release gates separate. Do not enable mainnet or widen Pages scope. |
| P2 | Amount comparisons can be mistaken for automatic settlement/refund decisions. | Keep below/equal/above labels tied to eligible observations and explicit seller attribution. Document how uncertain, imported or invalidated evidence affects the display. |

### Actionable acceptance checklist

- [ ] Reconcile this source assessment with the latest main and #307 heads and
  existing ownership before selecting further code work.
- [ ] Record whether each supported payment route has pre-handoff, handed-off,
  uncertain, included, reverted and reconciled states, and its persistence lifetime.
- [ ] Keep unresolved financial records distinct from privacy cleanup preferences
  until their retention and recovery contract is approved and verified.
- [ ] Require explicit source-pinned evidence for browser-process restart recovery;
  do not substitute a page reload or in-memory round trip.
- [ ] Qualify independent backup restoration and external recovery for each claimed
  mechanism/asset; record unavailable environments as unverified.
- [ ] Publish a precise statement that invoice expiry and network timeout do not
  initiate an automatic refund in this product.
- [ ] Keep any future refund request, user authorization, transfer reference,
  confirmation and repeat-execution record separate from invoice expiry status.
- [ ] Preserve existing transaction-context, fee, amount, network, nonce and
  current-session guards during any approved continuation.
- [ ] Obtain independent review and applicable exact-source CI/browser acceptance
  for the resulting candidate before marking a financial-safety gate complete.

## Execution and handoff

This report was produced from source inspection only. No runtime checks are claimed.
The previously committed parser regression checkpoint is
`25bf08c48a79447ffa0f41b1d61cb41e35c357b4`; this documentation task neither changes
that file nor the production journal. The coordinator owns any subsequent source
correction, qualification, publication and integration. The scope change is recorded
additively in `docs/ai/ACTIVE_WORK.md`.

The original required-privacy, backup, receipt, signed-file and recovery stacks retain
their owners. In particular, #333/#335/#344 and the external integration lease were
not modified. The full open-PR path-overlap assessment supplied by `branch_recovery`
is coordination evidence, not validation of the payment guarantees discussed here.

## Immutable source index

All links below use application source `5a745d4b5fba69b66a9779f88aefc63c253a4f27`.

- **S1:** [AppLean.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/AppLean.tsx) and [App.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/App.tsx): lean versus full route imports.
- **S2:** [payExec.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/payExec.ts): `submitTx`, `sendPayment`, `PostBroadcastError`, `buildReceipt`.
- **S3:** [wallet.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/wallet.ts): `sendViaWallet`, wallet authority checks, `verifySubmission`, `pollReceipt`.
- **S4:** [sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/sweep.ts): verified key derivation, direct/relayed signing, `reconcileSweepLock`, `reconcileRelayedOrder`, receipt/nonce evidence.
- **S5:** [Sweep.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/views/Sweep.tsx) and [state.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/state.tsx): review ownership, pre-handoff persistence, current-lock comparison and replacement bookkeeping.
- **S6:** [pay.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/pay.ts): `invoicePayableUntil`, `assertInvoiceStillPayable`, `boundedDeadline`, buffer freshness and amount caps.
- **S7:** [Pay.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/views/Pay.tsx): delayed execution, handoff distinction, approval retention and post-broadcast UI.
- **S8:** [duplicateAttemptJournal.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/duplicateAttemptJournal.ts): session storage, begin/finish/explicit-clear operations and no automatic eviction.
- **S9:** [sweepAttemptJournal.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/sweepAttemptJournal.ts): tab-scoped lock records, bounded references, fail-closed unavailable-state policy.
- **S10:** [BtcView.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/btc/BtcView.tsx) and [Bitcoin network.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/btc/network.ts): local broadcast state and disabled mainnet selection.
- **S11:** [Bitcoin wallet.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/btc/wallet.ts) and [Bitcoin sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/btc/sweep.ts): in-memory seed-derived wallet and reviewed signing.
- **S12:** [TronView.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/tron/TronView.tsx) and [TRON network.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/tron/network.ts): local broadcast state and disabled mainnet selection.
- **S13:** [TRON wallet.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/tron/wallet.ts) and [TRON sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/features/tron/sweep.ts): in-memory key ownership and reviewed signing.
- **S14:** [reconciliationVault.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/lib/reconciliationVault.ts) and [reconciliation-portable.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/packages/ux-vault/src/reconciliation-portable.ts): scoped encrypted history, import provenance, matching and reorg invalidation.
- **S15:** [reconciliation-amounts.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/packages/ux-vault/src/reconciliation-amounts.ts): integer amount summaries and observation-identity conflict handling.
- **S16:** [invoice schema.ts](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/packages/invoice-schema/src/schema.ts) and [CreateInvoice.tsx](https://github.com/djshellshoxxx/GhostPay/blob/5a745d4b5fba69b66a9779f88aefc63c253a4f27/apps/web/src/views/CreateInvoice.tsx): the explicit gas-buffer `refund: 'none'` policy.
