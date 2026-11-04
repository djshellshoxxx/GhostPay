// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { I18nProvider } from '../i18n/context';
import { SOURCE_CATALOG, type MessageKey } from '../i18n/catalog';
import { NEUTRAL_KEYS, SECURITY_KEYS } from '../i18n/securityKeys';
import es from '../../locales/es.json';
import { clearSession, generateSession } from '../lib/session';
import { makeServices, renderWith } from '../test/render';

const draft = (key: string): string => (es.messages as Record<string, string>)[key] ?? `MISSING ${key}`;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function openScanIn(locale: string): Promise<void> {
  const user = userEvent.setup();
  renderWith(<I18nProvider initialPreference={locale} target={document.documentElement}><App /></I18nProvider>, makeServices());
  await user.click(within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
}

describe('Scan localization (neutral vs critical)', () => {
  it('classifies every scan.* key, and critical scan text is never marked neutral', () => {
    const keys = Object.keys(SOURCE_CATALOG.messages).filter((k) => k.startsWith('scan.'));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) expect(NEUTRAL_KEYS.has(k as MessageKey) !== SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
    for (const k of ['scan.rpcPrivacy.body', 'scan.intro', 'scan.error.backlog', 'scan.match.claimedRouter', 'scan.tags.deleteConfirm']) expect(SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
  });

  it('shows the Spanish draft for neutral labels when no keys are loaded', async () => {
    await openScanIn('es');
    expect(await screen.findByRole('heading', { level: 2, name: draft('scan.title') })).toBeTruthy();
    expect(screen.getByText(draft('scan.needKeys'))).toBeTruthy();
    expect(screen.getByRole('button', { name: draft('scan.goSeller') })).toBeTruthy();
  });

  it('keeps critical privacy text in English in a draft locale while neutral controls translate', async () => {
    generateSession();
    await openScanIn('es');
    expect(await screen.findByRole('button', { name: draft('scan.start') })).toBeTruthy();
    expect(screen.getByLabelText(draft('scan.startBlock'))).toBeTruthy();
    expect(screen.getByText('RPC privacy')).toBeTruthy();
    expect(screen.getByText(/Your RPC provider sees your IP address/)).toBeTruthy();
    expect(screen.getByText(/The worker gets public logs and your viewing key/)).toBeTruthy();
  });
});
