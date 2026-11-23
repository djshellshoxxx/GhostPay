# C1 responsive RPC input baseline — bounded repair (2026-11-23 UTC)

## Identity and exact source

- Cycle: `20261123T1440Z`; single coordinator, sequential source investigation, focused repair, and self-check only; no native subordinate or independent approval.
- Isolated branch: `automation/20261123T1440Z/bug/c1-rpc-input-subgrid`.
- Direct parent: draft PR [#510](https://github.com/djshellshoxxx/GhostPay/pull/510), head `e205b107b57794fd96a8302d54d2df3cb273e9e9`, itself stacked on draft [#504](https://github.com/djshellshoxxx/GhostPay/pull/504) `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`.
- Main observed: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Ownership commit: `07c1175e2c77769c65c4e686dc0d543f201d3138`. Product fix commit: `eb5d576467c2c9c94eb71de637f667b0ebe38ab4`.
- Changed production asset: `apps/web/src/styles/app.css`, before blob `71cd022a142056c9cb044241818adfff52d0d03b`, after blob `35d9015d7645b3f1841f47a478815d9d41f3ebf9`. Existing Playwright regression is unchanged.

## Reproduction and root cause

**GP-C1-RPC-900-01 — Medium regression / high confidence / no security exploit claimed.** Existing `apps/web/e2e/settings-rpc-reflow.spec.ts:13–29` requires both primary and secondary URL inputs to be at least 260px wide, vertically aligned (<12px top difference), and nonoverlapping at 900 CSS pixels. The parent’s **actual hosted** full e2e job [137700068533](https://github.com/djshellshoxxx/GhostPay/actions/runs/45176792342/job/137700068533) and lean job [137700068369](https://github.com/djshellshoxxx/GhostPay/actions/runs/45176792342/job/137700068369) failed this invariant: observed Y difference **24px**, expected <12px. The separate 320px stacked reflow test passed.

The parent grid assigned each `Field` to a separate two-column grid cell. Although columns share the same outer row, each `Field` independently lays out its label and input; a wrapped second label shifts its input down by one text line. `Common.Field` produces label/input/help or label/input/hint in the exact three-child order.

## Repair

At min-width 40rem, the existing two-column grid now makes each `Field` a three-row `subgrid` spanning shared label, input and helper tracks. The label row takes the maximum natural height across both fields, so input tracks are aligned even if the label wraps. The test controls remain a full-width following grid row. The one-column rule below 40rem is **unchanged**. No tests, thresholds, dependencies, account data, payment paths, contracts, workflows, deployments or service settings changed.

## Verification actually performed

- Read the original CI failure logs for both full and lean test jobs and checked the exact code in `Settings.tsx`, `Common.tsx`, `styles/app.css`, and the failing Playwright spec.
- Fetched the updated GitHub source blob and ran a deterministic CSS-structure assertion: wide viewport retains two equal columns and control spanning; wide fields share three subgrid rows; mobile remains single-column. **PASS.** This is static inspection, not a browser render or an executed repository test.
- GitHub compare of the product branch to exact #510 parent after repair: **2 ahead, 0 behind; two changed files** (`ACTIVE_WORK.md` + stylesheet) before handoff commit.
- Native repository checkout failed at the ordinary GitHub hostname lookup: `Could not resolve host: github.com`. No local Vitest, typecheck, lint, Playwright, Pages build or security analyzer execution is claimed.
- Required next verification: exact final head hosted full and lean Playwright at 900px and 320px, Core CI, Pages build/browser acceptance, and genuine independent review. Until that evidence exists, classify as **implemented, not verified, not merge-qualified**.

## Coordination and unrelated failures

- Preserve parent #510 contextual-help fix. Its exact-head hosted browser logs no longer list the contextual-help failure; they still fail the RPC 900px test.
- Separate parent web-unit [job 137700068647](https://github.com/djshellshoxxx/GhostPay/actions/runs/45176792342/job/137700068647) fails `Sweep.test.tsx:784` (“unknown outcome after a dry run that did run shows no skipped-dry-run warning”). This is **not repaired** here. Do not disable the warning, weaken the assertion or declare the consolidation clean; trace final simulation state and test synchronization separately, under a new claim.
- Broad consolidation #504 owns many source paths, including the incorporated #387 layout; it must coordinate acceptance before integrating this child. Do not edit #504/#510 branches directly or merge shared targets without an atomic lease.
- Integration metadata ref `automation/ghostpay-integration-lock` was released at generation 12, commit `082e754f44944ebb4be283f89176b966bf8f7b4f`; this worker did not acquire, renew or replace it.
- `.github/workflows/pages.yml` PR trigger is validation-only; publication requires an explicit main-only workflow dispatch with deploy=true. No deployment, release, tag, real funds, force push, contract change or main merge.

## Next-cycle checkpoint

1. Read this branch and the published draft child PR's exact head; compare parent #510 and #504 anew.
2. Inspect exact-head CI (full/lean browser, Pages); if alignment still fails, use browser artifact/element bounding boxes to adjust CSS without changing thresholds.
3. Independently review resulting layout and accessibility; the same assistant's static check does not constitute an independent review.
4. Triage the separate Sweep dry-run warning failure as a new issue/branch when ownership permits.
5. Only after all gates pass, coordinate with C1 integrator and acquire the repository-wide atomic lock before integration. No main deployment.

This handoff is an isolated, additive snapshot; it does not supersede legacy security reports or the broad consolidation ledger.
