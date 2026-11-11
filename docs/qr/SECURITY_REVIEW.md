# QR and device exchange: AI-assisted security review

**This is an AI-assisted adversarial review, not an independent professional audit, and it is not a guarantee of
security.** A separate reviewer agent, given the diff rather than the implementer's conclusions, reviewed
`git diff 0641d41a..` on branch `claude/kind-faraday-8qzf6e` read-only and confirmed findings with a local probe.
The implementer then fixed the findings below and added regression tests.

## Threat model used

- **Attacker controls:** any QR shown to the camera (including looping or animated codes, mixed transfers, stickers
  over printed codes), pasted text, and image files the user picks.
- **Assets:** seller keys and keystore, payer funds, trusted settings (RPC endpoints, relayer, pinned signers), and
  privacy (camera frames, scanned content, provider identity).

## Findings and dispositions

| # | Severity | Finding | Disposition | Evidence |
|---|---|---|---|---|
| 1 | Medium | An imported RPC endpoint needed one tick and no trust confirmation. A forged "my devices" QR could install an RPC that misreports payments and learns which addresses are scanned. | **Fixed.** Changed RPC / second-RPC entries now require *Confirm trust changes*, which lists each chain with `old host → new host` and states the risk. | `lib/settingsExchange.ts` `needsTrustConfirmation`; tests in `settingsExchange.test.ts`, `Settings.exchange.test.tsx` |
| 2 | Low | Weaker preferences (longer idle lock, invoice key kept in the address bar, zero delays) were applied in one click. | **Fixed.** `weakensPreferences` makes such a change go through the same confirmation ("Weaker protection on this device: …"). Stronger or cosmetic changes are not affected. | same files; `Settings.test.tsx` |
| 3 | Low | The image pixel cap was checked only after the browser decoded the image (decompression-bomb DoS against one's own tab). | **Fixed for PNG, GIF, JPEG and WebP:** the declared size is read from the header (≤ 256 KiB probe) and refused before decoding. **Residual:** other formats (HEIC, AVIF, BMP) still rely on the 10 MiB file cap, the post-decode check and the browser's own limits. | `qr-exchange/src/readers.ts` `imageHeaderDimensions`; `readers.test.ts` |
| 4 | Low (privacy) | The settings QR could be copied as text or downloaded as SVG, so endpoint URLs (which may embed API keys) could end up in the clipboard or Downloads. | **Fixed.** `QrFrame allowExport={false}` whenever the export includes RPC, second-RPC or relayer sections. Preferences-only exports keep copy and download. | `components/QrFrame.tsx`, `views/Settings.tsx`; `Settings.exchange.test.tsx` |
| 5 | Low (i18n) | Review strings that decide trust were classed as neutral, so a machine draft could invert the "This device" / "Imported" columns. | **Fixed.** Those keys (`column.current`, `column.incoming`, `signerRemoved`, `unchanged`, `noChanges`, `chainHost`) and the new confirmation strings moved to the reviewed-translation group. | `i18n/securityKeys.ts`; `securityKeys.test.ts` |
| 6 | Info | Loopback and private-network URLs (`127.0.0.1`, `192.168.x.x`, `[::1]`, `localhost`, integer IPs) are accepted for RPC and relayer. | **Accepted, documented.** The existing Settings form validators accept the same (local nodes are a legitimate setup). The import is now always confirmed (finding 1). A dedicated "private network" warning is a possible follow-up. | — |
| 7 | Info (UX) | An aborted delivery marked a multi-part transfer as refused, and picking an image did not clear the mark. | **Fixed.** Only a real refusal is remembered, and an image pick is a new attempt. | `components/CameraImporter.tsx`; `CameraImporter.multipart.test.tsx` |
| — | (found by tests) | A refused multi-part payload was rebuilt and resubmitted on every loop of an animated code, which hid the refusal. | **Fixed.** Parts of the refused session are ignored until a new scan, paste, image or Start over. | `CameraImporter.multipart.test.tsx`, e2e `qr-camera-multipart.spec.ts` |

## Checked and found sound (reviewer's summary)

- **No action from a scan alone.** No scan, paste or image navigates, makes a network request, calls a wallet,
  changes settings or imports keys. Pay goes preview → explicit Open → ordinary review. SellerKeys requires a
  passphrase and a submit. Settings shows a preview with no fetch. No `console.*`, `fetch`, storage, `location`,
  `createObjectURL` or `innerHTML` in the changed non-test sources.
- **Settings apply.** It refuses a stale basis, a re-validated preview that fails, and forged signer selections.
  Signers must be lowercase compressed on-curve keys. Caps hold. URL bypass attempts (uppercase scheme, `https:/`,
  backslashes, `%69`, credentials, tab, `#`) were rejected or normalised. Non-ASCII is refused, so IDN appears only
  as punycode.
- **Multipart.** Memory is bounded, at most 64 × 700 chars for one transfer. Cross-session parts are rejected. A
  spliced or forged part with the same session id ends in a conflict or a failed integrity check (DoS only). A
  forged 64-bit SHA-256 prefix match is impractical. The CRC is documented as not being authentication. Delivery
  happens exactly once, idle expiry works, and part text is never rendered.
- **Camera.** Tracks stop on every exit path. Switching cameras never leaves two live streams. Device labels are
  never read, and frames stay in memory.
- **Images.** SVG and non-raster types are refused. No object URLs are created. The canvas is emptied and the bitmap
  closed. Nothing is uploaded.
- **Classifier and Pay hint.** Messages use fixed select codes with an `other` fallback, input is never echoed, and
  nothing is decrypted.
- **Keystore multipart.** The SECRET rules hold: reveal required, 60 s auto-hide, no copy or download. Switching to
  smaller codes requires revealing them again.

## Remaining trust assumptions

- A valid invoice signature proves key control, not seller identity. Fingerprints must be compared out of band.
- Multipart integrity is not authenticity. Anyone who can show frames can show a valid transfer, so every payload's
  own checks (signature, keystore encryption, settings review) are the authority.
- Settings pairing is unauthenticated: a "my devices" QR can be forged. The protection is the per-section preview,
  opt-in and confirmation, not the transport.
- Browser and OS camera permission UIs, BarcodeDetector and image decoders are trusted platform components.
- Physical-device behaviour is unverified (`PHYSICAL_DEVICE_ACCEPTANCE.md`).
