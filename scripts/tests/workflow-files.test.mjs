import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// No YAML dependency is declared, so check the top-level structure by line shape.
const dir = new URL('../../.github/workflows/', import.meta.url);

test('every file in .github/workflows is a mapping with on and jobs (A5-2)', () => {
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    const lines = readFileSync(new URL(f, dir), 'utf8').split('\n');
    const first = lines.find((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));
    assert.ok(first && !/^\s*-\s/.test(first), `${f} is a sequence, not a mapping`);
    assert.ok(lines.some((l) => /^(on|'on'|"on"):/.test(l)), `${f} missing top-level on`);
    assert.ok(lines.some((l) => /^jobs:/.test(l)), `${f} missing top-level jobs`);
  }
});
