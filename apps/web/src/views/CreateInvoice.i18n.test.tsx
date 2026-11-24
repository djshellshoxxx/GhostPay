// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { clearSession } from '../lib/session';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { ServicesContext } from '../lib/services';
import { AppContext, type AppState } from '../state';
import { generateWaivedSession } from '../test/keys';
import { makeServices } from '../test/render';
import { CreateInvoice } from './CreateInvoice';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

function mount(preference: string) {
  const app: AppState = {
    view: 'create', setView: () => undefined, settings: DEFAULT_SETTINGS, updateSettings: () => true,
    session: generateWaivedSession(), fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: vi.fn(),
  };
  return render(
    <I18nProvider initialPreference={preference} target={null}>
      <ServicesContext.Provider value={makeServices()}><AppContext.Provider value={app}><CreateInvoice /></AppContext.Provider></ServicesContext.Provider>
    </I18nProvider>,
  );
}

describe('Create invoice localization', () => {
  it('shows neutral labels from the Spanish draft catalog but keeps amount, fee and link disclosures in English', async () => {
    mount('es');
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Crear factura' })).toBeTruthy(); });
    expect(screen.getByLabelText('Cadena')).toBeTruthy();
    expect(screen.getByLabelText('Descripción del concepto 1')).toBeTruthy();
    // Critical (amounts, fees, consent) stays reviewed English until native review.
    expect(screen.getByLabelText('Token amount')).toBeTruthy();
    expect(screen.getByLabelText('Who pays the 0.25 % checkout fee')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create invoice link' })).toBeTruthy();
  });

  it('renders English text from the catalog by default', () => {
    mount('en');
    expect(screen.getByRole('heading', { name: 'Create invoice' })).toBeTruthy();
    expect(screen.getByLabelText('Item 1 description')).toBeTruthy();
  });
});
