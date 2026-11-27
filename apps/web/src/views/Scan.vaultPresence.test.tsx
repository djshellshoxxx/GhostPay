// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, revealViewingKey } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import type { Services } from '../lib/services';
import { InlineWorker } from '../test/inlineWorker';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, memoryCheckpoints, renderApp } from '../test/render';

// LATE-M1: a scan page that cannot open IndexedDB blocks the checkpoint only where a reconciliation vault may exist.
const CHAIN_ID = 84532;
const PERSISTENCE = /Payment observations could not be saved/;
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });

/** The blinded slot beside the scan checkpoints, derived here independently so the stored format is pinned. */
function presenceSlotName(keyId: string): string {
  const viewingKey = revealViewingKey();
  try {
    const info = utf8ToBytes(`GhostPay/reconciliation-presence/v1/slot|${String(CHAIN_ID)}|${keyId}`);
    return `ghostpay.reconciliation.presence.v1.${bytesToHex(hkdf(sha256, viewingKey, undefined, info, 32))}`;
  } finally { viewingKey.fill(0); }
}

/** IndexedDB that never opens: every reconciliation read fails before anything about the stored vault is known. */
function failIndexedDb(): void {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: { onerror?: () => void } = {};
      queueMicrotask(() => { request.onerror?.(); });
      return request;
    },
  });
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); clearSession(); vi.unstubAllGlobals(); });

async function scanWithBrokenStorage(presence: 'absent' | 'present' | undefined): Promise<{ readonly saved: unknown }> {
  const pub = generateSession();
  const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [CHAIN_ID]: 'https://rpc.test' } }));
  const slot = presenceSlotName(keyId);
  if (presence !== undefined) window.localStorage.setItem(slot, presence);
  failIndexedDb();
  const checkpoints = memoryCheckpoints();
  const rpc = chainWithLogs(CHAIN_ID, 500, []);
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: loaded, checkpoints, createScanWorker: () => new InlineWorker(), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '100');
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
  // The marker is never rewritten by a failed read.
  expect(window.localStorage.getItem(slot)).toBe(presence ?? null);
  return { saved: checkpoints.load(CHAIN_ID, keyId) };
}

describe('scan checkpoints when encrypted reconciliation storage cannot open (LATE-M1)', () => {
  it('saves the checkpoint when this seller scope has no reconciliation vault', async () => {
    const { saved } = await scanWithBrokenStorage('absent');
    expect(saved).toBeDefined();
    expect(screen.queryByText(PERSISTENCE)).toBeNull();
  });

  it.each([
    ['a vault may exist', 'present'],
    ['nothing was recorded', undefined],
  ] as const)('withholds the checkpoint and says so when %s', async (_label, presence) => {
    const { saved } = await scanWithBrokenStorage(presence);
    expect(saved).toBeUndefined();
    expect(screen.getByText(PERSISTENCE)).toBeTruthy();
  });
});
