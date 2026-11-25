import { describe, expect, it } from 'vitest';
import type { RpcTransport } from '@ghostpay/chain-adapters';
import {
  addedSignatures,
  assertSanitized,
  classifyRequest,
  DisclosureRecorder,
  DisclosureState,
  instrumentHttpTransport,
  instrumentRpcTransport,
  sameShape,
  summarize,
  type DisclosureContext,
} from './rpcDisclosure';

// Synthetic, obviously fake values.
const ANNOUNCER = '0x5555555555555555555555555555555555555555';
const ROUTER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x7777777777777777777777777777777777777777';
const SELLER = '0x9999999999999999999999999999999999999999';
const STRANGER = '0x3333333333333333333333333333333333333333';
const TOPIC = `0x${'ab'.repeat(32)}`;
const word = (a: string): string => `0x${a.slice(2).padStart(64, '0')}`;
const TX = `0x${'cd'.repeat(32)}`;

const ctx: DisclosureContext = {
  publicContracts: [ANNOUNCER, ROUTER],
  tokenContracts: [TOKEN],
  sensitiveAddresses: [SELLER],
  eventTopics: [TOPIC],
  gridBlocks: 1000,
};
const state = (): DisclosureState => new DisclosureState(ctx);

describe('classifyRequest', () => {
  it('treats chain metadata calls as public', () => {
    expect(classifyRequest('eth_chainId', [], state()).classes).toEqual(['public-chain-metadata']);
    expect(classifyRequest('eth_blockNumber', [], state()).classes).toEqual(['public-chain-metadata']);
  });

  it('classes a grid-aligned announcer getLogs window as public, contract-specific and not progress-revealing', () => {
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC, word('0x1')], fromBlock: '0x3e8', toBlock: '0x7cf' }], state());
    expect(c.classes).toEqual(['public-block-range', 'contract-specific']);
    expect(c.blockRangeSize).toBe(1000);
    expect(c.hasEventTopic).toBe(true);
    expect(c.hasRecipientFilter).toBe(false);
    expect(c.revealsScanProgress).toBe(false);
    expect(c.hasAddress).toBe(true);
  });

  it('flags an unaligned range as revealing scan progress', () => {
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC], fromBlock: '0x3e9', toBlock: '0x7cf' }], state());
    expect(c.revealsScanProgress).toBe(true);
  });

  it('does not flag a window that ends at the public head', () => {
    const s = state();
    s.headBlock = 2500n;
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC], fromBlock: '0x7d0', toBlock: '0x9c4' }], s);
    expect(c.revealsScanProgress).toBe(false);
  });

  it('treats every explicit bound as revealing when no grid is known', () => {
    const s = new DisclosureState({ ...ctx, gridBlocks: undefined as never });
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC], fromBlock: '0x3e8', toBlock: '0x7cf' }], s);
    expect(c.revealsScanProgress).toBe(true);
  });

  it('classes a router caller filter as contract-specific, not a recipient filter', () => {
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC, word('0x1'), null, word(ROUTER)], fromBlock: '0x0', toBlock: '0x3e7' }], state());
    expect(c.hasRecipientFilter).toBe(false);
    expect(c.classes).not.toContain('address-specific');
  });

  it('classes a stealth-address topic filter as recipient-specific', () => {
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC, word('0x1'), word(SELLER)], fromBlock: '0x0', toBlock: '0x3e7' }], state());
    expect(c.hasRecipientFilter).toBe(true);
    expect(c.classes).toContain('recipient-specific');
  });

  it('classes a non-public, non-sensitive topic filter as address-specific with a recipient filter', () => {
    const c = classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [TOPIC, word('0x1'), word(STRANGER)], fromBlock: '0x0', toBlock: '0x3e7' }], state());
    expect(c.hasRecipientFilter).toBe(true);
    expect(c.classes).toContain('address-specific');
  });

  it('marks a token log filter with hasTokenIdentifier', () => {
    const c = classifyRequest('eth_getLogs', [{ address: TOKEN, topics: [TOPIC], fromBlock: '0x0', toBlock: '0x3e7' }], state());
    expect(c.hasTokenIdentifier).toBe(true);
    expect(c.classes).toContain('contract-specific');
  });

  it('classes eth_getBalance of a user address as address-specific and recipient-specific for a synthetic seller', () => {
    expect(classifyRequest('eth_getBalance', [STRANGER, 'latest'], state()).classes).toEqual(['address-specific']);
    expect(classifyRequest('eth_getBalance', [SELLER, 'latest'], state()).classes).toEqual(['recipient-specific']);
  });

  it('finds a padded address inside eth_call calldata (balanceOf)', () => {
    const data = `0x70a08231${word(SELLER).slice(2)}`;
    const c = classifyRequest('eth_call', [{ to: TOKEN, data }, 'latest'], state());
    expect(c.classes).toEqual(['contract-specific', 'recipient-specific']);
    expect(c.hasTokenIdentifier).toBe(true);
  });

  it('classes receipt and transaction lookups as transaction-specific and links them to a matched payment', () => {
    const s = state();
    expect(classifyRequest('eth_getTransactionReceipt', [TX], s).classes).toEqual(['transaction-specific']);
    s.markMatched({ transactionHashes: [TX] });
    const c = classifyRequest('eth_getTransactionByHash', [TX], s);
    expect(c.classes).toEqual(['transaction-specific', 'payment-specific']);
    expect(c.relatedToMatchedPayment).toBe(true);
  });

  it('marks requests that reuse an identifier from an earlier response as following a response', () => {
    const s = state();
    s.observeResponse(JSON.stringify({ result: [{ transactionHash: TX }] }));
    expect(classifyRequest('eth_getTransactionReceipt', [TX], s).followsResponse).toBe(true);
    expect(classifyRequest('eth_getTransactionReceipt', [`0x${'ef'.repeat(32)}`], s).followsResponse).toBe(false);
  });

  it('reports an unrecognised method, shape or filter key as unknown, never harmless', () => {
    expect(classifyRequest('eth_getBlockReceipts', ['0x1'], state()).classes).toEqual(['unknown']);
    expect(classifyRequest('eth_getLogs', [{ address: ANNOUNCER, fromBlock: '0x0', toBlock: '0x1', blockHash: TX }], state()).classes).toContain('unknown');
    expect(classifyRequest('eth_getBalance', ['not-an-address', 'latest'], state()).classes).toContain('unknown');
    expect(classifyRequest('eth_chainId', ['0x1'], state()).classes).toContain('unknown');
    expect(classifyRequest('eth_getLogs', [{ address: ANNOUNCER, topics: [`0x${'11'.repeat(32)}`], fromBlock: '0x0', toBlock: '0x1' }], state()).classes).toContain('unknown');
  });
});

