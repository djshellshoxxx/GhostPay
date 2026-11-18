# Deviations and open points (@ghostpay/relayer-guard)

1. **Not integrated.** `apps/relayer` still uses its own `breaker.ts`/`limiter.ts`; this task was not allowed to edit apps. Integration steps are in the spec, section 6.
2. **Probe timeout counts as failure** (re-opens, cooldown from the expiry instant). The relayer runbook describes an in-progress fix as "probe timeout that re-opens the breaker"; this matches that description, but the in-progress code was not seen.
3. **Broken forwarding chain returns `null`** instead of falling back to the proxy address, to avoid the shared-bucket self-DoS described in S3-07. The caller must answer 400.
4. **Overflow bucket** is shared by all newcomers while the table is full of active keys (availability over per-client fairness during a flood). `LossBudget` keeps one overflow entry per source `kind` for keys and one for groups, so a sweep's destination and network keys never share one (L5-04).
5. Classification of mined reverts (`mined_revert_state_changed` vs `mined_revert_unexplained`) requires a re-simulation the relayer does not do yet.
6. Primary RFCs (7239, 6585, 9110) could not be fetched in this session; behaviour is based on the MDN pages cited in the spec.
7. **Challenge: `context_mismatch` dropped.** The context is inside the MAC, so a wrong context is indistinguishable from forgery and reports `bad_signature`; distinguishing them would be an oracle.
8. **Challenge: store-full signalling.** `ReplayStore.markUsed` keeps its `boolean` contract; "full" is signalled by throwing (`ReplayStoreFullError`), and any throw maps to `replay_store_full` (fail closed). `AttemptLimiter` signals full by returning `Infinity`; a throw maps to `too_many_attempts`.
9. **Challenge: unexpected internal errors** in `verify` (e.g. a throwing clock) are reported as `malformed` rather than thrown.
10. **Challenge: difficulty is bound into the MAC**, so changing it invalidates outstanding tokens. Memory stores are per-process only.
