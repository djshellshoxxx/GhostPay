# Required privacy integration — generation 3 checkpoint

## Outcome and exact sources

Released v1.0 and v1.1 feature branches are reconciled with their ancestry intact. The tested combined runtime checkpoint is `881429236b0ae75ed2294cadbcba43d60f0ed444`, tree `e019f40c87b9baf5038020996d03fdf634febfef`. Original focused checks passed at that exact source: **138 tests in 14 complete core/retention files**, followed by **68 tests in 9 complete UI/catalog files**. Both exited 0 with zero skips. These selections overlap in the two merchant component files; their counts are separate evidence and must not be added as 206 unique tests.

Browser-fixture commit `87f6681e` changes no production code and has no browser execution claim. The subsequent ancestry merge `b39fcd39` includes the parent's exact v1 head `48a687603c4bc5f08ec7dae13b3c991efd55d618`, carrying the independently tested masking G3 repair and complete output M2 evidence. The original combined AppShell privacy file then passed **18/18** at `b39fcd39`, exit 0, zero skips; the earlier broad focused selections were not rerun wholesale after that narrow merge. The adjacent `integration-gen3/evidence.json` records full source/tree identities, commands, outcomes and raw-log hashes. Failed and successful test logs are retained unedited in compressed files.

This is a bounded combined implementation checkpoint. Full M3 release qualification remains open. The retained baseline already contains invoice minimization, local address reuse and screen-preview retention M2; this generation merged the released wallet/masking/history/clipboard v1 candidate, output M2, disclosure M2 and merchant-preview retention G3.

## Runtime composition

`connectWallet` retains the v1 caller authority guard and abort signal, accepting v1.1 disclosure as its fifth argument. The reviewed provider lifecycle observer spans the connection. Account access and a required chain switch receive separate exact-request approvals before their provider requests. Expected initial permission and requested switch events are permitted; account and chain are rechecked, including the final account read, before returning the session. A revoked scope cannot initiate a later request. The connected session carries its disclosure gate into signatures and submissions.

Pay and Registry combine wallet-privacy and operation/network lifetimes for connection. Policy retains its picker/deployment lifetime, with a replacement seller session requiring new verification, connection and review. Pay keeps stable execution-settings identity and precise preparation dependencies. AppShell scopes disclosure to execution-affecting settings while retaining masking fallbacks for execution-storage refresh and rejected stale writes. The four wallet-scoped history call sites remain intact. Prepared request snapshots, duplicate protection, durable unknown outcomes and returned hashes are preserved.

Two additional defects were demonstrated and repaired within existing acceptance boundaries:

- The older disclosure `walletAuthority` accepted one missing event method and left callbacks active during provider removal. Tests-only `de17aca4` produced five intended failures: four send/sign partial-capability cases and reentrant cleanup. Reusing `observeWalletLifecycle` rejects partial capability, disposes partial registrations and makes callbacks inert before removal. The known hash and submitted journal assertions remain unchanged.
- Merchant retention exposed a timing-dependent confirmation loss. At `43a5c315`, the combined UI run failed the standard merchant preview case; an isolated repeat failed the new minimized preview case instead. The passive revision effect cleared a freshly captured current confirmation. `MetadataRetentionControls` now stores the actual registry revision with the plan, hides stale plans during render, and rechecks revision before the unchanged single-use registry `confirm`. Original assertions and the joint mode/retention case pass. Eligibility and persistent stores were not expanded.

The joint merchant case checks that changing metadata mode withdraws old cleanup authority; the new minimized signed result has its own identity; and clearing it preserves the selected mode, token/fiat/fee draft values, source profile, seller/custody state, journal bytes and valid shared links. No RPC or network call is used by that path.

## Actual verification

Vitest used the original configuration, one worker and a 1,024 MiB Node heap. Coverage was disabled only for these explicitly bounded selections; the original complete coverage gate remains separate.

