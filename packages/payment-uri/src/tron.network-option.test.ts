import { describe, expect, it } from 'vitest';
import { TRX } from './fixtures.testutil.js';
import { buildTronUri, parseTronUri, type TronNetwork } from './tron.js';

describe('TRON URI network option boundary', () => {
  it.each([null, false, 0, '', 'NILE', {}, []].map((network) => ({ network })))(
    'rejects malformed explicit network $network without selecting mainnet',
    ({ network }) => {
      expect(() => buildTronUri({ recipient: TRX, network: network as unknown as TronNetwork })).toThrow(
        expect.objectContaining({ code: 'INVALID_QUERY' }),
      );
    },
  );

  it('retains the omitted-network default and all explicitly supported networks', () => {
    expect(parseTronUri(buildTronUri({ recipient: TRX })).network).toBe('mainnet');
    for (const network of ['mainnet', 'nile', 'shasta'] as const) {
      expect(parseTronUri(buildTronUri({ recipient: TRX, network }), network).network).toBe(network);
    }
  });

  it('reads the selected network only once', () => {
    let reads = 0;
    const uri = buildTronUri({
      recipient: TRX,
      get network() {
        return reads++ === 0 ? 'nile' : 'shasta';
      },
    });
    expect(parseTronUri(uri, 'nile').network).toBe('nile');
    expect(reads).toBe(1);
  });
});
