import { describe, expect, it } from 'vitest';
import { createRegistry, type Command } from './palette.js';

const command = (action: Command['action']): Command => ({
  id: 'action.snapshot',
  title: 'Open home',
  keywords: [],
  action,
});

describe('registered command action integrity', () => {
  it('does not retain the caller-owned mutable navigation action', () => {
    const action = { type: 'navigate' as const, view: 'home' };
    const registry = createRegistry([command(action)]);
    action.view = 'sweep';
    Object.assign(action as { type: string }, { type: 'delete-all' });
    expect(registry.byId('action.snapshot')?.action).toEqual({ type: 'navigate', view: 'home' });
    expect(registry.list()[0]?.action).toEqual({ type: 'navigate', view: 'home' });
  });

  it('returns an immutable action from both lookup and list', () => {
    const registry = createRegistry([command({ type: 'navigate', view: 'home' })]);
    const lookup = registry.byId('action.snapshot');
    const listed = registry.list()[0];
    expect(Object.isFrozen(lookup?.action)).toBe(true);
    expect(Object.isFrozen(listed?.action)).toBe(true);
    expect(Reflect.set(lookup!.action, 'view', 'sweep')).toBe(false);
    expect(Reflect.set(listed!.action, 'type', 'delete-all')).toBe(false);
    expect(registry.byId('action.snapshot')?.action).toEqual({ type: 'navigate', view: 'home' });
  });

  it('also isolates no-argument palette actions from caller mutation', () => {
    const action: { type: string } = { type: 'open-palette' };
    const registry = createRegistry([command(action as Command['action'])]);
    action.type = 'navigate';
    expect(registry.byId('action.snapshot')?.action).toEqual({ type: 'open-palette' });
    expect(Object.isFrozen(registry.byId('action.snapshot')?.action)).toBe(true);
  });
});
