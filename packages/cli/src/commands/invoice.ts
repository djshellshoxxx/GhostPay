import {
  assertBaseUrl,
  assertPaymentLink,
} from '@ghostpay/merchant-hooks';
import {
  checkExpiry,
  createInvoice,
  encodeFragment,
  FRAGMENT_PREFIX,
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
import { findChain, findToken } from '@ghostpay/chain-adapters';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import { readPassphrase, readSecret, secretOpts, type SecretRule } from '../secrets.js';
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
    if (Object.keys(v).sort().join('|') !== 'invoice|signature' || typeof sig !== 'string')
      throw failError('BAD_INVOICE_ENVELOPE', 'signed invoice must contain exactly invoice and a string signature.');
    return { invoice: validateInvoice(v['invoice']), signature: sig };
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

export interface InvoiceInput {
  readonly invoice: Invoice;
  readonly signature: string | undefined;
  readonly signatureValid: boolean;
  readonly encrypted: boolean;
  readonly passphraseProtected: boolean;
}

/** Bounded local input only. Even when given a URL, no network request is made. */
export async function readInvoiceInput(ctx: Ctx, a: Parsed, path = requireValue(a, 'in')): Promise<InvoiceInput> {
  const text = (await ctx.read(path)).trim();
  const passphrase = await readPassphrase(ctx, a, 'passphrase', false);
  return parseInvoiceInput(text, { allowInsecureLocalhost: a.flags.has('allow-insecure-localhost'), ...(passphrase === undefined ? {} : { passphrase }) });
}

/** Shared local document parser for invoice, receipt and QR command adapters. */
export async function parseInvoiceInput(input: string, options: { readonly passphrase?: string; readonly allowInsecureLocalhost?: boolean } = {}): Promise<InvoiceInput> {
  const text = input.trim();
  const passphrase = options.passphrase;
  if (text.startsWith('{')) {
    if (passphrase !== undefined) throw usageError('PASSPHRASE_UNEXPECTED', 'a passphrase is only accepted for a passphrase-protected invoice link.');
    const { invoice, signature } = invoiceOf(parseStrictJson(text));
    return { invoice, signature, signatureValid: signature !== undefined && verifyInvoiceSignature({ invoice, signature }), encrypted: false, passphraseProtected: false };
  }
  let fragment = text;
  if (!text.startsWith(FRAGMENT_PREFIX)) {
    assertPaymentLink(text, { allowInsecureLocalhost: options.allowInsecureLocalhost === true });
    fragment = new URL(text).hash;
  }
  const parsed = await parseFragment(fragment, passphrase === undefined ? {} : { passphrase });
  return { invoice: parsed.invoice, signature: parsed.signature, signatureValid: parsed.verification.signatureValid, encrypted: parsed.encrypted, passphraseProtected: parsed.passphraseProtected };
}

function expectations(invoice: Invoice, a: Parsed): void {
  const chain = a.values.get('expected-chain');
  const asset = a.values.get('expected-asset');
  const recipient = a.values.get('expected-recipient');
  const amount = a.values.get('expected-amount');
  if (chain !== undefined && (!/^[1-9][0-9]{0,15}$/.test(chain) || !Number.isSafeInteger(Number(chain))))
    throw usageError('BAD_EXPECTATION', 'expected chain must be a positive safe-integer EVM chain id.');
  if (asset !== undefined && asset !== 'native' && !/^0x[0-9a-f]{40}$/.test(asset))
    throw usageError('BAD_EXPECTATION', 'expected asset must be native or a canonical lowercase token address.');
  if (recipient !== undefined && !/^st:eth:0x(?:0[23][0-9a-f]{64}){2}$/.test(recipient))
    throw usageError('BAD_EXPECTATION', 'expected recipient must be a canonical scheme-1 meta-address.');
  if (amount !== undefined && !/^[1-9][0-9]{0,77}$/.test(amount))
    throw usageError('BAD_EXPECTATION', 'expected amount must be positive integer token base units.');
  if (amount !== undefined && invoice.amountPolicy.mode !== 'fixed_token')
    throw failError('AMOUNT_NOT_FIXED', 'fiat-quote invoices have no independently fixed token amount.');
  if ((chain !== undefined && Number(chain) !== invoice.chainId) || (asset !== undefined && asset !== invoice.token) ||
      (recipient !== undefined && recipient !== invoice.metaAddress) ||
      (amount !== undefined && invoice.amountPolicy.mode === 'fixed_token' && amount !== invoice.amountPolicy.tokenAmount))
    throw failError('INVOICE_EXPECTATION_MISMATCH', 'invoice does not match the expected chain, asset, recipient or amount.');
}

function support(invoice: Invoice) {
  const chain = findChain(invoice.chainId);
  const assetAllowlisted = chain !== undefined && (invoice.token === 'native' || findToken(invoice.chainId, invoice.token) !== undefined);
  return { supportedForPayment: chain?.enabled === true && chain.testnet && assetAllowlisted,
    chainKnown: chain !== undefined, chainEnabled: chain?.enabled ?? false, assetAllowlisted,
    deploymentVerified: false, productionReady: false };
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const pinned = pins(a);
  const { invoice, signature, signatureValid, encrypted, passphraseProtected } = await readInvoiceInput(ctx, a);
  if (signature === undefined) throw usageError('NOT_SIGNED', 'input has no signature.', 'Run `ghostpay invoice sign` first.');
  const signerPinned = signatureValid && pinned.includes(invoice.signer);
  expectations(invoice, a);
  const exp = checkExpiry(invoice, ctx.io.nowSeconds());
  const compatibility = support(invoice);
  const trust = !signatureValid ? 'invalid-signature' : signerPinned ? 'trusted-seller' : 'valid-signature';
  const ok = signatureValid && !exp.invoiceExpired && (pinned.length === 0 || signerPinned);
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
    `payment   : ${compatibility.supportedForPayment ? 'enabled testnet asset; deployment and payment unverified' : 'unsupported chain or asset configuration'}`,
    `amount    : ${summary.currency} minor units ${summary.fiatMinorUnits}`,
    `token     : ${summary.token}`,
    `signer    : ${summary.signer}`,
    `encrypted : ${encrypted ? 'yes' : 'no'}`,
  ];
  if (signatureValid && !signerPinned)
    lines.push('note      : a valid signature proves integrity only, not who the seller is. Compare the seller key out of band, then use --pin to compare that known key.');
  if (pinned.length > 0 && !signerPinned) lines.push('pin       : MISMATCH - the supplied seller key does not match.');
  if (signerPinned) lines.push('pin       : matches the supplied key; real-world seller identity is not independently established.');
  ctx.out(
    {
      ok,
      signatureValid,
      trust,
      signerPinned,
      encrypted,
      passphraseProtected,
      paymentVerified: false,
      ...compatibility,
      expired: exp.invoiceExpired,
      quoteExpired: exp.quoteExpired,
      secondsRemaining: exp.secondsRemaining,
      invoice: summary,
    },
    lines.join('\n'),
  );
  return ok ? 0 : 1;
}

