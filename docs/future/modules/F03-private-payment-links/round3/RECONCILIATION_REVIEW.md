# F03 current-main reconciliation: independent integration review

Reviewer: `f03_main_reconciliation_review`, with independent read-only `standards_axis`
and `spec_axis` source reviews. Date: 2026-11-20.

**Verdict: zero actionable source-integration findings.** The reviewed merge preserves
the canonical F03 contribution and the incoming main contribution exactly, except for
the explicitly owned additive registry resolution. This source verdict does not qualify
native browsers, hosted CI, deployment, or a merge to main.

## Pinned inputs and result

| Role | Commit | Tree |
| --- | --- | --- |
| Common base | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` | `09649ff5d549a447fc67957c91dd254e7a53bfbd` |
| Canonical F03 input | `1de98f6c9371010883253450446e6f7294da84fa` | `bb171ebd63e38dce3496e3a7e84990c3dd020fc1` |
| Additive ownership claim | `192e9c08e43ab8c416fc4081d8c7d8e30f00b921` | `1965daf0fa8d86e2a7d04f742ee9e87bd4292c9d` |
| Incoming main | `aa3df1cb37274fae73af0ca957183c15c51b62d3` | `e451c83b735c06ccb9c62a073416be03ba3e7e03` |
| Reviewed merge | `f0968b9541dbd3234a6b0516023773845c04c4e4` | `6c3c65280f693bd6477218f10aff46b2a3d95e1f` |

The merge has the ownership commit and incoming main as its two parents, in that order.
Both canonical F03 and incoming main are ancestors. `git merge-base` independently
returns the stated common base. The ownership commit changes only
`docs/ai/ACTIVE_WORK.md` relative to canonical F03.

The inspected main delta is
`git diff 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...aa3df1cb37274fae73af0ca957183c15c51b62d3`.
It includes PR #306's five focused shared-helper repairs and PR #311's payment-URI
output-length guards. Review instructions were `AGENTS.md`, `docs/ai/WORKFLOW.md`,
`docs/ai/HANDOFF.md`, and the top reconciliation claim. F03's `SPEC.md`,
`QUALIFICATION.md`, `HANDOFF.md`, the developer specification, incoming handoffs,
and the unchanged browser workflow/configuration supplied the acceptance context.

## Exact union, ownership and preservation

I independently enumerated recursive Git trees, comparing each path's mode, object
type and blob ID. The 4,004 tracked paths in the reviewed merge equal canonical F03
plus the incoming main delta, with no discrepancy outside the owned registry.

- Main changes 24 paths relative to the common base; canonical F03 changes 85.
  Their only overlapping path is `docs/ai/ACTIVE_WORK.md`.
- All 23 nonregistry main changes equal their incoming main blobs. All 84
  nonregistry F03 changes equal their canonical F03 blobs. Unchanged paths also
  match the computed union; this was not merely a check of selected filenames.
- The repaired `apps/web/e2e/payment-request-file.spec.ts` is exactly blob
  `085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f` in both canonical F03 and the merge.
  Its associated memo-check handoff remains blob
  `11dcb8bdae172c1e85d7bfee51cab55a6cc49c59`.
- The entire invoice-schema package, F03 views/components/tests, locale additions,
  and feature documentation retain their canonical blobs. The incoming delta
  changes no dependency versions, lockfile, workflow, build/test configuration,
  coverage threshold, contract, or deployment setting.

For the registry check, let `base` be the common-base file and `claim` be the
ownership commit's file. `claim` ends with the exact `base` bytes. The merged file
is exactly `claim` with that terminal base removed, followed by the **entire**
incoming main file. This preserves the incoming prefix and its appended QA-02
claim, not just a shared suffix. The original base and the entire incoming main
registry each occur once. The three feature/ownership-prefix top-level sections
plus main's 21 sections produce exactly the expected 24-section heading multiset.
There are no conflict markers or lost/duplicated ownership entries.

`git diff --check aa3df1cb37274fae73af0ca957183c15c51b62d3 f0968b9541dbd3234a6b0516023773845c04c4e4`
passes. The same check from canonical F03 reports trailing whitespace at line 23
of `docs/handoffs/PAYMENT_URI_LENGTH_20261120.md`; those bytes are inherited
unchanged from incoming main. This is disclosed without modifying another
worker's preserved handoff.

## Standards

**0 findings: no documented standards violation or actionable code-smell finding
in the reviewed integration surface.** The independent standards reviewer checked
the pinned main delta against canonical F03 and the repository's documented
security invariants, package boundaries, minimal-change rule and regression-test
requirements. The nine production-file changes are narrow and have accompanying
behavioral tests.

- `apps/web/src/lib/buildProfile.ts:25` permits the wider profile only for a full
  build and recognized full/absent overrides. Existing valid combinations retain
  their behavior; unknown runtime values narrow to lean.
- `apps/web/src/lib/merchantIdentity.ts:28` retains the 128-character storage bound,
  exact shape/key checks and unavailable-on-error result while reusing the already
  exported strict JSON parser. F03 adds another consumer without changing that parser.
- `apps/web/src/lib/qrKinds.ts:179` and `:233` reject missing/inherited lookup keys
  before generating classes or handling policy. Valid invoice kinds and secret/
  bearer precedence remain unchanged.
- `apps/web/src/lib/qrMultipart.ts:20` refuses isolated surrogate code points
  before UTF-8 conversion. Canonical F03 fragments use ASCII/base64url; their bytes
  are unaffected, and valid paired Unicode remains supported.
- `apps/web/src/lib/scanSpam.ts:192` makes the incompleteness warning correspond
  to the displayed 30-day history. Announcement counts and privacy level are unchanged.
- `packages/payment-uri/src/query.ts:7` supplies one final encoded-length guard
  for Bitcoin, Solana and TRON builders. Successful strings are returned unchanged;
  oversized strings use the existing typed refusal. No additional abstraction or
  F03 transport rule was introduced.

The standards reviewer executed no tests/builds and made no edits or remote calls.
That source assessment and this tree verification remain distinct from runtime evidence.

**Standards total: 0 findings; no worst issue identified.**

## Spec

**0 actionable source findings** against F03's signed-invoice interchange scope.
The independent specification reviewer confirmed that the requirements to stage
the unchanged fragment through the existing preview/open boundary and preserve
lean/full restrictions remain intact (`SPEC.md:47` through `:53`).

`apps/web/src/views/Pay.tsx:240` retains canonical `openFragment`, signer inputs,
supported-invoice checks, stale-scope guards, and explicit opening. The merge does
not change the request-file codec, download component, file reader, app-lock
repair, or either view. The request-file path keeps its existing no-implicit-wallet,
no-navigation, and no-payment-before-confirmation boundary.

Shared changes do not transform signed envelopes. QR classification retains valid
invoice and bearer mappings; malformed Unicode refusal cannot change a valid
canonical fragment. Merchant-pin strict parsing preserves valid persisted pins
and labels ambiguous records unavailable. Profile resolution preserves normal
combinations while narrowing unknown values. Scan coverage disclosure is outside
invoice import and settlement.

The payment-URI output guards apply to Bitcoin/Solana/TRON builders, outside the
F03 fragment transport. Their web consumer already catches builder refusal and
shows the established error notice (`apps/web/src/components/PaymentRequestQr.tsx:63`).
The F03 URL interoperability test uses the unchanged invoice-link parser.

The spec requires affected-package tests/coverage/typecheck/lint/build, scoped web
tests, static build and honest browser qualification (`SPEC.md:75` through `:77`).
The proposed focused gates are appropriate with the consumer/lint refinements below.
No product repair or additional feature scope is indicated by this review.

The specification reviewer ran no tests/builds, changed no files and made no
remote mutations. Native browser qualification remains outstanding.

**Spec total: 0 findings; no worst issue identified.**

## Focused gate assessment and reviewed execution evidence

The coordinator owns serial execution. The appropriate current-merge combination is:

1. Original `@ghostpay/payment-uri` package tests with coverage and original
   thresholds, followed by its build, typecheck and lint. Rebuild the changed
   package before testing consumers that resolve its generated output.
2. Combined new main helper regressions and existing F03 DOM/QR integration
   cases. Include `PaymentRequestQr` and `qrClassify` consumer suites because they
   join the changed URI/QR helpers to the application. Scoped typed lint should
   cover the changed shared web files.
3. Full web typecheck and original full/lean Playwright collection. Collection
   verifies discoverability/configuration only; it does not execute browser assertions.
4. Exact published-head hosted checks, including both full/lean static builds,
   original bundle scans and native browser jobs. These remain required after
   integrating a newer main, regardless of results at either parent.

### Completed serial-gate evidence follow-up

I subsequently inspected `QUALIFICATION.md`, `evidence/verification-summary.json`,
all 15 command records and their actual logs. Each record identifies the reviewed
local merge `f0968b9541dbd3234a6b0516023773845c04c4e4` and tree
`6c3c65280f693bd6477218f10aff46b2a3d95e1f`; the commands, working directories,
explicit environments, elapsed times, log names and exit codes agree with the
summary. All 15 commands exited 0. The recorded execution intervals are serial,
and payment-URI was rebuilt before any web consumer check.

| Gate | Evidence inspected and actual result |
| --- | --- |
| Original payment-URI package suite | **206/206 tests in 4/4 files**. The unchanged inclusion covers the seven new boundary cases. Coverage: **97.5% statements, 97.09% branches, 100% functions, 99.08% lines**; original 95/90/95/95 thresholds remain intact. |
| Payment-URI build, typecheck and original lint | Three separate command records, each exit 0. |
| Combined shared-web, F03 and QR consumer regressions | **294/294 tests in 24/24 files**. Actual verbose result lines include `PaymentRequestQr`, both `qrClassify` suites and all three independent image-decoder cases for plain, bearer and passphrase invoices. |
| Whole-web TypeScript check | Exit 0, **20.448 seconds**, 1,024 MiB configured Node heap. |
| Scoped typed lint | Exit 0 for incoming shared-web source/tests and the unchanged F03 browser fixture. |
| Full and lean static Vite builds | Both exit 0, in **2.000** and **2.026 seconds** respectively. |
| Original bundle scanners | Both exit 0 immediately after their respective builds; **19 full files**, **17 lean files**. |
| Original Playwright collection | Both explicit `--list` commands exit 0 and list **six F03 cases per profile**. Native browser cases executed by these commands: **zero**. |
| Whitespace against actual main | Exit 0, consistent with the independent comparison above. |
| Existing repository secret scanner | Exit 0 with original scope; the script excludes `docs`, so this is not a credential audit of the reports. |

I independently base64-decoded and gzip-decompressed all 15 entries in
`evidence/original-console.json`. Each decompressed stream's exact byte count and
SHA-256 matches its archive entry, command record's `output_sha256`, and summary.
Each readable log matches its separate `normalized_log_sha256`. Reconstructing
the stated normalization independently produced exactly those readable bytes:
only ANSI terminal sequences, line-end padding and blank EOF padding were removed.
Empty streams remain empty. A normalized log was not compared against a raw hash.

Evidence snapshot hashes:

- Original-console archive: `91f1dd4eac63803672dcbb2949c40729507f899f46da449988a30065612011d0`.
- Verification summary: `f2df9ecb33f0a685c7845066fe60674d225cd6ada29924dc7071b83de42f6bb6`.
- Unchanged lockfile: `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

