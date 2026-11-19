# Historical multichain compatibility recovery

Implementation `8c81265de08b821e6062d02baa26ba3b80571f9f`, base `736f1056537c79dbb0d2be3cd9cf071d0470bb24`. Branch `integration/ghostpay-multichain-recovery-20261119`. Source: eight selected PR211 G5 commits, each retained by `cherry-pick -x`; `selection.json` pins every original/destination commit and all34 source/test/vector/documentation blobs. Every selected blob exactly matches original PR211 head a92658b1. The only additional pre-implementation path is the ownership claim.

## Selected behavior

The existing CLI libraries used formats different from the existing web libraries. Solana now accepts and produces the ADR0017 `st:sol:` cluster-bound meta-address, its shared-point/tweak/view-tag derivation and the `gpst1:` base58 memo. Strict canonical prime-order point validation, non-identity/key-reuse refusal and adapter cluster checks remain. The existing raw-scalar signing implementation is unchanged.

TRON now accepts and produces the existing ADR0019 `st:trx:0x` meta-address and GPT1 memo using core scheme1. The old EVM-tagged TRON format is rejected explicitly. Its structural payment builder cannot bind that memo into `raw_data.data`, so `build()` throws `MEMO_NOT_BOUND` before randomness or derivation; a payable request without the recipient-discovery memo is no longer returned. This does not enable a new transaction encoder.

The CLI reports the decoded Solana cluster, rejects mainnet recipients and preserves fixed, input-free `LEGACY_META_ADDRESS` errors. Existing web behavior, dependencies, infrastructure, protocol activation and deployment gates are unchanged.

## Actual validation

| Selection | Files | Passed | Failures / skips |
|---|---:|---:|---:|
| Full chain-solana source tests |11|111|0 /0|
| Full chain-tron source tests |6|54|0 /0|
| CLI chain-commands |1|45|0 /0|
| Total |18|210|0 /0|

All ran serially with one worker and a768MB Node heap, Node v24.22.3, Vitest5.1.0 and Vite8.3.8. The exact command was `NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run --config /workspace/scratch/9b4050d15a9b/audit-data/history-g5.vitest.config.mts` in each library directory; CLI additionally selected `src/chain-commands.test.ts`. The receipt copies that configuration and pins each complete log hash. All workspace imports were aliased to this worktree's source, avoiding stale compiled siblings.

Dependencies were borrowed from the coordinator's existing install; eight relevant versions match the unchanged lock. This is not a clean-install or built-export qualification. Coverage was disabled for these bounded runs; repository thresholds were not changed. Full CLI, complete typecheck/lint/build, native chain execution, browsers and final exact-head hosted gates are not qualified by this receipt. No fresh G5 baseline RED execution is claimed.

Independent source review at exact implementation8c81265d found no blocking defect, verified all34 original blobs and14 unchanged boundary files, and inspected actual ADR formulas, memo codecs, strict rejection and cross-implementation assertions. The copied review distinguishes source inspection from these author-run tests.

The combined master remains responsible for complete source/type/build/browser/native qualification. All original branches remain untouched.
