// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { I18nProvider } from '../i18n/context';
import { renderWith } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Pay localization', () => {
  it('translates neutral Pay labels in a draft locale while critical privacy warnings stay in English', async () => {
    const user = userEvent.setup();
    renderWith(
      <I18nProvider initialPreference="es" target={document.documentElement}>
        <App />
      </I18nProvider>,
    );
    await waitFor(() => { expect(document.documentElement.getAttribute('lang')).toBe('es'); });
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /^Pay$/ }));

    // Neutral label: the drafted es text is allowed.
    expect(await screen.findByRole('heading', { name: 'Pagar una factura' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Pay an invoice' })).toBeNull();
    expect(screen.getByLabelText('Pegar un enlace de factura')).toBeTruthy();
    // Critical privacy warning: no reviewed translation yet, so the English source text is shown.
    expect(screen.getByText(/Pasting is safer than clicking: a browser may keep a clicked invoice URL/)).toBeTruthy();
    expect(screen.getByText('The link is read in this page only. It is never sent to a server.')).toBeTruthy();
  });
});
