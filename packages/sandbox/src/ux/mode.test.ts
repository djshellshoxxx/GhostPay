import { describe, expect, it } from 'vitest';
import { SandboxError } from './errors.js';
import {
  SANDBOX_I18N_KEYS,
  bannerFor,
  initialModeState,
  normalizeModeState,
  transition,
  visualModeOf,
  type AppMode,
} from './mode.js';

describe('mode state', () => {
  it('starts real/normal', () => {
    const s = initialModeState();
    expect(s).toEqual({ mode: 'real', visual: 'normal', epoch: 0 });
    expect(Object.isFrozen(s)).toBe(true);
  });
  it('test mode forces distinct visual and bumps epoch; same mode is a no-op', () => {
    const s0 = initialModeState();
    const s1 = transition(s0, 'test');
    expect(s1).toEqual({ mode: 'test', visual: 'test-distinct', epoch: 1 });
    expect(transition(s1, 'test')).toBe(s1);
    expect(transition(s1, 'real')).toEqual({ mode: 'real', visual: 'normal', epoch: 2 });
    expect(visualModeOf('test')).toBe('test-distinct');
  });
  it('rejects invalid modes', () => {
    expect(() => transition(initialModeState(), 'prod' as AppMode)).toThrowError(SandboxError);
  });
  it('normalize ignores supplied visual (cannot forge normal-looking test mode)', () => {
    const n = normalizeModeState({ mode: 'test', visual: 'normal', epoch: 3 });
    expect(n.visual).toBe('test-distinct');
    expect(n.epoch).toBe(3);
  });
  it('normalize rejects garbage', () => {
    for (const bad of [
      null,
      'x',
      {},
      { mode: 'x', epoch: 0 },
      { mode: 'test', epoch: -1 },
      { mode: 'test', epoch: 1.5 },
      { mode: 'real' },
    ]) {
      expect(() => normalizeModeState(bad)).toThrowError(SandboxError);
    }
  });
});

describe('banner', () => {
  it('is mandatory in test mode', () => {
    const b = bannerFor(transition(initialModeState(), 'test'));
    expect(b.visible).toBe(true);
    expect(b.role).toBe('status');
    expect(b.visual).toBe('test-distinct');
    expect(b.labelPrefixKey).toBe('sandbox.label.test');
    expect(b.keys).toContain('sandbox.banner.noRealFunds');
    for (const k of b.keys) expect(SANDBOX_I18N_KEYS).toContain(k);
  });
  it('is hidden in real mode', () => {
    const b = bannerFor(initialModeState());
    expect(b).toEqual({ visible: false, visual: 'normal', role: 'none', keys: [], labelPrefixKey: null });
  });
  it('i18n keys unique and namespaced', () => {
    expect(new Set(SANDBOX_I18N_KEYS).size).toBe(SANDBOX_I18N_KEYS.length);
    for (const k of SANDBOX_I18N_KEYS) expect(k.startsWith('sandbox.')).toBe(true);
  });
});
