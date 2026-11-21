# Generation 3 independent QA repair review

## Verdict

**No source blocker found. Approve `95f28a04` and follow-up `45a5dcf7` for integration, with hosted lean and full browser acceptance still required on the final combined source.** This review does not claim local browser execution, full-suite acceptance, or beta completion.

The manifest change fixes a reproduced stale-result ownership defect without increasing the expected browser request count. The three browser fixture repairs agree with the existing production semantics. Their request, download, suspension, and recovery assertions remain substantive.

## Exact source and isolation

- Baseline PR head: `c993bb2340942c85dbf10303b61f69a91c4944e0`.
- Initial implementation reviewed: `95f28a0411a01dc1d4d44c836e258ab214a07bbe`.
- Final implementation reviewed: `45a5dcf7f3a37a44e252db6f2b902aeb02981206`.
- Reviewer: fresh Generation 3 agent `qa_review_gen3`, working independently in `GhostPay-qa-review-gen3`, branch `review/ghostpay-qa-gen3-20261119`.
- Ownership claim: `20d937d4c95e47e54b2e441ab10805f169d304be`.
- The follow-up was cherry-picked into the review checkout as `18bc072c`; this is a review-local copy of `45a5dcf7`, not another product fix.
- Runtime: Node `v22.23.4`; existing installed/compiled dependency graph reused through a `node_modules` symlink to the root checkout. Original Vite/Vitest configuration and one worker used. No timeout, coverage threshold, dependency, or browser configuration was changed.

The controlled RED experiment substitutes only the original baseline `Disclosure.tsx` into the review checkout while retaining the new tests and the same dependency graph. It is a runtime-source comparison, not a claim that the whole baseline repository was rebuilt. The fixed file was restored before subsequent work.

The baseline GitHub execution commit `5c1ff468` and PR head `c993bb23` independently resolve to the same Git tree, `dc2e653671506663df8e077153b06787929d37af`. This establishes source equivalence for the root agent's hosted baseline evidence; this reviewer did not independently retrieve or execute those hosted jobs.

Exact full SHAs, source SHA-256 values, Git blobs, command arrays, and the reviewed small lint repair are in [the source receipt](evidence/source-receipt.json). The baseline/fixed runtime hashes and command outcomes are also in [the RED/GREEN receipt](evidence/manifest-receipt.json).

## Independent execution results

| Execution | Result | What it establishes |
| --- | --- | --- |
| New component and Pay cases with unchanged baseline hook | 3 failed, 1 passed | The same-chain restart and same-chain service replacement expose `loaded` instead of `loading`; invoice replacement creates a third RPC client before the current manifest resolves. |
| The identical four cases with the fixed hook | 4 passed | The three reproduced failures are repaired; existing late-cancellation behavior remains correct. |
| Existing `Pay.test.tsx` in the bounded review batch | 66 passed | Existing Pay behavior remains passing with the reviewed hook. |
| Four reviewer lifecycle probes plus the four supplied cases, after correcting the reviewer helper | 8 passed | Stable rerenders, service-identity reuse, out-of-order success/failure, StrictMode replay, and unmount/remount stay bounded to the active generation. |
| `tsc --noEmit -p tsconfig.json` in `apps/web` after applying `45a5dcf7` | Exit 0 | The reviewed application, browser fixtures, and temporary probe typecheck using the repository configuration. |

**Do not describe all four supplied cases as baseline failures.** The late result from a cancelled same-chain load already passed on the old hook. The independently reproduced baseline result is **3 RED / 1 existing PASS**, followed by **4 GREEN**.

The first bounded batch recorded 73 passes and one failure in the reviewer's own new probe. Its view helper used `chainId = 84532`, so passing `undefined` invoked the default and incorrectly started a load. That was a test-harness error, not a product defect. Removing the default and making the argument explicit produced the later 8/8 passing rerun. Both the original failure report and final result are retained; the 66 existing Pay cases passed in that original batch. The union is 74 distinct passing cases across these executions, not a claim of a single successful 74-case batch.

Logs and machine-readable results:

- [Baseline RED](evidence/manifest-red.json), [baseline log](evidence/manifest-red.log).
- [Fixed GREEN](evidence/manifest-green.json), [fixed log](evidence/manifest-green.log).
- [First probe batch including the reviewer helper failure and 66 passing Pay cases](evidence/review-probe-first-run.json), [batch log](evidence/review-probe-first-run.log).
- [Corrected lifecycle GREEN](evidence/lifecycle-green.json), [lifecycle log](evidence/lifecycle-green.log).
- [Typecheck log](evidence/typecheck.log).
- [Exact final reviewer probe source](evidence/Disclosure.gen3-review.test.tsx.txt). It was run temporarily at `apps/web/src/components/Disclosure.gen3-review.test.tsx` and removed afterward; the product test tree was not expanded by this review.

