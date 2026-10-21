# Spec: POS / QR terminal mode (@ghostpay/merchant-hooks)
## Requirements
- R1 `buildQrPayload(link)`: validated link string (https, fragment `#gpi=v1.`), UTF-8 byte length <= 2953 (QR v40-L byte mode) else throw; returns `{payload, bytes}`. Rendering is done by the app (apps/web already pins qrcode-generator 2.0.4); this package has no QR lib.
- R2 POS session reducer, pure: states idle -> awaiting -> paid | expired | cancelled. TTL 30..900s. Partial payments accumulate (bigint); paid when sum >= due. Wrong invoiceId events rejected. Terminal states absorb all events (`accepted:false`). `tick` expires at now >= expiresAt. Session id from injected random.
## Acceptance tests
each transition; TTL bounds; partial then full; overpay counts paid; wrong invoice; late event after expiry; terminal absorb; payload size limit; non-https; bigint amounts.
