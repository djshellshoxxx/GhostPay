# Recovery, browser custody, wallet and mobile research for Claude

Research date: 2026-11-04 UTC. This is a research handoff, not a release qualification, audit certificate, or record of newly passing tests. No application code was changed and no application/browser/financial transaction was executed for this note.

## Read this before choosing work

**The useful next work is qualification and narrow lifecycle integration, not another recovery format or QR library.** The PR47 frontier already has independent-profile keystore recovery, atomic vault operations, EIP-6963 wallet discovery, pending-outcome preservation, and native-detector plus local-jsQR scanning. PR60 implements public device pairing; PR61 implements a full-profile backup checklist; PR62 adds a chained lean journey. Those are active implementations, not missing features.

This note adds source verification, concrete upstream reuse decisions and remaining acceptance criteria. It does not reopen the prior research findings as new bugs. In particular, [PR54's acceptance research](https://github.com/djshellshoxxx/GhostPay/blob/57b414bfbc1fa9de9ef68675b9181b4c148f18e4/docs/research/parallel-reviews/acceptance-tests-41750257638.md) already proposes independent-profile recovery and interrupted-wallet tests; [PR56's documentation/UX research](https://github.com/djshellshoxxx/GhostPay/blob/96fc22c42a704d1c590d56d624fff15a945c8231/docs/research/parallel-reviews/documentation-ux-41750257638.md) already proposes manual mobile/accessibility and disclosure work. Those reports stated that their public-source retrieval was unavailable. The primary references below were retrieved in this pass, except the explicitly blocked GitLab mirror.

### Source and ownership ledger

| Area | Evidence inspected | Present behavior / remaining boundary | Current integration owner |
|---|---|---|---|
| Baseline | Main `0014bc5b26c7487ea1f9fb230194c36673193236`; read-only PR47 `f8193502e602c99bb24ff956f142671750b744a0` | Implementation claims below use PR47 unless another SHA is stated. Main alone predates important guards. | [PR47](https://github.com/djshellshoxxx/GhostPay/pull/47), with [PR59](https://github.com/djshellshoxxx/GhostPay/pull/59) integration base |
| Recovery | `apps/web/e2e/recovery.spec.ts`, `lib/keystore.ts`, `lib/session.ts`, `lib/keyVault.ts` | Actual backup bytes restore into a separate browser context; wrong passphrase, damaged backup, occupied receiver, and a new receiver passphrase are covered in source. This is not evidence of a run here. | PR47 recovery owner; coordinate browser additions with PR62 |
| Public pairing | [PR60](https://github.com/djshellshoxxx/GhostPay/pull/60), current head `fc0980947f8103244ac76652fa18f75de1cc49f3`; earlier head `4b386f441ecbd0b4985e4d4bd6d4438117d41a74` retained for comparison | Public-config export and preview-only import already exist. Current `sellerPairing.ts` additionally checks a real compressed signer point, key separation, canonical meta-address and ordered chain IDs. Do not repeat an older point-validation suggestion. | PR60 / `claude/ar-c2-qr-pairing` |
| Backup checklist | [PR61](https://github.com/djshellshoxxx/GhostPay/pull/61), `11bc44a417ba31406de1a180d39cdbfe08327322` | Full-profile `BackupPanel`; existing keystore and optional tag archive, with honest downloaded-file limitations. Lean intentionally excludes the panel/archive. | PR61 / `claude/ar-a6-combined-backup` |
| Chained acceptance | [PR62](https://github.com/djshellshoxxx/GhostPay/pull/62), `9763a112cfdc0bea19ed2efe916b3f19a3fcd170`, `apps/web/e2e/core-journey.spec.ts` | Test source chains seller keys → signed invoice → consent → worker scan → bound receipt → direct sweep → backup → independent restore; also has expiry, stale session, reorg and unknown-outcome cases. The new-profile helper still uses the same `browser` fixture. | PR62 / `claude/ar-b1-core-journey` as described by the task's B1 lane; verify exact branch before work |
| Bound receipts | [PR64](https://github.com/djshellshoxxx/GhostPay/pull/64), inventory head `820ede969445d6b3e186bc357e7d1c90ea253f64` | Concurrent ownership notice only; receipt implementation was not reviewed in this lane. | PR64; do not expand this note into receipt changes |

PR status moves quickly. Re-read the relevant current PR before implementing. PR author test reports are useful routing information; they are not independently reproduced results.

## 1. Recovery: qualify portability without replacing working crypto

### Existing implementation

At the PR47 snapshot, `apps/web/src/lib/keystore.ts` uses a versioned scrypt/AES-256-GCM envelope, a random salt and IV, and authenticated metadata. `DEFAULT_SCRYPT` is `N=2^17, r=8, p=1`. It normalizes the passphrase with NFKC, bounds accepted envelope size/cost, derives a 32-byte key with `scryptAsync`, imports that key into WebCrypto as nonextractable, and wipes the temporary raw derivation buffer. These are format semantics: changing normalization, AAD or accepted field encoding requires compatibility evidence, not an incidental cleanup.

The recovery test called “cross-browser recovery” creates A and B with `browser.newContext(...)`. That establishes independent storage/profile setup within one engine. `apps/web/playwright.config.ts` currently has no projects/engine matrix and explicitly describes its preinstalled Chromium setup. PR62's `newProfile(browser, sim)` has the same distinction. [Playwright projects](https://playwright.dev/docs/test-projects) are the appropriate configuration mechanism for intentional browser-specific runs. Adding names such as “iPhone” to viewport emulation would not establish a physical iPhone recovery result.

**Later ownership update:** [PR #73](https://github.com/djshellshoxxx/GhostPay/pull/73), observed at `b73105e559ab2ea8ec4a7393a13a22f406532771`, now owns Chromium device-emulation projects for accessibility/responsive checks. The source observations above describe the earlier inspected baseline. Coordinate with that PR rather than creating duplicate viewport projects; it does not establish WebKit, cross-engine recovery or physical-device results. Its full source was not independently rereviewed in this lane.

The right update to older AT-6 proposals is therefore **implemented in the frontier, pending integration/qualification; cross-engine and physical-device portability still need evidence**. Do not commission a second A→B recovery suite simply because main or an older note lacked it.

### Recommended task REC-R1 — recovery evidence matrix

**Priority:** core acceptance follow-up after PR47/59 and PR62 are reconciled. **Owners:** existing recovery and acceptance owners. **Upstream reuse:** Playwright project/fixture design; reference only, no copied runtime library. Retain the existing test harness.

Run the already authored recovery scenario against the supported build with source profile A retained throughout. Distinguish these three test setups explicitly:

| Setup | What it establishes | What it does not establish |
|---|---|---|
| Two pages in one browser context and origin | Shared-storage, cross-tab races and invalidation | Independent recovery or different browser engines |
| Two independent contexts in one browser engine | Empty receiver storage, exported-file restore, no reliance on source session state | Cross-engine or camera/device interoperability |
| File exported in one engine/device and imported in another supported engine/device | Actual file and crypto interoperability for that recorded pair | All devices, browser versions or future releases |

Acceptance evidence should record build SHA/profile, engine/browser version, OS/device, exported-file digest, public meta-address and invoice-signing public identity, pass/fail/untested, and whether the receiver persists and unlocks with its new passphrase. Use synthetic keys and public comparisons; avoid secret screenshots or plaintext test artifacts. Retain source A and original backup until B's restore and re-encryption are verified. A download event proves browser handoff, not that the user saved a durable recoverable file.

Exercise existing production KDF settings for at least the qualification path. Record elapsed import/export times and memory-pressure behavior on supported lower-memory phones; do not silently reduce `N` to make a run complete. Separate a primitive known-answer test from application performance qualification: [RFC7914 §12](https://www.rfc-editor.org/rfc/rfc7914.html#section-12) supplies scrypt vectors, while the application envelope also depends on normalization, authenticated metadata and key identity.

For Unicode regression coverage, preserve the specified NFKC semantics with ordinary synthetic equivalent/non-equivalent passphrase examples and repeat the same exported file in each supported receiver. This is interoperability evidence, not a new passphrase scheme. The current six-word generation/quality logic should be reviewed at the frontier; an old main-only heuristic is not a current finding.

### Recommended task REC-R2 — keep backup claims separate

**Priority:** copy/evidence reconciliation with PR61, not a combined-container rewrite. **Paths:** `components/BackupPanel.tsx` on PR61, `views/SellerKeys.tsx`, `lib/session.ts` (`SessionBackup`, `getSessionBackup`, `markKeystoreDownloaded`), `lib/keyVault.ts` (`loadedKeysRecoverable`). **Upstream:** [browser storage persistence guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), design reference only.

Preserve distinct meanings for “encrypted vault currently saved in this browser”, “file offered/downloaded”, and “restore checked on an independent receiver”. IndexedDB is origin-scoped browser storage subject to its storage policy and user deletion. A granted persistence request is not an external backup. Do not rename `backedUp` into a user-facing certification of a completed recovery drill, and do not make PR61's full-only tag checklist a lean release prerequisite.

A follow-up completion criterion is a compact claim-to-evidence table in the existing release worksheet: each green status names exactly the observed action, and destructive/idle operations retain the existing recoverability gates. If a recoverability read is delayed while the key session changes, the existing session-version guard must remain effective. This note does not propose wiping the only in-memory copy merely because the tab becomes hidden.

### Crypto reuse decision

Keep the current `@noble/hashes` and WebCrypto boundary. Neither an Argon2/WASM migration nor another wallet-backup format is justified by the inspected unfinished work. A new KDF would add format migration, memory, bundle and browser-support obligations without supplying missing restore evidence. The [Web Cryptography specification's security considerations](https://www.w3.org/TR/webcrypto/#security-considerations) also mean that “nonextractable” must not be described as immunity to same-origin script compromise. Treat this as precise product wording, not a request to weaken existing CSP/build gates. No new crypto dependency is recommended.

## 2. Browser custody: transactions, lifecycle and cross-tab evidence

### Existing safeguards to preserve

PR47 `IndexedDbKeyVaultStore.putIfEmpty` performs the occupancy check/add inside one readwrite transaction and fences the initiating session before a write may commit. `delete(expected)` compares and deletes the exact ciphertext inside the transaction. Completion is resolved from transaction completion, not merely a request's success callback. `lib/idbStore.ts` separately contains atomic tag-store revision/CAS machinery. `lib/reconciliationVault.ts` already uses broadcast invalidation and foreground refresh; it is not an unimplemented cross-tab bus.

The [IndexedDB specification](https://www.w3.org/TR/IndexedDB/) is the primary transaction and connection-lifecycle reference. The [Web Locks specification](https://www.w3.org/TR/web-locks/) provides a native cross-context coordination primitive, scoped with storage/privacy boundaries. A mutex can coordinate a multi-step workflow, but it does not replace IDB transaction atomicity, session-version checks, persisted uncertainty, or independent-profile isolation.

### Recommended task REC-B1 — browser lifecycle qualification, then targeted repair

**Priority:** core robustness evidence. **Paths/symbols:** `lib/keyVault.ts` / `IndexedDbKeyVaultStore.db`, `get`, `putIfEmpty`, `delete`; `AppShell.tsx` idle-lock effect; `lib/session.ts` / `captureSessionVersionGuard`; `lib/reconciliationVault.ts` invalidation subscription. **Owner:** PR47 integration owner, with PR62 acceptance coordination. No implementation was performed here.

Static observation: `IndexedDbKeyVaultStore.db()` caches its opening promise and installs `onupgradeneeded`, `onsuccess`, `onerror`, and `onblocked`; this inspected version does not install a connection `versionchange` handler or reset the cached promise after failure. That is a focused connection-lifecycle candidate for the next schema upgrade or browser restore test, not proof that the current version-1 database loses data.

The strongest reusable code is the **Web Platform Tests** corpus at commit `b3ab3b13babb3798490d2e6b2d6e6f84bc326f65`:

- [`IndexedDB/back-forward-cache-open-connection.window.js`](https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/IndexedDB/back-forward-cache-open-connection.window.js) checks BFCache/open-connection and version-change behavior with a remote context helper.
- [`IndexedDB/idbtransaction-oncomplete.any.js`](https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/IndexedDB/idbtransaction-oncomplete.any.js) supplies transaction-completion ordering assertions.
- Root [`LICENSE.md`](https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/LICENSE.md) is BSD-3-Clause. Preserve attribution and inspect any selected file's additional notices when adapting.

**Decision:** adapt relevant scenarios into existing Playwright tests; do not add WPT as an application dependency or copy its entire harness. WPT tests browser APIs, so GhostPay must still assert its own UI, ciphertext, stale-session and no-overwrite behavior.

Acceptance should cover two same-origin pages competing to save into an empty vault, deletion after another tab changed the saved record, a pending read resolving after lock/replacement, and a fresh read after return from BFCache. If upgrade support is added, a stale open tab must release its connection deliberately, the new version must open, and a recoverable blocked/failure state must offer a working retry without falsely claiming a save. Assertions should reopen storage independently; render-only expectations do not establish a committed ciphertext state.

### Recommended task REC-B2 — respect hidden/frozen/resumed states

**Priority:** mobile qualification, then a small scoped change only if ownership accepts it. **Paths:** `AppShell.tsx`, `components/CameraImporter.tsx`, `components/SecretBackup.tsx`, `components/QrFrame.tsx`, `views/Pay.tsx`. **Owner:** core lifecycle owner; camera-related work overlaps PR60.

Chrome's [Page Lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) documents that termination callbacks are unreliable on mobile and a discarded page cannot run cleanup at the moment of discard. Use that to design pre-emptive state transitions and resume revalidation; do not promise that a JavaScript `unload` handler securely clears memory under every browser termination.

`AppShell` currently arms an idle timer on pointer/keyboard activity. `SecretBackup`, `QrFrame` and `Pay` already have selected visibility handling. The shared `CameraImporter` fences callbacks on its `active`/scope/disclosure/unmount lifetime, but the inspected component does not observe document visibility. Its visibility predicate is about disclosures and component state. This gives a narrow, source-grounded candidate: stop/abort a camera session when the document becomes hidden, then require an intentional resume action consistent with GhostPay's existing camera-consent wording. Avoid automatic camera reactivation copied from another library.

Acceptance: late camera permission completion after hiding cannot attach a new stream; every owned track is stopped on hide/navigation/lock as specified; stale callbacks cannot install a preview after a scope change; re-entering the app does not silently reacquire camera permission or revive an old signing attempt. Test actual mobile app-switch/return alongside deterministic component tests. Preserve the existing “do not erase the sole copy” rule for seller keys.

**Web Locks decision:** no new locking dependency now. Use native Web Locks only if an accepted workflow needs coordination across several durable operations that cannot be one IDB transaction. If introduced, feature-detect it, bind the lock to the same storage scope, abort obsolete waiters, and retain data-layer CAS. A lock held while a user considers an external-wallet prompt can block other tabs indefinitely; do not use that as the payment journal.

## 3. Wallet integration: keep the adapter and qualify resume behavior

PR47 `apps/web/src/lib/wallet.ts` already defines a small EIP-1193 surface and implements EIP-6963 discovery with a bounded announcement window, sanitized text, bounded data-URI icons, conflict indication, and a labelled injected-provider fallback. It preserves uncertain send outcomes and verifies returned transaction evidence. `e2e/flows.spec.ts` includes late-hash retention after seller/account/provider changes, final account recheck, and altered-transaction refusal. PR62 adds a chained unknown/late-outcome case. These are reasons to extend the adapter's evidence, not replace it with a large connection UI stack.

[EIP1193](https://eips.ethereum.org/EIPS/eip-1193) defines provider requests and account/chain/disconnection events, with codes including user rejection, unauthorized access and connectivity failures. Those responses do not by themselves define a universal financial settlement state. [EIP6963](https://eips.ethereum.org/EIPS/eip-6963) explicitly treats supplied reverse-domain metadata as potentially incorrect or imitative. Keep metadata/discovery separate from trusted wallet identity and invoice seller trust.

### Recommended task REC-W1 — wallet return and interrupted-session evidence

**Priority:** supported wallet qualification after existing core journey integration. **Paths/symbols:** `lib/wallet.ts` / `discoverWallets`, event subscription and `verifySubmittedTransaction`; `lib/duplicateAttemptJournal.ts`; `components/WalletAttempts.tsx`; `views/Pay.tsx`; `e2e/flows.spec.ts`. **Owners:** PR47/62. **Upstream:** EIP1193/EIP6963 API contract; design/test scenarios only, no source dependency. Both specifications identify their copyright waiver; no spec prose needs to be copied into production.

On a local/test-asset build, qualify the supported extension wallets and mobile in-app browser handoff separately. A return from another app must re-read account and chain before the final action. A disconnect after a request, missing return hash, page reload, or stale UI scope must retain the already recorded uncertainty. Clearing local state cannot assert cancellation of an external wallet request. Existing late-hash behavior should remain observable even if the original checkout view is gone.

Useful acceptance evidence records wallet product/version, browser, chain, whether the request was issued, whether a hash became available later, resulting journal state, and the next action offered to the user. Exercise user rejection before submission, account/chain change, reload during an unresolved request, reconnect, and late hash arrival with deterministic test providers first. Physical wallets and actual wallet software need their own explicitly scoped qualification; this research did not submit transactions.

**Reuse decision:** retain the current adapter. A general wagmi/connection-kit migration would duplicate discovery and state ownership and introduce a larger integration surface. It should be reconsidered only if a named missing supported wallet transport requires it. Existing `docs/research/reuse/wallet-adapter.md`, `hw-signer.md` and `clear-signing.md` remain the relevant deferred hardware/connector decisions; this lane does not promote hardware or relay transports into lean scope.

## 4. QR/mobile: reuse independent fixtures and lifecycle ideas

### What is already implemented

`packages/qr-exchange/src/readers.ts` chooses a platform `BarcodeDetector` only if it can construct a QR reader; otherwise it dynamically loads **jsQR 1.4.0** and uses an in-memory canvas capped at 800 pixels on its largest dimension. `camera.ts` uses explicit `getUserMedia`, rear-camera preference, abort-aware stream ownership, 120 ms default frame intervals, bounded decoded text and cleanup in `finally`. `CameraImporter` also allows paste. PR60 adds public pairing file/paste/camera preview using this same package.

Therefore, “add a software QR fallback” is stale. A more specific remaining experiment is native detector runtime failure: initial detector construction can succeed, after which `read()` can repeatedly reject; `camera.ts` eventually produces `SCAN_FAILED`. The chosen reader is not automatically replaced by jsQR mid-session. Decide from real supported-device evidence whether a one-time, bounded fallback is useful. It is a compatibility question, not an observed security defect. Preserve the same payload parser and bounds regardless of the reader.

### Reuse candidates with pinned evidence

| Candidate and exact upstream | License evidence | Decision and GhostPay seam | Tradeoff / acceptance |
|---|---|---|---|
| **Project Nayuki QR generator**, [`typescript-javascript/qrcodegen.ts`](https://github.com/nayuki/QR-Code-generator/blob/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d/typescript-javascript/qrcodegen.ts), commit `bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d` | MIT notice is in the source header; the author's [own project page](https://www.nayuki.io/page/qr-code-generator-library) describes the independent implementation and language ports. | **Tests-only** independent QR fixture generator for `packages/qr-exchange/src/multipart.test.ts`, `camera.test.ts`, and app QR/pairing tests. Keep `qrcode-generator` as the current runtime. | Two encoders may choose different masks/segmentation. Compare decoded payload bytes, not matrix equality. Generate synthetic public-config and encrypted-envelope fixtures; preserve generator commit/options and notices. |
| **Nayuki's GitLab mirror**, [`typescript-javascript/qrcodegen.ts`](https://gitlab.com/Nayuki/QR-Code-generator/-/blob/master/typescript-javascript/qrcodegen.ts) | Author's project page advertises GitLab as a mirror; license/code was verified through the pinned GitHub copy. | **Alternative source location**, not another independent library. | Direct GitLab retrieval was disabled in this session, so mirror HEAD identity was not verified. Do not claim the mirror is independently maintained or use its floating `master` as a reproducible pin. |
| **jsQR**, [`src/index.ts`](https://github.com/cozmo/jsQR/blob/8e6a036beafa7053dd44b1b76ac578d22b1b3311/src/index.ts), reviewed upstream HEAD `8e6a036beafa7053dd44b1b76ac578d22b1b3311` | [`LICENSE`](https://github.com/cozmo/jsQR/blob/8e6a036beafa7053dd44b1b76ac578d22b1b3311/LICENSE) is Apache-2.0. | **Retain existing dependency** `jsqr@1.4.0` in `packages/qr-exchange/package.json`; do not add a second copy. | Reviewed HEAD is a source reference, not a verified commit mapping for the already pinned npm version. If code or fixtures are copied, inspect selected-file rights, preserve notices, and verify distribution provenance. |
| **Nimiq qr-scanner**, [`src/qr-scanner.ts`](https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/src/qr-scanner.ts), commit `abcfe1bce2703721408d8ce7ebde94a359998506` | [`LICENSE`](https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/LICENSE) is MIT. | **Design reference first** for worker-backed decode, scan regions, pause/stop and visibility handling at `readers.ts`/`CameraImporter.tsx`. Do not replace the existing scanner wholesale. | Its larger scanner lifecycle and resume semantics need reconciliation with GhostPay's explicit consent and abort fences. Move decode into a worker only if measured main-thread stalls justify the complexity; keep pixels local and bounded. |

This investigation deliberately includes an author's independently hosted primary source and a documented GitLab source location. A blocked forge is reported as blocked rather than being counted as reviewed code. The W3C, RFC Editor, WAI, Chrome and MDN references elsewhere are also primary documentation outside GitHub. Unrelated Codeberg/SourceForge wallet projects would not be useful additions merely to increase forge count.

### Recommended task REC-Q1 — interoperability fixture corpus and physical-device evidence

**Priority:** PR60's remaining real-device qualification; fixtures can be independently authored once coordinated. **Paths:** `apps/web/src/lib/qr.ts` (`makeQr` and quiet-zone rendering), `components/QrFrame.tsx`, `components/CameraImporter.tsx`, `packages/qr-exchange/src/readers.ts`, `camera.ts`, multipart tests, PR60 `views/SellerPairing.tsx`. **Owner:** PR60/QR package owner. **Reuse:** Nayuki tests-only and Nimiq design-only above.

The acceptance corpus should include ordinary public meta-address, current PR60 public config, and synthetic encrypted keystore multipart transport where the existing UI supports it. Test retained text/file alternatives, reversed multipart order, benign duplicates, missing chunks/timeouts, maximal valid sizes and Unicode labels at actual serialization boundaries. Do not introduce another wire format just to accommodate another scanner.

Record device/browser/camera, source display/print size, lighting/angle, decoder path, QR version/error-correction setting, success/elapsed time and whether completion required paste/file fallback. The current app QR helper uses error-correction level L and four-module quiet zone; measure actual readability before changing density/ECC policy. A mathematically valid QR at a dense payload size is not a physical readability claim. Printed fixtures and on-screen fixtures deserve separate results.

Existing jsQR selection uses `inversionAttempts: 'dontInvert'`. Evaluate inverted/dark-theme transfer only if the displayed QR can actually invert or product requirements include externally generated inverted symbols. Avoid expanding decoder work speculatively. If runtime-native failure fallback is accepted, allow at most one reader transition, retain cancellation checks, and show a useful paste/file alternative after the bounded failure. Neither local decode nor a public-config checksum authenticates the sender.

**Pairing semantics to retain:** PR60 `parseSellerPairing` limits text to 2 KiB and its `check` is an accidental-corruption check, not identity authentication. The import view is preview-only. A future “pin imported signer” action requires a deliberate identity-comparison/confirmation design under the PR60 owner; the current parser's successful return is not that approval. Backup secrets remain a different encrypted transfer type.

## 5. Accessibility and translation: finish shared components and collect human evidence

PR47 `apps/web/e2e/accessibility.spec.ts` already contains axe/keyboard, error, reflow and forced-colors/reduced-motion checks. PR60 reports pairing-specific browser work. Static tests and reported automation do not establish screen-reader usability or native-language review. The prior UX report already proposes a manual worksheet; extend that artifact with the concrete paths below rather than creating another general accessibility backlog.

### Recommended task REC-A1 — shared camera messages and critical-copy classification

**Priority:** small unfinished integration, coordinated with PR60. **Paths:** `components/CameraImporter.tsx` (`cameraMessage`, `submit`, `begin`, rendered labels/status), `i18n/translator.ts` (`createTranslator`), `i18n/securityKeys.ts`, locale catalogs. **Owner:** PR60 plus localization reviewer. **Reuse:** existing GhostPay translator; no i18next migration/dependency.

The shared camera component contains literal English consent, camera permission/failure, accepted/rejected input, stop and paste messages. In contrast, PR60's pairing screen adds locale keys. Migrate the shared component through the established catalog rather than claiming that adding pairing translations localized the full journey.

Preserve the current translator's reviewed-language behavior: critical messages select only registry-reviewed catalogs and otherwise use English source text; catalog metadata cannot self-approve a translation. Classify camera consent and import/trust implications explicitly. A new formatter library would not provide native review and could accidentally bypass this safety-copy boundary.

Acceptance: selected locale applies to eligible camera labels/status; unreviewed critical messages still use the approved source fallback; placeholders retain meaning; `lang`/direction behavior follows existing locale rules; an Arabic layout does not reverse a displayed address or fingerprint into a different identity. Test long pseudo-localized text, source fallback, keyboard access and screen-reader announcement. Do not report machine-drafted es/ja/ar catalogs as human-reviewed.

### Recommended task REC-A2 — status, focus and assisted passphrase entry

**Priority:** supported-browser evidence, with scoped fixes based on observed failures. **Paths:** `CameraImporter`, `SellerKeys`, `WalletAttempts`, PR61 `BackupPanel`, `AppShell` route focus and the existing accessibility E2E. **Owner:** current core/UI owners and prior UX worksheet owner. **Upstream:** [WAI SC4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [WAI SC3.3.8 Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html), design/acceptance references only.

`CameraImporter` already renders a polite status region. Evaluate what a person hears when a code is rejected repeatedly, when permission is denied, when a paste succeeds, and when a disclosure closes. The goal is meaningful status without moving focus on every frame or flooding announcements. WAI's status-message criterion concerns programmatically exposed updates; automated presence of `role=status` is not the entire experience.

For keystore passphrases, verify paste/password-manager interaction and clear labels in the actual supported browser. WAI's authentication guidance supports assistance rather than requiring memory/transcription. Its formal scope is existing-user authentication; do not claim it automatically dictates a self-custody key-generation ceremony. Apply the useful assistance principles while preserving GhostPay's actual passphrase requirements and consent.

Manual evidence should cover keyboard-only use, at least the supported screen-reader/browser combinations, narrow-screen reflow, zoom, visible/unobscured focus, actual touch targets, forced colors and reduced motion. Use synthetic data. Record success criteria separately and retain “untested” rather than deriving a global compliance score. The remaining native translation review and physical camera exercise are already acknowledged by PR60; this note supplies implementation seams and acceptance detail.

## Suggested pickup order

1. Reconcile PR47/59/62 and mark existing recovery/journey work as implemented-but-unqualified where appropriate. Do not duplicate the new core-journey spec.
2. Coordinate the shared `CameraImporter` locale gap and hidden-document behavior with PR60. These are the clearest small integration candidates in this lane.
3. Adapt WPT connection/transaction lifecycle ideas into GhostPay assertions, concentrating on version-change/BFCache/retry behavior and same-origin cross-tab storage.
4. Add independent synthetic QR fixtures using the pinned Nayuki implementation; keep new code out of the application bundle. Carry copyright/license/provenance with any copied test code.
5. Collect a supported-engine/device/wallet matrix with existing production KDF and consent behavior. Keep source keys/backups until independent recovery is demonstrated.
6. Reconcile the PR61 checklist copy with evidence levels and the existing manual UX worksheet. Keep optional full-profile archive work deferred from lean.

## Verification limits and sources

All findings here are based on source inspection, official specifications/documentation and upstream license/source retrieval. We did not run the repository test suites, install new runtime packages, test physical devices or make financial requests. Source statements about absence of a handler describe the inspected files/snapshots; they do not establish an exploitable condition. Upstream HEAD pins are immutable research anchors, not declarations that a release is current, audited or production-ready.

Primary references retrieved:

- [W3C IndexedDB](https://www.w3.org/TR/IndexedDB/) — transaction and connection lifecycle.
- [W3C Web Locks](https://www.w3.org/TR/web-locks/) — coordination and storage/privacy scope; document identified itself as a Working Draft.
- [W3C Web Cryptography](https://www.w3.org/TR/webcrypto/) — key/API semantics and same-origin script security boundary.
- [RFC7914](https://www.rfc-editor.org/rfc/rfc7914.html), especially §2 parameters and §12 vectors — scrypt interoperability.
- [EIP1193](https://eips.ethereum.org/EIPS/eip-1193) and [EIP6963](https://eips.ethereum.org/EIPS/eip-6963) — provider events/errors and multi-provider discovery.
- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) — hidden/frozen/discarded states and event limitations.
- [MDN storage quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — persistence policy and origin storage limitations.
- [Playwright projects](https://playwright.dev/docs/test-projects) — explicit browser/project configuration.
- [WAI status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) and [assisted authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) — targeted acceptance references.
- [Project Nayuki's independent site](https://www.nayuki.io/page/qr-code-generator-library), pinned source/MIT header above, and its advertised GitLab mirror (mirror itself blocked here).
- WPT, jsQR and Nimiq pinned source/license paths in their decision tables above.

Before any borrowing, record the selected path, immutable commit, copied portion, notice/license, modifications and intended shipping surface in GhostPay's existing dependency/reuse records. For reference-only recommendations, cite the design source without copying it. A permissive license permits reuse subject to its terms; it does not establish correctness, suitability, package provenance or successful integration.
