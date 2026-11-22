# R32 — v1.1 privacy donor vs recovery PR #372: exact blob evidence

This is a **bounded, read-only source audit**, not full-tree equivalence or a merge authorization. Comparison is against the actual [v1.1 candidate](https://github.com/djshellshoxxx/GhostPay/commit/8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9) `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` and [recovery PR #372](https://github.com/djshellshoxxx/GhostPay/pull/372) exact head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, not main. Main `eb59d93cffed7848c4aac37d0e9650b87239c6da` lacks the first three listed feature files.

| File (under apps/web/src/) | v1.1 Git blob | #372 Git blob | Disposition |
| --- | --- | --- | --- |
| lib/addressReuse.ts | `13381202cdf23ba9c03d7d51443b346df860fea2` | **identical** | Already present in recovery; do not cherry-pick |
| lib/invoiceMetadata.ts | `c8782f2c2979fba537aa4b8a5e39680bf61e5220` | **identical** | Already present; do not cherry-pick |
| lib/walletDisclosure.ts | `a0700207e8781ccb4184e3d70fd1c78e6d442766` | **identical** | Already present; do not cherry-pick |
| components/AddressReuseNotice.tsx | `f28b886b47aad0b4fc14c2bc27796db2bfe3dd6d` | **identical** | Already present; do not cherry-pick |
| lib/useInvoicePreviewRetention.ts | `3118f21d134c7f2e449fb189f331f9ccdbcb100c` | `a3eaa1795391fc7c4eea9208ebc3d1d1cbdd31e7` | DIFFERENT; recovery generalizes invoice-only hook to scoped `usePresentationRetention` |
| lib/metadataRetention.ts | `15372d2133577c2171c0dea71fca03169a198ee0` | `f21e7498c3f619b9fb87f1abc22872f5fd5c3378` | DIFFERENT; recovery adds `proof` scope separate key/event and registry |
| components/MetadataRetentionControls.tsx | `5264e60c6d72b37c039ee6c6b81ea09cfbef9a54` | `62e3a3855979a8ea8040249149fa6d5633ae22d2` | DIFFERENT; recovery keys controls by scope, uses separate registries, handles return-tab focus |
| components/WalletDisclosure.tsx | `fe26789ff37a6802f23ee94d02631575ce1d01f7` | `094b9d4cce058b060c13821c7723449bafe0a743` | DIFFERENT; recovery adds stricter focus restoration (reject disabled/body targets and verifies activeElement) |
| views/Pay.tsx | `b89dc2fb49ddea9129e7703e1bf05583ff788ad7` | `70b868e1994aea8c1493ff04bb14b9c125a59f9f` | DIFFERENT; semantic comparison still required |
| views/CreateInvoice.tsx | `fccc19766b1a62b044b2e24a194c36681e34eb60` | `ce43d9b32ed5978c08c446a979675689d17ae6cb` | DIFFERENT; semantic comparison still required |
| i18n/securityKeys.ts | `d89e8f891cc3c5cb1df046b931cb0d227a1a29b9` | `7f64dea82d67ab35fba193d8cbf42364682b62d3` | DIFFERENT; localization semantics still need test audit |

The four exact blob matches definitively establish *byte-for-byte* redundancy **for these four paths only**. Recovery differences in the next four paths are not automatically safe, but source inspection shows greater separation of invoice/proof presentation retention and safer focus handling; importing old v1.1 versions verbatim would discard that protection. The remaining three large UI/i18n paths have different blobs and cannot be declared superseded on file name or size alone.

Required follow-up: examine source-level diffs on `Pay.tsx`, `CreateInvoice.tsx`, and `securityKeys.ts`, compare missing regression cases against #372's children, confirm Firefox/WebKit native focus/retention behavior, privacy and metadata disposal semantics, and security contract. Record per-path equivalent/unique/dangerous disposition before any isolated reimplementation. The [v1](https://github.com/djshellshoxxx/GhostPay/commit/74dccc419bf5c82b21875d205ed5a97d0c4e69b6) candidate is an ancestor of v1.1; it is not an independent new donor for these identical path contents.

No source modification, cherry-pick, contract deployment, real funds or release is authorized by this analysis.

## Follow-up semantic line audit for the three large browser paths

Against the same exact commit pair, compared the complete source files line-by-line after whitespace normalization (not a substitute for an executed regression):

- `views/CreateInvoice.tsx`: **0 distinct v1.1-only nonempty lines**, **2 #372-only lines**: import and render the browser-only `PaymentRequestDownload` control. The earlier v1.1 screen behavior is therefore textually represented in the #372 file, plus a new local file-export entry.
- `i18n/securityKeys.ts`: **0 distinct v1.1-only nonempty lines**, **26 #372-only lines** covering local payment-request-file translation labels and separate proof-retention labels. This is not a donor-only missing localization inventory.
- `views/Pay.tsx`: **13 distinct v1.1-only lines** and **25 #372-only lines**, predominantly **replacements** rather than dropped workflow: the QR importer is extended with `PaymentRequestFileInput`, source-scoped error/review UI, camera-versus-file invalidation and stronger session origin tracking; `PaymentProofQr` gains a `sourceIdentity` to bind display retention. The original standalone QR import, proof display and source-specific review are still represented in changed forms. Must still run native-browser QR/file cancellation, cross-tab and proof-retention regressions before declaring functional equivalence.

These three files are **provisionally already represented or superseded in #372 by source inspection**, so the earlier v1.1 versions are not independent safe copy-over candidates. That disposition is limited to those paths and does not discharge #372's Mythril, privacy, native-browser, CI or review gates. Source line differences can conceal behavioral changes; preserve focused negative tests and compare user-visible flows before integration.
