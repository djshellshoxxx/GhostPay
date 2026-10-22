# GhostPay for Shopify (skeleton, documentation only)

Shopify does not let ordinary apps add a new checkout payment gateway: that needs the Payments Partner program (offsite payments app) and Shopify's review. This folder therefore describes the realistic non-gateway options and ships one Liquid snippet. Nothing here was run against a store.

## Option A: payment-link app (no gateway approval)
Components, all merchant-hosted:
1. **Invoice service** (same contract as `integrations/woocommerce/README.md`): signs invoices and returns `{invoiceId, link}`. Holds the only signing key.
2. **Embedded app backend** (Shopify CLI Node/Remix template, not included). Flow: merchant creates a draft order (or order with a "Pending" manual payment method); app calls the invoice service with `amountMinor` computed from the order total using decimal-string math and the currency's minor-unit exponent; app stores `ghostpay.payment_link` as an order metafield (definition: `order`, namespace `ghostpay`, key `payment_link`, type `single_line_text_field`, **not** storefront-readable in public APIs; expose to the customer only through the order status/customer account extension or the invoice email you send).
3. **Webhooks in**: (a) Shopify `orders/*` webhooks: verify `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(app secret, raw body)) with a constant-time compare before parsing; (b) GhostPay webhooks: reuse `verifyWebhook` + `parseWebhookEvent` from `@ghostpay/merchant-hooks` (see `examples/webhook-receiver`). On `invoice.paid`/`invoice.over` with `amountMinor >= due` and matching currency, call the Admin GraphQL `orderMarkAsPaid` mutation (needs `write_orders`). Idempotent on GhostPay event id; Shopify delivers webhooks at least once.
4. **Scopes**: request only `read_orders`, `write_orders` (and `write_draft_orders` if you use drafts). No customer PII scopes.
5. **Secrets**: Shopify API secret, GhostPay webhook secret and signing key live in the app host's secret store, never in the repo or theme.

## Option B: theme snippet only
`snippets/ghostpay-button.liquid` renders a static button from a link you generated yourself (email, order metafield). It checks https, exact host, no query/credentials and the `#gpi=v1.` fragment, and escapes the label. Theme setting `ghostpay_pay_host` goes into `config/settings_schema.json` as a text input. Do not put payment links in public theme assets, product pages or anything cached for other visitors.

## Not provided / unverified
App code, GraphQL calls, metafield definitions, extension targets, the snippet's behaviour in a live theme (Liquid not linted; no Shopify CLI/theme-check here), refunds, multi-currency presentment rules, Shopify app review requirements.
