# Bitcoin package review and qualifications

Source review is complete across fresh review chunks. The [package continuation ledger](../review-ledgers/btc-packages-continuation-audit.json) contributes 66 completed per-pin/path records; the [final spend ledger](../review-ledgers/btc-spend-final-audit.json) supersedes its two partial `spend.ts` records, completing 34 of 34 production paths at each pin with zero pending records. Generated protobuf retains the structural-review qualification below.

Candidates BTC-C1 through BTC-C4 are retained as unconfirmed source observations; their proposed runtime checks were not executed and are not outstanding source-review work. The final spend review confirmed BTC-C5 as the API-only GP-BUG-17, contained by the current browser caller. See [final spend review](bitcoin-spend.md) and [browser qualification](bitcoin-views.md). No unpromoted candidate is included in the unresolved-finding count.

## Candidate BTC-C1 — post-verifier cancellation yield

Both pins. The source observation concerns `packages/btc-silent-payments/src/scan/scanner.ts`: it checks abort before optional awaited verifyOutput/verifier but yields after await without checking again. The API says abort ends iteration without error. The proposed check using an ordinary deferred verifier resolving true after cancellation was not executed. This remains an unconfirmed direct-API observation.

**Browser qualification received from `/root/btc_views_continuation`:** both pins' scanWorkerClient abort listener synchronously closes bridges, removes handlers, terminates worker, and rejects ABORTED (latest 68–74,106–109). Web scan.ts additionally checks abort after iteration and before returning. No completed browser result after Cancel is demonstrated by this package boundary. Keep scope as package API if confirmed.

## Candidate BTC-C2 — premature seenKeys mutation

Both pins. scanner.ts adds x-only keys to caller-owned seenKeys while collecting candidates, before cross-checks and optional verification. Documentation calls it keys already returned. A verifier returning false can leave a key in the set even though no result was yielded; a later accepted result can be marked duplicateKey despite no previous returned occurrence. Cross-check failure and cancellation can leave similar state. The proposed first-false/second-true verifier fixture was not executed; browser persistence/metadata impact was not established. This remains an unconfirmed source observation.

## Candidate BTC-C3 — header adoption after cancellation

Both pins. scan/headersync.ts fetchHeaders checks signal before source.getHeaders, awaits it, then validates/returns without another cancellation check. Extension/branch loops may connect/add/adopt returned headers after abort if the source resolves despite the signal. No custom-source reproduction with valid local headers was executed and no user-visible mutation was demonstrated. The completed [browser qualification](bitcoin-views.md) distinguishes this unconfirmed package observation from the built-in transport's cancellation checks and integration's view ownership guards.

## Candidate BTC-C4 — legacy HTTP timeout leaves transport active

Both pins. scan/blindbit.ts withDeadline approximately 134–149 races fetchJson against a timer and clears timer, without its own transport abort or body reader cancellation on deadline. The caller can receive timeout while old request/body work continues until completion, byte cap, or external cancellation. The proposed local delayed-fetch/body cancellation check was not executed; this remains an unconfirmed direct-API observation. grpcWebUnary has its own abort deadline/cleanup and is outside this observation.

**Browser qualification received from `/root/btc_views_continuation`:** BtcOracleBridge supplies its own 30-second abort, fetch/body race, late-response cancellation, and finally abort (oracleBridge 29–55 unchanged). Browser resource persistence from this inner timeout alone is not established.

## BTC-C5 — previewSweep address mismatch confirmed as GP-BUG-17

The final worker read all 721 lines of `spend.ts`, including the previously unread builder remainder, and confirmed this mismatch. Both pins share blob `60697bc4a3b2c8518f822786027049ee6d770e53`. `previewSweep` classifies a silent-payment destination by prefix at lines 226–227 and uses the fixed P2TR script length without decoding it against the selected network, despite its same-checks contract at lines 209–215. The signing paths validate the destination through silent-payment output creation or the explicit network-bound decoder. A public-data check against the main build showed the strict decoder rejecting a valid address from the other network while the preview accepted it. The identical source establishes both-pin applicability; the runtime check was not repeated on integration. Full evidence and limits are in [BTC-SPEND-API-1](bitcoin-spend.md).

**Completed browser qualification:** `sweep.ts:46–65` decodes the silent address against the wallet network before preview. The confirmed issue concerns package API validation; a wrong-network preview through the current browser flow was not established.

## Main behaviors corrected at integration pin

These completed source dispositions are consolidated in [resolved differences](../RESOLVED-DIFFERENCES.md); they are not additional open integration findings:

1. Main HeaderAnchoredTweakSource does not preserve inner getSpends capability. Integration conditionally forwards it and checks returned block hash, preserving method absence for unsupported sources.
2. Main processes individual spend rows without integration's full-list validation, duplicate suppression, conflicting spentBy rejection, and cross-block reportedSpends suppression. Main state can overwrite prior spend/reconfirmation evidence. Integration preserves first spend, rejects incompatible confirmed outpoint reappearance, and ignores pending-match spends.
3. Integration introduces continuous spentCheckedThrough coverage and leaves legacy/unsupported absence unknown; validates duplicate match identities, conflicting known hashes, pending spend evidence, and self-spends; reconciliation checks discovery/spend/coverage historical hashes even when the cursor agrees. The completed [BTC view report](bitcoin-views.md) records browser qualification; no new runtime regression result is claimed here.

## Not promoted

Exceptional-path key-byte zeroization is not a demonstrated disclosure. The [final spend review](bitcoin-spend.md) confirmed the fee helper's 0.001 sat/vB quantization and retained it as a precision/contract clarification, since unintended behavior was not established. verifyKeyPathSpend assumes P2TR prevouts by contract; script length alone is not a demonstrated product bug. Transaction parsing is not complete consensus validation. Signet signature and partial checkpoint/MTP limitations are documented. No primitive defect was found in fully read sender/receiver/keys/input code. Generated protobuf was structurally reviewed in full without regeneration or encoded descriptor equivalence proof.
