# Signed request-file completion and preserved handoffs — 2026-11-26 UTC

## Source and scope

Worker: ChatGPT `/root/artifact_review`, independently reviewed by `/root/help_review`;
parent coordinator `/root` owns publication, fresh hosted CI and integration.
Branch: `finish/request-file-completion-20261126`.
Observed main at discovery: `29d21c1b2d8f8431115d99338db1667dc585ac16`.
The owner explicitly retained signed request files as a primary feature in
[#650's owner clarification](https://github.com/djshellshoxxx/GhostPay/pull/650#issuecomment-7158077523).
This is bounded core invoice exchange and lifecycle qualification under the current
shared-core clarification; no excluded product is resumed.

Implementation source: `28c45149da4bc0b6f2fc6e82cfcd09b185dc4ff3`, tree
`89a3c3604005633b74ddfea98b3e567543bd2ab8`. The final handoff commit only adds this report
and the additive ownership/result record. All listed donors remain ancestors through
normal merges; original branches are untouched.

| Input | Exact preserved source |
| --- | --- |
| Starting clipboard/P14 candidate | `222d0708d4a05fb94e4b7b94f14e0811a1ad9b76` |
| Completed clipboard/P14 handoff | `66dc4af9f97c3f8898abee1c063921d08291dad9` |
| #650 signed request files, including 180-second interop timeout | `3851f02b04325d417a52b80cc107290f1f434597` |
| #654 independent qualification and cross-tab browser regression | `a75ed0b14e26a0035f3922625d3b1ee3b06447da` |
| #686 completed coordination handoff | `487fb19b046966cd2f89ad0b83c17bcb66feea73` |
| #595 handed-off wallet-attempt fixture qualification | `534bb3808d0f37dd2e6c1f4aaca7c529d9b2432c` |

The clipboard/P14 tree was subsequently published unchanged as #687 at
`82d50755fcbfc5990be6eefd2c18db96b7131e9a` (tree
`828dab11ac96d681a7d00af530d69ffd918d67eb`, identical to local `66dc4af9`). The parent
will publish the final reviewed tree with that canonical first parent and retained donors.

## Completed changes

- App lock now cancels camera tracks, pending camera permission, pasted/image imports
  and partial multipart transfers through the existing cancellation primitives. It
  clears stale status/refusal state, invalidates the parent's preview and unsubscribes
  on unmount. Both idle and manual locks are covered. The textarea remains the same
  node with the same draft; restarting requires another explicit user action.
- The shared download-name allowlist now preserves the documented, fixed,
  value-free `ghostpay-request.gpr.json`. The real component-to-anchor regression
  checks that name, JSON MIME, temporary-anchor cleanup and delayed Blob URL revocation.
  Fallback sanitization is unchanged. The exact call-site audit now accounts for the
  fourteenth call, pins the new constant and preserves the old filename rule for every
  other fixed name.
- Only the real-scrypt passphrase case in `Pay.requestFile.test.tsx` receives a
  120-second bounded acceptance wait and 180-second overall timeout. The encrypted
  build/open path, memo acceptance and no-wallet/no-RPC assertions remain intact.
  The separate #650 interop test remains the exact donor blob with its 180-second limit.
- #595 is composed into the current wallet-status fixture: await the real IndexedDB
  migration, restore spies, keep one cleanup, and add its delayed resolve/reject after
  unmount cases. All six current status/hash-privacy cases remain; no wallet or journal
  implementation changed.
- #686's tracker is preserved with exactly one correction: its hosted-check statement
  now records 39 successes and three intentional skips, with CodeQL passed.

The #650 merge preserved both the invoice-link clipboard delay and the request-file
download control at their shared `CreateInvoice` adjacency. The security-key registry
retains both metadata-retention and payment-request groups. Ownership-log conflicts
were reconciled additively, retaining the prior log and every donor claim. All #650
invoice-schema paths and #654's browser regression remain donor-exact. No dependencies,
workflows, KDF parameters, fees, transaction behavior or release scope were changed.

## Fresh local evidence

Environment: Node 24.22.3. `npm ci --ignore-scripts --no-audit --no-fund` installed
722 local packages successfully; no tracked dependency/lockfile changes. Hosted CI
uses its own pinned Node version and must qualify the newly published head.

| Check | Observed outcome |
| --- | --- |
| `npm run build:libs` | Pass. |
| New lock/download regressions before and after repair | 12 failed before repair; all 12 passed after repair. The selector left 55 unrelated cases unrun. |
| Existing fixed-name audit before reconciliation | Two expected failures (new suffix and fourteenth call), four passes; the existing randomized property was excluded. |
| Focused web suite below | 15 files, 241 passed, one existing filename fuzz property excluded; 20.28 seconds. The real-passphrase case passed in 2.311 seconds locally. |
| Invoice-schema `requestFile.test.ts` and `requestFile.interop.test.ts` | Two files, 85 passed; 5.27 seconds. |
| Composed `WalletAttempts.status`, `securityKeys`, `LanguagePicker` fixtures | Three files, 26 passed; 3.25 seconds, including all eight wallet-status cases. |
| `npm run typecheck -w @ghostpay/web -w @ghostpay/invoice-schema` | Pass on the source repairs. The later browser build also typechecked the final #595 composition. |
| `npm run lint -w @ghostpay/web -w @ghostpay/invoice-schema` | Pass; the added #595 fixture separately passed typed ESLint after composition. |
| `node scripts/i18n/check.mjs` | Four catalogs, zero errors, 853 untranslated/fallback warnings. |
| Full-profile browser command | Web-server build, typecheck and postbuild scan completed and served successfully. All 13 browser cases then failed at launch before assertions; see limitation below. |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web` | Pass, including final composed typecheck and postbuild scan: 18 files, validated bundled deployment source, no dynamic code, unexpected origins, source maps or loose deployment JSON. |
| Lean browser collection | 13 tests in five files collected; execution was not retried after the shared missing-browser failure. |
| `npm run ci:scan-secrets` | Pass. |
| Source/donor composition inspection | Five input/base ancestry checks passed; all 142 pre-handoff changed paths are donor paths or claimed repairs. After the approved repair commit `7d7b25d4`, only the four expected #595/#686 fixture/document paths changed. |

The focused web command was:

```sh
npm exec --workspace @ghostpay/web -- vitest run \
  src/components/CameraImporter.test.tsx \
  src/components/CameraImporter.behavior.test.tsx \
  src/components/CameraImporter.lifecycle.test.tsx \
  src/components/CameraImporter.visibility.test.tsx \
  src/components/CameraImporter.multipart.test.tsx \
  src/components/CameraImporter.i18n.test.tsx \
  src/components/PaymentRequestDownload.test.tsx \
  src/components/PaymentRequestFileInput.test.tsx \
  src/components/Common.test.tsx src/lib/downloadNames.test.ts \
  src/views/Pay.requestFile.test.tsx src/views/Pay.invoiceQr.test.tsx \
  src/views/Pay.supported.test.tsx src/views/Pay.i18n.test.tsx \
  src/lib/requestFileInterop.test.ts \
  --testNamePattern '^(?!.*fuzz:)' --reporter=verbose
```

The browser command selected `payment-request-file.spec.ts`,
`payment-request-file-attempt.spec.ts`, `qr-camera.spec.ts`,
`qr-camera-multipart.spec.ts` and `qr-invoice-image.spec.ts`, with `--project=desktop`.
It used the installed `/usr/bin/chromium` launcher through `GHOSTPAY_CHROMIUM`; that
launcher exits 127 because `/usr/lib/chromium/chromium` is missing. Thus **zero browser
test bodies ran**. This is not passing browser acceptance. No browser/system installation
or repository configuration was changed to work around it. Actual full/lean hosted
browser execution remains required. No native Firefox/WebKit or physical-camera result
is asserted.

## Review, limitations and next step

Independent source review approved repair commit
`7d7b25d4c4079f680c499736d399cdcf3bd13f73` and the final composed implementation
`28c45149da4bc0b6f2fc6e82cfcd09b185dc4ff3`, finding no assertion weakening or source
blocker. All production and existing acceptance expectations are preserved except the
two documented lifecycle/filename fixes and the bounded test wait.

The inherited #650 handoff mentions N3/N5/N7 without defining them in the tracked F03
audits, round-three review or retrieved comments. This report does not claim to resolve
those unspecified historical notes or adopt unrelated work. Historical package/browser
passes on earlier heads do not qualify this composed tree. No full-web coverage or
randomized/fuzz campaign was run locally for this task; existing tests and thresholds
remain unchanged. No live transaction, third-party probing, remote publication or merge
was performed by this worker.

Next: parent independently verifies the final documentation commit, publishes the exact
reviewed tree with the canonical parents, and requires fresh combined hosted CI,
including full/lean browser acceptance, before integration under the coordination lock.
