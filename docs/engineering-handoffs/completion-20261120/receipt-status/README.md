# Receipt-status repair and fresh bug-hunt handoff

Worker: `/root/bug_hunt_gen2`.

Branch: `fix/ghostpay-receipt-status-20261120`.

Base: `9e062b7150e74d1b20e34b0f120add660d9ef02e`, the coordinator's isolated combination of the unique #295, #294, #298 and #292 work over #278.

## Implemented: unsupported receipt status stays unconfirmed

The RPC receipt parser previously mapped every canonical quantity other than `1` to `reverted`. [EIP-658](https://eips.ethereum.org/EIPS/eip-658) defines only zero for failure and one for success. Values such as `0x2` provide no valid receipt outcome. This is a low-severity receipt-validation and payment-state correctness defect; it is not evidence that GhostPay authenticates a consistently dishonest RPC or prevents fund theft.

Implementation `f77fe8572f54669098ee8cb5d47a6313ef72e37b` adds three lines in `apps/web/src/lib/wallet.ts`: after parsing the quantity, reject anything other than `0n` or `1n` with the existing typed unexpected-receipt-shape error. It preserves the #298 transaction-hash correlation, valid zero/one receipts, null pending receipts, canonical quantity parsing, case-insensitive hash matching, and the explicitly supported nullable destination behavior.

The consumer regressions require a post-broadcast verification-incomplete outcome containing the exact original hash. The attempt journal remains submitted, and another wallet send stays blocked. No transaction is generated or sent by these tests; they use the existing mock wallet and RPC.

## Actual verification

All runs used the original web Vitest configuration, one worker, no file parallelism, and the existing assertions/timeouts. Node `v24.22.3`, Vitest `5.1.0`, Linux. Private dependencies match the repository lockfile; unchanged package declarations were reused. No clean whole-workspace build is claimed.

| Check | Exact source | Result |
|---|---|---|
| New regressions against unchanged runtime | `b416ea615d40f6375c868b05e8af0683cf1e10fd` | 8 failed, 112 passed, zero skipped; exit 1; 6.12 seconds |
| Wallet, pay execution, payment acceptance and Pay UI suites after repair | `f77fe8572f54669098ee8cb5d47a6313ef72e37b` | 188 passed, zero failed/skipped; exit 0; 73.81 seconds |
| Adjacent malformed transaction-field probe | Same repaired source, with the archived temporary probe | 3 failed because malformed arrays returned `verified`; exit 1; 3.93 seconds |

The temporary adjacent probe was removed from active collection after execution. Its exact source and failed output are preserved in `evidence/`. [QUALIFICATION.json](QUALIFICATION.json) records commands, source blobs, resource limits, output hashes and qualification boundaries. Raw logs are compressed losslessly. Slow startup in the passing four-suite run was not a timeout or a failing assertion.

Independent reviewer `/root/security_review_gen2` received the exact implementation freeze. Its independent results must be recorded separately. The coordinator assigned the next sequential typecheck/lint/build window to `/root/integration_qa_gen3`; this lane does not claim those checks, browser acceptance, hosted CI or release readiness.

## Proven adjacent defect for the next fresh worker

`parseSeenTx` in `apps/web/src/lib/wallet.ts` normalizes `hash` and `input ?? data` with `String(...)`. A JSON array containing one expected string therefore becomes indistinguishable from a properly typed transaction field. The original-config probe establishes all three cases:

- `hash: [expectedHash]` is accepted as `verified`.
- `input: [expectedData]` is accepted as `verified`.
- An absent `input` with `data: [expectedData]` is accepted as `verified`.

These are low-severity malformed-field acceptance findings, independently reproducible without getters or non-JSON values. Sender, destination and quantity validation already have their own primitive/type checks. No production change for this second finding is included in the receipt-status fix.

### Successor task

1. Start from the coordinator's latest candidate containing the reviewed receipt-status fix. Recheck active wallet-privacy ownership before editing.
2. Restore `evidence/wallet.transactionShapeAudit.test.ts.txt` to an isolated temporary test path and reproduce all three failures under the unchanged configuration.
3. Add primitive-string checks before normalizing transaction hash and call data. Preserve valid hash/data case handling and the existing fallback from missing input to data. Ensure rejected objects do not invoke coercion hooks.
4. Promote meaningful regressions for JSON arrays, other non-string values, fallback behavior and accepted valid strings. Add an appropriate consumer check preserving the broadcast hash/journal and refusal to resend after verification becomes incomplete.
5. Run affected original tests, scoped typed lint and full web typecheck in the coordinated resource window, then obtain fresh independent review. Keep source-specific qualification and failures intact.

## Integration boundaries

This worker changed only the receipt-status runtime check, its two existing test files, additive ownership and this handoff. It made no remote writes, shared branch changes, deployments, fee/contract changes, release publication or gate changes. The concurrently advancing clipboard, masking and wallet-privacy branches were not modified. Root owns integration and publication.
