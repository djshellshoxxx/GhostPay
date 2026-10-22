import { describe, expect, it } from 'vitest';
import { run, COMMANDS, VERSION } from './index.js';
import { allOutput, KEY_HEX, makeIo, NOW, SECRET_HEX, SIGNER, SPEC, stdoutJson, type TestIo } from './fixtures.testutil.js';

async function cli(io: TestIo, ...argv: string[]): Promise<number> {
  return run(argv, io);
}
const spec = (over: Record<string, unknown> = {}): string => JSON.stringify({ ...SPEC, ...over });

async function signedFile(io: TestIo): Promise<string> {
  io.files.set('spec.json', spec());
  io.files.set('key.txt', `${KEY_HEX}\n`);
  expect(await cli(io, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 'signed.json')).toBe(0);
  return io.files.get('signed.json') as string;
}

async function unsignedInvoice(): Promise<string> {
  const io = makeIo({ 'spec.json': spec({ signer: SIGNER }) });
  await cli(io, 'invoice', 'create', '--in', 'spec.json');
  return io.out.join('');
}

describe('dispatch and help', () => {
  it('prints top-level help with exit 0 and lists every command', async () => {
    const io = makeIo();
    expect(await cli(io)).toBe(0);
    for (const c of COMMANDS) expect(io.out.join('')).toContain(c.path.join(' '));
    expect(io.out.join('')).toContain('no network');
  });
  it('help <cmd>, <cmd> --help, group --help', async () => {
    let io = makeIo();
    expect(await cli(io, 'help', 'invoice', 'sign')).toBe(0);
    expect(io.out.join('')).toContain('Usage: ghostpay invoice sign');
    io = makeIo();
    expect(await cli(io, 'webhook', 'verify', '--help')).toBe(0);
    expect(io.out.join('')).toContain('--header-file');
    io = makeIo();
    expect(await cli(io, 'batch', '--help')).toBe(0);
    expect(io.out.join('')).toContain('batch confirm');
    io = makeIo();
    expect(await cli(io, 'help', 'nonsense')).toBe(0);
    io = makeIo();
    expect(await cli(io, '--help', '--json')).toBe(0);
    expect(stdoutJson(io)['ok']).toBe(true);
  });
  it('--version', async () => {
    const io = makeIo();
    expect(await cli(io, '--version')).toBe(0);
    expect(io.out.join('').trim()).toBe(VERSION);
    const j = makeIo();
    await cli(j, '--version', '--json');
    expect(stdoutJson(j)).toEqual({ ok: true, version: VERSION });
  });
  it('unknown command suggests the closest one, exit 2', async () => {
    const io = makeIo();
    expect(await cli(io, 'invoce')).toBe(2);
    expect(io.err.join('')).toContain('Did you mean `ghostpay invoice`');
    const far = makeIo();
    expect(await cli(far, 'zzzzzzzz')).toBe(2);
    expect(far.err.join('')).toContain('--help');
  });
  it('bare subcommand group and option before command are usage errors', async () => {
    const io = makeIo();
    expect(await cli(io, 'invoice')).toBe(2);
    expect(io.err.join('')).toContain('needs a subcommand');
    expect(await cli(makeIo(), '--bogus')).toBe(2);
  });
  it('unknown option suggests; secret-looking option refused without echoing the value', async () => {
    let io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--inn', 'x')).toBe(2);
    expect(io.err.join('')).toContain('Did you mean --in');
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--in', 'a', '--key', KEY_HEX)).toBe(2);
    expect(allOutput(io)).not.toContain(KEY_HEX);
    expect(io.err.join('')).toContain('SECRET'.length > 0 ? 'secrets must not be passed' : '');
    io = makeIo();
    expect(await cli(io, 'webhook', 'sign', '--secret=' + SECRET_HEX)).toBe(2);
    expect(allOutput(io)).not.toContain(SECRET_HEX);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--unrelatedzzzzzzzz', 'v')).toBe(2);
    expect(io.err.join('')).toContain('--help');
  });
  it('argument parser edge cases', async () => {
    let io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--in')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--in', '--key-stdin')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--in', 'a', '--in', 'b')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--key-stdin=1')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--in', 'a', 'stray')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign', '--', 'x')).toBe(2);
    io = makeIo();
    expect(await cli(io, 'invoice', 'sign')).toBe(2);
    expect(io.err.join('')).toContain('--in is required');
  });
  it('--json errors go to stderr as one JSON object', async () => {
    const io = makeIo();
    expect(await cli(io, 'invoce', '--json')).toBe(2);
    const e = JSON.parse(io.err.join('')) as { ok: boolean; error: { code: string; hint?: string } };
    expect(e.ok).toBe(false);
    expect(e.error.code).toBe('UNKNOWN_COMMAND');
    expect(io.out.join('')).toBe('');
    const noHint = makeIo();
    await cli(noHint, 'invoice', 'sign', '--in', 'x', '--json');
    expect(noHint.err.join('')).toContain('"ok":false');
  });
});