## Manifest lifecycle assessment

The old result was keyed only by chain ID. Once a loaded invoice left the parsed-chain state and re-entered the same chain, the prior result became visible before the new loader completed. `Pay` could therefore start provisional preflight work against the old result. Replacing the services object at the same chain had the same stale-display boundary.

The new scope object has the same dependency identity as the effect: chain ID plus services object. State carries that exact scope. A dependency transition hides the old result during render, before effect cleanup or an asynchronous loader answer can arrive. Re-entering the original chain or services object after an intervening selection creates a new scope and cannot revive the prior result. The effect's `live` guard also rejects completions from retired effects.

The independent probes checked these properties:

1. An undefined chain does not start a load. Ordinary rerenders with the same chain and services keep the loaded value and do not reload.
2. Services A to B to A starts a fresh A generation. A retired success and a retired rejection cannot overwrite the current result.
3. React StrictMode setup/cleanup replay can invoke the loader twice, but only the live effect supplies the displayed result; a subsequent stable rerender does not reload.
4. A completion belonging to an unmounted component cannot supply a new mount using the same chain and services.

The service rejection/synchronous-throw conversion remains inside the existing promise chain and retains the fixed public error text. A memo cache replacement would discard reuse and require a new result; it does not make a retired scope current. Services identity remains the dependency contract, as before this change.

## Browser fixture assessment

### ABI balance response

The held old balance and the replacement balance now use `encodeAbiParameters` for the `uint256` return value of `balanceOf`. The `eth_chainId` result remains a JSON-RPC quantity. This repairs the mock response representation while retaining the old-response suppression, explicit replacement click, exactly one replacement balance read, and absence of raw/unexpected requests.

The invoice-replacement browser assertion still requires **two** `eth_chainId` requests. No request-count expectation was raised to accommodate the extra request defect.

### Network profile refusal

The Settings fixture now checks the refusal text actually emitted by the action authority, rather than text from an adapter that never receives the refused action. It separately verifies the stored own-node acknowledgement changes from false to true. Request counts remain zero for invalid storage, one after the initial explicit successful connection check, unchanged for both refused own-node attempts, and two only after explicitly restoring direct mode and testing again. The credential-export exclusion checks remain.

### Idle lock and explicit recovery

The application already forces the Seller keys view while the retained session is suspended, disables other navigation, removes the payment-details/export inputs, and keeps the sole unverified backup copy available. The revised fixture asserts those behaviors and retains the no-download and no-success-notice checks after the held encryption completes.

Backup verification while suspended must leave scan authority disabled. The fixture then explicitly wipes, imports the verified backup, verifies the original public meta-address, and scans again before the positive export control. Clicking Seller keys before the wipe also makes the selected view explicit, so ending the suspension does not return to the old scan view unexpectedly. Credential fields must be empty in the newly opened details.

The follow-up `45a5dcf7` addresses the encrypted checkpoint restored by that same backup. Only the new recovery control passes `fromStart: true`. The helper waits until Start scan is enabled; production `Scan` disables that control until its current private scope/checkpoint is ready. It then unchecks Resume from checkpoint if present. Existing callers retain their defaults, and the exact assertion of one announcement checked and one payment found is unchanged. No production scan behavior changes.

The existing 240-second export-spec timeout, five-second post-release observation, and browser configuration remain unchanged. The new recovery operations use explicit bounded completion assertions; this source review cannot establish their timing under hosted Chromium.

## Additional narrow lint correction

Read-only review of root commit `b2711401af5f3786ef1685bb8e1ebd98b29c9e7d` found only removal of the unused `_index` parameter from the crafted non-string `charCodeAt` fixture. The object remains non-string, retains length two and a callable method returning `0x51`, and is still checked for `Base64UrlError`. The decoder rejects the non-string object before calling that method. This edit does not alter the test's behavior or production code. No separate test execution for that commit is claimed here.

## Remaining acceptance gate

Run both hosted lean and full browser suites on the final combined head, preserving all current assertions and timeouts. Specifically inspect the invoice replacement request count, cross-tab balance replacement, invalid/unacknowledged/own-node refusal sequence, and suspended-backup recovery export. Local Chromium cannot start in the supplied environment because of the previously observed kernel socket restriction, so source review and component tests cannot substitute for those browser results.

No remote branch, PR, or workflow was changed by this reviewer. No additional product fix was needed.
