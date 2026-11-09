# GhostPay command line

GhostPay's Node CLI provides local invoice and receipt exchange, encrypted backup
recovery, merchant planning, and explicitly enabled read-only chain checks. It is
offline by default. Live EVM verification requires `--online`, an operator-selected
RPC endpoint, and an independently obtained deployment trust pin. No CLI command
signs or broadcasts a funds-moving transaction, starts a payment subscription,
sends a notification, or enables an experimental chain policy. Invoice and seller
receipt signatures, together with webhook HMACs, authenticate local documents.

This reference covers every command in the current CLI registry. The GUI parity
and release evidence inventories are maintained separately; command availability
alone does not establish production qualification.

## Build, invocation and help

Requires **Node >=22** and the repository lockfile. From the repository root:

```sh
npm ci --ignore-scripts
npm run build:cli
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js --version
```

`build:cli` builds the CLI and its workspace dependencies in dependency order.
`build:packages` and `build:libs` build all library workspaces, including the CLI;
use either when running the additional merchant examples below. Every CLI build
stamps the source revision and working-tree state after TypeScript compilation.
This is a private workspace, not a published npm CLI; an
unrelated registry package selected by `npx ghostpay` is not this executable.

The examples below use `ghostpay` as a short name for the compiled executable.
For a POSIX shell, while remaining at the repository root:

```sh
ghostpay() { node packages/cli/dist/bin.js "$@"; }
```

For PowerShell:

```powershell
function ghostpay { & node packages/cli/dist/bin.js @args }
```

Alternatively replace `ghostpay` with `node packages/cli/dist/bin.js` in every
example. Quote paths containing spaces. PowerShell uses its own line-continuation
syntax; the multiline `sh` examples below use POSIX backslashes.

```sh
ghostpay --help
ghostpay payment --help
ghostpay payment verify --help
ghostpay help payment verify
ghostpay --help --json
```

`--json`, `--help`/`-h`, and `--version` are global switches. Command-specific
options follow the command. Unknown or repeated nonrepeatable options fail;
there is no silent option precedence. The command reference at the end includes
all accepted command-specific options, including optional secret-source variants.

## Results, exit codes and interpretation

With `--json`, normal results are one JSON object on stdout. Operational and
usage errors are one object on stderr:

```json
{"ok":false,"error":{"code":"ONLINE_REQUIRED","message":"…"}}
```

Some unsuccessful checks return a structured `ok: false` result on stdout with
exit 1. Capture both streams separately and check the process exit status. A
successful inspection can return `ok: true` together with `paymentVerified:
false`: parsing a document is a different operation from verifying a payment.
Existing command schemas are preserved; newer reports include `schemaVersion: 1`
where defined. Do not infer fields that a command does not return.

| Exit | Meaning | Typical case |
| --- | --- | --- |
| 0 | Requested operation succeeded | Valid document, completed local export, or qualifying live payment evidence |
| 1 | Validation or verification did not succeed | Bad signature, inconsistent evidence, pending finality, unknown payment status |
| 2 | Usage error | Missing option, conflicting secret sources, invalid numeric option |
| 3 | Input/output failure | Missing/private-file refusal, existing output, closed stdout/stderr pipe |
| 4 | Network failure | Unreachable RPC, unavailable transport, exhausted RPC budget |
| 5 | Unsupported operation, version or chain | Disabled live chain, unsupported exchange version, real refund execution |
| 6 | Configuration or trust failure | Wrong RPC chain, deployment mismatch, missing/incorrect manifest trust pin |

Stable `error.code` values identify the specific failure. An invalid request to
an unsupported operation can still be a usage error. `diagnostics rpc` exits 1
when reachable providers disagree; `payment verify` and `payment status` exit 1
for validly processed evidence that does not establish a final payment.

A seller signature establishes control of the supplied signing key and integrity
of signed fields. A checksum detects corruption. A webhook HMAC authenticates the
configured sender. None independently establishes a person's identity, recipient
ownership, payment, or current chain settlement. Historical `verified-at-scan`
records also require fresh verification before being treated as current evidence.

## Files, secrets and portability

### Explicit secret sources

Choose exactly one source **for each secret**. File/stdin sources carry values;
environment options carry variable **names**. Environment variables are never
selected implicitly. Populate the process environment through your existing
secret-management method; do not paste keys, passphrases, or endpoint values into
CLI arguments.

| Purpose | File option | Named environment option | Stdin option | Encoding |
| --- | --- | --- | --- | --- |
| Invoice signing key | `--key-file` | `--key-env` | `--key-stdin` | 32-byte hex secret scalar |
| Webhook secret | `--secret-file` | `--secret-env` | `--secret-stdin` | 32–1024 bytes, hex |
| Backup/link passphrase | `--passphrase-file` | `--passphrase-env` | `--passphrase-stdin` | UTF-8 text |
| Protected invoice supplied to receipt creation | `--invoice-passphrase-file` | `--invoice-passphrase-env` | `--invoice-passphrase-stdin` | UTF-8 text, separate from the seller-keystore passphrase |
| Replacement backup passphrase | `--new-passphrase-file` | `--new-passphrase-env` | `--new-passphrase-stdin` | UTF-8 text |
| Seller spending key | `--spending-key-file` | `--spending-key-env` | `--spending-key-stdin` | 32-byte hex secret scalar |
| Seller viewing key for backup/history/reconciliation | `--viewing-key-file` | `--viewing-key-env` | `--viewing-key-stdin` | 32-byte hex secret scalar |
| Seller signing key for backup creation | `--signing-key-file` | `--signing-key-env` | `--signing-key-stdin` | 32-byte hex secret scalar |
| Viewing key for scan commands | `--view-key-file` | `--view-key-env` | `--view-key-stdin` | 32-byte hex secret scalar |
| Primary RPC endpoint | `--rpc-file` | `--rpc-env` | `--rpc-file -` | HTTPS URL; explicit loopback HTTP exception |
| Secondary RPC endpoint | `--secondary-rpc-file` | `--secondary-rpc-env` | `--secondary-rpc-file -` | A different endpoint URL |

Only **one input per invocation** may consume stdin, including `--in -`,
passphrases, keys, endpoint URLs and binary archives. Other inputs must use files
or separately named environment variables. Environment names must match
`[A-Za-z_][A-Za-z0-9_]{0,127}`. Passphrases retain their content except for one
terminal line ending; the generic input limit is 1–1024 UTF-8 bytes without NUL,
and each backup codec additionally enforces its existing strength policy.

On POSIX, secret-file readers require an owned, regular, single-link file with no
group/other permission bits, normally mode `0600`. Symlinks and nonregular files
are refused. Keep parent directories private and trusted. **On Windows, private
secret-file reads fail closed because this adapter cannot qualify DACL privacy.**
Use stdin or named environment sources, including `--rpc-env` and
`--secondary-rpc-env`; this is a supported explicit alternative, not an implicit
fallback. Public documents and encrypted backup files remain normal file inputs.
Private scan reports use the protected reader too; on Windows feed a report to
`scan inspect --in -` or `scan run --resume -`, with credentials supplied from
named environment variables.

Examples with environment variables already provisioned:

```sh
ghostpay invoice sign --in unsigned.json --key-env GHOSTPAY_SIGNING_KEY --out invoice.json
ghostpay backup verify --in seller.json --passphrase-env GHOSTPAY_PASSPHRASE
ghostpay diagnostics rpc --chain 11155111 --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY --json
```

### Bounds and publication

| Boundary | Limit or rule |
| --- | --- |
| Normal UTF-8 input | 1,048,576 UTF-16 code units **and** 4 MiB encoded bytes |
| Binary archive input/output | 20 MiB; individual formats can impose smaller bounds |
| Seller keystore | 8 KiB, plus existing bounded scrypt parameters |
| Reconciliation envelope | 8,000,000 bytes; at most 2,000 observations, 500 invoices and 500 archived receipts |
| GPA1 tag archive | 20 MiB and at most 100,000 tag records |
| Signed receipt JSON | 65,536 UTF-8 bytes |
| QR payload | 32 KiB, up to 64 multipart frames; bounded input assembly accepts up to 128 scan texts |
| Safe settings exchange | 4,096 characters and 4,096 UTF-8 bytes; exactly five supported preferences |
| Deployment manifest / release keys | 16 KiB / at most 16 explicit compressed release public keys |
| RPC session | 256 total requests, 16 MiB total response text, 60-second session budget, no retries |
| Individual RPC request | At most 5 seconds and 1 MiB response; remaining session bounds can be smaller |
| Scan page | 1–10,000 blocks, at most 50 log queries, 1–256 accepted logs; default 128 |
| Scan report | Normal text-input size limit; at most 256 observations per report |
| Bitcoin header snapshot | At most 4,096 headers; independently supplied checkpoint |
| Current reconciliation context | 1–64 raw observations sharing one RPC session; the session budget can stop earlier |
| Accounting export / batch plan | At most 5,000 ledger entries / 10,000 configured batch recipients |

Normal text reads reject malformed UTF-8, symlinks, directories and FIFOs. They
use one descriptor, bounded reads and change detection. Binary backup commands
use a bounded binary reader so a valid encrypted archive is not constrained by
the normal text-input limit. UTF-8 BOM content is preserved, including when
signing a webhook body. A hostile process controlling the file and its metadata
is outside the snapshot guarantee; process a stable private copy.

`--out FILE` normally requires a new destination. A command that lists `--force`
may explicitly replace it. **Scan reports, backup generation/restoration, receipt
creation, and reconciliation successor/proposal files require new paths.**
`backup create` and `backup rekey`
follow the ordinary opt-in `--force` behavior; preserve older backups when
maintaining recovery history. An output path of `-` is not a stdout shortcut;
omit `--out` for commands that support terminal output.

Publication stages a complete file in a private same-directory temporary folder,
fsyncs it, and publishes atomically. POSIX output mode is `0600`; Windows does not
establish an equivalent DACL guarantee through Unix mode bits. Exclusive
publication uses a hard link and fails if the filesystem cannot support it.
Explicit replacement uses rename. Directory fsync is performed on POSIX;
Windows crash durability depends on the filesystem. An error after publication
can mean the complete new output already exists: inspect before retrying. A
killed process can leave a private `.ghostpay-write-*` folder; remove it only
after confirming that its writer has stopped. Parent directories must be trusted.

