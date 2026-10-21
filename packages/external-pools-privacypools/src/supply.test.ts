import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string>; license: string; private: boolean };

describe('supply chain (EP-SUP-2, EP-SUP-4)', () => {
  it('pins every dependency to an exact version', () => {
    for (const [name, v] of [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies)]) {
      if (name.startsWith('@ghostpay/')) continue;
      expect(v, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(pkg.dependencies['@0xbow/privacy-pools-core-sdk']).toBe('1.5.0');
    expect(pkg.private).toBe(true);
    expect(pkg.license).toBe('UNLICENSED');
  });
  it('imports the SDK only dynamically, from sdk-crypto.ts', () => {
    const dir = join(root, 'src');
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f.endsWith('.testutil.ts')) continue;
      const text = readFileSync(join(dir, f), 'utf8');
      const staticImport = /^import\s+(?!type\b)[^;]*from\s+['"]@0xbow\/privacy-pools-core-sdk['"]/m.test(text);
      expect(staticImport, `${f} imports the SDK statically`).toBe(false);
    }
    expect(readFileSync(join(dir, 'sdk-crypto.ts'), 'utf8')).toContain("await import('@0xbow/privacy-pools-core-sdk')");
  });
  it('the build script never runs third-party install scripts', () => {
    expect(Object.keys(pkg.scripts)).not.toContain('postinstall');
    expect(Object.keys(pkg.scripts)).not.toContain('preinstall');
  });
});
