# Pages smoke render-error gate and PR #209 review

Date: 2026-11-18. Worker: `security_recovery`. Coordinator owns integration,
remote writes and final qualification. This lane made only local commits.

## Exact sources

| Item | SHA |
| --- | --- |
| Observed live-main base | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| PR #209 reviewed input | `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` |
| Coordinator source / new smoke branch base | `e85db1ef942bda9cb54317a6c036a22484b46ff9` |
| Coordinator's sanitized root-error correction | `0bbd8965b2535a48ecd4eab700cd4f28e54b38fa` |
| Smoke test-only red source | `6e6be44d3213e247076397bf30b9ee1665265de0` |
| Fixed smoke code and tests | `a77cadbb7deca0cb2bf8829ed1215962bb8b4d9f` |
| Fixed code/test tree | `bb3526bc8f1dabc6711d884c7d8366592f9a1261` |

Branch: `integration/ghostpay-pages-smoke-render-errors-20261118`. Worktree:
`/workspace/scratch/4fa14be12559/recovery`. The completed recovery integration
branch remains intact. The claim was committed as `ff6962fa` before edits.

## Concrete finding and correction

The selected #209 changes install React root handlers that report render errors
through `console.error`. The Pages smoke test recorded only `pageerror`, request
failures and foreign requests. Its view walk recognized a successful visit from
the navigation's `aria-current` state. A view could throw into `ErrorBoundary`,
leave the navigation usable, then clear its failure when the next view was selected.
The smoke script could finish with `SMOKE PASS` despite a caught render failure.

At the red source, a subprocess executed the actual `scripts/pages/smoke.mjs`
entrypoint with synthetic Playwright events and local fetch responses. Caught,
uncaught and recoverable root console errors at the view-walk, initial-page and
fixture-invoice checkpoints all incorrectly exited 0. The secret-bearing
render-error case also exited 0. The baseline result was 5 passed / 4 failed.

The correction adds seven lines to `scripts/pages/smoke.mjs`: register the console
listener before navigation; recognize the fixed `GhostPay: caught|uncaught|recoverable
render error (` prefix only at console error level; append the constant
`GhostPay render error` to the existing failure collection. No arbitrary console
text, argument object or message suffix is copied into the new failure record.
The three existing smoke error checkpoints now reject those records.

The original page-error and request checks remain unchanged. The tests verify
their failure exits and prove unrelated console text and non-error console levels
neither fail this new check nor disclose their payload. The synthetic ConsoleMessage
throws if its argument objects are inspected. No app behavior, workflow policy,
dependency, release gate or real-browser skip changed.

## Execution and independent review

Executed on Node v24.22.1. All runs used one Node test worker; subprocess fixtures
cap their heap at 128 MiB. The full Pages run capped its parent heap at 192 MiB.

| Command / source | Observed result |
| --- | --- |
| `node --test --test-concurrency=1 scripts/pages/smoke-render-errors.test.mjs` at `6e6be44d` | Exit 1; 5 passed, 4 failed, 0 skipped; all four missing-error cases printed `SMOKE PASS` |
| Same command with the `a77cadbb` fix | Exit 0; 9 passed, 0 failed/skipped |
| `NODE_OPTIONS=--max-old-space-size=192 node --test --test-concurrency=1 scripts/pages/*.test.mjs` at `a77cadbb` | Exit 0; 95 passed, 4 suites, 0 failed/skipped; 1.85 s |
| `git diff --check e85db1ef..a77cadbb` | Exit 0 |
| Independent CI reviewer at `a77cadbb` | Source review found no introduced blocker; independent focused execution passed 9/9 |

The 9 new cases are included in the 95 and the independent rerun repeats them.
Do not sum those counts. ESLint explicitly ignores `.mjs` in this repository; no
ESLint pass is claimed for these files. The new tests run the real smoke script
with a synthetic browser interface; they are not Chromium acceptance evidence.

Retained local logs under `/workspace/scratch/4fa14be12559/analysis-security/`:

