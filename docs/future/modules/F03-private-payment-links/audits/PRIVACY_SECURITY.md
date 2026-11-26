# F03 defensive privacy and security audit

Reviewer: independent `f03_audit_privacy` worker, 2026-11-20 UTC.

## Reviewed checkpoints and verdict

| Review | Source pin | Result |
| --- | --- | --- |
| Initial implementation | `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`; tree `387690ae4248ed35da78b359e84ba09c9b7a25b4` | One medium finding: application lock does not invalidate imports when seller-session identity stays unchanged. |
| Independent repair review | `d82744017594267d9511e46beaf19e5842fb8317`; tree `98058025f99c75327b7abc55a9587d5c9997d546` | Finding closed by source inspection. No remaining introduced privacy/security blocker found in the reviewed scope. |

Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Branch: `future/f03-private-payment-links`.
The repair's preceding test-only commit is `c4c85727de2198482c939f18ac0a8088c9f82da5`.

**Final source-review verdict: acceptable at the repair pin, subject to the verification limits below.** This is a review of the selected signed-invoice file interchange feature, not completion of the concurrent broader F03 catalog. It is not browser qualification, a whole-repository security audit, a package coverage pass, or release approval.

## Finding F03-PS-01 — app lock leaves an old import actionable

**Severity: medium. Present at the initial implementation; source repair verified at `d8274401`.** This is the same defect as the specification lane's app-lock finding, not a second issue to count separately. The specification reviewer identified the boundary; this reviewer independently confirmed the complete source path and reviewed its repair.

### Evidence at the original checkpoint

