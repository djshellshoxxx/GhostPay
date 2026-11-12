# Merchant companion acceptance ledger — November 9, 2026

Track B starts at PR #90, `5628bc00b05a6dd0d9cd89f04f0385d9119281ac`.
Main was `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`. The dedicated branch is
`codex/ghostpay-companion-merchant-20261109`, a sibling of Track A's continuing
work. The parent stack #84 → #88 → #89 → #90 remains draft; this work cannot
clear its Sonar gate. This is an in-progress development ledger, not release acceptance.

| Lane | Writer / paths | Acceptance | Reviewer | Status |
| --- | --- | --- | --- | --- |
| B1 | subscriptions: subscription-cron, ux-schedule | Stable issuance after crash, private state, no live lock stealing | plugin_sandbox | Implemented; 21 subprocess and 132 schedule tests passed |
| B2 | coordinator / cli: refund/batch example, installment planner | Exact immutable plans, transactional reservations, unknown outcomes stay reserved; reject real evidence without an owned verifier interface | merchant_review / plugin_sandbox | Fixture workflow and installment fixes implemented; real refund authority blocked |
| B3 | webhooks: merchant-hooks, webhook-receiver | Durable nonce/event/claim/completion, cross-process and restart checks, exact-byte fixtures | shops / coordinator | Implemented; 35 package and 9 durable tests passed |
| B4 | merchant_review: merchant-multisig, approvals example | Strict exchange and runtime state, fresh quorum/policy and time validation | subscriptions / coordinator | Implemented; 92 package and 7 local recorder tests passed |
| B5 | cli: CLI package | Supported runtime, bounded descriptor reads, atomic private outputs, executable journeys | plugin_sandbox | Implemented; 67 package and 6 compiled journeys passed |
| B6/B7 | shops: WooCommerce / PrestaShop | Settings, packaging, PHP suites; real platform/database evidence separately | webhooks / coordinator | PHP 416 assertions and 28 real WooCommerce/MariaDB checks passed; PrestaShop/platform concurrency follow-up in progress |
| B8 | plugin_sandbox: plugin-api, sandbox, plugin-conformance | Revocation, shared-port storage serialization, isolated simulator snapshots | cli / coordinator | Implemented; 45 plugin, 36 simulator and 3 conformance tests passed |

Each worker uses a separate branch/worktree and mutable dependency/build directory.
No root manifest, lockfile, CI, application, chain, crypto, ledger or shared handoff
file is writable in this track. New evidence and integration requests stay here.

Initial tooling: Node 24.22.1, npm 11.9.0. `npm ci --ignore-scripts --offline`
completed successfully (747 packages). PHP 8.4.27 and SQLite extensions were
provisioned from official Debian packages into a private user-local tool directory;
no root dependency or lockfile changed. Docker was absent. Real platform versions,
download hashes and callback coverage are recorded separately by the shop lane.

## Implemented behavior and qualification boundaries

- **Subscriptions:** one authoritative snapshot commits the advanced subscription
  and signed invoice records before publishing an outbox projection. Restart
  preserves the exact committed nonce/link. Kill tests cover fourteen persistence
  boundaries. Private descriptor reads, reserved-path checks, strict signature and
  reminder-state validation, bounded catch-up and lifecycle commands fail closed.
  A dead-owner lock requires explicit operator recovery; elapsed time never steals
  a live lock. Legacy migration requires reconciliation. Mark-paid is manual,
  reminders are payable requests rather than debits, and nothing sends email/SMS.
- **Refunds and batches:** the runnable fixture workflow uses a single bounded
  SQLite transaction for load/validation/reservation/state update. Approval binds
  the exact input and plan; unknown submissions remain reserved and per-item batch
  outcomes are distinct. Fake original payment and fixture outcomes are explicitly
  labelled. Real evidence is refused. The installment planner now rejects unsafe
  money/time values, overflow and schedules whose deposit follows an installment.
- **Webhooks:** exact raw bytes authenticate before parsing. The optional SQLite
  example separates attempt nonce, event digest, processing token and completion.
  Fresh-nonce duplicates acknowledge only durable completion. Crashes and uncertain
  effects remain unresolved; explicit token/digest-bound reconciliation is needed.
  Storage/attempt counts are bounded, terminal event identities are never evicted,
  and HMAC establishes configured-sender authority rather than chain finality.
- **Approvals:** every state transition validates the complete persisted state and
  queued quorum; canonical bounded exchange rejects ambiguous JSON, stale policies,
  malformed times and nonce inconsistencies. A private local recorder serializes
  queue/execute/prune with stale-revision refusal. Execute consumes off-chain
  approval only; no transaction is signed or broadcast. Same-store rollback or
  coherent falsification of history is not detectable through a local checksum.
