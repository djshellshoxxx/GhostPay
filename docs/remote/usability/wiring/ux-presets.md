# Wiring plan: ux-presets (apps/web)

No apps/web code was touched. Planned wiring:

## Files
- `apps/web/src/state/presetStore.ts`: create the store after unlock with `createPresetStore({ storage: idbAdapter, key })`. `key` comes from the vault's existing HKDF-derived subkey (info string `ghostpay/presets/v1`), as a non-extractable CryptoKey. Drop the store reference on lock.
- `apps/web/src/storage/idbAdapter.ts`: `get/put` over an IndexedDB object store `presets` (strings only).
- `apps/web/src/features/presets/PresetList.tsx`, `PresetEditor.tsx`, `PayAgainButton.tsx`, `DraftReview.tsx`.
- `apps/web/src/features/history/ReceiptRow.tsx`: add "Pay again" action.

## Flow
1. History row tap -> build `PayContext` (clock, address-book resolve, risk service, fee quote, per-chain `validateAddress`, `supported`) -> `derivePayAgain(record, ctx)`.
2. On `ok:false`, show error by `error.code` (i18n); on ok navigate to the normal Send review screen prefilled from the draft. The send button stays disabled until the user explicitly confirms; if `draft.blocked`, show the blocking banner and require re-picking the payee.
3. Preset editor calls `store.save`; list calls `store.list`. `decrypt-failed` -> single "Saved presets are unavailable" state with a "start fresh" option (user-initiated only; never auto-clear).

## State
Draft lives in the send-flow state only; never persisted. Store errors surface as a toast.

## i18n keys
`presets.title`, `presets.empty`, `presets.save`, `presets.delete`, `presets.unavailable`, `payAgain.cta`, `payAgain.flag.addressChanged`, `payAgain.flag.riskHigh`, `payAgain.flag.riskIncreased`, `payAgain.flag.riskUnknown`, `payAgain.flag.feeChanged`, `payAgain.flag.feeUnavailable`, `payAgain.flag.stale`, `payAgain.error.{invalid-record,invalid-address,payee-mismatch,chain-mismatch,invalid-context}`.
Render memo/label/address as text only (no HTML); show full addresses with a diff for `address-changed`.

## E2E ideas
Pay again clean; fee +10% banner; payee address changed blocks until re-pick; corrupt IndexedDB blob shows unavailable state; lock then reopen restores presets; two tabs saving concurrently (note: cross-tab races are not serialized by the package, see audit).
