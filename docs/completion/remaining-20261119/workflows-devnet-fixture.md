# Canonical browser devnet fixture

The local browser fixture now satisfies the same canonical-announcer check as an ordinary Base Sepolia manifest.
The original failure was reproduced with actual Anvil deployments before changing the runner or preparation helper.
The corrected native deployment, manifest readback and public test signature pass. This packet does not claim browser
execution or public-chain qualification.

## Source and integration

Worktree: `GhostPay-devnet-fixture`; branch `chatgpt/ghostpay-devnet-canonical-fixture-20261119`.
Base: `f42553ab44d2bf8f544f0287656bbc184679014d`. The coordinator explicitly assigned this fixture followup after
the stronger deployment readback implementation exposed the existing synthetic-84532 fixture mismatch.

The readback dependency is backlog_ci's `b1a7c888` and `8238f66b6beafb46a7a2d1598e5c4c354819fc86`, imported locally
as `49c89885` and `29355af7`. The coordinator integrates those peer commits separately. Apply only the following own
commits, in order, followed by this evidence commit:

`764dcb63` (claim) → `05f5631d` (regressions) → `5f6af961` (runner/helper repair).

The regression and native result are pinned to their recorded source revisions, independent of this later evidence
commit. No production verifier, contract, dependency manifest, release deployment, Pages browser spec, browser
configuration, browser isolation code or excluded owner stream was edited.

## Failure and repair

The old runner deployed `DeployDevnet.s.sol` on chain 31337 and then changed that owned local Anvil to 84532. Its
preparation helper reused the original custom-announcer broadcast. Known-chain verification correctly rejected that
manifest with `manifest announcer is not the canonical announcer`, before signing or creating output files.

The corrected runner retains that original deployment and its exact broadcast path because the Pages `c2` test uses
the three stand-in token records. After switching the owned node to 84532, it uses the existing loopback transport and
`assertLocalAnvil` checks before installing the existing compiled CC0 reference announcer runtime at the imported
`CANONICAL_ANNOUNCER` address. The installed runtime must read back byte-for-byte. It then runs the unchanged
`Deploy.s.sol` on 84532, with the existing public Anvil signer and fee recipient, to deploy a new router and sweep relayer.
Forge output, cache and both broadcasts stay inside the runner's temporary directory.

The helper now requires the new 84532 router/sweep broadcast and the canonical `ANNOUNCER()` getter. Its existing
schema validation, chain-adapters validation, ordinary on-chain verification and public Playwright-key signing sequence
remain intact. The verifier checks the router immutables, router/sweep runtime hashes and announcer code before any
signed manifest or browser state is written.

Default and `pages` remain the only runner modes. Their browser-execution tail is byte-identical to the peer baseline:
the normal runner still invokes its required Playwright journey. There is no added early-success or fixture-only mode.

## Executed qualification

Checks used pinned Node 22.23.4 with a 512 MiB heap cap and the shared qualification mutex. Native checks used Forge
and Anvil 1.8.5 and offline solc 0.8.28. Dependency directories were independent copies; relevant dependency sources
and manifests match the recorded copy origin. Chain-adapters was rebuilt from this worktree before either RED check.
This is not a fresh `npm ci` claim.

| Check | Actual result | Source | Seconds |
|---|---|---|---:|
| Local chain-adapters build | exit 0 | `05f5631d` | 5.253 |
| Manifest tooling RED | 5 failed, 9 passed, 0 skipped | `05f5631d` | 3.743 |
| Native old fixture | Helper exit 1 with canonical-announcer mismatch; replay successfully proves expected failure | `05f5631d` | 6.643 |
| Manifest tooling GREEN | 14/14 passed, 0 skipped | `5f6af961` | 2.048 |
| Bash runner syntax | exit 0 | `5f6af961` | 0.005 |
| Helper module syntax | exit 0 | `5f6af961` | 0.080 |
| Test module syntax | exit 0 | `5f6af961` | 0.089 |
| Final native fixture/readback | exit 0; both deployments, exact runtime seeding, signing and independent verification | `5f6af961` | 14.598 |

The focused suite includes the five existing manifest-tooling tests and nine added helper tests. It accepts the actual
84532 router/sweep-only broadcast shape, verifies the resulting public test signature, refuses the old 31337 broadcast,
and refuses a noncanonical getter, missing canonical code or failed router deployment receipt. Existing loopback,
chain-id, Anvil-client and Anvil-node-info boundaries are exercised with no signed output on refusal.

The native GREEN replay executes the exact inline seeding program extracted from the runner, both unchanged Solidity
deployment scripts and the actual preparation helper. A separate readback invocation verifies the generated signature
and the normal on-chain manifest checks again. It also proves:

- The original 31337 broadcast SHA-256 is unchanged after the canonical deployment.
- All three original stand-in token addresses retain code.
- Both allowlisted Base Sepolia token addresses still have no code; the fixture has not fabricated ERC-20 acceptance.
- The canonical runtime matches the compiled reference bytes.
- The owned Anvil process is stopped at the end.

The final local router is `0x0165878A594ca255338adfa4d48449f69242Eb8F`; the sweep relayer is
`0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`. These are ephemeral local evidence, not public deployments.

## Retained replay failures

Both initial GREEN replay failures are preserved; neither prompted a runner or helper source change. The first replay
combined the existing Node `EnvHttpProxyAgent` warning on stderr with the canonical address on stdout, then compared
that combined log with the address. The actual shell runner captures stdout only. The replay now records the streams
separately and checks the actual stdout.

The second replay completed both deployments and helper signing, then its independent `node -e` verification call
passed the helper filename as `argv[1]`. The imported helper correctly took its CLI entry path and refused missing CLI
arguments. The replay now executes its verification module through stdin, preserving the helper's normal CLI guard.
The corresponding failure receipts, raw logs and exact replay versions remain in the packet. Final source is still
`5f6af961` for every GREEN attempt.

## Independent review and limits

Root and contract_security independently reviewed `5f6af961` and reported source PASS. They checked endpoint/chain
admission before seeding, compiled runtime provenance and exact byte readback, the unchanged deployment safeguards,
canonical verification before signing, preservation of the original token broadcast and mandatory browser branches.
The review is separate from the executed results in the table.

The repository ESLint configuration intentionally ignores `.mjs` files. The scoped static evidence is Bash syntax,
module syntax and actual module execution; this packet makes no ESLint or TypeScript claim for those scripts.
No browser was launched for this task, and the native replay never emits a browser-pass result. Combined-head hosted
application and browser acceptance remains coordinator-owned. Historical browser runs are not relabeled as evidence
for this source.

The complete command arrays, source revisions, source-preservation checks, replay versions, both retained failures,
native broadcasts, compiled reference artifact, signed fixture, browser-state fixture and SHA-256 hashes are in
[`workflows-devnet-fixture.json`](./workflows-devnet-fixture.json) and its 57 archived raw artifacts.
