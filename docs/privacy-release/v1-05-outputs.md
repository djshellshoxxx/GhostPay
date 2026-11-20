# Privacy-safe exports and notifications

ID: `v1-05-outputs`. Release: **v1.0 Beta**. Source: [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Use fixed neutral download filenames, notification/error/title text. No keys, addresses, balances or invoice details in incidental URLs/logs. Preserve exact export payload/recovery bytes and intentional encrypted invoice fragments. No new Notification API feature is required.

## Module ownership

Under `apps/web/src/`: paymentKeyExport.ts; errors.ts; Common.tsx; AppShell.tsx and export call sites.

## Acceptance and reuse

Retain published neutral output changes and independently inventory remaining call sites. Test Blob payload separately from filename, typed generic errors, document title and live regions.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
