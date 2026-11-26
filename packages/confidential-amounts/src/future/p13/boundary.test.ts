import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..', '..');
const sources = readdirSync(here)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'))
  // Comments are stripped so documentation may name the APIs it rules out.
  .map((f) => ({ f, text: readFileSync(join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }));

describe('P13 release boundary (default off, outside the lean artifact)', () => {
  it('is not exported from the package entry or the exports map', () => {
    const index = readFileSync(join(pkgRoot, 'src', 'index.ts'), 'utf8');
    expect(index).not.toMatch(/future/);
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, unknown> };
    expect(Object.keys(pkg.exports)).toEqual(['.']);
  });

  it('has no ambient network, storage, logging or SDK access in production sources', () => {
    const banned = [
      /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /navigator\.sendBeacon/, /\blocalStorage\b/,
      /\bsessionStorage\b/, /\bindexedDB\b/, /\bconsole\./, /@zama-fhe/, /\bimport\s*\(/, /Math\.random/, /postMessage/,
    ];
    expect(sources.length).toBeGreaterThanOrEqual(13);
    for (const { f, text } of sources) {
      for (const re of banned) expect(re.test(text), `${f} matches ${String(re)}`).toBe(false);
    }
  });

  it('imports only viem, invoice-schema and this package', () => {
    for (const { f, text } of sources) {
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const spec = m[1] ?? '';
        expect(spec === 'viem' || spec === '@ghostpay/invoice-schema' || spec.startsWith('.'), `${f}: ${spec}`).toBe(true);
      }
    }
  });
});
