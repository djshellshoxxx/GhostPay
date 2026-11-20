# Final CodeQL gate triage — 20261120T0115Z

**PR #278 CodeQL is FAILED at exact head 417f7c71daf8645e1432f2ec8f070110879b80bd.** This supersedes earlier pending snapshots.

Check [136021124871](https://github.com/djshellshoxxx/GhostPay/runs/136021124871) reports two High security alerts and incomplete actions/python configuration coverage. Dynamic workflow [44650167834](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650167834) remains queued overall: its JavaScript/TypeScript analysis job completed successfully and uploaded results; actions/python jobs remain queued. Successful analysis execution is not a passing security finding gate. This is not classified as infrastructure failure.

Existing [PR #292](https://github.com/djshellshoxxx/GhostPay/pull/292), frozen at936d054ed067d89c773310d42e33939c1129bbfa, owns clarifications for two earlier test-fixture annotations. Bounded exact-blob comparison confirms the relevant old and current #278 source is unchanged and the clarification blobs are in #292. **The identities of the current two alerts and their correspondence to the earlier pair remain unverified.** Do not mark them false positives or resolved from that inference.

The connector rejects direct current check-run/annotation endpoints with HTTP400 because they are outside its allowed fetch endpoints. The supported exact-commit check listing supplied the actual failed status and summary. A public PR checks-page read returned404. No access bypass was attempted.

Only this README and public-summary.json are intended as nonsensitive public checkpoint content. The raw/ directory contains detailed evidence retained in scratch; do not publish it while current alert identities remain unresolved. No source edit, branch update, rerun, suppression, merge, lock action or deployment occurred.
