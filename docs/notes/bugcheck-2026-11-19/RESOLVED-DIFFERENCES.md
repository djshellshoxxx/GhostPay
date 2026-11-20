# Existing corrections and branch integration risks

These are source-reviewed differences. A correction present in a newer branch is not claimed to be merged into main, deployed, or independently runtime-tested unless [VALIDATION.md](VALIDATION.md) says so. Preserve the corrections when combining branches. The detailed reports contain precise main/candidate locations and prior repository references.

## Corrections present in integration `e22c174…`

| Area | Defect or gap in the reviewed main source | Correction/disposition in integration | Detailed evidence |
|---|---|---|---|
| Receipt polling | Receipt hash is not bound to the requested transaction; unsupported status values are classified as reverted. | Require matching transaction hash and status 0/1. | [WL-F1](details/web-libraries.md) |
| Scan privacy summary | Seven-to-thirty-day scans can present the thirty-day count as complete. | Completeness uses the thirty-day boundary. | [WL-F2](details/web-libraries.md) |
| Session replacement | Previous loaded session is wiped before replacement summarization/boxing succeeds. | Prepare replacement first, then replace atomically and clean temporary copies. | [WL-F3](details/web-libraries.md) |
| Payment delay | Clock rollback can let the scheduler mark an elapsed invoice lifetime ready. | Retain a monotonic expiry floor. Separate send checks still matter. | [WL-F4](details/web-libraries.md) |
| Native sweep amount | Fresh balance can replace the amount reviewed by the user. | Require equality and bind native prepare/confirm values. | [WL-C1](details/web-libraries.md) |
| Browser scan cancellation | Pending request/jitter continuations can schedule more windows after Cancel. | Propagate cancellation through scheduler and asynchronous boundaries. | [WL-C2](details/web-libraries.md) |
| Sweep review lifetime | Seller-session continuity alone does not prove the pending recipient/amount review is current. | Helper callback plus component scope/generation binding before handoff. Both halves were read. | [WL-C3](details/web-libraries.md) |
| Manifest lifecycle | Same-chain replacement can reuse an old manifest during a new load. | Bind the result to exact chain/services scope. | [COMP-FIXED-01](details/components.md) |
| QR import visibility | Pending paste/image import can finish after the page is hidden. | Cancel and reject hidden-page completions. | [COMP-FIXED-02](details/components.md) |
| Multipart text encoding | Unpaired UTF-16 may be silently replaced during encoding. | Explicit input refusal before encoding. No ordinary signed-invoice corruption claim. | [Web source boundaries](details/web-libraries.md) |
| Build profile input | Runtime-invalid overrides can widen the full-profile condition. | Explicit supported build/override checks. | [Web source boundaries](details/web-libraries.md) |
| Merchant-pin JSON | Duplicate fields pass ordinary JSON parsing before validation. | Use strict JSON parsing. | [Web source boundaries](details/web-libraries.md) |
| QR identifiers | Runtime-invalid kind/payload identifiers lack strict string/own-key validation. | Validate both before lookup. | [Web source boundaries](details/web-libraries.md) |
| Idle/recovery authority | Retaining the only physical key copy needs separate revocation of active authority and asynchronous borrows. | Suspension, synchronous expiry checks and tracked copy cleanup. Review includes shell binding; no browser physical-memory erasure claim. | [Web source boundaries](details/web-libraries.md) |
| Relayer transport bounds | Timeout relies on fetch/body cooperation with AbortController. | Bounded request wrapper races completion and bounds streamed response size. | [Continuation review](details/web-libraries.md) |
| Canonical JSON arrays | Sparse/extended array shapes are misrepresented. | Refuse unsupported own-property shapes before canonical serialization. | [CP-K01](details/core-packages.md) |
| Merchant profile clock | Invalid local clock values can defeat expiry comparison. | Reject invalid clock values first. | [CP-K02](details/core-packages.md) |
| Base64url runtime type | Non-string runtime values violate the decoder's error contract. | Explicit string boundary. | [CP-K03](details/core-packages.md) |
| Range source cancellation | Forwarding a signal alone relies completely on backend cooperation. | Check before/after awaited work and dispatch. | [CP-K04](details/core-packages.md) |
| QR transfer expiry | A rejected conflicting part refreshes the idle deadline. | Update activity only after validation. | [CP-K05](details/core-packages.md) |
| Manifest dates | Date.parse accepts impossible calendar dates through normalization. | Check calendar-day validity explicitly. | [Chain differences](details/chain-contracts.md) |
| RPC retry option | NaN defeats attempt-cutoff comparisons. | Convert non-finite retry values to zero. API-option scope. | [Chain differences](details/chain-contracts.md) |
| RPC fetch policy | Fetch defaults leave cookies/referrer/cache behavior implicit. | Explicit omit/no-referrer/no-store. No observed credential leak asserted. | [Chain differences](details/chain-contracts.md) |
| TRON scan completeness | Missing/short block ranges can advance the scan past absent data. | Require exact contiguous requested range. | [Multi-chain differences](details/multichain-packages.md) |
| Policy limit proof | Supplied proof hash is not recomputed from its bound fields. | Recompute and bind leaf fields. Contract has a separate check. | [Multi-chain differences](details/multichain-packages.md) |
| Policy signer boundary | Signer accepts overly broad caller-provided typed data and rereads digest. | Reconstruct supported domain/types/fields and sign one validated digest. | [Multi-chain differences](details/multichain-packages.md) |
| Policy call inspection | Missing canonical encoding, ephemeral-point and metadata consistency checks. | Add those checks, retaining caller review binding. | [Multi-chain differences](details/multichain-packages.md) |
| Policy secret lifetime | Public-argument validation can fail after a secret copy was made outside cleanup. | Validate before copying. No disclosure was demonstrated. | [Multi-chain differences](details/multichain-packages.md) |
| PIR endpoint trimming | Unanchored trailing-slash processing has poor complexity. | Linear terminal-run handling. | [Multi-chain differences](details/multichain-packages.md) |
| Solana/TRON discovery | Discovery performs detected-address balance reads. | Move balance requests to the explicit reviewed sweep flow. | [View differences](details/multichain-views.md) |
| Policy payment self-check | Incomplete ephemeral/metadata binding. | Check method, R, metadata and view tag with the derived payment. | [View differences](details/multichain-views.md) |
| BTC source capabilities | Header anchoring loses the underlying optional spend capability. | Forward capability only when supported and verify its block binding. | [BTC dispositions](details/bitcoin-package-review.md) |
| BTC spend evidence | Incomplete list validation, deduplication and historical spend/coverage reconciliation. | Preserve first valid evidence; reject conflicting state; retain continuous checked coverage and unknown legacy absence. | [BTC dispositions](details/bitcoin-package-review.md) |
| BTC header ownership | Main lacks newer view ownership/adoption/save checks. | Additional current-operation checks around header synchronization. | [BTC view continuation](details/bitcoin-views.md) |

