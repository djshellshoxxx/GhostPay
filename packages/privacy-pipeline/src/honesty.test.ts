import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAIN_RULES } from './chainRules.js';
import { STEP_CATALOGUE, normalizeParams } from './steps.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcFiles = readdirSync(here).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'),
);
const read = (f: string): string => readFileSync(join(here, f), 'utf8');

describe('PL-1: no I/O, clock, randomness or crypto imports in src (outside tests)', () => {
  const bans: [string, RegExp][] = [
    ['fetch', /\bfetch\s*\(/],
    ['node: import', /from\s+['"]node:/],
    ['require', /\brequire\s*\(/],
    ['Date', /\bnew Date\b|\bDate\.now\b/],
    ['Math.random', /Math\.random/],
    ['crypto', /\bcrypto\b/],
    ['process', /\bprocess\./],
    ['timers', /\bset(Timeout|Interval|Immediate)\b/],
    ['console', /\bconsole\./],
    ['XMLHttpRequest/WebSocket', /\b(XMLHttpRequest|WebSocket)\b/],
  ];
  for (const f of srcFiles) {
    it(`${f}`, () => {
      const src = read(f);
      for (const [name, re] of bans) expect(re.test(src), `${f} uses ${name}`).toBe(false);
    });
  }
  it('imports are relative or @noble/hashes only (no method package, no profile package)', () => {
    for (const f of srcFiles) {
      for (const m of read(f).matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1] as string;
        expect(
          spec.startsWith('./') || spec === '@noble/hashes/sha2.js' || spec === '@noble/hashes/utils.js',
          `${f}: ${spec}`,
        ).toBe(true);
      }
    }
  });
});

describe('PP-9 / CL-4: banned words appear nowhere in src, keys or ids', () => {
  const banned =
    /\b(anonymous|anonymity|untraceable|unlinkable|mix|mixing|launder|laundering|obfuscate|obfuscation)\b/i;
  for (const f of srcFiles) {
    it(`${f}`, () => {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => expect(banned.test(line), `${f}:${i + 1}`).toBe(false));
    });
  }
  it('rule keys, step ids and copy keys are clean', () => {
    const all = [...CHAIN_RULES.map((r) => `${r.id} ${r.key ?? ''}`), ...Object.keys(STEP_CATALOGUE)];
    for (const k of all) expect(banned.test(k)).toBe(false);
    for (const d of Object.values(STEP_CATALOGUE)) {
      const { params } = normalizeParams(d.kind, undefined);
      for (const key of [...d.doesNotHide(params), ...d.trust(params), ...d.strength(params)])
        expect(banned.test(key)).toBe(false);
    }
  });
  it('the only anonymity-related key is the standing disclaimer, as a reveal', () => {
    const keys = new Set(
      srcFiles.flatMap((f) =>
        [...read(f).matchAll(/privacy\.[A-Za-z.]*[Aa]nonym[A-Za-z]*/g)].map((m) => m[0]),
      ),
    );
    expect([...keys]).toEqual(['privacy.warn.noAnonymity']);
  });
});

describe('package.json', () => {
  it('has the single pinned runtime dependency and no workspace dependency on another privacy package', () => {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({ '@noble/hashes': '2.4.0' });
  });
});
