# @ghostpay/sdk

Typed ESM helpers for building, signing, linking and verifying GhostPay invoices,
an optional merchant API client, local events, React hook factories and JSON schemas.
This is a private workspace package; public distribution and licensing are separate
owner decisions. It does not require a merchant service to use the invoice helpers.

## Invoice helpers

The root export provides `buildInvoice`, `signInvoiceWith`, `encodeInvoiceLink`,
`parseInvoiceLink`, `invoiceBuilder`, `verifyInvoice`, `verifyFragment` and
`createClient`, together with their types and typed errors. The builder validates
the existing invoice schema; money is represented using decimal strings.

```ts
import { createClient, type NewInvoice } from '@ghostpay/sdk';

// The caller supplies a schema-valid invoice and its matching signing key.
// The caller owns the key and must dispose of it after its intended uses.
async function makeLink(input: NewInvoice, signingKey: Uint8Array) {
  const client = createClient();
  const invoice = client.invoices.build(input);
  const signed = client.invoices.sign(invoice, signingKey);
  return client.invoices.toLink(signed, { encrypt: true });
}
```

Omitting the link `baseUrl` returns a bare `#gpi=v1.` fragment. Supplying a clean
HTTP(S) payment-page URL prefixes that fragment. Encryption does not make a link
safe to disclose: an encrypted link carries its decryption material. Treat the
whole fragment as a bearer secret and keep it out of logs and query parameters.

## Verification and payment policy

```ts
import { createClient } from '@ghostpay/sdk';

async function inspectLink(link: string, pinnedSigners: readonly string[]) {
  const client = createClient();
  return client.invoices.verify(link, {
    expectedChainId: 11155111,
    mode: 'live',
    pinnedSigners,
  });
}
```

First inspect `parsed`; a parse failure carries a coarse `invoiceCode` and no
verdict. For parsed invoices, `verdict.ok` means there are no blocking warnings.
An invalid signature, expired invoice, wrong expected chain, or test/live mismatch
blocks verification. A valid signature proves integrity under its signing key;
`mayShowVerifiedSeller` additionally requires that key to be pinned by the caller.
Use the pinned keys from the caller's trusted state, not from the incoming link.

An expired **price quote** is intentionally a warning under
[the verification API specification](../../docs/remote/usability/specs/invoice-verification-api.md).
It does not make `ok` false. Payment consumers must enforce their own current
quote, manifest, chain, amount and authorization checks before preparing or
sending a transaction. This SDK verdict neither fetches a fresh price nor
authorizes payment. `parseInvoiceLink` also does not reject every invalid-signature
result by throwing; inspect its trust result or use the full verifier.

The standalone `verifyFragment` accepts a fragment and an explicit `nowSeconds`;
`verifyInvoice` operates on an already authenticated parser result. The client
wrapper supplies its injected clock, or `Date.now`, when no clock override is
provided. No verification helper obtains a wallet connection or broadcasts.

## Optional merchant API and integrations

`createMerchantApi` and `client.merchant` validate responses from a caller-selected
merchant service. Configure an HTTPS base URL (HTTP is limited to loopback), an
optional injected `fetch`, and any API key explicitly. Creating the client makes
no network request, starts no timer and reads no storage. Merchant calls are the
network boundary; this package does not ship the merchant server or hold funds.

`TypedEmitter` and `client.on` deliver events only to local listeners registered
by the caller. `createReactHooks` accepts a React-like dependency rather than
adding a framework dependency. `invoiceJsonSchema`, `webhookEventJsonSchema` and
the `./schema/*.schema.json` exports describe the existing wire formats; runtime
validation remains necessary.

## Development and scope

From the repository root, use `npm run build --workspace @ghostpay/sdk`,
`npm run typecheck --workspace @ghostpay/sdk`,
`npm run lint --workspace @ghostpay/sdk` and
`npm test --workspace @ghostpay/sdk`. `npm run emit:schema --workspace @ghostpay/sdk`
regenerates the checked-in schemas. Coverage thresholds are defined in the package
Vitest configuration.

Implementation and regression coverage are in [src/](src/). Consumer integration,
public package publication, real merchant-server compatibility and external
security review are separate qualification steps. This README describes the
current API and does not claim a production release.
