import { describe, expect, it } from 'vitest';
import { FRAG, HOST, LINK, POLICY } from './fixtures.testutil.js';
import { classifyPayload } from './payload.js';

const resultCode = (raw: string): string => {
  const result = classifyPayload(raw, POLICY);
  return result.ok ? 'OK' : result.code;
};

describe('classifyPayload explicit HTTPS port rejection', () => {
  it('rejects default HTTPS ports normalized away by URL', () => {
    for (const port of [':443', ':0443', ':000443']) {
      expect(resultCode(`https://${HOST}${port}/pay${FRAG}`)).toBe('port-not-allowed');
    }
  });

  it('rejects a present but empty port separator', () => {
    expect(resultCode(`https://${HOST}:/pay${FRAG}`)).toBe('port-not-allowed');
  });

  it('rejects default ports through existing accepted WHATWG HTTPS slash spellings', () => {
    for (const prefix of ['https:', 'https:/', 'https:////']) {
      expect(resultCode(`${prefix}${HOST}:443/pay${FRAG}`)).toBe('port-not-allowed');
    }
  });

  it('keeps the existing unported URL, nondefault-port and credential behavior', () => {
    expect(resultCode(LINK)).toBe('OK');
    expect(resultCode(FRAG)).toBe('OK');
    expect(resultCode(`https://${HOST}:8443/pay${FRAG}`)).toBe('port-not-allowed');
    expect(resultCode(`https://alice:443@${HOST}/pay${FRAG}`)).toBe('credentials-not-allowed');
    expect(resultCode(`https://other.test/pay${FRAG}`)).toBe('host-not-allowed');
  });
});
