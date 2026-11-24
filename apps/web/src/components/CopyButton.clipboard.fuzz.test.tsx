// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, expect, it, vi } from 'vitest';
import { CopyButton } from './Common';

function deferredWrite() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = () => { no(new Error('clipboard write denied')); };
  });
  return { promise, resolve, reject };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('honors the latest copy when two writes settle across a cleanup deadline', async () => {
  vi.useFakeTimers();
  await fc.assert(fc.asyncProperty(
    fc.constantFrom(30_000, 60_000), fc.constantFrom(0, 30_000, 60_000),
    fc.integer({ min: 1, max: 1000 }), fc.boolean(), fc.boolean(), fc.boolean(),
    async (firstDelay, secondDelay, lead, sameLink, firstPending, denied) => {
      const first = deferredWrite();
      const second = deferredWrite();
      const firstLink = 'https://shop.test/#invoice-a';
      const secondLink = sameLink ? firstLink : 'https://shop.test/#invoice-b';
      let value = '';
      let copyCount = 0;
      const clipboard = {
        readText: () => Promise.resolve(value),
        writeText(text: string) {
          if (text === '') { value = ''; return Promise.resolve(); }
          copyCount++;
          if (copyCount === 1) { value = text; return first.promise; }
          if (!denied) value = text;
          return second.promise;
        },
      };
      const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
      const view = render(<CopyButton text={firstLink} label="Copy link" autoClearAfterMs={firstDelay} />);
      const button = view.getByRole('button');
      try {
        fireEvent.click(button);
        if (!firstPending) await act(async () => { first.resolve(); await first.promise; });
        await vi.advanceTimersByTimeAsync(firstDelay - lead);
        view.rerender(<CopyButton text={secondLink} label="Copy link" autoClearAfterMs={secondDelay} />);
        fireEvent.click(button);
        await vi.advanceTimersByTimeAsync(lead);
        // A pending write may already be visible on the clipboard. Wait for its outcome.
        expect(value).toBe(denied ? firstLink : secondLink);
        await act(async () => {
          if (denied) second.reject(); else second.resolve();
          await second.promise.catch(() => undefined);
        });
        if (firstPending) await act(async () => { first.resolve(); await first.promise; });
        if (denied) {
          await vi.advanceTimersByTimeAsync(firstPending ? firstDelay : 0);
          expect(value).toBe('');
        } else {
          await vi.advanceTimersByTimeAsync((secondDelay || 300_000) - 1);
          expect(value).toBe(secondLink);
          await vi.advanceTimersByTimeAsync(1);
          expect(value).toBe(secondDelay === 0 ? secondLink : '');
        }
      } finally {
        first.resolve(); second.resolve();
        view.unmount();
        vi.clearAllTimers();
        if (original) Object.defineProperty(navigator, 'clipboard', original);
        else Reflect.deleteProperty(navigator, 'clipboard');
      }
    },
  ), {
    seed: 286549, numRuns: 120,
    examples: [
      [30_000, 30_000, 1, true, false, false], // same link visible before the new write is acknowledged
      [30_000, 60_000, 1, false, true, false], // first write acknowledges after the second
      [30_000, 0, 1, true, false, true], // rejected recopy leaves the old cleanup effective
    ],
  });
});
