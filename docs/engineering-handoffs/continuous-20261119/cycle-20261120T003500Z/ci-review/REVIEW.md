# Scoped CI and consolidation review

Reviewer: `/root/ci_reconcile`. Completed: 2026-11-20 00:43:58 UTC. This is evidence for the existing coordinator handoff, not a new progress ledger.

## Scope and source identities

Read-only Git ancestry/blob comparison, workflow-source inspection, exact-head hosted metadata, and decisive job logs. This worker did not execute tests, retry CI, alter source or remote branches, submit approvals, merge, deploy, or invoke paid workers.

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Canonical [PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278): `d74af79ebabdc8cead843361c3497b46d8c421f9`; tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`.
- Machine-readable exact heads, per-file Git blob identities, ancestry, run/job IDs, source trees and bounded log excerpts: [evidence.json](evidence.json).
- Hosted states below are a timestamped snapshot; the coordinator must refresh running jobs before final claims.

## All eleven requested candidate dispositions

| PR | Reviewed head | Evidence against #278 |
| --- | --- | --- |
| [#258](https://github.com/djshellshoxxx/GhostPay/pull/258) | `84398a79` | Ancestor; camera runtime and visibility test blobs identical. |
| [#261](https://github.com/djshellshoxxx/GhostPay/pull/261) | `61f2b372` | Lock script and test extracted identically; original head is not an ancestor. Full documentation-delta integration is not asserted. |
| [#265](https://github.com/djshellshoxxx/GhostPay/pull/265) | `c591b540` | Ancestor; candidate adds descriptor snapshots, accessor rejection, adversarial controls and lint cleanup. |
| [#268](https://github.com/djshellshoxxx/GhostPay/pull/268) | `ddfc8cfa` | Ancestor; merchant clock runtime and tests identical. |
| [#274](https://github.com/djshellshoxxx/GhostPay/pull/274) | `a4c6f945` | Ancestor; monotonic jitter runtime and tests identical. No workflow runs returned for the original exact head. |
| [#279](https://github.com/djshellshoxxx/GhostPay/pull/279) | `b5fc0991` | Ancestor; Unicode multipart QR runtime and tests identical. |
| [#280](https://github.com/djshellshoxxx/GhostPay/pull/280) | `25c380f2` | Build-profile runtime and tests extracted identically. |
| [#281](https://github.com/djshellshoxxx/GhostPay/pull/281) | `0041514a` | Privacy reporting runtime and tests extracted identically. |
| [#282](https://github.com/djshellshoxxx/GhostPay/pull/282) | `9fbf3312` | Merchant identity runtime and tests extracted identically. |
| [#285](https://github.com/djshellshoxxx/GhostPay/pull/285) | `89942105` | QR classification runtime and tests extracted identically. This parity does not rule out additional defects. |
| [#289](https://github.com/djshellshoxxx/GhostPay/pull/289) | `856b2d60` | Base64url runtime identical; sole test delta removes unused `_index` parameter. |

None of these eleven original heads is an ancestor of observed main. All requested product changes are represented in the canonical candidate; do not duplicate their integration or delete their source branches. The extracted #280/#281/#282/#285/#289 heads lack ancestry, so file identity is the relevant evidence.

Returned original-head workflows succeeded for #258 (four), #261 (one), #265/#268/#279/#280/#281/#282 (five each). This does not replace current combined qualification or unknown branch-protection requirements.

## Priority hosted qualification

**#289:** [CI 44631965189](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189) failed only lint and its aggregate. Job `135940701265` identifies `packages/invoice-schema/src/base64url.test.ts:36:33`, `'_index' is defined but never used`. That exact fixture cleanup is already present in #278, whose lint job succeeded.

The real repository Vitest suite ran in job `135940701405`: invoice-schema **13 files / 729 tests passed**, including **5 base64url tests** and 100% base64url coverage. The executed synthetic merge `137411e42312a758d95638e6b65174c334e61763` and exact PR head have identical tree `a8549afb9d7a8c4d6a27e4aff9e6755e9c755909`. Four other workflows and Snyk succeeded. Full and lean browser CI jobs succeeded. This is hosted execution, not a local run by this reviewer.

**#285:** all five exact-head workflows and Snyk succeeded. [CI 44613145140](https://github.com/djshellshoxxx/GhostPay/actions/runs/44613145140), web job `135874997510`, ran **13 qrKinds tests**. Web coverage reported **2,808 passed / 1 skipped** across **200 passed / 1 skipped files**; the separate nocov suite passed **3/3**. Synthetic merge `5680f34f8d54894ff7edd6ac8cd325322015414e` matches exact-head tree `204002f0cd205f07122f9d0b62fe23a3a4246b9a`.

All ten workflow run records were independently fetched and their `head_sha` matched the intended original PR head. Pages release-gate, deployment and post-deployment jobs were skipped on both PRs.

## Combined candidate failure and existing repair ownership

[CI 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) for #278 remained running at the snapshot; web unit tests had not completed. Both browser jobs failed the same scenario at `e2e/network-authorization.spec.ts:133`, assertion line 172: `expect(foreign).toHaveLength(before)`, expected 9, received 15.

- Lean job `135981022990`: **115 passed / 1 failed / 5 skipped**.
- Full job `135981023128`: **128 passed / 1 failed / 2 skipped**.
- Both executed `a7ceff94269cddfbc725677dd03737d96a449039`, with the same complete tree as #278.
- Typecheck, lint, build, lean reproducibility, other completed unit groups, contract/static/coverage and Slither jobs succeeded.
- Pages, Beta acceptance, Integration, Hosting and CLI workflows succeeded.
- Contract analysis `44643709093`: Echidna succeeded; Mythril remained running. Earlier unresolved findings are not cleared by this snapshot.

Another active owner already claimed and repaired this browser-observation failure: `/root/qa_bug_gen1`, branch `fix/ghostpay-preflight-observation-20261120`, claim `996f5544`, implementation `89e163fcc24f72830c0a5876486a72178a9365e7`. Its changes add Continue-enabled barriers before snapshots and preserve the foreign-request assertion while adding exact method-list/two-chain-check assertions. The new deterministic test traces six manifest reads to the replacement grant while the revoked request remains held. Read-only source review supports this synchronization change, but this worker did not execute it or establish a hosted browser pass. Preserve the owner's branch and qualification work.

## Stacked PR and deployment restrictions

The proposed QR repair branch `automation/20261120T003500Z/coordinator/qr-runtime-qualification` can target `release/ghostpay-beta-qualification-20261119`. At inspected source, **CI, Pages, Beta acceptance, Hosting kit and CLI qualification have no pull-request base-branch filter**, and each matches the QR runtime/test paths. CI's changed-file filter classifies the patch as code. A stacked PR therefore remains eligible for all five workflows without a duplicate main integration.

Integration and Contract analysis do not match a QR-only delta. That is the configured path scope, not a claim that any required skipped/missing check may be waived. Actual workflow startup and required gates need fresh hosted observation.

Pages publication requires explicit `workflow_dispatch` on main with `deploy=true`. Releases require pushed `v*` tags. No `workflow_run` or `repository_dispatch` deployment trigger was found. API-funded cloud jobs are schedule/dispatch only; parallel paid research excludes PR events. Run `44643709199` confirms only validation ran and paid research/publication jobs were skipped. Repository Pages hosting settings were not read.

The branch-protection endpoint returned **403: Resource not accessible by integration**; rulesets returned `[]`. Required protection policy remains unknown. This review does not authorize a main merge, clear Mythril findings, or certify release readiness.

## Concurrent QR follow-up overlap discovered during publication

Live comparison at 2026-11-20 00:50 UTC found two draft follow-ups:

| Candidate | Exact head | Base | Published claim / PR creation |
| --- | --- | --- | --- |
| [#290](https://github.com/djshellshoxxx/GhostPay/pull/290) | `aaa8a7e2091e91f17b5c6f3ca6a9e7f8bc8f27da` | Canonical #278 `d74af79e` | Claim object `2bb91681`: 00:39:50 UTC; PR: 00:42:55 UTC |
| [#291](https://github.com/djshellshoxxx/GhostPay/pull/291) | `17333ceda784ecdf5734a666ef57ee1d1e599296` | Original #285 `89942105` | Claim object `fc153beb`: 00:44:51 UTC; PR: 00:45:38 UTC |

#291 identifies a separate native implementation worker `/root/spec_verification_review`, coordinator `/root` in another task thread, and independent reviewer `/root/standards_security_review`, cycle `20261120T0035Z`. The PR appeared 163 seconds after #290. Published Git-object/PR timestamps do not establish which local investigation began first. Both source branches remain preserved.

**The production fixes are functionally identical.** Entire `qrKinds.ts` files differ only in one explanatory comment: #290 blob `a85e1011cdface74c87683146ff7428654b7830d`, #291 blob `1a4beffc898c7854f6183aac5a7e6f74f8228d63`. Replacing that one comment makes the files byte-identical. Both apply the same two primitive-string guards with unchanged fixed errors and valid behavior.

The regression suites contain useful differences:

- #291 adds hostile `Symbol.toPrimitive` getter checks for payload, unverified payload and frame paths; explicit `TypeError` constructor checks; all 16 payload mappings across individual/combined flags; all frame classes; and false/0/NaN/Infinity/plain-object controls. It explicitly repeats stateful conversion checks with `unverified: true`.
- #290 adds null-prototype and ordinary `toString` object controls and individually named invalid-input cases. Its guide is based on the newer canonical candidate and preserves fuller runtime/error/authentication-limit explanations.
- Grouping differs, so the published 39/119 and 23/97 test counts are not additive unique coverage. #291 execution/reviewer results are recorded claims from its published handoff; this comparator did not rerun or approve them.

**Recommended disposition for the current integration owner:** retain #290 as the canonical staged product delta, carry only one runtime guard implementation, and extract useful unique #291 tests/evidence after coordination and qualification. Do not wholesale replace current tests or guide text with #291's older-base files. Preserve both branches and their test-first histories until unique evidence is retained and the coordinator decides final PR disposition. Any test consolidation requires fresh combined regression/type/lint and exact-head CI.

The parent reported integration lock generation 5 held by `20261119-continuous-followup-0a7bc3583588-root`; this reviewer performed no lock operations, source changes, PR closure or merge. At the sampled heads, all five #291 workflows were queued; #290 Pages/Beta were running and CI/Hosting/CLI queued. Neither new follow-up had completed hosted qualification.

Coordinator follow-up: the root accepted this disposition and extracted the hostile getter cases, full mapping/flag matrix and additional primitive controls into its own #290 candidate. At 2026-11-20 00:54:37 UTC, a fresh GitHub PR read confirmed published head `ec546311f994fe1db544fe85ff2aa6db428d67d4`; a separate file read confirmed production blob `a85e1011cdface74c87683146ff7428654b7830d` remains unchanged. The upstream PR #291 test blob is `3eaea811d82c9a1913313fc1c0d587147b68fd16`; the coordinator reports local extraction commit `53503b41`. Final combined execution and independent review are maintained by the coordinator and `/root/qr_security_review`, not this read-only comparator. #291 is preserved and its duplicate runtime guard is not integrated a second time.

## Terminal canonical CI update — 2026-11-20 00:54:37 UTC

A direct run-endpoint read now confirms [CI 44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) for #278 head `d74af79ebabdc8cead843361c3497b46d8c421f9` finished **failure** (provider updated 00:49:43 UTC). The earlier queued/running summary was stale. All 24 jobs are terminal: 20 successful and four failed. The four are the two browser jobs described above, web job `135981023399`, and TypeScript aggregate `135995823033`. The aggregate reports `success success success success failure success` for its prerequisites; it is not another distinct source defect.

The web job checked out `a7ceff94269cddfbc725677dd03737d96a449039`, whose tree `e76c03d9dba595ff1171577139c1628c4ad45f5b` is identical to the d74 candidate. It recorded **3,849 passed, one failed, one skipped** across 267 passing files, one failing file and one skipped file. The failure was `apps/web/src/views/Pay.signer.test.tsx:89:19`, case `invoice signer verification lifecycle > compares only the selected seller even when both distinct seller keys are saved`: the immediate accessible-role query could not find the `Continue` button. The command was `vitest run --coverage && vitest run --config vitest.nocov.config.ts`; the first command exited 1, so the second, no-coverage suite did not execute.

The active continuous follow-up coordinator already repaired this exact fixture in commit `f2b991f7eb2c843e96bb533729d71b6a537b9293`, branch `integration/ghostpay-continuous-followup-20261119`. The local signer mismatch state can render before asynchronous manifest-dependent payment review. The repair awaits `findByRole` before checking the button remains disabled, reasserts the mismatch, and retains the no-RPC/no-wallet assertions. It changes only the test, with fixed blob `06a1750266a87afac186e7b1d8b64f4af689a9de`.

Existing independent reviewer `qa_review_gen3` recorded the selected baseline case failing (10 filtered cases; no surviving separate baseline exit receipt), then all **11 fixed cases passing**, zero failed/skipped, exit 0. The source-backed receipts are in `docs/engineering-handoffs/continuous-20261119/signer-fixture-followup-review/` on the owner's worktree. This reviewer read the hosted failure, exact repair, and receipts; it did not rerun those tests. The owner has local combined freeze `2b7c015e28aa23f63ba39486ae7345983ce9ff97` and observed checkout `bb7cb96453e9e62d6317abfc03bbdcd79380690d`; these local checkpoints do not establish current remote publication or hosted qualification.

**Disposition:** preserve the fixture repair and browser repair with their existing owner, and defer their publication and combined qualification to that coordinator. No duplicate source fix, CI retry, workflow change, lock operation or merge was performed by this worker. Original d74 remains hosted-red until a newly published head independently satisfies the required gates.
