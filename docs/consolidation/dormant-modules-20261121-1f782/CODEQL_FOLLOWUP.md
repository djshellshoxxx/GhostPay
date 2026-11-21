# F05 test-fixture qualification follow-up

## Observed gate failure

The first published composition, `3580f0f352c309c990c8c3c6aff0902ab6b28f7c`, received one high-severity CodeQL annotation even though its three analysis jobs completed successfully. The exact [PR #371 check](https://github.com/djshellshoxxx/GhostPay/pull/371/checks?check_run_id=136767944933) identifies `apps/web/src/features/future/ghostproof/review.test.ts:138`, rule `js/incomplete-sanitization`, titled “Incomplete string escaping or encoding.” Its message identifies a first-occurrence replacement of the opening brace.

The [F05 donor check](https://github.com/djshellshoxxx/GhostPay/pull/323/checks?check_run_id=136489623426) contains the same path, line, title, severity and message. Both source files have Git blob `a6ff93e43d99751cc3d580c2b7e8e4881696c584`; the file does not exist on captured main `eb59d93c`. The annotation and exact source attribution are preserved under `hosted-ci-371/` in the evidence archive.

## Bounded correction

The affected test deliberately adds an unknown `audience` property at the root of locally generated digest-receipt JSON and expects `INVALID_RECEIPT`. The expression was fixture construction, not a production escaping routine. The annotation establishes a failing security-result gate; it does not establish a reachable production vulnerability.

Follow-up source `e210890e744540b070282bf768942174004f591d` asserts that the fixture begins with an opening brace, then builds the unknown-field prefix explicitly and appends the remaining fixture text. For every string satisfying that asserted precondition, the resulting bytes are exactly those produced by the previous first-brace replacement. Nested objects remain unchanged. The unknown-field rejection assertion and the separate changed-memo rejection assertion are retained. No CodeQL rule, configuration, threshold, exclusion or dismissal is changed.

The public equivalent is `c51072fbe188cecbb529693cfc78fdd66710ebf6`, with complete tree `f15d2ceac654c12b22a44a0e6e9857631744ab10`. Only this test file and documentation differ from the previously qualified composition. All production code, package manifests, lock entries, test configurations and guard implementations remain unchanged. Original donor histories and source branches are preserved. Current accounting is **16 donated source/test files unchanged plus one intentional test-fixture correction**.

## Qualification and limits

All three existing module suites passed at the corrected local source: five files, **212 tests passed, zero skipped**. Whole-web typechecking and typed ESLint also passed there. The `fixture-module-tests`, `fixture-web-typecheck` and `fixture-web-lint` receipts in `EXECUTION.json` bind those exact commands, source/tree identities and retained log hashes. Independent review approved the correction's byte equivalence and preserved assertions.

The earlier whole-web coverage, separate no-coverage and full/lean artifact comparisons retain their original source identities. They are not represented as reruns after this test-only correction. Production inputs are unchanged, and the existing conditional integration skips are unchanged. Hosted qualification, including the CodeQL aggregate result, must run on the successor PR head; successful earlier-head Pages, Beta or CLI results are not substituted for that requirement. Current results are recorded in [PR #371](https://github.com/djshellshoxxx/GhostPay/pull/371).
