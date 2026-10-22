import { describe, expect, it, vi } from 'vitest';
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
  it('extracts from pasted links and rejects junk', () => {
    expect(extractFragment('  https://x.test/#gpi=v1.abc_-  ')).toBe('#gpi=v1.abc_-');
    expect(extractFragment('#gpi=v1.abc')).toBe('#gpi=v1.abc');
    expect(extractFragment('https://x.test/')).toBeUndefined();
    expect(extractFragment('#gpi=v1.abc def')).toBeUndefined();
  });
});
