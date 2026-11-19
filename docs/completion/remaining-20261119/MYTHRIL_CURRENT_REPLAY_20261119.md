# Concrete replay of the fresh Mythril inputs — 2026-11-19

This is additive execution evidence for the exact hosted report at
`28edbcf55093a6d6056232fd59ef37a2ae832b9a`. The source comparison and per-finding
dispositions remain in
[the independent review](../../handoffs/agents/MYTHRIL_28EDBCF_REVIEW_20261119.md).
The strict analyzer still fails with eleven findings. No finding is approved or
suppressed by this replay.

## Actual execution

The coordinator replayed the report's original creation bytecode and supplied
constructor/call inputs on a disposable, local Anvil. No contract source was
patched. The binary identities, report digest, exact public test origins,
input hashes, returned revert data and block timestamps are retained in the
[machine receipt](mythril-replay-evidence/receipt.json) and its raw records.
The input hashes are SHA-256 of the UTF-8 hexadecimal strings, not their decoded
bytes. The expiry calls retain their input, value and origin while targeting the
corresponding newly deployed local instances.

All eight current Factory creation inputs returned
`ImplementationHasNoCode()`. The experiment independently read `eth_getCode`
for the constructor's implementation address `0x1` and confirmed `0x` on this
local EVM. Those rejections occur before the later modeled deployment steps;
this does not claim execution of those unreachable later steps. The current
R8 calls are distinct, so the obsolete identical-call `AlreadyDeployed`
argument remains withdrawn.

The three current expiry calls also rejected. With the explicit zero block
timestamp interval, their respective results were `InvalidAmount()`,
`ZeroAmount()` and `InvalidDestination()`. Every mined deployment timestamp was
asserted to be zero. The final eleven-record verification exited **0**.

## Retained failed first attempt

The first wrapper incorrectly assumed that Anvil's genesis `--timestamp 0`
also fixed later mined block timestamps. They were actually **1**, so the first
two expiry calls correctly returned `Expired()` instead of the earlier
timestamp-zero errors. All eight Factory constructor checks had passed, but
the wrapper's final expected-error assertion failed and the process exited
**1**. Its original script, eleven observations and Anvil log are retained in
`mythril-replay-evidence/attempt-1/`.

The corrected run adds an explicit successful
`anvil_setBlockTimestampInterval(0)` and asserts each deployment timestamp.
It does not remove the expected-error assertions or change any contract input.
Its verbatim executed script and observations are under
`mythril-replay-evidence/fixed-clock/`.

## Scope of the counterexample

Only this child process's loopback endpoint was contacted. Creation origins were
funded and impersonated inside it; other call origins were funded for `eth_call`.
The calls use a 20,000,000 gas cap, the pinned Anvil binary's default chain/fork
configuration, and the nonce state left by the earlier deployments. The full
symbolic initial-state balances and storage were not injected. Timestamp zero
is a controlled test state, not production-chain acceptance. These are exact
input counterexamples under the recorded local state, not a recreation of the
entire symbolic world. The archived harnesses retain the exact session-specific
binary and report paths used for execution.

The real conditional fee-token freeze, sender-hook/fee-waiver assumptions and
chain-specific timelock decisions remain open. These measured constructor
rejections strengthen the earlier source inference for these particular
inputs; they do not convert the report into a zero-finding campaign or an
owner-approved release exception.
