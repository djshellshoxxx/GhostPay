// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { parsePublicMetaQr } from '../../lib/qrPayload';
import { clearSession, generateSession } from '../../lib/session';
import { generateWaivedSession } from '../../test/keys';
import { makeServices, renderApp } from '../../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function open(): Promise<void> {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Public registry' }));
}

describe('Registry public meta-address QR export', () => {
  it('shows a shareable QR whose text round-trips through the strict import parser', async () => {
    const me = generateWaivedSession();
    await open();
    const user = userEvent.setup();
    const panel = document.getElementById('reg-export-h')!.closest('section')!;
    const frame = panel.querySelector('[data-qr-kind="shareable"]');
    expect(frame).not.toBeNull();
    expect(within(panel).getByText(/reveals no private key/)).toBeTruthy();
    // Parse what the page actually offers (copied text), not the fixture.
    await user.click(within(panel).getByRole('button', { name: 'Copy as text' }));
    const copied = await navigator.clipboard.readText();
    expect(parsePublicMetaQr(copied)).toBe(me.metaAddress);
    expect(within(panel).getByRole('img').getAttribute('aria-label')).toBe('Public meta-address for the registry');
  });

  it('is absent without keys', async () => {
    await open();
    expect(document.getElementById('reg-export-h')).toBeNull();
  });

  it('is behind the backup gate for unsaved keys', async () => {
    generateSession();
    await open();
    expect(document.getElementById('reg-export-h')).toBeNull();
  });
});
