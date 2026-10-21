import { ManualClock, MockChain, TEST_BANNER } from '@ghostpay/sandbox';
import { noPositionals } from '../args.js';
import { usageError } from '../io.js';
import type { Command } from './types.js';

export const sandboxCommands: readonly Command[] = [
  {
    path: ['sandbox', 'chain', 'demo'],
    summary: 'run a deterministic in-memory mock chain walkthrough (no network)',
    usage: 'ghostpay sandbox chain demo [--seed TEXT]\n  Funds a test account, sends a transfer, then injects a failure. Everything is local and fake.',
    opts: { seed: 'value' },
    handler: (ctx, a) => {
      noPositionals(a);
      const seed = a.values.get('seed');
      if (seed !== undefined && !/^[A-Za-z0-9_.-]{1,64}$/.test(seed))
        throw usageError('BAD_SEED', '--seed must be 1-64 letters, digits, dot, dash or underscore.');
      const clock = new ManualClock(ctx.io.nowSeconds());
      const chain = new MockChain({ clock, ...(seed === undefined ? {} : { seed }) });
      const alice = chain.account(0);
      const bob = chain.account(1);
      const faucetTx = chain.faucet(alice);
      const amount = 250_000_000_000_000_000n;
      const tx1 = chain.submit({ from: alice, to: bob, amount });
      chain.mine();
      chain.faults.failNext = 1;
      const tx2 = chain.submit({ from: alice, to: bob, amount });
      chain.mine();
      const steps = [
        { step: 'faucet', tx: faucetTx, status: chain.getTx(faucetTx).status },
        { step: 'transfer', tx: tx1, status: chain.getTx(tx1).status, confirmations: chain.confirmations(tx1) },
        { step: 'transfer-with-injected-failure', tx: tx2, status: chain.getTx(tx2).status },
      ];
      const balances = { alice: chain.balanceOf(alice).toString(), bob: chain.balanceOf(bob).toString() };
      const data = { ok: true, test: true, banner: TEST_BANNER, chainId: chain.chainId, height: chain.height, accounts: { alice, bob }, steps, balances };
      ctx.out(
        data,
        [
          TEST_BANNER,
          `chain ${chain.chainId}, height ${chain.height}`,
          ...steps.map((s) => `${s.step.padEnd(32)} ${s.status}  ${s.tx}`),
          `alice ${balances.alice} wei`,
          `bob   ${balances.bob} wei`,
        ].join('\n'),
      );
      return Promise.resolve(0);
    },
  },
];
