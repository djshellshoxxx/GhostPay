import { describe, expect, it } from 'vitest';
import { sellerCommands } from './commands/seller.js';
import { invoke, result } from './exchange.testutil.js';
import { G, SIGNER, SPEC, makeIo } from './fixtures.testutil.js';

const config = { metaAddress: SPEC.metaAddress, signerPublicKey: SIGNER, chainIds: [11155111, 84532, 84532] };

describe('public seller exchange CLI parity', () => {
  it('exports canonical public configuration and handles repeat import as a preview', async () => {
    const io = makeIo({ source: JSON.stringify(config) });
    expect(await invoke(sellerCommands, 'seller export-public', ['--in', 'source', '--out', 'public'], io)).toBe(0);
    const saved = JSON.parse(io.files.get('public')!) as { chainIds: number[] };
    expect(saved.chainIds).toEqual([84532, 11155111]);
    io.out.length = 0;
    expect(await invoke(sellerCommands, 'seller import-public', ['--in', 'public', '--current', 'public'], io)).toBe(0);
    expect(result(io)).toMatchObject({ ok: true, comparison: 'same', repeated: true, applied: false, trustEstablished: false });
  });

  it.each([
    { ...config, chainIds: [1] },
    { ...config, chainIds: [999999999] },
    { ...config, signerPublicKey: G },
    { ...config, spendingSecret: 'a'.repeat(64) },
  ])('refuses disabled/unknown chain, key reuse and secret-bearing source objects', async (source) => {
    const io = makeIo({ source: JSON.stringify(source) });
    await expect(invoke(sellerCommands, 'seller export-public', ['--in', 'source'], io)).rejects.toMatchObject({ code: 'INVALID_PUBLIC_SELLER' });
    expect(io.out).toEqual([]);
  });
});
