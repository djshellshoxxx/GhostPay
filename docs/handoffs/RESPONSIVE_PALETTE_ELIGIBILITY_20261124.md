# Responsive/palette continuation: bounded eligibility review

Read-only source and existing hosted-evidence review, 2026-11-24 UTC.
Worker: `/root/ui_data_review`; coordinator `/root`. No palette-family source,
tests, dependencies, gates or donor refs were changed by this assessment.

## Exact sources and missing work

- Donor #583: `c1980912f87f0293b7a15f2419505a6719c5f3a8`.
- Donor C1 base: `1a7447d58c08363209b6b9b67e9a6afad07d87f3`, already an
  ancestor of the reviewed integration followup.
- Reviewed followup: `83c503f970044e1708b3a7493ee7284cd59e0844`.
- Selected print continuation: `fc961443233734ee988da7834d7a3193aed9c0fe`.
- Current recovery base containing that print continuation:
  `0b60dba235710f12847532dd9d0f74f12f7298c6`.

The missing contribution is three commits: claim
`268115becb95902ac45d05e6d0b929b57d6d259c`, presentation/test change
`f1a25a18e1ebf0edfcda95089921723df7cc13dc`, and complete RPC-row coverage
`c1980912f87f0293b7a15f2419505a6719c5f3a8`. Its net C1-relative delta is 19 files,
241 additions and 112 deletions, including the ownership claim. It changes no
package, manifest, lockfile, workflow or deployment script.

Valuable missing behavior comprises shared app/no-script/Help/Privacy appearance
tokens and local assets; a dark default retaining saved light/dark/system choices;
responsive card, form, field and RPC-button layout; five viewport cases, native
200% tab zoom and saved-theme behavior; and matching settings/QR palette assertions.

## Composition preservation

Every touched path still matched C1 in the reviewed followup except the QR test
file's additional primitive and print-policy guard coverage. Recover through an
ancestry-aware merge or bounded patch, never by replacing the current tree with
the older donor tree. In particular:

- Preserve #608's removal of the old seven-line receipt-print block in app.css.
  The responsive donor does not edit that block.
- Preserve #608 print.css, usePrintTarget, receipt/archive ownership and all tests.
  Its important light root color-scheme override remains stronger than the new
  appearance stylesheet's print rule.
- Retain current RPC layout and browser-check footer rules. The donor extends
  their responsive behavior without removing them.
- Apply only the dark background/surface tuple change in qrKinds.test.ts;
  preserve all current runtime primitive and literal-true print-policy tests.
- Keep QR policies, renderer geometry, decoder and qr.css unchanged.
- Union the additive ownership claim.

The full/lean public-copy code accepts the added CSS. The standalone-page HTML
transform preserves explicit public styles and removes application-only print
CSS. No package-history or dependency blocker was found.

## Three concrete failures retained from exact donor evidence

The source remains ineligible for unchanged integration. These findings come
from downloaded job logs and the retained artifact, not merely failed summaries.

1. **Typed lint:** job
   [138310912682](https://github.com/djshellshoxxx/GhostPay/actions/runs/45336621004/job/138310912682)
   reports one parser error: e2e/fixtures/zoom/worker.js is not found by the
   TypeScript project service. Current lint still scans src/e2e and its TS project
   still excludes JavaScript. The fixture needs a scoped typing/configuration
   correction that preserves the native zoom test.
2. **Asset-response assertion:** all five viewport cases in both profiles finish
   the navigation/layout/RPC walk, then fail the final badAssets assertion. Each
   reports appearance.css twice, help.css and favicon.svg, all at localhost:4173.
   The test records every response for which response.ok() is false. Revalidated
   304 responses are a plausible explanation for these repeated local assets,
   but statuses were not retained, so this is an inference, not a confirmed cause.
   Diagnose statuses before correction; retain local-origin, failed-request and
   actual asset-loading assertions rather than removing them.
3. **Forced-colors contrast:** Home-forced-colors-and-reduced-motion fails with a
   serious color-contrast violation in desktop and all three Chromium device
   projects, in both profiles. The deliberate privacy-limited audit artifact
   records rule metadata, not the offending element or computed colors. No
   diagnosis, repair or current combined-head pass is established. Resolve it
   through the existing authored native state without dropping an axe rule or
   weakening the accessibility assertion.

The aggregate typescript failure does not mean the compiler failed: donor
ts-typecheck, web unit and build checks succeeded. Both native 200% zoom and the
saved-theme case also passed in each profile.

| Historical profile | Passed | Failed | Skipped | Job |
| --- | ---: | ---: | ---: | --- |
| Full | 84 | 9 | 1 | [138310912549](https://github.com/djshellshoxxx/GhostPay/actions/runs/45336621004/job/138310912549) |
| Lean | 72 | 9 | 3 | [138310912495](https://github.com/djshellshoxxx/GhostPay/actions/runs/45336621004/job/138310912495) |

Full-profile artifact 14906391388, playwright-test-results-full, belongs to run
45336621004 at donor head c1980912f87f0293b7a15f2419505a6719c5f3a8. Downloaded
bytes matched its advertised SHA-256:
`6bce9e511f4caef9161dde0aa494b93d3c200de5f23a6b321b29d7d355830171`.

## Required next qualification and current disposition

After the three corrections, qualify settings/exchange/App/QR and print
regressions, full web typecheck/lint, full/lean builds and existing native browser
suites. Current hosted desktop jobs discover the seven responsive tests and the
selected print tests automatically. Forced colors, theme switching and printed
output require fresh exact-composition native evidence. Historical donor results
do not qualify a new combined head, and no Firefox/WebKit result is asserted.

The coordinator excluded this failing palette family from the individual-export
recovery wave. Preserve its original history and this precise recovery plan; do
not substitute a generic ownership or old broad-CI hold for the actual failures.
