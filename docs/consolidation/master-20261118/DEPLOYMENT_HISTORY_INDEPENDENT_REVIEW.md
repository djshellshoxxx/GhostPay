# Deployment guard and historical adapter recovery: independent review

Date: 2026-11-19. Reviewer: independent CI/release reviewer. No tests, installs, deployments or remote mutations were performed by this review.

## PR #217 deployment-script guard

Reviewed source `9e5cc3789b7b8a3c550ed2680304ab6245ec6676`, integrated by `f1b05bd6f4aa119efcc511649146a12be6567519`. No blocking source defect found in the scoped guard.

For a nonzero flat fee, DeployPolicy requires FEE_TOKEN_FREEZE_ACK to parse as the same checksum-validated fee-token address. This check precedes startBroadcast and constructor calls. Existing recipient, chain, fee-cap, token-code and post-deployment immutable checks remain. Zero fee does not require the acknowledgment; it still receives the previously required configuration checks. No production contract source changed.

The regression diff checks missing acknowledgment, another token, lowercase acknowledgment, valid equal acknowledgment and zero fee without acknowledgment. The two gas-snapshot updates concern deployment-script tests. No Foundry result is claimed from this source review.

The acknowledgment records an operator assertion; it does not inspect or prove the token has no upgrade, pause, blacklist or fee controls, and it does not eliminate the documented N1 counterfactual-funds risk. The shell preflight compares addresses case-insensitively; the Forge script is stricter about EIP-55 spelling and remains the fail-closed authority. Neither file is executed by this review.

| File | Reviewed blob |
|---|---|
| packages/contracts/script/DeployPolicy.s.sol | c20b4f85726f3634d91be71372cdcafda778ce4b |
| packages/contracts/scripts/pre-deploy-check.sh | ab298293d420a1075e11908649108db18cf75ccb |

## Historical adapter safeguard recovery

Reviewed final handoff head `b1a2005472132c4787f1416386c629a399350151` and implementation `cd885251980fc9bd8c9dcb7fe1a380d8fc3475f3`, based on main after #241, `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`. No blocking source defect found in the recovered three-file runtime diff.

- Manifest date validation now checks that the written calendar year/month/day actually exist, after the existing RFC-shaped syntax and parse check. Constructing with leap year 2000 and then setting the full year preserves the special handling needed for years 0 through 99 and rejects nonleap February 29 and impossible month/day rollover.
- A non-finite requested retry count becomes zero. Finite values retain their prior 0..5 clamp. A bounded hostile transport makes the NaN regression fail at 51 calls instead of hanging the suite if the old bug returns.
- TRON block-range reading requires exactly the requested inclusive count and the expected number at every index. Empty, missing, short, duplicated and unordered in-range responses cannot silently advance scanning past unexamined blocks. Existing parsing and PR #241 transport protections are retained.
- quote.ts is byte-identical to the implementation base, blob `5e9d933b4ea06e3944c514057e7014b9eb28fa3c`. Its stricter existing integer 0..30 price-decimal guard remains; the redundant weaker historical addition was removed and the extreme-input regression retained.

| Runtime file | Reviewed blob |
|---|---|
| packages/chain-adapters/src/deployments.ts | 1fbaa3af3f200622596bd552d7af6e330d1c2fb8 |
| packages/chain-adapters/src/rpc.ts | 2d631ed4a13c2794805ddf7162de75264bb5918c |
| packages/tron-adapter/src/rpc.ts | d0a921bb15848c23db3338fa1c96e18146cbda88 |

## Evidence inspection

All seven local log sizes and SHA-256 digests match HISTORICAL_ADAPTER_VALIDATION.json at b1a20054. The reviewer read the actual baseline and passing logs; the tests were run by the history author, not rerun by this reviewer.

| Evidence | Observed result |
|---|---|
| Baseline chain regression selection | 2 failed, 120 passed: impossible calendar date accepted and NaN retries made 51 calls |
| Baseline TRON scan selection | 2 failed, 25 passed: missing interior block and missing block list resolved empty instead of failing |
| Full chain-adapters package | 26 files passed; 552 tests passed, 22 existing skips; coverage 97.35 / 96.48 / 99.01 / 98.93 percent |
| Full TRON adapter package | 9 files, 104 tests passed; coverage 96.98 / 93.36 / 98.92 / 99.08 percent |
| Typecheck / lint / affected-package build | Typecheck attempt killed137 without a diagnostic; lint and final affected-package build not run; no pass asserted |
| Dependencies | Author's separate unchanged-lockfile scoped install, Vitest5.0.5, Node24.22.3; distinct from the broader candidate's dependency tree |

This source review and the author-run package coverage receipts support focused integration. They do not replace final exact-head CI on current main or close the independently retained Mythril release blocker.
