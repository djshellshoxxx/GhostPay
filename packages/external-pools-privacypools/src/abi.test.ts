import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toEventSelector, toFunctionSelector, type Abi, type AbiEvent, type AbiFunction } from 'viem';
import { entrypointAbi, erc20Abi, poolAbi, relayDataParams, NATIVE_ASSET } from './abi.js';

const ref = JSON.parse(readFileSync(new URL('../reference/abi-reference.json', import.meta.url), 'utf8')) as {
  functions: Record<string, string>;
  events: Record<string, boolean[]>;
};

function sigOf(item: AbiFunction | AbiEvent): string {
  const t = (i: { type: string; components?: readonly { type: string; components?: readonly unknown[] }[] }): string =>
    i.type.startsWith('tuple') ? `(${(i.components ?? []).map((c) => t(c as never)).join(',')})${i.type.slice(5)}` : i.type;
  return `${item.name}(${item.inputs.map((i) => t(i as never)).join(',')})`;
}

describe('ABI subset matches the selectors solc produced from the upstream interfaces', () => {
  const all: Abi = [...entrypointAbi, ...poolAbi, ...erc20Abi];
  it('every function we use exists upstream with the same selector', () => {
    const fns = all.filter((x): x is AbiFunction => x.type === 'function');
    expect(fns.length).toBeGreaterThan(10);
    for (const f of fns) {
      const s = sigOf(f);
      expect(ref.functions[s], `missing upstream function ${s}`).toBeDefined();
      expect(toFunctionSelector(f)).toBe(ref.functions[s]);
    }
  });
  it('every event we use exists upstream with the same indexed layout', () => {
    const evs = all.filter((x): x is AbiEvent => x.type === 'event');
    expect(evs.length).toBe(5);
    for (const e of evs) {
      const s = sigOf(e);
      expect(ref.events[s], `missing upstream event ${s}`).toEqual(e.inputs.map((i) => i.indexed === true));
      expect(toEventSelector(e)).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });
  it('constants match the upstream sources', () => {
    expect(NATIVE_ASSET).toBe('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
    expect(relayDataParams.map((p) => p.type)).toEqual(['address', 'address', 'uint256']);
  });
});
