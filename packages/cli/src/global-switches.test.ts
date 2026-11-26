import { describe, expect, it } from 'vitest';
import { run, COMMANDS, VERSION } from './index.js';
import { makeIo, SECRET_HEX, SPEC, KEY_HEX, SIGNER, stdoutJson, type TestIo } from './fixtures.testutil.js';
import { PIN } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS } from './reconciliation-fixtures.testutil.js';

const GLOBALS = ['--help', '-h', '--version'] as const;

/** `--help` and `--version` start with `--`, so in a value position they are a missing value; `-h` is a value. */
const isDoubleDash = (token: string): boolean => token.startsWith('--');

/** True when stdout carries the help or version output instead of a command result. */
function printedHelpOrVersion(io: TestIo, usage: string): boolean {
  const out = io.out.join('');
  if (out.trim() === VERSION || out.includes(`Usage: ${usage}`) || out.includes('Commands:')) return true;
  try {
    const keys = Object.keys(JSON.parse(out) as Record<string, unknown>).sort().join(',');
    return keys === 'ok,usage' || keys === 'ok,version' || keys === 'commands,ok';
  } catch {
    return false;
  }
}

/** Options whose value is free text or an output path, so the literal "-h" is itself a valid value. */
const ANY_STRING_ACCEPTED = new Set(['diagnostics --out', 'sandbox chain demo --seed']);

