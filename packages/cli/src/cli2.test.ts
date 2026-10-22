import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { allOutput, G, G2, KEY_HEX, makeIo, SIGNER, SPEC, stdoutJson, type TestIo } from './fixtures.testutil.js';

const cli = (io: TestIo, ...argv: string[]): Promise<number> => run(argv, io);

const A = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const B = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
const META = `st:eth:0x${G}${G2}`;
const H = 'destination,amount,label\n';
const CSV = `${H}${A},1250.75,Alice (payroll)\n${B},3,Bob\n${META},100,Private Carol\n`;
const BATCH = [
  '--csv', 'p.csv', '--chain-id', '8453', '--asset', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '--decimals', '6',
  '--min', '1', '--per-recipient-max', '10000', '--max-recipients', '100', '--max-total', '50000',
];

async function previewHash(csv = CSV, extra: string[] = []): Promise<string> {
  const io = makeIo({ 'p.csv': csv });
  expect(await cli(io, 'batch', 'preview', ...BATCH, ...extra, '--json')).toBe(0);
  return String(stdoutJson(io)['previewHash']);
}

describe('batch', () => {
  it('preview shows every row with exact amounts and a hash', async () => {
    const io = makeIo({ 'p.csv': CSV });
    expect(await cli(io, 'batch', 'preview', ...BATCH)).toBe(0);
    const out = io.out.join('');
    expect(out).toContain(`${A}  1250.750000  Alice (payroll)`);
    expect(out).toContain('3 payouts, total 1353.750000 (1353750000 base units)');
    expect(out).toMatch(/preview hash: [0-9a-f]{64}/);
    const j = makeIo({ 'p.csv': CSV });
    await cli(j, 'batch', 'preview', ...BATCH, '--json');
    expect(stdoutJson(j)).toMatchObject({ ok: true, count: 3, total: '1353750000', merged: 0 });
  });
  it('confirm round trip succeeds; tampered file or changed options fail', async () => {
    const hash = await previewHash();
    const ok = makeIo({ 'p.csv': CSV });
    expect(await cli(ok, 'batch', 'confirm', ...BATCH, '--hash', hash)).toBe(0);
    expect(ok.out.join('')).toContain(`confirmed plan ${hash}`);
    const j = makeIo({ 'p.csv': CSV });
    await cli(j, 'batch', 'confirm', ...BATCH, '--hash', hash, '--json');
    expect(stdoutJson(j)).toMatchObject({ ok: true, planId: hash, count: 3, total: '1353750000' });

    const tampered = makeIo({ 'p.csv': CSV.replace('1250.75', '1250.76') });
    expect(await cli(tampered, 'batch', 'confirm', ...BATCH, '--hash', hash)).toBe(1);
    expect(tampered.out.join('')).toContain('NOT confirmed');
    const swapped = makeIo({ 'p.csv': CSV.replace(A, B).replace(`${B},3`, `${A},3`) });
    expect(await cli(swapped, 'batch', 'confirm', ...BATCH, '--hash', hash, '--json')).toBe(1);
    const chain = makeIo({ 'p.csv': CSV });
    expect(await cli(chain, 'batch', 'confirm', ...BATCH.map((x) => (x === '8453' ? '1' : x)), '--hash', hash)).toBe(1);
    const wrongHash = makeIo({ 'p.csv': CSV });
    expect(await cli(wrongHash, 'batch', 'confirm', ...BATCH, '--hash', '0'.repeat(64))).toBe(1);
  });
  it('lists every row problem without echoing cell contents; exit 1', async () => {
    const bad = `${H}${A.toLowerCase()},5,x\n${B},-1,y\n${B},5,=cmd|' /C calc'!A0\nnotanaddress,5,z\n`;
    const io = makeIo({ 'p.csv': bad });
    expect(await cli(io, 'batch', 'preview', ...BATCH)).toBe(1);
    const out = io.out.join('');
    expect(out).toContain('CSV rejected');
    expect(out).toContain('row 2');
    expect(out).not.toContain('cmd');
    expect(out).not.toContain('calc');
    const j = makeIo({ 'p.csv': 'wrong,header\n' });
    expect(await cli(j, 'batch', 'preview', ...BATCH, '--json')).toBe(1);
    expect(stdoutJson(j)['ok']).toBe(false);
  });
  it('limits and duplicates are enforced; merge option; lowercase option', async () => {
    const over = makeIo({ 'p.csv': `${H}${A},10001,big\n` });
    expect(await cli(over, 'batch', 'preview', ...BATCH)).toBe(1);
    const under = makeIo({ 'p.csv': `${H}${A},0.0000001,tiny\n` });
    expect(await cli(under, 'batch', 'preview', ...BATCH)).toBe(1);
    const dup = `${H}${A},5,a\n${A},6,b\n`;
    expect(await cli(makeIo({ 'p.csv': dup }), 'batch', 'preview', ...BATCH)).toBe(1);
    const m = makeIo({ 'p.csv': dup });
    expect(await cli(m, 'batch', 'preview', ...BATCH, '--duplicates', 'merge', '--json')).toBe(0);
    expect(stdoutJson(m)).toMatchObject({ count: 1, total: '11000000', merged: 1 });
    const low = makeIo({ 'p.csv': `${H}${A.toLowerCase()},5,a\n` });
    expect(await cli(low, 'batch', 'preview', ...BATCH, '--allow-lowercase')).toBe(0);
  });
  it('usage errors for bad options', async () => {
    const t = (extra: string[], drop?: string): Promise<number> => {
      const args = [...BATCH];
      if (drop !== undefined) args.splice(args.indexOf(drop), 2);
      return cli(makeIo({ 'p.csv': CSV }), 'batch', 'preview', ...args, ...extra);
    };
    expect(await t(['--duplicates', 'sum'])).toBe(2);
    expect(await t([], '--asset')).toBe(2);
    expect(await t([], '--max-total')).toBe(2);
    expect(await cli(makeIo({ 'p.csv': CSV }), 'batch', 'preview', ...BATCH.map((x) => (x.startsWith('0xa0') ? 'USDC' : x)))).toBe(2);
    expect(await cli(makeIo({ 'p.csv': CSV }), 'batch', 'preview', ...BATCH.map((x) => (x === '50000' ? '5e4' : x)))).toBe(2);
    expect(await cli(makeIo({ 'p.csv': CSV }), 'batch', 'confirm', ...BATCH)).toBe(2);
    expect(await cli(makeIo({}), 'batch', 'preview', ...BATCH)).toBe(3);
  });
});

