# merchant-checkout

Creates and signs a GhostPay invoice and prints the payment link, a static HTML button and the QR payload size. No network.

```
node examples/merchant-checkout/checkout.mjs --demo --amount 12.50 --currency USD
node examples/merchant-checkout/checkout.mjs --key-file signing.key --meta "$META" --base-url https://pay.example.org/ --amount 49.00 --currency EUR --description "Order 1042" [--encrypt]
```
- `--demo` uses throwaway keys and a throwaway meta-address: the link cannot receive real funds.
- Key file: 64 hex chars, mode 600 (the script refuses otherwise). Never put keys on the command line.
- Amount: decimal string, converted to `fiat.minorUnits` with string math (no floats) using the exponent the GhostPay app reads them with (`money.mjs`, same table as `apps/web` `fiatDecimals` and the shop plugins): 0 decimals for JPY, KRW, VND, CLP, ISK, UGX, XAF, XOF; 2 for every other code, three-decimal currencies such as KWD or BHD included. An amount needing more decimals than that is refused, never rounded.
- `--encrypt` puts line items and memo behind an AES-GCM key held in the link fragment.
- Treat the link as a secret; share only with the payer. The button HTML is escaped by `merchant-hooks` and contains no script.

Status: ran `--demo` OK; rejects bad amounts and http base URLs. `node --test examples/merchant-checkout/*.test.mjs` checks the conversion (and that its table equals the app's) and decodes the links the CLI prints. Pending: switch to `@ghostpay/sdk` once it is published (same inputs).
