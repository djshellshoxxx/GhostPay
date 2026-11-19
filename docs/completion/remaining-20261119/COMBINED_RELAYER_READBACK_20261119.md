# Combined relayer and deployment verification — 2026-11-19

Exact source: `6fe060e3`. The six integrated OP/status implementation and test
files match worker `a2afd126`; the four readback implementation/test files match
worker `8238f66b`. The integration preserves the separate changes without a
runtime conflict. All commands use Node 22.23.4 with a 512 MiB heap.

The adapter and relayer TypeScript builds pass. The combined eight-file relayer
selection passes **246/246**, including OP fees, receipt validation, restart,
required Anvil, startup, configuration and provider-agreement cases. The three
deployment/verifier files pass **64/64**. Neither final selection skips a test.
These targeted results do not claim whole-workspace coverage or full test-source
typechecking. Hosted checks on the published resulting candidate remain required.

The first relayer selection had **241 passes, one failure and four skips**. Its
mandatory Anvil prerequisite correctly failed because the two compiled contract
artifacts were missing in the coordinator checkout. The coordinator verified
the existing artifacts' SHA-256 identities and all **29 Solidity source hashes**
embedded in their compiler metadata against the current checkout before copying
them. The unchanged selection was then rerun with `REQUIRE_ANVIL=1`. This is
execution against previously compiled, source-verified artifacts, not a claim of
a new full Foundry build. The failed attempt remains in the packet.

Both attempts, actual commands, exit codes, durations, artifact source parity and
raw logs are retained in
[combined-relayer-readback-evidence](combined-relayer-readback-evidence/manifest.json).
