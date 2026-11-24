import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('targeted workspace build includes dependencies and omits unrelated applications', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ghostpay-cli-build-'));
  try {
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'apps')); await mkdir(join(root, 'packages'));
    await copyFile(fileURLToPath(new URL('../build-workspaces.mjs', import.meta.url)), join(root, 'scripts', 'build-workspaces.mjs'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'test-root', private: true, workspaces: ['packages/*', 'apps/*'] }));
    for (const [name, dependencies] of [['dependency', {}], ['cli', { '@test/dependency': '1.0.0' }], ['unrelated', {}]]) {
      const dir = join(root, 'packages', name); await mkdir(dir);
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@test/' + name, version: '1.0.0', dependencies, scripts: { build: 'node build.cjs' } }));
      await writeFile(join(dir, 'build.cjs'), 'console.log("BUILT:" + process.env.npm_package_name);\n');
    }
    const result = spawnSync(process.execPath, [join(root, 'scripts/build-workspaces.mjs'), '--workspace', '@test/cli'], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual([...result.stdout.matchAll(/BUILT:([^\r\n]+)/g)].map(m => m[1]), ['@test/dependency', '@test/cli']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
