# ADR-0024: Invoice schema v2 with a seller gas-buffer policy

Status: proposed (pre-audit)

## Context
Spec 13 (gas buffer v2) lets a payer forward a native-coin buffer with an ERC-20 payment (`payERC20WithBuffer`) so the
seller can sweep the one-time address without funding it from a linked wallet. Until now the seller had no say: the payer's
app chose any buffer up to an app-wide cap (0.01 native coin). Sellers need to (a) decline buffers (each buffer publicly
links payment, one-time address and payer), (b) cap them, and (c) set a floor so a payer cannot send a dust buffer that
does not cover a sweep (dust griefing). The roadmap forbids silent refunds of a buffer.

## Decision
1. Invoice `v: 2` = v1 plus a required public field `bufferPolicy {accepted: boolean, maxWei: string, minWei: string,
   refund: 'none'}`. `v: 1` invoices are unchanged and must not carry the field. `createInvoice` emits `v: 2` exactly when a
   policy is supplied, so existing links, signatures and vectors stay byte-identical.
2. Validation (`@ghostpay/invoice-schema`), strict like the rest of the schema: exactly those four keys; wei amounts are
   canonical decimal strings `0..2^256-1`; `refund` must be `'none'`; declined means `accepted: false` with both bounds
   `"0"`; accepted means a token invoice (not `native`) with `1 <= minWei <= maxWei`. A v2 invoice without a policy fails at
   `v`; a v1 invoice with one fails at `bufferPolicy`.
3. The field is in the public part and covered by the existing signature (domain `GhostPay.Invoice.v1\0` over the canonical
   full invoice, which already includes `v`). The envelope format (`#gpi=v1.`) does not change.
4. Payer app: a declined policy hides the buffer; an accepted policy bounds it by `min(maxWei, app cap)` and raises an
   estimate below `minWei` to `minWei` (shown to the payer before anything is sent); if the bounds cannot be met the buffer
   is refused. A v1 invoice keeps today's behaviour (app cap only, no floor).

## Alternatives
A separate optional field in v1: rejected, old parsers reject unknown keys and a silent meaning change inside v1 would
let two app versions read one signed invoice differently. Putting the policy in the private (encrypted) part: rejected,
the payer must evaluate it and it is not sensitive beyond what the buffer itself reveals on-chain. Allowing refunds:
rejected by the roadmap (no silent refunds; a refund would need another linked transfer).

## Consequences
Older app versions fail closed on v2 links (`SchemaError` at `v`), which is the intended upgrade path. The router still
receives `maxBufferWei = bufferWei`; the policy is enforced client-side only (no contract change). The Create page does not
yet offer the policy (sellers can only produce v2 invoices programmatically); that UI is open work. Not audited.
