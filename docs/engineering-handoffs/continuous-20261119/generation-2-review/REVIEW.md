# Independent generation 2 review

Repository: https://github.com/djshellshoxxx/GhostPay

## Verdict and scope

**No introduced product blocker found in the reviewed changes.** The shared export-operation expiry repair and five narrowly extracted fixes pass this independent review. This is scoped source and runtime evidence; it is not whole-repository acceptance, independent external security certification, or release permission.

The reviewer did not implement the security repair or five production fixes. Review used a separate worktree and branch, `review/ghostpay-continuous-gen2-20261119`. Original candidate: `c993bb2340942c85dbf10303b61f69a91c4944e0`. Reviewed security repair: `84f39e41ef132af88b4ca3280818ed701026d412`; its test-first source is `7abf4e0091730dad343e3ee9c834f0ce85c8d56b`. Reviewed five-fix/lint integration: `a080c2db54d79a280def1f1ed365637d16180e44`.

## Export expiry: independently reproduced and verified

The original `useExportOperation.current` accepted a promise result after the session deadline when the browser lock event had not yet run. The regression executes real vault reauthentication, account-code verification and private-key derivation; only the final promise handoff is delayed past expiry. On original product source, the UI initiates one raw-key download instead of rejecting the obsolete result. This is a local session-authority defect; this review does not assert remote exploitation or theft.

The repair captures the existing session revision guard at operation start and invokes its synchronous deadline check before accepting any result. It checks the same pending operation again after the callback because session revocation can synchronously notify/reset the panel. A guard failure aborts and resets a still-current operation; a replacement created during that callback survives. The fix changes neither cryptography nor export formats and adds no network activity or dependencies.

| Independent execution | Actual result |
| --- | --- |
| Same committed four-case regression, original product blob `bc18fbcad9d3aa88f4b05aee039f2ad04efeab55` | 1 passed, 3 failed, 0 skipped; exit 1 |
| Same regression, fixed product blob `4c62a819ba7bccbd6af6698d4a6bed0f039c4e5a` | 4 passed, 0 failed/skipped; exit 0 |
| Existing Payment, Recovery, Verification, Selection, Download tests plus original expiry regression and three reviewer cases | 7 files, 62 passed, 0 failed/skipped; exit 0 |
| Final reviewer fixture after a local `prefer-const` correction | 3 passed, 0 failed/skipped; exit 0 |
| Typed ESLint for shared hook, original expiry tests and final reviewer tests | exit 0; no diagnostics |

The 62-case run used the first equivalent reviewer fixture spelling. A test-only `prefer-const` diagnostic was corrected by storing its reentrant operation reference in a constant holder; the final three cases were rerun successfully. Product source did not change. Counts overlap and must not be summed.

The three added reviewer cases exercise concrete boundaries not covered by the original four-case file:

- A silent `clearSession(false)` revision change invalidates the pending result even when no subscription notified the panel; reset occurs exactly once.
- A replacement operation created reentrantly during synchronous expiry is not accidentally aborted by the obsolete operation's catch path.
- A failure in the final deadline observer rejects the result and resets the panel without escaping through `current`.

The fresh empty-session control and existing recovery tests establish that opening an external backup still works without previously loaded seller keys. This review also inspected the real AppShell deadline callback, session revision handling, final raw/encrypted download boundaries and backup verification callers. No additional product change was needed.

## Five extracted fixes and lint repair

Independent Git comparisons confirm all ten extracted production/test blobs match their upstream sources exactly: PRs #280, #281, #282, #285 and #289. See `extraction-blobs.json`. They are absent from the original candidate's source, rather than merely lacking commit ancestry.

- Build-profile resolution now requires recognized values before enabling the full profile; lean builds cannot be widened.
- The displayed 30-day announcement count is marked partial unless the available 30-day window was covered, including genesis clamping and an unfinished scan head.
- Saved merchant pins reuse strict JSON parsing, reject ambiguous member names and preserve the unavailable state on malformed storage rather than treating it as absent.
- QR payload/frame lookups require own properties before assigning a handling category; existing secret/bearer precedence remains intact.
- Base64url decoding rejects non-string runtime inputs with its fixed public error before traversal; valid byte formats are unchanged.

Independent replay of the exact `a080c2db` source/test overlay produced **73/73 web tests** and **29/29 invoice-schema tests**, with zero failures/skips. The invoice selection includes the canonical-array fixtures. Replacing their two intentional `delete value[1]` expressions with `Reflect.deleteProperty(value, '1')` removes the original lint errors while retaining the same configurable array-property deletion, getter behavior and all assertions.

The upstream merchant pin test's duplicated full-length signer values also hit the existing length bound; its duplicate `v` case is the meaningful original-reader regression. General duplicate-name rejection is provided by the existing strict parser and its tests. This does not invalidate the source correction or the reproduced baseline failure, but the evidence must not be described as three independently demonstrated reader vulnerabilities.

## Environment and evidence limits

Commands ran with Node 22.23.4, the original repository Vitest configuration, coverage disabled for the focused selection, and `--maxWorkers=1`. The independent worktree symlinked the root's completed clean dependency install. Vite loaded the worktree's source aliases; unchanged dependent workspace libraries resolved through the shared built `dist`. No package, assertion, test timeout, coverage threshold or runtime configuration was changed.

Source hashes, tool identity, counts and compressed raw output hashes are in `REVIEW_MANIFEST.json`; exact reproduction commands and source blobs are in `expiry-receipts.json` and `extraction-receipts.json`. These checks do not qualify the full workspace, full coverage, browser journeys, native analyzers, deployment artifact, external review or actual wallet/testnet operation.

## Successor handoff

1. Integrate the reviewed security product and original test commits through the coordinator; preserve the original claims additively.
2. Selectively retain this review's added `StealthExportCommon.review.test.tsx` and evidence. The reviewer made no product edits or remote mutations.
3. Recheck combined source identities, then complete the original full lint/typecheck/coverage/build and applicable hosted checks. The coordinator and QA worker own the remaining browser-fixture repairs.
4. Keep browser or analyzer failures explicit. Successful focused tests cannot replace those gates or the required independent external review.
5. Have a fresh verifier inspect any new combined-source changes and final CI receipts before promotion. Do not merge historical branches solely because their commit hashes differ.
