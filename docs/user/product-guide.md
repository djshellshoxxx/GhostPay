# GhostPay product guide

This guide describes the product-completion branch built on PR #90 (`5628bc00b05a6dd0d9cd89f04f0385d9119281ac`).
Use the [current completion handoff](../handoffs/PRODUCT_COMPLETION_HANDOFF.md) for newer validation and release gates.
GhostPay remains experimental. Code support, local test success and public deployment qualification are separate states.

## What the interface provides

The core workflow is **seller keys → invoice → payer review → scan → explicit reconciliation → receipt → sweep**.
The [full shell](../../apps/web/src/App.tsx) also mounts Bitcoin, Solana and TRON views and a guided key/tag backup
checklist. The [lean shell](../../apps/web/src/AppLean.tsx) intentionally exposes a narrower workflow. Scheme-2
policy accounts remain behind their disabled gate.

| Capability | Current boundary |
| --- | --- |
| Signed EVM invoices | Chain/asset/amount/expiry validation, optional encrypted private fields, signing and local review |
| Ordinary payment | Accepted deployment information and supported chain/asset required; transaction review and wallet authority checks remain mandatory |
| Scanning | Discovery is separate from payment verification and finality |
| Seller receipts | Signed-field attestation, invoice binding and original JSON export; signature alone does not independently prove payment |
| Reconciliation | Optional encrypted local registrations, observations and receipt archive; seller confirms proposed matches |
| Device exchange | Public-key comparison and allowlisted preference transfer, never a private-key backup |
| Merchant extensions | Separate package/shop/operator work; no general subscription debit or refund execution is implied by the web interface |
| Recovery | Encrypted backup restoration exists; lost-key policy recovery is not an operational service |

There are no calendar/timestamp-server controls or notarization certificates in this GhostPay interface. The web
app requires JavaScript; separate command-line/operator tools do not make the no-JavaScript page capable of payment.

## Networks and assets

The code enables these EVM **testnet configurations**, not qualified deployed contracts. Ordinary payment stays
unavailable without verified deployment information. Mainnet entries remain disabled.

| Network | Chain ID | Native asset | Configured test-token symbols |
| --- | ---: | --- | --- |
| Ethereum Sepolia | 11155111 | ETH | USDC, EURC |
| Base Sepolia | 84532 | ETH | USDC, EURC |
| OP Sepolia | 11155420 | ETH | USDC |
| Arbitrum Sepolia | 421614 | ETH | USDC |
| Polygon Amoy | 80002 | POL | USDC |
| BNB Smart Chain Testnet | 97 | tBNB | None |
| Avalanche Fuji | 43113 | AVAX | USDC, EURC |

Source: [chain table](../../packages/chain-adapters/src/config/chains.ts) and exact per-chain
[token address allowlist](../../packages/chain-adapters/src/config/tokens.ts). A token symbol is not an address
identity. Other network families use separate views and verification rules, not EVM invoice routes.

## Set up a seller

1. Open **Seller keys** and generate keys, or import your existing encrypted keystore.
2. Download an encrypted keystore. The export policy requires at least **14 characters** and rejects weak
   passphrases; a generated suggestion is available. Keep the file and passphrase separately.
3. Verify import in another browser profile before discarding the original session. A displayed public meta-address
   does not mean its private keys were backed up.
4. If you choose the encrypted browser vault, keep an external keystore too. Clearing site data deletes local state.
5. Configure the intended RPC and optional independent second RPC in **Settings**. Endpoints are stored in plaintext,
   including credentials embedded in their path/query. Read the provider/privacy explanations.

The spending key controls funds, the viewing key discovers payments, and the signing key signs invoices/receipts.
New in-memory keys can be lost on reload. Public seller configuration cannot restore secret keys. Sources:
[SellerKeys](../../apps/web/src/views/SellerKeys.tsx), [session lifecycle](../../apps/web/src/lib/session.ts),
[keystore policy](../../apps/web/src/lib/keystore.ts) and [settings](../../apps/web/src/lib/settings.ts).

## Create and preserve an invoice

In **Create invoice**, select the chain, asset, fixed token amount, expiry and fee policy. Review gross, fee and
net amounts. Memo and line items may contain private information; choose the appropriate encryption mode.

A link carrying its decryption key is a bearer link: anyone holding it can read the invoice. Passphrase mode
requires the separate passphrase. Keep the complete original signed link/file; copied visible fields are not the
signed document. Changing interface language does not rewrite signed bytes, hashes or amounts.

Optional local registration starts off. It permits later matching suggestions, not automatic paid status.
Fiat-priced and experimental paths have separate feed/deployment gates; a form is not evidence that those
dependencies are available. Source: [CreateInvoice](../../apps/web/src/views/CreateInvoice.tsx).

## Review and pay

In **Pay**, inspect the signature, expected seller signing key, chain, asset, amount, expiry, fee recipient and
actual transaction target. A signature proves consistency with a key, not the seller's identity. A key you
deliberately trusted earlier supplies a separate trust decision.

Connect the intended account/chain and read each request. Token approval or permit signing is distinct from
payment; an approval can remain on-chain after payment fails. A wallet, chain, invoice or deployment change can
invalidate the review. Sources: [Pay](../../apps/web/src/views/Pay.tsx), [wallet boundary](../../apps/web/src/lib/wallet.ts),
[transaction execution](../../apps/web/src/lib/payExec.ts).

