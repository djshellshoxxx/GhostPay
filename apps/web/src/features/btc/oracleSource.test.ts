import { parseCompressedPoint, type BlockOutputs, type BlockTweaks } from '@ghostpay/btc-silent-payments';
import { describe, expect, it, vi } from 'vitest';
import { CrossCheckedTweakSource, normalizeOracleConfig } from './oracleSource';

const HASH = 'ab'.repeat(32);
const POINT = parseCompressedPoint(Uint8Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')));
const tweaks: BlockTweaks = { height: 9, blockHash: HASH, tweaks: [POINT] };
const outputs: BlockOutputs = { height: 9, blockHash: HASH, outputs: [{ txid: 'cd'.repeat(32), vout: 0, amountSats: 42n, xOnlyPublicKey: POINT.slice(1) }] };
const full = () => ({ getTipHeight: () => Promise.resolve(9), getTweaks: vi.fn(() => Promise.resolve(tweaks)), getOutputs: vi.fn(() => Promise.resolve(outputs)) });

describe('full-block oracle agreement', () => {
  it('checks every block once before returning either locally verified half', async () => {
    const local = full(); const oracle = vi.fn(() => Promise.resolve({ tweaks, outputs }));
    const source = new CrossCheckedTweakSource(local, oracle);
    expect(await Promise.all([source.getTweaks(9), source.getOutputs(9)])).toEqual([tweaks, outputs]);
    expect(oracle).toHaveBeenCalledExactlyOnceWith(9, undefined);
    expect(local.getTweaks).toHaveBeenCalledTimes(1);
    expect(await source.getTipHeight()).toBe(9);
  });
  it.each(['height', 'hash', 'tweak', 'amount', 'outpoint', 'omit', 'duplicate'] as const)('rejects %s disagreement before exposing scan data', async (change) => {
    const tw = { ...tweaks, tweaks: [...tweaks.tweaks] }; const out = { ...outputs, outputs: outputs.outputs.map((o) => ({ ...o })) };
    if (change === 'height') tw.height = 10;
    if (change === 'hash') out.blockHash = 'ff'.repeat(32);
    if (change === 'tweak') tw.tweaks = [];
    if (change === 'amount') out.outputs[0]!.amountSats = 43n;
    if (change === 'outpoint') out.outputs[0]!.vout = 1;
    if (change === 'omit') out.outputs = [];
    if (change === 'duplicate') out.outputs.push({ ...out.outputs[0]! });
    const source = new CrossCheckedTweakSource(full(), () => Promise.resolve({ tweaks: tw, outputs: out }));
    await expect(source.getOutputs(9)).rejects.toMatchObject({ code: change === 'height' || change === 'hash' ? 'REORG_DETECTED' : 'INVALID_RESPONSE' });
  });
  it('refuses a failed check and retries the block on a later attempt', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('source offline')).mockResolvedValue({ tweaks, outputs });
    const source = new CrossCheckedTweakSource(full(), read);
    await expect(source.getTweaks(9)).rejects.toThrow('source offline');
    await expect(source.getTweaks(9)).resolves.toEqual(tweaks);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('requires a separate selected origin and HTTPS for gRPC-Web', () => {
    expect(normalizeOracleConfig({ kind: 'http', url: 'https://oracle.test/api/' }, 'https://esplora.test/api')).toEqual({ kind: 'http', url: 'https://oracle.test/api' });
    for (const [kind, url] of [['http', 'https://esplora.test/another'], ['grpc', 'http://127.0.0.1:8080'], ['http', 'https://user:secret@oracle.test'], ['http', 'https://oracle.test/?x=1'], ['wrong', 'https://oracle.test']]) {
      expect(() => normalizeOracleConfig({ kind, url } as never, 'https://esplora.test/api')).toThrow();
    }
  });
});
