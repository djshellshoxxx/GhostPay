# GhostPay for WooCommerce (payment-link flow)

Classic-checkout gateway. The shop never signs invoices and never loads remote code:

1. Customer chooses GhostPay. WooCommerce verifies its own checkout nonce, then calls `process_payment()`.
2. The plugin POSTs `{orderId, currency, amountMinor, expiresInSeconds}` to YOUR invoice service (`<service_url>/invoices`), HMAC-signed with the same `GhostPay-Signature` scheme as webhooks. The service holds the signing key, builds the signed invoice (`@ghostpay/invoice-schema` / `@ghostpay/merchant-hooks` `buildPaymentLink`, see `examples/merchant-checkout`) and answers `{invoiceId, link}`.
3. The plugin accepts the link only if it is `https`, on the configured GhostPay host, has no credentials/query/port and a `#gpi=v1.` fragment, then redirects the browser to it. The link is a bearer secret and is not stored.
4. GhostPay-side webhooks hit `/?wc-api=ghostpay` (`POST`). Body is capped at 64 KiB, the HMAC is checked over the raw bytes before parsing (timestamp window 300 s, constant-time compare, atomic nonce claim only after a valid MAC), and event schema is strict. A separate unique option claim keyed by event ID and provider transaction ID makes processing idempotent across concurrent deliveries and fresh signature nonces. Live claims return a retryable response; failed order saves release their claim; completed order handling seals it. `invoice.paid`/`over` completes the order only if `amountMinor >= order total` in the same currency (decimal-string math, no floats); a smaller amount puts the order on hold; `partial` adds a note; `expired` cancels a still-pending order.

Why no embed script: the embed SDK is a script served from the GhostPay app origin. A plain redirect/anchor avoids any third-party script on the checkout page and works with a strict CSP.

## Install (manual)
Copy `ghostpay-for-woocommerce/` to `wp-content/plugins/`, activate, then WooCommerce > Settings > Payments > GhostPay. Put secrets in `wp-config.php` rather than the database:
```php
define( 'GHOSTPAY_SERVICE_SECRET', '<64+ hex chars>' );   // signs requests to your invoice service
define( 'GHOSTPAY_WEBHOOK_SECRET', '<64+ hex chars>' );   // verifies GhostPay webhooks
```
Never commit those values. Invoice service contract: `POST /invoices` (JSON body, `GhostPay-Signature` header) -> `201 {"invoiceId": "...", "link": "https://<pay_host>/#gpi=v1...."}`; `GET /health` -> `200`. The service must verify the signature the same way (use `verifyWebhook` from merchant-hooks) and must itself recompute/limit amounts it is willing to sign.

## Security notes
- "Test connection" admin action: `check_admin_referer` nonce + `manage_woocommerce` capability, `wp_safe_remote_get`, no redirects. The webhook endpoint cannot use a WP nonce (called by a server); its authentication is the HMAC.
- All outbound calls go to the configured https service URL only (`wp_safe_remote_*`, no redirects, response size limit). No analytics, no remote assets.
- Nonces live in `wp_options` (`ghostpay_nonce_*`), purged daily by cron; uninstall removes them.

## Status and limits
- PHP 8.3 CLI checks passed in this QA run: `php -l` on every PHP file and `php integrations/woocommerce/tests/run.php` (cross-language signature vector, money conversion, and event parser).
- NOT run inside WordPress/WooCommerce (no WP test environment here): gateway class, settings UI, redirect, HPOS meta queries and webhook order updates are untested. WooCommerce Blocks checkout is not supported (classic checkout only). No refunds. No coding-standards run (phpcs not installed).