## Fixes newer than the integration snapshot

| Fix | Main and integration | Reviewed corrective head | Remaining integration action |
|---|---|---|---|
| `parseUnits` runtime text/precision validation | Invalid type/precision can throw or escape the documented supported range. Ordinary UI reachability is not established. | PR303, `a9e0715573f7247d7a16f9d1d030cf0232708fb2`, `apps/web/src/lib/format.ts:18` | Retain the type/integer/range guard when consolidating. |
| Canonical ERC-20 boolean simulation result | Any syntactically valid nonzero hex data can be treated as successful. | PR305, `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, `apps/web/src/lib/txGuard.ts:125–136` | Preserve legacy empty-return handling, reject malformed nonempty ABI bool evidence, and keep explicit zero refusal. |

These two corrective production diffs were fully read. The audit did not run dedicated suites at either isolated corrective head; successful main/integration builds do not test these later changes.

## Privacy snapshot is not a superset of integration

The reviewed privacy head `1376289…` has new masking, history and clipboard behavior, but it is based on an older release snapshot. Relative to `e22c174…`, it lacks the wallet receipt-hash/status checks, the strict QR string-type guards, and the accepted-progress-only QR idle-timer update. Its `settings` draft shortcut also does not fix GP-BUG-04.

This is a concrete merge hazard: copying those whole files from privacy over integration would restore already-corrected behavior. Merge the privacy changes with the newer guards intact, then run both sets of focused regressions. The auxiliary clipboard alternative `04910f6…` was also read, but its simpler post-write generation handling should not replace the newer privacy implementation's reserved copy intent, guarded cleanup and digest retention.

The initial branch inventory preserves byte-different historical and independent branches without falsely labeling them all superseded. Only the selected latest feature variants and current core are claimed reviewed.
