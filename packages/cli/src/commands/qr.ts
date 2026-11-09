import type { Command } from './types.js';
import { encodeFragment, parseStrictJson, parseVerifiedReceipt, receiptJson } from '@ghostpay/invoice-schema';
import { Assembler, encodeMultipart, exportSellerPairing, loadJsQrDecoder, MAX_CHUNKS, MAX_PAYLOAD_BYTES, parseChunk, parsePublicMetaQr, qrMatrix, qrSvgPath } from '@ghostpay/qr-exchange';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { CliError, failError, usageError } from '../io.js';
import { readPassphrase } from '../secrets.js';
import { PASSPHRASE_OPTS, parseInvoiceInput } from './invoice.js';
import { parsePublicSeller, SUPPORTED_SELLER_CHAINS } from './seller.js';

type Kind = 'invoice' | 'receipt' | 'seller' | 'meta';
const KINDS = new Set(['invoice', 'receipt', 'seller', 'meta']);
const RETENTION = 'QR codes represent serialized data. Preserve the original digital receipt or invoice file whenever possible.';
const SVG_PREFIX = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ';

function kindOf(a: Parsed): Kind {
  const kind = requireValue(a, 'kind');
  if (!KINDS.has(kind)) throw usageError('BAD_QR_KIND', 'kind must be invoice, receipt, seller or meta. Secret backups are not supported by these public exchange commands.');
  return kind as Kind;
}

async function payloadOf(kind: Kind, raw: string, ctx: Ctx, a: Parsed): Promise<string> {
  if (raw.length > MAX_PAYLOAD_BYTES || new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES)
    throw failError('INVALID_QR_PAYLOAD', 'public QR payload exceeds the 32 KiB transfer limit.');
  try {
    if (kind === 'invoice') {
      const passphrase = await readPassphrase(ctx, a, 'passphrase', false);
      const parsed = await parseInvoiceInput(raw, { allowInsecureLocalhost: a.flags.has('allow-insecure-localhost'), ...(passphrase === undefined ? {} : { passphrase }) });
      if (!parsed.signatureValid || parsed.signature === undefined) throw new TypeError();
      // Signed JSON is encoded as the GUI's recognized fragment, never as a new invoice format.
      return raw.trim().startsWith('{') ? await encodeFragment({ invoice: parsed.invoice, signature: parsed.signature }) : raw.trim();
    }
    if (Object.keys(PASSPHRASE_OPTS).some((key) => a.values.has(key) || a.flags.has(key)))
      throw usageError('PASSPHRASE_UNEXPECTED', 'passphrase options are only for protected invoice links.');
    if (kind === 'receipt') return receiptJson(parseVerifiedReceipt(raw));
    if (kind === 'seller') {
      const config = parsePublicSeller(raw);
      return exportSellerPairing(config, config.chainIds, SUPPORTED_SELLER_CHAINS);
    }
    return parsePublicMetaQr(raw);
  } catch (error) {
    if (error instanceof CliError && error.kind !== 'fail') throw error;
    throw failError('INVALID_QR_PAYLOAD', 'input is not a valid supported public payload for the requested kind.');
  }
}

function svgFor(text: string): string {
  const matrix = qrMatrix(text, 'M');
  const side = matrix.size + 8;
  return `${SVG_PREFIX}${side} ${side}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${qrSvgPath(matrix)}"/></svg>`;
}