describe('export', () => {
  const row = {
    id: 'inv-1',
    customer: '=HYPERLINK("http://evil")',
    currency: 'USD',
    createdAt: 1_800_000_000,
    dueAt: 1_800_086_400,
    lineItems: [{ description: 'Widget', quantity: '3', unitMinor: '1999' }],
    taxRateBps: 825,
  };
  it('writes formula-safe CSV with exact integer math', async () => {
    const io = makeIo({ 'in.json': JSON.stringify([row]) });
    expect(await cli(io, 'export', '--in', 'in.json')).toBe(0);
    const out = io.out.join('');
    expect(out).toContain('inv-1,2027-01-15,2027-01-16');
    expect(out).toContain('59.97');
    expect(out).toContain('4.95');
    expect(out).toContain('64.92');
    expect(out).not.toMatch(/,=HYPERLINK/);
  });
  it('other formats and options; --out; json envelope', async () => {
    const files = { 'in.json': JSON.stringify([row]) };
    for (const f of ['json', 'xero', 'iif'])
      expect(await cli(makeIo(files), 'export', '--in', 'in.json', '--format', f, '--rounding', 'down', '--sales-account', 'Sales', '--tax-account', 'Tax', '--receivable-account', 'AR')).toBe(0);
    const io = makeIo(files);
    expect(await cli(io, 'export', '--in', 'in.json', '--out', 'o.csv')).toBe(0);
    expect(io.files.get('o.csv')).toContain('inv-1');
    expect(io.out.join('')).toContain('wrote 1 invoices');
    const j = makeIo(files);
    await cli(j, 'export', '--in', 'in.json', '--json');
    expect(stdoutJson(j)).toMatchObject({ ok: true, format: 'csv', count: 1 });
  });
  it('accepts schema invoice wrappers', async () => {
    const mk = makeIo({ 'spec.json': JSON.stringify({ ...SPEC, signer: SIGNER }) });
    await cli(mk, 'invoice', 'create', '--in', 'spec.json');
    const inv = JSON.parse(mk.out.join('')) as unknown;
    const io = makeIo({ 'in.json': JSON.stringify([{ invoice: inv, customer: 'Acme', status: 'paid', paidMinor: '12345' }]) });
    expect(await cli(io, 'export', '--in', 'in.json')).toBe(0);
    expect(io.out.join('')).toContain('Acme');
    expect(io.out.join('')).toContain('paid');
    const bare = makeIo({ 'in.json': JSON.stringify([{ invoice: inv }]) });
    expect(await cli(bare, 'export', '--in', 'in.json')).toBe(0);
  });
  it('rejects bad input shapes, formats, money, duplicates, too many rows', async () => {
    const t = (data: unknown, ...extra: string[]): Promise<number> => cli(makeIo({ 'in.json': typeof data === 'string' ? data : JSON.stringify(data) }), 'export', '--in', 'in.json', ...extra);
    expect(await t({})).toBe(1);
    expect(await t([1])).toBe(1);
    expect(await t([{ id: 'x' }])).toBe(1);
    expect(await t([{ ...row, lineItems: [{ description: 'a', quantity: 1, unitMinor: '1' }] }])).toBe(1);
    expect(await t([{ ...row, lineItems: [{ description: 'a', quantity: '1', unitMinor: '1.5' }] }])).toBe(1);
    expect(await t([row, row])).toBe(1);
    expect(await t([row], '--format', 'xml')).toBe(2);
    expect(await t([row], '--rounding', 'sideways')).toBe(2);
    expect(await t(new Array(5001).fill(row))).toBe(1);
    expect(await t('not json')).toBe(1);
    expect(await t([{ invoice: { v: 1 } }])).toBe(1);
  });
});

