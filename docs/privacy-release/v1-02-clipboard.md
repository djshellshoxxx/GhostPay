# Optional clipboard protection

ID: `v1-02-clipboard`. Release: **v1.0 Beta**. Source: [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Provide configurable opt-in cleanup only when current readable clipboard equals owned copy. Preserve newer copies; dispose timers and ownership; neutral behavior on denied/unavailable APIs. Do not retain key plaintext to wait for cleanup. Browser read/write is not atomic: describe best-effort behavior honestly.

## Module ownership

Under `apps/web/src/`: clipboardPrivacy.ts; ClipboardPrivacyControls.tsx; Common.tsx; SecretBackup.tsx.

## Acceptance and reuse

Existing implementation retained. Independently check copy failure, replacement, timers, permission denial and settings. Preserve newer-source race corrections where proven unique; do not substitute desktop clipboard libraries.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
