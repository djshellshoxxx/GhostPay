# Spec 18 completion: independent security review

Reviewer: `recon_recovery`. Date: 2026-11-18. This is an AI-assisted source review and focused regression run,
not an independent professional audit or release approval.

## Review boundary and disposition

Starting source: `198aa5baff22272453733a0f3dcfcac0e0994eec` from
[PR #238](https://github.com/djshellshoxxx/GhostPay/pull/238). Reviewed the completion worktree on
`chatgpt/spec18-recovery-completion-20261118`; the final PR commit and its hosted results must be recorded in the
completion handoff. The [baseline review](BASELINE_REVIEW.md) pins main, the stacked PRs, ancestry and inherited CI.

The reviewed changes preserve the existing scheme-1 EVM EOA scope, separate portable formats, approved crypto
primitives and legacy three-key keystore. No contract, deployment, network-enablement or server-processing change
is required. The new verification result contains public metadata only and does not mark a seller session backed up.

**Current disposition:** no remaining source blocker was identified in the reviewed export, recovery, codec,
standalone-script and page-close dependency changes. The confirmed inherited cross-tab page-close custody defect
was reproduced and repaired; see threat 7 and finding R-07 below. Final browser acceptance for this candidate remains
unqualified.

## Twenty threat checks

“Controlled” means the stated source control and named regression exist; it does not mean every browser or device
has been exercised. Execution evidence is separated below from source inspection. Paths are repository-relative.

| # | Threat | Source control and evidence | Review result / limit |
| --- | --- | --- | --- |
| 1 | Wrong passphrase accepted as a usable backup | `packages/ux-vault/src/stealth-export-portable.ts` authenticates AES-GCM before decoding keys; `apps/web/src/lib/paymentKeyExport.ts::verifyStealthExport` returns only after all keys validate. Tests: `stealth-export-portable.test.ts`, “fails closed on a wrong passphrase”; `StealthExportVerification.test.tsx`, “a wrong password cannot mark the saved file verified”. | Controlled. Failure does not install keys, publish a verified result or retain the typed passphrase in UI state. |
| 2 | Truncated, corrupt or partly valid archive imports some keys | Codec ciphertext/body lengths, scalar ranges and every key-to-public-key/address relationship are checked before returning an archive. `stealth-export-portable.test.ts` covers truncation/extension/flips and “imports atomically, wiping every secret and the plaintext”; `scripts/recovery/stealth-export-recover.test.mjs` checks every invalid reference vector. | Controlled. A single invalid entry refuses the entire secret archive. |
| 3 | Public metadata or ciphertext substitution changes authority | The whole canonical header is AES-GCM AAD with distinct keypair/master domains in `stealth-export-portable.ts`. Header checks cover chain, scope, count, identities, KDF and cipher fields. Tests “authenticates every header field” and “binds valid-looking header changes through the AAD”. The post-export tracker additionally requires exact saved-file text equality. | Controlled. Canonical JSON whitespace/key order are intentionally irrelevant to cryptographic AAD; the exact-download tracker deliberately applies a stricter file comparison. |
| 4 | Hostile file forces unbounded parsing or KDF work | Codec checks ASCII/file size, strict JSON/schema, 1,024-entry maximum, bounded scrypt parameters and ciphertext length before KDF. Browser rejects oversized `File` before reading; script `readBounded` reads at most maximum plus one byte. Tests cover malformed KDF/cipher/count/size and maximum valid archive. | Controlled within documented bounds. A permitted KDF still consumes substantial memory/CPU; this is not a claim that many concurrent tabs cannot exhaust a device. |
| 5 | Unsupported version or another format is reinterpreted | Distinct public/keypair/master identifiers, version checks, strict keys and AAD domains remain separate from legacy `v: 1` seller keystore. `stealth-export-portable.test.ts`, “never opens one format as another”, and invalid vectors exercise refusal. Script additionally rejects equal master spending/viewing public keys before decrypting. | Controlled. The legacy keystore schema and behavior were not migrated. |
| 6 | Old operation or consent completes after inputs change | `StealthExportCommon.tsx::useExportOperation` captures an abort controller and scope; current scope updates during render, closing the pre-effect continuation window. Payment/archive scope includes chain, public announcement identity and RPC; verification scope includes the generated file object. `StealthExportSelection.test.tsx` and seven delayed-verification cases cover changes, cancellation, lock, session and unmount. | Controlled in focused tests. Equivalent same-chain rerenders preserve the operation; materially changed inputs invalidate it. |
| 7 | Another tab deletes/replaces the only vault while this tab trusts cached custody | `keyVault.ts` uses atomic compare-and-delete and put-if-empty, with session guards. `loadedKeysRecoverable` rereads exact ciphertext, and recovery confirmation rereads it again. `StealthExportRecovery.test.tsx` covers deletion after replacement review. `AppShell.tsx` now keeps a page-close listener while keys are loaded and checks current `sessionHasExternalCopy()` at the event. | Controlled for the reproduced gap. `AppShell.beforeUnload.test.tsx` demonstrates deletion without custody notification and unchanged public backup-summary identity when an external copy becomes verified. Local-vault-only sessions conservatively retain the leave-page warning. |
| 8 | Lock/wipe during export publishes keys anyway | Export orchestration captures session identity, checks authorization and abort state after each await and before return, and wipes derived scalars in `finally`. Panel operation tokens suppress a stale download. `paymentKeyExport.test.ts`, “discards the result and wipes the key ... while ... sealed”; `e2e/stealth-export.spec.ts` has idle-lock and master-KDF wipe journeys. | Source and unit controls reviewed. The formerly flaky seal-boundary test now uses a deferred entry signal, immediately handled rejection and cleanup that releases and settles the pending operation. Candidate browser rerun still required. |
| 9 | Lock/cancel during import leaves decrypted authority usable | `StealthExportRecovery.tsx` keeps opened key boxes in a ref, disposes on close/lock/session/unmount, and discards late opens. `verifyStealthExport` disposes before returning public metadata, including cancellation/session failure. Recovery and helper tests cover delayed decrypt, selection changes and idle lock. | Controlled in focused tests. Verification-only mode exposes no raw-key download or master-install control. |
| 10 | Verification silently authorizes wallet replacement | Verification has no install or custody mutation. Opening master keys is separate from loading them. `StealthExportRecovery.tsx` binds replacement consent to exact recovered-key object, controller and session revision; every different loaded wallet needs fresh confirmation. “fresh confirmation even when ... proven copy” and stale/cancelled replacement tests cover this. | Controlled. A saved-vault warning becomes a stronger sole-copy warning if the vault vanishes; that change requires another explicit confirmation. |
| 11 | Duplicate identifiers or replay ordering select conflicting keys | Codec rejects duplicate imported identities and conflicting keys, enforces address order, and deduplicates valid exports deterministically. `paymentKeyExport.ts::distinctPayments` refuses another ephemeral key at the same address; same-locator optional transaction hash/view-tag ties now follow canonical ordering. Test “resolves same-locator replay metadata deterministically” checks reversed input. | Controlled. The tie-break affects public provenance metadata, never the derived spending scalar. |
| 12 | Chain confusion or contract account receives an invalid key export | `paymentKeyExport.ts` checks supported scheme/chain, scan RPC chain and `eth_getCode` at `latest`; any code, malformed answer or request failure refuses secret payment export. Explicit expected-chain constraints apply to public/payment files; chain-neutral master files refuse them. Script applies the flag even to raw/public/header inspection. | Controlled for the stated EOA scope. Chain labels are not live-chain finality proof; public/raw metadata remain unauthenticated. Bitcoin, AA, policy/contract and EIP-7702 authority are outside scope. |
| 13 | Secrets leak through logs, diagnostics or unintended stdout | Crypto/browser errors use fixed descriptors; script unknown-option errors no longer reflect attacker-controlled argument contents. Independent script prints payment keys only behind `--reveal-private-keys`, never master keys. Script tests check errors and default output for known secret values; browser leak-guard journey covers requests/console/URL/history/storage/clipboard. | Source and script tests support the control. Candidate browser leak assertions need hosted execution; the older baseline browser pass is separate evidence. |
| 14 | Filenames or displayed upload names expose keys or inject markup | `STEALTH_EXPORT_FILENAMES` are fixed public names. Selected upload names render through `SafeText`/`bdi`; file contents do not render. `paymentKeyExport.test.ts` and browser download assertions check names and raw-export boundaries. | Controlled. Users can rename their own files; filenames are never used as verification identity. |
| 15 | New verification stores plaintext or leaves avoidable mutable buffers | Verification returns public headers and calls `keys.dispose()` in `finally`; partial master boxing disposes an already-created first box. Codec wipes owned UTF-8 passphrase/KDF buffers on all exits. Script wipes its bounded raw-file buffer on success and oversize refusal. New regressions capture those actual buffers/boxes. | Controlled as best-effort cleanup. JavaScript strings and engine-internal copies cannot be guaranteed erased. No new plaintext browser persistence is introduced. |
| 16 | Download initiation is mistaken for retention | All encrypted panels expose a tracker only after `startDownload` succeeds. Messages distinguish generated/download initiated, user-confirmed retention and authenticated recoverability. `StealthExportVerification.test.tsx` requires the retention checkbox and selected saved file; `StealthExportSelection.test.tsx` checks no tracker before a download starts. | Controlled. A browser API cannot prove durable storage merely from clicking an anchor; the user must keep and select the retained file. |
| 17 | A different valid file, public record or stale result produces false verification | Tracker compares exact saved text against the encrypted file generated by that panel before decrypting. General verify-only helper rejects public records, authenticates all keys and rejects a changed session. Tests cover same filename/different valid archive, public record, wrong password, oversized file and seven stale-result cases. | Controlled. A valid unrelated backup cannot certify this generated download; standalone verification explicitly certifies only the selected backup. |
| 18 | Partial backup status allows loss of the only complete seller key set | No Spec 18 verification path calls `markKeystoreDownloaded`, `verifyDownloadedBackup`, `armSessionVault` or other custody setter. Master backup excludes invoice signing; payment archives contain only listed one-time keys. Tests retain wallet/custody object identity and check the master scope notice. Existing idle/wipe/replacement safeguards are retained. | Controlled in the new feature; R-07 addresses the inherited page-close dependency. Verifying a master file never claims a complete three-key seller keystore backup. |
| 19 | Encryption is advertised as hiding all correlation or minimizing authority | Format/user guide and UI disclose readable authenticated headers, archive address correlation, provider exposure from `eth_getCode`, and the master-spend implication of viewing key plus payment private key and announcement. Scheme derivation and key-control/finality wording remain unchanged. | Documented limits, not eliminated risks. This feature proves key control and recoverability, not payment finality, identity, anonymity or unlinkability. |
| 20 | Offline recovery derives the wrong spending authority or requires GhostPay state | Independent Node crypto/noble decoder imports no GhostPay code. Fresh-directory test grants filesystem reads only to copied script, two noble packages and exports; checks all five export types, archive omissions, and an omitted historic payment recovered from master keys. `raw-key-anvil.test.mjs` passes recovered raw key to independent Foundry 1.8.5 `cast`, then checks a signed loopback transfer. | Controlled for the executed synthetic fixtures and independent wallet tool. Filesystem isolation is not network sandboxing; source makes no network requests. Physical wallets/phones and other browser engines remain untested. |

## Findings resolved during review

| ID | Severity | Failure and closure |
| --- | --- | --- |
| R-01 | Medium | Same-mounted payment/announcement/RPC changes could reuse old confirmation or publish an old export. Added semantic input scope, synchronous continuation checks and selection regressions. An exact-base run reproduced two stale raw confirmations and an obsolete archive download; all seven selection tests pass in the reviewed candidate. |
| R-02 | Medium | Download initiation lacked explicit retention and file-specific verification. Added exact-file tracker and independent verify-only path; neither changes seller custody. |
| R-03 | Medium | A delayed recoverability result could install a different master wallet without fresh consent when a saved copy existed. Every different loaded wallet now requires bound consent; confirm rereads vault and escalates to sole-copy warning if absent. |
| R-04 | Low | Export passphrase could change while an export was using its captured prior value. All export password/repeat/suggestion fields and recovery password are disabled during their operation. |
| R-05 | Low | Partial master-box allocation and owned KDF/raw-file buffers had avoidable retention on failure paths. Added disposal/zeroization and regressions that observe the actual mutable allocations. |
| R-06 | Low | Same-locator duplicate metadata depended on input order; explicit chain constraints were ignored for public/raw/inspection paths; script option errors could reflect untrusted input. Deterministic tie-break, complete chain checks and fixed diagnostics now have regressions. |
| R-07 | High | `AppShell.tsx` removed the leave-page guard for a locally saved vault. Another tab could delete the vault without notifying this tab, leaving its keys as the sole copy while cached `backup.verified` remained true. Fixed by retaining the listener while keys are loaded and checking complete external-copy verification synchronously at the event. Red regression: 2 failed/4 passed. Green shell selection: 21 passed/12 intentionally filtered. The newly generated invoice-signing key still gets a warning; idle-lock behavior is unchanged. |

## Execution evidence

### Independent reviewer run

Working directory: `apps/web`. Command:

```sh
NODE_OPTIONS='--max-old-space-size=768' ../../node_modules/.bin/vitest run \
  src/components/StealthExportVerification.test.tsx \
  src/components/StealthExportSelection.test.tsx \
  src/components/StealthExportRecovery.test.tsx \
  src/lib/paymentKeyExport.test.ts \
  --maxWorkers=1 --no-file-parallelism --reporter=verbose \
  -t 'saved Spec 18|export consent|verifying an export|verify an existing|partial master|same-locator|explicit chain constraint|fresh confirmation|sole-copy warning|cancelled master-load'
```

Actual result: exit 0; four files passed; **33 selected tests passed, 31 deliberately filtered out**; 9.78 seconds.
This reviewer run used the existing default Node **24.22.1**. One file worker ran at a time. No unhandled rejection.
Log inspected: `/tmp/spec18-review-focused.log`.
This is focused regression evidence, not whole-web coverage or a complete workspace gate.

### Implementer runs whose logs were inspected

| Command / working directory | Actual result |
| --- | --- |
| `node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1 --coverage.reportsDirectory=/tmp/ghostpay-spec18-crypto-coverage` in `packages/ux-vault` | 353/353 tests, ten files, exit 0. Coverage: 97% statements, 94.24% branches, 99.5% functions, 98.89% lines. Original thresholds preserved. Log `/tmp/ghostpay-spec18-crypto-vault-coverage.log`. |
| `ANVIL_BIN=<pinned-anvil> CAST_BIN=<pinned-cast> REQUIRE_ANVIL=1 node --test --test-concurrency=1 scripts/recovery/*.test.mjs` at repository root | 22/22 passed, no skip, exit 0. Includes the fresh-directory subprocess test and actual local-chain raw-key spend. Log `/tmp/ghostpay-spec18-recovery-final.log`. |
| `node ../../node_modules/vitest/vitest.mjs run src/AppShell.beforeUnload.test.tsx src/AppShell.idleClock.test.tsx src/App.test.tsx --coverage=false --maxWorkers=1 -t 'AppShell beforeunload\|GP-PAGES-04\|C-R10'` in `apps/web` | 21 passed, 12 intentionally name-filtered, three files, exit 0. All six beforeunload cases passed. Logs `/tmp/ghostpay-spec18-beforeunload-red.log` and `/tmp/ghostpay-spec18-beforeunload-green.log` establish the failing baseline and repair. |

The crypto/script runs used Node 22.23.5 and `NODE_OPTIONS=--max-old-space-size=1536`; the shell regression used
the same Node version with a 1,024 MiB heap cap. Pinned binaries were existing
`/workspace/scratch/4fa14be12559/toolchain-probe/bin/anvil` and `cast`; the reviewer also executed their version commands:
**1.8.5**, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`. No tool download or dependency version change was needed.

The recovery/UI implementer separately reports 45/45 focused tests and successful four-file typed lint. The final
completion handoff must retain that command/log plus complete candidate typecheck, localization and lint outcomes.
No success is inferred from an interrupted or memory-killed lint attempt.

The crypto reviewer also ran the new selection regression against the exact starting UI source at
`198aa5baff22272453733a0f3dcfcac0e0994eec`, copying only the new test. Result: six failed, one intentionally filtered.
Two failures demonstrate stale raw-key confirmations, one demonstrates an obsolete archive download, and three stop
at the still-editable export-password assertion before reaching their later cancellation checks. Those three are
evidence for R-04, not separate proof that every cancellation assertion failed on the base. The candidate's complete
seven-case selection file passed in the independent reviewer run above. Baseline provenance and source blob/test
hashes are recorded in `/tmp/ghostpay-spec18-selection-red-metadata.json`; log
`/tmp/ghostpay-spec18-selection-red.log`. Command from `apps/web`, Node 22.23.5:

```sh
NODE_OPTIONS=--max-old-space-size=1024 node ../../node_modules/vitest/vitest.mjs run \
  src/components/StealthExportSelection.test.tsx --coverage=false --maxWorkers=1 \
  -t 'changed.*closes raw|discards an in-flight|new same-chain'
```

## Remaining acceptance boundaries

- The baseline's six full and six lean Chromium recovery tests passed at synthetic merge
  `8393562a6b5657fc8b3f4410e5ddc3ad90772cf3`; the [baseline review](BASELINE_REVIEW.md) links the actual job logs.
  They do not qualify these new edits. Root's local Chromium launch was denied socket creation before app assertions;
  candidate browser assertions need a successful hosted run.
- The reviewed candidate has nine `e2e/stealth-export.spec.ts` journeys. New cases cover verification-only at a
  390-by-844 desktop Chromium viewport, explicit replacement of an already saved wallet, and keyboard activation of
  the file chooser plus tab-order/submit checks. The narrow viewport is not a physical mobile browser or device test.
  Both parameterized sweep reload cases now explicitly observe a `beforeunload` dialog, assert its type and accept it;
  journal/hash/duplicate-send checks remain. Other reload journeys were inspected and do not acquire a new prompt from
  this policy change. No general dialog suppression was introduced.
- Physical mobile file handling, Firefox/WebKit, hardware wallets and third-party wallet applications were not exercised.
  The pinned independent `cast` spend qualifies only the tested EVM wallet-tool path.
- Inherited whole-repository failures and the unresolved #238 review thread remain separately recorded in the baseline.
  This review does not dismiss CodeQL, lower coverage, bypass CI, authorize merging or claim release readiness.
- Browser page-close dialogs remain subject to browser support and user activation. Even after R-07, no application can
  promise recovery from process termination, device failure or a missing external backup.

