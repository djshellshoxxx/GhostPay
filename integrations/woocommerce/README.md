# GhostPay for WooCommerce (payment-link flow)

Classic-checkout gateway. The shop never signs invoices and never loads remote code:

1. Customer chooses GhostPay. WooCommerce verifies its own checkout nonce, then calls `process_payment()`.
2. The plugin POSTs `{orderId, currency, amountMinor, expiresInSeconds}` (`amountMinor`: the order total in the GhostPay app's minor units of the currency, i.e. 0 decimals for JPY, KRW, VND, CLP, ISK, UGX, XAF, XOF and 2 for every other code, never the store's display decimals; a total that needs more decimals, e.g. a third KWD decimal, is refused at checkout) to YOUR invoice service (`<service_url>/invoices`), HMAC-signed with the same `GhostPay-Signature` scheme as webhooks. The service holds the signing key, builds the signed invoice (`@ghostpay/invoice-schema` / `@ghostpay/merchant-hooks` `buildPaymentLink`, see `examples/merchant-checkout`) and answers `{invoiceId, link}`.
3. The plugin accepts the link only if it is `https`, on the configured GhostPay host, has no credentials/query/port and a `#gpi=v1.` fragment, then redirects the browser to it. The link is a bearer secret and is not stored.
4. GhostPay-side webhooks hit `/?wc-api=ghostpay` (`POST`). Body is capped at 64 KiB, the HMAC is checked over the raw bytes before parsing (timestamp window 300 s, constant-time compare, atomic nonce claim only after a valid MAC), and event schema is strict. A separate unique option claim keyed by event ID and provider transaction ID makes processing idempotent across concurrent deliveries and fresh signature nonces. Both claims are a single `INSERT IGNORE` on the unique `option_name` with the state read back from the database (`add_option()` is not atomic: it reads, then upserts). Live claims return a retryable response; failed order saves release their claim; completed order handling seals it. `invoice.paid`/`over` completes an unpaid order (pending, on-hold, failed or cancelled: a late payment is accepted, as WooCommerce's `payment_complete()` does) only if `amountMinor >= order total` in the same currency (decimal-string math, no floats); a smaller amount puts it on hold. A payment event for an order that is already paid (or refunded, ...) never changes it: it adds a note to check for a double payment and refund. `partial` adds a note; `expired` cancels a still-pending order only when it is for the order's newest invoice (after a customer retry the older invoice may expire while the newer one is being paid).

Why no embed script: the embed SDK is a script served from the GhostPay app origin. A plain redirect/anchor avoids any third-party script on the checkout page and works with a strict CSP.

## Install (manual)
Copy `ghostpay-for-woocommerce/` to `wp-content/plugins/`, activate, then WooCommerce > Settings > Payments > GhostPay. Secrets are read ONLY from `wp-config.php` constants (or environment variables of the same name); the settings page has no secret fields, because gateway settings are stored in `wp_options`, returned by the WooCommerce REST API (`GET /wc/v3/payment_gateways`) to any key with read access, and copied into backups:
```php
define( 'GHOSTPAY_SERVICE_SECRET', '<64+ hex chars>' );   // signs requests to your invoice service
define( 'GHOSTPAY_WEBHOOK_SECRET', '<64+ hex chars>' );   // verifies GhostPay webhooks
```
Never commit those values. Upgrading from an earlier build with secret fields: the plugin deletes secrets stored in the gateway settings and shows an admin notice until each one is replaced by a different valid value. Rotate them (new random values in `wp-config.php` AND in your invoice service): the old values may have been exposed. Set the new values when you upgrade: without the constants (or environment variables) GhostPay is not offered at checkout and webhooks are refused. Invoice service contract: `POST /invoices` (JSON body, `GhostPay-Signature` header) -> `201 {"invoiceId": "...", "link": "https://<pay_host>/#gpi=v1...."}`; `GET /health` -> `200`. The service must verify the signature the same way (use `verifyWebhook` from merchant-hooks) and must itself recompute/limit amounts it is willing to sign.

## Security notes
- "Test connection" admin action: `check_admin_referer` nonce + `manage_woocommerce` capability, `wp_safe_remote_get`, no redirects. The webhook endpoint cannot use a WP nonce (called by a server); its authentication is the HMAC.
- All outbound calls go to the configured https service URL only (`wp_safe_remote_*`, no redirects, response size limit). No analytics, no remote assets.
- Nonces live in `wp_options` (`ghostpay_nonce_*`), purged daily by cron; uninstall removes them.
- Secrets never enter the database: only `GHOSTPAY_SERVICE_SECRET` / `GHOSTPAY_WEBHOOK_SECRET` (constant first, then environment). After such an upgrade, `ghostpay_exposed_secrets` holds only a SHA-256 of each deleted value until it is rotated.

## Status and limits
- PHP 8.3 CLI checks: `php -l` on every PHP file and `php integrations/woocommerce/tests/run.php` (cross-language signature vector, money conversion, event parser, and the gateway class on `tests/wp-shim.php`: a minimal WordPress/WooCommerce shim with `wp_options` and `$wpdb` on in-memory SQLite and fake orders; needs `pdo_sqlite`).
- NOT run inside real WordPress/WooCommerce: settings UI rendering, redirect, HPOS meta queries and MySQL itself are untested. WooCommerce Blocks checkout is not supported (classic checkout only). No refunds. No coding-standards run (phpcs not installed).
