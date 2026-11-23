// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, readAttempts, type AttemptStorage } from './duplicateAttemptJournal';
import { MockWallet } from '../test/mockWallet';
import { connectWallet, sendViaWallet, WalletBroadcastError, type WalletInfo, type TxRequest } from './wallet';

const tx: TxRequest = { to: `0x${'1'.repeat(40)}`, data: '0x', value: 0n };
const expectedHash = `0x${'9'.repeat(64)}`;
const info = (provider: WalletInfo['provider']): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('wallet journal post-broadcast read-back failures', () => {
  it.each(['throws', 'stale-read'] as const)(
    'preserves the returned hash when the journal read-back %s',
    async (failure) => {
      const provider = new MockWallet();
      const session = await connectWallet(info(provider), 84532);
      const persisted = new Map<string, string>();
      let sent = false;
      let lastPending: string | undefined;
      let postSendReads = 0;
      const storage: AttemptStorage = {
        getItem: (key) => {
          if (sent && key === ATTEMPT_JOURNAL_KEY) {
            postSendReads += 1;
            if (failure === 'throws') throw new Error('read-back denied');
            return lastPending ?? null;
          }
          return persisted.get(key) ?? null;
        },
        setItem: (key, value) => {
          if (!sent && key === ATTEMPT_JOURNAL_KEY) lastPending = value;
          persisted.set(key, value);
        },
      };
      const wrapped: WalletInfo['provider'] = {
        request: async (args) => {
          if (args.method === 'eth_sendTransaction') sent = true;
          return provider.request(args);
        },
      };
      const wrappedSession = { ...session, wallet: info(wrapped) };

      const error = await sendViaWallet(wrappedSession, tx, undefined, { kind: 'transaction', storage }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WalletBroadcastError);
      expect(error).toMatchObject({ hash: expectedHash, outcome: { phase: 'verification-incomplete', hash: expectedHash } });
      expect(postSendReads).toBeGreaterThan(0);
      expect(provider.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);

      // Restore reads: the journal must prevent an implicit resend, whether it
      // retained an unresolved attempt or actually stored the submitted hash.
      sent = false;
      expect(readAttempts(storage)).toHaveLength(1);
      await expect(sendViaWallet(wrappedSession, tx, undefined, { kind: 'transaction', storage })).rejects.toThrow(/previous wallet attempt/);
      expect(provider.calls.filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(1);
    },
  );
});
