// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../i18n/context';
import { SOURCE_CATALOG, type MessageKey } from '../i18n/catalog';
import { NEUTRAL_KEYS, SECURITY_KEYS } from '../i18n/securityKeys';
import ar from '../../locales/ar.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';
import { CameraImporter } from './CameraImporter';

// Catalogs load by dynamic import; allow for a slow machine.
configure({ asyncUtilTimeout: 5000 });

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  cleanup();
  if (originalMediaDevices === undefined) Reflect.deleteProperty(navigator, 'mediaDevices');
  else Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  vi.restoreAllMocks();
});

const drafts = { es, ar, ja } as const;
/** Draft text for a key; fails loudly when the catalog has no entry, so a missing key cannot pass as English. */
function draft(locale: keyof typeof drafts, key: string): string {
  const text = (drafts[locale].messages as Record<string, string>)[key];
  expect(text, `${locale} catalog has ${key}`).toBeTypeOf('string');
  return text ?? '';
}
const english = (key: string): string => {
  const text = (SOURCE_CATALOG.messages as Record<string, string>)[key];
  expect(text, `en catalog has ${key}`).toBeTypeOf('string');
  return text ?? '';
};

const NEUTRAL = [
  'camera.scan', 'camera.stop', 'camera.pasteLabel', 'camera.usePasted', 'camera.status.requesting', 'camera.status.active', 'camera.status.closed', 'camera.status.stopped', 'camera.status.enterFirst',
  'camera.status.hidden', 'camera.switch', 'camera.file.label', 'camera.file.reading',
  'camera.multipart.progressLabel', 'camera.multipart.progress', 'camera.multipart.missing', 'camera.multipart.missingMore', 'camera.multipart.startOver', 'camera.multipart.restarted', 'camera.multipart.badPart', 'camera.multipart.hiddenReset',
] as const;
// Consent outcomes, rejected input and transfer-integrity verdicts need reviewed translations.
const CRITICAL = [
  'camera.consent', 'camera.preview', 'camera.status.tooLarge', 'camera.status.accepted', 'camera.status.rejected', 'camera.status.unusable', 'camera.error.denied', 'camera.error.unavailable', 'camera.error.scanFailed', 'camera.error.startFailed',
  'camera.error.notFound', 'camera.error.inUse', 'camera.error.insecure', 'camera.file.tooLarge', 'camera.file.notImage', 'camera.file.unreadable', 'camera.file.noQr',
  'camera.multipart.otherTransfer', 'camera.multipart.conflict', 'camera.multipart.integrity', 'camera.multipart.expired',
] as const;

function renderIn(locale: string, onText: (t: string) => boolean = () => true): void {
  render(
    <I18nProvider initialPreference={locale} target={document.documentElement}>
      <CameraImporter label="Import a QR" onText={onText} />
    </I18nProvider>,
  );
}
function mockCamera(getUserMedia: () => Promise<MediaStream>): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
}

describe('CameraImporter localization', () => {
  it('classifies every camera.* key: consent, preview, errors and outcomes are security; plain controls are neutral', () => {
    const keys = Object.keys(SOURCE_CATALOG.messages).filter((k) => k.startsWith('camera.'));
    expect(keys.length).toBe(NEUTRAL.length + CRITICAL.length);
    for (const k of keys) expect(NEUTRAL_KEYS.has(k as MessageKey) !== SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
    for (const k of CRITICAL) expect(SECURITY_KEYS.has(k as MessageKey), k).toBe(true);
    for (const k of NEUTRAL) expect(NEUTRAL_KEYS.has(k as MessageKey), k).toBe(true);
  });

  it.each(['es', 'ja', 'ar'] as const)('shows %s draft labels for neutral controls and keeps the consent text in English', async (locale) => {
    renderIn(locale);
    expect(await screen.findByRole('button', { name: draft(locale, 'camera.scan') }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByLabelText(draft(locale, 'camera.pasteLabel'))).toBeTruthy();
    expect(screen.getByRole('button', { name: draft(locale, 'camera.usePasted') })).toBeTruthy();
    // Camera consent is security-critical: an unreviewed locale shows the English source, never the draft.
    expect(screen.getByText(english('camera.consent'))).toBeTruthy();
    expect(screen.queryByText(draft(locale, 'camera.consent'))).toBeNull();
    expect(screen.getByLabelText(english('camera.preview'))).toBeTruthy();
    expect(screen.getByLabelText(draft(locale, 'camera.file.label'))).toBeTruthy();
  });

  it('translates the neutral camera status while the request is pending', async () => {
    mockCamera(() => new Promise<MediaStream>(() => undefined));
    const user = userEvent.setup();
    renderIn('es');
    await user.click(await screen.findByRole('button', { name: draft('es', 'camera.scan') }, { timeout: 5000 }));
    expect(screen.getByRole('status').textContent).toBe(draft('es', 'camera.status.requesting'));
    await user.click(screen.getByRole('button', { name: draft('es', 'camera.stop') }));
    expect(screen.getByRole('status').textContent).toBe(draft('es', 'camera.status.stopped'));
  });

  it('keeps a camera-denied error in English in a draft locale (consent outcome)', async () => {
    mockCamera(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
    const user = userEvent.setup();
    renderIn('es');
    await user.click(await screen.findByRole('button', { name: draft('es', 'camera.scan') }, { timeout: 5000 }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(english('camera.error.denied')); });
    expect(screen.getByRole('status').textContent).not.toBe(draft('es', 'camera.error.denied'));
  });

  it('keeps outcome text of a pasted import in English in a draft locale', async () => {
    const user = userEvent.setup();
    renderIn('ja', () => true);
    await user.type(await screen.findByLabelText(draft('ja', 'camera.pasteLabel'), undefined, { timeout: 5000 }), 'payload');
    await user.click(screen.getByRole('button', { name: draft('ja', 'camera.usePasted') }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(english('camera.status.accepted')); });
  });

  it('shows pasted addresses left-to-right under Arabic while the document turns right-to-left', async () => {
    const user = userEvent.setup();
    renderIn('ar');
    const box = await screen.findByLabelText(draft('ar', 'camera.pasteLabel'), undefined, { timeout: 5000 });
    await waitFor(() => { expect(document.documentElement.getAttribute('dir')).toBe('rtl'); });
    const address = '0x52908400098527886E0F7030069857D2E4169EE7';
    await user.type(box, address);
    expect((box as HTMLTextAreaElement).value).toBe(address);
    expect(box.getAttribute('dir')).toBe('ltr');
  });
});


it('switches the current pending-camera status language and can cancel and retry without refresh', async () => {
  mockCamera(() => new Promise<MediaStream>(() => undefined));
  function Controls() {
    const i18n = useI18n();
    return <><button type="button" onClick={() => { i18n.setPreference('es'); }}>Spanish</button><CameraImporter label="Import a QR" onText={() => true} /></>;
  }
  render(<I18nProvider initialPreference="en"><Controls /></I18nProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: english('camera.scan') }));
  expect(screen.getByRole('status').textContent).toBe(english('camera.status.requesting'));
  await user.click(screen.getByRole('button', { name: 'Spanish' }));
  await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(draft('es', 'camera.status.requesting')); });
  await user.click(screen.getByRole('button', { name: draft('es', 'camera.stop') }));
  await user.click(screen.getByRole('button', { name: draft('es', 'camera.scan') }));
  expect(screen.getByRole('status').textContent).toBe(draft('es', 'camera.status.requesting'));
  expect(screen.getByText(english('camera.consent'))).toBeTruthy();
});
