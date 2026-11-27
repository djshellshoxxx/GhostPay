# M2 P0-KEYS (REC-P0-01): Spec 18 independent EVM payment-key export and recovery

Coordinator `session_01Tj2YczsZkZSBgfB5BugRcS` (nifty-bohr) with Worker A (core implementation) and Worker F (review).
AI-assisted engineering record, not an audit. Testnets only; nothing here is deployed or uses real funds.

## Outcome

P0-KEYS is on `main` as of `c7c6349c7b58ac81e9bfc1c2e5757ea69cbd5c45` (2026-11-26). Verified there, see below.

| Part | Source | Reached `main` |
|---|---|---|
| Spec 18 codec in `@ghostpay/ux-vault` (K01, K02, K05, K06) | `7ee97365` (from #372 `5c0a12cc`) | PR #539, via #620 `03695a7b` |
| Standalone decoder, formats reference, guide | `caef9778` | PR #539, via #620 `03695a7b` |
| Single-payment public/encrypted/raw export in Scan | `07722292` (another worker) | before `03695a7b` |
| Archive export, master backup, in-app recovery, Scan/Seller keys mounts, fresh-browser e2e | `8a9d6ecf`, `e31a375d`, `be52eb1e`, `3faa3762`, `8c7ae937` (PR #622 head) | #707 (`a53b1d38`, refresh `f7412688`), the successor of #622, merged by #718 as `c7c6349c` |

Main's blobs for the core files equal the `8c7ae937` blobs exactly: `paymentKeyExport.ts` `92db25c3`,
`stealthExport.ts` `abfaf722`, `StealthExportArchive.tsx` `c6f05ee3`, `StealthExportMaster.tsx` `f1a2ec4b`,
`StealthExportRecovery.tsx` `21f52ce0`, `e2e/stealth-archive-recovery.spec.ts` `7055e14a`,
`ux-vault/src/stealth-export-portable.ts` `c677180b`. `scripts/recovery/stealth-export-recover.mjs` changed after #539
(main `4033f8ca`).

#622's head `8c7ae937` gave the new recovery button the name "Verify backup without importing", which collided with the
existing keystore "Verify backup" control (hosted `Pages artifact on anvil` and `e2e (lean)`/`e2e (full)` failed on
`pages-devnet.spec.ts:314` and `core-journey.spec.ts:339`). The #707 lineage renamed it to "Check export without
importing" on `main`. Worker A's equivalent rename `401acf93` and its doc edit `f4adfb77` are superseded and were not
merged.

## Provenance

Blob SHAs are the first 8 hex digits of `git rev-parse 055d33e0:<path>`. "exact" means the committed blob equals it.

| Path | Source blob | Status | Reason |
|---|---|---|---|
| `apps/web/src/lib/paymentKeyExport.ts` | `443e6240` | adapted | Main's file plus the archive, master, recovered-key holders and open/verify from source. Main's `assertCurrent` recheck kept for single exports and also applied to the archive (before any `eth_getCode`, and before returning). The diff against main only adds code and extends import and i18n-use lists. |
| `apps/web/src/lib/stealthExport.ts` | `abfaf722` | exact | Main had narrowed the codec exports; recovery needs master/inspect/detect helpers. |
| `apps/web/src/lib/session.ts` | d2c64522 hunk | adapted | Main's file plus the staged atomic `install`/`box` hunk of `d2c64522`. A recovered master install replaces the wallet; an allocation failure must keep the old keys. Sleep-aware suspension, backup guard and private-scan hunks of `055d33e0` are not taken. |
| `apps/web/src/lib/paymentKeyExport.recovery.test.ts` | `3fa9bd1d` (blocks from "payment key archive") | adapted | Main keeps its own single-payment test file. Secret comparisons rewritten as booleans (main style); one new archive scan-route regression. |
| `apps/web/src/lib/paymentKeyExport.expiry.test.ts` | `c08d7739` | adapted | Main has no `suspendSession`/`subscribeSessionExpiryCheck`; `clearSession()` models main's idle wipe. The "preserve wallet on suspension" case has no main equivalent and became "refuse install after wipe". |
| `apps/web/src/lib/session.atomicity.test.ts` | `f6cdfc56` | exact | |
| `apps/web/src/components/StealthExportArchive.tsx` | `b4ba62a9` | adapted | `withoutPassphrase` replaced by main's `EMPTY_CREDENTIAL` reset. |
| `apps/web/src/components/StealthExportMaster.tsx` | `c703b8a8` | adapted | Same credential reset. |
| `apps/web/src/components/StealthExportRecovery.tsx` | `fda705e7` | adapted | Chosen file name not echoed (main convention). |
| `apps/web/src/components/StealthExportVerification.tsx` | `9c01f02e` (main's file kept) | adapted | Main's panel, now verifying via `verifyStealthExport` so archives and master backups verify too; byte-exact match, size cap, cancellation and retry behaviour unchanged. Removed single-scope check was redundant after the byte-exact check. |
| `apps/web/src/components/StealthExportArchive.test.tsx` | `e862d563` (archive block) | adapted | Source archive cases split out of the payment test; file-name assertion inverted. |
| `apps/web/src/components/StealthExportRecovery.test.tsx` | `916f471c` | exact | |
| `apps/web/src/components/StealthExportSelection.test.tsx` | `01e4b56e` | exact | |
| `apps/web/src/components/StealthExportDownload.test.tsx` | `b575ca65` | adapted | Retry stays offered after a started download (main `cb2563cf`). |
| `apps/web/src/components/StealthExportVerification.test.tsx` | `2a38ab18` | adapted | Same retry adaptation. |
| `apps/web/src/components/StealthExportCommon.expiry.test.tsx` | `c4fe7475` | adapted | `clearSession(false)` models a silent revocation instead of `suspendSession`. |
| `apps/web/src/components/StealthExportCommon.review.test.tsx` | `1c9f60ce` | adapted | Same; the "deadline observer throws" case has no main equivalent and is dropped. |
| `apps/web/src/views/Scan.tsx` | `2e4a76c9` mount | adapted | One import, one element; uses main's existing `exportRpc`. |
| `apps/web/src/views/SellerKeys.tsx` | `2e4a76c9` mounts | adapted | Two imports, two elements only (PRs #573/#530 edit this file). |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | `a386af69` | exact | |
| `apps/web/src/views/SellerKeys.stealthExport.test.tsx` | `7231bb42` | exact | |
| `apps/web/e2e/stealth-archive-recovery.spec.ts` | `7914f00f` (journeys) | new, adapted | Built on main's `stealthExportFixtures.ts`. |
| `apps/web/locales/{en,es,ja,ar}.json` | 055d33e0 values | additive | 44 keys (3 `error.paymentKeyExport.*`, 41 `stealthExport.*`) with exact source values; es/ja/ar entries are the source's unreviewed drafts. |
| `apps/web/src/i18n/securityKeys.ts` | | additive | The same 44 keys appended to `stealthKeyExportUi`. |
| docs: recovery guide, spec 18 status | | edited | Describe the archive, master backup and in-app recovery now in the client; acceptance gates stay pending. |

## Excluded and why

- `apps/web/src/lib/paymentExportRpc.ts`, `networkAuthorization*`: main has no network-authorization service. The
  archive uses main's existing scan client (`exportRpc` in Scan.tsx, the client the scan used, wrapped by
  `assertCurrent`). No new endpoint, fallback client or request type: only the `eth_getCode` check main's single
  export already sends, once per distinct archive address.
- `suspendSession`, `subscribeSessionExpiryCheck`, `captureSessionBackupGuard` (sleep-aware idle lineage) and
  `invalidatePrivateScanHistory` (private-scan lineage): absent from main; tests that needed them were adapted as above.
- `Scan.stealthExport.authorization.test.tsx`: tests networkAuthorization grants only.
- `AppShell` beforeunload change of `5794858e`, `clipboardPrivacy`, Common.tsx clipboard hunks, `errors.ts` signer
  hunks: not Spec 18.
- `docs/privacy/network-egress-inventory.json`: not edited. Main's `07722292` added the payment-export `eth_getCode`
  without an inventory row; the archive reuses that same request. Recorded as an open item.
- WalletAttempts*, duplicateAttemptJournal*, reconciliation*, Sweep, relayer, contracts, hosting kit: untouched.

## Verification on `main` `c7c6349c` (2026-11-26)

Fresh `npm ci --ignore-scripts && npm run build:libs`, Node 22.23.5, Foundry 1.8.5 (`/opt/foundry`), Chromium from
`/opt/pw-browsers`.

| Check | Command | Result |
|---|---|---|
| Codec | `cd packages/ux-vault && npx vitest run src/stealth-export-portable --coverage=false` | 2 files, 65 passed |
| Web export, recovery, re-auth, session atomicity, mounts | `cd apps/web && npx vitest run src/lib/paymentKeyExport src/lib/session.atomicity src/lib/keyVault.secretExport src/components/StealthExport src/views/Scan.stealthExport src/views/SellerKeys.stealthExport --coverage=false` | 17 files, 126 passed |
| Standalone decoder and recovered-key spending on anvil | `ANVIL_BIN=/opt/foundry/anvil node --test scripts/recovery/*.test.mjs` | 48 tests, 48 pass, 0 fail, 0 skipped |
| Browser, full profile | `npx playwright test e2e/stealth-archive-recovery.spec.ts e2e/individual-stealth-export.spec.ts --trace off` | 2 passed |
| Browser, lean profile | `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test e2e/core-journey.spec.ts e2e/stealth-archive-recovery.spec.ts --trace off` | 9 passed |

The fresh-browser e2e exports an archive and a master backup behind re-authentication, then opens both in a new browser
context with no GhostPay session and recovers the payment key and the master keys. Earlier hosted evidence on
`caef9778` (reported on PR #539): decoder job 22 tests and the strict raw-key anvil spending test (1 run, 0 skips),
vault job 349/349.

Not run here: the full web unit suite and hosted CI on this exact head (hosted CI ran for #718's merge); Firefox,
WebKit, mobile download and third-party wallet import.

## #372 red gates

#372's failing Mythril (10 findings) and Tor browser-acceptance gates do not apply to this extraction: the P0-KEYS diff
`03695a7b..8c7ae937` (28 files) touches no contract project, `scripts/tor`, hosting kit or workflow. Anything further taken
from #372 still needs those gates dispositioned (KEYS-B1).

## Open risks and questions

- Egress inventory has no row for the payment-export `eth_getCode` (main or archive). An owner of
  `docs/privacy/network-egress-inventory.json` should add one.
- Main's idle lock keeps a sole-copy session fully usable (no suspension). An export after an idle lock still needs
  fresh re-authentication; the sleep-aware suspension of #372 is a separate lineage.
- `@ghostpay/ux-vault` imports `@noble/curves` without declaring it (resolved through the workspace root). Present on
  #372 and on main; declaring it changes the lockfile and is left to a dependency owner.
- es/ja/ar strings for the new keys are machine drafts from #372, classified as security keys (never shown as reviewed).
- External device, mobile download, Firefox/WebKit and third-party wallet acceptance remain pending.
