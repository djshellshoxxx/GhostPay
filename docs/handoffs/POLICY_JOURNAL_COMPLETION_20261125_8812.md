# Policy journal lock completion — November 25, 2026 (Pacific)

## Scope and provenance

Complete the existing policy lock repair #528 (`ff274a08de2a84bcbdf0e373fb607666543554a2`) and its two-page browser regression #541 (`f5bc0d6c71260e11fc89b28c42c65446e31d335f`) against the current payment journal, disclosure and privacy-session implementation. Original donor refs and their complete legitimate ancestry are preserved by ordinary local merges. No dormant product is enabled.

The task branch is `finish/policy-journal-lock-20261125-8812`. Its ownership claim `67760f69` preceded source edits; the additional browser claim `e040ea2a` preceded adoption of #541. The starting privacy checkpoint was `e8857e0292dd06bed85a17ba49d9f6701979e83c`. Source repair `36cb6af2` reconciles #528, browser merge `c20ab92a` preserves #541, and composition `8a4d98dbaf436503de7fe4527cfaa6fdbc0fb750` normally adopts independently reviewed privacy source `28f7b3c0b46f5fa360389a1986f51304302901d2`, including canonical idle candidate `4af78c8cd3eafe12b20170ccfd3a0313bf0c9fc5` and the shared utilities. Regression `465cc5cb` additionally checks captured callback identity.

## Resulting behavior

The policy wrapper previously kept the global attempt-journal lock while preparing a transaction, showing disclosure and waiting for the wallet. An unrelated payment could wait for that entire prompt even though its own action was distinct.

The wrapper now uses the existing bounded browser lock implementation. Its initial duplicate check and transaction preparation run outside the lock. A synchronous policy callback repeats the duplicate check against the authoritative journal snapshot immediately before the existing durable `beginAttempt` transaction. The existing journal then commits the unknown attempt before invoking the provider, releases the lock during the wallet prompt, and reacquires it for returned-hash persistence.

The callback is read from the already captured, frozen `attemptOptions`, after the current `check()` verifies authority and disclosure approval. The old donor's direct mutable `options` access and older `authority.assert()` call were not substituted for those current protections. The new regression changes the caller's callback while wallet rechecks are pending and verifies that the original refusing guard still prevents both a provider call and a journal record.

Current IndexedDB snapshot/mirror reconciliation, stable storage ownership, retained returned-hash evidence, receipt correlation, unknown-outcome blocking, replacement/nonce handling, disclosure, full request capture and bounded returned-hash surfacing are preserved. Explicit policy clearing remains confirmed and journal-serialized. No dependency, workflow, contract or release gate changes.

## Browser preservation

The #541 policy case uses two same-origin pages, the existing mock wallet and the production sender in a test-only bundle. While one policy wallet prompt is pending, another page must send a distinct invoice and refuse the duplicate policy action, with exactly one transaction request per wallet. The first policy prompt is then deliberately released.

Every existing line of the current `flows.spec.ts` suite was retained; only three imports and the new policy case were added. The new case reuses the current `prepare` helper rather than restoring its historical equivalent. Current disclosure approval, stale mirror, ERC-20 and same-invoice concurrency cases remain intact. The fixture is served only by the browser test and is not mounted in the application.

## Local qualification

| Check | Actual result |
| --- | --- |
| Regression-first bounded browser-lock case on unchanged policy source | Failed as expected: the old wrapper did not supply the required abort signal. One selected case; nine unselected. |
| Reconciled policy suite | 10/10 passed initially; 12/12 passed after both current-composition regressions. |
| Initial broader current-composition wallet/journal run | 13 files: 314 passed, 14 failed, 328 total. All failures were in the existing default-browser retained-outcome fixture group and its later dependent cases; routed to the privacy implementer, not suppressed. The other 12 files passed. |
| Web typecheck and five changed TypeScript files' typed lint | Passed. Both added tests and the final default-manager correction separately passed typed lint; final full web typecheck passed. |
| Full production build and postbuild scan | Passed; 20 scanned artifact files. Existing bundle-size/dynamic-import warnings remain. |
| Lean production build and postbuild scan | Passed; 18 scanned artifact files. Existing warnings remain. |
| Unchanged lean dependency/reachability gate | 4/4 passed. |
| Focused Playwright collection | Both same-invoice and policy-prompt two-page cases collected. Collection is not browser execution. |

