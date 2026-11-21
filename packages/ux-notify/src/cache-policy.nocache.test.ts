import { describe, expect, it } from 'vitest';
import { shouldStoreResponse, type CacheDecision } from './cache-policy.js';

const cacheableAsset: CacheDecision = {
  strategy: 'cache-first',
  cacheable: true,
  offlineFallback: false,
  reason: 'static_asset',
};

const response = {
  status: 200,
  type: 'basic' as const,
  contentType: 'text/javascript; charset=utf-8',
};

describe('static cache-first response freshness', () => {
  it.each([
    'no-cache',
    'public, no-cache',
    'max-age=3600, NO-CACHE',
  ])('refuses Cache-Control %s rather than reusing without revalidation', (cacheControl) => {
    expect(shouldStoreResponse(cacheableAsset, { ...response, cacheControl })).toBe(false);
  });

  it('retains the existing immutable and no-store/private decisions', () => {
    expect(shouldStoreResponse(cacheableAsset, {
      ...response, cacheControl: 'public, max-age=31536000, immutable',
    })).toBe(true);
    expect(shouldStoreResponse(cacheableAsset, { ...response, cacheControl: 'no-store' })).toBe(false);
    expect(shouldStoreResponse(cacheableAsset, { ...response, cacheControl: 'max-age=1, private' })).toBe(false);
  });
});