## Supported chain scope

`chain list` is the current static capability table; `chain assets` is the native
currency and token allowlist. Enabled EVM testnets are Ethereum Sepolia
(`11155111`), Base Sepolia (`84532`), OP Sepolia (`11155420`), Arbitrum Sepolia
(`421614`), Polygon Amoy (`80002`), BNB Smart Chain Testnet (`97`) and Avalanche
Fuji (`43113`). Configured EVM mainnets remain disabled for live GhostPay payment,
scan and reconciliation operations. Diagnostics can inspect a configured chain
without activating its payment policy.

Live payment verification covers the existing EVM direct-router, ERC-5564
scheme-1 path and allowlisted assets. Bitcoin support here is public BIP-352
address parsing and checkpoint-relative header validation, including offline
mainnet headers. Solana support is public meta-address and announcement-memo
inspection. TRON support is public address validation. These operations do not
add payment execution or qualify experimental adapters.

```sh
ghostpay chain list --json
ghostpay chain assets --chain 11155111 --json
ghostpay chain recipient inspect --family bitcoin --network testnet --in recipient.txt --json
ghostpay chain recipient inspect --family solana --in recipient.txt --json
ghostpay chain recipient inspect --family tron --in recipient.txt --json
ghostpay chain solana announcement inspect --in memo.txt --json
ghostpay chain bitcoin headers verify --in headers.json --checkpoint checkpoint.json --network regtest --json
```

For Bitcoin, the snapshot uses the shared `HeaderChain` version-1 serialization:
`version`, `network`, `checkpoint`, and `headers`. Supply the trusted checkpoint
separately as `{height, hash, headerHex, previousHeaders?}`. Headers are canonical
80-byte lowercase hex strings; checkpoint hashes omit `0x`. Header validity is
relative to that checkpoint. It does not prove transaction inclusion, scripts,
signet signatures, or selection of the heaviest public chain.

## Invoice, receipt and QR exchange workflows

The following examples use existing input files and named secret variables.
`invoice-spec.json` follows the invoice schema without generated `v`, `schemeId`
and `nonce`; a supplied signing key can also supply `signer`. Amounts use exact
decimal strings. Invoice inspection accepts bare or signed JSON, an existing
payment URL saved in a file, or an invoice fragment. URLs are parsed locally and
are never opened by these commands.

```sh
ghostpay invoice create --in invoice-spec.json --out unsigned.json
ghostpay invoice sign --in unsigned.json --key-env GHOSTPAY_SIGNING_KEY --out invoice.json
ghostpay invoice inspect --in invoice.json --json
ghostpay invoice verify --in invoice.json --expected-chain 11155111 --expected-asset native --json
ghostpay invoice link --in invoice.json --base https://pay.example.org/ --passphrase-env GHOSTPAY_LINK_PASSPHRASE --out payment-link.txt
ghostpay invoice verify --in payment-link.txt --passphrase-env GHOSTPAY_LINK_PASSPHRASE --json
```

For one-step signed creation, add `--key-env GHOSTPAY_SIGNING_KEY` to `invoice
create`. Use repeated `--pin PUBLIC_KEY` on `invoice verify` to compare independently
known seller signing keys. `--expected-recipient` refers to the invoice's public
meta-address; `--expected-amount` refers to its fixed token amount. Fiat-quote
invoices have no fixed token amount to compare. Inspect the separate
`expired`, `quoteExpired`, `signerPinned`, `supportedForPayment` and
`deploymentVerified` results. A valid invoice signature does not make a disabled
chain or unqualified deployment usable.

`invoice link --encrypt` produces the existing bearer-key encrypted link.
Passphrase protection uses a separate supplied passphrase. Store and deliver
links with the privacy appropriate to their contents. The CLI creates local
output; link delivery remains a separate action.

```sh
ghostpay receipt inspect --in receipt.json --json
ghostpay receipt verify --in receipt.json --invoice invoice.json --json
ghostpay receipt export --in receipt.json --out preserved-receipt.json
ghostpay qr encode --kind receipt --in receipt.json --out receipt.svg
ghostpay qr decode --kind receipt --in receipt.svg --out decoded-receipt.json
```

Receipt verification checks the actual seller signature. Optional `--pin`,
`--expected-chain`, `--expected-asset`, `--expected-amount`, `--expected-recipient`
and `--expected-tx` compare known facts. Here the recipient is the **stealth
payment address**, and the amount is **seller-net token base units**. Binding a
fixed-token invoice uses the shared router fee calculation; a fiat-quote invoice
requires an independently supplied `--expected-amount`. The offline receipt
verification result keeps `paymentVerified: false` and
`recipientOwnershipVerified: false`. Receipt creation uses the separate live
workflow below. Preserve the
original digital receipt file: a QR code represents its serialized bytes and is
not a replacement for the original signed artifact.

QR kinds are `invoice`, `receipt`, `seller`, `meta`, `settings` and `keystore`.
Each kind validates its existing format. The `keystore` kind accepts only the
encrypted seller-keystore envelope, checks its structure and reports
`authenticationVerified: false`; it never accepts plaintext seller secrets.
Authenticate a decoded keystore with `backup verify` before recovery. The
`settings` kind accepts the safe five-preference export and reports
`settingsApplied: false` without changing browser preferences, endpoints or trust
pins. Passphrase options on QR commands apply only to protected invoice links.

Single-code SVG generation uses a bounded inert module grid. Decoding accepts
that generated SVG format, scanned text and existing
`GPQ1` multipart transfers. Arbitrary SVG/XML, PNG/JPEG, camera capture and browser
clipboard/device access are unsupported.

```sh
ghostpay qr encode --kind invoice --in invoice.json --format multipart --chunk-chars 512 --out invoice-frames.json
ghostpay qr decode --kind invoice --in invoice-frames.json --out recovered-invoice-link.txt
ghostpay qr encode --kind invoice --in invoice.json --format multipart --chunk-chars 512 --frame 1 --out invoice-frame-1.svg
ghostpay qr encode --kind settings --in settings.json --out settings.svg
ghostpay qr decode --kind settings --in settings.svg --out decoded-settings.json
ghostpay qr encode --kind keystore --in seller.json --out encrypted-seller.svg
ghostpay qr decode --kind keystore --in encrypted-seller.svg --out decoded-seller.json
ghostpay backup verify --in decoded-seller.json --passphrase-env GHOSTPAY_PASSPHRASE --json
```

The multipart result reports `frameCount`. Render every one-based frame with the
same input and chunk size. For a transfer with two frames, render frame 2 and
assemble both SVGs as follows; larger transfers need the remaining frame files:

```sh
ghostpay qr encode --kind invoice --in invoice.json --format multipart --chunk-chars 512 --frame 2 --out invoice-frame-2.svg
ghostpay qr decode --kind invoice --in invoice-frame-1.svg --frame-file invoice-frame-2.svg --out recovered-link.txt
```

Missing, conflicting or mixed-session frames fail without publishing a partial
payload. `qr encode --format text` exports the validated canonical text form.
Signed invoice JSON becomes the GUI's existing invoice-fragment representation;
round trips preserve the signed payload rather than the original JSON whitespace.

```sh
ghostpay seller export-public --in public-source.json --out seller-public.json
ghostpay seller import-public --in incoming-public.json --current seller-public.json --out reviewed-public.json --json
```

`public-source.json` contains exactly `metaAddress`, `signerPublicKey` and
`chainIds`. The signing key must be separate from the payment keys, and chain
preferences must be enabled testnets. Import validates, compares and optionally
saves a canonical public copy. It reports repeated input and `applied: false`;
it does not change browser settings or establish seller trust. Compare public
keys through an independent trusted channel.

## Read-only RPC and payment evidence

Preflight a manifest offline, then select independently known trust material.
The digest displayed by inspection identifies the input; computing a digest from
an untrusted file does not independently authenticate that same file.

```sh
ghostpay chain deployment inspect --chain 11155111 --in deployment.json --json
ghostpay diagnostics rpc --chain 11155111 --online --rpc-env GHOSTPAY_RPC --json
ghostpay chain deployment verify --chain 11155111 --manifest deployment.json \
  --manifest-digest "$MANIFEST_DIGEST" --online --rpc-env GHOSTPAY_RPC --json
```

`MANIFEST_DIGEST` in these examples is the public `0x`-prefixed digest obtained
from an independent trusted source. An explicit `--release-key PUBLIC_KEY` may
replace the digest for a signed manifest; repeat it for additional trusted release
keys. If both kinds of trust material are supplied, both must pass. Contract
code hashes and router parameters are read back before live payment/scan work.
This does not enable a deployment policy or assert production readiness.

HTTPS is the default endpoint protocol. HTTP is allowed only for loopback hosts
with `--allow-insecure-localhost`; WebSocket endpoints are unsupported by this
CLI transport. URL userinfo and fragments are rejected. Each optional secondary
endpoint must differ from the primary after normalization. Distinct URLs alone
do not establish independent infrastructure or trustworthy providers. Reports
keep `providerTrustEstablished: false`; endpoint credentials are not printed.

A payment observation is a strict object with these fields:

| Field | Meaning |
| --- | --- |
| `version` | Number `1` |
| `family` | String `"evm"` |
| `chainId` | Numeric configured EVM chain ID |
| `log` | Raw ERC-5564 scheme-1 RPC log: `address`, `topics`, `data`, `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, optional boolean `removed` |
| `expected` | Required for live verification: `{recipient, asset, amount}` from the original request; amount is a positive decimal base-unit string, asset is `native` or a token address |

Raw log positions use canonical JSON-RPC quantities and hashes. Unknown fields,
duplicate JSON keys, removed logs and unsupported layouts fail closed. Imported
fields such as `verified: true` are not accepted as evidence. A scan observation
has no independently established expected payment facts; add those from the
original request before verification.

```sh
ghostpay payment inspect --in observation.json --json
ghostpay payment verify --in observation.json --manifest deployment.json \
  --manifest-digest "$MANIFEST_DIGEST" --online --rpc-env GHOSTPAY_RPC \
  --secondary-rpc-env GHOSTPAY_RPC_SECONDARY --out payment-check.json --json
ghostpay payment status --in observation.json --manifest deployment.json \
  --manifest-digest "$MANIFEST_DIGEST" --online --rpc-env GHOSTPAY_RPC --json
