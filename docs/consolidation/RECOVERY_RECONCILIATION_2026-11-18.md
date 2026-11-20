# Spec 18 recovery reconciliation

## Source and scope

This scoped port starts from PR #239 at `4a1b181c89e02ee564b5568d4b4b8d689f5e42c5`, whose tree is
`bd4eac2eae1a93530c1b7c307d0b42b3252c4941`. It preserves unique safeguards from PR #240 at
`38d69832ddc58ec27a19c00dbe3c89347c577495` (tree `d959e5bea2fb8cae9a8847229e1c0f1b14e833ad`).
Both branches descend from the Pages candidate `198aa5baff22272453733a0f3dcfcac0e0994eec`.
Neither complete branch supersedes the other. This port adds no format, dependency, custody or network surface.

## Resolution

| Source | Preserved behavior and evidence |
| --- | --- |
| #239, retained unchanged | Session replacement prepares new boxes before disposing the existing wallet; allocation failure preserves old keys, custody and revision. Partial replacement boxes are disposed. `session.atomicity.test.ts` remains present. |
| #239, retained unchanged | A refused encrypted download retains the generated ciphertext and offers a retry without rerunning key export. `StealthExportDownload.test.tsx` and the browser retry case remain present. |
| #239, retained unchanged | Editing the verification passphrase removes stale verification success. Real-crypto verification tests await the observed operation before assertions. |
| #239, retained unchanged | Interrupted piped recovery passphrases wipe chunks received before the exception; the standalone regression remains present. |
| #240, ported | Recovery and saved-file verification check original file byte length before accepting `File.text()` output. A UTF-8 BOM must not become a successfully verified canonical file after browser decoding strips its bytes. Source: `032c42fc`. |
| #240, ported | The unload handler checks current session custody at the event and requires a verified copy outside the browser profile before suppressing the prompt. A cached browser-vault summary cannot hide another tab's deletion; unchanged React summaries cannot hide a newly verified external copy. Source: `041db448`. |
| #240, ported | Fresh replacement consent is exercised through cancellation and a second request; browser keyboard verification and explicit beforeunload handling remain covered. Sources: `041db448`, `d46b8d82`, `f72c198b`, `032c42fc`. |

The portable codec, `paymentKeyExport.ts`, and `StealthExportCommon.tsx` have identical blobs in #239 and #240;
they are retained from #239. No automatic `ours`/`theirs` selection was used for conflicting recovery behavior.
The master coordinator separately owns browser helper repairs and combined qualification.

## Regression coverage preserved or added

- Actual BOM bytes are refused by both Open export and Verify backup without importing, before custody changes.
- Saved-file verification refuses BOM-altered bytes before invoking the verifier, without marking the file verified.
- Unload protection remains active after another tab deletes the only saved vault copy.
- An external-copy verification suppresses the prompt even if the public backup summary does not change.
- A newly generated invoice-signing key still receives unload protection when only payment keys were imported.
- Browser cases preserve the failed-download retry, verify rejection of BOM bytes, require new replacement consent
  after cancellation, and exercise keyboard file selection and verification.

## Checks at this worker checkpoint

| Check | Result |
| --- | --- |
| `git diff --check` | Passed after reconciliation. |
| Native `File.text()` normalization probe, Node `v24.22.3` | Passed: a synthetic ASCII file with a three-byte UTF-8 BOM had 39 raw bytes, decoded to 36 characters identical to the original string, and the new byte-length predicate rejected it. This confirms the mechanism; it is not a React or browser-suite pass. |
| Source/diff preservation review | Performed against the two pinned heads; #239-specific custody, retry, verification and pipe cleanup remain. |
| Web unit tests, typecheck, lint, full/lean browser suites | Not executed by this worker. The coordinator's dependency installation attempts terminated with exit 137; partial `node_modules` is not a usable installation claim. Required on the combined candidate. |
| Independent review of this combined port | Pending coordinator review. The author of this port cannot independently approve it. |

No release, deployment, remote branch update, merge to main or security-gate disposition is asserted by this handoff.
Existing reports on either source branch do not qualify the combined source.

## Combined-candidate qualification

After building the dependency graph, run the AppShell beforeunload, session atomicity, payment-key export,
StealthExport component and SellerKeys recovery tests; run the independent recovery script suite; then typecheck,
lint and execute the full and lean Chromium suites. Preserve every existing cancellation, stale-session,
sole-copy and secret-buffer assertion. Record the actual combined commit, commands and results before promotion.
