# Combined GhostPay source review

Reviewed 2026-11-19 by the independent CI/release reviewer, separate from the integration and recovery authors. Candidate: `435c6e6bca463f83b6c55a2063f8c18c546c3c22`, tree `731eaef820b1ef13488c59a819d41f808a71d2d0`. Its parents are `2e54b3d504de187123ff561ee048a50b3bb84025` and `b05cec848c843cd00a3811e4d20428584ac89d21`.

## Result and boundary

No blocking source finding was found in the reviewed combined recovery, runtime, policy validation, adapter and integration-repair deltas. This is an incremental source review and preservation check, not a blanket audit or a CI pass. The review covers security, privacy, crypto/custody and correctness as described below. The reviewer did not run new builds, installs or heavy tests, modify the integration worktree, publish, deploy or merge.

The 19 untracked census documents mentioned by the integration author are outside the pinned commit and are not included in this source result. Changes after this SHA need their own review and exact-head qualification.

## Reviewed-source preservation

`combined-reviewed-blobs.json` records 33 comparisons against the earlier independent reviews. Thirty-two blobs match exactly. The remaining file, `packages/chain-adapters/src/rpc.ts`, combines the reviewed finite-retry repair with the candidate's existing `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and `cache: 'no-store'` fetch options. The difference from the reviewed historical file is only those options and their explanatory comment. The current blob is `1c8d1edc486c70b7ea7fee96ec62c57af00e421e`; the NaN/infinite retry guard remains intact.

The exact matches cover all eleven independently reviewed runtime/relayer blobs, all eleven policy source/test/documentation blobs, the deployment guard scripts, the calendar and TRON runtime repairs, the three recovery event/import/verification files, and the three CodeQL source/test files. The standalone source reviews remain the detailed receipts:

- `runtime-independent-source-review.md`, pinned to `d80aa890c6492247cccbe13ac0621f1242749254`.
- `policy-independent-source-review.md`, pinned to `63e67ff403c5daf45dbec5bf500a24ac386b6342`.
- `recovery-independent-source-review.md`, pinned to the scoped recovery source.
- `deployment-and-history-source-review.md`, covering #217 and `b1a2005472132c4787f1416386c629a399350151`.
- The tracked CodeQL reconciliation handoff, implementation `f65d547c4d514e339c6579600cc1cd22bbeb47cc`.

## Security and privacy

The CLI parser now lets the selected command's option specification determine value positions. A forged `--help` or `--version` after a value-taking option fails as a missing value instead of short-circuiting signature/payment verification; `-h` remains a literal value in that position. `--` terminates global-switch interpretation. The source regressions cover every registered value-taking option as well as forged webhook, invoice and receipt verification inputs, genuine help/version requests, and unchanged output files on parse rejection.

CLI reconciliation requires the selected proposal's record ID to occur in the current run's freshly verified observations before exporting a confirmable proposal. Displayed records receive individual `currentChainVerified` flags, and the aggregate flag is false for empty or mixed/stored-only results. Existing encrypted-input, observation-byte, provider/manifest, expiry and canonical-context rechecks remain in the confirm path. The stored-only regression verifies both refusal to write a proposal and honest display of stale observations. These changes do not make a stored record current merely because another record was verified.

Malformed local observation quantities are checked against bounded canonical hex syntax before RPC parsing; announcement-validation failures become local `INVALID_LOG`, with zero network calls asserted in the regression sources. File error messages no longer interpolate raw pasted links or documents. Plain bounded basenames remain available, while terminal output escapes controls, bidi and separator characters. No new network operation is introduced by these CLI changes.

The relayer's reviewed reservation, canonical signature, limiter, lane and quote-breaker logic is byte-identical after integration. The corrected invalid-signature regression reaches recovery with canonical `v` and invalid zero `r/s`, so its following valid request meaningfully exercises release after reservation. The candidate retains the existing privacy config union, bounded padded-body decoder, allowlisted logging and client-side `client_queue_full` classification.

The exact dependency-closure test remains a finite equality assertion. The integration repair records the narrow existing `DestLedger`/`fundingGuard`, `padBody`, and `stripPad` imports separately from the earlier lean milestone; the pre-existing pending-owner list remains distinct. It does not grant release approval to all exported APIs. Source review confirms the importer locations and retained session-only destination history. Existing bundle and egress checks still need to qualify the complete built artifact.

The hostile-text browser repair accepts only the expected `beforeunload` custody dialog, requires exactly one such warning, and still refuses/records script-created dialogs. Inert DOM and marker assertions remain. The no-call cancellation fixture returns a rejected promise explicitly; calling it still fails the test. Neither change weakens the underlying tested behavior.

## Crypto and custody

The policy signer continues to reconstruct the fixed policy typed-data/domain digest into local values before revealing a secret, compare both digest implementations and the supplied digest, and wipe the secret copy in `finally`. Recovered leaf validation binds token, limit and window to the actual proof leaf; canonical router decoding and prepare/final-send comparison bind account, owner, policy, R and full metadata. The reviewed policy blobs are unchanged in the combined tree. This is not a change to cryptographic primitives, scheme identifiers or serialized signing formats.

Recovery event handling still checks live session/custody state at unload time. The reviewed import and verification fixes compare file byte size with the canonical ASCII text size, preventing BOM-normalized text from being treated as the exact saved export. No new custody storage or release authority is introduced by the combination.

The deployment guard remains before `startBroadcast` for nonzero fees and binds the explicit acknowledgment to the configured token. It records an operator statement, not proof of token immutability. Its shell preflight remains less strict about address capitalization than the authoritative Forge parser. PR #246 separately offers an exact-shape/newline hardening discussed in its scope review; it is not present in this candidate.

## Correctness and retained safeguards

The integrated calendar validator preserves years 0 through 99 while rejecting impossible calendar dates. Non-finite retries become zero; finite retry clamping is unchanged. TRON requires the full inclusive requested range with the correct height at each index. The stricter pre-existing quote-decimal validation is retained. The devnet relayer fee recipient now uses the manifest's configured recipient; the corresponding quote/payment assertions were not removed.

The PIR endpoint normalization remains the reviewed terminal-slash scan, preserving interior slashes and avoiding regex retry over attacker-controlled runs. The Settings regression saves the synthetic sensitive-looking URL through the actual UI, asserts exact persisted bytes, clears only session state, and remounts to exercise the saved-settings warning. Its boundary remains present; the scanner was not suppressed or excluded.

## Validation and open gates

This review read source and existing receipts only. The earlier PIR coverage result and the history author's chain-adapter/TRON coverage logs are valid for their recorded source/dependency contexts, not substitutes for a new combined run. Local web/library installation and build attempts ended with exit 137; Settings, combined typecheck/lint, browser profiles, full matrix and security analysis remain subject to hosted exact-head qualification.

Comparing PR #238 source `198aa5baff22272453733a0f3dcfcac0e0994eec` with this candidate shows no changes in `.github/workflows`, the root package/lock files, the examined lint/test configuration paths, or `packages/core-crypto/src`. Existing security gates remain required. The historical strict Mythril run has eleven findings and remains failed; this source review neither dismisses them nor turns a path-filtered absence into a pass. The current focused PR #242 must be evaluated independently from this broader candidate.

Sources: local Git objects at the pinned SHAs; [PR #238](https://github.com/djshellshoxxx/GhostPay/pull/238), [PR #217](https://github.com/djshellshoxxx/GhostPay/pull/217), and the source/validation receipts named above.
