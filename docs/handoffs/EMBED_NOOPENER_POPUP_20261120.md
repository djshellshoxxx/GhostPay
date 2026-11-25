# GhostPay continuation: embed v2 no-opener popup classification (2026-11-20)

## Exact source and scope
- Frozen base: main `aa3df1cb37274fae73af0ca957183c15c51b62d3` (still identical when inspected).
- Isolated branch: `automation/ghostpay-20261120-embed-popup-noopener-r1`. No main, production deploy, contract, custody, fee, network, dependency or configuration changes.
- Original script blob: `0186bb1364fd6de19e1bec241ac9c5b074033bc7`.
- Regression-first commit: `3a316a384a63421ac7cb35a9b7e5ef417a7d6711`.
- Minimal production correction: `94f88d5a11b088b6891e507ca31bd378f6b4229c`; script blob becomes `bed86cb35727a1db3fce3b7143bd91b25573848f`.
- Changed paths: `apps/web/src/lib/embedPopup.noopener.test.ts` and `apps/web/public/ghostpay-embed-v2.js`; this handoff is additive.

## Reproduced source defect / contract
Audit #312 GP-BUG-14 documented that `window.open(url, '_blank', 'popup,noopener,noreferrer')` is allowed to return null for a **successful** no-opener navigation. Main used `if (!w)` to declare a popup blocked and tell the user to retry, which can cause unnecessary duplicate checkout launches. A null result provides no reliable blocked/open outcome.

The new Vitest regression executes the **whole SDK** in a Node VM with a simulated valid checkout button and checks the actual click registration/navigation arguments. It checks both null and object returns; neither may yield a false `Popup blocked` title. The fix retains `popup,noopener,noreferrer`, same-origin and invoice validation, and exactly one `window.open` call. It removes only the invalid inference and blocked warning.

## Branch census / overlap handoff
- Earlier complete census PR #330: 392 refs, of which 185 ancestry-redundant, 68 docs/nonapplication-only, 138 application-path candidates and 1 unrelated `gh-pages`; 391 main-relative comparisons, with head drift and GitHub file-list truncation explicitly noted.
- Re-paginated the live branch search through the terminal null cursor: **402 refs before creating this branch**; 10 new refs, zero removed compared with the PR #330 census. All 10 new names were compared against the frozen main using GitHub compare. Creating this branch adds one extra ref, for **403** if no concurrent publication/removal occurs.
- Newly observed refs/ownership: `automation/20261120T1840Z/bug/receipt-archive-identity` (#332); `automation/20261120/bug/btc-fee-floor-config` (#334); `evidence/ghostpay-continuation-r2-20261120` (#307 evidence); `evidence/ghostpay-fee-floor-qualification-20261120-r2` (#334 evidence); `evidence/ghostpay-idle-session-r2-20261120` (#331 evidence); `evidence/ghostpay-vault-rekey-qualification-20261120` (#328 evidence); `fix/ghostpay-backup-preflight-20261120-r2` (#333); `fix/ghostpay-devnet-wallet-consent-20261120-r2` (#336); `fix/ghostpay-receipt-archive-identity-20261120-r2` (#335); `integration/ghostpay-idle-session-20261120-r2` (#331).
- New refs are **not independent features** by default; many are stacked or documentation/evidence descendants. #333 depends on #331, #335 depends on #333, #329 depends on #321, and #336 depends on the retention base #327. Preserve ordered ancestry. The branch `automation/20261120T0641Z/bug/payment-uri-aggregate-length` has zero ahead commits and is already an ancestor of main; do not reimplement.
- Changed-file inventories of broad PRs #307, #325, #278 and the newer #336, #330 and #334 showed no `ghostpay-embed-v2.js` or this new test. This fix does not overlap their owned source paths.

## Qualification status and follow-up
- The exact new regression and correction were **committed**, but the full Vitest/ESLint/build/browser suite has **not been executed in this current tool environment**. Do not equate test-first source commits with confirmed RED/GREEN execution.
- Run `npm --workspace apps/web exec vitest -- run src/lib/embedPopup.noopener.test.ts` or the repository's equivalent at the exact head, then full web test, lint, typecheck and full-profile embed browser checks; obtain independent source review and hosted exact-head CI before merging. No false assertion that a popup actually opened; the test only checks SDK behavior under the standard's allowed return values.
- On latest inspected sources #321 and #328 passed Pages/Hosting/Beta/CLI workflows but main CI was queued; #334's five workflows were queued. A Snyk status success alone is not a substitute for the CI gate. #330 and the other current recovery PRs remain draft / integration-gated.
- Do not merge this branch, unrelated historical code, or the broad consolidation into main until all applicable checks and the separate integration lock permit it. No beta or live-funds release is authorized.

## Next cycle
1. Refresh main and branch heads, inspect current CI and ownership before any merge.
2. Run the committed test against unmodified base (expected to fail on the old title) and fixed branch (expected to pass), then web lint/build and relevant browser flow.
3. Review the 138 semantic candidate families from PR #330 and recover only distinct, qualified work. Prioritize open v1.0 issue #286 and v1.1 issue #287 without duplicating active #325/#331/#333/#335/#336 work.
