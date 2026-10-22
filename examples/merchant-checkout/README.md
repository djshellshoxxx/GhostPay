# merchant-checkout

Creates and signs a GhostPay invoice and prints the payment link, a static HTML button and the QR payload size. No network.

```
node examples/merchant-checkout/checkout.mjs --demo --amount 12.50 --currency USD
node examples/merchant-checkout/checkout.mjs --key-file signing.key --meta "$META" --base-url https://pay.example.org/ --amount 49.00 --currency EUR --description "Order 1042" [--encrypt]
```
- `--demo` uses throwaway keys and a throwaway meta-address: the link cannot receive real funds.
- Key file: 64 hex chars, mode 600 (the script refuses otherwise). Never put keys on the command line.
- Amount: decimal string, max 2 decimals, converted to minor units with string math (no floats). Other exponents (JPY, BHD) are not handled here.
- `--encrypt` puts line items and memo behind an AES-GCM key held in the link fragment.
- Treat the link as a secret; share only with the payer. The button HTML is escaped by `merchant-hooks` and contains no script.

Status: ran `--demo` OK; rejects bad amounts and http base URLs. Pending: switch to `@ghostpay/sdk` once it is published (same inputs).
