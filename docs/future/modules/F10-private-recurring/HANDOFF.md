> **Coordinator update — 2026-11-20:** Current-main integration, whole-web TypeScript, scoped typed lint, module coverage, lean build and bundle validation now pass. See [COORDINATOR_VERIFICATION.md](COORDINATOR_VERIFICATION.md) and [PUBLICATION.json](PUBLICATION.json). Earlier pending/resource statements below are historical; hosted CI and full feature/UI integration remain separate.

# F10 private recurring — first implementation milestone

Date: 2026-11-20. Branch: `future/f10-private-recurring`.

**M1 implements staged plan validation, bounded due-period previews, and explicit
local review. F10 is not a complete product and is not mounted or enabled in any
production or lean route.** No invoice signing, issuance, persistence, payment,
notification, fee change, or deployment is performed by this milestone.

## Source identity and ownership

- Original specification: `1c1f2aedb0941a0aeb389a5f5b0dd1ebb68e78d9`.
- Consolidated main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Ownership claim: `03f27f61`; main merge: `6d71e9ab2f0fad7ab08777ca31a8eed9e16538ca`.
- Product and test source: `e0b6e44379447037be09d20934972d8afc7a6600`.
- Owned source: `apps/web/src/features/future/private-recurring/**`.
- Only dependency change: declare the existing `@ghostpay/merchant-billing` workspace
  in the web manifest and its matching lock entry. External versions are unchanged.

The main merge preserved both competing `ACTIVE_WORK.md` sections. The inherited
hosting evidence file `static-export-red.log` contains four pre-existing trailing
whitespace lines; its bytes were retained. The new feature diff passes whitespace
validation.

## Implemented contract

`model.ts` validates the proposed `RecurringPlanV1` fields and a versioned browser
snapshot. It rejects duplicate JSON keys, unsupported versions and fields,
accessors, sparse arrays, ambiguous integers, host file paths, and malformed
references. Parsed records are detached and frozen. Text intake is limited to
1 MiB, with at most 100 plans and 1,000 invoice-artifact references.

`amountAtomic` is a branded positive token-base-unit decimal string, bounded to
uint256. It is not the `amountMinor` fiat price used by the existing billing
package. No implicit conversion or decimal metadata lookup is introduced.

Asset syntax is deliberately limited to canonical EVM fungible asset types:
`eip155:<positive-safe-integer>/erc20:<lowercase-0x-address>` or
`eip155:<positive-safe-integer>/slip44:<canonical-integer>`. This version caps the
SLIP44 reference at 2,147,483,647. Structural acceptance does not verify registry
membership, chain support, native-coin mapping, token decimals, or template
compatibility. The future P04 adapter must establish those facts before issuance.

Snapshot outbox entries contain only invoice-artifact references and their
claimed local lifecycle metadata. Their identities use existing `logicalId`.
Duplicate plan-period IDs and reused artifact references reject. A recorded period
cannot be at or beyond its plan's next cursor. Older plan-revision references are
retained; their amounts are never inferred from today's plan. Imported status does
not authenticate an artifact or establish payment finality. Reminder records and
actual invoice authentication remain outside this staged format.

`previewDue` calls existing `periodStart` and `periodAt`; it never calls `advance`,
creates an invoice, or consumes nonce randomness. It preserves UTC month-end
clamping, uses timezone only as validated presentation metadata, and returns at
most 24 periods with an explicit `hasMore` indicator. Paused/cancelled plans return
no due work. The terminal schedule cursor is exhausted rather than an extra period.

`RecurringReviewController` holds one review. Approval selects only its earliest
due period and consumes the review even on refusal. The controller compares the
complete validated snapshot, operation ID, session epoch, and abort signal. It
rejects changed terms/cursors/profile, backwards clock values, and approval at or
after the five-minute deadline. A new preview, explicit cancel, or abort revokes
the prior review. Abort/cancel removes the listener and the controller's private
snapshot; the consumer remains responsible for clearing its displayed copy.

The returned `ApprovedRecurringPeriod` is a local reviewed selection. It is not a
signing capability, committed outbox entry, or cross-tab lease. P04/P05 must
revalidate current authority and reserve the period atomically before any future
effect. Reopening or making a new review against unchanged state can select the
same stable event ID; actual duplicate issuance protection belongs to that durable
reservation, which is not implemented here.