```

`payment status` performs a fresh check using the same verifier as `payment
verify`. Successful verification requires the exact direct router call, receipt,
asset transfer, recipient, amount, canonical block and configured finality.
Secondary evidence must agree when supplied. Final canonical block/head checks
run again before returning; the conservative confirmation count is used across
providers. The resulting scope is `operator-pinned-testnet`, with
`evidenceSource: live-rpc`, rather than independent consensus validation.

| Status | Meaning |
| --- | --- |
| `announced` | An announcement exists or parses; payment has not been established |
| `observed` | A transaction/receipt is observed, with insufficient qualifying payment evidence |
| `verified` | Qualifying direct-payment evidence currently meets the configured finality depth |
| `pending-finality` | Qualifying payment evidence exists but lacks the required confirmations |
| `failed` | A matching failing receipt was observed at the expected canonical location |
| `reorganization-detected` | Supplied or recently checked block evidence conflicts with current canonical history |
| `unknown` | Evidence is incomplete, unavailable, inconsistent or ahead of the reported head |

Only `verified` produces `paymentVerified: true` and `final: true`. Offline
inspection is always `evidenceSource: untrusted-input`. Keep the original
observation and independent expected facts when retaining a report; a saved
successful report is historical evidence and does not replace a later live check.

### Create a seller receipt

Receipt creation requires an authenticated seller keystore, independently
supplied expected payment facts, and a currently final payment owned by that
seller. Choose exactly one invoice-association mode:

| Selector | Invoice association checked at creation | Result fields |
| --- | --- | --- |
| `--invoice SIGNED_INVOICE` | Valid, unexpired **fixed-token** invoice; matching seller signer and receiving keys, chain, asset and exact seller-net amount using the shared router fee calculation | `invoiceBound: true`, `manualInvoiceDigest: false` |
| `--manual-invoice-digest 0xDIGEST` | Canonical 32-byte digest supplied by the operator; no invoice document, signature, expiry or invoice-to-payment match is verified | `invoiceBound: false`, `manualInvoiceDigest: true` |

For an invoice-bound receipt:

```sh
ghostpay receipt create --invoice invoice.json --observation observation.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --approve --out receipt-created.json --json
```

For a passphrase-protected invoice link, add the separate
`--invoice-passphrase-env GHOSTPAY_LINK_PASSPHRASE` option; `--passphrase-*` opens
the seller keystore. Manual mode rejects every `--invoice-passphrase-*` option,
because it does not read an invoice. To attest a manually supplied digest:

```sh
ghostpay receipt create --manual-invoice-digest "$INVOICE_DIGEST" \
  --observation observation.json --keystore seller.json \
  --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --approve --out receipt-manual.json --json
```

Set `INVOICE_DIGEST` to the public digest being attested: `0x` followed by exactly
64 lowercase hexadecimal characters. It is mutually exclusive with `--invoice`.
The manual receipt signs that digest alongside the verified payment's transaction,
recipient, asset and seller-net amount, while its invoice association remains
**unmatched and unverified**. It does not establish that the digest identifies a
valid invoice or that the payment satisfies one.

Both modes derive recipient ownership locally, require explicit `--online` and
`--approve`, and use the shared canonical payment verifier. The observation and
encrypted keystore, plus the invoice when supplied, must be repeatable files;
their contents are checked again before the final canonical block/finality check
and signature. Both creation reports retain
`paymentVerifiedAtCreation: true` within the `operator-pinned-testnet` scope and
`receiptIsPaymentProof: false`. They write the same canonical signed receipt
format; `invoiceBound` and `manualInvoiceDigest` describe the creation report,
not additional signed fields in the receipt. A later holder can authenticate
those signed fields, but must independently check current chain evidence and
any claimed invoice association. The new receipt file is published without
replacing an existing destination.

### Look up a public registry entry

```sh
ghostpay registry lookup --chain 11155111 \
  --registrant 0x1111111111111111111111111111111111111111 \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY --json
```

Registry lookup uses the GUI's existing ERC-6538 code-presence and getter probe
on enabled testnets. It returns the scheme-1 meta-address or `registered: false`;
optional providers must agree on the entry. Its runtime code hash is not
independently pinned, reflected by `registryCodePinned: false`. The entry alone
does not establish real-world identity, exclusive key ownership, payment or
provider trust. Registration and clearing transactions are outside this command.

## Privacy scanning and resumable pages

Scan planning requires no secret or network. A live scan reads public block
ranges; the viewing secret is used locally for matching and is not included in
RPC requests. Terminal output contains counts, while the private **unencrypted**
report contains matched public observations and an authenticated cursor. Treat
that report as sensitive transaction-history data.

```sh
ghostpay scan plan --chain 11155111 --from-block 100 --to-block 199 --max-logs 128 --json
ghostpay scan run --chain 11155111 --from-block 100 --to-block 199 \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --view-key-env GHOSTPAY_VIEWING_KEY --spend-public-file spending-public.hex \
  --out scan-page-1.json --json
ghostpay scan inspect --in scan-page-1.json --view-key-env GHOSTPAY_VIEWING_KEY --json
```

A valid spending public-key file contains compressed secp256k1 hex. Optional
`--deep` uses the shared router-announcement deep check when the view tag does not
match. It changes the scan scope, so it must be kept consistent on resume. A
match, including a deep match, remains an unverified announcement.

If `complete` is false, keep the previous report and resume the **same** key,
chain, manifest, range and mode into a new file:

```sh
ghostpay scan run --chain 11155111 --from-block 100 --to-block 199 \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --view-key-env GHOSTPAY_VIEWING_KEY --spend-public-file spending-public.hex \
  --resume scan-page-1.json --out scan-page-2.json --json
```

The cursor MAC is checked before any network request. Its saved checkpoint and
the fetched range are rechecked before publication; a reorganization or provider
disagreement preserves the earlier report and writes no replacement cursor.
Each page contains that page's observations, so retain all pages. A completed
range cannot be resumed; start a new explicit range. `scan inspect` without the
viewing key validates structure only and returns `authenticationVerified: false`.
Even a valid cursor MAC does not verify a payment or prove an RPC provider honest.

## Encrypted backups, history and reconciliation

Supported portable formats are the existing seller-keystore JSON, binary `GPA1`
tag archive, seller-scoped reconciliation JSON, and `GPVB1`/binary address-book
backup. `backup inspect` checks bounded structure only. `backup verify` decrypts,
authenticates and validates protected content, reporting counts without printing
keys or passphrases. Reconciliation uses its seller viewing key; the other
formats use their passphrase. A GPA1 archive's separately encrypted nested
history remains opaque, reported as `historyAuthenticated: false`.

```sh
ghostpay backup inspect --in seller.json --json
ghostpay backup verify --in seller.json --passphrase-env GHOSTPAY_PASSPHRASE --json
ghostpay backup restore --in seller.json --passphrase-env GHOSTPAY_PASSPHRASE --dry-run --json
ghostpay backup restore --in seller.json --passphrase-env GHOSTPAY_PASSPHRASE --approve --out seller-recovered.json
ghostpay backup rekey --in seller.json --out seller-new-passphrase.json \
  --passphrase-env GHOSTPAY_PASSPHRASE --new-passphrase-env GHOSTPAY_NEW_PASSPHRASE
```

Restoration writes a new authenticated **encrypted portable file**. It reports
`browserStorageChanged: false`: Node cannot populate GUI IndexedDB, localStorage
or the active browser's vault. Import the resulting encrypted file through the
GUI when browser restoration is intended. Reconciliation restoration retains
historical provenance and reorganization invalidations; it cannot create fresh
on-chain evidence. Reconciliation encryption follows the seller viewing key and
has no passphrase-rekey operation.

Generate independent seller spending, viewing and signing keys directly into a
new encrypted GUI-compatible keystore:

```sh
ghostpay backup generate --passphrase-env GHOSTPAY_PASSPHRASE --out seller-generated.json --json
```

Generation uses the shared secure random primitives and reports only public
meta-address/signing keys and counts. Secret key bytes are cleared after use;
there is no plaintext export. The encrypted destination must be new. To wrap
existing seller secrets in the same keystore format instead:

```sh
ghostpay backup create --spending-key-env GHOSTPAY_SPENDING_KEY \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --signing-key-env GHOSTPAY_SIGNING_KEY \
  --passphrase-env GHOSTPAY_PASSPHRASE --out seller.json
```

Creation uses the existing scrypt/AES-GCM format and validates seller-key relationships.
Keep the encrypted file and its
passphrase separately. Default publication preserves existing files; `create`
and `rekey` require explicit `--force` to replace one.

```sh
ghostpay history list --in history.json --viewing-key-env GHOSTPAY_VIEWING_KEY --limit 50 --offset 0 --json
ghostpay history list --in history.json --viewing-key-env GHOSTPAY_VIEWING_KEY --query 0x1234 --out matching-history.json
ghostpay history inspect --in history.json --viewing-key-env GHOSTPAY_VIEWING_KEY --record "$RECORD_ID" --json
ghostpay reconcile inspect --in history.json --viewing-key-env GHOSTPAY_VIEWING_KEY --json
```

`history list` defaults to 50 records; limit/offset are bounded at 2,000. History
and reconciliation inspection always report `currentChainVerified: false`.
Provenance, invalidations and canonical references remain visible. Locally
recorded values and imported labels do not become fresh payment evidence.

### Review and confirm an invoice association

Create an empty seller/chain scope, then register a signed fixed-token invoice
whose signer and receiving keys match the authenticated seller keystore:

```sh
ghostpay reconcile create --chain 11155111 --keystore seller.json \
  --passphrase-env GHOSTPAY_PASSPHRASE --out history-0.json