- `pages-smoke-render-errors-red.log`
- `pages-smoke-render-errors-green.log`
- `pages-smoke-script-suite.log`

Independent rerun log:
`/workspace/scratch/4fa14be12559/analysis-ci/independent-pages-smoke-render-errors.log`
(exit 0, 9 passed, 0 failed/skipped, 1.269 s; reviewed files matched `a77cadbb`).

## Overall selected PR #209 source review

The live API still showed [PR #209](https://github.com/djshellshoxxx/GhostPay/pull/209)
open/draft at the exact input head above. Reviewed the coordinator's extraction of
`79c9fd0d`, `be646f5f`, `2f0b2de5`, `e46a0d91`, `595da5e5`, `b6614da8`,
`43a73df2`, `4b3f1a5d`, `898e5631`, `1d46bc5e`, `cd390fdd`, `884744d4`,
`2a3e78c9`, and `865fccb6`. The `435c4da1` release-test relaxation and unrelated
nightly/Dependabot/Docker changes were excluded. `release.yml` has no change
between the live-main base and the coordinator source.

After the coordinator's root-error correction and this smoke repair, no additional
blocking source issue was identified in the reviewed Pages changes:

- **Frame and origin checks:** sensitive views are refused before they mount;
  lean/Pages cannot enable the full-profile iframe exception. Home, Pay and About
  remain frameable. The declared-origin check rejects bundled-manifest trust on a
  mismatch; it does not authenticate altered code or isolate sibling Pages paths.
- **Root error reporting:** the original arbitrary `Error.name` regex and throwing
  getter problem are corrected at `0bbd8965`. Only fixed built-in labels are
  returned; hostile prototype inspection is caught. The source no longer reads
  `name`, `message`, stack or component-stack data for reporting.
- **Unbacked-key navigation:** the listener follows the existing session/verified
  backup summary, remains active after an unverified download or waiver, and is
  removed after session cleanup. Browser prompt delivery remains browser-dependent;
  the jsdom tests establish listener behavior only. Recovery, idle-clock and
  session-generation protections remain present in the integrated shell.
- **Build checks:** the bundle scanner now visits every HTML document and shares
  the lean module exclusion list with the Pages verifier. Its declared-origin
  allowance permits the exact compiled origin literal only. Legacy runtime-fetched
  unsigned manifests are removed. The public-key denylist rejects the enumerated
  known test keys on the release/production Pages path; it cannot establish that
  an arbitrary operator-supplied key is secret.
- **Artifact and deployment policy:** publishing still requires manual dispatch,
  `main`, `deploy=true`, and the configured gates. Attestation is required before
  deployment; its privileged job downloads data, checks exact file membership and
  hashes, and runs no repository JavaScript or checkout. The actual served-site
  browser smoke remains after deployment and cannot undo a failed deployment.
- **IndexedDB recovery harness:** the added R1-R3 assertions check isolated-context
  import, explicit re-encryption, reload and occupied-store refusal. Source review
  did not find an assertion weakening, but this lane did not execute Chromium.

The pinned upstream [provenance action](https://github.com/actions/attest-build-provenance/blob/4d101475d8b20a2381f78447822ac1eab6504dd8/action.yml)
delegates to [actions/attest](https://github.com/actions/attest/blob/508db95dd578ae2727ebd6217d5ba78e4fbda05d/src/subject.ts).
Its `subject-checksums` path reads checksum text and subject names directly; it
does not resolve every `./file` against the action's working directory. The
workflow's preceding check is what verifies those bytes against `site/`. This
falsifies a suspected attestation working-directory issue. GitHub provenance is
not a release-key signature or evidence of an actual published run.

Claim cleanup for the coordinator: the workflow header and mirror banner still
say there is "no clickjacking protection"; current source provides a client-side
sensitive-view guard, while header-enforced frame protection remains absent.
`docs/pages/README.md` still teaches only the retained-artifact checksum workflow
and does not yet describe the new provenance verification. Neither source review
nor these Node tests qualifies actual browser behavior, a deployed origin,
attestation creation, physical-device recovery or the final combined candidate.
