> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# BTC spend final source review

## Completion and scope

Fresh worker `/root/btc_spend_final_review` read all 721 lines of `packages/btc-silent-payments/src/spend.ts`. The blob is `60697bc4a3b2c8518f822786027049ee6d770e53` at both main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and integration `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. Exact per-pin/path/range records are in `btc-spend-final-audit.json`.

This completes the predecessor's remaining lines 261–721. Merging these two records with the predecessor's other reviewed records completes 34 of 34 BTC production paths at each pin. Preserve its generated-protobuf structural-review limitation. No application files, branches, refs, or existing audit artifacts were modified by this worker.

No new browser product bug was established in this final source continuation. One low-impact package preview contract mismatch was confirmed using public data only. The current browser validates the address before reaching that API.

## BTC-SPEND-API-1 — preview accepts a silent-payment address from the other network

**Disposition:** Confirmed low-impact package API validation mismatch on both pins; current browser caller contains it. This is the predecessor's BTC-C5 candidate, now qualified. It must not be described as a browser transaction, signing, or fund-loss bug.

`previewSweep` promises the same checks as the transaction builder in its documentation at `spend.ts:209–215`. It classifies a silent-payment destination only by prefix at `spend.ts:226–227`; it then assigns the fixed P2TR script length without calling the decoder. The external-signer builder decodes every silent-payment destination with the expected network at `spend.ts:501–504`. The ordinary in-process builder delegates silent-payment creation to `createSilentPaymentOutputs` at `spend.ts:274–283`.

A public-data check encoded a valid testnet silent-payment address from public curve points and requested a mainnet preview. The strict decoder returned `NETWORK_MISMATCH`, while `previewSweep` accepted the same address/network pair and returned a 111-vB, 111-satoshi preview at 1 sat/vB. No signing or network action was used. The defect is that a library consumer can display a successful preview for an address that the later signing path rejects.

**Browser qualification:** `apps/web/src/features/btc/sweep.ts:46–65` fully decodes a silent-payment address against the wallet network. `reviewSweep` invokes that check at line 79 before `previewSweep` at lines 80–86. This caller is identical at both pins. A wrong-network preview through the current browser flow is therefore not established.

**Suggested correction:** Run `decodeSilentPaymentAddress` with the expected network in the silent-address preview branch before returning the preview, or explicitly narrow the API contract. Add an ordinary public-address test for the selected contract. No correction was made during this audit.

## Source observations kept outside the open product-bug list

### Fee precision is quantized to 0.001 sat/vB

`feeFor` at `spend.ts:107–110` rounds the requested rate to a whole millisatoshi per virtual byte before computing the ceiling. The higher-level comment at lines 247–248 states `ceil(feeRate * vsize)` without describing that quantization.

A normal public-data preview at 1.0001 sat/vB and 99 vB returned 99 satoshis; the ceiling of the unrounded input rate times 99 is 100. This confirms the arithmetic difference, without establishing that the precision policy itself is unintended. Existing `spend-regtest.test.ts:93` deliberately rejects a 0.0001 sat/vB rate. The browser uses the same preview and builder math and checks signed fees against the approved preview, so this is not a preview-versus-signature amount mismatch. Retain as a precision/contract clarification unless the intended supported rate precision is decided.

### Async signer cancellation/lifetime remains unpromoted

`SoftwareSilentPaymentSigner.signSpend` checks abort and disposal at entry (`spend.ts:636–638`), then awaits the configured confirmation callback (`710–713`) and signs after a true result (`714–716`) without a second check. `buildSpendTransactionWithSigner` passes the signal to signer methods but has no independent checks after those awaits (`492`, `504`, `509–526`). Existing cancellation tests inspected at `signer.test.ts:213–220` cover a signal already aborted before the signer steps. Disposal coverage at `227–255` covers requests made after disposal.

No pending-confirmation cancellation or disposal behavior was executed by this worker, so this is a source-level lifecycle hardening observation, not a confirmed open bug. The current browser constructs a synchronous boolean confirmation callback at `apps/web/src/features/btc/sweep.ts:143–145`, supplies no signal to this signing operation (`148–158`), disposes the signer after completion (`163–165`), and guards use of the result by operation generation in `BtcView.tsx` (main `505–506`, integration `530–531`). A cancelled browser operation signing or broadcasting was not demonstrated.

### Predecessor cancellation and resource candidates

The predecessor's BTC-C1 through BTC-C4 were not independently reproduced here and remain unconfirmed package-level candidates. Do not relabel them as verified browser findings. Source qualification supplied by the independent BTC browser worker is:

- `scanWorkerClient` synchronously closes bridges, removes handlers, terminates the worker, and rejects `ABORTED` on cancellation (integration `68–74,106–109`; main `61–67,99–102`). Web `scan.ts` checks abort after the iterator and before returning (integration `219,235`; main `176,190`). `verifyMatchedOutput` also checks abort after its awaited reads (`inclusion.ts:12`, unchanged).
- Browser header reads pass the signal through `headers.ts:87–119`. Integration Esplora uses the bounded request wrapper with post-fetch/body/final abort checks. A custom package `HeaderSource` that ignores abort is a separate boundary; the built-in browser transport was not shown to deliver a usable late chunk after cancellation. Main lacks some newer view ownership/adoption guards; those previously fixed dispositions belong to the BTC browser worker's report.
- `BtcOracleBridge` supplies its own bounded deadline, abort, fetch/body race, late-body cancellation, and final cleanup (`oracleBridge.ts:29–55`, unchanged). The inner legacy HTTP timeout observation does not establish continuing browser transport work.
- Premature `seenKeys` mutation (BTC-C2) was not tested or promoted here.

## Reviewed spend invariants

The source review followed input/outpoint validation, fee and dust planning, destination/change construction, direct and external signing, signer confirmation, final serialization, signature verification, and cleanup. Input-derived keys are checked against the claimed output keys; silent-payment outputs are re-derived in the reference signer; signatures use the fixed default sighash and are independently verified before a transaction result is returned; estimated and actual vsize are compared. Derived-key cleanup uses `finally` blocks. These are observed checks, not a claim that every possible runtime or consensus case is verified.

## Validation limits

Only the two public-data preview checks above were executed, in one successful local Node invocation against the coordinator-built main package. No test suites were run or repeated. Tests were inspected selectively for contract context. There were no product edits, secrets, live services, wallet operations, transaction broadcasts, or network/fund actions. The package source is byte-identical at the two pins; the runtime checks were not separately repeated on integration.
