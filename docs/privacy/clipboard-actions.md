# Sensitive clipboard actions on Pages

Settings → Safety and appearance offers **Off** (default), **30 seconds** or **60 seconds**. This is the same saved setting introduced for the Create Invoice link in #553. Saving a different delay cancels outstanding cleanup. The new selection applies to subsequent successful copies.

## Inventory

The table counts programmatic copy call sites in the Pages source on #553 (`068fbc36b80311c107dfd3619d631fca794fac58`). A recount after merging main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61` found the same 23 `CopyButton` and three `SecretBackup` sites, and no other `navigator.clipboard` caller outside the helper. Several screens also expose their payload through the shared QR frame. Each call to the shared control is counted once.

| Copy surface | Payload copied | Call sites |
| --- | --- | ---: |
| Create Invoice | Created invoice link, owned by #553 | 1 |
| Seller Keys | Seller meta-address | 1 |
| Seller Pairing | Public seller configuration and received meta-address | 2 |
| Merchant template issuer | Issued invoice link | 1 |
| Pay | Broadcast transaction hash and result hash | 2 |
| Sweep | Expected transaction hash and submitted transaction hash | 2 |
| Payment request and proof | Wallet payment URI and payer proof text | 2 |
| Receipt panel | Receipt text | 1 |
| Registry | Scanned and looked-up meta-addresses | 2 |
| Policy creation | Policy recipient meta-address | 1 |
| Bitcoin | Wallet address, payment URI and signed raw transaction | 3 |
| Solana | Wallet meta-address and signed wire transaction | 2 |
| TRON | Wallet meta-address and signed transaction | 2 |
| QR frame | Current permitted QR text or multipart frame | 1 |
| Confirmed wallet backup | Bitcoin seed, Solana seed, TRON keys | 3 |

The first 23 sites use `CopyButton`. The three backup sites use `SecretBackup` and require the existing warning and second click. Both controls call `copyClipboardText`. The application has no other programmatic clipboard writer on this source. The QR row includes invoice links, printable bills, payment requests and proofs, receipts, seller and registry addresses, device pairing, settings transfers and the three chain views. Secret QR frames and settings transfers containing RPC endpoints suppress the copy control. Native user selection and operating-system copy commands are outside these buttons.

## Copy and cleanup behavior

- **Off** makes no timed cleanup reads or writes for the 23 shared buttons. To request automatic clearing, choose the delay before copying.
- **Confirmed wallet backups are always checked**, whatever the delay. Hide, automatic hiding, Lock, leaving the view and the app lock empty the clipboard only while it still holds exactly the copied backup as its single plain-text item. Newer or different content, including text copied later in another application, is left alone. A backup write that settles after Hide or leaving is checked at once. A later successful copy from any GhostPay button replaces the backup, so nothing stays tracked. A saved delay adds a timed check.
- When the browser refuses the read or the clear (no user activation, an unfocused page, a denied permission or no `readText`), GhostPay changes nothing and shows an app-wide notice that a copied backup may still be on the clipboard. The next click or key press in the page retries once; capture-phase handling lets a click that copies again win. The notice offers **Check clipboard again** and an explicit **Empty clipboard**.
- **Decision (#286): no automatic blind clear.** An empty write without a matching read could erase newer clipboard content, which #286 forbids, so GhostPay never issues one on its own. **Empty clipboard** is the only unchecked write. It runs only from that explicit click, whose hint says it also removes anything copied after the backup. When the browser refuses it as well, the notice stays and says so. Main's earlier unconditional clear (G2-02) is replaced by this checked clear.
- A successful copy starts its own delay. An acknowledged copy keeps its timer across navigation in the same page. If a newer copy is pending when the old deadline arrives, the helper waits for the outcome. A successful recopy gets a fresh deadline. If the newer write fails, the old cleanup rechecks ownership and clipboard contents.
- The timer holds a digest and text length. Cleanup compares the text twice. When the browser exposes item formats, cleanup also requires exactly one plain-text item. A denied read, a changed value, or extra formats leave the clipboard untouched. A denied initial copy shows the existing localized failure message.
- A subsequent app copy waits for any already-dispatched copy or clear. A queued copy whose control has since unmounted or changed is discarded. A write already submitted to the browser may still complete after unmount.
- The browser exposes separate read and write operations. An external copy of identical text cannot always be distinguished, and another application can change the clipboard after the final read. Closing or reloading the document ends its timers. Clipboard history and synced copies are outside the page's control.

## Acceptance evidence

`SensitiveClipboard.test.tsx` exercises both controls through React using a mocked clipboard and fake timers. `clipboardPrivacy.test.ts` covers comparison failures, formats, revocation and write ordering, plus the backup checks, refusals, pending newer writes and the explicit empty request. `SecretBackup.test.tsx`, `SecretBackup.views.test.tsx` and the Bitcoin, Solana and TRON view tests cover Hide, automatic hiding, Lock, the app lock, leaving the view, newer content, the notice and the single activation retry. The seeded `CopyButton.clipboard.fuzz.test.tsx` from #553 exercises delayed and denied acknowledgments. `sensitive-clipboard.spec.ts` exercises Seller Keys, pairing and a saved preference change through browser navigation. The existing Create Invoice browser spec remains owned by #553. Exact-head results and integration status belong to the pull request.
