# UX Connect hardware-signing runtime bigint boundary — BUG-ONLY handoff (2026-11-22/23 UTC)

## Source pins and ownership

- Repository: `djshellshoxxx/GhostPay`. Verified live `main` at selection and pre-publication: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `automation/20261123T0021Z/bug/hwsigner-bigint-boundary`. Only task-specific source and new test, an additive ownership entry, and this handoff are owned.
- Original source: `packages/ux-connect/src/hwsigner.ts`, Git blob `4e2ee2e68452808b969195dc3d7fdbca359b82f6`. Repaired source blob: `39ed2cdc69c22d9be9201fa40c8177f190ea6659`.
- New test blob: `packages/ux-connect/src/hwsigner.runtime-amounts.test.ts`, `55f523317c0437f1fdd0a38a14f0f819f4ec13bc`.
- Ownership claim commit: `7de9a1be6aa8b02a2b63604375fffd079d1cbec7`.
- Failing-regression commit, before production repair: `04b51b7be47145bccc09957e9817dad24826a390`.
- Production repair commit: `5bdbad9cf605f8b62486092c8f0ba6c9d93d16eb`.
- Pre-handoff compare to live `main`: only the additive claim, new test, and four changed production comparisons; three task commits.
- Open PR inventory: all **245** open PR numbers from date-scoped GitHub searches were checked through paginated changed-file inventories, including broad PRs #278 (1,495 paths), #262 (1,173), #264 (1,062), #372 (1,907). No open PR changed `hwsigner.ts` or the new dedicated regression path at the snapshot. Existing `hwsigner.test.ts` and other worker paths were not modified. A subsequent worker must recheck heads and new PRs.

## Confirmed defect, observed behavior and minimal repair

The exported `validateTxRequest()` accepts transaction amounts declared as `bigint` but does not verify their actual runtime types. JavaScript relational comparisons such as `1.5 < 0n` and `null > U256` coerce rather than reject such inputs. In a source-equivalent Node.js 22.16.0 replay of the exact original validator comparisons, all six sampled invalid values were accepted: fractional or integer `value`, numeric `gasLimit`, numeric `maxFeePerGas`, numeric `maxPriorityFeePerGas`, and `value: null`. This can let a malformed signing request proceed to the user-facing transaction display, or throw a native exception when its invalid field is subsequently formatted, instead of returning the established typed `Result` error. No real wallet/device interaction was used.

The repair adds a `typeof ... !== 'bigint'` guard to exactly four existing conditional validations: `value`, `gasLimit`, `maxFeePerGas`, `maxPriorityFeePerGas`. It retains existing error strings and valid bigint value/range behavior; no schema, fee calculation, wallet, signing implementation or display redesign changed.

The new dedicated regression covers 12 invalid runtime cases on the public validator, transaction display and sign-session entry, three valid bigint requests including the U64/U256 boundaries, and four existing bigint range errors. It was committed before the source repair. **The new Vitest file has not been executed in a full repository checkout**.

## Verification performed and not performed

- Local `node /tmp/gp_hwsigner_bug_repro.mjs` (Node v22.16.0, excerpt manually transcribed from GitHub source blob `4e2ee2e6...`): six malformed values passed incorrectly before repair. This was a source-equivalent reproduction, **not full-file or repository execution**.
- Local `node /tmp/gp_hwsigner_fixed_repro.mjs` after updating those same four comparisons: those same six inputs all rejected with existing error strings.
- Local `node /tmp/gp_hwsigner_regression.mjs`: **19/19** source-equivalent validator assertions passed (12 invalid runtime types, three valid bigint cases, four existing range errors).
- GitHub fetched and confirmed repaired source blob `39ed2cdc69c22d9be9201fa40c8177f190ea6659`, test blob `55f523317c0437f1fdd0a38a14f0f819f4ec13bc`, and the three-file pre-handoff task diff.
- Native repository checkout unavailable: `git ls-remote` failed `Could not resolve host: github.com`. Full Vitest including the new test file, ESLint, typecheck, build, and native browser test were **not** run locally and are not claimed passed. Hosted PR-head GitHub Actions results must be assessed after publication.
- No genuine independent verifier or external approved review was available during this cycle. Self-audit is not independent approval. The runtime reproduction does not demonstrate an exploit, fund transfer or real-device signing.

## Draft PR #390 and shared integration constraints

- Draft-labelled request #390 is now **open and not draft** at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`; its author branch remains unchanged.
- Its five exact-head hosted workflows **all succeeded**: CI #44898786362, Pages #44898786411, Beta acceptance #44898786416, Hosting kit #44898786427, CLI qualification #44898786403. CI e2e lean/full and Pages browser-artifact and Beta browser jobs succeeded. PR-triggered deploy/smoke jobs were skipped, as expected. Snyk commit status succeeded.
- GitHub submitted reviews for #390: **none**. It cannot be treated as independently reviewed/merge qualified. No failing CI or verified new code defect justified touching its owner-controlled branch.
- Integration metadata ref `automation/ghostpay-integration-lock` exact SHA `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`; state `held`, generation 11, owner `994a0d214fb9-root-r3`. Expiry timestamp is old but prior-owner stop evidence is absent; **do not infer release from expiry**. No lock takeover or protected-main integration.

## Outstanding gates / next worker

1. Read the exact draft PR head, all required GitHub Actions statuses, and the new focused test results. Repair actual CI/typecheck/lint/test defects **only on this task branch** without touching other owners.
2. Confirm the 245-PR file inventory plus any newly opened PRs is still conflict-free.
3. Obtain genuine independent review from a separate verifier. Apply native Pages browser verification if the package is used in a browser signing path; do not label hosted CI alone independent review.
4. Keep PR draft unless exact-head all-required CI is green, applicable browser gates pass, dependencies/owners are reconciled, independent review exists, and legitimate integration lease ownership is released/held by this coordinator. No automatic merge, deployment, release, real-world traffic, contracts or funds.
