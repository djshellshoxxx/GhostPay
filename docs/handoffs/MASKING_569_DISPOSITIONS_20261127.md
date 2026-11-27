# #569 masking tests: dispositions on main (2026-11-27)

Follow-up to the [#569 comment](https://github.com/djshellshoxxx/GhostPay/pull/569#issuecomment-7202318339): six test
cases added by #569's own commits (donor head `c30283d2`) had no test with the same title on `main`. #708 hand-ported
the masking mechanism with a different design (for example Home and About stay visible). For each case, this records
whether it applies to `main` (base `6bc97fde`), what was ported, and why the rest does not apply.

AI-assisted review and local tests only. Not an audit. Nothing deployed. The #569 branch is kept.

| # | Donor case | Disposition on main |
|---|---|---|
| 1 | `e2e/privacy-mask-history.spec.ts`: an invoice opened or reloaded in privacy mode needs fresh reveal | **Applies. Ported** unchanged as `apps/web/e2e/privacy-mask-history.spec.ts`, with the donor's `e2e/assertMaskedDocument.ts` helper. Passes on main: the preference survives a fresh open and a reload, and the invoice stays out of the text, markup, form values and accessibility tree until a new reveal |
| 2 | same file: Home and About mask manifest addresses while keeping the fee schedule readable | **Does not apply.** #708 keeps Home and About visible on purpose: they show public deployment data (router, fee recipient and relayer addresses from the signed manifest). Not ported |
| 3 | same file: local `btc`/`solana`/`tron` wallet creation, lock and replacement each need fresh consent | **Not ported for the beta.** These test-wallet views exist only in the full profile (`App.tsx`), not in the lean Pages entry (`AppLean.tsx`); the donor test itself returns early under lean. They are proofs of concept outside the approved EVM scope. On main, creating or locking such a wallet does not end an active reveal (only the app lock, session changes, scope changes, a hidden tab, page exit and wallet events do). Record as a follow-up if the full profile is ever released |
| 4 | `e2e/wallet-disclosure.spec.ts`: a newly revealed checkout cannot inherit the previous wallet's receipt file | **Applies, and was a gap. Fixed.** Ported into `apps/web/e2e/flows.spec.ts` on main's wallet fixture. On main the uncontrolled receipt file input kept the file chosen for the previous wallet after an account change (the reset handler cleared consent, key and bound receipt, but not the file). `Pay.tsx` now remounts that input from the same wallet-invalidation handler. A file chosen before the first connection is kept |
| 5 | `src/AppShell.privacy.test.tsx`: revokes an active reveal on a vault-side lock and while a tag wipe is unresolved | **Partly applies. Adapted.** #708 does not list a tag-vault lock among the reveal revocations ("lock" there is the app lock), so the reveal itself is not asserted. What applies is ported to `apps/web/src/AppShell.masking.test.tsx`: tags leave the live document at once on a vault-side lock and when a wipe starts, stay hidden while the wipe is unresolved and after it fails, and the seller keys are kept. Passes on main. Whether a tag-vault lock should also end the global reveal is an open design choice, not a defect found here |
| 6 | `src/lib/privacyMode.test.tsx`: discards pending confirmation when a separately revealed history closes | **Does not apply.** Main has neither the donor's `PrivateHistory` (a separately revealed transaction history) nor its in-page `ConfirmAction`; #708 lists `ConfirmAction` as a follow-up and uses native confirm dialogs. Not ported |

## Evidence

Local runs on branch `claude/loving-brown-v8dlp6` (Node 22.23.5, Chromium from `/opt/pw-browsers`, 4 CPUs):

- Case 4, unit: `npx vitest run src/views/WalletPrivacy.lifecycle.test.tsx --coverage=false` in `apps/web`. Without the
  `Pay.tsx` change the three new cases (`accountsChanged`, `chainChanged`, `disconnect`) fail with a `FileList` of
  length 1. With it the file passes 39/39.
- Case 4, e2e: `npx playwright test e2e/flows.spec.ts -g "cannot inherit the previous wallet" --project desktop` fails
  without the change (`toHaveValue('')` received `C:\fakepath\private-receipt-account-286.json`) and passes with it.
- Cases 1 and 4, e2e, with the change: `npx playwright test e2e/privacy-mask-history.spec.ts e2e/flows.spec.ts -g
  "needs fresh reveal|cannot inherit the previous wallet" --project desktop --trace off`: 2 passed under
  `GHOSTPAY_LOCAL_BUILD_PROFILE=full` and 2 passed under `lean`.
- Case 5: `npx vitest run src/AppShell.masking.test.tsx --coverage=false`: 7/7, including the adapted case.
- `npx vitest run src/views/Pay --coverage=false`: 5 files, 168/168. Web typecheck and lint clean.

Not run here: Firefox, WebKit and real devices; the rest of the e2e suite (hosted CI runs it).
