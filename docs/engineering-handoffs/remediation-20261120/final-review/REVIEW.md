# Independent final remediation review — 2026-11-19

## Verdict

**BLOCKED — WITH PRECISE REMAINING REQUIREMENTS**

The bounded remediation changes pass this independent source review and focused verification. This verdict applies to overall release readiness: the final hosted matrix, security clearance and external deployment requirements are not complete. It does not label the five reviewed file changes defective or authorize publication.

## Source and scope

- Reviewer: `/root/final_independent_review`, separate from all three implementation/audit lanes.
- Baseline: PR #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`; main was reported as `c977b5d6723f6822c3b5d86cd6b231712c53c395` by the coordinator.
- Frozen local combined source: `1f82abc5e21d745e9bf82f6de5ba9ded5fd29248`, tree `80fd34834ccdbc81bf8f5fc63ba76edb52905ef1`.
- The source was not yet published at review completion. Any connector reconstruction must retain exact trees and ordered parent mapping, and hosted results must identify the actual published/checkout commit. Local source identity is not a substitute for that receipt.
- [COMBINED_SOURCE.json](COMBINED_SOURCE.json) proves exactly five non-documentation files changed, each identical to its reviewed input. All 13 control scopes are unchanged, including workflows/actions, dependencies, contracts, signing/session/network runtime, test configuration, artifact verifier and hosting ADRs.

No production application, cryptographic primitive, custody policy, contract, fee, dependency, workflow permission, analyzer configuration or test threshold changes are present in this remediation package. The production change is six lines in the Pages build script that invoke the existing integrity verifier before output promotion.

## Reviewed changes and conclusions

| Scope | Independent conclusion |
| --- | --- |
| Pages promotion gate, `308dcbb2d40793514ea303a898282578dc17342d` | The builder verifies staged bytes against its generated checksum manifest and exact source commit before either final site/evidence move. `set -e` propagates verifier failure. The retained log records the successful check. No privileged attestation job changes. This closes a qualification integration gap, not a demonstrated custody exploit. |
| CodeQL fixtures, `008ccdcf05b703cea51ffc4fdaa42fc279281d81` | Both edits explicitly construct the same deliberate malformed input. The deployment fixture still inserts a top-level `__proto__` member into JSON from a known object. The CSP fixture still adds a duplicate content attribute to the known single meta tag. Existing rejection assertions remain intact. No escaping routine, alert dismissal, suppression or production validation was changed. A new CodeQL run must determine the final alert status. |
| Sweep tests, `3814ad2efffc6588f1c176a39b1090033f2f3537` | Eleven new cases use actual stealth key derivation, EIP-1559 signing, signer recovery, client transport and network capabilities. The RPC response producer is synthetic and in memory. Assertions observe final transport dispatch, exact expected transaction hashes, journal state and secret-buffer zeroization. Native and ERC-20 revoked dispatch is blocked. The tests do not claim browser or real-chain acceptance. |
| Combined source, `1f82abc5e21d745e9bf82f6de5ba9ded5fd29248` | Every changed blob equals its independently reviewed source. No conflict resolution altered the five changes or the 13 control scopes. No integration-specific blocker was found. |

The conservative `unknown-after-handoff` outcome can remain even when a revoked transport refuses a request before transmission. These tests correctly distinguish that journal state from observed dispatch and do not turn uncertainty into a claim that funds moved.

## Independently executed evidence

| Execution | Actual outcome and limit |
| --- | --- |
| Sweep boundary/native-review/review-authority selection | 68 passed, 0 failed, 0 skipped on Node v22.23.4. This is 11 new cases plus 38 and 19 existing cases. Source/test blobs exactly match the combined candidate. Focused coverage collection was disabled explicitly; no complete package coverage claim. |
| Final combined builder promotion block | 7 passed, 0 failed, 0 skipped. The real shell promotion block and verifier accept intact staged input and reject modified, missing, unlisted, symlinked, duplicate-checksum and wrong-source input before promotion. Synthetic staged artifacts; not a full Vite build. |
| Fresh full Pages artifact | Independently verified all 16 served files against the fresh build-generated SHA256SUMS, required source `1f82abc5e21d745e9bf82f6de5ba9ded5fd29248`, checksum-record digest and site-safety verifier. No safety problems. The new automatic verification receipt is present. |
| Source and policy comparison | Five reviewed blobs identical; all 13 control scopes unchanged; diff check passed. |

The independently inspected artifact has `paymentsEnabledChainIds: []`, lean profile and clean release build mode. Its checksum-manifest SHA-256 is `ac1b4953087dc67ed59c832fe1386067190bc30b555263f9ab24c4db0abdf9f2`. Its recorded origin is `https://djshellshoxxx.github.io` with `sharedOrigin: true`. This does not satisfy dedicated-origin approval. The `release: true` field describes build mode, not release readiness.

The coordinator separately reported a clean Node22/npm10 dependency installation (721 packages), 65 library builds, the full builder and focused aggregate runs (168 Pages/CSP, 68 Sweep and 13 deployment fixture tests), plus source-secret, action-pin and production dependency-tree checks. Those are coordinator executions; this reviewer did not reproduce every aggregate command. The [artifact specialist review](../artifact-review/) and [CI audit](../ci-audit/) retain their separate evidence. Counts overlap and must not be summed into an inflated whole-product total.

## Precise remaining requirements

1. Publish the frozen source with verified provenance, then obtain fresh applicable hosted results for the actual candidate. The earlier `d74` browser scenario failed in both profiles, and its CodeQL check reported two High fixture annotations. The new fixture source is reviewed, but its CodeQL outcome is pending. The separately owned preflight observation repair must pass the real browser job. Cancelled, absent or skipped required checks are not passes.
2. Obtain and record the exact-current strict contract analyzer result and complete finding-specific disposition/security acceptance and the mandatory external review. The current Mythril campaign was last reported running. Historical findings and internal replay evidence do not establish a current pass or waive that gate. This reviewer executed no contract campaign and asserts no repository-wide zero-vulnerability count.
3. Resolve the hosting policy documented in accepted ADR-0015 (`docs/adr/ADR-LOG.md`) and proposed ADR-0029. Record the actual owner-approved demonstration scope, exact origin, DNS/HTTPS evidence, Pages environment and publication approval. The inspected shared-origin artifact is an inspection build; a project subpath provides no origin isolation. Rebuild and verify after selecting the approved origin.
4. Complete the applicable authenticated release/signing requirements and independent-machine reproducibility, with approved public keys/fingerprints and exact artifact/source provenance. This local checksum verifier does not authenticate an attacker-provided manifest, establish a second-machine build or verify a published site.
5. For the EVM testnet milestone, obtain authorized deployment and verified contract addresses/bytecode, a release-signed testnet manifest, and actual wallet payment/confirmation/private-scan/receipt/native-sweep/restart/recovery acceptance. No external-testnet transaction evidence was produced by this reviewer. Mainnet remains out of scope.
6. After authorized deployment, verify live source metadata, the complete served inventory, `/GhostPay/` navigation and the required browser/device/security journeys against that exact artifact. No live publication was performed or independently accepted here.

This review does not establish that every required beta feature and every historical branch is complete. It confirms the bounded source changes and exercised boundaries, while leaving the incomplete release matrix and owner/external requirements explicit.
