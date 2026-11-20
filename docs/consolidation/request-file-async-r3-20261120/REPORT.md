# Request-file passphrase test completion — 2026-11-20 continuation R3

**The bounded test synchronization change is implemented and locally qualified at `9ca941305028fca0e68f86ca7e3ebe2becee724d`.** It adds nine lines to one test and changes no production behavior. Independent coordinator review and exact published-source hosted qualification remain required.

## Observed failure and scope

[Hosted job 136548344602](https://github.com/djshellshoxxx/GhostPay/actions/runs/44797683772/job/136548344602), from PR #333 at `3172a93ceb8fce5a4343a93b453dcc0e68f09d87`, failed the request-file passphrase case at its 15-second query for the **Review payment** heading. The captured page still displayed **Opening invoice…** and **Reading invoice…**. The job recorded **3,180 passing tests, one failing test and one skipped test** across 212 passing files, one failing file and one skipped file. All SellerKeys files in that output passed.

Both unmodified local controls passed all 17 cases: without coverage and with V8 coverage. The passphrase case took 1.66 seconds without coverage, 19.31 seconds including creation and opening with coverage, and 27.92 seconds in the failing hosted run. These observations are consistent with the UI query expiring before the production-cost asynchronous KDF finishes under coverage/load. They do not establish a reproduced product defect or a performance improvement from this change.

The repair starts from the exact receipt successor, PR #335 `e31a090501b3f5e77afcee812323e6f69e1fd565`, preserving its #333 backup ownership and #335 receipt identity/print behavior. The clean initial local baseline `ca89f1b61f8c9e69fb2987abc7bec83c169b5051` has the identical tree `41ff1ce468d95b5199808e5587a53766db472a67`.

## What changed and why it preserves the test

The test installs a default call-through spy on `openFragment` immediately before the existing form-button click. It asserts exactly one call with the actual fragment, pinned signers and entered passphrase, verifies the call returned, and awaits that returned promise inside asynchronous React `act`. Only then does the unchanged DOM query verify the completed payment review.

The spy calls the original implementation. The test does not perform another decryption, precompute a result, substitute a mock response, use a weaker KDF, add a delay or retry, or suppress a rejection. A stalled submitted operation still exhausts the original **60-second test timeout**. The subsequent **15-second DOM-query timeout** remains verbatim. The change separates completion of real asynchronous work from observation of React's rendered result.

Every original assertion and statement remains: removing exactly the nine added lines reconstructs the original test byte-for-byte. Real encrypted request creation/decryption, private-field exclusion before opening, the final memo, and the no-wallet/no-RPC assertions remain. Product, library, manifest, lockfile, workflow, test configuration and coverage-threshold objects are unchanged. No timing-sensitive new busy-state assertion was added.

## Qualification at the pinned source

| Check | Result |
| --- | --- |
| Original complete request-file file, no coverage | 17/17 passed, zero skips; 8.01 s command duration |
| Original complete request-file file, V8 coverage | 17/17 behavioral cases passed; command exit 1 because the narrow subset cannot meet unchanged global coverage thresholds; 27.79 s |
| Corrected complete Pay compatibility selection | **163/163 passed across five complete files**, zero failures/skips; 47.36 s |
| Corrected complete request-file file, V8 coverage | 17/17 behavioral cases passed; same expected subset-coverage exit 1; 25.30 s |
| Original full web TypeScript | Passed; 19.85 s |
| First original full typed ESLint attempt | Exit 137, `Killed`, during concurrent execution; no ESLint findings printed; preserved |
| Same full typed ESLint command, same source, serial execution | Passed; 39.14 s |
| Original lean production build and postbuild scan | Passed; 19.24 s; **17 files / 2,496,896 bytes** |
| Original committed-source secret scan and source whitespace check | Passed |

The compatibility set comprises `Pay.test.tsx`, `Pay.invoiceQr.test.tsx`, `Pay.requestFile.test.tsx`, `Pay.i18n.test.tsx` and `Pay.supported.test.tsx`. It retains existing wrong-passphrase, QR/session invalidation, supported-profile, payment and locale controls. Its 163 cases include the 17-case request-file set; counts from repeated runs are not cumulative.

Both focused coverage commands retain the original **90% statements / 85% branches / 90% functions / 90% lines** thresholds. They report the same subset coverage, **11.22% / 7.01% / 9.31% / 13.09%**, and correctly exit 1 at the global gate. Their behavioral JSON reports are successful, but **neither command is a full-web coverage pass**. The first killed lint attempt is retained separately from the later successful serial run; no test, rule or source was changed between them.

## Provenance and preserved evidence

The qualification commit is `9ca941305028fca0e68f86ca7e3ebe2becee724d`, tree `4f2a1e769e71534130a2971e4472fdad6a6fdff6`. The preceding additive ownership claim was committed before editing the test. The production artifact keeps `GP_COMMIT=9ca941305028fca0e68f86ca7e3ebe2becee724d`; its metadata is not relabeled with a later documentation or published commit.

Execution used Node 24.22.3, npm 11.19.1, a 1,536 MiB Node heap and one test worker. Existing third-party dependencies and compiled workspace libraries were reused after equality checks covering nine input groups, including the whole packages tree, root lock/manifests and web configuration. All 2,283 compiled workspace files were hashed before and verified unchanged after qualification. The invoice-schema and QR-exchange source aliases resolve into this checkout. No fresh installation, dependency copy or library rebuild is claimed. Hosted CI uses its own configured Node environment; these local results do not replace it.

[EVIDENCE.json](EVIDENCE.json) records the exact source identities, commands, outcomes, build-file hashes, preserved failed attempts and artifact index. [ARTIFACTS.md](ARTIFACTS.md) explains lossless decoding. The original hosted log is preserved in full, 330,518 bytes, SHA-256 `c3512cbf4a860b3444f418b2070476c9cc0ccc3baff73db6a270abc696ccfa89`. Raw local logs, test JSON, coverage LCOV files and provenance remain distinct.

## Remaining authority and execution boundaries

The coordinator owns independent source review, publication, fresh ownership/head checks and integration. Exact published-source full web coverage/no-coverage and applicable hosted/browser gates remain open. This worker performed no local browser/socket attempt, live wallet/RPC/payment operation, remote write, merge to main or deployment. This handoff closes a bounded test-completion gap; it does not mark the broader Pages beta or another owner's feature complete.
