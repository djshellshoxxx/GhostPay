# Receive and scan

Sellers do not get a notification when someone pays. The router (or a payer paying directly) publishes an *announcement* on the chain; your scanner downloads announcements and checks which ones are for you.

> Testnet only for now.

## How scanning works

1. Open **Scan and receive** with your keys loaded (see [Set up a stealth meta-address](set-up-stealth-meta-address.md)).
2. Choose the chain, an RPC endpoint, and a **start block** (the block when you first published your meta-address is a safe choice; earlier costs time, later can miss payments).
3. The app downloads announcement logs in ranges your RPC allows and tests each one in a background worker. A **view tag** (one byte per announcement) lets the scanner skip about 255 out of 256 non-matching announcements cheaply. It does not reduce what is downloaded.
4. Matches appear under *Payments found*. The browser saves completed scan progress and discovered public announcement records together in an encrypted checkpoint. **Completed through block N** describes that saved range; newer payments require another scan.

## Resume, pause and recover

**Resume** first rechecks the blocks containing saved observations through your selected RPC, then scans from the last safely completed position. Previously saved receipt labels are not accepted as current payment evidence. The app shows a saved-observation count while loading; actionable payment results appear only after fresh scanning and verification. Unverified claims are retained for later checks, so a temporary receipt or transaction lookup failure does not make the payment disappear on the next resume.

**Cancel** stops the current run. Closing the page has the same persistence boundary: only transactions that finished saving survive. A partially processed or failed page is scanned again. A storage error or another tab's conflicting update stops advancement and leaves the preceding committed history available. Use **Reload saved scan history** after a conflict, then Resume. There is no unattended scan while the browser is closed.

To search for missing payments, turn off **Resume from checkpoint** and choose an earlier start block, or use **Clear saved scan history**. A manual rescan retains the previous saved history until its first complete replacement page commits; clearing explicitly removes that history. Block **0** is the conservative default when no compatible history exists. An independently recovered wallet, another browser or cleared site data may have no scan history even though the wallet has received payments. A lack of local history never means there were no payments.

History is separated by spending/viewing identity, chain, signed deployment configuration, selected scan endpoints and policy, and Deep scan mode. Switching to another identity or an incompatible configuration opens a separate context. Returning to an unchanged context can resume its history. Replacing keys selects a different context; restoring the same keys can reopen the matching encrypted history if it still exists. Key backups and Spec 18 recovery files keep their existing formats and do not contain this scan journal.

Deleting the browser's saved seller vault invalidates scan history for all contexts in that browser profile: GhostPay currently has one saved seller-vault slot. Existing loaded keys follow the existing key-retention policy. A session tied to the deleted vault cannot continue using its old scan handle; deliberately importing the keys again can start a fresh scan. If deletion reports that scan cleanup failed, the key vault has already been deleted and encrypted history may remain; the message explains how to remove it. Clearing site data also removes other locally saved GhostPay material, so keep any required key and data backups first.

Older plaintext checkpoint formats (v1–v4) are ignored and removed best effort. Their position cannot safely establish that discovered payments were preserved, so this upgrade starts a fresh scan from the selected start block.

## What is stored in this browser

The checkpoint and public discovery records use the existing vault encryption and transactional storage design. No private viewing/spending/signing key or passphrase is serialized into them. Inspecting browser storage reveals opaque private-key-derived slot names, the number and size of records, format versions, encryption parameters, and empty-history markers. It does not reveal the scan block numbers, payment addresses, transaction hashes, amounts or selected configuration from those records. Browser code with access to your unlocked keys can read the history; encryption does not protect a compromised running frontend.

The journal has bounded record and byte limits. If it fills, the app reports a storage limit and preserves the previous checkpoint. A very dense historical payment block may also exceed the bounded revalidation budget; the app stops rather than silently forgetting it. See the [technical limits](../developers/private-scan-checkpoints.md).

## What your RPC provider learns

The RPC provider sees your IP address and which blocks and addresses you ask about, and it can see that you are scanning GhostPay announcements. Rechecking saved payment blocks and requesting transaction/receipt evidence can reveal which announcements interest you. Window padding does not hide the exact checkpoint/header reads. The provider does not receive your viewing or spending keys. Scanning uses only the selected primary, optional second provider, and any explicitly configured indexer or local proxy; failure does not authorize a fallback provider. For better privacy run your own node or use an RPC you trust; see [Run a local scanner and RPC](../operators/local-scanner-and-rpc.md).

## Do not trust the amount shown on a match

This is the most important rule for sellers.

