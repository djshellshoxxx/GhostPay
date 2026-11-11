# QR codes and moving data between devices

GhostPay generates and reads every QR code on the device. Nothing scanned, and no camera frame, is sent anywhere.
A scan never pays, signs, imports keys or changes settings on its own: there is always a review and a separate button.

> Source of truth: the repository folder `docs/qr/`. This page summarises it for the wiki.

## For users

- **Pay from a QR:** Pay → *Scan an invoice QR* → *Review scanned invoice* → *Open scanned invoice* → the normal
  payment review. A valid signature does not prove who the seller is.
- **Long invoices** appear as *Part 1 of N*. Keep GhostPay's scanner on the codes; parts can arrive in any order, and
  a missed part is caught on the next loop. Ordinary camera apps cannot read multi-part codes.
- **Move settings:** Settings → *Move settings to your other devices*. Endpoints, relayer and signer keys are off by
  default; on import, tick only what you want. Trust changes need confirmation. Everything is applied together, or nothing is.
- **Move seller keys:** only as the encrypted keystore (red SECRET frame, passphrase required). *Show as several
  smaller codes* helps weak cameras.
- **Receipts:** a seller receipt shows the seller's key signed it for this invoice. It is not proof of payment on its own.
- **Camera trouble:** allow the camera in site settings, use HTTPS, close other apps using the camera, or use
  *Or paste QR text* / *Read a QR from an image*.

Full guide: `docs/qr/USER_GUIDE.md`.

## For developers

- One scanner (`CameraImporter`) and one display (`QrFrame`); do not add others.
- `classifyQrText` (`apps/web/src/lib/qrClassify.ts`) types every payload family and fails closed. Accepting screens
  still run the owning parser.
- GPQ1 multipart: ≤ 32 KiB, ≤ 64 parts, SHA-256 session check after assembly. This is integrity, not authentication.
- Settings exchange v2: optional sections, ≤ 2900 bytes, strict schema, injected URL validators plus a package
  minimum, pure atomic apply.
- Chain URIs: EIP-681/ERC-3770, BIP-21/321/352, Solana Pay transfer, and a nonstandard GhostPay `tron:` form.

Reference: `docs/qr/DEVELOPER_REFERENCE.md`, `docs/qr/CHAIN_URI_MATRIX.md`. Device qualification:
`docs/qr/PHYSICAL_DEVICE_ACCEPTANCE.md` (all pending).
