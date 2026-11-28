import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../packages/contracts/scripts/pre-deploy-check.sh', import.meta.url));
const token = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';

function preflight(fee, acknowledgement) {
  const env = {
    PATH: process.env.PATH,
    FEE_RECIPIENT: '0x0000000000000000000000000000000000000002',
    FEE_TOKEN: token,
    FLAT_FEE: fee,
    MAX_FLAT_FEE: '10',
    FEE_TOKEN_FREEZE_ACK: acknowledgement,
  };
  const result = spawnSync('bash', [script, 'policy'], { env, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('positive fees require the exact token spelling used by the deployment script', () => {
  assert.equal(preflight('01', token).status, 0);
  for (const acknowledgement of ['', token.toLowerCase(), '0x0000000000000000000000000000000000000003']) {
    const result = preflight('01', acknowledgement);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL +FLAT_FEE != 0 needs|FAIL +FEE_TOKEN_FREEZE_ACK must exactly match/);
  }
});

test('zero fees need no acknowledgement and invalid fees never report zero', () => {
  assert.equal(preflight('000', '').status, 0);
  for (const fee of ['', 'invalid']) {
    const result = preflight(fee, '');
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /FLAT_FEE is 0/);
  }
});
