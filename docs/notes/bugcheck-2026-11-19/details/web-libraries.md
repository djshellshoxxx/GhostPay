# Web library findings and existing corrections

Both review chunks are complete in the aggregate: 58 main and 70 integration production library records. The continuation covered every previously pending range. This combines source evidence; executed validation is recorded centrally. The coordinator independently reviewed the component binding for sweep review invalidation.

## Confirmed main defects, already fixed in integration

### WL-F1 — Receipt polling does not bind the response to the requested transaction

- **Affected source:** main `apps/web/src/lib/wallet.ts:478–495`.
- **Prerequisite:** the configured RPC returns a receipt for a different transaction, or a receipt with an out-of-domain status. This can be an ordinary provider/caching fault; no live test was attempted.
- **Behavior:** `pollReceipt` never reads `transactionHash`. It accepts any parsed status, returning `reverted` for every value other than 1. A receipt for a different transaction to the same destination can consequently be attributed to the requested transaction, and invalid status data is presented as an actual reverted result.
- **Impact:** a payment/approval/withdrawal confirmation can be incorrectly classified, despite the surrounding transaction checks. Incorrect outcome classification also affects the public evidence retained after a send.
- **Fix verified in source:** integration `apps/web/src/lib/wallet.ts:497–505` requires a valid hash equal to the requested hash and requires status 0 or 1. The latest changes also make seen-transaction field decoding stricter.
- **Remediation direction:** retain/integrate the candidate validation. Preserve the public broadcast hash when invalid confirmation evidence is rejected.
- **Benign local regression:** mocked RPC receipts for two ordinary local fixture transactions must never cross-confirm; unsupported status fixtures must return a shape error, not an included outcome. Adjacent latest `wallet.test.ts` has expanded coverage; this worker did not execute it.

### WL-F2 — The scan privacy summary marks incomplete 30-day coverage complete

- **Affected source:** main `apps/web/src/lib/scanSpam.ts:187–195`; displayed by `describeAnonymitySet` at `207–211`.
- **Prerequisite:** a scan reaches the head and covers the last seven days but less than the last thirty days.
- **Behavior:** the function returns both `count7d` and `count30d`, but computes the shared `partial` flag against `from7`. Thus the thirty-day value is displayed without the partial-coverage qualification even though earlier blocks were not scanned.
- **Impact:** sellers see an understated thirty-day announcement count presented as complete. This is a privacy-information accuracy issue, not a missed-funds assertion.
- **Fix verified in source:** integration `apps/web/src/lib/scanSpam.ts:195` compares `scannedFrom` against `from30` instead.
- **Remediation direction:** retain/integrate the candidate coverage boundary.
- **Benign local regression:** calculate the summary for a chain fixture with a ten-day scan reaching the head and assert `partial: true`; a full thirty-day scan should be complete.

### WL-F3 — Failed session replacement can destroy the previous session before the new one exists

- **Affected source:** main `apps/web/src/lib/session.ts:234–243`.
- **Prerequisite:** keys are already loaded and a key replacement encounters a failure during public-key summarization or secure-buffer allocation/boxing.
- **Behavior:** `install` invokes `clearSession(false)` before calling `summarize(next)` and `box(next)`. A failure in either step leaves the previous session wiped without a successful replacement.
- **Impact:** the current session becomes unrecoverable from memory; if it was the only copy, this can lose the user's keys. This is conditional on a replacement failure, not ordinary successful generation/import.
- **Fix verified in source:** integration `apps/web/src/lib/session.ts:296–310` prepares `nextSummary` and `nextStored` before clearing the current session, and wipes temporary input in `finally`. The boxing implementation also cleans up partial allocations.
- **Remediation direction:** retain/integrate the atomic replacement sequence.
- **Benign local regression:** use the existing allocation-failure test seams in `session.atomicity.test.ts` with disposable fixture keys; verify that the previous public summary, revision and recoverability remain intact. This worker did not run the test.

