// Regression tests for scripts/check-tx-origin.sh (spec 04): fixture trees in a temp dir, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../check-tx-origin.sh', import.meta.url));

function run(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay-tx-origin-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    return spawnSync('bash', [script, dir], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const out = (r) => r.stdout + r.stderr;

test('tx.origin in packages/*/src fails with file:line', () => {
  const r = run({ 'packages/a/src/A.sol': 'contract A {\n  function f() external view { require(tx.origin == msg.sender); }\n}\n' });
  assert.equal(r.status, 1);
  assert.match(out(r), /packages\/a\/src\/A\.sol:2/);
});

test('tx.origin in packages/*/contracts also fails', () => {
  const r = run({ 'packages/b/contracts/B.sol': 'contract B { address o = tx.origin; }\n' });
  assert.equal(r.status, 1);
  assert.match(out(r), /packages\/b\/contracts\/B\.sol:1/);
});

test('src/lib and contracts/lib are scanned (deployed library code is not vendored code)', () => {
  const r = run({ 'packages/pool/src/lib/L.sol': 'library L { function f() internal view returns (address) { return tx.origin; } }\n' });
  assert.equal(r.status, 1);
  assert.match(out(r), /packages\/pool\/src\/lib\/L\.sol:1/);
  const c = run({ 'packages/pool/contracts/lib/L.sol': 'library L { address o = tx.origin; }\n' });
  assert.equal(c.status, 1);
});

test('pure line comments and block-comment bodies are ignored', () => {
  const r = run({
    'packages/a/src/A.sol': [
      '/// - No `tx.origin` assumptions.',
      '// tx.origin is never used',
      '  // indented tx.origin comment',
      '/*',
      ' * tx.origin in a block comment',
      ' */',
      '/** NatSpec that mentions tx.origin */',
      'contract A { uint256 x; }',
      '',
    ].join('\n'),
  });
  assert.equal(r.status, 0, out(r));
});

test('fail-closed: code lines that only look like comments are still checked', () => {
  const cases = {
    'trailing comment on a code line': 'contract A { uint256 x; } // no tx.origin here\n',
    'code after a one-line block comment': 'contract A { function f() external view { /* multi */ address b = tx.origin; } }\n',
    'star-prefixed continuation of an expression': 'contract A { function f() external view returns (uint256) { return 1\n    * uint256(uint160(tx.origin)); } }\n',
    'string containing // before the use': 'contract A { function f() external view { string memory s = "http://y"; require(tx.origin == msg.sender); } }\n',
    'code after the closing of a multi-line block': 'contract A {\n/*\n comment\n*/ address o = tx.origin;\n}\n',
  };
  for (const [name, body] of Object.entries(cases)) {
    const r = run({ 'packages/a/src/A.sol': body });
    assert.equal(r.status, 1, `${name}: ${out(r)}`);
    assert.match(out(r), /packages\/a\/src\/A\.sol:\d+/, name);
  }
});

test('test and script directories are excluded', () => {
  const body = 'contract T { address o = tx.origin; }\n';
  const r = run({
    'packages/a/src/test/T.sol': body,
    'packages/a/src/script/S.sol': body,
    'packages/a/test/T.t.sol': body,
    'packages/a/script/D.s.sol': body,
    'packages/a/lib/forge-std/src/Vm.sol': body,
    'packages/a/src/Clean.sol': 'contract C {}\n',
  });
  assert.equal(r.status, 0, out(r));
});

test('clean tree and tree with no Solidity pass', () => {
  assert.equal(run({ 'packages/a/src/A.sol': 'contract A {}\n' }).status, 0);
  assert.equal(run({ 'README.md': 'x\n' }).status, 0);
});
