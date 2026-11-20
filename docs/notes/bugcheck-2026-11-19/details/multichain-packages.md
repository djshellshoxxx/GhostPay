> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Multi-chain package findings

Pins: main `c977b5d6723f6822c3b5d86cd6b231712c53c395`; integration `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

## MC-01 — TRON scanner continues yielding a buffered page after cancellation

- **Priority:** P3 / low. Confirmed exported scanner behavior; preserved experimental full-profile feature, not the lean Pages runtime.
- **Disposition:** Open at both reviewed pins. `packages/tron-adapter/src/scan.ts` is byte-identical.
- **Location:** `packages/tron-adapter/src/scan.ts:146–169`, especially the lone page-start check at 151 and the nested loops/yield at 153–167.
- **Cause:** The abort signal is checked before a page request, but not when that request resolves, before each transaction, after a receipt await, or before yielding. Once a page is buffered, cancellation does not end iteration until the next page boundary; on the last page the iterator may end normally.
- **Benign reproduction executed:** Build two honest, synthetic native payments with the public builder and return both in one in-memory block. Read the first iterator result, abort the controller, then read again. On both main and integration: `firstAmount=1`, `aborted=true`, `secondAmount=2`, `secondDone=false`, one mock request. Script: `multichain-qa/tron-cancel.mjs`. No endpoint or funds were involved.
- **Impact:** Callers using the advertised signal can receive results and perform further per-payment processing after cancellation. The `apps/web/src/features/tron/scan.ts` wrapper invokes `onFound` and collects detections without an additional signal check. The independent views reviewer found that explicit Cancel only aborts the controller, whereas replacement/lock also invalidate an operation generation. Built-in HTTP transport itself cooperates with abort; this is not a claim that every ordinary browser Cancel visibly fails. Buffered iterator callers and delayed/custom transports expose the gap directly.
- **Fix direction:** Check cancellation after every awaited stage and before processing/yielding each buffered transaction; keep UI operation invalidation for explicit Cancel so late callbacks cannot publish results. A regression should abort between two same-page results and after the page/receipt await.

## Main defects already fixed in integration

These are dispositions of inspected code, not newly unresolved integration findings:

| Area | Main evidence | Integration correction | Qualification |
|---|---|---|---|
| TRON range completeness | `rpc.ts:191–201` accepts an omitted or short ordered block list, so scanner advances past missing blocks. | `rpc.ts:195–202` requires exact count and contiguous requested heights. | Prior `docs/audits/05/solana-tron.md` SOLANA-TRON-08 and `docs/handoffs/consolidation-20261118/HISTORICAL_ADAPTER_SAFEGUARDS.md`. |
| Policy limit leaf binding | `limits.ts:137–155` and `eip712.ts:224–234` verify a supplied hash/proof without recomputing the hash of token, limit and window. | `limits.ts:isLimitLeaf/getLimitProof`; `eip712.ts:248–258` recompute fields before accepting the proof. | Preserved policy path; contract separately enforces binding. No fund-loss claim from this client mismatch. |
| Policy signer input restriction | `eip712.ts:339–361` checks only the supplied digest against supplied EIP-712 data and rereads it during signing/recovery. | `eip712.ts:332–439` reconstructs only known domain/types/fields and signs one validated digest. | No adversarial reproduction performed. Prior G1 hardening disposition. |
| Policy calldata inspection | `router.ts:165–185` checks account prediction but omits canonical encoding, ephemeral-point and metadata/call consistency. | `router.ts:173–227` checks those additional invariants. | Inspection helper; caller still must bind payee/router/value to its own review. |
| Policy secret copy cleanup | `derive.ts:176–178` copies viewing secret before policy/deployment validation can throw outside `finally`. | `derive.ts:178–181` validates public arguments before making secret copy. | Best-effort cleanup correction, not a proven exfiltration path. |
| PIR endpoint trimming | `client.ts:79` uses an unanchored trailing-slash repetition. | `client.ts:79–85` walks the terminal slash run linearly. | Complexity correction only; no hostile-input workload executed. |

The policy changes are already summarized in `docs/handoffs/pages-completion-20261118/REMAINING_PR_DELTA_REVIEW_20261118.md`, G1/G1c/G1d row.

## Source coverage and limits

Completed every production source file of `pir-two-server`, `solana-stealth`, `tron-adapter`, and `policy-scheme`, plus every changed integration variant. Generated policy ABI arrays were structurally reviewed as all 120 function/event/error/constructor/receive entries including nested tuples and mutability; parsed source arrays were compared with the exact build exports. No contract-compilation or chain execution is claimed by that check.

The [Bitcoin package continuation](bitcoin-package-review.md) completed 66 per-pin/path records; the [final spend review](bitcoin-spend.md) completed the remaining two `spend.ts` records. Together they close all 34 Bitcoin production paths at each pin, with zero pending records. The two earlier partial spend records are superseded, not additional completed coverage. Exact evidence is retained in the [package continuation ledger](../review-ledgers/btc-packages-continuation-audit.json) and [final spend ledger](../review-ledgers/btc-spend-final-audit.json). No full package suites were launched by this worker. No product files were modified.

## Non-findings / limits

The PIR same-operator heuristic and collusion assumption, Solana memo index scalability, token extension exclusions, and policy native-buffer limitations are documented design constraints; they are not reissued here as new bugs. Runtime misuse outside typed input contracts was not elevated without a concrete supported-flow impact. This audit is not a protocol proof or node interoperability qualification.