- Anyone can derive a valid one-time address from your public meta-address and post an announcement claiming "1,000,000 USDC". The scanner will list it because the keys match. **The amount in the announcement is just the poster's claim.**
- The scanner distinguishes unverified claims from payment evidence checked against transaction/receipt data and the configured confirmation depth. Review that status and the relevant chain facts before delivering goods; a balance alone does not prove that an invoice was paid.
- A dishonest payer can also pay the right address but publish a wrong view tag, so your tag-filtered scan never finds the payment. If a customer says they paid and you see nothing, ask for the transaction hash and look at the transaction; the address that received the tokens is the one-time address, and you can test it with your keys. To find such a payment yourself, turn on **Deep scan (also check wrong view tags)** in Scan and receive: it checks every router announcement without the view tag (at a higher CPU cost), still verifies the full one-time address, marks a match whose announced tag was wrong, and that payment can be swept like any other. Announcements that did not come through the router stay tag-filtered.
- The configured confirmation-depth check is distinct from independent finality verification; an RPC disagreement or reorganisation can change the result.

## Local client tags

You can attach a private label (for example "order 1042") to a match. Tags are encrypted in this browser with keys derived from your viewing key: only ciphertext is stored in IndexedDB. The tag vault locks after the idle time you set in Settings and whenever the seller keys are wiped or changed, and it can be wiped. Limits: tags move between devices only in an encrypted tag archive you download and import under Seller keys, do not survive clearing site data, and are readable while unlocked by anything running in your browser session.

## Reorgs and duplicates

The scanner checks saved block hashes and uses the chain's configured confirmation depth. A confirmed changed checkpoint hash conservatively restarts at genesis because a single saved anchor cannot locate a deep fork. Duplicate event identities are not added twice. A repeated public announcement is not a second payment: evaluate the transaction-bound payment evidence, not row counts or balances alone.

- If your RPC cannot return the block saved in the checkpoint (it is lagging or returned nothing), the scan stops with an RPC error and nothing is rolled back or invalidated; scan again later.
- After a confirmed reorg, a saved reconciliation record is marked invalid only when its block was actually replaced (checked against your RPC, and against the second RPC when you set one). Unchanged records stay valid. With a second RPC, a reorg that only one provider reports keeps your checkpoint and stops the scan.
- With a second RPC, each scan ends at the last block both providers have. If the second RPC falls more than the chain's confirmation depth behind, the scan says so: later payments appear only once it catches up (or after you remove it in Settings).
- Restoring an encrypted reconciliation backup into a vault that has seen a reorg marks restored records at or above the reorg block that were recorded before it (by the recording device's clock) as invalid, because they could not be checked; adding the same payment again from a new scan makes it valid again. The preview shows how many records would be marked invalid.

## Announcement spam

Anyone can post announcements, so a block can hold more of them than one RPC response may carry. The scanner then checks that block only for payments posted through the GhostPay router and tells you which blocks it narrowed: a direct (non-router) payment in such a block would not be listed. A block counts as too large when its response passes the app's 2 MiB limit or the RPC refuses it with JSON-RPC error -32602 or -32005. Some providers also use -32005 for rate limits, so a block refused with -32005 is asked for again, whole, once its router-posted payments have been read: if the RPC answers, the block is scanned whole; if it refuses the block as too large again, the block is narrowed as above, with the same warning. Such a block stops the scan with an RPC error only when its router-posted payments cannot be read or the second request fails with a different error; scanning again later continues at that block. Other limits (too many logs or blocks in one request) only make a scan take more steps; it continues where it stopped.

Remaining limits: a block with more router-posted announcements than one response can carry stops the scan at that block with an error. So does an RPC that refuses even a single block with another limit error (JSON-RPC -32600, -32614 or -32000), because those errors do not say that the response is too large; scan with another RPC to get past that block. A -32005 rate limit that still refuses the second request for a block (see above) narrows that block even when it holds no spam, so a direct payment in it is not listed (the warning names the block; if a payer says they paid directly in it, look at the transaction as described above). The app cannot tell such a rate limit from a block that is too large: that would need the RPC's error text, which the app deliberately does not keep (it keeps only the error code). The optional indexer source (Settings) always fetches whole windows, so a window the indexer cannot serve or cross-check because of spam also stops the scan with an error; switch the source back to the scan RPC to continue.

For an already saved historical payment block, a router-only response is insufficient to replace its history. Resume stops and retains the old journal instead of dropping a previously discovered direct payment. Use a selected RPC that can serve that block, or perform an explicit rescan with the coverage limitation shown.
