import en from '../../locales/en.json' with { type: 'json' };
import type { Catalog } from './catalog';

/** Static source data only: safe for Node-based tools as well as the browser bundle. */
export const SOURCE_CATALOG: Catalog = en;

/** Keys stay tied to the source JSON rather than an unchecked string dictionary. */
export type MessageKey = keyof typeof en.messages;
