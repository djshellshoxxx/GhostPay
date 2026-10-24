import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeArchive } from './tagArchive';

// Cross-implementation catalogue (spec 08): generated with node:crypto only by test-vectors/generate-tag-archive.mjs.
interface Vectors {
  readonly valid: readonly { id: string; passphrase: string; archiveHex: string; expected: { createdAt: number; keyVersion: number; records: { chainId: number; createdAt: number; updatedAt: number; payload: Record<string, unknown> }[]; history: Record<string, string> } }[];
  readonly invalid: readonly { id: string; passphrase: string; archiveHex: string; error: 'auth' | 'format' | 'version' }[];
}
const V = JSON.parse(readFileSync(new URL('../../../../test-vectors/tags.json', import.meta.url), 'utf8')) as Vectors;
const bytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, 'hex'));
const MESSAGE = { auth: /Wrong passphrase, or the archive was modified/, format: /not a valid GhostPay tag archive/, version: /newer GhostPay/ } as const;

describe('tag archive vectors (test-vectors/tags.json)', () => {
  it('has the expected catalogue', () => {
    expect(V.valid.length).toBeGreaterThanOrEqual(5);
    expect(V.invalid.length).toBeGreaterThanOrEqual(12);
  });
  for (const v of V.valid) {
    it(`${v.id} decodes to the documented contents`, async () => {
      const got = await decodeArchive(bytes(v.archiveHex), v.passphrase);
      const records = v.expected.records.map((r) => ({
        ...r,
        // Import normalises hex to lower case (tags.ts validatePayload).
        payload: { ...r.payload, stealthAddress: String(r.payload['stealthAddress']).toLowerCase(), announcementId: String(r.payload['announcementId']).toLowerCase() },
      }));
      expect(got).toEqual({ createdAt: v.expected.createdAt, keyVersion: v.expected.keyVersion, records, history: v.expected.history });
    }, 60_000);
  }
  for (const v of V.invalid) {
    it(`${v.id} is refused with the ${v.error} message`, async () => {
      await expect(decodeArchive(bytes(v.archiveHex), v.passphrase)).rejects.toThrow(MESSAGE[v.error]);
    }, 60_000);
  }
});
