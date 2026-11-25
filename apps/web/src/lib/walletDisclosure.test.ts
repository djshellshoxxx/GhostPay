import { afterEach, describe, expect, it, vi } from 'vitest';
import { WALLET_DISCLOSURE_MS, WalletDisclosureController, prepareWalletChainSwitch, prepareWalletConnection, prepareWalletSignature, prepareWalletTransaction } from './walletDisclosure';

const ACCOUNT = '0x5555555555555555555555555555555555555555';
const TARGET = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const REQUEST = prepareWalletConnection(84532).disclosure;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function mounted(): WalletDisclosureController {
  const controller = new WalletDisclosureController();
  controller.mount(); controller.allowPresentation(true);
  return controller;
}

describe('bounded immutable wallet request descriptions', () => {
  it('does not invent an account or send the expected chain in account-access parameters', () => {
    const request = prepareWalletConnection(84532);
    expect(request.method).toBe('eth_requestAccounts');
    expect(request.params).toBeUndefined();
    expect(request.disclosure.account).toBeUndefined();
    expect(JSON.parse(request.disclosure.requestJson)).toEqual({ method: 'eth_requestAccounts' });
    expect(request.disclosure.chainId).toBe(84532);
  });
  it('captures the actual transaction fields once and freezes the request before later caller edits', () => {
    const tx = { to: TARGET, data: '0x1234', value: 9n };
    const request = prepareWalletTransaction(84532, ACCOUNT, tx);
    tx.to = RECIPIENT; tx.data = '0xabcd'; tx.value = 42n;
    const actual = { from: ACCOUNT, to: TARGET, data: '0x1234', value: '0x9', chainId: '0x14a34' };
    expect(request.params).toEqual([actual]);
    expect(JSON.parse(request.disclosure.requestJson)).toEqual({ method: 'eth_sendTransaction', params: [actual] });
    expect(request.disclosure.nativeValueWei).toBe('9');
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.disclosure)).toBe(true);
    expect(Object.isFrozen(request.params)).toBe(true);
    expect(Object.isFrozen(request.params?.[0])).toBe(true);
  });
  // Real permits (apps/web/src/lib/pay.ts typedDataJson) declare EIP712Domain and the message type explicitly.
  const DOMAIN_TYPE = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }];
  const PERMIT_TYPE = [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }];
  it('shows only known typed-message fields and preserves the original signing bytes', () => {
    const json = JSON.stringify({ types: { EIP712Domain: DOMAIN_TYPE, Permit: [...PERMIT_TYPE, { name: 'note', type: 'string' }] }, primaryType: 'Permit',
      domain: { verifyingContract: TARGET }, message: { spender: RECIPIENT, value: '17', note: '\u202eprivate ✓' } });
    const request = prepareWalletSignature(84532, ACCOUNT, json);
    expect(request.disclosure).toMatchObject({ account: ACCOUNT, chainId: 84532, destination: TARGET, primaryType: 'Permit', typedAmount: '17', typedRecipient: RECIPIENT });
    expect(request.params).toEqual([ACCOUNT, json]);
    expect(JSON.parse(request.disclosure.requestJson)).toEqual({ method: 'eth_signTypedData_v4', params: [ACCOUNT, json] });
    expect(request.disclosure.requestJson).not.toContain('\u202e');
    expect(request.disclosure.requestJson).toContain('\\u202e');
  });
  it.each([1, '1', '0x1'])('separately summarizes the signed domain chain %s without substituting the wallet chain', (chainId) => {
    const json = JSON.stringify({ types: { EIP712Domain: DOMAIN_TYPE }, domain: { chainId, verifyingContract: TARGET }, message: { value: '17' } });
    const request = prepareWalletSignature(84532, ACCOUNT, json);
    expect(request.disclosure.chainId).toBe(84532);
    expect(request.disclosure.domainChainId).toBe('1');
    expect(request.params).toEqual([ACCOUNT, json]);
    expect(JSON.parse(request.disclosure.requestJson)).toEqual({ method: 'eth_signTypedData_v4', params: [ACCOUNT, json] });
  });
  it('does not invent a signature domain chain for absent, malformed or unbounded values', () => {
    for (const chainId of [undefined, -1, 1.5, '1e9', '0x', '0x' + 'f'.repeat(65), '9'.repeat(78), {}]) {
      const request = prepareWalletSignature(84532, ACCOUNT, JSON.stringify({ types: { EIP712Domain: DOMAIN_TYPE }, domain: { chainId } }));
      expect(request.disclosure.domainChainId).toBeUndefined();
    }
  });
  it('labels only fields the wallet will sign: declared, of a fitting type, and unambiguous', () => {
    const other = '0x3333333333333333333333333333333333333333';
    const label = (value: unknown): ReturnType<typeof prepareWalletSignature>['disclosure'] => prepareWalletSignature(84532, ACCOUNT, JSON.stringify(value)).disclosure;
    // An undeclared field is ignored by the wallet when signing, so it is never shown as the recipient.
    expect(label({ types: { Permit: [{ name: 'spender', type: 'address' }] }, primaryType: 'Permit', message: { to: other, spender: RECIPIENT } }).typedRecipient).toBe(RECIPIENT);
    // A present but invalid value does not fall through to another field.
    expect(label({ types: { T: [{ name: 'amount', type: 'uint256' }] }, primaryType: 'T', message: { amount: 1e30, value: '1' } }).typedAmount).toBeUndefined();
    // Two candidates, or a declared field of the wrong type, stay unknown.
    expect(label({ types: { T: [{ name: 'to', type: 'address' }, { name: 'spender', type: 'address' }] }, primaryType: 'T', message: { to: other, spender: RECIPIENT } }).typedRecipient).toBeUndefined();
    expect(label({ types: { T: [{ name: 'value', type: 'string' }] }, primaryType: 'T', message: { value: '17' } }).typedAmount).toBeUndefined();
    // Domain fields count only when EIP712Domain declares them with the right type.
    expect(label({ types: {}, domain: { verifyingContract: TARGET, chainId: 1 } })).not.toHaveProperty('destination');
    expect(label({ types: { EIP712Domain: [{ name: 'verifyingContract', type: 'string' }, { name: 'chainId', type: 'string' }] }, domain: { verifyingContract: TARGET, chainId: 1 } }))
      .not.toHaveProperty('domainChainId');
    // A duplicate field declaration is ambiguous; above uint256 is not an amount.
    expect(label({ types: { T: [{ name: 'value', type: 'uint256' }, { name: 'value', type: 'uint8' }] }, primaryType: 'T', message: { value: '1' } }).typedAmount).toBeUndefined();
    expect(label({ types: { T: [{ name: 'value', type: 'uint256' }] }, primaryType: 'T', message: { value: (1n << 256n).toString() } }).typedAmount).toBeUndefined();
    expect(label({ types: { T: [{ name: 'value', type: 'uint256' }] }, primaryType: 'T', message: { value: ((1n << 256n) - 1n).toString() } }).typedAmount).toBe(((1n << 256n) - 1n).toString());
  });
  it('leaves unsupported typed-message semantics unknown rather than guessing', () => {
    const request = prepareWalletSignature(84532, ACCOUNT, '{"message":{"value":"-1","to":"not an address"}}');
    expect(request.disclosure.typedAmount).toBeUndefined();
    expect(request.disclosure.typedRecipient).toBeUndefined();
    expect(request.disclosure.primaryType).toBeUndefined();
    expect(request.disclosure.destination).toBeUndefined();
  });
  it('binds a chain-switch preview to exactly its outgoing parameters', () => {
    const request = prepareWalletChainSwitch(1, ACCOUNT);
    expect(request.params).toEqual([{ chainId: '0x1' }]);
    expect(JSON.parse(request.disclosure.requestJson)).toEqual({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] });
  });
  it.each([NaN, Infinity, -1, 0, 1.5])('rejects an invalid expected chain %s before preview', (chainId) => {
    expect(() => prepareWalletConnection(chainId)).toThrow(/cannot be safely previewed/);
  });
  it('bounds payload size and rejects malformed transaction or JSON input with neutral errors', () => {
    expect(() => prepareWalletTransaction(1, ACCOUNT, { to: TARGET, data: '0x1', value: 1n })).toThrow(/cannot be safely previewed/);
    expect(() => prepareWalletTransaction(1, ACCOUNT, { to: TARGET, data: '0x', value: -1n })).toThrow(/cannot be safely previewed/);
    expect(() => prepareWalletTransaction(1, ACCOUNT, { to: TARGET, data: '0x', value: 1n << 256n })).toThrow(/cannot be safely previewed/);
    expect(() => prepareWalletSignature(1, ACCOUNT, 'private malformed input')).toThrow(/cannot be safely previewed/);
    expect(() => prepareWalletSignature(1, ACCOUNT, JSON.stringify({ note: 'x'.repeat(65_536) }))).toThrow(/cannot be safely previewed/);
    expect(() => prepareWalletSignature(1, ACCOUNT, '[]')).toThrow(/cannot be safely previewed/);
  });
});

