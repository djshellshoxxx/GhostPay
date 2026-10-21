# Wiring plan: @ghostpay/sdk and @ghostpay/sandbox
No change to apps/ was made. Suggested follow-ups:
1. apps/web pay page: replace ad-hoc fragment parsing with `verifyFragment(location.hash, {nowSeconds, pinnedSigners, mode})`; render `verdict.warnings` by code (i18n keys), block payment when `verdict.ok === false`; only show "verified seller" when `mayShowVerifiedSeller`.
2. apps/web test mode: show `TEST_BANNER` when `verdict.test`; set `mode:'test'` only behind an explicit developer toggle; add the reserved range 31337-31399 to the live chain denylist.
3. apps/relayer: serve the routes in `openapi/ghostpay-merchant-api.yaml` only if a merchant enables self-hosting; keep the invoice link out of every request.
4. Add `@ghostpay/sdk` and `@ghostpay/sandbox` to root `build:libs` ordering (sdk depends on invoice-schema) and to CI; run `npm install` so workspace symlinks exist.
5. `TEST_*` constants are duplicated in sdk/verify.ts (only invoice-schema/core-crypto may be deps); keep in sync with sandbox/testmode.ts.
