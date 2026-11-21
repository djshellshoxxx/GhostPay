# Independent Tor transport and payment-safety verification

Worker: `/root/tor_functional_verification`. Scope: read-only functional verification,
with this documentation as the only repository edit. The coordinator was notified of
the documentation claim before it was written. No runtime, test, dependency, workflow,
shared-ref, deployment, or integration-lock changes were made by this worker.

## Source and environment

- Tested local integration commit: `e5457a4aa8ff7a4cb7c7635a060be5b3003a0103`.
- Complete source tree: `219ccc57d286d8dc73e9cd9203dc9d8440d9d7df`.
- Current-main input: `aec179910c39081d820396409ff3139ff2264132`.
- Tor donor: PR #320 `e8010bbe002331ee0cb37dc6b16dfd91c8b8647d`, including PR #308 by ancestry.
- Runtime: Linux, Node `v24.22.3`, npm `11.19.1`, Vitest `5.0.5`.
- Dependencies: coordinator's fresh `npm ci --ignore-scripts`; matching workspace libraries
  built from this checkout. No additional dependency installation by this worker.
- Tests ran serially with one Vitest worker and a 2048 MiB Node heap limit. The hosted
  workflow's Node 22 execution is a separate environment and still needs qualification
  against the final candidate.

## Executed results

| Task | Selection | Passed | Failed | Skipped | Result |
|---|---|---:|---:|---:|---|
| F-TOR-01 | Complete `net-transport` package, 6 files, original coverage gate | 193 | 0 | 0 | PASSED |
| F-TOR-02 | Web scan privacy, wallet/sweep journals, reconciliation, keystore, seller recovery and backup panel, 11 files | 178 | 0 | 0 | PASSED |
| F-TOR-03 | Invoice/quote expiry boundaries | 6 | 0 | 0 | PASSED |
| F-TOR-04 | Existing Pay view expiry/interruption/retry cases | 12 | 0 | 54 | PASSED for selected cases |
| Total | Four commands | 389 | 0 | 54 | No failing executed test |

The 54 skipped cases in F-TOR-04 were deliberately outside its `testNamePattern`.
They are not counted as passed and were not environmental skips. The focused web
selections do not stand in for the full web suite or its coverage gate.

F-TOR-01 retained the package's original coverage thresholds and passed with
97.56% statements, 95.94% branches, 96.42% functions and 97.93% lines. No threshold,
assertion, retry, test timeout or source configuration was changed.

## Verified behavior and practical limits

### Transport boundaries

The complete package suite exercises canonical onion host validation; the browser
entry's exclusion of Node networking; SOCKS5h hostname forwarding through a synthetic
loopback proxy; refusal to contact the destination directly when that proxy fails;
failed-self-test blocking; redirect/credential/referrer defaults; and cancellation
without redispatch. The package also tests its other existing transport profiles.

The web checks prove that a configured local scan proxy is the only endpoint used by
`openScanClients`, and an outage does not invoke the ordinary Settings RPC as a
fallback. Required-private-path policy blocks a direct scan, refuses a missing local
proxy endpoint, and excludes the direct secondary RPC.

Relevant source: `packages/net-transport/src/{profiles,socks5,fetchTransport,fetchAdapter,onion}.ts`
and `apps/web/src/lib/scanPrivacy.ts`.

These are controlled transport and application-policy results. They do not prove
that a running Tor daemon constructed a circuit, that Tor Browser routed a real
request, or that an external wallet used Tor. `scanPrivacy.ts` explicitly states
that a browser page cannot open SOCKS or verify Tor Browser. Its `tor-browser`
selection relies on the actual browser, and the local-proxy restriction is scoped
to the scan path. User-requested Sweep RPC and external wallet behavior retain their
documented disclosure boundaries.

### Interrupted and duplicate payment attempts

The wallet tests verify that the tab journal records an `unknown` attempt before the
wallet is invoked; an invoice retry is blocked even if its transaction data is freshly
rebuilt or the payer account changes; a lost provider response remains ambiguous;
and a returned hash is retained even when authority changes or persistence fails
after submission. The duplicate journal never expires an unknown outcome or evicts
unresolved attempts to make space.

Sweep-journal tests verify restoration of signing locks, bounded same-nonce hash
history, no persistence of key material/destination/amount, refusal on invalid or
unavailable storage, and a tombstone when storage updates cannot be trusted.

Relevant source: `apps/web/src/lib/{wallet,duplicateAttemptJournal,sweepAttemptJournal}.ts`.

Both normal browser journals use `sessionStorage`. Their stated guarantee is reload
of the same tab. These results do not establish cross-tab, cross-origin, browser-close,
Tor Browser New Identity, or cleared-storage protection. A Tor disconnection after
submission cannot be treated as proof that no payment occurred, and clearing a
journal entry is bookkeeping rather than cancellation or reversal.

