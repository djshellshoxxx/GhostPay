# @ghostpay/qr-exchange

Move data between computer and phone with QR codes. Pre-audit, not audited, no real keys or funds. Offline: no network, no third-party service.

## What is in it

- `encodeMultipart(bytes, {chunkChars?})` -> `string[]` chunk texts; `Assembler.add(text)` -> `{progress, received, total, complete, payload?}`.
- `startCamera(video, navigator.mediaDevices)` (call only from a user gesture) and `scanFromVideo(video, onText, {signal})`.
- Readers: platform `BarcodeDetector` when it supports `qr_code`, else canvas + jsQR 1.4.0 (loaded on demand). Both sit behind `FrameReader` / `QrFrameDecoder`.
- `qrMatrix(text, 'L'|'M')` and `qrSvgPath(matrix)`: local generation with `qrcode-generator` (same library and byte mode as `apps/web/src/lib/qr.ts`).

## Chunk format

`GPQ1/<session>/<i>/<n>/<crc32>/<base64url>`

- `session`: 16 lowercase hex = first 8 bytes of SHA-256(payload). After reassembly the assembler recomputes it; a mismatch discards everything (`INTEGRITY_FAILED`).
- `i` 0-based, `n` 1..64, canonical decimals. `crc32`: 8 hex over `session/i/n/data` (accidental scan corruption only, not authentication).
- Limits: payload 1..32768 bytes, n <= 64, 32..700 base64url chars per chunk, chunk text <= 737 chars. Non-last chunks must have equal length, the last no longer; base64url must be canonical (no padding, no spare bits).
- Parser rejects on any deviation. Duplicates are ignored; another session/total -> `SESSION_MISMATCH`; same index with different body -> `CHUNK_CONFLICT`; neither changes state. Errors carry fixed messages and never include scanned text.

Integrity is not secrecy or authenticity: anyone who can show you QR frames can show you a valid transfer. Encrypt (keystore backups are already encrypted) and verify what you received (address, amount, invoice signature) after reassembly.

## QR capacity (measured with `qrcode-generator`, byte mode)

| Case | Chunks | Max chunk text | ECC L version | ECC M version |
|---|---|---|---|---|
| 1 KiB payload (default 400 chars) | 4 | 435 | 14 (73x73) | 16 |
| 16 KiB invoice link (default) | 55 | 437 | 14 | 16 |
| 32 KiB (auto-grown to ~683 chars) | 64 | 720 | 19 (93x93) | 22 |

Defaults stay at version <= 14 (L) so a phone can read it off a laptop screen. Theoretical byte-mode maximum is 2953 bytes (v40-L) but such codes are unreliable on cameras. Use M for glossy/small screens or printouts. A 16 KiB transfer is 55 frames; at about 2 frames/s that is under a minute, scanned in any order and repeatedly.

## Camera and privacy rules

- Nothing starts the camera except an explicit `startCamera` call; the page must call it from a click.
- `scanFromVideo` always (finish, abort, error) stops every track and detaches the stream. Frames stay in memory (one downscaled canvas, max 800 px), never leave the device. Decoded text is never logged here; callers must not log it either.
- Read failures: 30 consecutive failures -> `SCAN_FAILED`. Text > 4096 chars is dropped. Consecutive identical texts are skipped.

## jsQR evaluation

Pinned `jsqr@1.4.0`: Apache-2.0 (package.json and LICENSE), no dependencies, no install scripts, published 2021-04-24, tarball integrity matches the lockfile. Read `dist/jsQR.js` (10k lines, webpack UMD): pure computation on `Uint8ClampedArray`, no `eval`/`Function`/network/DOM. Unmaintained since 2021: weaker than native detectors on blurry or small codes; it is only the fallback. Update path: swap `loadJsQrDecoder` implementation behind `QrFrameDecoder`.

## Using it from the web app (not wired here)

`apps/web` is not edited by this package. A view needs: `<video playsinline muted>`, a button calling `startCamera` then `scanFromVideo` with an `AbortController`, and `Assembler`; for display, cycle `qrMatrix(chunk)` + `qrSvgPath` every ~500 ms.

Commands: `npm run build|test|lint|typecheck -w @ghostpay/qr-exchange`.
