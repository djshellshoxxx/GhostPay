import { describe, expect, it, vi } from 'vitest';
import { EsploraClient, type EsploraFetch } from './esplora';

const BASE = 'https://esplora.test/api';
const TXID = '12'.repeat(32);

describe('Esplora spent-check output-index contract', () => {
  it.each([0, 1, 0xffff_ffff])('accepts uint32 output index %s without changing it', async (vout) => {
    const fetchFn = vi.fn<EsploraFetch>(() => Promise.resolve(new Response(JSON.stringify({ spent: false }))));
    const client = new EsploraClient({ baseUrl: BASE, fetchFn });
    await expect(client.isUnspent(TXID, vout)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${BASE}/tx/${TXID}/outspend/${String(vout)}`);
  });

  it.each([-1, 0.5, 0x1_0000_0000, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses non-uint32 output index %s before transport', async (vout) => {
      const fetchFn = vi.fn<EsploraFetch>();
      const client = new EsploraClient({ baseUrl: BASE, fetchFn });
      await expect(client.isUnspent(TXID, vout)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );
});
