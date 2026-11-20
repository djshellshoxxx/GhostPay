# Pinned invoice signer: independent security review

## Status and source boundary

Reviewer: `integration_review`, a separate AI-assisted reviewer from the implementation coordinator and the
protocol/pin-store workers. This is an independent source review and bounded regression execution within this
workstream, not an external audit.

- Repository: `djshellshoxxx/GhostPay`.
- Task branch: `chatgpt/ghostpay-pinned-signer-completion-20261119`.
- Reviewed integration base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238).
- PR #234 head `5e9e7be70399a9818579cf87bd494e013e25d4f9` is an ancestor of this base. Its existing shared parser
  policy is preserved; GitHub comparison returned 86 commits ahead and zero behind.
- Initial phase: source/document inspection of the coordinator's uncommitted implementation on that base; no tests,
  builds, lint or browser checks were run during that phase.
- Final inspected/tested implementation: `0b43637f44638739d84ba31652aba6ac391ab166`.
- Final implementation tree: `c3bef9a8fddafa859806a4c3def4fc13162a3b64`.
- Independent final execution: the two component/helper test files below, **32 tests passed**, exit 0. No full-suite,
  coverage, build, lint, protocol-suite or browser pass is claimed by this reviewer.

### Publication mapping

[Draft PR #243](https://github.com/djshellshoxxx/GhostPay/pull/243) was independently read back with base
`198aa5baff22272453733a0f3dcfcac0e0994eec` and published head `8ecd46d67445e20ed35189ee0eec00798ab09316`.
Local Git objects confirm the publication changed commit identity without changing the complete source tree:

| Boundary | Locally inspected/tested commit | Published counterpart | Identical complete tree |
|---|---|---|---|
| Feature implementation | `0b43637f44638739d84ba31652aba6ac391ab166` | `8ecd46d67445e20ed35189ee0eec00798ab09316` | `c3bef9a8fddafa859806a4c3def4fc13162a3b64` |
| Protocol parent | `851203c1ea6dc721e355c12dcabcb83c1fef7b3d` | `f922e3cdf92d50b26ee3574ef7234e5e716d4768` | `bd43478034667eb115d9c48f92cbff54d8ca3f9c` |

The independent execution remains attributed to the actual local commit on which it ran. Tree equivalence connects
that evidence to the published implementation; it is not a separate test run or evidence of hosted CI success. This
review document was added afterwards and is not present in the two implementation trees above.

The initial review identified concrete lifecycle and control-state gaps. The reviewed revisions contain source fixes
for those mechanisms. The final source recheck found no unresolved feature-specific source blocker; independent
component/helper execution corroborated PIN-03, PIN-04 and PIN-05. Final Pay/store/protocol execution and browser
qualification remain separately owned and must be read from their exact-source records. No cryptographic
signature-verification or payment-authorization bypass was found in the inspected revisions; this is a bounded
assessment, not an assertion that all acceptance criteria or release gates passed.

Post-publication qualification subsequently exposed the introduced accessibility/integration regression PIN-06 below.
Its narrow correction and the expiry/idle-lock browser fixtures were independently source-reviewed in the working
tree. The coordinator's subsequent execution is attributed separately below; final hosted qualification is pending.

## Scope

Reviewed the existing Pay parser, QR intake, passphrase, receipt and payment lifecycles; the new
`InvoiceSignerVerification.tsx`, `invoiceSignerPins.ts` and `invoiceVerification.ts`; the invoice-schema error and
envelope changes; proposed regression tests; and the user/developer documentation. Followed payment guards through
`payExec.ts` and `wallet.ts` to the final wallet-provider invocation.

Repository instructions were read from `AGENTS.md`, `CLAUDE.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` and the
repository security-invariants skill. The review preserves existing canonical/signature formats, manifest and payment
checks, recovery work, browser privacy controls and release gates.

## Findings and disposition

| ID | Severity / type | Source-reviewed mechanism | Source disposition | Execution disposition |
|---|---|---|---|---|
| PIN-01 | Medium: stale verification | Pay originally relied on the seller-session revision but did not subscribe to app lock. AppShell can notify an idle lock and return without changing the session revision when no seller keys exist. A pending or displayed verification could survive that lock. | Pay now subscribes to app lock and session changes, advances a local verification epoch, clears invoice/passphrase state and invalidates pending operations. | Execute the pending and completed no-seller-session lock cases and the completed-session-change case in `Pay.signer.test.tsx` on the final source. |
| PIN-02 | Medium: stale authority | Completed parsed state was not associated with its session/pin source. Ordinary and passphrase callbacks depended on effect cleanup for pin changes; their synchronous guards did not compare a current pin snapshot. | Parsed results carry a scope; render-time scope equality hides obsolete results. Commit/action guards check current scope, session generation, lock epoch and a fresh persisted named-pin snapshot. | Execute deferred parsing, pin replacement/removal, seller change, session transition, unmount and second-tab cases. |
| PIN-03 | Medium: obsolete mutation completion | The initial pin component checked only mount state after awaiting a write, then unconditionally cleared editor/busy/confirmation state. Its old auto-selection could also revive after seller A to B to A. | An operation token now gates completion; identity scope includes a selection revision. New edit/confirm/cancel/remove actions invalidate old operations. | Final-source component regressions for a later identity's editor, same-invoice storage update/new editing and unmount passed independently. Parent selection-revision wiring was source-reviewed. |
| PIN-04 | Low: wrong selected identity | The store normalized labels to NFC, but the component initially auto-selected the original NFD label after save. A stored `Caf\u00e9` pin could be selected as the unavailable spelling `Cafe\u0301`. | The component normalizes the label before confirmation and selection. | Final-source NFC addition/auto-selection regression passed independently. |
| PIN-05 | Low: misleading diagnostic | The first paste fallback treated supported-v1 malformed whitespace as unsupported, and classified an unsupported full-link version differently from a bare fragment. | A narrower positive-unsupported-version helper accounts for a full-link prefix. | Five final-source rejected-paste classification cases passed independently. |
| PIN-06 | Medium: competing error announcements / introduced integration regression | A negative signer-status `Notice` used `kind="error"` inside an existing polite `role="status"` region. `Notice` emits `role="alert"` for that kind, so Pay's real invoice rejection and the supplementary status created two assertive alerts. Existing rejection tests could not uniquely identify the rejection. | The status-only negative branch now uses `kind="warn"`, preserving the visible failure text within its polite status region. Explicit pin-mutation errors remain assertive; signer/payment authority is unchanged. | Coordinator reports the two new component cases failing before the one-line correction and all 14 component cases passing afterwards; four selected unchanged Pay rejection/final-send-expiry cases also passed. Independent review of this follow-up is source-only. Final hosted qualification remains pending. |

PIN-01 and PIN-02 refer to the inspected pre-feature Pay implementation and its missing guarantees under this task's
expanded acceptance criteria. PIN-03 and PIN-04 were found in the new uncommitted implementation and corrected before
publication. The reviewer did not execute a failing test for these findings in this phase. The coordinator reports
three initial lock/session cases failing before its fix and passing afterwards; that is **author-reported execution**,
not an independent reviewer run, and does not substitute for final-source records.

## Security assessment by boundary

### Signature, signer and canonical payload

The parser still verifies the existing compact, low-s secp256k1 signature over the canonical full plaintext invoice.
The signing domain, supported invoice bodies, encrypted envelope formats and approved cryptographic libraries are
unchanged. The new errors distinguish missing signatures and unavailable/interrupted local crypto operations without
introducing an unsigned success result. Default parsing may return an invalid-signature review result; Pay continues
to block it. `requirePinnedSigner` still rejects invalid signatures before valid-but-unpinned keys.

The proposed protocol regression matrix includes real signatures and independently encrypted ciphertext for plaintext,
bearer-key and passphrase modes. It changes recipient meta-address, chain, token, amount, signer, expiration, nonce,
metadata and v2 gas-buffer policy. Source inspection confirms these fields remain in the signed plaintext. Signature
integrity does not establish payment, a unique invoice payment, a legal identity, honesty or current expiry; those
limitations are documented.

No signature substitution, algorithm downgrade, cross-chain authentication or canonicalization bypass was identified
in the reviewed delta. Passing test evidence for these statements remains separate from this source assessment.

### Named pins and explicit authority

Selecting one named seller supplies that seller's single key, rather than the entire address book. A different saved
seller's valid signature cannot satisfy the selected requirement. Removing or losing the selected record preserves an
unavailable selection, so the requirement is not silently disabled. Choosing no expected named seller is explicit;
legacy global Settings pins remain compatible and are described separately in the user guide.

Adding/replacing a key requires a review step and a separate confirmation; replacement displays the prior and proposed
full keys. The workflow asks for an independently obtained public key and does not silently promote an invoice's
self-asserted signer to trusted status. A valid signature with no applicable pin remains an integrity-only result.

### Persistence, malformed state and concurrent writes

The new collection contains only bounded local labels and valid canonical compressed public keys. The parser rejects
duplicate properties, extra fields, unsupported versions, invalid points, duplicate normalized names, invalid
revisions and oversized records. Corrupt storage is unavailable, not imported as trusted data or silently repaired.

Origin Web Locks serialize cooperating writers. Each mutation checks the displayed old key and the caller's current
authority before persistence. The browser caller's authority includes a fresh stored snapshot. A persisted revision
changes even across removal and readdition of the same key, so an ordinary same-key cycle does not restore an obsolete
snapshot. Direct storage reads catch changes before queued storage events arrive. Events cause a fresh read; their
`newValue` is never installed as authority. The store also preserves notification when a guard read precedes the event.

Web Locks and storage availability failures refuse writes. A post-write readback checks the saved bytes. The remaining
trust boundary is same-origin JavaScript and the browser profile: a malicious origin or actor that rewrites both code
and local storage can replace pins. Documentation states this limitation and does not claim tamper-proof storage.

### Async verification, payment and post-broadcast state

The current scope binds invoice, selected seller, pin snapshot, seller-session generation, app-lock generation and
selection revision. QR, ordinary and passphrase parsing use that authority. Pin mutation completion has its own
operation identity so an older result cannot clear a newer editor. Final regression evidence must cover both layers.

A selected-pin mismatch gates `refreshContext()` before payment-context RPC work. `assertCurrentInvoice()` and
`authorityMatches()` recheck live signer authority. The existing payment/permit/approval functions carry the guard
through asynchronous boundaries into `sendViaWallet()`/`signTypedDataViaWallet()`. The transaction path asserts
authority immediately before provider invocation with no intervening await. Once a request has been handed to a
wallet, cancellation cannot retract it; existing submitted/unknown-outcome journals and returned hashes remain the
source of payment-outcome evidence.

### Network and secret exposure

The added pin store, classifier and confirmation component introduce no HTTP, RPC, analytics or wallet calls. Signature
verification remains local. The signer panel can render independently of deployment-manifest completion. Existing
payment preparation remains distinct and retains its manifest/network requirements; a source review does not replace
browser request observation.

No private signing keys enter verification. New public error classifications avoid raw exception text. User-selected
names and public keys are persisted in plaintext only after explicit confirmation, and the guide explains the
relationship-privacy implications. No new invoice/passphrase persistence, telemetry, server service, contract change
or custody requirement was identified in this feature delta.

## Documentation integrity review

The user guide accurately distinguishes saved pins from the session-only expected-seller selection, describes
replacement/removal confirmation, explains legacy-global compatibility, names Web Locks/storage limitations, and
limits offline claims to an already loaded application. The technical specification identifies the complete signed
payload, current encryption identifiers versus signing algorithm, canonicalization and payment-policy boundaries.

Two small inconsistencies were sent to the coordinator and corrected in the subsequently inspected working tree:

1. The technical table now says **no applicable pin**, because no named selection can still match a legacy Settings
   pin. The user guide also states the compatibility rule explicitly.
2. The guide states a 64-Unicode-code-point label limit, while the initial input `maxLength={64}` counts UTF-16 code
   units. The input now permits 128 UTF-16 units while the store retains the 64-code-point validation, admitting a
   complete 64-astral-character label without relaxing the persisted limit.

These details were rechecked against the frozen implementation. Documentation does not assert an external audit,
overall release readiness or executed checks that are not recorded in qualification evidence.

## Independent final qualification

The reviewer re-read the final component/helper/Pay delta and the new payment-preparation and pre-dispatch regressions
at `0b43637f44638739d84ba31652aba6ac391ab166`. The root coordinator executes the latter tests; this reviewer executed
only the requested bounded component/helper subset. Author/reviewer reruns overlap and are not additional unique
coverage.

Working directory: `apps/web`. Actual command:

```sh
/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node --max-old-space-size=768 ../../node_modules/vitest/vitest.mjs run src/components/InvoiceSignerVerification.test.tsx src/lib/invoiceVerification.test.ts --coverage=false --maxWorkers=1
```

| Execution field | Observed value |
|---|---|
| Source before and after execution | `0b43637f44638739d84ba31652aba6ac391ab166` |
| Source tree | `c3bef9a8fddafa859806a4c3def4fc13162a3b64` |
| Node | `v22.23.4` |
| Vitest | `5.1.0`, linux-x64 |
| Result | Exit 0; 2 files passed; **32 tests passed**, zero failed |
| Runner-reported duration | 14.77 seconds |
| Coverage | Disabled for this targeted run; no coverage threshold or assertion was changed |
| Raw log | `/workspace/scratch/a2c11df1526c/invoice-signer-independent-ui.log` |
| Raw log SHA-256 | `c01595ecf98a4ab59463a35390e5e2ec5e8e753504aade3a32a132f2f1327f16` |

The complete useful result lines are retained here even if the temporary raw log is no longer present:

```text
 RUN  v5.1.0 /workspace/scratch/a2c11df1526c/GhostPay/apps/web

 Test Files  2 passed (2)
      Tests  32 passed (32)
   Start at  22:14:17
   Duration  14.77s (environment 43%, tests 26%, import 21%, transform 10%)
```

The displayed start time is the runner's own output, not a separately established wall-clock date. The remaining raw
log lines are Node's experimental `EnvHttpProxyAgent` warnings and the runner's worker-reuse suggestion. Dependencies
were the existing local workspace installation; the reviewer did not rebuild packages or perform a clean install.
After execution, `git diff --name-only 0b43637f44638739d84ba31652aba6ac391ab166 -- apps/web/src apps/web/locales
apps/web/e2e packages/invoice-schema/src packages/ux-core/src` returned no paths, confirming those runtime/test inputs
had no working-tree delta from the recorded source.

| Qualification | Independent reviewer result |
|---|---|
| Final implementation commit / complete tree | Recorded above and read back before/after execution |
| Feature source recheck after final changes | Complete; no unresolved source-reviewed feature blocker identified |
| Pin component and status/helper tests | Independently executed: 32/32 passed |
| Pay lifecycle/payment integration tests | Source reviewed; final execution is coordinator-owned, not independently rerun here |
| Protocol/pin-store tests | Source reviewed; execution is recorded by their owners, not independently rerun here |
| Full/lean browser and network observation | No reviewer execution. Coordinator reports local browser launch blocked by socket `Operation not permitted`; hosted acceptance remains required |
| Merge/release readiness | Not established by this bounded review; require final integration checks and actual browser results |

Existing #238 failures are inherited integration evidence, not cleared by this feature review: recovery's
`paymentKeyExport.test.ts` session race, package-map/dependency-boundary checks, chain-adapter test lint, the full/lean
`about:blank` browser failure, and strict Mythril. No test threshold, assertion, security allowlist or release gate is
relaxed by this record. The task does not authorize main merge, deployment or release.

## Main advanced during the workstream

The independently observed latest main, `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, is five commits beyond the initial
main `dfc75ef2087fa6463ae59e0818abec01796c578d`. Read-only Git ancestry and GitHub comparisons identify these commits:

| Commit | Change | Relationship to reviewed integration #238 |
|---|---|---|
| `7109290b7e4f029c36d9743bde9fd664d1da5474` | #237: retain beta logs from the hidden state directory | Already an ancestor of #238; workflow and beta-log handoff blobs equal latest main |
| `fc992c2a1dc8dead9ad9cdb8e47d79bc16d34d92` | #241: harden unowned browser network boundaries | Not contained in #238 |
| `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2` | #241: typed lint fixes and isolation evidence | Not contained in #238 |
| `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` | Merge #241 | Not contained in #238 |
| `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` | Merge #237 | Merge commit not contained; #237 source change already is |

[Initial-main comparison](https://github.com/djshellshoxxx/GhostPay/compare/dfc75ef2087fa6463ae59e0818abec01796c578d...58d89b39b27a66454ebf392bcd35d5c68b57b2f8)
contains 20 changed files. [Integration-to-main ancestry comparison](https://github.com/djshellshoxxx/GhostPay/compare/198aa5baff22272453733a0f3dcfcac0e0994eec...58d89b39b27a66454ebf392bcd35d5c68b57b2f8)
is diverged: latest main has four unique commits, #238 has 86, and the merge base is `7109290b7e4f029c36d9743bde9fd664d1da5474`.

The #241 implementation tightens release-hash fetches, generic transport deadlines/cancellation/error sanitization,
and Solana/Tron RPC isolation. Its runtime/test files in #238 remain byte-identical to initial main or are absent.
Thus #238 does **not** already contain #241 under different commit identities. No #241 runtime/test path overlaps the
#243 signer delta; their sole shared modified path is the append-only coordination document `docs/ai/ACTIVE_WORK.md`.
Source inspection found no new #241 API or behavior on which local signature verification or named pin persistence
depends.

Recommendation: retain the narrow signer PR stacked on the exact #238 source that was inspected and tested. No
signer-specific import of #241 is necessary. The consolidation owner must preserve #241 when combining this stack
with main and qualify the combined browser/network behavior. This record does not characterize #238 or #243 as
containing current main, and it does not claim that the combined source has already been tested. This reviewer made
no merge, branch, runtime or main modification for this assessment.

## Post-publication test typing correction

After publication of `8ecd46d67445e20ed35189ee0eec00798ab09316`, the coordinator reported four hosted Pages `TS2353`
diagnostics for unsupported `exact: true` properties in `apps/web/src/views/Pay.signer.test.tsx`. The reviewer inspected
the uncommitted correction against that exact head: it removes only those four properties, retaining every literal
`name: 'Continue'`, assertion and interaction.

The installed `@testing-library/dom` version is `10.4.2`. Its `types/queries.d.ts` declares no `exact` member in
`ByRoleOptions`; `dist/queries/role.js` compares the computed accessible name through `matches()`, and the string
branch in `dist/matches.js` uses `normalizedText === String(matcher)`. Removing the unsupported property therefore
preserves exact accessible-name matching. This correction changes test typing only and does not relax an assertion,
payment guard or runtime behavior.

This follow-up was source inspection only: no tests, typecheck or browser run was repeated by the reviewer. The
32-test independent result above remains attributed to `0b43637f...` and its originally published identical tree;
it is not a run of the corrected test tree. The coordinator records the correction's published SHA and subsequent CI
results separately. Other hosted diagnostics and overall acceptance status are not cleared by this note.

## Post-publication component-test lint correction

The coordinator subsequently reported four new `require-await` diagnostics in
`apps/web/src/components/InvoiceSignerVerification.test.tsx`, alongside the inherited chain-adapter diagnostic. The
reviewer inspected the uncommitted follow-up against `8ecd46d67445e20ed35189ee0eec00798ab09316`: exactly four existing
async `act` callbacks now await `Promise.resolve()` after their confirmation click. They exercise immediately resolved
mock save, replacement, removal and mutation-error results. The explicit microtask yield keeps async completion within
the awaited `act` scope and matches the file's existing deferred-completion pattern.

The patch preserves all selectors, mocks, assertions and deferred-race tests; it adds no suppression, timeout,
production-code change or weakened gate. No unresolved source issue was identified in this narrow correction. The
reviewer did not rerun tests or lint. Because this changes a component test file included in the original independent
32-test run, that run remains evidence for its recorded original source only. The coordinator is rerunning all 84
feature tests on the corrected source and will record the published correction and final hosted qualification in the
PR body. The inherited lint failure and any other integration failures remain separate and are not cleared here.

## Post-publication alert and clock-fixture review

### PIN-06: supplementary signer status competed with invoice rejection

The coordinator identified four existing `Pay.test.tsx` failures in the earlier cancelled full-web run: wrong-passphrase
rejection, a signed invoice with an unrepresentable expiry, an oversized fragment and a non-invoice paste. Independent
source inspection confirms that their single-alert queries encountered the new supplementary signer alert alongside
Pay's rejection alert. `Common.tsx` assigns `role="alert"` to an error `Notice`; the signer component already wraps its
status in `role="status" aria-live="polite"`.

The reviewed runtime correction changes exactly the negative-status `Notice` branch from `error` to `warn`. It
retains the same status text and leaves the explicit pin-mutation failure alert intact. No signer classification,
selection, pin comparison, lifecycle invalidation or payment guard changes. The new component regression covers
`unavailable` and `malformed-invoice`, asserting a polite live region, no nested alert, preserved status text and the
single existing invoice-rejection alert. Existing Pay assertions were not changed.

Coordinator-reported local execution on the uncommitted correction:

| Check | Author-reported result | Reviewer boundary |
|---|---|---|
| Two new alert regressions before the runtime correction | 2/2 failed | Reported by coordinator; not independently executed |
| Complete component file after the correction | 14/14 passed; Node 22 / Vitest 5.1.0; 10.52 seconds | Source reviewed; execution reported by coordinator |
| Four selected unchanged Pay rejection/final-send-expiry cases | 4 passed; 27.78 seconds; `pay-rejection-expiry-green.log` | Source reviewed; execution reported by coordinator |
| Isolated cold-start expiry attempt | Failed before Continue appeared | Not counted as a pass or proof of an expiry-guard failure |
| Duplicate local full-Pay run | Interrupted, exit 130 | Not counted as completed qualification |

These results do not replace an actual completed hosted full-web run on the final candidate. The original independent
32-test run above is not attributed to this later component/runtime revision.

### Expiry and idle-lock are separate refusal boundaries

The reviewer independently retrieved [Pages Anvil job 135384582330](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472336589/job/135384582330)
for candidate `d3a2fbfe54a933173296699b68d7a0b482df68aa` (its synthetic merge `9d1e363241f855424179cfca763305cfe978d206`
has the same recorded tree). The log reports **15 passed, 1 failed**: the expiry-at-send case could not find its
expiry-specific message after advancing the mounted payer's clock by more than an hour. The log does not expose the
failure-page state, so the idle-lock diagnosis is source-supported rather than a direct observation of that page.

`AppShell.tsx` checks wall-clock and monotonic idle deadlines before accepting pointerdown activity; the default idle
limit in `settings.ts` is 15 minutes. A one-hour clock jump therefore activates the real idle-lock boundary. Pay's new
required lock subscriber invalidates its verification epoch and clears the invoice/parsed state, including when no
seller session exists. Its authority guards refuse an obsolete send and suppress obsolete result text. An expiry
message is not required to supersede that lock. No runtime defect was identified in this behavior.

The reviewed test-only changes to `pages-devnet.spec.ts` and `core-journey.spec.ts` start a fresh payer application at
invoice expiry minus 60 seconds and move to expiry plus 30 seconds after preparation. This 90-second transition
isolates the unchanged expiry guard without crossing the default idle deadline. Pages now uses an independent payer
context with the same RPC routing/preset, leaving the seller's and lagging payer's clocks independent; Core already
isolates payer profiles. All original expiry, wallet, journal, RPC and chain assertions remain.

The added `invoice-signer.spec.ts` idle case tests the other boundary explicitly: a fresh profile has no seller keys,
the invoice is demonstrably still unexpired, and a 16-minute wall-clock jump followed by a real navigation-button
pointerdown triggers the default idle lock. It requires the no-seller-session idle notice, removes old trusted status,
review and payment controls, retains the selected public pin, records zero wallet requests, and requires the invoice
to be reopened and checked before trust returns. The coordinator corrected the new case's initial expectation:
Continue is disabled before the lock and after reopening because this profile has no RPC-backed payment context;
signer trust alone cannot authorize payment. After lock the Continue control must disappear entirely. No RPC/settings
mock was added, and the test records zero wallet calls before the clock jump as well. This bounds the case to local
trust/lifecycle invalidation, separate from the prepared-payment expiry fixtures. Source inspection found no blocker in these three browser-test
changes. This reviewer made no production or test edits and performed no browser execution for this follow-up.