| Retained run | Source | Result |
| --- | --- | --- |
| Initial wallet/disclosure core | `43a5c315` | 97 passed, 7 files, exit 0 |
| Initial combined UI | `43a5c315` | 54 passed, 1 failed, 8 files, exit 1 |
| Isolated merchant repeat | `43a5c315` | 3 passed, 1 failed, 1 file, exit 1 |
| Observer regression RED | `de17aca4` | 16 passed, 5 failed, 1 file, exit 1 |
| Combined core/retention GREEN | `88142923` | 138 passed, 14 files, exit 0 |
| Combined UI/catalog GREEN | `88142923` | 68 passed, 9 files, exit 0 |
| Secret scan | `87f6681e` | exit 0 |
| Full integration-range whitespace check | `87f6681e` | exit 0 |
| Combined AppShell privacy after masking G3 merge | `b39fcd39` | 18 passed, 1 file, exit 0 |
| Final secret scan and integration-range whitespace check | `b39fcd39` | both exit 0 |

`/root/privacy_review_gen4` independently reviewed immutable `88142923` and found no new blocker in the narrow observer and retention-control changes. That lane performed static review, not tests. It also identified the separate stale-write masking fallback and Pay post-broadcast RPC lifetime concern. Masking G3 is now merged by ancestry, preserving AppShell's combined consent fixture. Pay follow-through remains assigned by the parent to a standalone v1 successor.

## Browser fixtures — authored only

The shared browser helper approves one actual labelled disclosure dialog and requires the expected method. Original `flows.spec.ts` and `core-journey.spec.ts` explicitly approve account access and each intended send. No automatic approval hook, production bypass or unknown-prompt handler was added. The expired-invoice journey asserts no disclosure dialog appears. Existing cancellation, no-extra-send, duplicate-attempt and outcome assertions remain.

The late-hash browser case checks that disconnected history conceals its hash while the tab journal retains it. It reloads the same tab to restore the original mock wallet account, explicitly reconnects, then verifies the visible hash and confirmed clearing. The standalone v1 branch needs only this scope adjustment; the v1.1 disclosure helper stays out of v1.

Original built-browser execution, full typecheck, typed lint, complete coverage, build/CSP/bundle and hosted gates were not run in this lane. Focused unit results do not establish browser acceptance.

## Fresh successor assignment (internal)

Use a coordinator-assigned isolated worktree. Read AGENTS, workflow/handoff, required privacy specs, this receipt and current ownership. Append a claim before edits. Preserve branch ancestry and the v1/v1.1 dependency boundary. Do not change the shared integration lock, main, network policy, dependencies, cryptography, fees, contracts or release gates.

1. Receive and merge the exact parent-released standalone wallet G3 result for Pay's provider-event revocation during post-broadcast verification. The worker supplied runtime `3ef264facbde9ffb93abfde231a91e58d5f9772c` and test commits `f7c5f26c03ba8218df85d003153a48a71897a59b` / `02434632efec3022459bb9d6f5361450913e280c`; these are not merged here. Preserve the existing explicit account approval in the lifecycle `open` helper and add an explicit transaction approval after the new parameterized case's Send click. Keep Pay's extra three address-reuse listeners in the combined listener-count assertion. Distinguish default transport and injected-client evidence. Prevent newly initiated old-flow reads after revocation while preserving hashes, unknown outcomes, durable journals and recovery data. Do not apply pre-sign expiry checks after broadcast. Avoid overlapping the owning lane's Pay edits.
2. Preserve masking G3, already merged from exact parent head `48a68760`, and AppShell's real explicit account-access approval. Keep both storage fallback paths and execution-only disclosure scope. The combined original AppShell privacy file passed 18/18 at `b39fcd39`; recheck affected behavior after any subsequent source change rather than inheriting a passed status by assumption.
3. Run only necessary affected focused selections at the new immutable source, keeping all failures. Then complete original type/lint/coverage/build/CSP/bundle/browser/hosted gates in the coordinator's quiet resource window. Source changes after a pass require an explicit new receipt.
4. Review and execute the authored original browser journeys and dedicated disclosure case with explicit per-request decisions. Preserve refusals and assertions; keep standalone v1 fixtures independent. Do not broaden to additional files unless a concrete failure requires it.

Prior limits remain: masking hides presentation without erasing mounted data or JS memory; local reuse records current-wallet intended destinations observed after known hashes; retention covers generated screen previews rather than persistent invoice/transaction cleanup; draft catalog fallbacks are not reviewed translations. No remote publication, deployment or release occurred here.
