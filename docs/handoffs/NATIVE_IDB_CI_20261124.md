# Hosted native IndexedDB and Pages smoke wiring — 2026-11-24

## Scope and source pins

- Isolated branch: `integration/native-idb-ci-20261124`.
- Base: `4a4237d052ac1ebb54e434f67ff49a55877ffb84`, tree `46dc6a2a7f35dfc950c850cda0a2385aee191c37`.
- Initial claim: `f47e9196c2e3906d0261b84a6bdddbaeacd7f26f`, before any workflow edit.
- IndexedDB CI source: `a586ce5fc66a41febe173a77802db81142f8f837`.
- The coordinator reviewed the exact Pages plan and authorized its implementation; claim extension `71dbccb7` precedes that workflow edit.
- Qualified combined workflow source: `2dd985110c102e68f5da8f5676fb721062d185e3`, tree `881ab9aa10d3105ffdb6cfb239168891961e9ade`.
- This handoff is documentation only. No root-worktree or remote writes were made.

Only the two existing workflows and the additive claim/handoff are changed. No dependency, API, production source, browser harness, test, action pin, or deployment policy is modified.

## IndexedDB check in the existing full-profile E2E job

One additive step in `.github/workflows/ci.yml` follows the existing Playwright Chromium installation and browser suite. It runs `apps/web/scripts/test-reconciliation-idb.mjs` exactly once, for `matrix.profile == 'full'`, with `GHOSTPAY_LOCAL_BUILD_PROFILE=full`.

The step obtains `chromium.executablePath()` from the installed `@playwright/test` version, verifies that executable with `test -x`, exports it as `GHOSTPAY_CHROMIUM`, and invokes the unchanged harness. A missing executable or failed harness fails the existing full-profile E2E job. The lean leg is unaffected.

The harness starts its own Vite development server and does not rebuild or rewrite the `apps/web/dist` artifact used by the subsequent existing build-identity recorder. Its two-tab IndexedDB and stored-height checks remain intact. The base and current harness blob are both `a523a5ff79c8acc44e2bc8b8370f1b529c090e38`.

## Local smoke of the already built Pages artifact

Two additive steps in `.github/workflows/pages.yml`'s existing `site` job follow the source-tree secret/egress scan and precede summary and artifact retention:

1. Install Chromium using the existing project's Playwright CLI and `--with-deps`. The site job previously had no browser installation; a separate job's installed browser cannot be reused. No Actions browser cache is introduced.
2. Resolve and verify the managed executable, start the existing `scripts/pages/serve-pages.mjs` on `127.0.0.1:4194` under `/GhostPay/`, and run the existing smoke against the already built `$RUNNER_TEMP/pages/site` artifact.

The exact invocation is:

```sh
node scripts/pages/smoke.mjs http://127.0.0.1:4194/GhostPay/ --commit "$GITHUB_SHA" --timeout-s 0
```

Readiness is bounded to 30 curl attempts, each with a one-second maximum request duration and one-second pauses. The server process must remain alive. The entire smoke step has a five-minute limit. `--timeout-s 0` disables deployment-propagation retries for this local artifact. `set -euo pipefail` propagates the smoke exit status through `tee`; an EXIT trap terminates only the server started by this step and preserves the original exit status. Error suppression applies only to process cleanup.

Server and smoke logs are written under the existing `evidence` directory, outside the served `site` directory. No site bytes, manifests, hashes, build output, or deployment target are altered. The job runs this local check on pull requests without deployment. The existing anvil acceptance job, explicit-main deployment condition, production release gates, permissions, concurrency, and post-deployment smoke remain intact.

The recovered console observer from `16088cfb621fd8b2fe9610b50a34a9c686ea3036` is a composition prerequisite for the intended final smoke behavior. It was not at this isolated branch's base; the coordinator reports it is already composed in the root followup. This workflow branch does not replace `scripts/pages/smoke.mjs`, so merging the workflow changes retains that recovered observer.

## Preservation evidence

Removing the 11 added CI lines and the 41 added Pages lines restores each base workflow byte for byte. Removing the corresponding one and two parsed steps restores each entire parsed base workflow, including all prior steps, actions, permissions, matrix legs, settings, conditions, required check names, caches, and artifact handling.

Unchanged script blobs on this isolated branch:

| Script | Base and current blob |
| --- | --- |
| `apps/web/scripts/test-reconciliation-idb.mjs` | `a523a5ff79c8acc44e2bc8b8370f1b529c090e38` |
| `scripts/pages/serve-pages.mjs` | `760aa9b7f5cf21664dc8a6b55291c4ec6c836431` |
| `scripts/pages/smoke.mjs` | `c8e1c672a6fbf5beea8e47b5a6071f6c28625bd6` |

## Qualification

| Check | Result |
| --- | --- |
| Existing workflow and Pages tooling tests | 124 passed; zero failed, skipped, or cancelled; exit 0 |
| All workflow YAML parsed with PyYAML `BaseLoader` | 11 mappings with `on` and `jobs` |
| Additive-step and base-preservation static review | Passed for both workflows; no earlier step or setting changed |
| Extracted run scripts with `bash -n` | Both passed |
| Inline Node executable-path expression syntax | Passed without evaluation or browser launch |
| Unchanged IDB, static server, and smoke scripts with `node --check` | All passed |
| `bash scripts/check-actions-pinned.sh` | Passed, 111 `uses:` references pinned with version comments |
| `git diff --check` from the base | Passed |

The existing tests were run together at the qualified combined source:

```sh
node --test scripts/tests/workflows.test.mjs scripts/tests/workflow-files.test.mjs scripts/tests/ghostpay-codex-cloud-gate.test.mjs scripts/tests/ghostpay-automation-hardening.test.mjs scripts/pages/*.test.mjs
```

Local tooling was Node 24.22.3, npm 11.19.1, and PyYAML 6.0.3. No test was added merely to mirror the new steps. Scratch receipts under `/workspace/scratch/f80482f352bc` are `native-ci-combined-tests.log`, `native-ci-combined-static-review.json`, `native-idb-ci-step.sh`, and `native-pages-ci-step.sh`.

No native browser was installed or launched for this workflow-only change. The earlier local Chromium attempt failed before the IDB harness executed and is not a native pass. The final integrated source must pass the new hosted native checks; static checks establish wiring and preservation only. The coordinator owns independent composition review, publication, hosted qualification, and integration.
