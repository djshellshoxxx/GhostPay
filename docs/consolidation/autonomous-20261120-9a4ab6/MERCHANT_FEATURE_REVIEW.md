# Invoice and merchant feature review

**Result:** preserve the existing F03 implementation in #307, reuse the separate
F04/F05/F10 milestones, and keep their incomplete application integrations
explicit. Fresh hosted evidence advances #310 and #322 beyond the pending
status in their PR descriptions. #323 and #324 have two concrete dependency
qualification failures apiece; their feature unit and browser jobs are not the
failed gates.

Worker: `/root/merchant_feature_review`; audit branch:
`audit/ghostpay-merchant-feature-review-20261120-9a4ab6`. This is a bounded
source, ownership and existing-evidence review. No product test was executed,
feature enabled, original branch changed, PR written, lease acquired or shared
target modified by this worker.

## Source and ownership

The final metadata refresh was **2026-11-21 00:10:04 UTC** (20 November, Pacific).
All four feature heads matched the complete 111-PR discovery snapshot. The
evidence prefix has no changed-path owner in that snapshot. Existing module
owners and their implementation claims remain authoritative.

| Role | Exact source / recorded owner |
| --- | --- |
| Main | `aec179910c39081d820396409ff3139ff2264132` |
| Integration #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| F03 #310 | `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`; `future/f03-private-payment-links`; recorded coordinator and `f03_main_reconciliation_review` |
| F04 #322 | `066731b4d6d19d96469dd18fa082b264f3efed5d`; `future/f04-merchant-dashboard`; `future_features/f04_dashboard` |
| F05 #323 | `ccd1b16dea7be84552f40d3bcd0f23b4224699d3`; `future/f05-ghostproof`; `future_features/f05_ghostproof` |
| F10 #324 | `4a48f2f09b1334036a6a88bab4e51f958cee46dd`; `future/f10-private-recurring`; recorded `future_inventory` under the future-feature continuation lead |

These are the recorded source owners, not a claim that those historical workers
are currently executing. The four PRs remain open drafts. Their recorded base
is main `aa3df1cb37274fae73af0ca957183c15c51b62d3`, older than current main.
GitHub reports all four presently nonmergeable. Required composition review and
the integration lease remain coordinator-owned.

## Implemented, partial and missing

| Feature | Verified implementation | Current integration / remaining work |
| --- | --- | --- |
| Signed invoice request files, F03 | Strict bounded three-field transport; exact original signed envelope; seller download; payer local import, preview and explicit open; existing signature/passphrase/expiry/payment review; lock/session/disclosure invalidation. | **IMPLEMENTED in #307 for the selected file-interchange scope.** Full candidate qualification stays separate. Broader future F03 policies/provider abstractions are outside this slice. |
| Merchant projections, F04 | Immutable bounded EVM claims; bigint totals separated by chain/asset; explicit invoice binding; duplicate/conflicting observation handling; separately injected evidence assessments; pending/final/late/reorg states; cancellable rebuild and selectors. | **PARTIAL on #322; MISSING from #307/main.** No browser route, actual P03 evidence composition, P05 encrypted journal/concurrency, deliberate export UI, recovery or feature browser acceptance. |
| Offline receipt assurance, F05 | Existing digest/signed-receipt verification reused; immutable disclosure review; signer trust and invoice binding separated; bounded input; cancellable import session; unsupported finality/ownership/audience/ZK claims refused. | **PARTIAL on #323; MISSING from #307/main.** No mounted UI, application-lock consumer, P12/P05 composition or consented export journey. Dependency qualification is **BLOCKED** by the current failed CI gates. |
| Recurring invoice previews, F10 | Strict staged token-atomic plans/snapshots; existing UTC schedule arithmetic; up to 24 due periods and `hasMore`; paused/cancelled plans yield none; single-use, five-minute, context-bound review of the earliest due period. | **PARTIAL on #324; MISSING from #307/main.** No durable reservation, signing/issuance, encrypted restore, cross-tab/crash recovery, reminder workflow or mounted browser consumer. Dependency qualification is **BLOCKED** by current CI. |

All four selected feature lanes have been mapped. This is not a four-item
release-completion denominator: their scope and remaining work differ greatly.
An overall completion percentage cannot be derived from these source counts.

### F03: do not duplicate retained behavior

None of the four current feature heads is an ancestor of frozen main or #307.
For F03 that history fact does **not** mean its implementation is missing:

- **15 of its 20 changed application/package paths are byte-identical in #307**,
  including `requestFile.ts`, both file components, their tests, CreateInvoice,
  Pay, the repaired six-case browser file and the QR/interoperability tests.
- The remaining five files are four aggregate catalogs and `securityKeys.ts`.
  All **60 `requestFile.*` catalog values** (15 per locale) and all **15 security
  key entries** are retained exactly. Unrelated aggregate additions explain
  different full-file blobs.
