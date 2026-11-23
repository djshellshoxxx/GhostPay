# GP-BUG — Amount-blur crowd estimate intermediate overflow

Date: 2026-11-22 (Pacific). Scope: isolated **existing-behavior** bug; no features or financial operations.

## Sources and exact ownership

- Canonical repository: `djshellshoxxx/GhostPay`. Verified live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da` before creating this branch.
- Task branch: `automation/20261122T1818Z/bug/amount-blur-crowd-overflow-r11`.
- Owned source: `packages/amount-blur/src/meter.ts`, baseline Git blob `94c3ad94c6a2e98eee100eeba73fe118ccc9ef87`; fixed Git blob `c569863f8530d48713a0bd8d2fc5e23304556f58`.
- New test: `packages/amount-blur/src/meter.overflow.test.ts`. Existing `meter.test.ts` unchanged.
- Owned documentation: additive claim in `docs/ai/ACTIVE_WORK.md` and this source-pinned handoff only.
- Ownership survey: on selection, paginated all **247** open PRs and examined actual changed filenames; no active PR changed files under `packages/amount-blur/src/`. Broad active PRs #238/#262/#264/#278/#372 touch its package manifest but not the owned paths. Recheck at merge.

## Observed behavior and cause

The exported `estimateCrowd` requires finite numeric inputs, then calculates `A = (eventsPerDay * windowDays) / amountBuckets` using JavaScript number arithmetic. A valid finite-input example with `eventsPerDay = Number.MAX_VALUE`, `windowDays = 2`, and `amountBuckets = Number.MAX_VALUE` mathematically yields `A=2`, which should be classified `tiny`. The original code overflows at the intermediate multiplication to `Infinity` and incorrectly returns `{ A: Infinity, label: 'larger' }`. `honestyMeter` consumes that label, so a wrong crowd category is rendered. A second representable ratio `MAX_VALUE * MAX_VALUE / MAX_VALUE` is likewise calculated as `Infinity`; a mathematically nonrepresentable ratio was silently returned rather than raising a typed error.

This is a demonstrated numerical correctness defect, not evidence of an actual anonymity guarantee or live exploit.

## Test-first commits

1. Coordination claim: `1b090b50687d788364f59d924d49538be2620d8a`.
2. **Failing regression committed first**: `6b2819b90ce64dcf612576b026ef315e59e99a09`.
3. Minimal production fix: `c4cf1096065b16cb57f6cba5a6dea67326b82aa4`.

The fix uses the original multiplication/division for finite products (unchanged normal arithmetic), falls back to dividing by bucket count before multiplication only when the intermediate product overflows, and uses the existing `AmountBlurError('INVALID_INPUT')` path for a truly nonfinite final estimate.

## Executed verification versus pending

- Node.js `v22.16.0` standalone source-equivalent JavaScript replay of the original and corrected expression/validation/labeling: baseline had **three failing expectations** among five directed checks; repair passed **all five**. Their inputs cover a wrong two-event label, a representable high finite ratio, true overflow error, an ordinary threshold, and a small finite ratio.
- **300 neighboring source-equivalent numeric cases** matched the original results exactly after repair. No special libraries required. Replay was constructed from the fetched `meter.ts` logic; it is **not** a Git checkout or full-file execution.
- Dedicated `meter.overflow.test.ts` Vitest regression was committed, **not executed locally**. Native GitHub checkout fails DNS resolution (`Could not resolve host: github.com`).
- Full repository Vitest, typecheck, lint, build, Pages runtime browser tests and independent reviewer verification: **not executed in this environment**. Hosted exact-head GitHub Actions are the next runnable verification source; do not claim completion until workflow jobs finish.

## PR #390, integrations and follow-up gates

- #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882` is open, **not draft**, with all five hosted workflow groups successful (CI, Pages, Hosting kit, Beta acceptance, CLI operator qualification). No submitted independent GitHub reviews were returned. No changes made to its owner branch.
- Shared integration lock branch `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` holds generation 11 for owner `994a0d214fb9-root-r3`. Its recorded expiry does not authorize another worker to take it. No lock takeover, merge, branch overwrite, deployment or release.
- Hold this PR as draft until exact-head all-required checks succeed, applicable native browser verification, a genuinely independent review, updated ownership/conflict review and valid integration lock authority are independently confirmed. No local or on-chain fund interaction was performed.

Next work if qualified: inspect the specific failing hosted job and repair only real regression/CI defects on this owned branch. Otherwise leave draft; pursue a separate unowned bug in a subsequent isolated run.
