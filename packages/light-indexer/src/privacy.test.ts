import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static guards for the service's privacy rules (docs/threat-model/light-indexer-delta.md). They complement the
// behavioral tests: the server must not be able to log or retain client network identity or per-request data.
const SRC = import.meta.dirname;
const sources = readdirSync(SRC)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'))
  .map((f) => ({ f, text: readFileSync(join(SRC, f), 'utf8') }));

describe('privacy guards (source)', () => {
  it('no source reads client network identity or forwarding headers', () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/remoteAddress|remotePort|x-forwarded|x-real-ip|['"]forwarded['"]|cf-connecting-ip|user-agent|\.socket\b/i);
    }
  });
  it('no source writes request logs: console is unused and only the CLI writes fixed status lines', () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/console\./);
      if (f !== 'cli.ts') expect(text, f).not.toMatch(/process\.(stdout|stderr)/);
    }
  });
  it('no source stores time per request', () => {
    const server = sources.find((s) => s.f === 'server.ts')?.text ?? '';
    expect(server).not.toMatch(/Date\.now|performance\.now|new Date|hrtime/);
  });
  it('the query grammar has no recipient-specific parameter', () => {
    const wire = sources.find((s) => s.f === 'wire.ts')?.text ?? '';
    expect(wire).toContain("const ALLOWED = new Set(['chainId', 'from', 'to', 'pageSize', 'cursor']);");
  });
});
