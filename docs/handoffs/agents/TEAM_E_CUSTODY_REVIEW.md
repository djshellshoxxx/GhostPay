# Fresh custody and device-exchange review

Date: 2026-11-16. Worker: `custody_review`. Branch: `codex/unified-custody-review`.

## Result and source pin

No new concrete product regression was demonstrated in the reviewed browser custody and public device-exchange paths. No product source, tests, dependencies, generated output, protocol, permission model or locale catalog was changed. This is a bounded source review with focused regression evidence, not a complete security audit or release approval.

- Reviewed product commit: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
- Reviewed tree: `348e269e2f25999586dc81a395e893f6051d608e`.
- Coordinator-provided published checkpoint: `55e8bf49feb854d37a55d36492b0710d1226b64c`; its product tree matches the review base.
- Review worktree: `/workspace/scratch/a9f2ae0b1bda/ghostpay-custody-review`.
- Claim-only commit: `3da2a0a8bae1a0a4e1f35550883be9966c262b71`.

The tests below ran after that claim commit. A subsequent diff against the review base confirmed that `apps/web/src`, `packages/ux-vault/src` and `packages/qr-exchange/src` were unchanged. Earlier audit reports and earlier 279/284-test results were context only and are not evidence for this review.

## Reviewed boundaries

| Boundary | Current sources examined | Assessment |
| --- | --- | --- |
| Secret custody, key separation and asynchronous import | `apps/web/src/lib/session.ts`, `keystore.ts`; `packages/ux-vault/src/keystore-portable.ts` | Session storage uses secret boxes; borrowed and decrypted temporary bytes are wiped on the examined completion paths. Key import checks independent payment/signing scalars, and session revisions invalidate decryptions that finish after replacement or clearing. The portable envelope is bounded, strict, authenticated with its public metadata, and rejects inconsistent decrypted metadata. |
| Passphrase normalization | `packages/ux-vault/src/keystore-portable.ts`; `apps/web/src/lib/keystore.test.ts` | NFKC remains applied both to passphrase checks and KDF input. Existing Unicode normalization/interoperability regressions passed. No normalization policy changed. |
| Verified backup and explicit waiver | `apps/web/src/lib/session.ts`; `apps/web/src/views/SellerKeys.tsx`; `apps/web/src/components/BackupPanel.tsx` | A download alone remains unverified. Exact-key backup verification is separate from import. The explicit typed waiver enables its existing sharing/invoicing policy without manufacturing a verified backup or permitting an automatic wipe. |
| Vault write/delete and cross-tab replacement | `apps/web/src/lib/keyVault.ts`, `keyVault.test.ts`, `keyVault.idb.test.ts`; `apps/web/src/views/SellerKeys.tsx` | Writes use atomic add-if-empty with a session guard before commit. Deletion compares the confirmed ciphertext and deletes in one read/write transaction. Confirmed replacement/deletion does not silently target a newer record. Step-up remains tied to the prior vault record after deletion; recoverability is checked separately. |
| Sleep lock and stale UI completion | `apps/web/src/AppShell.tsx`, `lib/appLock.ts`; `views/SellerKeys.tsx`; `components/SecretBackup.tsx`, `QrFrame.tsx` | Wake-up and activity check a wall-clock deadline. EVM wipe/replacement callers guard the session across asynchronous recoverability reads. Unsaved/unverified keys stay loaded under the established backup policy. Import cancellation, session changes and payload changes invalidate the examined stale completions or reveals. Clipboard cleanup remains best effort. |
| Public settings transfer | `apps/web/src/lib/settingsExchange.ts`; `views/Settings.tsx`; `packages/qr-exchange/src/settings-exchange.ts` | Parsing and previewing do not apply settings or contact imported endpoints. Settings application revalidates the payload, selection and current basis. Endpoint/relayer/signer sections start unselected; changed trust and weaker preferences require the existing second confirmation. Endpoint-bearing exports suppress generic copy/download controls. |
| Public pairing and secret QR separation | `apps/web/src/views/SellerPairing.tsx`, `lib/sellerPairing.ts`, `lib/qrKinds.ts`; `components/QrFrame.tsx`; `packages/qr-exchange/src/seller.ts` | Public seller pairing only previews and compares public identifiers. It neither loads private keys nor pins trust. Its checksum is documented as corruption detection, not authentication. Secret QR reveal is scoped to its payload and does not acquire public copy/download permissions after replacement. |

## Executed verification

Both commands ran from `apps/web` in the isolated review worktree with the coordinator's installed dependencies used read-only. The existing Vite aliases resolved portable vault, invoice-schema and QR-exchange code to this worktree's source. No install, shared build, shared `dist` write or root coverage mutation was performed.

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/session.test.ts src/lib/keystore.test.ts src/lib/keyVault.test.ts src/lib/keyVault.idb.test.ts src/lib/appLock.test.ts src/lib/settingsExchange.test.ts src/views/SellerKeys.test.tsx src/views/SellerKeys.recovery.test.tsx src/views/SellerKeys.lock.test.tsx src/views/SellerKeys.storage.test.tsx src/views/SellerKeys.completion.test.tsx src/views/Settings.exchange.test.tsx src/components/SecretBackup.test.tsx src/components/BackupPanel.test.tsx src/App.test.tsx --coverage.enabled=false --maxWorkers=1
```

Result: **15 files passed, 223 tests passed**, exit 0; 84.42 seconds.

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/views/SellerPairing.test.tsx src/lib/sellerPairing.test.ts src/components/QrFrame.security.test.tsx src/lib/qrClassify.test.ts src/lib/qrMultipart.test.ts --coverage.enabled=false --maxWorkers=1
```

Result: **5 files passed, 64 tests passed**, exit 0; 10.86 seconds.

Total: **20 files, 287 passing tests**. Both processes finished before handoff. No new red/green fix was needed because this review did not demonstrate a new product defect.

## Limits and next acceptance work

- This lane did not rerun workspace lint, a production build, full web coverage or unrelated suites. The coordinator owns combined-head qualification; no result from those concurrent runs is claimed here.
- IndexedDB tests use controlled adapters/fakes, and UI tests use jsdom. They do not qualify actual multi-tab browser transaction scheduling, browser eviction/private-mode behavior, camera hardware, clipboard permissions, real device sleep or mobile/WebKit behavior.
- Existing unit tests and source inspection do not establish complete secret erasure from the JavaScript runtime, operating-system clipboard history or synchronized clipboard copies.
- BTC, relayer, quote, contracts, dependency remediation and later changes by other workers are outside this source pin. The reviewed commit must not be presented as approval of later combined sources without the coordinator's final gates.
- The next independent acceptance step is the existing hosted browser/device matrix for vault round trips, multi-tab save/delete/replacement, cancellation during file/decrypt work, wake-up lock and public/secret QR handling. This review introduces no new product requirement or authority model.
