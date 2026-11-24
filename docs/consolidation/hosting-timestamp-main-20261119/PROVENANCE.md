# Focused hosting timestamp repair on main

## Source and scope

Verified GitHub main: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
Branch: `codex/ghostpay-hosting-timestamp-main-20261119`.
Claim recorded before source changes: `1dcda830`.
Focused product: `f4464e57bc6743800c2564ddb71bb5b06f64eb35`.
Original reviewed product: `38fe7fdaf151ef433be9721af8fea7cbcdea89c4`.

The focused product is a clean `git cherry-pick -x` of the original three-file repair.
Its stable patch ID and all three file blobs match. Main is an ancestor; feature base
`74e3111f` is not. No feature-candidate history or other runtime change is imported.

The complete hosting-kit tree is
`3295a7030121f51b1286ffc96b3a6480aa319aa7` on both the tested original and this focused
product. The exporter, six added timestamp controls, deterministic nginx fixture,
all pre-existing tests, scripts, kit configuration and manifests are byte-identical.
The entire original main ownership file remains an unchanged suffix after the new
additive claim. Detailed counts and object IDs are in `provenance.json`.

## Evidence reuse and dependency limits

The eight files under `../hosting-timestamp-20261119/` are copied byte-for-byte from
`0d5e34add6ddfebc98c59de8a53c4149aac04338`. They retain the original source pins and
execution attribution: red 9/2, green 11/11, full kit 285 passed/0 failed/14 skipped,
and successful original kit lint/typecheck. They are historical evidence for the
identical repair, **not new executions on this focused branch**.

The main and tested-feature root `package.json` and `package-lock.json` are not
identical: 109 parsed lock entries differ. This branch preserves main's manifests
without modification. The tested feature adds Vitest V8 coverage and changes the
privacy-pools SDK viem override; the lock also contains other feature-resolution
changes. No broad dependency equivalence is asserted.

A narrow lock comparison resolves the kit lint/typecheck roots (`typescript`,
`@types/node`, `eslint`, `@eslint/js`) through declared dependencies and optional
dependencies. All 82 resolved package records match, with identical path sets and
no unresolved dependencies. This is a parsed-lock comparison, not a new installation,
runtime trace, or check execution. Optional peer dependencies are outside that traversal.
The real web `_headers`, shared onion source, common TypeScript configuration and
hosting workflow also match the original tested source.

Playwright packages differ: main has 1.64.1, while the original tested feature had
1.65.1. The original browser test was already skipped by its unchanged opt-in
condition, so no browser qualification transfers. The original native nginx tests
also skipped because nginx was absent. No new runtime replay was performed during
this focused port; the existing hosted kit/native gates must qualify the published
exact head, including the deterministic boundary differential.

## Independent review

`recovery_completion` independently reviewed focused product
`f4464e57bc6743800c2564ddb71bb5b06f64eb35`: main ancestry, exclusion of feature ancestry,
three exact blobs, full kit tree equality, `-x` provenance and absence of unrelated
runtime changes. Verdict: **no source blocker introduced by the focused-main reuse**.
The reviewer preserved the distinction between historical execution evidence and
fresh focused-branch qualification.

No root configuration, dependency, workflow, assertion, threshold, deployment or
remote repository change was made. The coordinator owns publication and a normal
merge only after the focused candidate qualifies.

## Raw evidence formatting

Source and prose whitespace checks pass. A check that includes the unchanged raw
red TAP log reports its four whitespace-only assertion-formatting lines (22, 26,
65 and 69). Those bytes are retained to preserve the original evidence exactly;
the complete raw-evidence diff is not described as whitespace-clean. No source,
configuration or gate was changed to hide this result.
