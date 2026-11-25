# F03 successor-worker handoff

Feature implementation and the fresh-worker source audit are complete for signed-invoice
request-file interchange. Continue branch `future/f03-private-payment-links`, draft
[PR #310](https://github.com/djshellshoxxx/GhostPay/pull/310). Do not restart the implementation or
substitute the separate `future/f03-private-payment-links-spec` branch, whose broader scope is
explained in [CATALOG_RECONCILIATION.md](CATALOG_RECONCILIATION.md).

## Read and establish identity

Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, this feature's [SPEC.md](SPEC.md),
[QUALIFICATION.md](QUALIFICATION.md), and the three reports in [audits](audits/).
Fetch the actual branch and PR heads; inspect new commits and active ownership before edits.

Latest product checkpoint: published `bd128598f1b4c5291dad5c003a4775ad47bbb888`, equivalent to
local `e543d25fc7f3b65460518f4b3df4c513d34a1215`, exact tree
`e96e7876585150032a26ccf0947ea724b070c3ee`. Later audit/evidence commits preserve the same product
files. The qualification report maps every older local audit pin to a durable published tree.
The remote branch is canonical for continuation. API publication changed commit identities while
preserving verified trees; use a fresh checkout/worktree of the remote head instead of force-pushing
the separate local-author history over it. Historical failing snapshots are ancestry for audit
reproduction and must not be mistaken for the current repaired tree.

## Completed handoff to fresh workers

The implementation worker brief is `docs/ai/prompts/F03_WORKER_BRIEF.md`. After that batch
completed, three fresh workers executed `docs/ai/prompts/F03_AUDIT_HANDOFF.md` for standards,
specification and defensive privacy/security. Their independent reports and repair follow-ups
are retained. The shared medium app-lock omission is fixed and independently verified; four
regressions demonstrate failure before and success afterward. Catalog completeness is repaired
with explicitly untranslated English fallbacks, independently checked by two other reviewers.

Full invoice-schema tests/coverage pass (813 cases), the fresh focused DOM suite passes (114),
changed-feature typed lint and package checks pass, and final catalog validation has zero errors.
Whole-web typecheck, full and lean static builds and both original bundle scans also pass at the
final catalog source. Actual browser execution and exact-current-head hosted checks remain pending.
The qualification ledger and command logs, rather than this paragraph, are authoritative for
source pins, exact counts, static build outcomes and environmental limits.

## Remaining execution prompt

Resume qualification on the actual current branch head. Check existing PR workflows and actual
job logs. The full and lean Playwright jobs must execute the new `payment-request-file.spec.ts`
with existing assertions intact. Verify actual download bytes, same-envelope import, explicit
preview/open, passphrase refusal/retry, invalid replacement, same-file retry, sequential requests,
invalid-signature payment blocking, and the tests' no-network/no-wallet probes. Do not count
fixture collection, DOM results or QR raster decoding as a native browser run.

Use synthetic local invoices and the repository's existing fake test deployment. Record checked-out
commit, source tree, build profile and emitted-artifact identity with actual results. Add or execute
browser lifecycle regressions if a remaining browser-ordering risk warrants them. Preserve the
ordinary URL/QR host/path rules, trust and expiry checks, explicit transaction consent, supported
profile restrictions and existing seller-key retention policy.

If a feature regression is found, record ownership before editing, reproduce it with a focused
behavioral case, make the minimal correction and obtain review from a worker who did not author
that correction. Re-run affected gates; do not weaken thresholds, checks, assertions or skips.
Report unrelated baseline failures separately with evidence and avoid importing overlapping PRs.

The local Chromium launch restriction prevents page creation; do not mark browser qualification
complete until a supported runner actually executes it. Keep the PR draft while required
qualification is pending. Update the exact-source ledger and handoff after concrete results.
Main merge, deployment, live transactions and external communications require their own task scope.
