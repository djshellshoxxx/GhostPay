import { SOURCE_CATALOG } from './sourceCatalog';
import { SOURCE_LOCALE } from './languages';
import { createTranslator } from './translator';

/** Source-English rendering for pure libraries and UI rendered outside a provider.
 * Keep this module independent of React, browser storage and Vite's lazy catalog loader.
 */
export const SOURCE_TRANSLATOR = createTranslator(SOURCE_LOCALE, [{ locale: SOURCE_LOCALE, messages: SOURCE_CATALOG.messages }]);
