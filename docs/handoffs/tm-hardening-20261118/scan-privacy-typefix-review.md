# Independent review — Scan privacy fixture typing correction

Reviewer: `acceptance_review`, fourth independent acceptance/integration role.
Review environment: isolated `/workspace/scratch/88088facfb13/GhostPay-typefix`.
Local reviewed HEAD after the coordinator's commit:
`fafe41305a6645edeec825f199324afdea8876ba`.

## Regression classification

Hosted Pages job `135390508109` and qualification job `135390508402` reported
TS2769 in the newly added `Scan.privacy.test.tsx` cancellation fixture: Testing
Library's `ByRoleOptions` does not accept `exact`. These are coordinator-retrieved
hosted failures. This is a **new test typing regression in the TM continuation**,
not an inherited PR #238 failure.

## Independent source review

The isolated diff removes only `exact: true` from:

```ts
screen.getByRole('button', { name: 'Cancel' })
```

No runtime, helper, controller, budget, cancellation or assertion changes occur.
Both primary/secondary cases still click Cancel while the first window response
is pending, release that response, require the Cancelled state, assert exactly
one dispatched window and refuse a Finished state.

Inspected the installed primary implementation of `@testing-library/dom` version
`10.4.2` in the original checkout:

- `types/queries.d.ts` defines `ByRoleOptions.name` as a string, regular expression
  or predicate; it has no `exact` property.
- `dist/queries/role.js` matches the computed accessible name using `matches`
  with identity normalization.
- `dist/matches.js` uses `normalizedText === String(matcher)` for string matchers.

Therefore `name: 'Cancel'` still requires the exact, case-sensitive accessible
name `Cancel`. Removing the unsupported property does not broaden matching to
partial names or remove any security assertion.

**Disposition: no source concern or blocker identified in this correction.**

## Validation and source pin

- Only `apps/web/src/views/Scan.privacy.test.tsx` was modified in the reviewed
  isolated diff.
- `git diff --check -- apps/web/src/views/Scan.privacy.test.tsx` exited 0.
- Corrected file SHA-256:
  `85605a1bdf245a0f38ee5c5e6e81ea5b04c6fef771583b152c3b759cb24c1a07`.
- No tests, compiler, lint or build commands were run by this reviewer. The
  original source checkout was not edited, preserving the in-progress web suite.
- Final published source identity and unchanged hosted-gate reruns remain the
  coordinator's qualification record; this source review does not claim a clean
  typecheck/build or merge readiness.
