# GhostPay master consolidation — qualification checkpoint

This packet records execution of the authorized repository consolidation. It is an
intermediate, source-pinned checkpoint, not a declaration that the complete master
candidate is qualified for main or release. Later receipts supersede only the scopes
they explicitly identify. Historical evidence remains available.

## Verified main promotions

| Group | Reviewed source | Tested tree | Resulting main | Verification |
|---|---|---|---|---|
| Browser transport isolation, PR #241 | `e8857bfa1ec93fafa9ff83f63f7430ef26a362c2` | `837fa8d51c3bf632cb5b56cba654e1a420213651` | `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` | Expected-head merge; resulting tree and ancestry checked. See focused promotion review. |
| Idle clock, invoice signer validation, v4 private checkpoint, PR #242 | `ab4e0da2cfe2a18adac0424896fba0b40fac81a8` | `eb8fc38c83a67fe3b1b4889ebd9371f5fddbbd17` | `e454de6abfefda70d82784fafc1d8949b277c334` | Tested synthetic merge `7524f6f0ab64bbf88bf7261539c41c42470241af`; exact resulting tree, parents and source ancestry checked. Four post-merge tooling tests passed. |

PR #237 was merged concurrently by another writer between these promotions. It is
preserved in main and in the candidate; this coordinator does not claim that action.
No deployment or production release was performed. Branches were not deleted or
force-pushed. Public main metadata reported protection disabled and no required
contexts; the administrative protection endpoint was unavailable to this connection.
Independent review and executed checks were still required for the promotions.

PR #242 has 36 successful check runs, three intentional skips, and a separate
successful Snyk status. See `PR242_QUALIFICATION.md`, `pr242-qualification.json` and
`pr242-test-totals.json` for the exact jobs, versions, source and per-suite totals.
Repeated platform/matrix jobs are not summed into a count of unique tests. Those
results qualify the #242 tree, not the later master source.

## Candidate and recovered work

