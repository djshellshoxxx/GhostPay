# subscription-cron

Local recurring invoice/reminder issuance without custody. GhostPay cannot pull funds;
this runner does not send funds, email or SMS. A separate delivery process reads its
outbox, and payers pay voluntarily. `mark-paid` records the operator's manual
acknowledgement: it does **not** verify a blockchain payment.

## Setup and offline demo

Use Node >=22 on a local POSIX filesystem supporting atomic rename and file/directory
`fsync`. From the repository root:

```sh
npm ci --ignore-scripts
npm run build
node examples/subscription-cron/run.mjs init-demo --dir ./demo
node examples/subscription-cron/run.mjs run --config demo/sub.json --state demo/state.json --key-file demo/signing.key
node examples/subscription-cron/run.mjs recover --state demo/state.json
node examples/subscription-cron/run.mjs mark-paid --state demo/state.json --index 0
node examples/subscription-cron/run.mjs pause --state demo/state.json
node examples/subscription-cron/run.mjs resume --state demo/state.json
node examples/subscription-cron/run.mjs cancel --state demo/state.json --at-period-end
```

The demo uses disposable keys and fake receiving information; never receive funds
at its generated meta-address. `init-demo` refuses to overwrite existing files.
Edit config before first issuance. Amounts are decimal strings in fiat minor units.
The existing default dunning policy applies; no automatic debits or notifications.
`--now UNIX_SECONDS` is available for offline tests. Invalid/moved state,
configuration changes, invalid keys and invalid clocks fail closed with exit 2;
diagnostics never print config, keys or bearer links.

The directory must be owned by the current user and mode 700; files must be
owner-only regular files with one link (normally mode 600). Symlinks, FIFOs,
broadly readable files and oversized reads are refused. Keep ancestors trusted.
This example is not qualified on Windows, network filesystems or shared directories.

## Commit and recovery model

`STATE` is a version-1 snapshot containing config, subscription state and all
committed outbox records. Every record has a stable logical `eventId`:
`subscription:period:N:invoice` or `subscription:period:N:reminder:K`. The invoice
nonce and encrypted link remain cryptographically random and are saved together
with the advanced billing/reminder state **before any outbox publication**.

`STATE.outbox.jsonl` is a materialized view, replaced atomically from that snapshot.
The optional `--outbox` flag must name this exact path. Reserved state-name suffixes `.outbox.jsonl`, `.lock` and `.tmp` are refused,
so a state cannot alias another state’s generated files. Different state files cannot
share a projection. A run first restores the last committed projection, then commits
new work. `recover` only restores it. A crash during publication is recoverable from
the snapshot with the **same nonce and exact link**; a crash before snapshot commit
has not published a payable request. Partial/truncated projection content is replaced;
corrupt snapshot content stops issuance and requires operator reconciliation.
This is a single-file commit model, not an atomic transaction across two files.

Each update writes a private, exclusive temporary file, handles partial writes,
fsyncs it, renames in the same directory, then fsyncs that directory. The runner
never logs a link. Temporary files left by a killed process contain private state;
after establishing that the process is stopped, remove its stale `.tmp` files.
Power-loss behavior depends on the filesystem honoring these durability operations;
process-kill tests do not simulate failed hardware or prove storage power-loss behavior.

A `STATE.lock` file excludes concurrent commands. No timeout steals a lock. After a
crash it remains: establish that the original process is stopped and no process can
still use this state, **then** manually remove `STATE.lock` and run `recover` (or
`run` if no committed snapshot exists). Its PID is diagnostic only: PID reuse, host
changes and stale timestamps are not sufficient evidence that deletion is safe.
Ordinary caught errors remove their own lock; committed work is recovered next run.

Consumers must reread snapshots of the JSONL view and durably deduplicate by `eventId`.
Do not tail it by inode/offset or truncate it as an acknowledgement queue: it is replaced
and contains historical records. Check invoice expiry and current billing status before
delivery; cancel/pause cannot retract previously exported requests. Consumer exactly-once
remote effects require their own idempotency; this runner makes no such claim.

State is capped at 1,000 periods, 4,000 outbox records and 16 MiB. Reaching a bound
stops new commits; retention/archival is an explicit operator task and must preserve
issuance history/identity. An attacker able to replace the whole private snapshot can
roll it back; there is no independent rollback authority. Keep independent backups and
reconcile external deliveries before restoring an old copy.

Legacy unversioned state and append-only outboxes are **not** migrated automatically.
Before switching, stop the old runner, reconcile already delivered invoices/nonces and
manual payment acknowledgements, and retain the original private files. Starting from
an empty state to bypass this check can issue conflicting invoices and is not migration.
Automatic legacy migration remains outside this example's qualified scope.

## Executed regression coverage

```sh
node --test examples/subscription-cron/run.test.mjs
npm test -w @ghostpay/ux-schedule
```

The subprocess suite SIGKILLs issuance after temp-file creation, partial/full writes,
file fsync, rename, and before/after directory fsync for state and projection. It verifies
restart identity, live-lock exclusion, damaged-view recovery, corrupt-state refusal,
private-path/key/config checks, and manual lifecycle/reminder idempotency. Fault injection
is confined to a test-only preload; production commands do not load it.

The old ordering was reproduced at source `5628bc00`: killing after outbox append but
before state rename and restarting after confirmed lock cleanup yielded two distinct
nonces for one period. The current snapshot ordering closes that demonstrated gap.
Cron daemon scheduling, external delivery and real receiving addresses remain unqualified.
