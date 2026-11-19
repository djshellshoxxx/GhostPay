# Spec 18 completion: source-pinned baseline review

Reviewer: `recon_recovery`, independent read-only repository and hosted-evidence review.
Date: 2026-11-18. This records the starting source, not acceptance of subsequent changes.

## Source and integration decision

| Source | Exact commit | Observed state |
| --- | --- | --- |
| `main` | `dfc75ef2087fa6463ae59e0818abec01796c578d` | Canonical main |
| [PR #238](https://github.com/djshellshoxxx/GhostPay/pull/238), `integration/ghostpay-pages-completion-20261118` | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Open draft; mergeable, required checks failing |
| [PR #229](https://github.com/djshellshoxxx/GhostPay/pull/229), `chatgpt/ghostpay-recovery-review-20261118` | `18110015e99efbeb4f23d47cd88bd6f917010108` | Open draft, stacked on #213 |
| [PR #213](https://github.com/djshellshoxxx/GhostPay/pull/213), `claude/ghostpay-consolidation-9xhtxg-spec18` | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | Open draft; conflicts with current main |
| Hosted synthetic merge for #238 | `8393562a6b5657fc8b3f4410e5ddc3ad90772cf3` | Merge of `198aa5ba` into `dfc75ef2`; checkout identity read from job logs |

The [GitHub comparison](https://github.com/djshellshoxxx/GhostPay/compare/18110015e99efbeb4f23d47cd88bd6f917010108...198aa5baff22272453733a0f3dcfcac0e0994eec)
reports 85 commits ahead, zero behind, and merge base `18110015e99efbeb4f23d47cd88bd6f917010108`.
The selected base therefore already contains #213 and #229. Stack the completion PR on #238 without
merging that consolidation or replaying its existing recovery changes.

## Implemented baseline and remaining work

| Area | Existing source at `198aa5ba` | Completion requirement identified by this review |
| --- | --- | --- |
| Scope | Spec 18 covers ERC-5564 scheme-1 EVM EOAs only; excludes Bitcoin, AA, EIP-7702 and contract/policy accounts | Preserve this boundary |
| Single, bulk and master export | `StealthExportPayment.tsx`, `StealthExportArchive.tsx`, `StealthExportMaster.tsx`, `paymentKeyExport.ts` | Distinguish requested/generated/download-initiated, user-confirmed retention, and verified recovery |
| Formats and encryption | `stealth-export-portable.ts`: scrypt, AES-GCM, authenticated public header, domain separation, strict schemas and bounds | Reuse reviewed primitives; inspect malformed-input and cleanup boundaries |
| Recovery | `StealthExportRecovery.tsx` validates the complete export before presenting its public identities; master installation is a separate action | Add explicit verification-only behavior that promptly disposes decrypted keys and cannot authorize another file |
| Import consent | #229 binds delayed storage results to both operation controller and selected decrypted export | Preserve and extend cancellation/replacement regressions |
| Legacy backup verification | `SellerKeys.tsx` and `session.ts` distinguish unverified download from verified complete three-key keystore | Preserve; a Spec 18 master backup omits invoice signing and must not mark all session keys recoverable |
| Independent recovery | Separate Node crypto/noble script, reference vectors and local raw-key signing test | Execute fresh evidence for the final source; preserve no-network behavior and bounded input |
| Privacy and authority | Disclosures explain public authenticated headers, archive correlation, RPC code checks and viewing-plus-payment-key master authority | Preserve disclosures and English fallback |
| Lifecycle | `useExportOperation` cancels on lock, session change, close and unmount; orchestration rechecks after awaits | Extend to retention/verification and inspect payment identity changes |

All three encrypted export panels currently call `startDownload` and then display a success message.
The source has no explicit user-retention confirmation or verification state tied to that generated file.
Opening an export already validates it without automatic installation, but holds decrypted key boxes until close,
lock, navigation or session change. These are concrete gaps against the current handoff, not claims that the
existing cryptographic formats are absent.

## Fresh hosted results

The historical recovery handoff predates these finished jobs. The following evidence belongs to synthetic merge
`8393562a6b5657fc8b3f4410e5ddc3ad90772cf3`, not to new completion edits.

| Job | Actual result read from decoded log |
| --- | --- |
| [Full desktop Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615/job/135045141007) | All 6 `stealth-export.spec.ts` tests passed. Whole suite: 83 passed, 1 failed. |
| [Lean desktop Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615/job/135045141456) | All 6 `stealth-export.spec.ts` tests passed. Whole suite: 71 passed, 1 failed. |
| [Web unit/coverage](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615/job/135045140902) | 2,958 passed, 1 failed, 1 skipped; one unhandled rejection. |
| [Workspace lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615/job/135045141025) | Failure: `packages/chain-adapters/src/payments.bulkCancellation.test.ts:21`, `require-await`. |
| [Remaining workspaces and scripts, shard 0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615/job/135045140851) | Script suite: 240 passed, 3 failed; generated package map and web/relayer dependency review-closure expectations differ. |

The six successful recovery browser journeys cover public/encrypted/raw payment exports, correct reauthentication,
fresh-browser recovery and wrong passphrase, secret-leak guards, lock during export, and wipe during master KDF.
The unrelated failure in both complete browser suites is `e2e/app.spec.ts:115`, hostile invoice text rendering.
These are real desktop browser assertion results; they do not qualify later edits, physical devices or other engines.

### Feature-specific test defect to address

`apps/web/src/lib/paymentKeyExport.test.ts:114`, "discards the result and wipes the key when the keys are wiped while
the file is being sealed", waits for `captured` using `vi.waitFor`. Hosted credential decryption does not reach the
mocked seal function before that polling deadline. The test exits and teardown changes the session; the still-pending
export later rejects with "Seller keys changed during this action. Try again." without an attached handler.

Replace that scheduling assumption with an explicit deferred signal from the mocked seal boundary, attach rejection
handling immediately, and release/settle the pending work in cleanup. Preserve the cancellation and zeroization
assertions; increasing a timeout does not repair the test lifecycle.

## Inherited gates and limitations

Fresh check metadata reports success for typecheck, contract suites, Slither, Echidna, Pages artifact-on-Anvil,
beta acceptance and native integration. It reports failure for lint, web tests, shard-0 tests, both complete browser
suites, CodeQL and strict Mythril. These inherited results remain separate from feature-specific completion.

One unresolved [#238 inline review](https://github.com/djshellshoxxx/GhostPay/pull/238/files) concerns
`apps/web/src/views/Settings.test.tsx:47`: CodeQL clear-text storage from a `SECRET` test value, code-scanning alert #34.
This reconnaissance neither changes scanner dispositions nor clears failed gates.

## Repository guidance checked

Read `AGENTS.md`, `CLAUDE.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, the canonical
Spec 18 and format reference, current recovery integration handoff, and independent recovery guide.
The generated package map lives at `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md`; no root `PACKAGE_MAP.md` exists.
Security invariants live under `.claude/skills/ghostpay-security-invariants/`.

Remote reconnaissance is read-only. No remote branch, PR, review, workflow or deployment was changed by this reviewer.
