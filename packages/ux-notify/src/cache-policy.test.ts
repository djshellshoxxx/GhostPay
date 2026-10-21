import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_CACHE_CONFIG, auditPrecache, cacheName, classifyRequest, compareVersions, decideUpdate, isSkewed,
  obsoleteCaches, parseVersion, planFallback, shouldStoreResponse, type CacheDecision, type CacheRequest, type UpdateInput,
} from './cache-policy.js';

const ORIGIN = 'https://app.example';
const cfg = { origin: ORIGIN, ...DEFAULT_CACHE_CONFIG };
const get = (path: string, extra: Partial<CacheRequest> = {}) => classifyRequest(cfg, { url: ORIGIN + path, method: 'GET', ...extra });

describe('classifyRequest', () => {
  it('caches hashed static assets', () => {
    expect(get('/assets/index-3f9a8c1d.js')).toEqual({ strategy: 'cache-first', cacheable: true, offlineFallback: false, reason: 'static_asset' });
    expect(get('/assets/font.abcdef12.woff2').cacheable).toBe(true);
    expect(get('/ASSETS/index-3f9a8c1d.JS').cacheable).toBe(true);
    expect(get('/assets/img/logo-AbCd1234.svg').cacheable).toBe(true);
  });
  it('static exact', () => {
    expect(get('/offline.html').reason).toBe('static_exact');
    expect(get('/manifest.webmanifest').cacheable).toBe(true);
    expect(get('/offline.html?x=1').cacheable).toBe(false);
  });
  it('rejects unhashed, wrong ext, other paths', () => {
    expect(get('/assets/app.js').reason).toBe('unhashed_asset');
    expect(get('/assets/data-abcdef123.json').reason).toBe('not_allowlisted');
    expect(get('/assetsx/a-abcdef123.js').reason).toBe('not_allowlisted');
    expect(get('/other/page').reason).toBe('not_allowlisted');
    expect(classifyRequest({ ...cfg, requireContentHash: false }, { url: ORIGIN + '/assets/app.js', method: 'GET' }).cacheable).toBe(true);
  });
  it('never caches API / secret-bearing URLs', () => {
    for (const p of ['/api/balance', '/api', '/API/x', '/rpc', '/relay/submit', '/auth/login', '/v1/quote', '/assets/../api/x', '/assets/%2e%2e/api/x']) {
      expect(get(p).cacheable, p).toBe(false);
    }
    expect(get('/api/x').reason).toBe('api_path');
    expect(get('/assets/a-12345678.js?token=abc').reason).toBe('sensitive_query');
    expect(get('/assets/a-12345678.js?v=' + 'a'.repeat(40)).reason).toBe('sensitive_query');
    expect(get('/assets/a-12345678.js#secret').reason).toBe('has_fragment');
    expect(get('/pay#seed=abc', { mode: 'navigate' })).toMatchObject({ cacheable: false, offlineFallback: true, reason: 'has_fragment' });
    expect(get('/assets/a-12345678.js', { hasAuthorization: true }).reason).toBe('authenticated');
    expect(get('/assets/a-12345678.js', { hasCookies: true }).reason).toBe('authenticated');
    expect(get('/assets/a%2Fb-12345678.js').reason).toBe('invalid_url');
    expect(get('/x%5Cy', { mode: 'navigate' })).toMatchObject({ reason: 'invalid_url', offlineFallback: true });
  });
  it('transport and origin rules', () => {
    expect(classifyRequest(cfg, { url: ORIGIN + '/assets/a-12345678.js', method: 'POST' }).reason).toBe('non_get');
    expect(classifyRequest(cfg, { url: ORIGIN + '/assets/a-12345678.js', method: 'get' }).cacheable).toBe(true);
    expect(classifyRequest(cfg, { url: 'https://cdn.example/assets/a-12345678.js', method: 'GET' }).reason).toBe('cross_origin');
    expect(classifyRequest(cfg, { url: 'http://app.example/assets/a-12345678.js', method: 'GET' }).reason).toBe('insecure_scheme');
    expect(classifyRequest(cfg, { url: 'ftp://app.example/x', method: 'GET' }).reason).toBe('insecure_scheme');
    expect(classifyRequest(cfg, { url: 'not a url', method: 'GET' }).reason).toBe('invalid_url');
    expect(classifyRequest(cfg, { url: 'https://u:p@app.example/x', method: 'GET' }).reason).toBe('invalid_url');
    const local = { ...cfg, origin: 'http://localhost:5173' };
    expect(classifyRequest(local, { url: 'http://localhost:5173/assets/a-12345678.js', method: 'GET' }).cacheable).toBe(true);
    expect(classifyRequest({ ...cfg, origin: 'http://127.0.0.1:1' }, { url: 'http://127.0.0.1:1/assets/a-12345678.js', method: 'GET' }).cacheable).toBe(true);
  });
  it('navigation: never cached, offline fallback on', () => {
    expect(get('/send', { mode: 'navigate' })).toEqual({ strategy: 'navigation', cacheable: false, offlineFallback: true, reason: 'navigation' });
    expect(get('/api/x', { mode: 'navigate' })).toMatchObject({ cacheable: false, offlineFallback: true });
    expect(get('/pay?invoice=abc', { mode: 'navigate' })).toMatchObject({ cacheable: false, reason: 'sensitive_query', offlineFallback: true });
    expect(get('/send', { mode: 'navigate', hasCookies: true })).toMatchObject({ reason: 'authenticated' });
  });
  it('property: anything with a fragment, API path or sensitive key is never cacheable', () => {
    fc.assert(fc.property(fc.webPath(), fc.constantFrom('#a', '#', '?token=1', '?api_key=x', '?seed=1'), (path, suffix) => {
      const d = classifyRequest(cfg, { url: ORIGIN + path.replace(/^\/?/, '/assets/') + suffix, method: 'GET' });
      return suffix === '#' ? true : !d.cacheable;
    }));
    fc.assert(fc.property(fc.webPath(), (p) => !classifyRequest(cfg, { url: `${ORIGIN}/api${p.startsWith('/') ? p : '/' + p}`, method: 'GET' }).cacheable));
  });
});

