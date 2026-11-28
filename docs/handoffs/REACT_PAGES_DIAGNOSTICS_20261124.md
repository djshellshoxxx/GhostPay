# Bounded React and Pages diagnostics recovery — 2026-11-24

## Source and scope

Worker `/root/ui_data_review` recovered this unit on isolated branch
`integration/react-pages-diagnostics-20261124`, based on
`3e927a9c41f08c42f753786c541b4f8bcfb30d10`.

The exact qualified source is **`16088cfb621fd8b2fe9610b50a34a9c686ea3036`**,
tree **`6a754776ef65b5cc9c1aadea4db5f54c644993fe`**. This handoff and the completion
entry follow qualification without changing production, tests or build inputs.

| Recovery step | Local commit | Historical source |
| --- | --- | --- |
| Additive claim before edits | `1c3e707cbf0d85784979eb7586412def05dc6bf9` | Base above |
| Root callbacks and initial tests | `10e367938c9935da44bd3a4e708ece768bb5d0cd` | `ec7dd86db9b20ab906582c35fcb370b043e44ec4` |
| Fixed built-in labels and complete tests | `b652ef44b745710f16cb9a43fefd17edc15bc72b` | `e73fdb16f81f2e4811931585f59c041441ba1c78` |
| Bounded walk, helper tests and invoice fixture | `6800841646454092ef1be75f3a2a36f4556742ec` | `153965f2298150987b2673e49f4e8ff180d279a6` |
| Complete synthetic smoke transport harness | `336f7d793c02d1f44dd9be0e3a386a8747c78590` | `5a502e55ee18889bdca75ae9cddf9e585ef48782` |
| Seven-line fixed-marker console observer | `16088cfb621fd8b2fe9610b50a34a9c686ea3036` | `c8e0a703df3cacd7c0ee9092c08dd053f40cecce` |

The first and harness commits are direct cherry-picks with original attribution.
The other recoveries select only their bounded source/test hunks. Unrelated
historical registry and origin-feature changes were excluded. Original donor
branches, root checkouts, remote refs and workflow files were not modified.

## Behavior and preservation

`main.tsx` supplies all three React root error callbacks. They classify an
unknown error using fixed built-in labels, without reading mutable names,
messages, stacks or component-stack values. Classification failure returns
the fixed `Error` label. The existing `StrictMode`, application/providers,
default services and localized boundary recovery remain unchanged.

The Pages observer recognizes only the existing root diagnostic marker on
console error events and retains the fixed string `GhostPay render error`.
It does not copy console arguments or suffix text into smoke output. Original
page-error, failed-request and foreign-request failures remain active.

The bounded helper visits the current nine `CORE_ORDER` views through their
navigation buttons, then opens the existing signed testnet fixture and waits
for its Pay review. Missing views, errors and requests outside the published
project fail explicitly. It does not click payment, wallet or key controls.
The fixture retains its original public synthetic data and "never pay" memo.

Exact preservation checks confirmed:

- `main.tsx` and all four `main.test.tsx` cases equal the final `e73fdb16` blobs.
- The helper, seven walk tests and invoice fixture equal `153965f2`.
- The complete nine-case transport harness equals `5a502e55`.
- The observer equals the original seven-line `c8e0a703` addition; the walk
  block equals its donor. Removing those additions and restoring only the
  introductory comments/success message reconstructs base `smoke.mjs`.
- Existing URL/option handling, `smoke-url.mjs`, its tests, manifests, lockfile
  and workflows retain their base bytes. The original registry remains an
  unchanged prefix followed by the new claim/completion.

**Origin clarification:** the actual base has no `--expect-origin` parser or
`deployedOriginProblem` export. The historical full smoke snapshot would add
that separate feature and an unavailable helper dependency. This recovery
preserves the existing request-origin/project-path and URL guards without
importing that historical origin behavior. The historical reviewer confirmed
this intended scope.

Independent reviewer `/root/ui_data_review/react_pages_review` approved the
exact qualified source and tree above, with no preservation or compatibility
blocker. That review was read-only and made no runtime-pass claim.

## Local qualification

| Check | Actual result |
| --- | --- |
| Complete Pages Node selection, `scripts/pages/*.test.mjs` | **105 passed; six files; zero failures/skips** |
| Existing main, ErrorBoundary, App/AppLean and shell unit selection | **62 passed; seven files; zero failures/skips** |
| Full web typed lint, including `src` and `e2e` | Passed on retry with a 2048 MiB Node heap |
| Full profile web typecheck/build/original postbuild scan | Passed; **19 files** scanned |
| Lean profile web typecheck/build/original postbuild scan | Passed; **17 files** scanned |
| Normal clean-tree Pages artifact build and verifier | Passed; **16 emitted files**, all recorded hashes verified |
| Whitespace validation of this delta | Passed |

