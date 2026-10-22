# Spec: plugin-api (privacy-option extensions)

Status: implemented in `packages/plugin-api` (`@ghostpay/plugin-api`). Not yet wired
into `apps/web`; see `docs/remote/usability/wiring/plugin-api.md`.

## Goal

Let third parties add privacy choices (payout delay, relay use, batching) or
tighten them per invoice, without letting any plugin weaken GhostPay defaults
silently, reach the network or storage without a grant, or break other plugins.

## Requirements

| ID | Requirement |
|----|-------------|
| PA-1 | Manifest: `apiVersion` (1), `id` (reverse-DNS, lowercase, 2-5 labels), `name` (printable, no control/bidi/zero-width chars, <= 64), `version` (strict semver), `capabilities` (non-empty, unique, from a closed set), `permissions` `{network: host[], storage, downgrade}`. Unknown keys, accessors, symbols and non-plain objects are rejected. No field can carry code or a code URL. |
| PA-2 | Capabilities: `hook:onInvoiceCreate`, `privacy:delay`, `privacy:relay`, `privacy:batching`. Hooks provided must exactly match: `onInvoiceCreate` iff `hook:onInvoiceCreate`; `privacyOptions` iff any `privacy:*`. Hooks must be function references (bundled statically), never strings. |
| PA-3 | Deny by default: effective permissions = manifest request ∩ host grant. Without both (and a host port), `ctx.network` / `ctx.storage` are absent. |
| PA-4 | Network: https only, exact allowlisted hostname (no wildcards, IPs, ports, credentials), GET/POST, request body <= 64 KiB (none on GET), response <= 1 MiB. |
| PA-5 | Storage: namespaced `plugin/<id>/<key>`, key `^[a-z0-9][a-z0-9_-]{0,63}$`, value <= 16 KiB, <= 64 keys, corrupted index fails closed. |
| PA-6 | Hooks receive a frozen invoice view (`chainId`, `asset`, `amount`, `expiresAt` only; no memo, line items or payer data) and a context revoked when the hook settles or times out. |
| PA-7 | Each hook has a timeout (default 1000 ms, max 10 000 ms, injectable scheduler). Throw/reject/timeout/bad output are isolated: the plugin contributes nothing and a code (`THREW`/`TIMEOUT`/`BAD_OUTPUT`) is recorded; plugin error text is never propagated. `required` plugins fail the whole evaluation closed. |
| PA-8 | Plugins run sequentially in ascending `id` order. Restrictions merge with max/OR (commutative), options are sorted by `pluginId/optionId`; results do not depend on registration order. |
| PA-9 | Restrictions (`minDelaySeconds`, `relayRequired: true`, `minBatchSize`) only tighten and only for declared kinds. `relayRequired: false` is not expressible. |
| PA-10 | Options weaker than the *effective* setting must carry `downgrade: true` and a `downgradeReason`, and the plugin must hold a granted `downgrade` permission; otherwise rejected (`SILENT_DOWNGRADE`, `DOWNGRADE_NOT_PERMITTED`, `MISSING_DOWNGRADE_REASON`). A false `downgrade` flag is rejected too. |
| PA-11 | `applyPrivacySelection` applies at most one option per kind; a downgrade applies only if the user acknowledged that exact key; applied downgrades are returned for the UI/audit trail. |
| PA-12 | No `eval`/`new Function` (lint-enforced), no network or storage of its own, injectable clock and scheduler. |

## Acceptance tests (in `packages/plugin-api/src/*.test.ts`)

- Registered z, a, m → executed a, m, z; two registries with reversed order give identical evaluations.
- Plugin A restricts delay to 3600 s, B to 60 s (below the 600 s default): effective 3600 s. A relay plugin sets relay on and batch 32.
- A delay-only plugin that returns `minBatchSize` → `BAD_OUTPUT`; `relayRequired: false` → `BAD_OUTPUT`.
- Option "No delay" (0 s, unflagged) → `SILENT_DOWNGRADE`; flagged without a grant → `DOWNGRADE_NOT_PERMITTED`; flagged with a grant and reason → listed in `downgrades`; effective settings unchanged.
- An option of 1200 s is a downgrade when another plugin raised effective delay to 3600 s.
- Throwing, hanging (20 ms timeout) and rejecting plugins are isolated; an OK plugin still applies 1800 s; the thrown message does not appear in the output.
- After a timeout the plugin's captured `ctx.network.fetch` rejects and the host port is never called.
- Network blocks http, other hosts, suffix tricks (`api.example.com.evil.com`), subdomains, ports, credentials.
- Storage blocks `../other/x`, the reserved index key, over-quota and oversize values.
- Selecting a downgrade without acknowledgement throws; with it, `relay` becomes `false` and the key is reported.
- Property test (500 runs, seed 42): `tighten` never weakens and is commutative.
