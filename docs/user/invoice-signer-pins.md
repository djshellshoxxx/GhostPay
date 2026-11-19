# Checking an invoice against a trusted signer

GhostPay checks invoice signatures locally when you open an invoice in **Pay**. The **Invoice signer verification**
section tells you whether the signed contents are intact and whether the signing key matches a key you chose to trust.
Checking an invoice does not require a wallet connection, an account, or a verification server.

The signer-pin feature is optional. A valid signature from a previously unknown key proves that the holder of that
key signed the invoice. It does not tell you who that person is. Before relying on a pin, obtain the seller's complete
invoice-signing public key through a channel you independently trust, such as a previously established direct contact.
Copying the key from the invoice you are trying to check does not independently establish the seller's identity.

## Save a seller's signing key

1. Open **Pay**, with or without an invoice, and find **Invoice signer verification**.
2. Select **Add a signer pin**.
3. Enter a **Local seller name** that will help you distinguish this seller from your other saved sellers.
4. Paste the **Independently trusted signing public key**. It must be the complete 66-character lowercase public key,
   starting with `02` or `03`, without `0x`. Use the dedicated invoice-signing public key, never a private key.
5. Select **Review pin change**. Check the seller name and full public key again.
6. Select **Confirm signer pin** to save the pin. **Cancel pin change** leaves the stored pin unchanged.

Saving does not happen when you open an invoice, enter a key, or view the confirmation. After a successful save, the
named seller is selected for this Pay view. You can save up to 50 named identities. Local names can contain up to
64 Unicode code points; names containing hidden/control characters are refused. Keys must be valid compressed
secp256k1 public keys, not just strings of the expected length.

## Choose the seller you intend to pay

Use **Expected seller (optional)** to choose a saved seller before relying on an invoice. The comparison uses only
that seller's exact saved key. If Alice is selected, an invoice signed by Bob cannot match Alice's pin, even if Bob is
also saved. Opening a different invoice within the same Pay view keeps the selected seller and checks the new invoice
against that key again.

Selecting a seller adds a payment requirement: the invoice must have a valid signature from that seller's saved key.
A mismatch, unavailable pin, interrupted verification or invalid invoice cannot satisfy the requirement. Other payment
requirements, such as an authenticated deployment manifest, supported chain and token, expiry and wallet consent,
still apply even when the pin matches.

The seller selection lasts only while you remain in the Pay view. After leaving that view or reloading the app, select
the intended seller again. Saved names and public keys remain available. **No expected seller selected** explicitly
turns off the requirement to match one named seller; it does not make an invalid invoice acceptable.

## Understand the result

| Result | Meaning and next step |
|---|---|
| **Valid signature — matches the trusted signer pin.** | The signed invoice contents verify under the applicable saved public key. The quality of that trust depends on how you confirmed the key. Review the invoice and normal payment details. |
| **Valid signature — no matching signer pin is configured.** | The signature is valid, but this inspection has no matching applicable pin. Confirm the seller's key independently before relying on their identity. |
| **Valid signature — does not match the selected seller's pinned key.** | A different key signed the invoice. Payment stays blocked under your selection. Check that you opened the intended invoice and contact the seller through your established channel. |
| **Invalid signature.** | The signature is malformed or does not authenticate the signed invoice. Do not resolve this by changing the pin; obtain an intact invoice. |
| **Missing signature.** | The recognized invoice container lacks its required signature. It cannot be authenticated. |
| **Unsupported invoice signature format, algorithm or version.** | This app does not support the supplied format. No successful verification is claimed. |
| **Malformed invoice.** | The invoice violates the supported schema or strict encoding rules. Verification was refused. |
| **Verification unavailable or interrupted.** | Verification has no usable result. This can occur before passphrase decryption, after a session lock/change, when required local cryptography is unavailable, or when the selected pin can no longer be read. Resolve the cause and reopen the invoice. |

