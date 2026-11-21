# Independent Sweep journal corrective-source review

Date: 20 November 2026. Reviewer: `/root/journal_review`.
Branch: `audit/ghostpay-journal-review-20261120-9a4ab6`.

## Decision and scope

**Approve the scoped corrective source; no blocking issue found.** The replacement
of native JSON parsing with the existing shared strict parser is compatible with
the records emitted by the journal's writer and preserves the journal's public
API, identity, ordering, replacement, capacity, storage-failure and error behavior.
The added tests directly check rejection before any attempted overwrite and retain
a valid boundary-value round-trip control.

This is independent source review of a local persistence correction, supported by
inspection of the coordinator's supplied test log. It is not an independent test
run, full application qualification, or approval for release or deployment. No
baseline reproduction, new malformed-state example, external-system operation or
product-source change was performed by this reviewer.

## Immutable inputs and ownership

| Input | Exact identifier |
| --- | --- |
| Review starting HEAD | `5e882df84df70f1eca7a02b2079ab5e502cd76c0` |
| Production correction | `526f9849233f3d809a2847565f732415fe9dbcd2` |
| New test commit | `2a1c878f5b57a0135bf353bf7a1522db31381ad5` |
| Corrected `apps/web/src/lib/sweepAttemptJournal.ts` blob | `0ad138c34479222a600ce5451f6477cc8dd2006c` |
| `apps/web/src/lib/sweepAttemptJournal.strictJson.test.ts` blob | `ee8670a4262cb7a2206602d21417e5fcd5404e60` |
| Existing `packages/invoice-schema/src/json.ts` blob | `8ed01592d487c356a72d51e240e5cc63fb470a3a` |

The production commit changes only an import and the parser invocation in
`readSweepAttempts`. The commits between that correction and the review starting
HEAD change documentation/evidence only. Relative to the frozen integration source
`5a745d4b5fba69b66a9779f88aefc63c253a4f27`, the reviewed journal changes are the
three-line production diff and the new 59-line test file; the existing parser,
duplicate-attempt journal, web package manifest and lockfile are unchanged.

`AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` and the applicable ownership
entries were read before edits. An additive claim was recorded before creating
this report. The frozen `BRANCH_OPEN_PRS.json` inventory names both journal paths
among its ownership checks and reports no overlap for them across its 111 pinned
open PRs. That inventory is a supplied, time-bounded observation, not a fresh
remote check by this reviewer. The coordinator retains publication, current-head
reconciliation and integration responsibility; the separate integration lease
and every earlier claim remain unchanged.

## Correctness and stored-record compatibility

The compatibility assessment uses the existing `decode`, `decodeOrder`,
`toSweepLock` and `encode` functions, the `SweepLock`/`RelayedOrderRef` interfaces
in `apps/web/src/lib/sweep.ts`, and the actual shared parser implementation.

| Journal value or behavior | Compatibility assessment |
| --- | --- |
| `chainId` and relayed `deadline` | The existing decoder requires positive safe integers. These fit the parser's nonnegative safe-integer range. |
| Optional direct `nonce` | The existing decoder accepts nonnegative safe integers. The writer's serialization fits the same parser domain, including zero and `Number.MAX_SAFE_INTEGER`. |
| Relayed order nonce | `encode` persists the bigint as a canonical decimal **string**, so the parser's numeric limit does not truncate it. `decodeOrder` retains the existing uint256 check and bigint reconstruction. |
| Owner, relayer, hashes and status | Existing string format/status validators remain unchanged. The parser supplies decoded strings to those same checks. |
| Nested orders and replacement hashes | The journal array contains lock objects, with at most one nested order object or hash array. Their scalar values are reached at parser depth 3, below its rejection threshold of 8. |
| Parsed object prototypes | The parser creates null-prototype objects. The decoder only uses own-key enumeration and field reads, then creates ordinary `SweepLock` and order objects. No new prototype is exposed through these returned lock objects. |
| Public interface and dependencies | Storage interfaces, function signatures and the storage key remain unchanged. `@ghostpay/invoice-schema` is already a declared web dependency and exports the same parser used by `duplicateAttemptJournal.ts`. |

The writer first projects and validates the persisted fields, then uses
`JSON.stringify`. Every accepted numeric value is below the magnitude at which
that serializer switches to exponent notation, and the relayed uint256 value is
serialized as text. Its legitimate output therefore stays within the strict
parser's supported syntax without a migration.

**Compatibility boundary:** the change intentionally narrows acceptance of raw
storage text beyond repeated-key rejection. Fraction or exponent spellings of an
integer value and negative-zero spelling, which native JSON parsing can normalize
to otherwise acceptable numeric values, are rejected by the shared parser. Its
forbidden-key and depth checks also apply. The journal writer does not produce
those numeric spellings, the permitted record fields do not use the forbidden
keys, and valid record shapes are much shallower than the depth bound. Thus the
approval covers writer-produced records and the supported persistence format;
it does not claim complete equivalence for every externally composed JSON text
that the old decoder might have accepted.

