import { describe, expect, it } from 'vitest';
import { classifyRequest, DEFAULT_CACHE_CONFIG, shouldStoreResponse } from './cache-policy.js';

// Cache-first has no conditional revalidation step. A no-cache response must not
// be stored as an immutable offline asset, even when the URL is content-hashed.
const decision = classifyRequest(
  { origin: 'https://app.example', ...DEFAULT_CACHE_CONFIG },
  { url: 'https://app.example/assets/index-3f9a8c1d.js', method: 'GET' },
);
const response = { status: 200, type: 'basic' as const, contentType: 'text/javascript' };

describe('cache-first HTTP revalidation directives', () => {
  it('uses the normal positive static-asset cache path', () => {
    expect(decision.cacheable).toBe(true);
    expect(shouldStoreResponse(decision, response)).toBe(true);
  });

  it.each([
    'no-cache',
    'No-Cache',
    'public, no-cache',
    'public, no-cache="Set-Cookie"',
    'max-age=3600, NO-CACHE, immutable',
  ])('never stores a response requiring revalidation (%s)', (cacheControl) => {
    expect(shouldStoreResponse(decision, { ...response, cacheControl })).toBe(false);
  });

  it('continues to allow immutable public assets and reject existing private directives', () => {
    expect(shouldStoreResponse(decision, {
      ...response, cacheControl: 'public, max-age=31536000, immutable',
    })).toBe(true);
    expect(shouldStoreResponse(decision, { ...response, cacheControl: 'private' })).toBe(false);
    expect(shouldStoreResponse(decision, { ...response, cacheControl: 'no-store' })).toBe(false);
    expect(shouldStoreResponse(decision, { ...response, cacheControl: 'public, no-cachex' })).toBe(true);
  });
});
