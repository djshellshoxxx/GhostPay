// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EsploraClient } from '../features/btc/esplora';
import { boundedRequest } from './boundedRequest';

describe('bounded reads across browser realms', () => {
  it('accepts native Response byte chunks in a DOM context', async () => {
    const response = await boundedRequest(() => Promise.resolve(new Response('7')), 'https://esplora.test/api', {}, { timeoutMs: 5000, maxBytes: 16 });
    expect(new TextDecoder().decode(response.body)).toBe('7');
  });
  it('allows Esplora data from a native Response in a DOM context', async () => {
    const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: () => Promise.resolve(new Response('7')) });
    await expect(client.tipHeight()).resolves.toBe(7);
  });
});
