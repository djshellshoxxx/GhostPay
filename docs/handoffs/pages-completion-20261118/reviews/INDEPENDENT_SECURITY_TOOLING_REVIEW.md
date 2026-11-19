# Independent security-tooling review — 2026-11-18

Reviewer: `ci_qualification`, independent of the implementation author.

Reviewed committed delta: `dfc75ef2087fa6463ae59e0818abec01796c578d` to
`fce8d96d0e18f79a437f20a801a6dd4aa9a8cfc6` in the `security-tooling` worktree.
The unrelated uncommitted RPC, Unicode and deployment-validator changes were outside this review.
The reviewed implementation/test files matched their committed bytes when the tests ran.

## Result

No introduced blocker found within the standalone Mythril disposition helper, static audit server,
agent workflow input/path hardening and cached compiler integrity check. This result does not authorize
connecting dispositions to an analyzer/release gate or claim any new analyzer or browser execution.

* The Mythril helper rejects abnormal runner errors, unusable reports, unmatched issues, changed source/bytecode
  hashes and changed compiler/analyzer pins. It remains unwired. Its comments explicitly acknowledge that raw
  report counts do not prove per-target coverage/provenance. Owner approval is a reference field, not authenticated
  authorization. A future gate integration needs independently bound target/process evidence and an approval design.
* The static server checks lexical and resolved path containment, refuses escaping file/directory symlinks, and
  returns bounded failure responses for invalid URLs or filesystem failures. It remains a loopback audit helper.
* All three cloud agent path-policy copies deny the additional build/analyzer/trust-root paths consistently.
  Parallel-review inventory now contains same-repository PR numbers and commit hashes without PR free text.
* The added compiler digest matches the official Linux amd64 solc 0.8.28+commit.7893614a release metadata:
  `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`.
  Primary source: https://binaries.soliditylang.org/linux-amd64/list.json, independently retrieved 2026-11-18.
* `.github/workflows/release.yml`, `.github/workflows/contract-analysis.yml` and
  `packages/contracts/scripts/run-mythril.sh` are unchanged from the base. The changed automation files preserve
  action pins, runner versions, trigger conditions, permissions and existing release/analyzer gates.

## Independently executed checks

From the `security-tooling` worktree, using Node v24.22.1:

```sh
node --test --test-concurrency=1 \
  scripts/tests/mythril-disposition-check.test.mjs \
  docs/audits/poc/static-server.test.mjs \
  scripts/tests/ghostpay-automation-hardening.test.mjs \
  scripts/tests/ghostpay-parallel-review-workflow.test.mjs
```

Exit 0: **48 passed, 0 failed, 0 skipped**. Log: `independent-security-tooling-tests.log`.

```sh
node --test --test-concurrency=1 \
  scripts/tests/contract-analysis-workflow.test.mjs \
  scripts/tests/mythril-runner.test.mjs
```

Exit 0: **26 passed, 0 failed, 0 skipped**. Log: `independent-security-gates.log`.

The imported Mythril audit is explicitly labelled historical evidence. Its older scan results have not been
reclassified as current execution. Existing Mythril failures, full dependency-audit high findings and browser
environment limitations retain their separate qualification status.

## Extension through d973a1a0e4a19da20ac64942d174e5544fea5c1c

Reviewed the additional implementation commits c4a6e0a10230b6c791ac716dd4cc7341e41f7e5d,
29784adb573ab3084480464d640efd7f4ab42dfb, b1d31915081048326e23eac5c0c3bbb5327b6f5f and
0b67fa9fbd125b18412ef53a5d377ab5ccd460e2, plus the subsequent key-boundary documentation correction.
No introduced code blocker found. This extension is source review and lightweight checks, not a new unit/browser
suite execution; combined qualification remains the coordinator's responsibility.

* RPC transport adds credentials=omit, referrerPolicy=no-referrer and cache=no-store while preserving redirect refusal,
  timeout, streamed response cap and RPC error policy.
* The documented deployment-validation npm command invokes the existing validator unchanged. New CLI tests exercise
  its real implementation with isolated synthetic manifests and require signing keys for shipped manifests.
* The key-boundary regression matches the existing scheme-1 implementation: subtract the recomputable shared hash
  from one exported one-time secret modulo curve order to recover the master spending scalar. No protocol code changes.
* Download hardening restricts both initial and redirected curl protocols to HTTPS and retains existing versions and
  SHA256 checks. The npm 11.21.2 source defines --no as --no-yes and refuses missing-package installation when yes=false.
  Actual npx --no -- vitest --version passed using the installed local package; no dependency installation was invoked.
* Independently compared all 30 files in 0b67fa9f with its parent after decoding only bidi Unicode escapes in both
  versions: all 30 equivalent, no String.raw contexts, no remaining literal bidi controls in those changed files.
  bash -n accepted both changed shell scripts.
* Review requested a correction to overly broad advice against keeping one's own viewing/one-time keys on the same
  device. d973a1a0 now scopes that warning to delegated viewing keys and exported one-time keys, and explicitly allows
  the trusted wallet's normal local derivation. The corrected text was independently inspected.

## Current CodeQL finding on PR 222

Current source: 2bc2098298d90928eb1acafad969f28316bb05fc. Findings check 134777382565 remains **failed** with one high
annotation. Fresh unauthenticated public GET of
https://api.github.com/repos/djshellshoxxx/GhostPay/check-runs/134777382565/annotations?per_page=100 returned HTTP 200;
response retained as codeql-222-annotations-live.json in this analysis directory. It matches the earlier retained
annotation exactly.

The annotation identifies apps/web/src/views/Settings.test.tsx, line 47 columns 47–95, title
"Clear text storage of sensitive information", message "This stores sensitive data returned by [an access to SECRET](1)
as clear text." Independently verified git blob: f73eee0286e0b0e490674ab5578240dcf796579c.

Flow: the test's literal constant SECRET at line 29 is https://rpc.example/v2/AbCdEf0123456789AbCdEf0123456789.
Line 47 places it inside rpcUrls['84532'], JSON.stringify serializes the fixture, and localStorage.setItem seeds
jsdom storage so rendering Settings can assert the existing-provider-key warning. beforeEach clears localStorage.
The default makeServices helper rejects network/RPC operations; this test supplies no override. No user,
environment or live-provider secret is the source of the reported flow. Independent source review therefore
supports a synthetic-fixture false-positive disposition for this single annotation.

The matching official query title is js/clear-text-storage-of-sensitive-data (path-problem, security severity 7.5):
https://codeql.github.com/codeql-query-help/javascript/js-clear-text-storage-of-sensitive-data/ . The annotation API
itself omits ruleId; the ID is mapped from the exact official query title, not claimed as a newly downloaded SARIF ID.

Access limits: the GitHub connector rejects both /check-runs/134777382565/annotations and /code-scanning/alerts
with HTTP 400 INVALID_ARGUMENT, "GitHub Fetch URL is not an allowed public GitHub repository or search endpoint."
The public annotation endpoint succeeded through ordinary HTTPS GET. A separate unauthenticated code-scanning-alert
GET timed out during connection after 10 seconds (curl exit 28, HTTP 000), so no fresh private alert inventory or
SARIF was obtained and no repository-level authorization denial is inferred.

This disposition does not clear the failed check and does not imply the real settings-retention policy is safe.
Production saveSettings still persists validated RPC URLs in plaintext unless the exact URL/slot is explicitly
session-only; the UI option initially remains unchecked. That separate existing product behavior needs its own
policy decision. No fixture renaming, test deletion, scan exclusion, blanket suppression, alert dismissal or scanner
bypass was performed.

