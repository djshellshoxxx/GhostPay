// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanMatch } from '../lib/scanClient';
import { recordFromVerifiedMatch, RECONCILIATION_LEDGER_DATA_KEY } from '../lib/reconciliationLedger';
import { clearSession, generateSession } from '../lib/session';
import { checkpointKeyId } from '../lib/scanClient';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { ReconciliationLedger } from './ReconciliationLedger';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
/** A reorg that replaced the block of every stored observation. */
const orphaned = (): Promise<string> => Promise.resolve(`0x${'9'.repeat(64)}`);
const ADDRESS = `0x${'d'.repeat(40)}`;
function match(): ScanMatch {
  return {
    chainId: 84532,
    announcement: {
      id: `${BLOCK}:3`,
      transactionHash: TX,
      blockNumber: 120n,
      blockHash: BLOCK,
      logIndex: 3,
      schemeId: 1n,
      caller: `0x${'1'.repeat(40)}`,
      stealthAddress: ADDRESS,
      ephemeralPublicKey: `0x02${'2'.repeat(64)}`,
      metadata: '0x',
    },
    stealthAddress: ADDRESS,
    metadata: { kind: 'native', token: '0x', netAmount: 2500000n, viewTag: 5 },
    viaRouter: true,
    tagMatches: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}
let keyId: string;
let vault: ReconciliationVault;
let data: Map<string, string>;
function panel(overrides: Partial<React.ComponentProps<typeof ReconciliationLedger>> = {}) {
  return (
    <ReconciliationLedger
      chainId={84532}
      sellerKeyId={keyId}
      matches={[match()]}
      scanMatchesCurrentScope
      {...overrides}
    />
  );
}
beforeEach(async () => {
  window.localStorage.clear();
  clearSession();
  const session = generateSession();
  keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  data = new Map();
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard();
      if ((data.get(key) ?? null) !== expected) return Promise.resolve(false);
      data.set(key, next);
      return Promise.resolve(true);
    },
  };
  vault = new ReconciliationVault(store, { chainId: 84532, sellerKeyId: keyId }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(7));
  factory.create.mockResolvedValue(vault);
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('encrypted reconciliation UI', () => {
  it('requires unlock and saves only selected verified scan evidence as ciphertext', async () => {
    const user = userEvent.setup();
    render(panel());
    expect(screen.queryByRole('button', { name: 'Add verified payment to ledger' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await user.type(
      await screen.findByLabelText('Invoice digest (optional, manual link)'),
      `0x${'f'.repeat(64)}`,
    );
    await user.click(screen.getByRole('button', { name: 'Add verified payment to ledger' }));
    expect(await screen.findByText(/Manual invoice link/)).toBeTruthy();
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
    expect([...data.values()][0]).not.toContain(TX);
    await user.click(screen.getByRole('button', { name: 'Lock reconciliation vault' }));
    expect(screen.queryByText(TX)).toBeNull();
  });
  it('keeps legacy records explicitly untrusted and permits only read, export and delete', async () => {
    window.localStorage.setItem(
      RECONCILIATION_LEDGER_DATA_KEY,
      JSON.stringify({ version: 1, records: [recordFromVerifiedMatch(match(), keyId)] }),
    );
    const user = userEvent.setup();
    render(panel());
    expect(screen.queryByText(TX)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Read untrusted legacy records' }));
    expect(screen.getByText(TX)).toBeTruthy();
    expect(screen.getByText(/Legacy data is untrusted/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import legacy/ })).toBeNull();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete legacy plaintext records' }));
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
  });
  it('invalidates pending unlock and hides records after scope changes or unmount', async () => {
    let release!: (value: ReconciliationVault) => void;
    factory.create.mockReturnValue(
      new Promise<ReconciliationVault>((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    const view = render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    view.rerender(panel({ chainId: 1 }));
    release(vault);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Lock reconciliation vault' })).toBeNull(),
    );
    expect(screen.queryByText(TX)).toBeNull();
  });
  it('previews encrypted backups without applying them and clears preview when text changes', async () => {
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const backup = await vault.exportEncrypted();
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    fireEvent.change(await screen.findByLabelText('Encrypted reconciliation backup'), {
      target: { value: backup },
    });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    expect(await screen.findByText(/1 historical observation/)).toBeTruthy();
    // The count comes from the same merge as activation: nothing in this backup would be invalidated.
    expect(screen.getByText(/0 would be marked invalid after a reorg/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate previewed historical records' })).toBeTruthy();
    await user.clear(screen.getByLabelText('Encrypted reconciliation backup'));
    expect(screen.queryByRole('button', { name: 'Activate previewed historical records' })).toBeNull();
  });
  it('exports encrypted backups, confirms deletion and retains ciphertext after locking', async () => {
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:encrypted');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    await user.click(screen.getByRole('button', { name: 'Export encrypted reconciliation backup' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Delete encrypted observations' }));
    expect(screen.getByText(TX)).toBeTruthy();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete encrypted observations' }));
    await waitFor(() => expect(screen.queryByText(TX)).toBeNull());
    expect(data.size).toBe(1);
  });
  it('activates only a previewed encrypted backup as imported untrusted history', async () => {
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const backup = await vault.exportEncrypted();
    await vault.clearRecords();
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    fireEvent.change(await screen.findByLabelText('Encrypted reconciliation backup'), {
      target: { value: backup },
    });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    await user.click(await screen.findByRole('button', { name: 'Activate previewed historical records' }));
    expect(await screen.findByText(/Imported historical observation/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activate previewed historical records' })).toBeNull();
  });
  it('rejects stale preview callbacks after encrypted input changes', async () => {
    const staged = { recordCount: 4, invalidatedCount: 0, readOnly: false, invoiceCount: 0, receiptCount: 0 };
    let release!: (value: typeof staged) => void;
    vi.spyOn(vault, 'previewImport').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    const input = await screen.findByLabelText('Encrypted reconciliation backup');
    fireEvent.change(input, { target: { value: 'first encrypted file' } });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    fireEvent.change(input, { target: { value: 'second encrypted file' } });
    await act(async () => {
      release(staged);
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Activate previewed historical records' })).toBeNull();
  });
  it('clears decrypted rendered observations immediately on seller session cancellation', async () => {
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    act(() => clearSession());
    expect(screen.queryByText(TX)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lock reconciliation vault' })).toBeNull();
  });
  it('reports storage and malformed backup failures without saving plaintext or showing stale matches', async () => {
    factory.create.mockRejectedValueOnce(new Error('Storage unavailable'));
    const user = userEvent.setup();
    render(panel({ scanMatchesCurrentScope: false }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect(await screen.findByText('Storage unavailable')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    fireEvent.change(await screen.findByLabelText('Encrypted reconciliation backup'), {
      target: { value: 'untrusted plaintext' },
    });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    expect(await screen.findByText('Invalid encrypted reconciliation format.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add verified payment to ledger' })).toBeNull();
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
  });
  it('supports bounded raw export and deletion of unreadable legacy data after explicit consent', async () => {
    window.localStorage.setItem(RECONCILIATION_LEDGER_DATA_KEY, '{broken');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:legacy');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Read untrusted legacy records' }));
    expect(await screen.findByText(/corrupt/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Export untrusted legacy plaintext' }));
    expect(click).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Delete legacy plaintext records' }));
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
  });
  it('refreshes invalidation from another tab using payload-free broadcasts and closes channels', async () => {
    const channels: FakeChannel[] = [];
    const payloads: unknown[] = [];
    class FakeChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      closed = false;
      constructor(readonly name: string) {
        channels.push(this);
      }
      postMessage(value: unknown): void {
        payloads.push(value);
        for (const peer of channels)
          if (peer !== this && !peer.closed && peer.name === this.name)
            queueMicrotask(() => peer.onmessage?.({ data: value }));
      }
      close(): void {
        this.closed = true;
      }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const user = userEvent.setup();
    const view = render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    const local = vi.spyOn(window, 'dispatchEvent').mockReturnValue(true);
    await act(async () => {
      await vault.invalidateFrom(100n, [], orphaned);
    });
    expect(await screen.findByText(/Invalidated after a reorg/)).toBeTruthy();
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.every((value) => value === 'changed')).toBe(true);
    local.mockRestore();
    view.unmount();
    expect(channels.every((channel) => channel.closed)).toBe(true);
  });
  it('refreshes after foreground focus when cross-tab channels are unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    const local = vi.spyOn(window, 'dispatchEvent').mockReturnValue(true);
    await vault.invalidateFrom(100n, [], orphaned);
    local.mockRestore();
    fireEvent.focus(window);
    expect(await screen.findByText(/Invalidated after a reorg/)).toBeTruthy();
  });

  it('refreshes only after returning to a visible document when broadcasts are unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    const local = vi.spyOn(window, 'dispatchEvent').mockReturnValue(true);
    await vault.invalidateFrom(100n, [], orphaned);
    local.mockRestore();
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByText(/Invalidated after a reorg/)).toBeNull();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByText(/Invalidated after a reorg/)).toBeTruthy();
  });
  it('warns before activating an empty saturated backup and displays read-only state after later unlock', async () => {
    const base = recordFromVerifiedMatch(match(), keyId);
    const observed = Array.from({ length: 2001 }, (_, index) => {
      const transactionHash = `0x${BigInt(index + 1)
        .toString(16)
        .padStart(64, '0')}`;
      return {
        ...base,
        transactionHash,
        id: `${keyId}:84532:${transactionHash}:${base.stealthAddress}:${base.blockHash}:3`,
      };
    });
    await expect(vault.invalidateFrom(100n, observed, orphaned)).rejects.toThrow(/read-only/);
    await vault.clearRecords();
    const backup = await vault.exportEncrypted();
    data.clear();
    factory.create.mockImplementation(async () => {
      await vault.unlock(new Uint8Array(32).fill(7));
      return vault;
    });
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    fireEvent.change(await screen.findByLabelText('Encrypted reconciliation backup'), {
      target: { value: backup },
    });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    expect(await screen.findByText(/Activation will make this vault read-only/)).toBeTruthy();
    expect(screen.queryByText(/This reconciliation vault is read-only/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Activate previewed historical records' }));
    expect(await screen.findByText(/This reconciliation vault is read-only/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Add verified payment to ledger' }).disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Lock reconciliation vault' }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect(await screen.findByText(/This reconciliation vault is read-only/)).toBeTruthy();
  });
  it('does not let a delayed action read overwrite a newer reorg refresh', async () => {
    await vault.save(recordFromVerifiedMatch(match(), keyId));
    const stale = await vault.readState();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:encrypted');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findByText(TX);
    let release!: (value: typeof stale) => void;
    const held = vi.spyOn(vault, 'readState').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await user.click(screen.getByRole('button', { name: 'Export encrypted reconciliation backup' }));
    await waitFor(() => expect(held).toHaveBeenCalled());
    await act(async () => {
      await vault.invalidateFrom(100n, [], orphaned);
    });
    expect(await screen.findByText(/Invalidated after a reorg/)).toBeTruthy();
    await act(async () => {
      release(stale);
      await Promise.resolve();
    });
    expect(screen.getByText(/Invalidated after a reorg/)).toBeTruthy();
    expect(screen.queryByText(/Router-verified when scanned/)).toBeNull();
  });
});
