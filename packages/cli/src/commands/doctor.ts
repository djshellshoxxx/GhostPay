import {
  createInvoice,
  encodeFragment,
  parseFragment,
  signerPublicKeyHex,
  signInvoice,
  verifyInvoiceSignature,
  type Invoice,
  type RandomSource,
} from '@ghostpay/invoice-schema';
import { checkCatalogs, sampleCatalogs } from '@ghostpay/i18n';
import { noPositionals } from '../args.js';
import { toHex } from '../hex.js';
import type { Command } from './types.js';

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const MIN_NODE_MAJOR = 20;
const MIN_SANE_TIME = 1_700_000_000;
/** Public secp256k1 generator G and 2G (compressed): the well-known points for keys 1 and 2. */
const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const G2 = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';


function selfInvoice(rng: RandomSource): Invoice {
  return createInvoice(
    {
      chainId: 31337,
      metaAddress: `st:eth:0x${G}${G2}`,
      fiat: { currency: 'USD', minorUnits: '100' },
      token: 'native',
      amountPolicy: { mode: 'fiat_quote' },
      quote: { source: 'doctor:selftest', timestamp: 1_800_000_000, expiresAt: 1_800_000_600, maxSlippageBps: 50 },
      expiresAt: 1_800_003_600,
      lineItems: [{ description: 'self-test', quantity: '1', unitMinorUnits: '100' }],
      tax: { rateBps: 0, minorUnits: '0' },
      feePolicy: 'payer_pays',
      signer: G,
    },
    rng,
  );
}

async function attempt(name: string, f: () => Promise<string> | string): Promise<Check> {
  try {
    return { name, ok: true, detail: await f() };
  } catch {
    return { name, ok: false, detail: 'failed' };
  }
}

export const doctorCommands: readonly Command[] = [
  {
    path: ['doctor'],
    summary: 'self-test this installation (offline)',
    usage: 'ghostpay doctor\n  Checks Node version, WebCrypto, randomness, signing, encrypted links, catalogs and the clock. Makes no network calls.',
    opts: {},
    handler: async (ctx, a) => {
      noPositionals(a);
      const checks: Check[] = [];
      const major = Number(ctx.io.nodeVersion.split('.')[0]);
      checks.push({ name: 'node', ok: Number.isFinite(major) && major >= MIN_NODE_MAJOR, detail: `${ctx.io.nodeVersion} (need >= ${MIN_NODE_MAJOR})` });
      checks.push(
        await attempt('randomness', () => {
          const x = new Uint8Array(16);
          const y = new Uint8Array(16);
          ctx.io.random.getRandomValues(x);
          ctx.io.random.getRandomValues(y);
          if (toHex(x) === toHex(y) || x.every((b) => b === 0)) throw new Error('weak');
          return 'two draws differ';
        }),
      );
      const key = new Uint8Array(32);
      key[31] = 1;
      checks.push(
        await attempt('signing', () => {
          if (signerPublicKeyHex(key) !== G) throw new Error('mismatch');
          const inv = selfInvoice(ctx.io.random);
          const signed = signInvoice(inv, key);
          if (!verifyInvoiceSignature(signed)) throw new Error('verify');
          const tampered = { ...signed, invoice: { ...signed.invoice, fiat: { currency: 'USD', minorUnits: '101' } } };
          if (verifyInvoiceSignature(tampered)) throw new Error('tamper');
          return 'sign, verify and tamper detection ok';
        }),
      );
      checks.push(
        await attempt('webcrypto', async () => {
          const inv = selfInvoice(ctx.io.random);
          const link = await encodeFragment(signInvoice(inv, key), { encrypt: true, rng: ctx.io.random });
          const back = await parseFragment(link);
          if (!back.encrypted || back.invoice.nonce !== inv.nonce) throw new Error('roundtrip');
          return 'AES-GCM fragment round trip ok';
        }),
      );
      checks.push(
        await attempt('catalogs', () => {
          if (!checkCatalogs(sampleCatalogs, 'en').ok) throw new Error('catalogs');
          return 'bundled catalogs complete';
        }),
      );
      const now = ctx.io.nowSeconds();
      checks.push({ name: 'clock', ok: Number.isSafeInteger(now) && now >= MIN_SANE_TIME, detail: now >= MIN_SANE_TIME ? 'looks sane' : 'system clock looks wrong; expiry checks depend on it' });
      checks.push({ name: 'network', ok: true, detail: 'none used: this CLI makes no network calls and sends no telemetry' });
      const ok = checks.every((c) => c.ok);
      ctx.out({ ok, checks }, [...checks.map((c) => `${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(10)} ${c.detail}`), ok ? 'all checks passed' : 'some checks failed'].join('\n'));
      return ok ? 0 : 1;
    },
  },
];
