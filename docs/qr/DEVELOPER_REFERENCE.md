# QR and device exchange — developer reference

Pre-audit. AI-assisted review only (see `README.md`). All encode/decode is local; no remote QR service is used.

## Layers and ownership

| Layer | Module | Responsibility |
|---|---|---|
| Codec (portable, no DOM) | `packages/qr-exchange` | GPQ1 multipart encode/assemble, camera lifecycle helpers, frame and image readers, settings exchange (v1/v2), public seller pairing, public meta-address QR |
| Chain URIs (portable) | `packages/payment-uri` | EIP-681, ERC-3770, BIP-21/321/352, Solana Pay transfer, GhostPay `tron:`, invoice link |
| Invoice envelope | `packages/invoice-schema` | `#gpi=v1.` fragment, signature, encryption, receipts |
| Classification (web) | `apps/web/src/lib/qrClassify.ts` | `classifyQrText` → typed family; delegates to the owning parsers |
| Display helpers (web) | `apps/web/src/lib/qr.ts`, `qrMultipart.ts`, `qrKinds.ts` | QR matrix/SVG, when to split, frame kind per payload type |
| UI | `components/CameraImporter.tsx`, `components/QrFrame.tsx` | the only scanner and the only QR display; every screen reuses them |

Do not add another scanner component or codec: extend these.

## Payload families

`classifyQrText(text, opts)` never throws, never acts, never echoes input. `validated: true` means the owning parser
ran. `false` means only the envelope was checked, and the accepting screen **must** run the owning parser on the
original text.

| Family | Wire form | Owning parser | `validated` | Screen |
|---|---|---|---|---|
| `multipart-fragment` | `GPQ1/<session16hex>/<i>/<n>/<crc32>/<b64url>` | `parseChunk` | true | whichever importer has `multipart` |
| `invoice-link` | `https://<host><path>#gpi=v1.<b64url>` or bare `#gpi=v1.…` | `openFragment` (async) + Pay's host/path check | false | Pay |
| `evm-request` | `ethereum:` (EIP-681), `<short>:0x…` (ERC-3770) | `parseEip681`, `parseChainAddress` | true | none (named only) |
| `bitcoin-request` | `bitcoin:` | `parseBitcoinUri` | true | BTC |
| `solana-request` | `solana:` | `parseSolanaPay` | true | Solana |
| `tron-request` | `tron:` (nonstandard) | `parseTronUri` | true | TRON |
| `public-meta` | `st:eth:0x…` or `{"format":"ghostpay-public-meta","v":1,…}` | `parsePublicMetaQr` | true | Registry |
| `seller-pairing` | `{"format":"ghostpay-seller-public","v":1,…,"check"}` | `parseSellerPairing` | true | Seller keys |
| `settings` | `{"format":"ghostpay-settings","v":1|2,"settings":{…}}` | `parseSettingsExchange` / `parseDeviceSettingsExchange` | false | Settings |
| `seller-receipt` | signed receipt JSON | `parseVerifiedReceipt` | true | Pay |
| `payment-proof` | `{"kind":"ghostpay-local-receipt","version":1,…}` | none (export only) | false | none |
| `encrypted-keystore` | keystore JSON envelope | `validateKeystoreEnvelope` (never decrypts) | true | Seller keys |
| `unknown` | — | reason: `empty`, `too-large`, `unsupported-scheme`, `malformed`, `ambiguous`, `unsupported-version`, `unknown-format` | — | — |

Text matching two families is `ambiguous`, never a guess. `javascript:`, `data:`, `file:`, `blob:`, `intent:` and
the like are `unsupported-scheme` before any lookup. The cap is 64 KiB UTF-8, checked before parsing; NUL, control,
bidi and BOM characters are refused.

## Multipart (GPQ1) — ADR-0021

- Payload 1..32 768 bytes, at most 64 parts, 32..700 base64url chars per part (default 400, about QR v14-L), part
  text ≤ 737 chars. Non-final parts are equal length. Base64url must be canonical.
- `session` is the first 8 bytes of SHA-256(payload), recomputed after assembly. A mismatch gives
  `INTEGRITY_FAILED` and everything is discarded. The CRC only catches accidental corruption. **Neither is
  authentication**: anyone who can show you frames can show you a valid transfer. Encrypt secrets (keystores
  already are), and verify the assembled payload with its owning parser.
- `Assembler({ now?, maxAgeMs = 600 000 })`: order-independent; duplicates are ignored. Another session or total
  gives `SESSION_MISMATCH`, and a different body for a held index gives `CHUNK_CONFLICT` (state unchanged). Idle
  longer than `maxAgeMs` gives `SESSION_EXPIRED` and a reset. `missing()` returns zero-based missing indices;
  `session` is a getter. Memory is bounded by 64 × 700 chars for one transfer.
- `CameraImporter multipart` delivers the assembled payload to `onText` once, as strict UTF-8. If `onText` refuses
  it, further parts of that session are ignored until the user starts a new scan, pastes, or presses Start over, so
  a looping animated code cannot resubmit forever. The importer's partial state resets on Stop, scope change, a
  closed disclosure, a hidden page and unmount.
