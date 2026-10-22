# Deviations from docs/remote/privacy-specs/hops.md

1. **Anvil e2e not built** (`test/e2e.anvil.test.ts`): no contract artifacts or anvil used in this build. Replaced by in-memory simulation (`SimEnv`) with real signature recovery. Spec acceptance 2 and 5 are unmet.
2. **`HopAddressSource` extended**: added `withSecretAt(index, fn)` (needed to sign `S1`/hop legs) and optional `isUsed`. `HopAddressSource.next()` returns `{index, address}` only (the spec's `withSecret` accessor is replaced by `withSecretAt`). Legs carry `fromIndex`/`toIndex` (non-secret).
3. **k legs, `D = S(k+1)`**: the spec text says "k sweeps" and "S(k+1) -> D"; built as k sweeps whose last destination is `D`.
4. **`quotes(leg, amountIn)`**: extra `amountIn` argument (fee depends on amount).
5. **Plan type additions**: `source`, `sourceIndex`, `delay`, `relayerSelection`, `relayerCount`, `externalDestination`; `HopPlanInput` adds `sourceIndex`, `tokenSupportsPermit`, `stage`; `hops` may be 0 only with `pool-exit`.
6. **Leg timing**: only leg 1 has a fixed due time at plan creation; later legs become due `confirmedAt + drawn delay` (projected in the plan for display).
7. **No `@ghostpay/secret-box` dependency**: zeroisation is the `HopAddressSource` implementer's job; sealing is via an abstract `Sealer`.
8. **Extra error codes**: `INVALID_INPUT`, `ADDRESS_REUSE`, `QUOTE_STALE`, `NOT_DUE`, `DIRECT_UNSUPPORTED`.
9. **`direct` relayer mode** only validated in the plan; execution unsupported.
10. **File names**: forward tracer is `src/follower.testutil.ts` (not `testutil/follower.ts`) so existing build/coverage excludes apply. `randomDelayMs` copied from `apps/web/src/lib/jitter.ts`.
11. **`reduce` events** are per-leg (`beginSigning`, `submitted`, `confirmed`, `revertToDue`, `fail`, `retry`, `cancel`, `tick`).
12. Pool mock (EP-M) contract tests not run: handoff tested against the local interface only. HOP-RLY-3 proxy and AT-HOP-RLY-1 left to the app/relayer.
13. The crowd report in the negative PoC is informational: a tracer that knows `S1` is unaffected by crowd size (asserted 100 % for c = 1, 5, 20); the amount-only tracer's 1/c figure is analytic, not an empirical attack.
