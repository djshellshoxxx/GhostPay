import { describe, expect, it } from 'vitest';
import { run } from './run.js';
import { makeIo, allOutput } from './fixtures.testutil.js';

describe('mistakenly pasted credentials in named environment options', () => {
  it.each([
    ['invoice', 'create', '--in', 'input', '--key-env'],
    ['webhook', 'sign', '--body-file', 'input', '--secret-env'],
    ['invoice', 'inspect', '--in', 'input', '--passphrase-env'],
    ['diagnostics', 'rpc', '--chain', '11155111', '--online', '--rpc-env'],
  ])('never echoes a valid-identifier candidate from %s %s', async (...args) => {
    // Hex keys beginning a-f also satisfy the syntax for an environment variable name.
    const candidate = 'a'.repeat(64);
    const io = Object.assign(makeIo({ input: '{}' }), {
      rpcTransport: { send: () => Promise.reject(new Error('endpoint lookup must precede network access')) },
    });
    expect(await run([...args, candidate, '--json'], io)).toBe(3);
    expect(JSON.parse(io.err.join(''))).toMatchObject({ ok: false, error: { code: 'ENV_UNSET' } });
    expect(allOutput(io)).not.toContain(candidate);
    expect(io.out).toEqual([]);
  });
});
