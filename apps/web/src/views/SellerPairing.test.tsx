// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSellerPairing, parseSellerPairing } from '../lib/sellerPairing';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { makeServices, renderApp } from '../test/render';

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
});
