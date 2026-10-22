/** JSON Schema (draft 2020-12) objects. Emitted to `schema/*.json` by `scripts/emit-schema.mjs`; a test guards drift. */

export type JsonSchema = { readonly [key: string]: unknown };

const SCHEMA = 'https://json-schema.org/draft/2020-12/schema';
const dec = { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,29})$' } as const;
const unixSeconds = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const text = (maxCodePoints: number): JsonSchema => ({ type: 'string', minLength: 1, maxLength: maxCodePoints * 2, description: `Plain text, NFC, no control characters, at most ${maxCodePoints} code points. Never render as markup.` });

/**
 * JSON Schema of the GhostPay v1 invoice (`@ghostpay/invoice-schema` `Invoice`).
 *
 * @remarks Documentation and tooling aid only. The authoritative validator is `validateInvoice`,
 * which additionally checks curve points, NFC/lone-surrogate hygiene, code-point counts and
 * `quote.expiresAt >= quote.timestamp`, none of which JSON Schema can express.
 */
export const invoiceJsonSchema: JsonSchema = {
  $schema: SCHEMA,
  $id: 'https://ghostpay.invalid/schema/invoice.v1.json',
  title: 'GhostPay invoice v1',
  type: 'object',
  additionalProperties: false,
  required: ['v', 'chainId', 'schemeId', 'metaAddress', 'nonce', 'fiat', 'token', 'amountPolicy', 'quote', 'expiresAt', 'lineItems', 'tax', 'feePolicy', 'signer'],
  properties: {
    v: { const: 1 },
    chainId: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: 'Chain ids 31337-31399 are reserved for test mode.' },
    schemeId: { const: 1 },
    metaAddress: { type: 'string', pattern: '^st:eth:0x[0-9a-f]{132}$' },
    nonce: { type: 'string', pattern: '^[0-9a-f]{32}$' },
    fiat: {
      type: 'object',
      additionalProperties: false,
      required: ['currency', 'minorUnits'],
      properties: { currency: { type: 'string', pattern: '^[A-Z]{3}$' }, minorUnits: dec },
    },
    token: { type: 'string', pattern: '^(?:native|0x[0-9a-f]{40})$' },
    amountPolicy: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { const: 'fiat_quote' } } },
        {
          type: 'object',
          additionalProperties: false,
          required: ['mode', 'tokenAmount'],
          properties: { mode: { const: 'fixed_token' }, tokenAmount: { type: 'string', pattern: '^[1-9][0-9]{0,77}$' } },
        },
      ],
    },
    quote: {
      type: 'object',
      additionalProperties: false,
      required: ['source', 'timestamp', 'expiresAt', 'maxSlippageBps'],
      properties: {
        source: { type: 'string', pattern: '^[a-z0-9][a-z0-9._:-]{0,63}$' },
        timestamp: unixSeconds,
        expiresAt: unixSeconds,
        maxSlippageBps: { type: 'integer', minimum: 0, maximum: 10000 },
      },
    },
    expiresAt: unixSeconds,
    lineItems: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unitMinorUnits'],
        properties: { description: text(200), quantity: { type: 'string', pattern: '^[1-9][0-9]{0,8}$' }, unitMinorUnits: dec },
      },
    },
    tax: {
      type: 'object',
      additionalProperties: false,
      required: ['rateBps', 'minorUnits'],
      properties: { rateBps: { type: 'integer', minimum: 0, maximum: 10000 }, minorUnits: dec },
    },
    feePolicy: { enum: ['payer_pays', 'seller_pays'] },
    memo: text(500),
    signer: { type: 'string', pattern: '^0[23][0-9a-f]{64}$' },
  },
};

/** Event types of self-hosted order webhooks (see `docs/remote/usability/specs/webhooks.md`). */
export const WEBHOOK_EVENT_TYPES = ['invoice.paid', 'invoice.partial', 'invoice.over', 'invoice.expired'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** JSON Schema of a webhook event body. Amounts are integer strings; unknown keys are rejected. */
export const webhookEventJsonSchema: JsonSchema = {
  $schema: SCHEMA,
  $id: 'https://ghostpay.invalid/schema/webhook-event.v1.json',
  title: 'GhostPay webhook event v1',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type', 'createdAt', 'data'],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$', description: 'Idempotency key: process each id at most once.' },
    type: { enum: [...WEBHOOK_EVENT_TYPES] },
    createdAt: unixSeconds,
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['invoiceId', 'currency', 'amountMinor'],
      properties: {
        invoiceId: { type: 'string', pattern: '^[0-9a-f]{32}$' },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        amountMinor: dec,
        paymentId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
      },
    },
  },
};

/** All emitted schemas, keyed by output file name. */
export const schemaFiles: { readonly [file: string]: JsonSchema } = {
  'invoice.v1.schema.json': invoiceJsonSchema,
  'webhook-event.v1.schema.json': webhookEventJsonSchema,
};
