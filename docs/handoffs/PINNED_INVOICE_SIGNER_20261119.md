# Pinned invoice signer completion

## Integration boundary

This work completes the optional signer-trust workflow on the integration source of PR #238. It does not approve a
GhostPay release. The reviewable change is [PR #243](https://github.com/djshellshoxxx/GhostPay/pull/243), branch
`chatgpt/ghostpay-pinned-signer-completion-20261119`, based on `198aa5baff22272453733a0f3dcfcac0e0994eec`.
PR #234's head `5e9e7be70399a9818579cf87bd494e013e25d4f9` is already an ancestor of that base; its history and working
parser policy were retained.

The initial published implementation is `8ecd46d67445e20ed35189ee0eec00798ab09316`, complete tree
`c3bef9a8fddafa859806a4c3def4fc13162a3b64`. The independent review documents the identical-tree mapping from the
locally tested commit `0b43637f44638739d84ba31652aba6ac391ab166`. A subsequent test-only correction removes four
unsupported Testing Library `exact` options and explicitly awaits the mock-completion microtask in four async `act`
callbacks. Literal accessible-name equality, assertions and runtime source remain unchanged. This document and the
expanded persistence specification are documentation-only additions. The later integration followup keeps signer
status announcements polite without duplicating the existing rejection alert, and separates browser expiry fixtures
from the independently enforced idle-lock deadline. Cryptographic verification and payment-authority rules are
unchanged by that followup.

The PR description is the final qualification ledger: it records the exact later source commit, hosted run/job links,
commands, tool versions, results and outstanding gates after these documentation files are committed. A source review
or an authored browser test is not counted as an executed pass. Earlier evidence below retains its actual boundary.

## Initial implementation matrix and delivered changes

| Acceptance area | State on inspected #238 base | Delivered work / preserved implementation |
|---|---|---|
| secp256k1 verification and canonical bytes | Already implemented with protocol and independent-fixture tests | Retained compact low-s signatures, signing domain, plaintext canonicalization and existing approved crypto libraries |
| Optional shared parser pin policy | Already implemented by #234 | Retained `pinnedSigners` / `requirePinnedSigner`; added explicit selected-seller use in Pay |
| Integrity versus trust | Partially implemented; generic verification metadata and global Settings pin set existed | Added distinct, text-based checking, pinned, unpinned, mismatch, invalid, missing, unsupported, malformed and unavailable states |
| Named seller identity and replacement | Missing from invoice inspection | Added opt-in local named pins, independently sourced full-key input, review/confirmation, replacement and removal confirmation |
| Multiple independent sellers | Partially implemented as an unordered global set | A named selection authenticates only that seller's exact key; other saved identities cannot satisfy it |
| Persistence and concurrent pin writes | Missing for the named workflow | Strict bounded records, canonical on-curve keys, Web Locks, expected-old-key checks, retained revisions and actual-storage rereads |
| Lock and session transitions | Existing async guards did not cover completed trust or no-seller-key app locks | Bind results/actions to invoice, selection generation, fresh pin snapshot, session generation and app-lock epoch |
| Late UI mutation completion | Newly identified during independent review | Operation tokens prevent old writes from clearing newer editors or restoring obsolete selections |
| Tamper coverage across supported formats | Implemented but incomplete for the requested cross-format field matrix | Added 53 protocol status/tamper regressions with real signatures and independently constructed encrypted containers |
| Offline inspection | Existing local parser; UI inspection was coupled to other view state | Signer panel works while deployment information is pending; browser acceptance observes HTTP, WebSocket and wallet access |
| Browser acceptance | Missing for the named workflow | Added eight cases exercised by existing full/lean Chromium configurations; actual results belong to the PR ledger |
| Documentation | Shared parser policy documented, named trust workflow absent | Added user guide, payload/trust/persistence specification and independent security review |
| Repository release qualification | Existing integration failures | Preserved all gates; classify inherited and introduced failures separately in the PR ledger |

## Behavior and security decisions

An invoice signature establishes integrity under the advertised key. It establishes the chosen seller relationship
only when that authenticated key equals the independently established key for the explicitly selected seller. Saving
several sellers never makes all of them interchangeable. No selected named seller preserves the legacy Settings trust
policy for compatibility; a valid signature without any applicable pin remains unpinned.

Pin creation, replacement and removal require deliberate confirmation. The UI displays the full proposed key and the
previous key during replacement. It never automatically pins an invoice's claimed signer. Names/keys persist locally;
the selected expectation is scoped to the active Pay view and is not restored as implicit trust on reload. Losing or
removing a selected pin leaves that expectation unavailable until the user explicitly changes it.

Results are associated with their verification scope, so render-time checks hide obsolete results before effect
cleanup. Current-authority checks reread persisted pins before asynchronous results or payment actions can commit.
Named-pin mismatch blocks payment-context preparation before its RPC work and is carried through preparation and
final wallet dispatch. Once a request has reached a wallet, this feature cannot retract it; existing payment journals
and transaction evidence remain authoritative for that outcome.

There is no signature-algorithm, domain, invoice-format, contract, backend, custody or recovery-policy change. The
verification path adds no network, analytics or wallet requirement. Pin data contains public keys, user-entered labels
and a local revision, not invoice bodies or secrets. Same-origin JavaScript and browser-profile integrity remain trust
boundaries; local pins are not tamper-proof against an actor controlling that origin/profile.

## Regression evidence recorded before final hosted qualification

| Source / scope | Actual execution | Result |
|---|---|---|
| Integration-base protocol before the defect fixes | New status/tamper regression file | 10 failed, 43 passed; establishes the missing/unavailable/version defects |
| Updated protocol working tree, before publication | Same 53-test file | 53 passed |
| Updated ux-core working tree, before publication | Existing full coverage command | 120 passed; original thresholds retained; 100% statements/lines/functions, 97.94% branches |
| Updated named-pin store working tree | 41 store tests and targeted coverage | 41 passed; 97.31% statements, 95.12% branches, 100% functions, 99.13% lines |
| Integration-base Pay before lifecycle fix | Three new no-key lock/session regressions | All three failed, then passed after the fix |
| Final local implementation `0b43637f…`, tree identical to published `8ecd46d…` | Four feature files with Node 22.23.4 / Vitest 5.1.0 | 84 passed, zero failed; coverage disabled for this bounded run |
| Same exact local implementation; independent reviewer | Component and status-helper subset | 32 passed; these overlap the 84, and are not additional unique tests |
| Published `8ecd46d…` with only the four unsupported test options removed | Pay signer file, Node 22.23.4 / Vitest 5.1.0 | 11 passed; source review confirmed name matching and assertions unchanged |
| Published `8ecd46d…` plus the two test-only corrections, subsequently committed locally as `324b0f49` | Same four feature files; Node 22.23.4 / Vitest 5.1.0, 768 MiB heap | 84 passed in 54.24 seconds; coverage disabled; no runtime delta |
| Hosted merge `16b4746df4b38d22cd19eff9af80676011d45e97`, complete tree identical to `8ecd46d…` | Full invoice-schema suite with coverage; Node 22.23.4, npm 10.9.9, Vitest 5.1.0 | 14 files / 784 tests passed; 98.02% statements, 97.54% branches, 100% functions, 99.28% lines; original thresholds retained |
| Hosted merge `9d1e363241f855424179cfca763305cfe978d206`, complete tree identical to `d3a2fbfe…` | Full Chromium suite; Playwright 1.65.1 | All seven original signer cases passed; broader suite 83 passed, 8 failed, 1 existing profile skip; introduced integration failures described below, not hidden |
| Local `d7937fe5ac16a1ea4f57abee8e0d3416b05bbf35`; all four executed feature files match that commit, with later browser/docs edits outside the test inputs | Four feature files after the live-announcement correction; Node 22.23.4 / Vitest 5.1.0, 768 MiB heap | 86/86 passed in 34.44 seconds; zero failures; targeted run without coverage |

The 84-test command, from `apps/web`, was:

```sh
node --max-old-space-size=1024 ../../node_modules/vitest/vitest.mjs run \
  src/views/Pay.signer.test.tsx \
  src/components/InvoiceSignerVerification.test.tsx \
  src/lib/invoiceVerification.test.ts \
  src/lib/invoiceSignerPins.test.ts \
  --coverage=false --maxWorkers=1
```

The recorded Node binary was `/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node`. The independent
review retains its exact command and raw-log digest. Earlier working-tree runs are development evidence, not claims
that a final commit passed all checks. The final hosted suite is required to qualify the published source.

Local full web typechecking was terminated by the executor with no TypeScript diagnostics, including a monitored
Node 22 run killed at approximately 840,100 KiB RSS. Local Chromium failed before application execution because
`socket()` was denied by the executor. Hosted CI is used for the complete typecheck, build and real Chromium runs;
neither local environment failure is represented as a pass.

The first hosted run on `8ecd46d…` found four TS2353 errors in `Pay.signer.test.tsx`: role queries do not support an
`exact` property. Pages and both browser builds stopped on those errors before browser assertions. The test-only
correction retains the literal `name: 'Continue'` matching and all assertions. Full ESLint also found four async `act`
callbacks without an explicit `await` in the new component tests, plus the known inherited chain-adapter error. Each
new callback now awaits its immediate mock-completion microtask using the existing deferred-test pattern; no rule is
suppressed. Final hosted results are recorded in the PR description rather than inferred from these corrections.

The first hosted protocol pass is available in [CI run 44471007297, rest-2 job 135380236541](https://github.com/djshellshoxxx/GhostPay/actions/runs/44471007297/job/135380236541).
Git object inspection verified that the merge checkout has exactly the initial published implementation's tree. The
test-only followup and documentation do not change invoice-schema or ux-core source. Local full-coverage attempts on
Node 24 and Node 22 were interrupted after passphrase-case timeouts (three and six respectively); the Node 22
passphrase file reported 824.888 seconds. Their cause was not established, and neither is counted as a pass. The
duplicate Node 22 run was stopped with exit 130 after the complete hosted result became available.

## Independent findings and fixes

The [independent review](agents/PINNED_SIGNER_SECURITY_REVIEW_20261119.md) distinguishes source findings from executed
tests. It found and followed fixes for stale verification on lock/session changes, old pin-scope authority, late pin
mutation completion, Unicode-normalized seller selection, and malformed-versus-unsupported paste diagnostics. The
reviewer found no unresolved feature-specific source blocker in the reviewed implementation. Its independent 32-test
execution covers component/helper behavior; it does not claim independent full browser, protocol or payment execution.

Confirmed lifecycle defects received regression coverage. Tests include pending and completed verification at lock,
session transitions, rapid invoice changes, pin removal during verification, changing a pin while preparation is
pending, and persisted pin changes before queued storage events immediately before wallet dispatch. Store/component
tests cover unavailable/malformed storage, duplicate properties, noncanonical keys, contention, old-key conflicts,
mutation cancellation, Unicode names, unmount and cross-tab notifications. Browser tests cover reload, explicit
confirmation, selected-seller mismatch, offline inspection, failure privacy, passphrase verification and keyboard/mobile
use.

### Integration followup: live announcements and clock isolation

Hosted testing of `d3a2fbfe54a933173296699b68d7a0b482df68aa` passed the Pages build/site verification and the full
repository build/guard/audit job. Its Pages Anvil journey passed 15 cases and failed the expiry-at-send assertion.
Source review identified that the fixture jumped wall time by more than an hour after mounting. The send interaction
therefore crossed the existing 15-minute idle deadline, and Pay's new required idle-lock handler cleared the verified
invoice before the expected expiry-specific error. This was not evidence that an expired payment reached a wallet.

The corrected Pages fixture mounts a separate payer context at invoice expiry minus 60 seconds, then advances to
expiry plus 30 seconds before Send. The equivalent Core journey uses its already separate payer context. All existing
expiry, wallet, nonce, RPC and on-chain assertions are retained. A separate eighth signer browser case crosses the
actual idle deadline while the invoice remains unexpired, proves the no-seller-session branch, asserts trust/payment
controls are cleared and no wallet calls occurred, and reopens the invoice for fresh verification. No idle timeout or
production guard is disabled. An independent reviewer checked the fixture changes; their executed outcome must be
read from the final PR ledger.

The initial hosted full web log also exposed four existing Pay tests failing because the new negative signer status
used an assertive `alert` inside its already polite live status, alongside Pay's existing detailed rejection alert.
Two new component regressions first failed on that nested alert. The fix changes only the status Notice's negative
presentation to a warning inside the polite status region; explicit pin-mutation failures and the existing detailed
rejection remain alerts. All signer/payment authority checks are unchanged. The complete component file then passed
14 tests, and four unchanged existing Pay rejection/final-send-expiry tests passed. Neither assertion nor timeout was
relaxed. The independent review records this as PIN-06.

These followup runs used Node 22.23.4 and Vitest 5.1.0: component 14/14 in 10.52 seconds, targeted Pay 4/4 in
27.78 seconds (62 unrelated cases not selected). A first isolated cold-start expiry run failed while waiting for
Continue before reaching the expiry assertion; a duplicate full Pay investigation run was interrupted with exit 130.
Those attempts are not reported as passes. Final full-suite qualification remains the hosted check on the final
published source.

## Changed-file map

| Area | Files |
|---|---|
| Protocol behavior | `packages/invoice-schema/src/{envelope,errors}.ts` |
| Protocol regressions | `packages/invoice-schema/src/{envelope,independent,passphrase,pinnedSigner,verificationStatus}.test.ts` |
| Shared error guidance | `packages/ux-core/src/errors.ts`, `packages/ux-core/src/errors.test.ts`, `apps/web/src/lib/errors.ts` |
| Pin collection | `apps/web/src/lib/invoiceSignerPins.ts`, matching test |
| Status classification | `apps/web/src/lib/invoiceVerification.ts`, matching test |
| Inspection controls | `apps/web/src/components/InvoiceSignerVerification.tsx`, matching test |
| Pay lifecycle and authority | `apps/web/src/views/Pay.tsx`, `apps/web/src/views/Pay.signer.test.tsx` |
| Browser acceptance | `apps/web/e2e/invoice-signer.spec.ts`; expiry-fixture corrections in `core-journey.spec.ts` and `pages-devnet.spec.ts` |
| Localization | `apps/web/locales/{en,es,ja,ar}.json`, `apps/web/src/i18n/securityKeys.ts` |
| Documentation | `docs/user/invoice-signer-pins.md`, `docs/specs/INVOICE_SIGNER_VERIFICATION.md`, this handoff, independent review, `docs/ai/ACTIVE_WORK.md`, invoice-schema `README.md` / `DEVIATIONS.md` |

## Consolidation and remaining release gates

Main advanced during this work to `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. PR #241's network-isolation source is
not contained in #238/#243. It has no runtime/test overlap with the signer delta and introduces no dependency required
by this feature. Keep this narrow stack on the inspected #238 base; eventual consolidation must preserve #241 and
qualify the combined browser/network behavior. The independent review records the exact ancestry comparison.

The active recovery work in #239/#240 does not change the signer parser or Pay implementation. Locale catalogs and
`securityKeys.ts` have additive coordination overlap and must retain both workstreams' keys. No recovery implementation
was replaced, and no contracts were modified.

Known failures on the inspected #238 integration include the recovery `paymentKeyExport.test.ts` session race, one
chain-adapter test lint error, stale package-map / dependency-closure checks, and the existing `app.spec.ts` navigation
to `about:blank` in full/lean browser runs. Strict Mythril findings remain a separate release gate. These are historical
base observations, not predictions that a particular later run will fail identically; the final PR ledger reports
what actually occurred on its exact source.

No assertion, coverage threshold, security allowlist or CI requirement is relaxed. Merge readiness depends on the
actual final checks and integration-owner decisions about inherited blockers. This task does not merge main, deploy
Pages or publish a release.