- **CLI:** doctor/help/README require Node >=22. Descriptor-bound bounded reads,
  streaming UTF-8 decoding, exclusive private staged writes, explicit force
  replacement, symlink refusal and closed-pipe handling are exercised through the
  compiled entry. Stateless webhook verification continues to say
  `replayChecked:false`. Linux is qualified; Windows/macOS remain untested.
- **Plugin host:** contexts revoke after completion/timeout, including late reads;
  mutations serialize across contexts sharing the same storage-port object in one
  realm. Malformed indexes are rejected; failed value writes retain conservative
  key reservations. The storage port must provide atomic per-key updates and
  coherent reads; arbitrary torn-store recovery is not established. This is not
  cross-process database atomicity, CPU isolation or remote-code sandboxing.
  Revocation cannot undo an already-started host side effect.
- **Mock chain:** submitted and returned nested objects no longer alias internal
  state; faults/time advances are validated and failed transactions retain their
  failure on reorg replay. These tests establish simulator behavior only.

## Confirmed regression and independent-review ledger

Severity below describes the bounded preconditions, not a production exploitation
claim. All reproduction used local fixtures and disposable keys. There are no
remaining blocking findings in the claimed local scopes.

| ID / scope | Preconditions and reproduced behavior | Fix / regression | Independent check |
| --- | --- | --- | --- |
| B1-01, high correctness | Kill after outbox append before state rename, confirm dead lock and restart: one period produced two distinct payable nonces | Worker `a0f5023`; snapshot before projection; 21 subprocess tests with 14 boundaries | plugin reviewer ran 21 cases; final reminder/path fixes separately retested |
| B1-02, medium state integrity | Persisted reminder count lacked its corresponding latest reminder row | Same B1 commit; strict state and signature validation | Reviewer reproduction, focused test passed |
| B2-01, medium correctness | Runtime NaN/unsafe installment values accepted; a deposit later than its installment consumed oldest-first allocation | `e1fa212`; 29 numeric failures and separate chronology failure reproduced before fix | 47 focused tests independently passed |
| B3-01, medium configuration correctness | Valid stale HMAC request with NaN clock/tolerance bypassed freshness comparison; invalid retry policy admitted nonfinite output | `dbe737ed`, `acd8eff4`; initial 2 failures reproduced, 35 package tests pass | Root reviewed and found optional-clock edge; fixed in `a1ccf1e5` |
| B4-01, medium imported-state integrity | Valid signed queued payout with corrupted NaN/negative/null/string times executed before its one-hour timelock; reset next nonce also accepted | `71a708ad`; six failures reproduced; 92 final package tests pass | Subscription reviewer and root reviewed runtime/state/store; revision exhaustion found and fixed `248a2f0c` |
| B5-01, medium OS adapter correctness | Runtime mismatch, split UTF-8 chunks and unsafe file/output behavior | `7ac1400`; four original regressions failed; 67 unit and 6 compiled tests pass | Plugin reviewer independently checked Unicode, permissions, symlinks and ten racing output writers |
| B7-01, medium redirect-policy integrity | PrestaShop same-host redirect with embedded credentials or an arbitrary port was accepted | `aed18659`; strict credential/port refusal and PHP regressions | Webhook reviewer reproduced and retested |
| B6-01, medium checkout correctness | Real HPOS invoice metadata arrived newest-first; selecting the final row treated an expired older invoice as current and cancelled an order with a newer invoice | `a2fe1c0c`; select greatest persisted metadata ID; failing-before shim and real platform reproduction | Real legacy/HPOS 28-case run passed; coordinator repeated Woo177/Presta239 PHP assertions after integration |
| B8-01/02, medium capability/resource integrity | Late storage read after revoke; independent contexts overshot shared quota/index | `dd02f334`; 7 initial failing plugin cases fixed; final 45 package tests | CLI reviewer reran 10 lifecycle cases and 3 conformance checks |
| B8-03/04, low fixture correctness | Returned/submitted nested objects mutated simulator state; malformed fault/time controls accepted | Same B8 commit; 9 original failures fixed; final 36 package tests | CLI reviewer reran 15 integrity cases |

The new refund/batch workflow has 12 tests, including two-process cap contention,
SIGKILL before/after commit, unknown outcomes, changed confirmations, precision,
CSV formulas and corrupt-state rejection. Independent merchant reviewer repeated
all 12 and found no blocker within its fixture-only scope. Counts in this ledger
overlap worker and combined runs; do not add repetitions as unique tests.

