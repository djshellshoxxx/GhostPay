// @vitest-environment jsdom
import { deriveStealthPayment } from '@ghostpay/core-crypto';
import { act, cleanup } from '@testing-library/react';
import { bytesToHex, keccak256, recoverTransactionAddress, type TransactionSerializedEIP1559 } from 'viem';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLean } from '../AppLean';
import { fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { renderWith } from '../test/render';
import { clearSession, hasSession, importSession } from './session';
import { SETTINGS_KEY } from './settings';
import { directSweep } from './sweep';

// Keep real signatures for the control while recording only a count, never the key arguments.
const signerCalled = vi.hoisted(() => vi.fn<() => void>());
vi.mock('@ghostpay/chain-adapters', async (load) => {
  const adapters = await load<typeof import('@ghostpay/chain-adapters')>();
  return { ...adapters, signDigest: (...args: Parameters<typeof adapters.signDigest>) => {
    signerCalled();
    return adapters.signDigest(...args);
  } };
});

afterEach(() => {
  cleanup();
  clearSession();
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it.each([59_999, 60_000, 60_001])('rechecks the idle deadline when the final Sweep simulation returns at %i ms', async (elapsed) => {
  vi.useFakeTimers({ now: 1_800_000_000_000 });
  const seller = importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin: 1 }));
  renderWith(<AppLean />);
  const payment = deriveStealthPayment(seller.metaAddress);
  const balance = 10n ** 17n;
  const chainId = 11155111;
  let simulationStarted!: () => void;
  const started = new Promise<void>((resolve) => { simulationStarted = resolve; });
  let finishSimulation!: (result: string) => void;
  const result = new Promise<string>((resolve) => { finishSimulation = resolve; });
  let submitted: TransactionSerializedEIP1559 | undefined;
  const rpc = mockRpc(chainId, (method, params) => {
    switch (method) {
      case 'eth_gasPrice': return '0x3b9aca00';
      case 'eth_getTransactionCount': return '0x7';
      case 'eth_getBalance': return `0x${balance.toString(16)}`;
      case 'eth_estimateGas': return '0x5208';
      case 'eth_call': simulationStarted(); return result;
      case 'eth_sendRawTransaction':
        submitted = params[0] as TransactionSerializedEIP1559;
        return keccak256(submitted);
      default: throw new Error(`Unexpected mock RPC method ${method}`);
    }
  });
  const handoff = vi.fn();
  const pending = directSweep({
    target: { chainId, token: 'native', owner: payment.stealthAddress, announcement: {
      schemeId: 1n, stealthAddress: payment.stealthAddress,
      ephemeralPublicKey: bytesToHex(payment.ephemeralPublicKey), metadata: bytesToHex(payment.viewTag),
    } },
    manifest: fakeManifest(chainId), destination: '0x6666666666666666666666666666666666666666',
    amount: balance, rpc, onBeforeHandoff: handoff,
  });
  await started;
  expect(signerCalled).not.toHaveBeenCalled();
  // Wall time advances during OS sleep. No scheduled timer or lifecycle event is delivered.
  vi.setSystemTime(Date.now() + elapsed);
  await act(async () => {
    finishSimulation('0x');
    await pending.catch(() => undefined); // Each branch asserts the settled result below.
  });

  if (elapsed < 60_000) {
    expect(signerCalled).toHaveBeenCalledOnce();
    expect(handoff).toHaveBeenCalledOnce();
    await expect(pending).resolves.toMatchObject({ attempt: { status: 'submitted' } });
    expect(await recoverTransactionAddress({ serializedTransaction: submitted! })).toBe(payment.stealthAddress);
  } else {
    expect(signerCalled).not.toHaveBeenCalled();
    expect(handoff).not.toHaveBeenCalled();
    await expect(pending).rejects.toThrow(/Seller keys changed during this action/);
    expect(rpc.calls.map(({ method }) => method)).not.toContain('eth_sendRawTransaction');
    expect(hasSession()).toBe(false);
  }
});
