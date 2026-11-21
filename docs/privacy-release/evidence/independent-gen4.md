# Independent generation 4 source review

Reviewer: `/root/privacy_review_gen4`. This is the coordinator's faithful record of the completed read-only review, followed by separately attributed repair and execution evidence. The reviewer made no source changes and ran no tests, typecheck, lint, build, browser check or transaction. This is an internal agent review, not an external professional audit or release clearance.

## Immutable review inputs

| Commit | Reviewed scope |
| --- | --- |
| `1130e9dbb8b85a81d2d82941ecd681c76b2b033d` | Initial composed v1 wallet lifecycle and v1.1 disclosure |
| `2bdd3ec4af22acd35735ba50f6eae302d434f43a` | Merchant retention generation 3 |
| `43a5c315dd1d2441c5f33bb42b1b4dffcc9b577c` | Final v1 outputs and joint merchant minimal-mode/retention case |
| `881429236b0ae75ed2294cadbcba43d60f0ed444` | Reviewed observer and retention-confirmation repairs; tree `e019f40c87b9baf5038020996d03fdf634febfef` |
| `32930d6615310e78009b525841fec58cba07f805` | Separately reviewed standalone-v1 stale-settings masking repair |

The required-release specs and repository security invariants were included in the review. Future privacy issues were excluded. Findings below describe these git objects, not an unpinned moving worktree.

## Findings and disposition

### 1. Refused stale settings edits could remove masking

At `1130e9db` and `43a5c315`, `AppShell.updateSettings` handled a stale execution-settings revision by assigning `loadSettings()`. If another tab's execution write was visible before its storage event, missing, corrupt or unavailable UI privacy storage could restore the default unmasked preference. The execution edit was correctly refused, but the current tab's presentation preference was lost.

Repair `32930d66` uses a functional state update combining fresh execution settings with `loadPrivacyPreferences(current)`. The reviewer verified preservation of the stale-edit refusal, exact newer execution bytes, cache/session-endpoint clearing, settings revision refresh, network invalidation and `false` return. Six regressions cross clipboard/form edits with missing/corrupt/blocked privacy storage, preserving drafts and session while allowing a later deliberate visual toggle.

Execution belongs to the separate masking generation: six behavioral RED cases and 40/40 passing cases in four complete files. See [masking generation 3](masking-gen3.md). This reviewer inspected the repair and tests without rerunning them.

### 2. A revoked wallet could leave Pay's old read authority active

At `43a5c315`, account/chain/disconnect events revoked the Pay view's wallet scope, but runtime RPC acquisition used only the network signal. A previously dispatched native send returning a hash could then start verification and receipt reads through the obsolete operation. Static inspection established the continuation path, not HTTP-wire traffic or an exploit.

The reviewer assigned the narrow question to a fresh wallet generation rather than changing the transport or applying an expiry-sensitive signing guard after broadcast.

**Subsequent, separately attributed disposition:** wallet generation 3 reproduced six lifecycle cases using actual App/Pay and NetworkAuthority with controlled RPC recording. Runtime `3ef264facbde9ffb93abfde231a91e58d5f9772c` captures wallet authority before RPC acquisition, combines wallet and network cancellation signals, and asserts the captured scope after acquisition. Known hashes, unknown outcomes and duplicate-attempt evidence remain preserved. Its 17 lifecycle and 271 related original cases passed in separate selections. The coordinator verified the retained logs and exact diff after the worker turn ended before its documentation commit; this was not a coordinator test rerun. See [wallet generation 3](wallet-gen3.md).

### 3. The shared wallet observer repair preserves revocation boundaries

The former `walletAuthority` registration could silently skip monitoring when only one event method existed and could allow retained callbacks during removal. At `88142923`, it delegates to `observeWalletLifecycle`, preserving partial-subscription cleanup and making callbacks inert before provider removal. Partial capability rejects before disclosure/provider reads. Both event methods absent retains the existing account/chain recheck fallback, whose limitation remains documented.

The reviewer inspected missing-method send/sign cases, subscription-then-throw cleanup and reentrant removal while preserving a submitted journal. Immutable request capture, account/chain assertions and returned-hash handling were unchanged. No additional blocker was found in this delta. Behavioral RED/GREEN results belong to [integration generation 3](integration-gen3.md).

### 4. Merchant minimization and retention composition preserves result identity

The production merchant caller keys the issuer by signed profile signature, template ID and requested amount. A considered same-session replacement scenario therefore does not retain a result through the actual UI. The adapter registers only the current completed result with the matching seller session; mode/input changes invalidate previous results and pending generation. Cleanup checks object identity; replacement results receive fresh registration and age. The adapter has no vault, recovery or journal deletion capability.

Integration separately reproduced a confirmation race: a passive revision effect could remove a newly captured current cleanup plan. At `88142923`, the control stores `{ plan, revision }`, renders only a current plan, and rechecks the revision before the unchanged single-use registry confirmation. The reviewer found no weakening of identity, revision, replay or protected-data boundaries.

No additional protected-data or mode/result-identity defect was established. Persistent transaction/invoice metadata and terminal-transaction cleanup remain outside the proven completed-screen-preview adapter; see the [retention census](retention-gen2-census.md).

## Other reviewed boundaries

- Pay, Registry and Policy pass the disclosure gate through their actual connection paths. Account permission and requested chain switching remain separate decisions.
- Expected initial permission/switch events are followed by account/chain consistency reads.
- Send payloads and attempt options are captured before approval; cancellation before dispatch creates no journal entry or provider call.
- Returned hashes and uncertain attempts survive UI revocation.
- Execution-settings comparison excludes the two presentation preferences; real settings, network and session changes preserve revocation.
- Retention remains limited to disposable generated screen results.

## Later merged-source review and execution

A different fresh reviewer, `/root/v11_qualification_gen4/consent_merge_review`, inspected frozen combined source `85dd647cfd439a18e4885ab5ff9a9bf3a3bbad5c`, tree `78001180019ef9e3b6716217e2a35a41b1426d20`, against `806ed96cde92237ce97533411e22c111a629f685` and final v1 parent `573901ee1c66624e57143526571a3fd76f52f264`. It confirmed the incoming Pay repair, explicit send approval in the six new lifecycle cases, preserved browser reconnect fixture, and unchanged retention/minimization composition. It found no additional blocker in that bounded static delta and performed no execution.

The integration worker separately ran 14 complete files on `85dd647c`: **301/301 passed, zero skips, exit 0**. Exact commands and verified logs are in [integration generation 4](integration-gen4.md). Counts across generations and selections overlap and must not be summed. Complete original type, lint, coverage, build, browser and hosted qualification are separate gates.