- The F03/#307 comparison has two best merge bases, `aa3df1cb` and `1de98f6c`.
  The retained implementation is established by actual source/blob comparison,
  not by choosing an arbitrary merge base or assuming the latest head was merged.

The 24 KiB wrapper carries the unchanged bounded invoice fragment. It adds no
encryption, seller identity or authorization. File intake checks strict UTF-8,
actual/declared size and current operation/session/disclosure state before
calling the existing preview. The Pay view has a separate explicit open action;
file selection is not a wallet connection or payment authorization. Source:
[codec](https://github.com/djshellshoxxx/GhostPay/blob/dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec/packages/invoice-schema/src/requestFile.ts),
[file input](https://github.com/djshellshoxxx/GhostPay/blob/dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec/apps/web/src/components/PaymentRequestFileInput.tsx),
[Pay wiring](https://github.com/djshellshoxxx/GhostPay/blob/dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec/apps/web/src/views/Pay.tsx).

### F04/F05/F10: primitives are not complete applications

All five F04 module files and all six F05/F10 module files are absent from both
targets. In each feature branch, a bounded search for the module name and public
entry points finds no reference outside its own future-module directory under
`apps/web`. No route file changes in these feature diffs wire them into the app.
Their preserved coordinator reports also show the 16 lean application/assets
files identical to their incorporated main baseline. Keep these development
milestones separate from production feature acceptance.

F04 accepts a synchronous local evidence provider; it does not itself query or
verify the chain. Its provider-final amount is distinct from pending and late
amounts. Coverage remains `not-evaluated`, missing fees remain `null`, conflicting
event copies cannot supply totals, and imported status is not finality. Neither
an overpayment label nor a projection initiates a refund. See
[projection](https://github.com/djshellshoxxx/GhostPay/blob/066731b4d6d19d96469dd18fa082b264f3efed5d/apps/web/src/features/future/merchant-dashboard/projection.ts)
and [handoff](https://github.com/djshellshoxxx/GhostPay/blob/066731b4d6d19d96469dd18fa082b264f3efed5d/docs/future/modules/F04-merchant-dashboard/HANDOFF.md).

F05 explicitly returns `chain: not-checked` and `freshness: unknown`. A digest's
self-consistency, a signature, caller-supplied signer trust and invoice binding
remain distinct assurances. Its import session clears cancelled/obsolete local
results, while the future consumer must discard its own displayed copy and
supply the lock/identity abort signal. See
[review](https://github.com/djshellshoxxx/GhostPay/blob/ccd1b16dea7be84552f40d3bcd0f23b4224699d3/apps/web/src/features/future/ghostproof/review.ts)
and [session](https://github.com/djshellshoxxx/GhostPay/blob/ccd1b16dea7be84552f40d3bcd0f23b4224699d3/apps/web/src/features/future/ghostproof/session.ts).

F10 uses token atomic amounts, distinct from the existing billing package's
fiat minor units. Staged import does not activate a plan. Review approval returns
a selected period; it neither reserves that period durably nor grants signing
authority. A fresh review of unchanged state can select the same stable event ID.
Actual duplicate issuance protection requires the unfinished transactional
reservation and recovery composition. See
[model](https://github.com/djshellshoxxx/GhostPay/blob/4a48f2f09b1334036a6a88bab4e51f958cee46dd/apps/web/src/features/future/private-recurring/model.ts)
and [review](https://github.com/djshellshoxxx/GhostPay/blob/4a48f2f09b1334036a6a88bab4e51f958cee46dd/apps/web/src/features/future/private-recurring/review.ts).

## Fresh hosted evidence versus historical records

The original coordinator reports record focused **61/61 F04**, **67/67 F05**
and **84/84 F10** cases, zero skips, original module coverage thresholds,
whole-web TypeScript, scoped typed lint and lean artifact comparison. This
worker read those reports and did not rerun or re-count them as new tests.

| PR | Fresh current-head workflow/job observation | Consequence |
| --- | --- | --- |
| #310 | All five returned workflows succeed; all 24 CI jobs succeed, including both native browser jobs. Full log: 88 passed, one skipped; lean log: 76 passed, three skipped. Each explicitly records all six request-file cases passing. | The old “browser only collected / CI pending” description is superseded for this donor composition. It is not a #307 browser pass. |
| #322 | All four returned workflows and all 24 CI jobs succeed, including web tests, lint, typecheck and both browser profiles. | Hosted donor CI now passes. No F04 UI exists for those general browser jobs to accept. |
| #323 | Four non-CI workflows succeed. CI has 22 successful jobs, `ts-test (rest-0)` failed and dependent `typescript` failed; web tests, lint, typecheck and both browser jobs succeed. | Fix the two actual script assertions below, then requalify the corrected composition. |
| #324 | Four non-CI workflows succeed. CI has the same 22-success/two-failure job shape; web tests, lint, typecheck and both browser jobs succeed. | Same gate categories, with a different dependency delta. |

The decoded logs identify actual synthetic checkout commits:
F03 `cbe4cd039eced42d2260e085f108bf4388390617`,
F05 `09f3bcc032bd3ae089f9ff07484b6c50c912224b`, and
F10 `0e78c6af01654a88dec0d19eb6d9d37328926f1b`.
Each log identifies its feature head and main `aa3df1cb` parent. These executions
belong to those hosted compositions, not to current main or #307. Returned
workflow/job collections are snapshots and not a completeness claim about every
external security check or branch-protection requirement.

### Exact F05/F10 failed gates

Both `rest-0` logs finish their Node script suite with **234 passed, two failed,
zero skipped** (236 total). The failures are:

1. `scripts/agent/workspaces.test.mjs`: the generated `PACKAGE_MAP.md` is stale
   after the web workspace's dependency declaration changed.
2. `scripts/tests/lean-core-reachability.test.mjs`: the actual web dependency
   closure exceeds the original `WEB_REVIEWED + WEB_PENDING_OWNER_REVIEW` set.
   F05 adds **`@ghostpay/ux-receipts`**. F10 adds
   **`@ghostpay/merchant-billing`** and transitive **`@ghostpay/merchant-hooks`**.

These are real failed gates, not a new TypeScript compiler error. They do not
demonstrate a failed receipt or recurrence assertion. The existing closure test
requires an explicit owner decision for new dependencies; generating the package
map alone does not satisfy that decision. Preserve the original strict closure
check and its distinction between reviewed and pending entries. Review the exact
dependency surface and lean source/artifact boundary before any gate update.

Decisive jobs: [F03 full](https://github.com/djshellshoxxx/GhostPay/actions/runs/44778314192/job/136549640729),
[F03 lean](https://github.com/djshellshoxxx/GhostPay/actions/runs/44778314192/job/136549640777),
[F05 rest-0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777155115/job/136487179207),
[F10 rest-0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777159872/job/136494576772).

## Next bounded tasks under existing ownership

| Owner / source | Next work | Verification after the approved change |
| --- | --- | --- |
| Integration coordinator; #307 plus existing #333/#335/#344 dependency stack | Preserve the already retained F03 runtime/browser tests and the existing request-file synchronization successor. Reconcile current main under the held-lease protocol. | Requalify the actual composed source; do not repeat #310's old exact-head work solely because its PR body is stale. |
| F04 owner; `066731b4` | Compose P03 canonical evidence/coverage and P05 authenticated encrypted journal revisions before UI activation. Then add deliberate disclosure/export and lock/recovery/browser acceptance. | Existing merchant-dashboard suite, complete original web gates, and new consumer/provider acceptance for the implemented slice. |
| F05 owner; `ccd1b16d` | Reconcile the workspace map and explicitly review the added dependency boundary. Then integrate localized UI, app-lock cancellation and verified claim context with P12/P05. | Existing script assertions and focused ghostproof suite; full corrected-head CI and actual feature browser journeys. |
| F10 owner; `4a48f2f` | Reconcile the map/dependency boundary. Define P04 typed template/authenticated artifact and P05 atomic reservation contracts before issuance or activation. | Existing script assertions and recurrence suite; later two-tab/crash/restore acceptance and browser approval lifetime. |

The two existing script assertions can be selected without changing their gates:

```sh
node scripts/agent/package-map.mjs --check
node --test scripts/agent/workspaces.test.mjs scripts/tests/lean-core-reachability.test.mjs
```

Run these only at the intended corrected feature/composition source. Regeneration
uses the existing `node scripts/agent/package-map.mjs` generator after the
dependency decision; this reviewer did not regenerate or change the map.

For future F03 composition verification, the existing browser script accepts:

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web -- e2e/payment-request-file.spec.ts
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web -- e2e/payment-request-file.spec.ts
```

The original configuration builds its own fixture-scoped application and uses
the configured installed Chromium. These commands are handoff instructions, not
new execution claims. They do not establish Firefox, WebKit, physical-device,
external-wallet, real-provider or live-chain acceptance.

## Evidence and local verification

- `MERCHANT_FEATURE_SOURCE.json`: every selected application path's mode/blob,
  SHA-256 and target classification; all best merge bases; manifest deltas;
  zero-caller searches; F03 message/security-key retention; ownership snapshot pin.
- `MERCHANT_FEATURE_GITHUB.json`: final exact PR metadata, returned workflows,
  all 24 CI job results per feature and failed step names.
- `MERCHANT_FEATURE_CI_LOGS.json.gz` and its index: lossless UTF-8 decoded logs for
  the two F03 browser jobs and two failed script jobs, with per-log and archive
  hashes. Raw bytes were not trimmed to satisfy whitespace checks.

Only source/metadata inspection, archive/hash integrity and whitespace/scope
checks were performed locally. This evidence extends `ACTIVE_WORK.md`; it does
not create a competing task ledger or transfer implementation ownership.
