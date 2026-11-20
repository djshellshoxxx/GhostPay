# Invoice metadata minimization

ID: `v11-02-invoice-minimization`. Release: **v1.1 Beta**. Source: [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287).

## Baseline

Published source `137628961463fc5abd8b7927b2efe6b18a0a206a`. Live main observed `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The initial local c83 inventory is historical only after workspace loss.

## Behavioral contract

Offer explicit minimal mode before signing. Omit optional memo and neutralize line descriptions; preserve required quantities, unit amounts, tax, amount policy, token, quote, nonce, expiry, signer, meta-address, fees and buffer policy. Never strip an already signed payload while retaining its signature. Preserve canonical encoding, totals, encryption/passphrase and ordinary mode. Reject invalid runtime modes.

## Module ownership

Under `apps/web/src/`: new lib/invoiceMetadata.ts; lib/invoiceCreate.ts; views/CreateInvoice.tsx and tests. Merchant compatibility owns lib/merchantTemplate.ts and components/MerchantTemplateIssuer.tsx with focused tests; the verified signed profile remains immutable, and the metadata choice is captured before custody awaits. The merchant issuer must revoke prior/pending links on mode changes and return to standard mode for a new seller session.

## Acceptance and reuse

M1 pure immutable transformer plus real Create Invoice toggle and signature/fragment round trip; M2 merchant-template compatibility, all share/export paths and browser review. Reuse invoice-schema signing/validation; implement transformer locally.

## Architecture and quality

Static, browser-only, non-custodial Pages scope. No contract, fee, dependency, network, deployment or future-suite changes. Preserve all security gates. Policy modules separate from side effects; bounded inputs/collections; neutral errors; explicit cancellation; accessible UI and existing localization conventions. Pure helpers must be wired before claiming feature completion.

## Team and milestones

Separate branch per feature. Record ownership before edits in ACTIVE_WORK. Coordinator owns shared-file reconciliation. M0: spec committed before implementation. M1: small implemented slice and original focused tests. M2: fresh independent reviewer receives internal source-pinned handoff, fixes concrete gaps, and checks protected data. M3: complete original typecheck/lint/unit/browser/hosted gates on the combined exact source. Missing or failed gates stay open. Three worker slots run features in parallel waves. No user-facing prompt dump.

## Handoff requirements

Record base/head/tree, reused vs authored code, tests/commands/exits, failures/skips, known limitations and next bounded task. Do not count historical or different-source checks as current. No shared integration/main updates; existing active source branches stay intact. v1.1 must not become a v1.0 release dependency.
