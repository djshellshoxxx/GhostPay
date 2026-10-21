# Deviations and open points (@ghostpay/secret-box)

1. **Different behaviour from `core-crypto` `SecretScalar`:** string/inspect paths return a redacted marker instead of throwing (S3-08 noted throwing hooks can crash a logging process); `JSON.stringify` still throws. Adopting this in `core-crypto` is an API change that needs an ADR.
2. **No `Symbol.dispose`** (`using` declarations): `tsconfig.base.json` targets ES2022 libs without `esnext.disposable`; `dispose()` and `withScope` cover the same need.
3. **No GC-driven wiping** (`FinalizationRegistry`): timing is engine-defined (MDN), so it would give false assurance.
4. `equals` avoids early exit but JavaScript gives no constant-time guarantee.
5. `random()` fills raw bytes; it is not a scalar generator (use `core-crypto` `randomScalar` for secp256k1 scalars).
6. Behaviour in browsers (structured clone into a real Worker / IndexedDB) is asserted only in Node 22 (`structuredClone`, `MessageChannel`); no Playwright run.