| Outcome | Practical meaning |
| --- | --- |
| Prepared / waiting for authorization | A review exists; this alone does not establish submission |
| Signed | Authorization or transaction bytes are signed, not necessarily broadcast or confirmed |
| Broadcast attempted / outcome unknown | Submission may have reached the wallet/network; inspect before another attempt |
| Pending / included | A reference or mined result exists; inspect verification and finality |
| Failed / replaced / reorganized | Review the exact transaction and any preceding approval; failure does not prove no action happened |
| Unsupported / verification incomplete | The flow cannot establish all required facts; this is not a verified result |

Retain transaction references and public error codes. **Clearing an attempt is bookkeeping, not cancellation.**
It does not undo a request, allowance or transaction. Unknown outcomes must not become “nothing sent.”

## Scan, reconcile and verify

Scan with the intended seller keys, chain and providers. Announcement discovery is not independently verified
payment. Review transaction, receipt, recipient, asset, net amount and confirmation checks. Reorganizations and
conflicting providers can invalidate earlier observations.

The reconciliation vault proposes matches from eligible observations. A unique proposal still needs explicit
confirmation. Ambiguous matches need review; imported history and signed receipts do not become payment evidence.
A changed scan/key context invalidates pending review. See [reconciliation and receipts](reconciliation-and-receipts.md)
and [Scan](../../apps/web/src/views/Scan.tsx).

## Keep the original receipt; use QR as a convenience

An eligible scan result can create a seller-signed receipt. Supply the original signed invoice for binding,
verify the fields and give explicit consent. Lean mode requires validated invoice binding. Full mode may permit
an unbound typed digest, which remains an annotation rather than a validated invoice.

Download `ghostpay-receipt.json`. Reopen the invoice and import that original receipt to check its signature and
expected fields again. Keep the invoice and transaction references separately as context.

**QR codes represent serialized information. Preserve the original digital receipt whenever possible.** An image
can be degraded, incomplete or detached from its context. The payer's submission record, seller-signed receipt,
valid invoice and independently checked payment are different things. Sources:
[ReceiptPanel](../../apps/web/src/components/ReceiptPanel.tsx), [binding rules](../../apps/web/src/lib/receipts.ts),
[payment-request QR](../../apps/web/src/components/PaymentRequestQr.tsx).

## Restore the correct file

| File | Correct use | What it does not do |
| --- | --- | --- |
| Encrypted seller keystore | Restore keys with the matching passphrase | Restore tag/reconciliation archives automatically |
| Public seller configuration | Compare public keys and chain declarations | Restore private keys, authenticate a sender or prove freshness |
| Original invoice link/text | Review an invoice or bind a receipt | Prove settlement |
| Signed receipt JSON | Verify signature and expected fields | Independently establish chain payment |
| Reconciliation backup | Preview/restore archive state with the same viewing key | Reverify imported observations |
| Tag archive, full build | Restore its supported data with its unlock information | Replace the seller keystore |

Wrong formats, ambiguous/extra fields and oversized inputs are refused where the format requires them. Retry
with the intended file after correcting the input; selecting the same file again is supported. Cancellation or
a key/network change can invalidate pending reads. Do not refresh away unsaved keys merely to retry an import.

## Public device exchange

Compare the public values on both devices. A checksum checks accidental corruption, not identity. Settings
transfer contains only delay range, idle-lock timeout, theme and fragment-clearing preference. Endpoints and pinned
trust stay local. Apply only after review. Camera permission is requested when scanning starts; paste/file alternatives
are useful when it is unavailable. See [public device exchange](public-device-exchange.md).

## Privacy and troubleshooting

Settings are plaintext. Optional vaults/archives encrypt contents but retain observable scope, chain and ciphertext
size. Unlocked content is available to the page. Locking does not delete records; clearing site data does. Exported
files remain until separately deleted.

RPC/explorer queries expose lookups to those services. A second independent RPC can identify disagreement but
shares queries with another operator. Selecting Tor/proxy preferences does not install or prove transport.
Stealth addressing does not hide public graphs or sweep destinations. See the [shipped privacy page](../../apps/web/privacy.html).

| Symptom | Next step |
| --- | --- |
| Deployment/network unavailable | Inspect the gate; do not substitute unqualified addresses or disable it |
| RPC failure/disagreement | Check endpoint and chain, then refresh evidence; editing an endpoint invalidates its old result |
| Unknown broadcast | Inspect wallet and references before explicitly clearing/retrying |
| Storage unavailable | Check site permissions and retry transient failures; preserve backups before clearing data |
| Backup cannot unlock | Match file, passphrase and seller scope; public config cannot substitute for secret keys |
| English security text in another locale | The translation awaits review; fallback is intentional |

## Developer and operator references

- [Merchant workflow](../guides/getting-started-merchants.md), [technology attribution](technology-attribution.md).
- [Architecture specification](../APP_AND_RELAYER_SPEC.md), [deployment manifest](../DEPLOYMENT_MANIFEST.md),
  [threat model](../threat-model/THREAT_MODEL.md), [policy gates](../adr/ADR-0027-policy-end-to-end-gates.md).
- [External fixtures](../operators/external-integration-fixtures.md), [release procedure](../operators/release-and-verify.md).
- Build/test commands: [root scripts](../../package.json), [web scripts](../../apps/web/package.json),
  [Playwright configuration](../../apps/web/playwright.config.ts). Build workspace libraries first. Distinguish mocked,
  local-node, browser and public-network evidence and record results on the exact integrated source.
