# Independent canonical devnet fixture review — 2026-11-19

**Verdict: PASS for the runner/helper repair and its bounded native evidence.**
Reviewer: `contract_security`. Source:
`5f6af961b25b9759497693ceb14b834bcae54f45`; test-first baseline:
`05f5631d759476793614913c8926cb1727e376b3`; author evidence packet:
`bd62f0737e34112253380a0919fc3aedaaf2c7db`.

## Source review

The implementation changes only `scripts/beta/browser-devnet.sh` and
`apps/web/e2e/devnet/prepare-devnet-manifest.mjs`. The focused regression file is
unchanged between its failing baseline and the repair. The production verifier,
both Solidity deployment scripts, reference announcer, ordinary fixture helper,
Pages browser spec/configuration and dependency manifests remain unchanged.

The runner retains its loopback endpoint, refusal to reuse an already listening
endpoint, tracked Anvil child and exit cleanup. Before installing the canonical
announcer runtime, it uses the existing helper checks for loopback HTTP, chain
84532, Anvil client identity and matching `anvil_nodeInfo`. It reads the compiled
CC0 reference artifact, rejects missing/malformed/empty runtime and requires exact
code readback after seeding. The reference has no constructor or storage
initialization, so runtime installation preserves its event-only behavior.

The runner then invokes the unchanged `Deploy.s.sol` with the canonical address.
That script retains chain, fee-recipient, code-presence and immutable readback
safeguards. The original `DeployDevnet.s.sol/31337` broadcast stays at its original
path for the three Pages stand-in tokens; the helper receives the distinct
`Deploy.s.sol/84532` router/sweep broadcast.

The helper requires chain 84532 in the broadcast and a canonical router
`ANNOUNCER()` getter. Existing schema/library validation and ordinary on-chain
manifest verification still precede public test-key signing and output. The
test key is finally wiped and the generated signature is verified. Default and
Pages browser execution tails are byte-identical to the baseline: no additional
mode, early successful exit, timeout expansion or browser skip was introduced.

## Evidence review

All **57** archived raw artifacts match their recorded SHA-256, original file
bytes and committed packet objects. The three runtime/test hashes and eleven
preserved-source hashes match their exact Git revisions. The final native replay
hash and extracted inline seed-program hash also match the reviewed code.

| Recorded check | Result |
| --- | --- |
| Focused helper/tooling baseline | 5 failed / 9 passed / 0 skipped |
| Old native fixture | Actual helper exit 1, canonical-announcer mismatch, no signed output; wrapper correctly records the expected failure |
| Same focused suite after repair | 14 passed / 0 failed / 0 skipped |
| Bash and both module syntax checks | All exit 0 |
| Final native deployment/readback/signature replay | Exit 0 in 14.598 seconds |

The final replay executes both original deployment scripts and the runner's
exact inline seed program. It verifies the normal manifest readback/signature,
preserves the original broadcast hash and all three token code locations, and
leaves both allowlisted public-token addresses empty. The recorded Anvil child
is stopped. The reviewer additionally verified the archived signed manifest
offline through the normal signature verifier and checked the reference
artifact's source metadata against the exact Solidity source commit. No new
Anvil process or browser was started for this review.

Two failed replay attempts remain explicit. The first merged a Node stderr
warning into the stdout address capture; the actual runner captures stdout only.
The second completed deployments/signing but invoked its independent check with
`node -e`, making the imported helper path `argv[1]` and triggering the normal
CLI guard. The final wrapper separates output streams and uses stdin for that
check. All original acceptance assertions remain; an additional assertion checks
that public allowlisted token addresses still have no code. Runner/helper source
stays at `5f6af961` for all three attempts.

## Qualification limits

This is fixture preparation, native contract readback and public test-signature
evidence. It does not establish browser acceptance, public deployment, real
OP fees, a release trust root or funded-wallet behavior. The local oracle remains
the existing zero-fee stub. The review neither changes the canonical production
guard nor qualifies the deliberately absent public ERC-20 contracts. Static
claims are limited to the recorded syntax/build checks; no new lint, TypeScript,
full coverage or fresh dependency-install result is asserted.

The [machine record](DEVNET_FIXTURE_CROSS_REVIEW_20261119.json) pins the source and
author packet. Its [read-only verifier](evidence/devnet-fixture-cross-review-20261119/verify.mjs)
checks existing files/Git objects and performs an offline signature check only.
The full author packet remains
[workflows-devnet-fixture.md](../../completion/remaining-20261119/workflows-devnet-fixture.md).
