# Global sensitive-data masking

ID: `v1-01-masking`. Release: **v1.0 Beta**. Source: [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Conceal sensitive values by omitting them from visible and accessible content, titles and attributes. Reveal requires deliberate action, expires after 30 seconds, and revokes on lock, session, visibility or account lifecycle. Preserve drafts and recovery.

## Module ownership

Under `apps/web/src/`: privacyMode.tsx; SensitiveContent.tsx; PrivacyControls.tsx; PrivacyQuickHide.tsx.

## Acceptance and reuse

Existing implementation retained from published 13762896. Independently check keyboard/focus/accessibility, reveal expiry and lifecycle using original tests and browser journeys. CSS blur alone does not satisfy concealment.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.

## Integrated Pages acceptance for #569

The banner switch persists the preference. An explicit reveal lasts up to 30 seconds.
The live document excludes masked workflow nodes, including inputs, attributes, QR
output and the live region. Drafts and sole-copy keys stay in the running workflow.
Home and About retain the fee schedule while hiding recipient and contract addresses.
In privacy mode, action confirmations run in the page so their deadline can expire.

Navigation, invoice replacement, page exit, hidden tabs, session changes and locks
revoke the current reveal. Local Bitcoin, Solana and TRON wallet installation and
locking revoke it too. After an EVM account switch, the completed receipt belongs to
the original account and chain. Reconnecting that account permits receipt access again.

Run `privacy-mask-history.spec.ts` and `wallet-disclosure.spec.ts` in full and lean
builds. They check synthetic values against the title, accessibility tree, serialized
document, text and live form values. The reload fixture deliberately retains an invoice
fragment so the same invoice can be opened twice. App masking covers page content.
Browser chrome, wallet extension windows and operating-system UI are outside this boundary.

Candidate base: #373 at `b660b2d8f3f84ddf72f684d13913f643f33f2eee`.
Qualification requires passing runs on the integrated candidate. See [PR #569](https://github.com/djshellshoxxx/GhostPay/pull/569).
