import { describe, expect, it } from 'vitest';
import { decodeFunctionData, keccak256, recoverTypedDataAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  NO_PERMIT,
  buildPermitTypedData,
  buildRelayIntent,
  encodeRelayPay,
  randomNonce,
  relayDigest,
  relayDomain,
  toRelayPermit,
  type BuildRelayIntentArgs,
} from './intent.js';
import { A } from '../vectors.testutil.js';
import { buildErc20Metadata, routerFee } from '../routerTargets.js';

const net = 1_000_000_000n - routerFee(1_000_000_000n);
const base: BuildRelayIntentArgs = {
  chainId: 31337,
  relay: A.relay,
  payer: A.payer,
  router: { kind: 'ghostpay', address: A.router },
  pay: {
    token: A.token,
    stealth: A.stealth,
    gross: 1_000_000_000n,
    minNet: net,
    deadline: 1_700_086_400n,
    ephemeralPubKey: `0x02${'12'.repeat(32)}`,
    metadata: buildErc20Metadata(1, A.token, net),
  },
  sponsorFee: 2_000_000n,
  sponsorFeeTo: A.sponsorFeeTo,
  deadline: 1_700_003_600n,
  nonce: 7n,
};

describe('buildRelayIntent', () => {
  it('binds the router calldata through payloadHash and signs recoverably', async () => {
    const b = buildRelayIntent(base);
    expect(b.intent.payloadHash).toBe(keccak256(b.routerCalldata));
    expect(b.intent).toMatchObject({ payer: A.payer, router: A.router, token: A.token, stealth: A.stealth, gross: 1_000_000_000n });
    const acct = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const sig = await acct.signTypedData(b.typedData);
    expect(await recoverTypedDataAddress({ ...b.typedData, signature: sig })).toBe(acct.address);
    expect(relayDigest(b.typedData)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('digest changes with every field', () => {
    const d0 = relayDigest(buildRelayIntent(base).typedData);
    const variants: Partial<BuildRelayIntentArgs>[] = [
      { nonce: 8n },
      { deadline: 1_700_003_601n },
      { sponsorFee: 2_000_001n },
      { sponsorFeeTo: A.payer },
      { payer: A.stealth },
      { chainId: 84532 },
      { relay: A.router },
    ];
    for (const v of variants) expect(relayDigest(buildRelayIntent({ ...base, ...v }).typedData)).not.toBe(d0);
  });
  it('enforces the testnet allowlist and argument ranges', () => {
    expect(() => buildRelayIntent({ ...base, chainId: 1 })).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
    expect(() => relayDomain(10, A.relay)).toThrow();
    expect(() => buildRelayIntent({ ...base, sponsorFee: -1n })).toThrow();
    expect(() => buildRelayIntent({ ...base, nonce: 2n ** 256n })).toThrow();
    expect(() => buildRelayIntent({ ...base, deadline: 0n })).toThrow();
    expect(() => buildRelayIntent({ ...base, sponsorFeeTo: zeroAddress })).toThrow();
    expect(() => buildRelayIntent({ ...base, sponsorFee: 0n, sponsorFeeTo: zeroAddress })).not.toThrow();
  });
  it('encodeRelayPay produces pay() calldata that decodes back', () => {
    const b = buildRelayIntent(base);
    const data = encodeRelayPay(b.intent, b.routerCalldata, `0x${'22'.repeat(65)}`, NO_PERMIT);
    const d = decodeFunctionData({
      abi: [{ type: 'function', name: 'pay', stateMutability: 'nonpayable', inputs: [
        { name: 'i', type: 'tuple', components: [
          { name: 'payer', type: 'address' }, { name: 'router', type: 'address' }, { name: 'token', type: 'address' }, { name: 'stealth', type: 'address' },
          { name: 'gross', type: 'uint256' }, { name: 'sponsorFee', type: 'uint256' }, { name: 'sponsorFeeTo', type: 'address' }, { name: 'deadline', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }, { name: 'payloadHash', type: 'bytes32' } ] },
        { name: 'routerCalldata', type: 'bytes' }, { name: 'sig', type: 'bytes' },
        { name: 'permit', type: 'tuple', components: [
          { name: 'value', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' } ] },
      ], outputs: [] }],
      data,
    });
    expect(d.functionName).toBe('pay');
    expect((d.args as readonly unknown[])[1]).toBe(b.routerCalldata);
  });
});

describe('permit helpers and nonce', () => {
  it('builds ERC-2612 typed data and converts a signature', async () => {
    const acct = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const td = buildPermitTypedData({ chainId: 31337, token: A.token, tokenName: 'PermitToken', tokenVersion: '1', owner: acct.address, spender: A.relay, value: 5n, nonce: 0n, deadline: 9n });
    const sig = await acct.signTypedData(td);
    const p = toRelayPermit(sig, 5n, 9n);
    expect(p).toMatchObject({ value: 5n, deadline: 9n });
    expect([27, 28]).toContain(p.v);
    expect(() => buildPermitTypedData({ chainId: 1, token: A.token, tokenName: 'x', tokenVersion: '1', owner: A.payer, spender: A.relay, value: 1n, nonce: 0n, deadline: 1n })).toThrow();
  });
  it('toRelayPermit normalises v and rejects bad input', () => {
    const rs = `${'01'.repeat(32)}${'02'.repeat(32)}`;
    expect(toRelayPermit(`0x${rs}1b`, 1n, 1n).v).toBe(27);
    expect(toRelayPermit(`0x${rs}1c`, 1n, 1n).v).toBe(28);
    expect(toRelayPermit(`0x${rs}00`, 1n, 1n).v).toBe(27);
    expect(toRelayPermit(`0x${rs}01`, 1n, 1n).v).toBe(28);
    expect(() => toRelayPermit(`0x${rs}05`, 1n, 1n)).toThrow();
    expect(() => toRelayPermit('0x1234', 1n, 1n)).toThrow();
  });
  it('randomNonce uses the supplied byte source', () => {
    expect(randomNonce((b) => b.fill(0xff))).toBe(2n ** 256n - 1n);
    expect(randomNonce((b) => b.fill(0))).toBe(0n);
    expect(randomNonce()).toBeGreaterThanOrEqual(0n);
  });
});
