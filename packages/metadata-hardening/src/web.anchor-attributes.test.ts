import { describe, expect, it } from 'vitest';
import { findUnsafeAnchors } from './web.js';

describe('MH-WEB-1 real anchor attribute names', () => {
  it('does not mistake prefixed attributes for target=_blank', () => {
    expect(findUnsafeAnchors('<a href="/" data-target="_blank">data only</a>')).toEqual([]);
    expect(findUnsafeAnchors('<a href="/" aria-target="_blank">aria only</a>')).toEqual([]);
    expect(findUnsafeAnchors('<a href="/" x-target="_blank" rel="noopener noreferrer">custom only</a>')).toEqual([]);
  });

  it('does not accept data-rel or aria-rel as a real rel attribute', () => {
    expect(findUnsafeAnchors('<a href="/" target="_blank" data-rel="noopener noreferrer">x</a>')).toEqual([
      { index: 0, reason: 'MISSING_REL' },
    ]);
    expect(findUnsafeAnchors('<a href="/" target="_blank" aria-rel="noopener noreferrer">x</a>')).toEqual([
      { index: 0, reason: 'MISSING_REL' },
    ]);
  });

  it('uses real rel even when a lookalike rel attribute is also present', () => {
    expect(findUnsafeAnchors('<a target="_blank" rel="noopener" data-rel="noopener noreferrer">x</a>')).toEqual([
      { index: 0, reason: 'MISSING_NOREFERRER' },
    ]);
    expect(findUnsafeAnchors('<a target="_blank" aria-rel="noopener noreferrer" rel="noreferrer">x</a>')).toEqual([
      { index: 0, reason: 'MISSING_NOOPENER' },
    ]);
  });

  it('preserves real attribute case, spacing and index semantics', () => {
    const html = [
      '<a data-target="_blank">not blank</a>',
      '<A HREF="/" TARGET = "_blank" REL="NOREFERRER   NOOPENER">safe</A>',
      '<a href="/" target="_blank" data-rel="noreferrer noopener">unsafe</a>',
      '<a href="/" target=_blank rel="noreferrer noopener">safe</a>',
      '<a href="/" target="_blank" rel="noopener">unsafe</a>',
    ].join('\n');
    expect(findUnsafeAnchors(html)).toEqual([
      { index: 2, reason: 'MISSING_REL' },
      { index: 4, reason: 'MISSING_NOREFERRER' },
    ]);
  });
});

describe('MH-WEB-1 long whitespace separators', () => {
  it('preserves correct attribute recognition with long runs of spaces', () => {
    const spaces = ' '.repeat(16_384);
    expect(findUnsafeAnchors(`<a${spaces}data-target="_blank">`)).toEqual([]);
    expect(findUnsafeAnchors(`<a${spaces}target="_blank"${spaces}data-rel="noopener noreferrer">`)).toEqual([
      { index: 0, reason: 'MISSING_REL' },
    ]);
    expect(findUnsafeAnchors(`<a${spaces}target="_blank"${spaces}rel="noopener noreferrer">`)).toEqual([]);
  });
});
