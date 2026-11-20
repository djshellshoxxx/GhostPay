# F04 independent milestone review — 2026-11-20

## Result and source identity

**No blocking source defect was identified in the reviewed dormant M1 scope
after the canonical-format correction.** This is a source and focused-test
review of the projection/selector foundation, not approval to activate F04 or
publish a release.

- Reviewer: `f04_independent_review`, independently assigned after the author
  froze the first product milestone.
- Branch: `future/f04-merchant-dashboard`.
- Incorporated main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Original product reviewed: `be37f79df4d60e2d87cd845fbf8e6f0fa117b135`.
- Corrected product reviewed: `966f415e520298310efd1f03883ea69844ea5eed`.
- Documentation head before this report: `b2dcc7a843dfc89bed6fc8926b3d904d7b365920`.

The reviewer read all five introduced source/test files under
`apps/web/src/features/future/merchant-dashboard/`, the specification, shared
module contract, implementation notes and handoff. The existing merchant-ledger
reconciler was inspected to confirm its distinct fiat-minor-unit and matching
semantics. Product code remained read-only throughout this review.

## Findings and review decisions

| Area | Review conclusion |
| --- | --- |
| Units and totals | Individual atomic amounts are validated before `bigint` conversion. Totals remain exact beyond JavaScript's safe-number range and are partitioned by both chain and asset. No implicit fiat conversion occurs. |
| Evidence authority | Imported snapshots cannot supply a finality label. The separately injected trusted provider must bind the exact invoice, network, asset, transaction, position, amount, inclusion time, invoice amount and expiry before a pending/final contribution is accepted. Provider failures remain unknown. |
| Duplicate and conflicting observations | Canonical event identity is chain/transaction/position. Identical claims contribute once, local evidence references are retained, and conflicting claims are excluded. Provider input omits the first-arrival evidence reference, preserving canonical lookup semantics across duplicate order. |
| Reorg, late and partial accounting | Rebuilds can remove reorged/reverted contributions. Final, pending and late totals remain distinct, while assessment counts preserve mixed evidence history. An unverified announcement cannot create final revenue. |
| Data and lifecycle | Validated records and returned projections are detached immutable objects. Rebuilds check operation, session epoch, profile, revision, cancellation and deadline before releasing results and around asynchronous yields. Selectors reject obsolete contexts. |
| Bounds and integration | The maintained tests cover collection caps and bounded page/search behavior. The module contains no ambient network, wallet or persistence operation and has no production import outside its own directory. Web dependency manifests and lockfile are unchanged from main. |

### Corrected canonical-format inconsistency

The initial review found that the five canonical string validators used a
line-ending-permissive end assertion while retaining their input unchanged.
This did not satisfy the documented complete-string canonical format. The
author's narrow correction requires the actual end of each reference, amount,
chain, asset and transaction hash; valid accepted values retain their original
meaning. Ordinary malformed-format regression cases were added to the maintained
suite. The reviewer inspected the complete two-file product/test delta and
reran the suite at the corrected source.

This was a bounded format-consistency correction. No payment-authority bypass,
live provider failure or exploit result is asserted.

## Independently executed verification

The following command was run from `apps/web`, using the repository's existing
Vite/Vitest configuration and the supplied source-matching library builds:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run \
  src/features/future/merchant-dashboard --maxWorkers=1 --no-file-parallelism
```

| Source | Actual result |
| --- | --- |
| Original product `be37f79d` | 56 tests passed; one test file passed; no skips; exit 0; reported duration 1.41 seconds |
| Corrected product `966f415e` | 61 tests passed; one test file passed; no skips; exit 0; reported duration 1.30 seconds |

These executions include the existing 10,000-invoice/50,000-observation fixture,
exact arithmetic, duplicate order, conflicting linkage, provider binding,
reorg/revert, cancellation and stale-context cases. Their run durations are not
reference-device latency or memory qualification measurements.

Source comparison confirmed that the product files at the documentation head
match `966f415e` exactly. Searches found no external production references to
the new module and no ambient network/storage/wallet call in its runtime files.
The manifest/lock comparison with main was empty. No new reproduction tooling,
network interaction or product modification was performed by this reviewer.

## Remaining qualification

The author records successful scoped strict TypeScript and typed ESLint checks
in [HANDOFF.md](HANDOFF.md). This reviewer did not rerun those memory-intensive
checks or infer a whole-web pass from them. Whole-web typecheck, whole-web
coverage/lint, lean-artifact comparison and current hosted CI remain the
coordinator's qualification work. No browser, real provider, wallet or live-chain
test is claimed here.

The provider port is intentionally a trusted adapter contract. A provider that
merely echoes imported values is not qualified settlement evidence. P03 must
provide independently checked canonical evidence coordinated with P05's journal
revision before this projection is connected to a product view. The fixture
provider tests consumer behavior only.

P05 persistence/crash recovery, real cross-tab updates, UI/localization and lock
clearing, scan-coverage and fee evidence, explicit export consent, accounting
output safety and browser/device acceptance remain unfinished. Already-returned
JavaScript objects cannot be revoked; the future UI must discard them on lock.
The source accurately keeps these limits separate from this first milestone.
