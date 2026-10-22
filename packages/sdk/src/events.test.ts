import { describe, expect, it } from 'vitest';
import { TypedEmitter } from './events.js';

describe('TypedEmitter', () => {
  it('delivers, unsubscribes idempotently, isolates throwing listeners', () => {
    const e = new TypedEmitter();
    const seen: string[] = [];
    const off = e.on((ev) => void seen.push(ev.type));
    e.on(() => {
      throw new Error('listener bug');
    });
    e.on((ev) => void seen.push(`second:${ev.type}`));
    expect(e.listenerCount).toBe(3);
    e.emit({ type: 'invoice.signed', at: 1 });
    expect(seen).toEqual(['invoice.signed', 'second:invoice.signed']);
    expect(e.listenerErrors).toBe(1);
    off();
    off();
    e.emit({ type: 'invoice.signed', at: 2 });
    expect(seen).toEqual(['invoice.signed', 'second:invoice.signed', 'second:invoice.signed']);
    expect(e.listenerCount).toBe(2);
  });
  it('listener unsubscribing during emit does not break iteration', () => {
    const e = new TypedEmitter();
    let calls = 0;
    const off = e.on(() => {
      calls++;
      off();
    });
    e.on(() => void calls++);
    e.emit({ type: 'invoice.signed', at: 0 });
    e.emit({ type: 'invoice.signed', at: 0 });
    expect(calls).toBe(3);
  });
});
