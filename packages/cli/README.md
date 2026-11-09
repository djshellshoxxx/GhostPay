# GhostPay command line

Offline invoice and merchant planning tools. Requires **Node >=22** and the
repository's npm lockfile. No command broadcasts a payment, calls a live chain,
or sends a notification. The sandbox command uses fake in-memory funds.

## Fresh checkout

Run from the repository root:

```sh
npm ci --ignore-scripts
npm run build:packages
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js --help
```

`build:packages` builds the workspace libraries in dependency order, including
all six CLI dependencies and the compiled executable. `build:libs` alone does
not build all merchant dependencies. This private workspace is not a published
npm CLI; do not use `npx ghostpay` to select an unrelated registry package.
Paths with spaces work when quoted by your shell. Node 24.22.1/npm 11.9.0 on
Linux were exercised for the companion qualification; Windows/macOS filesystem
and shell behavior have not been qualified here.

## Inputs, output and secrets

Use `--json` for one result object on stdout; operational/usage errors go to
stderr as one object. Failed validation may return a result with `ok: false` on
stdout. Exit codes are 0 success, 1 failed validation, 2 usage, and 3 I/O.
Closed stdout/stderr pipes exit 3 without an uncaught stack.

Signing keys and webhook secrets must be hex in a file, stdin, or an explicitly
named environment variable (`--key-env NAME`/`--secret-env NAME`). Environment
values are not selected implicitly. Supplying multiple sources is an error;
there is no silent precedence. Private key files should be readable only by
the operator. Never put secret values on the command line. Only one input may
consume stdin; use `--in -` for that input.

Inputs are regular UTF-8 files: symlinks, FIFOs, directories and malformed UTF-8
are refused. The adapter opens once, reads through that descriptor in bounded
chunks, and checks size/timestamps for concurrent changes. Both the 1,048,576
UTF-16-code-unit limit and a 4 MiB UTF-8 byte limit apply; a file growing after
its initial stat cannot trigger an unbounded read. This is not an authenticated
snapshot against a process that can change the file and its metadata. Use a
private, stable input copy in trusted parent directories for reproducible processing.
On platforms without descriptor-level no-follow support, the preliminary symlink
check does not prevent a concurrent path swap. UTF-8 BOM bytes are
preserved, including when signing webhook bodies.

`--out FILE` publishes only if the destination does not exist. `--force`
explicitly permits replacement; concurrent forced writers use the last
published output. Publication stages a mode-0600 file in a private mode-0700
same-directory temporary folder, fsyncs it, and publishes atomically (exclusive
hard-link creation or replacement rename). Existing permissive permissions are
replaced with 0600, and existing symlink/non-file destinations are refused.
Parents must be trusted directories; this adapter does not lock parent directory
components against a hostile filesystem owner. A filesystem without hard-link
support refuses exclusive publication rather than falling back to partial writes.

On POSIX the parent directory is fsynced after publication. Windows skips
unsupported directory fsync; crash durability is filesystem-dependent. An error
after publication may mean the complete new output exists: inspect before retry.
Interruption before publication preserves the old output. SIGKILL/SIGTERM can
leave a private `.ghostpay-write-*` folder; inspect/remove it after confirming
no writer still uses it. Temporary files contain sensitive invoice/export data.

## Local journeys

Use `node packages/cli/dist/bin.js help COMMAND SUBCOMMAND` for exact options.
Invoice creation/signing accepts a JSON specification and uses secure random
nonces. `invoice verify` checks invoice integrity/expiry and optional signer pins;
a valid signature is not evidence of payment. Payment links are bearer data;
store them in private files where possible.

`webhook sign`/`verify` authenticate the exact valid UTF-8 body bytes without
trimming. `webhook verify` is stateless and always reports `replayChecked: false`
on success. Repeating verification in another invocation does not detect replay.
Use the receiver's durable replay/processing store for actual deliveries. A
valid HMAC authenticates the configured sender, not independent chain finality.

`sub schedule` computes UTC billing periods; it does not debit an account.
`batch preview` displays the exact plan and its hash. `batch confirm` recalculates
the plan and refuses a stale hash after a changed amount, destination or option;
it creates no payment. `export` prepares local accounting files. `sandbox chain
demo` exercises deterministic fake transfers and forced failure.

## Qualification

After the dependency-ordered build:

```sh
npm run typecheck -w @ghostpay/cli
npm run lint -w @ghostpay/cli
npm run test -w @ghostpay/cli -- --no-file-parallelism
node --test packages/cli/test/compiled.test.mjs
```

The compiled suite launches real Node subprocesses from a private directory
with spaces, using disposable generated secrets. It exercises doctor; unsigned
create → sign → verify → plain/encrypted link → verify; Unicode webhook body
sign/verify and stateless replay reporting; leap-day subscription periods;
batch preview/confirm/changed-input refusal; export; simulator; missing/malformed
inputs; file/stdin/environment secret sources; closed pipes; and SIGTERM at the
pre-rename boundary. Fault-injected descriptor tests cover growth/replacement,
nonregular input, partial writes, fsync/rename failure and concurrent exclusive
publication. These are local OS and simulator tests, not production acceptance.
