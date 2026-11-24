# Existing QR and TRON follow-up recovery — 2026-11-24

## Scope and source

- Worker: `/root/ui_data_review`; coordinator: `/root`.
- Branch: `integration/input-followups-20261124`.
- Reviewed integration base: `79c7ff73efbaf9efde5ec8cfc0e8fff08d4fad0b`.
- Ownership claim before source edits: `407456a5` in `docs/ai/ACTIVE_WORK.md`.
- Exact combined source tested: `574335c7f9e5d14f6efc4057a1311588b57fe640`. This handoff is a subsequent documentation-only commit.

This recovers two existing follow-ups. It does not create a new reproduction or activate another payment network. Donor branches and remote refs were not changed.

## Preserved contributions

### QR payload and frame input types

Source branch head: `17333ceda784ecdf5734a666ef57ee1d1e599296` (`automation/20261120T0035Z/worker/qr-kind-primitives`). Recovered the existing commits with `git cherry-pick -x`, in their original test-before-implementation order:

- `1b12898c6f1db3a1207f8017ddb0e0c3914252f2` → `4d8cff31` (existing tests).
- `8912600020cd41b3257ae0dfdeb761bcb3e4da20` → `3c4d6de1` (existing error-class assertions).
- `d8857b1048128d9091dd59f6adc7b3cd12768a8c` → `37fc7f88` (primitive-string checks and design wording).
- `17333ceda784ecdf5734a666ef57ee1d1e599296` → `f0ebea72` (original historical handoff).

The resulting `qrKinds.ts`, `qrKinds.test.ts`, `docs/design/qr-colors.md`, and original handoff are byte-identical to the donor head. All recognized payload mappings, secret/bearer warning precedence, frame classes, colors, and print behavior remain unchanged. The original handoff describes historical verification; the current composition is qualified only by the results below and later coordinator gates.

### TRON URI network option

Source branch head: `9fdb87fe59748a7463e4de5b92dc0ff3396ea7ce` (`automation/20261124T0837Z/bug/tron-network-absence`). Recovered:

- `587f6b048cfcdadfc4e8d2246e5adc4903703547` → `8d788ae4` (existing tests).
- `9fdb87fe59748a7463e4de5b92dc0ff3396ea7ce` → `574335c7` (default only for an absent/undefined option).

The resulting `tron.ts` and `tron.network-option.test.ts` are byte-identical to the donor head. The existing amount/token/label/message snapshots from #593 remain intact. Supported explicit network names, omitted/undefined defaults, parser behavior, canonical query order and one-time option reads are preserved.

## Verification on the combined source

Environment: native Linux, Node 24.22.3, repository-locked Vitest 5.0.5, TypeScript 5.9.3 and ESLint 10.15.0. Reused external installed dependencies from the coordinator checkout; all `@ghostpay/*` workspace links resolve into this isolated worktree. Existing coordinator library outputs were copied into this worktree, and the affected payment-URI package was rebuilt locally. No dependencies or lockfile changed. Lockfile SHA-256: `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

| Check | Actual result |
| --- | --- |
| `npm run test -w packages/payment-uri -- --maxWorkers=1` | Exit 0; 7 files, **226/226 tests passed**, zero skips. Original coverage thresholds retained and passed: statements 97.54%, branches 97.1%, functions 100%, lines 99.1%. |
| Existing eight-suite QR command below | Exit 0; 8 files, **97/97 tests passed**, zero skips. jsdom reported its existing navigation-not-implemented diagnostic; no assertion failed. |
| `npm run typecheck -w packages/payment-uri` | Exit 0. |
| `npm run lint -w packages/payment-uri` | Exit 0. |
| `npm run build -w packages/payment-uri` | Exit 0. |
| `npm run typecheck -w apps/web` | Exit 0. |
| From `apps/web`: `../../node_modules/.bin/eslint --config ../../eslint.config.js src/lib/qrKinds.ts src/lib/qrKinds.test.ts` | Exit 0. |
| `git diff --check` | Exit 0. |

QR command, from `apps/web` using the unmodified repository configuration:

```sh
../../node_modules/.bin/vitest run \
  src/lib/qrKinds.test.ts src/lib/qrContrast.test.ts src/lib/qrClassify.test.ts \
  src/components/QrFrame.test.tsx src/components/QrFrame.security.test.tsx \
  src/components/QrFrame.i18n.test.tsx src/components/QrFrame.largeWarning.test.tsx \
  src/components/PaymentRequestQr.test.tsx --maxWorkers=1
```

Log SHA-256 values: payment tests `7a6d02c49891d6af1286ca5b8bd812ce840076b192d9b653eca8c034b8d891f4`; QR suites `76a0171e08339753c88d4228276c6969555f933d49ab3d3cee546a796bd0776b`; web typecheck `65249328340e32d53c1ce4dce307a434743bf21d4339fbf97b36a10251373f5e`.

## Limits and next integration gate

This worker imported and qualified the existing corrections and therefore is not the independent approver of this recovery. Root owns independent delta review, final combined tests, applicable browser and hosted CI gates, integration lease and promotion. No full web suite, native browser run, production build, hosted CI, deployment, release, funds operation, or remote mutation was performed by this worker. Current successful tests do not inherit the original historical branch's release claims.