Line references in this subsection refer to `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.

- `apps/web/src/components/PaymentRequestFileInput.tsx:56–67` gates completion on request identity, abort signal, scope identity, visibility, session revision and parent revision. Its lifecycle subscriptions at `70–90` observe disclosure changes and document visibility, but not application lock.
- `apps/web/src/views/Pay.tsx:205–218` builds the import scope from fragment, pins, seller session, reset counter and build profile. Completion and confirmation at `240–270` enforce those identities and the captured session revision, but do not observe application lock.
- `apps/web/src/AppShell.tsx:145–165` calls `notifyAppLock('idle')` before deciding whether seller keys may be cleared. It returns without `clearSession()` when no seller session exists (`152–154`) or when the only surviving seller keys must be retained (`160–164`). Those are deliberate custody policies: an app lock is not necessarily a session change.
- `apps/web/src/lib/appLock.ts:14–29` provides the existing explicit lock subscription. `apps/web/src/lib/session.ts:344–348` only detects a changed session revision.

An already staged request therefore retains its valid revision/scope/session guard across such an idle lock. A pre-lock read or local preview operation can also finish and stage the old request. The page and disclosure need not close when the idle timeout fires. The retained **Open request file** control can then install the old fragment for ordinary invoice review.

### User impact and limits

The import survives a privacy/lifecycle boundary that SPEC browser requirement 5 explicitly says must discard pending work and previews. Returning to the locked app can leave an earlier request available to open without selecting it again; late pre-lock work can repopulate the preview.

This is not an automatic-payment, wallet-connection, signature-bypass or transmission finding. Signature/trust, supported-invoice, expiry and explicit transaction-approval checks remain downstream. The policy that retains sole-copy seller keys is intentional and must be preserved.

The pre-existing QR import shares this underlying omission. The F03-specific issue is the new file workflow's reliance on incomplete guards despite its explicit lock requirement. This is not described as a regression in session-revision checking or a reason to wipe unrecoverable keys. A separate synthetic `clearSession()` call while already empty can also leave displayed state until a later guard runs, but that overlapping observation is not counted as another security finding.

### Remedy and independent follow-up

The coordinator's four-line repair imports `subscribeAppLock`, subscribes the existing `invalidate` function during the file input's mounted lifetime, and unsubscribes during cleanup (`PaymentRequestFileInput.tsx:5,71–94` at the repair pin).

That function synchronously calls `discard()`, aborting a pending consumer, and calls the latest parent `onInputChange`. In Pay this is `beginInvoiceFile`, which synchronously advances `invoiceQrRevision`, clears preview/errors and schedules the camera lifetime reset (`Pay.tsx:207–218`). A pending file read fails its request/parent guard; an active local invoice parser fails its aborted-signal/revision guard; an old confirmation closure fails the revision comparison before installing a fragment, even before React renders the cleared preview. The subscription is removed on unmount, and seller key retention is unchanged.

The repair is minimal and uses the existing cancellation path. Independent source inspection closes F03-PS-01 at `d82744017594267d9511e46beaf19e5842fb8317`. The test-only predecessor adds pending-read and staged-preview cases for absent and retained seller sessions. The specification worker reported all four cases RED against unchanged production. Runtime GREEN and broader focused-suite execution are owned by that worker/coordinator and must be recorded in their evidence; this reviewer did not rerun those UI cases.

## Scope and reviewed boundaries

The review read `AGENTS.md`, `docs/ai/WORKFLOW.md`, the current handoff and ownership registry, `F03_AUDIT_HANDOFF.md`, and the feature's `SPEC.md`, `CATALOG_RECONCILIATION.md`, and `ENVIRONMENT.md`. It inspected the exact baseline-to-implementation diff and followed callers and dependencies beyond the diff.

All changed production feature source was reviewed: `requestFile.ts`, the new public exports, `PaymentRequestDownload.tsx`, `PaymentRequestFileInput.tsx`, both view integrations, English catalog additions and translation-security classifications. Every new feature test file and the two existing QR-test label changes were read. Tests were inspected as evidence, not accepted as proof merely because their assertions exist.

Unless stated otherwise, source references in this table are at the initial implementation; those paths remain unchanged by the four-line repair.

| Boundary | Source assessment |
| --- | --- |
| Closed wrapper | `requestFile.ts:79–103` requires a non-array object with three keys, the fixed format, numeric version and valid fragment. The delegated strict parser creates null-prototype objects and rejects duplicate and forbidden keys, including escaped spellings (`json.ts:133–153`). Those guarantees make the three required values plus key count sufficient to exclude additional fields. |
| Bounds and canonical encoding | `requestFile.ts:80–85` checks character length and actual UTF-8 bytes before JSON parsing. Fragment checks at `36–49` preserve the existing 16 KiB decoded ceiling and delegate to the canonical unpadded base64url decoder. The 24 KiB file ceiling accommodates every supported envelope plus wrapper. The strict parser's depth/integer constraints remain inherited. |
| File size, UTF-8 and MIME | `PaymentRequestFileInput.tsx:92–130` resets the native selection for same-file retry, checks declared size before reading, then checks actual bytes and declared/actual agreement. Fatal UTF-8 rejects malformed input; `ignoreBOM: true` preserves the BOM so strict JSON rejects it. MIME and extension are hints; content determines acceptance. |
| Exact intent | `requestFile.ts:36–67,100–102` validates and transports the original fragment value without trimming, re-signing, normalization, envelope reconstruction, decryption or separate payment fields. Formatting and JSON escapes may vary around the logical fragment value. `CreateInvoice.tsx:380–386` exports `visibleCreated.fragment`; `invoiceCreate.ts:163–169` builds the original link from that same fragment. |
| Transport versus trust | Accepting an opaque encoded payload is intentional. `Pay.tsx:249–260` passes it to `openFragment` before staging, and only explicit confirmation installs it (`267–274`). `envelope.ts:404–431,434–452,503–507` retains signature verification and the distinction between signature integrity and pinned seller identity. Neither wrapper nor filename supplies a trust claim. |
| Invalid signature and expiry | The existing default parser can return an invalid-signature review result. `pay.ts:115–147` makes invalid signatures, expiry and unsupported chains/tokens blockers; context creation refuses blockers (`177–181`), and Continue remains gated (`Pay.tsx:1330`). Files add no alternate send path. |
| Passphrase and bearer disclosures | The wrapper contains no passphrase. A passphrase request remains an explicitly unauthenticated header until the ordinary unlock step. Plain and bearer-key requests acquire no extra encryption. Existing creation text differentiates plaintext and key-carrying links; the added hint says the file grants the same access and that passphrases travel separately. |
| Network, wallet and persistence | New codec/input/download code adds no RPC, wallet, storage, navigation or fetch call. Selection reads locally, invokes local `openFragment`, and sets preview state. `app.setFragment` is reached on explicit opening. Ordinary manifest/RPC review activity can occur afterward through existing code; the entire payment review is not claimed to be permanently offline. No source origin is stored or fetched, and the full-URL QR host/path restrictions remain unchanged. |
| Replacement and cross-source freshness | Request identity, abort state, current scope, session revision and parent revision gate completion. A new file invalidates the old preview before even validating its replacement and resets the camera lifetime. QR/image/paste input invalidates the same parent revision. Pins and build profile are included in scope; clear, scope change and unmount discard work. The app-lock omission is repaired as described above. |
| Close/reopen and hidden-page behavior | The input watches containing disclosures and invalidates on hidden-document events. Completion checks actual visibility and consumes queued close mutation records. Pay independently consumes close records before staging or confirmation. These guards address close/reopen cycles even if native toggle events coalesce; actual supported-browser ordering remains unqualified here. |
| Secret/error flows | `PaymentRequestFileError` has fixed messages with no cause, input, filename or parsed payload. The input/download components convert arbitrary exceptions to fixed catalog text. Existing invoice errors use `captureUserMessage`, not raw exception strings. No new logging, import history, analytics, content-bearing URL or sensitive filename is added. |
| Download cleanup | The component uses the generic filename, `application/json`, and the existing helper. `Common.tsx:95–113` removes the anchor and revokes the URL on throwing append/click, and schedules revocation after successful initiation. It makes no claim that the filesystem actually saved the file. Browser/download history and external copies are outside that cleanup. |
| User-facing privacy/trust claims | The new hint explains unchanged link access, no added encryption, separately shared passphrases and retained download/backup/sync copies. Preview wording distinguishes an embedded signature from merchant identity. The user guide says files neither prove payment nor enforce global single-use, and require trusting a compatible receiving deployment. Security-relevant added text is explicitly classified in `securityKeys.ts`. |

Dependency tracing covered `json.ts`, `base64url.ts`, `errors.ts`, the envelope/signature boundary, `Common.tsx`, `CameraImporter.tsx`, `session.ts`, `appLock.ts`, `AppShell.tsx`, `fragment.ts`, `invoiceCreate.ts`, `pay.ts`, `Disclosure.tsx`, and the browser error mapping. Cryptographic algorithms, custody policy, settlement and external-wallet behavior were not changed here and were not independently re-certified by this review.

## Checks actually executed by this reviewer

Read-only checks included:

```sh
git diff 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13
git diff --name-only f472030a1d9a993db1ba7a1a33f9a208c28ebf13 HEAD
git show --format=fuller d8274401 -- apps/web/src/components/PaymentRequestFileInput.tsx apps/web/src/views/Pay.tsx
git show --format=fuller c4c85727 -- apps/web/src/views/Pay.requestFile.test.tsx
git rev-parse d8274401 d8274401^{tree} c4c85727 HEAD
```

Source/line reads, relevant `rg` searches and branch/status inspection accompanied these checks. Initial HEAD was `057c922f2f9edee9edad0bef66d77f5da8f2f877`; its only tracked addition since the implementation was the audit handoff. One initial `git diff --stat` failed because the delegated message had a leading `to` in its baseline; the corrected baseline from the handoff was used before review. A source search for a nonexistent `lib/invoice.ts` also reported that missing path; the actual `invoiceCreate.ts` and envelope callers were subsequently inspected.

A single inline `node --input-type=module` assertion program completed with **exit 0 in approximately 0.8 seconds**. To reproduce its method, retrieve `packages/invoice-schema/src/requestFile.ts` with `git show f472030a1d9a993db1ba7a1a33f9a208c28ebf13:<path>`, transpile it in memory with the installed TypeScript compiler (ESNext modules, ES2022 target), resolve its unchanged relative delegates to this checkout's built invoice-schema `dist`, and import the resulting data URL. Retrieve `Common.tsx` from the same pin, extract the unmodified `downloadBlob` declaration with the TypeScript AST, transpile it, and run it with synthetic DOM/URL/timer objects. The program used Node strict assertions and no persistent test file.

Six check groups passed:

1. Exact fragment preservation, deterministic serialization and exactly three exported fields at decoded payload lengths 1, 2, 3, 4, 5, 127, 128, 255, 1,024, 16,383 and 16,384 bytes.
2. Acceptance of exactly 24 KiB including trailing allowed whitespace; refusal of one-byte overflow, a 16,385-byte envelope, UTF-8-byte overflow (`é` repeated beyond half the cap) and a leading BOM.
3. Closed wrapper/type/version rules, escaped duplicate/forbidden keys, canonical base64url trailing-bit/padding rules, and refusal to repair prefix/whitespace/full-URL fragments.
4. Fixed diagnostics containing neither a synthetic marker nor cause/path data; opaque `{}` payload accepted by transport and refused by `openFragment`; fatal malformed UTF-8 and preserved BOM decoder behavior.
5. Independently constructed local signed plain, bearer-encrypted and passphrase-protected invoices. File transport preserved the exact fragment/URL hash, digest, signature, terms and pinned verification. The passphrase request remained closed without its passphrase.
6. Download anchor removal and exactly one object-URL revocation on successful initiation, throwing append and throwing click. Success scheduled the existing 1,000 ms revocation callback; failure scheduled no callback.

The program's explicit fetch probe observed **zero calls**. It wrote no source/test file and contacted no endpoint. The tested new codec and existing helper were loaded from the exact pin; unchanged dependencies were loaded from built workspace output. Those boundaries are narrower than compiling and running the whole application. In particular, synthetic helper/platform checks are not native browser downloads, and the no-egress assessment also relies on source inspection rather than this probe alone.

No additional heavy run was launched for the repair. The changed lifecycle subscription was reviewed independently; its runtime regressions and the focused UI suite are coordinated by the specification worker.

## Remaining verification limits

- No browser was launched by this reviewer. The handoff/environment reports Chromium blocked before page creation by the runtime socket restriction. Six Playwright fixtures were collected, not executed. DOM tests and QR raster decoding do not replace browser execution.
- Prior author/QA counts were inspected as historical evidence, not independently rerun or adopted as conclusive qualification. The original full invoice-schema coverage run remains incomplete according to the handoff; a focused run failing package-wide thresholds is not a full coverage pass.
- The coordinator owns package/web typecheck, lint, build, full test/coverage gates and exact-head hosted checks. Their outcomes are separate from this source-review verdict.
- Actual browser download/import behavior, supported-browser disclosure/visibility ordering, and full/lean browser acceptance remain qualification gates even after the source finding closes.
- Wallet connection, real payments, external services, deployment and broader catalog capabilities were outside scope. Only local synthetic data was used.

The original finding is retained above for provenance. Its source repair is verified at `d82744017594267d9511e46beaf19e5842fb8317`; qualification limits remain open until backed by their own source-pinned execution evidence.

## Final catalog follow-up — `e543d25f`

Independently reviewed commit `e543d25fc7f3b65460518f4b3df4c513d34a1215`, tree
`e96e7876585150032a26ccf0947ea724b070c3ee`, against the reviewed app-lock repair
`d82744017594267d9511e46beaf19e5842fb8317`.

**Source-review verdict extends to this final catalog checkpoint: acceptable within the reviewed scope; no new privacy/security finding.** The diff contains only 15 added message lines in each of `apps/web/locales/ar.json`, `es.json` and `ja.json`. All 45 additions are exact copies of the existing English request-file messages. They fill catalog entries without changing their security meaning or claiming native-language review.

### Independent comparisons actually executed

This reviewer inspected `git show --format=fuller e543d25fc7f3b65460518f4b3df4c513d34a1215` for the three locale files and compared the complete changed-path list and numstat from `d8274401` to `e543d25f`. A lightweight inline `node --input-type=module` comparison used `git show <pin>:<path>` and Node strict assertions; it completed with **exit 0 in approximately 0.09 seconds**. It verified:

- Exactly those three locale files changed, with 15 additions and no removals each.
- Each locale adds exactly the 15 `requestFile.*` keys present in the English source; each added value equals that source string exactly.
- Each locale's 2,253 pre-existing message values remain unchanged. The resulting catalog contains 2,268 messages.
- All non-message metadata remains unchanged. Removing only the new `requestFile.*` lines from each final raw file reproduces the complete original file bytes, including metadata and formatting.
- The English source, `securityKeys.ts`, `translator.ts` and `languages.ts` are byte-identical between the two checkpoints. The complete `apps/web/src` tree is also identical: `b3259c56364053c6e736e8c3e3169fdd02c6c39e` at both pins. No runtime TypeScript or security-review digest file changed.

### Review and trust behavior

The seven new security-classified messages keep their original wording about unchanged link access, no additional encryption, separate passphrases, retained copies, local reading, explicit review and fixed failures. The eight neutral control/status labels likewise use the exact English text. No request is reclassified as an authenticated seller, verified payment or reviewed translation.

`languages.ts:46–54` still has an empty registry of reviewed non-English locales. `translator.ts:66–87` still restricts security text to registry-reviewed layers and the bundled English source; catalog metadata cannot approve a translation. Consequently, adding English values to machine-drafted locale files does not promote those locales or bypass the security-text fallback policy. Existing locale metadata continues to state that native review has not occurred. These additions are English fallbacks, not evidence of completed Arabic, Spanish or Japanese translation review.

### Subsequent coordinated UI evidence

After the initial report, this reviewer inspected the specification worker's saved logs and status records at `evidence/spec-app-lock-green.{log,json}` and `evidence/spec-combined-dom.{log,json}`. Both records are pinned to `d82744017594267d9511e46beaf19e5842fb8317` and record exit 0. The targeted app-lock run reports 4 passed with 13 excluded by its name filter; the full five-file focused run reports 114/114 passed, including all four lock cases. Vitest reports 26.50 seconds for that combined run. These are inspected results executed by the specification worker, not additional executions by this reviewer.

No heavy tests or browser runs were launched for this catalog review. The source-only comparison does not independently certify the full i18n gate, package coverage, static build, actual browser behavior or later hosted qualification. Those remain coordinator-owned evidence, separate from this final source-review verdict.
