import { describe, expect, it } from 'vitest';
import { CHAINS } from '@ghostpay/chain-adapters';
import { parseArgs } from './args.js';
import { Ctx } from './ctx.js';
import { paymentCommands } from './commands/payment.js';
import { rpcSession } from './payment-context.js';
import { paymentWorld, VERIFY_ARGS } from './payment-fixtures.testutil.js';

describe('concurrent CLI RPC byte-budget isolation', () => {
  it('reserves the shared response budget before starting concurrent provider reads', async () => {
    const { io } = paymentWorld();
    const command = paymentCommands.find(c => c.path.join(' ') === 'payment verify')!;
    const session = await rpcSession(
      new Ctx(io, true),
      parseArgs([...VERIFY_ARGS, '--secondary-rpc-file', 'secondary.txt'], command.opts),
      CHAINS[0]!,
    );

    // Keep every reply pending so the transport must account for potential
    // response bytes, not only for replies which have already arrived.
    const held: Array<() => void> = [];
    const maxBytesSeen: number[] = [];
    io.rpcTransport.send = (_url, body, init) => {
      const { id } = JSON.parse(body) as { id: number };
      maxBytesSeen.push(init.maxBytes);
      return new Promise<string>(resolve => {
        held.push(() => resolve(JSON.stringify({ jsonrpc: '2.0', id, result: '0x1' })));
      });
    };

    // Sixteen mebibytes are shared by both providers. Each read may return
    // one mebibyte, and chain initialization already consumed some bytes.
    const reads = Array.from({ length: 17 }, (_, i) =>
      (i % 2 === 0 ? session.client : session.secondary!).request('fixture_readOnlyBlob', []),
    );
    const results = Promise.allSettled(reads);
    await new Promise<void>(resolve => setImmediate(resolve));
    const dispatchedBeforeAnyReply = held.length;
    held.splice(0).forEach(release => release());
    const settled = await results;

    expect(dispatchedBeforeAnyReply).toBeLessThanOrEqual(15);
    expect(maxBytesSeen.every(bytes => bytes > 0 && bytes <= 1024 * 1024)).toBe(true);
    expect(settled.some(result => result.status === 'rejected')).toBe(true);
    expect(session.stats.bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
  });
});
