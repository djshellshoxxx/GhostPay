# F04 merchant dashboard: fuzz, stress, QA and AI-assisted security/bug review (2026-11-26)

Scope: PR [#636](https://github.com/djshellshoxxx/GhostPay/pull/636), branch `nodata/brave-meitner-974y9e`, reviewed at
`4ba2226f` and fixed through the head that contains this file. F04 is merged **dormant**: off by default, never in the lean
Pages app, excluded from beta/v1.0 (AGENTS.md, owner decision 2026-11-26).

This is an AI-assisted review (one Claude Code coordinator plus two independent Claude reviewer agents given the code, not
the coordinator's conclusions). It is not an independent professional audit and gives no guarantee of security.

## Findings and dispositions

| # | Severity | Finding | Status | Evidence |
|---|---|---|---|---|
| S1 | High (inside dormant F04) | `ledger.ts` counted every non-reorged, non-imported record as verified. Since main added `pending-at-scan` and `unverified-at-scan` (quarantine, announced-only claims), a forged announcement could add to "Verified at scan time" totals and the payment CSV. | Fixed: only `verified-at-scan` + `verified-router-scan` live records are `historical`; everything else is `unverified` and excluded (fail closed). | `src/features/future/merchant-dashboard/ledger.evidence.test.ts` (red before, green after); fuzz oracle extended to all four statuses. |
| S2 | Medium | `vite build` enabled F04 whenever `VITEST` was set (any value); no release-path check of F04 absence. | Fixed: define depends on the Vite command; postbuild `scan-bundle.mjs` fails a build containing F04 unless opted in; `release-build.sh` refuses `VITE_MERCHANT_DASHBOARD`/`VITEST`. | `VITEST=false vite build` → 0 F04 chunks; scan of an opt-in build without the variable exits 1. |
| S3 | Low | Invoice export confirmation omitted the evidence warning. | Fixed: `dashboard.exportWarning` shown in the preview. | View tests. |
| S4 | Info | CSV formula guard ignored bidi, isolate, soft-hyphen and ALM controls before `=`. Not exploitable today (all exported fields are validated tokens). | Fixed in `csvCell`. | `report.test.ts` "CSV formula guard"; fuzz `LIVE_FORMULA`. |
| S5 | Info | Requested file names differed from the neutral names main applies. | Fixed: requests `export.csv` / `export.json`; call sites registered in `downloadNames.test.ts`. | `downloadNames.test.ts`. |
| B1 | Medium | A background ledger refresh moved a merchant out of the filter they were typing in. | Fixed: focus and caret return to the same control. | View test (red before, green after). |
| B2 | Medium | Pager buttons that disable themselves dropped focus to the body. | Fixed: focus moves to the announced range. | View test (red before, green after). |
| B3 | Medium | Exports withdrawn by an expiry boundary or ledger change did so silently. | Fixed: `role="alert"` notice. | View tests. |
| B4 | Low | Report hint overstated which filters apply to both record types. | Fixed wording. | Catalogs. |
| B5 | Low | Payment search lowercased only the needle. | Fixed (defensive; ledger hashes are lowercase). | View test. |
| B6–B11 | Low | Lock keeps non-search filters; one malformed amount puts the whole view in its error state (fails closed); no memoization (bounded by the vault's 500 invoices / 2,000 records); inserted live regions may not announce; Safari date-input width unchecked. | Accepted, recorded here. | — |

## Fuzz and stress

- `dashboard.fuzz.test.ts` (fast-check, fixed seeds): overview totals vs an independent oracle under duplicates, conflicts,
  four evidence statuses, foreign chain and order permutation (300 runs); report vs overview agreement (300); linked totals
  (200); CSV shape and formula neutralization with hostile references (200); UTC date ranges (2,000). No product defects
  found before S1 changed the oracle.
- `dashboard.stress.test.ts`: 500 invoices and 2,000 records (vault ceilings) with 400 repeats and 100 conflicts project,
  report and export exactly in about 60 ms locally; 10,001 invoices fail closed with `DashboardError`; a real encrypted
  vault (200 invoices, 300 records) decrypts, projects and releases.

## Browser QA

Local Chromium, desktop project: default full and default lean builds pass the absence check (dashboard specs skip by
design); the opt-in full build passes all seven dashboard specs, including 320px, Arabic RTL, axe, keyboard, refresh focus
and byte-exact CSV download. CI job `merchant-dashboard-flag` repeats the opt-in run and refuses skipped dashboard tests.
Not run: real mobile Safari/Firefox, device projects (they only match device specs), assistive-technology passes.
