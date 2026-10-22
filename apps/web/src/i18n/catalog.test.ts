import { describe, expect, it, vi } from 'vitest';
import { defaultCatalogLoader, hasCatalog, loadLayers, pseudoCatalog, shippedCatalogs, SOURCE_CATALOG, type Catalog } from './catalog';
import { SOURCE_LOCALE } from './languages';

describe('catalog loading', () => {
  it('reports bundled and lazy catalogs and returns English directly', async () => {
    const shipped = shippedCatalogs();
    expect(shipped[0]).toBe(SOURCE_LOCALE);
    expect(shipped).toContain('es');
    expect(hasCatalog('en')).toBe(true);
    expect(hasCatalog('es')).toBe(true);
    expect(hasCatalog('en-XA')).toBe(true);
    expect(hasCatalog('xx-UNSHIPPED')).toBe(false);
    expect(await defaultCatalogLoader('en')).toBe(SOURCE_CATALOG);
    expect(await defaultCatalogLoader('xx-UNSHIPPED')).toBeUndefined();
  });

  it('builds pseudo catalogs from English with the requested development variant', () => {
    const xa = pseudoCatalog('en-XA');
    const xb = pseudoCatalog('en-XB');
    expect(xa._meta.locale).toBe('en-XA');
    expect(xb._meta.locale).toBe('en-XB');
    expect(xa.messages['settings.title']).not.toBe(SOURCE_CATALOG.messages['settings.title']);
    expect(xb.messages['settings.title']).not.toBe(SOURCE_CATALOG.messages['settings.title']);
    expect(xa.messages['settings.title']).toMatch(/^\[/);
  });

  it('loads existing layers in chain order, skips unavailable layers, and always appends English', async () => {
    const es: Catalog = { _meta: { locale: 'es', status: 'test' }, messages: { 'settings.title': 'Ajustes' } };
    const fr: Catalog = { _meta: { locale: 'fr', status: 'test' }, messages: { 'settings.title': 'Paramètres' } };
    const loader = vi.fn((locale: string) => Promise.resolve(locale === 'es' ? es : locale === 'fr' ? fr : locale === 'en' ? SOURCE_CATALOG : undefined));
    const layers = await loadLayers(['es-MX', 'es', 'fr'], loader);
    expect(loader.mock.calls.map(([locale]) => locale)).toEqual(['es-MX', 'es', 'fr', 'en']);
    expect(layers.map((layer) => layer.locale)).toEqual(['es', 'fr', 'en']);
    const sourceOnly = await loadLayers(['zz'], () => Promise.resolve(undefined));
    expect(sourceOnly.map((layer) => layer.locale)).toEqual(['en']);
    const includesSource = await loadLayers(['en', 'es'], loader);
    expect(loader.mock.calls.at(-1)?.[0]).toBe('es');
    expect(includesSource[0]?.locale).toBe('en');
  });

  it('propagates a failure for a catalog that cannot be loaded', async () => {
    await expect(loadLayers(['es'], () => Promise.reject(new Error('catalog chunk failed')))).rejects.toThrow('catalog chunk failed');
  });
});
