# Local metadata retention controls

ID: `v11-04-retention`. Release: **v1.1 Beta**. Source: [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Allowlist only proven nonessential metadata; unknown types remain protected. User-configurable preference; preview count/categories and explicit confirmation before destructive manual cleanup. Approval binds revision and rechecks eligibility; stale/replayed plans fail closed. Never automatically delete vaults, sole-copy keys, backups, pending/unknown attempts, recovery records, signer pins, anti-reuse/duplicate/reorg/tombstone/security evidence. No global origin clear. Static browser timers run only while app active.

## Module ownership

Under `apps/web/src/`: new lib/metadataRetention.ts, tests, dedicated settings panel and explicit data adapters.

## Acceptance and reuse

M1 typed planner/executor and safe real presentation-metadata adapter if proven, with protection/race/clock/failure tests. M2 individually justified persistent adapters, reload/concurrency and browser review. Existing journals do not have proven final settlement; do not invent TTL eligibility.

## Generation 3 bounded adapter acceptance

The next eligible copy is the **completed MerchantTemplateIssuer screen result**. Reuse the existing invoice-preview registry, identity guard, controls and active-page timer; do not create a new store or planner. This continues implementation and does not satisfy the separate M3 release-qualification gate below.

1. Register only the current generated result whose captured seller session still matches the current session. The adapter receives object identity and a state callback, never invoice storage or journal handles.
2. Reuse count-only preview, cancellation and explicit confirmation. Clearing removes the current generated link/Copy presentation only; token/amount/fee selections, immutable signed profile, seller keys/custody and independently saved records remain unchanged. Already shared signed links remain valid.
3. Register no pending generation. Replacing a result invalidates its previous confirmation plan, and a previous result's age cannot expire the replacement. Clearing must not cancel, restart or authorize generation.
4. Unmount/session replacement withdraws the registration. Late asynchronous completion must obey the existing generation/session guards and cannot restore a closed preview.
5. Execute actual issuer integration regressions, including manual preview/cancel/confirm, replacement/expiry/pending work, preserved security state and unmount. Preserve full original checks as separate open gates until executed on the combined source.

The separate merchant metadata-minimization mode is reconciled by the coordinator. This adapter must preserve that mode and its pending-generation guards when combined. Persistent transaction/invoice retention and terminal-transaction cleanup remain outside this bounded adapter until a positive nonessentialness proof exists.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
