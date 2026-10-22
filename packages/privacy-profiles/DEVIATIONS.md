# Deviations and owner-review items

Items marked [new] are rules or choices no method spec states. They are implemented as specified in profiles.md / chaining.md (or as noted) and need owner review.

## Deviations from profiles.md

1. `sweep.exitGas` default is `buffer`, not `permit-sponsored` (spec 7.1 table). Reason: PP-4 needs the default selection valid with no capabilities, and section 9 says standard uses `buffer` and changes only four defaults, so today's behaviour is `buffer`. Test: `catalogue.test.ts` (PP-5).
2. `defaultSelection()` has label `standard` with no explicit values (= today's behaviour). `applyPreset('standard')` additionally sets the four zero-cost values (Q2 left open; owner may make standard = today).
3. Options that depend on a pool exit (`sweep.poolAsp`, `sweep.poolSubmit`, `sweep.poolAmountPlan`, `sweep.exitGas`) are inactive unless `sweep.exit` is a pool: their values are not applied and only the dependency rules look at them.
4. In `settings` a `null` chain id does not trigger R-01 (non-null non-testnet still does). Other actions with `null` chain id block.
5. R-08 is kind `warn` with issue code `W_MOOT` (spec table: kind warn, effect W_MOOT; matrix cell W).
6. Rule evaluation uses the full selection; an issue is emitted only when at least one involved option is in scope of the action (settings = all).
7. Error keys added beyond spec list: `privacy.err.wrongAsset` (implicit asset check), `privacy.err.chain.wrapEqualsGross` (C-15 escalation).
8. R-31 also counts pool exits (`shielded-pool`, `railgun`) with default `poolSubmit=relayer` as relay-like (needed for the matrix cell "exit pool x tor: W").
9. PP-9 grep also covers TSDoc comments in `src/`.

## [new] rules (owner review)

From profiles.md: R-12 (PH-3/PH-4 with CT), R-13, R-14, R-15, R-18, R-22 (extended to AB-ROUND), R-32.
Added by this build (not in spec, needed to make presets and defaults consistent):
- R-41 `exitGas != buffer` or `poolSubmit=self` requires a pool exit.
- R-42, R-43, R-44 pool submitter capability matching the exit (`pp-relayer`, `railgun-broadcaster`, `pool-relayer`) when `poolSubmit=relayer`.
- R-45 `onion` profile on `node` env requires `tor-socks`.
- R-46 hops with `rotate` and no `multi-relayer` warns `singleRelayerSeesAllHops` (spec 7.1 states it as a value warning).

From chaining.md: C-04, C-06, C-07, C-14, C-17 (FEE-2 part), C-34; isolation default `per-step` and L-2 are pipeline-package items. R-17 refinement: the profile `Selection` of a pipeline projects only payment-tx options, so a payer `pool.deposit` step projects nothing (`STEP_CATALOGUE['pool.deposit'].project({role:'payer'})`), and R-17 applies to `pay.from-pool` only. Selection-level R-17 itself is unchanged.

## Chain data notes

- `ParamPred` values are `string | number`; boolean step params are passed as `1`/`yes`-style where a predicate needs them (C-19 noise, C-23 payjoin).
- C-15 uses `escalate` (warn, block when wrap amount equals invoice gross).
- Pipeline-only warning keys (`chain.longRun`, `chain.appMustStayOpen`, `chain.combinationFingerprint`) and error key `chain.layerChanged` have no rule row here; the pipeline package emits them.
- `chainMatrix()` is one cell per rule (spec 4 compact table is a hand layout).

## Mutation check (manual, 2026-10-21)

Deleting R-11, R-12 or R-29, or flipping `sweep.destination` default, makes tests fail (2, 3, 3 and 1 failures).

## Not done

UI wiring (lane E6), capability detection, umbrella end-to-end per preset, `selectionToPipeline` (pipeline package), numeric performance bench (PP-19 informational, not run).