### WL-F4 — Payment-delay expiry can be bypassed by a wall-clock rollback

- **Affected source:** main `apps/web/src/lib/jitter.ts:83–86` and `98–101`.
- **Prerequisite:** an invoice is waiting in the delay scheduler, monotonic elapsed time passes its remaining lifetime, and the system wall clock moves backwards.
- **Behavior:** the delay's ready condition is monotonic, but expiry is checked only against the current wall clock. The scheduler can report `ready` (including through `sendNow`) after the elapsed invoice lifetime.
- **Impact:** an expired invoice can remain eligible in the delay UI. Other send-time checks still exist, so this finding does not assert an actual successful expired on-chain payment.
- **Fix verified in source:** integration `apps/web/src/lib/jitter.ts:91–105` and `117–120` use the maximum of wall time and the starting wall time plus monotonic elapsed time, failing closed for nonfinite values.
- **Remediation direction:** retain/integrate the candidate monotonic expiry floor.
- **Benign local regression:** existing fake-clock tests can advance monotonic time past expiry while moving wall time backwards; both timer and Send now must finish expired.
- **Related existing documentation:** `docs/reviews/2026-10-21-F6-jitter.md:11,18,31` discusses monotonic delay and previous clock-test scope. `docs/handoffs/PAGES_IDLE_CLOCK_INTEGRATION_20261118.md` is related shell idle-clock work, not proof that the jitter variant on main is fixed.

## Additional already-corrected source boundaries

These are confirmed source changes. The completed review did not establish ordinary UI reachability for every exceptional input, so those qualifications remain separate from the counted unresolved findings.

| Boundary | Main evidence | Integration correction | Disposition |
|---|---|---|---|
| Multipart QR silently replaces unpaired UTF-16 rather than preserving/refusing payload bytes | `apps/web/src/lib/qrMultipart.ts:20–23` | Same path `20–25` checks for surrogate code points before encoding | Fixed integration; use a local codec unit fixture if validating. Do not infer typical signed-invoice corruption. |
| Runtime-invalid profile values can widen to full because only literal lean is excluded | `apps/web/src/lib/buildProfile.ts:25–26` | Same path `25–30` requires full build and full/absent overrides | Fixed integration; typed ordinary callers normally supply valid values. |
| Merchant pin JSON accepts duplicate fields before shape validation | `apps/web/src/lib/merchantIdentity.ts:26–36` | Same path `36` uses strict JSON parsing | Fixed integration. No adversarial fixture or browser state manipulation attempted. |
| Runtime-invalid QR kind/payload identifiers can produce undefined or inherited values | `apps/web/src/lib/qrKinds.ts:232–236` and `qrKindClass` | Same path `180,235` validates own string keys | Fixed integration; ordinary caller reachability not established. |
| Sole-copy idle retention and asynchronous secret borrows require revocation separate from physical key retention | Main session implementation; integration changes reviewed in full | `apps/web/src/lib/session.ts:95–145,384–445` adds suspension, synchronous expiry checks and tracked asynchronous-copy wiping | Completed source disposition includes the coordinator's AppShell binding review; see [resolved differences](../RESOLVED-DIFFERENCES.md). No browser physical-memory erasure claim or separate open finding. |
| Relayer timeout relies on AbortController being honored by fetch/body | Main `apps/web/src/lib/relayerClient.ts` | Integration adopts `boundedRequest` | Continuation reviewed all 144 lines of the wrapper: independent fetch/body deadline, streamed byte cap and nonblocking cleanup. [Completed source ledger](../review-ledgers/web-library-continuation-audit.json); no fresh runtime qualification is claimed. |

## Reviewed fixes newer than the integration snapshot

These boundary defects remain in the reviewed main and integration snapshots. The coordinator completed the two corrective production-diff reviews at the heads below; their final dispositions are recorded in [resolved differences](../RESOLVED-DIFFERENCES.md) and the [branch-variant ledger](../review-ledgers/root-branch-variants-audit.json). Neither isolated corrective head received a dedicated test-suite run or build in this audit.

