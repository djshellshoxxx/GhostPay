# Share public configuration between devices

GhostPay has three separate public exchange flows. Camera access starts only when you choose **Scan with camera**. Pasting text works without camera permission. None of these imports follows a link, loads a remote configuration, or installs seller secret keys.

| Screen | What is shared | What importing does |
|---|---|---|
| Seller keys → Public seller config | Scheme-1 meta-address, invoice-signing **public** key, and configured supported testnet chain IDs | Shows an untrusted preview and compares it with loaded keys. It changes no keys, settings, signer trust, or payment state. |
| Settings → Transfer nonsecret preferences | Saved delay range, idle-lock timeout, theme and address-bar-clearing preference | Shows a review. **Apply imported preferences** explicitly saves only those fields. RPC and relayer URLs, credentials, and pinned signer trust stay local. |
| Public registry → Read a public meta-address QR | A public scheme-1 meta-address | Shows an untrusted preview. Reading or copying it does not publish to the registry or change the meta-address loaded on this device. |

## Seller public config

Back up your seller keys first. On the sending device, the Seller keys screen offers the same public config as a QR, text, or `ghostpay-seller-public.json` file. On your other device, scan, paste, or choose that file. Compare the public key values on both screens before relying on them. A matching checksum detects accidental changes; anyone can create a checksum, so it does not authenticate a sender.

A different-key preview is labelled as different and is never installed. With no keys loaded, the screen cannot confirm a match. Public config contains no timestamp or freshness proof: compare it against the current sending device after rotating keys. Unknown versions, extra or duplicate fields, invalid curve keys, unsupported/disabled chains, altered checksums, and inputs larger than 2 KiB are refused.

**Clear preview** cancels a pending file read or camera action and clears pasted text. The same file can be imported again. A file choice replaces an in-progress camera import; editing pasted text stops an earlier camera or paste operation. Changing the loaded seller keys invalidates pending imports and previews.

## Preferences and registry

Settings exports only saved preferences. Review the imported values before applying them; saving other preferences invalidates the old import preview and hides any outdated export QR. **Discard preview** leaves saved preferences unchanged.

The registry accepts a canonical public meta-address or the bounded version-1 `ghostpay-public-meta` JSON envelope. **Clear scanned preview**, a network change, or a seller-key change removes the current scan review. Publishing a registry entry is a separate wallet action with its own consent and transaction review.

## Public config is not a secret backup

Public config cannot restore your viewing, spending or invoice-signing private keys. Keep the passphrase-encrypted keystore file through the separate backup/import controls. Anyone who obtains that secret-bearing file and its passphrase can use the keys. Do not paste it into a public-config or registry importer; those formats reject it. Public config also contains no invoice, receipt, bearer link, vault contents, or customer history.

Public QR codes can still connect the public values they contain, including your meta-address and invoice-signing key. Share seller pairing config only with the intended device. The app's parsers and camera lifecycle are covered by automated tests; physical-camera behavior on your devices still needs testing.
