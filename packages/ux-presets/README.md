# @ghostpay/ux-presets

Pure logic for saved payment presets and one-tap "pay again" (spec `pay-again-presets`).
No DOM, network, analytics or timers; clock, address validation, fee quotes and storage are injected.

- `derivePayAgain(record, ctx, opts?)` / `presetToDraft(preset, ctx, amount?, opts?)` return a
  `PaymentDraft` with `autoSend: false`, `requiresReview: true` and flags
  (`address-changed`, `address-risk-*`, `fee-changed`, `fee-unavailable`, `record-stale`).
  `block` flags set `draft.blocked`.
- `createPresetStore({ storage, key, slot?, crypto? })`: AES-256-GCM encrypted preset store.
  `key` is a CryptoKey or 32 derived key bytes (no password KDF). Blob format:
  `base64url(0x01 || iv12 || ciphertext || tag16)`, AAD `ghostpay/ux-presets|v1|<slot>`.
  All open failures return the identical `decrypt-failed` error.

See docs/remote/usability/specs/pay-again-presets.md, wiring/ux-presets.md and audit-ux-presets.md.