- `apps/web/src/lib/format.ts:17–23`: `parseUnits` lacks the precision validation present in `formatUnits:7`. A noninteger precision can throw despite the documented undefined-on-unexpected-input contract, and unsupported precisions are not uniformly refused. PR303 head `a9e0715573f7247d7a16f9d1d030cf0232708fb2` adds the runtime string, integer and 0–36 precision guards at line 18. Ordinary UI reachability for the invalid-input cases was not established.
- `apps/web/src/lib/txGuard.ts:124–128`: boolean-return simulations only identify the exact 32-byte zero case as refusal; other syntactically hex data is accepted as successful, including noncanonical boolean responses. PR305 head `87cf6c603338ad64ec02300fe42b96c3e0a205b9` requires a canonical 32-byte bool at lines 125–136, preserves empty legacy returns, refuses zero and classifies malformed nonempty responses as unavailable. This is source-confirmed correction evidence, with no live-provider or transaction test.

## Investigated and rejected as new findings

- **Receipt creation after invoice expiry:** `receipts.ts:95` rejects it and `receipts.test.ts:110–112` explicitly expects the rejection. `docs/handoffs/INVOICE_BOUND_RECEIPTS_2026-11-02.md` requires a fresh unexpired invoice, and `docs/research/2026-11-03-claude-handoff/01-evm-payment-correctness.md` EVM-4 already records this as a product decision. Do not re-label it an uncovered implementation bug.
- **Tag snapshot after session clear:** the library's snapshot/session binding initially appeared weaker, but the actual AppShell session observer synchronously locks the vault, changing its revision, and the export UI has both session and operation guards. No ordinary user-visible stale-plaintext path was established. The library review alone is insufficient to file it.
- **Nonstandard fiat minor-unit exponents:** the currency helper has a limited zero-decimal set and defaults to two. Product support for the affected currencies was not established; root explicitly requested no speculative currency finding. It is omitted from the finding count.
- **Different network ID and chain ID / high gas estimate above sweep cap:** no affected supported network or allowlisted token was established. Do not report hypothetical interoperability failures as current defects.


## Main defects already fixed in the integration pin

### WL-C1 — Native direct sweep can silently use a changed balance

**Priority:** Medium correctness/consent defect. **Status:** main affected; integration fixed; already documented in the repository.

- Main `apps/web/src/lib/sweep.ts:565–603` reads the current native balance and sets the sent value from it, but does not compare it with `DirectSweepInput.amount`, documented as the reviewed balance at lines 278–281.
- A normal deposit or withdrawal between the user's balance review and the fresh signing preflight can therefore change the amount selected for that action. This finding concerns the value being swept to the selected destination; it does not assert a changed recipient or a demonstrated loss.
- Integration `apps/web/src/lib/sweep.ts:688–701` requires `nativeBalance === i.amount` before estimating, signing, journaling, or broadcasting. The separately implemented native fee prepare/confirm flow also binds the exact serialized transaction and additional reserve (`:900–945`).
- Remediation direction: retain the reviewed-balance equality and require a new explicit balance/fee review after any change. Test benign increased/decreased balances and same-nonce replacement using a local RPC fixture, with zero signature or handoff on mismatch.
- Existing evidence inspected: `docs/handoffs/sweep-review-authority-20261119/README.md`, section “Native balance consent follow-up”. Its historical executed results are that document's evidence, not a new run by this worker.

### WL-C2 — Cancelling a scan does not stop main's pending window scheduler

**Priority:** Medium cancellation/privacy-behavior defect. **Status:** main affected; integration fixed; already documented in the repository.

