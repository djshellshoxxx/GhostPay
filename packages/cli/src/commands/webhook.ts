import { MemoryNonceStore, signWebhook, verifyWebhook } from '@ghostpay/merchant-hooks';
import { noPositionals, parseIntOption, requireValue, type Parsed } from '../args.js';
import type { Ctx } from '../ctx.js';
import { toHex } from '../hex.js';
import { usageError } from '../io.js';
import { readSecret, secretOpts, type SecretRule } from '../secrets.js';
import type { Command } from './types.js';

const SECRET_RULE: SecretRule = { label: 'webhook secret', minBytes: 32, maxBytes: 1024 };

/** Reads the body first, then the secret, so only one of them can come from stdin. */
async function bodyAndSecret(ctx: Ctx, a: Parsed): Promise<{ body: string; secret: Uint8Array }> {
  const body = await ctx.read(requireValue(a, 'body-file'));
  const secret = (await readSecret(ctx, a, 'secret', SECRET_RULE, true)) as Uint8Array;
  return { body, secret };
}

async function sign(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const { body, secret } = await bodyAndSecret(ctx, a);
  try {
    let nonce = a.values.get('nonce');
    if (nonce === undefined) {
      const bytes = new Uint8Array(16);
      ctx.io.random.getRandomValues(bytes);
      nonce = toHex(bytes);
    }
    const now = ctx.io.nowSeconds();
    const header = signWebhook(secret, body, { now, nonce });
    ctx.out({ ok: true, header, timestamp: now, nonce }, header);
    return 0;
  } finally {
    secret.fill(0);
  }
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const inline = a.values.get('header');
  const headerFile = a.values.get('header-file');
  if ((inline === undefined) === (headerFile === undefined))
    throw usageError('HEADER_SOURCE', 'give the signature header with exactly one of --header or --header-file.');
  const { body, secret } = await bodyAndSecret(ctx, a);
  try {
    const header = inline ?? (await ctx.read(headerFile as string)).trim();
    const tol = a.values.get('tolerance');
    const result = verifyWebhook(secret, body, header, {
      now: ctx.io.nowSeconds(),
      nonces: new MemoryNonceStore(8),
      ...(tol === undefined ? {} : { toleranceSeconds: parseIntOption(tol, 'tolerance', 0, 86_400) }),
    });
    if (result.ok) {
      ctx.out(
        { ok: true, timestamp: result.timestamp, nonce: result.nonce, replayChecked: false },
        `valid signature (t=${result.timestamp}).\nnote: replay protection needs your receiver's persistent nonce store; this command is stateless.`,
      );
      return 0;
    }
    ctx.out({ ok: false, reason: result.reason }, `INVALID: ${result.reason}`);
    return 1;
  } finally {
    secret.fill(0);
  }
}

const SECRET_OPTS = secretOpts('secret');

export const webhookCommands: readonly Command[] = [
  {
    path: ['webhook', 'sign'],
    summary: 'compute a GhostPay-Signature header for a body',
    usage: 'ghostpay webhook sign --body-file F|- (--secret-file P | --secret-env NAME | --secret-stdin) [--nonce HEX]\n  Body bytes are signed exactly as read (no trimming). Secret is hex, >= 32 bytes.',
    opts: { 'body-file': 'value', nonce: 'value', ...SECRET_OPTS },
    handler: sign,
  },
  {
    path: ['webhook', 'verify'],
    summary: 'check a GhostPay-Signature header against a body',
    usage: 'ghostpay webhook verify --body-file F|- (--header V | --header-file F) (--secret-file P | --secret-env NAME | --secret-stdin) [--tolerance SECONDS]\n  Exit 1 with reason malformed|stale|bad-signature|replay.',
    opts: { 'body-file': 'value', header: 'value', 'header-file': 'value', tolerance: 'value', ...SECRET_OPTS },
    handler: verify,
  },
];
