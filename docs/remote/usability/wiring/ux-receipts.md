# Wiring plan: ux-receipts -> apps/web

Files (proposed): `apps/web/src/features/receipts/{ReceiptShareSheet,DisclosureControls,PrivacyWarnings,ReceiptImport,VerificationBadge}.tsx`, `useReceipt.ts`, `chainVerifier.ts`.

State: from the payment history row build `PaymentRecord` in memory only (map from local payment store; never include key fields). `policy` state starts at `PRESETS.standard`; `warnings = analyzeDisclosure(record, policy)` recomputed on change; `receipt = await createReceipt(record, policy)` (catch ReceiptError SECRET_LIKE_MEMO -> inline error, disable Share).
Components:
- DisclosureControls: preset radio (minimal/standard/full), toggles (chain, amount, memo, tx hash), address selects (hidden / truncated / full), time select. Choosing full or tx hash requires an extra confirm tap when any `high` warning is present.
- PrivacyWarnings: list by severity, always show digest_not_signature and sharing_irreversible.
- ReceiptShareSheet: preview via `renderText`; actions Copy text, Copy JSON (`renderJson`), navigator.share with text only. Render preview with textContent.
- ReceiptImport: paste/scan JSON -> `verifyReceipt(text, {verifier, nowMs: Date.now()})` (clock read in UI layer). Show VerificationBadge; never show "Paid"/"Verified payment" for `self_consistent_unverified`; copy: "Unverified claim. Not signed."
- chainVerifier.ts: adapter over chain-adapters implementing `ChainVerifier`, user-configured RPC only, opt-in toggle "Check on-chain" with note that the RPC sees the tx hash.
i18n keys: `receipts.title`, `receipts.preset.{minimal,standard,full}`, `receipts.field.*`, `receipts.form.{full,hidden,truncated}`, `receipts.warn.<code>` (all codes in spec R6), `receipts.verdict.{invalid,self_consistent_unverified,chain_confirmed,chain_problem}`, `receipts.chain.<status>`, `receipts.caveat.<code>`, `receipts.error.<ReceiptErrorCode>`, plus `ReceiptLabels` keys passed to `renderText`.
E2E ideas: standard share contains no memo/tx hash; toggling memo with "viewing key" text blocks sharing; editing one char of imported JSON shows invalid; imported valid receipt without verifier shows unverified wording; mocked verifier mismatch shows chain_problem; bidi memo in imported JSON rejected.