ghostpay reconcile register --in history-0.json --invoice invoice.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE --out history-1.json
```

For fresh review, `current.json` must contain exactly `version: 1` and
`observations: [...]`, with 1–64 raw payment observations, including their
independent expected facts. The full scan-report envelope is not this input
format. Include the full relevant competing-observation context. Existing saved
records also participate in matching. Every supplied current observation must
pass the shared live verifier and seller ownership check; one shared request
budget covers the entire context.

```sh
ghostpay reconcile propose --in history-1.json --observations current.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY --json
```

Review the returned candidates, then set `RECORD_ID` to the public record ID you
intend to associate. Export a uniquely exact proposal:

```sh
ghostpay reconcile propose --in history-1.json --observations current.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --record "$RECORD_ID" --out proposal.json --json
ghostpay reconcile confirm --in history-1.json --proposal proposal.json --observations current.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --approve --out history-2.json --json
```

A proposal expires after five minutes and binds the exact encrypted source,
observation bytes, record, invoice, manifest and captured provider configuration.
Confirmation re-verifies live evidence and ownership, rejects conflicting or
reused evidence, recomputes the match, checks finality/canonical hashes again,
and rechecks source bytes and expiry before publishing a new encrypted file.
Provider changes, dropping the secondary, source drift and stale proposals
require another review. The result is a **seller-confirmed local association**
under the operator-pinned testnet context; no funds are moved.

Without `--observations`, `reconcile propose` can list local proposals using the
viewing key, but it cannot export a confirmable proposal or claim current chain
verification. `--approve` is an explicit command switch; these commands do not
open an interactive approval prompt.

```sh
ghostpay reconcile import --in history-2.json --backup historical-copy.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --dry-run --json
ghostpay reconcile import --in history-2.json --backup historical-copy.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --approve --out history-merged.json
ghostpay reconcile archive-receipt --in history-2.json --receipt receipt.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE --out history-with-receipt.json
ghostpay reconcile export-receipts --in history-with-receipt.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --out original-receipts.json
```

Imports retain `imported-history` provenance, existing duplicate identities and
reorganization invalidations. Archived receipt signatures are checked against
the seller; archive/export operations do not independently verify payment.
Restore, import and association outputs are successors, never in-place updates
of an earlier encrypted file.

### Save current observations and maintain local records

Use `reconcile record` to save currently verified seller-owned payments without
confirming an invoice association. It verifies the entire bounded observation
context, then saves all current records or the single ID selected by `--record`:

```sh
ghostpay reconcile record --in history-2.json --observations current.json \
  --keystore seller.json --passphrase-env GHOSTPAY_PASSPHRASE \
  --manifest deployment.json --manifest-digest "$MANIFEST_DIGEST" \
  --online --rpc-env GHOSTPAY_RPC --secondary-rpc-env GHOSTPAY_RPC_SECONDARY \
  --approve --out history-recorded.json --json
```

With `--record`, an optional `--manual-invoice-digest` stores an explicitly
unverified annotation. The result keeps `invoiceAssociationConfirmed: false`;
use the reviewed proposal/confirmation workflow for a verified exact match.
Imported records and saved verification flags cannot replace current RPC and
ownership checks.

Local removal commands authenticate the encrypted source and publish a new
successor after explicit `--approve`:

```sh
ghostpay reconcile clear-records --in history-recorded.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --approve --out history-cleared.json --json
ghostpay reconcile remove-invoice --in history-recorded.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --invoice-digest "$INVOICE_DIGEST" \
  --approve --out history-without-invoice.json --json
ghostpay reconcile remove-receipt --in history-with-receipt.json \
  --viewing-key-env GHOSTPAY_VIEWING_KEY --all --approve --out history-without-receipts.json --json
```

`clear-records` removes observations while retaining invoices, receipt archives,
reorganization invalidation tombstones and any read-only saturation. Invoice
removal selects either one canonical `0x`-prefixed 32-byte digest or `--all` and
retains observation annotations. Receipt removal selects either the original
receipt's 128-character lowercase hex signature, without `0x`, using
`--receipt-signature`, or `--all`. All three retain reorganization invalidations
and report `currentChainVerified: false`; clearing local history cannot erase
its safety state or establish current payment evidence.

## Merchant planning, exports and diagnostics

The CLI uses the existing merchant packages and portable schemas. Durable
issuance, receiver replay processing and approval recording retain the example
entrypoints in the next section; the CLI does not implement a second scheduling
or transaction engine.

```sh
ghostpay merchant subscriptions validate --in subscription.json --json
ghostpay merchant subscriptions inspect --in state.json --json
ghostpay merchant installments plan --in installment-spec.json --out installments.json
ghostpay merchant installments inspect --in installments.json --json
ghostpay merchant webhooks inspect --in event.json --json
ghostpay merchant refunds inspect --in refund.json --state account.json --json
ghostpay merchant refunds status --in refund.json --state account.json --json
```

An installment specification has `total` as a decimal base-unit string,
`depositBps`, `count`, `startAt`, `firstDue`, `intervalSeconds`, and `tolerance`
with `underpayAbs`, `underpayBps`, `overpayAbs`, `overpayBps`. Times are Unix
seconds, absolute tolerances are decimal strings, and basis points are integers.
The generated ledger can be inspected with imported payment claims, but its
`reportedState` remains an unverified projection. Exact duplicate claims count
once; conflicting claims and future payment times fail.

Subscription validation uses the durable runner's actual configuration validator.
Snapshot inspection checks saved invoice signatures, periods, configuration and
outbox identity. `paid` states are manual operator acknowledgements. Webhook event
inspection validates schema/idempotency identity only. Refund inspection checks
off-chain proposal signatures against the **supplied** account policy; it does
not authenticate the policy, prove original payment, or establish current refund
authority. `merchant refunds execute` deliberately exits 5 with
`REFUND_EXECUTION_UNSUPPORTED`. The separate refund demo is a fixture.

```sh
ghostpay sub schedule --anchor 2028-01-31T00:00:00Z --cadence monthly:1 --count 4 --json
ghostpay split compute --total 10001 --share seller=7500 --share partner=2500 --json
ghostpay split compute --amount 12.34 --decimals 2 --share seller=7500 --share partner=2500 --json
```

Schedules are UTC and clamp month-end anchors without drifting. Cadences are
`monthly:N`, `weekly:N` or `custom:SECONDS`; `--from` is a period index. Splits use
exact integer arithmetic and shares totaling 10,000 basis points. Neither operation
debits an account.

A batch CSV uses the header `destination,amount,label`. Review its plan and
public preview hash, then repeat **all** options unchanged at confirmation:

```sh
ghostpay batch preview --csv payouts.csv --chain-id 11155111 --asset native \
  --decimals 18 --min 0.001 --per-recipient-max 1 --max-recipients 20 --max-total 5 --json
ghostpay batch confirm --csv payouts.csv --chain-id 11155111 --asset native \
  --decimals 18 --min 0.001 --per-recipient-max 1 --max-recipients 20 --max-total 5 \
  --hash "$PREVIEW_HASH" --json
