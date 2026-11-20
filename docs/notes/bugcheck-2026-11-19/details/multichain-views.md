> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Multichain feature findings

## Scope and pins

Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395` at `GhostPay-bugcheck`.
Integration: `e22c1748a3de6eb02f5be3abe27d634b238c67c6` at `GhostPay-latest`.

Owned scope: production source in `apps/web/src/features/{btc,policy,solana,tron}/` and `apps/web/src/features/registry/ref/ERC6538Registry.sol`. The [initial ledger](../review-ledgers/multichain-views-audit.json) is a historical checkpoint: 83 reviewed records, one partial and ten pending. The [completed aggregate ledger](../review-ledgers/btc-views-continuation-audit.json) contains **94 reviewed variant records, zero partial and zero pending**, including 34 BTC variants. The continuation closed 11 records by completing the remaining integration BTC range and ten main variants; the other 83 retain their predecessor provenance. The total is aggregate coverage, not 94 new continuation reviews. See [BTC continuation](bitcoin-views.md).

These are optional full-profile features, excluded from the Pages lean build. Policy additionally requires its feature flag; the checked-in production policy deployment pins are empty. This reachability qualification applies to every policy issue below.

## MV-01 — Policy import silently drops a different seller with identical policy terms

**Priority:** P3 / Low. **Main:** affected. **Integration:** affected.

**Source:** `apps/web/src/features/policy/PolicyView.tsx:114`; `PolicyCreate.tsx:56-64,138` at the integration pin. The relevant behavior is present in main as well.

The record collection deduplicates solely by `policyHash`. That hash identifies policy terms and does not identify the seller's spending/view keys or complete meta-address. Two valid records with different seller keys can therefore share a policy hash. Importing the second record runs the success/accepted-warning path, but `addRecord` returns the unchanged collection. The second seller's record is absent, while the existing record and share/backup material remain. The list's React key also uses `policyHash`.

**Benign validation:** A local React test generated two distinct seller records with the same policy terms and imported both through the actual view. The expected second meta-address was absent (`expected null not to be null`). No external service was used. The run executed against integration; main disposition is based on the fully reviewed source comparison.

**Impact:** Incorrect local record management and misleading import feedback. No fund movement or automatic payment to the wrong seller was demonstrated.

**Recommended correction:** Use the canonical full meta-address, or seller key identity plus policy hash, to identify records. Deduplicate only identical records, align the render key with that identity, and return an import outcome so the UI can accurately report duplicate versus newly added.

## MV-02 — Editing the payment form does not revoke an already pending send

**Priority:** P2 / Medium in the experimental payment flow. **Main:** affected. **Integration:** affected. **Current Pages production reachability:** absent; the optional policy feature is excluded and the production policy deployment registry is empty.

**Source:** `apps/web/src/features/policy/PolicyPay.tsx:44-86,96-99`; `apps/web/src/features/policy/send.ts:46-83,92-100` at the integration pin. The relevant form invalidation and captured-guard behavior is present in main too.

Changing meta-address, token, or amount clears `reviewed` in React state, but it does not invalidate the guard already captured by the asynchronous send closure. The form remains editable while send is pending. The send guard compares the prepared transaction against its original frozen review and checks session/deployment context; it does not observe a form revision. Consequently, the UI can display a newly edited amount and remove the old review while the earlier send continues to the wallet.

**Benign validation:** The local test used the project's existing local policy deployment fixture, an in-process mock wallet and mocked RPC. It reviewed amount `1000`, started send, paused the wallet account recheck, changed the visible amount to `2000`, then allowed the recheck to finish. The mock recorded one `eth_sendTransaction` for the previously prepared payment; the regression expectation of zero calls failed (`expected ... length 0 but got 1`). No live wallet, remote node, transaction, or funds were involved. Runtime validation was on integration; main disposition is from source comparison.

**Impact:** A queued payment can proceed using a review that the visible form has already invalidated. This is a latent correctness issue in the opt-in payment flow, not a demonstrated current Pages deployment issue.

**Recommended correction:** Bind each review to a form/context generation and synchronously invalidate it on every relevant edit. Include that generation in the guard checked before wallet actions. Disabling edits during send is a useful supplementary UI measure, but pending operations should still verify their review is current.

## MV-03 — Existing TRON-4 remains open: selected testnet is not positively checked

**Priority:** P3 / Low, already documented by the repository. **Main:** affected. **Integration:** affected.

**Source:** `apps/web/src/features/tron/rpc.ts:38-43`; `TronView.tsx:117`; `network.ts:19-21`. Prior disposition: `docs/chains/QUALIFICATION-2026-11.md:125` identifies this as open `TRON-4`; `docs/chains/SOURCES-2026-10-25.md:54` explicitly says the positive selected-network check is not wired.

`checkNetwork` rejects the known mainnet genesis, but accepts any other genesis and takes no selected-network argument. The view can therefore be labelled Nile while a Shasta or unrelated local endpoint passes its check. Pinned Nile/Shasta genesis constants already exist but are not used here. Mainnet refusal remains in place.

**Validation:** Source tracing plus the existing tests which accept Nile and Shasta through the same unparameterized guard. No remote RPC was queried.

**Recommended correction:** Pass the selected network into the guard and require its expected genesis. Define local-network behavior explicitly so public testnets do not silently satisfy a local selection.

## Cross-worker issue qualification

The package reviewer owns the confirmed TRON iterator cancellation issue. In the web wrapper, explicit Cancel aborts the controller without advancing the operation generation. The callback checks generation, but the wrapper adds no per-result signal check. Lock/replacement/new-wallet paths do advance generation. Built-in RPC cooperates with abort, and normal browser input may not interleave already-buffered native-result microtasks. Treat UI consequences as timing/transport dependent; do not claim ordinary UI cancel always fails and do not duplicate the package finding.

## Main-to-integration dispositions observed

The reviewed Solana/TRON scanners in main fetch detected-address balances during discovery (and TRON may fetch memo-related data). Integration moves address balance reads into the explicitly reviewed sweep flow with disclosure. This is a privacy behavior improvement in optional features.

The reviewed policy payment self-check in main compares account, owner, and policy hash, but omits the complete ephemeral/metadata binding. Integration's `paysDerivedPayment` validates method, ephemeral R, metadata, and view tag. This is fixed in integration; it is not an additional open integration finding.

## Validation artifacts

- Local test: `/workspace/scratch/72c433175c66/multichain-qa/policy-state.test.tsx`.
- Config: `/workspace/scratch/72c433175c66/multichain-qa/vitest.config.mts`.
- Log: `/workspace/scratch/72c433175c66/multichain-qa/policy-state.log`.
- Final command: `node node_modules/vitest/vitest.mjs run --config /workspace/scratch/72c433175c66/multichain-qa/vitest.config.mts --reporter=verbose` from the integration checkout.
- Vitest 5.1.0: two intended expected-behavior assertions failed, duration 17.25 seconds, exit 1. Failures are the evidence described above, not a passing regression suite.
- No product source was modified. The test fixture uses local mocks and the repository's test-only deployment seam. No main runtime test was executed.
