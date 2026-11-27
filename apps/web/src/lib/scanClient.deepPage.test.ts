import { CHAINS } from '@ghostpay/chain-adapters';
import { generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc } from '../test/mockRpc';
import { checkpointKeyId, runScan } from './scanClient';

const chain = { ...CHAINS.find((c) => c.chainId === 84532)!, getLogsMaxRange: 100, finalityDepth: 10 };
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

/** An empty chain of 50 blocks: the pages carry no matches, only how they were scanned. */
async function pageModes(deep: boolean | undefined): Promise<unknown[]> {
  const keys = generateKeySet();
  const client = mockRpc(chain.chainId, (method, params) => {
    if (method === 'eth_blockNumber') return '0x32';
    if (method === 'eth_getBlockByNumber') return { hash: hashOf(Number(params[0])), parentHash: hashOf(Number(params[0]) - 1) };
    if (method === 'eth_getLogs') return [];
    throw new Error(`unexpected ${method}`);
  });
  const modes: unknown[] = [];
  await runScan({
    chain, client, manifest: fakeManifest(chain.chainId), cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: checkpointKeyId('02aa', '03bb'),
    viewingKey: unsafeRevealSecret(keys.viewingSecret).slice(), createWorker: () => new InlineWorker(),
    signal: new AbortController().signal, ...(deep === undefined ? {} : { deep }),
    onPageMatches: (_matches, page) => { modes.push(page.deep); return Promise.resolve(true); },
  });
  return modes;
}

describe('runScan tells the evidence store how each page was scanned', () => {
  it.each([[true, true], [false, false], [undefined, false]] as const)('deep=%s reports deep=%s', async (deep, reported) => {
    const modes = await pageModes(deep);
    expect(modes.length).toBeGreaterThan(0);
    expect(new Set(modes)).toEqual(new Set([reported]));
  });
});
