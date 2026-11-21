# Feature completion and consolidation — execution record

This record belongs to the authorized implementation assignment started from main
`ffd982a7aea2856c186b40ef236a39720a1b81f5`. It distinguishes source integration,
executed tests, main promotion, and release. It does not declare the candidate qualified.

## Reconnaissance and choice of baseline

The first search returned 49 open pull requests. The later paginated pull-request collection
also found three open dependency updates omitted by that search and newly created #258.
The immutable first comparison is retained in `initial-pr-matrix.json`; it must not be
mistaken for a permanently complete or current open-PR count. Ancestry, patch-equivalent
commits, changed paths, and exact-head Actions checks were inspected separately.

The most complete existing implementation was the unqualified master branch
`integration/ghostpay-master-consolidation-20261118` at
`b529a720cfbfa3c1056cc71085b4f163078e7591`. It already retained #238, #239 and selected
#240 recovery, #243 signer work, earlier #248/#249/#251 privacy and scan work, idle-lock
integration, and both identified CodeQL source repairs. Its exact head had no check runs,
workflow runs, or commit statuses at inspection. Its own `PROGRESS.md` explicitly records
incomplete combined qualification. It is reused as source, without treating its historical
test results as execution of this task's combined tree.

The independent #257 pool-input/AST-scanner/SOCKS branch was merged locally with its
original parents retained. The AST integration keeps the existing own-origin, all-HTML,
CSP, and artifact checks. No finding exception or release gate was changed.

## Ranked feature matrix before this execution

Effort is a relative engineering estimate, not a completion percentage or delivery promise.
Rank reflects remaining integration and acceptance work, followed by security impact and
dependencies. A feature implemented on an unmerged branch is not described as absent.

| Rank | Feature and specification | Observed implementation | Remaining acceptance and defects | Relative effort | Best existing source and overlap | Assignment | Required qualification and consolidation |
|---|---|---|---|---|---|---|---|
| 1 | Browser authorization / TM1–TM15 | #251 and #249 implemented most required boundaries; master combined them | Strict profile semantics, cross-tab stale settings, async scope changes, combined UI/CSP/egress evidence | Large: interacting authority and lifecycle boundaries | Master `b529a720`; #251 `3ae0b4f6`, #249 `c17e5c38`, #238 baseline, merged #241 | Privacy implementer; recovery reviewer | Reproduce missing grants/stale callbacks, focused source/UI tests, whole-web type/lint/coverage, full/lean browser and CodeQL; merge only a qualified combined tree |
| 2 | Spec 18 / user-controlled recovery / sleep-aware authority | Master already combined #239 atomic replacement, #240 exact-file checks, and idle revocation | Recovered-key capability expiry across decrypt/loan/install, cross-session reuse, independent saved-file recovery | Large: secret-lifetime and consumer integration | Master `b529a720`; #239 `4a1b181c`, #240 `38d69832`, #256 latest `247c3353` | Recovery implementer; privacy reviewer | Failing-before regressions, portable formats and independent process tests, session/idle/export suites, browser acceptance and final combined checks |
| 3 | Private EVM scanning / specs 05 and 10 | #248 authenticated encrypted journal, scope binding, CAS and discovery restore were present in master | Final app-lock tail, policy changes before storage events, combined authority/CAS and revalidation | Large: shared Scan and session interfaces | #248 `18b36745` and master; overlap #249/#251/#256 | Privacy implementer; root integration | Store, lifecycle, scan engine, UI and bounded-resource tests, cancel/reload/reorg recovery, final browser/type/lint |
| 4 | Bitcoin spentness and scan privacy / specs 11 and 12 | #254 implemented continuous input coverage, unknown classifications, provider consent and reorg handling | Reconcile master operation grants, retain useful #244 cases, verify no implicit outpoint query at signing | Medium to large: two independently developed state models | #254 `8c1d87a2`; compare #244 `ef08170a`; #219 ancestor | Branch analyst reassigned to BTC implementation; root review | Library and web spentness/worker suites, source/inclusion/consent regressions, full profile browser/regtest; lean exclusion remains required |
| 5 | Source scanner, pool input and SOCKS safeguards | #257 reviewed focused sources and tests, hosted matrix pending | Semantic AST/artifact union and final combined tests; retain circuit zero-witness policy | Medium: independent changes with scanner overlap | #257 `4f14d6f1`, parents #245/#247; selected #253 SOCKS hunks | Root integration; independent reviewer | AST/artifact regressions, pool helper and socket parser tests, compiler/lint/browser/security checks; preserve source parents |
| 6 | Contract evidence and Factory deployment policy | #255 tightens compiler/source identity, completeness evidence and acknowledgement scope | Strict Mythril still reports findings; fresh native evidence and final source review incomplete | Large external qualification dependency | #255 `ea47fa75`, #212/#217/#220/#225 and preserved main evidence | Source review and blocker tracking | Full unchanged analyzer budgets, source identity and native tests; no suppression, acknowledgement invention, production deployment, or release |
| 7 | Build/test integration and branch retirement | #246 already contained four relevant CI repairs; master had overlapping alternatives | Current inventory, typed lint, browser beforeunload fixture, candidate-wide qualification | Medium | Scoped #246 `28edbcf5`; generated inventory and master | Root; independent branch reviewer | Preserve exact assertion meaning, source-pinned checks, no stale aggregate success; retire only after required behavior reaches main |

