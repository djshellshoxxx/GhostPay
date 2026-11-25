import { describe, expect, it } from 'vitest';
import { decodeAnnouncementLog, type RawLog } from './abi.js';
import { encodeAnnouncementData, fakeAnn, hx, rawLog, topicOf } from './fake.testutil.js';
import type { Hex } from './wire.js';

const B = { number: 7n, hash: hx(0x77, 32), parentHash: hx(0x66, 32) };
const base = (over: Partial<RawLog> = {}): RawLog => ({ ...rawLog(B, 0, fakeAnn(9, 20)), ...over });
const word = (n: bigint | number): string => BigInt(n).toString(16).padStart(64, '0');

describe('decodeAnnouncementLog', () => {
  it('decodes the canonical encoding', () => {
    const d = decodeAnnouncementLog(base());
    expect(d).toEqual({ schemeId: 1n, stealthAddress: hx(9, 20), caller: hx(0xaa, 20), ephemeralPublicKey: `0x02${hx(9, 32).slice(2)}`, metadata: hx(0xab, 20) });
  });
  it('accepts the metadata length bounds and a 64-bit scheme id', () => {
    expect(decodeAnnouncementLog(base({ data: encodeAnnouncementData(`0x03${'22'.repeat(32)}`, hx(1, 4096)) }))?.metadata.length).toBe(2 + 8192);
    const big = base();
    expect(decodeAnnouncementLog({ ...big, topics: [big.topics[0] as Hex, `0x${word((1n << 64n) - 1n)}`, big.topics[2] as Hex, big.topics[3] as Hex] })?.schemeId).toBe((1n << 64n) - 1n);
  });
  it('omits records outside the v1 limits', () => {
    const t = base().topics;
    const cases: RawLog[] = [
      base({ data: encodeAnnouncementData(`0x02${'11'.repeat(31)}`, '0xab') }), // 32-byte key
      base({ data: encodeAnnouncementData(`0x02${'11'.repeat(33)}`, '0xab') }), // 34-byte key
      base({ data: encodeAnnouncementData(`0x02${'11'.repeat(32)}`, '0x') }), // empty metadata
      base({ data: encodeAnnouncementData(`0x02${'11'.repeat(32)}`, hx(1, 4097)) }), // oversized metadata
      base({ topics: [t[0] as Hex, `0x${word(1n << 64n)}`, t[2] as Hex, t[3] as Hex] }), // scheme id > u64
    ];
    for (const c of cases) expect(decodeAnnouncementLog(c)).toBeUndefined();
  });
  it('rejects malformed topics and data without throwing', () => {
    const t = base().topics;
    const pk = `02${'11'.repeat(32)}`;
    const cases: RawLog[] = [
      base({ topics: t.slice(0, 3) }),
      base({ topics: [hx(1, 32), t[1] as Hex, t[2] as Hex, t[3] as Hex] }),
      base({ topics: [t[0] as Hex, t[1] as Hex, `0x${'01'.repeat(32)}`, t[3] as Hex] }), // dirty address padding
      base({ topics: [t[0] as Hex, t[1] as Hex, t[2] as Hex, `0x${'ff'.repeat(13)}${'00'.repeat(19)}`] }),
      base({ topics: [t[0] as Hex, '0x01', t[2] as Hex, t[3] as Hex] }),
      base({ topics: [t[0] as Hex, t[1] as Hex, topicOf(hx(1, 20)).slice(0, 60) as Hex, t[3] as Hex] }),
      base({ data: '0x' }),
      base({ data: `0x${word(64)}` }),
      base({ data: `0x${word(64)}${word(4096)}${word(33)}${pk}` }), // second offset out of bounds
      base({ data: `0x${word(65)}${word(128)}${word(33)}${pk}` }), // misaligned offset
      base({ data: `0x${word(64)}${word(128)}${word(1000)}${pk}` }), // length beyond data
      base({ data: `0x${'ff'.repeat(32)}${word(64)}` }), // huge offset
    ];
    for (const c of cases) expect(decodeAnnouncementLog(c), c.data.slice(0, 80)).toBeUndefined();
  });
});
