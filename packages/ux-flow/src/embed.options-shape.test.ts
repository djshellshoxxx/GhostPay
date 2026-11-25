import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { makeSnippet } from './embed.js';

const ORIGIN = 'https://pay.example.com';
const LINK = `${ORIGIN}/#gpi=v1.test`;

describe('makeSnippet runtime option-record validation', () => {
  it('rejects null, primitive and array option containers with BAD_OPTION', () => {
    for (const options of [null, 0, false, []]) {
      let error: unknown;
      try {
        makeSnippet(LINK, ORIGIN, options as never);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(FlowError);
      expect((error as FlowError).code).toBe('BAD_OPTION');
    }
  });

  it('continues to accept omitted and valid option records', () => {
    expect(makeSnippet(LINK, ORIGIN)).toContain('ghostpay-btn--default');
    expect(makeSnippet(LINK, ORIGIN, {})).toContain('ghostpay-btn--default');
    const rendered = makeSnippet(LINK, ORIGIN, {
      label: 'Buy & pay',
      variant: 'dark',
      includeStylesheet: true,
      includeFallback: true,
    });
    expect(rendered).toContain('ghostpay-btn--dark');
    expect(rendered).toContain('Buy &amp; pay');
    expect(rendered).toContain('<noscript>');
    expect(rendered).toContain('ghostpay-embed-v1.css');
  });
});
