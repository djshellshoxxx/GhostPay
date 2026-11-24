# W5 residual localization — 2026-11-09

Base: PR #88, `0a68a57b77a70d3bcf4635ccbc5190d735e71f40`.
Branch: `codex/ghostpay-i18n-20261109`.

## Completed

- `ReceiptPanel` labels, disclosures, consent, outcomes and exact amount display use the catalog. Locale changes do not rebuild a receipt or change its signed JSON. Bearer input and receipt JSON stay LTR under RTL locales.
- `lib/errors` accepts a translator; catalog-backed user errors retain their source `Error.message` and render using the current translator. Receipt parser exceptions remain `TypeError` instances and preserve the existing English diagnostics, with keys instead of English-only presentation. No receipt validation condition changes.
- Solana/TRON fixed library error codes, network/wallet/scan/sweep errors, and sweep warnings use catalog keys. Unknown adapter codes fail to a fixed generic message rather than raw exception text. Existing review amounts and warning data survive language changes.
- `storedHistoryChains` reports its failure through a catalog-backed error; `TagArchive` displays it with its current translator.
- Added the QR lane's neutral Registry preview labels and included unsupported chains in the public-config refusal.

All four shipped catalogs contain the same 192 new keys. Five are neutral labels with Spanish/Japanese/Arabic machine drafts. The other 187 concern payment, consent, signatures, keys, errors, amounts, addresses or privacy and remain English in every draft pending human review. `REVIEWED_LOCALES` is unchanged. The extra identical-English catalog warnings are deliberate visible translation debt; no checker rule or gate was relaxed.

## Validation

Executed locally on the complete source change before this documentation-only commit:

- `npm ci --ignore-scripts`: exit 0.
- `npm run build:libs`: exit 0.
- `npm run typecheck -w @ghostpay/web`: exit 0.
- `npm run lint -w @ghostpay/web`: exit 0.
- From `apps/web`: `npx vitest run src/lib/errors*.test.ts src/lib/receipts*.test.ts src/components/ReceiptPanel*.test.tsx src/components/TagArchive*.test.ts* src/features/solana/chain.hardening.test.ts src/features/tron/chain.hardening.test.ts src/features/solana/SolanaView*.test.tsx src/features/tron/TronView*.test.tsx src/i18n/securityKeys.test.ts --maxWorkers=2`: 18 files, 174 tests passed, none skipped. This is focused regression validation, not a full web suite or coverage run.
- `node scripts/i18n/check.mjs`: four catalogs, 0 errors, 779 warnings. Baseline had 214 warnings. New security keys are intentionally English in unreviewed catalogs, and the existing seller-config refusal is now English in the three drafts.
- `node scripts/i18n/extract.mjs`: 0 missing source keys. New descriptor/error-map uses have static extraction hints.
- `git diff --check`: exit 0.

The first focused run exposed a capacity-error mock that used plain `Error`; the real vault uses `UserFacingError`. The mock now models that contract. Known user-facing capacity messages stay useful, unknown archive exceptions produce the fixed archive failure message, and the vault is still locked/retryable.

## Remaining scope

This does not claim full-application localization. Other screens and libraries still construct English `UserFacingError` messages, and unmodified callers of `userMessage` retain its source-English default until they pass their current translator. The reconciliation ledger still has English-only controls. Native review of security copy remains required before translated critical messages can be shown. No chain, payment, deployment, signing or review registry settings changed.

## Node/E2E collection follow-up

Integration exposed a module-boundary regression: `receipts.ts` imports the localized error types, whose source renderer originally imported the React provider and Vite-only catalog loader. Playwright's Node process refused the English JSON import during collection.

The source catalog and translator now live in pure modules. The static catalog uses the standard JSON import attribute; the translator retains the same key classification and source fallback logic. Browser catalog loading and the React provider re-export the existing public symbols, while pure error helpers no longer load either browser module.

Follow-up validation:

- `GHOSTPAY_CHROMIUM=/usr/bin/chromium npm run test:e2e -w @ghostpay/web -- --list`: exit 0, 59 tests in 12 files collected. Before the fix: exit 1, zero tests collected, JSON import-attribute error.
- `npm run typecheck -w @ghostpay/web`, `npm run lint -w @ghostpay/web`, `npm run build -w @ghostpay/web`: exit 0; bundle scan passed.
- From `apps/web`: `npx vitest run src/lib/errors*.test.ts src/lib/receipts*.test.ts src/components/ReceiptPanel.i18n.test.tsx src/i18n --maxWorkers=2`: 13 files, 97 tests passed. This follows the checked-in Vitest include/exclude rules.
- `git diff --check`: exit 0.

Collection is not an executed browser suite; the coordinator owns the integrated E2E run.
