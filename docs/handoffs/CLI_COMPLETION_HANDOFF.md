# GhostPay CLI completion handoff

## Source and ownership

Continuation branch: `gpt/ghostpay-cli-completion-20261109`.
Starting source: PR #91, `b748ecdce06d2dfa911144814161c31a46a09e9b`.
Preserved parent stack: #84 → #88 → #89 → #90 → #91. No parent branch is rewritten.
Work is being implemented directly with three independent engineering workers;
no Codex invocation, paid agent workflow or recurring automation is used.

The current worktree HEAD is authoritative; this document is updated with each
published checkpoint. The initial source is not a passing acceptance baseline:
CI run `42617654239` has one web test failure, and its aggregate TypeScript gate
fails as a consequence. The actual typecheck, lint, build, package shards and both
browser profiles on that source passed. The failing web case is the saturated
backup unlock case in `ReconciliationLedger.test.tsx` (2,186 passed, 1 failed,
1 skipped). Parent #84's Sonar gate remains independent.

## Authoritative capability inventory

This table tracks engineering work; it does not certify production deployments.

| Capability | GUI available | CLI at start | Shared implementation | Acceptance focus | Remaining work |
|---|---|---|---|---|---|
| Invoice creation | Yes | create/sign/link | invoice-schema | schema/signature/expiry/envelope parity | expected-field checks, inspect, passphrase envelopes |
| Invoice verification | Yes | verify | invoice-schema | tamper/version/chain/amount tests | strict wrappers and applicability reporting |
| Payment inspection | Yes | Missing | chain-adapters canonical verifier | canonical receipt/calldata/asset/recipient/finality | read-only explicit online commands |
| Signed receipts | Yes | Missing | GUI receipt codec being extracted to invoice-schema | exact signature vectors and invoice binding | inspect/verify/export, GUI regressions |
| QR exchange | Yes | Missing | qr-exchange | payload bounds, multipart/repeat validation | SVG/text encoding and strict decoding |
| Public seller pairing | Yes | Missing | shared public codec with caller-provided enabled testnet IDs | same keys/chains/checksum as GUI | export/import preview and repeated input |
| Encrypted backup | Yes | Missing | existing keystore/GPA/reconciliation codecs | format/KDF bounds/wrong credentials | inspect/verify/create and portable recovery |
| Restoration | Yes | Missing | same encrypted formats and import validation | atomic files, no plaintext output, interrupted writes | verified encrypted restore output and dry run |
| Reconciliation | Yes | Missing | existing matching/vault rules | imported history vs fresh canonical evidence | proposals, explicit approval and re-verification |
| Transaction history | Yes | Missing | encrypted reconciliation vault | invalidation/tombstones/duplicate records | list/inspect/export without changing trust |
| Merchant subscriptions | Library and operator example | sub schedule + durable runner | merchant-billing and subscription-cron | crash identity/config/time validation | unified inspection/config entry points |
| Installments | Library | Missing | merchant-billing | exact integer allocation/chronology | plan and inspect |
| Webhooks | Merchant integration | sign/verify + durable receiver | merchant-hooks | exact bytes, retries, duplicate delivery | event/config/idempotency inspection |
| Refunds | Fixture model only | fixture example only | merchant-billing/multisig | off-chain approval does not move funds | inspect/status; execution remains unsupported |
| Chain adapters | Enabled testnet/read-only features | Missing | existing EVM/BTC/Solana/TRON packages | malformed providers, chain identity, bounds | normalized inspection/verification commands |
| Privacy scanning | Yes with budgets | Missing | bounded canonical scan logic | cursors/replay/request budgets/no key logs | explicit read-only scan commands |
| Operator diagnostics | Yes | doctor | existing self-tests/RPC transport | no secrets or implied provider trust | config preflight, explicit RPC health, exports |

## Workstreams

- Invoice/receipt/public exchange: `source_inventory` worker owns command modules
  and narrow shared codec extraction; browser wrappers retain localized errors.
- Backup/history/reconciliation: `backup_reconciliation` worker owns the portable
  vault codecs and commands; browser session/storage adapters remain in the app.
- Payments/chains/scanning: `payment_chain` worker owns explicit online commands
  and canonical evidence integration.
- Coordinator: CLI infrastructure, merchant commands, dependency/config wiring,
  command reference, cross-command tests, integration and publication.

## Test evidence so far

Runtime: Node `24.22.1`, npm `11.9.0`, Linux.
Dependencies: `npm ci --ignore-scripts --no-audit --no-fund` completed, 747 packages.
The initial offline attempt lacked a cached package and is not counted as success.

The signing-key permission regression failed on the original adapter (exit 0
instead of required exit 3). The fix checks ownership, owner-only POSIX modes and
single-link status on the opened descriptor. Existing private atomic output and
bounded UTF-8 behavior are retained. Passphrase and binary APIs each had a
missing-behavior test fail before implementation. Focused infrastructure testing
passed; final counts and commands will replace this running record after
combined verification. No unexecuted or in-progress suite is claimed green.

## External acceptance boundaries

Public-network acceptance, funded signing/broadcasts, real refund authority,
production deployment pins, disabled research features, native Windows/macOS
filesystem execution and parent-stack quality gates are separate from local CLI
engineering. An RPC response is not proof of a trustworthy provider. Signature
verification is not payment verification. Imported history cannot acquire live
verification simply by being restored.

## Next implementation task

Complete and integrate the owned command modules, run the public command and
subprocess journeys, preserve existing coverage gates, qualify shared GUI
behavior, publish coherent commits and attach exact hosted CI evidence.
