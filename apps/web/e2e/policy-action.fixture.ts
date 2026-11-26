import { sendPolicyAction } from '../src/features/policy/withdrawalJournal';
import { connectWallet, discoverWallets } from '../src/lib/wallet';

/** A prepared policy request for the mock wallet. Use the production sender's default journal and Web Locks. */
export async function send(): Promise<string> {
  const wallet = (await discoverWallets(window)).find((candidate) => candidate.rdns === 'test.e2e');
  if (wallet === undefined) throw new Error('Missing E2E wallet');
  return sendPolicyAction({
    wallet: await connectWallet(wallet, 84532),
    scope: 'seller:deployment:account:token:request',
    prepare: () => Promise.resolve({ to: '0x1111111111111111111111111111111111111111', data: '0x1234', value: 0n } as const),
    assertCurrent: () => undefined,
  });
}