describe('shouldStoreResponse', () => {
  const ok: CacheDecision = { strategy: 'cache-first', cacheable: true, offlineFallback: false, reason: 'static_asset' };
  const res = { status: 200, type: 'basic' as const, contentType: 'text/javascript; charset=utf-8' };
  it('stores clean basic 200', () => {
    expect(shouldStoreResponse(ok, res)).toBe(true);
    expect(shouldStoreResponse(ok, { ...res, contentType: 'font/woff2' })).toBe(true);
    expect(shouldStoreResponse(ok, { ...res, cacheControl: 'public, max-age=31536000, immutable', vary: 'Accept-Encoding' })).toBe(true);
  });
  it('refuses otherwise', () => {
    expect(shouldStoreResponse({ ...ok, cacheable: false }, res)).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, status: 206 })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, status: 404 })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, type: 'opaque' })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, type: 'cors' })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, hasSetCookie: true })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, cacheControl: 'no-store' })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, cacheControl: 'max-age=1, Private' })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, vary: '*' })).toBe(false);
    expect(shouldStoreResponse(ok, { ...res, contentType: 'application/json' })).toBe(false);
    expect(shouldStoreResponse(ok, { status: 200, type: 'basic' })).toBe(false);
  });
});

describe('planFallback', () => {
  const nav = get('/x', { mode: 'navigate' });
  const st = get('/assets/a-12345678.js');
  const api = get('/api/x');
  it('routes', () => {
    expect(planFallback({ decision: st, networkOk: false, cachedAvailable: true, offlinePageCached: true })).toBe('cache');
    expect(planFallback({ decision: st, networkOk: true, cachedAvailable: false, offlinePageCached: true })).toBe('network');
    expect(planFallback({ decision: st, networkOk: false, cachedAvailable: false, offlinePageCached: true })).toBe('error');
    expect(planFallback({ decision: nav, networkOk: true, cachedAvailable: true, offlinePageCached: true })).toBe('network');
    expect(planFallback({ decision: nav, networkOk: false, cachedAvailable: false, offlinePageCached: true })).toBe('offline-page');
    expect(planFallback({ decision: nav, networkOk: false, cachedAvailable: false, offlinePageCached: false })).toBe('error');
    expect(planFallback({ decision: api, networkOk: false, cachedAvailable: true, offlinePageCached: true })).toBe('error');
  });
});

