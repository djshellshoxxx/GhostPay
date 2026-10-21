import { stubTransport, json } from '@ghostpay/external-pools';
import { describe, expect, it } from 'vitest';
import { RelayerClient, parseDetails, parseQuote, parseResult } from './relayer.js';

const A = '0x1111111111111111111111111111111111111111';
const fc = { expiration: 5, withdrawalData: '0x00', asset: A, signedRelayerCommitment: '0x11', extraGas: false, amount: '10' };
const c = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('strict relayer parsers (EP-PP-8)', () => {
  it('parses details with optional fields, numbers and null gas price', () => {
    expect(parseDetails({ feeBPS: 50, feeReceiverAddress: A })).toEqual({ feeBPS: 50n, feeReceiverAddress: A });
    const d = parseDetails({ feeBPS: '50', feeReceiverAddress: A, chainId: 1, assetAddress: A, minWithdrawAmount: '7', maxGasPrice: null });
    expect(d).toMatchObject({ chainId: 1, minWithdrawAmount: 7n, maxGasPrice: null });
    expect(parseDetails({ feeBPS: '50', feeReceiverAddress: A, maxGasPrice: '9' }).maxGasPrice).toBe(9n);
  });
  it.each([
    ['not object', 5],
    ['array', []],
    ['unknown field', { feeBPS: '1', feeReceiverAddress: A, x: 1 }],
    ['negative', { feeBPS: -1, feeReceiverAddress: A }],
    ['float', { feeBPS: 1.5, feeReceiverAddress: A }],
    ['non-digit', { feeBPS: '1e3', feeReceiverAddress: A }],
    ['bad address', { feeBPS: '1', feeReceiverAddress: '0x12' }],
    ['non-string address', { feeBPS: '1', feeReceiverAddress: 5 }],
    ['bad chain', { feeBPS: '1', feeReceiverAddress: A, chainId: '1' }],
  ])('details drift: %s', (_n, raw) => expect(c(() => parseDetails(raw))).toBe('RELAYER_SCHEMA_DRIFT'));

  it('parses quotes with and without a commitment', () => {
    const q = parseQuote({ baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', detail: { a: {} } });
    expect(q).toEqual({ baseFeeBPS: 1n, feeBPS: 2n, gasPrice: 3n });
    expect(parseQuote({ baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', feeCommitment: fc }).feeCommitment?.amount).toBe(10n);
  });
  it.each([
    ['unknown field', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', x: 1 }],
    ['detail not object', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', detail: 5 }],
    ['commitment unknown field', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', feeCommitment: { ...fc, y: 1 } }],
    ['commitment expiration', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', feeCommitment: { ...fc, expiration: -1 } }],
    ['commitment extraGas', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', feeCommitment: { ...fc, extraGas: 'no' } }],
    ['commitment hex', { baseFeeBPS: '1', feeBPS: '2', gasPrice: '3', feeCommitment: { ...fc, withdrawalData: 'zz' } }],
    ['missing fee', { baseFeeBPS: '1', gasPrice: '3' }],
  ])('quote drift: %s', (_n, raw) => expect(c(() => parseQuote(raw))).toBe('RELAYER_SCHEMA_DRIFT'));

  it('parses results', () => {
    const h = `0x${'ab'.repeat(32)}`;
    expect(parseResult({ success: true, timestamp: 1, requestId: 'x', txHash: h, txSwap: '0x01', error: 'e'.repeat(500) })).toMatchObject({ success: true, txHash: h });
    expect(parseResult({ success: true }).error).toBeUndefined();
    expect(parseResult({ success: false, error: 'e'.repeat(500) }).error).toHaveLength(200);
  });
  it.each([
    ['success type', { success: 'y' }],
    ['unknown', { success: true, z: 1 }],
    ['timestamp', { success: true, timestamp: 'x' }],
    ['requestId type', { success: true, requestId: 5 }],
    ['requestId long', { success: true, requestId: 'x'.repeat(101) }],
    ['txHash short', { success: true, txHash: '0x12' }],
    ['txHash type', { success: true, txHash: 5 }],
    ['error type', { success: true, error: 5 }],
  ])('result drift: %s', (_n, raw) => expect(c(() => parseResult(raw))).toBe('RELAYER_SCHEMA_DRIFT'));
});

describe('RelayerClient', () => {
  const mk = (baseUrl: string, allowed: string[], extra: object = {}, handler: Parameters<typeof stubTransport>[0] = () => json({})) => {
    const st = stubTransport(handler);
    return { st, client: new RelayerClient({ transport: st.transport, baseUrl, allowed, ...extra }) };
  };
  it('only accepts manifest hosts unless the developer flag is set', () => {
    expect(() => mk('https://a.example', ['https://b.example'])).toThrow(/not in the pinned manifest/);
    expect(() => mk('https://a.example', ['https://a.example/'])).not.toThrow();
    expect(() => mk('https://a.example', [], { allowCustomRelayer: true })).not.toThrow();
    expect(() => mk('nope', ['nope'])).toThrow(/not a URL/);
    expect(() => mk('https://u:p@a.example', ['https://u:p@a.example'])).toThrow(/credentials/);
    expect(() => mk('https://a.example/?q=1', ['https://a.example/?q=1'])).toThrow(/credentials, query/);
  });
  it('sends the documented bodies and uses only the injected fetch', async () => {
    const { st, client } = mk('https://a.example/api/', ['https://a.example/api'], { timeoutMs: 1000 }, (call) => {
      if (call.url.includes('details')) return json({ feeBPS: '1', feeReceiverAddress: A });
      if (call.url.includes('quote')) return json({ baseFeeBPS: '1', feeBPS: '2', gasPrice: '3' });
      return json({ success: true, txHash: `0x${'cd'.repeat(32)}` });
    });
    await client.details(31337, A);
    await client.quote(31337, 10n, A, A);
    await client.request({ chainId: 31337, scope: 7n, withdrawal: { processooor: A, data: '0x01' }, proof: { pi_a: ['1'], pi_b: [['1']], pi_c: ['1'] }, publicSignals: ['1'], feeCommitment: { expiration: 1, withdrawalData: '0x01', asset: A, signedRelayerCommitment: '0x02', extraGas: false, amount: 10n } });
    await client.request({ chainId: 31337, scope: 7n, withdrawal: { processooor: A, data: '0x01' }, proof: { pi_a: ['1'], pi_b: [['1']], pi_c: ['1'] }, publicSignals: ['1'] });
    expect(st.calls.map((x) => x.url)).toEqual([
      `https://a.example/api/relayer/details?chainId=31337&assetAddress=${A}`,
      'https://a.example/api/relayer/quote',
      'https://a.example/api/relayer/request',
      'https://a.example/api/relayer/request',
    ]);
    expect(JSON.parse(st.calls[1]!.body!)).toEqual({ chainId: 31337, amount: '10', asset: A, recipient: A, extraGas: false });
    const req = JSON.parse(st.calls[2]!.body!) as { scope: string; feeCommitment: { amount: string } };
    expect(req.scope).toBe('7');
    expect(req.feeCommitment.amount).toBe('10');
    expect(JSON.parse(st.calls[3]!.body!)).not.toHaveProperty('feeCommitment');
  });
  it('maps HTTP failures, bad JSON and oversized bodies', async () => {
    const mode = { v: 0 };
    const { client } = mk('https://a.example', ['https://a.example'], {}, () => {
      if (mode.v === 0) return new Response('x', { status: 502 });
      if (mode.v === 1) return new Response('{', { status: 200 });
      return new Response('x'.repeat(70_000));
    });
    await expect(client.details(1, A)).rejects.toMatchObject({ code: 'RELAYER_REJECTED' });
    mode.v = 1;
    await expect(client.details(1, A)).rejects.toMatchObject({ code: 'RELAYER_SCHEMA_DRIFT' });
    mode.v = 2;
    await expect(client.details(1, A)).rejects.toMatchObject({ code: 'RELAYER_SCHEMA_DRIFT' });
  });
});
