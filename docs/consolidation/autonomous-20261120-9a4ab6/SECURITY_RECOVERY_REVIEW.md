# Independent security and recovery review

Reviewer: `9a4ab6c3d117-root/security_recovery`.
Reviewed integration source: `5a745d4b5fba69b66a9779f88aefc63c253a4f27` (PR #307).
Observed main: `aec179910c39081d820396409ff3139ff2264132`.
This is a bounded independent source review and donor-recovery assessment. It is
not a production audit, a proof that funds can always be recovered, or a fresh
execution of historical acceptance tests. The coordinator owns the payment-flow
review; this document concentrates on keys, restoration and network boundaries.

## Findings that affect integration decisions

| ID | Priority / scope | Verified source observation | Status and next action |
| --- | --- | --- | --- |
| SR-01 | P1 recovery integration gap; scheme-1 EVM EOAs | The current candidate has seller keystore export/import/verification, but lacks all ten selected per-payment export, independent decoder, recovery guide and browser-journey files present in Spec18 donor `38d69832`. `SECURITY_RECOVERY_PATHS.json` records exact blob presence. | **NOT IMPLEMENTED in this candidate; implemented and historically tested on a separate donor stack.** Reconcile #240/#269 with current ownership; retain the latest authorization fixes and all independent-recovery evidence. Do not create another export format or claim that the master keystore is a per-payment raw-key export. |
| SR-02 | P1 recovery design gap; optional BTC/TRON testnet views | Newly generated wallets expose receiving address/QR before a retained backup is verified. `hasBackup` controls whether a secret reveal component is offered. Unmount and lock erase the in-memory wallet. | **PARTIAL.** Require an explicit retained-and-verified backup flow before inviting payments, or a consciously scoped waiver with navigation/lock loss handling. Preserve testnet-only policy. No mainnet fund loss is demonstrated by this source review. |
| SR-03 | P2 address-book session correctness | `changePassword` can assign a fresh key context after `lock()` while the book stays absent. The session can report `isLocked === false` even though `getBook` still rejects. | **Existing isolated fix, absent from main/#307.** #328 is closed and unmerged; preserved qualification branch has exact-source RED/GREEN evidence. Reconcile closure/ownership before incorporating `f7bc60a1`; do not claim unauthorized book access or a Pages exploit from this state inconsistency. |
| SR-04 | P1 payment-context validation; library preview | `previewSweep` recognizes `sp1`/`tsp1` by prefix for size estimation without decoding the requested network. Actual signing paths already decode. | **Existing #338 donor independently qualified in this cycle.** Source `cd5f01ff` passes 563/563 package cases, typecheck/lint/build and separate source review; full-candidate hosted/browser qualification remains pending. This is preview correctness, not evidence that wrong-network signing was possible. |
| SR-05 | P1 evidence integrity; standalone testnet hygiene package | The current `transferLogs` path parses log shape but does not bind returned emitter/range or deduplicate canonical event identities. | **Existing #339 donor, absent from this candidate.** Review and qualify existing response binding rather than create duplicate functionality. This package is not imported by the selected Pages source; do not describe it as an active Pages payout vulnerability. |

Priority is engineering order, not a claim of live exploitability. No critical
private-key disclosure, key theft, or unauthorized payment was demonstrated.

## What the selected candidate actually provides

| Safeguard | Source at the reviewed SHA | Evidence boundary |
| --- | --- | --- |
| Encrypted seller backup contains spending, viewing and invoice-signing keys | `apps/web/src/lib/session.ts:434-445`; `packages/ux-vault/src/keystore-portable.ts:312-348` | Source verified. These are master seller secrets, not every derived payment key. No new restoration test was executed in this source-review phase. |
| Passphrase-based authenticated encryption and strict bounded envelope | `packages/ux-vault/src/keystore-portable.ts:47-86,368-435` | Existing scrypt/AES-GCM profile, public metadata bound as AAD, strict JSON and key/public-identity checks. This review preserves the existing primitives and parameters. |
| A download click does not prove retained backup bytes | `session.ts:123-142,412-416`; `SellerKeys.tsx:28-38` | Downloaded keys remain unverified; successful exact-key verification updates custody. The EVM invoice gate also permits an explicit typed waiver. |
| Session-bound backup verification | `session.ts:367-416` | The loaded identity and revision are captured around decryption; cancellation/mismatch fail; temporary secret arrays are wiped in the `finally` path. Source review does not prove all JS/runtime copies are erased. |
| Stale keystore imports cannot overwrite a newer session | `session.ts:452-475` | Revision and abort checks precede installation; returned secrets are wiped after use. |
| Vault save respects durable ownership | `keyVault.ts:282-297`; IndexedDB adapter `putIfEmpty` | A session guard checks before commit, and a durable save is preserved if keys change afterward; the caller gets the distinct saved-for-previous-keys outcome. SellerKeys operation-lifetime follow-ups #333 remain separately owned. |
| Vault deletion uses compare-and-delete | `keyVault.ts:157-175,366-377` | The observed exact ciphertext is compared inside the same IndexedDB write transaction; another tab's replacement is not blindly deleted. |
| Independent recovery with a generic external wallet | No per-payment raw-key export/recovery flow in this selected candidate | **UNVERIFIED / missing integration.** The master pair requires the scheme-specific derivation/discovery context; a generic EOA import is not a substitute. |
| Physical mobile, Firefox/WebKit, hardware/external-wallet restore | No new execution in this review | **UNVERIFIED.** Preserve explicit release gates. |

## Existing Spec18 work must be recovered, not recreated

The ten-file presence comparison is mechanical and exact. It is not a claim that
those files can simply be copied without their dependencies. The donor provides:

- `apps/web/src/lib/paymentKeyExport.ts` and `stealthExport.ts`;
- `StealthExportPayment`, `StealthExportMaster` and `StealthExportRecovery` UI;
- `packages/ux-vault/src/stealth-export-portable.ts`;
- standalone decoder `scripts/recovery/stealth-export-recover.mjs`;
- `scripts/recovery/raw-key-anvil.test.mjs`, test vectors and user instructions;
- `apps/web/e2e/stealth-export.spec.ts`.

Donor #240 head `38d69832ddc58ec27a19c00dbe3c89347c577495` records actual
hosted execution on synthetic merge `b53f116b825d7cf6e85681fc835aec18ef7add75`,
with the same tree as implementation `032c42fc3d5e52d8428a7907775835b5d1ed3704`.
Its `docs/handoffs/spec18-completion-20261118/HOSTED_VALIDATION.md` records all
nine Spec18 Chromium cases passing in each profile, while full-profile and
lean-profile suites retain an inherited navigation failure. These are historical
results read from the preserved source evidence, not results rerun here and not
qualification of #307.

The same donor evidence explicitly separates decoder tests from the native Anvil
spend test: the latter uses the raw reference fixture key, not a direct pipeline
from freshly decoded output into the signer. Physical mobile, external wallet,
hardware and other browser-engine acceptance are unverified. Retain this limit
when reporting independent recovery.

PR #269 head `683f8587b8de45448f14aab0539cb07a5f21bce3` contains a later narrow
payment-export network grant bound to the chosen endpoint, chain and address,
plus scan/browser repairs. Its own report records incomplete final local GREEN
qualification. Integration must compare this successor; recovering older #240
source alone could restore the stale/cancelled network-authorization problem.

## Generated BTC/TRON wallet recovery boundary

In `BtcView.tsx:194-208`, creating a wallet saves its seed in `seedRef` and sets
`hasBackup` to `offerBackup`. The receive address and URI render at lines 641-660
before `SecretBackup` is offered at 663-680. There is no corresponding retained-file
verification state in this view. Cleanup at 135-145 wipes the wallet, seed and
scan secrets. TRON has the equivalent pattern in `TronView.tsx:37-38,78-85,324-345`.
This is distinct from the EVM seller `BackupGate`.

Failure scenario: create a wallet, share its receive address, never retain its
backup, then navigate away or lock. The locally held secret is erased and no
other copy has been established. This is a source-based risk scenario; this
review did not send funds or claim to exercise a live chain. A future regression
should cover generated versus imported keys, verified/waived backup state,
unmount/lock/reload, delayed retained-file verification and stale session changes.

## Closed #328 does not mean merged

Both reviewed main and #307 still contain the unconditional `ctx = fresh` at
`packages/ux-vault/src/vault.ts:211-218`. Remote branch
`evidence/ghostpay-vault-rekey-qualification-20261120` preserves the donor and
`VAULT_REKEY_QUALIFICATION.{md,json}`. It records one expected baseline failure,
285/285 package tests with original thresholds, typecheck/lint/build and an
independent source approval at exact donor `81598d93dd82cc440526c866d42b55be0657895b`.
The connector currently reports #328 closed/unmerged and an empty comment
timeline. The reason for closure is therefore not established by available
evidence. The existing fix should remain preserved pending coordinator reconciliation.

## Action checklist

- [ ] Integrate and qualify the existing Spec18 export/recovery stack against the
  current Pages candidate, including #269's narrow authorization successor.
- [ ] Run a genuine end-to-end fresh export -> separate decoder -> imported key ->
  controlled local-chain spend proof, keeping fixtures separate from the result.
- [ ] Add generated BTC/TRON retained-backup verification before receive sharing,
  together with explicit sole-copy navigation/lock behavior and local regressions.
- [ ] Reconcile #328 closure and preserve the previously qualified isolated fix.
- [x] Complete #338 original package validation and independent final-diff review;
  keep hosted full-candidate checks separate. See `SECURITY_BTC_QUALIFICATION.md`.
- [ ] Qualify #339 emitter/range/identity binding and deduplication at its exact
  source, with malformed/conflicting RPC response cases.
- [ ] Keep Firefox/WebKit, physical mobile, hardware, external-wallet and Tor
  live-environment recovery acceptance pending until actual evidence is recorded.

No shared branch, integration lease, production service, release or deployment
was changed by this review.
