# Deviations and open points (@ghostpay/secret-box)

1. **Different behaviour from `core-crypto` `SecretScalar`:** string/inspect paths return a redacted marker instead of throwing (S3-08 noted throwing hooks can crash a logging process); `JSON.stringify` still throws. Adopting this in `core-crypto` is an API change that needs an ADR.
2. **No `Symbol.dispose`** (`using` declarations): `tsconfig.base.json` targets ES2022 libs without `esnext.disposable`; `dispose()` and `withScope` cover the same need.
3. **No GC-driven wiping** (`FinalizationRegistry`): timing is engine-defined (MDN), so it would give false assurance.
4. `equals` avoids early exit but JavaScript gives no constant-time guarantee.
5. `random()` fills raw bytes; it is not a scalar generator (use `core-crypto` `randomScalar` for secp256k1 scalars).
6. Behaviour in browsers (structured clone into a real Worker / IndexedDB) is asserted only in Node 22 (`structuredClone`, `MessageChannel`); no Playwright run.
7. **Round audit (guards.md) fixes:** L-1 (`close()` cleans every entry, then throws `INVALID_INPUT`; `track` validates; `withScope*` no longer lets a close report mask the callback's error), L-2 (`wipe` uses the captured `%TypedArray%.prototype.fill`), L-4 (`use()` swallows the orphaned thenable's rejection before throwing; the async work still starts and cannot be cancelled), L-5 (`assertNoSecretBox` walks `Reflect.ownKeys`, Map/Set, typed-array props, error causes; own accessors, `WeakMap`/`WeakSet` and throwing proxies fail closed with `INVALID_INPUT`; closures and `#private` fields remain invisible, documented). `close()` can now throw (only for a corrupt entry).
8. **Untouched:** L-3 (prototype/static freezing), L-6 (belongs to relayer-guard) and I-5 (`random` with a faulty `rng`).
9. **Research items** (`sec-crypto-keys.md` K1: wiring secret-box into `apps/web` session/auto-lock) are app work, not done.