The 167 passing tests include all 20 recovered historical cases: four React,
seven walk/fixture and nine smoke-transport cases. No new test cases, skipped
assertions, loosened expectations or coverage-gate changes were introduced.
The focused web subset ran without coverage; it is not a full web coverage run.

The initial full lint attempt exhausted the locally selected 1024 MiB V8 heap
and exited 134. The unchanged command passed with a 2048 MiB heap. Both receipts
are retained; no source or gate changes were made for the retry.

Dependencies were reused through 68 workspace links pointing to this checkout.
All 65 package outputs were copied from `GhostPay-followups` at the exact base
after verifying matching package/configuration inputs before and after copying.
No package source changes are part of this unit. Tests ran with one worker.
Node `24.22.3` and npm `11.19.1` were used; the ordinary build commands included
full TypeScript checks and their existing bundle scans.

The Pages artifact used the normal `scripts/pages/build-pages.sh` with a clean
source tree, `GHOSTPAY_PAGES_DEV=0` and declared build origin
`https://pages.example`. It bundled no deployment manifests, so payments remain
disabled on every chain. This is a local static artifact, not a deployment or
native-browser result. Its evidence names the qualified source commit above.

## Hosted coverage and concrete remaining limit

| Check | Existing hosted invocation |
| --- | --- |
| React callback tests | `ci.yml` → `ts-test`, matrix group `web` → `npm test -w apps/web` |
| Both recovered Pages Node suites | `pages.yml` → `site` → `node --test scripts/pages/*.test.mjs`, after the library build |
| Actual Chromium nine-view walk and fixture review | `pages.yml` → `smoke`, after `deploy`; manual dispatch on `main` with `deploy=true` |

The Node transport harness runs the real smoke entrypoint with synthetic
Playwright and fetch responses. Its nine cases establish the observer/failure
checkpoints; **they do not establish native browser navigation or rendering**.

The Pages PR browser acceptance job runs the separate `pages-devnet.spec.ts`
through `scripts/beta/browser-devnet.sh`; it does not call `smoke.mjs`.
Ordinary full/lean Playwright jobs do not call this entrypoint either. Thus no
current PR browser job supplies native qualification of this recovered walk.
The only existing native invocation is post-deployment. The Node suites will
run automatically on the PR without a workflow change.

Native smoke was not run by this worker. The previously observed Chromium
Unix-socket restriction remains, and no browser installation or sandbox
workaround was attempted. Native execution of this exact walk remains an
outstanding qualification item. Root owns final combined source qualification,
hosted gates, publication and main integration; the core candidate remains
separate from this follow-up.

## Evidence

Full commands, source preservation, hashes, retry details and hosted-coverage
mapping are recorded in
`/workspace/scratch/f80482f352bc/react-pages-diagnostics-qualification.json`.
Raw receipts are alongside it:

| Log | SHA-256 |
| --- | --- |
| `react-pages-diagnostics-pages-node.log` | `21319480d63eeea52ba9249b528f098cae0757a544e735609ee1cfb5564c67ad` |
| `react-pages-diagnostics-web-unit.log` | `29e68b334b5b0df64f66d8c72cdac1ba87f9e9b22598362372cf78761396e18c` |
| `react-pages-diagnostics-web-lint.log` — heap-limited attempt | `1060a6954730a719945c2f052b4c81454cbf395ab5e185fa7ac4f958220651a7` |
| `react-pages-diagnostics-web-lint-retry.log` — passed | `8a34a8ab941dd46847948f6beb90527aaa1793ed437165401714be6c45990485` |
| `react-pages-diagnostics-build-full.log` | `807265fd4cd119dbdad1d4a1cc584cd96fef34349ca6680bc84099bb7d48cf62` |
| `react-pages-diagnostics-build-lean.log` | `1879659c86f70f112df88f7f636a43424329bc0d3bd09a4bd87cca55a2cc5f98` |
| `react-pages-diagnostics-pages-artifact.log` | `846823e3494d7798b80c37077ee08854c98b99a51b7062670e3c223910b21850` |

The static artifact is retained at
`/workspace/scratch/f80482f352bc/react-pages-diagnostics-site/`.
Its `evidence/pages-evidence.json` SHA-256 is
`a8c1a16886a5649b79ddb209805f3aaf2ca38f529436d2862ae728aab178082c`;
its `evidence/SHA256SUMS` SHA-256 is
`f8593f61992c60a8299fa71b3b32c50375bd1baf46e6e2318b3e05f4d9e90537`.
