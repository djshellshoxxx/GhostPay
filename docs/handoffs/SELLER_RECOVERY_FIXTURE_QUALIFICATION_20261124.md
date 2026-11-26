# Seller recovery fixture qualification — 2026-11-24

Continuation of PR #575 at `5a225f6cdaeeaf9c6dad8d8a11f3f437fff83727`, branch `resume/seller-reconciliation-20261124`. Main observed: `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Original branches and production code remain unchanged.

## Corrected fixtures

Pages run `45335829578`, job `138247553517`, failed on an obsolete empty-link expectation after historical backup import. The current UI deliberately labels the imported history unverified. The test now requires that label and absence of an amount summary, then a verified link, equal expected amount and exactly one distinct observation after the fresh record is saved. Record counts, digest preservation, encrypted backups and already-swept rejection checks remain intact.

Native verification found a second outdated fixture: two amount/asset mismatches reused one event ID. The current implementation rejects contradictory copies before invoice matching. The test now explicitly requires rejection and zero records, then uses distinct event IDs to verify independent mismatches are ignored. Chain, association, competing-payment and fork checks remain intact.

## Evidence

- Source-local ux-vault and secret-box dependency builds passed.
- Existing reconciliation-amounts suite: 19/19 passed, including imported-history exclusion.
- Initial invoice-vault and ledger suites: 52 passed, 1 failed on the contradictory-event fixture.
- Corrected invoice-vault and ledger suites: 53/53 passed, no skips.
- Typed ESLint on both changed test files and the repository secret scan passed.
- Independent browser review approved blob `a4fde9a716f6831e2b43047af8efe0e11510347c`.
- Independent native-fixture review approved blob `d4d1eb99506c4e497ab77fb1bc8e07a4a9678fd3`.

Commands: `vitest run src/reconciliation-amounts.test.ts --coverage=false` in packages/ux-vault; `vitest run src/lib/reconciliationVault.invoices.test.ts src/components/ReconciliationLedger.invoices.test.tsx --coverage=false --maxWorkers=1` in apps/web. Node 24.22.3, Vitest 5.0.5. All workspace links point into this checkout. The first web attempt failed before assertions on an unbuilt secret-box dependency; building its unchanged source resolved that setup failure.

## Remaining gates

Fresh hosted Pages qualification remains required: local anvil/forge are unavailable, so the revised real-chain browser journey has not run locally. The 72 focused native passes are scoped evidence. Preserve #575/#546/#533 dependency order and recheck parent heads before integration. No deployment or main merge occurred.