describe('precache audit and cache names', () => {
  it('flags offenders', () => {
    expect(auditPrecache(cfg, ['/offline.html', '/assets/a-12345678.js', '/api/me', '/assets/plain.js'])).toEqual(['/api/me', '/assets/plain.js']);
  });
  it('only deletes own obsolete caches', () => {
    expect(cacheName('1.2.3')).toBe('app-static-1.2.3');
    expect(obsoleteCaches(['app-static-1.0.0', 'app-static-1.2.3', 'other-lib', 'workbox-x'], '1.2.3')).toEqual(['app-static-1.0.0']);
  });
});

describe('versions', () => {
  it('parse/compare', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    for (const bad of ['1.2', '01.2.3', '1.2.3-beta', 'v1.2.3', '1.2.3.4', '', '1234567890.0.0', ' 1.2.3']) expect(parseVersion(bad), bad).toBeNull();
    expect(compareVersions([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareVersions([1, 2, 3], [1, 2, 4])).toBe(-1);
    expect(compareVersions([1, 3, 0], [1, 2, 9])).toBe(1);
    expect(compareVersions([2, 0, 0], [1, 9, 9])).toBe(1);
    fc.assert(fc.property(fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)), fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)), (a, b) => compareVersions(a, b) === -compareVersions(b, a)));
  });
  it('skew', () => {
    expect(isSkewed('1.2.0', '1.9.0')).toBe(false);
    expect(isSkewed('1.2.0', '2.0.0')).toBe(true);
    expect(isSkewed('x', '2.0.0')).toBe(true);
    expect(isSkewed('1.0.0', 'x')).toBe(true);
  });
});

describe('decideUpdate', () => {
  const base: UpdateInput = { runningVersion: '1.2.0', waitingVersion: '1.3.0', minSupportedVersion: '1.0.0', openClients: 1, inSensitiveFlow: false };
  const d = (o: Partial<UpdateInput>) => decideUpdate({ ...base, ...o });
  it('table', () => {
    expect(d({})).toEqual({ action: 'apply-on-idle', reason: 'compatible_single_client' });
    expect(d({ openClients: 0 }).action).toBe('apply-on-idle');
    expect(d({ openClients: 3 })).toEqual({ action: 'prompt', reason: 'multiple_tabs' });
    expect(d({ waitingVersion: '2.0.0' })).toEqual({ action: 'prompt', reason: 'major_change' });
    expect(d({ inSensitiveFlow: true })).toEqual({ action: 'defer', reason: 'in_flow' });
    expect(d({ runningVersion: '0.9.0' })).toEqual({ action: 'apply-now', reason: 'running_unsupported' });
    expect(d({ runningVersion: '0.9.0', inSensitiveFlow: true })).toEqual({ action: 'defer', reason: 'unsupported_but_in_flow' });
  });
  it('no waiting / not newer / invalid', () => {
    expect(decideUpdate({ runningVersion: '1.2.0', minSupportedVersion: '1.0.0', openClients: 1, inSensitiveFlow: false }).action).toBe('none');
    expect(d({ waitingVersion: '1.2.0' }).reason).toBe('waiting_not_newer');
    expect(d({ waitingVersion: '1.1.0' }).action).toBe('none');
    expect(d({ waitingVersion: 'junk' })).toEqual({ action: 'invalid', reason: 'bad_waiting_version' });
    expect(d({ runningVersion: 'junk' }).action).toBe('invalid');
    expect(d({ minSupportedVersion: 'junk' }).action).toBe('invalid');
    expect(d({ openClients: -1 }).action).toBe('invalid');
    expect(d({ openClients: 1.5 }).action).toBe('invalid');
    expect(d({ runningVersion: '0.1.0', waitingVersion: '0.5.0', minSupportedVersion: '1.0.0' })).toEqual({ action: 'invalid', reason: 'waiting_below_min_supported' });
  });
  it('property: sensitive flow never yields apply-now/apply-on-idle/prompt', () => {
    const v = fc.tuple(fc.nat(5), fc.nat(5), fc.nat(5)).map((t) => t.join('.'));
    fc.assert(fc.property(v, v, v, fc.nat(4), (run, wait, min, n) => {
      const r = decideUpdate({ runningVersion: run, waitingVersion: wait, minSupportedVersion: min, openClients: n, inSensitiveFlow: true });
      return ['none', 'defer', 'invalid'].includes(r.action);
    }));
  });
});