The status text conveys the result independently of its color. A passphrase-protected invoice's visible header is
unauthenticated until decryption and signature verification finish. Supply the passphrase through the existing invoice
prompt; pinning a header key does not authenticate its encrypted contents. Changing the selected trust policy can
require opening that protected invoice again.

## Replace an incorrect or rotated key

If the wrong key was saved, or the seller deliberately rotates their signing key, confirm the new full key through
your established trusted channel. Select the seller, choose **Replace selected pin**, enter the independently confirmed
new public key, and select **Review pin change**. The confirmation shows both the previous and new public keys.
Choose **Confirm signer pin** only after checking those values. Cancellation preserves the existing key.

A new invoice never replaces a pin automatically. If another tab changes the pin while you are reviewing a replacement,
the old confirmation becomes obsolete. Review the current key and start the change again. Do not infer key rotation
solely from a mismatched invoice.

To forget an identity, select **Remove selected pin**, review the confirmation, then select **Confirm pin removal**.
Removing the currently selected pin leaves that seller selected as **pin unavailable**, so payment cannot silently
continue without the requirement. Select another saved seller or explicitly choose **No expected seller selected** if
you want to change that expectation.

## Local storage and other tabs

Seller names and public keys are saved in plain text in this browser's local storage for the current app origin. They
are not private keys, but the names and list of sellers may reveal relationships to someone with access to this browser
profile. Invoice contents, passwords, private signing keys and payment records are not stored in this pin collection.
Nothing in the collection is sent to a server or analytics service by this feature.

Saving, replacing and removing pins require available browser local storage and the browser's Web Locks API, normally
available in a secure context such as HTTPS or localhost. If storage is blocked, full, corrupt, or cannot be read
safely, the app reports the problem. If locking is unavailable or another tab holds the lock, the change is refused.
The app never claims that an unsaved key was persisted. Ordinary local signature checking can still work when saving
pins is unavailable.

Other tabs using this app origin share the saved pins. Changes refresh the current view and invalidate older pending
verification and confirmation state. A removed pin remains unavailable for an existing selection. Native storage events
cause a fresh read of the stored record; their payloads are not treated as authority.

An incorrectly saved, otherwise valid key can be replaced or removed using the controls above. If the entire stored
collection is corrupt, do not assume any recovered entry is trustworthy. Clearing this site's browser data removes the
collection; it can also remove other GhostPay settings and encrypted local backups, so preserve needed recovery files
before doing that. Re-establish pins only from independently confirmed public keys.

The existing **Settings → Pinned seller signing keys** list remains compatible. When no named seller is selected,
existing Settings pins can still mark their matching keys as pinned. Selecting a named seller narrows the comparison
to that seller's key and takes precedence over the global list. The two collections are not silently copied into one
another; assigning a local seller name requires explicit confirmation in Pay.

## Offline behavior and limits

Once the application has loaded and the necessary invoice data is available, invoice verification and pin management
run locally. Plaintext invoices use the bundled signature implementation. Encrypted invoices also require the browser's
local cryptography support and any required passphrase. Offline checking does not imply that the app can be loaded
from scratch without network access: this feature adds no service worker or offline cache.

The signature authenticates the supported invoice's complete canonical plaintext, including chain, recipient
meta-address, asset, amount policy, invoice nonce, expiry, descriptions and metadata. It does not prove that an invoice
is unpaid, that a payment occurred, that a seller will deliver goods, or that the signer has a particular legal identity.
The invoice identifier is not an on-chain single-use payment authorization. A correctly signed expired invoice can
still have a valid signature while payment policy refuses it.

Pins protect comparisons performed by an uncompromised application against the user's saved expectations. They do not
protect against malicious JavaScript served by a compromised app origin, browser extensions with access to the page,
or someone who can rewrite this browser profile's storage. Such access can change both the stored pins and the UI.
No independent security audit, production deployment or overall product release readiness is implied by this feature.

For the authenticated fields, algorithms, envelope rules and developer interfaces, see
[Invoice signer verification specification](../specs/INVOICE_SIGNER_VERIFICATION.md).
