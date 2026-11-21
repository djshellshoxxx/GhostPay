// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { clearCopiedBackup, englishBackupText, SecretBackup } from './SecretBackup';
import { CopyButton } from './Common';
import { clearClipboardIfUnchanged } from '../lib/clipboardPrivacy';

afterEach(async () => {
  cleanup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.resolve(''), writeText: () => Promise.resolve() } });
  clearCopiedBackup();
  await Promise.resolve();
});

it('issue286 audit: hiding a copied backup preserves newer external clipboard content', async () => {
  const backup = 'ab'.repeat(32);
  let clipboard = '';
  const writeText = vi.fn((text: string) => { clipboard = text; return Promise.resolve(); });
  const readText = vi.fn(() => Promise.resolve(clipboard));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } });
  const reveal = vi.fn(() => backup);
  render(<SecretBackup reveal={reveal} text={englishBackupText('seed')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show backup seed' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy seed' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy anyway' })); await Promise.resolve(); });
  expect(clipboard).toBe(backup);
  expect(screen.getByRole('status').textContent).toMatch(/Copied/);

  // The operating system clipboard is replaced outside GhostPay before Hide is clicked.
  clipboard = 'newer external clipboard value';
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide seed' })); await Promise.resolve(); });
  expect(screen.queryByText(backup)).toBeNull();
  // The recovery source remains available; the privacy requirement does not delete it.
  fireEvent.click(screen.getByRole('button', { name: 'Show backup seed' }));
  expect(screen.getByText(backup)).toBeTruthy();
  expect(reveal).toHaveBeenCalledTimes(2);
  expect(clipboard).toBe('newer external clipboard value');
});

async function copyBackup(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Show backup seed' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy seed' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy anyway' })); await Promise.resolve(); });
}

it('a denied comparison never clears blindly, and a retry leaves external replacement text intact', async () => {
  let value = '';
  const port = {
    readText: vi.fn<() => Promise<string>>().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    writeText: vi.fn((next: string) => { value = next; return Promise.resolve(); }),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  render(<SecretBackup reveal={() => 'backup secret'} text={englishBackupText('seed')} />);
  await copyBackup();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide seed' })); await Promise.resolve(); });
  expect(value).toBe('backup secret');
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('backup secret');
  expect(screen.queryByText('backup secret')).toBeNull();
  value = 'external replacement';
  port.readText.mockImplementation(() => Promise.resolve(value));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show backup seed' })); await Promise.resolve(); });
  expect(screen.getByText('backup secret')).toBeTruthy();
  expect(value).toBe('external replacement');
  expect(port.writeText).toHaveBeenCalledOnce();
  await act(async () => { fireEvent.click(document.body); await Promise.resolve(); });
  expect(port.readText).toHaveBeenCalledTimes(2);
});

it('hiding a backup does not clear a newer ordinary app copy of even the same text', async () => {
  let value = '';
  const port = { readText: vi.fn(() => Promise.resolve(value)), writeText: vi.fn((next: string) => { value = next; return Promise.resolve(); }) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  render(<><SecretBackup reveal={() => 'same value'} text={englishBackupText('seed')} /><CopyButton text="same value" label="Copy ordinary" /></>);
  await copyBackup();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy ordinary' })); await Promise.resolve(); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide seed' })); await Promise.resolve(); });
  expect(value).toBe('same value');
  expect(port.readText).not.toHaveBeenCalled();
  expect(port.writeText.mock.calls.map(([text]) => text)).toEqual(['same value', 'same value']);
});

it('a pending backup comparison cannot clear a newer app copy after its stale read completes', async () => {
  let value = '';
  let completeRead!: (value: string) => void;
  const read = new Promise<string>((resolve) => { completeRead = resolve; });
  const port = { readText: vi.fn(() => read), writeText: vi.fn((next: string) => { value = next; return Promise.resolve(); }) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  render(<><SecretBackup reveal={() => 'backup secret'} text={englishBackupText('seed')} /><CopyButton text="new invoice" label="Copy invoice" /></>);
  await copyBackup();
  fireEvent.click(screen.getByRole('button', { name: 'Hide seed' }));
  expect(port.readText).toHaveBeenCalledOnce();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invoice' })); await Promise.resolve(); });
  await act(async () => { completeRead('backup secret'); await read; });
  expect(value).toBe('new invoice');
  expect(port.readText).toHaveBeenCalledOnce();
  expect(port.writeText.mock.calls.map(([text]) => text)).toEqual(['backup secret', 'new invoice']);
});

it('a late hidden-backup write completion never takes cleanup ownership back from an ordinary copy', async () => {
  let value = '';
  let completeWrite!: () => void;
  const write = new Promise<void>((resolve) => { completeWrite = resolve; });
  const port = {
    readText: vi.fn(() => Promise.resolve(value)),
    writeText: vi.fn((next: string) => { value = next; return next === 'backup secret' ? write : Promise.resolve(); }),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  render(<><SecretBackup reveal={() => 'backup secret'} text={englishBackupText('seed')} /><CopyButton text="new invoice" label="Copy invoice" /></>);
  await copyBackup();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide seed' })); await Promise.resolve(); });
  expect(value).toBe('');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invoice' })); await Promise.resolve(); });
  const beforeCompletion = [...port.writeText.mock.calls];
  await act(async () => { completeWrite(); await write; });
  expect(value).toBe('new invoice');
  expect(port.writeText.mock.calls).toEqual(beforeCompletion);
  expect(screen.queryByText('backup secret')).toBeNull();
});


it.each(['hidden', 'unmounted'] as const)('does not dispatch a queued backup copy after its reveal is %s', async (end) => {
  let value = 'earlier copy';
  let completeClear!: () => void;
  const clear = new Promise<void>((resolve) => { completeClear = resolve; });
  const port = {
    readText: vi.fn(() => Promise.resolve(value)),
    writeText: vi.fn((next: string) => {
      if (next === '') return clear.then(() => { value = ''; });
      value = next;
      return Promise.resolve();
    }),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const panel = render(<SecretBackup reveal={() => 'queued backup secret'} text={englishBackupText('seed')} />);
  let earlierClear!: Promise<unknown>;
  await act(async () => {
    earlierClear = clearClipboardIfUnchanged((text) => text === 'earlier copy', port, () => true);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('');
  await copyBackup();
  expect(port.writeText).not.toHaveBeenCalledWith('queued backup secret');
  await act(async () => {
    if (end === 'hidden') fireEvent.click(screen.getByRole('button', { name: 'Hide seed' }));
    else panel.unmount();
    await Promise.resolve();
  });
  // Once the clear finishes there may be no user activation for a compensating read/clear.
  port.readText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  await act(async () => { completeClear(); await clear; await earlierClear; });
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('');
  expect(value).toBe('');
  expect(screen.queryByText('queued backup secret')).toBeNull();
});
