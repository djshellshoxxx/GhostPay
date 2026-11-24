# GP-BUG-R4 — lossless fiat separator round-trip (2026-11-21)

## Task / checked source

- Repository: `djshellshoxxx/GhostPay`; starting live `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Dedicated task branch: `automation/20261121/bug/fiat-overlapping-separator-r4`. No owner branch was edited and no integration target was updated.
- Previously unmodified production file `packages/ux-fiat/src/format.ts`: original Git blob `ef6adf3fb5833d9746eb272813e7c4f5bc2c1409`; repaired blob `b9340bb91089e2081854d00095ba6a8097e3ad9f`.
- New isolated regression file `packages/ux-fiat/src/format.separator.test.ts`: final Git blob `02bc7f83b2e9ce1ad5607b5d1bdbd60d643b0cd1`.
- Commit lineage: ownership claim `1078563183fae5a8ae1add64998773939d24bd83`; **test-first regression** `92723667ea4377de9a4dd77e79e31a80d8e068af`; production fix `98684e608f5ecf9360e74becab1643170792bb03`; test whitespace cleanup `468c7c2dd0cd961f0e102fae97c6a8554bf7de2e`. Handoff commit is a subsequent documentation-only descendant. Do not infer native tests from the commit titles.

## Confirmed existing-functionality defect and root cause

`formatFiatParts` permits a two-unit group separator `'..'` and one-unit decimal separator `'.'` (and an Indian grouping equivalent `'.:'` / `':'`); its existing formatter emits `1..234.56` for `123456n` minor units and 2 decimals. However `parseFiatInput` detects a decimal by `indexOf('.')` / `lastIndexOf('.')`, counting the dot characters *within the permitted group separator* as additional decimals. It returns `bad-input` instead of the original `123456n`. This violates round-trip behavior using the same supported locale format and can prevent users from re-entering their own displayed amount.

The smallest scoped fix uses complete, longest-first group-vs-decimal tokens while scanning. It continues to reject multiple actual decimal tokens, misplaced grouping, empty decimal fractions, precision overflow and nonnumeric text; no change to the formatter, rates, schema, external calls or payment logic.

## Reproduction and verification truth table

- Before repair: a Node 22.16.0 **isolated source-equivalent** reproduction of the exact original parser block (anchored to original Git blob above) returned `bad-input / multiple decimal separators` for `1..234.56` instead of `123456n`. This establishes a concrete RED reproduction, **not** a repository Vitest run. The committed regression tests have not been executed on the original repository baseline.
- After repair: an isolated Node 22.16.0 source-equivalent copy of the modified parser passed **14/14** checks for the two overlapping-separator cases, ordinary US/reverse-overlap formats, empty grouping, zero decimals, duplicate decimals, grouping in the fraction, dangling decimal, misplaced comma, excess precision and magnitude overflow. This is **not** an installed-project test, browser test or independent review. Source blob was re-fetched from GitHub after write and compared with the intended replacement.
- Checked the branch diff against exact starting main: 4 commits ahead, zero behind before the handoff; paths limited to ownership claim, new regression test and parser source. The new regression uses existing Vitest and existing package exports, no new dependency.
- **Not run locally:** repository Vitest, TypeScript, ESLint, build, native Playwright/Firefox/WebKit. Container cannot resolve `github.com` for a checkout. Hosted GitHub Actions on the published PR are the next authoritative execution evidence. Do not claim tests passed based solely on the source-equivalent checks.

## Concurrent ownership and protected integration

- At check, a live open-PR search for `ux-fiat` returned none; broad #278 changed 1,495 files, #372 changed 1,907, and their fully paginated file lists included the existing `packages/ux-fiat/src/fiat.test.ts` but not the owned production file nor new focused regression path. Sampled #302, #307, #367, #371, #380, #390, #395, #404, #407, #409 without overlap. This is not a guarantee against subsequently opened/updated PRs: recheck ownership and base before integration.
- Draft [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) was re-read at exact `b655bc273a6704c9c140287b8adcdf4085b91882`. At recheck all 39 exact-head check runs finished (36 successful, 3 expected skipped); web E2E full and lean were successful. GitHub reported no submitted independent reviews nor review threads. No code failure was observed; its owner's branch was not modified.
- Shared integration metadata branch `automation/ghostpay-integration-lock`, exact head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, says generation-11 held by another coordinator after an unsupported expiry-only takeover was rolled back. This task neither acquired nor released that lock.

## Outstanding qualification gates and next steps

- New draft PR exact-head full CI (including package Vitest, lint, typecheck and applicable browser integration), source-parent reconciliation, and an actual independent reviewer are **pending** at initial handoff.
- Inspect hosted failures if present; correct only genuine defects on this owned branch, maintain test-first history and update this additive handoff.
- Never merge into `main` unless exact-head required CI is green, applicable native browser qualification passes, independent review is obtained, ownership/dependencies are reconciled, and lawful integration lease ownership is explicitly granted. No release, deployment or funds interaction.
