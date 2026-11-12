import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { REGTEST_GENESIS, extend, regtestChain } from './headers.testutil.js';

// Memory regression guard (review H-memory): parsed headers with hex strings retained ~2 KB per header. The compact
// store keeps 112 bytes per header plus growth slack. Full-size measurement: scripts/bench-headerchain-memory.mjs.
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const used = (): number => {
  gc();
  gc();
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers;
};

describe('HeaderChain memory', () => {
  it('retains under 250 bytes per active header (about 112 B of data plus array growth slack)', () => {
    const N = 20_000;
    const held: { chain?: ReturnType<typeof regtestChain> } = {};
    const build = (): void => {
      const headers = extend(REGTEST_GENESIS, N, 1_201, 0x207fffff);
      const chain = regtestChain();
      for (let i = 0; i < N; i += 2016) chain.connect(headers.slice(i, i + 2016));
      held.chain = chain;
    };
    build(); // the inputs go out of scope here
    expect(held.chain?.tipHeight).toBe(N);
    const alive = used();
    delete held.chain;
    const perHeader = (alive - used()) / N;
    expect(perHeader).toBeLessThan(250);
  });
});
