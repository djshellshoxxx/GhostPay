# PR #569: completed Firefox reflow continuation

## Result and source identity

The original native Firefox reflow test now passes in both Pages profiles.
Each run checks all nine existing routes at 320 CSS pixels with 100% and 200%
text, including all 18 default axe audits. Neither run has failed or skipped
tests, and neither audit set reports a violation. Manual/incomplete axe checks
remain recorded in the output; this is not an accessibility certification.

| Source | Exact identity |
| --- | --- |
| Original owner [#569](https://github.com/djshellshoxxx/GhostPay/pull/569) | `c30283d28ec15f0c4fddb8a80d1c5f60ee590401` |
| Existing #373 parent | `b660b2d8f3f84ddf72f684d13913f643f33f2eee` |
| Isolated child branch | `investigate/privacy-569-firefox-20261124` |
| Ownership claim | `08822de9` |
| Test-only implementation | `c79a81031bfc184ac85a3571ab86079d60ad5393` |
| Exact full/lean test source | `fa513ee2857d2cd30ea92d5e65c56cc3c739aaf6` |
| Exact full/lean test tree | `4ecfb5e2515366e87729d1c2f0c8fcf99f476d23` |
| Existing responsive owner #583 inspected | `c1980912f87f0293b7a15f2419505a6719c5f3a8` |
| Main at final remote recheck | `706188000c38b3dde5a3a362370a530870aa7587` |

The original #569, #588 and #583 remote heads were reconfirmed unchanged.
The child preserves #569's ancestry. Main is only a census observation; this
child has not been qualified as a new composition with main.

## Why the assertion needed correction

Hosted Firefox full [job 138251329944](https://github.com/djshellshoxxx/GhostPay/actions/runs/45336997113/job/138251329944)
reported an input at left 33/right 959 on Home at a 320px viewport. Its page
width and horizontal-scroll checks passed. The same assertion failure was
reproduced locally before changing the test.

The input belongs to the collapsed `MerchantProfilePanel` in the full shell's
`mainPrelude`. With native tracing active, Firefox retains its earlier 926px
layout rectangle even though `checkVisibility()` is false. Opening the panel
produces a visible input at left 33/right 287, which fits at both text sizes.
An intentionally widened visible 500px input is detected by both the old and
new overflow predicates. Geometry-only results are preserved in
[geometry-controls.json](pr569-reflow-evidence-20261124/geometry-controls.json).

The implementation replaces only the rectangle-count visibility filter in
`apps/web/e2e/accessibility.spec.ts` with `element.checkVisibility()`. This is
the same predicate already used by #583's responsive suite. It retains the
320px viewport assertion, page-scroll assertion, coordinate tolerances, all
control types, all routes, text enlargement and every default axe rule.
No CSS, production source, dependency, native engine, workflow, timeout or
skip was changed. QR production paths remain untouched.

## Executed qualification

All results below use the existing locked dependencies: Playwright 1.65.1,
Firefox 159.0/build 1572, axe-core 4.14.0 and Node 24.22.3 on Linux Debian 13.
The browser is the official Playwright build for this platform. The earlier
mobile branch's Firefox 157 smoke is not counted as #569 evidence.

| Check | Actual result |
| --- | --- |
| Exact `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` | Passed; 721 packages installed. |
| `NODE_OPTIONS=--max-old-space-size=512 npm run build:libs` | Passed; 65 built packages, 2,292 output files. The complete package tree and lock hashes match the coordinator's #571/#589 donors. |
| Original full three-case accessibility selection | Failed as observed in CI: the Home reflow assertion plus two renderer-crash cases. No baseline pass is claimed. |
| Corrected original full reflow test | **1/1 passed**, zero failures/skips; all 18 default audits passed with zero violations. |
| Corrected original lean reflow test | **1/1 passed**, zero failures/skips; all 18 default audits passed with zero violations. |
| Original web build/typecheck/postbuild scan | Passed in each successful full/lean Playwright web-server startup. `reuseExistingServer` remains false. |
| Scoped typed ESLint | Passed for the changed accessibility spec. |
| Whitespace / secret scan | Passed; final staged deliverables scanned before commit. |

Both successful browser runs used the original configuration and this command,
with `GHOSTPAY_LOCAL_BUILD_PROFILE` set to `full` or `lean`:

```bash
NODE_OPTIONS=--max-old-space-size=2048 \
GHOSTPAY_LOCAL_BUILD_PROFILE=full \
DEBUG=pw:browser \
npm run test:e2e -w @ghostpay/web -- \
  --config=playwright.native.config.ts --project=firefox \
  accessibility.spec.ts --grep 'supported routes reflow' \
  --trace=retain-on-failure
```

Two incomplete environment attempts remain explicit. A 1GiB Node heap limit
failed during web typecheck, before browser tests; the successful original
pipeline used a 2GiB limit. The first lean run could not finish its receipt
while the shared 20GiB filesystem was exhausted: its log ended at 4,096 bytes
and the report remained from the prior full run. That attempt is incomplete,
not a product failure or a pass. After coordinator cleanup, the same ordinary
lean command completed with the result above. No test retries or gate changes
were committed.

## Separate native renderer gate remains blocked

The original hosted full suite had 132 passes, two skips and eight failures:
the corrected layout assertion and seven renderer crashes. Two existing crash
cases were reproduced locally; the entire native suite has not been reclassified
as passed by the focused reflow runs.

The versions and ARIA/axe/locator sequence match the primary Playwright report
[#44135](https://github.com/microsoft/playwright/issues/44135), which was closed
as a duplicate of [#43967](https://github.com/microsoft/playwright/issues/43967).
The upstream report identifies a Firefox ARIA-reflection cache defect and says
the repair arrived through [#43982](https://github.com/microsoft/playwright/pull/43982)
in the 1.66 development line. On 2026-11-24, the official npm version query still
returned stable `1.65.1` and development `1.66.0-alpha-2026-11-24`; no fixed stable
test dependency was available. Version metadata is preserved in
[runtime-and-upstream.json](pr569-reflow-evidence-20261124/runtime-and-upstream.json).

Keep that exact native gate blocked. This continuation does not disable rules,
replace accessible locators, substitute an engine, adopt a prerelease or change
application semantics to bypass it. No engine diagnostic script or reproducer
payload is included in the handoff. A future independently owned stable
dependency update must rerun the original unfiltered native gates.

## Evidence and coordination

[qualification.json](pr569-reflow-evidence-20261124/qualification.json) contains
both complete 18-state audit summaries and exact test-source identities.
[SHA256SUMS.json](pr569-reflow-evidence-20261124/SHA256SUMS.json) identifies the
normal baseline, full/lean success, incomplete environment receipts, library
build, lint, secret-scan and geometry evidence files. Text companions trim only trailing whitespace/blank lines; `original-logs.zip` preserves every original log byte, with raw hashes in `log-provenance.json`.

The versioned [missed-work coverage matrix](MISSED_WORK_CENSUS_20261124.md)
retains the other exact PR heads, failed jobs, existing owners and concurrent
continuations. The already-completed mobile work is published as
[#597](https://github.com/djshellshoxxx/GhostPay/pull/597), head
`a929b178a6626a9912f5d081b8a3e8c6847374ae`, whose tree matches the mobile handoff.

This worker made no remote comment, push, merge or deployment. The coordinator
owns review/publication and all shared integration decisions. Original owner
branches, tests and failed receipts are preserved.
