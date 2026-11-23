# GhostPay BUG-ONLY R11 — real anchor attribute-name boundaries

## Immutable baseline and ownership
- Repository: `djshellshoxxx/GhostPay`; live `main` verified at `8ddb344973e80b8e1eda6821e970ee6a2b808b29` on 2026-11-23.
- Branch: `automation/20261123-r11/bug/metadata-anchor-attribute-boundaries` (created from that main SHA). Sequential coordinator; no genuine independent reviewer available.
- Source file: `packages/metadata-hardening/src/web.ts`, original Git blob `5f5f856cf51541fb2935a883c77ed2197e390604`; fixed blob `f2fb64c2e7b7a249b3f8bf07ee5710c4db162278`.
- Owned files: the source file, new `packages/metadata-hardening/src/web.anchor-attributes.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, and this unique handoff. Existing `web.test.ts` and all other workers' branches untouched.
- Snapshot: 259 open PRs across three GitHub REST pages. Targeted changed-file inventories of #404, #365, #249, #367, #243, #278, #372 and current broad integration #504: **no** change to `web.ts` or the new test path. #504 changes adjacent `guard.ts`, which this branch does not edit. This is not claimed to be an exhaustive 259-PR changed-file census; resolve outstanding inventory uncertainty before any integration.

## Reproduced defect and minimal repair
`findUnsafeAnchors()` is an existing static-markup lint aid; its original `/\\btarget/` and `/\\brel/` regex patterns match the suffix of hyphenated attribute names. On a tag with `target="_blank"` and **only** `data-rel="noopener noreferrer"`, it incorrectly returns no error even though actual `rel` is absent (false negative). A tag containing only `data-target="_blank"` is incorrectly treated as a new-tab link (false positive).
- Before repair: Node.js 22.16.0 source-body-equivalent deterministic probe: **2 failed / 5** directed cases. Specifically `data-rel` masked a missing real `rel` and `data-target` triggered a false audit finding. Valid `target`+`rel` and incomplete real `rel` cases behaved correctly.
- Fix: require a whitespace-delimited real attribute name before `target` and `rel` using `\\s+` in the two existing regexes. No other production behavior or dependencies altered. This keeps the scanner a regex-based lint aid; **not** an HTML parser.
- After repair: same Node.js 22.16.0 source-body-equivalent probe: **5/5 passed**. These were function-level reproductions, **not** a native repository checkout, Vitest, typecheck, lint, build or browser test; `git ls-remote` failed due to `github.com` DNS resolution. The regression file is committed for hosted execution.

## Regression-first commit sequence
1. Ownership/claim commit: `0a5a62f9ba8404a2154eb18bb2798360404359d7`.
2. New deterministic Vitest regression committed **before** production fix: `e0483ebc2d9c78427efcfef9d1e9e8d1ce0251bd`.
3. Minimal two-regex-line production fix: `e73bff365334852e0acb9ce9d59821d2cd965b9b`.
4. This additive handoff: see branch commits after this file is created. No tests marked green unless observed.

## PR #390 requalification and integration constraints
- #390 (rendered display-text bound) current head `b655bc273a6704c9c140287b8adcdf4085b91882`, open, ready-for-review; not draft. Five exact-head GitHub Actions workflow groups `CI`, `Pages`, `Hosting kit`, `Beta acceptance`, `CLI operator qualification` all **completed success**. All 39 reported check runs succeeded or skipped, including applicable Pages browser job; three deployment-related jobs skipped as designed. Submitted GitHub reviews: **zero**. No defect requiring an unauthorized patch was found; branch unchanged.
- Metadata integration ref `automation/ghostpay-integration-lock` at `082e754f44944ebb4be283f89176b966bf8f7b4f`, generation 12 `released` following #452 merge; release is not an acquired lock or merge authorization.
- This task's hosted exact-head CI, native browser applicability and independent review must be checked on the final PR head. Keep draft and unmerged without all required checks GREEN, independent approval, conflict recheck and legitimate integration-lock acquisition. No deployment, release, fund/contract interactions, branch consolidation, new features or real-world network tests.

## Next bounded handoff
Recheck the PR's final head SHA and GitHub Actions checks, inspect any actual failures and make fixes on this owned branch only (with regression first for any new defect). If all green, still require independent review and authorized integration lock. Choose a different, truly unowned existing bug for the next BUG-ONLY round.
