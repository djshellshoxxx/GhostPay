# Deviations and open points (@ghostpay/relayer-guard)

1. **Not integrated.** `apps/relayer` still uses its own `breaker.ts`/`limiter.ts`; this task was not allowed to edit apps. Integration steps are in the spec, section 6.
2. **Probe timeout counts as failure** (re-opens, cooldown from the expiry instant). The relayer runbook describes an in-progress fix as "probe timeout that re-opens the breaker"; this matches that description, but the in-progress code was not seen.
3. **Broken forwarding chain returns `null`** instead of falling back to the proxy address, to avoid the shared-bucket self-DoS described in S3-07. The caller must answer 400.
4. **Overflow bucket** is shared by all newcomers while the table is full of active keys (availability over per-client fairness during a flood).
5. Classification of mined reverts (`mined_revert_state_changed` vs `mined_revert_unexplained`) requires a re-simulation the relayer does not do yet.
6. Primary RFCs (7239, 6585, 9110) could not be fetched in this session; behaviour is based on the MDN pages cited in the spec.
