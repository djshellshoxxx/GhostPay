import { describe, expect, it } from 'vitest';
import { createInvoice, signInvoice } from '@ghostpay/invoice-schema';
import { qrCommands } from './commands/qr.js';
import { invoke, result } from './exchange.testutil.js';
import { KEY_BYTES, SIGNER, SPEC, makeIo } from './fixtures.testutil.js';

describe('public QR exchange', () => {
  it('bounds the encoded fragment after conversion from signed JSON', async () => {
    const io = makeIo();
    const invoice = createInvoice({ ...SPEC, signer: SIGNER, lineItems: Array.from({ length: 50 }, () => ({ description: '界'.repeat(175), quantity: '1', unitMinorUnits: '1' })) }, io.random);
    const raw = JSON.stringify(signInvoice(invoice, KEY_BYTES));
    expect(new TextEncoder().encode(raw).length).toBeLessThan(32768);
    io.files.set('large', raw);
    await expect(invoke(qrCommands, 'qr encode', ['--kind', 'invoice', '--in', 'large', '--format', 'text'], io)).rejects.toMatchObject({ code: 'INVALID_QR_PAYLOAD' });
    expect(io.out).toEqual([]);
  });
  it('creates an SVG and decodes its actual QR modules through the existing decoder', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    expect(await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--out', 'qr.svg'], io)).toBe(0);
    expect(io.files.get('qr.svg')).toContain('<svg');
    io.out.length = 0;
    expect(await invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'qr.svg'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, kind: 'meta', payload: SPEC.metaAddress, paymentVerified: false });
  });

  it('assembles reordered multipart frames and accepts exact duplicate scans', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    expect(await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', '32', '--out', 'chunks'], io)).toBe(0);
    const transfer = JSON.parse(io.files.get('chunks')!) as { chunks: string[] };
    const reverse = [...transfer.chunks].reverse();
    io.files.set('scans', [...reverse, reverse[0]].join('\n'));
    io.out.length = 0;
    expect(await invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'scans', '--out', 'restored'], io)).toBe(0);
    expect(io.files.get('restored')!.trim()).toBe(SPEC.metaAddress);
  });

  it('renders multipart frames as SVGs and reassembles their decoded QR modules', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', '100', '--out', 'transfer'], io);
    const { chunks } = JSON.parse(io.files.get('transfer')!) as { chunks: string[] };
    expect(chunks.length).toBeGreaterThan(1);
    for (let frame = 1; frame <= chunks.length; frame++) {
      io.out.length = 0;
      await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', '100', '--frame', String(frame), '--out', `frame-${String(frame)}.svg`], io);
      expect(result(io)).toMatchObject({ frame, frameCount: chunks.length, encodedAs: 'svg' });
    }
    const additional = Array.from({ length: chunks.length - 1 }, (_, i) => ['--frame-file', `frame-${String(chunks.length - i)}.svg`]).flat();
    io.files.set('scan.txt', chunks[0]!);
    io.out.length = 0;
    await invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'frame-1.svg', ...additional, '--frame-file', 'scan.txt', '--out', 'restored'], io);
    expect(io.files.get('restored')!.trim()).toBe(SPEC.metaAddress);
  });

  it('handles complete single-frame images and refuses incomplete frame images', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--frame', '1', '--out', 'single.svg'], io);
    await invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'single.svg', '--out', 'complete'], io);
    expect(io.files.get('complete')!.trim()).toBe(SPEC.metaAddress);
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', '32', '--frame', '1', '--out', 'partial.svg'], io);
    await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'partial.svg', '--out', 'incomplete'], io)).rejects.toMatchObject({ code: 'INCOMPLETE_QR_TRANSFER' });
    expect(io.files.has('incomplete')).toBe(false);
  });

  it('bounds frame selection and refuses files that are not multipart frames', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    for (const frame of ['0', '01', 'abc', '65', '2']) {
      await expect(invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--frame', frame], io)).rejects.toMatchObject({ code: 'BAD_QR_FRAME' });
    }
    await expect(invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--frame', '1'], io)).rejects.toMatchObject({ code: 'BAD_QR_FORMAT' });
    await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'meta', '--frame-file', 'meta'], io)).rejects.toMatchObject({ code: 'INVALID_QR_TRANSFER' });
    const tooMany = new Array<string[]>(64).fill(['--frame-file', 'meta']).flat();
    await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'meta', ...tooMany], io)).rejects.toMatchObject({ code: 'INVALID_QR_TRANSFER' });
    expect(io.out).toEqual([]);
  });

  it.each(['javascript:alert(1)', JSON.stringify({ format: 'ghostpay-keystore', secret: 'private' }), 'https://untrusted.test/'])('refuses unsupported or secret-bearing raw payloads', async (value) => {
    const io = makeIo({ input: value });
    await expect(invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'input'], io)).rejects.toMatchObject({ code: 'INVALID_QR_PAYLOAD' });
    expect(io.out).toEqual([]);
  });

  it('refuses incomplete transfers without writing partial decoded data', async () => {
    const io = makeIo({ meta: SPEC.metaAddress });
    await invoke(qrCommands, 'qr encode', ['--kind', 'meta', '--in', 'meta', '--format', 'multipart', '--chunk-chars', '32', '--out', 'chunks'], io);
    const transfer = JSON.parse(io.files.get('chunks')!) as { chunks: string[] };
    io.files.set('part', transfer.chunks[0]!);
    await expect(invoke(qrCommands, 'qr decode', ['--kind', 'meta', '--in', 'part', '--out', 'partial'], io)).rejects.toMatchObject({ code: 'INCOMPLETE_QR_TRANSFER' });
    expect(io.files.has('partial')).toBe(false);
  });
});
