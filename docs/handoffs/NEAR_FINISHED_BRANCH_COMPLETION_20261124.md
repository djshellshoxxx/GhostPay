# Near-finished branch completion — 2026-11-24

This task completes bounded GhostPay branches. It does not claim that every
branch, every future feature, or the entire release is complete.

## Merged and verified on main

### Six package fixes through #561

Normal merge `2d83de0b7f5bba0fafc0c25d19d1fcb382edf719` has parents
`f76904301cff0b24d65ea4e31cbf37d470db4d95` and original integration head
`01d4007d032c8902c144c09094dbbe75c0b086cf`. Its read-back tree exactly matches the
reviewed tree `31d5896d0ae625ebf06836ab4213bbc5ab87d599`.

| Original PR | Completed behavior |
| --- | --- |
| #506 | Reject duplicate Accept-Language weights |
| #513 | Return a typed error for invalid payment-button labels |
| #518 | Enforce NFC size limits when the supplied limit is NaN |
| #519 | Validate quoted-empty final CSV records consistently |
| #521 | Return isolated locale separator descriptors |
| #524 | Reject ragged records in the strict CSV parser |

GitHub confirms all six donor PRs are closed and merged. All six heads remain
ancestors; all 18 source/regression/handoff blobs match the original donors.
Independent source review found no blocker. The original combined qualification
reports 762 tests with all five package builds, typechecks and lint passing.
This task verified all five successful hosted workflows, all 24 CI jobs and all
39 checks (36 successes, three deployment-only skips), plus successful Snyk.
CI: https://github.com/djshellshoxxx/GhostPay/actions/runs/45324883272

The integration lock was explicitly released before acquisition. Generation 16
was acquired by expected-head, non-force update at
`85bc21dcfb302a58a0fb99db8ccd1cbd94265937` and released after verification at
`05e0480a9b4ee4fe26fea80cc23c83cfd12a975f`.

### Schedule clock rollback through #565

Normal merge `706188000c38b3dde5a3a362370a530870aa7587` has parents
`2d83de0b7f5bba0fafc0c25d19d1fcb382edf719` and original #565 head
`68a4e9596062b2144ca5d9da3ff817b73644e2e1`. Its read-back tree matches the
independently qualified composition `f46350ea01dd29b3186ae080498cf35894b99728`.

The update timestamp stays monotonic during clock rollback while invalid clock
values remain rejected. All five hosted workflows and 24 CI jobs succeeded.
The composition with current main passed **137/137 tests in six files**, original
coverage thresholds, package build, typecheck and pinned lint. Coverage: 99.54%
statements, 97.95% branches, 100% functions/lines. Independent review found no
blocker; the prior qualifier explicitly completed its documentation-only task.

Generation 17 acquisition: `3ee16bf50e3a71fc4c76f1a4baa0b83279fea4c9`.
Release after read-back verification: `89107c2612d4f025571d9c4ca11bf77f7d19286b`.

## Published corrections and integrations

### Clipboard #580

PR #580 now includes `e68d32d7e424daf7264165987868eb6b891048b2`, continuing
`b634e816a403ac6b07a6685bac575ca683a17cb5`. The verified published tree is
`fa5d49f62eaea5acb3e2c281cae8ac244f79d5cc`.

The two typed-lint errors were reproduced and fixed by preserving concrete
promise-returning clipboard mock types. Every runtime byte and assertion is
unchanged. Typed lint and **64 tests in five helper/component suites** passed.
Independent review verified byte-identical JavaScript output. The remote tree
matches the tested tree. The PR still targets #553; fresh hosted checks were
queued at the last inspection. Details are on that branch in
`docs/handoffs/CLIPBOARD_580_COMPLETION_20261124.md`.

### Fiat output bound #568

Published `c9ebbdd41368f65cab27c909a146dc7d0960553d` preserves the original head
`c6817a2e46a684cc29450fc0bc18d48fc6e9f500` and actual main
`706188000c38b3dde5a3a362370a530870aa7587` as parents. GitHub read-back confirmed
the qualified tree `f59848c47328679f0bcbfd1faad0f832f0a45d68` and mergeability.

