#!/usr/bin/env node
// Merchant checkout example: create + sign an invoice and print the payment link, an HTML button and the QR payload.
// Uses only built workspace packages: @ghostpay/invoice-schema and @ghostpay/merchant-hooks. No network access.
//
//   node examples/merchant-checkout/checkout.mjs --demo --amount 12.50 --currency USD
//   node examples/merchant-checkout/checkout.mjs --key-file ./signing.key --meta "$GHOSTPAY_META_ADDRESS" \
//        --base-url https://pay.example.org/ --amount 49.00 --currency EUR --token 0x... --chain 8453 --description "Order 1042"
//
// The payment link is a BEARER SECRET (the fragment may hold a decryption key): send it only to the intended payer.
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createInvoice, signInvoice, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { buildPaymentButton, buildPaymentLink, buildQrPayload } from '@ghostpay/merchant-hooks';
import { fiatDecimals, toMinorUnits } from './money.mjs';

const { values: a } = parseArgs({
  options: {
    demo: { type: 'boolean', default: false },
    'key-file': { type: 'string' },
    meta: { type: 'string' },
    'base-url': { type: 'string', default: 'https://pay.example.org/' },
    amount: { type: 'string' },
    currency: { type: 'string', default: 'USD' },
    token: { type: 'string', default: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    chain: { type: 'string', default: '8453' },
    description: { type: 'string', default: 'Order' },
    ttl: { type: 'string', default: '3600' },
    encrypt: { type: 'boolean', default: false },
  },
});

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

function loadKey() {
  if (a.demo) return new Uint8Array(randomBytes(32)); // ephemeral demo key: the invoice cannot be tied to you
  if (!a['key-file']) die('pass --key-file (hex, mode 600) or --demo');
  if ((statSync(a['key-file']).mode & 0o077) !== 0) die('key file must not be group/world accessible (chmod 600)');
  const hex = readFileSync(a['key-file'], 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(hex)) die('key file must hold 64 lowercase hex chars');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

const key = loadKey();
const signer = signerPublicKeyHex(key);
// Demo meta-address: syntactically valid, derived from throwaway keys. NEVER use it to receive funds.
const demoMeta = () => {
  const pub = () => signerPublicKeyHex(new Uint8Array(randomBytes(32)));
  return `st:eth:0x${pub()}${pub()}`;
};
const meta = a.meta ?? (a.demo ? demoMeta() : die('pass --meta <stealth meta-address> or --demo'));
// Minor units as the GhostPay app reads them for this currency (0 decimals for JPY etc., else 2): see money.mjs.
const minor =
  toMinorUnits(a.amount, a.currency) ??
  die(`--currency must be an ISO code like USD and --amount a decimal with at most ${fiatDecimals(a.currency)} decimals for it`);
const now = Math.floor(Date.now() / 1000);
const ttl = Number(a.ttl);
if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 86_400 * 30) die('--ttl must be 60..2592000 seconds');

const invoice = createInvoice({
  chainId: Number(a.chain),
  metaAddress: meta,
  fiat: { currency: a.currency, minorUnits: minor },
  token: a.token,
  amountPolicy: { mode: 'fiat_quote' },
  quote: { source: 'chainlink:usdc-usd', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 },
  expiresAt: now + ttl,
  lineItems: [{ description: a.description, quantity: '1', unitMinorUnits: minor }],
  tax: { rateBps: 0, minorUnits: '0' },
  feePolicy: 'seller_pays',
  signer,
});
const signed = signInvoice(invoice, key);

const { url } = await buildPaymentLink(signed, { baseUrl: a['base-url'], encrypt: a.encrypt });
const button = buildPaymentButton(url, `Pay ${a.amount} ${a.currency} with GhostPay`);
const qr = buildQrPayload(url);

console.log(JSON.stringify({ signer, expiresAt: invoice.expiresAt, link: url, qrBytes: qr.bytes }, null, 2));
console.log('\nHTML button (static anchor, no script):\n' + button.html);
if (a.demo) console.error('\nDEMO: ephemeral keys, not for real payments.');
