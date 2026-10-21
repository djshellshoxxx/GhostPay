# Audit: @ghostpay/merchant-ledger (self-review)

Scope: reconcile.ts, export.ts, csv.ts, decimal.ts. Pure, no I/O, no clock reads (`now` injected). Dep: @ghostpay/invoice-schema (type only).

## Threat model
Inputs (payment observations, invoice/customer text) are untrusted; outputs go to spreadsheets/accounting tools run by the merchant.
- CSV/formula injection via customer/description: mitigated (`sanitizeText`: prefix `'` on `= + - @`, leading TAB/CR, leading-space variants; control chars stripped).
- IIF delimiter injection (tab/newline): replaced with space.
- Money confusion: strict integer-string parser, bigint only; floats/signs/exponents rejected.
- Double counting: duplicate payment ids dropped; payments at/after expiry not counted.
- Misattribution: amount-only matching only when exactly one open same-currency candidate.
- Non-determinism: sorted inputs; byte-identical output for any input order.

## Findings and fixes
- F1 (fixed during testing): duplicate invoice ids made reconcile order-dependent -> now throws `duplicate-invoice`.
- F2 (fixed): leading-space formula (` =1+1`) added to escape set.

## Honest limits
- Bidi/zero-width characters (U+202E etc.) are not stripped, only C0/C1 and line/para separators; formulas hidden behind exotic whitespace (NBSP) are not caught.
- Fiat-equivalent amounts are supplied by the caller; no FX or oracle logic here. Overpayment/refund handling is report-only.
- IIF and Xero layouts are modelled on public docs from memory, NOT validated against QuickBooks/Xero import. Treat as best-effort.
- Currency exponent table is a small ISO subset; override via `exponents`.
- Tax: invoice `taxMinor` is trusted when present (it is signed data); the computed path rounds once per invoice, not per line. Jurisdiction rules (per-line rounding, reverse charge) not modelled.
- Not reviewed externally; no mutation testing run.
