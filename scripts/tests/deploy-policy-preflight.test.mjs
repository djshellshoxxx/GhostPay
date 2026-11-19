import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';

const preflight = fileURLToPath(new URL('../../packages/contracts/scripts/pre-deploy-check.sh', import.meta.url));
// Synthetic EIP-55 addresses. No RPC or signing key is provided to these offline probes.
const token = '0x52908400098527886E0F7030069857D2E4169EE7';
const otherToken = '0x8617E340B3D01FA5F11F306F4090FD50E238070D';
const recipient = '0xde709f2102306220921060314715629080e2fb77';
// Golden vector independently computed with pinned Foundry cast 1.8.5. The Solidity suite
// checks the same vector; this fixture only stands in for read-only RPC/cast subprocesses.
const domain = '0x1b9fe7797f01367677d7613890befcb0d387ad41b124547110228379528d507d';
const codehash = '0x309c67890bde4c575dc23d2cc3b5c3a3d599e312e980e9b61b5bc8f3cd87c8bb';
const encoded = '0x1b9fe7797f01367677d7613890befcb0d387ad41b124547110228379528d507d0000000000000000000000000000000000000000000000000000000000aa36a700000000000000000000000052908400098527886e0f7030069857d2e4169ee7309c67890bde4c575dc23d2cc3b5c3a3d599e312e980e9b61b5bc8f3cd87c8bb00000000000000000000000000000000000000000000000000000000002dc6c0000000000000000000000000de709f2102306220921060314715629080e2fb77';
const configAck = '0x2a07bdbd15b95b9da2f9a83416c3087deec5b8ae7a26a77c183bfb97411498dc';
const bin = mkdtempSync(join(tmpdir(), 'ghostpay-policy-preflight-'));
after(() => rmSync(bin, { recursive: true, force: true }));
writeFileSync(join(bin, 'cast'), `#!/bin/bash
if [[ "\${MOCK_CAST_FAIL:-}" == "$1" ]]; then exit 1; fi
case "$1" in
  chain-id) printf '%s\\n' "\${MOCK_CHAIN_ID:-11155111}" ;;
  code)
    if [[ "\${2,,}" == '${token.toLowerCase()}' ]]; then printf '%s\\n' "\${MOCK_TOKEN_CODE:-0x6001}"
    else printf '0x\\n'; fi ;;
  to-check-sum-address)
    if [[ "\${2,,}" == '${token.toLowerCase()}' ]]; then printf '%s\\n' '${token}'
    elif [[ "\${2,,}" == '${recipient.toLowerCase()}' ]]; then printf '%s\\n' '${recipient}'
    else exit 1; fi ;;
  call) if [[ "$3" == decimals* ]]; then printf '6\\n'; else printf '"FEE"\\n'; fi ;;
  format-units) printf '3\\n' ;;
  keccak)
    case "$2" in
      GhostPay.DeployPolicy.FeeTokenFreezeAck.v1) printf '%s\\n' '${domain}' ;;
      0x6001) printf '%s\\n' '${codehash}' ;;
      '${encoded}') printf '%s\\n' '${configAck}' ;;
      *) exit 1 ;;
    esac ;;
  abi-encode)
    if [[ "$*" == 'abi-encode f(bytes32,uint256,address,bytes32,uint256,address) ${domain} 11155111 ${token} ${codehash} 3000000 ${recipient}' ]]; then
      printf '%s\\n' '${encoded}'
    else exit 1; fi ;;
  *) exit 1 ;;
esac
`, { mode: 0o700 });

function run(vars = {}) {
  const result = spawnSync('bash', [preflight, 'policy'], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      LC_ALL: 'C',
      FEE_RECIPIENT: recipient,
      FEE_TOKEN: token,
      FLAT_FEE: '3000000',
      MAX_FLAT_FEE: '3000000',
      FEE_TOKEN_FREEZE_ACK_CONFIG: configAck,
      RPC_URL: 'https://offline.invalid',
      ...vars,
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('nonzero policy fee needs the configured token acknowledgment', () => {
  for (const ack of ['', otherToken, 'not-an-address']) {
    const result = run({ FEE_TOKEN_FREEZE_ACK: ack });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /FAIL .*FEE_TOKEN_FREEZE_ACK/);
  }
  const accepted = run({ FEE_TOKEN_FREEZE_ACK: token });
  assert.equal(accepted.status, 0, accepted.output);
});

test('preflight rejects the nonchecksummed acknowledgment rejected by DeployPolicy', () => {
  const result = run({ FEE_TOKEN_FREEZE_ACK: token.toLowerCase() });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL .*FEE_TOKEN_FREEZE_ACK/);
  const bothLower = run({ FEE_TOKEN: token.toLowerCase(), FEE_TOKEN_FREEZE_ACK: token.toLowerCase() });
  assert.equal(bothLower.status, 1, bothLower.output);
  assert.match(bothLower.output, /FEE_TOKEN must use its exact EIP-55 spelling/);
});

test('changing the configured token invalidates an earlier acknowledgment', () => {
  const result = run({ FEE_TOKEN: otherToken, FEE_TOKEN_FREEZE_ACK: token });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL .*FEE_TOKEN_FREEZE_ACK/);
});

test('zero fees skip acknowledgment while padded nonzero fees still require it', () => {
  for (const fee of ['0', '000000']) {
    const result = run({ FLAT_FEE: fee, MAX_FLAT_FEE: '0' });
    assert.equal(result.status, 0, result.output);
  }
  const result = run({ FLAT_FEE: '000001', MAX_FLAT_FEE: '1' });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL .*FEE_TOKEN_FREEZE_ACK/);
});

test('acknowledgment does not bypass fee bounds or malformed fee inputs', () => {
  for (const vars of [
    { FLAT_FEE: '3000001' },
    { FLAT_FEE: '-1' },
    { FLAT_FEE: 'bad' },
    { MAX_FLAT_FEE: '' },
  ]) {
    const result = run({ FEE_TOKEN_FREEZE_ACK: token, ...vars });
    assert.equal(result.status, 1, result.output);
  }
});

test('nonzero fee requires an exact configuration digest and actual chain/code readback', () => {
  for (const vars of [
    { FEE_TOKEN_FREEZE_ACK_CONFIG: '' },
    { FEE_TOKEN_FREEZE_ACK_CONFIG: 'invalid' },
    { FEE_TOKEN_FREEZE_ACK_CONFIG: `0x${'00'.repeat(32)}` },
    { RPC_URL: '' },
    { MOCK_CAST_FAIL: 'chain-id' },
    { MOCK_CAST_FAIL: 'code' },
    { MOCK_CAST_FAIL: 'keccak' },
    { MOCK_CAST_FAIL: 'abi-encode' },
    { MOCK_CHAIN_ID: '84532' },
    { MOCK_TOKEN_CODE: '0x' },
  ]) {
    const result = run({ FEE_TOKEN_FREEZE_ACK: token, ...vars });
    assert.equal(result.status, 1, result.output);
  }
  const accepted = run({ FEE_TOKEN_FREEZE_ACK: token });
  assert.equal(accepted.status, 0, accepted.output);
  assert.match(accepted.output, /FEE_TOKEN_FREEZE_ACK_CONFIG matches the actual deployment configuration/);
});

test('zero fee retains offline preflight without either acknowledgment', () => {
  const result = run({ FLAT_FEE: '0', MAX_FLAT_FEE: '0', RPC_URL: '', FEE_TOKEN_FREEZE_ACK_CONFIG: '' });
  assert.equal(result.status, 0, result.output);
});
