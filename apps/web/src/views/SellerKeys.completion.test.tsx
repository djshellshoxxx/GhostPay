// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '../lib/session';
import { clearSession, exportKeystore, generateSession, getSessionPublic, type SessionPublic } from '../lib/session';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import { makeServices, renderApp } from '../test/render';

const PASS = 'a long passphrase';
const SUCCESS = 'Keystore decrypted; keys are in memory.';
const DECRYPTING = 'Decrypting…';
const KEYSTORE_N = 1 << 14;

interface Fixture {
  readonly text: string;
  readonly meta: string;
  readonly signer: string;
}

beforeEach(() => {
  clearSession();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  setKeyVaultStoreForTests(undefined);
  clearSession();
});

/** Real valid encrypted fixture; session is wiped afterwards. Private material never leaves this module's locals. */
async function makeFixture(): Promise<Fixture> {
  generateSession();
  const pub = getSessionPublic()!;
  const text = await exportKeystore(PASS, { N: KEYSTORE_N });
  const meta = pub.metaAddress;
  const signer = pub.signerPublicKey;
  clearSession();
  return { text, meta, signer };
}

interface Hold {
  /** Resolves once the real import has finished installing keys and the wrapper is holding the return. */
  readonly installed: Promise<SessionPublic>;
  readonly release: () => void;
  readonly returned: () => SessionPublic | undefined;
  /** The unwrapped importKeystore captured BEFORE spying; calling it never enters the holding wrapper. */
  readonly real: typeof session.importKeystore;
}

/** Wraps REAL importKeystore: awaits the real import/install, then holds the returned value until release(). */
function holdRealImport(): Hold {
  const real = session.importKeystore;
  let release!: () => void;
  let installedResolve!: (p: SessionPublic) => void;
  let installedReject!: (e: unknown) => void;
  let result: SessionPublic | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const installed = new Promise<SessionPublic>((resolve, reject) => { installedResolve = resolve; installedReject = reject; });
  vi.spyOn(session, 'importKeystore').mockImplementation(async (text, passphrase, signal) => {
    try {
      const pub = await real(text, passphrase, signal);
      result = pub;
      installedResolve(pub);
      await gate;
      return pub;
    } catch (error) {
      installedReject(error);
      throw error;
    }
  });
  return { installed, release, returned: () => result, real };
}

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
  return user;
}

async function startImport(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.click(screen.getByText('Import an encrypted keystore'));
  await user.upload(screen.getByLabelText('Keystore file'), new File([text], 'keys.json', { type: 'application/json' }));
  await user.type(screen.getByLabelText('Passphrase'), PASS);
  await user.click(screen.getByRole('button', { name: 'Decrypt and load' }));
}

function keysRoot(): HTMLElement {
  return document.querySelector('section[aria-labelledby="keys-h"]') as HTMLElement;
}

function rootHasText(text: string): boolean {
  return within(keysRoot()).queryAllByText(text).length > 0;
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

describe('SellerKeys own keystore completion ownership', () => {
  it('own import completion announces success in SellerKeys and clears Decrypting after app.session effects flush', async () => {
    const fixture = await makeFixture();
    const hold = holdRealImport();
    const user = await open();
    try {
      await startImport(user, fixture.text);
      let installed!: SessionPublic;
      await act(async () => {
        installed = await hold.installed;
      });
      await flush();
      // While the wrapper holds its return, the real public identity is already loaded and visible.
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);
      expect(getSessionPublic()?.signerPublicKey === fixture.signer).toBe(true);
      expect(installed.metaAddress === fixture.meta).toBe(true);
      await waitFor(() => { expect(within(keysRoot()).queryAllByText(fixture.meta).length).toBeGreaterThan(0); }, { onTimeout: (error) => error });

      await act(async () => { hold.release(); await Promise.resolve(); await Promise.resolve(); });

      await waitFor(() => { expect(rootHasText(SUCCESS)).toBe(true); }, { onTimeout: (error) => error });
      expect(rootHasText(DECRYPTING)).toBe(false);
      expect(within(keysRoot()).queryByRole('alert')).toBeNull();
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);
    } finally {
      hold.release();
      await flush();
    }
  }, 30000);

  it('external replacement with different keys during the held return does not announce the old completion', async () => {
    const fixture = await makeFixture();
    const hold = holdRealImport();
    const user = await open();
    try {
      await startImport(user, fixture.text);
      await act(async () => { await hold.installed; });
      await flush();
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);

      let replacement = '';
      act(() => { replacement = generateSession().metaAddress; });
      await flush();
      expect(replacement === fixture.meta).toBe(false);

      await act(async () => { hold.release(); await Promise.resolve(); await Promise.resolve(); });
      await flush();

      expect(rootHasText(SUCCESS)).toBe(false);
      expect(getSessionPublic()?.metaAddress === replacement).toBe(true);
    } finally {
      hold.release();
      await flush();
    }
  }, 30000);

  it('replacement by a NEW session revision with the same public keys does not announce the old completion', async () => {
    const fixture = await makeFixture();
    const hold = holdRealImport();
    const user = await open();
    try {
      await startImport(user, fixture.text);
      await act(async () => { await hold.installed; });
      await flush();
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);

      // Re-install the identical keys through a second real import in a NEW session revision (no private bytes handled here).
      // Use the pre-spy original directly: the held wrapper must not see this call (it would block on its gate).
      let restoredMeta = '';
      await act(async () => {
        const again = await hold.real(fixture.text, PASS);
        restoredMeta = again.metaAddress;
      });
      await flush();
      expect(restoredMeta === fixture.meta).toBe(true);
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);

      await act(async () => { hold.release(); await Promise.resolve(); await Promise.resolve(); });
      await flush();

      expect(rootHasText(SUCCESS)).toBe(false);
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);
    } finally {
      hold.release();
      await flush();
    }
  }, 40000);

  it('unmounting while the completed import return is held announces nothing and keeps the installed identity', async () => {
    const fixture = await makeFixture();
    const hold = holdRealImport();
    const user = userEvent.setup();
    const view = renderApp(makeServices());
    try {
      await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Seller keys' }));
      await startImport(user, fixture.text);
      await act(async () => { await hold.installed; });
      await flush();
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);

      view.unmount();
      await act(async () => { hold.release(); await Promise.resolve(); await Promise.resolve(); });
      await flush();

      expect(document.querySelector('section[aria-labelledby="keys-h"]')).toBeNull();
      expect(screen.queryAllByText(SUCCESS).length).toBe(0);
      expect(getSessionPublic()?.metaAddress === fixture.meta).toBe(true);
    } finally {
      hold.release();
      await flush();
    }
  }, 30000);
});
