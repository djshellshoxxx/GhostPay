# Session inactivity, browser sleep and retained keys

GhostPay's full and lean browser interfaces use the inactivity timeout configured in
Settings. A session must still be valid before keyboard or pointer activity can renew
that timeout. A focus change, visibility change or restored page checks the deadline;
it does not count as new activity.

## Clock and browser lifecycle behavior

The shell records wall time (`Date.now()`) and monotonic time (`performance.now()`)
together. Either clock reaching the inactivity limit expires the session. A backwards,
negative, non-finite or unreadable observation also expires it. Wall time covers sleep
states that pause the monotonic clock; monotonic time supplies independent elapsed-time
evidence when wall time changes. Neither clock alone is assumed to describe every sleep
state correctly.

The ordinary timeout, periodic checks, page visibility, focus, `pageshow`, `pagehide`,
and supported document `freeze`/`resume` events enforce the same deadline. Sensitive
session guards and private-key borrowing also check it. This matters when a promise
continuation runs after sleep before a delayed timer or browser lifecycle event.

Changing a setting or rerendering the shell does not create activity. Installing keys
through the existing import or vault-unlock flow starts a fresh session. Callbacks from
an earlier timer, replaced wallet or disposed shell cannot lock or restore the new one.
Each tab has its own in-memory session and activity history; using one tab does not
renew another tab's deadline. Shared encrypted-vault storage is checked when deciding
whether a retained copy can safely be discarded.

## What an idle lock does

At expiry, GhostPay immediately invalidates the session revision and refuses ordinary
signing, scanning and raw-key export. It locks local tags, notifies subscribed views to
cancel their work, clears transient shell results and invoice state, and wipes tracked
temporary buffers on a best-effort basis. An operation begun before expiry cannot
become valid again just because the same public identity is loaded later.

Recoverability is a separate decision:

| Key custody at the check | Result |
| --- | --- |
| Verified external copy, or the matching encrypted browser vault is still readable | Dispose the in-memory seller keys and display the existing idle-wipe notice. Use normal import or vault unlock to continue. |
| Imported spending/viewing keys with a newly generated, unbacked-up invoice signer | Keep the three keys suspended for encrypted backup. The imported hex recovers the payment keys, but only this session can still export the original invoice signer. Restore from the encrypted backup to use that signer again. |
| No verified surviving copy, a missing vault, or a vault whose presence cannot be confirmed | Retain the seller keys in memory for encrypted backup and verification only. Display the locked recovery state. Normal protected operations remain disabled. |

An unverified download is not proof that a usable file reached disk. An unreadable
vault is not proof that a recoverable copy exists. A delayed custody answer is ignored
if the wallet changed or the responsible shell effect was disposed meanwhile.

## Recovering a retained sole copy

The locked recovery state preserves the existing Seller keys interface and its custody
checks. It introduces no new password, encryption format or authentication mechanism.
There are two existing routes back to normal use:

1. Save an encrypted browser vault, then use **Unlock saved vault** with its passphrase.
2. Download an encrypted keystore and verify that file. Choose **Wipe keys from memory**,
   then import the verified keystore with its passphrase.

Saving or verifying a backup alone does not resume signing or scanning. Keys tied to a
vault retain that vault's existing passphrase requirements. The unsaved-copy warning and
explicit confirmation before destructive wiping remain in place. Closing or reloading
a tab that still holds the only copy can lose those keys; the browser leave-page guard
also remains active for a retained session without a verified external copy.

Fresh input in the recovery interface starts another inactivity period for clearing
newly typed passphrases and cancelling pending recovery operations. It does not restore
ordinary session authority. That cleanup timer also preserves any outstanding custody
decision, so typing cannot prevent disposal when an existing recoverable copy is confirmed.

**Lock your device before stepping away.** If the tab holds the sole copy and the seller keys have
no existing vault passphrase, anyone at the unlocked keyboard can choose a passphrase, download
an encrypted keystore and restore the same spending, viewing and invoice-signing keys elsewhere.
The beta owner accepted this physical-access risk on November 27, 2026 to preserve recovery of
the last copy. Keys already tied to a vault still require its original passphrase for export.

## Qualification

This shared-core continuation ports the idle and recovery policy from immutable donors
#365, #544 and #577 while preserving the newer credential checks and backup-operation
ownership. Its source-pinned handoff records the ordinary synthetic lifecycle checks
actually run. Fresh hosted CI and full/lean browser acceptance remain integration gates;
this user guide does not assert that those gates have passed.