Only the active-work registry conflicted. Every original main, donor and
premerge claim line is preserved in order, and the three non-registry donor
blobs are unchanged. All **54/54 tests**, build, typecheck and lint pass; coverage
is 100% statements/functions/lines and 99.31% branches. The original head had
all five hosted workflows and 24 CI jobs passing; the published integration
requires its own fresh hosted checks.

### Countdown #574

Published `96d20f778e3f92fa26144c9f97525eae4b3290a1` preserves original head
`43889d6a36ae869187c1b860fce72e0252f55028` and actual main as parents. Read-back
confirmed qualified tree `cd5461839d1b9394692a5dc65de9aac269f02561` and
mergeability. All three formatter/test donor blobs are unchanged; only the
registry needed resolution, with all source ownership lines retained.

The combined source passed **26/26 format/countdown/jitter tests**, prerequisite
builds, whitespace and secret checks. The original head's full and lean browser
jobs both exercised final-payment expiry with no wallet request and no journal
entry: full 82 passes/one profile skip; lean 70 passes/three profile skips.
These original-head results do not substitute for fresh integration-head CI.

### POS stack #406 / #411 / #576

Published `4ae333d3ffa85eb14c074a543bdc084370dd1e49` has parents original #576
`a2c9bdf08549d53f27a1e57bd868f8c37c789ec0` and actual main. PR #576 now targets
`main` directly, retaining both parent PR heads as ancestors. Read-back confirmed
qualified tree `4d79a7c7cd1a14262a05b41c5030a121da7306fb` and mergeability.

Only the registry needed conflict resolution. All ten non-registry POS donor
blobs and all 38 main-only changed paths remain exact, including the newly
merged button, NFC and schedule regressions. Every source registry line is
preserved in order.

On the final composition, merchant-hooks passed **52/52 tests across five files**,
build, typecheck and lint. Coverage was 100% statements/functions/lines and
99.62% branches. Money and reducer parity passed **5/5 tests**, including 400
generated cases against both reducers. All **five original browser scenarios**
passed together in 3.5 seconds with one worker and zero retries, using the actual
example assets and pinned QR renderer. No full local web build was performed.

Original-head hosted browser evidence also passed every POS case: full 87
passes/one profile skip; lean 75 passes/three profile skips. Fresh published-head
hosted checks remain required. Both parent branches are preserved.

### QR image and version-23 decoding #581

Published head `74121278a08eaf4eddd85651a4518ef657aeeb16` preserves original
#581 `41a598b8433e10a95598c72c2a23027e63010024` and actual main as parents.
Read-back confirmed qualified tree `d51fba8f5fb6e3200261d7ec44c803986931cee7`
and mergeability. This tree equals frozen local documentation commit
`baa495646eef5be0870dba5af3a2c41d9f2da793`; its runtime is byte-identical to
independently reviewed `4da0221e23bda44207016d123e4debcbeb350187`.

Two concrete defects were corrected. Responsive QR rendering snapped module
edges inconsistently at fractional pixel widths; the SVG rendering hint now
preserves the module geometry. Three paired reproductions demonstrated the
failure and repair without changing the matrix, quiet zone, invoice signature,
trust assertions or image-import acceptance.

The existing pinned jsQR 1.4.0 decoder also contained one incorrect version-23
alignment coordinate. Deterministic public-API regressions reproduced five
failures, including valid GhostPay settings exports, with four neighboring
controls passing. The static vendored ESM decoder changes that one coordinate
from 74 to 78 and mechanically adapts the module wrapper. The complete factory
body otherwise remains exact. Provenance tests compare the entire source with
the pinned upstream artifact, preserve the complete Apache license and verify
the static notice shipped in both web profiles. No dependency or lockfile change,
runtime source rewriting or evaluation was introduced.

