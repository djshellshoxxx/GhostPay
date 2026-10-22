import en from '../../locales/en.json';
import { isPseudoLocale, SOURCE_LOCALE } from './languages';
import { pseudolocalize, type PseudoVariant } from './message';

/** Every key of the English source catalog. Keys used with t() and <Trans> are checked at compile time. */
export type MessageKey = keyof typeof en.messages;

export interface CatalogMeta {
  readonly locale: string;
  readonly status: string;
  readonly note?: string;
}

export interface Catalog {
  readonly _meta: CatalogMeta;
  readonly messages: Readonly<Record<string, string>>;
}

export interface CatalogLayer {
  readonly locale: string;
  readonly messages: Readonly<Record<string, string>>;
}

export type CatalogLoader = (locale: string) => Promise<Catalog | undefined>;

// English is bundled (first paint is never blank). Every other catalog is a separate same-origin chunk that only loads
// when it is needed. Vite turns each glob entry into a dynamic import(); nothing is fetched from another origin.
const lazy = import.meta.glob<Catalog>(['../../locales/*.json', '!../../locales/en.json'], { import: 'default' });

export const SOURCE_CATALOG: Catalog = en;

const loaders = new Map<string, () => Promise<Catalog>>();
for (const [path, load] of Object.entries(lazy)) {
  const m = /\/([^/]+)\.json$/.exec(path);
  if (m?.[1] !== undefined) loaders.set(m[1], load);
}

/** Locale codes that have a shipped catalog (English plus every lazily loadable file). */
export function shippedCatalogs(): readonly string[] {
  return [SOURCE_LOCALE, ...[...loaders.keys()].sort()];
}

export function hasCatalog(locale: string): boolean {
  return locale === SOURCE_LOCALE || loaders.has(locale) || isPseudoLocale(locale);
}

export function pseudoCatalog(locale: 'en-XA' | 'en-XB'): Catalog {
  const variant: PseudoVariant = locale === 'en-XA' ? 'XA' : 'XB';
  const messages: Record<string, string> = {};
  for (const [k, v] of Object.entries(en.messages)) messages[k] = pseudolocalize(v, variant);
  return { _meta: { locale, status: 'pseudo-locale generated from English', note: 'Development only.' }, messages };
}

export const defaultCatalogLoader: CatalogLoader = async (locale) => {
  if (locale === SOURCE_LOCALE) return SOURCE_CATALOG;
  if (locale === 'en-XA' || locale === 'en-XB') return import.meta.env.DEV ? pseudoCatalog(locale) : undefined;
  const load = loaders.get(locale);
  return load === undefined ? undefined : await load();
};

/**
 * Loads the catalogs of a fallback chain (most specific first). Always ends with English so a key missing from a
 * translation falls back to the source text. Rejects when a catalog that exists cannot be loaded.
 */
export async function loadLayers(chain: readonly string[], loader: CatalogLoader = defaultCatalogLoader): Promise<readonly CatalogLayer[]> {
  const order = chain.includes(SOURCE_LOCALE) ? chain : [...chain, SOURCE_LOCALE];
  const loaded = await Promise.all(order.map(async (locale) => ({ locale, catalog: await loader(locale) })));
  const layers: CatalogLayer[] = [];
  for (const { locale, catalog } of loaded) if (catalog !== undefined) layers.push({ locale, messages: catalog.messages });
  if (!layers.some((l) => l.locale === SOURCE_LOCALE)) layers.push({ locale: SOURCE_LOCALE, messages: SOURCE_CATALOG.messages });
  return layers;
}
