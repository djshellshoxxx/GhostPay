import {
  buildPaymentTx, buildPermitTypedData, buildSweepTypedData, validateManifest, ghostPaySweepRelayerAbi,
  ghostPayRouterAbi, erc20Abi, erc2612PermitAbi,
  type PermitReader,
} from '@ghostpay/chain-adapters';
import { hexToBytes } from 'viem';
import { describe, expect, it } from 'vitest';
import { ANNOUNCER, CHAIN, DEST, EPH, FEE_RECIPIENT, NOW, RELAYER, ROUTER, STEALTH, USDC, OWNER, policy, erc20Metadata } from './build.testutil.js';
import { decodeTx, decodeTypedData } from './decode.js';
import { assertReviewed } from './review.js';
import type { Intent, RouterPaymentIntent, TxInput } from './types.js';

const P = policy();
const manifest = validateManifest(
  {
    chainId: CHAIN, announcer: ANNOUNCER, router: ROUTER, sweepRelayer: RELAYER, feeRecipient: FEE_RECIPIENT, feeBps: 25,
    deployTx: { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}` },
    solcVersion: '0.8.28+commit.7893614a', commit: 'a'.repeat(40),
    bytecodeHashes: { router: `0x${'3'.repeat(64)}`, sweepRelayer: `0x${'4'.repeat(64)}` }, date: '2026-01-01T00:00:00Z',
  },
  CHAIN,
);
const SIG = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as const;
const payment = { stealthAddress: STEALTH, ephemeralPublicKey: hexToBytes(EPH), viewTag: 7 };
const deadline = BigInt(NOW + 600);

function previewToIntent(b: ReturnType<typeof buildPaymentTx>): RouterPaymentIntent {
  const p = b.preview;
  return {
    kind: 'router_payment', method: p.method as RouterPaymentIntent['method'], chainId: p.chainId, router: p.router, token: p.token,
    stealth: p.stealth, gross: p.gross, minNet: p.minNet, fee: p.fee, deadline: p.deadline, metadata: p.metadata, ephemeralKey: p.ephemeralPublicKey,
  };
}

describe('golden vectors from chain-adapters builders', () => {
  const base = { chain: { chainId: CHAIN } as never, deployment: manifest, payment, deadline };
  const build = (o: Record<string, unknown>, token: string = USDC) =>
    buildPaymentTx({ ...base, ...o, invoice: { chainId: CHAIN, token } } as never);

  it.each([
    ['payERC20', {}, USDC],
    ['payERC20WithPermit', { permitSignature: SIG }, USDC],
    ['payNative', { grossAmount: 10n ** 18n }, 'native'],
  ] as const)('%s decodes to the builder preview and passes review', (_n, extra, token) => {
    const b = build({ ...{ grossAmount: 1_000_000_000n }, ...extra }, token);
    const t: TxInput = { ...b.tx, chainId: CHAIN };
    const decoded = decodeTx(t);
    expect(decoded).toEqual(previewToIntent(b));
    expect(() => { assertReviewed(decoded, previewToIntent(b), P, NOW); }).not.toThrow();
  });

  it('payERC20WithBuffer built by chain-adapters is refused (L-04)', () => {
    const b = build({ grossAmount: 1_000_000_000n, buffer: { bufferWei: 5n } });
    expect(decodeTx({ ...b.tx, chainId: CHAIN })).toEqual({ kind: 'unknown', reason: 'BUFFER_PAYMENT_UNSUPPORTED' });
  });

  it('sweep typed data from buildSweepTypedData', () => {
    const order = { token: USDC, owner: STEALTH, destination: DEST, feeTo: FEE_RECIPIENT, amount: 1_000_000n, fee: 10_000n, deadline, nonce: 1n };
    const td = buildSweepTypedData(CHAIN, RELAYER, order);
    const expected: Intent = { kind: 'relayed_sweep_sig', chainId: CHAIN, verifyingContract: RELAYER, owner: STEALTH, token: USDC, destination: DEST, amount: 1_000_000n, fee: 10_000n, feeTo: FEE_RECIPIENT, deadline, nonce: 1n };
    const decoded = decodeTypedData(td as never);
    expect(decoded).toEqual(expected);
    expect(() => { assertReviewed(decoded, expected, P, NOW); }).not.toThrow();
  });

  it('permit typed data from buildPermitTypedData (spender/deadline/value are what the review binds, haiku L-2)', async () => {
    const reader: PermitReader = { name: () => Promise.resolve('USDC'), version: () => Promise.resolve('2'), nonce: () => Promise.resolve(4n) };
    const td = await buildPermitTypedData({ chainId: CHAIN, token: USDC, owner: OWNER, spender: ROUTER, value: 5_000_000n, deadline, reader });
    const expected: Intent = { kind: 'permit_sig', chainId: CHAIN, token: USDC, owner: OWNER, spender: ROUTER, value: 5_000_000n, nonce: 4n, deadline };
    const decoded = decodeTypedData(td);
    expect(decoded).toEqual(expected);
    expect(() => { assertReviewed(decoded, expected, P, NOW); }).not.toThrow();
    const swapped = await buildPermitTypedData({ chainId: CHAIN, token: USDC, owner: OWNER, spender: DEST, value: 5_000_000n, deadline, reader });
    expect(() => { assertReviewed(decodeTypedData(swapped), expected, P, NOW); }).toThrow(/SPENDER_NOT_MANIFEST/);
  });

  it('the ABIs this package relies on expose the expected entry points', () => {
    const names = (abi: readonly { type: string; name?: string }[]): string[] => abi.filter((i) => i.type === 'function').map((i) => i.name ?? '');
    expect(names(ghostPayRouterAbi)).toEqual(expect.arrayContaining(['payERC20', 'payERC20WithPermit', 'payNative', 'payERC20WithBuffer']));
    expect(names(erc20Abi)).toEqual(expect.arrayContaining(['transfer', 'approve']));
    expect(names(ghostPaySweepRelayerAbi)).toEqual(expect.arrayContaining(['sweep', 'sweepWithPermit']));
    expect(names(erc2612PermitAbi)).toContain('permit');
    expect(erc20Metadata(1, USDC, 1n)).toHaveLength(2 + 114);
  });
});
