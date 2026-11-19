# Complementary Spec 18 recovery reconciliation

## Scope and source identities

This candidate reconciles the complementary recovery behavior in two already published
branches. It does not replace their source-pinned evidence with a claim that this combined
candidate passed the same checks.

| Input | Source | Decision |
| --- | --- | --- |
| PR #238 | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Existing consolidation ancestry retained through #239. |
| PR #239 | `4a1b181c89e02ee564b5568d4b4b8d689f5e42c5` | Base: retain atomic session replacement, generated-ciphertext retry, verification state invalidation, and deterministic real-crypto synchronization. |
| PR #240 | `38d69832ddc58ec27a19c00dbe3c89347c577495` | Recover BOM-byte refusals, event-time before-unload custody checks, and complementary browser acceptance cases. |
| Focused BOM source | `032c42fc3d5e52d8428a7907775835b5d1ed3704` | Source of the strict ASCII-byte checks and actual-file regressions. |
| Ownership claim | `a848be30` | New isolated branch `integration/ghostpay-recovery-reconciled-20261119`; both source branches remain unchanged. |
| Reconciled product/test commit | `3110611e4a49d2b3f426fc0b770a0823109ac3d4` | Nine web files changed; no dependency, contract, gate, or deployment changes. |

The source PR heads were reread from GitHub before editing. Main was observed at
`e454de6abfefda70d82784fafc1d8949b277c334` when this lane was assigned. The root
coordinator owns any later publication, main reconciliation, required CI and merge.

The root published the reviewed product candidate as draft
[PR #260](https://github.com/djshellshoxxx/GhostPay/pull/260), stacked on #239.
GitHub Git Data API publication preserves the exact local trees:

| Local commit | Published commit | Identical complete tree |
| --- | --- | --- |
| `a848be30` | `1b76c84622f61ad5638856608f8c0d5ae606b425` | `fe247c5bdbda23dcf8e33025ba0db0b5e88ee31d` |
| `3110611e4a49d2b3f426fc0b770a0823109ac3d4` | `789e63501c1628d602006dbd324a36f8a9c50d71` | `e8c79567504010c91d86655711899e1751133498` |

This publication does not merge the unqualified #238/#239 ancestors into main. It
starts the source candidate's hosted checks while local validation proceeds.

## Recovered behavior

`File.text()` removes a UTF-8 byte-order mark. Previously, a modified file could be
accepted after normalization even though the independent strict decoder rejected its
bytes. Recovery now requires the selected file's byte length to equal its ASCII text
length before opening or verifying. Saved-download verification requires both the
expected ASCII byte count and exact generated text. The portable codec continues to
reject other invalid characters and malformed data. The checks happen before the KDF.

The before-unload handler now applies to every loaded session. At the event it checks
whether keys are still loaded and whether a complete external copy is verified. A
browser-local vault alone does not suppress the warning: another tab could delete that
vault without updating this tab's cached custody summary. External-copy verification
is read at the event even when it did not change the cached React summary.

The #239 retry panel remains intact. A blocked download keeps its generated ciphertext,
and retrying does not repeat key derivation or export. Verification still becomes stale
after a passphrase edit. Replacement still stages all keys before clearing the existing
session. The sealing-barrier test and real-KDF promise observers remain intact.

## Acceptance coverage

The combined test changes retain existing assertions and add or recover:

- Actual BOM bytes rejected by both recovery actions before keys can be installed or
  marked verified; existing wallet identity and custody remain unchanged.
- BOM-prefixed saved downloads rejected before verification or backup-success status.
- Cross-tab local-vault deletion still triggers an unload warning.
- Newly verified external backups immediately suppress that warning, even without a
  changed cached custody summary; a newly generated invoice-signing key still needs
  its own recoverable copy.
- Full/lean browser cases for real BOM files, master restoration with renewed
  replacement consent, keyboard-operated file selection, and explicit acceptance of
  the expected before-unload prompt in the sweep reload journey.
- The #239 blocked-download retry browser test is retained alongside the additional
  #240 cases. The combined Spec 18 file contains ten cases.

## Validation and independent review

The independent `security_audit` agent reviewed `a848be30..3110611e` read-only and
found no scoped blocker in the byte checks, event-time custody check, retained retry
and consent tests, or new browser assertions. The reviewer independently ran `git diff
--check` successfully and called out the #256 integration requirement below. This is
an AI-assisted source review, not an external audit or runtime test result.

The five newly recovered behavioral regressions now have executed red/green evidence:

| Source and scope | Executed result |
| --- | --- |
| Unchanged #239 runtime with the five new tests | **5 failed**, 0 passed, 34 other cases deselected by the name filter; exit 1. |
| Reconciled `3110611e` runtime with the same five tests | **5 passed**, 0 failed, 34 other cases deselected by the same name filter; exit 0. All three selected files passed. |
| Secret scan | Passed. |
| External-action pin check | Passed: 113 references. |
| Diff hygiene and independent source review | Passed; no scoped source blocker. |
| Broader 12-file recovery/session attempt | Terminated with exit 137 before a final aggregate report; no pass claimed. |

Both test commands retained `--maxWorkers=1 --no-file-parallelism`, the repository's
test isolation, real cryptography, assertions, KDF costs and timeouts. The final run
used a 256 MiB V8 heap cap. Its 286-second wall time was dominated by transform/import
startup; the test reporter assigns 2% to assertions. A concurrent resource snapshot
reported load averages 48.48/47.75/34.21, but the cause of the earlier process kills
is not established. No product failure is inferred from exit 137.

The source identities, exact commands, individual test outcomes and environment limits
are retained in the [machine-readable receipt](recovery-reconciliation-20261119/validation.json).

Monorepo `npm ci` and an isolated web-scoped attempt terminated with exit 137. A reduced frozen dependency environment
was reconstructed sequentially from 288 cached tarballs whose SHA-512 hashes match
the source lockfile. Twenty-four other-platform packages were excluded; five absent
optional WASM fallback packages remain absent. No install script ran, no dependency
version was resolved anew, and repository dependency manifests/lockfile are unchanged.
The complete repository installation is therefore unqualified. Focused tests use
Node 24.22.3, Vitest 5.1.0 and TypeScript 5.9.3 from this documented environment.

The original serial library-build attempt was killed during metadata-hardening after
six earlier library compilations. All nineteen dependency libraries were then emitted
using temporary `tsc --noCheck --declaration false` solely to run the runtime tests.
No repository build, test, lint, coverage or release script was changed. This diagnostic
emission is not a typecheck or production-build pass. Full frozen-installation, typecheck,
lint, coverage, full/lean browser and combined hosted gates remain required.

The five runtime regressions are qualified within this stated diagnostic environment.
No broader test, browser, whole-candidate, main-merge or release qualification is claimed.

## Required later integration

PR #256 (`df0d70de5b297391af5f1f2b786800a93b02ce52` at review) independently changes
`AppShell` and session suspension. Its before-unload listener is limited to a retained,
suspended session. Preserve this candidate's broader loaded-session and event-time
external-copy checks when composing the two branches, while retaining #256's
suspension/authorization rules. Keep #239's transactional key installation when
combining the separate `session.ts` edits. Run the combined lifecycle and recovery
tests after resolving those conflicts.

The inherited #238 CI issues have other owners or existing corrections: the key-export
wipe-test race is already repaired in both recovery branches; the hostile-text browser
navigation and chain-adapter lint corrections are in #246. Existing Mythril and release
requirements remain independent blockers. Do not weaken them for this reconciliation.
