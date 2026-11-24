# Required privacy work and qualification

- [x] Inventory required v1.0/v1.1 scope and existing source/ownership.
- [x] Research licensed reuse candidates and record suitability decisions.
- [x] Commit nine specifications before implementation.
- [x] Reach a first implementation/verification milestone for every feature.
- [x] Deliver source-pinned internal handoffs directly to fresh successor teams.
- [x] Finish every independent second-generation review and reconcile its repairs.
- [x] Complete third implementation generations for demonstrated masking, wallet-lifetime and retention gaps.
- [x] Reconcile final v1 source and explicit v1.1 consent in generation 4; retain 301-case focused acceptance and fresh source review.
- [x] Reproduce inherited clipboard caller fixture failures on published/current sources; complete fresh G3/G4 repairs and137-case acceptance without production changes.
- [ ] Run original type/lint/unit/browser gates on each exact combined candidate.
- [x] Implement reviewed, age-based removal of local invoice registration times and receipt archive times on the #383 successor.
- [ ] Qualify and integrate the retention candidate through the v1.1 release gates.
- [ ] Publish only the concretely reviewed branches after the required publication approval.

## Feature stages

| Feature | First milestone | Fresh successor | Release qualification |
|---|---|---|---|
| v1 masking | 49 focused cases pass | G2 released; G3 stale-settings fallback repair,40cases pass | Open |
| v1 clipboard | 24 focused cases pass | G2 runtime released; G3/G4 inherited caller fixtures repaired,137cases pass | Open |
| v1 wallet/lock | 59 focused cases pass | G2/G3 released; revoked read-authority repair,17+271separate selections pass | Open |
| v1 private history | 5 focused cases pass | M2 released;4caller repairs,84cases pass | Open |
| v1 outputs | 34 original cases pass | G2 released; two error-disclosure repairs,107cases pass | Open |
| v1.1 address reuse | 50 focused cases pass | M2 released; lifecycle/copy repairs | Open |
| v1.1 invoice minimization | CreateInvoice verified | M2 released; merchant issuance47cases pass | Open |
| v1.1 wallet disclosure | 80focused+2selectedcaller cases pass | G2 released;249cases pass; final composition in G4 | Open |
| v1.1 retention | Disposable generated preview verified | Persistent, per-category timestamp controls and atomic confirmation in PR #587 | Open |

Counts above overlap across generations and files; do not add them as unique total coverage. Detailed exact-source evidence remains under docs/privacy-release/evidence/.

Current composition and remaining work: [required privacy checkpoint](../docs/privacy-release/STATUS.md). Generation numbers describe worker succession, not completion of specification milestone M3. Full original gates and issue #287 item 4 remain open.
