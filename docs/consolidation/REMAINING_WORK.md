# Remaining actionable work and blockers

Checkpoint: 2026-11-19 UTC. Latest verified main: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Branch: codex/ghostpay-consolidation-records-20261119 ([PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273)). Initial baseline: 14ded337a10c140d7a9f9a9238ec038587d925bb.

Read [HANDOFF](HANDOFF.md), [FEATURE_MATRIX](FEATURE_MATRIX.md), [SECURITY_AUDIT](SECURITY_AUDIT.md) and [REMAINING_WORK](REMAINING_WORK.md) together. Verification below is source-bound; no release or feature-complete declaration is made.

## Ordered integration and engineering queue

| Priority | Work | Concrete next action / gate |
|---|---|---|
| 1 | Current #271 adapter candidate | Head 429a4de80b9ec53177b17d89d18ce8ec91a08814 includes main and unchanged tested fixes. Finish hosted build, browser, native/integration and security checks. Inspect actual failures; do not remove contiguous-range validation. Merge only under owned live lease and fresh expected head. |
| 1 | Current #272 consent + lifecycle candidate | Head 63ff40d57af879a3d82166450f63aadb7bf0d5ff, base main. Complete current-head hosted gates; the superseding CI/CLI/Pages/beta runs are already pending/queued on the same source. Finish those runs; do not duplicate the old cancelled attempts. Retain #252 ancestry, 142-case controls and post-handoff journal outcomes. No separate destructive update to #252 is needed. |
| 1 | Exact policy fixture repair | Published #275 at dc821780e05483d1b35062a74b07be7ed9ca2f1c recovers only cd4539d2's six additions/two deletions. Parent73545f63112910d46002718354ab5e99f8652e1f preserves earlier fefcd57f ancestry. Prove builder/encoder rejection and retain deliberately malformed signed on-chain negative case. Different #270 lock versions require exact dependencies; native Anvil/forge/solc are absent locally. Do not use a partial install or relax INVALID_PROOF. |
| 1 | Broad #264 source/type/lint failures | Read jobs 135458055441, 135458055449 and 135458055648. #270 already fixes removed stripComments import and 21/35 diagnostics. Remaining 14 scan/test diagnostics overlap active b0abb726/1b010ec9, now carried by #269. Qualify those existing owners' work rather than duplicate it. |
| 1 | Keypair export/recovery + immediate idle suspension | Select current source from #260/#256 and already-composed #262/#264 files. Preserve atomic staging, prior wallet on failure, cancellation, unload protection and synchronous revocation. Run wrong-key/password/corruption/size/duplicate, fresh-browser/offline and independent-wallet acceptance. Verify manual lock, sleep/wake, background/pageshow, timeout and protected operations after unlock. This required work is unintegrated, not deferred. |
| 1 | Fresh export authorization | #269 carries b0abb726; final GREEN/inventory evidence was interrupted. Confirm fresh explicit authority is tied to original endpoint/chain and current session/settings, forbids fallback, cancels/disposes correctly and does not leak key material. |
| 1 | Broad security gates | Resolve #264 high CodeQL attribution through an available supported source/export; retain strict Mythril requirements. Do not merge a broad candidate with unresolved high-alert attribution or failing analyzers. |
| 1 | Pages-artifact verifier races | #276 runtimeb1387068 has two independently reproduced mutable-filesystem false-success paths despite5 original groups passing. Finish the isolated follow-up: parse the exact hashed build-info bytes, bind regular/no-follow reads, retain the newly added CLI control and document the stable/private-input boundary. No deployment operation is involved. |
| 2 | Documentation recovery/checkpoint | Finish #273 exact-tree publication/readback, validate links/JSON/source pins and final-head doc checks. Preserve #259 source ancestry and all dated archives. A doc pass does not qualify application code. |
| 2 | Strict JSON / merchant clock / scanner schemes | Compare #265/#268 with #270 (11:05 sourcefefcd57f; later73545f63) and updated #262 ec81ab8e. Preserve dense-array controls and signed-profile tests; requalify the selected combined source and avoid duplicate ports. |
| 2 | Hosting timestamp #267 | Original kit 284/15 plus focused controls are complete. Finish current-head gates and resolve current-main ownership conflict if present; native hosting stacks/browser acceptance remain conditional. |
| 2 | Jitter rollback #274 | Independent original tests 13/13, baseline 11/2 and source approval are complete. Scoped lint was killed 137; resolve only additive current-main claims and obtain exact-head CI before merge. |
| 2 | Updated source reconciliation | #262 ec81ab8e now includes main c977b5d6; #269683f8587 and #270 (later73545f63) remain stacked with conflicts/unfinished checks. Recompute exact diffs and preserve all active claims before composition. |
| 3 | Comprehensive parser/crypto fuzz qualification | Run source-bound property/fuzz campaigns for invoice/QR payloads, addresses/network IDs, backup import and serialization on the final candidate. Existing JSON/TRON harnesses cover bounded cases only; this broader required gate remains unrun. |
| 3 | Remaining native/browser/UX qualification | Existing Chromium launch is blocked by process-socket policy. Use a supported executor/hosted jobs, not assertion changes or unsupported flags. Obtain native artifacts/nodes, mobile file transfer, keyboard/screen-reader, native-language and real Tor/provider evidence. |

## Exact dependency and execution boundaries

The successful main-based selected-web installation used the committed main lock. Broader #270 uses different locked viem/Vitest versions; reusing main's package bytes without version/integrity verification is not exact-lock testing. The narrow policy lane's npm preparation was killed 137 and the runtime restarted, deleting /tmp; a subsequent bounded attempt failed ENOSPC. Its original unit/type/lint and native Anvil gates remain unrun. Completed source/tests/reports are distinguished from incomplete installs. Avoid concurrent heavy builds; rebuild only the required dependency closure in a stable slot.

The earlier optional full invoice-schema coverage run ended without a final result and showed three KDF/passphrase timeouts. Those sources were unchanged by the merchant-clock patch; no regression attribution or coverage pass is established. Resolve with an appropriately provisioned original-config run, retaining every timeout/threshold until evidence justifies a specific correction.

## External or policy boundaries

- Public deployments, releases, real funds and fee activation remain unauthorized/deferred. Authenticated deployment/runtime/feed/provider evidence cannot be synthesized.
- Guardian/escrow/new policy authority and BTC hosted mode C remain outside the active Pages scope; preserve their source/model evidence without activation.
- Real wallet, device, camera, screen-reader, native-language and route acceptance require actual evidence. Local unit/fuzz successes do not substitute.
- Paused #218 lane ticket lifecycle is a documented low-severity invariant with an exact reproduction. Address when that service lane resumes; no current public exploit is asserted.
- Canonical announcer/registry runtime hashes remain unverified; preserve existing Router/Sweep manifest checks and distinguish source-backed metadata from live qualification.

## Branch completion rule

Every original 278 branch has a disposition. The later 285-head snapshot adds seven branches and advances three nonmain heads; none disappeared. The 11:18 delta reaches 287 branches with two further additions and two advanced nonmain heads. Those dispositions are not proof of semantic completeness or permission to delete. Re-read refs and PRs after each merge, append late work separately, and revisit any branch with newly unique source.

Stopping condition remains the user's: continue safe independent work while resources and ownership permit. A pending check is not a pass; a held lease is not a takeover opportunity; a runtime interruption must lead to durable source/checkpoint preservation. Never promise background continuation without an actual persistent mechanism.
