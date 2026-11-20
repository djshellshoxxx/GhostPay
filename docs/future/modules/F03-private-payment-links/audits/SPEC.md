# F03 independent specification audit

## Summary and verdict

Reviewed implementation: `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Audit lane: fresh specification/QA review of the selected signed-invoice file interchange feature.

**Original verdict at that checkpoint: one Medium specification defect.**
An app lock does not necessarily change the seller session. File reads and displayed previews
listen to session identity/version but not the app-lock event, so both can survive an actual idle
lock. Four new, independently authored regression cases reproduced this against unchanged
production source: pending read and staged preview, each with an absent or retained seller session.
All four failed because the old **Open request file** action remained available.

**Follow-up verdict at `d82744017594267d9511e46beaf19e5842fb8317`: finding resolved.**
The coordinator connected the existing app-lock signal to intake invalidation. Independent review
of that four-line repair and new execution confirmed 4/4 lock regressions passing and 114/114
combined feature/original-QR/translation-policy tests passing. No remaining source defect was
identified in this specification lane; the qualification limits below remain separate.

**Final source follow-up at `e543d25fc7f3b65460518f4b3df4c513d34a1215`: locale-only repair accepted.**
Exactly 15 English fallback entries were added to each Arabic, Spanish and Japanese catalog.
Existing translations, metadata and runtime TypeScript remain unchanged. These entries provide
catalog completeness; they are not translations or evidence of native-language review.

The closed transport schema, exact original envelope preservation, bounded UTF-8 intake, explicit
download/opening, canonical verification, generic diagnostics, existing QR URL restrictions,
supported-profile gates and stated privacy limitations otherwise match the selected specification
on source review. No scope creep into the concurrent broader F03 catalog was found.

This is not release qualification. The handoff reports 74 codec and 3 real QR interoperability
tests passing; this auditor did not rerun those suites. The combined DOM suite was independently
rerun after the repair, growing from 110 to 114 with the four new lock regressions.
Chromium fixtures were collected without browser execution, and full invoice-schema coverage
did not complete. The coordinator owns broad type/lint/build/static and hosted checks. Their
outcomes must be recorded independently, and focused/DOM results must not be promoted to a
browser or full-coverage pass.

## Finding F03-SPEC-01 — Medium: app lock does not invalidate file intake

**Requirement:** selected `SPEC.md:51–52`: “Invalidate stale reads/previews on replacement,
invalid replacement, clear, disclosure close, hidden page, unmount, session/lock, build-profile or
parent scope change.”

**Affected implementation at the reviewed checkpoint:**

- `apps/web/src/components/PaymentRequestFileInput.tsx:70–90` installs disclosure and visibility
  observers and a scope-change reset, but no app-lock subscription.
- `apps/web/src/components/PaymentRequestFileInput.tsx:54–67` and `110–140` accept a late read when
  the captured session version and parent revision are unchanged.
- `apps/web/src/views/Pay.tsx:205–218,234,240–274` uses `app.session`, the import revision and the
  session guard for previews/opening; none observes the independent app-lock signal.
- `apps/web/src/AppShell.tsx:145–165` emits `notifyAppLock('idle')`, then returns without calling
  `clearSession()` for an ordinary payer with no seller session or for generated seller keys whose
  only copy must be retained. The public session and its version consequently remain unchanged.
- `apps/web/src/lib/appLock.ts:13–29` exposes the existing subscription boundary for this event.

**User impact:** a request selected before idle lock can finish and publish its preview after lock;
an already displayed preview also remains. Explicit opening can still use that prior request
because neither its parent revision nor session guard changed. This violates the specified
cancellation boundary. It is not a signature bypass or an observed automatic payment.

**Independent evidence:** the coordinator extended this auditor's ownership to add four permanent
cases in `apps/web/src/views/Pay.requestFile.test.tsx`, named `invalidates a pending file read on
app lock` and `invalidates a staged file preview on app lock`, parameterized for `absent`/`retained`
seller sessions. The tests use locally generated signed invoices, deferred local reads and the
actual `notifyAppLock('idle')` event. Each verifies that the public session identity stays unchanged.
All four failed at the expected cancellation assertion on the original production code:
`Open request file` was present instead of absent. Duration 5.31 seconds, exit 1, 4 failed and
13 unrelated tests skipped. The later no-wallet/network assertions were not reached in this RED
run and are not claimed as independent passing evidence.
The original captured execution output is preserved with its provenance in
[`spec-app-lock-red.log`](../evidence/spec-app-lock-red.log); it was transcribed from the execution
tool's actual output because the first RED run was not redirected at run time.

**Minimal repair:** subscribe the file intake to `subscribeAppLock(invalidate)` using the same
invalidation that aborts its reader and invokes the parent reset. Unsubscribe on unmount. This
also clears a settled preview through the existing parent callback and stops the associated camera
through its existing key reset. Rerun the four regression cases and the affected combined suite.

**Scope distinction:** the reused QR/payment flow already lacked this independent lock subscription.
The new file feature nevertheless explicitly promised the boundary. A raw session reset with an
unchanged public snapshot is not counted as another finding. A previously confirmed passphrase
unlock and a newly selected but not yet opened candidate were inspected separately; selection and
confirmation are distinct operations, and no introduced authority defect is claimed for that
inherited behavior.

## Requirement traceability

`SPEC.md` below means `docs/future/modules/F03-private-payment-links/SPEC.md` at the reviewed
implementation. “Authored evidence” identifies checked-in assertions, not an unreported test run.
Source compliance is distinguished from execution and release evidence.

| Requirement | Implementation and authored evidence | Assessment at reviewed checkpoint |
| --- | --- | --- |
| Same signed intent for seller export and payer file/link/QR; preserve existing cryptography (`SPEC.md:9–13`) | `CreateInvoice.tsx:371–389` passes `visibleCreated.fragment`; `requestFile.ts:61–68,80–102` wraps/returns it unchanged; `requestFile.interop.test.ts:38–66` compares terms, digest, signature, trust and expiry; `requestFileInterop.test.ts:38–86` actually rasterizes and decodes multipart QR images. | Implemented. Handoff reports integration passes; no new cryptography or transaction policy in the diff. |
| Exactly `format`, `version`, `fragment`; no origin, labels, timestamps, passphrase or separate plaintext fields (`SPEC.md:17–24`) | `requestFile.ts:7–18,64–68,93–102`; rejection cases in `requestFile.test.ts:95–140`; independent `JSON.parse` comparison in both interoperability files. | Implemented. The invoice's existing encoded contents remain inside the unchanged fragment, as intended. |
| Generic `ghostpay-request.gpr.json`, MIME `application/json` (`SPEC.md:23`) | `requestFile.ts:12`; `PaymentRequestDownload.tsx:11–14`; `PaymentRequestDownload.test.tsx:11–23`; Playwright download helper checks suggested filename at `payment-request-file.spec.ts:37–44`. | Implemented. Real browser download behavior remains unexecuted here. |
| Public synchronous serializer/parser, readonly result, 24 KiB constant and typed fixed diagnostics (`SPEC.md:26–31`) | `requestFile.ts:7–32,61–102`; exports in `index.ts:72–81`; stable values and error shape tests in `requestFile.test.ts:38–49,171–189`. | Implemented. Readonly is the declared TypeScript API; runtime freezing was not requested. |
| Reuse strict JSON and canonical base64url; reject missing/duplicate/unknown/forbidden keys, wrong types/versions/prefixes/encodings (`SPEC.md:33–34`) | `requestFile.ts:1–4,37–49,87–101`; existing `json.ts:133–154` uses a null-prototype object and rejects duplicate/forbidden decoded keys; `base64url.ts:52–72` rejects padding, invalid characters and nonzero trailing bits; exhaustive wrapper/fragment cases in `requestFile.test.ts:95–140`. | Implemented. No ordinary `JSON.parse` substitution or URL acceptance in the transport API. |
| Preserve 16 KiB decoded limit; check characters and actual UTF-8 size before JSON work (`SPEC.md:35`) | `requestFile.ts:34–49,80–89`; boundary cases at `requestFile.test.ts:143–169`. | Implemented. The maximum supported envelope fits the 24 KiB wrapper ceiling without increasing the underlying limit. |
| Outer formatting whitespace allowed; exact fragment with no trim/reconstruction/re-signing (`SPEC.md:36–37`) | `parseStrictJson` allows only JSON whitespace; serializer retains the supplied string; `requestFile.test.ts:51–54,56–91,131–139`. Pay's reused extraction receives an already validated ASCII fragment, so its generic paste trimming cannot change a valid file fragment. | Implemented. JSON escape syntax can represent the same string value; that is not envelope normalization. |
| DOM/network/storage/signing-free codec; wrapper is not authentication (`SPEC.md:37–39`) | `requestFile.ts` calls only strict parser/base64 and text encoding; Pay calls existing `openFragment` at `Pay.tsx:257`; original envelope processing at `envelope.ts:324–358,404–430,503–563`; transport-only tests at `requestFile.test.ts:83–87`. | Implemented. Canonical/schema/signature/trust/passphrase checks remain separate. |
| Explicit download beside original link and QR through existing safe helper (`SPEC.md:43–44`) | `CreateInvoice.tsx:380–384`; `PaymentRequestDownload.tsx:8–21`; download tests exercise explicit invocation, changed fragment and redacted failures. `Common.tsx:87–113` removes temporary anchors and revokes Blob URLs on success/failure; existing `Common.test.tsx:52–126` covers cleanup. | Implemented on source review. New component tests mock the helper; browser download and inherited helper tests are distinct evidence. |
| Dedicated picker in existing disclosure; declared/actual bounds and fatal UTF-8; hints only (`SPEC.md:45–46`) | `Pay.tsx:978–995`; `PaymentRequestFileInput.tsx:92–129,147–150`; file tests at `PaymentRequestFileInput.test.tsx:38–115`. The byte-count mismatch check rejects truncated reads. `ignoreBOM: true` preserves a BOM for strict JSON rejection. | Implemented. File metadata is not used as a trust decision. |
| Selection only stages through existing QR boundary; no wallet/RPC/navigation/history/payment (`SPEC.md:47–48`) | `PaymentRequestFileInput.tsx:128–133` delivers only the fragment; `Pay.tsx:240–265` parses into preview, while `267–274` alone updates in-memory app fragment; `AppShell.tsx:74,241–261` confirms that setter is React state. Tests at `Pay.requestFile.test.tsx:52–70` spy on wallet/manifest/RPC/fetch and unchanged location; Playwright fixtures at `74–98` additionally snapshot both stores and all observed requests. | Implemented for initial selection. DOM assertions are authored/reported passing; the stronger real-browser fixture has not executed. |
| Explicit open; full ordinary review; parsed wrapper does not establish trusted seller; invalid signatures never enable payment (`SPEC.md:49–50`) | Source-specific preview and explicit action at `Pay.tsx:985–992`; ordinary parse/review at `278–355,1034–1043`; `pay.ts:115–149,177–181` blocks invalid signatures, expiry, unsupported chains/assets and missing manifests; Continue is disabled at `Pay.tsx:1330`; existing `Pay.invoiceQr.test.tsx:295–305` checks the shared invalid-signature boundary; file browser fixture at `185–200` covers the file path. | Implemented. Invalid signatures may be reviewed as explicitly invalid; the spec forbids payment, not all rendering. |
| Passphrase files use existing unlock behavior (`SPEC.md:50`) | `openFragment` returns an unverified header without KDF/decryption when no passphrase is supplied; `Pay.tsx:327–331,511–546,967–976` uses the existing password form and rechecks supported profile after unlock. Real passphrase coverage appears in `Pay.requestFile.test.tsx:72–88`, both interop files and the browser fixture at `101–127`. | Implemented. The file includes no passphrase. Wrong-passphrase browser case is authored but unexecuted; package interoperability tests cover refusal. |
| Replacement and invalid replacement invalidate prior work (`SPEC.md:51`) | `PaymentRequestFileInput.tsx:92–111` discards and invokes parent invalidation before inspecting the replacement; `Pay.tsx:213–218` increments revision and remounts camera; file tests at `118–156`, Pay tests at `106–149`. | Implemented. File-to-QR and QR-to-file late-result suppression are explicitly exercised in authored DOM tests. |
| Clear and disclosure close, including close/reopen coalescing (`SPEC.md:51`) | `Pay.tsx:212,220–233,269,978,983`; file observer and `takeRecords` checks at `PaymentRequestFileInput.tsx:44,54–60,70–86`; component tests at `175–192`; original QR tests at `169–201`; Pay file clear/close cases at `151–168`. | Implemented. Separate observer guards protect callbacks and the confirmation action. |
| Hidden page and unmount (`SPEC.md:52`) | `PaymentRequestFileInput.tsx:46–52,80–87`; active controller abort and parent invalidation; file tests at `194–235`; file integration hidden case at `151–168`; camera unmount cleanup at `CameraImporter.tsx:148–154`. | Implemented on source review. DOM coverage is not browser/device lifetime evidence. |
| Session changes and app lock (`SPEC.md:52`) | `Pay.tsx:205,234,243–246,270`; `PaymentRequestFileInput.tsx:63–67,90,114`; session revision guard in `session.ts:344–348`; authored session/pin cases plus new app-lock regression. | **Partial: session changes are guarded; independent app lock is missing. Finding F03-SPEC-01, four independently reproduced failures.** |
| Build-profile/parent scope changes and same-file retry (`SPEC.md:52`) | `Pay.tsx:205–206` includes fragment, pins, session, reset, supported profile; component current/scope checks at `54–67,90`; input reset at `95`; component scope and retry tests at `52–61,159–173`; Pay pinned-policy test at original `170–191`; preexisting profile test at `Pay.supported.test.tsx:154–168`. | Implemented in source. A file-specific full→lean→full pending-read browser case is absent; do not claim exhaustive browser execution. |
| Preserve lean/full limits and link/QR/paste behavior (`SPEC.md:53`) | Existing `supportsInvoice` remains v1/fixed-token for lean at `Pay.tsx:139–140`, and is checked before staging/opened review/unlock; AppShell passes the profile at `51–53`. Original URL host/path allowlist is unchanged at `Pay.tsx:80–100`; paste remains `498–509`. Only two original QR tests change their clear-button label. | Implemented. New file lean rejection plus preserved QR/profile tests support source reasoning; no arbitrary wallet URI conversion added. |
| Honest disclosure: no extra encryption, bearer key readability, separate passphrase, retention, unchanged public-chain/wallet visibility; no content logs/details in names/errors (`SPEC.md:57–60`) | `en.json:8–10` adds download wording; generic codec/UI errors; `docs/user/payment-request-files.md:29–40`; package README file section. No new log/storage call in feature code. | Implemented. Exported fragments intentionally retain their existing disclosure. |
| Cross-deployment files without source fetch; independently trust app; no wallet compatibility/payment proof/global single-use promise; no analytics/server/settlement/QR allowlist changes (`SPEC.md:62–65`) | Origin-free wrapper; bare fragments bypass only the URL-wrapper branch already supported by QR; `docs/user/payment-request-files.md:39–51`; `CATALOG_RECONCILIATION.md:10–31`; changed-path review shows no server, fee, contract or settlement change. | Implemented; no scope creep found. |
| Codec/integration evidence, digest/signature/terms parity and tamper hard stops (`SPEC.md:69–72`) | All new codec/interop files were read in full. The QR test uses `qrMatrix`, raster pixels, independent jsQR decode, reversed multipart assembly and canonical invoice open; tampered amount/chain/recipient/fee/expiry are invalid-signature results and fail required-trust parsing. | Substantive authored coverage. Handoff reports 74 codec and 3 real QR tests passed; those reports are not new executions by this auditor. |
| Browser cases and original tests/coverage/type/lint/build/static gates; actual browsers where available; honest gaps (`SPEC.md:74–77`) | Six Playwright cases were inspected; DOM/component coverage includes most asynchronous boundaries, with app-lock newly failing. `ENVIRONMENT.md:19–26` distinguishes blocked Chromium from DOM tests. Full coverage record exits 124 at 180 seconds. Coordinator owns broad gates. | **Qualification incomplete.** Existing real-browser fixtures do not cover every cancellation boundary, and collecting them is not execution. See limits below. |
| Fresh independent audits, repair/follow-up, source-pinned handoff; deployment/merge separate (`SPEC.md:79–81`) | This audit is a fresh lane alongside standards/privacy; exact diff and commits recorded below. Regression tests were added only after the coordinator explicitly extended ownership. | Audit performed; production repair/follow-up and release decisions remain coordinator work. |

## Reviewed scope and commands

The complete 23-file selected-feature diff was reviewed, not a source sample. This includes all
new production code, all new and modified tests, locale/security-key additions, the selected spec,
catalog reconciliation, environment note, worker brief, active-work entry, user guide and package
README. Source callers were inspected for canonical JSON/base64/envelope verification, file Blob
cleanup, camera supersession, in-memory fragment storage, session/app locks, full/lean profile
propagation, passphrase opening, trust/expiry/asset checks and the unchanged explicit payment flow.

Exact snapshot comparison and commit inventory:

```sh
git diff 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13
git log 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5..f472030a1d9a993db1ba7a1a33f9a208c28ebf13 --oneline
```

```text
f472030a feat(web): add explicit request file download and local invoice review
3bfedf6b test: verify F03 request interchange with signed invoices and real QR decoding
0915891a feat(invoice-schema): add bounded payment request file interchange
4cd83af1 docs: scope F03 request interchange and worker ownership
```

Refs were resolved with `git rev-parse`. The checkout was
`057c922f2f9edee9edad0bef66d77f5da8f2f877`, whose only difference from the requested implementation
was `docs/ai/prompts/F03_AUDIT_HANDOFF.md`. Production source therefore matched the pinned review
when the new regression cases ran. Source reads used `rg`, `nl -ba`, `sed`, `cat`, and path-scoped
forms of the exact diff above. An absent `apps/web/vitest.config.ts` lookup was corrected to the
actual `apps/web/vite.config.ts`; it was not a test result.

The initial regression command independently executed by this lane, from `apps/web`, was:

```sh
timeout --kill-after=5s 90s node --max-old-space-size=1024 ../../node_modules/vitest/vitest.mjs run src/views/Pay.requestFile.test.tsx --maxWorkers=1 --coverage.enabled=false --reporter=verbose --testNamePattern='app lock'
```

Result: **RED, 4 failed / 13 skipped, exit 1, 5.31 seconds** on unchanged production source.
No browser, wallet transaction, external invoice, network scan, push or deployment was performed.
This lane changed only its audit file and, after explicit ownership extension, the new regression
cases in `Pay.requestFile.test.tsx` and its uniquely named `spec-*` execution evidence files.

## Independent repair follow-up

Regression commit: `c4c85727de2198482c939f18ac0a8088c9f82da5`.
Repair and verified checkout: `d82744017594267d9511e46beaf19e5842fb8317`.

The coordinator's production change adds the existing `subscribeAppLock` import,
`subscribeAppLock(invalidate)` in the intake lifecycle, and its cleanup unsubscribe. The callback
uses the already reviewed abort/message-clear/parent-invalidation path. The callback ref keeps the
current parent reset, and cleanup removes the listener rather than retaining an unmounted view.
The exact repair diff was independently inspected with `git show d8274401 --
apps/web/src/components/PaymentRequestFileInput.tsx`; the repaired lines are `5,71–93`.
This closes the lock boundary without changing file format, invoice verification or payment policy.

The targeted command above was rerun unchanged against the repair. It produced **4 passed,
13 skipped, exit 0**, with all session-identity, stale-preview and no-wallet/network assertions
executing. Vitest duration was 3.71 seconds; enclosing process elapsed time was 4.75 seconds.
Direct stdout/stderr capture and command/status/source pin:
[`spec-app-lock-green.log`](../evidence/spec-app-lock-green.log) and
[`spec-app-lock-green.json`](../evidence/spec-app-lock-green.json).

Then, serially and still from `apps/web`:

```sh
timeout --kill-after=5s 180s node --max-old-space-size=1024 ../../node_modules/vitest/vitest.mjs run src/components/PaymentRequestDownload.test.tsx src/components/PaymentRequestFileInput.test.tsx src/views/Pay.requestFile.test.tsx src/views/Pay.invoiceQr.test.tsx src/i18n/securityKeys.test.ts --maxWorkers=1 --coverage.enabled=false --reporter=verbose
```

Result: **5 files passed, 114/114 tests passed, exit 0**, with no skipped test in this selection.
Vitest duration was 26.50 seconds; enclosing process elapsed time was 26.87 seconds.
Direct evidence: [`spec-combined-dom.log`](../evidence/spec-combined-dom.log) and
[`spec-combined-dom.json`](../evidence/spec-combined-dom.json).
These include real signed-invoice passphrase opening in DOM tests, malformed/UTF-8/size rejection,
same-file and sequential imports, supersession, the original QR trust/URL/lifecycle behavior and
translation policy classification. Coverage was explicitly disabled and no real browser ran.

**Resolution:** F03-SPEC-01 is closed by independent source review and regression execution at
`d82744017594267d9511e46beaf19e5842fb8317`. The original checkpoint finding and RED evidence remain
unchanged above. No other material specification defect or scope creep was found.

## Final locale source follow-up

Reviewed successor: `e543d25fc7f3b65460518f4b3df4c513d34a1215`.
Verified tree: `e96e7876585150032a26ccf0947ea724b070c3ee`.
Comparison point: previously verified runtime `d82744017594267d9511e46beaf19e5842fb8317`.

The later catalog qualification check identified 45 missing entries: the 15 new `requestFile.*`
keys were present in English but absent from each of the three draft locale catalogs. The repair
adds only those keys at `apps/web/locales/ar.json:8–22`, `es.json:8–22` and `ja.json:8–22`.
The complete small diff was independently inspected with `git show` and `git diff --name-only`
between the exact comparison point and successor above. A read-only Python standard-library check
parsed the committed JSON with duplicate-key rejection and independently established:

| Locale | Preexisting messages preserved unchanged | Added entries | Removed/changed old messages | New entries equal English source | Metadata preserved |
| --- | ---: | ---: | ---: | --- | --- |
| Arabic (`ar`) | 2,253 | 15 | 0 / 0 | All 15, exactly | Yes |
| Spanish (`es`) | 2,253 | 15 | 0 / 0 | All 15, exactly | Yes |
| Japanese (`ja`) | 2,253 | 15 | 0 / 0 | All 15, exactly | Yes |

The check also established that these three JSON files are the only changed paths since the
verified runtime checkpoint. Runtime TypeScript, existing security-key classifications, locale
review registry and review digests are unchanged. The seven security-critical file messages
remain in `SECURITY_KEY_GROUPS.paymentRequestFiles`; the other eight retain their existing neutral
classification. No invoice format, cryptographic boundary, import lifecycle or payment behavior
was changed by this repair. The earlier 114-test execution remains pinned to `d8274401`, not
misreported as a test run against the later catalog commit.

**Language limits:** all 45 added values are explicit English fallbacks. Users selecting Arabic,
Spanish or Japanese therefore still see the new file controls/messages in English alongside
existing locale text. The unchanged catalog metadata says the catalogs are machine-drafted and
not reviewed by a native speaker; the repair does not promote them to reviewed status. Catalog
completeness and matching source strings do not establish translation quality, localized layout
or native-language review.

The coordinator subsequently captured the exact successor catalog check in
[`locale-catalog-final.log`](../evidence/locale-catalog-final.log) and
[`locale-catalog-final.json`](../evidence/locale-catalog-final.json). This lane inspected both:
`node scripts/i18n/check.mjs` at `e543d25fc7f3b65460518f4b3df4c513d34a1215` exited 0 in 0.40 seconds,
and its log reports **4 catalogs, 0 errors, 454 warnings**, including the 45 expected new
English-fallback warnings. This is inspected coordinator execution evidence, not a gate rerun by
this lane. The original failed check at `d8274401` remains separately preserved in
`evidence/locale-catalog.json`; it is not overwritten or treated as successor evidence.

**Source verdict:** this bounded catalog repair matches the selected feature's existing wording
and trust boundaries and introduces no additional specification finding. Only this report was
edited during the final follow-up; no heavy test/build or browser execution was run.

## Verification limits and follow-up

- Complete invoice-schema package coverage is not established. The source-pinned handoff says
  one run was interrupted and another expired at 180 seconds; the on-disk evidence confirms exit
  124. Focused codec coverage failing unexercised package-wide thresholds is not full coverage.
- Chromium failed before page creation with the documented socket restriction. Six collected
  Playwright cases provide no executed browser, download, network-trace or device evidence. The
  checked-in Playwright configuration uses Chromium; emulated iOS viewports do not establish
  Safari/WebKit support.
- The new browser file spec covers ordinary/bearer download-import-review, passphrase retry,
  invalid/oversized/UTF-8 replacement, same-file retry, clear, sequential requests and invalid
  signatures. It does not author real-browser cases for every close/hide/unmount/session/lock/
  profile/cross-source cancellation boundary. Source/DOM checks fill only part of that evidence.
- Broad typecheck/lint/build/static/hosted checks are serialized by the coordinator. The available
  `web-typecheck.json` records exit 2 at this review point; root-cause assessment and subsequent
  verification belong to the coordinator. No broad gate is inferred from focused successes.
- F03-SPEC-01 repair, independent diff review, focused regression and combined DOM verification
  are complete at the successor SHA recorded above. Full original gates and browser execution
  remain separate; the coordinator is pursuing broader package coverage and qualification after
  this lane released the serial test slot.
