# QR codes, scanning and moving data between your devices — user guide

GhostPay makes and reads every QR code on your own device. Nothing you scan, and no camera picture, is sent anywhere.
Scanning something never pays, signs, imports keys or changes settings by itself: you always see a review first and
press a separate button.

## QR frame colours

Every QR code in GhostPay sits in a coloured frame with a text label, so you know how careful to be:

| Label | Colour | Meaning |
|---|---|---|
| SECRET | red | Anyone who scans it can spend your funds or decrypt your data. It stays hidden until you press Reveal and hides again after 60 seconds. Never photograph it in public. |
| PRIVATE LINK | orange | An invoice link that contains its own decryption key. Share it only with the payer. |
| SHARE | green | Safe to show to the person paying you (an invoice link, your public meta-address). |
| MY DEVICES | blue | Settings moving between your own devices. Not secret, but private. |
| PROOF | purple | Receipts and payment records. They can be checked, but a receipt is not proof of payment on its own. |
| CAUTION | yellow | Test-network, unsigned or unverified data. |

## Scanning, in general

1. Press **Scan with camera**. Your browser asks for camera permission only at this point.
2. Point the camera at the code. The camera stops as soon as the code is accepted. It also stops when you press
   **Stop camera**, close the section, leave the page, or switch to another tab or app.
3. With more than one camera (for example a phone's front and back), use **Switch camera**.
4. No camera, or it won't focus? Use **Or paste QR text**, or **Read a QR from an image** (a screenshot or photo,
   up to 10 MiB). The image is decoded on your device and is not uploaded.

### Camera problems

| Message | What to do |
|---|---|
| Camera access was denied | Allow the camera for this site in your browser's site settings, then press Scan with camera again. Or paste the text or use an image. |
| No camera was found on this device | Use paste or image import. |
| The camera could not be started | Another app may be using the camera. Close it and try again. |
| The camera only works on a secure (HTTPS) page | Open GhostPay over `https://` (or `localhost`). |
| Camera stopped while the page was hidden | This is deliberate. Press Scan with camera again. |
| The camera could not read a QR code | Move closer, add light, avoid glare, or use image import. |

## Pay an invoice from a QR code

1. Open **Pay** → **Scan an invoice QR**.
2. Scan the seller's code. You'll see **Review scanned invoice**: the chain, and whether the invoice signature is
   valid. A valid signature shows that the key in the invoice signed it. It does **not** prove who the seller is.
   Check the seller fingerprint with them by another channel.
3. Press **Open scanned invoice**. This opens the normal payment review, with amount, destination, fees and expiry.
   Nothing has connected to your wallet yet.
4. Only when you press the wallet buttons in that review is a payment prepared, and your wallet asks you to confirm
   it as well.

If you scan something that is not an invoice, Pay tells you what it is (for example "a device settings QR — import it in
Settings" or "a plain wallet payment request") and does nothing with it.

### Long invoices: several codes

An invoice with many items can be too long for one code. Create invoice then shows it as **Part 1 of N** and so on.
Use **Next part** / **Previous part**, or tick "Step through the parts automatically" (about every 2.5 seconds). If
your device asks for reduced motion, automatic stepping is off; use Next part. On the paying device:

- Keep the camera on the codes while the parts change. Progress shows "3 of 7 parts received. Still missing: …".
- Parts can arrive in any order, and a missed part is caught the next time it comes round.
- "That part belongs to a different transfer": you scanned a code from something else. Press **Start over**, or
  finish the current transfer.
- "The transfer timed out": no new part arrived for 10 minutes, so the parts so far were cleared. Scan all parts again.
- Ordinary phone camera apps cannot read multi-part codes. Use GhostPay's own scanner, or send the link as text.

## Show a payment request

- **EVM chains**: Create invoice produces a signed invoice link and QR. That is the payment request.
- **Bitcoin (test networks)**: the BTC view shows a `bitcoin:?sp=…` Silent Payments request.
- **Solana / TRON**: the views show your stealth meta-address. "Plain payment request" can also show an ordinary
  wallet request for a normal receive address. The TRON form is GhostPay-specific, so other wallets will not read it.

See `CHAIN_URI_MATRIX.md` for exact formats.

## Move settings to your other devices

Settings → **Move settings to your other devices**.

On the device you are copying **from**:

1. Choose what to include. Preferences are selected by default. RPC endpoints, second RPC endpoints, relayer URL and
   pinned signer public keys are not. RPC URLs can reveal which provider (and sometimes which account) you use.
2. Check "The QR will contain exactly:", then press **Show settings QR**.

On the device you are copying **to**:

1. Under **Import settings from another device**, scan the code.
2. **Review imported settings** shows each setting as "This device" against "Imported". Nothing is applied yet.
3. Tick only the sections you want. Imported RPC endpoints replace only the chains listed. Each new signer key has its
   own tick box. Pinning a key means invoices signed by it are shown as trusted, so only pin keys you have checked.
4. Press **Apply selected settings**. Changes to the relayer or to pinned keys ask you to **Confirm trust changes**.
   Everything you selected is saved together, or nothing is.

Scanning the same code again shows "No changes". Secret keys never travel in this code.

## Move your seller keys (encrypted backup)

Seller keys move only as an **encrypted keystore**, protected by a passphrase. That is separate from the public
seller config and from settings.

1. On the old device: Seller keys → **Download encrypted keystore** (choose a strong passphrase). The red SECRET
   QR appears. Press Reveal only in private.
2. For a phone with a weak camera, tick **Show as several smaller codes**. Every part is still secret.
3. On the new device: Seller keys → **Import encrypted keystore QR**, scan the code or every part, then enter the
   passphrase. A wrong passphrase imports nothing.

The **public seller config** (meta-address and invoice-signing public key) can be shown on your other devices for
comparison. Importing it is preview only and loads no keys.

## Receipts and payment records

- **Seller receipt**: a seller can show a signed receipt QR. In Pay, under **Import a seller receipt**, tick the
  consent box, scan the code, then **Check receipt against this invoice**. A valid receipt shows the seller's key
  signed it for this invoice. It does not replace checking the payment on chain, and it does not prove the seller's
  identity.
- **Proof of payment** (payer): after paying you can show, copy or download your own payment record. It records what
  your device submitted. It is not independent proof: only the chain, or a seller-signed receipt, is evidence.