describe('invoice create / sign', () => {
  it('create unsigned prints invoice JSON with a deterministic nonce', async () => {
    const io = makeIo({ 'spec.json': spec({ signer: SIGNER }) });
    expect(await cli(io, 'invoice', 'create', '--in', 'spec.json')).toBe(0);
    const inv = JSON.parse(io.out.join('')) as { v: number; nonce: string; signer: string };
    expect(inv.v).toBe(1);
    expect(inv.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(inv.signer).toBe(SIGNER);
  });
  it('create signed with key from file, env, and stdin gives identical signatures', async () => {
    const sigs: string[] = [];
    for (const how of ['file', 'env', 'stdin']) {
      const io = makeIo({ 'spec.json': spec(), 'key.txt': `0x${KEY_HEX.toUpperCase()}\r\n` });
      io.env['MY_KEY'] = KEY_HEX;
      io.stdinText = KEY_HEX + '\n';
      const keyArgs = how === 'file' ? ['--key-file', 'key.txt'] : how === 'env' ? ['--key-env', 'MY_KEY'] : ['--key-stdin'];
      expect(await cli(io, 'invoice', 'create', '--in', 'spec.json', ...keyArgs, '--json')).toBe(0);
      const r = stdoutJson(io)['result'] as { signature: string; invoice: { signer: string } };
      expect(r.invoice.signer).toBe(SIGNER);
      sigs.push(r.signature);
      expect(allOutput(io)).not.toContain(KEY_HEX);
    }
    expect(new Set(sigs).size).toBe(1);
  });
  it('create reads spec from stdin with "-"', async () => {
    const io = makeIo({ 'key.txt': KEY_HEX });
    io.stdinText = spec();
    expect(await cli(io, 'invoice', 'create', '--in', '-', '--key-file', 'key.txt')).toBe(0);
  });
  it('rejects signer/key mismatch, unsigned spec without signer, non-object spec', async () => {
    const mismatch = makeIo({ 'spec.json': spec({ signer: SIGNER.replace(/.$/, '0') }), 'key.txt': KEY_HEX });
    expect(await cli(mismatch, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt')).toBe(1);
    expect(mismatch.err.join('')).toContain('SIGNER'.length ? 'does not match' : '');
    const nosigner = makeIo({ 'spec.json': spec() });
    expect(await cli(nosigner, 'invoice', 'create', '--in', 'spec.json')).toBe(1);
    const arr = makeIo({ 'spec.json': '[]' });
    expect(await cli(arr, 'invoice', 'create', '--in', 'spec.json')).toBe(2);
  });
  it('rejects float money and duplicate keys via strict JSON', async () => {
    const f = makeIo({ 'spec.json': spec().replace('"12345"', '12.5'), 'key.txt': KEY_HEX });
    expect(await cli(f, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt')).toBe(1);
    const dup = makeIo({ 'spec.json': '{"a":1,"a":2}', 'key.txt': KEY_HEX });
    expect(await cli(dup, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt')).toBe(1);
    const bad = makeIo({ 'spec.json': spec({ chainId: 0 }), 'key.txt': KEY_HEX });
    expect(await cli(bad, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt')).toBe(1);
    expect(bad.err.join('')).toContain('chainId');
  });
  it('sign: accepts bare invoice, errors on bad keys', async () => {
    const io = makeIo({ 'spec.json': spec({ signer: SIGNER }), 'key.txt': KEY_HEX });
    await cli(io, 'invoice', 'create', '--in', 'spec.json');
    io.files.set('inv.json', io.out.join(''));
    const s = makeIo({ 'inv.json': io.out.join(''), 'key.txt': KEY_HEX });
    expect(await cli(s, 'invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt', '--out', 'o.json')).toBe(0);
    expect(s.files.get('o.json')).toContain('"signature"');
    expect(s.out.join('')).toContain('wrote o.json');
    const other = makeIo({ 'inv.json': io.out.join(''), 'key.txt': `${'00'.repeat(31)}08` });
    expect(await cli(other, 'invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt')).toBe(1);
    for (const bad of ['xyz', '00'.repeat(31), '00'.repeat(33), '']) {
      const b = makeIo({ 'inv.json': io.out.join(''), 'key.txt': bad });
      expect(await cli(b, 'invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt')).toBe(2);
      if (bad.length > 3) expect(allOutput(b)).not.toContain(bad);
    }
    const nokey = makeIo({ 'inv.json': io.out.join('') });
    expect(await cli(nokey, 'invoice', 'sign', '--in', 'inv.json')).toBe(2);
    expect(nokey.err.join('')).toContain('--key-file PATH');
  });
});

describe('secret sources', () => {
  it('rejects multiple sources, env value pasted as name, unset env, stdin twice, io errors', async () => {
    const files = { 'inv.json': await unsignedInvoice(), 'key.txt': KEY_HEX };
    let io = makeIo(files);
    expect(await cli(io, 'invoice', 'sign', '--in', 'inv.json', '--key-file', 'key.txt', '--key-stdin')).toBe(2);
    io = makeIo(files);
    expect(await cli(io, 'invoice', 'sign', '--in', 'inv.json', '--key-env', KEY_HEX + '!')).toBe(2);
    expect(allOutput(io)).not.toContain(KEY_HEX);
    io = makeIo(files);
    expect(await cli(io, 'invoice', 'sign', '--in', 'inv.json', '--key-env', 'NOPE')).toBe(3);
    expect(io.err.join('')).toContain('NOPE is not set');
    io = makeIo(files);
    io.stdinText = files['inv.json'];
    expect(await cli(io, 'invoice', 'sign', '--in', '-', '--key-stdin')).toBe(2);
    expect(io.err.join('')).toContain('only one input');
    io = makeIo(files);
    expect(await cli(io, 'invoice', 'sign', '--in', 'missing.json', '--key-file', 'key.txt')).toBe(3);
    io = makeIo(files);
    io.failReads = true;
    io.stdinText = '';
    expect(await cli(io, 'invoice', 'create', '--in', '-')).toBe(3);
    expect(io.err.join('')).toContain('stdin');
  });
  it('oversize input is refused', async () => {
    const io = makeIo({ 'big.json': ' '.repeat(1_048_577) });
    expect(await cli(io, 'invoice', 'create', '--in', 'big.json')).toBe(3);
    expect(io.err.join('')).toContain('limit');
  });
});

describe('invoice verify and link', () => {
  it('round trip: sign -> verify (valid, unpinned) -> link -> verify link', async () => {
    const io = makeIo();
    const signed = await signedFile(io);
    const v = makeIo({ 'signed.json': signed });
    expect(await cli(v, 'invoice', 'verify', '--in', 'signed.json')).toBe(0);
    expect(v.out.join('')).toContain('signature : valid');
    expect(v.out.join('')).toContain('integrity only');
    expect(v.out.join('')).not.toContain('Consulting');

    const pin = makeIo({ 'signed.json': signed });
    expect(await cli(pin, 'invoice', 'verify', '--in', 'signed.json', '--pin', SIGNER, '--json')).toBe(0);
    expect(stdoutJson(pin)['trust']).toBe('trusted-seller');
    const wrongPin = makeIo({ 'signed.json': signed });
    await cli(wrongPin, 'invoice', 'verify', '--in', 'signed.json', '--pin', '02' + '11'.repeat(32), '--json');
    expect(stdoutJson(wrongPin)['trust']).toBe('valid-signature');

    for (const enc of [false, true]) {
      const l = makeIo({ 'signed.json': signed });
      expect(await cli(l, 'invoice', 'link', '--in', 'signed.json', '--base', 'https://pay.example/p', ...(enc ? ['--encrypt'] : []))).toBe(0);
      const link = l.out.join('').trim();
      expect(link.startsWith('https://pay.example/p#gpi=v1.')).toBe(true);
      expect(l.err.join('')).toContain(enc ? 'decryption key' : 'fragment');
      const lv = makeIo();
      lv.stdinText = link + '\n';
      expect(await cli(lv, 'invoice', 'verify', '--in', '-', '--pin', SIGNER, '--json')).toBe(0);
      const r = stdoutJson(lv);
      expect(r['encrypted']).toBe(enc);
      expect(r['trust']).toBe('trusted-seller');
      expect(JSON.stringify(r)).not.toContain('Consulting');
      // bare fragment works too
      const lf = makeIo({ 'frag.txt': link.slice(link.indexOf('#')) });
      expect(await cli(lf, 'invoice', 'verify', '--in', 'frag.txt')).toBe(0);
    }
  });
  it('tampered amount fails verification with exit 1 and a do-not-pay message', async () => {
    const io = makeIo();
    const signed = await signedFile(io);
    const t = makeIo({ 'signed.json': signed.replace('"12345"', '"1"') });
    expect(await cli(t, 'invoice', 'verify', '--in', 'signed.json')).toBe(1);
    expect(t.out.join('')).toContain('INVALID - do not pay');
    expect(t.out.join('')).not.toContain('note');
    const badSig = makeIo({ 'signed.json': signed.replace(/"signature": "[0-9a-f]{2}/, '"signature": "00') });
    expect(await cli(badSig, 'invoice', 'verify', '--in', 'signed.json', '--json')).toBe(1);
    expect(stdoutJson(badSig)['trust']).toBe('invalid-signature');
  });
  it('expired invoice and quote exit 1 / reported, using the injected clock', async () => {
    const io = makeIo();
    const signed = await signedFile(io);
    const late = makeIo({ 'signed.json': signed });
    late.now = NOW + 3600;
    expect(await cli(late, 'invoice', 'verify', '--in', 'signed.json', '--json')).toBe(1);
    expect(stdoutJson(late)).toMatchObject({ expired: true, quoteExpired: true, signatureValid: true, ok: false });
    const mid = makeIo({ 'signed.json': signed });
    mid.now = NOW + 601;
    expect(await cli(mid, 'invoice', 'verify', '--in', 'signed.json')).toBe(0);
    expect(mid.out.join('')).toContain('quote     : expired');
    const edge = makeIo({ 'signed.json': signed });
    edge.now = NOW + 3599;
    expect(await cli(edge, 'invoice', 'verify', '--in', 'signed.json')).toBe(0);
  });
  it('test chain is flagged; bad pin, unsigned input and garbage inputs are rejected', async () => {
    const io = makeIo({ 'spec.json': spec({ chainId: 31337 }), 'key.txt': KEY_HEX });
    await cli(io, 'invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 's.json');
    const v = makeIo({ 's.json': io.files.get('s.json') as string });
    await cli(v, 'invoice', 'verify', '--in', 's.json');
    expect(v.out.join('')).toContain('TEST chain');
    expect(await cli(makeIo({ 's.json': io.files.get('s.json') as string }), 'invoice', 'verify', '--in', 's.json', '--pin', 'zz')).toBe(2);
    const bare = makeIo({ 'i.json': spec({ signer: SIGNER }) });
    expect(await cli(bare, 'invoice', 'verify', '--in', 'i.json')).toBe(1);
    expect(await cli(makeIo({ 'g.txt': 'hello world' }), 'invoice', 'verify', '--in', 'g.txt')).toBe(1);
    expect(await cli(makeIo({ 'g.txt': 'https://pay.example/#gpi=v1.!!!' }), 'invoice', 'verify', '--in', 'g.txt')).toBe(1);
    expect(await cli(makeIo({ 'g.txt': '#gpi=v1.AAAA' }), 'invoice', 'verify', '--in', 'g.txt')).toBe(1);
    expect(await cli(makeIo({ 'g.txt': 'http://localhost/#gpi=v1.AAAA' }), 'invoice', 'verify', '--in', 'g.txt', '--allow-insecure-localhost')).toBe(1);
  });
  it('link refuses http bases, userinfo, unsigned input; allows localhost only when asked', async () => {
    const io = makeIo();
    const signed = await signedFile(io);
    const files = { 'signed.json': signed };
    expect(await cli(makeIo(files), 'invoice', 'link', '--in', 'signed.json', '--base', 'http://pay.example/')).toBe(1);
    expect(await cli(makeIo(files), 'invoice', 'link', '--in', 'signed.json', '--base', 'https://u:p@pay.example/')).toBe(1);
    expect(await cli(makeIo(files), 'invoice', 'link', '--in', 'signed.json', '--base', 'http://localhost:3000/')).toBe(1);
    const ok = makeIo(files);
    expect(await cli(ok, 'invoice', 'link', '--in', 'signed.json', '--base', 'http://localhost:3000/', '--allow-insecure-localhost', '--json')).toBe(0);
    expect(String(stdoutJson(ok)['link'])).toContain('http://localhost:3000/#gpi=v1.');
    expect(await cli(makeIo({ 'signed.json': await unsignedInvoice() }), 'invoice', 'link', '--in', 'signed.json', '--base', 'https://p.example/')).toBe(2);
    const noSig = makeIo(files);
    expect(await cli(noSig, 'invoice', 'link', '--in', 'signed.json', '--base', 'https://p.example/', '--out', 'l.txt')).toBe(0);
    expect(noSig.files.get('l.txt')).toContain('#gpi=v1.');
    expect(await cli(noSig, 'invoice', 'link', '--in', 'signed.json', '--base', 'https://p.example/', '--out', 'l.txt')).toBe(3);
    expect(noSig.err.join('')).toContain('--force');
    expect(await cli(noSig, 'invoice', 'link', '--in', 'signed.json', '--base', 'https://p.example/', '--out', 'l.txt', '--force')).toBe(0);
  });
  it('output refuses overwrite without --force, and reports write failures', async () => {
    const io = makeIo({ 'spec.json': spec({ signer: SIGNER }), 'out.json': 'old' });
    expect(await cli(io, 'invoice', 'create', '--in', 'spec.json', '--out', 'out.json')).toBe(3);
    expect(io.files.get('out.json')).toBe('old');
    expect(await cli(io, 'invoice', 'create', '--in', 'spec.json', '--out', 'out.json', '--force')).toBe(0);
    io.failWrites = true;
    expect(await cli(io, 'invoice', 'create', '--in', 'spec.json', '--out', 'x.json')).toBe(3);
  });
});

describe('webhook', () => {
  const body = '{"type":"invoice.paid","id":"evt_1"}';
  it('sign then verify; sign output is deterministic with an explicit nonce', async () => {
    const files = { 'body.json': body, 'sec.txt': SECRET_HEX };
    const s = makeIo(files);
    expect(await cli(s, 'webhook', 'sign', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--nonce', 'ab'.repeat(8), '--json')).toBe(0);
    const header = String(stdoutJson(s)['header']);
    expect(header).toBe(`t=${NOW},n=${'ab'.repeat(8)},v1=${header.split('v1=')[1] as string}`);
    expect(allOutput(s)).not.toContain(SECRET_HEX);

    const v = makeIo(files);
    expect(await cli(v, 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header', header)).toBe(0);
    expect(v.out.join('')).toContain('stateless');
    const vj = makeIo(files);
    await cli(vj, 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header', header, '--json');
    expect(stdoutJson(vj)).toMatchObject({ ok: true, replayChecked: false });

    const hf = makeIo({ ...files, 'h.txt': header + '\n' });
    expect(await cli(hf, 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header-file', 'h.txt')).toBe(0);
  });
  it('sign generates a random nonce when none is given; body read from stdin; secret from env', async () => {
    const io = makeIo({ 'sec.txt': SECRET_HEX });
    io.stdinText = body;
    io.env['WH'] = SECRET_HEX;
    expect(await cli(io, 'webhook', 'sign', '--body-file', '-', '--secret-env', 'WH', '--json')).toBe(0);
    expect(String(stdoutJson(io)['nonce'])).toMatch(/^[0-9a-f]{32}$/);
  });
  it('detects tampered body, wrong secret, stale timestamp, bad header; tolerance option', async () => {
    const files = { 'body.json': body, 'sec.txt': SECRET_HEX, 'other.txt': 'cd'.repeat(32) };
    const s = makeIo(files);
    await cli(s, 'webhook', 'sign', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--nonce', 'ab'.repeat(8));
    const header = s.out.join('').trim();
    const base = ['webhook', 'verify', '--body-file', 'body.json', '--header', header];
    const reason = async (io: TestIo, ...extra: string[]): Promise<string> => {
      const code = await cli(io, ...base, ...extra, '--json');
      expect(code).toBe(1);
      return String(stdoutJson(io)['reason']);
    };
    const tampered = makeIo({ ...files, 'body.json': body + ' ' });
    expect(await reason(tampered, '--secret-file', 'sec.txt')).toBe('bad-signature');
    expect(await reason(makeIo(files), '--secret-file', 'other.txt')).toBe('bad-signature');
    const stale = makeIo(files);
    stale.now = NOW + 301;
    expect(await reason(stale, '--secret-file', 'sec.txt')).toBe('stale');
    const within = makeIo(files);
    within.now = NOW + 301;
    expect(await cli(within, ...base, '--secret-file', 'sec.txt', '--tolerance', '400')).toBe(0);
    const bad = makeIo(files);
    expect(await cli(bad, 'webhook', 'verify', '--body-file', 'body.json', '--header', 'garbage', '--secret-file', 'sec.txt', '--json')).toBe(1);
    expect(stdoutJson(bad)['reason']).toBe('malformed');
    const human = makeIo(files);
    await cli(human, 'webhook', 'verify', '--body-file', 'body.json', '--header', 'garbage', '--secret-file', 'sec.txt');
    expect(human.out.join('')).toContain('INVALID: malformed');
  });
  it('input errors: short secret, both/neither header source, two stdin consumers, bad nonce', async () => {
    const files = { 'body.json': body, 'sec.txt': SECRET_HEX, 'short.txt': 'ab'.repeat(16) };
    expect(await cli(makeIo(files), 'webhook', 'sign', '--body-file', 'body.json', '--secret-file', 'short.txt')).toBe(2);
    expect(await cli(makeIo(files), 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt')).toBe(2);
    expect(await cli(makeIo(files), 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header', 'a', '--header-file', 'b')).toBe(2);
    const two = makeIo(files);
    two.stdinText = body;
    expect(await cli(two, 'webhook', 'sign', '--body-file', '-', '--secret-stdin')).toBe(2);
    const nonce = makeIo(files);
    expect(await cli(nonce, 'webhook', 'sign', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--nonce', 'XY')).toBe(1);
    expect(await cli(makeIo(files), 'webhook', 'verify', '--body-file', 'body.json', '--secret-file', 'sec.txt', '--header', 'x', '--tolerance', '-1')).toBe(2);
  });
});

describe('sub schedule', () => {
  it('Jan 31 monthly anchor clamps to Feb 28 without drifting', async () => {
    const io = makeIo();
    expect(await cli(io, 'sub', 'schedule', '--anchor', '2027-01-31T00:00:00Z', '--cadence', 'monthly:1', '--count', '4', '--json')).toBe(0);
    const periods = stdoutJson(io)['periods'] as { startIso: string }[];
    expect(periods.map((p) => p.startIso)).toEqual(['2027-01-31T00:00:00Z', '2027-02-28T00:00:00Z', '2027-03-31T00:00:00Z', '2027-04-30T00:00:00Z']);
  });
  it('weekly, custom, now, unix anchors, --from', async () => {
    const w = makeIo();
    await cli(w, 'sub', 'schedule', '--anchor', '1800000000', '--cadence', 'weekly:2', '--count', '2');
    expect(w.out.join('')).toContain('#0  2027-01-15T08:00:00Z -> 2027-01-29T08:00:00Z');
    const c = makeIo();
    expect(await cli(c, 'sub', 'schedule', '--anchor', 'now', '--cadence', 'custom:86400', '--from', '5', '--count', '1', '--json')).toBe(0);
    expect(stdoutJson(c)['periods']).toMatchObject([{ index: 5, start: NOW + 5 * 86400 }]);
  });
  it('rejects bad cadence, anchor, count and out-of-range schedule', async () => {
    const t = (...a: string[]): Promise<number> => cli(makeIo(), 'sub', 'schedule', ...a);
    expect(await t('--anchor', '0', '--cadence', 'daily:1')).toBe(2);
    expect(await t('--anchor', '2027-13-45T00:00:00Z', '--cadence', 'monthly:1')).toBe(2);
    expect(await t('--anchor', 'tomorrow', '--cadence', 'monthly:1')).toBe(2);
    expect(await t('--anchor', '0', '--cadence', 'monthly:1', '--count', '0')).toBe(2);
    expect(await t('--anchor', '0', '--cadence', 'monthly:1', '--count', '1.5')).toBe(2);
    expect(await t('--anchor', '0', '--cadence', 'monthly:99')).toBe(1);
    expect(await t('--anchor', '0', '--cadence', 'custom:5')).toBe(1);
    expect(await t('--cadence', 'monthly:1')).toBe(2);
  });
});

describe('split compute', () => {
  it('10001 base units over 3333/3333/3334 bps sums exactly', async () => {
    const io = makeIo();
    expect(await cli(io, 'split', 'compute', '--total', '10001', '--share', 'a=3333', '--share', 'b=3333', '--share', 'c=3334', '--json')).toBe(0);
    const shares = stdoutJson(io)['shares'] as { amount: string }[];
    expect(shares.map((s) => s.amount)).toEqual(['3333', '3333', '3335']);
    expect(shares.reduce((a, s) => a + BigInt(s.amount), 0n)).toBe(10001n);
  });
  it('decimal amounts, huge values and human output', async () => {
    const io = makeIo();
    expect(await cli(io, 'split', 'compute', '--amount', '100.50', '--decimals', '2', '--share', 'me=7000', '--share', 'you=3000')).toBe(0);
    expect(io.out.join('')).toContain('7035');
    expect(io.out.join('')).toContain('(70.35)');
    const big = makeIo();
    const total = (2n ** 256n - 1n).toString();
    expect(await cli(big, 'split', 'compute', '--total', total, '--share', 'x=5000', '--share', 'y=5000', '--json')).toBe(0);
    const amts = (stdoutJson(big)['shares'] as { amount: string }[]).map((s) => BigInt(s.amount));
    expect(amts[0]! + amts[1]!).toBe(2n ** 256n - 1n);
  });
  it('rejects bad sums, floats, duplicates, missing inputs, overflow', async () => {
    const t = (...a: string[]): Promise<number> => cli(makeIo(), 'split', 'compute', ...a);
    expect(await t('--total', '100', '--share', 'a=5000')).toBe(1);
    expect(await t('--total', '1.5', '--share', 'a=10000')).toBe(1);
    expect(await t('--total', '-5', '--share', 'a=10000')).toBe(1);
    expect(await t('--total', '5', '--share', 'a=5000', '--share', 'a=5000')).toBe(1);
    expect(await t('--total', '5', '--share', 'a')).toBe(2);
    expect(await t('--share', 'a=10000')).toBe(2);
    expect(await t('--total', '5', '--amount', '5', '--decimals', '2', '--share', 'a=10000')).toBe(2);
    expect(await t('--amount', '5', '--share', 'a=10000')).toBe(2);
    expect(await t('--total', '5')).toBe(2);
    expect(await t('--amount', '1.234', '--decimals', '2', '--share', 'a=10000')).toBe(1);
    expect(await t('--total', (2n ** 256n).toString(), '--share', 'a=10000')).toBe(1);
  });
});