- Display: `multipartIfNeeded(text, { force? })` splits only when one QR cannot hold the text, or on an explicit user
  choice. GPQ1 is GhostPay-only, so a single code is preferred wherever a phone camera app should open it.
  `QrFrame chunks` shows "Part i of n" with manual steps; auto-advance is opt-in and off under reduced motion.

## Camera and image input

- `startCamera(video, mediaDevices, { signal, deviceId?, secureContext? })` must be called from a user gesture. The
  default constraint is `facingMode: environment`, and `deviceId` is matched exactly. Errors map to
  `CAMERA_DENIED`, `CAMERA_NOT_FOUND`, `CAMERA_IN_USE`, `CAMERA_INSECURE`, `CAMERA_UNAVAILABLE`.
- `scanFromVideo` stops every track on finish, abort or error; it reads at a 120 ms interval and skips consecutive
  identical texts. `listVideoInputs` / `activeDeviceId` expose ids only, never labels.
- `decodeQrImage(file, { signal })`: raster images only (SVG rejected), ≤ 10 MiB file, ≤ 40 MP bitmap, downscaled to
  ≤ 1600 px. It tries BarcodeDetector, then jsQR. No object URLs; the bitmap is closed on every path. **Residual:**
  the pixel cap is checked after the browser has decoded the image, so protection against decompression bombs is
  only the 10 MiB file cap plus the browser's own limits.
- Frames and decoded text are never logged, rendered as status, or sent.

## Settings exchange

| | v1 | v2 (my devices) |
|---|---|---|
| Envelope | `{"format":"ghostpay-settings","v":1,"settings":{5 prefs}}` | `{"format":"ghostpay-settings","v":2,"settings":{sections}}` |
| Sections | preferences only | optional `preferences` (all 5 or none), `rpcUrls`, `rpcUrlsSecondary`, `relayerUrl` (`''` = none), `pinnedSigners`. At least one present. |
| Limits | 4096 bytes | 2900 bytes (always one QR); ≤ 32 entries per RPC map; ≤ 50 pinned signers; URLs ≤ 1024 chars |
| Validation | strict JSON, exact keys | plus: chain-id keys canonical decimal from the caller's allowlist; URLs through the injected validator **and** the package minimum (https/wss, https only for the relayer, no credentials, `#`, whitespace or controls, no relayer query); signers lowercase compressed secp256k1 points, unique |
| API | `exportSettingsExchange` / `parseSettingsExchange` (unchanged; the CLI uses them) | `exportDeviceSettingsExchange(selection, opts)`, `parseDeviceSettingsExchange(text, opts)`, `validateDeviceSettings` |

A preferences-only export still emits exact v1 text. Web `applySettingsExchange(current, preview, selection)` is pure:
it re-validates the preview, refuses a stale basis, merges RPC entries per chain, adds only ticked signers,
removes only on the explicit opt-in, refuses any result that `sanitizeSettings` would alter, and the view saves once.
Trust-changing sections (relayer, signers) need a confirmation step. No network call is made to an imported endpoint
during the preview.

## Secrets boundary

Public pairing, settings and payment-request payloads never contain private keys, passphrases, tokens or vault
contents (tests assert this). Secret transfer is only the encrypted keystore (`SECRET` frame: reveal required, 60 s
auto-hide, no copy or download). The multipart view of it is a new payload scope and must be revealed again. Tag
archives (spec 08, up to 20 MB) move as files, not QR. Key rotation is one atomic IndexedDB transaction (no
half-rotated state). It does not undo a past view-key exposure.

## Tests

| Area | Where |
|---|---|
| Codec | `packages/qr-exchange/src/*.test.ts` (assembler, multipart fuzz, camera, readers, settings-exchange incl. fast-check round-trip, seller) |
| URIs | `packages/payment-uri/src/{vectors,negative,fuzz}.test.ts` |
| Classifier | `apps/web/src/lib/qrClassify{,.fuzz}.test.ts` |
| Importer | `apps/web/src/components/CameraImporter{,.behavior,.lifecycle,.multipart,.i18n}.test.tsx` |
| Screens | `views/Pay.invoiceQr.test.tsx`, `views/Settings.exchange.test.tsx`, `views/SellerKeys.test.tsx`, `views/CreateInvoice.test.tsx` |
| Browser (virtual camera) | `apps/web/e2e/qr-camera.spec.ts`, `qr-camera-multipart.spec.ts` (Y4M fixture: `e2e/qr-video.mjs`) |

```bash
npm run build -w @ghostpay/qr-exchange && npm test -w @ghostpay/qr-exchange
```

```bash
cd apps/web && npx vitest run src/lib/qrClassify src/components/CameraImporter src/views/Settings src/views/Pay.invoiceQr
```

```bash
cd apps/web && npx playwright test e2e/qr-camera.spec.ts e2e/qr-camera-multipart.spec.ts --project=desktop --trace off
```
