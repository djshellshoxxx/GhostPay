# GP-BUG — Natural-language amount locale descriptor isolation

Date: 2026-11-23. Base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Branch: `automation/20261123T1924Z/bug/nl-amount-locale-snapshot`.

## Observed failure and minimal repair

The exported separatorsForLocale() returns a mutable object from its static table. The same object serves en, en-US, en-AU (fallback), ja, and other locales. A consumer editing an earlier return value (decimal comma, grouping dot) changes future interpretations: the localized numeric path for "1,234" at six decimals returns 1,234,000 base units rather than 1,234,000,000. This was reproduced using synthetic data, not a transaction. Return a shallow detached object; its two fields are strings. No changes to supported locales, parser rules, UI or dependencies.

## Commit and runtime evidence

- Ownership: `2ab9874bb1b72911beabfe807531546975c8c9c4`.
- Regression first: `3f4d4c4d8d68bad133064c6590a9e5e0c4e1a6b3`, dedicated Vitest file; existing nlamount.test.ts untouched.
- Minimal source fix: `ed22cf97d815b54f848521e78c300d36fdb86e48`.
- Original blob: `8a89fc33aafd9a8f9effd701449358f0a9005813`; repaired blob: `df552a1334efb109f40a944c8bfdac0d422b8ccb`. Both independently recomputed from UTF-8 Git blob framing and SHA-1 in the V8 execution environment and matched GitHub's source metadata.
- Executed actual extracted locale lookup and localized numeric parsing functions (TypeScript annotations removed, ok/err helpers doubled, final base-unit calculation applied as in the full parser). Before: 3/11 assertions passed, 8 failed (descriptor and numeric interpretation for each of en/en-US/en-AU/ja after mutation). After: 11/11 passed. German and unknown locale neighboring behavior unchanged. Separate initial descriptor-only run: 3/6 before, 6/6 after.
- Full parseNlAmount regression in the committed Vitest file is pending hosted execution. Full repository Vitest, lint, typecheck, build and native browser checks not run locally; git ls-remote failed DNS in the container. No independent review is available in this execution.

## Coordination and remaining gates

Read AGENTS.md and all three AI workflow/registry documents at current main; registry contains no nlamount claim. Reviewed changed-file inventories of all 275 open PRs in snapshot through #520: zero collisions on selected production path and dedicated regression path; existing nlamount.test.ts belongs to broad PRs and remains untouched. Recheck updated heads before integration. Shared integration lease ref automation/ghostpay-integration-lock is generation 12, released, at `082e754f44944ebb4be283f89176b966bf8f7b4f`; not acquired.

PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: 36 successful/3 skipped checks, all five named workflow groups successful, Snyk success, no submitted reviews, mergeable=false. GitHub API reports draft=false, despite historical draft description. Do not override its owner or change its state. No actual CI failure requiring a repair was found.

Leave this task draft and unmerged pending required exact-head CI, applicable native browser verification, genuine independent review, fresh ownership/dependency checks and legitimate integration authorization. No deployment, release, contracts, funds or changes to another worker's branch.
