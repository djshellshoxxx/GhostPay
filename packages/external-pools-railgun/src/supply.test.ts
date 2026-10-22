import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string>; license: string; private: boolean };

describe('supply chain (EP-SUP-3, EP-SUP-4)', () => {
  it('pins every dependency to an exact version and bundles no Railgun SDK', () => {
    for (const [name, v] of [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies)]) {
      if (name.startsWith('@ghostpay/')) continue;
      expect(v, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(Object.keys(pkg.dependencies).filter((d) => d.startsWith('@railgun-community/'))).toEqual([]);
    expect(pkg.private).toBe(true);
    expect(pkg.license).toBe('UNLICENSED');
    expect(Object.keys(pkg.scripts)).not.toContain('postinstall');
  });
});
