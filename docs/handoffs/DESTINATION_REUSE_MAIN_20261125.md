# Local destination-reuse warnings on main (#287 item 1) — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`, branch `claude/w-reuse-287-20261125`, base main `32ae3977`.
Slice assigned by the coordinator `feature-completion-06`; owner gate 4 of `docs/product/PRIVACY_PAYMENT_BETA.md`
(PR #659): "warns for locally known reused destinations without additional probing".

## Provenance

| Source | Head | Disposition |
|---|---|---|
| #586 `codex/287-local-destination-reuse` | `f024ce3e` | Merged with `--no-ff` (ancestry kept). Base of this slice. |
| #610 `finish/destination-reuse-type-20261124` | `874d3809` | Merged with `--no-ff` (TS2322 fix for `FinalPreview.notice`). |
| #584 `codex/287-evm-payment-destination-reuse` | `17c5a2ee` | Not merged. Sibling design that writes recipient fingerprints into the fund-safety payment-attempt journal (`duplicateAttemptJournal.ts`, `payExec.ts`, `wallet.ts`). #586 keeps a separate advisory history that cannot alter or veto a payment, so #584 is superseded. Its branch is untouched. |
| #341 GP-BUG-06 | `78137622` | Not applicable to main: it widens the chain allowlist of `packages/hygiene` `DestLedger`, which main's web app does not import. |

## What the slice does

All notices are advisory: none disables, delays, alters or authorizes a wallet request, signature, payment or sweep.
No comparison makes an RPC, explorer, wallet or telemetry request.

- **Checkout** (`Pay.tsx`, after Prepare payment): compares the derived one-time destination with this tab's history
  for the same payer account and chain, and distinguishes the same signed invoice from another invoice. Each
  preparation draws a fresh random ephemeral key (`chain-adapters` `deriveStealthPayment(meta, b.rng)`, `rng` is
  tests-only), so a repeat means the browser's random number source repeated. The texts say that, show as warnings
  and no longer send the payer to the seller (a seller cannot cause it).
- **Sweep** (`Sweep.tsx`), in priority order:
  1. *Own one-time address* (added here): the destination is another one-time address announced as a payment to these
     keys in the current scan (`app.matches`, the selected address excluded). Sweeping into it links both payments,
     and whoever paid that address sees the funds arrive.
  2. *Another seller profile* (added here): a different seller profile in this tab already swept to the destination
     on this network, which links the profiles on-chain.
  3. *Same seller profile* (from #586).
- The destination is remembered inside `onBeforeHandoff`, right after the sweep lock is persisted (changed here; #586
  remembered only after a confirmed broadcast, so a relayer timeout or unknown direct outcome left no record).
- **Invoice creation**: one sentence that a meta-address can serve many invoices (outside W4's Copy-link row).

Storage: `sessionStorage` key `ghostpay.destination-review.v1`, at most 128 records of the form
`<salted keccak of scoped destination>.<salted keccak of invoice or seller profile>`, size-checked on read
(18,000 characters). No raw address, payer, profile or invoice digest is stored. Malformed history reports
`unavailable` and is never overwritten.

## Review and fixes in this slice

An independent AI-assisted review (not a professional audit) of the combined change reported, and this branch fixed:

| Finding | Fix |
|---|---|
| Checkout texts described a repeat as a harmless retry and pointed to the seller | Reworded in all four catalogs; both notices are warnings |
| Request-only wallets: window `blur` (the wallet's own signing popup) expired the comparison and showed "account may have changed" while signing | `blur` removed; only `visibilitychange` to hidden and `pagehide` count; text says "or you left this page" |
| `invoiceDigest` ran outside the advisory's catch in `onPrepare` | Wrapped; a failure yields `unavailable` |
| Unknown-outcome sweeps were never remembered | Remembered at handoff (direct and relayed) |
| `reuse.ownPayment` claimed a received payment | "announced as a payment" (scan matches are announcements) |
| #586 removed main's accurate "a fresh one-time address is derived" note and renamed the label | Restored main's `pay.destinationNote` and `pay.final.destination` in all catalogs; e2e locator follows |
| Locale files gained mixed line endings from an edit script | Normalized; catalog diffs are additive only |
| Optional entry suffix unused; WeakMap rebuilt per render | Entry format strict; map created once |

Accepted as is (documented, not changed): history stays tab-scoped and salted next to its fingerprints, so a script
or extension in the same tab could test guessed pairs; another tab or origin cannot read it. Any provider
`accountsChanged`/`chainChanged` event ends the comparison even if the value did not change (informational only).

## Evidence (local, Windows, Node 22, this branch)

Recorded in the PR description with exact commands and counts: web typecheck, ESLint on the changed files, focused
Vitest (reuse unit and seeded property tests, wallet scope, Sweep, Pay, i18n), full web Vitest with coverage,
red/green mutation checks, lean build and the Playwright reuse case where the local browser allows. Hosted CI on the
exact head is the authority. Not done: real wallet extensions, physical devices, live testnet.