```

`--duplicates reject|merge` controls duplicate destinations; `--allow-lowercase`
is an explicit address-policy option. Changed content or limits invalidate the
preview hash. Confirmation returns a plan identifier and creates no payment.

```sh
ghostpay export --in ledger-invoices.json --format csv --out accounting.csv
ghostpay export --in ledger-invoices.json --format xero --rounding half-even --out xero.csv
ghostpay export --in ledger-invoices.json --format iif --sales-account Sales --tax-account Tax --receivable-account Receivables --out accounting.iif
```

Export input is an array of merchant-ledger entries, or wrappers containing
`invoice` and optional `customer`, `status`, `paidMinor`. Supported output formats
are `csv`, `json`, `xero` and `iif`; rounding is `half-up`, `half-even`, `down` or
`up`. Formula-safe quoting/escaping is applied by the shared exporter. Exported
paid labels retain their input meaning and do not verify settlement.

```sh
ghostpay webhook sign --body-file event.json --secret-env GHOSTPAY_WEBHOOK_SECRET > signature.txt
ghostpay webhook verify --body-file event.json --header-file signature.txt --secret-env GHOSTPAY_WEBHOOK_SECRET --json
ghostpay config validate --kind subscription --in subscription.json --json
ghostpay config validate --kind merchant-account --in account.json --json
ghostpay config validate --kind deployment --in deployment.json --chain 11155111 --json
ghostpay config validate --kind webhook-event --in event.json --json
ghostpay config validate --kind settings --in settings.json --json
ghostpay diagnostics --out diagnostics.json --json
ghostpay doctor --json
ghostpay i18n check --json
ghostpay sandbox chain demo --seed local-demo --json
```

Webhook HMACs authenticate the exact valid UTF-8 body bytes; do not trim or
reserialize between signing and verification. CLI verification is stateless and
returns `replayChecked: false`. Persistent replay/processing protection belongs
to the receiver. `--nonce` is an optional explicit signature nonce for signing;
`--tolerance` bounds accepted timestamp age for verification. `--header` and
`--header-file` are mutually exclusive.

`config validate` checks only one supported schema/policy shape. Safe settings use
the existing envelope below; delay values are whole seconds from 0 through
86,400 with minimum at most maximum, idle lock is 1–240 minutes, and theme is
`system`, `light` or `dark`:

```json
{"format":"ghostpay-settings","v":1,"settings":{"delayMinSec":0,"delayMaxSec":60,"lockTimeoutMin":15,"theme":"system","autoClearFragment":true}}
```

Unknown keys, including endpoints and trust pins, are rejected. Settings
validation returns the canonical five-preference preview with `applied: false`
and `browserStorageChanged: false`. `qr encode --kind settings --format text`
can save a canonical exchange file without applying browser preferences.

`diagnostics` exports offline package/output-schema/Node versions, cryptographic
self-tests and `buildInfo: {sourceRevision, dirty}` without reading environment
credentials, endpoint configuration or user records. The build stamp contains
the 40-character Git revision and working-tree dirty boolean captured after
compilation. Source execution and builds without available Git metadata return
explicit `null` values. It contains no timestamp or host path and runs no Git
process when the CLI is invoked. A revision with `dirty: true` identifies the
checkout base, not the complete changed source contents. `doctor` performs the
offline installation checks directly. `i18n check` accepts repeated `--catalog LOCALE=FILE`
and optional `--base`; with no catalogs it checks the bundled samples. The sandbox
uses deterministic in-memory fake funds, including an injected failed transfer.

## Existing durable operator entrypoints

These are existing repository examples, not additional `ghostpay` subcommands.
Build the library workspaces first:

```sh
npm run build:packages
```

### Recurring invoice issuance

The POSIX durable runner owns subscription state and an outbox projection. Its
commands remain:

```sh
node examples/subscription-cron/run.mjs init-demo --dir ./demo
node examples/subscription-cron/run.mjs run --config demo/sub.json --state demo/state.json --key-file demo/signing.key
node examples/subscription-cron/run.mjs recover --state demo/state.json
node examples/subscription-cron/run.mjs mark-paid --state demo/state.json --index 0
node examples/subscription-cron/run.mjs pause --state demo/state.json
node examples/subscription-cron/run.mjs resume --state demo/state.json
node examples/subscription-cron/run.mjs cancel --state demo/state.json --at-period-end
```

`init-demo` uses disposable fixture keys and fake receiving information; those
addresses are unsuitable for real payments. `run` commits issuance identity,
nonce and link to the snapshot before publishing `STATE.outbox.jsonl`; `recover`
rebuilds the projection from committed state. `mark-paid` is a manual
acknowledgement. Issuance never pulls funds or sends email/SMS. A separate consumer
handles delivery and durably deduplicates the stable `eventId`.

The runner requires an owned private local POSIX state directory and its own
exclusive lock. A retained crash lock is never stolen by timeout. Confirm all
writers have stopped before the operator removes a stale lock and runs recovery.
State rollback and external delivery require separate reconciliation. See the
[subscription runner README](../../examples/subscription-cron/README.md) for
bounds, recovery, cancellation and migration details. Run its process tests with:

```sh
node --test examples/subscription-cron/run.test.mjs
```

### Durable webhook receiver

The existing receiver requires the built-in `node:sqlite` API, so its minimum is
**Node 22.13+**, stricter than the CLI's general major-version floor. Provision a
private secret file and state directory, then use the existing environment names:

```sh
WEBHOOK_SECRET_FILE=/private/webhook.secret WEBHOOK_STATE_DIR=/private/webhook-state node examples/webhook-receiver/server.mjs
```

This POSIX-shell example binds the server to its default loopback port `8788` and
accepts `POST /webhooks/ghostpay`. A shared local SQLite store commits the nonce,
immutable event-body identity and processing claim before handling. Completed
work is deduplicated durably. Unresolved work requires operator reconciliation;
a timeout does not prove that an external effect failed. The `store.reconcile`
API remains local, not an HTTP recovery route. HMAC authentication is not chain
verification. Full setup, file permissions, capacity and recovery semantics are
in the [receiver README](../../examples/webhook-receiver/README.md).

```sh
node examples/webhook-receiver/selftest.mjs
node --test examples/webhook-receiver/durable.test.mjs
```

### Local approval recorder and refund fixture

```sh
node examples/merchant-operations/approvals-demo.mjs
node --test examples/merchant-operations/approvals-store.test.mjs
node examples/merchant-operations/refund-demo.mjs
node --test examples/merchant-operations/refund-batch.test.mjs
```

The approval demo uses the existing `approvals-store.mjs` adapter to initialize,
queue, reload and consume fixture authorization. Local execution consumes a
recorded approval; it has no funds-moving callback and does not enforce authority
against an on-chain key holder. The recorder requires its private Linux/POSIX
filesystem/lock model and refuses Windows. See the
[approval recorder README](../../examples/merchant-operations/approvals-README.md).

The refund demo uses `FixtureOperations` from `refund-batch.mjs`, disposable state
and a synthetic transaction reference. Its preview/approve/submitted phases
exercise persistence and idempotency only. It cannot move real funds. Real refund
execution remains unavailable until original-payment verification and
refund-authority interfaces are accepted; running a successful fixture does not
change that boundary.

## Validation and qualification

From the repository root after the dependency-ordered build:

```sh
npm run typecheck -w @ghostpay/cli
npm run lint -w @ghostpay/cli
npm run test -w @ghostpay/cli -- --maxWorkers=2
npm run test:compiled -w @ghostpay/cli
npm run test:cli-build
```

The source suites exercise public command handlers with injected files, clock,
randomness and RPC transport while retaining the shared cryptographic and payment
verifiers. Coverage thresholds remain 95% statements/functions/lines and 90%
branches. Compiled tests exercise actual Node subprocess behavior and disposable
filesystem fixtures. These checks, simulated chain data, testnet configuration,
and ordinary CI jobs establish only their stated test scopes. They do not prove
production deployment authenticity, real merchant fulfillment, real refund
execution or every host filesystem's crash durability.

## Complete command reference

The entries below mirror the current registered command help and option sets.
`VALUE` means a required value for that option when the option is used;
`VALUE ...` marks a repeatable option. The usage line and notes determine which
options are required for the selected operation. All commands also accept
`--json` and `--help`; `--version` is global. Secret-source variants use the rules
above even when a usage example shows only the file variant.

### `invoice inspect`

Inspect invoice fields, version, signature and expiry without verifying payment.

```text
ghostpay invoice inspect --in FILE|- [--allow-insecure-localhost] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--expected-chain ID] [--expected-asset ASSET] [--expected-recipient META] [--expected-amount BASE_UNITS]
```

```sh
ghostpay invoice inspect --in invoice.json --json
```

Accepts bare/signed JSON, a payment URL or an invoice fragment. Expired invoices remain readable.

**Options:** `--in VALUE`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--expected-chain VALUE`, `--expected-asset VALUE`, `--expected-recipient VALUE`, `--expected-amount VALUE`

### `invoice create`

Build an invoice (optionally signed) from a JSON spec.

```text
ghostpay invoice create --in SPEC.json|- [--key-file P | --key-env NAME | --key-stdin] [--out F] [--force]
```

```sh
ghostpay invoice create --in spec.json --key-file signing-key.hex --out invoice.json
```

SPEC is the invoice fields without v/schemeId/nonce. With a key, "signer" is derived and the result is signed.

**Options:** `--in VALUE`, `--key-file VALUE`, `--key-env VALUE`, `--key-stdin`, `--out VALUE`, `--force`

### `invoice sign`

Sign an invoice with your signing key.

```text
ghostpay invoice sign --in INVOICE.json|- (--key-file P | --key-env NAME | --key-stdin) [--out F] [--force]
```

```sh
ghostpay invoice sign --in invoice.json --key-file signing-key.hex --out signed.json
```

**Options:** `--in VALUE`, `--key-file VALUE`, `--key-env VALUE`, `--key-stdin`, `--out VALUE`, `--force`

### `invoice verify`

Verify a signed invoice, payment link or fragment (offline).

```text
ghostpay invoice verify --in FILE|- [--pin SIGNER_PUBKEY]... [--allow-insecure-localhost] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--expected-chain ID] [--expected-asset ASSET] [--expected-recipient META] [--expected-amount BASE_UNITS]
```

```sh
ghostpay invoice verify --in invoice.json --expected-chain 84532 --expected-asset native --json
```

FILE holds signed JSON, a #gpi=v1. fragment or a payment URL. Exit 1 if the signature is bad, the invoice expired or no supplied pin matches. A matching pin confirms the expected key, not real-world seller identity or payment.

**Options:** `--in VALUE`, `--pin VALUE ...`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--expected-chain VALUE`, `--expected-asset VALUE`, `--expected-recipient VALUE`, `--expected-amount VALUE`

### `invoice link`

Turn a signed invoice into a payment link.

```text
ghostpay invoice link --in SIGNED.json|- --base https://pay.example/ [--encrypt] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost] [--out F] [--force]
```

```sh
ghostpay invoice link --in signed.json --base https://pay.example/ --passphrase-file private-passphrase.txt --out payment-link.txt
```

**Options:** `--in VALUE`, `--base VALUE`, `--encrypt`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--out VALUE`, `--force`

### `receipt create`

Sign a bound or manual-digest seller receipt after live payment and ownership verification.

```text
ghostpay receipt create (--invoice SIGNED_INVOICE | --manual-invoice-digest 0xHASH) --observation PAYMENT.json --keystore SELLER.json (--passphrase-file P | --passphrase-env NAME | --passphrase-stdin) --manifest DEPLOYMENT.json (--manifest-digest HASH | --release-key PUBLIC_KEY) --online (--rpc-file P | --rpc-env NAME) --approve --out NEW_RECEIPT.json [--secondary-rpc-file P | --secondary-rpc-env NAME] [--invoice-passphrase-file P | --invoice-passphrase-env NAME | --invoice-passphrase-stdin] [--allow-insecure-localhost]
```

```sh
ghostpay receipt create --invoice invoice.json --observation payment.json --keystore seller.json --passphrase-env SELLER_PASSPHRASE --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-env RPC_ENDPOINT --approve --out receipt.json
```

Choose exactly one invoice source. --invoice requires an unexpired signed fixed-token invoice matching the seller and exact seller-net amount. --manual-invoice-digest takes 0x plus 64 lowercase hex digits and creates an unmatched seller attestation with invoiceBound:false; the digest is not validated against any invoice. Invoice-passphrase options require --invoice. Both modes require independent expected payment facts, authenticated seller keys, full recipient ownership and fresh canonical finality. Observation, keystore and any supplied invoice must be repeatable files. Existing outputs are never replaced. Receipt signatures do not independently prove payment or real-world identity.

**Options:** `--invoice VALUE`, `--manual-invoice-digest VALUE`, `--observation VALUE`, `--keystore VALUE`, `--out VALUE`, `--approve`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--invoice-passphrase-file VALUE`, `--invoice-passphrase-env VALUE`, `--invoice-passphrase-stdin`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`

### `receipt inspect`

Inspect a validated signed seller receipt.

```text
ghostpay receipt inspect --in RECEIPT.json|-
```

```sh
ghostpay receipt inspect --in receipt.json --json
```

Valid signatures attest to key control; they do not independently establish payment.

**Options:** `--in VALUE`

### `receipt verify`

Verify a seller receipt signature without asserting payment.

```text
ghostpay receipt verify --in RECEIPT.json|- [--invoice SIGNED_INVOICE.json|LINK_FILE] [--pin PUBLIC_KEY] [--expected-chain ID] [--expected-asset ASSET] [--expected-amount SELLER_NET_BASE_UNITS] [--expected-recipient ADDRESS] [--expected-tx HASH] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]
```

```sh
ghostpay receipt verify --in receipt.json --invoice invoice.json --json
```

Fixed-token invoice binding uses the existing router fee math. Fiat quotes require an independently supplied seller-net amount. Signature and field consistency do not prove recipient ownership or on-chain payment.

