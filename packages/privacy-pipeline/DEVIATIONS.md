# Deviations and owner-review items (privacy-pipeline)

Everything the spec flags `[new]` is implemented as specified and listed first. Everything after that was a decision made while building; each can be reversed by editing one data row.

## A. Spec `[new]` rules, implemented as specified (owner review)

| Item | Where | Note |
|---|---|---|
| C-04 `hygiene.sweep` before `pool.deposit` impossible | `chainRules.ts` | also a type error (T-3) |
| C-06 `sweep.delay` before `pool.deposit` redundant | `chainRules.ts` | warning `chain.creditZero` |
| C-07 second `pool.deposit` on one lineage impossible (PoC) | `chainRules.ts` | Q2 open |
| C-14 `ct.unwrap` anywhere harmful, needs ack `ctUnwrapPublic` | `chainRules.ts` | |
| C-17 CT with `direct-no-fee` or the accrual router (MH-FEE-2) impossible | `chainRules.ts` | `route=accrual` exists as a value only for this rule; its fee is modelled as 25 bps |
| C-34 two different pools in one run redundant | `chainRules.ts` | subsumed by C-07 in a linear model (no independent branches); both fire |
| L-2 layers cannot change mid-run | `machine.ts` (`replan` illegal once running) | changing layers needs a new run and plan hash |
| E-3 combination fingerprint warning | `summary.ts` (`COMMON_SHAPES`) | common shapes are the preset template shapes |
| Isolation default `per-step` | `build.ts` | shown as unenforced for `tor-browser` (Q4) |
| R-17 applies to `pay.from-pool`, not to an earlier payer deposit | `validate.ts` projection | `payer.fresh-wallet` and `amount.shape` followed by `pool.deposit` project nothing about the payment tx; payer `pool.deposit` projects no options |

## B. Rules and keys added by this build (owner review)

- `C-10-fan` (warn, `fanOutLinkable`): several notes before one `pay.from-pool` become several single withdrawals, one announcement each.
- `C-13-unwrap` (block): `ct.unwrap -> pool.deposit` stays impossible until a spec covers it (Q1 resolved conservatively).
- `C-15` was split: warning for a short wrap dwell, `C-15-eq` block for a wrap amount equal to the invoice gross ("warn; block if equal" in the spec).
- New keys: `privacy.err.chain.badParam`, `privacy.err.conflict.optionClash`, `privacy.err.chain.wrapEqualsInvoice`, `privacy.err.conflict.poolDepositSponsored`, `privacy.warn.chain.isolationUnenforced`, `privacy.warn.chain.samePartyManySteps`, `privacy.warn.chain.publicIrreversible` (CP-2), `privacy.warn.chain.quoteDrift` (CP-4), `privacy.err.wrongAsset`, `privacy.err.requires.cap.<cap>`.
- Constants with no number in the spec: `CT_MIN_DWELL_MS = 1 h` (CT-UX-4 "min dwell"), `POOL_RELAYER_FEE_BPS_CAP = 100` (SP "<= MAX_RELAYER_FEE_BPS"), `LONG_RUN_STEPS = 6`, `OVERDUE_MS = 1 h` (HOP-UX-4), `DEFAULT_REQUOTE_TOLERANCE_BPS = 50` (spec), retry limit 3.
- Pipeline `isNew` flag on each rule row marks the rows above.

## C. Structural deviations

1. **No `privacy-profiles` import** (brief). Rule data (`STEP_CATALOGUE`, `CHAIN_RULES`) and a local restatement of R-01..R-40 live in this package. `projectToSelection` returns a plain option map. `selectionToPipeline`/`applyPreset` are replaced by local template data (`presets.ts`). The spec puts rule data in `privacy-profiles`; moving it is a copy of `steps.ts` and `chainRules.ts`.
2. `templateFor(preset, role, ctx, target)` takes a fourth argument (`chain`, token family, origin) because a pipeline carries its chain and the planning context does not.
3. `pool.deposit` also accepts `payment-plan` (the spec's own 3.5 chain and C-11 feed `amount.shape` into it); the number of notes is then the plan's parts.
4. `amount.shape{denom}` accepts one part (a single standard denomination); `split` needs two or more.
5. `pay.submit` payer modes exclude `fresh-wallet`: that is the `payer.fresh-wallet` step.
6. `expand(p)` has no `quotes` argument: quotes do not change the tree (`planHash` and `simulate` take them).
7. `ExecutorPorts` adds a `DelayPort` (CSPRNG draw supplied by the app; the package has none) and `env`/`testMode`; `StepDriver` gains optional `health()` (EX-9, EP lifecycle) and `StepQuote` gains `parties` and `autoContinue`.
8. `hops.forward` is one step instance with `hops` legs; its total delay is one wait. Per-leg state stays in `@ghostpay/hops` (README invariant 4).
9. `PipelineSummary` adds `totalFeeBpsMin`, `feeBpsMin` per step (hops floors 0.50/0.99/1.49/1.98 %), and `amountLadderBps` (E-1).
10. `creditedDwellMs` credits the minimum of `pool.dwell` (conservative).
11. Cross-role rules C-21 and C-31 are in `checkJoin`; C-32 is a layer rule; C-33 is type T-4 (family and chain checks).
12. Hashing uses `@noble/hashes` (already pinned), not an injected port (PL-1 left this open).
13. Chain matrix text differs from the spec table in three cells, all documented in `matrix.test.ts` (typing blocks `ct.wrap -> pool.deposit` and `ct.wrap -> pay.from-pool` before any rule; default wrap dwell equals the minimum so C-15 needs a shorter dwell; a confidential receipt may be delayed before `ct.sweep`).
14. `src/testutil/fakeDrivers.ts` is `src/fakeDrivers.testutil.ts` so the existing coverage exclude applies.

## D. Mutation check (spec 10.6)

Recorded in `docs/remote/privacy-specs/audit-privacy-pipeline.md`.
