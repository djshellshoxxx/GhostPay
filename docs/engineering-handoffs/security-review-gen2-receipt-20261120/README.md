# Fresh independent receipt-status review — generation 2

## Decision and exact scope

No blocking source issue was found in the three-line runtime repair at `f77fe8572f54669098ee8cb5d47a6313ef72e37b`. The original wallet, payment-execution and payment-acceptance files completed in the independent configured test run, including all eight new malformed-status regressions. Independent completion of the whole selected UI test file remains blocked by killed test workers. This is bounded internal review, not full-suite qualification or release approval.

Reviewer: `/root/security_review_gen2`. Branch: `review/ghostpay-receipt-status-gen2-20261120`. The implementing worker remains the owner of `fix/ghostpay-receipt-status-20261120`; none of its source was edited by this reviewer. The preceding regression-only baseline is `b416ea615d40f6375c868b05e8af0683cf1e10fd`. Exact blobs and content hashes are recorded in `source-pins.json`.

## Standards

The implementation satisfies the repository's minimal-change rule: it validates the already parsed status, uses the existing safe `UserFacingError` descriptor, and retains the current receipt and post-broadcast flow. No new dependency, catalog key, persistent state, network call, control policy, configuration or security gate is introduced. Existing fixtures and valid success/failure controls remain. No documented-standard violation or useful refactoring issue was established in this diff.

## Spec and security review

[EIP-658](https://eips.ethereum.org/EIPS/eip-658) defines the receipt status as zero for failure and one for success. The previous code labeled every parseable quantity except one as a revert. The repair admits exactly `0n` and `1n`; other parsed values raise the existing unexpected-receipt-shape error. It therefore treats malformed evidence as unverified instead of producing a definite-looking revert.

The hash-format and case-insensitive transaction-hash correlation added by #298 execute before the new range check. The destination check, block-number parser, bounded polling and valid zero/one behavior remain unchanged. The explicitly supported null receipt destination remains supported; this narrow repair does not redefine that compatibility rule.

The five wallet regressions exercise several unsupported values, including a 256-bit maximum value. The three payment-execution regressions exercise the real consumer boundary: the original broadcast hash remains available, the journal stays `submitted`, the error is `PostBroadcastError` with `verification-incomplete`, only one transaction/receipt lookup occurs, and another wallet send is refused. Existing valid-status, receipt-hash, mismatch, null-destination and post-broadcast tests remain present.

This is a low-severity correctness/validation repair. It does not authenticate a dishonest RPC, prove finality, establish protection against theft, or complete a broad transaction-security audit.

## Independently executed results

Environment: Node24.22.3, repository Vitest5.1.0; original configuration and assertions unchanged. Commands use one worker, no file parallelism, a768MiB heap and no coverage collection for the focused selection. Complete command/results/log hashes are in `verification.json`.

| Run | Actual result | Interpretation |
| --- | --- | --- |
| Wallet, payExec, payExec.acceptance and Pay UI selection | Exit1; three files completed;158 of188 tests reported passing; one worker error | `Pay.test.tsx` was killed with SIGKILL. The three complete files contain122 cases;36 additional Pay cases passed before interruption. The full selection did not pass. |
| Separate retry of `Pay.test.tsx` only | Exit1;9 of66 cases reported passing; worker SIGKILL | Incomplete and overlapping. Do not add the retry count to the first run. No failing assertion was reported. |

The original whole Pay file has66 selected cases, not30;30 was the number left unfinished in the initial188-case selection. The killed worker's exact cause was not independently established. No repeated full selection, pool/configuration change, timeout increase, assertion deletion or gate waiver was used. Further attempts stopped at the coordinator's bounded-review handoff.

The implementing worker separately reports an original baseline of8 failures/112 controls, followed by188/188 across the four repaired suites. Those are the author's results, not independent results from this reviewer. This review does not replace its own incomplete UI execution with the author's pass.

External dependency files are shared from this reviewer's private, unchanged locked installation. Workspace links resolve locally into this receipt review tree. Existing output was copied for64 packages whose runtime/package inputs match the frozen source; test-only differences are recorded. QR-exchange output was not copied because its runtime changed; the original web Vite configuration resolves that package directly to the local source. `dependency-cache.json` records provenance. No clean reinstall, fresh library build, full project typing, original coverage gate, browser execution or hosted qualification is claimed.

## Remaining issue and fresh successor handoff

The bug-hunt worker separately reported and reproduced acceptance of array-shaped transaction hash/input/fallback-data fields by `parseSeenTx` coercion. That is a distinct unfixed issue at this reviewed source and is assigned to a fresh worker. This review does not approve or silently include a repair for it.

A fresh final reviewer should:

1. Review the exact integrated source after the separately owned array-field repair, retaining this receipt-status guard and all hash/journal/no-repeat controls. Independently examine the new tests and any consumer behavior changes.
2. Complete the original66-case Pay UI file and required combined suites in an execution environment that can finish them; retain both SIGKILL results until superseded by a real source-pinned pass.
3. Resolve whole-project typing, browser/hosted qualification and all existing security/release gates without suppressions or weakened assertions.
4. Keep the new quick-hide feature's frozen masking dependency and active ownership reconciliation separate from this receipt branch.

No remote write, shared-branch mutation, deployment, release, fee or contract change occurred in this review.