## Reproduced residual defects and decisions

- The production authority accepted five truncated saved-profile forms rejected by the
  settings parser. The sixth control passed. The privacy worker is unifying the parsers
  and retaining explicit refusal of malformed settings.
- Recovered-key handles lacked synchronous checks at raw-key loan, master installation,
  session replacement, and completion of decryption. Five of six new baseline cases failed;
  the control passed. The recovery worker owns the correction and regression evidence.
- The package map and exact dependency-closure inventory were stale. Existing scoped #246
  fixes were recovered rather than independently rewritten. All 16 original map/closure
  checks passed. The extra dependency names remain explicitly pending owner review.
- The hostile-text fixture dismissed the genuine key-loss `beforeunload` prompt. The
  stronger master fixture arms acceptance only for its deliberate navigation, counts that
  prompt, and continues rejecting script dialogs. Local Chromium could not launch because
  `socket()` returned `Operation not permitted`; no local browser assertion pass is claimed.
- Both #238 CodeQL annotations were retrieved. The Settings finding concerned a public,
  deliberately key-shaped fixture; master now drives real UI save/remount behavior. The PIR
  finding was a polynomial trailing-slash expression; master preserves the existing linear
  backward scan and adversarial tests. The complete PIR suite passed 62 tests with original
  coverage thresholds, and the merged artifact/source scanner passed 63 tests. Fresh
  combined CodeQL remains required; no alert was dismissed.
- The network inventory omitted two already-integrated, explicit `scan`/`rpc` grants and
  matching client constructions in Scan. Each uses the selected endpoint/chain and scan
  AbortSignal. Its recorded counts were corrected after source inspection. The refresh
  process was killed with exit 137 after writing the snapshot; that attempt is not a pass.

## Main consolidation completed

PR #216 (`bb193849a5688bb604e3e32dc83e1647e37fe447`) contained only dated historical
handoff additions. Eight exact-head checks passed; twelve runtime jobs were intentionally
skipped for the documentation-only change. Independent source review found it suitable as
historical evidence. A normal expected-head merge produced main
`a36f48da526b818a5940a7a0ed2ae7303ef17056`, tree
`2109a34d311e3aa42a845601500e389d94f4b5b2`. Both parents, source ancestry and the
single-document resulting diff were verified. This promotion is not application qualification.

PR #215 still labels older repository state as current and needs a freshness correction.
No runtime PR was eligible for immediate main promotion in the initial full check review.
No branch was deleted or force-pushed, and no superseded PR was closed merely because its
source appeared in an unmerged candidate.

## Execution environment and open qualification

The native GitHub connection supports reads, repository writes and normal merges. Command-line
GitHub authentication is absent. Public main metadata reported protection disabled and an empty
ruleset list; the administrative protection endpoint returned 403. Protections were not changed.

A fresh `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline` exited 137. Local checks
use an isolated copy of an existing dependency cache whose external lockfile package versions
match every candidate entry. Workspace symlinks resolve to this checkout. This is not a clean
installation claim. The broad library build also exited 137, without a completed full build.
Focused tests and coverage results are recorded separately. No killed/incomplete invocation,
skipped browser run, historical branch result, or queued hosted job is reported as a pass.

Full source qualification, host/browser acceptance, the strict Mythril findings, and production
deployment facts remain separate gates. This assignment authorizes implementation and qualified
main consolidation; it does not authorize mainnet deployment or a release.

## Final receipt

The final source SHA, completed feature deltas, independent reviews, exact commands/results,
published PR, remaining branch dispositions and ending main will be recorded in `RESULTS.md`.
