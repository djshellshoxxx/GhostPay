# Deviations and open points (@ghostpay/address-safety)

1. **Not integrated.** No app or package calls this yet (out of scope).
2. **Dependency.** The spec says zero runtime dependencies; the task fixed `viem` 2.57.7 (checksum only) and `node:crypto` for `metaAddressFingerprint`. The latter makes the package Node-only; a browser build needs a WebCrypto or `@noble/hashes` variant.
3. **Result shapes.** Rejections are `{ ok: false, reason }`; `sanitizeDisplayText` success is `{ ok: true, text, replaced, mixedScript }` (extra `ok`/`mixedScript` fields versus the spec). `replaced` counts mixed-script markers inserted.
4. **Throws for programmer errors.** Malformed addresses passed to the already-typed functions, bad nibble counts (outside 1..20) and invalid meta-address length throw `AddressSafetyError`.
5. **`recentCounterparties` is accepted but unused** by `classifyDestination`; the return union has no class for it. `lookalike_of_saved` is checked against `saved` only (not own/fee addresses).
6. **`fingerprint`** shows all ten groups (`0x` + 4-nibble groups), checksummed; the spec's `...` example is not reproduced because confirmation views must not truncate.
7. **Extra rejections:** `Cc` control characters (including newline and tab) and text over 4096 UTF-16 units. ZWJ is allowed only with `allowZwjEmoji` and only between non-space characters; U+FE0F likewise.
8. **Mixed-script** only covers Latin with Cyrillic/Greek per whitespace-delimited token. Same-script homoglyphs and UTS #39 skeleton checks are not implemented.
9. **`payeeTrust`** uses a minimal structural input (`signatureValid`, `signer`), not the real `invoice-schema` type; the adapter is the integrator's job. Key comparison is case-insensitive text equality.
10. **Not done:** the Playwright Node-vs-browser agreement run and the NFC/NFKC interplay test against `invoice-schema` `text()` (no cross-package import allowed). NFC only is applied here.