**Options:** `--in VALUE`, `--invoice VALUE`, `--pin VALUE`, `--expected-chain VALUE`, `--expected-asset VALUE`, `--expected-amount VALUE`, `--expected-recipient VALUE`, `--expected-tx VALUE`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`

### `receipt export`

Export deterministic signed receipt JSON.

```text
ghostpay receipt export --in RECEIPT.json|- [--out FILE] [--force]
```

```sh
ghostpay receipt export --in receipt.json --out saved-receipt.json
```

Preserve the original digital receipt file rather than relying only on QR representations.

**Options:** `--in VALUE`, `--out VALUE`, `--force`

### `payment inspect`

Inspect an untrusted EVM payment announcement offline.

```text
ghostpay payment inspect --in observation.json [--json]
```

Input: version 1, family "evm", chainId, raw ERC-5564 log, optional expected {recipient, asset, amount}.

```sh
ghostpay payment inspect --in observation.json --json
```

An announcement and transaction hash do not establish payment.

**Options:** `--in VALUE`

### `payment verify`

Verify exact EVM payment evidence against live canonical RPC data.

```text
ghostpay payment verify --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--out report.json] [--json]
```

Alternatively use --release-key PUBLIC_KEY for an authenticated manifest signature.

```sh
ghostpay payment verify --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --json
```

Endpoint sources: --rpc-file PATH or --rpc-env NAME; optional --secondary-rpc-file PATH or --secondary-rpc-env NAME. Files must be private (0600 on POSIX); use named environment sources on Windows. HTTP is limited to explicit --allow-insecure-localhost. Only enabled testnets and direct scheme-1 router payments are supported. The expected recipient/asset/amount must come from the original request.

**Options:** `--in VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`, `--force`

### `payment status`

Refresh an EVM payment status with live verification.

```text
ghostpay payment status --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--out report.json] [--json]
```

Alternatively use --release-key PUBLIC_KEY for an authenticated manifest signature.

```sh
ghostpay payment status --in observation.json --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --json
```

Endpoint sources: --rpc-file PATH or --rpc-env NAME; optional --secondary-rpc-file PATH or --secondary-rpc-env NAME. Files must be private (0600 on POSIX); use named environment sources on Windows. HTTP is limited to explicit --allow-insecure-localhost. Only enabled testnets and direct scheme-1 router payments are supported. The expected recipient/asset/amount must come from the original request.

**Options:** `--in VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`, `--force`

### `merchant installments plan`

Create an exact deposit and installment schedule.

```text
ghostpay merchant installments plan --in SPEC [--out FILE] [--force]
```

SPEC: total (decimal string), depositBps, count, startAt, firstDue, intervalSeconds, tolerance.

```sh
ghostpay merchant installments plan --in installments.json --json
```

Planning only; never verifies payment or authorizes a transfer.

**Options:** `--in VALUE`, `--out VALUE`, `--force`

### `merchant installments inspect`

Validate a ledger and inspect its unverified payment projection.

```text
ghostpay merchant installments inspect --in LEDGER [--out REPORT]
```

```sh
ghostpay merchant installments inspect --in installments.json --json
```

Exact duplicate claims are counted once; conflicts and future timestamps fail. Imported payment claims never become verified payments.

**Options:** `--in VALUE`, `--out VALUE`, `--force`

### `merchant webhooks inspect`

Validate a webhook event and identify its idempotency key.

```text
ghostpay merchant webhooks inspect --in EVENT
```

```sh
ghostpay merchant webhooks inspect --in event.json --json
```

A valid event schema is not a valid HMAC, replay check or payment confirmation. Use webhook verify for the exact-byte signature check and the durable receiver for replay protection.

**Options:** `--in VALUE`

### `merchant subscriptions validate`

Validate the durable subscription runner configuration.

```text
ghostpay merchant subscriptions validate --in CONFIG
```

```sh
ghostpay merchant subscriptions validate --in subscription.json --json
```

Uses the same validator as examples/subscription-cron/run.mjs. Does not issue, sign or deliver an invoice.

**Options:** `--in VALUE`

### `merchant subscriptions inspect`

Validate and inspect a durable subscription snapshot.

```text
ghostpay merchant subscriptions inspect --in STATE
```

```sh
ghostpay merchant subscriptions inspect --in state.json --json
```

Validates invoice signatures, periods, configuration and outbox identity. Paid states are operator acknowledgements, not independent on-chain verification.

**Options:** `--in VALUE`

### `merchant refunds inspect`

Inspect off-chain refund approvals without executing a transfer.

```text
ghostpay merchant refunds inspect --in PROPOSAL --state ACCOUNT [--out REPORT]
```

```sh
ghostpay merchant refunds inspect --in refund.json --state account.json --json
```

Uses canonical merchant-multisig exchange files. Signatures are checked against the supplied policy; neither that policy nor an imported account snapshot establishes on-chain authority.

**Options:** `--in VALUE`, `--state VALUE`, `--out VALUE`, `--force`

### `merchant refunds status`

Inspect off-chain refund approvals without executing a transfer.

```text
ghostpay merchant refunds status --in PROPOSAL --state ACCOUNT [--out REPORT]
```

```sh
ghostpay merchant refunds status --in refund.json --state account.json --json
```

Uses canonical merchant-multisig exchange files. Signatures are checked against the supplied policy; neither that policy nor an imported account snapshot establishes on-chain authority.

**Options:** `--in VALUE`, `--state VALUE`, `--out VALUE`, `--force`

### `merchant refunds execute`

Explain the unavailable real-refund authority boundary.

```text
ghostpay merchant refunds execute
```

Always exits 5. Real refund execution requires accepted original-payment verification and refund-authority interfaces; the fixture workflow cannot move real funds.

**Options:** No command-specific options.

### `diagnostics`

Export offline installation diagnostics without credentials or user records.

```text
ghostpay diagnostics [--out REPORT] [--force] [--json]
```

```sh
ghostpay diagnostics --out diagnostics.json --json
```

Reports package/output-schema/Node versions, build-time source revision and dirty state (null when unavailable), and offline cryptographic self-tests. No endpoint is contacted and no provider trust is established. Use diagnostics rpc with explicit --online for RPC health.

**Options:** `--out VALUE`, `--force`

### `config validate`

Preflight an existing GhostPay configuration or exchange schema.

```text
ghostpay config validate --kind subscription|merchant-account|deployment|webhook-event|settings --in FILE [--chain ID]
```

```sh
ghostpay config validate --kind settings --in settings.json --json
```

Deployment validation requires --chain. Settings accepts only the existing ghostpay-settings v1 five-preference export. This checks schema and policy consistency only; it does not authenticate an operator policy, contact a provider, import browser settings or verify payment.

**Options:** `--kind VALUE`, `--in VALUE`, `--chain VALUE`

### `backup generate`

Generate independent seller keys directly into a new encrypted GUI-compatible keystore.

```text
ghostpay backup generate --passphrase-file FILE|--passphrase-env NAME|--passphrase-stdin --out NEW_FILE
```

```sh
ghostpay backup generate --passphrase-stdin --out seller.json --json
```

Uses the same key-generation primitives and encrypted format as the GUI. Existing outputs are never replaced. No plaintext key export, signing or network operation occurs; only public keys and counts are reported.

**Options:** `--out VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`

### `backup inspect`

Inspect supported encrypted backup structure without credentials.

```text
ghostpay backup inspect --in FILE [--json]
```

Supports seller keystore JSON, GPA1 tags, reconciliation JSON and GPVB1 address books. Inspection does not authenticate ciphertext.

```sh
ghostpay backup inspect --in seller-keystore.json --json
```

**Options:** `--in VALUE`

### `backup verify`

Authenticate backup contents and report counts without revealing secrets.

```text
ghostpay backup verify --in FILE (--passphrase-file FILE | --passphrase-stdin | --viewing-key-file FILE) [--json]
```

Reconciliation needs its seller viewing key; the other formats use their backup passphrase.

```sh
ghostpay backup verify --in tags.gpa --passphrase-file pass.txt --json
```

**Options:** `--in VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`

### `backup restore`

Validate and restore a new encrypted portable copy with explicit approval.

```text
ghostpay backup restore --in FILE [--out NEW_FILE] (--approve | --dry-run) [credential options]
```

Existing outputs are never replaced. Imports retain historical provenance and reorg invalidation. This writes a portable encrypted file; browser storage still needs an explicit GUI import.

```sh
ghostpay backup restore --in backup.json --viewing-key-file view.hex --out recovered.json --approve
```

**Options:** `--in VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`, `--approve`, `--dry-run`, `--force`

### `backup rekey`

Authenticate and re-encrypt a backup with a new passphrase.

```text
ghostpay backup rekey --in FILE --out NEW_FILE --passphrase-file OLD --new-passphrase-file NEW
```

Reconciliation follows seller-key scope and does not support passphrase rekey.

```sh
ghostpay backup rekey --in seller.json --out seller-new.json --passphrase-file old.txt --new-passphrase-file new.txt
```

**Options:** `--in VALUE`, `--out VALUE`, `--force`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--new-passphrase-file VALUE`, `--new-passphrase-env VALUE`, `--new-passphrase-stdin`

### `backup create`

Encrypt independent seller keys in the existing GUI keystore format.

```text
ghostpay backup create --spending-key-file FILE --viewing-key-file FILE --signing-key-file FILE --passphrase-file FILE --out FILE
```

No key or passphrase values are accepted on argv. Uses the existing scrypt/AES-GCM profile.

```sh
ghostpay backup create --spending-key-file spend.hex --viewing-key-file view.hex --signing-key-file sign.hex --passphrase-file pass.txt --out seller.json
```

