# GhostPay implementation continuation — 2026-11-02

Status: implementation in progress, not engineering-ready. The owner source
disposition permits continuing from published source without claiming that the
unavailable consolidation was recovered.

## Design and implementation slices

Keep TypeScript/React and the existing signed invoice and receipt protocols.
Prefer adapting available recovered code over introducing parallel mechanisms.
Published application source and canonical-main documentation are combined in an
isolated candidate; existing branches are not rewritten.

1. Independently review and qualify the published application delta against main,
   retaining evolved/deferred work and explicit source accounting. A green child
   PR is not proof that all parent changes have been reviewed.
2. Adapt the available lean entry/build selector to the current application.
   Share current lifecycle logic rather than copying the older shell's unsafe
   unconditional idle wipe. Preserve full-build routes/tests; keep deferred
   chain, policy, embed and tag-archive modules outside the supported lean entry
   and prove the emitted boundary. Select no production network by assumption.
3. Add actual invoice-bound seller receipt creation using existing invoice
   validation, `verifyReceipt` and `bindReceiptToInvoice`. Preserve the explicitly
   unbound manual-digest route. Validate immutable scan facts and session state
   before consent/signing, and exercise real product import/export paths.
4. Integrate independently reviewed slices serially, then run current-source
   build, typecheck, lint, full/coverage, browser, local-chain and security gates.
   Keep mocked transport, Worker execution, independent profiles, cross-engine
   and device qualification separate. Do not reduce thresholds or KDF/fuzz work.

## Validation and coordination

One integrator controls shared manifests, lockfiles, central state, workflows and
publication. App/lean-entry and receipt component changes have disjoint writers;
their root integration is serial. Existing denied local execution or dependency
actions are not retried or bypassed. Hosted validation uses the existing
authorized CI workflows and exact candidate revisions, without deployment or
release triggers. Unexecuted or blocked checks are never recorded as passing.

Translations remain human work: preserve catalog gates and review status. Final
candidate artifacts, reproducibility, private/professional review, production
configuration, distribution terms and publication authority remain explicit
acceptance items after these implementation slices.
