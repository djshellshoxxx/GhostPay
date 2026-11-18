// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import es from '../../locales/es.json';
import ar from '../../locales/ar.json';
import { I18nProvider, useI18n } from '../i18n/context';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import { createTranslator } from '../i18n/translator';
import { QR_KIND_ORDER, QR_KINDS, localizedQrKind } from '../lib/qrKinds';
import { QrFrame } from './QrFrame';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('QR render-time localization', () => {
  it('keeps source copy and immutable handling rules aligned with the kind registry', () => {
    for (const kind of QR_KIND_ORDER) expect(localizedQrKind(kind, SOURCE_TRANSLATOR.t)).toEqual(QR_KINDS[kind]);
    const translator = createTranslator('ar', [{ locale: 'ar', messages: ar.messages }]);
    for (const kind of QR_KIND_ORDER) expect(localizedQrKind(kind, translator.t)).toEqual(QR_KINDS[kind]);
  });

  it('changes control language without rebuilding the QR payload or selected part', async () => {
    const user = userEvent.setup();
    let changeLanguage: ((locale: string) => void) | undefined;
    function Capture(): React.ReactNode { changeLanguage = useI18n().setPreference; return null; }
    const { container } = render(<I18nProvider initialPreference="en" onIssue={() => undefined}><Capture /><QrFrame kind="proof" text="signed-exact-bytes" chunks={['part-1-exact', 'part-2-exact']} caption="Receipt fixture" /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    const path = container.querySelector('.qr-fg');
    const d = path?.getAttribute('d');
    act(() => { changeLanguage?.('es'); });
    expect(await screen.findByRole('button', { name: es.messages['qrFrame.previous'] })).toBeTruthy();
    expect(screen.getByText('PROOF')).toBeTruthy();
    expect(container.querySelector('.qr-fg')).toBe(path);
    expect(path?.getAttribute('d')).toBe(d);
    expect(screen.getByRole('button', { name: es.messages['qrFrame.next'] }).hasAttribute('disabled')).toBe(true);
    act(() => { changeLanguage?.('ar'); });
    await waitFor(() => { expect(document.documentElement.dir).toBe('rtl'); });
    expect(await screen.findByRole('button', { name: ar.messages['qrFrame.previous'] })).toBeTruthy();
    expect(container.querySelector('.qr-fg')).toBe(path);
    expect(path?.getAttribute('d')).toBe(d);
  });
});
