# Independent acceptance and integration review — TM1–TM15

## Review boundary

- Reviewer role: fourth independent role, test coverage and integration boundaries.
- Repository: `/workspace/scratch/88088facfb13/GhostPay`.
- Reviewed base: PR #238, `198aa5baff22272453733a0f3dcfcac0e0994eec`.
- Initial complete continuation snapshot: `6464083bd75b9c6913bbea49c98be651026de7a5` on `chatgpt/ghostpay-tm-hardening-20261118`.
- This report includes the initial review and the subsequent source corrections. The final correction review and exact source hashes below supersede the initial pending dispositions. Clean final-head hosted execution remains separate qualification.
- Read the task handoff, repository instructions/workflow, active work claim, full changed-file inventory, runtime changes and their focused tests, the current completion/default matrix, relevant unchanged acceptance definitions, and the supplied execution logs.
- No product files, branches, dependencies, gates or CI configuration were modified by this reviewer. No broad tests, lint or typechecks were run by this reviewer. Execution results quoted below are inspected evidence from the implementers/independent peers, not executions attributed to this reviewer.

## Findings

### COV-1 — Active web padded scanning did not use the new cancellation/request-budget boundary

**Priority:** P1 acceptance blocker for the requested TM15 completion; inherited active-path behavior, not a regression newly introduced by the helper corrections.

The new cancellation and arithmetic preflight tests exercise `packages/scan-source/src/padded.ts::fetchPadded` and `range.ts::createRangeSource`. The active browser wrapper uses neither helper. `apps/web/src/lib/scanPrivacy.ts::createWindowedScanClient` calls `padRange`, then builds and shuffles its own window array and loops through `fetchNode`. Its options originally had no `AbortSignal`; its asynchronous head, jitter and backend stages did not recheck cancellation. `openScanClients` constructs this wrapper, and `views/Scan.tsx` separately constructs the secondary wrapper without passing the existing scan controller signal. That signal originally reached `runScan` only.

Consequently, stopping the outer scan does not establish that a pending padded `getLogs` call stops scheduling subsequent windows. A large padding choice with a small fixed window can substantially magnify those requests. The shared helper's 33 passing tests cannot qualify this active web path. The initial completion matrix overstated this boundary with “request preflight/cancellation enforced” for the browser preference.

**Required correction:** a narrow guard in the existing browser window scheduler, carrying the current scan signal through primary and secondary construction, checking before/after asynchronous stages, and arithmetically refusing an excessive window count before allocation. Tests should use a deliberately non-cooperative backend and include pre-cancel, cancel while head/window/jitter work is pending, last-window stale-result rejection and zero-request budget refusal. No general transport/deadline redesign is needed.

**Coordinator disposition:** accepted and corrected. Metadata implementer reproduced 16 failing assertions with 7 controls, including actual Scan UI cancellation emitting 9 windows instead of 1. The existing scan controller now scopes primary/secondary window scheduling. Independent source review found no remaining blocker in the correction; see the final review and execution caveat below. The final log reports 62 passing assertions but worker termination timed out and the process was stopped with exit 130, so clean execution qualification remains pending hosted CI.

### COV-2 — Network-profile copy claimed a wider dispatch guard than implemented

**Priority:** P2 privacy claim/acceptance mismatch; no new relayer transport authority should be added in this lane.

At the reviewed snapshot, `settings.network.pending` said requests using an unacknowledged saved profile were blocked without qualifying the surface. The strict `loadNetworkSelection` check is used by `createSelectedRpc`, including its cached-client transport. `createDefaultServices.fetchFn` remains direct fetch; `relayerClient` does not read the saved profile. Alternate-chain and explicitly configured scan endpoint paths likewise do not all pass through this shared EVM RPC guard.

The Sweep quote path does perform manifest RPC verification before its relayer request. Thus a pending policy already present before verification is ordinarily blocked indirectly. This is not a per-relayer-dispatch guarantee: a policy change after the final verification request is dispatched and before the quote dispatch is not rechecked by `requestQuote`. Standalone uses of that client also have no such check. The initial simple “preloaded balance” hypothesis was qualified after inspecting the manifest read; it is not claimed as a reproduced bypass.

