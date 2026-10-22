# Spec: offline / NFC payload (@ghostpay/merchant-hooks)
## Requirements
- R1 `encodeNdefUri(link, {maxBytes})` -> single NDEF URI record (well-known, type `U`, prefix 0x04 for https://); short record when payload < 256 else long. Default cap 888 (NTAG216); hard cap 8192.
- R2 Link rules: https, no userinfo, NO query string, secrets only in fragment `#gpi=v1.`.
- R3 `decodeNdefUri(bytes)` strict: exactly one record, MB+ME, TNF=1, type `U`, no chunk/ID, lengths consistent, prefix code in {0,3,4}, valid UTF-8, result re-validated by R2. Everything else throws.
- R4 `tagFit(bytes)` reports which tag types (NTAG213/215/216) fit.
- R5 Note: a tag is readable by anyone in range; the fragment holds the decryption key (ADR-0005): bearer secret.
## Acceptance tests
round trip; golden bytes for small link; long-record path; truncated/oversized/trailing garbage; wrong TNF/type; chunked flag; ID flag; http prefix rejected; query rejected; invalid UTF-8; size cap; fit table.
