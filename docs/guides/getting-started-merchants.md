# Getting started: merchants

GhostPay's current merchant web workflow is **seller setup → signed invoice → scan → explicit local matching →
seller receipt → sweep**. It remains experimental and intended for testnet development. Ordinary payment requires
verified deployment information; a listed network is not evidence of a qualified deployment. Check the
[current product guide](../user/product-guide.md) and [completion handoff](../handoffs/PRODUCT_COMPLETION_HANDOFF.md)
for the exact build and remaining validation gates.

Each payment derives a one-time destination from your public meta-address. This reduces address reuse. The payer
still knows the destination they paid, and the chain still exposes transfers, amounts, timing and later sweeps.

## 1. Prepare keys and backups

1. Open **Seller keys** and generate keys, or import your existing encrypted GhostPay keystore.
2. Download the encrypted keystore. The current export policy requires **at least 14 characters** and rejects weak
   passphrases; a generated suggestion is available. Store the file and passphrase separately.
3. Test import in another browser profile before discarding the original session. New keys initially live in the
   current tab; refreshing without a usable backup can lose them.
4. Keep an external keystore even if you save an encrypted browser vault. Site-data deletion removes that vault.
5. Export separate tag and reconciliation archives if you rely on them. These archives do not replace your keys.

| Material | Handling and purpose |
| --- | --- |
| Public meta-address and public configuration | Share deliberately; they let others derive payment destinations and can link your invoices or devices |
| Public signing key | Let customers compare it with a trusted copy; a valid signature alone does not establish your identity |
| Spending private key | Keep secret; it controls funds |
| Viewing private key | Keep secret; it discovers payments and unlocks related local records |
| Signing private key | Keep secret; it authorizes invoice and receipt signatures |
| Encrypted keystore and passphrase | Protect separately; public configuration cannot reconstruct them |

The full build includes a guided key/tag backup checklist; the lean build keeps a narrower keystore flow. See
[SellerKeys](../../apps/web/src/views/SellerKeys.tsx), [keystore policy](../../apps/web/src/lib/keystore.ts) and
[public-device exchange](../user/public-device-exchange.md).

## 2. Choose the network and provider

Use a configured testnet and its exact allowlisted assets. The current EVM configuration includes Ethereum Sepolia,
Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, BNB Smart Chain Testnet and Avalanche Fuji. Mainnet entries
remain disabled. The [product guide's network table](../user/product-guide.md#networks-and-assets) gives chain IDs
and token symbols; compare the actual token address too.

In **Settings**, choose the intended RPC endpoint. An independent second endpoint can expose disagreements, but
shares your queries with another operator. The payment gate also checks deployment signatures and on-chain code
and configuration; a working RPC does not supply a qualified deployment. See
[deployment verification](../DEPLOYMENT_MANIFEST.md).

Your meta-address is a stable public identifier. The full build includes a public registry view; publishing is a
separate wallet action and connects the registration to that wallet. Scanning a registry QR only previews public
data. Keep this privacy choice separate from routine invoice creation.

## 3. Create and preserve the signed invoice

In **Create invoice**, choose the chain, token, fixed token amount, expiry and fee policy. Review the gross amount,
fee and net amount. Routed EVM payments use a 25-basis-point fee (0.25%), with integer rounding and the selected
payer/seller fee policy reflected in the preview. Direct payments and relayer costs have different boundaries;
see [Fees](../user/fees.md).

Optional memo and line items can be encrypted. A link containing its decryption key is a **bearer link**: anyone
holding it can read the invoice. Passphrase mode requires the separate passphrase. The fragment after `#` is not
part of the HTTP request, but browsers, extensions and page code can still retain or read it.

Preserve the complete original signed link or file. A screenshot or copied amount is not the signed invoice.
Share the public signing key through a channel the customer already trusts when identity matters. Use fixed
token pricing for the ordinary supported flow; fiat-priced paths need their separately configured feed and gates.

**Register for local matching** is optional and starts off. Registering an invoice lets the seller review proposed
matches later; it does not mark the invoice paid. Source: [CreateInvoice](../../apps/web/src/views/CreateInvoice.tsx).

## 4. Scan, verify and explicitly accept a match

Use **Scan and receive** with the intended seller keys and network. An announcement or imported observation is
discovery data. Review the actual verification status, recipient, asset, amount and confirmation state before
treating it as payment. A balance alone does not establish which invoice a payment settles.

The local reconciliation ledger can suggest eligible invoice/payment associations. Review and explicitly confirm
the intended match. Ambiguous, stale or unsupported evidence needs investigation. An imported history is historical
data until refreshed against the chain; restoring it does not independently reverify payment.

See [reconciliation and receipts](../user/reconciliation-and-receipts.md) for the evidence distinctions, merge
preview and archive behavior. The ledger is local to the browser and seller scope, not a shared merchant database.

## 5. Issue and preserve a receipt

An eligible verified scan result can offer seller receipt creation. Load the original signed invoice, review the
binding and required consent, then export the signed receipt. The lean build requires validated invoice binding.
A manually typed digest in the full build remains an annotation, not evidence that the invoice was validated.

**Keep the original digital receipt JSON**, the invoice and relevant transaction references. A QR image is a
convenient representation of serialized data; it can be damaged or lose its context. A valid seller receipt
signature attests to the signed fields and signing key. It does not independently establish payment or identity.

Back up the encrypted reconciliation archive separately. Review a restore preview before applying it to the same
seller scope. The archive is not a substitute for a keystore, and its signatures do not promote observations into
verified payments. See [receipt handling](../user/product-guide.md#keep-the-original-receipt-use-qr-as-a-convenience).

## 6. Sweep deliberately

Review the exact destination, token, amount, fee and method before authorizing a sweep. Sweeping into a familiar
wallet can link earlier payments to you. A required token approval and a sweep are separate actions.

If broadcasting times out or its outcome is unknown, inspect the wallet and known transaction references before
retrying. Clearing a local attempt cannot cancel a transaction. Follow [Sweeping safely](sweeping-safely.md).

## Merchant extensions and their limits

| Module | What its existence means |
| --- | --- |
| [Subscription schedules](../../packages/merchant-billing/src/subscription.ts) | Periodic invoice/reminder logic; the payer pays each invoice voluntarily. It cannot pull customer funds |
| [Installment accounting](../../packages/merchant-billing/src/installments.ts) | Schedule and allocation calculations; a settled ledger entry still needs independently established payment evidence |
| [Refund plans](../../packages/merchant-billing/src/refunds.ts) | Amount/destination/idempotency planning; a fixture record or state transition does not execute a refund |
| [Merchant approval policies](../../packages/merchant-multisig/src/index.ts) | Separate approval/proposal primitives; they do not establish operational on-chain authority in the ordinary web workflow |
| [Webhooks](../../packages/merchant-hooks/src/webhooks.ts) | Separate operator integration and delivery requirements; not a hosted notification service supplied by the browser |
| [WooCommerce](../../integrations/woocommerce/README.md) / [PrestaShop](../../integrations/prestashop/README.md) | Separate shop integrations with their own installation and qualification requirements |

These modules do not create a complete merchant operations dashboard in this interface. CLI/merchant work on
[PR #91](https://github.com/djshellshoxxx/GhostPay/pull/91) is a separate lane (`packages/cli` is present in this tree as of 2026-11-11) and must be reviewed on its own source
and acceptance evidence before relying on new commands or execution authority.

Next: [Product guide](../user/product-guide.md), [privacy limits](../user/privacy-limits.md),
[technology attribution](../user/technology-attribution.md).
