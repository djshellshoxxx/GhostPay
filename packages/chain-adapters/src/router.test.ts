import { NATIVE_TOKEN_ADDRESS, buildErc20Metadata, buildNativeMetadata } from '@ghostpay/core-crypto';
import { decodeFunctionData, encodeFunctionData, getAddress } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { ghostPayRouterAbi } from './abi/router.js';
import { findChain } from './config/chains.js';
import { validateManifest } from './deployments.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, MAINNET, SEPOLIA, USDC_SEPOLIA, invoiceFor, manifestJson, payment, recipient } from './fixtures.testutil.js';
import { routerFee } from './fees.js';
import {
  assertPreviewMatchesCalldata as assertWithChain, buildPaymentTx, decodePaymentCalldata, ROUTER_NATIVE_MARKER, type BuildPaymentInput,
  type PaymentPreview, type PaymentTx,
} from './router.js';
import type { Hex } from './types.js';

const deployment = validateManifest(manifestJson(), 11155111);
const { meta } = recipient();
const pay = payment(meta);
const assertPreviewMatchesCalldata = (p: PaymentPreview, tx: PaymentTx): void => { assertWithChain(p, tx, 11155111); };
const GROSS = 1_000_000_000n;
const DEADLINE = 4_000_000_000n;
const SIG: Hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;

function input(over: Partial<BuildPaymentInput> = {}, inv = {}): BuildPaymentInput {
  return { chain: SEPOLIA, deployment, invoice: invoiceFor(meta, inv), payment: pay, grossAmount: GROSS, deadline: DEADLINE, ...over };
}
const erc20 = () => buildPaymentTx(input());
const permit = () => buildPaymentTx(input({ permitSignature: SIG }));
const buffer = () => buildPaymentTx(input({ buffer: { bufferWei: 5n, maxBufferWei: 10n } }));
const native = () => buildPaymentTx(input({ grossAmount: 10n ** 18n }, { token: 'native' }));
const all = { payERC20: erc20, payERC20WithPermit: permit, payERC20WithBuffer: buffer, payNative: native } as const;

const looseEncode = encodeFunctionData as unknown as (p: { abi: typeof ghostPayRouterAbi; functionName: string; args: readonly unknown[] }) => Hex;
function withArg(tx: PaymentTx, index: number, value: unknown): PaymentTx {
  const d = decodeFunctionData({ abi: ghostPayRouterAbi, data: tx.data });
  const args = [...(d.args as readonly unknown[])];
  args[index] = value;
  return { ...tx, data: looseEncode({ abi: ghostPayRouterAbi, functionName: d.functionName, args }) };
}
const flip = (h: string): Hex => `0x${h.slice(2, -1)}${h.endsWith('0') ? '1' : '0'}`;

