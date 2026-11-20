# Independent security review — generation 1

## Decision and exact scope

No blocking issue was identified in the **five non-documentation paths changed by PR #292 head `936d054ed067d89c773310d42e33939c1129bbfa` relative to canonical #278 `417f7c71daf8645e1432f2ec8f070110879b80bd`**. This bounded internal review supports carrying the source into an isolated candidate for complete qualification. It is not a formal GitHub approval, repository-wide audit, release approval, or replacement for required CI/security gates.

Independent reviewer: `/root/security_audit_gen1`, fresh worker in the current invocation. Source files and hashes are recorded in `source-pins.json`. All source branches remained unchanged by this worker. This branch adds ownership and evidence only.

## Live CodeQL annotation correspondence resolved

The normal shell HTTPS client could read the public GitHub check and annotation endpoints, while earlier connected-tool access could not retrieve the annotations. The exact failed #278 check is **136021124871**, on source `417f7c71`. It reports two High alerts; current annotations are preserved verbatim in `codeql-136021124871-annotations.json`:

| Path and line | Annotation | Source behavior |
|---|---|---|
| `packages/chain-adapters/src/deployments.test.ts:96` | Incomplete string escaping or encoding | Inserts a deliberately hostile own `__proto__` member into a known JSON object fixture, then requires rejection. |
| `scripts/tests/privacy-csp-bundle.test.mjs:130` | Incomplete string escaping or encoding | Inserts a deliberately duplicated CSP `content` attribute into a known single meta-tag fixture, then requires rejection. |

Both affected files at `417f7c71` have exactly the same Git blobs as the earlier `d74af79e` files assessed by #292: `251fdedabf2f2be66ce1a0b48946ee5721fe7691` and `d86959ef4ba6418eec5737fdb9e54db7d2859a1f`, respectively. The previous uncertainty about the current alert identities is therefore resolved for these two annotations.

The #292 clarifications express the intended insertion directly and preserve the exact hostile bytes. This worker reran the committed source-extraction equivalence program: the JSON fixture remains 760 bytes (SHA-256 `a98b16b14e498d5598beb530caeaa0d1273e59ced23b19f8fff158bf7fd90281`); the CSP fixture remains 250 bytes (SHA-256 `8d1df43e5446dde7b518b47c8f8fd1b399669c7f8ba8b7080afc7d18ef70386a`). Neither patch weakens the rejection assertion, dismisses alerts, adds suppression, changes analyzer configuration, or changes a runtime escaping function. No runtime exploit is established by these two test-fixture annotations.

The CodeQL gate stays failed on #278 until a new qualified integrated source receives the required successful security analysis. `checks-936.json` is the captured #292 check snapshot: relevant Pages/Anvil/browser/integration/hosting/CLI checks were successful, two CI jobs were queued, and no CodeQL check was listed at that observation. Absence is not a pass. The separate code-scanning alert inventory endpoint returned HTTP 401, so no claim is made about all repository alerts or coverage completeness.

## Artifact trust-boundary review

The only changed release-tool runtime path is `scripts/pages/build-pages.sh`. It invokes the existing independent verifier on the staged site and the build-generated SHA256SUMS, passing the full expected source commit, before either final directory move. A verifier failure propagates through the existing fail-closed shell execution. The seven new promotion cases retain valid control and corrupted-byte, extra-file, missing-file, symlink, duplicate-checksum and wrong-source rejection.

The existing verifier binds hashed bytes, file identities, directory inventories and source metadata; it refuses unsafe/symlink/special-file/invalid-UTF-8 input and observed mutations. Its documented boundary remains accurate: inputs and ancestors must stay private and stable until use, and checksum integrity does not authenticate an untrusted manifest or solve shared-origin hosting. No broader origin-authentication or atomic-snapshot property is claimed.

The other changed runtime-adjacent path is the additive eleven-case Sweep boundary test file. Its changes are tests only. The two fixture changes, promotion tests and build invocation comprise the five non-documentation paths; existing #278 merchant, browser and signer repairs remain outside this diff and preserved.

## Independently executed checks

Environment: Linux, Node `v24.22.3`; repository lockfile byte-identical to the available dependency installation. Dependencies were copied with ordinary local workspace links resolving into this worktree. No dependency/lockfile/configuration changes were made.

| Check | Actual result |
|---|---|
| `node --test scripts/pages/verify-pages-artifact.test.mjs scripts/pages/build-pages-artifact-gate.test.mjs scripts/tests/privacy-csp-bundle.test.mjs` | **73 passed, zero failed/skipped** after dependencies were available. |
| `node docs/engineering-handoffs/remediation-20261120/ci-audit/evidence/verify-fixture-equivalence.mjs` | PASS; both old/new fixture byte strings identical, hostile members preserved. |
| Original chain-adapters `src/deployments.test.ts`, repository Vitest with coverage disabled for this focused selection | **13 passed, zero failed/skipped**. |
| First attempt at the combined Node selection before dependencies were copied | 24 tests passed; CSP file failed to collect because `jsdom` was missing. Preserved in `artifact-and-csp-tests.log.gz`; not counted as a product regression or a full pass. |

The optional full library build was stopped at the coordinator's bounded-review freeze. No complete library-build, full workspace typecheck/lint/coverage, browser execution, or new Pages artifact is claimed by this worker. The focused chain-adapters result does not replace its full coverage gate.

## Additional source-only inspection

Inspected secret-export orchestration, session-version guards, reauthentication and SecretBox copy/wipe behavior. Existing paths check cancellation and session identity around awaits, validate the selected RPC chain and bounded EOA code response, dispose recovered keys on invalidation, and wipe secret scalars on handled paths. No new reproducible defect was established in this bounded inspection. **No new secret-export test run or complete cryptographic audit is claimed.**

A preliminary receipt-shape probe was prepared but not executed; it is preserved as `unexecuted-receipt-shape-probe.ts.txt`. The code-audit worker separately owns the unsupported receipt-status investigation. Nullable receipt destination is explicitly permitted by the current `wallet.test.ts` contract, so the unexecuted probe is not proof of a new defect and does not authorize changing that compatibility behavior. No wallet runtime changes were made here.

## Fresh successor task

1. Review the coordinator's frozen combined candidate, including the fresh receipt-status repair and completed clipboard/privacy feature; do not transfer this source-pinned review to later code automatically.
2. For the integrated candidate, inspect complete exact-source hosted CodeQL and other security results. Confirm these two fixture alerts are actually clear; keep unresolved alerts or incomplete language coverage as blockers. Do not dismiss or suppress alerts to create a pass.
3. Independently test the new clipboard lifecycle at copy initiation, delayed read/clear, same-value replacement, option changes, account change/lock and denied permissions. The feature branch is actively owned; use a separate frozen worktree.
4. If continuing secret-export review, execute the original expiry/authorization/recovery tests and add a regression only for a demonstrated untested behavior. Do not invent a defect from type or compatibility assumptions.
5. Preserve this report, exact annotations, initial setup failure and source hashes. Deployment, fees, contract changes, real-fund operations and gate weakening remain outside this task.
