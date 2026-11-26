# Merchant signer pin duplicate-JSON hardening — 2026-11-19 UTC

## Scope and ownership

- Cycle: `20261119T183817Z`. One ChatGPT operator, sequential development and read-only audit phases; no concurrent subagent or independent reviewer.
- Base `main`: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Branch: `automation/20261119T183817Z/bug/merchant-pin-duplicate-json`.
- Ownership claim: `d63b28362cd617924a2c91b536b54236eb40b918`.
- Test-first regression: `f65a537b1895619373c92037cb8d3bed80529a01`.
- Source fix: `4c4b221e4a764d2fe30f1ce6c9ff39a81d51bb76`.
- Owned runtime files: `apps/web/src/lib/merchantIdentity.ts` and `merchantIdentity.test.ts`.
- Relevant original source blob: `8859aeb207e4b839838bdc3a5c8d9433fd9ae308` (merchantIdentity); original test blob `c26773145f2fdc22ff05871157c34b7021a644f4`. Existing invoice-schema JSON parser source blob `b7a34bb5176ec72daf0026a59991863421bdb341`.

## Observed finding and minimal repair

The saved merchant signer-pin reader used `JSON.parse`. A raw persisted record with duplicate `v` or `signer` JSON member names becomes a two-key JavaScript object, whose final value satisfies `Object.keys(record).length === 2` and the signer regex. Thus ambiguous records are classified as trusted `saved` pins. This is defensive integrity hardening of untrusted browser storage, **not** evidence that a remote attacker can modify those records or that signatures can be forged.

The production change imports the existing `parseStrictJson` from `@ghostpay/invoice-schema`, which rejects duplicate member names. No new parser, storage format, network service, signing method or cryptographic primitive was introduced. Clean records with alternate key order and ordinary JSON whitespace remain accepted. A malformed record reports `unavailable`, not `absent`, and mutation methods fail closed.

## Executed checks and limitations

1. Node 22 standalone baseline probe transcribed the exact relevant `JSON.parse` + `Object.keys` + regex decision of original `merchantIdentity.ts`. It classified **3/3** duplicate-member records as `saved` before the fix, as expected.
2. A committed regression covers these three records, refusal to save/forget while corrupt, and backward compatibility for correctly encoded two-key pins. Regression was committed before the runtime change.
3. The same assistant inspected the patch and surrounding origin-lock/state code; this is **not independent review**.
4. Exact repository Vitest, TypeScript, lint, full CI and browser checks were **not executed locally**. The local container has Node 22 and tsc but cannot resolve github.com to check out repository dependencies; no pass is claimed. Hosted exact-head CI and an independent reviewer are required.
5. Separate read-only audit: inspected public QR-kind classification/handling and formatting tests. No independently reproducible new defect established; no finding fabricated. Existing unresolved Mythril reports remain separate and not dismissed.

## Concurrent work and integration

- Existing draft PRs #238/#246/#262/#264/#278 and currently active Pages feature PRs were inspected for these specific paths; no owned-path overlap observed in the checked PR file inventories.
- At latest read, `main` remained `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Integration lock metadata SHA `6408563f55081ee941c2036086c025ebf63d2c96`, state `released`, generation 3; this task did not acquire or mutate it.
- Exact-head application workflows on draft #279/#280/#281 are recorded as completed successful, but these are not independent review or merge authorization.
- The automation records under `docs/automation/` remain owned by existing consolidation PR #261, not recreated or edited here.

## Next cycle

Inspect fresh main/PR heads, lock status, and Actions; run `vitest` on the committed merchantIdentity tests and appropriate web typecheck/lint; obtain independent security/correctness review of the exact patch. Reconcile only after permissions, release triggers and required checks have been reverified. Preserve non-Pages variants, no deployment, no release, no real-funds operations.
