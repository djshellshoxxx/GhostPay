> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# BTC views continuation — completed source review

## Pins, scope, and coverage

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395` at `GhostPay-bugcheck`.
- Integration: `e22c1748a3de6eb02f5be3abe27d634b238c67c6` at `GhostPay-latest`.
- Completed the remaining integration `apps/web/src/features/btc/BtcView.tsx` lines 520–966. The lifecycle sections were also reread to qualify the package review's cancellation observations.
- Read the complete main-to-integration production diffs for `BtcView.tsx`, `esplora.ts`, `headers.ts`, `oracleSource.ts`, `scan.ts`, `scanWorkerClient.ts`, `scanWorkerMessages.ts`, `scanWorkerProtocol.ts`, `scanWorkerSource.ts`, and `verification.ts`, with surrounding source where needed. Exact pending main blob identities were checked against git.
- Combined predecessor and continuation coverage is **94 reviewed variant records, zero partial, zero pending**. This includes 34 BTC variant records. The continuation closes 11 records; the other 83 retain their predecessor coverage provenance.
- The exact ledger is `btc-views-continuation-audit.json`. The predecessor ledger remains unchanged as a historical checkpoint.

The reviewed BTC view is an optional full-profile, test-network feature. It is excluded from the Pages lean build. That reachability qualification applies to the observations below.

## Findings disposition

**No additional confirmed BTC view defect was established by this continuation.** This conclusion is scoped to this source review, not an assertion that the feature is defect-free. The predecessor's confirmed MV-01 and MV-02 policy findings and existing MV-03/TRON-4 remain in `multichain-views-findings.md`; they were not retested or duplicated.

The amount-to-URI observation remains **not promoted**: `BtcView.tsx:220–228` rounds the optional amount to satoshis and falls back to an amountless URI for invalid/nonpositive input. The remaining UI (`673–688`) was read. No concrete incorrect transfer or valid, satoshi-exact amount corruption was established. No regression failure is claimed for this observation.

## Package-candidate browser qualification

These qualifications were shared with the package reviewer. They do not replace that reviewer's independent confirmation or disposition of the direct package APIs.

### Scanner cancellation

`BtcView`'s Cancel handler aborts its controller without changing the operation generation (integration `BtcView.tsx:758`), and `live()` checks only generation (`135–140`). However, the scan worker client installs a synchronous abort listener that closes both transport bridges, detaches message handlers, terminates the worker, and rejects with `ABORTED` (integration `scanWorkerClient.ts:68–74,106–109`; main `61–67,99–102`).

The web scan wrapper also checks cancellation after the package iterator completes and before returning its aggregate result (integration `scan.ts:219,235`; main `176,190`). The light-mode proof adapter checks cancellation after its awaited request group (`inclusion.ts:9–13`, unchanged).

Consequently, a package `scanBlocks` result yielded after an awaited verifier has been cancelled does **not** demonstrate a completed browser scan result after Cancel. The worker boundary rejects it, and the proof adapter and aggregate wrapper add checks. Any independently confirmed package issue should retain direct-API scope unless separate browser evidence establishes more.

### Header cancellation and stale ownership

The browser's `EsploraHeaderSource` forwards the signal into every Esplora request (`headers.ts:87–119`, unchanged). Integration `EsploraClient.request` uses `boundedRequest` (`esplora.ts:268–277`), which checks cancellation after fetch, after body reads, and again before returning (`lib/boundedRequest.ts:89–94,109–111,125,130–132`). A normal browser Cancel event while a network request is pending therefore rejects that operation before it returns a header chunk.

The web `syncHeaders` wrapper itself does not add a post-package-await cancellation check (`headers.ts:424–452`). A direct or custom `HeaderSource` that ignores cancellation could still expose the package's suspected late-chunk mutation behavior. That observation does not establish the same behavior through the built-in browser transport.

Integration additionally rejects stale operation ownership after loading headers and after synchronizing them (`BtcView.tsx:308,333`), and requires current ownership before saving (`324`). Main lacks those added guards. These are source-confirmed main-to-integration changes; this continuation did not execute a runtime reproduction of main's stale-state behavior.

### Oracle deadlines

The legacy HTTP client's suspected non-aborting deadline is bounded in this browser path by `BtcOracleBridge` (`oracleBridge.ts:29–55`, unchanged): it creates its own 30-second abort timer, races fetch and body reads against abort, cancels late response bodies, refuses delivery after cancellation, and aborts the controller in `finally`. No unbounded browser request was demonstrated from the package observation.

### Sweep review and signing lifetime

The browser validates silent-payment address syntax and selected network with a full decoder before invoking `previewSweep` (`sweep.ts:46–65,77–85`, unchanged). A package preview function that only recognizes an address prefix therefore does not establish invalid destination acceptance in this UI.

`signSweep` uses the software signer with a synchronous confirmation predicate (`sweep.ts:143–145`). `BtcView.doSign` captures the operation generation and only publishes a signed result while that generation remains live (integration `524–535`). Form/approval edits invalidate signing state, and lock invalidates the generation and wipes the wallet (`497–510,558–568,935`). No abort signal is passed to `signSweep`, so this review does not claim that an already-started local signing computation is cancelled. Its result is withheld after invalidation. No asynchronous hardware/device confirmation path is wired here.

Integration broadcast forwards the operation signal through the scoped fetch and bounded HTTP request (`BtcView.tsx:538–555`); invalidating an attempted broadcast retains a public reference with unknown outcome (`497–505`). Main did not pass a broadcast signal. The source does not establish an additional queued wallet request after invalidation in this software-wallet path.

## Other main-to-integration behavior observed

- Full-block scanning moves from unconditional provider outpoint checks to local spend tracking, with explicit authorization for optional provider checks and required authorization in light mode. The result now distinguishes `local`, `provider`, and `unknown`, and the view blocks spending from unknown/incomplete local coverage.
- The new bridge/protocol checks independently enforce the session's outpoint and matched-proof permissions.
- Integration verifies `is_coinbase` metadata against the reparsed transaction and derives consumed outpoints from those transaction bytes.
- Integration replaces Esplora's signal-only HTTP deadline with the shared bounded-request implementation, and adds broadcast-signal propagation.

These are source dispositions, not new open integration findings.

## Validation and change boundaries

This continuation used source inspection, complete production-diff comparison, and exact git blob identity checks. **No runtime test, optional suite, live RPC request, transaction, funds operation, or deployment was executed.** No product source was edited. Existing test source was consulted only to understand intended behavior; no passing test result is claimed. There are no remaining ranges or variants in this continuation's assigned scope.