- Main `apps/web/src/lib/scanClient.ts:267–271` awaits the page fetch and checks cancellation only after it returns. The worker is terminated on cancellation, but that does not cancel the nested window scheduler.
- Main `apps/web/src/lib/scanPrivacy.ts:372–379,399–426,433–458` has no scan signal in the scheduler and can continue dispatching the remaining windows after an earlier window or jitter wait resolves. An ordinary user cancellation can therefore be followed by additional scan requests to the already-selected endpoint; a stalled underlying page await can also delay completion of the caller.
- Integration passes the scan signal through `openScanClients` (`scanPrivacy.ts:704–737`), checks it around head, jitter, window, split and result processing (`:441–518,530–564`), and races active page RPC operations against cancellation (`scanClient.ts:185–216`). The latest scheduler also preflights the number of initial windows and limits uncached requests per call.
- Remediation direction: preserve signal propagation to both primary and secondary schedulers, stop subsequent dispatch after cancellation, and retain late-result rejection. A benign local deferred-window/jitter fixture should prove that cancellation produces no subsequent RPC dispatch. The requirement does not claim already-dispatched network bytes can be withdrawn.
- Existing evidence inspected: `docs/handoffs/tm-hardening-20261118/acceptance-review.md`, COV-1. That document explicitly qualifies its historical test process outcome; this continuation does not upgrade it to a fresh clean test pass.

### WL-C3 — Main's sweep helpers only validate seller-session lifetime, not the pending UI review

**Priority:** Medium authorization-lifetime correctness defect. **Status:** main affected; integration helper and component binding corrected; existing repository finding.

- Main `apps/web/src/lib/sweep.ts:174–255,560–660` captures the seller-session guard and checks it around awaits, but has no callback establishing that the current recipient/amount/review is still the one the user approved. Changing a UI review while the seller session remains loaded is distinct from replacing or locking seller keys.
- Integration introduces `assertReviewCurrent` on both inputs (`sweep.ts:269,404`) and composes it with the session guard before derivation, around signing continuations, and before handoff (`:291–368,955–978`). The native prepare/confirm path additionally binds the context, request values and lifetime.
- Existing evidence inspected: `docs/handoffs/sweep-review-authority-20261119/README.md`, “Finding and correction”. The continuation independently verified the helper correction, and the coordinator completed both pins' component review in the [UI ledger](../review-ledgers/root-ui-audit.json). Integration `views/Sweep.tsx:135–161` binds the current balance/quote scope and invalidates obsolete reviews; the callbacks at `304–329` and `421–458` verify the captured scope and operation counters and pass `assertReviewCurrent` to relayed and direct sweep calls, including the handoff checks. Native preparation uses the same binding at `370–388`. This completes the source disposition; historical tests in the handoff are not a new runtime pass from this audit.
- Remediation direction: retain the component's current-review callback at both direct and relayed calls; preserve submitted/unknown outcomes after transport begins. Ordinary delayed-preflight/signing fixtures should reject stale reviews before handing off bytes while keeping post-handoff outcome reporting intact.

## Additional checks and excluded claims

The new network authority was reviewed for immutable request binding, strict stored policy handling, selected endpoint matching, monotonic lifetime checks, response/body cancellation and action restrictions. The bounded request wrapper independently limits time and streamed body size. The private scan journal was reviewed for authenticated scope binding, guarded reads and compare-and-swap writes, tombstones, key wiping and revalidation of persisted observations. Export/recovery code was reviewed for session guards, code checks, per-payment derivation, secret-box ownership and closure of stale recoveries. The native fee review was reviewed for single-use confirmation, exact binding, expiry/cancellation and preservation of post-handoff uncertainty.

These source reviews did not establish another concrete open issue. No claim is made that all possible race interleavings or external RPC/browser behavior were exhaustively tested. Missing features were not recast as defects. Historical documentation was used for provenance only, never as a substitute for reading the selected source.

## Validation

**No tests were executed by this continuation worker.** Adjacent test names and relevant existing handoffs were inspected to identify contracts and prior regressions. The coordinator explicitly requested stopping optional duplicate test execution after source completion to free capacity for the remaining code audit. No application source, dependencies, branch refs, or external services were modified.
