import { eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { encodeFunctionResult } from 'viem/utils';
import { afterEach, describe, expect, it } from 'vitest';
// Cross-app contract: the body the web app builds must pass the relayer's REAL validator.
import { parseSweepRequest } from '../../../relayer/src/validate';
import { fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { clearSession, generateSession } from './session';
import { relayedSweep } from './sweep';

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const DEST = '0x6666666666666666666666666666666666666666' as Address;
const FEE_TO = '0x7777777777777777777777777777777777777777' as Address;
const NOW = 1_800_000_000;

afterEach(() => {
  clearSession();
});

describe('web sweep body vs relayer validator', () => {
  it('relayedSweep POSTs a body that parseSweepRequest accepts', async () => {
    const pub = generateSession();
    const p = deriveStealthPayment(pub.metaAddress);
    const hex = (u: Uint8Array): `0x${string}` => `0x${Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const announcement: PublicAnnouncement = {
      schemeId: 1n,
      stealthAddress: p.stealthAddress,
      ephemeralPublicKey: hex(p.ephemeralPublicKey),
      metadata: hex(p.viewTag),
    };
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
    });
    let posted: unknown;
    await relayedSweep({
      target: { chainId: 84532, token: TOKEN, owner: p.stealthAddress, announcement },
      manifest: fakeManifest(84532),
      destination: DEST,
      amount: 1_000_000n,
      quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: `v1.${String(NOW + 60)}.5000.${'ab'.repeat(32)}` },
      relayerUrl: 'https://relay.test',
      rpc,
      nowSeconds: NOW,
      fetchFn: (_u, init) => {
        posted = JSON.parse(typeof init.body === 'string' ? init.body : '');
        return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'12'.repeat(32)}` })));
      },
      randomNonce: () => 42n,
    });
    const parsed = parseSweepRequest(posted);
    expect(parsed.chainId).toBe(84532);
    expect(parsed.sweep.owner).toBe(p.stealthAddress);
    expect(parsed.sweep.amount).toBe(1_000_000n);
    expect(parsed.permit?.value).toBe(1_000_000n);
  });
});