describe('buildPaymentTx happy paths', () => {
  it('payERC20: fee 25 bps, metadata from core-crypto, round-trips through decode', () => {
    const b = erc20();
    expect(b.preview.method).toBe('payERC20');
    expect(b.preview.fee).toBe(2_500_000n);
    expect(b.preview.net).toBe(997_500_000n);
    expect(b.preview.minNet).toBe(997_500_000n);
    expect(b.preview.value).toBe(0n);
    expect(b.tx.to).toBe(FAKE.router);
    expect(b.preview.token).toBe(USDC_SEPOLIA);
    expect(b.preview.metadata).toBe(`0x${Buffer.from(buildErc20Metadata(pay.viewTag, USDC_SEPOLIA, 997_500_000n)).toString('hex')}`);
    expect(decodePaymentCalldata(b.tx, 11155111)).toEqual(b.preview);
    assertPreviewMatchesCalldata(b.preview, b.tx);
  });
  it('payERC20WithPermit carries v/r/s', () => {
    const b = permit();
    expect(b.preview.method).toBe('payERC20WithPermit');
    expect(b.preview.permit).toEqual({ v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` });
    expect(decodePaymentCalldata(b.tx, 11155111)).toEqual(b.preview);
    assertPreviewMatchesCalldata(b.preview, b.tx);
  });
  it('permit accepts v = 0/1 and normalizes to 27/28', () => {
    const b = buildPaymentTx(input({ permitSignature: `0x${'11'.repeat(32)}${'22'.repeat(32)}01` }));
    expect(b.preview.permit?.v).toBe(28);
  });
  it('payERC20WithBuffer forwards msg.value and cap, no fee on the buffer', () => {
    const b = buffer();
    expect(b.tx.value).toBe(5n);
    expect(b.preview.maxBufferWei).toBe(10n);
    expect(b.preview.fee).toBe(routerFee(GROSS));
    expect(decodePaymentCalldata(b.tx, 11155111)).toEqual(b.preview);
    assertPreviewMatchesCalldata(b.preview, b.tx);
    expect(buildPaymentTx(input({ buffer: { bufferWei: 7n } })).preview.maxBufferWei).toBe(7n);
  });
  it('payNative: gross is msg.value, native metadata', () => {
    const b = native();
    expect(b.tx.value).toBe(10n ** 18n);
    expect(b.preview.token).toBe('native');
    expect(b.preview.fee).toBe(2_500_000_000_000_000n);
    expect(b.preview.metadata).toBe(`0x${Buffer.from(buildNativeMetadata(pay.viewTag, b.preview.net)).toString('hex')}`);
    expect(decodePaymentCalldata(b.tx, 11155111)).toEqual(b.preview);
    assertPreviewMatchesCalldata(b.preview, b.tx);
    expect(ROUTER_NATIVE_MARKER).toBe(NATIVE_TOKEN_ADDRESS);
  });
  it('minNet slippage floor is honoured; dust pays no fee', () => {
    expect(buildPaymentTx(input({ minNet: 1n })).preview.minNet).toBe(1n);
    const d = buildPaymentTx(input({ grossAmount: 399n }));
    expect(d.preview.fee).toBe(0n);
    expect(d.preview.net).toBe(399n);
    assertPreviewMatchesCalldata(d.preview, d.tx);
  });
  it('dust-fee-free and all methods decode cleanly', () => {
    for (const f of Object.values(all)) {
      const b = f();
      assertPreviewMatchesCalldata(b.preview, b.tx);
    }
  });
});

describe('buildPaymentTx negatives (fail closed)', () => {
  const bad = (i: Partial<BuildPaymentInput>, inv = {}, re?: RegExp): void => {
    expect(() => buildPaymentTx(input(i, inv))).toThrow(re ?? ChainAdapterError);
  };
  it('disabled / unknown chain', () => {
    bad({ chain: MAINNET, deployment: validateManifest(manifestJson(1), 1) }, { chainId: 1 }, /CHAIN_DISABLED/);
    bad({ chain: { ...SEPOLIA, chainId: 123 } }, {}, /CHAIN_DISABLED/);
  });
  it('chain id disagreements', () => {
    bad({ deployment: validateManifest(manifestJson(84532), 84532) }, {}, /CHAIN_MISMATCH/);
    bad({}, { chainId: 84532 }, /CHAIN_MISMATCH/);
  });
  it('amount and deadline bounds', () => {
    bad({ grossAmount: 0n });
    bad({ grossAmount: (1n << 255n) });
    bad({ grossAmount: -5n });
    bad({ deadline: 0n });
    bad({ deadline: 1n << 256n });
    bad({ now: DEADLINE }, {}, /passed/);
    expect(() => buildPaymentTx(input({ now: DEADLINE - 1n }))).not.toThrow();
  });
  it('minNet bounds', () => {
    bad({ minNet: 0n });
    bad({ minNet: 997_500_001n });
  });
  it('permit + buffer exclusive; permit/buffer rejected for native', () => {
    bad({ permitSignature: SIG, buffer: { bufferWei: 1n } }, {}, /exclusive/);
    bad({ permitSignature: SIG, grossAmount: 10n ** 18n }, { token: 'native' }, /ERC-20/);
    bad({ buffer: { bufferWei: 1n }, grossAmount: 10n ** 18n }, { token: 'native' }, /ERC-20/);
  });
  it('bad permit signatures', () => {
    bad({ permitSignature: '0x1234' }, {}, /65 bytes/);
    bad({ permitSignature: `0x${'11'.repeat(64)}1d` }, {}, /./);
    bad({ permitSignature: `0x${'11'.repeat(64)}05` }, {}, /./);
  });
  it('bad buffers', () => {
    bad({ buffer: { bufferWei: 0n } }, {}, /bufferWei/);
    bad({ buffer: { bufferWei: 5n, maxBufferWei: 4n } }, {}, /maxBufferWei/);
    bad({ buffer: { bufferWei: 1n, maxBufferWei: 1n << 256n } }, {}, /maxBufferWei/);
  });
  it('token problems', () => {
    bad({}, { token: '0x0000000000000000000000000000000000000000' }, /token/);
    bad({}, { token: '0x00000000000000000000000000000000000000ff' }, /UNSUPPORTED_TOKEN/);
    bad({}, { token: 'nonsense' }, /token/);
    bad({ findTokenFn: () => ({ chainId: 11155111, symbol: 'X', address: USDC_SEPOLIA, decimals: 6, permit: false }), permitSignature: SIG }, {}, /permit/);
    expect(() => buildPaymentTx(input({ findTokenFn: () => ({ chainId: 11155111, symbol: 'X', address: USDC_SEPOLIA, decimals: 6, permit: false }) }))).not.toThrow();
  });
  it('stealth problems', () => {
    bad({ payment: { ...pay, stealthAddress: '0x0000000000000000000000000000000000000000' } }, {}, /stealth/);
    bad({ payment: { ...pay, stealthAddress: FAKE.router } }, {}, /collides/);
    bad({ payment: { ...pay, stealthAddress: FAKE.feeRecipient } }, {}, /collides/);
    bad({ payment: { ...pay, stealthAddress: 'nope' as never } }, {}, /stealth/);
  });
  it('ephemeral key problems', () => {
    bad({ payment: { ...pay, ephemeralPublicKey: new Uint8Array(33) as never } }, {}, /ephemeral/);
    bad({ payment: { ...pay, ephemeralPublicKey: new Uint8Array(32) as never } }, {}, /ephemeral/);
  });
});

describe('assertPreviewMatchesCalldata: mutate every calldata argument', () => {
  const eph2 = `0x02${'00'.repeat(31)}01` as Hex; // valid-looking x=1 point? may be off-curve: either way must throw
  const cases: Record<string, { index: number; value: unknown }[]> = {
    payERC20: [
      { index: 0, value: '0x00000000000000000000000000000000000000ff' },
      { index: 1, value: '0x00000000000000000000000000000000000000ee' },
      { index: 2, value: GROSS + 1n },
      { index: 2, value: GROSS - 400n },
      { index: 3, value: 1n },
      { index: 4, value: DEADLINE + 1n },
      { index: 5, value: pay.ephemeralPublicKey.length === 33 ? `0x03${'00'.repeat(32)}` : eph2 },
      { index: 6, value: '0x00' },
    ],
    payERC20WithPermit: [
      { index: 0, value: '0x00000000000000000000000000000000000000ff' },
      { index: 1, value: '0x00000000000000000000000000000000000000ee' },
      { index: 2, value: GROSS + 1n },
      { index: 3, value: 1n },
      { index: 4, value: DEADLINE + 1n },
      { index: 6, value: '0x00' },
      { index: 7, value: 28 },
      { index: 8, value: `0x${'33'.repeat(32)}` },
      { index: 9, value: `0x${'33'.repeat(32)}` },
    ],
    payERC20WithBuffer: [
      { index: 0, value: '0x00000000000000000000000000000000000000ff' },
      { index: 1, value: '0x00000000000000000000000000000000000000ee' },
      { index: 2, value: GROSS + 1n },
      { index: 3, value: 1n },
      { index: 4, value: DEADLINE + 1n },
      { index: 5, value: 11n },
      { index: 7, value: '0x00' },
    ],
    payNative: [
      { index: 0, value: '0x00000000000000000000000000000000000000ee' },
      { index: 1, value: 1n },
      { index: 2, value: DEADLINE + 1n },
      { index: 4, value: '0x00' },
    ],
  };
  for (const [name, f] of Object.entries(all)) {
    it(`${name}: every mutated argument is detected`, () => {
      const b = f();
      for (const { index, value } of cases[name] ?? []) {
        const tx = withArg(b.tx, index, value);
        expect(() => assertPreviewMatchesCalldata(b.preview, tx), `${name} arg ${String(index)}`).toThrow(ChainAdapterError);
      }
    });
    it(`${name}: every mutated preview field is detected`, () => {
      const b = f();
      const mutations: Partial<Record<keyof PaymentPreview, unknown>> = {
        method: b.preview.method === 'payERC20' ? 'payNative' : 'payERC20',
        chainId: 1,
        router: getAddress('0x00000000000000000000000000000000000000ab'),
        token: b.preview.token === 'native' ? USDC_SEPOLIA : 'native',
        stealth: getAddress('0x00000000000000000000000000000000000000ab'),
        gross: b.preview.gross + 1n,
        fee: b.preview.fee + 1n,
        net: b.preview.net + 1n,
        minNet: b.preview.minNet - 1n,
        deadline: b.preview.deadline + 1n,
        ephemeralPublicKey: flip(b.preview.ephemeralPublicKey),
        metadata: flip(b.preview.metadata),
        value: b.preview.value + 1n,
        maxBufferWei: 12345n,
        permit: { v: 28, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` },
      };
      for (const [k, v] of Object.entries(mutations)) {
        const p = { ...b.preview, [k]: v };
        if (JSON.stringify(p, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)) === JSON.stringify(b.preview, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x))) continue;
        expect(() => assertPreviewMatchesCalldata(p, b.tx), `${name} field ${k}`).toThrow(ChainAdapterError);
      }
      // removing optional fields
      const pm = b.preview.permit;
      if (pm !== undefined) {
        const { permit: _p, ...rest } = b.preview;
        void _p;
        expect(() => assertPreviewMatchesCalldata(rest as PaymentPreview, b.tx)).toThrow(/permit/);
        expect(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...pm, s: `0x${'44'.repeat(32)}` } }, b.tx)).toThrow(/permit/);
        expect(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...pm, v: 28 } }, b.tx)).toThrow(/permit/);
        expect(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { ...pm, r: `0x${'44'.repeat(32)}` } }, b.tx)).toThrow(/permit/);
      }
      if (b.preview.maxBufferWei !== undefined) {
        const { maxBufferWei: _m, ...rest } = b.preview;
        void _m;
        expect(() => assertPreviewMatchesCalldata(rest as PaymentPreview, b.tx)).toThrow(/maxBufferWei/);
      }
      if (b.preview.permit === undefined) expect(() => assertPreviewMatchesCalldata({ ...b.preview, permit: { v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` } }, b.tx)).toThrow(ChainAdapterError);
    });
    it(`${name}: tx.to, tx.value, trailing/truncated/garbage data are detected`, () => {
      const b = f();
      const other = getAddress('0x00000000000000000000000000000000000000ab');
      expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, to: other })).toThrow(/router/);
      expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, value: b.tx.value + 1n })).toThrow(ChainAdapterError);
      if (b.tx.value > 0n) expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, value: b.tx.value - 1n })).toThrow(ChainAdapterError);
      expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, data: `${b.tx.data}00` })).toThrow(/non-canonical|malformed/);
      expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, data: b.tx.data.slice(0, -2) as Hex })).toThrow(ChainAdapterError);
      expect(() => assertPreviewMatchesCalldata(b.preview, { ...b.tx, data: `0xdeadbeef${b.tx.data.slice(10)}` })).toThrow(/unknown/);
    });
  }

  it('metadata that disagrees with calldata is caught by decode itself', () => {
    const b = erc20();
    const wrongNet = `0x${Buffer.from(buildErc20Metadata(pay.viewTag, USDC_SEPOLIA, b.preview.net + 1n)).toString('hex')}`;
    expect(() => decodePaymentCalldata(withArg(b.tx, 6, wrongNet), 1)).toThrow(/net/);
    const wrongToken = `0x${Buffer.from(buildErc20Metadata(pay.viewTag, getAddress('0x00000000000000000000000000000000000000ff'), b.preview.net)).toString('hex')}`;
    expect(() => decodePaymentCalldata(withArg(b.tx, 6, wrongToken), 1)).toThrow(/token/);
    const nativeMeta = `0x${Buffer.from(buildNativeMetadata(pay.viewTag, b.preview.net)).toString('hex')}`;
    expect(() => decodePaymentCalldata(withArg(b.tx, 6, nativeMeta), 1)).toThrow(/token/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 6, `${wrongNet}00`), 1)).toThrow(/metadata/);
    const n = native();
    const erc20Meta = `0x${Buffer.from(buildErc20Metadata(pay.viewTag, USDC_SEPOLIA, n.preview.net)).toString('hex')}`;
    expect(() => decodePaymentCalldata(withArg(n.tx, 4, erc20Meta), 1)).toThrow(/token/);
  });
  it('static-revert shapes are rejected at decode', () => {
    const b = erc20();
    expect(() => decodePaymentCalldata(withArg(b.tx, 0, '0x0000000000000000000000000000000000000000'), 1)).toThrow(/zero token/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 2, 0n), 1)).toThrow(/gross/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 2, 1n << 255n), 1)).toThrow(/gross/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 3, b.preview.net + 1n), 1)).toThrow(/minNet/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 1, '0x0000000000000000000000000000000000000000'), 1)).toThrow(/stealth/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 1, FAKE.router), 1)).toThrow(/stealth/);
    expect(() => decodePaymentCalldata({ ...b.tx, value: 1n }, 1)).toThrow(/msg.value/);
    const bu = buffer();
    expect(() => decodePaymentCalldata({ ...bu.tx, value: 0n }, 1)).toThrow(/buffer/);
    // ephemeral key wrong length and off-curve
    expect(() => decodePaymentCalldata(withArg(b.tx, 5, `0x02${'00'.repeat(31)}`), 1)).toThrow(/ephemeral/);
    expect(() => decodePaymentCalldata(withArg(b.tx, 5, `0x04${'11'.repeat(32)}`), 1)).toThrow(/ephemeral/);
  });
  it('rejects a chain id that differs from the wallet chain', () => {
    const b = erc20();
    expect(() => assertWithChain(b.preview, b.tx, 1)).toThrow(/chainId/);
  });
  it('rejects malformed tx envelope', () => {
    const b = erc20();
    expect(() => decodePaymentCalldata({ ...b.tx, data: '0x' }, 1)).toThrow(ChainAdapterError);
    expect(() => decodePaymentCalldata({ ...b.tx, data: 'zz' as Hex }, 1)).toThrow(ChainAdapterError);
    expect(() => decodePaymentCalldata({ ...b.tx, to: '0x12' }, 1)).toThrow(ChainAdapterError);
    expect(() => decodePaymentCalldata({ ...b.tx, value: -1n }, 1)).toThrow(ChainAdapterError);
    // a valid router ABI function that is not a payment method
    const other = encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'FEE_BPS' });
    expect(() => decodePaymentCalldata({ ...b.tx, data: other }, 1)).toThrow(/not a payment|unknown/);
    void findChain;
  });
});
