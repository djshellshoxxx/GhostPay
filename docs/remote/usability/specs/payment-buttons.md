# Spec: payment buttons (@ghostpay/merchant-hooks)
## Requirements
- R1 `buildPaymentLink(signed, {baseUrl, encrypt?, rng?})` uses invoice-schema `encodeFragment`; result `{url, fragment}`.
- R2 `baseUrl`: https only, no credentials/query/fragment (localhost http allowed only via explicit `allowInsecureLocalhost`).
- R3 `buildPaymentButton({url, label})` returns `{href, html}`; html is a single static `<a>`; label escaped and capped (40 cp), control chars stripped; href escaped; `rel="noopener noreferrer"`; NO script, iframe, remote asset, inline handler.
- R4 Fragment must start with `#gpi=v1.` and contain only base64url chars.
## Acceptance tests
link equals base+fragment and parseFragment verifies; `"><script>` label/URL escaped; non-https rejected; credentials/query rejected; no `<script`/`on*=`/`src=` in output; label cap; bad fragment rejected.
