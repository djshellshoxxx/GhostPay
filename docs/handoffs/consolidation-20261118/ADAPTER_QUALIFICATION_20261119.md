# Historical adapter qualification — 2026-11-19

## Scope and provenance

This task prepares an independent main-level qualification candidate. It does not
modify the original source branches or authorize deployment.

- Verified starting main: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
- Task branch: `integration/ghostpay-adapter-qualification-20261119`.
- Historical safeguards: PR #250, `22af2074a086d9957a18e310ef8572b28d1facd0`.
- Existing TRON fixture repair: `a3442053ffe7d94238f0877cea5b429381ecfbd7`,
  selectively recovered from the broader #262 lineage with cherry-pick provenance.
- Local reviewed integration before the additional regressions: `8961bab5`.

The historical source is a merge parent. The broader #262 branch is not a merge
parent: recovering its two fixture changes does not claim its other work is
integrated. Main's later documentation additions are preserved.

## Defect and repair

PR #250 correctly requires every requested TRON block height to be present and
ordered. Its hosted web test job `135409982355` failed 20 tests across four files
because the shared mock node returned only genesis and the funded block, omitting
empty heights. The adapter rejected that fixture before downstream UI assertions.

The recovered fixture now returns contiguous blocks, including empty blocks, up
to its tip. It retains the funded transaction, configurable genesis, cancellation,
network failures and broadcast behavior. The missing-genesis test now checks the
adapter's `INVALID_RESPONSE` code, because the range parser rejects the response
before the view-level identity check. Rejection is still mandatory.

Three additional browser-library regressions remove the first, middle or last
height in the first requested page. Each requires rejection before announcing a
match, querying a payment address's balance, fetching its memo or broadcasting.
This protects the completeness check's privacy boundary; it does not lower the
adapter's validation or change production transaction behavior.

The original calendar-date, bounded-retry and extreme-decimal tests remain intact.
No dependency, workflow, contract runtime or release gate is changed.

## Review and validation at candidate creation

An independent reviewer inspected the combined adapter changes, the recovered
fixture and all three additional gap cases. No introduced source blocker was
identified. `git diff --check` passed.

Local full-workspace dependency setup did not complete: the first selected-web
installation encountered `ENOSPC`, and a second attempt in temporary memory-backed
storage was killed with exit 137. Neither attempt is a passing install or test
result. Focused verification is being prepared with a bounded dependency setup.
Hosted full qualification remains mandatory; this candidate must remain draft
until the applicable checks pass on its published head.

Existing original-head evidence is historical: #250's adapter package checks were
reported as 656 passes and 22 existing skips, while its hosted web suite had 20
failures. Those results do not qualify this new combined tree.

## Coordination

At inspection, `automation/ghostpay-integration-lock` was held by another active
integration run, with base `14ded337` and expiry `2026-11-19T13:00:25.774Z`.
This task does not take over or modify that lease. It prepares a separate candidate
and records source-pinned evidence for the integration owner. Recheck the live
lease, current main, exact PR head, review state and checks before main integration.
No main merge, deployment, release, branch deletion or protection change is claimed.

## Next action

Run the four formerly failing browser test files plus the complete affected adapter
suites, typecheck, lint and static Pages checks. Repair any real failures, retain
all original security assertions, and update this record with actual outcomes.
Then qualify the published candidate through CI and the existing integration owner.
