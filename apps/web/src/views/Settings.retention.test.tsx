// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROOF_RETENTION_KEY, RETENTION_KEY } from '../lib/metadataRetention';
import { SETTINGS_KEY } from '../lib/settings';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

// #287 item 4: no preview is on screen while Settings is shown, so Settings offers the two preferences only, says where
// previews are closed now, and stays independent of the settings form.
describe('Settings retention preferences', () => {
  it('offers both default-off preferences without a cleanup action that could never apply here', async () => {
    await open();
    const invoice = screen.getByLabelText<HTMLSelectElement>('Clear generated invoice previews automatically');
    const proof = screen.getByLabelText<HTMLSelectElement>('Close payment proof previews automatically');
    expect(invoice.value).toBe('0');
    expect(proof.value).toBe('0');
    expect(screen.queryByRole('button', { name: 'Preview screen-data cleanup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview proof cleanup' })).toBeNull();
    expect(screen.getAllByText(/use the preview button on the page that shows them/)).toHaveLength(2);
  });

  it('saves each preference separately and immediately, and announces the result', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Clear generated invoice previews automatically'), 'After 15 minutes');
    expect(window.localStorage.getItem(RETENTION_KEY)).toBe('{"delay":900000}');
    expect(window.localStorage.getItem(PROOF_RETENTION_KEY)).toBeNull();
    const saved = screen.getByText('Preview retention preference saved.');
    expect(saved.closest('[aria-live="polite"]')).not.toBeNull();
    await user.selectOptions(screen.getByLabelText('Close payment proof previews automatically'), 'After 1 hour');
    expect(window.localStorage.getItem(PROOF_RETENTION_KEY)).toBe('{"delay":3600000}');
    expect(window.localStorage.getItem(RETENTION_KEY)).toBe('{"delay":900000}');
  });

  it('keeps the settings form and the retention preferences independent', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(window.localStorage.getItem(SETTINGS_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(RETENTION_KEY)).toBeNull();
    expect(window.localStorage.getItem(PROOF_RETENTION_KEY)).toBeNull();
    expect(Object.keys(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as object)).not.toContain('delay');
  });
});