**Required correction:** qualify UI/errors and matrix as the shared EVM RPC boundary, and explicitly disclose that direct relayer fetch, alternate adapters and already-dispatched work are not newly governed by this guard. Broader transport isolation remains PR #241's owner boundary.

**Coordinator disposition:** accepted and corrected. Independent re-read confirmed all four catalog messages now identify the shared EVM RPC boundary. The completion matrix, developer guide, user guide and Tor guidance explicitly exclude separately configured scan endpoints/indexers, raw relayer fetch and alternate-chain adapters. No new transport mechanism was introduced. COV-2 is closed at source-review level; native-language acceptance remains unverified.

## Acceptance map

This table separates inspected test definitions from final-head execution. A test existing in source is not a passing result.

| TM | Coverage and integration assessment |
|---|---|
| TM1 | Existing `Sweep.privacy.test.tsx` asserts zero RPC creation/reads on opening, exactly one UI-authorized read, fresh action after payment/asset/provider changes, no retry/fallback without another action, and zero address-bearing reads when payment/asset/chain/provider/factory/session/lock/unmount changes during client creation. Ordinary context changes preserve the explicit result. Existing Sweep tests also cover direct/relayer signing. Actual reload/browser acceptance must be included in final full/lean execution. |
| TM2 | Notices and the locale security-key inventory are preserved. Copy now recognizes provider observations and connecting-IP limits. Native-language review is not implied by catalog validation; the observed catalog check retains 493 fallback warnings. |
| TM3 | Unchanged `chain-adapters/src/rpc.test.ts` explicitly asserts POST, `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`, and `redirect: error` at the supported shared transport. This is a request-options assertion, not a network-wide isolation certificate. PR #241 retains general transport ownership. |
| TM4 | New tests cover normalized session markers, named/encoded credential path labels, heuristic-negative manual session-only choice, slot/chain separation, rejection preserving prior retention decisions, export omission for primary/secondary/relayer endpoints, source preservation, and actual empty relayer clear-on-import semantics. Browser definitions cover reload expiry and export availability. Existing ordinary saved URLs intentionally remain plaintext. No external endpoint classifier is introduced. |
| TM5 | Real shipped HTML/header templates are transformed and validated; malformed DOM placement, duplicate attributes, comments, templates, noscript, early scripts and spoofed markup are challenged. Inert JSDOM parsing closed prior regex false passes. Pages propagation/postbuild wiring and generated nginx standard/embed policies are tested. Full generated builds and browser enforcement are separate final qualification requirements; `_headers` presence does not establish Pages enforcement. |
| TM6 | Authoritative requirement is honest Tor scope/documentation. No Tor/OHTTP routing feature was invented. Real network/onion/bootstrap and deployed TLS behavior remain unverified. |
| TM7 | Existing session-only reuse ledger tests cover no persistent address linkage, no legacy import, storage denial, session replacement, lock and delayed completion. Known-wallet classifier remains inactive without an authoritative dataset. No external dataset/provider or upload was added. |
| TM8 | The inspected implementation is the #235-owned private HKDF v4 format. Tests pin private-key/chain/key-ID derivation, wrong seller refusal, same-key restore, lock/replacement cache expiry, borrowed-key wiping, storage failure and corruption. Legacy public-name progress is deliberately ignored and cleaned best-effort, requiring a rescan. The handoff's v3/v2 migration wording is superseded explicitly; silently reviving either incompatible v3 design would cross ownership and weaken the chosen policy. Checkpoint values remain plaintext and unauthenticated. |
| TM9 | New tests reset address inclusion on payment or signer change, preserve an unchanged receipt's choice, reset on remount and verify generated minimized signed JSON contains no `stealthAddress` or its value. Existing opt-in, invoice-binding and historical receipt/schema verification remain required final-suite coverage. Minimization does not remove transaction-hash linkage. |
| TM10 | New tests cover encrypted fresh state, explicit plaintext output, no content/link/opt-out in local/session storage, remount reset, different-seller and same-key reinstall reset, new encrypted valid output and ignoring a prior-session asynchronous completion. Existing supported-profile/ordering/compatibility tests remain. No signer/key generation or encryption protocol changed. |
| TM11 | Padding tests cover malformed values, empty and maximum allowed field, independent whole-body limit, optional/required modes, defaults, ingress contradictions and null values. Client regression fails closed before fetch on randomness failure while retaining explicit off, oversize and the specific legacy response fallback. Logger tests retain timestamped operational events while removing access lines/request IDs and sensitive fields. Proxy/host logs are explicitly outside the claim. |
| TM12 | Bulk evidence remains off at zero and finite values capped at the existing target. Infinity/NaN now disable it. Existing malformed/cancellation evidence tests retain matches even beyond target; the target is not a strict total request cap. Repeated-range inference remains disclosed. The rejecting async mock's lint-only correction preserves test behavior. |
| TM13 | BTC correction derives spend outpoints from raw verified transaction inputs instead of an uncommitted JSON coinbase annotation; existing fallback and sign-time checks are retained. TRON review-stage liveness tests cover lock, endpoint change and unmount with non-cooperative fetches; balance-to-memo cancellation is checked. Solana/TRON/Bitcoin are not described as sharing identical network guarantees. |
| TM14 | Strict storage tests cover malformed/null/unknown/incomplete four-field policy, denial, pending acknowledgment, explicit fresh absence, explicit repair, failed saves, cross-tab displayed status, cached clients, retry/reconnect and loopback behavior. Pure library parser compatibility remains unchanged. Deleting site preferences resets fresh defaults; this is not policy persistence against origin compromise or proof of Tor routing. COV-2 must be reflected in the final claim. |
| TM15 | Helper-level padding/range tests and coverage include preallocation huge-range refusal, abort before/after backend awaits, bounds and announcement deduplication. COV-1 led to equivalent active-browser scheduling guards and a per-call 4096 initial-window/uncached-dispatch cap, including split attempts. Primary/secondary UI cancellation and scheduler edge cases are now defined and reached 62 passing assertions in the final affected selection, with process qualification still incomplete. Generic same-block items are not universally duplicates; structured announcements perform identity deduplication. |

