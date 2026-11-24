# Local metadata retention controls

ID: `v11-04-retention`. Release: **v1.1 Beta**. Source: [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Allowlist only proven nonessential metadata; unknown types remain protected. User-configurable preference; preview count/categories and explicit confirmation before destructive manual cleanup. Approval binds revision and rechecks eligibility; stale/replayed plans fail closed. Never automatically delete vaults, sole-copy keys, backups, pending/unknown attempts, recovery records, signer pins, anti-reuse/duplicate/reorg/tombstone/security evidence. No global origin clear. Static browser timers run only while app active.

## Module ownership

Under `apps/web/src/`: new lib/metadataRetention.ts, tests, dedicated settings panel and explicit data adapters.

## Acceptance and reuse

M1 typed planner/executor and safe real presentation-metadata adapter if proven, with protection/race/clock/failure tests. M2 individually justified persistent adapters, reload/concurrency and browser review. Existing journals do not have proven final settlement; do not invent TTL eligibility.

## Generation 3 bounded adapter acceptance

The next eligible copy is the **completed MerchantTemplateIssuer screen result**. Reuse the existing invoice-preview registry, identity guard, controls and active-page timer; do not create a new store or planner. This continues implementation and does not satisfy the separate M3 release-qualification gate below.

1. Register only the current generated result whose captured seller session still matches the current session. The adapter receives object identity and a state callback, never invoice storage or journal handles.
2. Reuse count-only preview, cancellation and explicit confirmation. Clearing removes the current generated link/Copy presentation only; token/amount/fee selections, immutable signed profile, seller keys/custody and independently saved records remain unchanged. Already shared signed links remain valid.
3. Register no pending generation. Replacing a result invalidates its previous confirmation plan, and a previous result's age cannot expire the replacement. Clearing must not cancel, restart or authorize generation.
4. Unmount/session replacement withdraws the registration. Late asynchronous completion must obey the existing generation/session guards and cannot restore a closed preview.
5. Execute actual issuer integration regressions, including manual preview/cancel/confirm, replacement/expiry/pending work, preserved security state and unmount. Preserve full original checks as separate open gates until executed on the combined source.

The separate merchant metadata-minimization mode is reconciled by the coordinator. This adapter must preserve that mode and its pending-generation guards when combined. Persistent transaction/invoice retention and terminal-transaction cleanup remain outside this bounded adapter until a positive nonessentialness proof exists.

## Payment proof preview adapter acceptance

Source review at `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` identifies the existing deliberately shown `PaymentProofQr` QR/JSON textarea as a further nonessential presentation copy. Its only production caller is Pay's completed-result block. Pay independently retains the submission result, transaction hash, context, built payment, receipt export and protected journals; the child receives no mutation handle for them. Closing the rich receipt projection reduces its visual/accessibility exposure without erasing or changing those records. This extends the M1 presentation allowance; it does not complete persistent retention or establish transaction finality.

1. Enroll only an existing shown proof whose current local receipt status is `included`. `buildReceipt` requires a successful receipt plus comparison of the returned transaction for that status; the independent retained source, rather than the status label, establishes nonessentialness. Unconfirmed, reverted, unknown and hidden proofs remain outside this adapter. A failed explicit Show action enrolls nothing. Later live receipt updates preserve the existing rendering behavior: if an updated QR is too large, its still-shown text projection remains disposable; cleanup does not change or revalidate the underlying receipt.
2. Preserve the existing live-prop QR/text/copy/download behavior. Track each deliberate Show with a fresh lifetime token and stable identities for the parent result, context, built payment and session; do not create a stored receipt snapshot. An ordinary Pay rerender constructs a fresh receipt/timestamp and must update the display normally without resetting its age or invalidating an otherwise current confirmation.
3. Give each Show and each replacement source a fresh registration. Hide, source/session replacement and unmount withdraw the previous registration. A current status downgrade withdraws eligibility while retaining the existing live caution display. Old plans/timers cannot close a replacement; eligibility and identity must still match immediately before cleanup. Cleanup cannot change Pay's phase or expose a new Send action.
4. Use a separate default-off proof-preview preference, with the existing 5/15/60-minute active-app choices. Existing invoice-preview consent does not authorize proof cleanup. Provide category/count preview, cancel and explicit confirmation inline while the proof is mounted; Settings may also expose the preference.
5. Close only the QR/textarea presentation and keep the original result, receipt-copy/download, exact hash and every invoice, vault, backup, attempt, recovery, trust and security record. UI copy must describe closing previews, not erasure or settlement. No new sensitive persistent collection or origin-wide deletion is permitted.
6. Execute controlled component and actual-Pay regressions for consent, source replacement, stale confirmation, fresh Show lifetime, ordinary rerenders, pending exclusion, denied/malformed policy, failed explicit Show, unmount and preservation of payment authority/journal bytes. Record exact-source results; browser/full release gates remain separate until executed.

## Preference focus and reload acceptance

The existing M2 reload/concurrency contract also applies to displayed presentation preferences. A returning tab may have missed or not yet received a storage notification; expiry already rereads policy on focus. Controls must reconcile the same effective policy before presenting stale consent.

1. On window focus, reread only the control's current invoice or proof preference. Update its displayed effective value. Denied or malformed reads retain the existing off fallback.
2. Invalidate an open manual confirmation if that effective value changed. Preserve a current manual plan when the effective value is unchanged. A focus event never confirms a manual plan or creates an independent cleanup capability.
3. Keep category changes isolated: the old category's plan, preference and focus listener cannot affect the replacement control. A real remount reads the persisted choice; all added listeners are removed on unmount.
4. Preserve existing expiry timing, registration identity, cross-category consent, receipt exports, transaction state and every protected persistent store. This follow-through completes the bounded preference-concurrency behavior; it does not establish persistent-retention or browser/release completion.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.


## Persistent registration-time slice — 2026-11-21

Current-source field review establishes `RegisteredInvoice.registeredAt` as nonessential local save-time metadata. The implemented manual adapter uses explicit document v4 / registration v2 with a null removed-time marker, preserving all other fields and complete financial/security records. Legacy versions remain readable; unknown versions fail closed and older readers cannot open updated v4 vaults. The UI explains the compatibility change.

Approval is separate and starts off for every unlocked mounted scope. Preview exposes only category/count and is bound to exact ciphertext, handle and session; cancel/replay/intervening write/scope or session replacement cannot authorize cleanup. Confirmation performs one storage-transaction CAS without rebasing. Existing row redaction survives export, import, duplicate registration and reload; newly imported rows require a fresh review. No automatic persistent expiry, receipt/archive-time cleanup or new sensitive collection is implemented. Broader retention and M3 remain partial pending independent and exact-source release/browser gates.

## Persistent timestamp policy

Offer separate, device-local age preferences for invoice registration and payment receipt archival times. An unlocked seller must opt into each manual cleanup, preview its category/count and confirm. A saved age preference alone grants no deletion authority. Use the timestamp at preview as the fixed inclusive eligibility boundary. Keep future times when the clock moves backwards. A changed preference, vault, ciphertext or session invalidates confirmation.

The receipt archive time is a local display field outside the signed payload. Keep signed issue time, transaction references, matching and reorg evidence, pending and unknown attempts, keys and backup files. Commit the reviewed change in one encrypted storage transaction. Verify both pre-cleanup and post-cleanup backups can recover the expected state with the original wallet.
