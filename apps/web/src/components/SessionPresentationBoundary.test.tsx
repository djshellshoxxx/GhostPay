// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AppShell } from '../AppShell';
import { notifyAppLock } from '../lib/appLock';
import type { ScanMatch } from '../lib/scanClient';
import { clearSession, importSession } from '../lib/session';
import { renderWith } from '../test/render';
import { useApp, type AppState } from '../state';

const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const match: ScanMatch = {
  chainId: 84532,
  announcement: { id: `${BLOCK}:3`, transactionHash: TX, blockNumber: 120n, blockHash: BLOCK,
    logIndex: 3, schemeId: 1n, caller: `0x${'1'.repeat(40)}`, stealthAddress: ADDRESS,
    ephemeralPublicKey: `0x02${'2'.repeat(64)}`, metadata: '0x' },
  stealthAddress: ADDRESS,
  metadata: { kind: 'native', token: '0x', netAmount: 2500000n, viewTag: 5 },
  viaRouter: true, tagMatches: true, receipt: 'verified',
} as unknown as ScanMatch;

const first = { spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) };
const second = { spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) };
afterEach(() => { cleanup(); clearSession(); history.replaceState(null, '', '/'); });

it.each(['rapid reinstall', 'manual lock', 'idle lock'] as const)('revokes cached data and the old writer on %s, including off-route', (transition) => {
  importSession(first);
  let active!: AppState;
  function Probe() {
    active = useApp();
    return <output>{[active.fragment, active.matches[0]?.stealthAddress, active.sweepTarget?.match.stealthAddress].join('|')}</output>;
  }
  renderWith(<AppShell order={['home', 'about']} mainPrelude={<Probe />} />);
  const write = (state: AppState): void => {
    state.setMatches([match]);
    state.selectForSweep({ match, chainId: match.chainId });
    state.setFragment('#gpi=v1.private-test');
    state.announce('previous private notice');
  };
  const original = active;
  act(() => { write(original); });
  expect(screen.getByRole('main').textContent).toContain(ADDRESS);
  const away = screen.getByRole('navigation').querySelector<HTMLButtonElement>('[data-view="about"]');
  if (away === null) throw new Error('About navigation is unavailable');
  fireEvent.click(away);
  history.replaceState(null, '', '/#gpi=v1.private-test');
  act(() => {
    if (transition === 'rapid reinstall') { importSession(second); importSession(first); }
    else notifyAppLock(transition === 'manual lock' ? 'manual' : 'idle');
    write(original);
  });
  expect(active.fragment).toBeUndefined();
  expect(active.sweepTarget).toBeUndefined();
  expect(active.matches).toEqual([]);
  expect(location.hash).toBe('');
  expect(document.body.textContent).not.toContain('previous private notice');
  act(() => { write(original); });
  expect(document.body.textContent).not.toContain(ADDRESS);
  expect(active.fragment).toBeUndefined();
  act(() => { active.setMatches([match]); });
  expect(active.matches).toEqual([match]);
});