## Defaults and authority boundaries

- No default provider is introduced. Fresh network profile absence remains Direct/single. Only present malformed or pending saved EVM policy changes to refusal.
- Bulk evidence, extra padding, jitter and experimental PIR/OHTTP/I2P/Nym are not made default-on.
- Relayer request padding was already default-on; server padding remains optional, zero-log remains false, and ingress retains existing direct/trusted-proxy default selection.
- Credential export omission is deliberate minimization. It does not silently delete the saved endpoint or transmit it elsewhere. Session-only endpoint memory is page-lifetime configuration, not seller-key-scoped secret storage.
- Receipt disclosure and invoice plaintext/private form consent are scoped to the payment/seller/session. Ordinary network/scan preferences intentionally remain device/page configuration across sellers.
- No authority is added for spending, signatures, key generation, external classification, release deployment or publishing. Spec18 recovery, #234 signer validation and #235 checkpoint source are unchanged.
- The changed-file inventory has no contract source, package/lockfile, workflow, coverage threshold or analyzer/release gate edit. `scripts/pages/build-pages.sh` adds CSP application/validation while retaining subsequent bundle scanning.
- The #238 payment-key-export race failure and strict Mythril/other inherited gates remain distinct from this continuation. Fixing an unrelated failure to make CI green is not authorized by this review.

## Execution evidence inspected

The following are actual logs inspected under `/workspace/scratch/88088facfb13/tm-evidence`. Counts overlap and must not be summed as unique coverage. These results predate the active-browser scheduler follow-up and do not qualify that change.

| Log | Observed result |
|---|---|
| `browser-privacy-final-green.log` | 7 files, 98 passed |
| `settings-export-final-green.log` | 3 files, 38 passed |
| `metadata-scan-coverage.log` | Full scan-source coverage: 98.81% statements, 95.86% branches, 100% functions/lines; unchanged gates |
| `metadata-finite-green.log` | 2 files, 42 passed |
| `browser-metadata-consent-review.log` | 8 passed, 5 deliberately filtered |
| `browser-metadata-scan-review.log` | 2 files, 33 passed |
| `independent-metadata-web.log` | 3 files, 18 passed |
| `independent-scan-source.log` | 2 files, 33 passed |
| `relayer-privacy-green.log` | 2 files, 125 passed |
| `relayer-client-green.log` | 1 file, 35 passed |
| `chain-review-green.log` | 5 files, 91 passed |
| `independent-csp-final.log` | 30 passed, 0 failed/skipped |
| `i18n.log` | 4 catalogs, 0 errors, 493 warnings |

