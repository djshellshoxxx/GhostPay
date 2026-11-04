// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSellerPairing, parseSellerPairing } from '../lib/sellerPairing';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { generateSession as generateUnsavedSession } from '../lib/session';
import { makeServices, renderApp } from '../test/render';
import { SellerPairing, pairingChainIds } from './SellerPairing';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'mediaDevices'); clearSession(); });

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}
function otherDevice(): string {
  const p = generateSession();
  const text = exportSellerPairing(p, [11155111]);
  clearSession();
  return text;
}
const pairing = (): HTMLElement => document.getElementById('pairing-h')!.closest('section')!;

describe('SellerPairing', () => {
  it('exports parseable public config as QR text, copy and file, and never starts the camera', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const me = generateWaivedSession();
    await open();
    const box = within(pairing()).getByLabelText<HTMLTextAreaElement>('Same config as text');
    expect(parseSellerPairing(box.value)).toMatchObject({ metaAddress: me.metaAddress, signerPublicKey: me.signerPublicKey });
    expect(within(pairing()).getByRole('button', { name: 'Copy config text' })).toBeTruthy();
    expect(within(pairing()).getByRole('button', { name: 'Download config file' })).toBeTruthy();
    expect(pairing().querySelector('[data-qr-kind="device"]')).not.toBeNull();
    expect(within(pairing()).getByText('Moving secret keys is separate')).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('previews a pasted config from another device without changing the loaded keys', async () => {
    const incoming = otherDevice();
    const me = generateWaivedSession();
    const user = await open();
    await user.click(within(pairing()).getByLabelText('Or paste QR text'));
    await user.paste(incoming);
    await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
    expect(await within(pairing()).findByText(/differ from the keys loaded/)).toBeTruthy();
    expect(getSessionPublic()).toEqual(me);
  });

  it('says the keys match when the same config comes back', async () => {
    const me = generateWaivedSession();
    const user = await open();
    await user.click(within(pairing()).getByLabelText('Or paste QR text'));
    await user.paste(exportSellerPairing(me, []));
    await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
    expect(await within(pairing()).findByText(/match the keys loaded/)).toBeTruthy();
  });

  it('works with no keys loaded (import preview only, no export)', async () => {
    const incoming = otherDevice();
    const user = await open();
    expect(within(pairing()).queryByLabelText('Same config as text')).toBeNull();
    await user.click(within(pairing()).getByLabelText('Or paste QR text'));
    await user.paste(incoming);
    await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
    expect(await within(pairing()).findByText(/No keys are loaded here/)).toBeTruthy();
    expect(within(pairing()).getByText(/confirm them out of band/)).toBeTruthy();
    expect(within(pairing()).getByText(/No keys are loaded here/).closest('.notice')?.classList.contains('notice-warn')).toBe(true);
    expect(getSessionPublic()).toBeUndefined();
  });

  it('refuses wrong kind, wrong version and tampered text with no preview', async () => {
    const good = otherDevice();
    generateWaivedSession();
    const user = await open();
    const bads = [
      JSON.stringify({ format: 'ghostpay-keystore', v: 1 }),
      good.replace('"v":1', '"v":2'),
      good.replace('"chainIds":[11155111]', '"chainIds":[1]'),
    ];
    for (const bad of bads) {
      await user.clear(within(pairing()).getByLabelText('Or paste QR text'));
      fireEvent.change(within(pairing()).getByLabelText('Or paste QR text'), { target: { value: bad } });
      await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
      expect(await within(pairing()).findByText('That QR text was not accepted. Check it and try again.')).toBeTruthy();
      expect(within(pairing()).getByText(/not a supported public seller config/)).toBeTruthy();
      expect(within(pairing()).queryByText('Received config (untrusted preview)')).toBeNull();
    }
  });

  it('refuses an oversize config file', async () => {
    generateWaivedSession();
    await open();
    const input = within(pairing()).getByLabelText<HTMLInputElement>('Public config file');
    const file = new File(['x'.repeat(5000)], 'big.json', { type: 'application/json' });
    act(() => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(await within(pairing()).findByText(/too large or unreadable/)).toBeTruthy();
  });

  it('previews a config file', async () => {
    const incoming = otherDevice();
    generateWaivedSession();
    await open();
    const input = within(pairing()).getByLabelText<HTMLInputElement>('Public config file');
    const file = new File([incoming], 'c.json', { type: 'application/json' });
    act(() => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(await within(pairing()).findByText('Received config (untrusted preview)')).toBeTruthy();
  });

  it('keeps the pairing export behind the backup gate for unsaved keys', async () => {
    generateUnsavedSession();
    await open();
    expect(screen.queryByLabelText('Same config as text')).toBeNull();
    expect(document.querySelector('[data-qr-kind="device"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy config text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download config file' })).toBeNull();
    expect(document.getElementById('pairing-h')).toBeNull();
  });

  it('drops a preview when the loaded keys change', async () => {
    const incoming = otherDevice();
    generateWaivedSession();
    const user = await open();
    await user.click(within(pairing()).getByLabelText('Or paste QR text'));
    await user.paste(incoming);
    await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
    expect(await within(pairing()).findByText('Received config (untrusted preview)')).toBeTruthy();
    act(() => { clearSession(); generateWaivedSession(); });
    expect(within(pairing()).queryByText('Received config (untrusted preview)')).toBeNull();
  });

  /** A File whose read stays pending until released, to test late completions. */
  function deferredFile(content: string): { file: File; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const file = new File([content], 'late.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => { await gate; return content; } });
    return { file, release };
  }
  const choose = (file: File): void => {
    const input = within(pairing()).getByLabelText<HTMLInputElement>('Public config file');
    act(() => { fireEvent.change(input, { target: { files: [file] } }); });
  };

  it('ignores a delayed file read that finishes after the keys changed', async () => {
    const incoming = otherDevice();
    generateWaivedSession();
    await open();
    const late = deferredFile(incoming);
    choose(late.file);
    act(() => { clearSession(); generateWaivedSession(); });
    await act(async () => { late.release(); await Promise.resolve(); await Promise.resolve(); });
    expect(within(pairing()).queryByText('Received config (untrusted preview)')).toBeNull();
    expect(within(pairing()).queryByRole('button', { name: 'Copy received meta-address' })).toBeNull();
  });

  it('ignores a delayed file read that finishes after a newer paste', async () => {
    const older = otherDevice();
    const newer = otherDevice();
    generateWaivedSession();
    const user = await open();
    const late = deferredFile(older);
    choose(late.file);
    await user.click(within(pairing()).getByLabelText('Or paste QR text'));
    await user.paste(newer);
    await user.click(within(pairing()).getByRole('button', { name: 'Use pasted text' }));
    expect(await within(pairing()).findByText('Received config (untrusted preview)')).toBeTruthy();
    await act(async () => { late.release(); await Promise.resolve(); await Promise.resolve(); });
    expect(within(pairing()).getByText(parseSellerPairing(newer).metaAddress)).toBeTruthy();
    expect(within(pairing()).queryByText(parseSellerPairing(older).metaAddress)).toBeNull();
  });

  it('ignores a delayed file read that finishes after a newer file choice', async () => {
    const older = otherDevice();
    const newer = otherDevice();
    generateWaivedSession();
    await open();
    const first = deferredFile(older);
    const second = deferredFile(newer);
    choose(first.file);
    choose(second.file);
    await act(async () => { second.release(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { first.release(); await Promise.resolve(); await Promise.resolve(); });
    expect(within(pairing()).getByText(parseSellerPairing(newer).metaAddress)).toBeTruthy();
    expect(within(pairing()).queryByText(parseSellerPairing(older).metaAddress)).toBeNull();
  });

  it('exports safe-integer chain ids above 2**32 from settings', () => {
    expect(pairingChainIds({ '1099511627776': 'https://rpc.test', '5': 'https://rpc.test', '9999999999999999': 'https://rpc.test' })).toEqual([5, 1099511627776]);
  });

  it('shows an error instead of silently hiding the export when it cannot be built', () => {
    const p = generateSession();
    render(<SellerPairing session={p} chainIds={[0.5]} />);
    expect(screen.getByText(/could not be prepared/)).toBeTruthy();
    expect(screen.queryByLabelText('Same config as text')).toBeNull();
  });
});
