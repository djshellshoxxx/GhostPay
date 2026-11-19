import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '@ghostpay/btc-silent-payments';
import { ScanSourceError } from '@ghostpay/scan-source';
import { EsploraClient } from '../features/btc/esplora';
import { UserFacingError } from './errors';
import { fetchHttpTransport } from './scanPrivacy';
import { requestQuote } from './relayerClient';

function start(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
    });
  });
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => { server.close((e) => { if (e === undefined) resolve(); else reject(e); }); });
}

const Q = { chainId: 84532, token: '0x1111111111111111111111111111111111111111', owner: '0x2222222222222222222222222222222222222222', destination: '0x3333333333333333333333333333333333333333', amount: 1000n } as const;

describe('actual native HTTP transport destinations', () => {
  it('sends only to the chosen server and refuses redirects for Esplora, indexer and relayer', async () => {
    let forbiddenHits = 0;
    const forbidden = createServer((_request, response) => { forbiddenHits++; response.end('forbidden'); });
    const target = await start(forbidden);
    const received: { url: string; headers: IncomingHttpHeaders }[] = [];
    const chosen = createServer((request, response) => {
      received.push({ url: request.url ?? '', headers: request.headers });
      if (request.url?.startsWith('/redirect/') === true) {
        response.writeHead(302, { location: `${target}/captured` });
        response.end('redirect');
      } else if (request.url === '/ok/blocks/tip/height') response.end('7');
      else if (request.url === '/ok/v1/quote') response.end(JSON.stringify({ fee: '1', feeTo: Q.owner, expiresAt: 1_900_000_000, quoteToken: 'fixture' }));
      else response.end('{}');
    });
    let source: string;
    try { source = await start(chosen); } catch (e) { await close(forbidden); throw e; }
    const fetchFn = (url: string, init: RequestInit): Promise<Response> => fetch(url, init);
    try {
      const esplora = (prefix: string) => new EsploraClient({ baseUrl: `${source}/${prefix}`, fetchFn, timeoutMs: 5000 });
      await expect(esplora('redirect').tipHeight()).rejects.toBeInstanceOf(SilentPaymentError);
      await expect(fetchHttpTransport(fetchFn).request({ url: `${source}/redirect/v1/logs`, method: 'GET', timeoutMs: 5000, maxBytes: 1024 })).rejects.toBeInstanceOf(ScanSourceError);
      await expect(requestQuote(`${source}/redirect`, Q, fetchFn)).rejects.toBeInstanceOf(UserFacingError);
      expect(forbiddenHits).toBe(0);
      expect(received.map((request) => request.url)).toEqual(['/redirect/blocks/tip/height', '/redirect/v1/logs', '/redirect/v1/quote']);
      await expect(esplora('ok').tipHeight()).resolves.toBe(7);
      await expect(fetchHttpTransport(fetchFn).request({ url: `${source}/ok/v1/logs`, method: 'GET', timeoutMs: 5000, maxBytes: 1024 })).resolves.toMatchObject({ status: 200 });
      await expect(requestQuote(`${source}/ok`, Q, fetchFn)).resolves.toMatchObject({ fee: 1n });
      expect(received).toHaveLength(6);
      for (const request of received) {
        expect(request.headers['cookie']).toBeUndefined();
        expect(request.headers['authorization']).toBeUndefined();
        expect(request.headers['referer']).toBeUndefined();
      }
      expect(forbiddenHits).toBe(0);
    } finally {
      await Promise.all([close(chosen), close(forbidden)]);
    }
  }, 20_000);
});
