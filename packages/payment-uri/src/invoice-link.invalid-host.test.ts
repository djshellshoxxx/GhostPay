import { describe, expect, it } from 'vitest';
import { buildInvoiceLink, parseInvoiceLink } from './invoice-link.js';

const fragment = '#gpi=v1.AA';

describe('invoice link browser-valid hosts', () => {
  it.each(['xn--a.example', 'xn--abc.example', 'xn--0.example'])('rejects invalid punycode host %s', (host) => {
    expect(() => new URL(`https://${host}`)).toThrow();
    expect(() => parseInvoiceLink(`https://${host}/pay${fragment}`)).toThrow('Invalid invoice link.');
  });

  it('rejects an invalid host during link construction', () => {
    expect(() => buildInvoiceLink('https://xn--a.example', fragment)).toThrow('Invalid invoice link.');
  });

  it('preserves valid punycode and ordinary origins', () => {
    expect(parseInvoiceLink(`https://xn--bcher-kva.example/pay${fragment}`).host).toBe('xn--bcher-kva.example');
    expect(parseInvoiceLink(`https://example.test:443/pay${fragment}`).origin).toBe('https://example.test');
    expect(parseInvoiceLink(`https://example.test:8443/pay${fragment}`).origin).toBe('https://example.test:8443');
  });

  it('preserves existing local development and allowlist rules', () => {
    expect(parseInvoiceLink(`http://127.0.0.1:8080/pay${fragment}`, { allowLocalDev: true }).origin).toBe('http://127.0.0.1:8080');
    expect(() => parseInvoiceLink(`https://127.0.0.1/pay${fragment}`)).toThrow('Invalid invoice link.');
    expect(() => parseInvoiceLink(`https://example.test/pay${fragment}`, { allowedHosts: ['other.test'] })).toThrow('Invalid invoice link.');
  });
});
