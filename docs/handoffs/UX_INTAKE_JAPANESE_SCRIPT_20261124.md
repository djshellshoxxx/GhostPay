# UX Intake — Japanese shared-script classification bug (2026-11-24 UTC)

Scope: BUG-ONLY; existing text classification, no feature, dependency, network, fund, contract, release or deployment changes.

- Live main verified: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Task branch: `automation/20261124T0018Z/bug/ux-intake-japanese-script-extensions`.
- Ownership claim: `2447112c5a6a602a1820b8627d6dc6ff5124ec8e`.
- Regression-first commit: `567d63e9ea9a4138e2ec29742d1893589e92f933`.
- Minimal source repair: `7333f340af1c42ec60e71932b301155f3c44dfbe`.
- Source blobs before/after: `46dff62739d960f78f0a1519b884faf4b22b1d73` / `bd5877060168acc83d11f1cb9b6fa7b2ebf40e07`.

## Failure and repair

The documented CJK grouping in packages/ux-intake/src/text.ts falsely identifies ordinary Japanese words as mixed scripts. Japanese prolonged sound marks (U+30FC and U+FF70) and the vertical kana repeat letter U+3031 have Script=Common but Hiragana/Katakana in Script_Extensions. The letter-only filter includes them, and the original Script checks assign them Other. Change only the Hiragana/Katakana alternatives to Script_Extensions; existing other-script checks, letter filtering, and control detection are untouched. No claim of deployed UI failure or security exploit.

## Executed verification

GitHub source was copied byte-for-byte and checked with git hash-object (both match the reported blobs). Node v22.16.0 and TypeScript 5.8.3: tsc --target ES2022 --module commonjs --strict --outDir before/after text.ts, then node check.cjs ./before/text.js and ./after/text.js. Actual complete production module, no imports or doubles. Before: 7/11 pass; failures were コーヒー, らーめん, ｺｰﾋｰ, あ〱. After: 11/11 pass. Neighbor checks: 東京カフェ, pаy, A東京, Aー, punctuation-only, zero-width control, Thai. Dedicated Vitest file committed before source fix; not executed with repository runner locally. git ls-remote failed DNS for github.com; full repository Vitest, lint, build, typecheck and native browser checks not run locally. No independent reviewer available; author review only.

## Coordination

Read AGENTS.md, docs/ai/WORKFLOW.md, HANDOFF.md, ACTIVE_WORK.md on main. Partitioned open-PR search by creation date: 49 + 55 + 78 + 44 + 64 = 290 PRs; inspected each changed-file inventory in batches of <=20, no paths under packages/ux-intake/src/text collided. Rechecked newest PR range and main prior to claim. Snapshot is not a future ownership guarantee. Shared ACTIVE_WORK claim only on task branch.
PR #390 live open, non-draft, nonmergeable, exact head b655bc273a6704c9c140287b8adcdf4085b91882; five pull-request workflow runs completed success, Snyk success, zero submitted reviews. Its owner branch left untouched. Lock ref automation/ghostpay-integration-lock commit 082e754f44944ebb4be283f89176b966bf8f7b4f shows generation 12 released; no ownership acquired.

## Outstanding gates

Draft pending hosted exact-head CI, applicable browser verification, independent review, renewed ownership/dependency scan and legitimate integration lease ownership. Do not merge until all gates satisfied. No release or deployment. Next bug must use a different unowned existing-functionality path.
