# Existing CLI and relayer recovery — 2026-11-18

## Result and provenance

Recovered PR #218's remaining useful CLI and relayer changes from
`b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` onto
`c5f9b190935251c5274a434341f40db3c9175ef1` in
`integration/ghostpay-runtime-recovery-20261118`. The ownership claim preceded product edits at `da3a8728`.
The adjacent `runtime-recovery-2026-11-18.json` records exact source commits, recovered file blobs/SHA-256 values,
and retained-base equality assertions. Original branches and remote refs remain unchanged.

The recovery uses the scoped delta from shared source base `5467c158069c5bab264b6a653ac56e89e13f3e13`.
The single textual conflict was the relayer's accepted top-level keys: both `privacy` and the restored `server`
key are retained. Every other selected source hunk applied through a three-way merge. No dependencies,
contracts, workflow requirements, coverage thresholds, test exclusions or checkpoint formats changed.

## Included behavior

| Area | Preserved work |
|---|---|
| CLI | Parse global switches only in flag positions; require fresh observation evidence for reconcile proposals; classify malformed local observations as input errors; redact link-like/error paths and escape untrusted catalog keys. |
| Relayer logging/listener | Best-effort log sinks survive stream errors; cap TCP connections per peer with trusted-proxy exemption; return client errors for malformed targets; enforce header/request deadlines every second. |
| Admission/fees | Reserve client lane slots before the first await and retain them until settlement; reject high-S/non-27/28 signatures before RPC/owner strikes; bind feeTo to the signed manifest; consecutive quote gas-RPC failures trip the breaker without stealing its half-open probe. |
| Guard | Isolate overflow token buckets by abuse group, bound memory, inspect at most eight idle eviction candidates, expose counter-only statistics, and protect entries held by one loss-budget resolution. |
| Web pairing | Classify `client_queue_full` as a proven pre-broadcast refusal so the signing lock can be released for retry; check emitted 4xx refusal classifications. |
| Devnet | Original `8e766897` selects the signed manifest's configured fee-recipient account. Existing fee/balance assertions are unchanged. |
| Invoice tests | Preserve four unique #218 regressions alongside the stronger #234 suite: public error classes, serialized rejection redaction, explicit-false review behavior and malformed-base64 precedence. Invoice runtime is unchanged. |

PR #222 padding, zero-log, trusted-proxy and onion settings remain present. Its privacy test and runtime wiring
are byte-equal to base; `parsePrivacy`, `unpadBody` and `zeroLogLogger` are byte-equal inside reconciled files.
The current CLI receipt-parity suite and invoice/UX error runtime remain byte-equal. The per-peer connection cap
also bounds the loopback peer used by onion ingress; it does not trust onion-supplied X-Forwarded-For.

Independent source review corrected one inherited regression fixture: its all-zero signature used `v=0`, so the
canonical-form guard rejected it before reservation. The fixture now uses `v=27` with zero r/s, reaches recovery
after reservation, and fails there. The subsequent successful request at maxPerClient=1 and empty-slot assertion
are retained. The deviations document now states the restored early signature-form refusal accurately.

## Verification and remaining gates

Executed: `git diff --cached --check`, source receipt generation, unchanged-file equality assertions, and three
privacy-function equality assertions. No unit, coverage, typecheck, lint, browser or native-socket suite ran on
this tree. Repeated main installation attempts exited 137, and the coordinator directed this worker to avoid
further local installs/tests. Historical test results in source commit messages are provenance only.

The original CLI, relayer-guard, relayer and invoice-schema coverage suites, paired web relayerClient/relayerContract
tests, relevant builds/typechecks/lints and devnet lib/CLI acceptance remain required on the exact combined tree.
Relayer tests must consume the recovered guard build. Native timeout tests need supported Node 22+.
The independent reviewer found no blocking source defect in the relayer/guard/privacy changes, with execution
and exact-head hosted checks still pending. This report does not authorize promotion by itself.

## Remaining PR #211 work — separate groups

Source head `a92658b1ef6b95ff0145b2e1933d0047d51289d5` has useful work beyond this commit. The machine receipt
records the full source commit ids and paths for each group.

- **Policy validation, now assigned next:** canonical decoder checks (`0c0bbaa2`), policy-only typed-data signing
  and its one-read follow-up (`6e27f497`, `ca2c6b75`), recomputed withdrawal/restored-tree leaves (`86fa1fef`,
  `ba877c31`), secret-copy ordering (`16133082`), trust notes (`818aa34f`), paired prepare/send regressions and
  R/metadata binding (`0dab0db4`, `60f44acd`). These validate the existing protocol without a new contract or
  minimum-delay decision. Preserve experimental/disabled exposure and existing L2 delay values.
- **Policy asset coverage/disclosure:** `46ab81d2`, `00f9134b`, `1f5c2d73` and their copy/API companions prove
  loaded policy records cover the token and explain unknown coverage. They are outside this runtime group.
  Source leaves per-chain L2 minimum-delay floor/numbers unresolved; this recovery must not invent them.
- **Multichain interoperation:** `e2427c20`, `179a5b43`, `28ce8a0b` align CLI-side Solana/TRON formats and vectors
  with the web format. `b9af22a9` fails TRON build closed while its memo cannot be bound; `c3d7d702`, `67a3c3c0`,
  `b79bb24a`, `90146562` provide paired fixtures, cluster refusal and fixed legacy errors. Do not port CLI calls
  before their library API/format changes. New memo-capable TRON building is beyond restoration.
- **Conflicting backup UI:** #211 removes the secret clipboard path (`ea62d473` and copy/docs companions),
  whereas current code retains confirmation and asynchronous cleanup protections. This is a real behavior
  conflict requiring coordinator disposition, not equivalent source or part of this group's scope.
- **Superseded checkpoint privacy:** do not restore #211's v3 namespace. Current v4 reconciles incompatible
  historic v3 variants, validates key length and clears every v1/v2/v3 legacy prefix.
- **Separate focus regression:** `407868a1` adds the in-view paste focus browser test; census it independently.
