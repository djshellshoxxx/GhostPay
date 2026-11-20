# Pages security tooling extraction — 2026-11-18

## Source and scope

Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Branch: `integration/ghostpay-security-tooling-20261118`.
Final code commit: `0b67fa9fbd125b18412ef53a5d377ab5ccd460e2`.

This worker extracted and tested the assigned security/tooling slices. The coordinator owns integration into the
combined Pages candidate and all remote writes. No remote branch, PR, deployment or release was changed by this worker.

| Commit | Source | Change |
|---|---|---|
| `0faf9221` | Current work authorization | Isolated ownership claim and acceptance criteria. |
| `f219cc89` | #224 + #226, final source `3a3b136a326e0d8c1f369d94d4517ad0711babc8` | Local static helper contains sibling and symlink paths, handles malformed request URLs and filesystem failures. |
| `bf6c8d1d` | #212 + #225, final source `94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57` | Standalone Mythril disposition utility rejects abnormal runner failures and malformed annotations. Historical source review retained and labeled. |
| `fce8d96d` | #220, `18b03029` plus the relevant `6db11492` follow-up, final source `16c48521f99903ccd2e584df5d00a9dec5ef754c` | Agent path-policy restrictions, untrusted PR-input minimization, cached compiler hash verification. |
| `c4a6e0a1` | #220, `fbda6b13` and `e800d142` | RPC requests omit ambient credentials and referrers and bypass HTTP cache. Documentation and executable proof explain the viewing-key/one-time-key boundary. |
| `29784adb` | #212 at `4894d0d8d94333dffa8ae3937a4d8314f27c686f` | Restores the documented `validate:deployments` npm command with command-line validation tests. |
| `b1d31915` | #224, `51a50695db8248bb725f8ec267b0b23b7b02ba64` | Existing pinned downloads allow HTTPS-only redirects; integration npx refuses implicit package installation. |
| `0b67fa9f` | #224, `5be8daf6710870410e660ca9d34e1fc58cd44712` | Rewrites literal bidirectional controls as visible Unicode escapes without changing their values. |

Full commit IDs are retained in [SOURCE_COMMITS.txt](security-tooling-20261118/SOURCE_COMMITS.txt).
The runtime/test source hashes used for verification are retained in
[verified-source-sha256.json](security-tooling-20261118/verified-source-sha256.json). They were checked again after
the final code commit. No product change followed the tests and their corresponding final commits.

## Verification

Environment: Linux, Node `v24.22.1`, npm `11.9.0`, Vitest `5.0.5`. The repository accepts Node >=22; hosted workflows
use Node 22 and still require their own qualification. Installed dependencies were copied from the coordinator's
checkout using the same original lock file, SHA-256
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`. This worker did not execute `npm ci`.

The isolated library bootstrap completed with exit 0 in 79.77 seconds. It is setup evidence; the coordinator must
build the complete final integrated source. Package typecheck and lint below ran at the final code commit.

| Check | Before correction | Final result |
|---|---|---|
| Standalone Mythril checker regression | #212 helper: 11 passed, 2 failed | 13 passed, exit 0 |
| Local static helper regression | Main helper reported 5 failing cases; the pre-fix run was stopped by its 45-second timeout and has no completed-suite result | 8 passed, exit 0 |
| Agent workflow hardening and parallel-review tests | Main: 25 passed, 2 failed | 27 passed, exit 0 |
| Existing Mythril runner, contract-analysis, Codex workflow and workflow-file tests | Unchanged gates | 33 passed, exit 0 |
| RPC metadata regression | Main: 86 passed, 1 failed | 87 passed, exit 0 |
| Viewing-key boundary proof | Documents an existing cryptographic relationship | 1 passed, exit 0 |
| i18n formatting | Values preserved | 27 passed, exit 0 |
| Deployment validation command | Main: 1 passed, 2 failed because command was absent | 3 passed, exit 0 |
| Web i18n/display/hardening selection | Values preserved | 59 passed, exit 0 |
| Typecheck: chain-adapters, core-crypto, i18n | — | All three package scripts passed, exit 0, 8.89 seconds |
| Lint: chain-adapters, core-crypto, i18n | — | All three package scripts passed, exit 0, 13.50 seconds |
| `npm run ci:scan-secrets` | — | Exit 0 |
| `npm run ci:check-actions` | — | Exit 0; 111 action references pinned |
| Bidi escape equivalence | — | All 30 files exactly match prior source after normalizing only the explicit bidi Unicode escapes |
| Cached compiler guard | — | Empty cache exits 0; tampered cached binary exits 1 |
| Action pins and runner selection | — | Identical before and after the three workflow/action file changes |
| Shell/JavaScript syntax checks | — | Changed shell scripts and PoC JavaScript parse successfully |

Package Vitest commands use `--coverage.enabled=false --maxWorkers=1` and `NODE_OPTIONS=--max-old-space-size=768`.
Focused selection is not a replacement for whole-package coverage or combined-candidate testing. Commands, exit
codes, counts and unabridged output are retained under [security-tooling-20261118](security-tooling-20261118/),
including [package-test-results.json](security-tooling-20261118/package-test-results.json),
[package-static-results.json](security-tooling-20261118/package-static-results.json), and
[node-green-results.json](security-tooling-20261118/node-green-results.json).

## Independent review

The separate CI worker reviewed committed security slices through
`fce8d96d0e18f79a437f20a801a6dd4aa9a8cfc6` and found no introduced blocker within those slices. Its independent
execution passed 48 helper/static-server/automation/parallel-review tests and 26 unchanged analyzer/release-gate
tests. The reviewer also checked the cached compiler digest against official Solidity binary metadata.
See [INDEPENDENT_REVIEW.md](security-tooling-20261118/INDEPENDENT_REVIEW.md).

The reviewer extended source review through `0b67fa9f` to the RPC, validator, download and bidi changes, and
independently confirmed that all 30 bidi files preserve their values without `String.raw` contexts. No additional
heavy tests ran during that extension. Its documentation finding was corrected: the key-boundary advice now
addresses exported one-time keys and separately delegated viewing keys, while acknowledging normal local
derivation in a trusted wallet. The coordinator's combined-source qualification remains required.

## Integration constraints and remaining gates

- The Mythril helper remains **unwired**. Clean analysis counts do not establish target coverage or provenance.
  It is not a replacement for the unchanged strict Mythril runner or a release-gate exception.
- No contract source, D-1 proof-design, workflow trigger, approval policy, action pin or runner selection changes
  were extracted. The earlier bypassable D-1 ambiguity guard was not included.
- The RPC fetch options overlap #222 and should resolve to the same `omit` / `no-referrer` / `no-store` behavior.
  Preserve the coordinator's other RPC changes when merging the four option/comment lines.
- The static server remains a local audit helper. This does not qualify a deployed server.
- HTTP download flags and script syntax were checked; container images were not rebuilt and tool downloads were
  not repeated in this lane.
- Actual Mythril/Slither/Echidna campaigns, complete browser profiles, release reproducibility, final web
  typecheck/lint, hosted checks, public-testnet, Tor and external-wallet acceptance remain coordinator/release gates.
- This lane does not authorize merging a failing or unqualified combined candidate, deployment or publication.
