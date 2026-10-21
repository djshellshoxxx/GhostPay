// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../lib/services';
import { OBSERVERS, bpsToPercent } from '../components/Disclosure';
import { FAKE_FEE_RECIPIENT, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

async function openAbout(services: Services): Promise<void> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'About and privacy' }));
}

describe('About / Privacy', () => {
  it('shows the observer table from the threat model, limits and verification steps', async () => {
    await openAbout(makeServices());
    const table = screen.getByRole('table', { name: 'Who learns what' });
    expect(within(table).getAllByRole('row')).toHaveLength(OBSERVERS.length + 1);
    expect(within(table).getByRole('rowheader', { name: 'Static host / CDN' })).toBeTruthy();
    expect(within(table).getByText('The URL fragment, keys, invoice contents.')).toBeTruthy();
    expect(screen.getByText(/does not hide the payer, the amount/)).toBeTruthy();
    expect(screen.getByText(/bearer secret/)).toBeTruthy();
    expect(screen.getByText(/No external audit/)).toBeTruthy();
    expect(screen.getByText('How to verify this release')).toBeTruthy();
  });

  it('with no manifest every chain says "payments disabled" and no recipient is ever shown', async () => {
    await openAbout(makeServices());
    const disabled = await screen.findAllByText(/payments disabled on this chain/);
    expect(disabled).toHaveLength(7);
    expect(document.body.textContent).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it('shows the recipient from the loaded manifest ONLY, with the mandatory copy', async () => {
    await openAbout(makeServices({ loadManifest: (id) => Promise.resolve(id === 84532 ? { status: 'loaded', manifest: fakeManifest(84532) } : { status: 'absent' }) }));
    expect(await screen.findByText(FAKE_FEE_RECIPIENT)).toBeTruthy();
    expect(screen.getByText(FAKE_ROUTER)).toBeTruthy();
    const items = screen.getAllByText(/GhostPay charges 0\.25 % on payments made through its checkout contract\. The fee goes to/);
    expect(items).toHaveLength(7);
    expect(screen.getAllByText(/payments disabled on this chain/)).toHaveLength(1);
    expect(screen.getByText(/carries no signature; this app does not verify manifest signatures/)).toBeTruthy();
    expect(screen.getAllByText(/Paying the stealth address directly costs no GhostPay fee\./)).toHaveLength(7);
  });

  it('an invalid manifest keeps payments disabled', async () => {
    await openAbout(makeServices({ loadManifest: () => Promise.resolve({ status: 'invalid', reason: 'x' }) }));
    expect((await screen.findAllByText(/payments disabled on this chain/)).length).toBe(7);
  });
});

describe('Home', () => {
  it('shows a release hash computed from the entry script, or says it is unavailable', async () => {
    const script = document.createElement('script');
    script.type = 'module';
    script.setAttribute('src', './assets/index-1.js');
    document.head.appendChild(script);
    try {
      renderApp(makeServices({ fetchFn: () => Promise.resolve(new Response('abc')) }));
      expect(await screen.findByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBeTruthy();
    } finally {
      script.remove();
    }
  });

  it('is honest when the hash cannot be computed', async () => {
    renderApp(makeServices());
    expect(await screen.findByText(/not available in this environment/)).toBeTruthy();
    const script = document.createElement('script');
    script.type = 'module';
    script.setAttribute('src', './assets/index-1.js');
    document.head.appendChild(script);
    try {
      renderApp(makeServices({ fetchFn: () => Promise.reject(new Error('offline')) }));
      expect((await screen.findAllByText(/not available in this environment/)).length).toBeGreaterThan(0);
    } finally {
      script.remove();
    }
  });

  it('formats basis points as percent', () => {
    expect(bpsToPercent(25n)).toBe('0.25');
    expect(bpsToPercent(300n)).toBe('3');
    expect(bpsToPercent(50n)).toBe('0.5');
  });
});