**Options:** `--out VALUE`, `--force`, `--spending-key-file VALUE`, `--spending-key-env VALUE`, `--spending-key-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--signing-key-file VALUE`, `--signing-key-env VALUE`, `--signing-key-stdin`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`

### `chain list`

List configured chains and their actual support gates.

```text
ghostpay chain list [--json]
```

```sh
ghostpay chain list --json
```

Enabled testnets are development support, not qualified production deployments.

**Options:** No command-specific options.

### `chain assets`

Inspect configured native currency and allowlisted tokens.

```text
ghostpay chain assets --chain CHAIN_ID [--json]
```

```sh
ghostpay chain assets --chain 11155111 --json
```

This static table does not authenticate a deployment or override disabled chains.

**Options:** `--chain VALUE`

### `chain recipient inspect`

Validate public EVM/Solana meta-addresses, Bitcoin silent addresses or TRON addresses.

```text
ghostpay chain recipient inspect --family evm|bitcoin|solana|tron --in recipient.txt [--network mainnet|testnet] [--json]
```

```sh
ghostpay chain recipient inspect --family bitcoin --network testnet --in recipient.txt --json
```

Validation checks format and checksums only. It proves neither recipient identity nor payment.

**Options:** `--family VALUE`, `--in VALUE`, `--network VALUE`

### `chain solana announcement inspect`

Decode a public Solana announcement memo without claiming payment evidence.

```text
ghostpay chain solana announcement inspect --in memo.txt [--json]
```

```sh
ghostpay chain solana announcement inspect --in memo.txt --json
```

Validates the existing announcement encoding and point. Metadata is opaque; no network, recipient ownership, transfer or finality is checked.

**Options:** `--in VALUE`

### `chain bitcoin headers verify`

Revalidate a Bitcoin header chain against a separately pinned checkpoint.

```text
ghostpay chain bitcoin headers verify --in headers.json --checkpoint checkpoint.json --network mainnet|testnet4|signet|regtest [--json]
```

```sh
ghostpay chain bitcoin headers verify --in headers.json --checkpoint checkpoint.json --network regtest --json
```

The checkpoint must come from a trusted independent source. Valid headers do not prove transaction inclusion, scripts, signet signatures or that a provider supplied the heaviest public chain. At most 4096 headers per file.

**Options:** `--in VALUE`, `--checkpoint VALUE`, `--network VALUE`

### `chain deployment inspect`

Validate a deployment manifest and inspect optional trust pins offline.

```text
ghostpay chain deployment inspect --chain CHAIN_ID --in deployment.json [--manifest-digest 0xDIGEST] [--release-key PUBLIC_KEY] [--json]
```

```sh
ghostpay chain deployment inspect --chain 11155111 --in deployment.json --json
```

Schema validation and a signature do not establish that contracts exist or that a payment occurred.

**Options:** `--chain VALUE`, `--in VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`

### `chain deployment verify`

Read back pinned testnet deployment code and contract parameters.

```text
ghostpay chain deployment verify --chain CHAIN_ID --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--json]
```

```sh
ghostpay chain deployment verify --chain 11155111 --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt
```

--release-key PUBLIC_KEY may replace the digest for signed manifests. --rpc-env NAME and --secondary-rpc-env NAME replace the corresponding endpoint files. No feature is activated and no transaction is signed.

**Options:** `--chain VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`

### `diagnostics rpc`

Check RPC reachability, chain identity and current block without trusting the provider.

```text
ghostpay diagnostics rpc --chain CHAIN_ID --online --rpc-file rpc.txt [--secondary-rpc-file second.txt] [--out report.json] [--json]
```

```sh
ghostpay diagnostics rpc --chain 11155111 --online --rpc-file rpc.txt --json
```

Use --rpc-env NAME and --secondary-rpc-env NAME instead of the corresponding files on Windows. Endpoint files must be private (0600 on POSIX). Add --allow-insecure-localhost only for loopback HTTP. A responding endpoint is not proof of a trustworthy provider.

**Options:** `--chain VALUE`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`, `--force`

### `history list`

List authenticated local transaction history without promoting its trust.

```text
ghostpay history list --in RECONCILIATION_JSON --viewing-key-file KEY [--query TEXT] [--limit 50] [--offset 0] [--out REPORT] [--json]
```

Reverify historical records with payment verify before treating them as current-chain evidence.

```sh
ghostpay history list --in history.json --viewing-key-file view.hex --json
```

**Options:** `--in VALUE`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--query VALUE`, `--limit VALUE`, `--offset VALUE`, `--out VALUE`, `--force`

### `history inspect`

Inspect the exact canonical references of a historical observation.

```text
ghostpay history inspect --in RECONCILIATION_JSON --viewing-key-file KEY --record RECORD_ID [--json]
```

```sh
ghostpay history inspect --in history.json --viewing-key-file view.hex --record ID --json
```

**Options:** `--in VALUE`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--record VALUE`

### `qr encode`

Encode public payloads, safe preferences or an encrypted seller keystore.

```text
ghostpay qr encode --kind invoice|receipt|seller|meta|keystore|settings --in FILE|- [--format svg|multipart|text] [--chunk-chars 32..700] [--frame INDEX] [--out FILE] [--force] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]
```

```sh
ghostpay qr encode --kind receipt --in receipt.json --out receipt.svg
```

Multipart output contains scan texts for up to 64 QR frames. Add --frame 1 to render the first frame as SVG, repeating for each one-based index with identical input and chunk size. Preserve the original digital file. Keystores are structure-checked encrypted envelopes only; use backup verify for authentication. Settings exclude endpoints and trusted keys and are never applied. Passphrase options apply only to protected invoice links.

**Options:** `--in VALUE`, `--kind VALUE`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--out VALUE`, `--force`, `--format VALUE`, `--chunk-chars VALUE`, `--frame VALUE`

### `qr decode`

Decode bounded generated SVGs, scanned public text or multipart QR transfers.

```text
ghostpay qr decode --kind invoice|receipt|seller|meta|keystore|settings --in FILE|- [--frame-file FILE ...] [--out FILE] [--force] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]
```

```sh
ghostpay qr decode --kind receipt --in receipt.svg --out receipt.json
```

Repeat --frame-file for additional multipart SVGs or scan-text files (up to 64 files total). SVG input must use the inert module-grid format generated by this CLI. PNG/JPEG/camera capture are not accepted; scanned text and GPQ1 chunks are supported. No URLs are opened. Keystore structure is checked without decrypting or authenticating it; run backup verify afterward. Settings are a safe preview and are never applied.

**Options:** `--in VALUE`, `--kind VALUE`, `--allow-insecure-localhost`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--out VALUE`, `--force`, `--frame-file VALUE ...`

### `seller export-public`

Export public seller keys and enabled testnet preferences.

```text
ghostpay seller export-public --in SOURCE.json|- [--out FILE] [--force]
```

SOURCE contains exactly metaAddress, signerPublicKey and chainIds; never secret keys.

```sh
ghostpay seller export-public --in public-source.json --out seller-public.json
```

**Options:** `--in VALUE`, `--out VALUE`, `--force`

### `seller import-public`

Validate and preview public seller config, including repeated imports.

```text
ghostpay seller import-public --in PUBLIC.json|- [--current PUBLIC.json] [--out FILE] [--force]
```

```sh
ghostpay seller import-public --in incoming.json --current current.json --json
```

No key import, trust change or device setting is applied. --out saves a canonical public copy only.

**Options:** `--in VALUE`, `--current VALUE`, `--out VALUE`, `--force`

### `scan plan`

Preview a bounded EVM scan range and public query budgets offline.

```text
ghostpay scan plan --chain CHAIN_ID --from-block N --to-block N [--max-logs 128] [--json]
```

```sh
ghostpay scan plan --chain 11155111 --from-block 100 --to-block 199 --json
```

At most 10000 blocks, 50 log requests and 256 accepted logs per page. No keys or network are used.

**Options:** `--chain VALUE`, `--from-block VALUE`, `--to-block VALUE`, `--max-logs VALUE`

### `scan run`

Scan one bounded EVM page with local viewing keys and authenticated resume state.

```text
ghostpay scan run --chain CHAIN_ID --from-block N --to-block N --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --view-key-file view.key --spend-public-file spend.pub --out new-scan.json [--resume prior-scan.json] [--deep] [--max-logs 128] [--json]
```

```sh
ghostpay scan run --chain 11155111 --from-block 100 --to-block 199 --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --view-key-file view.key --spend-public-file spend.pub --out scan.json
```

Use --rpc-env NAME and --secondary-rpc-env NAME instead of the corresponding endpoint files on Windows. Outputs only counts to the terminal. The new private report contains unverified observations and an authenticated cursor; never overwrite prior reports. Viewing keys stay local. A match is not payment evidence. Add expected recipient/asset/amount from the original request before payment verify.

**Options:** `--chain VALUE`, `--from-block VALUE`, `--to-block VALUE`, `--max-logs VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--view-key-file VALUE`, `--view-key-env VALUE`, `--view-key-stdin`, `--spend-public-file VALUE`, `--out VALUE`, `--resume VALUE`, `--deep`

### `scan inspect`

Inspect a private scan report without trusting its observations as payments.

```text
ghostpay scan inspect --in scan.json [--view-key-file view.key] [--json]
```

```sh
ghostpay scan inspect --in scan.json --json
```

Without a viewing key this checks structure only. With --view-key-file, --view-key-stdin or --view-key-env NAME it also authenticates the saved cursor. No network or payment verification occurs.

**Options:** `--in VALUE`, `--view-key-file VALUE`, `--view-key-env VALUE`, `--view-key-stdin`

### `reconcile inspect`

Inspect local reconciliation counts, conflicts and invalidations.

```text
ghostpay reconcile inspect --in history.json --viewing-key-file view.hex [--json]
```

```sh
ghostpay reconcile inspect --in history.json --viewing-key-file view.hex --json
```

**Options:** `--in VALUE`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`

### `reconcile create`

Create an encrypted seller-scoped local reconciliation file.

```text
ghostpay reconcile create --chain ID --keystore seller.json --passphrase-file pass.txt --out history.json
```

```sh
ghostpay reconcile create --chain 11155111 --keystore seller.json --passphrase-file pass.txt --out history.json
```

**Options:** `--chain VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile register`

Register a signed fixed-amount invoice in the seller scope.

```text
ghostpay reconcile register --in history.json --invoice invoice.json --keystore seller.json --passphrase-file pass.txt --out next.json
```

```sh
ghostpay reconcile register --in history.json --invoice invoice.json --keystore seller.json --passphrase-file pass.txt --out next.json
```

**Options:** `--in VALUE`, `--invoice VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile propose`

List local proposals or export one bound to freshly verified observations.

```text
ghostpay reconcile propose --in history.json --viewing-key-file view.hex [--json]
```

Confirmable export: add --keystore seller.json --passphrase-file pass.txt --observations current.json --online --rpc-file rpc.txt --manifest deployment.json --manifest-digest 0xHASH --record ID --out proposal.json

Current input: {"version":1,"observations":[payment-observation,...]} (1–64). The shared RPC budget applies to the whole context. Proposals expire after five minutes and never confirm payment by themselves.

**Options:** `--in VALUE`, `--record VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--observations VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`

### `reconcile confirm`

Explicitly confirm a reviewed proposal after live canonical revalidation.

```text
ghostpay reconcile confirm --in history.json --proposal proposal.json --observations current.json --keystore seller.json --passphrase-file pass.txt --manifest deployment.json --manifest-digest 0xHASH --online --rpc-file rpc.txt --approve --out next.json
```

Rechecks exact source bytes, all supplied current observations, seller ownership, duplicate evidence, matching context, block hashes and finality. Writes a new encrypted file; no fund movement.

Example: use the same files and provider options as reconcile propose, then add --proposal proposal.json --approve --out next.json

**Options:** `--in VALUE`, `--proposal VALUE`, `--approve`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--observations VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`