describe('single-use wallet disclosure controller', () => {
  it('refuses missing hosts and hidden presentation instead of auto-approving', async () => {
    const controller = new WalletDisclosureController();
    await expect(controller.request(REQUEST)).rejects.toThrow(/unavailable/);
    controller.mount();
    await expect(controller.request(REQUEST)).rejects.toThrow(/unavailable/);
    expect(controller.getSnapshot()).toBeUndefined();
  });
  it('requires an explicit decision and keeps approval bound to host lifecycle', async () => {
    const controller = mounted();
    const result = controller.request(REQUEST);
    const pending = controller.getSnapshot()!;
    expect(pending.request).toBe(REQUEST);
    controller.approve(pending);
    const approval = await result;
    expect(controller.getSnapshot()).toBeUndefined();
    expect(() => approval.assertCurrent()).not.toThrow();
    controller.revoke();
    expect(() => approval.assertCurrent()).toThrow(/cancelled or became stale/);
  });
  it('rejects concurrent work without replacing the visible prompt', async () => {
    const controller = mounted();
    const result = controller.request(REQUEST).catch(() => 'cancelled');
    const pending = controller.getSnapshot()!;
    await expect(controller.request(prepareWalletConnection(1).disclosure)).rejects.toThrow(/Another wallet disclosure/);
    expect(controller.getSnapshot()).toBe(pending);
    controller.cancel(pending);
    expect(await result).toBe('cancelled');
  });
  it('never lets an old prompt approve or cancel its replacement', async () => {
    const controller = mounted();
    const first = controller.request(REQUEST).catch(() => 'cancelled');
    const old = controller.getSnapshot()!;
    controller.cancel(old); await first;
    const second = controller.request(prepareWalletConnection(1).disclosure);
    const current = controller.getSnapshot()!;
    controller.approve(old); controller.cancel(old);
    expect(controller.getSnapshot()).toBe(current);
    controller.approve(current);
    const approval = await second;
    expect(() => approval.assertCurrent()).not.toThrow();
  });
  it('rejects an already aborted action and promptly clears one aborted while pending', async () => {
    const controller = mounted();
    const action = new AbortController(); action.abort();
    await expect(controller.request(REQUEST, action.signal)).rejects.toThrow(/cancelled/);
    const another = new AbortController();
    const result = controller.request(REQUEST, another.signal).catch(() => 'cancelled');
    another.abort();
    expect(await result).toBe('cancelled');
    expect(controller.getSnapshot()).toBeUndefined();
  });
  it('revokes both pending and accepted requests when privacy hides presentation', async () => {
    const controller = mounted();
    const pending = controller.request(REQUEST).catch(() => 'cancelled');
    controller.allowPresentation(false);
    expect(await pending).toBe('cancelled');
    controller.allowPresentation(true);
    const next = controller.request(REQUEST); controller.approve(controller.getSnapshot()!);
    const approval = await next;
    controller.allowPresentation(false);
    expect(() => approval.assertCurrent()).toThrow(/cancelled/);
  });
  it('expires a waiting prompt and cannot resurrect it with an old button', async () => {
    vi.useFakeTimers();
    const controller = mounted();
    const result = controller.request(REQUEST).catch(() => 'cancelled');
    const pending = controller.getSnapshot()!;
    await vi.advanceTimersByTimeAsync(WALLET_DISCLOSURE_MS);
    controller.approve(pending);
    expect(await result).toBe('cancelled');
    expect(controller.getSnapshot()).toBeUndefined();
  });
  it('rejects approved work after either deadline or a clock rollback', async () => {
    vi.useFakeTimers();
    const controller = mounted();
    const first = controller.request(REQUEST); controller.approve(controller.getSnapshot()!);
    const approval = await first;
    vi.setSystemTime(Date.now() - 1);
    expect(() => approval.assertCurrent()).toThrow(/cancelled/);
    vi.setSystemTime(Date.now() + 1);
    expect(() => approval.assertCurrent()).toThrow(/cancelled/);
    const second = controller.request(REQUEST); controller.approve(controller.getSnapshot()!);
    const later = await second;
    await vi.advanceTimersByTimeAsync(WALLET_DISCLOSURE_MS);
    expect(() => later.assertCurrent()).toThrow(/cancelled/);
  });
  it('unmount cancels pending work and refuses new requests', async () => {
    const controller = new WalletDisclosureController();
    const unmount = controller.mount(); controller.allowPresentation(true);
    const result = controller.request(REQUEST).catch(() => 'cancelled');
    unmount();
    expect(await result).toBe('cancelled');
    await expect(controller.request(REQUEST)).rejects.toThrow(/unavailable/);
  });
});
