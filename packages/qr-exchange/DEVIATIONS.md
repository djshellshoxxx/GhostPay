# Deviations and open points (@ghostpay/qr-exchange)

1. **Not integrated into apps/web.** Out of this package's ownership; invoice, URL, payment and backup screens still show single QRs. Integration needs a view that cycles chunks and a scan button (README).
2. **Real-device behaviour untested.** Camera, `BarcodeDetector`, canvas and permission prompts are tested with fakes only; jsQR is tested on synthetic perfect renders, not photos of screens. Needs manual device testing (iOS Safari, Android Chrome, Firefox).
3. **Animated QR needs line of sight and time.** No fountain/erasure coding: a missed chunk must be shown again (loop display). Chunk count is capped at 64.
4. **CRC32 is not security.** Forged chunks with a valid CRC are caught only by the final SHA-256 prefix (64 bits) check; an attacker who controls all frames can supply any payload and its matching session id. Authenticity must come from encryption/signature of the payload.
5. **Session id leaks 64 bits of SHA-256(payload)** to anyone seeing a frame. Harmless for high-entropy or encrypted payloads; a low-entropy plaintext payload can be confirmed by guessing (it is already visible in the frames).
6. **`BarcodeDetector` is not available everywhere** and its internals are platform-defined; jsQR is unmaintained (2021).
7. **Single transfer per Assembler**; failed integrity resets it. Memory held until `reset()` or GC; no secure wipe of payload copies (JS limits).
8. **ECC H and Kanji/alphanumeric modes not offered**; only byte mode L/M.
9. `package-lock.json` gained entries for this workspace and `jsqr`; root `build:libs` does not build this package (root package.json not owned).