## Preserved journal semantics and error mapping

`readSweepAttempts` still checks the existing storage-size and record-count limits,
validates every decoded lock, and rejects repeated chain/owner identities. Its
result retains storage order. A missing storage item still yields an empty list;
an unreadable or invalid item remains an error.

`writeSweepAttempt` still reads and validates the whole existing journal before
making a storage write. It removes the existing case-insensitive chain/owner key,
appends the updated lock, and keeps a maximum of 64 records. At capacity it removes
the first resolved lock in journal order; `submitted` and `unknown-after-handoff`
locks remain protected from eviction. The three-other-hash bound, identity
normalization and projection that excludes destination/asset/amount are unchanged.

The strict parser remains inside the existing exception boundary. All parser
failures are translated to `SweepJournalUnavailableError`, using the existing
localized journal message rather than exposing an invoice parser error or raw
stored input. A failure while reading existing records occurs before the writer's
storage mutation block, so neither a replacement nor a tombstone is attempted.
The existing write/read-back check and attempted tombstone after an actual
storage-write failure are unchanged. The different pending-capacity message also
remains unchanged.

These conclusions concern the local journal's implementation. They do not establish
cross-tab exclusion, authenticated persistence, transaction settlement, refunds,
recovery after losing session storage, or any general absence of duplicate payments.

## Test review and observed evidence

The new test file contains 11 repeated-field cases spanning lock identity, status,
transaction identity, direct nonce, nested relayed-order fields and the whole order.
It includes identical repeated values and a repeated decoded key written with an
escape. Every case requires the typed journal error on both read and write,
unchanged stored text, and zero storage writes. These assertions test the intended
correction boundary without treating an error alone as sufficient evidence that
storage was preserved.

Its positive control round-trips a direct replacement with the maximum safe nonce
and a relayed record with maximum safe chain/deadline values and the maximum uint256
order nonce. The unchanged original Sweep journal suite additionally covers ordinary
and optional fields, replacement hashes, a full journal of the largest records,
one-record-per-identity updates, relayed statuses, malformed-state preservation,
quota/read-back failures, and resolved-only eviction. The duplicate-journal and
wallet-journal suites in the supplied run cover adjacent existing behavior.

The shared parser's own test source was inspected for numeric, nesting, object and
syntax behavior. Its suite was **not** among the four files in the supplied run,
and this reviewer did not execute it or any other product test.

Supplied execution evidence:

- Metadata: `/workspace/scratch/9a4ab6c3d117/evidence/sweep-journal-serial.json`.
- Log: `/workspace/scratch/9a4ab6c3d117/evidence/sweep-journal-serial.log`.
- Command: `npm exec -w @ghostpay/web -- vitest run src/lib/sweepAttemptJournal.strictJson.test.ts src/lib/sweepAttemptJournal.test.ts src/lib/duplicateAttemptJournal.test.ts src/lib/walletJournal.test.ts --maxWorkers=1 --coverage.enabled=false`.
- Recorded outcome: exit code 0; four files passed; **70 tests passed**.
- Recorded environment override: `NODE_OPTIONS=--max-old-space-size=384`.
- Execution interval: `2026-11-20T23:41:49.039439+00:00` to
  `2026-11-20T23:41:58.484578+00:00`.

The metadata pins test HEAD `2a1c878f5b57a0135bf353bf7a1522db31381ad5` plus an
uncommitted production diff. Independently hashing
`git diff --binary 2a1c878f5b57a0135bf353bf7a1522db31381ad5 526f9849233f3d809a2847565f732415fe9dbcd2`
produced the recorded diff SHA-256
`e0bab7db4d1387888cf932e30663c5215691f4383f27736c5de86efd30b3eb73`.
The supplied log's SHA-256 independently matched its metadata:
`5e89b8360c96360be747cb997caf16543a749dca7252f8906ffaefb0c09041d8`.
This connects the reported pass to the committed corrective patch; it does not
turn the coordinator's execution into a reviewer-run check.

## Remaining qualification

No source blocker is identified for this bounded correction. Coverage was disabled
in the supplied targeted run. Whole-web typechecking, lint, build/bundle checks,
the complete test and coverage gates, browser behavior and hosted checks were not
executed or independently qualified by this reviewer. Existing repository gates
remain applicable to the final integration head. Preserve the test assertions and
perform fresh head/ownership reconciliation before publication or integration.

Reviewer edits are restricted to this report and the additive ownership record.
No source, dependency, lock, workflow, deployment or remote reference was changed.