async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const { invoice, signature, signatureValid, encrypted, passphraseProtected } = await readInvoiceInput(ctx, a);
  expectations(invoice, a);
  const expiry = checkExpiry(invoice, ctx.io.nowSeconds());
  const ok = signature === undefined || signatureValid;
  const compatibility = support(invoice);
  ctx.out({ ok, signed: signature !== undefined, signatureValid, paymentVerified: false, encrypted, passphraseProtected, ...compatibility,
    expired: expiry.invoiceExpired, quoteExpired: expiry.quoteExpired, invoice },
  `${signature === undefined ? 'Unsigned' : signatureValid ? 'Signed' : 'INVALID signature'} invoice\nChain: ${invoice.chainId}\nAsset: ${invoice.token}\nPayment configuration: ${compatibility.supportedForPayment ? 'enabled testnet asset; deployment unverified' : 'unsupported chain or asset'}\nExpires: ${invoice.expiresAt}${expiry.invoiceExpired ? ' (expired)' : ''}\nInspection does not verify payment.\n${pretty(invoice)}`);
  return ok ? 0 : 1;
}

async function link(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const signed = signedOf(await readJson(ctx, requireValue(a, 'in')));
  const allow = a.flags.has('allow-insecure-localhost');
  const base = assertBaseUrl(requireValue(a, 'base'), { allowInsecureLocalhost: allow });
  const passphrase = await readPassphrase(ctx, a, 'passphrase', false);
  const encrypted = a.flags.has('encrypt') || passphrase !== undefined;
  const fragment = await encodeFragment(signed, { encrypt: encrypted, rng: ctx.io.random, ...(passphrase === undefined ? {} : { passphrase }) });
  const url = `${base.href}${fragment}`;
  assertPaymentLink(url, { allowInsecureLocalhost: allow });
  ctx.note(
    passphrase !== undefined ? 'The invoice is passphrase-protected. Share the passphrase through a separate private channel.' : a.flags.has('encrypt')
      ? 'warning: this link contains the decryption key; treat it as a secret and share it only with the payer.'
      : 'warning: this link carries the whole invoice (including line items) in its fragment; share it only with the payer.',
  );
  const wrote = await ctx.writeOut(a, `${url}\n`);
  ctx.out({ ok: true, encrypted, passphraseProtected: passphrase !== undefined, ...(wrote ? { out: a.values.get('out') } : { link: url }) }, wrote ? `wrote ${a.values.get('out') as string}` : url);
  return 0;
}