describe('sandbox chain demo', () => {
  it('is deterministic and carries the TEST banner; funds move exactly', async () => {
    const a = makeIo();
    const b = makeIo();
    expect(await cli(a, 'sandbox', 'chain', 'demo', '--json')).toBe(0);
    expect(await cli(b, 'sandbox', 'chain', 'demo', '--json')).toBe(0);
    expect(a.out.join('')).toBe(b.out.join(''));
    const r = stdoutJson(a) as { banner: string; balances: { alice: string; bob: string }; steps: { status: string }[]; test: boolean };
    expect(r.test).toBe(true);
    expect(r.banner).toContain('TEST MODE');
    expect(r.balances).toEqual({ alice: '750000000000000000', bob: '250000000000000000' });
    expect(r.steps.map((s) => s.status)).toEqual(['success', 'success', 'failed']);
  });
  it('seed changes hashes; human output; bad seed rejected', async () => {
    const a = makeIo();
    const b = makeIo();
    await cli(a, 'sandbox', 'chain', 'demo', '--seed', 'one');
    await cli(b, 'sandbox', 'chain', 'demo', '--seed', 'two');
    expect(a.out.join('')).not.toBe(b.out.join(''));
    expect(a.out.join('')).toContain('TEST MODE');
    expect(await cli(makeIo(), 'sandbox', 'chain', 'demo', '--seed', 'bad seed!')).toBe(2);
    expect(await cli(makeIo(), 'sandbox', 'chain')).toBe(2);
  });
});

