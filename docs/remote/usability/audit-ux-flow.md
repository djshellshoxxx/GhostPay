# Audit: ux-flow (reconcile, undo, embed, return)

Scope: packages/ux-flow/src. Self-review by the author; no independent review.

## Threat model
Untrusted: proof codes, stored snapshots, embed links/labels/options, return targets, caller clocks. Trusted: caller-supplied verifier and clock functions.

## Findings and mitigations
| # | Sev | Finding | Evidence / fix |
|---|---|---|---|
| 1 | High (mitigated) | Auto-confirming ambiguous matches would credit the wrong invoice | reconcile never applies money; ambiguous leaves invoices unchanged (T-1) |
| 2 | High (mitigated) | Proof replay across invoices or twice | ALREADY_CONFIRMED, DUPLICATE_TX tests |
| 3 | High (mitigated) | Open redirect via lookalike/userinfo/backslash/scheme-relative targets | isAllowedReturn exact-origin + verbatim prefix check, 20 negative vectors |
| 4 | Medium (mitigated) | HTML injection via label/link | escape of & < > " ' `; link re-serialised; options allowlisted |
| 5 | Medium (mitigated) | Window extension by rolling back the clock | monotonic clamp test |
| 6 | Medium (open) | Tolerance misconfiguration (e.g. 100% bps) makes any payment "paid" | bps capped at 10000 only; UI should bound to a small value (suggest <= 100 bps) |
| 7 | Low | Proof is not authenticated: it only binds nonce to a tx the payer chose; seller must still see that tx in their own scan | documented; confirm requires the tx in observed transfers |
| 8 | Low | Fragment return still leaks proof to merchant page JS and any scripts on it | documented in specs |
| 9 | Info | UndoQueue is client-side only; does not reverse on-chain effects | by design (POLIC-C) |

## Unverified
- Nonce format assumption (lowercase hex 16-64) against invoice-schema; token identifier convention.
- embed validateEmbedLink parity is tested against hand-copied vectors, not by running ghostpay-embed-v1.js; no DOMParser test (no DOM in node).
- Typed-data/contract parity for policy cancel (deferred, not built).
- No bundle scan or e2e run; nothing wired into apps/web.
