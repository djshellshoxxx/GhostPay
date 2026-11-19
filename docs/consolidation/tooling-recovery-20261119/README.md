# Historical #209 tooling recovery

Base: `0d0f4211f54131448212952da2b413dbb90ae243`. Branch: `integration/ghostpay-tooling-recovery-20261119`. Ownership claim: `74eaa080`. Product commits:

| Commit | Scope | Original source |
| --- | --- | --- |
| `44e9fd14e07b3658aa8819ed2844d463dfa07515` | Additive nightly suites and regression guard | [`d06877e2508badf8adbd028983c6039805e5f0e6`](https://github.com/djshellshoxxx/GhostPay/commit/d06877e2508badf8adbd028983c6039805e5f0e6) |
| `cdcb2cd0bee094d5a28dc53e758ccb8be9a63fcf` | Verified image defaults, TLS-edge guidance and pin guard | [`fd5c9009234c08e53d3618134aceaa9438ca4e34`](https://github.com/djshellshoxxx/GhostPay/commit/fd5c9009234c08e53d3618134aceaa9438ca4e34) |

Both are selected recoveries from [PR #209](https://github.com/djshellshoxxx/GhostPay/pull/209). No whole stale branch was merged. `selection.json` pins all eight selected paths: seven match their original source blobs exactly. The README applies the original additions while preserving the already-integrated tight-CSP section, updating the registry verification date and removing claims about withheld automation or unrun current Compose validation.

## What changed and why

The existing nightly workflow now runs the repository's example tests, the existing reconciliation IndexedDB browser check, and the payer-sponsor/external-pools Anvil suites whose prerequisites it explicitly builds. `REQUIRE_ANVIL=1` makes missing prerequisites fail those two suites. Other external/circuit suites are not newly enabled or claimed as passing.

Slither retains the exact failing command `slither . --filter-paths "lib|test|script" --fail-medium --exclude-informational --exclude-low`. A separate later report uses all detectors and includes inline-ignored findings. Its `--fail-none` applies only to this supplementary report; the earlier failing result remains the job's failure. The report and artifact step run after a failed gate, except on cancellation, so evidence is retained. Existing fuzz, dependency-audit, reproducibility and native contract-analysis job bodies are byte-identical. Schedule/dispatch triggers, read-only permissions and pinned action/compiler versions are unchanged.

The self-host defaults now pin the historical nginx and Debian versions to immutable multi-architecture index digests. This changes mutability, not the selected image versions. The offline self-test rejects an unpinned default or disagreement among Compose, `.env.example` and the Tor Dockerfile. HSTS guidance explains the existing plain-HTTP loopback listener and places configuration at the operator's HTTPS terminator; no live configuration is installed. The prior tight-CSP documentation remains intact.

## Independent registry verification

On 2026-11-19 the CI/release lane fetched each public image index twice from the official registry: once by tag and once by the historical digest. All four response bodies independently hashed to the selected digest and matched the `docker-content-digest` header. The history reviewer recomputed these four saved hashes independently. Public read tokens were used only in memory and are absent from the receipt.

| Image tag | Verified SHA-256 |
| --- | --- |
| `nginxinc/nginx-unprivileged:1.27-alpine` | `65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0` |
| `debian:bookworm-20261104-slim` | `734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc` |

`container-registry/verification.json` records exact URLs, retrieval times, response metadata, platform descriptors and raw-body filenames. The four raw indexes are retained alongside it. These reads verify identity and availability of the proposed pins; they do not claim image vulnerability clearance or a successful build/startup.

Operator syntax was cross-checked against the primary [Caddy header documentation](https://caddyserver.com/docs/caddyfile/directives/header), [nginx header module](https://nginx.org/en/docs/http/ngx_http_headers_module.html) and [Cloudflare HSTS documentation](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/). No TLS setting or account was changed.

## Failing-first and passing evidence

The original regression guard files were copied onto the unchanged configuration before the recovery. These are current local results, separate from metrics in the original author's commit messages.

| Check | Before | After |
| --- | --- | --- |
| `node --test scripts/tests/nightly-workflow.test.mjs` | 1 passed, 4 failed; missing examples/browser/Anvil additions and separate Slither report | 5 passed, 0 failed, 0 skipped |
| `bash deploy/selftest.sh` | Exit 1; exactly 3 unpinned image-default failures | Exit 0; full offline guard passed |
| Action pin scan | Not rerun before | 120 references checked, exit 0 |
| Secret scan | Not rerun before | Exit 0 |
| Proxy/meta/header consistency | Not rerun before | Exit 0 |
| Separate `bash -n` invocations for `selfhost.sh` and `selftest.sh` | Not rerun before | Both exit 0 |

The Node guards used Node 24.22.3 with a 256 MB heap limit. No dependencies were installed, no library build ran and no real native analyzer/Anvil/browser suite ran in this lane. The self-host guard uses fake Docker/GH binaries and temporary archives; it does not start a service.

The adjacent three-file workflow harness (`workflows.test.mjs`, `contract-analysis-workflow.test.mjs`, `workflow-files.test.mjs`, serial file execution) exceeded its 160-second cap. It produced no retained terminal verdict; its child stdout was not saved by the initial orchestration harness. This is recorded as an incomplete check, not a pass or a demonstrated product defect. No broad rerun was used to hide this limit. Raw successful/failing guard logs and the timeout receipt are retained, with log hashes in `selection.json`.

Independent source review is copied as `history-tooling-independent-review.md` and `.json`, pinned to `cdcb2cd0`. That reviewer checked all eight committed blobs, gate preservation and the registry evidence; they read the author's test logs and did not rerun the tests.

## Explicitly held original changes

| Original source | Current disposition and evidence |
| --- | --- |
| `435c4da131d346b3e2b0f93e1831a03a852eab8d` | Held. Its release parity change removes `REQUIRE_ANVIL=1` from payer-sponsor, external-pools and upstream fixture workspaces. `payer-sponsor/src/e2e.anvil.test.ts` throws for missing prerequisites when required but skips otherwise; `external-pools/src/reader.test.ts` throws or calls `ctx.skip()` on the same distinction; the Railgun/Privacy Pools Anvil suites use `describe.skipIf(!ready && !required)` and throw when required fixtures are missing. The source therefore changes mandatory release failures into skips. The coordinator explicitly rejected weakening this gate; no replacement provisioning scope was added. |
| `34cdaa34c22f25b4c9a55ff6b4d4a2560c02450f` | Held. It adds new weekly Docker and Docker Compose Dependabot update schedules. The current task excludes new recurring automation. The source branch is preserved; the existing Dependabot file is unchanged and the recovered README does not claim these schedules exist. |

The release workflow, shared native analyzer workflow, CI workflow, Pages workflow, tag/release verifiers, Dependabot configuration and root manifests/lock are unchanged; nine exact boundary blob comparisons are recorded. Existing strict Mythril findings and other release blockers remain open. Root owns integration and complete applicable hosted qualification. This recovery performs no workflow dispatch, release, publication, image pull/build/startup or deployment.
