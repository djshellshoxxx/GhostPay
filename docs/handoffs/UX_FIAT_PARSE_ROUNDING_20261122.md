# GhostPay BUG-ONLY — invalid rounding modes in fiat unit parser

Date: 2026-11-22 (UTC). Target: existing Pages-facing `@ghostpay/ux-fiat` package, **no new features**.
Repository: `djshellshoxxx/GhostPay`. Starting live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Isolated branch: `automation/20261122/bug/ux-fiat-parse-rounding-r12`.
Owned paths: `packages/ux-fiat/src/decimal.ts`, new `packages/ux-fiat/src/decimal.rounding-validation.test.ts`, the additive branch-local `docs/ai/ACTIVE_WORK.md` claim, and this new handoff.

## Confirmed failure and cause

`parseUnits` accepts an optional `RoundingMode` but never validates it at runtime, while other conversion functions already return `bad-rounding` for unsupported values. It passes any truthy value into `divRound`; an unknown value selects the default nearest half-even branch. An invalid mode also succeeds when a number does not require rounding, so imported/configured invalid options are silently accepted.

Source Git blob `6476b0ff8f2676ed75aea5c972f7d546b4c136bd` was reproduced exactly locally (computed Git blob SHA matched the GitHub source); Node 22.16.0 / standalone strict TypeScript 5.8.3 compile with a minimal `types.ts` runtime/type shim:
- `parseUnits('1.25', 1, 'round' as never)` returned `{ok:true,value:12n}` instead of `bad-rounding`.
- `parseUnits('1.2', 1, 'round' as never)` returned `{ok:true,value:12n}`.
- The committed regression's corresponding 29 source-equivalent checks were RED: 16 failures / 13 passes before the fix.

## Test first, then bounded repair

1. Ownership claim commit: `0a3263d2f863af7d63a004b3154f30a7df03f5ad`.
2. New focused failing Vitest regression committed before production edit: `c9294376819f1263973883348e899a3ae02de4e6`.
3. Production repair commit: `7951a299a5576aab836363ff9efff1a845967729`.

Two production lines changed: import existing `ROUNDING_MODES` and, before parsing, reject an explicitly supplied value not in that enumeration with the package's existing `{ok:false,error:{code:'bad-rounding',message:'unknown rounding mode'}}`. No public API, other package, dependency, payment math for valid modes, contract, fee, network, UI or workflow changes.

Repaired Git source blob: `5eb55e734f9ace45f42867c0fbb2ced7b8c66359`, matched independently to the locally compiled repaired file.
- Standalone strict `tsc` on source-matched `decimal.ts` and *minimal nonrepository shim*: PASS.
- Node 22 source-matched regression equivalent: 29/29 passed (8 invalid modes in two paths, seven valid modes and adjacent controls).
- Additional deterministic no-network neighboring unit round-trips and valid-mode controls: 1,760/1,760 passed.
- Not run locally: real repository Vitest suite, exact package typecheck against actual types/tsconfig, lint, full/lean builds, native Pages browser tests and external security jobs. Local git clone fails GitHub DNS resolution. Node checks are **not** Vitest and shim typing is **not** repository typecheck.

## Ownership, PR #390, integration and outstanding gates

All 233 other open PR changed-file inventories were individually queried in three REST pages at the initial snapshot. No conflicting open PR touched `decimal.ts` or the new regression path. The shared `fiat.test.ts` is touched by #224, #238, #262, #264, #278 and #372 and was deliberately left alone. The main `docs/ai/ACTIVE_WORK.md` source did not separately claim `ux-fiat/decimal.ts`.

Required PR #390 recheck: head `b655bc273a6704c9c140287b8adcdf4085b91882`; CI / Pages / Hosting kit / Beta acceptance / CLI operator qualification all completed **success** on that head. No submitted independent reviews; #390 is open and *not draft*. Its branch was unchanged.

Integration lock `refs/heads/automation/ghostpay-integration-lock` SHA `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` contains generation 11, status **held**, external owner `994a0d214fb9-root-r3`. Its timestamp expiry alone is not evidence of owner release; no takeover or merge was attempted.

**Pending:** draft PR exact-head hosted CI, package Vitest, applicable Pages native browser verification, independent qualified reviewer, fresh 233+ open PR ownership/head reconciliation, and legitimate external lock release/lease acquisition before any integration. Do not merge, deploy, release, expand feature scope, or touch another worker's branch while these remain outstanding.
