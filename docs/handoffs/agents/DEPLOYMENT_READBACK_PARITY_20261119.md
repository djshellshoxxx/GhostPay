# Deployment readback parity — 2026-11-19

## Outcome and sources

Implemented the remaining F-DEP-02 / spec-01 lower-verifier and optional-relayer
readback gap. Source base: `db724aa68a21fde8fe35c14baab9ec55a40984f0`;
claim: `b1a7c8885f9e5dc3a33d11a33b13175e55094ca8`;
branch: `chatgpt/ghostpay-deployment-readback-20261119`.
Author: `backlog_ci`. Independent source reviewer: root coordinator (PASS,
including all eight reads, canonical known-chain behavior and caller context).

The lower `verifyManifestOnChain` previously accepted a known-chain manifest and
router that agreed on a noncanonical announcer. It also had no way to require
agreement from a supplied secondary. Relayer `buildChainClients` checked the
manifest only through the primary even when `secondaryRpcUrl` was configured.
Both wrong-accept paths were reproduced before the runtime changes.

Requirements and existing authority:

- `docs/specs/01-manifest-readback.md`, rules 1, 2, 5 and 6: provider identity,
  readback agreement and refusal on failure. Its implementation-status note
  explicitly supersedes the old proposed announcer-codehash/signature/cache design.
- `docs/CONTRACTS_SPEC.md`, section 1: existing canonical ERC-5564 announcer.
- `packages/chain-adapters/src/verify.ts`: existing `canonicalAnnouncer` policy and
  `VerifyDeploymentOptions`; `rpc.ts`: existing `requestWithFallbackCheck`.
- `apps/relayer/src/config.ts`: existing explicit `secondaryRpcUrl` and signed
  manifest configuration.

## Changes

`deploymentsVerify.ts` now accepts the existing optional verification-options
shape, rejects a required-but-absent or wrong-chain secondary, and checks the
manifest against the existing canonical announcer on known chains. Every getter
and bytecode read uses `requestWithFallbackCheck` when a secondary is supplied.
This includes policy implementation and factory code. Existing single-provider
calls remain valid; no provider is selected automatically. The existing unknown
development-chain behavior, including local chain 31337, is preserved.

`runtime.ts` creates a read-only client only for the explicitly configured
secondary URL when checking a manifest, verifies its chain through the existing
client constructor, and requires it for that readback. Endpoint failure,
disagreement, missing code or a wrong chain prevents startup. Existing public and
wallet transports and transaction authority are unchanged.

No new address, codehash, signing rule, dependency or chain enablement was added.
No web, Settings, Pay, default-services, contract or deployment-script source was
changed. Browser secondary-provider consent/wiring remains with the #251 owner.

## Verification

All checks used Node 22.23.4, the unchanged lock blob
`7c405185908b8d8e2410b5aba2ad1800f95d1547`, independent copied dependencies,
`qualification.lock` and a 512 MiB Node heap. The JSON receipt records commands,
exit codes and SHA-256 hashes of source and raw evidence.

| Check | Actual result |
|---|---|
| Lower-verifier regression baseline | Exit 1: 12 failed, 15 passed |
| Relayer regression baseline | Exit 1: 6 failed, 10 passed |
| Corrected lower/higher verifier and manifest suites | 64 passed; 0 skipped |
| Corrected runtime, config and source-check suites | 149 passed; 0 skipped |
| Unchanged web manifest consumer suite | 14 passed; 0 skipped |
| Chain-adapters and relayer workspace typechecks | Both exit 0 |
| Chain-adapters and relayer TypeScript builds | Exit 0 |
| Combined four-file ESLint process | Exit 134: local 512 MiB heap exhausted |
| Separate scoped ESLint process per workspace, unchanged rules | Both exit 0 at 512 MiB |
| Diff and committed-file secret scans | Exit 0 |

The baseline test patch and all raw outcomes, including the lint exhaustion, are
retained in `evidence/deployment-readback-20261119/`. The 227 passing focused tests
are not a full-workspace coverage or hosted acceptance claim.

## Remaining compatibility and acceptance

The separate browser devnet fixture requires correction before its next native
qualification. At the source base, `scripts/beta/browser-devnet.sh` deploys
`DeployDevnet.s.sol` on 31337, changes the local Anvil chain ID to 84532, then gives
that old broadcast to `apps/web/e2e/devnet/prepare-devnet-manifest.mjs`. The script
created the announcer at a fresh noncanonical address; the helper verifies the
result as a known-chain 84532 manifest. The strengthened canonical check correctly
rejects that synthetic fixture. This is a source-backed incompatibility; no native
Anvil or Playwright campaign was run for this change.

The coordinator assigned the follow-up to `workflow_fixes`. A source-backed
candidate is the existing local `scripts/testnet/deploy.sh` rehearsal pattern:
seed the compiled CC0 reference runtime at the existing canonical address on the
verified loopback Anvil, run existing `Deploy.s.sol` for the 84532 router/relayer,
and make the helper verify that broadcast. Preserve the original 31337 broadcast
because `pages-devnet.spec.ts` still uses its stand-in-token evidence. This is a
candidate for the fixture owner to reproduce and qualify, not a completed change.

No public RPC, deployment, browser acceptance, release, overall F-DEP-02 closure
or combined-head full CI success is asserted. The distinct structured/raw-text
signature APIs and unsupported proposed spec fields were not redesigned.
