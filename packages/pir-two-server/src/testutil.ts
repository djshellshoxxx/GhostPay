import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { PackableAnnouncement } from './pages.js';
import type { RandomBytes } from './rand.js';

/** Deterministic test-only byte source (SHA-256 counter mode). NOT for production use. */
export function seededRand(seed: string): RandomBytes {
  let counter = 0;
  return (n) => {
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, counter++);
      const block = sha256(concatBytes(utf8ToBytes(seed), c));
      out.set(block.subarray(0, Math.min(32, n - off)), off);
      off += 32;
    }
    return out;
  };
}

const hex = (b: number, len: number): string => `0x${b.toString(16).padStart(2, '0').repeat(len)}`;

/** Fake announcement (fake data only). */
export function fakeAnn(block: number, logIndex: number, metaLen = 1): PackableAnnouncement {
  return {
    schemeId: 1n,
    stealthAddress: hex((block + logIndex) & 0xff, 20),
    caller: hex(0xaa, 20),
    ephemeralPublicKey: `0x02${hex(block & 0xff, 32).slice(2)}`,
    metadata: `0x${'ab'.repeat(metaLen)}`,
    blockNumber: BigInt(block),
    blockHash: hex(block & 0xff, 32),
    logIndex,
  };
}

import type { PirServerLink } from './client.js';
import type { PirServer } from './server.js';

/** In-memory link to a {@link PirServer}, recording every query it receives. */
export function localLink(server: PirServer, origin: string, log: Uint8Array[] = []): PirServerLink & { log: Uint8Array[] } {
  return {
    origin,
    log,
    getManifest: () => Promise.resolve(JSON.parse(JSON.stringify(server.manifest)) as unknown),
    answer: (q) => {
      log.push(new Uint8Array(q));
      return Promise.resolve(server.answer(q));
    },
  };
}
