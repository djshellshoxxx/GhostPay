# Wallet and vault lifecycle privacy

ID: `v1-03-wallet-lock`. Release: **v1.0 Beta**. Source: [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Clear stale visible session details and authority on account/chain/disconnect, app lock and expiry. Pending promises cannot restore cleared state. Preserve encrypted backups, sole-copy recovery keys, submitted or uncertain outcomes and duplicate-attempt evidence.

## Module ownership

Under `apps/web/src/`: useWalletPrivacy.ts; wallet.ts; Pay.tsx; RegistryView.tsx; PolicyView.tsx.

## Acceptance and reuse

Prior local c83 candidate was inspected but its unpublished objects became unavailable during workspace reset. Published base lacks that complete lane; recovery or fresh minimal implementation is required. Verify all supported EVM callers, late connection and monitor disposal.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