const KEY_OPTS = secretOpts('key');
export const PASSPHRASE_OPTS = secretOpts('passphrase');
const EXPECT_OPTS = { 'expected-chain': 'value', 'expected-asset': 'value', 'expected-recipient': 'value', 'expected-amount': 'value' } as const;

export const invoiceCommands: readonly Command[] = [
  {
    path: ['invoice', 'inspect'],
    summary: 'inspect invoice fields, version, signature and expiry without verifying payment',
    usage: 'ghostpay invoice inspect --in FILE|- [--allow-insecure-localhost] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--expected-chain ID] [--expected-asset ASSET] [--expected-recipient META] [--expected-amount BASE_UNITS]\n  Example: ghostpay invoice inspect --in invoice.json --json\n  Accepts bare/signed JSON, a payment URL or an invoice fragment. Expired invoices remain readable.',
    opts: { in: 'value', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS, ...EXPECT_OPTS },
    handler: inspect,
  },
  {
    path: ['invoice', 'create'],
    summary: 'build an invoice (optionally signed) from a JSON spec',
    usage: 'ghostpay invoice create --in SPEC.json|- [--key-file P | --key-env NAME | --key-stdin] [--out F] [--force]\n  Example: ghostpay invoice create --in spec.json --key-file signing-key.hex --out invoice.json\n  SPEC is the invoice fields without v/schemeId/nonce. With a key, "signer" is derived and the result is signed.',
    opts: { in: 'value', ...KEY_OPTS, ...OUT_OPTS },
    handler: create,
  },
  {
    path: ['invoice', 'sign'],
    summary: 'sign an invoice with your signing key',
    usage: 'ghostpay invoice sign --in INVOICE.json|- (--key-file P | --key-env NAME | --key-stdin) [--out F] [--force]\n  Example: ghostpay invoice sign --in invoice.json --key-file signing-key.hex --out signed.json',
    opts: { in: 'value', ...KEY_OPTS, ...OUT_OPTS },
    handler: sign,
  },
  {
    path: ['invoice', 'verify'],
    summary: 'verify a signed invoice, payment link or fragment (offline)',
    usage: 'ghostpay invoice verify --in FILE|- [--pin SIGNER_PUBKEY]... [--allow-insecure-localhost] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--expected-chain ID] [--expected-asset ASSET] [--expected-recipient META] [--expected-amount BASE_UNITS]\n  Example: ghostpay invoice verify --in invoice.json --expected-chain 84532 --expected-asset native --json\n  FILE holds signed JSON, a #gpi=v1. fragment or a payment URL. Exit 1 if the signature is bad, the invoice expired or no supplied pin matches. A matching pin confirms the expected key, not real-world seller identity or payment.',
    opts: { in: 'value', pin: 'multi', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS, ...EXPECT_OPTS },
    handler: verify,
  },
  {
    path: ['invoice', 'link'],
    summary: 'turn a signed invoice into a payment link',
    usage: 'ghostpay invoice link --in SIGNED.json|- --base https://pay.example/ [--encrypt] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost] [--out F] [--force]\n  Example: ghostpay invoice link --in signed.json --base https://pay.example/ --passphrase-file private-passphrase.txt --out payment-link.txt',
    opts: { in: 'value', base: 'value', encrypt: 'flag', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS, ...OUT_OPTS },
    handler: link,
  },
];
