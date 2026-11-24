import { expect, it } from 'vitest';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

it('reports explicit source-build metadata defaults without reading environment credentials', async () => {
  const io = makeIo();
  io.env = new Proxy({}, {
    get() { throw new Error('diagnostics must not inspect environment values'); },
    ownKeys() { throw new Error('diagnostics must not enumerate environment variables'); },
  });
  expect(await run(['diagnostics', '--out', 'diagnostics.json', '--json'], io)).toBe(0);
  expect(stdoutJson(io)).toMatchObject({
    buildInfo: { sourceRevision: null, dirty: null },
    version: '0.1.0', networkContacted: false, providerTrustEstablished: false,
  });
  expect(JSON.parse(io.files.get('diagnostics.json')!) as unknown).toMatchObject({
    buildInfo: { sourceRevision: null, dirty: null },
  });
});