Dependencies were installed from the cached lockfile. The first prerequisite build found the transitive relayer-guard declarations missing; building that existing workspace resolved the prerequisite, and subsequent web typecheck and both complete builds passed. No manifest or dependency change was needed.

The broader journal run revealed that its old assertions assumed a failed final write exposed only `unknown`, whereas current privacy behavior preserves the returned hash in memory. Its fixture also reused the same cleared localStorage object across cases without completing retained outcomes. Independently reviewed privacy repair `994be97cfb8fc28237b0f99648ca818758129498` preserves actual committed unknown state and its raw mirror, separately asserts the submitted returned-hash overlay, verifies duplicate refusal and restores normal persistence in cleanup. Its 14 affected cases then passed. Normal adoption `ab1a9bdf562c7a3830d632b0e82ca71725a1bac6` preserved the exact fixture.

## Independent review correction and final composition

The independent policy reviewer identified one integration defect: forwarding `browserAttemptLocks()` as an explicit manager caused its bounded begin-lock timeout to also govern returned-hash persistence. This overrode the current journal's unbounded finish/retry selection. The new ordinary regression `f855aea9` failed against that source: both default requests carried an abort signal, while only begin should carry one.

Repair `3c9835afe838a710101ce66eb23a7e492530d328` captures an explicitly injected manager before awaits. The default path keeps the early lock-capability check but leaves manager selection to `withAttemptJournal`, preserving bounded begin and unbounded returned-hash persistence. The 10-second caller-facing returned-hash fallback is unchanged. The test then passed with a signal for begin and no signal for finish, with the submitted hash and actual provider call intact. The independent reviewer approved this exact source and found no remaining source blocker.

The completed combined follow-up selected all **12 policy cases plus the 14 affected ordinary journal cases: 26 passed, 128 unrelated journal cases unselected**. It did not rerun a seeded/property campaign or collect coverage. The earlier full broader run remains recorded above with its original failures rather than being relabeled a clean run.

Final source composition `f79117395fe04098d1aebd09a36fdacefb955212`, tree `2c3956b95d4bae5fbe0726a2803a7c359737910b`, normally adopts canonical privacy `f8145c1cb8d806f1d8b134c159eb00f595e6769a` (#691). That dependency includes the reviewed privacy implementation and fixture correction, corrected Pages/idle #689 `0ae8a9d1`, and merged shared utilities #690. The only conflict was the additive ownership log: the complete current log and all 71 incoming lines were retained in order. All other paths merged normally. The net eight-path policy delta remains bounded to the reviewed repair, regressions, old donor handoff and current finding/ownership records. The independent reviewer approved this exact final source composition. Both production profiles were rebuilt after the manager repair and canonical adoption: full TypeScript/Vite/postbuild completed successfully with 20 scanned files, and lean completed successfully with 18. Final secret and whitespace checks also passed; no source was changed by these checks.

## Remaining qualification

The final committed evidence handoff must receive its narrow independent check before exact-tree publication and fresh hosted CI, including the two-page full/lean browser cases. Merge the qualified idle and privacy dependencies first. Local Chromium is unavailable; no browser execution or fresh browser acceptance is claimed here.

Use the current released cooperative integration lock only after actual-composition hosted checks and renewed ownership checks pass. Do not promote the branch while any required check fails. No live wallet, funds, release or deployment action is part of this task.


## Corrected privacy dependency composition — 2026-11-26

Local source `0cfe4e3cf9f44d8cfaa501818f45ce234dd3326d`, tree
`f08b6b091e54932b0aff2ad685412ac7e7cffd39`, normally adopts canonical policy
`c6f15cfe` and corrected privacy #691 `6b4bbe17b436344b05d2942ccb0633de43e43fa0`.
Pre-edit follow-up claim: `0063950f`. Only the additive ownership ledger conflicted;
its full prior content and complete incoming append-only tail are retained.

Approved policy runtime and unit-test blobs remain canonical c6f exact. The flows
fixture contains corrected owner-history cases plus the exact existing three
policy imports and complete 49-line policy action case. The other five corrected
privacy test files and all three incoming handoffs are canonical #691 exact. No additional
runtime, dependency, workflow, assertion, skip or timeout edits were made during
reconciliation; the canonical fixture corrections were adopted unchanged. The earlier local policy results apply to unchanged source; no additional
local suite execution is inferred. Fresh hosted qualification of this actual
composition remains mandatory. Independent final composition/documentation review
is recorded in the published PR after source verification.
