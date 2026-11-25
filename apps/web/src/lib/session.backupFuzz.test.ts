import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { UserFacingError } from './errors';
import { clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, sessionHasExternalCopy, verifyDownloadedBackup } from './session';

// Light stability fuzzing of "Verify backup" (GP-PAGES-02): hostile or damaged files must be refused with a
// user-facing error, never mark the loaded keys as having a verified copy, and never replace the loaded keys.
afterEach(() => { clearSession(); });

const PASS = 'a long passphrase for fuzzing';

async function refused(text: string, passphrase = PASS): Promise<void> {
  const before = getSessionPublic();
  const error = await verifyDownloadedBackup(text, passphrase).then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(UserFacingError);
  expect(sessionHasExternalCopy()).toBe(false);
  expect(getSessionBackup()?.verified).not.toBe(true);
  expect(getSessionPublic()).toBe(before);
}

describe('verifyDownloadedBackup fuzzing', () => {
  it('arbitrary text never verifies and never throws a raw error', async () => {
    generateSession();
    await fc.assert(fc.asyncProperty(fc.oneof(fc.string({ maxLength: 300 }), fc.json({ maxDepth: 3 })), async (text) => { await refused(text); }), { numRuns: 300 });
  });

  it('single-character damage to a real export never verifies a changed file', async () => {
    generateSession();
    const text = await exportKeystore(PASS, { N: 1 << 14 });
    const significant = [...text.matchAll(/[0-9a-f]/g)].map((m) => m.index);
    await fc.assert(fc.asyncProperty(fc.constantFrom(...significant), async (at) => {
      // Lowercase hex inside the envelope: every replacement changes an authenticated or keyed byte.
      const c = text[at] === '0' ? '1' : '0';
      await refused(text.slice(0, at) + c + text.slice(at + 1));
    }), { numRuns: 12 });
    // The undamaged file still verifies, so the refusals above are about the damage.
    await verifyDownloadedBackup(text, PASS);
    expect(sessionHasExternalCopy()).toBe(true);
  }, 120_000);

  it("another seller's valid file is refused for the loaded keys", async () => {
    generateSession();
    const other = await exportKeystore(PASS, { N: 1 << 14 });
    generateSession();
    await refused(other);
  }, 60_000);
});