### `reconcile record`

Persist freshly verified owned payments without confirming an invoice match.

```text
ghostpay reconcile record --in history.json --observations current.json --keystore seller.json --passphrase-file pass.txt --manifest deployment.json --manifest-digest 0xHASH --online --rpc-file rpc.txt --approve --out next.json [--record ID] [--manual-invoice-digest 0xHASH]
```

Verifies the entire bounded current context and saves all its records, or the selected --record. A manual invoice annotation requires a selected record and is not verified or automatically matched. Imported files alone never supply live evidence.

```sh
ghostpay reconcile record --in history.json --observations current.json --keystore seller.json --passphrase-env SELLER_PASS --manifest deployment.json --manifest-digest 0xHASH --online --rpc-env RPC_ENDPOINT --approve --out next.json
```

**Options:** `--in VALUE`, `--record VALUE`, `--manual-invoice-digest VALUE`, `--approve`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--observations VALUE`, `--manifest VALUE`, `--manifest-digest VALUE`, `--release-key VALUE ...`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`

### `reconcile clear-records`

Clear local observations while retaining reorg invalidation history.

```text
ghostpay reconcile clear-records --in history.json --viewing-key-file view.hex --approve --out next.json
```

Clears only observations. Invalidation tombstones, read-only saturation, invoices and signed receipt archives remain in the new encrypted successor.

```sh
ghostpay reconcile clear-records --in history.json --viewing-key-file view.hex --approve --out next.json
```

**Options:** `--in VALUE`, `--approve`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile remove-invoice`

Remove local invoice registrations from an immutable encrypted successor.

```text
ghostpay reconcile remove-invoice --in history.json --viewing-key-file view.hex (--invoice-digest 0xHASH | --all) --approve --out next.json
```

Existing observation annotations and reorg invalidation history are retained.

```sh
ghostpay reconcile remove-invoice --in history.json --viewing-key-file view.hex --all --approve --out next.json
```

**Options:** `--in VALUE`, `--invoice-digest VALUE`, `--all`, `--approve`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile remove-receipt`

Remove archived seller receipts from an immutable encrypted successor.

```text
ghostpay reconcile remove-receipt --in history.json --viewing-key-file view.hex (--receipt-signature HEX | --all) --approve --out next.json
```

Uses the canonical 64-byte signature from the original digital receipt. Reorg invalidation history and observations are retained.

```sh
ghostpay reconcile remove-receipt --in history.json --viewing-key-file view.hex --all --approve --out next.json
```

**Options:** `--in VALUE`, `--receipt-signature VALUE`, `--all`, `--approve`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile import`

Merge encrypted historical backup without upgrading its payment trust.

```text
ghostpay reconcile import --in history.json --backup archive.json --viewing-key-file view.hex (--dry-run | --approve --out merged.json)
```

```sh
ghostpay reconcile import --in history.json --backup archive.json --viewing-key-file view.hex --dry-run --json
```

**Options:** `--in VALUE`, `--backup VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--approve`, `--dry-run`, `--out VALUE`

### `reconcile archive-receipt`

Archive a valid receipt from this seller without treating it as payment proof.

```text
ghostpay reconcile archive-receipt --in history.json --receipt receipt.json --keystore seller.json --passphrase-file pass.txt --out next.json
```

```sh
ghostpay reconcile archive-receipt --in history.json --receipt receipt.json --keystore seller.json --passphrase-file pass.txt --out next.json
```

**Options:** `--in VALUE`, `--receipt VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `reconcile export-receipts`

Export archived signed digital receipts after verifying their signatures.

```text
ghostpay reconcile export-receipts --in history.json --viewing-key-file view.hex --out receipts.json
```

Preserve the original digital receipts; QR codes only represent these serialized files.

```sh
ghostpay reconcile export-receipts --in history.json --viewing-key-file view.hex --out receipts.json
```

**Options:** `--in VALUE`, `--keystore VALUE`, `--passphrase-file VALUE`, `--passphrase-env VALUE`, `--passphrase-stdin`, `--viewing-key-file VALUE`, `--viewing-key-env VALUE`, `--viewing-key-stdin`, `--out VALUE`

### `registry lookup`

Read a public ERC-6538 scheme-1 entry with explicit bounded RPC consent.

```text
ghostpay registry lookup --chain ID --registrant ADDRESS --online (--rpc-file FILE | --rpc-env NAME) [--secondary-rpc-file FILE | --secondary-rpc-env NAME] [--allow-insecure-localhost] [--out REPORT] [--force] [--json]
```

```sh
ghostpay registry lookup --chain 11155111 --registrant 0x1111111111111111111111111111111111111111 --online --rpc-env TESTNET_RPC --json
```

Uses the GUI registry code-presence and getter probe on enabled testnets. The runtime code hash is not independently pinned. A stored entry does not prove real-world identity, exclusive key ownership or payment. No registration or clearing transaction is signed or sent.

**Options:** `--chain VALUE`, `--registrant VALUE`, `--online`, `--rpc-file VALUE`, `--rpc-env VALUE`, `--secondary-rpc-file VALUE`, `--secondary-rpc-env VALUE`, `--allow-insecure-localhost`, `--out VALUE`, `--force`

### `webhook sign`

Compute a GhostPay-Signature header for a body.

```text
ghostpay webhook sign --body-file F|- (--secret-file P | --secret-env NAME | --secret-stdin) [--nonce HEX]
```

Body bytes are signed exactly as read (no trimming). Secret is hex, >= 32 bytes.

**Options:** `--body-file VALUE`, `--nonce VALUE`, `--secret-file VALUE`, `--secret-env VALUE`, `--secret-stdin`

### `webhook verify`

Check a GhostPay-Signature header against a body.

```text
ghostpay webhook verify --body-file F|- (--header V | --header-file F) (--secret-file P | --secret-env NAME | --secret-stdin) [--tolerance SECONDS]
```

Exit 1 with reason malformed|stale|bad-signature|replay.

**Options:** `--body-file VALUE`, `--header VALUE`, `--header-file VALUE`, `--tolerance VALUE`, `--secret-file VALUE`, `--secret-env VALUE`, `--secret-stdin`

### `sub schedule`

List billing periods for a subscription schedule.

```text
ghostpay sub schedule --anchor T --cadence monthly:N|weekly:N|custom:SECONDS [--from INDEX] [--count N]
```

T = unix seconds, "now" or YYYY-MM-DDTHH:MM:SSZ. Month-end anchors clamp without drifting.

**Options:** `--anchor VALUE`, `--cadence VALUE`, `--from VALUE`, `--count VALUE`

### `split compute`

Split an amount by basis points with exact remainders.

```text
ghostpay split compute (--total BASE_UNITS | --amount DECIMAL --decimals N) --share ID=BPS ...
```

Shares must sum to 10000. Results always add up to the total exactly.

**Options:** `--total VALUE`, `--amount VALUE`, `--decimals VALUE`, `--share VALUE ...`

### `batch preview`

Validate a payout CSV and show every row plus a preview hash.

```text
ghostpay batch preview --csv F|- --chain-id N --asset native|0xTOKEN --decimals N --min D --per-recipient-max D --max-recipients N --max-total D [--duplicates reject|merge] [--allow-lowercase]
```

CSV header: destination,amount,label. Nothing is paid or created.

**Options:** `--csv VALUE`, `--chain-id VALUE`, `--asset VALUE`, `--decimals VALUE`, `--min VALUE`, `--per-recipient-max VALUE`, `--max-recipients VALUE`, `--max-total VALUE`, `--duplicates VALUE`, `--allow-lowercase`

### `batch confirm`

Confirm a reviewed payout CSV by its preview hash.

```text
ghostpay batch confirm <same options as preview> --hash PREVIEW_HASH
```

Fails if the file or options changed since the preview. Creates no payment; it prints the confirmed plan id.

**Options:** `--csv VALUE`, `--chain-id VALUE`, `--asset VALUE`, `--decimals VALUE`, `--min VALUE`, `--per-recipient-max VALUE`, `--max-recipients VALUE`, `--max-total VALUE`, `--duplicates VALUE`, `--allow-lowercase`, `--hash VALUE`

### `export`

Export invoices as accounting CSV/JSON/Xero/IIF (formula-safe).

```text
ghostpay export --in INVOICES.json|- [--format csv|json|xero|iif] [--rounding half-up|half-even|down|up] [--sales-account A] [--tax-account A] [--receivable-account A] [--out F] [--force]
```

INVOICES is a JSON array of ledger entries or {invoice, customer?, status?, paidMinor?} wrappers.

**Options:** `--in VALUE`, `--format VALUE`, `--rounding VALUE`, `--sales-account VALUE`, `--tax-account VALUE`, `--receivable-account VALUE`, `--out VALUE`, `--force`

### `sandbox chain demo`

Run a deterministic in-memory mock chain walkthrough (no network).

```text
ghostpay sandbox chain demo [--seed TEXT]
```

Funds a test account, sends a transfer, then injects a failure. Everything is local and fake.

**Options:** `--seed VALUE`

### `i18n check`

Check message catalogs for missing keys, placeholders and plural forms.

```text
ghostpay i18n check [--base en] [--catalog LOCALE=FILE.json]...
```

Without --catalog the bundled sample catalogs are checked. Exit 1 on any problem.

**Options:** `--base VALUE`, `--catalog VALUE ...`

### `doctor`

Self-test this installation (offline).

```text
ghostpay doctor
```

Checks Node >=22, WebCrypto, randomness, signing, encrypted links, catalogs and the clock. Makes no network calls.

**Options:** No command-specific options.