## Reproduce local qualification

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm run lint
# PHP_BIN may select a private PHP executable with pdo_sqlite/sqlite3 enabled.
VITEST_MAX_WORKERS=1 node scripts/companion-merchant/qualify.mjs
node packages/cli/dist/bin.js doctor
node examples/merchant-operations/refund-demo.mjs
node examples/merchant-operations/approvals-demo.mjs
python3 scripts/companion-merchant/shop-packages.py --output /tmp/ghostpay-shop-evaluation
```

`qualify.mjs` serializes owned package coverage, compiled CLI, crash/concurrency
examples, independent digest vector, merchant-checkout, PHP shims, packaging,
secret scan and action-pin checks. It stops on the first failure. This is not a
substitute for real shop/browser acceptance or public-chain qualification.

Optional SQLite examples require Node >=22.13; actual execution here used
24.22.1. Private local state examples qualify POSIX local filesystems only, under
trusted parent directories. Power-loss hardware behavior, hostile ancestors,
network filesystems and store rollback are outside the demonstrated guarantees.

## Combined-source evidence

Runtime/source qualification checkpoint: local `1256992a3d2a5af1ac14d08a196ae6231b1f99bd`,
remote `7e04627e24ba798838c92e793467443c2ceeaeff`, common Git tree
`6390ad3d0f728926eb2d3c0569005184a5f1e036`.

The complete `qualify.mjs` run exited 0 on this combined tree:
**576 package tests**, **65 Node/subprocess tests**, **3 packaging tests**,
WooCommerce **175** and PrestaShop **239 PHP assertions**; no skips in these
owned suites. The independent digest vector, existing HTTP selftest, secret scan,
89 pinned Action references and diff check also passed. Package coverage thresholds
were not changed. The 65 cases comprise CLI 6, subscription 21, refund/approvals 19,
durable webhooks 9, plugin conformance 3 and merchant-checkout 7.

Full workspace build and typecheck passed with `NODE_OPTIONS=--max-old-space-size=768`;
all lint workspaces except web passed under that cap. Web lint exhausted the
artificial 768 MiB heap and is being retried at 1536 MiB; the broader whole-workspace
test run is recorded separately. The direct compiled doctor and both offline
merchant demos passed without network calls or fund movement.
The owned acceptance runner used `NODE_OPTIONS=--max-old-space-size=512`,
`VITEST_MAX_WORKERS=1` and a private PHP 8.4.27 executable with SQLite extensions.

A prior parallel aggregate run had `tsc` killed with exit 137 in unchanged
`address-safety`; aggregate tests/typecheck were then interrupted (exit 130).
Those runs are not passes. One B1 run hit child timeouts under the same load;
the subsequent serialized 21-case run passed. No timeout or rule was weakened.

GitHub shell push authentication was unavailable; the authorized connection
created ordinary commits and advanced the dedicated branch using expected-head
checks. Every remote tree was compared with the local Git tree before publication.
Remote commit IDs differ from local cherry-picks; their trees are identical.

Shop follow-up local `d1bdcc7f` adds the HPOS fix and a real-platform harness.
Coordinator repeated both PHP suites: **177 WooCommerce + 239 PrestaShop assertions
passed**. The shop worker's named WordPress 7.1.4 / WooCommerce 11.2.2 / MariaDB
11.8.8 fixture passed 28 callback/database checks. See
[shop evidence](shop-acceptance-20261109.md) for pins and remaining cases. An actual
Chromium launch was attempted but aborted before any page because
`process_singleton_posix.cc:297` could not create its Unix socket (`Operation not
permitted`). Rendered PHP HTML is not a browser pass.

## Reserved-owner requests and restart point

1. Track A retains all web, payment/core/crypto/chain/ledger, deployment/trust/fee,
   root manifest/lockfile/workflow and shared handoff ownership. No changes to those
   paths are needed for the local slices above.
2. Shared `docs/remote/usability/specs/cli.md` still states Node 20; its owner should
   align C12 with root Node >=22. CLI-owned help/doctor/docs are corrected here.
3. Index/completion-gate owner: link this companion acceptance ledger after review;
   retain parent Sonar, real refund authority, platform/browser and launch gates.
   CI owner: consider invoking `scripts/companion-merchant/qualify.mjs` in an owned,
   serialized Node/PHP job; this track does not change workflow definitions.
4. Resume from the dedicated companion PR's exact head; rerun the serialized
   acceptance runner after changes. Do not treat this draft as permission to merge
   main, publish a release, deploy publicly or enable funded scheduled agents.

## Integration request: original-payment and refund authority

The existing billing planner accepts a caller-supplied `OriginalPayment` and
destination; it does not independently authenticate either. Track A owns payment
truth and the merchant ledger. Track B will not make a duplicate verifier.
Before any real refund workflow can be accepted, Track A must supply an approved
interface binding original canonical payment identity, chain, asset, eligible
amount, invoice and authenticated fresh refund instructions, plus authoritative
submission reconciliation and definitive-failure evidence. Tests must reject
changed/reorged originals, stale/mismatched destination authorization and uncertain
submission outcomes. Local fixture tests do not close this boundary.
