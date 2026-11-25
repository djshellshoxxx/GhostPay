import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex } from 'viem';
import { ROUTER_ABI, TOKEN_ABI } from './abi.js';
import { verifyPaymentProvenance, type PaymentLog } from './payment.js';

const ROUTER = getAddress(`0x${'a1'.repeat(20)}`);
const TOKEN = getAddress(`0x${'b2'.repeat(20)}`);
const STEALTH = getAddress(`0x${'c3'.repeat(20)}`);
const ATTACKER = getAddress(`0x${'e5'.repeat(20)}`);
const HANDLE: Hex = `0x${'7d'.repeat(32)}`;
const OTHER_HANDLE: Hex = `0x${'8e'.repeat(32)}`;
const pinned = { router: ROUTER, token: TOKEN, stealth: STEALTH, handle: HANDLE };

function routerEvent(emitter: Address, token: Address, handle: Hex): PaymentLog {
  return {
    address: emitter,
    topics: encodeEventTopics({ abi: ROUTER_ABI, eventName: 'ConfidentialPayment', args: { token } }) as Hex[],
    data: encodeAbiParameters([{ type: 'bytes32' }], [handle]),
  };
}

function transferEvent(emitter: Address, from: Address, to: Address, handle: Hex): PaymentLog {
  return {
    address: emitter,
    topics: encodeEventTopics({ abi: TOKEN_ABI, eventName: 'ConfidentialTransfer', args: { from, to, amount: handle } }) as Hex[],
    data: '0x',
  };
}

const genuine = (): PaymentLog[] => [transferEvent(TOKEN, ROUTER, STEALTH, HANDLE), routerEvent(ROUTER, TOKEN, HANDLE)];

describe('verifyPaymentProvenance (B1: a decryptable handle is not a payment)', () => {
  it('accepts the router payment event plus the pinned token transfer router -> stealth of the same handle', () => {
    expect(verifyPaymentProvenance(genuine(), pinned)).toBe('verified');
    expect(verifyPaymentProvenance([...genuine()].reverse(), pinned)).toBe('verified');
  });

  it('rejects an attacker announcement with no router or token event (handle allowed via FHE.allow)', () => {
    expect(verifyPaymentProvenance([], pinned)).toBe('missing-router-event');
  });

  it('rejects a lookalike router event emitted by another contract', () => {
    const logs = [transferEvent(TOKEN, ROUTER, STEALTH, HANDLE), routerEvent(ATTACKER, TOKEN, HANDLE)];
    expect(verifyPaymentProvenance(logs, pinned)).toBe('missing-router-event');
  });

  it('rejects a transfer of a worthless token, a transfer from someone else, to someone else, or of another handle', () => {
    const r = routerEvent(ROUTER, TOKEN, HANDLE);
    expect(verifyPaymentProvenance([r, transferEvent(ATTACKER, ROUTER, STEALTH, HANDLE)], pinned)).toBe('missing-token-transfer');
    expect(verifyPaymentProvenance([r, transferEvent(TOKEN, ATTACKER, STEALTH, HANDLE)], pinned)).toBe('missing-token-transfer');
    expect(verifyPaymentProvenance([r, transferEvent(TOKEN, ROUTER, ATTACKER, HANDLE)], pinned)).toBe('missing-token-transfer');
    expect(verifyPaymentProvenance([r, transferEvent(TOKEN, ROUTER, STEALTH, OTHER_HANDLE)], pinned)).toBe('missing-token-transfer');
  });

  it('rejects a router event for another token or another handle', () => {
    const t = transferEvent(TOKEN, ROUTER, STEALTH, HANDLE);
    expect(verifyPaymentProvenance([t, routerEvent(ROUTER, ATTACKER, HANDLE)], pinned)).toBe('missing-router-event');
    expect(verifyPaymentProvenance([t, routerEvent(ROUTER, TOKEN, OTHER_HANDLE)], pinned)).toBe('missing-router-event');
  });

  it('ignores malformed and unrelated logs instead of throwing, and bounds the log count', () => {
    const junk: PaymentLog[] = [
      { address: ROUTER, topics: [], data: '0x' },
      { address: ROUTER, topics: [`0x${'00'.repeat(32)}`], data: '0xzz' },
      { address: TOKEN, topics: [`0x${'11'.repeat(31)}`], data: '0x' },
    ];
    expect(verifyPaymentProvenance([...junk, ...genuine()], pinned)).toBe('verified');
    const many = Array.from({ length: 1025 }, () => junk[0] as PaymentLog);
    expect(verifyPaymentProvenance(many, pinned)).toBe('invalid-input');
    expect(verifyPaymentProvenance(genuine(), { ...pinned, router: 'nope' })).toBe('invalid-input');
    expect(verifyPaymentProvenance(genuine(), { ...pinned, handle: `0x${'00'.repeat(32)}` })).toBe('invalid-input');
    expect(verifyPaymentProvenance('x' as unknown as PaymentLog[], pinned)).toBe('invalid-input');
  });
});
