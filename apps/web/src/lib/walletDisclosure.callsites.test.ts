import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The library gate is opt-in (no gate: requests go straight to the wallet), so the app must pass it at every
// connection. Test approvers would not notice a call site that forgot it; this source check does.

const SRC = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('every production wallet connection passes the disclosure gate', () => {
  const calls = sources(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const found: { readonly file: string; readonly call: string }[] = [];
    for (const match of text.matchAll(/\bconnectWallet\(/g)) {
      const start = match.index;
      // Skip the definition itself.
      if (/function\s+$/.test(text.slice(Math.max(0, start - 20), start))) continue;
      let depth = 0;
      let end = start + 'connectWallet('.length - 1;
      for (; end < text.length; end++) {
        if (text[end] === '(') depth++;
        else if (text[end] === ')' && --depth === 0) break;
      }
      found.push({ file: relative(SRC, file), call: text.slice(start, end + 1) });
    }
    return found;
  });

  it('finds the known call sites', () => {
    expect(calls.map((c) => c.file).sort()).toEqual(['features/policy/PolicyView.tsx', 'features/registry/RegistryView.tsx', 'views/Pay.tsx'].map((f) => f.replace(/\//g, process.platform === 'win32' ? '\\' : '/')).sort());
  });

  it.each(['disclosure:'])('each call passes %s', (needle) => {
    for (const { file, call } of calls) expect({ file, passesGate: call.includes(needle) }).toEqual({ file, passesGate: true });
  });
});
