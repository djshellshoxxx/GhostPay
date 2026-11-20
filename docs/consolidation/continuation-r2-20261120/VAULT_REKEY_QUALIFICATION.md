# Vault rekey session revocation qualification

PR [#328](https://github.com/djshellshoxxx/GhostPay/pull/328) passed the original complete `@ghostpay/ux-vault` test/coverage, typecheck, lint and build gates on unchanged source. Independent source review approved the bounded change. Hosted checks and coordinated integration remain separate requirements.

## Source and behavior

Qualified source: `81598d93dd82cc440526c866d42b55be0657895b`, tree `09a1504b468d7943ff5bdacd1a8c009d3681ce64`, based on main `aa3df1cb37274fae73af0ca957183c15c51b62d3`. Runtime fix: `f7bc60a1b704392e70fe5918766f70a4ab53fb78`. Preceding regression: `68c77b7f9f108d54de0dd1592f432bb27603838e`.

An in-flight password change captures its live key context before awaiting. After persistence, it installs the fresh context only while the same session still owns the operation. Locking the original session remains effective even when an already-started durable rekey finishes. A separate explicit unlock with the replacement password succeeds. The existing positive test also checks subsequent mutation and use of the new password.

Persistence, password validation, encryption, serial ordering and error handling retain their original behavior. Locking does not cancel an already-started write or guarantee erasure of every temporary asynchronous reference.

## Executed qualification

| Gate | Actual result |
| --- | --- |
| Tests-only regression | One expected failure: delayed completion incorrectly made the old session report unlocked |
| Complete original package tests with coverage | **285 passed, 0 failed, 0 skipped, 8 complete files** |
| Statements / branches / functions / lines | **96.37% / 93.31% / 99.68% / 98.66%** |
| Unchanged thresholds | 95% / 90% / 95% / 95% |
| Original package typecheck | Passed, 4.427 seconds |
| Original package lint | Passed, 5.327 seconds |
| Original package build | Passed, 1.229 seconds |
| Independent source/test review | Approved; no blocking findings in the three-path change |

Coverage took 144.092 seconds. [VAULT_REKEY_QUALIFICATION.json](VAULT_REKEY_QUALIFICATION.json) retains commands, timestamps, complete results, raw logs and independent review losslessly. The eight-file count uses complete file results; reporter suite totals include nested suites. The RED regression is included in the 285 GREEN cases and is not an additional passing test.

The reviewer inspected context identity, locking, the write queue, persistence, import/mutation guards and positive/negative tests. The reviewer performed source checks only; the coordinator executed the runtime gates.

## Provenance and limits

Execution used Node 24.22.3 and npm 11.19.1. Third-party dependencies were reused from Sweep after matching lockfile, manifests and relevant configuration; this was not a fresh install. Qualification used its own workspace libraries rebuilt at `bfbbdab5b9de8cd0b8b476dfb4c98b1613f9c272`, with target-identical core-crypto, invoice-schema and chain-adapters sources. Vitest also aliases those sources directly.

An initial overbroad source-equality check against stronger Sweep sources stopped before tests. Preparation then verified the actual dependency contract: matching third-party metadata and target-identical workspace libraries. This preparation stop, expected RED and successful gates are retained. Source, assertions, thresholds, configuration and skips were unchanged for qualification.

This report covers original ux-vault package gates. Full web tests, browser execution, hosted completion, main integration, release and deployment are not claimed. The source PR remains frozen; this evidence branch changes documentation only.

## Artifact verification

Each raw artifact includes its original byte count and SHA-256. Small artifacts use UTF-8; the large complete GREEN JSON uses `gzip+base64`. Decode base64 and decompress gzip before checking length and hash. Every embedded payload was compared with its original bytes during preparation. Source and configuration Git blob IDs are also recorded.
