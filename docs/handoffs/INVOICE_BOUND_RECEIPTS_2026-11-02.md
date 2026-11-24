# Invoice-bound seller receipts — implementation contract

Base: published `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`, tree `86214bc44259326379239a99bfd2c3bd8572997a`. The owner authorized continuing from this verified source while the unavailable consolidation remains preserved as unresolved history, not recovered source.

This additive slice reuses receipt/1, invoice parsing/signature verification, exact router-fee arithmetic, announcement recipient derivation and existing receipt import/binding. It changes no receipt wire fields, keys, trust roots, chain configuration, fee schedule or persistence. It does not establish payment causality, real-world seller identity, independent on-chain proof or professional security approval.

## Bound creation contract

- The seller may load a signed invoice link or bare fragment locally; a link is parsed, never followed. Inputs are byte-bounded. Passphrase-protected invoices use the existing parser/KDF and explicit local disclosure consent.
- A bound receipt requires a valid invoice signature by the current seller signing key, an invoice meta-address matching the current seller keys, an unexpired fixed-token invoice and a verified router scan match on exactly the same chain and asset. Fiat-quote binding remains unavailable without a retained independently verified quote; manual attestations remain available with their existing warnings.
- Expected seller amount uses the existing `grossForNet`/`routerSplit` rules for payer-pays versus seller-pays. The scan amount must equal it exactly. The existing cryptographic announcement check must confirm the one-time recipient using the current viewing/spending keys; relabeled/mismatched recipients are refused.
- Validation displays the derived digest and verified scan facts. Signing requires a separate explicit consent. Immediately before signing, recheck expiry, seller session identity/version, current match, invoice and consent, then bind the signed receipt with the existing `bindReceiptToInvoice` before exposing JSON/QR/download.
- Changing input/match/seller, cancellation or unmount invalidates pending validation. Key clear/reimport is a session change even when public keys happen to match. No late file/parser result may install a different invoice or receipt.
- The existing invoice parser/KDF has no abort signal. One in-memory validation permit spans all receipt panels and survives unmount until the underlying promise settles. Cancellation invalidates its result without releasing that permit; editing, revoking consent or remounting cannot start a second parser/KDF. No new persistent or cross-tab coordination state is introduced.
- Existing manual-digest mode stays explicitly unbound. Its signed bytes are not promoted to invoice-bound status. Manual signature/export/archiving behavior and warnings remain covered by the original tests.

## Qualification

Add pure binding/refusal tests and component tests for valid signed input, wrong signature/key/meta-address/chain/asset/amount/recipient, expiry, missing/claimed/pending evidence, cancellation, stale async completion and final pre-sign session/expiry checks. Adapt the actual built-Worker browser journey to create a signed invoice through the product and bind/sign/export/import through product controls; preserve a separately labeled manual-digest path. Browser RPC remains an authored fixture, not a local chain.

Local execution is currently blocked by the attached runtime's process/dependency limits. New tests must not be reported passing or red until actually executed. Hosted exact-source CI, full coverage, browser/local-chain qualification, current-main integration and the independent review remain required.