Final package verification passed **261/261 tests**, existing coverage thresholds,
typecheck, lint and build. Coverage was 97.5% statements, 95.05% branches, 100%
functions and 99.11% lines. Both normal production pipelines passed web typecheck,
Vite build and original bundle scans. The unchanged invoice-image acceptance
passed **three consecutive runs in each profile**. Independent checks passed
11 source-focused tests and ten compiled public-API cases; the actual minified
production decoder also decoded an accepted version-23 settings payload.

Both final browser decoder chunks were byte-identical, and both emitted notices
matched the committed 11,867-byte source exactly. Broader camera simulation
remains a hosted-CI gate because the available local headless shell does not
provide that capability; it is not represented as a local pass.

## Qualified combined integration: #614

The four completed main-targeting stacks are now combined in
https://github.com/djshellshoxxx/GhostPay/pull/614 on branch
`integration/near-finished-20261124`. Published head
`9aff7941bdeec30c4ebeab10795da4df9903d08a` has exact qualified tree
`9704b3b915154e993abcd5fedc8eac10389ee7f4`. Read-back verified that tree and all
five parents: actual main plus the published #568/#574/#576/#581 heads above.
GitHub reports the candidate mergeable. It remains draft while fresh CI runs.

All **42 non-registry donor files** retain their reviewed contents and modes.
The registry preserves every main and donor document in order; the sole extra
file is `docs/handoffs/NEAR_FINISHED_INTEGRATION_20261124.md`. Independent review
found no source-preservation or cross-feature blocker.

The actual combined source passed **445/445 focused unit tests** (52 merchant,
54 fiat, 261 QR, 78 web formatter/QR component), **5/5 parity tests** including
400 generated cases, all three package builds/typechecks/lints, and typed lint
for all eight changed web TypeScript files. Both normal web pipelines passed
typecheck, Vite production build and original bundle scans. The unchanged
invoice-image and five POS browser cases passed **6/6 in full and 6/6 in lean**,
with one worker, zero retries and zero skips. Both static decoder notices match
source exactly. Secret and whitespace checks pass.

Use #614 as the combined integration candidate, preserving the four original
PRs and their histories until normal merge verifies inclusion. The existing
consolidation worker can finish fresh hosted qualification and the normal merge
from the committed handoff. Acquire the cooperative lease only when qualified
and ready; never hold it while CI is queued. Refresh current main and qualify
any changed composition. The clipboard parent task remains separate.

## Independent acceptance and remaining work

| PR | Source | Evidence and outstanding boundary |
| --- | --- | --- |
| #574 countdown | `96d20f778e3f92fa26144c9f97525eae4b3290a1` | Source, review, tests and current-main integration complete; exact head preserved in #614. |
| #576 POS | `4ae333d3ffa85eb14c074a543bdc084370dd1e49` | Full parent stack qualified against current main; exact head preserved in #614. |
| #568 fiat bound | `c9ebbdd41368f65cab27c909a146dc7d0960553d` | Source, review, tests and current-main integration complete; exact head preserved in #614. |
| #581 QR | `74121278a08eaf4eddd85651a4518ef657aeeb16` | Both reproduced defects corrected, reviewed and published; exact head preserved in #614. |
| #614 combined candidate | `9aff7941bdeec30c4ebeab10795da4df9903d08a` | Local qualification and independent review complete; fresh complete hosted checks and normal main merge remain. |

The copied `COUNTDOWN_574_QUALIFICATION_20261124.md` and
`POS_576_INDEPENDENT_COMPLETION_20261124.md` retain detailed commands, source/tree
pins, hosted browser evidence and incomplete local attempts. They qualify their
pinned source, not an untested later composition.

## Boundaries

No deployment, release tag, real funds, contract behavior or future privacy
activation occurred. Pages PR workflows validate only; publication requires a
separate manual `deploy=true` dispatch. Post-merge main checks remain separate
from the pre-merge qualification and are not claimed successful while queued.

Reviews here are independent AI-assisted source reviews, not formal GitHub
approvals or external audits. Existing recovery, seller-reconciliation, mobile,
privacy-minimal-invoice and account-privacy workers retain their work. Original
branches and histories are preserved; no shared branch was force-pushed.