describe('transport instrumentation', () => {
  const okTransport = (responses: string[]): RpcTransport => ({ send: () => Promise.resolve(responses.shift() ?? '{}') });

  it('records sanitized rows, counts retries by JSON-RPC id and keeps no raw value', async () => {
    let tick = 0;
    const rec = new DisclosureRecorder('t', ctx, () => (tick += 5));
    const failing: RpcTransport = {
      send: (() => {
        let n = 0;
        return () => (n++ === 0 ? Promise.reject(new Error('boom')) : Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"0x1"}'));
      })(),
    };
    const t = instrumentRpcTransport(failing, rec, 'primary');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [SELLER, 'latest'] });
    await expect(t.send('https://rpc.invalid', body, { timeoutMs: 1, maxBytes: 1 })).rejects.toThrow('boom');
    await t.send('https://rpc.invalid', body, { timeoutMs: 1, maxBytes: 1 });
    expect(rec.records.map((r) => [r.attempt, r.outcome])).toEqual([[0, 'error'], [1, 'ok']]);
    expect(rec.records.every((r) => r.classes.includes('recipient-specific'))).toBe(true);
    expect(summarize('t', rec.records).retryDependent).toBe(1);
    expect(() => assertSanitized(rec.records, [SELLER, TX])).not.toThrow();
  });

  it('reports a batch or non-JSON request as unknown', async () => {
    const rec = new DisclosureRecorder('t', ctx);
    const t = instrumentRpcTransport(okTransport(['{}', '{}']), rec, 'primary');
    await t.send('u', '[{"method":"eth_chainId"}]', { timeoutMs: 1, maxBytes: 1 });
    await t.send('u', 'not json', { timeoutMs: 1, maxBytes: 1 });
    expect(rec.records.map((r) => r.classes)).toEqual([['unknown'], ['unknown']]);
  });

  it('records indexer HTTP requests as a public block range and unknown paths as unknown', async () => {
    const rec = new DisclosureRecorder('t', ctx);
    const inner = { request: () => Promise.resolve({ status: 200, body: new Uint8Array() }) };
    const t = instrumentHttpTransport(inner, rec, 'indexer');
    const req = (url: string) => ({ method: 'GET' as const, url, timeoutMs: 1, maxBytes: 1 });
    await t.request(req('https://idx.invalid/v1/logs?chainId=84532&from=1000&to=1999&pageSize=1000'));
    await t.request(req('https://idx.invalid/v1/logs?chainId=84532&from=1000&to=1999&pageSize=1000&owner=x'));
    await t.request(req('https://idx.invalid/other'));
    expect(rec.records.map((r) => [r.classes.join('+'), r.blockRangeSize, r.revealsScanProgress])).toEqual([['public-block-range', 1000, false], ['unknown', null, true], ['unknown', null, true]]);
  });
});

describe('comparison helpers', () => {
  it('compares request shapes without sequence or timing', async () => {
    const run = async (extra: boolean) => {
      const rec = new DisclosureRecorder('s', ctx);
      const t = instrumentRpcTransport({ send: () => Promise.resolve('{}') }, rec, 'primary');
      const send = (m: string, p: unknown[]) => t.send('u', JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }), { timeoutMs: 1, maxBytes: 1 });
      await send('eth_blockNumber', []);
      if (extra) await send('eth_getTransactionReceipt', [TX]);
      return rec.records;
    };
    const a = await run(false);
    const b = await run(true);
    expect(sameShape(a, a)).toBe(true);
    expect(sameShape(a, b)).toBe(false);
    expect([...addedSignatures(a, b).keys()]).toHaveLength(1);
  });

  it('rejects an artifact that contains a forbidden value or any 20-byte hex literal', () => {
    expect(() => assertSanitized({ x: SELLER }, [SELLER])).toThrow('forbidden');
    expect(() => assertSanitized({ x: STRANGER }, [])).toThrow('hex identifier');
    expect(() => assertSanitized({ calls: 3 }, [SELLER])).not.toThrow();
  });
});
