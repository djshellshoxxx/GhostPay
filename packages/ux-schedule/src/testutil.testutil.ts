import { MS_DAY } from './time.js';
import type { TzOffset } from './time.js';

/** US-style DST for 2026 only: starts 2026-03-08T07:00Z, ends 2026-11-01T06:00Z (EST/EDT). */
export const NY2026: TzOffset = (t) => {
  const start = Date.UTC(2026, 2, 8, 7);
  const end = Date.UTC(2026, 10, 1, 6);
  return t >= start && t < end ? -240 : -300;
};

export const utc = (y: number, mo: number, d: number, h = 0, mi = 0): number => Date.UTC(y, mo - 1, d, h, mi);

export const fixed = (ms: number) => () => ms;
export { MS_DAY };

export const goodTemplate = {
  id: 'rent',
  name: 'Rent',
  chain: 'eip155:1',
  asset: 'USDC',
  recipient: '0xAbCdEf0000000000000000000000000000000001',
  amount: '1500000000',
  memo: 'monthly rent',
};
export const noMemo = Object.fromEntries(Object.entries(goodTemplate).filter(([k]) => k !== 'memo'));
