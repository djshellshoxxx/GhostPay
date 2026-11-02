import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('release metadata records web inputs and leaves later attestation unrecorded', () => {
  const root = mkdtempSync(join(tmpdir(), 'ghostpay-manifest-test-'));
  try {
    for (const dir of ['scripts', 'deployments', 'apps/web/deployments', 'apps/web/configured', 'empty', 'out']) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    const script = join(root, 'scripts/gen-release-manifest.mjs');
    copyFileSync(new URL('../gen-release-manifest.mjs', import.meta.url), script);
    writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(root, 'out/web.tar.gz'), 'authored artifact');
    writeFileSync(join(root, 'out/sbom.json'), '{}');
    writeFileSync(join(root, 'deployments/31337.json'), JSON.stringify({ chainId: 31337 }));
    writeFileSync(join(root, 'apps/web/deployments/84532.json'), JSON.stringify({ chainId: 84532 }));
    writeFileSync(join(root, 'apps/web/configured/1.json'), JSON.stringify({ chainId: 1 }));
    const run = (directory) => {
      const env = { ...process.env };
      delete env.GHOSTPAY_DEPLOYMENTS_DIR;
      if (directory !== undefined) env.GHOSTPAY_DEPLOYMENTS_DIR = directory;
      const result = spawnSync(process.execPath, [script, '--out-dir', join(root, 'out'), '--tarball', 'web.tar.gz',
        '--version', 'candidate', '--commit', 'a'.repeat(40), '--source-date-epoch', '1',
        '--lockfile', join(root, 'package-lock.json'), '--sbom', 'sbom.json'], { encoding: 'utf8', env });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const normal = run();
    assert.deepEqual(normal.chains.deploymentManifests.map((m) => m.chainId), [84532]);
    assert.equal(normal.chains.deploymentManifests[0].file, 'bundled-deployments/84532.json');
    assert.match(normal.provenance.attestation, /^not-recorded/);
    assert.ok(normal.unrecordedFields.includes('provenance.attestation'));
    assert.deepEqual(run('configured').chains.deploymentManifests.map((m) => m.chainId), [1]);
    assert.deepEqual(run(join(root, 'apps/web/configured')).chains.deploymentManifests.map((m) => m.chainId), [1]);
    const empty = run(join(root, 'empty'));
    assert.deepEqual(empty.chains.deploymentManifests, []);
    assert.match(empty.chains.note, /no deployment manifests included/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
