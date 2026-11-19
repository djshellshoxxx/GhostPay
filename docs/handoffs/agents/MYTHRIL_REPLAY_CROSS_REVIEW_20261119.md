# Independent review of the current Mythril replay — 2026-11-19

**Verdict: PASS for the recorded concrete-input counterexamples and their stated
limits.** Reviewer: `contract_security`. Reviewed coordinator packet:
`5e753eb969455089acf40eca2d3a5859e3debb66`. This review reads and verifies the
evidence; it does not run another Anvil campaign or change a finding disposition.

The [coordinator's replay](../../completion/remaining-20261119/MYTHRIL_CURRENT_REPLAY_20261119.md)
adds measured rejection evidence for the original inputs in hosted report
`28edbcf55093a6d6056232fd59ef37a2ae832b9a`. The report remains a strict failure:
eleven findings, with no approved exception or suppression. The earlier
[report comparison](MYTHRIL_28EDBCF_REVIEW_20261119.md) remains immutable. Its
source inference for the eight current Factory creations is strengthened by
this separate local execution record, not silently relabeled as an earlier
measurement.

## Evidence identity and verification

The independent [verifier](evidence/mythril-replay-cross-review-20261119/verify.py)
passed against the corrected coordinator packet. The complete
[verification record](evidence/mythril-replay-cross-review-20261119/verification.json)
is keyed by contract, SWC and program counter. For each finding it retains the
original creation origin/value, report indices, creation hashes and both
attempts' observations. Executed expiry calls also retain their original
origin/value, model target and call-input hashes. The generated record labels
the concrete target as the corresponding new local deployment.

| Checked object | SHA-256 |
| --- | --- |
| Original hosted report | `84f4f5846b68054fac52dc4968da78996d520c03c4049318ddc62ba4424b642e` |
| Corrected coordinator Markdown | `3cd4259955c571e5436ea0cb351530d990ff1a066fcb3bb2319fba677db3b1b2` |
| Corrected coordinator receipt | `f8422c3d962a5180f937dca5d6e8eef359e9dec005cd9db904b125bbb7fc3b5a` |

All six raw archived files match independently retained expected sizes and
hashes, as well as the coordinator manifest. This includes both executed
scripts, both eleven-observation records, and both intentionally empty logs
from `anvil --silent`. The original report contains five target results and
eleven unique finding keys; all eleven appear exactly once in each replay.

The coordinator hashes the exact UTF-8 hexadecimal input strings, including
their `0x` prefix. The independent record preserves those hashes and separately
calculates the decoded-byte hashes. It does not compare these different hash
encodings as though they were interchangeable.

The verifier also read the pinned Anvil and Cast binary bytes and matched their
recorded hashes. It did not execute either binary. Coordinator-observed process
exit codes are explicitly attributed to the coordinator's receipt.

## Per-finding result

| Reported contract | SWC | PC | Fixed-clock observed rejection |
| --- | --- | --- | --- |
| `GhostPaySweepRelayer` | 116 | 785 | `InvalidAmount()` |
| `PolicyAccount` | 116 | 1876 | `ZeroAmount()` |
| `PolicyAccount` | 116 | 5077 | `InvalidDestination()` |
| `0x72c68108a82e82617b93d1be0d7975d762035015` | 110 | 30 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 107 | 999 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 107 | 1170 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 113 | 1668 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 113 | 1781 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 107 | 2887 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 107 | 2978 | Factory creation: `ImplementationHasNoCode()` |
| `PolicyAccountFactory` | 104 | 2978 | Factory creation: `ImplementationHasNoCode()` |

For each of the eight Factory entries, the supplied creation input contains the
same checked 3,807-byte Factory creation-code prefix followed by its original
constructor arguments. The first constructor word is address `0x1` in every
case. The execution record reads empty code at that address and records
`ImplementationHasNoCode()` (`0x6f778c3a`) for all eight original creations.
Their later modeled deployment steps are not executed. The review does not
revive the withdrawn identical-call argument for current R8; its supplied calls
are distinct.

## Failed attempt and correction

The first run is retained as a failure, with process exit **1**. Its three mined
deployment timestamps are all **1**. The first two expiry calls therefore
return `Expired()`; the third returns `InvalidDestination()`. The eight Factory
creation rejections had already been recorded.

The corrected run's script differs only in its clock-description wording, an
explicit checked call to `anvil_setBlockTimestampInterval(0)`, recording that
interval, and a final assertion that all three deployment timestamps equal
zero. All original expected-error assertions and input construction remain.
The verifier checks that exact script transformation. The final recorded exit
is **0**, with all three mined deployment timestamps **0** and the expected
errors shown above. No failed record was replaced or assertion removed.

## Scope and unchanged decisions

These are exact supplied-input counterexamples under the recorded local state.
Expiry calls target the corresponding newly deployed instances, not addresses
asserted equal to the symbolic model's targets. Both creation and subsequent
calls use a 20,000,000 gas cap. The harness uses the pinned Anvil default chain
and fork, along with nonce state left by its earlier deployments; it does not
restore the full symbolic initial balances, nonce and storage. Creation origins
are locally funded and impersonated; other call origins are funded for
`eth_call`. Only the disposable process's loopback endpoint is contacted.

Timestamp zero is a controlled test state. These observations do not qualify
real-chain timelock assumptions, all symbolic paths, fee-token behavior, or a
release waiver. The genuine conditional fee-token freeze and the sender-hook,
fee-waiver and chain-delay owner decisions remain open. The strict analyzer
result remains failed; no protocol or analyzer-policy change is part of this
review.

The [machine summary](MYTHRIL_REPLAY_CROSS_REVIEW_20261119.json) hashes this
review's verifier and detailed result. The replay's executed scripts remain
verbatim in the coordinator packet.