Failing-first logs and implementer reports distinguish executed assertion failures from missing-built-dependency startup failures. `metadata-web-green.log` intentionally retains an earlier 65-pass/1-failure result (obsolete Infinity expectation), followed by a separate affected-suite pass. A “green” filename alone is not evidence of a clean run. The huge-range allocation regression was safely executed after correction, not mislabeled as an original OOM reproduction.

The local Chromium launch did not reach application assertions because of the environment's socket `EPERM`. Component/JSDOM tests do not replace full/lean Chromium acceptance. Resource-killed typed checks with exit 137 are incomplete, not passes. Root owns the sequential complete checks and hosted exact-source qualification.

## Final qualification requirements

1. **Source review complete:** independently re-read the active-browser TM15 correction and confirm both primary and secondary callsites carry the existing controller signal. No additional local heavy test was launched after the coordinator's instruction to use hosted CI. The final affected run reached 62 passing assertions but had no clean process exit.
2. **Complete at source level:** re-read all COV-2 copy changes for exact shared EVM RPC scope; existing substring assertions remain meaningful and no assertions were weakened.
3. Pin the resulting complete source tree/commit and keep test/build results tied to that snapshot. Earlier implementation selections are not final-head all-suite passes.
4. Record full and lean Chromium results, actual generated Pages/CSP artifacts, complete applicable unit/typecheck/lint/secret/egress gates, inherited failures and their owners. An inherited failed gate remains failed even where unrelated to this lane.
5. Prepare the authorized reviewable continuation PR only. This review does not authorize main merge, deployment or release.

**Source-review conclusion:** the changes inspected are bounded to the stated privacy workstream and do not weaken release gates or activate experimental features. COV-1 and COV-2 have source corrections independently reviewed with no unresolved source blocker identified. Clean final-head execution and inherited owner/release-gate dispositions remain open; this is not an all-green or merge-readiness approval.

## Inherited dependency closure gate disposition

The coordinator requested an additional read-only assessment after retrieving PR #238's `rest0` job `135045140851`. That baseline had stale generated package documentation and two lean-core dependency-closure assertions failing on packages introduced by the original TM work: web additionally reaches `@ghostpay/hygiene` and `@ghostpay/metadata-hardening`; relayer additionally reaches `@ghostpay/metadata-hardening`.

These failures require different dispositions:

- `scripts/tests/lean-core-reachability.test.mjs` explicitly calls its allowlist owner-reviewed; its pending section and `docs/consolidation/LEAN_CORE_GATE_PORT_2026-11-14.md` explicitly reserve accept/remove decisions to the owner. The current component/security reviews supply useful technical evidence, but they are not evidence that this release-scope owner acceptance occurred. The coordinator accepted the recommendation to leave both allowlists unchanged and retain the inherited failures. No pending dependency was silently promoted and no gate was relaxed.
- `scripts/agent/package-map.mjs` generates a factual map rather than approving dependency scope. A read-only `--stdout` comparison showed only the hygiene/web and metadata-hardening/web/relayer dependency edges and existing `validate:deployments` script were missing. Regeneration is therefore a bounded documentation correction for TM7/TM11 integration, not permission to widen a reviewed build. The actual generated file is `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md`. This reviewer did not modify it; the coordinator is regenerating it and running the unchanged checks.

Source inspection confirms the relevant production imports are `DestLedger`/`fundingGuard` in web Sweep, `padBody`/its typed error in the web relayer client, and `stripPad` in the existing relayer server. No package manifest or lockfile was changed by this continuation. The inherited closure failures remain explicit merge/readiness blockers outside this review's authority; they are not new regressions from the continuation.

