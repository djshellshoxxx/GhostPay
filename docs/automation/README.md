# GhostPay autonomous development coordination

This directory records source-pinned work by the recurring GhostPay development task. It supplements
[the AI workflow](../ai/WORKFLOW.md) and [active ownership](../ai/ACTIVE_WORK.md); it does not replace
other workers' claims or authorize deployment. Read [MASTER_STATUS.md](MASTER_STATUS.md) first,
then [WORKER_HANDOFFS.md](WORKER_HANDOFFS.md) and [MERGE_QUEUE.md](MERGE_QUEUE.md).

## Shared integration lock

The dedicated remote branch `automation/ghostpay-integration-lock` stores only `integration-lock.json`.
Each transition is a new commit whose sole parent is the observed previous lock commit. Normal Git
push rejects competing sibling commits; the initial orphan-commit acquisition likewise has one winner.
No force push, branch deletion, local-only mutex, or read-then-overwrite status file is used.
The script never changes `main`, task branches, the working tree, or release settings.

```sh
node scripts/automation/integration-lock.mjs status
node scripts/automation/integration-lock.mjs acquire --owner cycle-UNIQUE-ID --ttl-seconds 3600
node scripts/automation/integration-lock.mjs assert --owner cycle-UNIQUE-ID --token RETURNED-TOKEN
node scripts/automation/integration-lock.mjs heartbeat --owner cycle-UNIQUE-ID --token RETURNED-TOKEN --ttl-seconds 3600
node scripts/automation/integration-lock.mjs release --owner cycle-UNIQUE-ID --token RETURNED-TOKEN
```

Use a unique owner for each cycle. Persist the returned state SHA, owner, token, generation, base SHA,
heartbeat and expiry in the cycle handoff. Renew while the coordinator remains active. Check ownership
immediately before each shared tracking push or protected integration/main operation. Fetch source and
target heads again and retain expected-head protection, current CI and independent-review gates.
Only the coordinator integrates; independent workers may continue on isolated nonoverlapping branches.

The default lease is one hour, and permitted durations are one second through six hours. Expiry blocks
integration and heartbeat; it does **not** release ownership or permit automatic takeover. A matching
owner/token may release an expired lock. After an interrupted run, first verify that the previous owner
and all its writers have stopped using run records and handoffs. If liveness is uncertain, preserve
isolated work and defer integration. Only after that verification may the recorded owner/token be used
to append a release and then acquire a new generation. Never rewrite the lock branch to recover it.

An ownership token identifies the cooperative generation; it is not a secret or an authorization grant.
The mechanism coordinates participating automation runs with authorized Git write access. It cannot
prevent an unrelated maintainer from ignoring the protocol. Existing external ownership, current remote
heads, PR protections and review rules remain mandatory. If Git access fails, state is malformed, the
push result is uncertain, read/write URLs differ, or ownership changes, stop integration and inspect
remote state. A failed or unconfirmed push is not evidence of acquired ownership; the remote may
already contain the attempted transition. Re-read and reconcile before retrying. Do not retry blindly.

The lock is independent of the scheduler: run exactly one cycle per scheduled activation. Do not create
nested schedules, sleep until the next cycle, or trigger paid external agents. Keep the configured
recurrence until the owner changes it. Actual execution capacity is one coordinator plus at most three
native workers at once; rotate auditing, implementation and independent verification roles in waves.

## Connected GitHub transport

This execution environment can fetch public Git history but has no Git push credentials. The observed
Git push failed with `could not read Username for https://github.com`. This was a transport credential
limit, not an approval-policy rejection. The already authorized GitHub connector established the same
protocol without changing repository permissions or retrieving credentials.

For that transport, use `create_tree` with only `integration-lock.json` and no base tree; `create_commit`
with the previous lock SHA as its sole parent; and `update_ref` with `expected_sha` equal to that observed
SHA and `force=false`. Initial acquisition uses atomic `create_branch` only when the ref is absent.
The connector requires an initial parent, so bootstrap used observed main `ffd982a7` rather than the
CLI's orphan commit. Both forms are readable by the tested CLI. Never overwrite an existing lock on
creation failure, and never merge this metadata-only control branch into an application or integration
branch. Exclude the control branch from source consolidation and branch cleanup.

A separate reviewer checked this fallback. The coordinator then confirmed the actual remote ref, commit
parent, single-file tree and owner/generation/token/timestamps. The approved CLI `assert` also passed
against the connector-created lock using read-only Git transport. Any future connector error remains
unconfirmed until immutable state and current ref readback resolve it. This fallback does not override
an access denial, approval rejection, required check or source-owner claim.

## Verification

`node --test scripts/tests/integration-lock.test.mjs` uses real temporary bare Git repositories and
separate clones. Receive hooks force concurrent pushes to reach the server before either ref update,
proving one winner both for a missing ref and a previously released ref. Other cases cover durable
readback, generation/history, ownership mismatch, expiry, rejected pushes, malformed state, split
remote destinations, annotated-tag exclusion, renewal clock boundaries and CLI validation. Every case
asserts that `main` remains unchanged; the tag regression checks the entire remote ref set. These tests
are included by the existing CI `scripts/tests/*.test.mjs` glob; no workflow or dependency change is needed.

Runtime code is reviewed separately from this documentation. See the cycle history for actual test
results and the remote lock establishment/release evidence. A configured requirement is not proof of an
executed cycle, and a local test pass is not hosted CI or release approval.
