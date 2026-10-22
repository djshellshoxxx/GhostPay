import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toEventSelector, toFunctionSelector, type AbiEvent, type AbiFunction } from 'viem';
import { erc20Abi, railgunAbi, SNARK_SCALAR_FIELD, MAX_UINT120 } from './abi.js';

const ref = JSON.parse(readFileSync(new URL('../reference/abi-reference.json', import.meta.url), 'utf8')) as { functions: Record<string, string>; events: Record<string, boolean[]> };

function sigOf(item: AbiFunction | AbiEvent): string {
  const t = (i: { type: string; components?: readonly { type: string; components?: readonly unknown[] }[] }): string =>
    i.type.startsWith('tuple') ? `(${(i.components ?? []).map((c) => t(c as never)).join(',')})${i.type.slice(5)}` : i.type;
  return `${item.name}(${item.inputs.map((i) => t(i as never)).join(',')})`;
}

describe('ABI subset matches the selectors solc produced from Railgun-Privacy/contract', () => {
  it('functions', () => {
    const fns = railgunAbi.filter((x): x is Extract<(typeof railgunAbi)[number], { type: 'function' }> => x.type === 'function');
    expect(fns).toHaveLength(4);
    for (const f of fns) {
      const s = sigOf(f);
      expect(ref.functions[s], `missing upstream function ${s}`).toBeDefined();
      expect(toFunctionSelector(f as never)).toBe(ref.functions[s]);
    }
    expect(toFunctionSelector(erc20Abi[0])).toBe('0x095ea7b3');
  });
  it('Shield event keeps the upstream layout (all non-indexed)', () => {
    const ev = railgunAbi.find((x) => x.type === 'event') as unknown as AbiEvent;
    expect(ref.events[sigOf(ev)]).toEqual([false, false, false, false, false]);
    expect(toEventSelector(ev)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('constants', () => {
    expect(SNARK_SCALAR_FIELD).toBe(21888242871839275222246405745257275088548364400416034343698204186575808495617n);
    expect(MAX_UINT120).toBe(2n ** 120n - 1n);
  });
});