The integration branch is `integration/ghostpay-master-consolidation-20261118`.
Its base is PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec`; qualified main
through `e454de6a` has been reconciled. The application source checkpoint before this
documentation commit is `521194c0f2238358061525c2cddf14ee7cc366ea`.

| Reconciliation | Selected source and resulting behavior | Status at this checkpoint |
|---|---|---|
| Spec 18 recovery | PR #239 plus selected #240 byte-exact verification, fresh consent and unload protection; atomic replacement and partial-allocation cleanup retained | Integrated; independent source review preserved; combined qualification pending |
| Historical adapters | Impossible calendar dates, bounded finite retry inputs, TRON completeness; unique quote regression retained without redundant runtime policy | Integrated; 656 focused tests passed, 22 existing skips; focused PR #250 awaiting hosted completion |
| CLI / relayer | Selected #218 parsing, redaction, admission, limiter, fee-binding and failure-lifetime fixes with existing padding/privacy controls | Integrated; independent source review preserved; combined qualification pending |
| Policy validation | Selected #211 canonical metadata decoding, typed-data binding, rebuilt leaf/proof and secret lifetime safeguards | Integrated; separate asset coverage and multichain reconciliation remain in progress |
| CodeQL source repairs | Linear trailing-slash normalization and Settings fixture setup through actual UI | Integrated; PIR focused coverage passed 62 tests; fresh combined CodeQL still required |
| Selected #246 safeguards | Native confidential-router call avoids copying returndata; exact deployment acknowledgement parser and offline regressions | Integrated selectively; 22 offline preflight tests passed; no fee-token policy exception granted |
| Signer completion | PR #243 through `276aed60`: explicit local pin selection, stale asynchronous trust rejection, accessible status and idle/expiry regressions | Integrated; fresh combined tests required |
| Durable scan | PR #248 `139c5cb8`: authenticated encrypted v5 journal, private scope binding, CAS invalidation, revalidation and bounded discoveries | Integrated; v4 compatibility protections retained; fresh combined tests required |
| TM privacy completion | PR #249 through `f0c15de9`: strict stored selection, session-only endpoint retention, CSP validation, bounded/cancellable windows and relayer/chain safeguards | Integrated with durable scan and existing privacy safeguards; qualification pending |
| Source scanner | Reconciled #247 AST repair with existing master HTML/artifact/CSP checks | 97 focused tests passed; old scanner control produced 10 failures; eligible production source scan found zero violations |
| Sleep-aware revocation | Original idle source `7e6089e2`, with #256 checkpoint token/lender repair `d5fe06e7` and both vault/Spec18 denial regressions | Integrated; atomic replacement, live unload checks and backup-only custody retained; no physical-device sleep claim |
| Browser action authority | PR #251 through `325a9156`: immutable operation grants, live policy/session revocation, no unscoped production fetch, bounded requests | Integrated with signer, private scan, strict preference and idle guards; 41 changed TS/TSX files parsed without syntax errors before later tail updates; runtime/type/browser qualification pending |

Source integrations are not main promotions. The BTC #219/#244/#254 reconciliation,
policy asset coverage, remaining #211 format work, and focused #245/#247/#253
promotion remain separately owned. Original active branches are preserved.

## Security-sensitive conflict resolutions

- **Custody and idle:** install all replacement boxes before wiping the old wallet;
  clean partially allocated boxes on failure. Expiry synchronously revokes ordinary
  secret operations. A possible sole copy remains usable only through the existing
  encrypted backup/save/verification path. Before unload, inspect current external
  recovery state at the event; a cached “verified” summary does not disable the check.
- **Scanning:** retain encrypted v5 journal scope and CAS rules, the per-dispatch
  session/configuration guard, cancellation signal, and arithmetic request budget.
  Explicit network grants are constructed for each selected primary, secondary or
  indexer endpoint. Automatic scans cannot mint new authority after revocation.
- **Payment:** combine signer-selection/verification epochs with network revision,
  operation signal, settings and invoice identity. A stale result must satisfy all
  relevant guards before it can update state or continue an action.
- **Preferences:** retain #249's strict absent/invalid/pending distinction. Add #251's
  stale-form comparison and revocation without restoring a forgiving parser as a
  network authority source. Preserve all additive locale/security-key entries;
  reconcile two profile notices with the expanded action boundary.
- **Checkpoint lender:** a retained public session snapshot is not authority after
  suspension. Recheck the active-session deadline before cache reuse and match the
  same holder after borrowing; wipe a refused replacement copy.
- **Historical ports:** select useful patches rather than importing unrelated
  dependency upgrades, old checkpoint derivations or superseded runtime policies.

## Qualification limits and preserved findings

The complete master matrix has not yet passed. Local dependency builds repeatedly
terminated with exit 137; that is incomplete execution, not success. A scoped
installation and source-oriented focused tests do not qualify the full workspace.
All full typecheck, lint, unit/coverage, full and lean Chromium, Pages, beta,
contract/analyzer, CodeQL, secret/egress, dependency, CLI/integration and artifact
gates must be attributed to their actual tested source.

The strict Mythril report from PR #238 remains preserved in full, with metadata and
findings. Its five analysis results completed successfully as tool invocations but
reported **11 findings (three medium, eight low)**, which failed the strict gate.
No finding was suppressed, no analyzer budget or target set was reduced, and no
owner exception was activated. PR #255's stricter evidence/preflight work is under
active review and qualification; earlier reports or constructor-model counterevidence
do not establish that these findings are closed.

## Census scope and continued reconciliation

The immutable initial snapshot contains 246 live branches and 239 PRs: 44 open,
53 merged, 142 closed without merge. Twelve recoverable deleted-branch PR-head
snapshots represent eleven additional historical branch names. Initial primary
classification counts apply to live branches only; historical heads are separate.

The exhaustive three-page refresh observed at **2026-11-19 07:20:47.693 UTC**
(2026-11-18 23:20:47.693 America/Los_Angeles) contains **264 live branches and
254 PRs**. See `census-refresh-20261119-0720.json`. This is an observation cutoff,
not a permanent repository count. New/advanced sources are reviewed against their
exact heads before integration; the final disposition overlay and retirement
proposal will identify subsequent changes and preserve the initial evidence.

`EVIDENCE_INDEX.json` records file sizes and SHA-256 digests for the evidence snapshot.
Git Data publication preserves each logical commit's exact tree and parent structure;
local-to-published commit mappings explicitly record metadata-dependent SHA changes.