### Expiry, observations and reconciliation

The pure expiry tests confirm that an invoice is expired at `now === expiresAt`,
that quote expiry is independent, and that malformed clocks are refused. Existing
Pay UI tests also pass for expiry before approval, expiry between final review and
send, a delay that crosses expiry, and preservation of a submitted payment/receipt
after expiry. Confirmed approval hashes remain visible when the invoice or buffer
expires before payment. Failed dry runs or later expiry do not replace an existing
unknown-outcome warning with a claim that nothing was sent.

Reconciliation tests cover canonical pre-expiry block times observed later, duplicate
observation identity, ambiguous matches, missing canonical timestamps, reorg-invalidated
observations, encrypted registration/receipt backups and bounded import. Imported
historical annotations cannot authorize a fresh payment match; an archived receipt
alone is not payment evidence.

Relevant source: `packages/invoice-schema/src/expiry.ts`, `apps/web/src/views/Pay.tsx`,
and `apps/web/src/lib/{reconciliationMatch,reconciliationVault}.ts`.

`checkExpiry` is explicitly advisory client-side policy and does not enforce an
on-chain expiry or initiate a refund. This review establishes neither automatic
refunds nor a guarantee that all stuck payments are recoverable. The Pay tests use
mock wallets/RPC and cannot establish a real-chain settlement or refund result.

### Backup and key restoration

Keystore tests pass for encrypted round-trip, malformed/tampered envelopes, strict
metadata/KDF bounds and public-key consistency. Seller recovery tests pass for
unmount/cancel/session-replacement during decryption, returned-buffer wiping, and
retrying the same file after cancellation. BackupPanel tests pass for reporting a
copy only after a successful export, preserving failure details, not silently
unlocking on mount/focus/visibility, and clearing stale success when seller keys change.

Relevant source: `apps/web/src/lib/keystore.ts`, `apps/web/src/views/SellerKeys.tsx`,
and `apps/web/src/components/BackupPanel.tsx`.

This is deterministic Node/jsdom restoration evidence. Actual downloaded-file
restoration in Tor Browser, onion-host identity backup/restore, mobile devices and
fund recovery from a real transaction remain separate acceptance items.

## Commands

From `packages/net-transport`:

```sh
NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/vitest run --coverage --maxWorkers=1
```

From `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/vitest run --maxWorkers=1 \
  src/lib/scanPrivacy.test.ts src/lib/scanPrivacy.clients.test.ts src/lib/scanPrivacy.transport.test.ts \
  src/lib/walletJournal.test.ts src/lib/duplicateAttemptJournal.test.ts src/lib/sweepAttemptJournal.test.ts \
  src/lib/reconciliationMatch.test.ts src/lib/reconciliationVault.invoices.test.ts \
  src/lib/keystore.test.ts src/views/SellerKeys.recovery.test.tsx src/components/BackupPanel.test.tsx
```

From `packages/invoice-schema`:

```sh
NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/vitest run --maxWorkers=1 src/expiry.test.ts
```

From `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/vitest run --maxWorkers=1 --reporter=verbose \
  src/views/Pay.test.tsx \
  --testNamePattern='expired|expires|unknown outcome|unknown-outcome|blind retry|Submitted panel|receipt download'
```

## Evidence handoff and release status

All commands exited 0. Raw output and a machine-readable index are in the
coordinator's `/tmp/ghostpay-tor-evidence/functionals/` directory. `INDEX.json`
records commands, counts, exit codes, SHA-256 of each output, complete source tree,
and 60 relevant source/test Git blob identities. The coordinator should preserve
these files with the final evidence packet and compare the recorded blobs after
integrating other workers' changes.

| Output | SHA-256 |
|---|---|
| `net-transport.log` | `69bcedb18574d378ddbe6f3e00c198613d6c9d4f1fbb27a25d990ac99d1c436a` |
| `web-transport-recovery.log` | `4a91700d01c75235ac7c912cd6bcea79726966d4b4c73e7d2b3fd8910dabe8f6` |
| `invoice-expiry.log` | `8905cdbab49dca615637588b99bfeaf9244f4829dfc55ac5aa2df746d652b05f` |
| `payment-expiry-interruption.log` | `c45ee5feb50b86f92cce96417e6aa7f0765e7703fc01ddf380601164c9ccc6c4` |

No new blocking functional defect was observed within this selection. This is an
independent source-scoped functional result, not approval of the final combined
candidate or a READY verdict for real Tor. Final combined-head CI, actual Tor Browser
connectivity, daemon identity restart/restore, mobile browser acceptance, network-route
observation and live-testnet payment/interruption evidence remain coordinator-owned
and must not be inferred from these passes.
