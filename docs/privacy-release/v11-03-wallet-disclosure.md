# External wallet disclosure preview

ID: `v11-03-wallet-disclosure`. Release: **v1.1 Beta**. Source: [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Before connect/sign/send show method, known account/chain/destination/amount and other disclosed categories; mark unknown fields clearly. No extra RPC to populate preview. Continue or cancel is explicit; approval binds immutable request bytes and expires on lock/account/disconnect/unmount. Recheck session after awaits. No raw payload persistence or claims of control over wallet-extension behavior.

For a known contract function, show its name and the address and numeric arguments decoded from the same calldata sent to the provider. Show native value separately in wei. ERC-20 approvals expose the spender and allowance in token base units, including a zero allowance. Policy calls use the ABI supplied by the full-profile feature. If the function is unknown or re-encoding differs, the exact outgoing JSON remains available and the dialog omits the inferred contract fields.

Cancelling the local review prevents dispatch of the displayed request. A pending account or chain change invalidates the review through the handoff to the provider. Pay records a wallet request only once it has invoked the provider. A wallet rejection is surfaced through the existing rejection handling.

## Module ownership

Under `apps/web/src/`: new lib/walletDisclosure.ts, accessible controller/UI; narrow wallet boundary/callers.

## Acceptance and reuse

M1 bounded pure descriptor/approval gate and accessible UI in supported live flow; M2 complete Pay/Registry/Policy coverage, cancellation/concurrency/browser tests. Do not bypass established transaction review, account/chain checks or duplicate protection.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
