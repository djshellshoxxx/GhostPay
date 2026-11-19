# Existing example and IndexedDB CI coverage — 2026-11-19

Requirements: F-MER-06, F-WEB-09 and historical TB-06/TB-09. Base:
`bd6b26dda054fe376dfdc0a347eb4e158c4487a0`.

## Change and coverage

The existing CI build/check job ran only the merchant amount and POS parity test
files. It now runs all eight existing `examples/**/*.test.mjs` files and the
existing webhook receiver selftest. The original two files remain included.
This adds the previously unwired checkout, approval/refund, plugin, subscription
and durable webhook checks without introducing new example implementation.

The existing full-profile browser job now runs
`apps/web/scripts/test-reconciliation-idb.mjs` after retaining the artifact from
its successful Playwright run. The standalone check uses two local tabs, real
IndexedDB, exact-ciphertext compare-and-swap, a competing writer, stale-session
abort and reorg notification. Its current invalidateFrom call was already fixed
in source; this task only wires that existing check into CI. The managed Chromium
installation already belongs to this browser job.

No package metadata, workflow trigger, schedule, permission, timeout, skip,
assertion, release gate, production app code or publication behavior changed.
The additional checks are ordinary failing steps, not advisory/continue-on-error.

## Actual qualification

- All eight example files executed on Node 22.23.4: **60 passed, 0 failed,
  0 skipped**. The webhook selftest also exited **0**.
- The local IndexedDB browser attempt exited **1 before application assertions**:
  Chromium failed in `process_singleton_posix.cc` because `socket()` was denied
  (`EPERM`), then exited with `SIGABRT`. The browser acceptance has **not** passed
  locally. No launch workaround, timeout increase or skip was added.
- YAML parsing confirms both additions are in their intended existing jobs.
  All **113** action references remain pinned; `git diff --check` passes.
- The coordinator independently reviewed the source change and existing IDB
  script and reported **PASS**. Hosted qualification must run the added browser
  acceptance successfully before it can be marked complete.

Exact source hashes, commands and complete logs are in
`evidence/example-idb-ci-20261119/`. Dependencies/library artifacts were copied
independently from the completed matching-lock install, not freshly installed.
This check's page-request assertions do not replace the separate browser network
isolation workstream or prove operating-system-wide absence of network traffic.
