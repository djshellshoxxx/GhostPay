# Wiring: @ghostpay/privacy-profiles

Owner of apps/web and relayer applies these edits. The package has no side effects; nothing is wired yet.

## apps/web

1. `apps/web/package.json`: add dependency `"@ghostpay/privacy-profiles": "0.1.0"` (workspace). Root `build:libs` order unaffected (no workspace deps).
2. `apps/web/src/lib/settings.ts`: add field `privacy: Selection` (stored as `serializeSelection(...)` string or object with `v: 1`). Load with `sanitizeSelection(raw)` in `sanitizeSettings`; default `defaultSelection()`. Keep it field-by-field like the existing settings.
3. New `apps/web/src/lib/privacyContext.ts`: build `Context` from app state: `action`, `chainId` (active chain), `btcNetwork`, `env` (`web`, `web-onion` when served from onion origin, `node` for CLI), `asset`, and `capabilities` from the manifest, relayer features endpoint, self-test results and the user's Tor Browser assertion. Never set `test-mode` in a production build.
4. Settings view, new "Privacy" section: preset radio (`standard`, `enhanced`, `maximum`, `confidential-amount`, `custom`) using `applyPreset`; grouped list from `OPTION_GROUPS` with `setOption`; each value shows trust parties, `doesNotHide`, warnings, required capabilities and `specCopyKeys` (method packages' own copy constants). Show `Downgrade` rows ("wanted X, got Y, reason key"). Required acks (`requiredAcks`) render as checkboxes calling `acknowledge`. Any manual change sets the label to `custom` (done by `setOption`).
5. Pay, Sweep, Create-invoice and Scan views: call `evaluate(selection, ctx)` before acting; block on `blocking`, list `warnings` by key, never fall back to `direct` transport on `E_SELFTEST`.
6. i18n: add copy for every key in `WARNING_KEYS`, `ACK_KEYS`, `ERROR_KEYS` (and `CHAIN_*` keys). No "anonymous / untraceable / mix" wording. Headline from `honestLabel()` is `privacy.warn.noAnonymity`.
7. Test in apps/web: every key in the three lists has copy; method packages' `*_INFO` tables match catalogue `specCopyKeys`.

## relayer

No change. Capabilities such as `sweep-relayer` and `multi-relayer` come from the relayer features response (client side).

## Config

No env vars. `VITE_NET_PROFILE` stays a build-scope option shown as info (`ops.buildNetProfile`).
