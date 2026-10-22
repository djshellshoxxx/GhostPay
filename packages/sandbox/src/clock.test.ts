import { describe, expect, it } from 'vitest';
import { ManualClock, SandboxError } from './index.js';

describe('ManualClock', () => {
  it('starts at default and advances', () => {
    const c = new ManualClock();
    expect(c.now()).toBe(1_800_000_000);
    expect(c.advance(30)).toBe(1_800_000_030);
    expect(c.set(1_800_000_100)).toBe(1_800_000_100);
    expect(c.now()).toBe(1_800_000_100);
  });
  it('rejects backwards, negative, fractional, NaN', () => {
    const c = new ManualClock(100);
    expect(() => c.set(99)).toThrow(SandboxError);
    expect(() => c.advance(-1)).toThrow(SandboxError);
    expect(() => c.advance(1.5)).toThrow(SandboxError);
    expect(() => c.advance(NaN)).toThrow(SandboxError);
    expect(() => new ManualClock(-1)).toThrow(SandboxError);
    expect(c.now()).toBe(100);
  });
});
