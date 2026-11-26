# Browser network isolation: unowned transport handoff

## Source and ownership

- Initial main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Task branch: `codex/ghostpay-browser-isolation-20261118`, created directly from that main.
- Target: existing static Pages beta; full-profile chain adapters are qualified separately from lean shipping.
- Implementation: existing adapters only. No changes to contracts, hosted relayers, recovery, dependencies,
  active central policy/UI, CI, deployment configuration or Mythril release gates.
- Integration status: [draft PR #241](https://github.com/djshellshoxxx/GhostPay/pull/241) is open with the
  requested title. The complete policy feature remains blocked on the separately owned work below.
  No merge, deployment or release claimed.

Before edits, the five low-level net-transport candidates were compared against #222/#228/#231/#233/#238:
they are byte-identical to main and have no current ownership claim. The two SDK RPC files were checked
against all 39 open PRs, including recovery #239 `d2c64522`; none changes them. `release.ts` is unchanged
in the active privacy/integration branches. This task records its own paths in `docs/ai/ACTIVE_WORK.md`.

| Read-only active input | Head observed | Scope retained with owner |
|---|---|---|
| #222 privacy hardening | `2bc2098298d90928eb1acafad969f28316bb05fc` | Central policy/profile wiring, app settings/services, scan, Sweep, other-chain views and privacy docs |
| #228 own-node guard | `685fe1a39a3fa9f1d6a4d10a77b4d1a2745edeed` | Per-dispatch own-node guard, including cached clients/retries |
| #231 Sweep balance consent | `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | Action-specific balance consent, catalogs, existing journeys |
| #233 browser fixtures | `67cf835d0bf5f3b239e8ee6f18dca401fd5a5050` | Existing payment/scan/Sweep journey fixtures |
| #238 integration | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Broad consolidation and its final qualification |
| #213/#229/#239 recovery; #212/#220/#225 security | Independently active | Keypair/recovery work, analyzer remediation, contract/security gates |

Earlier `pages-client-hardening` and `sensitive-surface-audit` tips are ancestors of main. All five
`rpc-filter-guard-beta` commits are patch-equivalent; the original guard's remaining difference is comment
wording. Unmerged old refs are not treated as unfinished behavior.

## Original findings and repairs

| Finding | Change | Regression evidence |
|---|---|---|
| Automatic release hash followed HTTP redirects after checking only the initial origin | Refuse redirects, require same-origin fetch, validate URL metadata, bound body/deadline, fixed errors and cleanup | `apps/web/src/lib/release.test.ts`; new `e2e/network-isolation.spec.ts` |
| Private/custom scan fetch could hang when fetch/read/cancel ignored abort; foreign error objects could disclose request text | Deadline race over whole operation, nonblocking cancellation, late-body cleanup, only locally created error classification, limit/status validation | `packages/net-transport/src/fetchIsolation.test.ts` |
| Fetch-shaped library adapter ignored Request method and cancellation | Validate actual method and pre-abort; bounded caller cancellation result and listener cleanup | `packages/net-transport/src/fetchAdapter.isolation.test.ts`; library-only, not a current web importer |
| Shipped Solana/TRON SDK requests omitted credential/cache/referrer policy and could hang on uncooperative streams | Explicit fetch privacy options, pre-dispatch abort, bounded deadline/read, cap and late-response cleanup | New `rpc.isolation.test.ts` in both packages |
| TRON base query/fragment could absorb appended route; userinfo allowed; Solana fragment accepted | Refuse ambiguous endpoint forms; preserve intended API key header and Solana selected query; support explicit TRON IPv6 loopback | Both SDK isolation suites |
| Independent review: SDKs trusted mutable exported error instances from injected fetch/streams | Private local cap-failure identity; every foreign exception reminted without message/cause/code | Eight failing-then-passing additional regressions; independent probes |
| Independent review: release reader cleanup could override a safe result/error | Guard releaseLock cleanup | One failing-then-passing regression; independent probe |

No newly confirmed critical/high finding was found in these changes. The SDK error-object issue was medium
at the injected-transport boundary; it is not a demonstrated HTTP-server exploit. The release cleanup issue
was low. Both are closed in the reviewed source. Browser errors still use existing localized messages;
no new translation quality claim is made.

## Verification receipt

Results below are actual observations. Runtime hashes for independent acceptance are in
[`network-isolation-independent-review.json`](../privacy/evidence/network-isolation-independent-review.json).
The inventory and human exposure matrix are in [`docs/privacy/`](../privacy/browser-network-isolation.md).

| Command / check | Result |
|---|---|
| `npm ci --ignore-scripts --offline --no-audit --no-fund` | Environment killed, exit 137. Reused existing installed dependencies with the exact same package-lock SHA-256 (`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`); no dependency/lockfile edits. Hosted CI must verify clean installation. |
| `node scripts/build-workspaces.mjs --libraries` | Passed, exit 0, before edits; affected libraries rebuilt after changes separately. |
| Final 44 transport regressions against exact baseline source | RED: 41 failed / 3 passed, exit 1. |
| Transport regressions against implementation | GREEN: 44 passed, exit 0. |
| `npm test -w @ghostpay/net-transport` | 193 passed; coverage gates passed (97.56% statements, 95.94% branches, 96.42% functions, 97.93% lines), exit 0. |
| SDK initial regressions | RED: Solana 17 failed / 5 passed; TRON 22 failed / 2 passed; exit 1 each. Added response-continuation race then redaction regressions also failed before their fixes. |
| SDK focused final suites | Solana 51 passed; TRON 33 passed; exit 0 each. New isolation cases total 56. |
| `npm test -w @ghostpay/solana-stealth -- --maxWorkers=1` | 136 passed; coverage 97.48% statements / 95.07% branches / 98.09% functions / 99.17% lines; exit 0. |
| `npm test -w @ghostpay/tron-adapter -- --maxWorkers=1` | 103 passed; coverage 96.98% statements / 93.3% branches / 98.92% functions / 99.08% lines; exit 0. |
| `vitest run src/lib/release.test.ts --coverage=false` | Initial RED 10 failed / 6 passed; final GREEN 18 passed, exit 0. Cleanup review regression was RED 1 failed / 17 passed before fix. |
| `node --test scripts/tests/network-egress-inventory.test.mjs` | 4 passed, exit 0; 37 unique surface records and explicit app network references checked. |
| Independent native HTTP/injection acceptance | 18 passed / 0 failed, exit 0. Four redirect paths reached no forbidden destination. Exact source hashes preserved. |
| `npm run typecheck -w @ghostpay/net-transport` with bounded Node heap | Passed, exit 0. |
| `npm run typecheck -w @ghostpay/solana-stealth` and `-w @ghostpay/tron-adapter` | Both passed, exit 0. |
| `npm run build` for net-transport, solana-stealth and tron-adapter | All affected library builds passed. |
| `node --test scripts/tests/network-isolation-native.test.mjs` | 18 independent behavioral subtests plus parent: 19 passed, zero skips, exit 0. Portable current-source tests run in the existing script CI job. |
| Full production Vite build with authored E2E manifest, `RAYON_NUM_THREADS=1` | Passed, exit 0. `apps/web/scripts/scan-bundle.mjs` passed, 19 files. This is not a full typecheck/build gate. |
| Lean production Vite build with authored E2E manifest, `RAYON_NUM_THREADS=1` | Passed, exit 0; the unchanged lean bundle scanner passed. |
| Local full web typecheck and transport lint | Environment killed with exit 137; a smaller web heap exhausted with exit 134. No pass claimed. Original hosted CI commands remain unchanged. |
| Local Chromium Playwright startup | Blocked before tests: browser process singleton `socket()` returns EPERM. Four new cases fail at launch; no browser behavior result inferred. Hosted CI must execute full and lean suites. |

### First published head and CI repair

First published implementation: `fc992c2a1dc8dead9ad9cdb8e47d79bc16d34d92`, tree
`65995f14b7f63294b0778a4f7078a6bf6192095f`. Its GitHub merge-test commit
`65009e5640523af120f997ac4f48ce977be31576` has that same tree and the initial main as its other parent.
[CI run 44422174791](https://github.com/djshellshoxxx/GhostPay/actions/runs/44422174791) executed the
unchanged clean-install and regression jobs. Observed successful results on that head:

- Full repository typechecking, all TypeScript unit-test shards, contract aggregate and relayer regressions.
- Web tests: 2,763 passed / one skipped, plus three separate no-coverage tests passed.
- Lean Playwright: 70 passed / three skipped. All four new startup-isolation cases actually executed and passed,
  including a real reload after settings were persisted once, forbidden redirects and real request metadata.
- Full Playwright: 82 passed / one skipped; all four new startup-isolation cases executed and passed here too.
- Script-test shard: 236 passed, including the inventory checks and 18 native-HTTP behavioral subtests.
- Pages artifact build and Anvil browser validation (16 passed), beta acceptance (three passed), CodeQL,
  secrets/egress checks and reproducible lean candidate builds.

The first lint job failed with 11 errors in the new code. They were repaired without suppressing rules or
removing assertions: SDK promise rejection paths now create fixed `Error` objects earlier; test URL handling
uses explicit narrowing; the adversarial `undefined` rejection remains tested through a mock; web tests use
typed signal assertions and an `unknown` JSON result. Focused transport (44), SDK (51 + 33), release (18)
and independent native tests (19 runner tests / 18 behavioral probes) passed after these corrections. Both
SDK typechecks and typed lint checks passed again. Independent evidence hashes were refreshed after the
runtime change; the cap-failure classification and caller-abort behavior remain intact. Typed lint also passed
on the corrected web and net-transport files. Final first-head check count: 35 successful, two failed (lint and
its dependent TypeScript aggregate), three intentional Pages publication/smoke/release skips, none pending.

The PR checks are the authoritative result for the corrected final head. First-head successes are not
represented as final-head passes. Main was rechecked before publication and remained at the initial SHA.
Contract/relayer source is unchanged; their original hosted regression jobs remain enabled. No tests,
assertions, coverage thresholds, security checks or workflow gates were weakened.

## Independent review

A separate reviewer had no responsibility for implementing runtime changes. The reviewer inspected routing,
redirects, URL forms, cancellation races, late responses, fixed error objects, storage/metadata boundaries and
scope overlap. It independently exercised native fetch with two controlled loopback servers, stalled bodies,
malformed SDK responses, refused HTTP responses and forged error instances. After repairs it reported no
remaining confirmed material finding in the modified runtime paths. This is AI-assisted review, not an
external professional audit, whole-feature acceptance or anonymity claim.

## Remaining blockers and next handoff

1. Universal per-dispatch private-path policy is not complete on this main-based branch. Incoming #222/#228
   must be reconciled with scan preferences, stale/malformed settings, cached clients, retries and cross-tab
   changes. Neither an inventory nor low-level transport hygiene provides that integration.
2. Sweep opening/balance, preparation, fees, relayer and direct broadcast, replacement and status behavior must
   pass the combined consent/policy matrix with #231. Preserve nonce safety, attempt journals and locking.
3. Actively owned Esplora, indexer and relayer code still needs bounded-failure follow-up. Three synthetic
   Esplora reproductions confirmed ignored-abort and never-resolving cancel paths. These are owner blockers;
   no patch to their owned files is included here.
4. Verify full and lean browser tests, both SDK consumer views, failed private transport, reload and background
   activity on the integrated source. SDK selection itself does not enforce a separate global private mode.
5. Reinspect live main/PR heads before integration. The observed #238 head had application CI, CodeQL and
   Mythril failures and is not a qualified replacement for main. Main already has a strict Mythril failure;
   this task does not change or override that gate.

All five owned runtime modules have implemented repairs and independent source/probe review; this is an
implementation-scope count, not a completion percentage for the full feature. A defensible overall percentage
requires the remaining policy/integration/browser acceptance matrix. The complete requested feature is
**not marked complete**, and no future-only specification is promoted by this work.
