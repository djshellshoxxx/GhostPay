# F04 current-main composition — November 20, 2026 Pacific

## Scope and immutable inputs

This isolated consolidation preserves the existing F04 M1 local merchant projection module. It does not activate a route or claim the dashboard feature is complete.

- Donor: PR [#322](https://github.com/djshellshoxxx/GhostPay/pull/322), `future/f04-merchant-dashboard`, `066731b4d6d19d96469dd18fa082b264f3efed5d`.
- Captured main: `da6b05da5bb2e4293f38572da361980960d91911`.
- Ownership claim commit: `75e340e2` on `consolidate/ghostpay-f04-current-main-1f782-20261121`.
- Composed source: `7b86048f8d801389e93803c8ccf3d05d8410619d`; tree `83aefed27a3701ca2fd8e8bab1c66d850902bffb`.
- Worker: `/root/branch_inventory`; coordinator: `1f782d9c4748-root`.

Both donor and main are ancestors of the composition. The only merge conflict was `docs/ai/ACTIVE_WORK.md` (two conflict regions). Both sides' exact lines were retained in order: 848 lines from the claimed donor, 773 lines from captured main. The added registry claim records ownership before the merge.

## Complete-tree verification

Compared with captured main, all 3,978 existing entries outside the additive registry retain their exact mode, type and blob. The only non-document delta is the five new F04 files below. Compared with the donor, all five files retain their exact mode and blob. No dependency manifest, workflow, production entry point, build rule, contract or existing runtime file changes.

| Preserved F04 file | Mode | Blob |
| --- | --- | --- |
| `index.ts` | `100644` | `3b5d874487c290c1fb4ea17dac21cd69be160fcf` |
| `model.ts` | `100644` | `c2f2711e66a6e182e84ceb9fcb8349e1bb601680` |
| `projection.test.ts` | `100644` | `6cac65615c82c8f805999d17f1792ac95af29463` |
| `projection.ts` | `100644` | `18fe22d6e8b503982499d094ae37dbe04e42c949` |
| `select.ts` | `100644` | `65571703bc46a6787ec929a67da7d305a3280c16` |

The proof uses complete `git ls-tree -r -z` records, compares both sides' entries, and checks each parent with `git merge-base --is-ancestor`. The original source and complete donor history remain available; no original branch was changed.

## Source review

The consolidation worker independently reviewed all four runtime files and the original 61-case test file. The module validates and freezes snapshots, uses exact atomic amounts, groups canonical event identities, excludes conflicting observations, and keeps imported claims separate from injected current evidence. Provider assessments must match invoice, chain, asset, transaction, position, amount, inclusion time, expected amount and expiry before contributing to pending/final totals. Imported receipt labels alone cannot supply those assessments.

The selector is bounded, retains separate totals by chain/asset, and rechecks revision/session/operation/deadline before releasing results. Projection rebuilds recheck around yields and after provider callbacks. The implementation imports only local module files and remains absent from production route imports. It performs no persistence, wallet submission or automatic export.

A separate `/root/defensive_review` worker also inspected all five frozen donor files, including the complete 310-line test suite, and approved their unchanged dormant-M1 consolidation. That reviewer verified canonical identity deduplication, rejection of conflicting observations before provider assessment, exact invoice/event bindings, evidence-reference independence, chain/asset-separated bigint totals and lifecycle checks. The separate reviewer ran no tests.

No blocking defect was identified in either source review. Approved evidence-provider integration, persistence, crash/multi-tab semantics, UI/localization, export approval, actual chain evidence and browser/device performance remain outside this M1 milestone. Existing mock-provider tests do not qualify those unimplemented capabilities.

## Qualification boundary

The worker ran structural Git/object, registry preservation and whitespace checks only; all passed. No npm install, runtime test, compiler, lint, build or browser run was performed by this worker. The coordinator owns shared validation of the final combined candidate and independent review of any subsequent F05/F10 composition.

At live inspection, donor-head CI [44777150648](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777150648), Pages [44777150413](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777150413), Beta acceptance [44777150502](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777150502) and Hosting kit [44777150449](https://github.com/djshellshoxxx/GhostPay/actions/runs/44777150449) reported success. Those results belong to donor head `066731b4d6d19d96469dd18fa082b264f3efed5d` and its tested GitHub merge source; they are not new passes for this composition.

Main/shared integration/lease refs, original donor refs, deployment and release state were not mutated by this worker. Root retains publication and qualified integration responsibility.
