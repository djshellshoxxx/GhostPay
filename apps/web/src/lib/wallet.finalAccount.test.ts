import { describe, expect, it, vi } from 'vitest';
import { createTestLocks } from '../test/locks';
import { MOCK_ACCOUNT, MockWallet } from '../test/mockWallet';
import { ATTEMPT_JOURNAL_KEY, readAttempts, type AttemptStorage, type WalletAttempt } from './duplicateAttemptJournal';
import { connectWallet, sendViaWallet, signTypedDataViaWallet, type TxRequest, type WalletSession } from './wallet';

const OTHER_ACCOUNT = '0x6666666666666666666666666666666666666666';
const HASH = `0x${'9'.repeat(64)}`;
const SIGNATURE = `0x${'1'.repeat(130)}`;
const TX: TxRequest = { to: '0x1111111111111111111111111111111111111111', data: '0xdeadbeef', value: 10n };
const RECHECK_METHODS = ['eth_accounts', 'eth_chainId', 'net_version', 'eth_accounts'];
const PRIOR_ATTEMPT: WalletAttempt = {
  id: '11111111-1111-4111-8111-111111111111',
  key: `0x${'a'.repeat(64)}`,
  chainId: 84532,
  account: '0x7777777777777777777777777777777777777777',
  kind: 'transaction',
  createdAt: 1,
  status: 'submitted',
  hash: `0x${'8'.repeat(64)}`,
};

async function connectedWallet(changeDuringNetworkRead: boolean): Promise<{
  readonly wallet: MockWallet;
  readonly session: WalletSession;
  readonly accountAnswers: unknown[];
}> {
  const wallet = new MockWallet();
  const session = await connectWallet({ id: 'final-account', name: 'Test', kind: 'injected', provider: wallet }, 84532);
  wallet.calls.length = 0;
  const original = wallet.request.bind(wallet);
  const accountAnswers: unknown[] = [];
  let networkReadCompleted = false;
  wallet.request = async (args) => {
    const answer = await original(args);
    if (args.method === 'net_version') networkReadCompleted = true;
    if (args.method === 'eth_accounts') {
      // The first account read succeeds. Only the later reread sees the silent change.
      // MockWallet has no event emitter, so lifecycle invalidation cannot reject this request.
      const accounts = changeDuringNetworkRead && networkReadCompleted ? [OTHER_ACCOUNT] : answer;
      accountAnswers.push(accounts);
      return accounts;
    }
    return answer;
  };
  return { wallet, session, accountAnswers };
}

function attemptStore(): {
  readonly storage: {
    readonly getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
    readonly setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  };
  readonly initial: string;
  readonly raw: () => string | undefined;
} {
  const initial = JSON.stringify([PRIOR_ATTEMPT]);
  const values = new Map([[ATTEMPT_JOURNAL_KEY, initial]]);
  const storage = {
    getItem: vi.fn((key: string): string | null => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): void => { values.set(key, value); }),
  } satisfies AttemptStorage;
  return { storage, initial, raw: () => values.get(ATTEMPT_JOURNAL_KEY) };
}

describe('the final wallet account reread without provider events', () => {
  it('rejects a silently changed account before sending or touching the attempt journal', async () => {
    const { wallet, session, accountAnswers } = await connectedWallet(true);
    const { storage, initial, raw } = attemptStore();

    await expect(sendViaWallet(session, TX, undefined, { kind: 'payment', scope: 'silent-change', storage })).rejects.toMatchObject({
      translation: { key: 'error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain' },
    });

    expect(session.account).toBe(MOCK_ACCOUNT);
    expect(accountAnswers).toEqual([[MOCK_ACCOUNT], [OTHER_ACCOUNT]]);
    expect(wallet.calls.map((call) => call.method)).toEqual(RECHECK_METHODS);
    expect(wallet.sent).toBeUndefined();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(raw()).toBe(initial);
  });

  it('rejects a silently changed account before requesting a typed-data signature', async () => {
    const { wallet, session, accountAnswers } = await connectedWallet(true);

    await expect(signTypedDataViaWallet(session, '{}')).rejects.toMatchObject({
      translation: { key: 'error.wallet.theSelectedWalletAccountChangedReconnectAndReviewAgain' },
    });

    expect(session.account).toBe(MOCK_ACCOUNT);
    expect(accountAnswers).toEqual([[MOCK_ACCOUNT], [OTHER_ACCOUNT]]);
    expect(wallet.calls.map((call) => call.method)).toEqual(RECHECK_METHODS);
    expect(wallet.sent).toBeUndefined();
  });

  it('sends and records one successful attempt when the account remains unchanged', async () => {
    const { wallet, session, accountAnswers } = await connectedWallet(false);
    const { storage } = attemptStore();

    // This node-environment file has no navigator.locks, so the durable attempt journal gets the in-process test lock manager.
    await expect(sendViaWallet(session, TX, undefined, { kind: 'payment', scope: 'unchanged-account', storage, lockManager: createTestLocks() })).resolves.toBe(HASH);

    expect(accountAnswers).toEqual([[MOCK_ACCOUNT], [MOCK_ACCOUNT]]);
    expect(wallet.calls.map((call) => call.method)).toEqual([...RECHECK_METHODS, 'eth_sendTransaction']);
    expect(wallet.sent).toMatchObject({ from: MOCK_ACCOUNT, to: TX.to, data: TX.data, value: '0xa', chainId: '0x14a34' });
    expect(readAttempts(storage)).toEqual([
      PRIOR_ATTEMPT,
      expect.objectContaining({ account: MOCK_ACCOUNT, kind: 'payment', status: 'submitted', hash: HASH }),
    ]);
  });

  it('requests the typed-data signature when the account remains unchanged', async () => {
    const { wallet, session, accountAnswers } = await connectedWallet(false);

    await expect(signTypedDataViaWallet(session, '{}')).resolves.toBe(SIGNATURE);

    expect(accountAnswers).toEqual([[MOCK_ACCOUNT], [MOCK_ACCOUNT]]);
    expect(wallet.calls.map((call) => call.method)).toEqual([...RECHECK_METHODS, 'eth_signTypedData_v4']);
    expect(wallet.calls.at(-1)).toEqual({ method: 'eth_signTypedData_v4', params: [MOCK_ACCOUNT, '{}'] });
    expect(wallet.sent).toBeUndefined();
  });
});
