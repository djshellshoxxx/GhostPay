# GhostPay for PrestaShop (module skeleton)

Same payment-link flow as `integrations/woocommerce` (see its README for the invoice-service contract and webhook rules): checkout option -> `validation` controller (CSRF token via `Tools::getToken`) creates the order in a new "Awaiting GhostPay payment" state, asks YOUR invoice service for a link (HMAC-signed, https-only cURL, no redirects), accepts it only for the configured host with a `#gpi=v1.` fragment, redirects the customer. `webhook` controller verifies the `GhostPay-Signature` HMAC over the raw body, claims the nonce atomically in `ghostpay_nonce` (primary key), validates the event strictly, and moves the order to `PS_OS_PAYMENT` only if `amountMinor >=` total in the same currency. No remote scripts, no third-party calls.

`ghostpay/classes/` holds copies of the three WordPress-independent classes from the WooCommerce plugin (only the guard line differs); keep them in sync.

## Skeleton status (honest)
- `php -l` clean on all files (PHP 8.3). The shared classes are covered by `integrations/woocommerce/tests/run.php`.
- NOT installed in PrestaShop; not run. Known gaps: settings form rendering (`HelperForm` TODO), below-total / partial / expired event handling, refunds, secrets stored in `Configuration` (consider environment-based secrets), the cart total is read as float and then formatted (TODO: string-exact total), translations, module zip packaging, PrestaShop validator.
