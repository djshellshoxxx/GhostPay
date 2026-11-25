# F10 independent milestone review

Date: 2026-11-20. Reviewer: `f10_independent_review`.

**No introduced blocking defect was found in the reviewed M1 scope.** The
maintained focused suite independently passed 84/84 tests. This is a review of
an isolated planning and local-review foundation, not approval of a complete
recurring-invoice product or production activation.

## Source identity and scope

- Branch: `future/f10-private-recurring`.
- Product and test source: `e0b6e44379447037be09d20934972d8afc7a6600`.
- Initial documentation head: `e7991b659fb77c748bf82de6f2e4fe7f8242cc57`.
- Consolidated main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

Reviewed all six new files in
`apps/web/src/features/future/private-recurring/`: `model.ts`, `review.ts`,
`index.ts`, both test files, and the fixture helper. Also reviewed the web
manifest/lock changes and the consumed behavior of existing `periodStart`,
`periodAt`, `validateSchedule`, `logicalId`, `parseStrictJson`, and
`canonicalize` helpers. Product source was unchanged during this review.

## Assessment

| Boundary | Review result |
| --- | --- |
| Monetary units | Positive canonical uint256 token-atomic strings remain distinct from the existing billing package's fiat-minor plans. No price conversion is inferred. |
| Calendar behavior | Existing UTC schedule helpers preserve the original monthly anchor, month-end clamping and leap years. Display timezone is separate metadata. Weekly/custom schedules retain existing bounds. |
| Resource bounds | Intake checks text and UTF-8 size before strict JSON parsing; plans/outbox references are bounded. Due previews return at most 24 periods and an explicit `hasMore`. The terminal cursor creates no extra period. |
| Snapshot integrity | Closed records, duplicate-key rejection, immutable copies, canonical references, safe integers and stable plan-period identities prevent ambiguous planning state. Duplicate plans/events/artifacts and recorded periods at or beyond the next cursor reject. |
| Evidence meaning | Outbox rows remain claimed local artifact references. They do not assert payment finality, authenticate old invoices or reconstruct old prices from current plan terms. |
| Review binding | One live review is tied to the complete canonical snapshot, operation ID, session epoch, abort signal and exact returned view. It selects only the earliest due period and is consumed even when approval is refused. |
| Clock and lifecycle | Backwards clocks and approval at or after the five-minute deadline reject. Supersession, explicit cancellation and abort remove pending private state/listeners. The application must clear its already-returned view on lock. |
| Side effects | Source uses schedule/validation helpers, not `advance`, nonce generation, wallet access, storage, network calls or signing. The maintained no-effects test confirms that preview does not call ambient randomness, fetch or wallet seams. |
| Production isolation | Source search found no references to this module outside its owned feature directory. The only manifest/lock addition is the already-existing `@ghostpay/merchant-billing` workspace. No external version changed. |

Canonical string boundaries already reject terminal whitespace through complete
matching or explicit trim equality. The F04/F05 terminal-line-terminator
observation therefore does not require an analogous F10 source correction.

`RecurringReviewContext` is a live application/composition-root input, including
its `AbortSignal`; it is not read from the saved snapshot. The returned
`ApprovedRecurringPeriod` is a local reviewed selection. A future consumer must
not treat that plain object as a signer capability or durable reservation.

## Independent execution

Working directory: `apps/web` in the isolated F10 worktree. Node `v24.22.3`,
Vitest `5.0.5`, normal repository Vite configuration and one worker:

```sh
NODE_OPTIONS=--max-old-space-size=512 ../../node_modules/.bin/vitest run \
  src/features/future/private-recurring/model.test.ts \
  src/features/future/private-recurring/review.test.ts --maxWorkers=1
```

Actual result: exit **0**; **2 test files passed, 84 tests passed**, no skips;
reported duration **1.49 seconds**. The source diff against the pinned product
commit was empty for the owned directory and both manifest/lock files.

This replay did not collect coverage. The author's scoped coverage result is
separate evidence. No new reproduction tooling or product changes were added.
Full-web typecheck, typed lint, artifact comparison and hosted checks remain
coordinator-owned; this report does not turn earlier resource-killed checks into
passes.

## Remaining acceptance and integration

The specification and handoff accurately retain the following as unfinished:

- Staged parsing does not restore or activate a profile. Legacy migration must
  present imported active plans as paused until fresh consent.
- P04 must authenticate templates/artifacts and validate asset, amount and
  signing authority before actual invoice issuance.
- P05 must reserve the reviewed plan-period transactionally, reconcile crash
  recovery and handle contention between tabs. Reopening another review can
  deliberately select the same stable event ID until durable state changes.
- Real pause/resume/cancel mutations, reminder disclosure/export, UI and
  localization, application lock wiring, browser acceptance and recovery
  qualification are not implemented by this milestone.

The reviewed code remains suitable for its disabled foundation milestone,
subject to the coordinator's remaining source/build gates. It is not a complete
implementation of every F10 acceptance case.