/** Decode only our inert module-grid SVG grammar; never evaluate SVG/XML or follow resources. */
async function decodeSvg(svg: string): Promise<string> {
  const match = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 ([0-9]{2,3}) ([0-9]{2,3})" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"\/><path fill="#000" d="((?:M[0-9]{1,3} [0-9]{1,3}h1v1h-1z)+)"\/><\/svg>$/.exec(svg);
  if (match === null) throw failError('UNSUPPORTED_QR_IMAGE', 'only the bounded SVG module format produced by qr encode is accepted; arbitrary SVG, PNG and JPEG need an external image decoder.');
  const side = Number(match[1]);
  if (side !== Number(match[2]) || side < 29 || side > 185 || (side - 29) % 4 !== 0)
    throw failError('INVALID_QR_IMAGE', 'invalid QR dimensions.');
  const scale = 4;
  const width = side * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  const occupied = new Set<number>();
  for (const cell of match[3]!.matchAll(/M([0-9]+) ([0-9]+)h1v1h-1z/g)) {
    const x = Number(cell[1]);
    const y = Number(cell[2]);
    const index = y * side + x;
    if (x < 4 || x >= side - 4 || y < 4 || y >= side - 4 || occupied.has(index))
      throw failError('INVALID_QR_IMAGE', 'QR modules extend outside the bounded grid or repeat.');
    occupied.add(index);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = ((y * scale + dy) * width + x * scale + dx) * 4;
      data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0;
    }
  }
  const text = (await loadJsQrDecoder()).decode({ data, width, height: width });
  if (text === null) throw failError('QR_DECODE_FAILED', 'the bounded image does not contain a decodable QR code.');
  return text;
}

function assemble(chunks: readonly unknown[]): string {
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS * 2) throw failError('INVALID_QR_TRANSFER', 'transfer must contain 1–128 bounded scans.');
  const assembler = new Assembler();
  const seen = new Map<string, string>();
  let payload: Uint8Array | undefined;
  try {
    for (const text of chunks) {
      if (typeof text !== 'string') throw new TypeError();
      const parsed = parseChunk(text);
      const key = `${parsed.session}/${parsed.index}`;
      const prior = seen.get(key);
      if (prior !== undefined && prior !== text) throw new TypeError();
      seen.set(key, text);
      payload = assembler.add(text).payload;
    }
  } catch { throw failError('INVALID_QR_TRANSFER', 'QR scans are malformed, conflicting or from different transfers.'); }
  if (payload === undefined) throw failError('INCOMPLETE_QR_TRANSFER', 'not all QR frames are present; no partial payload was restored.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(payload); }
  catch { throw failError('INVALID_QR_TRANSFER', 'decoded public payload is not valid UTF-8.'); }
}

async function encode(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const kind = kindOf(a);
  const format = a.values.get('format') ?? 'svg';
  if (!['svg', 'multipart', 'text'].includes(format)) throw usageError('BAD_QR_FORMAT', 'format must be svg, multipart or text.');
  if (a.values.has('chunk-chars') && format !== 'multipart') throw usageError('BAD_QR_FORMAT', '--chunk-chars applies only to multipart format.');
  const frameValue = a.values.get('frame');
  if (frameValue !== undefined && format !== 'multipart') throw usageError('BAD_QR_FORMAT', '--frame applies only to multipart format.');
  if (frameValue !== undefined && !/^[1-9][0-9]?$/.test(frameValue)) throw usageError('BAD_QR_FRAME', 'frame must be the one-based index of an available transfer frame.');
  const payload = await payloadOf(kind, await ctx.read(requireValue(a, 'in')), ctx, a);
  let encoded = payload;
  let frameCount: number | undefined;
  if (format === 'svg') {
    try { encoded = svgFor(payload); }
    catch { throw failError('QR_TOO_LARGE', 'payload cannot fit one QR; use --format multipart for a bounded transfer.'); }
  } else if (format === 'multipart') {
    const value = a.values.get('chunk-chars');
    if (value !== undefined && !/^[1-9][0-9]{0,2}$/.test(value)) throw usageError('BAD_QR_CHUNK_SIZE', 'chunk-chars must be an integer from 32 to 700.');
    let chunks: string[];
    try { chunks = encodeMultipart(new TextEncoder().encode(payload), value === undefined ? {} : { chunkChars: Number(value) }); }
    catch { throw usageError('BAD_QR_CHUNK_SIZE', 'chunk size must be 32–700 characters and permit at most 64 frames.'); }
    frameCount = chunks.length;
    if (frameValue === undefined) encoded = JSON.stringify({ format: 'ghostpay-qr-transfer', v: 1, kind, chunks });
    else {
      const chunk = chunks[Number(frameValue) - 1];
      if (chunk === undefined) throw usageError('BAD_QR_FRAME', 'frame must be the one-based index of an available transfer frame.');
      encoded = svgFor(chunk);
    }
  }
  const wrote = await ctx.writeOut(a, `${encoded}\n`);
  ctx.note(RETENTION);
  ctx.out({ ok: true, kind, format, ...(frameCount === undefined ? {} : { frameCount }), ...(frameValue === undefined ? {} : { frame: Number(frameValue), encodedAs: 'svg' }), paymentVerified: false, originalFileRecommended: true, ...(wrote ? { out: a.values.get('out') } : { result: encoded }), retention: RETENTION }, wrote ? 'Encoded validated public QR payload.' : encoded);
  return 0;
}

