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

// Accept the two reviewed final-options spellings only when their value comes from the local disclosure hook.
function passesDisclosure(call: string, source: string): boolean {
  if (/,\s*\{\s*disclosure\s*:\s*walletDisclosure\s*\}\s*\)$/.test(call)) {
    return /\bconst\s+walletDisclosure\s*=\s*useWalletDisclosure\(\s*\)\s*;/.test(source);
  }
  return /,\s*\{\s*disclosure\s*\}\s*\)$/.test(call) &&
    /\bconst\s+disclosure\s*=\s*useWalletDisclosure\(\s*\)\s*;/.test(source);
}

describe('every production wallet connection passes the disclosure gate', () => {
  const calls = sources(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const found: { readonly file: string; readonly call: string; readonly source: string }[] = [];
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
      found.push({ file: relative(SRC, file), call: text.slice(start, end + 1), source: text });
    }
    return found;
  });

  it('finds the known call sites', () => {
    expect(calls.map((c) => c.file).sort()).toEqual(['components/WalletAttempts.tsx', 'features/policy/PolicyView.tsx', 'features/registry/RegistryView.tsx', 'views/Pay.tsx'].map((f) => f.replace(/\//g, process.platform === 'win32' ? '\\' : '/')).sort());
  });

  it('each call passes its hook-backed disclosure option', () => {
    for (const { file, call, source } of calls) expect({ file, passesGate: passesDisclosure(call, source) }).toEqual({ file, passesGate: true });
  });

  const hooks = 'const walletDisclosure = useWalletDisclosure(); const disclosure = useWalletDisclosure();';
  it.each([
    ['omitted options', 'connectWallet(w, chainId)', hooks],
    ['empty options', 'connectWallet(w, chainId, undefined, undefined, {})', hooks],
    ['undefined gate', 'connectWallet(w, chainId, undefined, undefined, { disclosure: undefined })', hooks],
    ['unbound shorthand', 'connectWallet(w, chainId, undefined, undefined, { disclosure })', 'const disclosure = undefined;'],
    ['unbound explicit value', 'connectWallet(w, chainId, undefined, undefined, { disclosure: walletDisclosure })', 'const walletDisclosure = undefined;'],
  ])('rejects %s', (_label, call, source) => {
    expect(passesDisclosure(call, source)).toBe(false);
  });
});