describe('global switches are not honoured in option-value positions (R11-1)', () => {
  const body = '{"type":"invoice.paid","id":"evt_forged"}';

  for (const forged of GLOBALS) {
    it(`webhook verify --header ${forged} on a forged body never succeeds`, async () => {
      const io = makeIo({ 'body.json': body, 'sec.txt': SECRET_HEX });
      const code = await run(['webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header', forged, '--json'], io);
      expect(io.out.join('')).not.toMatch(/"ok":true/);
      if (isDoubleDash(forged)) {
        // A `--` token is never an option value: usage error, nothing on stdout.
        expect(code).toBe(2);
        expect(io.out.join('')).toBe('');
        expect(JSON.parse(io.err.join(''))).toMatchObject({ ok: false, error: { code: 'MISSING_VALUE' } });
      } else {
        // `-h` is the header value: a normal verification failure.
        expect(code).toBe(1);
        expect(stdoutJson(io)).toMatchObject({ ok: false });
      }
    });

    it(`webhook verify --header=${forged} passes the text literally and fails verification`, async () => {
      const io = makeIo({ 'body.json': body, 'sec.txt': SECRET_HEX });
      expect(await run(['webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', `--header=${forged}`, '--json'], io)).toBe(1);
      expect(stdoutJson(io)).toMatchObject({ ok: false });
    });
  }

  it('a switch in the header value position prints no help, also without --json', async () => {
    const io = makeIo({ 'body.json': body, 'sec.txt': SECRET_HEX });
    expect(await run(['webhook', 'verify', '--body-file', 'body.json', '--header', '--help', '--secret-file', 'sec.txt'], io)).toBe(2);
    expect(io.out.join('')).toBe('');
    expect(io.err.join('')).toContain('--header needs a value');
  });

  for (const forged of GLOBALS) {
    it(`invoice verify --pin ${forged} fails instead of printing help`, async () => {
      const io = makeIo({ 'spec.json': JSON.stringify(SPEC), 'key.txt': `${KEY_HEX}\n` });
      expect(await run(['invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 'signed.json'], io)).toBe(0);
      io.out.length = 0;
      const code = await run(['invoice', 'verify', '--in', 'signed.json', '--pin', forged, '--json'], io);
      expect(code).not.toBe(0);
      expect(io.out.join('')).not.toMatch(/"ok":true/);
      expect(io.err.join('')).toContain(isDoubleDash(forged) ? 'MISSING_VALUE' : 'BAD_PIN');
    });

    it(`receipt verify --pin ${forged} and --expected-tx ${forged} fail instead of printing help`, async () => {
      const w = await reconciliationWorld();
      expect(await run(['receipt', 'create', '--invoice', 'invoice.json', '--observation', 'claim.json',
        ...RECON_CREDS, '--manifest', 'manifest.json', '--manifest-digest', PIN,
        '--online', '--rpc-file', 'rpc.txt', '--approve', '--out', 'receipt.json', '--json'], w.io)).toBe(0);
      w.io.out.length = 0;
      expect(await run(['receipt', 'verify', '--in', 'receipt.json', '--invoice', 'invoice.json', '--pin', SIGNER, '--json'], w.io)).toBe(0);
      for (const argv of [
        ['receipt', 'verify', '--in', 'receipt.json', '--invoice', 'invoice.json', '--pin', forged, '--json'],
        ['receipt', 'verify', '--in', 'receipt.json', '--invoice', 'invoice.json', '--pin', SIGNER, '--expected-tx', forged, '--json'],
      ]) {
        w.io.out.length = 0;
        w.io.err.length = 0;
        expect(await run(argv, w.io)).not.toBe(0);
        expect(w.io.out.join('')).not.toMatch(/"ok":true/);
        expect(w.io.err.join('') + w.io.out.join('')).toMatch(/"ok":false/);
      }
    });

    it(`payment verify --in ${forged} fails instead of printing help`, async () => {
      const io = makeIo();
      const code = await run(['payment', 'verify', '--in', forged, '--json'], io);
      expect(code).not.toBe(0);
      expect(io.out.join('')).not.toMatch(/"ok":true/);
    });
  }

  const valueOptions = COMMANDS.flatMap((c) =>
    Object.entries(c.opts).filter(([, kind]) => kind !== 'flag').map(([name]) => ({ c, name })));

  it('covers every registered command option that takes a value', () => {
    expect(valueOptions.length).toBeGreaterThan(100);
    expect(new Set(valueOptions.map((v) => v.c)).size).toBe(COMMANDS.filter((c) => Object.values(c.opts).some((k) => k !== 'flag')).length);
  });

  for (const { c, name } of valueOptions) {
    it(`${c.path.join(' ')} --${name} <global switch> is never honoured as a switch`, async () => {
      for (const forged of GLOBALS) {
        for (const json of [true, false]) {
          const label = `${forged} json=${String(json)}`;
          const io = makeIo();
          const before = [...io.files.keys()].sort();
          const code = await run([...c.path, `--${name}`, forged, ...(json ? ['--json'] : [])], io);
          expect(printedHelpOrVersion(io, c.usage), label).toBe(false);
          if (isDoubleDash(forged)) {
            // Refused before the command runs: usage error, nothing on stdout, no file touched.
            expect(code, label).toBe(2);
            expect(io.out.join(''), label).toBe('');
            expect(io.err.join(''), label).toContain(json ? '"code":"MISSING_VALUE"' : `--${name} needs a value`);
            expect([...io.files.keys()].sort(), label).toEqual(before);
          } else {
            if (!ANY_STRING_ACCEPTED.has(`${c.path.join(' ')} --${name}`)) expect(code, label).not.toBe(0);
            // `-h` is the value: same outcome as passing it explicitly.
            const explicit = makeIo();
            expect(await run([...c.path, `--${name}=${forged}`, ...(json ? ['--json'] : [])], explicit), label).toBe(code);
            expect(io.out.join('') + io.err.join(''), label).toBe(explicit.out.join('') + explicit.err.join(''));
            expect([...io.files.keys()].sort(), label).toEqual([...explicit.files.keys()].sort());
          }
          // The explicit `=` form never prints help or version either.
          const literal = makeIo();
          await run([...c.path, `--${name}=${forged}`, ...(json ? ['--json'] : [])], literal);
          expect(printedHelpOrVersion(literal, c.usage), label).toBe(false);
        }
      }
    });
  }
});

describe('genuine help and version invocations still work (R11-1)', () => {
  it('top-level, group, command and help-command forms exit 0 with help', async () => {
    for (const argv of [['--help'], ['-h'], ['--help', '--json'], ['--json', '--help'], ['help'], []]) {
      const io = makeIo();
      expect(await run(argv, io), argv.join(' ')).toBe(0);
      expect(io.out.join('')).toMatch(/Commands:|"commands":/);
    }
    for (const argv of [['payment', '--help'], ['payment', '-h']]) {
      const io = makeIo();
      expect(await run(argv, io)).toBe(0);
      expect(io.out.join('')).toContain('payment verify');
    }
    for (const argv of [
      ['payment', 'verify', '--help'], ['payment', 'verify', '-h'], ['help', 'payment', 'verify'],
      ['payment', 'verify', '--in', 'x.json', '--help'], ['payment', 'verify', '--in=x.json', '-h'],
      ['payment', 'verify', '--help', '--in', 'x.json'], ['--help', 'payment', 'verify'], ['payment', '--help', 'verify'],
    ]) {
      const io = makeIo();
      expect(await run(argv, io), argv.join(' ')).toBe(0);
      expect(io.out.join('')).toContain('Usage: ghostpay payment verify');
    }
    const j = makeIo();
    expect(await run(['webhook', 'verify', '--header', 'x', '--help', '--json'], j)).toBe(0);
    expect(stdoutJson(j)['usage']).toContain('ghostpay webhook verify');
  });

  it('--version is honoured before or after a command in a flag position', async () => {
    for (const argv of [['--version'], ['--version', '--json'], ['payment', 'verify', '--version'], ['webhook', 'verify', '--header', 'x', '--version']]) {
      const io = makeIo();
      expect(await run(argv, io), argv.join(' ')).toBe(0);
      expect(io.out.join('')).toContain(VERSION);
    }
  });

  it('switches after a -- terminator are not global', async () => {
    for (const argv of [['--', '--help'], ['invoice', 'sign', '--', '--help'], ['invoice', 'sign', '--', '--version']]) {
      const io = makeIo();
      expect(await run(argv, io), argv.join(' ')).toBe(2);
      expect(io.out.join('')).toBe('');
    }
  });

  it('a --json that follows a value option is not swallowed', async () => {
    const io = makeIo();
    expect(await run(['invoice', 'sign', '--in', '--json'], io)).toBe(2);
    expect(io.err.join('')).toContain('MISSING_VALUE');
  });
});
