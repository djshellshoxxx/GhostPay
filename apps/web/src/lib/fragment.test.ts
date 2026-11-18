import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { clearFragment, extractFragment, readInvoiceFragment } from './fragment';

describe('fragment helpers', () => {
  it('reads only invoice fragments', () => {
    expect(readInvoiceFragment({ hash: '#gpi=v1.abc', pathname: '/', search: '' })).toBe('#gpi=v1.abc');
    expect(readInvoiceFragment({ hash: '#other', pathname: '/', search: '' })).toBeUndefined();
    expect(readInvoiceFragment({ hash: '', pathname: '/', search: '' })).toBeUndefined();
  });
  it('clears via replaceState keeping path and query but not the hash', () => {
    const replaceState = vi.fn();
    clearFragment({ hash: '#gpi=v1.abc', pathname: '/app/', search: '?x=1' }, { replaceState });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app/?x=1');
  });
  it('clears sensitive fragments even when the same-origin path begins with two slashes', () => {
    const dom = new JSDOM('', { url: 'https://app.test//other.test/invoice?view=pay#gpi=v1.secret' });
    try {
      expect(() => clearFragment(dom.window.location, dom.window.history)).not.toThrow();
      expect(dom.window.location.origin).toBe('https://app.test');
      expect(dom.window.location.pathname).toBe('//other.test/invoice');
      expect(dom.window.location.search).toBe('?view=pay');
      expect(dom.window.location.hash).toBe('');
    } finally {
      dom.window.close();
    }
  });
  it('extracts from pasted links and rejects junk', () => {
    expect(extractFragment('  https://x.test/#gpi=v1.abc_-  ')).toBe('#gpi=v1.abc_-');
    expect(extractFragment('#gpi=v1.abc')).toBe('#gpi=v1.abc');
    expect(extractFragment('https://x.test/')).toBeUndefined();
    expect(extractFragment('#gpi=v1.abc def')).toBeUndefined();
  });
});
