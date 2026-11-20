# Required privacy work and qualification

- [x] Inventory required v1.0/v1.1 scope and existing source/ownership.
- [x] Research licensed reuse candidates and record suitability decisions.
- [x] Commit nine specifications before implementation.
- [x] Reach a first implementation/verification milestone for every feature.
- [x] Deliver source-pinned internal handoffs directly to fresh successor teams.
- [ ] Finish every independent second-generation review and reconcile its repairs.
- [ ] Run original type/lint/unit/browser gates on each exact combined candidate.
- [ ] Finish the remaining retention scope without deleting protected data.
- [ ] Publish only the concretely reviewed branches after the required publication approval.

## Feature stages

| Feature | First milestone | Fresh successor | Release qualification |
|---|---|---|---|
| v1 masking | 49 focused cases pass | M2 fixing storage-refresh and prepared-context cases | Open |
| v1 clipboard | 24 focused cases pass | M2 active | Open |
| v1 wallet/lock | 59 focused cases pass | M2 released, combined gates pending | Open |
| v1 private history | 5 focused cases pass | M2 released;4caller repairs,84cases pass | Open |
| v1 outputs | 34 original cases pass | Fresh review queued | Open |
| v1.1 address reuse | 50 focused cases pass | M2 released; lifecycle/copy repairs | Open |
| v1.1 invoice minimization | CreateInvoice verified | M2 released; merchant issuance47cases pass | Open |
| v1.1 wallet disclosure | 80focused+2selectedcaller cases pass | M2 active | Open |
| v1.1 retention | Disposable generated preview verified | M2 released;5defects repaired,21cases pass; broader retention still partial | Open |

Counts above overlap across generations and files; do not add them as unique total coverage. Detailed exact-source evidence remains under docs/privacy-release/evidence/.