`parseRecurringSnapshot` performs staged validation only. It does not restore or
activate a profile. A future legacy-import migration must present active imported
plans as paused and require fresh consent before activation.

## Verification executed

Environment: Node `v24.22.3`, Vitest `5.0.5`; normal web Vite configuration with one
worker at a time. Existing workspace libraries were built from the consolidated
main source before testing. No test assertions, exclusions, or thresholds changed.

```sh
npm exec --workspace @ghostpay/web -- vitest run \
  src/features/future/private-recurring/model.test.ts \
  src/features/future/private-recurring/review.test.ts --maxWorkers=1 \
  --coverage \
  --coverage.include=src/features/future/private-recurring/model.ts \
  --coverage.include=src/features/future/private-recurring/review.ts \
  --coverage.reporter=text --coverage.reporter=json-summary
```

Result: **84 tests passed in 2 files**, no skips. Coverage for the two new source
modules: **95.58% statements, 93.95% branches, 100% functions, 100% lines**.
This is scoped module coverage, not a whole-web coverage claim.

Tests cover non-leap/leap month-end anchors, weekly/custom periods, presentation
timezone changes, long-sleep bounds, terminal horizons, exact amounts, staged
snapshot identities, malformed intake, stale terms/revisions/profiles, cancellation,
single-use review, clock boundaries, and absence of random/network/wallet calls
during preview. Source whitespace checks pass.

An initial scoped typed ESLint attempt exited **137 (killed)** under shared memory
pressure; it did not produce a passing lint result. Typed lint and full-web typecheck
are queued for serial coordinator validation. Independent review, static artifact
qualification, native browser execution, and actual P04/P05 integration are pending.

## Acceptance status

| Spec cases | M1 evidence | Remaining work |
|---|---|---|
| A01–A02 | Existing UTC cadence preserved across month-end, leap year, and display zones | Browser form/calendar presentation |
| A03 | Catch-up preview capped at 24; no invoice/network side effects | Encrypted restore and issuance workflow |
| A04 | Stable event IDs, duplicate metadata refusal, changed cursor invalidates review | Atomic reservation, crash recovery, multi-tab integration |
| A05 | Immutable terms and full-content review binding; older artifact refs stay separate | Signed invoice preservation across real plan edits |
| A06 | Paused/cancelled plans offer no due work | Versioned pause/resume/cancel mutations and boundaries |
| A07–A08 | Abort/cancel/epoch/revision/clock guards for local review | Actual signer/export lifecycle, app lock integration |
| A09 | Not implemented | Reminder preview/export with stable identities |
| A10 | This adapter has no wallet or debit capability | Voluntary payer renewal browser journey |
| A11 | Bounded strict staged snapshot validation | Authenticated artifact checking and paused legacy migration |

## Research decisions

- [RFC 5545, section 3.3.10](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.10)
  omits invalid recurrence dates. GhostPay's existing monthly schedule instead
  clamps to the month's last day while retaining the original anchor. Reusing
  the existing helpers preserves this documented behavior; no RRULE library or
  calendar semantic change was added.
- [CAIP-19](https://standards.chainagnostic.org/CAIPs/caip-19) separates chain and
  asset type and leaves canonicalization to consumers. This module selects a
  narrower lowercase EVM profile to avoid ambiguous stored identifiers.
  [CAIP-20](https://standards.chainagnostic.org/CAIPs/caip-20) specifies decimal
  SLIP44 references; the numeric ceiling above is this module's bound, not a
  claim that CAIP-20 imposes that limit. No external code was copied.

## Next bounded task

First finish independent review and serial lint/typecheck at the exact source.
Then agree the P05 transactional period-reservation and P04 typed invoice-template
contracts. Preserve the distinction between token atomic amounts and fiat plans;
do not pass the new plan directly to `advance`. Add an actual disabled browser
consumer that stages imported plans as paused, clears views on lock, and obtains
fresh exact-term approval before durable reservation and signing. Test two-tab
contention, failed export retry, and crash restoration before claiming A04/A07
complete. Remain outside production routes until consumer/provider acceptance
and separate release qualification are evidenced.
