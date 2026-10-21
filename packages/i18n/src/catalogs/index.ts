import { de } from './de.js';
import { en } from './en.js';
import { es } from './es.js';

export { de, en, es };
/** Sample catalogs keyed by BCP47 tag; base locale is `en`. */
export const sampleCatalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, es, de };
