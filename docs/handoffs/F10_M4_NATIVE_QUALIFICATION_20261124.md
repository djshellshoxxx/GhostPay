# F10 M4 native qualification repair — 2026-11-24

## Scope and source

This isolated child completes the existing test-fixture repairs that blocked PR #456. It does not activate recurring invoices or complete the broader F10 feature.

- Parent: `feature/f10-durable-cas-m4-20261122`, PR #456, `9e8a619cc2ce2688c16c89d16df4aeb7959bc627`.
- Child: `finish/recurring-m4-qualification-20261124`.
- Pre-edit ownership commit: `6dd64673c5bbe9e4af0059434b6af6145e57eaac`.
- Tested repair: `37dc518dad5d7b62c4f5c8ade5136b521834a406`, tree `cdbf2dc5f45521ee263b730cbfe6641be09d9136`.
- The dependency remains #456 → #396 → #391 → #371. The child must target #456, not main.
- All production files, dependency manifests, workflows and release gates are byte-identical to the parent. Only two test files and additive coordination documentation differ.

## Why the parent was blocked

The exact parent [CI run 45012216264](https://github.com/djshellshoxxx/GhostPay/actions/runs/45012216264) had three test-fixture problems:

1. WebCrypto's DOM `BufferSource` type rejected the helper's general `Uint8Array<ArrayBufferLike>` argument (TS2769).
2. Four async fake-store methods returned only synchronous primitives and violated `@typescript-eslint/require-await`.
3. One rollback assertion expected `HISTORY`, but the proposed cursor also invalidated its period-zero reference. The existing snapshot validator correctly returned `SNAPSHOT` before history validation.

The native baseline reproduced TS2769 and the precise rollback failure: 20 of 21 M4 tests passed, with the failure at `vault.test.ts:172`. No production failure or cryptographic defect is inferred from these fixture failures.

## Repair

- Copy the synthetic key bytes with `new Uint8Array(bytes)`, giving WebCrypto an actual ArrayBuffer-backed view.
- Return resolved Promises from the fake stores. Guard checks and compare-and-swap mutation stay together with no await between them; async methods still turn thrown failures into rejected Promises.
- Retain the invalid-snapshot rejection with its exact `SNAPSHOT` code. Separately construct and validate a schema-valid decreasing cursor, then require `HISTORY` for that attempted rollback.
- Check the exact encrypted records and the reloaded snapshot after each refused write. The original reference-deletion guard remains asserted.

## Native evidence

Environment: Node `v24.22.3`, repository-pinned TypeScript `5.9.3`, Vitest `5.0.5`; clean `npm ci --ignore-scripts --no-audit --no-fund` using this branch's unchanged lockfile.

| Check | Result |
| --- | --- |
| Parent M4 tests, before repair | 20 passed, 1 failed; precise `SNAPSHOT` versus `HISTORY` mismatch reproduced |
| All F10 tests after repair | 129 passed, 0 failed/skipped, six files; includes all 21 M4 cases |
| Typed ESLint on the two changed test files | Passed, no findings |
| Repository secret scan | Passed |
| Diff whitespace | Passed |
| Production/configuration/dependency provenance against parent | Exact equality outside the two tests and coordination documentation |
| Complete web typecheck and full static build | Passed with pinned TypeScript 5.9.3 and Vite 8.3.5; existing bundle scan passed 19 files |
| Lean static build and existing bundle scan | Passed; 17 files, no release-gate change |

Executed commands from repository root unless stated otherwise:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build -- --workspace @ghostpay/web
npm run build --workspace @ghostpay/relayer-guard
npm run build --workspace @ghostpay/web
npm run ci:scan-secrets
git diff --check
```

The first workspace build prepared web dependency libraries and reproduced TS2769. It also revealed that web test imports require the existing relayer-guard build artifact even though that package is outside the web production dependency traversal. Building that unchanged package resolves the missing-artifact diagnostics; no dependency declaration was changed.

From `apps/web`:

```sh
../../node_modules/.bin/vitest run src/features/future/private-recurring/vault.test.ts src/features/future/private-recurring/browserVault.test.ts --maxWorkers=1
../../node_modules/.bin/vitest run src/features/future/private-recurring --maxWorkers=1
../../node_modules/.bin/eslint --config ../../eslint.config.js src/features/future/private-recurring/vault.test.ts src/features/future/private-recurring/browserVault.test.ts
GHOSTPAY_LOCAL_BUILD_PROFILE=lean ../../node_modules/.bin/vite build
GHOSTPAY_LOCAL_BUILD_PROFILE=lean node scripts/scan-bundle.mjs
```

## Remaining gates and feature boundaries

Fresh exact-head hosted CI and independent review are required before child integration. These results do not claim complete web coverage, browser/device acceptance, external audit, or release approval. The parent branch and all ancestor branches are preserved.

The broader F10 work remains dormant: live UI/idle/unmount wiring, reviewed signed invoice issuance and export, backup merge/migrations, reminders, UI translations/accessibility, real multi-tab/crash browser qualification, and integration security review remain separate work. There is no automatic transfer, scheduled background issuer, new custody, public RPC call, contract change or deployment in this child.
