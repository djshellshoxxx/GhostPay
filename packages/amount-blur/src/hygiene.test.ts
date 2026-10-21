import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'));

describe('AB-P1 package hygiene', () => {
  it('finds the source files', () => expect(sources.length).toBeGreaterThan(8));
  it('no network, fs, storage, clock, timers or weak randomness in src', () => {
    const banned = [
      /Date\.now/, /new Date\(/, /Math\.random/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bfetch\(/, /XMLHttpRequest/, /WebSocket/,
      /localStorage/, /sessionStorage/, /indexedDB/, /node:fs/, /node:net/, /node:http/, /node:child_process/, /performance\.now/, /process\.env/, /console\./,
    ];
    for (const f of sources) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const re of banned) expect(`${f}: ${re.test(text)}`).toBe(`${f}: false`);
    }
  });
  it('src copy uses no forbidden claim words outside negation', async () => {
    const { findForbiddenWords } = await import('./copy.js');
    for (const f of sources.filter((x) => x === 'copy.ts')) {
      const text = readFileSync(join(dir, f), 'utf8');
      const strings = [...text.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? '').filter((s) => s.includes(' '));
      expect(strings.length).toBeGreaterThan(5);
      for (const s of strings) if (!s.startsWith('Lint') ) expect(findForbiddenWords(s)).toEqual([]);
    }
  });
});
