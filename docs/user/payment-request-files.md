# Send or open a payment request file

Status: experimental, testnet-only and not audited, like the rest of GhostPay (see the README "Status" section).
The request file is a convenience wrapper around the signed invoice link; it adds no encryption and no new trust.

## Send a request

Create an invoice as usual. Review the amount, asset, chain, fees, expiry and any passphrase
protection. Select **Download payment request** beside the invoice link. GhostPay creates
`ghostpay-request.gpr.json` on your device.

The file contains the same invoice as the link and QR. Downloading does not create a new invoice,
change its expiry or mark it paid. A new invoice must be created through the normal creation flow.

## Open a request

On the payment screen, open the invoice import section and select the file with **Payment request
file**. GhostPay reads it locally and shows a preview. Select **Open request file**
to proceed to invoice review. If the invoice needs a passphrase, enter it through the normal
unlock form. Selecting the file does not approve or send a payment.

Check the signer and trusted-seller status, then review the chain, asset, amount, fees and expiry.
The file's name and sender are not proof of the merchant's identity. Existing invalid-signature,
unsupported-invoice and expired-invoice checks continue to apply.

Selecting another file replaces the previous import attempt. Clearing or closing the import,
hiding the page, or changing the session discards pending work. The same file can be selected again.

## What the file reveals

The file gives its holder the same access as the original link. The wrapper adds no encryption.
When a link carries its own decryption key, that key also travels inside the unchanged fragment.
Passphrase-protected requests keep their passphrase outside the file; send it separately.

Files may remain in Downloads, backups, browser history or synchronization services after you
leave GhostPay. Forwarding the file forwards its contents. The generic filename intentionally
contains no merchant, amount, destination or invoice identifier.

Public-chain visibility and external-wallet behavior remain unchanged. The file neither proves
payment nor guarantees that an invoice can be paid only once.

## Compatibility and failures

Version 1 uses a small UTF-8 JSON wrapper with exactly a format tag, version number and invoice
fragment. GhostPay supports files up to 24 KiB and preserves the existing 16 KiB decoded-envelope
limit. Invalid encoding, duplicate/extra fields, unsupported versions and oversized files are
refused. A file with a different extension or MIME label is still checked by its actual contents.

The wrapper stores no website address. You can open it in another compatible GhostPay deployment
you trust, without contacting the sender's host. Other wallets need explicit support for GhostPay
request files; the `.json` extension alone does not provide wallet compatibility.

On failure, obtain the original file or use the original invoice link or QR. Do not edit the
amount, destination, signature or envelope by hand.
