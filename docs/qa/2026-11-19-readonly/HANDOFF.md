# Repair-worker handoff

## Start from current source

The QA execution base is `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Last compared main is `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; last
compared PR #306 is `885b9569e6fc99e43bf01d23305494275e10120e`.
Re-read live main, active ownership and relevant open PRs before repairs. The three
functional/API implementations were unchanged on these later heads. No fix was
made in this QA branch. Do not merge old source merely to recover these notes.

Use separate focused patches, preserve current guard behavior, and qualify the
actual repaired head. Existing high coverage missed the reported boundaries.

## 1. QA-01: restore backup operation-state ownership

Owner area: `apps/web/src/views/SellerKeys.tsx`. See BROWSER-QA-01 in
[BROWSER_QA.md](BROWSER_QA.md) for exact main lines and controlled observations.

The same controller cancels export and verification, but each form has a separate
busy flag. A superseded handler returns before its own cleanup. Either serialize
incompatible actions visibly or model operation kind, cancellation and busy state
with one clear owner. Clear obsolete state without clearing a newer operation's
state. Preserve the separate lifetime of pending local-vault save/delete writes.

Acceptance:

- Export followed by verification, and verification followed by export, both end
  with correct enabled controls after resolve or reject settlement.
- Explicit Cancel and a single normal export remain correct.
- Late results, navigation/unmount and session/idle changes do not publish stale
  status or revive an obsolete operation.
- Existing backup validation, passphrase policy, session guards and durable-write
  behavior remain intact. Add regression coverage to the real component and
  qualify a browser journey with deliberately delayed ordinary operations.

The original SellerKeys suite did not complete locally because its worker was
killed. Its complete unchanged suite and applicable hosted CI remain repair gates;
the four scratch probes are evidence for this defect, not a substitute.

## 2. QA-02: make successful URI builds round-trip

Owner area: `packages/payment-uri/src/{bitcoin,solana,tron,query,text}.ts`.
Apply the shared final encoded-length policy before returning a built URI.
Individually valid decoded fields can exceed 2,048 characters after encoding.
Do not silently truncate text, recipient, token, references or amount.

Acceptance:

- The three precise NFC Unicode examples in CORE-QA-01 either yield the existing
  typed `TOO_LONG` refusal or a URI accepted by the matching parser.
- Cover combined fields and percent-encoded lengths below, at and above the cap;
  include ASCII and multibyte text plus optional address/token/reference fields.
- Every returned URI preserves semantic values through its matching parser.
- Retain existing normal vectors and the original coverage-enabled package gate.
  Where the component accepts these optional fields, check graceful refusal.

This is a shared-library defect; the reviewed active EVM form was not shown to
reach these specific long optional-field combinations.

## 3. QA-03: preserve the decimal helper's typed error contract

Owner area: `packages/payment-uri/src/decimal.ts`. Validate the documented finite
integer precision domain before bigint conversion. Use `PaymentUriError` for
unsupported options consistently with sibling helpers; define the upper supported
domain rather than introducing an unexplained bound.

Acceptance: valid 0/2 and existing 8/18 callers keep exact behavior; negative,
fractional and nonfinite precision reject through the documented error channel.
Retain exact decimal roundtrips across the supported domain. This is distinct
from the separate web `parseUnits` fixes in PR #301/#303.

## 4. QC-01: synchronize the ledger test with actionability

Owner area: `apps/web/src/components/ReconciliationLedger.test.tsx`, especially
the presence-only wait and activation click around lines 200–215 on the QA base.
The component can show its preview while completing `readState()`, with Activate
correctly disabled. A click in that interval is ignored and never replayed.

Acceptance: wait for the control to be enabled before clicking; retain the
historical/untrusted provenance assertions. Add a delayed-readback case that proves
activation occurs exactly once after an actionable click. Do not use arbitrary
sleeps, relax provenance assertions or call this a product data-loss fix.

## 5. Resume existing candidate and qualification work

PR #300's dependency has a separate wallet-attempt identity-wiring task. Four
production call sites omit the wallet identity required by the component. Its
published head and tested merge share a tree; hosted Beta/Pages journeys fail to
show the expected transaction details. Continue the existing owner handoff cited
in QC_REVIEW.md, preserve matching-account/chain filtering, and qualify reconnect,
reload, account/chain changes and policy/registry flows.

Refresh the recorded queued CI states and triage the existing failed Nightly
Mythril job through the established review process. Keep PR-only skipped deployment
jobs separate from production qualification. Obtain real browser engine and manual
accessibility evidence for the gaps documented in QC_REVIEW.md.

## Evidence discipline

Use process exit status, worker errors, assertion completion and coverage together.
Vitest emitted misleading success fields for killed workers in this session. Keep
those attempts non-green. The later complete 284-case vault pass supersedes its
initial incomplete qualification, while the broad web and original scanner runs
still lack complete local passes. The native one-million-entry diagnostic is
separate source execution with the existing bounded corpus.

The notes include seeds, workload bounds, source/blob identities, exact original
commands, failed conditions and desired outcomes. Temporary harness source was not
added to the application or test tree because the QA instruction prohibited code
changes. A repair worker should turn the ordinary cases described here into
maintained regression tests on the repaired branch.
