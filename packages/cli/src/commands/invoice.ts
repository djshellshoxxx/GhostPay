import {
  assertBaseUrl,
  assertPaymentLink,
} from '@ghostpay/merchant-hooks';
import {
  checkExpiry,
  createInvoice,
  encodeFragment,
  FRAGMENT_PREFIX,
  isSignatureVerified,
  isTrustedSeller,
  parseFragment,
  parseStrictJson,
  signerPublicKeyHex,
  signInvoice,
  validateInvoice,
  verifyInvoiceSignature,
  type Invoice,
  type NewInvoice,
  type SignedInvoice,
} from '@ghostpay/invoice-schema';
import { isTestChainId } from '@ghostpay/sandbox';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import { readSecret, secretOpts, type SecretRule } from '../secrets.js';
import type { Command } from './types.js';

const KEY_RULE: SecretRule = { label: 'signing key', minBytes: 32, maxBytes: 32 };
const PUBKEY_RE = /^(?:02|03)[0-9a-f]{64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function readJson(ctx: Ctx, path: string): Promise<unknown> {
  return parseStrictJson(await ctx.read(path));
}

/** Accepts a SignedInvoice or a bare Invoice. */
function invoiceOf(v: unknown): { invoice: Invoice; signature: string | undefined } {
  if (isRecord(v) && 'invoice' in v) {
    const sig = v['signature'];
    return { invoice: validateInvoice(v['invoice']), signature: typeof sig === 'string' ? sig : undefined };
  }
  return { invoice: validateInvoice(v), signature: undefined };
}

function signedOf(v: unknown): SignedInvoice {
  const { invoice, signature } = invoiceOf(v);
  if (signature === undefined) throw usageError('NOT_SIGNED', 'input has no signature.', 'Run `ghostpay invoice sign` first.');
  return { invoice, signature };
}

function pretty(v: unknown): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

async function create(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const raw = await readJson(ctx, requireValue(a, 'in'));
  if (!isRecord(raw)) throw usageError('BAD_SPEC', 'spec must be a JSON object of invoice fields.');
  const key = await readSecret(ctx, a, 'key', KEY_RULE, false);
  try {
    let spec: Record<string, unknown> = raw;
    if (key !== undefined) {
      const signer = signerPublicKeyHex(key);
      if (spec['signer'] !== undefined && spec['signer'] !== signer)
        throw failError('SIGNER_MISMATCH', 'spec.signer does not match the provided key.', 'Remove "signer" from the spec to derive it from the key.');
      spec = { ...spec, signer };
    }
    const invoice = createInvoice(spec as unknown as NewInvoice, ctx.io.random);
    const result: Invoice | SignedInvoice = key === undefined ? invoice : signInvoice(invoice, key);
    const text = pretty(result);
    const wrote = await ctx.writeOut(a, text);
    ctx.out(
      { ok: true, signed: key !== undefined, nonce: invoice.nonce, ...(wrote ? { out: a.values.get('out') } : { result }) },
      wrote ? `wrote ${a.values.get('out') as string} (${key === undefined ? 'unsigned' : 'signed'}, nonce ${invoice.nonce})` : text,
    );
    return 0;
  } finally {
    key?.fill(0);
  }
}

async function sign(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const { invoice } = invoiceOf(await readJson(ctx, requireValue(a, 'in')));
  const key = (await readSecret(ctx, a, 'key', KEY_RULE, true)) as Uint8Array;
  try {
    const signed = signInvoice(invoice, key);
    const text = pretty(signed);
    const wrote = await ctx.writeOut(a, text);
    ctx.out(
      { ok: true, signer: invoice.signer, ...(wrote ? { out: a.values.get('out') } : { result: signed }) },
      wrote ? `wrote ${a.values.get('out') as string} (signed by ${invoice.signer})` : text,
    );
    return 0;
  } finally {
    key.fill(0);
  }
}

function pins(a: Parsed): string[] {
  const list = a.multi.get('pin') ?? [];
  for (const p of list) if (!PUBKEY_RE.test(p)) throw usageError('BAD_PIN', '--pin must be a 66-character lowercase hex compressed public key.');
  return [...list];
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const pinned = pins(a);
  const text = (await ctx.read(requireValue(a, 'in'))).trim();
  let invoice: Invoice;
  let signatureValid: boolean;
  let signerPinned: boolean;
  let encrypted = false;
  if (text.startsWith('{')) {
    const signed = signedOf(parseStrictJson(text));
    invoice = signed.invoice;
    signatureValid = verifyInvoiceSignature(signed);
    signerPinned = signatureValid && pinned.includes(invoice.signer);
  } else {
    const hash = text.indexOf('#');
    const fragment = text.startsWith(FRAGMENT_PREFIX) ? text : hash === -1 ? text : text.slice(hash);
    if (!text.startsWith(FRAGMENT_PREFIX)) assertPaymentLink(text, { allowInsecureLocalhost: a.flags.has('allow-insecure-localhost') });
    const parsed = await parseFragment(fragment, { pinnedSigners: pinned });
    invoice = parsed.invoice;
    signatureValid = isSignatureVerified(parsed);
    signerPinned = isTrustedSeller(parsed);
    encrypted = parsed.encrypted;
  }
  const exp = checkExpiry(invoice, ctx.io.nowSeconds());
  const trust = !signatureValid ? 'invalid-signature' : signerPinned ? 'trusted-seller' : 'valid-signature';
  const ok = signatureValid && !exp.invoiceExpired;
  const summary = {
    chainId: invoice.chainId,
    testChain: isTestChainId(invoice.chainId),
    currency: invoice.fiat.currency,
    fiatMinorUnits: invoice.fiat.minorUnits,
    token: invoice.token,
    signer: invoice.signer,
    nonce: invoice.nonce,
    expiresAt: invoice.expiresAt,
  };
  const lines = [
    `signature : ${signatureValid ? 'valid' : 'INVALID - do not pay'}`,
    `trust     : ${trust}`,
    `expired   : ${exp.invoiceExpired ? 'YES' : `no (${exp.secondsRemaining}s left)`}`,
    `quote     : ${exp.quoteExpired ? 'expired' : 'fresh'}`,
    `chain     : ${summary.chainId}${summary.testChain ? ' (TEST chain)' : ''}`,
    `amount    : ${summary.currency} minor units ${summary.fiatMinorUnits}`,
    `token     : ${summary.token}`,
    `signer    : ${summary.signer}`,
    `encrypted : ${encrypted ? 'yes' : 'no'}`,
  ];
  if (signatureValid && !signerPinned)
    lines.push('note      : a valid signature proves integrity only, not who the seller is. Pin the seller key with --pin to confirm identity.');
  ctx.out(
    {
      ok,
      signatureValid,
      trust,
      signerPinned,
      encrypted,
      expired: exp.invoiceExpired,
      quoteExpired: exp.quoteExpired,
      secondsRemaining: exp.secondsRemaining,
      invoice: summary,
    },
    lines.join('\n'),
  );
  return ok ? 0 : 1;
}

async function link(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const signed = signedOf(await readJson(ctx, requireValue(a, 'in')));
  const allow = a.flags.has('allow-insecure-localhost');
  const base = assertBaseUrl(requireValue(a, 'base'), { allowInsecureLocalhost: allow });
  const fragment = await encodeFragment(signed, { encrypt: a.flags.has('encrypt'), rng: ctx.io.random });
  const url = `${base.href}${fragment}`;
  assertPaymentLink(url, { allowInsecureLocalhost: allow });
  ctx.note(
    a.flags.has('encrypt')
      ? 'warning: this link contains the decryption key; treat it as a secret and share it only with the payer.'
      : 'warning: this link carries the whole invoice (including line items) in its fragment; share it only with the payer.',
  );
  const wrote = await ctx.writeOut(a, `${url}\n`);
  ctx.out({ ok: true, encrypted: a.flags.has('encrypt'), ...(wrote ? { out: a.values.get('out') } : { link: url }) }, wrote ? `wrote ${a.values.get('out') as string}` : url);
  return 0;
}

const KEY_OPTS = secretOpts('key');

export const invoiceCommands: readonly Command[] = [
  {
    path: ['invoice', 'create'],
    summary: 'build an invoice (optionally signed) from a JSON spec',
    usage: 'ghostpay invoice create --in SPEC.json|- [--key-file P | --key-env NAME | --key-stdin] [--out F] [--force]\n  SPEC is the invoice fields without v/schemeId/nonce. With a key, "signer" is derived and the result is signed.',
    opts: { in: 'value', ...KEY_OPTS, ...OUT_OPTS },
    handler: create,
  },
  {
    path: ['invoice', 'sign'],
    summary: 'sign an invoice with your signing key',
    usage: 'ghostpay invoice sign --in INVOICE.json|- (--key-file P | --key-env NAME | --key-stdin) [--out F] [--force]',
    opts: { in: 'value', ...KEY_OPTS, ...OUT_OPTS },
    handler: sign,
  },
  {
    path: ['invoice', 'verify'],
    summary: 'verify a signed invoice, payment link or fragment (offline)',
    usage: 'ghostpay invoice verify --in FILE|- [--pin SIGNER_PUBKEY]... [--allow-insecure-localhost]\n  FILE holds signed JSON, a #gpi=v1. fragment or a payment URL. Exit 1 if the signature is bad or the invoice expired.',
    opts: { in: 'value', pin: 'multi', 'allow-insecure-localhost': 'flag' },
    handler: verify,
  },
  {
    path: ['invoice', 'link'],
    summary: 'turn a signed invoice into a payment link',
    usage: 'ghostpay invoice link --in SIGNED.json|- --base https://pay.example/ [--encrypt] [--allow-insecure-localhost] [--out F] [--force]',
    opts: { in: 'value', base: 'value', encrypt: 'flag', 'allow-insecure-localhost': 'flag', ...OUT_OPTS },
    handler: link,
  },
];
