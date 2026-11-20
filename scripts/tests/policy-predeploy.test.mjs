import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../packages/contracts/scripts/pre-deploy-check.sh', import.meta.url));
const token = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const otherToken = '0x3333333333333333333333333333333333333333';

function preflight(overrides = {}) {
  // No inherited RPC URL, signer, shell startup file, or dry-run switch. These
  // cases execute only the deployment helper's offline configuration checks.
  const result = spawnSync('bash', [script, 'policy'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      FEE_RECIPIENT: recipient,
      FEE_TOKEN: token,
      FLAT_FEE: '3000000',
      MAX_FLAT_FEE: '3000000',
      ...overrides,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

for (const fee of ['1', '0001', '3000000', '999999999999999999999999999999999999999']) {
  test(`fee ${fee} is rejected without a token-specific acknowledgement`, () => {
    const result = preflight({ FLAT_FEE: fee, MAX_FLAT_FEE: fee });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /FEE_TOKEN_FREEZE_ACK/);
    assert.match(result.stdout, /RESULT: FAILED/);
  });
}

for (const acknowledgement of [otherToken, 'yes', 'true', '0x123', ` ${token}`, `${token}\n`]) {
  test(`rejects a fee acknowledgement that does not name the configured token (${JSON.stringify(acknowledgement)})`, () => {
    const result = preflight({ FEE_TOKEN_FREEZE_ACK: acknowledgement });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /FEE_TOKEN_FREEZE_ACK does not name FEE_TOKEN/);
  });
}

test('a matching token acknowledgement permits the offline preflight only', () => {
  const result = preflight({ FEE_TOKEN_FREEZE_ACK: token });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /RPC_URL not set/);
  assert.match(result.stdout, /nothing was broadcast/);
});

test('the acknowledgement stays bound to the configured token after a token change', () => {
  const result = preflight({ FEE_TOKEN: otherToken, FEE_TOKEN_FREEZE_ACK: token });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FEE_TOKEN_FREEZE_ACK does not name FEE_TOKEN/);
});

for (const fee of ['0', '0000']) {
  test(`zero fee ${fee} requires no acknowledgement`, () => {
    const result = preflight({ FLAT_FEE: fee, MAX_FLAT_FEE: '0' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /nothing was broadcast/);
  });
}

for (const [name, overrides, expected] of [
  ['missing token', { FEE_TOKEN: '', FEE_TOKEN_FREEZE_ACK: '' }, /FEE_TOKEN unset, zero or not an address/],
  ['zero token', { FEE_TOKEN: '0x0000000000000000000000000000000000000000', FEE_TOKEN_FREEZE_ACK: '0x0000000000000000000000000000000000000000' }, /FEE_TOKEN unset, zero or not an address/],
  ['malformed token', { FEE_TOKEN: 'invalid', FEE_TOKEN_FREEZE_ACK: 'invalid' }, /FEE_TOKEN unset, zero or not an address/],
  ['missing fee', { FLAT_FEE: '' }, /FLAT_FEE unset or not a decimal integer/],
  ['negative fee', { FLAT_FEE: '-1' }, /FLAT_FEE unset or not a decimal integer/],
  ['fractional fee', { FLAT_FEE: '1.5' }, /FLAT_FEE unset or not a decimal integer/],
  ['missing cap', { MAX_FLAT_FEE: '' }, /MAX_FLAT_FEE unset or not a decimal integer/],
  ['fee above cap', { FLAT_FEE: '3000001' }, /exceeds MAX_FLAT_FEE/],
]) {
  test(`matching acknowledgement cannot bypass ${name}`, () => {
    const result = preflight({ FEE_TOKEN_FREEZE_ACK: token, ...overrides });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, expected);
    assert.doesNotMatch(result.stdout, /FLAT_FEE is 0/);
  });
}
