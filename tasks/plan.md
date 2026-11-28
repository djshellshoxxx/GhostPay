# ERC-20 browser qualification completion

## Scope and source

Continue existing PR #753 on `test/erc20-pages-recovery-20261127-27c1` from
`94b6b5f86bd836461c54cd3f5c5783c731687110`. Incorporate current main
`b890a76603b924829fdbe2b4fb2c5626f0cf4e36`, preserving both histories and ownership
records. The owner's current request and earlier browser-journey continuation
authorize finishing this lane. No competing #753 implementation or newer head
was present in the refreshed discussion and remote readback.

## Observed incomplete behavior

The qualification collector accepts any passing tests from the two expected spec
files. Synthetic probes demonstrated that two cases or duplicate boundary cases
can satisfy its completeness checks. The six historical browser lanes passed,
but their count alone does not enforce the identity of the eight required cases.

## Decisions

- Pin the primary journey and seven boundary case identities independently of
  the observed report, for each allowed token mode and browser project.
- Require each identity exactly once and preserve the existing successful,
  non-skipped, non-retried execution requirements.
- Bind the public attachment to the exact primary test. Retain existing source,
  build, public-field and temporary-data guards.
- Use a pure validator plus focused Node tests. Wire it into the existing
  collector and include its source/tests in the workflow path filters.
- Preserve all browser assertions, native Pages behavior, dependencies,
  contracts, production functionality and the ten stopped-product exclusions.

## Work order

1. Record a failing collector regression for omitted, duplicated and substituted
   cases. Acceptance: valid complete reports pass; each malformed membership
   control is rejected after the fix. See `tasks/todo.md`.
2. Implement and connect exact membership validation. Acceptance: all six valid
   lane configurations pass; missing, duplicate, unexpected, wrong-project,
   wrong-mode and unsuccessful cases fail; only the exact primary test can
   supply public journey evidence.
3. Independently review and qualify the integrated source. Run focused Node
   tests, workflow guards, relevant typecheck/lint and browser lanes. Retain
   source-pinned evidence, distinguish local/hosted results and never count
   skips or unavailable checks as passes.
4. Refresh remote heads, CI and ownership. Publish with a non-force expected-head
   update. Integrate only with all applicable checks green and the legitimate
   integration lease. Reinspect the next authorized feature after completion.

## Risks and boundaries

The report path and suite shape must match the repository-pinned Playwright JSON
reporter. Verify that contract against an actual generated report. Malformed or
deeply nested report structures must fail without exposing raw fixture data.
Historical browser success is not current-source qualification. Physical devices,
wallet extensions, public tokens and public testnets remain separate acceptance
work. #742, #665, P14 checkpoint atomicity and deferred products remain outside
this lane's ownership.
