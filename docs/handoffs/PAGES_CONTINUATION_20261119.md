# Scan export and private-scan continuation — 2026-11-19

## Result and scope

Continue the lean static Pages candidate in existing PR #269, based on PR #262. Preserve concurrent canonical-array integration and delegated source provenance. This checkpoint is source consolidation, not a merged or released build.

All three scoped repairs received independent source review without an introduced
blocker. This is source approval only: final runtime, typed-lint, inventory and
browser qualification are incomplete.

## Changes

- Private payment-key export obtains a fresh network grant only when a reauthenticated export reaches its contract-code check. The wrapper remains usable after the scan grant has expired or been revoked, while preserving the captured chain, exact selected endpoint, address binding, cancellation, and current session/profile checks. Each operation disposes its own grant.

- Private-scan asynchronous failures preserve existing Error objects, retain abort precedence, and normalize non-Error rejections. Associated lint repairs retain the tested behaviors and call assertions.

- Browser checkpoint assertions select discovery rows containing the exact payment address. The four positive assertions continue to reject duplicate rows; the global zero-address assertion before revalidation is unchanged.

The new tests cover original Error identity at three asynchronous boundaries,
non-Error normalization, cancellation precedence, cleanup, fresh export authority,
strict address/method binding, original private endpoints, current session/profile
checks, wrong credentials, local public export, and refusal of late responses.
New cases are authored assertions until an execution result is recorded.

## Preserved source identities

| Input | Published commit | Tree |
| --- | --- | --- |
| Original implementation input | `c40b7581b9b996f33612186bc91960c65273cb64` | `41a1aaca7c9b48bdda4d9cbad7dcda7084045e5f` |
| Preserved current #262 input | `cb7cfc9ec4f6c051e99805a25132c9458beb7af0` | `c58843c86dae5164eab259d3440aba01406bd593` |
| Browser assertion repair | `f9195f3f030e36125473753347d4be3357ac667e` | `0db9d42741bfbe08063b01068c82f3ec2bb7ef4f` |
| Reconstructed scan error/lint repair | `1b010ec910d04df105fd662cc360629cb0a2f5dd` | `51e666f0d111c35dec061218ff7ace0038d3a61d` |
| Reconstructed export authorization repair | `b0abb726c138ad1df2f03b7b102c9bd9de318887` | `1a7ad8022a70af9c78ba8b33d7a064ab60a807f3` |

The continuation ownership claim is commit
`20e661adb13e5fca0997f47f6ede417333b5253d`, directly after the browser repair.
The integration commit keeps that claim as first parent and the current #262,
scan repair and export repair as additional ordered parents. Each product/test
blob is reused unchanged from its reviewed source. The only shared-file resolution
combines additive ownership claims with the complete newer #262 ACTIVE_WORK file.
The inherited canonical-array source/tests/evidence are retained from cb7cfc9e.

The scan reconstruction preserves original frozen local commit
`4298f798942d9fac91900e9fd3f0667e42069acd` in its commit metadata. The export
receipt records local test-first commits `b1c45dc7`, `c6eb1aa6` and
`4a639926`; its runtime changes had not been committed before environment loss.
The reconstructed commits do not claim identity with unrecovered local trees.

## Evidence and limits

| Check or observation | Result and scope |
| --- | --- |
| Browser regression diagnosis | Hosted full and lean jobs for #248 failed on the same original test blob retained in c40 because a receipt renders the address a second time. This is a selector defect, not evidence of duplicate discovered payments. |
| Browser repair verification | Independent source review, full-file TypeScript syntax verification, strict helper-only Playwright semantic verification, and the local patch whitespace check passed before environment loss. |
| Browser execution | Chromium failed before assertions with socket() failed: Operation not permitted. No passing browser result exists for this repair. |
| Export baseline | The two regression tests failed against the original runtime using the recorded source-alias configuration. This is focused baseline evidence, not the repository's full clean-build qualification. |
| Export intermediate run | Both exports reached successful downloads after the runtime repair, but both tests failed on normalized endpoint spelling. The fixture expectation was corrected. Subsequent runs did not complete; there is no final GREEN result. |
| Scan error/lint execution | No new runtime test completed or launched for the final five-case regression selection. Source review is separate from execution evidence. |
| Environment | The shared execution environment became unavailable. Final reconstruction and publication use the authorized GitHub connector. Reconstructed commits have distinct identities; final content readback and parent verification are recorded separately. |
| Required checks | Original typecheck, typed lint, web tests and coverage thresholds, full/lean browser suites, egress inventory validation, and applicable hosted checks remain required on the final source. No workflow, dependency, timeout, assertion, or threshold waiver is introduced. |

The original browser selector failures are recorded in PR #248's
[full browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44480893086/job/135425979506)
and [lean browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44480893086/job/135425979061).
The inherited scan lint diagnostics are in
[job 135425979082](https://github.com/djshellshoxxx/GhostPay/actions/runs/44480893086/job/135425979082).

Detailed bounded evidence and reconstruction limits:

- [Browser assertion repair](PRIVATE_CHECKPOINT_BROWSER_20261119.md).
- [Export authorization qualification](payment-export-authorization-20261119/QUALIFICATION.md).
- [Scan source comparison](https://github.com/djshellshoxxx/GhostPay/compare/c40b7581b9b996f33612186bc91960c65273cb64...1b010ec910d04df105fd662cc360629cb0a2f5dd).
- [Export source comparison](https://github.com/djshellshoxxx/GhostPay/compare/c40b7581b9b996f33612186bc91960c65273cb64...b0abb726c138ad1df2f03b7b102c9bd9de318887).

The egress inventory retains 37 surfaces and adds the new helper's four recorded
authorize/createRpc reference/call counts. Independent source inspection matched
the unchanged inventory rule; its runner timed out before a result and still
must validate the complete snapshot.

## Required continuation

Run the existing gates on the integrated source, retaining the original
configuration and thresholds:

1. Build required workspace outputs from this source and lockfile; do not substitute
   compiled output from another branch.
2. Run web typecheck, typed lint, the affected export/authorization/private-scan
   tests, then the required web suite and coverage.
3. Run the existing egress inventory validation and secret/egress checks.
4. Complete hosted full and lean browser suites and Pages artifact validation.
5. Reconcile applicable candidate checks at the same source before merging #269
   into #262 or promoting the principal candidate.

At this cycle's observation, #258 still had CI queued; #265 had CI and Pages queued;
#267 had CI and hosting queued. Their separate bounded reviews do not make the
principal or this continuation fully qualified. Earlier c40 workflow cancellations
were superseded by the principal's cb7cfc9e update and are not passing results.

Main was observed at 14ded337a10c140d7a9f9a9238ec038587d925bb. This continuation does not merge a runtime candidate, delete a source branch, close another worker's PR, or deploy a release.

The coordinator releases the cooperative integration lock after publication and
records the current source and pending gates. No background qualification is
implied by this handoff.