Both static inventories identify the reviewed source and have unique path counts
matching their scanner results. The remaining lean `dist` matches all 17 recorded
paths, sizes and hashes. The earlier full output was replaced by the lean build;
I verified its 19-file inventory and scanner record, without claiming an
independent rehash of full output that is no longer in `dist`. These remain local
static inventories, not browser-tested artifacts or deployment attestations.

The focused web run explicitly disabled coverage for that selected regression
combination. Its success does not replace unchanged full-web CI coverage. The
invoice-schema implementation is unchanged and its historical 813-test result is
not counted as a fresh run. Whole-web TypeScript, each Vite build and its original
scanner ran as separate serial stages; the report does not relabel them as literal
`npm run build` invocations. Build warnings remain in the raw captures.

The independent specification reviewer also checked the completed ledger and logs
and found no evidence overclaim. The added package/scoped lint, consumer suites
and both static stages close that review's earlier local-gate clarification.

Finally, a read-only GitHub Git-commit request independently confirms that API
object [`7c30385a44d1cac76e9137eea9fc522865ac53f0`](https://github.com/djshellshoxxx/GhostPay/commit/7c30385a44d1cac76e9137eea9fc522865ac53f0)
has exactly tree `6c3c65280f693bd6477218f10aff46b2a3d95e1f`, with canonical F03
`1de98f6c9371010883253450446e6f7294da84fa` and main
`aa3df1cb37274fae73af0ca957183c15c51b62d3` as its two parents. This verifies the
documented exact-tree identity map. It does not claim that a canonical branch ref
has moved or that a later documentation publication has passed hosted gates.

The coordinator executed these checks; this reviewer validated their evidence
without rerunning tests/builds. Native full/lean browser execution and actual
published-head required CI remain pending.

## Remaining qualification and evidence limits

Historical implementation audits and the separate round-2 qualification branch
remain useful source-pinned evidence. They do not establish native browser or CI
success on this merged source. Likewise, a result from canonical `1de98f6c` or
incoming main `aa3df1cb` does not transfer automatically to their union.

The unchanged `.github/workflows/ci.yml:242` matrix executes full and lean browser
jobs. `apps/web/playwright.config.ts:48` runs the original build and bundle scan
before preview. After successful browser execution, the workflow records the
actual checkout commit, PR head, tree, profile, lockfile digest and emitted-file
inventory (`ci.yml:271`). The PR merge checkout can differ from the branch head;
both identities must be recorded. Inspect all six individual F03 test results
per profile and the matching build records/artifacts before claiming qualification.
An artifact by itself does not prove which assertions passed.

The local Chromium launch restriction recorded in earlier work is not a passing
browser run. DOM tests, independent QR raster decoding, fixture collection and
static build output also do not establish native browser behavior. Any later
publication with different commit metadata must preserve the reviewed product
tree and record the local/published identity map. Recheck the expected canonical
branch head and actual main before publication; external branch state was not
queried by this read-only reviewer.

Only this assigned report was written. No application/test/configuration files
were edited, no index/commit/remote mutation was made, and no tests/builds or
dependency operations were run by this reviewer. Source reconciliation is
approved for continued qualification within the existing task; main merge,
deployment, real transactions and release certification are not asserted.