## Final active-web scheduler correction review

The correction is confined to the existing scheduler, its existing Scan callsites and focused tests:

- `assertScanActive` uses the existing fixed `scan-aborted` sentinel, never the caller's potentially sensitive abort reason.
- The scheduler checks before reading heads/logs, after head completion, after jitter, after a successful window response, before interpreting a rejected response as a provider limit, between recursive split nodes, and before returning results. Unwindowed log calls also reject late results.
- `openScanClients` refuses pre-aborted construction and rejects completion after abort. The existing `Scan.tsx` controller signal reaches both the primary wrapper and the secondary comparison wrapper.
- The initial grid count is checked with bigint arithmetic before constructing/shuffling an array. Each `getLogs` invocation has its own 4096 uncached-window-dispatch budget; split attempts consume that same budget. Concurrent calls do not share or reset one another's counter. A fixed `INVALID_INPUT` budget error is not recognized as a provider range/size refusal, preventing a caller from retrying around the cap as if it were a provider split instruction.
- Cached hits retain existing semantics. Head/block reads, unrelated `request`/`getBlock` traffic, inner retries and in-progress client creation remain separate transport boundaries. Cancellation waits for already-dispatched backend/sleep promises to settle; it is not a general hard deadline or proof that all browser traffic stopped.
- User help and the completion/default matrix now state the 4096 per-query cap, additional-request costs and excluded traffic. No new experimental mode or protocol is activated.

The new scheduler tests cover pre-abort with zero/fixed windows, implicit and explicit head reads, an early/final window, unwindowed requests, late provider-limit refusal without split scheduling, cancellation during jitter, preallocation refusal without random draws or log dispatch, exact 4096 acceptance, split budget accounting, a safely post-fix-only MAX_SAFE_INTEGER range, and concurrent per-call budgets. Client-construction and actual Scan primary/secondary cancellation tests verify the active integration path, not merely library helpers.

### Execution distinctions

- `metadata-web-scheduler-red.log`: **16 failed, 7 passed** on the original active scheduler. The actual UI test observed 9 calls after cancellation where 1 was authorized before cancellation.
- `metadata-web-scheduler-green.log`: **20 passed, 3 failed** after the runtime correction. The remaining three expectations omitted the existing `INVALID_INPUT:` prefix from `ChainAdapterError.message`; those expectations were corrected without removing the budget assertions.
- `metadata-web-scheduler-final.log`: **4 files / 62 assertions passed**, including the corrected budget cases and two added post-fix acceptance cases. It also reports `Timeout terminating forks worker` for `Scan.privacy.test.tsx`; the implementer stopped the process with exit **130**. This is useful executed assertion evidence and **incomplete process qualification**, not a clean local gate pass. Hosted CI must resolve the runner outcome on the final published source.
- This reviewer inspected the logs and verified all five file hashes below using `sha256sum -c`; all matched. No new test execution is attributed to this reviewer.

### Frozen source hashes

These hashes identify the independently reviewed correction even though the coordinator owns the subsequent final commit/PR identity:

| File | SHA-256 |
|---|---|
| `apps/web/src/lib/scanPrivacy.ts` | `81d6941d1adf3c7a3fccd605387ac010fc8a82e53607996a80b7e3911155b21c` |
| `apps/web/src/views/Scan.tsx` | `7998b56e8d32660912b6677e0297bff781652b4e301ff716c499521ed0b07c35` |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | `3b69a2c46615fded546d641bdb7ff85c7c52dc02f81ea5209eeded433e731e4c` |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | `837635b3ce38e42a547ce5cd66f75496a1a87acb85eff13824395576853f17e3` |
| `apps/web/src/views/Scan.privacy.test.tsx` | `72edf4d3856c30478c078730b11afad05486b288145250b0d86018b8b1bbf6e9` |

**Final reviewer disposition:** no unresolved confirmed source blocker remains in the reviewed TM1–TM15 continuation. Both findings from this independent review have bounded source corrections and explicit remaining execution limits. Proceed with the authorized draft continuation and exact-source hosted qualification. Preserve inherited gate failures and owner decisions; do not represent this report as permission to merge, deploy or release.
