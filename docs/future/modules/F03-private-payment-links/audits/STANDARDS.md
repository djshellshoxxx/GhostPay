# F03 standards audit

Date: 2026-11-20 UTC. Reviewer: independent worker `f03_audit_standards`.

## Review checkpoint and verdict

- Branch: `future/f03-private-payment-links`.
- Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Reviewed implementation: `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
- Reviewed implementation tree: `387690ae4248ed35da78b359e84ba09c9b7a25b4`.
- Source-review verdict: **PASS — no concrete standards defect identified in the selected file-interchange change.**
- Findings: **0 hard documented-standard violations; 0 actionable maintainability findings.**

This is a source review, not completed browser, coverage, CI, deployment or release qualification.
The worktree initially had documentation checkpoint `057c922f2f9edee9edad0bef66d77f5da8f2f877`;
its only committed difference from the reviewed implementation was the fresh-audit handoff.
A subsequent comparison of all relevant production, test and catalog paths with the implementation
checkpoint produced no differences. Coordinator evidence and ownership updates were left untouched.

## Summary

The change follows the repository's static-browser scope and package boundaries. The transport
codec reuses strict JSON and canonical base64url parsing, exposes a small readonly interface and
fixed diagnostics, and leaves invoice authentication to the existing parser. The browser addition
uses the established download helper and the existing explicit preview/open/payment-review path.
It introduces no dependency, server, contract, transaction-policy or cryptographic implementation
changes.

The regression tests are substantive: they distinguish wrapper acceptance from invoice
authentication, preserve real signed invoice terms across transports, decode actual QR images,
and exercise asynchronous replacement and cancellation. Browser fixtures cover actual file
download/upload and observable wallet, storage and network effects, but those fixtures were only
collected in the supplied evidence. DOM tests do not establish their browser results.

No mandatory source repair is requested by this lane. Complete the coordinator-owned verification
gates and consider the separate specification and defensive-security reports before describing
the feature as qualified. The verdict applies only to this selected signed-invoice file feature,
not every proposal in the concurrent F03 catalog.

## Standards applied

| Source | Applicable rule or convention |
| --- | --- |
| `AGENTS.md:6,9,12,15` | Static Pages scope; recorded ownership; minimal changes and regression evidence; honest verification reporting; source-pinned handoffs. |
| `docs/ai/WORKFLOW.md:3-8,14` | Scoped deliverable, coherent commits, targeted and applicable integration checks, explicit gaps, browser/static-release discipline. |
| `docs/ai/HANDOFF.md` | Template only; it asserts no current result and was not treated as evidence. |
| `packages/invoice-schema/README.md` | No UI/RPC/DOM dependencies in invoice-schema; strict transport handling; fixed typed errors; transport is separate from signature, signer trust and expiry. |
| `apps/web/README.md` | Client-side static application; distinguish mocked automation from browser behavior and release readiness. |
| `docs/future/modules/F03-private-payment-links/SPEC.md` and `CATALOG_RECONCILIATION.md` | Authoritative selected scope; preservation of existing invoice and payment boundaries; no whole-catalog completion claim. |
| Existing local source and tests | `Common.tsx`, `CameraImporter.tsx`, the pre-existing Pay import flow, session guards, invoice JSON/base64url/error helpers, and translation classification/fallback tests. |

The developer-specification package and secret-handling invariants and the existing i18n policy
were also inspected. Historical design proposals were not used to override current source or the
explicit F03 scope. No additional repository-owned `CONTRIBUTING.md` or `CODING_STANDARDS.md` was
found in the inspected feature directories; the coordinator's discovery likewise found none
outside third-party code. Tool-enforced style issues were excluded from this audit.

The supplied smell baseline was used as a heuristic only: naming, duplication, data clumps,
primitive obsession, repeated switches, excessive delegation, misplaced responsibilities,
speculative abstractions, inheritance and scattered change. No concrete repair-worthy example
was established. In particular, reusing the existing QR-named import boundary avoids a second
authentication/opening path; it does not justify a broad rename or abstraction merely to satisfy
a smell checklist. Parent and child cancellation guards protect different lifetimes.

## Reviewed scope

All 23 paths in the pinned implementation diff were reviewed, including the new documentation.
Production and test scope was:

| Area | Files and integration reviewed |
| --- | --- |
| Public codec | `packages/invoice-schema/src/requestFile.ts`, `src/index.ts`, package README; strict JSON, base64url, envelope-limit and error dependencies. |
| Codec regression and interchange | `requestFile.test.ts`, `requestFile.interop.test.ts`; real signing/envelope fixtures and existing `openFragment`/`parseFragment` responsibilities. |
| Browser components | `PaymentRequestDownload.tsx`, `PaymentRequestFileInput.tsx`, and both component test files; actual `Common.downloadText`/`downloadBlob`, `Field`, `Notice` and session-guard behavior. |
| Existing-view integration | Changed `CreateInvoice.tsx` and `Pay.tsx` hunks plus surrounding creation, import, scope, preview and explicit-opening logic; `Pay.requestFile.test.tsx` and the two updated selectors in `Pay.invoiceQr.test.tsx`. |
| Independent QR path | `apps/web/src/lib/requestFileInterop.test.ts`, actual QR matrix/raster/decoder/assembler calls and existing invoice-creation fixtures. |
| Browser acceptance fixtures | `apps/web/e2e/payment-request-file.spec.ts`, existing e2e helpers and Playwright configuration. |
| Localization and verification configuration | English additions, `securityKeys.ts`, existing classification and fallback tests, package scripts, Vitest coverage configuration and web build configuration. |

## Findings

### Hard documented-standard violations

**None identified.** There is no source finding requiring a severity, repair or follow-up patch
from this lane. Incomplete execution gates remain qualification limits, recorded below; they
must not be converted into a claim that the required checks passed.

### Maintainability and test-quality judgments

**No actionable smell identified.** The new behavior has clear owning modules and narrow callers.
The codec performs transport validation without reconstructing invoices. Browser integration
preserves the established parser and explicit review boundary. The small `ImportRequest` object
groups the lifetime state that must travel together, and the callback contract documents its
untrusted fragment and cancellation signal. No unused extension framework was introduced.

Test quality supports the following conclusions from source inspection:

- `requestFile.test.ts:38-189` covers exact wrapper output, real ordinary/bearer/passphrase
  fragments, strict schema and encoding, byte/character boundaries, and fixed secret-free errors.
  Its deliberately non-invoice `{}` fragment is appropriate for testing the transport-only API;
  a separate test requires invoice opening to reject it.
- `requestFile.interop.test.ts:38-115` compares independently parsed URL and file results against
  the original signed invoice, digest and signature, and checks signer policy, wrong passphrases,
  changed signed fields and noncanonical envelopes. It does not assume successful wrapper parsing
  means successful authentication.
- `requestFileInterop.test.ts:12-85` rasterizes real generated QR modules and uses the independent
  decoder plus multipart assembly before comparing all transports. It does not use an echo
  decoder as interoperability evidence.
- `PaymentRequestFileInput.test.tsx:37-237` controls native read timing to cover replacement,
  invalid replacement, same-file retry, size/UTF-8 errors, parent revisions, session/scope changes,
  coalesced disclosure changes, hidden pages and unmount. The `arrayBuffer` substitution is
  explicitly identified as a DOM-runtime boundary.
- `Pay.requestFile.test.tsx:51-211` exercises real ordinary/bearer/passphrase invoices through the
  application with service effects observed, both QR/file supersession directions, repeated
  invoices, invalidation, pin-policy changes and the lean invoice restriction. The original QR
  suite retains its behavior assertions; only the shared clear-button label changed.
- `PaymentRequestDownload.test.tsx:10-54` tests explicit action, the original fragment and generic
  filename, current-invoice replacement, and safe failure/retry. The helper is mocked there;
  actual browser download behavior is reserved for the e2e fixture.
- `payment-request-file.spec.ts:73-200` defines six browser cases for real download/upload,
  passphrase behavior, malformed replacements and retry, successive invoices, and an invalid
  signature remaining unable to proceed. Local routing and wallet probes keep fixtures synthetic.
  These are useful tests whose execution remains unverified in this lane.

No coverage thresholds, exclusions, package scripts or original tests were weakened by this diff.
The translation additions use the existing source catalog and classification registry; the
existing exhaustive census and draft-fallback loops automatically include new classified keys.

## Commands and actual outcomes

Commands were run from `/workspace/scratch/63789860705e/GhostPay`. The pinned comparison was
`git diff 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13`;
its content was inspected in path-scoped batches and full-file reads. The reference and scope
checks included:

```text
git rev-parse 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5 f472030a1d9a993db1ba7a1a33f9a208c28ebf13 f472030a1d9a993db1ba7a1a33f9a208c28ebf13^{tree}
git diff --stat 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13
git diff --name-only 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13
git log 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5..f472030a1d9a993db1ba7a1a33f9a208c28ebf13 --oneline
git diff --name-status f472030a1d9a993db1ba7a1a33f9a208c28ebf13 -- apps/web/src apps/web/e2e apps/web/locales packages/invoice-schema/src packages/invoice-schema/README.md
git branch --show-current
git status --short
```

References resolved to the exact SHAs/tree above. The nonempty diff contains four coherent commits:
scope/ownership (`4cd83af1`), codec (`0915891a`), independent interoperability tests (`3bfedf6b`),
and browser integration (`f472030a`). The feature-path comparison produced no output, establishing
that inspected worktree source matched the pinned implementation. `rg`, `cat`, `sed` and `nl -ba`
were used for source and standards inspection. The i18n documents reside under
`docs/remote/usability/`; the web Vitest settings reside in `apps/web/vite.config.ts`.

**No test runner, coverage run, build, typecheck, linter, browser, security scanner or live network
test was executed by this standards lane.** The coordinator reserved broad verification for
serial execution. No production file, test, dependency, index or remote branch was modified by
this reviewer; this report is the only authored file.

## Remaining verification limits

The following is supplied evidence, not independently rerun evidence from this reviewer:

- `docs/ai/prompts/F03_AUDIT_HANDOFF.md:29-35` records codec 74/74, independent actual-QR
  interchange 3/3, and combined DOM/original-QR/translation tests 110/110. It records six collected
  Playwright fixtures without browser execution.
- That handoff records incomplete full-package coverage attempts, including a bounded 180-second
  attempt. Focused codec coverage did not meet package-wide thresholds because the rest of the
  package was unexercised. This supplies neither a complete coverage pass nor proof that the
  feature causes a package-wide coverage regression.
- `ENVIRONMENT.md` records Chromium failing before page creation because its process-singleton
  socket was denied. No actual browser flow, downloaded-file observation, screenshot, browser
  network trace, device check or assistive-technology audit is established by that run.
- The coordinator owns original affected-package tests/coverage, typecheck/lint, static builds,
  security checks and current-head hosted CI. Their source-pinned results must accompany this
  report; this review does not predict or supersede them.

**Final source verdict: standards pass at `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`, with
execution qualification still separate and incomplete in the evidence supplied to this lane.**

## Independent follow-up: app-lock repair

Date: 2026-11-20 UTC. This section preserves the original frozen-review conclusion above and
records a separate review of the subsequent repair. The specification and privacy lanes identified
one shared behavioral omission, `F03-SPEC-01` / `F03-PS-01`: imports could survive an app lock when
seller-session identity remained unchanged. The original standards verdict does not supersede
that finding or imply that the frozen implementation had no behavioral defects.

| Checkpoint | Exact source |
| --- | --- |
| Test-only regression predecessor | `c4c85727de2198482c939f18ac0a8088c9f82da5` |
| Reviewed repair | `d82744017594267d9511e46beaf19e5842fb8317` |
| Repair tree | `98058025f99c75327b7abc55a9587d5c9997d546` |
| Follow-up verdict | **PASS — the minimal repair follows local lifecycle conventions; no new standards or maintainability finding.** |

### Independent source assessment

The production repair adds four lines solely to
`apps/web/src/components/PaymentRequestFileInput.tsx`: the `subscribeAppLock` import at line 5,
the rationale and subscription at lines 74-75, and unsubscribe at line 88. It connects the existing
`invalidate` callback to the existing application signal; it introduces no new event system,
public API, dependency or duplicated cancellation implementation.

The repair is appropriate to the actual ownership boundary:

- `AppShell.tsx:145-165` emits the lock signal before it decides whether seller-session keys can
  be removed. Absent sessions and retained sole-copy keys therefore need this signal independently
  of session-version guards.
- `PaymentRequestFileInput.tsx:42-45,71-93` aborts the pending controller, clears the reader's
  status, and invokes the latest parent callback. Subscription and unsubscription belong to the
  same effect, so normal cleanup and effect re-creation do not retain obsolete listeners.
- In the actual caller, `Pay.tsx:207-218` synchronously increments the import revision, clears the
  staged preview/error and resets the camera lifetime. Existing completion and confirmation
  checks at `240-270` reject the old revision. Thus already completed reads with a displayed
  preview are invalidated as well as reads still waiting for bytes.
- `appLock.ts:14-29` already supplies the notification and cleanup contract. Existing
  `SellerKeys.tsx:150-160` and `SecretBackup.tsx:162` use the same subscription convention.

This satisfies the minimal-change and behavioral-regression guidance in `AGENTS.md:12` and
`WORKFLOW.md:5-6`. No broad refactor or additional source repair is requested by this lane.

### Four regression cases reviewed

`Pay.requestFile.test.tsx:171-211` adds two parameterized tests: a pending read and an already
staged preview, each with an absent or retained seller session. They use real signed invoice
fixtures and the public `notifyAppLock('idle')` signal. The explicit unchanged-session assertion
prevents ordinary session clearing from accidentally satisfying the scenario. A deferred native
read makes the late-result ordering observable. Both tests require the import controls/status to
disappear, payment review to remain absent, and wallet/RPC/manifest/fetch spies to remain untouched.

These are focused behavioral regressions, not assertions that the implementation called its new
subscription function. They exercise the application lock signal directly; they do not execute
the real idle timer, native browser file picker or browser download path. The specification lane's
reported four-case RED outcome is independent runtime evidence from that lane, not a test run by
this reviewer. GREEN and combined-suite results must retain their own reviewer and source pins.

### Follow-up commands and limits

Read-only `git show` inspected both commits and their two changed files. Additional checks were:

```text
git rev-parse HEAD d82744017594267d9511e46beaf19e5842fb8317 c4c85727
git rev-parse d82744017594267d9511e46beaf19e5842fb8317^{tree}
git diff --name-status f472030a1d9a993db1ba7a1a33f9a208c28ebf13..d82744017594267d9511e46beaf19e5842fb8317
git diff --name-status d82744017594267d9511e46beaf19e5842fb8317 -- apps/web/src/components/PaymentRequestFileInput.tsx apps/web/src/views/Pay.requestFile.test.tsx
git diff --check c4c85727de2198482c939f18ac0a8088c9f82da5..d82744017594267d9511e46beaf19e5842fb8317
```

The worktree matched the repair for both changed paths; the whitespace check exited 0 with no
output. Relevant app-lock, caller, effect-cleanup and fixture source was inspected with `rg`,
`sed` and `nl -ba`. No runtime test or heavy gate was run for this follow-up. Only this report
was changed by the standards reviewer. Original browser, full-coverage and release-qualification
limits remain separate from this **source-only standards pass at `d8274401`**.

## Qualification follow-up: complete draft locale catalogs

Date: 2026-11-20 UTC. The coordinator's broader catalog gate subsequently found **45 missing-key
errors**: all 15 new `requestFile.*` source keys were absent from each of `ar.json`, `es.json` and
`ja.json`. Its original output is retained in `evidence/locale-catalog.log` (4 catalogs, 45 errors,
409 warnings). This is a later automated qualification result; the earlier source-review records
above remain preserved. Their PASS conclusions did not establish a passing catalog gate.

The coordinator recorded the bounded ownership extension in `docs/ai/ACTIVE_WORK.md` before edits.
This reviewer then authored the catalog repair. Independent review of this authored delta belongs
to the separate specification/privacy reviewers; this section does not present self-review as an
independent audit.

### Bounded repair and conventions

Only `apps/web/locales/{ar,es,ja}.json:8-22` changed: each gained the same 15 keys with values copied
exactly from `apps/web/locales/en.json`, for **45 added lines and no removed lines**. These are
explicit English fallbacks. No Arabic, Spanish or Japanese translation or native-speaker review
is claimed.

All three `_meta.status` values remain `machine-drafted: needs native review`. The existing review
registry at `apps/web/src/i18n/languages.ts:46-56` remains unchanged, as do security-key
classification, review digests and `translator.ts:65-87`. Security messages therefore retain the
existing source-English/reviewed-locale boundary; the repair grants no translation authority.
Existing identical-to-English draft entries establish the local fallback convention, while
`scripts/i18n/check.mjs` treats those entries as warnings and missing keys as errors.

The repair was made against `d82744017594267d9511e46beaf19e5842fb8317`; no commit was authored or
staged by this worker. Exact resulting file identities for coordinator review are:

| File | Git blob after repair |
| --- | --- |
| `apps/web/locales/ar.json` | `1556d84a2ef2fd744368dfe11acc1d8f2838f043` |
| `apps/web/locales/es.json` | `8da429e3d53d05f26077b0a792b7b0e9f6dc6e8f` |
| `apps/web/locales/ja.json` | `192984fc8c0d13e013e219b2e912b78fba23af3c` |

### Executed verification and outcome

A bounded Node assertion script first compared each original locale file byte-for-byte with the
reviewed repair commit to avoid overwriting pre-existing edits. It constructed only the new message
block, then checked the parsed values and complete surrounding text before and after writing:

- All **2,253 pre-existing messages per locale** retain their exact values.
- Top-level fields and all metadata retain their exact values.
- Each locale's 15 added key/value pairs exactly equal the English `requestFile.*` set.
- Removing only the inserted block restores the complete original file byte-for-byte, including
  formatting, ordering and trailing newline.

The following lightweight gate was executed through a Node subprocess; no full test/build/coverage
runner was launched:

```text
node scripts/i18n/check.mjs
i18n check: 4 catalogs, 0 errors, 454 warnings
exit code: 0
```

A comparison with the original gate log confirmed that all **409 existing warning lines are
unchanged**. The additional **45 warnings** are exactly the expected `requestFile.*` entries
marked `identical to English (untranslated?)`. The normal catalog gate passes; no `--strict` pass
is claimed. `git diff --check -- apps/web/locales/ar.json apps/web/locales/es.json
apps/web/locales/ja.json` also exited 0, and the scoped i18n source/tooling diff was empty.

**Qualification result: the 45 catalog-completeness errors are repaired, with existing translations,
metadata and review authority preserved.** The authored change still needs the coordinator's
commit and separate review. Other runtime, browser, full-coverage and release gates remain outside
this bounded catalog result.
