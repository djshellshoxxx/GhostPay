import { CHAINS } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { runScan } from './scanClient';

it.each([false, true])('keeps empty bulk evidence private and unverified (second provider: %s)', async (secondProvider) => {
  const owner = generateKeySet();
  const other = generateKeySet();
  const made = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(owner), block: 120, index: 0, caller: FAKE_ROUTER });
  // A transaction hash is optional legacy input. Without it this page has no eligible evidence targets.
  const log = { ...made.log };
  delete log.transactionHash;
  const run = async (keys: ReturnType<typeof generateKeySet>) => {
    const makeClient = () => mockRpc(84532, (method, params) => {
      if (method === 'eth_blockNumber') return '0x96';
      if (method === 'eth_getBlockByNumber') {
        const n = BigInt(params[0] as bigint);
        return { hash: `0x${n.toString(16).padStart(64, '0')}`, parentHash: `0x${(n - 1n).toString(16).padStart(64, '0')}` };
      }
      if (method === 'eth_getLogs') return [log];
      throw new Error(`Unexpected request: ${method}`);
    });
    const client = makeClient();
    const secondaryClient = secondProvider ? makeClient() : undefined;
    const result = await runScan({
      chain: CHAINS.find((chain) => chain.chainId === 84532)!, manifest: fakeManifest(84532),
      client, ...(secondaryClient === undefined ? {} : { secondaryClient }), cursor: { nextBlock: 0n },
      spendingPublicKeyHex: Buffer.from(keys.spendingPublicKey).toString('hex'),
      keyId: 'empty-bulk-evidence-test', viewingKey: unsafeRevealSecret(keys.viewingSecret),
      createWorker: () => new InlineWorker(), signal: new AbortController().signal, bulkEvidence: 10,
    });
    return { result, primaryCalls: client.calls, secondaryCalls: secondaryClient?.calls };
  };
  // The providers receive exactly the same public page in both runs; only the local viewer keys differ.
  const unmatched = await run(other);
  const matched = await run(owner);
  expect(unmatched.result.matches).toHaveLength(0);
  expect(matched.result.matches).toHaveLength(1);
  expect(matched.result.matches[0]?.receipt).toBe('claimed');
  expect(matched.result.evidenceRequests).toBe(0);
  expect(unmatched.result.evidenceRequests).toBe(0);
  expect(matched.primaryCalls).toEqual(unmatched.primaryCalls);
  expect(matched.secondaryCalls).toEqual(unmatched.secondaryCalls);
});
