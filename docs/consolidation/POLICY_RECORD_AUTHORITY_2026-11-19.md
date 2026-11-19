# Policy record authority timing correction

The integration coordinator's independent review of the recovered #211 asset coverage group identified a possible
commit-to-passive-effect gap in `PolicyPay`. Investigation confirmed it behaviorally before changing runtime code.
This follow-up is authored by the asset recovery implementer and still requires the coordinator's independent review.

## Reproduction and cause

At baseline `f6fe3908`, `PolicyPay` mirrored `ctx.records` into a ref only in a passive effect. A send reviewed without
the payee's record captured a guard that rechecks this ref after the asynchronous wallet consistency probes. React
can commit a newly imported record before running that passive effect. A pending wallet reply resumed in that
interval, so the actual final coverage guard still saw the earlier empty record list.

`PolicyPay.authority.test.tsx` renders the actual component and runs the actual preparation, coverage predicate,
policy send, submit and wallet recheck implementations. It holds the last `eth_accounts` reply while the verified
policy record is committed, then releases that reply from a layout effect. A bounded 12 ms commit workload makes
React yield its passive work; this tests the real concurrent scheduler instead of mocking effects or the guard.
The controlled turn runs outside `act`, whose synchronous passive-effect flush would hide the interval, and restores
the test environment afterward. Only application/service presentation seams and the EIP-1193 provider replies are
controlled. All RPC data and wallet submissions are in-process fixtures; no live request or transaction is sent.

Before the correction, the DAI case issued one `eth_sendTransaction` despite the newly committed record excluding
DAI: **1 failed, 1 passed**, exit 1. The USDC positive control passed, confirming the send path was reachable. The
initial render-assignment correction passed both cases. Independent coordinator review then required committed
authority only: an abandoned speculative render must not replace the record list with a less restrictive one.
The final layout-effect correction passed the identical two cases, exit 0. DAI produces the coverage refusal and
removes the sendable review; USDC still submits once. All three logs and hashes are retained in the paired JSON receipt.

## Correction and scope

`PolicyPay` now publishes `props.ctx.records` to the ref in `useLayoutEffect`, after the render commits and before
pending promise continuations resume. The final send guard observes the committed records without waiting for a
passive effect; speculative renders do not change authority. The cryptographic predicate, canonical calldata/R/metadata binding,
session/deployment guards, existing delay floor and duplicate-attempt handling are unchanged.

The runtime delta is limited to `PolicyPay.tsx`, with one new two-case component regression. No dependency, build
configuration, coverage threshold, scanner setting or security gate changed. The original asset recovery provenance
remains in `POLICY_ASSET_RECOVERY_2026-11-19.md`; the focus regression remains a separate commit.

## Execution boundary

The one-worker diagnostic runner borrowed the integration worktree's installed dependencies and resolved workspace
packages to this isolated asset worktree's source. It did not use another branch's library build output. Exact runner
command, Node/Vitest/React versions, source blobs and log hashes are in `policy-record-authority-2026-11-19.json`.
The RED run took 15.23 seconds; the intermediate render-assignment GREEN took 5.30 seconds and the final layout-effect
GREEN took 5.99 seconds. The secret scan and diff whitespace check also passed.

This focused regression is not a full asset suite, coverage run, lint/typecheck, browser qualification or combined-head
CI pass. Those checks remain part of the integration candidate's qualification. The timing failure was confirmed in a
controlled valid React commit schedule; it is not a claim that every normal record-import click exhibits that timing.
