# Spec: OpenAPI 3.1 + JSON Schema
## Requirements
- R1 `packages/sdk/schema/invoice.v1.schema.json` and `webhook-event.v1.schema.json` (draft 2020-12) generated from `src/schemas.ts` via `npm run emit:schema` (after build).
- R2 `docs/remote/usability/openapi/ghostpay-merchant-api.yaml` (3.1.0) documents the self-hosted merchant API and the webhook callback. Documentation only: no hosted service.
- R3 Money fields are integer strings; unknown keys rejected (`additionalProperties:false`).
## Acceptance tests
Drift guard (files equal source objects); real invoices validate; 18 adversarial invoice mutations and 11 webhook mutations fail; yaml declares 3.1.0 and lists every route the client calls and every event type.
