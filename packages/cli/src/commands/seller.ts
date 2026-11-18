import type { Command } from './types.js';
import { CHAINS } from '@ghostpay/chain-adapters';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { compareToLoaded, exportSellerPairing, parseSellerPairing, type SellerPairingConfig } from '@ghostpay/qr-exchange';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { failError } from '../io.js';

/** The identical enabled-testnet policy used by the GUI seller pairing wrapper. */
export const SUPPORTED_SELLER_CHAINS = CHAINS.filter((chain) => chain.enabled && chain.testnet).map((chain) => chain.chainId);
const TRUST = 'Public configuration is a preview. Its checksum detects corruption; it does not establish identity or trust. Confirm public keys through a separate trusted channel.';

export function parsePublicSeller(text: string): SellerPairingConfig {
  try { return parseSellerPairing(text, SUPPORTED_SELLER_CHAINS); }
  catch { throw failError('INVALID_PUBLIC_SELLER', 'input is not a supported public seller configuration.'); }
}

async function exportPublic(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const input = await ctx.read(requireValue(a, 'in'));
  let text: string;
  try {
    const value = parseStrictJson(input);
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'chainIds|metaAddress|signerPublicKey') throw new TypeError();
    const record = value as Record<string, unknown>;
    text = exportSellerPairing({ metaAddress: record['metaAddress'] as string, signerPublicKey: record['signerPublicKey'] as string }, record['chainIds'] as readonly number[], SUPPORTED_SELLER_CHAINS);
  } catch { throw failError('INVALID_PUBLIC_SELLER', 'source must contain only valid public metaAddress, signerPublicKey and enabled-testnet chainIds.'); }
  const config = parsePublicSeller(text);
  const wrote = await ctx.writeOut(a, `${text}\n`);
  ctx.note(TRUST);
  ctx.out({ ok: true, config, trustEstablished: false, ...(wrote ? { out: a.values.get('out') } : { text }) }, wrote ? 'Exported public seller configuration.' : text);
  return 0;
}

async function importPublic(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const config = parsePublicSeller(await ctx.read(requireValue(a, 'in')));
  const currentPath = a.values.get('current');
  const current = currentPath === undefined ? undefined : parsePublicSeller(await ctx.read(currentPath));
  const comparison = compareToLoaded(config, current);
  const text = exportSellerPairing(config, config.chainIds, SUPPORTED_SELLER_CHAINS);
  const repeated = current !== undefined && text === exportSellerPairing(current, current.chainIds, SUPPORTED_SELLER_CHAINS);
  const wrote = await ctx.writeOut(a, `${text}\n`);
  ctx.out({ ok: true, config, comparison, repeated, applied: false, trustEstablished: false, ...(wrote ? { out: a.values.get('out') } : {}), meaning: TRUST },
    `Public seller configuration: valid\nCompared seller keys: ${comparison}\nRepeated input: ${repeated ? 'yes' : 'no'}\n${TRUST}\n${text}`);
  return 0;
}

export const sellerCommands: readonly Command[] = [
  { path: ['seller', 'export-public'], summary: 'export public seller keys and enabled testnet preferences',
    usage: 'ghostpay seller export-public --in SOURCE.json|- [--out FILE] [--force]\n  SOURCE contains exactly metaAddress, signerPublicKey and chainIds; never secret keys.\n  Example: ghostpay seller export-public --in public-source.json --out seller-public.json',
    opts: { in: 'value', ...OUT_OPTS }, handler: exportPublic },
  { path: ['seller', 'import-public'], summary: 'validate and preview public seller config, including repeated imports',
    usage: 'ghostpay seller import-public --in PUBLIC.json|- [--current PUBLIC.json] [--out FILE] [--force]\n  Example: ghostpay seller import-public --in incoming.json --current current.json --json\n  No key import, trust change or device setting is applied. --out saves a canonical public copy only.',
    opts: { in: 'value', current: 'value', ...OUT_OPTS }, handler: importPublic },
];
