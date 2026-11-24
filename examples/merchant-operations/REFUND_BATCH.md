# Offline refund and batch operation fixture

This runnable example exercises existing merchant-billing planners and durable
local operation state. It **only accepts explicitly labelled fixtures**. The
default constructor refuses; its one original payment is a fixed fake payment.
No real payment-authority adapter is available. No signing, broadcasting,
remote requests or notifications occur. `fixture-confirmed` is a simulated
outcome, never independent blockchain finality.

Requirements: Node >=22.13 with built-in `node:sqlite`; qualified here on Node
24.22.1 and a local POSIX filesystem. From the repository root:

```sh
npm ci --ignore-scripts
npm run build:packages
node examples/merchant-operations/refund-demo.mjs
node --test examples/merchant-operations/refund-batch.test.mjs
```

`preview` persists a reservation; `approve` recomputes the same source/plan hash.
Changing any original, destination, amount, asset, chain or batch content refuses
the old confirmation. Submitted items remain `submitted-unknown` until an explicit
fixture outcome is recorded. A timeout never frees a refund reservation. Confirmed
refunds continue to consume the eligible amount; definitive failure frees it.
Only an unsubmitted plan can be invalidated. Batch outcomes are tracked per item,
including partial confirmation and uncertain remaining submissions.

All mutations use SQLite `BEGIN IMMEDIATE` with `journal_mode=DELETE` and
`synchronous=EXTRA`. Validation, cumulative bounds and replacement of the entire
bounded snapshot commit in the same transaction. Tests kill processes before and
after commit and race two processes. SQLite locking and recovery depend on the
local filesystem honoring locks/sync; network filesystems and Windows are not
qualified. The database resides in an owned 0700 directory with a 0600 file.
The parent path must be trusted and not concurrently replaced by the same OS user.
At 256 operations or 1 MiB, new operations fail closed; terminal identities are
never evicted. There is no pruning/migration utility yet. Untrusted modification,
deletion or rollback of the entire store is outside its authority: a checksum
cannot prove historical outcomes against an attacker who controls that store.

The existing planner's `OriginalPayment` type is a caller promise, not a verifier.
Before real use, Track A must supply an accepted interface for canonical original
payment/amount, authenticated refund instructions and definitive reconciliation.
See `docs/companion-merchant/ACCEPTANCE.md`. Do not replace the fixed fixture with
CLI JSON and call it verified. No real refund execution is included.

API references checked November 9, 2026:
[Node 24.22.1 SQLite](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html),
[SQLite synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous).