async function decode(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const kind = kindOf(a);
  const additional = a.multi.get('frame-file') ?? [];
  if (additional.length >= MAX_CHUNKS) throw failError('INVALID_QR_TRANSFER', 'a transfer accepts at most 64 frame files.');
  let text = (await ctx.read(requireValue(a, 'in'))).trim();
  if (text.startsWith('<')) text = await decodeSvg(text);
  if (additional.length > 0) {
    const scans = text.split(/\r?\n/);
    for (const path of additional) {
      const raw = (await ctx.read(path)).trim();
      scans.push(...(raw.startsWith('<') ? await decodeSvg(raw) : raw).split(/\r?\n/));
    }
    text = assemble(scans);
  } else if (text.startsWith('GPQ1/')) text = assemble(text.split(/\r?\n/));
  else if (text.startsWith('{')) {
    let value: unknown;
    try { value = parseStrictJson(text); } catch { throw failError('INVALID_QR_PAYLOAD', 'invalid public payload JSON.'); }
    if (typeof value === 'object' && value !== null && 'format' in value && value.format === 'ghostpay-qr-transfer') {
      const object = value as Record<string, unknown>;
      if (Object.keys(object).sort().join('|') !== 'chunks|format|kind|v' || object['v'] !== 1 || object['kind'] !== kind || !Array.isArray(object['chunks']))
        throw failError('INVALID_QR_TRANSFER', 'transfer version, kind or fields are unsupported.');
      text = assemble(object['chunks']);
    }
  }
  const payload = await payloadOf(kind, text, ctx, a);
  const wrote = await ctx.writeOut(a, `${payload}\n`);
  ctx.note(RETENTION);
  ctx.out({ ok: true, kind, paymentVerified: false, originalFileRecommended: true, ...(wrote ? { out: a.values.get('out') } : { payload }), retention: RETENTION }, wrote ? 'Decoded and validated complete public payload.' : payload);
  return 0;
}

const OPTIONS = { in: 'value', kind: 'value', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS, ...OUT_OPTS } as const;
export const qrCommands: readonly Command[] = [
  { path: ['qr', 'encode'], summary: 'encode validated public invoice, receipt, seller or meta-address data',
    usage: 'ghostpay qr encode --kind invoice|receipt|seller|meta --in FILE|- [--format svg|multipart|text] [--chunk-chars 32..700] [--frame INDEX] [--out FILE] [--force] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]\n  Example: ghostpay qr encode --kind receipt --in receipt.json --out receipt.svg\n  Multipart output contains scan texts for up to 64 QR frames. Add --frame 1 to render the first frame as SVG, repeating for each one-based index with identical input and chunk size. Preserve the original digital file.',
    opts: { ...OPTIONS, format: 'value', 'chunk-chars': 'value', frame: 'value' }, handler: encode },
  { path: ['qr', 'decode'], summary: 'decode bounded generated SVGs, scanned public text or multipart QR transfers',
    usage: 'ghostpay qr decode --kind invoice|receipt|seller|meta --in FILE|- [--frame-file FILE ...] [--out FILE] [--force] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]\n  Example: ghostpay qr decode --kind receipt --in receipt.svg --out receipt.json\n  Repeat --frame-file for additional multipart SVGs or scan-text files (up to 64 files total). SVG input must use the inert module-grid format generated by this CLI. PNG/JPEG/camera capture are not accepted; scanned text and GPQ1 chunks are supported. No URLs are opened.',
    opts: { ...OPTIONS, 'frame-file': 'multi' }, handler: decode },
];
