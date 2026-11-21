# Independent recovery and privacy composition review

**Decision: no blocking finding in the inspected scope. Overall integration remains on hold pending the remaining source review, required execution gates, and coordination-lock reconciliation.**

## Exact source

Reviewed candidate: `1b24404fe045c512212c417b692246b4e8fb2814`; tree: `4a34b34d2e562b592dd439339718294e986f5c0f`.
Initial candidate: `e5fc1f811fd4bbe55f7ec4314b3b54db1b65cd5e`. Preserved parent #367: `50ccf5c8b396247b524e5115ebe51575ca79d318`. Incoming parent #361: `4ccb3db334de7d7cada305a11243c9e3efddc4f6`.

Reviewer: `/root/recovery_security_round2`. Application source was read-only. No remote action, real funds transaction, deployment, release or non-fixture signing occurred.

## Scope and findings

This review inspected the complete payment export/recovery implementation and standalone decoder, their UI lifecycle and consent controls, session/key-vault changes, endpoint capability enforcement, wallet disclosure, native Sweep review, the listed manual source resolutions, and the five-file correction delta through the final candidate. `REVIEW.json` records 44 inspected files with exact Git blobs, SHA-256 values, and whether review was complete-file, changed-section, or contextual.

- Secret exports require a credential that decrypts to the current seller key set. Missing vault storage cannot silently authorize export. Public records and encrypted master backups do not claim to preserve the invoice-signing key.
- Asynchronous result acceptance checks session revision and deadline, cancellation, panel identity, selected payment set, chain, and endpoint. Recovered scalar buffers are boxed and disposed; `SecretBox.copyOf` was verified to wipe its input by default.
- Master recovery works without an original seller session. Replacing loaded keys requires an explicit warning tied to the held recovered keys and original session. A supposedly retained browser vault is rechecked before a weaker replacement warning can authorize installation.
- Private payment export checks the derived key against the recorded address and requires an account-code query limited to that exact address. The production service layer refuses RPC construction without its own opaque, current grant. Endpoint settings changes, app lock and session changes revoke grants.
- Wallet disclosures capture exact request parameters, expire on two clocks, and are revoked by account, network, page and privacy lifecycle changes. Native Sweep confirmation consumes one review and compares the newly prepared serialized transaction and fee reserve with the approved values.
- The newer SellerKeys durable-write ownership, unlock preflight and sole-copy idle recovery code remains intact: its parent diff only adds the two recovery panel imports and conditional mounts. The Sweep conflict resolution retains the current-review guard across the extracted preparation awaits.
- All 67 intentional non-Pages exclusions were checked against preserved parent, donor and candidate blobs: 201 comparisons, zero mismatches. These exclusions remain deferred even though donor commits become ancestors of this composition.

Two implementation-worker corrections were independently inspected. The real-server test now checks a padded 400 refusal followed by exactly one unpadded 200 compatibility retry against the retained server. Unsupported `client_queue_full` responses no longer count as proof that a broadcast did not occur. The newly recovered strict Sweep journal parser preserves malformed-record refusal and existing unresolved locks.

No new blocking product defect was confirmed by this reviewer. This is not an endorsement of paths outside the stated scope.

## Executed verification

| Check | Source | Exact result | Duration |
|---|---|---|---|
| Web export, expiry, UI and application-to-standalone interoperability | `e5fc1f81` | 11 files; 115 passed; exit 0 | 12.34 s |
| Portable codec and property tests | `e5fc1f81` source; relevant files unchanged in final head | 2 files; 65 passed; exit 0 | 18.45 s |
| Standalone decoder, fresh-directory recovery and cross-implementation checks | `e5fc1f81` source; relevant files unchanged in final head | 22 passed; 0 failed/skipped/cancelled; exit 0 | 8.58 s |
| Endpoint authority, wallet disclosure, privacy reveal and native Sweep review | `1b24404f`, identical before/after HEAD | 10 files; 249 passed; exit 0 | 10.36 s |

**451 distinct executed test cases passed.** Counts do not include the first authority run a second time. Original Vite/Vitest configurations and assertions were retained; no coverage threshold was claimed from these bounded runs.

The first export command incorrectly named a nonexistent `apps/web/vitest.config.ts` and failed before test discovery. The corrected command ran from `apps/web` using its actual Vite/Vitest configuration. The first authority run passed 249 tests while a source commit landed, so it was deliberately superseded by a second run whose before/after HEAD is recorded. All commands, working directories, source pins, exit codes and log hashes are in `REVIEW.json`; the latter run has an additional exact-head metadata receipt.

## Source fingerprints

| File | SHA-256 at final reviewed head |
|---|---|
| `apps/web/src/lib/paymentKeyExport.ts` | `5864fbbce2374e260b2a060167846289892bf58b7099da050562357466577d75` |
| `apps/web/src/lib/paymentExportRpc.ts` | `b2ee8e2a4881840c4ba89c8c434a47652820200e6ab0d5e209549be7839c0b31` |
| `packages/ux-vault/src/stealth-export-portable.ts` | `d0bad95bd056f18c0fc91e26558505fd116754e75d0ac1bb17fb41606622403f` |
| `apps/web/src/lib/session.ts` | `1c847443c605a270cddea3f7c07dc62dd2e65bfc20a12ee936206aaa59479672` |
| `apps/web/src/views/SellerKeys.tsx` | `c317e4340f0f7881f2dad28edb52eb3cb37414ad2f98c3a48ccfdad35b7e51d0` |
| `apps/web/src/lib/networkAuthorization.ts` | `3bcc735e14fd5245c12ea5d391502affa802cb5c6f7c5ff9b457c2b2b1c060ea` |
| `apps/web/src/lib/wallet.ts` | `fa4d8d1f9f93b5f7b1c8446df1402f205f406b8c618bb5d3e7b6b5722873101e` |
| `apps/web/src/lib/sweep.ts` | `fe9b5f5680018db61c8c24dc1e1c15e60d0192bf1b24ec382b12b808ba761441` |
| `scripts/recovery/stealth-export-recover.mjs` | `889c3b2cfb25b997d5304bbf4349a5b8d7444467a6ff12e4db4c872673d8c888` |

## Remaining qualification and handoff

The final candidate changes 1845 paths against #367. `RUNTIME_NOT_COVERED_BY_THIS_REVIEW.json` identifies 117 additional runtime/tool/config paths not substantively covered here; it is a scope inventory, not a claim those paths are defective or unreviewed elsewhere.

The next independent review should cover privacy persistence/reconciliation/clipboard and the remaining non-EVM/shared-package deltas. Full exact-head typecheck, lint, coverage, browser/mobile/Anvil/Tor, Pages artifact and dependency/secret checks remain the implementing/integration workers' gates. This reviewer did not execute or claim those gates. The hardcoded compiler cache hash was not independently fetched from the upstream binary manifest, and the Pages workflow changes were source-inspected but not executed here.

`SOURCE_PROVENANCE.json` was still untracked at final inspection. The implementation owner must commit/reconcile it with final source and attach this receipt to the existing authoritative consolidation record. Later changes require an appropriate delta review and affected rerun. Shared-target mutations remain paused until the coordinator reconciles the existing integration-lock ownership; this review cannot authorize expiry-based takeover.

Receipts: `REVIEW.json`, `exclusion-verification.json`, `authority-composition-exact-head.json`, `RUNTIME_NOT_COVERED_BY_THIS_REVIEW.json`, and the referenced raw logs.
