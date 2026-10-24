import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as browser from './browser.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Follows relative imports from `entry` and returns every bare/`node:` specifier reached. */
function externalImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const external = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1] as string;
      if (spec.startsWith('.')) visit(join(dirname(file), spec.replace(/\.js$/, '.ts')));
      else external.add(spec);
    }
  };
  visit(entry);
  return external;
}

describe('browser entry', () => {
  it('never reaches a Node built-in, so the web bundle can import it', () => {
    const ext = [...externalImports(join(here, 'browser.ts'))];
    expect(ext.filter((s) => s.startsWith('node:') || ['net', 'tls', 'http', 'dns'].includes(s))).toEqual([]);
    expect(ext.length).toBeGreaterThan(0);
  });

  it('exposes the fetch transport, onion check and the normative notices', () => {
    expect(typeof browser.createFetchTransport).toBe('function');
    expect(typeof browser.transportToFetch).toBe('function');
    expect(typeof browser.isValidV3OnionHost).toBe('function');
    expect(typeof browser.assertTestnet).toBe('function');
    expect(browser.FIRST_USE_NOTICE).toMatch(/not what you send/);
    expect(browser.TOR_BROWSER_NOTICE).toMatch(/cannot verify/);
    expect(browser.PROFILE_LABELS['tor-browser'].doesNotHide).toContain(browser.TOR_BROWSER_NOTICE);
  });
});
