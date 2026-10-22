# ADR-0021: QR exchange between computer and phone

Status: proposed (pre-audit)

## Context
Invoice links (up to 16 KiB) and encrypted keystore backups exceed one scannable QR. Phone-to-computer transfer must not use a server or third-party service, and must not expose the camera or scanned text.

## Decision
New package `@ghostpay/qr-exchange`:
1. Multipart format `GPQ1/<session>/<i>/<n>/<crc32>/<base64url>`; session = SHA-256(payload) prefix (8 bytes), checked after reassembly; strict parser; n <= 64, payload <= 32 KiB; default 400 chars/chunk (QR v14-L), grows to at most 700.
2. Pure core (encode/assembler) with no DOM; camera and detectors behind small interfaces, tested with fakes.
3. Scanning: platform `BarcodeDetector` first; fallback jsQR 1.4.0 (Apache-2.0, no deps, no install scripts, source read: pure computation) pinned exactly and wrapped, loaded lazily.
4. Camera never auto-starts; tracks always stopped; no frame leaves the device; no logging of decoded text.
5. Generation via `qrcode-generator` 2.0.4 (already used by the web app), byte mode ECC L/M.

## Alternatives
Raw single QR only (fails above ~2.9 KB, poor scan reliability); fountain codes / UR (more complexity and a new dependency, deferred); BarcodeDetector only (no Firefox); a hosted relay (server sees data, rejected).

## Consequences
Integrity detection is not authentication: payloads must be encrypted/signed by their own format. jsQR is unmaintained; it is replaceable behind `QrFrameDecoder`. Web integration and device testing remain open (see package DEVIATIONS.md). Not audited.
