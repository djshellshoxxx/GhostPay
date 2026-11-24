import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';
import { Ctx } from './ctx.js';
import { makeIo } from './fixtures.testutil.js';
import * as secrets from './secrets.js';

describe('protected passphrase input', () => {
  it('reads a private file and removes only one terminal line ending', async () => {
    const io = makeIo({ pass: '  a long passphrase  \r\n' });
    const a = parseArgs(['--passphrase-file', 'pass'], secrets.secretOpts('passphrase'));
    expect(await secrets.readPassphrase(new Ctx(io, true), a)).toBe('  a long passphrase  ');
  });
  it('rejects missing, ambiguous, empty, oversized and inline sources without echoing values', async () => {
    const io = makeIo({ empty: '', huge: 'x'.repeat(1025) });
    const ctx = new Ctx(io, true); const opts = secrets.secretOpts('passphrase');
    await expect(secrets.readPassphrase(ctx, parseArgs([], opts))).rejects.toMatchObject({ code: 'SECRET_SOURCE_MISSING' });
    expect(await secrets.readPassphrase(ctx, parseArgs([], opts), 'passphrase', false)).toBeUndefined();
    for (const path of ['empty', 'huge']) await expect(secrets.readPassphrase(ctx, parseArgs(['--passphrase-file', path], opts))).rejects.toMatchObject({ code: 'BAD_PASSPHRASE' });
    await expect(secrets.readPassphrase(ctx, parseArgs(['--passphrase-file', 'empty', '--passphrase-stdin'], opts))).rejects.toMatchObject({ code: 'SECRET_SOURCE_AMBIGUOUS' });
    expect(() => parseArgs(['--passphrase', 'not-for-logs'], opts)).toThrow('secrets must not be passed');
  });
  it('supports stdin once and validates environment names without disclosing a pasted value', async () => {
    const io = makeIo(); io.stdinText = 'spaces stay   \n';
    const ctx = new Ctx(io, true); const opts = secrets.secretOpts('passphrase');
    expect(await secrets.readPassphrase(ctx, parseArgs(['--passphrase-stdin'], opts))).toBe('spaces stay   ');
    await expect(secrets.readPassphrase(ctx, parseArgs(['--passphrase-stdin'], opts))).rejects.toMatchObject({ code: 'STDIN_TWICE' });
    await expect(secrets.readPassphrase(ctx, parseArgs(['--passphrase-env', 'value with spaces'], opts))).rejects.toMatchObject({ code: 'BAD_ENV_NAME' });
    await expect(secrets.readPassphrase(ctx, parseArgs(['--passphrase-env', 'MISSING'], opts))).rejects.toMatchObject({ code: 'ENV_UNSET' });
    io.env['PASS'] = 'long private phrase';
    expect(await secrets.readPassphrase(ctx, parseArgs(['--passphrase-env', 'PASS'], opts))).toBe('long private phrase');
  });
});