describe('i18n check', () => {
  it('bundled catalogs pass', async () => {
    const io = makeIo();
    expect(await cli(io, 'i18n', 'check')).toBe(0);
    expect(io.out.join('')).toContain('ok');
    const j = makeIo();
    await cli(j, 'i18n', 'check', '--json');
    expect(stdoutJson(j)['ok']).toBe(true);
  });
  it('detects missing keys, placeholder drift, extra keys, html, syntax errors', async () => {
    const en = JSON.stringify({ hi: 'Hello {name}', bye: 'Bye', n: '{count, plural, one {# item} other {# items}}' });
    const es = JSON.stringify({ hi: 'Hola', extra: 'x', n: '<b>{count, plural, other {# cosas}}</b>' });
    const io = makeIo({ 'en.json': en, 'es.json': es });
    expect(await cli(io, 'i18n', 'check', '--catalog', 'en=en.json', '--catalog', 'es=es.json')).toBe(1);
    const out = io.out.join('');
    expect(out).toContain('FAIL es');
    expect(out).toContain('missing bye');
    expect(out).toContain('extra extra');
    expect(out).toContain('placeholders hi');
    expect(out).toContain('html-like n');
    expect(out).toContain('plural n');
    const syn = makeIo({ 'en.json': en, 'xx.json': JSON.stringify({ hi: 'Hello {name', bye: 'b', n: 'n' }) });
    expect(await cli(syn, 'i18n', 'check', '--catalog', 'en=en.json', '--catalog', 'fr=xx.json')).toBe(1);
    expect(syn.out.join('')).toContain('syntax hi');
  });
  it('usage and input errors', async () => {
    expect(await cli(makeIo(), 'i18n', 'check', '--catalog', 'nofile')).toBe(2);
    expect(await cli(makeIo({ 'a.json': '[]' }), 'i18n', 'check', '--catalog', 'en=a.json')).toBe(1);
    expect(await cli(makeIo({ 'a.json': '{"k":1}' }), 'i18n', 'check', '--catalog', 'en=a.json')).toBe(1);
    expect(await cli(makeIo({ 'a.json': '{"k":"v"}' }), 'i18n', 'check', '--catalog', 'en=a.json', '--base', 'fr')).toBe(1);
    expect(await cli(makeIo({ 'a.json': '{"k":"v"}' }), 'i18n', 'check', '--catalog', 'en=a.json', '--base', '!!')).toBe(1);
  });
});

describe('doctor', () => {
  it('passes on a healthy setup and states there is no network use', async () => {
    const io = makeIo();
    expect(await cli(io, 'doctor')).toBe(0);
    expect(io.out.join('')).toContain('all checks passed');
    expect(io.out.join('')).toContain('no network calls');
    const j = makeIo();
    await cli(j, 'doctor', '--json');
    expect((stdoutJson(j)['checks'] as unknown[]).length).toBe(7);
  });
  it('fails on constant randomness, old node, bad clock', async () => {
    const rnd = makeIo();
    rnd.constantRandom = true;
    expect(await cli(rnd, 'doctor', '--json')).toBe(1);
    expect((stdoutJson(rnd)['checks'] as { name: string; ok: boolean }[]).find((c) => c.name === 'randomness')?.ok).toBe(false);
    const old = makeIo();
    old.nodeVersion = '18.19.0';
    expect(await cli(old, 'doctor')).toBe(1);
    expect(old.out.join('')).toContain('some checks failed');
    const weird = makeIo();
    weird.nodeVersion = 'weird';
    expect(await cli(weird, 'doctor')).toBe(1);
    const clock = makeIo();
    clock.now = 5;
    expect(await cli(clock, 'doctor')).toBe(1);
    expect(clock.out.join('')).toContain('clock looks wrong');
  });
});

describe('no secrets in output, ever', () => {
  it('key and secret never appear in any stream across success and failure paths', async () => {
    const mk = makeIo({ 'spec.json': JSON.stringify({ ...SPEC, signer: SIGNER }) });
    await cli(mk, 'invoice', 'create', '--in', 'spec.json');
    const inv = mk.out.join('');
    const runs: string[][] = [
      ['invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt'],
      ['invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt', '--json'],
      ['invoice', 'sign', '--in', 'nope.json', '--key-file', 'key.txt'],
      ['invoice', 'create', '--in', 'inv.json', '--key-file', 'key.txt'],
      ['invoice', 'sign', '--in', 'inv.json', '--key-env', 'K'],
      ['invoice', 'sign', '--in', 'inv.json', '--key-env', KEY_HEX],
      ['invoice', 'sign', '--in', 'inv.json', '--key', KEY_HEX],
      ['invoice', 'sign', '--in', 'inv.json', `--key=${KEY_HEX}`],
      ['webhook', 'sign', '--body-file', 'inv.json', '--secret-file', 'key.txt'],
      ['webhook', 'verify', '--body-file', 'inv.json', '--secret-file', 'key.txt', '--header', 'x'],
    ];
    for (const argv of runs) {
      const io = makeIo({ 'inv.json': inv, 'key.txt': KEY_HEX + '\n' });
      io.env['K'] = KEY_HEX;
      await run(argv, io);
      expect(allOutput(io), argv.join(' ')).not.toContain(KEY_HEX);
    }
  });
});
